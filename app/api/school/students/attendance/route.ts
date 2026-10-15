import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { isRequestAdmin } from "@/lib/auth/require-admin";
import { adminDb } from "@/lib/firebase/admin";
import { jsonError } from "@/lib/api/json-error";

export const runtime = "nodejs";

const studentRecordSchema = z.object({
  studentId: z.string().min(1),
  studentName: z.string().min(1),
  rollNo: z.number().int(),
  status: z.enum(["present", "absent", "late"]),
});

const saveAttendanceSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  wingId: z.string().min(1),
  classId: z.string().min(1),
  sectionId: z.string().min(1),
  records: z.array(studentRecordSchema),
});

/** GET /api/school/students/attendance - Retrieve attendance for a given class/section/date */
export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const month = url.searchParams.get("month"); // YYYY-MM
  const classId = url.searchParams.get("classId");
  const sectionId = url.searchParams.get("sectionId");
  const studentId = url.searchParams.get("studentId");

  if (!classId || !sectionId) {
    return jsonError("classId and sectionId parameters are required", 400);
  }

  const db = adminDb();

  // Monthly class or student query
  if (month) {
    const snap = await db
      .collection("studentAttendance")
      .where("classId", "==", classId)
      .where("sectionId", "==", sectionId)
      .get();

    const matchedDays = snap.docs
      .map((d) => d.data())
      .filter((d) => typeof d.date === "string" && d.date.startsWith(month))
      .sort((a, b) => (a.date > b.date ? 1 : -1));

    let studentStats: Record<string, unknown> | null = null;
    if (studentId) {
      let presentDays = 0;
      let absentDays = 0;
      let lateDays = 0;
      const history: Record<string, string> = {};

      matchedDays.forEach((day) => {
        const rec = Array.isArray(day.records)
          ? day.records.find((r: { studentId?: string; status?: string }) => r.studentId === studentId)
          : null;
        if (rec) {
          history[day.date] = rec.status || "present";
          if (rec.status === "present") presentDays++;
          else if (rec.status === "absent") absentDays++;
          else if (rec.status === "late") lateDays++;
        }
      });

      const totalMarked = presentDays + absentDays + lateDays;
      const percent = totalMarked > 0 ? Math.round((presentDays / totalMarked) * 100) : 100;

      studentStats = {
        studentId,
        month,
        totalMarked,
        presentDays,
        absentDays,
        lateDays,
        percent,
        history,
      };
    }

    return NextResponse.json({
      found: matchedDays.length > 0,
      month,
      days: matchedDays,
      studentStats,
    });
  }

  // Single date query
  if (!date) {
    return jsonError("date or month parameter is required", 400);
  }

  const cleanClass = classId.replace(/\s+/g, "_");
  const cleanSection = sectionId.replace(/\s+/g, "_");
  const docId = `${date}_${cleanClass}_${cleanSection}`;

  const snap = await db.collection("studentAttendance").doc(docId).get();

  if (!snap.exists) {
    return NextResponse.json({ found: false, attendance: null });
  }

  return NextResponse.json({ found: true, attendance: snap.data() });
}

/** POST /api/school/students/attendance - Save attendance for a given class */
export async function POST(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = saveAttendanceSchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid attendance payload", 400);
  }

  const { date, wingId, classId, sectionId, records } = parsed.data;
  const db = adminDb();

  const userSnap = await db.collection("users").doc(auth.decoded.uid).get();
  if (!userSnap.exists) return jsonError("User profile not found", 404);

  const userData = userSnap.data() ?? {};
  const role = String(userData.role ?? "employee");

  const cleanClass = classId.replace(/\s+/g, "_");
  const cleanSection = sectionId.replace(/\s+/g, "_");
  const delegationDocId = `${cleanClass}_${cleanSection}`;

  // Only class teachers assigned to this class, active substitute teachers, OR admins can save
  const isAssignedClassTeacher =
    userData.isClassTeacher === true &&
    userData.schoolClassId === classId &&
    userData.schoolSectionId === sectionId;

  // Check if caller is designated substitute teacher
  const delSnap = await db.collection("classTeacherDelegations").doc(delegationDocId).get();
  const delegation = delSnap.exists ? delSnap.data() : null;
  const isSubstituteTeacher =
    delegation?.active === true &&
    delegation?.substituteTeacherId === auth.decoded.uid &&
    (!delegation.startDate || delegation.startDate <= date) &&
    (!delegation.endDate || delegation.endDate >= date);

  // Check if caller has an approved temporary switch request for this class/section on this date
  const switchSnap = await db
    .collection("classSwitchRequests")
    .where("teacherId", "==", auth.decoded.uid)
    .where("requestedClass", "==", classId)
    .where("requestedSection", "==", sectionId)
    .where("date", "==", date)
    .where("status", "==", "approved")
    .limit(1)
    .get();

  const approvedSwitchDoc = !switchSnap.empty ? switchSnap.docs[0] : null;

  const isAdmin = await isRequestAdmin(auth.decoded);

  if (
    !isAdmin &&
    !isAssignedClassTeacher &&
    !isSubstituteTeacher &&
    !approvedSwitchDoc
  ) {
    return jsonError(
      `Only the appointed Class Teacher, designated Substitute Teacher, or approved Switch Request can mark attendance for ${classId} (${sectionId}).`,
      403
    );
  }

  const now = new Date();
  const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  if (date > todayDateStr) {
    return jsonError("Cannot access or record attendance for future dates.", 400);
  }

  if (date < todayDateStr && role !== "admin" && role !== "super_admin") {
    return jsonError("Historical attendance records are read-only and cannot be edited by teachers.", 403);
  }

  const docId = `${date}_${cleanClass}_${cleanSection}`;

  const total = records.length;
  const presentCount = records.filter((r) => r.status === "present").length;
  const absentCount = records.filter((r) => r.status === "absent").length;
  const lateCount = records.filter((r) => r.status === "late").length;

  const attendanceData = {
    id: docId,
    date,
    wingId,
    classId,
    sectionId,
    markedBy: auth.decoded.uid,
    teacherName: (userData.name as string) || auth.decoded.email?.split("@")[0] || "Teacher",
    isSubstituteTeacher: isSubstituteTeacher === true,
    substituteFor: isSubstituteTeacher ? (delegation?.permanentTeacherName || null) : null,
    isTemporarySwitch: approvedSwitchDoc ? true : false,
    records,
    summary: {
      total,
      presentCount,
      absentCount,
      lateCount,
      presentPercent: total > 0 ? Math.round((presentCount / total) * 100) : 100,
    },
    savedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await db.collection("studentAttendance").doc(docId).set(attendanceData, { merge: true });

  // If this was an approved switch request, consume it now so teacher can only edit once
  if (approvedSwitchDoc) {
    await approvedSwitchDoc.ref.update({
      status: "consumed",
      usedAt: FieldValue.serverTimestamp(),
    });
  }

  return NextResponse.json({
    ok: true,
    docId,
    summary: attendanceData.summary,
    consumedSwitch: approvedSwitchDoc ? true : false,
    assignedClass: userData.schoolClassId || null,
    assignedSection: userData.schoolSectionId || null,
  });
}
