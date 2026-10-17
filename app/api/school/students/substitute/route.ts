import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { adminDb } from "@/lib/firebase/admin";
import { jsonError } from "@/lib/api/json-error";
import { createNotification } from "@/lib/notifications/create-notification";

export const runtime = "nodejs";

const assignSchema = z.object({
  classId: z.string().min(1),
  sectionId: z.string().min(1),
  substituteTeacherId: z.string().min(1),
  reason: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

/** GET /api/school/students/substitute - Get active substitute delegation for class/section or for caller */
export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const mine = url.searchParams.get("mine");
  const classId = url.searchParams.get("classId");
  const sectionId = url.searchParams.get("sectionId");

  const db = adminDb();

  // If asking for delegations assigned to this logged-in teacher
  if (mine === "true") {
    const snap = await db
      .collection("classTeacherDelegations")
      .where("substituteTeacherId", "==", auth.decoded.uid)
      .where("active", "==", true)
      .get();

    const delegations = snap.docs.map((d) => d.data());
    return NextResponse.json(
      { ok: true, delegations },
      { headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=60" } }
    );
  }

  if (!classId || !sectionId) {
    return jsonError("classId and sectionId are required", 400);
  }

  const cleanClass = classId.replace(/\s+/g, "_");
  const cleanSection = sectionId.replace(/\s+/g, "_");
  const docId = `${cleanClass}_${cleanSection}`;

  const snap = await db.collection("classTeacherDelegations").doc(docId).get();

  if (!snap.exists) {
    return NextResponse.json(
      { ok: true, active: false, delegation: null },
      { headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=60" } }
    );
  }

  const data = snap.data();
  const isActive = data?.active === true;
  return NextResponse.json(
    {
      ok: true,
      active: isActive,
      delegation: isActive ? data : null,
    },
    { headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=60" } }
  );
}

/** POST /api/school/students/substitute - Assign a colleague as substitute class teacher */
export async function POST(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = assignSchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid payload", 400);
  }

  const { classId, sectionId, substituteTeacherId, reason, startDate, endDate } = parsed.data;
  const db = adminDb();

  const callerSnap = await db.collection("users").doc(auth.decoded.uid).get();
  if (!callerSnap.exists) return jsonError("User profile not found", 404);

  const callerData = callerSnap.data() ?? {};
  const callerRole = String(callerData.role ?? "employee");
  const isAdmin = callerRole === "admin" || callerRole === "super_admin";

  const isAssignedClassTeacher =
    callerData.isClassTeacher === true &&
    callerData.schoolClassId === classId &&
    callerData.schoolSectionId === sectionId;

  if (!isAdmin && !isAssignedClassTeacher) {
    return jsonError(
      `Only the appointed Class Teacher for ${classId} (${sectionId}) or administrators can delegate a substitute teacher.`,
      403
    );
  }

  if (substituteTeacherId === auth.decoded.uid) {
    return jsonError("You cannot assign yourself as substitute teacher.", 400);
  }

  // Prevent circular substitute loop: if the proposed substitute teacher has an active delegation to the caller
  const reverseDelegationSnap = await db
    .collection("classTeacherDelegations")
    .where("permanentTeacherId", "==", substituteTeacherId)
    .where("substituteTeacherId", "==", auth.decoded.uid)
    .where("active", "==", true)
    .get();

  if (!reverseDelegationSnap.empty) {
    return jsonError(
      "This colleague has already designated you as their substitute class teacher. Circular substitute assignments are not allowed.",
      400
    );
  }

  // Resolve substitute teacher info
  const subSnap = await db.collection("users").doc(substituteTeacherId).get();
  if (!subSnap.exists) {
    return jsonError("Substitute teacher user not found", 404);
  }
  const subData = subSnap.data() ?? {};
  const substituteTeacherName =
    (typeof subData.name === "string" && subData.name.trim()) ||
    (typeof subData.email === "string" && subData.email.split("@")[0]) ||
    "Substitute Teacher";
  const substituteTeacherEmail = (subData.email as string) || "";

  const permanentTeacherName =
    (typeof callerData.name === "string" && callerData.name.trim()) ||
    (typeof callerData.email === "string" && callerData.email.split("@")[0]) ||
    "Class Teacher";

  const cleanClass = classId.replace(/\s+/g, "_");
  const cleanSection = sectionId.replace(/\s+/g, "_");
  const docId = `${cleanClass}_${cleanSection}`;

  const delegation = {
    docId,
    classId,
    sectionId,
    permanentTeacherId: isAssignedClassTeacher ? auth.decoded.uid : (callerData.id || auth.decoded.uid),
    permanentTeacherName,
    substituteTeacherId,
    substituteTeacherName,
    substituteTeacherEmail,
    reason: reason?.trim() || "On Leave / Proxy Attendance",
    startDate: startDate || new Date().toISOString().split("T")[0]!,
    endDate: endDate || null,
    active: true,
    assignedBy: auth.decoded.uid,
    assignedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await db.collection("classTeacherDelegations").doc(docId).set(delegation, { merge: true });

  // Send in-app notification to the substitute teacher
  try {
    await createNotification(db, {
      userId: substituteTeacherId,
      kind: "assignment",
      title: "Designated Substitute Class Teacher",
      body: `You have been authorized by ${permanentTeacherName} to take daily student attendance for ${classId} (${sectionId}).`,
      link: "/dashboard/employee/students",
    });
  } catch {
    /* non-critical */
  }

  return NextResponse.json({
    ok: true,
    message: `Successfully delegated ${substituteTeacherName} as substitute class teacher for ${classId} (${sectionId}).`,
    delegation,
  });
}

/** DELETE /api/school/students/substitute - Revoke substitute teacher delegation */
export async function DELETE(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const classId = url.searchParams.get("classId");
  const sectionId = url.searchParams.get("sectionId");

  if (!classId || !sectionId) {
    return jsonError("classId and sectionId are required", 400);
  }

  const cleanClass = classId.replace(/\s+/g, "_");
  const cleanSection = sectionId.replace(/\s+/g, "_");
  const docId = `${cleanClass}_${cleanSection}`;

  const db = adminDb();
  const callerSnap = await db.collection("users").doc(auth.decoded.uid).get();
  const callerData = callerSnap.data() ?? {};
  const callerRole = String(callerData.role ?? "employee");
  const isAdmin = callerRole === "admin" || callerRole === "super_admin";

  const isAssignedClassTeacher =
    callerData.isClassTeacher === true &&
    callerData.schoolClassId === classId &&
    callerData.schoolSectionId === sectionId;

  const delSnap = await db.collection("classTeacherDelegations").doc(docId).get();
  const isAssignedSubstitute = delSnap.exists && delSnap.data()?.substituteTeacherId === auth.decoded.uid;

  if (!isAdmin && !isAssignedClassTeacher && !isAssignedSubstitute) {
    return jsonError("Not authorized to revoke this delegation", 403);
  }

  await db.collection("classTeacherDelegations").doc(docId).delete();

  return NextResponse.json({
    ok: true,
    message: `Substitute delegation revoked for ${classId} (${sectionId}). Attendance is returned to permanent class teacher.`,
  });
}
