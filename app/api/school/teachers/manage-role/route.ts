import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { isRequestAdmin } from "@/lib/auth/require-admin";
import { adminDb } from "@/lib/firebase/admin";
import { jsonError } from "@/lib/api/json-error";
import { createNotification } from "@/lib/notifications/create-notification";

export const runtime = "nodejs";

const manageRoleSchema = z.object({
  action: z.enum(["unassign_self", "request_assignment", "direct_assign", "cancel_assignment_request"]),
  wingId: z.string().optional(),
  classId: z.string().optional(),
  sectionId: z.string().optional(),
  reason: z.string().optional(),
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

  const parsed = manageRoleSchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid payload", 400);
  }

  const { action, wingId, classId, sectionId, reason } = parsed.data;
  const db = adminDb();
  const userRef = db.collection("users").doc(auth.decoded.uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) return jsonError("User profile not found", 404);

  const userData = userSnap.data() ?? {};
  const isAdmin = await isRequestAdmin(auth.decoded);

  // 1. Unassign self as class teacher
  if (action === "unassign_self") {
    const prevClass = userData.schoolClassId || "Class";
    const prevSec = userData.schoolSectionId || "A";

    await userRef.update({
      isClassTeacher: false,
      schoolClassId: FieldValue.delete(),
      schoolSectionId: FieldValue.delete(),
      pendingClassAssignment: FieldValue.delete(),
    });

    // Mark any existing pending assignment and switch requests as cancelled
    try {
      const pendingSnap = await db
        .collection("classAssignmentRequests")
        .where("teacherId", "==", auth.decoded.uid)
        .where("status", "==", "pending")
        .get();
      for (const d of pendingSnap.docs) {
        await d.ref.update({ status: "cancelled", cancelledAt: FieldValue.serverTimestamp() });
      }

      const switchSnap = await db
        .collection("classSwitchRequests")
        .where("teacherId", "==", auth.decoded.uid)
        .get();
      for (const d of switchSnap.docs) {
        const s = d.get("status");
        if (s === "pending" || s === "approved") {
          await d.ref.update({ status: "cancelled", cancelledAt: FieldValue.serverTimestamp() });
        }
      }
    } catch {
      /* ignore */
    }

    return NextResponse.json({
      ok: true,
      message: `You have successfully unassigned yourself as Class Teacher for ${prevClass} (${prevSec}).`,
    });
  }

  // 2. Direct assign (administrators only)
  if (action === "direct_assign" || (action === "request_assignment" && isAdmin)) {
    if (!classId || !sectionId) {
      return jsonError("Class and section are required", 400);
    }

    await userRef.update({
      isClassTeacher: true,
      schoolWingId: wingId || userData.schoolWingId || "lower",
      schoolClassId: classId,
      schoolSectionId: sectionId,
      pendingClassAssignment: FieldValue.delete(),
    });

    return NextResponse.json({
      ok: true,
      message: `Successfully appointed as Class Teacher for ${classId} (${sectionId})!`,
    });
  }

  // 3. Cancel pending assignment request
  if (action === "cancel_assignment_request") {
    await userRef.update({
      pendingClassAssignment: FieldValue.delete(),
    });

    try {
      const pendingSnap = await db
        .collection("classAssignmentRequests")
        .where("teacherId", "==", auth.decoded.uid)
        .where("status", "==", "pending")
        .get();
      for (const d of pendingSnap.docs) {
        await d.ref.update({ status: "cancelled", cancelledAt: FieldValue.serverTimestamp() });
      }
    } catch {
      /* ignore */
    }

    return NextResponse.json({
      ok: true,
      message: "Assignment request cancelled successfully.",
    });
  }

  // 4. Request assignment to Administration (for teachers - requires Admin Approval)
  if (action === "request_assignment") {
    if (!classId || !sectionId) {
      return jsonError("Class and section are required", 400);
    }

    const effectiveWing = wingId || userData.schoolWingId || "lower";
    const normClass = classId.trim().toLowerCase();
    const normSec = sectionId.replace(/^section\s+/i, "").trim().toLowerCase();

    // Check if class & section is already assigned or requested by another teacher
    const allUsersSnap = await db.collection("users").get();
    for (const doc of allUsersSnap.docs) {
      if (doc.id === auth.decoded.uid) continue;
      if (doc.get("isClassTeacher") === true) {
        const c = String(doc.get("schoolClassId") || "").trim().toLowerCase();
        const s = String(doc.get("schoolSectionId") || "").replace(/^section\s+/i, "").trim().toLowerCase();
        if (c === normClass && s === normSec) {
          return jsonError(
            `${classId} (${sectionId}) is already assigned to ${doc.get("name") || "another teacher"}. Please select another class.`,
            400
          );
        }
      }
      const pending = doc.get("pendingClassAssignment");
      if (pending && pending.status === "pending") {
        const c = String(pending.classId || "").trim().toLowerCase();
        const s = String(pending.sectionId || "").replace(/^section\s+/i, "").trim().toLowerCase();
        if (c === normClass && s === normSec) {
          return jsonError(
            `${classId} (${sectionId}) has already been requested by ${doc.get("name") || "another teacher"} and is awaiting admin approval. Please select an available class.`,
            400
          );
        }
      }
    }

    try {
      const pendingReqSnap = await db
        .collection("classAssignmentRequests")
        .where("status", "==", "pending")
        .get();
      for (const d of pendingReqSnap.docs) {
        const data = d.data();
        if (data.teacherId === auth.decoded.uid) continue;
        const c = String(data.requestedClass || "").trim().toLowerCase();
        const s = String(data.requestedSection || "").replace(/^section\s+/i, "").trim().toLowerCase();
        if (c === normClass && s === normSec) {
          return jsonError(
            `${classId} (${sectionId}) has already been requested by ${data.teacherName || "another teacher"} and is awaiting admin approval.`,
            400
          );
        }
      }
    } catch {
      /* ignore */
    }

    // Create a formal Assignment Request document in classAssignmentRequests
    const reqRef = db.collection("classAssignmentRequests").doc();
    const reqDoc = {
      id: reqRef.id,
      teacherId: auth.decoded.uid,
      teacherName: userData.name || "Teacher",
      teacherEmail: userData.email || auth.decoded.email || "",
      employeeId: userData.employeeId || "",
      wingId: effectiveWing,
      requestedClass: classId,
      requestedSection: sectionId,
      reason: reason?.trim() || "Requested Class Teacher assignment",
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
      dateStr: new Date().toISOString().split("T")[0],
    };

    await reqRef.set(reqDoc);

    // Update user doc with pendingClassAssignment state (does NOT grant isClassTeacher yet!)
    await userRef.update({
      isClassTeacher: false,
      schoolWingId: effectiveWing,
      pendingClassAssignment: {
        requestId: reqRef.id,
        wingId: effectiveWing,
        classId,
        sectionId,
        reason: reason?.trim() || "",
        requestedAt: new Date().toISOString(),
        status: "pending",
      },
    });

    // Notify Admins
    try {
      const adminsSnap = await db.collection("users").where("role", "in", ["admin", "super_admin"]).get();
      for (const doc of adminsSnap.docs) {
        await createNotification(db, {
          userId: doc.id,
          title: "New Class Teacher Request",
          body: `${userData.name || "Teacher"} requested to be appointed Class Teacher for ${classId} (${sectionId}).`,
          kind: "system",
          link: "/dashboard/admin/requests?tab=class_assignment",
        });
      }
    } catch {
      /* ignore */
    }

    return NextResponse.json({
      ok: true,
      pending: true,
      message: `Assignment request for ${classId} (${sectionId}) submitted to Administration! Awaiting approval.`,
    });
  }

  return jsonError("Invalid action", 400);
}
