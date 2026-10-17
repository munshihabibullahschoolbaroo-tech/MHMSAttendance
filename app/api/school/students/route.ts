import { NextResponse } from "next/server";
import { z } from "zod";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { isRequestAdmin } from "@/lib/auth/require-admin";
import { adminDb } from "@/lib/firebase/admin";
import { jsonError } from "@/lib/api/json-error";

export const runtime = "nodejs";

const defaultSampleNames = [
  "Mohammad Ali",
  "Fatima Banoo",
  "Stanzin Dorjay",
  "Zainab Khatoon",
  "Tsering Angmo",
  "Ahmad Hassan",
  "Rigzin Wangdus",
  "Maryam Batool",
  "Ghulam Mehdi",
  "Khadija Nissa",
  "Sonam Chosdan",
  "Syed Mohammad",
  "Zehra Batool",
  "Thinles Norbu",
  "Sakina Banoo",
];

const rosterMemoryCache = new Map<string, { students: any[]; expiresAt: number }>();

function invalidateStudentRosterCache(classId?: string, sectionId?: string) {
  if (classId && sectionId) {
    rosterMemoryCache.delete(`${classId}__${sectionId}`);
  } else {
    rosterMemoryCache.clear();
  }
}

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const classId = url.searchParams.get("classId");
  const sectionId = url.searchParams.get("sectionId") || "Section A";
  const wingId = url.searchParams.get("wingId") || "higher";
  const skipCache = url.searchParams.get("fresh") === "1";

  if (!classId) {
    return jsonError("classId parameter is required", 400);
  }

  const cacheKey = `${classId}__${sectionId}`;
  const now = Date.now();
  const cachedRoster = rosterMemoryCache.get(cacheKey);

  const db = adminDb();

  const isAdmin = await isRequestAdmin(auth.decoded);
  let canMark = isAdmin;

  if (!isAdmin) {
    const cleanClass = classId.replace(/\s+/g, "_");
    const cleanSection = sectionId.replace(/\s+/g, "_");
    const delegationDocId = `${cleanClass}_${cleanSection}`;

    // Concurrently fetch user record and delegation record
    const [userSnap, delSnap] = await Promise.all([
      db.collection("users").doc(auth.decoded.uid).get(),
      db.collection("classTeacherDelegations").doc(delegationDocId).get(),
    ]);

    const userData = userSnap.data() ?? {};
    const isAssigned =
      userData.isClassTeacher === true &&
      userData.schoolClassId === classId &&
      userData.schoolSectionId === sectionId;

    const delegation = delSnap.exists ? delSnap.data() : null;
    const isSubstitute =
      delegation?.active === true &&
      delegation?.substituteTeacherId === auth.decoded.uid;

    if (isAssigned || isSubstitute) {
      canMark = true;
    } else {
      const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
      const switchSnap = await db
        .collection("classSwitchRequests")
        .where("teacherId", "==", auth.decoded.uid)
        .where("requestedClass", "==", classId)
        .where("requestedSection", "==", sectionId)
        .where("date", "==", todayStr)
        .where("status", "==", "approved")
        .limit(1)
        .get();
      canMark = !switchSnap.empty;
    }
  }

  // Fast-path: return cached roster in < 1ms
  if (!skipCache && cachedRoster && now < cachedRoster.expiresAt) {
    return NextResponse.json(
      { students: cachedRoster.students, canMark },
      {
        headers: {
          "Cache-Control": "private, max-age=15, stale-while-revalidate=60",
        },
      }
    );
  }

  let snap;
  try {
    snap = await db
      .collection("students")
      .where("classId", "==", classId)
      .where("sectionId", "==", sectionId)
      .get();
  } catch (e) {
    console.error("[students GET]", e);
    snap = { docs: [] } as any;
  }

  const students = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
  students.sort((a: any, b: any) => (Number(a.rollNo) || 0) - (Number(b.rollNo) || 0));

  rosterMemoryCache.set(cacheKey, { students, expiresAt: now + 30_000 });

  return NextResponse.json(
    { students, canMark },
    {
      headers: {
        "Cache-Control": "private, max-age=15, stale-while-revalidate=60",
      },
    }
  );
}

const addStudentSchema = z.object({
  wingId: z.string().min(1),
  classId: z.string().min(1),
  sectionId: z.string().min(1),
  rollNo: z.number().int().positive(),
  name: z.string().min(2),
  parentPhone: z.string().optional(),
});

export async function POST(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = addStudentSchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid student data", 400);
  }

  const db = adminDb();
  const isAdmin = await isRequestAdmin(auth.decoded);
  const userDoc = await db.collection("users").doc(auth.decoded.uid).get();
  const userData = userDoc.data() || {};
  const isAssigned =
    Boolean(userData.isClassTeacher) &&
    userData.schoolClassId === parsed.data.classId &&
    userData.schoolSectionId === parsed.data.sectionId;

  if (!isAdmin && !isAssigned) {
    return jsonError("You are only permitted to add students to your own assigned class.", 403);
  }

  const ref = db.collection("students").doc();
  await ref.set({
    ...parsed.data,
    createdAt: new Date(),
  });

  invalidateStudentRosterCache(parsed.data.classId, parsed.data.sectionId);

  return NextResponse.json({ ok: true, student: { id: ref.id, ...parsed.data } });
}

export async function DELETE(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return jsonError("Student ID is required", 400);

  const db = adminDb();
  const studentRef = db.collection("students").doc(id);
  const studentSnap = await studentRef.get();
  if (!studentSnap.exists) {
    return jsonError("Student not found", 404);
  }

  const studentData = studentSnap.data() || {};
  const isAdmin = await isRequestAdmin(auth.decoded);
  const userDoc = await db.collection("users").doc(auth.decoded.uid).get();
  const userData = userDoc.data() || {};
  const isAssigned =
    Boolean(userData.isClassTeacher) &&
    userData.schoolClassId === studentData.classId &&
    userData.schoolSectionId === studentData.sectionId;

  if (!isAdmin && !isAssigned) {
    return jsonError("You can only remove students from your own assigned class.", 403);
  }

  await studentRef.delete();
  invalidateStudentRosterCache(studentData.classId, studentData.sectionId);
  return NextResponse.json({ ok: true, deletedId: id });
}
