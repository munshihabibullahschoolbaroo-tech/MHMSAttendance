import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { adminDb } from "@/lib/firebase/admin";
import { jsonError } from "@/lib/api/json-error";
import { createNotification } from "@/lib/notifications/create-notification";
import { DEFAULT_SCHOOL_CONFIG } from "@/lib/school/config";

export const runtime = "nodejs";

const createRequestSchema = z.object({
  requestedClass: z.string().min(1),
  requestedSection: z.string().min(1),
  reason: z.string().min(3, "Please provide a reason for the class switch request"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const reviewRequestSchema = z.object({
  requestId: z.string().min(1),
  action: z.enum(["approve", "reject"]),
  reviewNote: z.string().optional(),
});

/** GET /api/school/students/switch-request - Retrieve switch requests */
export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const mine = url.searchParams.get("mine");
  const date = url.searchParams.get("date");

  const db = adminDb();
  const callerSnap = await db.collection("users").doc(auth.decoded.uid).get();
  const callerData = callerSnap.data() ?? {};
  const callerRole = String(callerData.role ?? "employee");
  const isAdmin = callerRole === "admin" || callerRole === "super_admin";

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const targetDate = date || todayStr;

  // Teacher requesting their own requests
  if (mine === "true" || !isAdmin) {
    const snap = await db
      .collection("classSwitchRequests")
      .where("teacherId", "==", auth.decoded.uid)
      .where("date", "==", targetDate)
      .get();

    const requests = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ ok: true, requests });
  }

  // Admin requesting all requests
  let query = db.collection("classSwitchRequests").where("date", "==", targetDate);
  const snap = await query.get();
  const requests = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a: any, b: any) => {
      const aTime = a.createdAt?._seconds || a.createdAt?.seconds || 0;
      const bTime = b.createdAt?._seconds || b.createdAt?.seconds || 0;
      return bTime - aTime;
    });

  return NextResponse.json({ ok: true, requests });
}

