import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { isRequestAdmin } from "@/lib/auth/require-admin";
import { adminDb } from "@/lib/firebase/admin";
import { jsonError } from "@/lib/api/json-error";
import { createNotification } from "@/lib/notifications/create-notification";

export const runtime = "nodejs";

const reviewRequestSchema = z.object({
  requestId: z.string().min(1),
  action: z.enum(["approve", "reject"]),
  note: z.string().optional(),
});

/** GET /api/school/teachers/assignment-requests */
export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const mine = url.searchParams.get("mine");
  const db = adminDb();
  const isAdmin = await isRequestAdmin(auth.decoded);

  if (mine === "true" || !isAdmin) {
    const snap = await db
      .collection("classAssignmentRequests")
      .where("teacherId", "==", auth.decoded.uid)
      .get();

    const requests = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    requests.sort((a: any, b: any) => {
      const aTime = a.createdAt?._seconds || a.createdAt?.seconds || 0;
      const bTime = b.createdAt?._seconds || b.createdAt?.seconds || 0;
      return bTime - aTime;
    });
    return NextResponse.json({ ok: true, requests });
  }

  // Admin view
  const snap = await db.collection("classAssignmentRequests").get();
  const requests = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  requests.sort((a: any, b: any) => {
    const aTime = a.createdAt?._seconds || a.createdAt?.seconds || 0;
    const bTime = b.createdAt?._seconds || b.createdAt?.seconds || 0;
    return bTime - aTime;
  });

  return NextResponse.json({ ok: true, requests });
}

/** PATCH /api/school/teachers/assignment-requests - Review & Approve/Reject */
export async function PATCH(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  const isAdmin = await isRequestAdmin(auth.decoded);
  if (!isAdmin) {
    return jsonError("Only school administrators can approve or reject class teacher assignment requests.", 403);
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

  const { requestId, action, note } = parsed.data;
  const db = adminDb();
  const reqRef = db.collection("classAssignmentRequests").doc(requestId);
  const snap = await reqRef.get();
  if (!snap.exists) {
    return jsonError("Assignment request not found", 404);
  }

  const reqData = snap.data()!;
  const newStatus = action === "approve" ? "approved" : "rejected";

  await reqRef.update({
    status: newStatus,
    reviewedBy: auth.decoded.uid,
    reviewedByEmail: auth.decoded.email || "",
    reviewedAt: FieldValue.serverTimestamp(),
    reviewNote: note?.trim() || "",
  });

  const teacherRef = db.collection("users").doc(reqData.teacherId);

  if (action === "approve") {
    // Appoint teacher as class teacher
    await teacherRef.update({
      isClassTeacher: true,
      schoolWingId: reqData.wingId,
      schoolClassId: reqData.requestedClass,
      schoolSectionId: reqData.requestedSection,
      pendingClassAssignment: FieldValue.delete(),
    });

    // Notify teacher
    try {
      await createNotification(db, {
        userId: reqData.teacherId,
        title: "Class Teacher Appointment Approved",
        body: `Your request to be appointed as Class Teacher for ${reqData.requestedClass} (${reqData.requestedSection}) has been approved by school administration!`,
        kind: "system",
        link: "/dashboard/employee/students",
      });
    } catch {
      /* ignore */
    }
  } else {
    // Reject request: remove pending state so teacher can submit a new request
    await teacherRef.update({
      pendingClassAssignment: FieldValue.delete(),
    });

    // Notify teacher
    try {
      await createNotification(db, {
        userId: reqData.teacherId,
        title: "Class Teacher Request Declined",
        body: `Your request to be appointed as Class Teacher for ${reqData.requestedClass} (${reqData.requestedSection}) was declined: ${note?.trim() || "No note specified"}.`,
        kind: "system",
        link: "/dashboard/employee/students",
      });
    } catch {
      /* ignore */
    }
  }

  return NextResponse.json({
    ok: true,
    status: newStatus,
    message: action === "approve" ? "Class teacher appointed successfully." : "Assignment request rejected.",
  });
}