/** POST /api/school/students/switch-request - Teacher submits a switch request */
export async function POST(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = createRequestSchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid payload", 400);
  }

  const { requestedClass, requestedSection, reason, date } = parsed.data;
  const db = adminDb();

  const userSnap = await db.collection("users").doc(auth.decoded.uid).get();
  if (!userSnap.exists) return jsonError("User profile not found", 404);

  const userData = userSnap.data() ?? {};
  const teacherWing = userData.schoolWingId || "lower";
  const assignedClass = userData.schoolClassId || "";
  const assignedSection = userData.schoolSectionId || "";

  // Validate that requestedClass belongs to teacher's category / wing
  let config = DEFAULT_SCHOOL_CONFIG;
  try {
    const configSnap = await db.collection("schoolSettings").doc("config").get();
    if (configSnap.exists) {
      config = { ...DEFAULT_SCHOOL_CONFIG, ...configSnap.data() };
    }
  } catch {
    /* fallback to default */
  }

  const wing = config.wings.find((w) => w.id === teacherWing);
  if (wing && !wing.classes.includes(requestedClass)) {
    return jsonError(
      `Class "${requestedClass}" is outside your category (${wing.name}). You can only request classes within your category.`,
      400
    );
  }

  if (assignedClass === requestedClass && assignedSection === requestedSection) {
    return jsonError("You are already assigned as the primary teacher for this class & section.", 400);
  }

  // Verify that requestedClass & requestedSection are not already assigned to another teacher
  const allUsersSnap = await db.collection("users").get();
  const existingTeacher = allUsersSnap.docs.find((d) => {
    if (d.id === auth.decoded.uid) return false;
    const isClassTeacher = d.get("isClassTeacher") === true;
    const c = d.get("schoolClassId");
    const s = d.get("schoolSectionId");
    if (!isClassTeacher || typeof c !== "string") return false;
    const rawExisting = typeof s === "string" ? s : "Section A";
    const normReq = requestedSection.replace(/^section\s+/i, "").trim().toLowerCase();
    const normExisting = rawExisting.replace(/^section\s+/i, "").trim().toLowerCase();
    return c === requestedClass && normExisting === normReq;
  });

  if (existingTeacher) {
    return jsonError(
      `${requestedClass} (${requestedSection}) is already assigned to ${existingTeacher.get("name") || "another teacher"}. You can only request switches to unassigned classes and sections.`,
      400
    );
  }

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const targetDate = date || todayStr;

  // Check if an unconsumed or pending request already exists for this teacher on this date for this class
  const existingSnap = await db
    .collection("classSwitchRequests")
    .where("teacherId", "==", auth.decoded.uid)
    .where("date", "==", targetDate)
    .where("requestedClass", "==", requestedClass)
    .where("requestedSection", "==", requestedSection)
    .get();

  const activeExisting = existingSnap.docs.find((d) => {
    const st = d.data().status;
    return st === "pending" || st === "approved";
  });

  if (activeExisting) {
    const st = activeExisting.data().status;
    return jsonError(
      `You already have a ${st} class switch request for ${requestedClass} (${requestedSection}) today.`,
      400
    );
  }

  const requestRef = db.collection("classSwitchRequests").doc();
  const newRequest = {
    id: requestRef.id,
    teacherId: auth.decoded.uid,
    teacherName: userData.name || "Teacher",
    teacherEmail: userData.email || "",
    wingId: teacherWing,
    assignedClass,
    assignedSection,
    requestedClass,
    requestedSection,
    reason: reason.trim(),
    date: targetDate,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
  };

  await requestRef.set(newRequest);

  // Notify Admins
  try {
    const adminsSnap = await db.collection("users").where("role", "in", ["admin", "super_admin"]).get();
    for (const doc of adminsSnap.docs) {
      await createNotification(db, {
        userId: doc.id,
        title: "Class Switch Request",
        body: `${userData.name || "Teacher"} requested temporary switch to ${requestedClass} (${requestedSection}): "${reason.trim()}"`,
        kind: "system",
        link: "/dashboard/admin/requests?tab=class_switch",
      });
    }
  } catch (err) {
    console.error("Failed to notify admins of class switch request:", err);
  }

  return NextResponse.json({ ok: true, requestId: requestRef.id, request: newRequest });
}

/** PATCH /api/school/students/switch-request - Admin reviews a switch request */
export async function PATCH(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  const db = adminDb();
  const callerSnap = await db.collection("users").doc(auth.decoded.uid).get();
  const callerData = callerSnap.data() ?? {};
  const callerRole = String(callerData.role ?? "employee");

  if (callerRole !== "admin" && callerRole !== "super_admin") {
    return jsonError("Only school administrators can approve or reject class switch requests.", 403);
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = reviewRequestSchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid payload", 400);
  }

  const { requestId, action, reviewNote } = parsed.data;
  const docRef = db.collection("classSwitchRequests").doc(requestId);
  const snap = await docRef.get();
  if (!snap.exists) return jsonError("Switch request not found", 404);

  const reqData = snap.data()!;
  const newStatus = action === "approve" ? "approved" : "rejected";

  await docRef.update({
    status: newStatus,
    reviewedBy: auth.decoded.uid,
    reviewedByEmail: callerData.email || "",
    reviewedAt: FieldValue.serverTimestamp(),
    reviewNote: reviewNote || "",
  });

  // Notify the Teacher
  try {
    await createNotification(db, {
      userId: reqData.teacherId,
      title: action === "approve" ? "Class Switch Approved" : "Class Switch Rejected",
      body:
        action === "approve"
          ? `Your switch request for ${reqData.requestedClass} (${reqData.requestedSection}) has been approved! You have 1-time access to record attendance.`
          : `Your switch request for ${reqData.requestedClass} (${reqData.requestedSection}) was declined: ${reviewNote || "No reason specified"}.`,
      kind: "system",
      link: "/dashboard/employee/students",
    });
  } catch (err) {
    console.error("Failed to notify teacher:", err);
  }

  return NextResponse.json({ ok: true, status: newStatus });
}
