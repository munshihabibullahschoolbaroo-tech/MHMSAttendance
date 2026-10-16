import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { isRequestAdmin } from "@/lib/auth/require-admin";
import { isSuperAdminDecoded, isSuperAdminUserRow } from "@/lib/auth/super-admin";
import { releaseEmployeeId } from "@/lib/employee-id/allocator";
import { invalidateUsersCache } from "@/lib/server/users-cache";

export const runtime = "nodejs";

const bodySchema = z.object({
  userId: z.string().min(1),
  confirmPhrase: z.string().refine((val) => val.trim().toUpperCase() === "DELETE EMPLOYEE", {
    message: "Must confirm with DELETE EMPLOYEE",
  }),
});

async function deleteQueryDocs(query: FirebaseFirestore.Query) {
  try {
    const snap = await query.get();
    const docs = snap.docs;
    const chunk = 400;
    for (let i = 0; i < docs.length; i += chunk) {
      const batch = adminDb().batch();
      for (const d of docs.slice(i, i + chunk)) {
        batch.delete(d.ref);
      }
      await batch.commit();
    }
  } catch (err) {
    console.warn("deleteQueryDocs error:", err);
  }
}

async function deleteCollectionByField(collection: string, field: string, val: string | undefined | null) {
  if (!val) return;
  const db = adminDb();
  await deleteQueryDocs(db.collection(collection).where(field, "==", val));
}

export async function POST(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  if (!(await isRequestAdmin(auth.decoded))) return jsonError("Forbidden", 403);

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return jsonError("Type exactly: DELETE EMPLOYEE", 400);

  const { userId } = parsed.data;
  if (userId === auth.decoded.uid) return jsonError("You cannot delete your own account here", 400);

  const db = adminDb();
  const userDoc = await db.collection("users").doc(userId).get();

  const targetRole = String(userDoc.get("role") ?? "employee");
  const targetEmail = String(userDoc.get("email") ?? "").trim().toLowerCase();
  const employeeId = userDoc.get("employeeId");

  if (targetEmail && isSuperAdminUserRow(targetEmail, targetRole)) {
    return jsonError("Super admin account cannot be deleted", 403);
  }
  if (targetRole !== "employee" && !isSuperAdminDecoded(auth.decoded)) {
    return jsonError("Only super admin can delete non-employee accounts", 403);
  }

  try {
    // 1. Purge all attendance, sessions, and punch records
    await Promise.all([
      deleteCollectionByField("attendance", "workerId", userId),
      deleteCollectionByField("attendance", "teacherId", userId),
      deleteCollectionByField("attendance_edits", "workerId", userId),
      deleteCollectionByField("teacherSessions", "teacherId", userId),
      deleteCollectionByField("manualPunchRequests", "workerId", userId),
      deleteCollectionByField("overtimeRequests", "workerId", userId),
      deleteCollectionByField("offsiteWorkRequests", "workerId", userId),
    ]);

    // 2. Purge all leaves and assignment requests
    await Promise.all([
      deleteCollectionByField("leaveRequests", "teacherId", userId),
      deleteCollectionByField("leaveRequests", "workerId", userId),
      deleteCollectionByField("classAssignmentRequests", "teacherId", userId),
      deleteCollectionByField("studentSwitchRequests", "teacherId", userId),
      deleteCollectionByField("studentSwitchRequests", "fromTeacherId", userId),
      deleteCollectionByField("studentSwitchRequests", "toTeacherId", userId),
      deleteCollectionByField("substituteDelegations", "teacherId", userId),
      deleteCollectionByField("substituteDelegations", "substituteTeacherId", userId),
      deleteCollectionByField("studentAttendance", "teacherId", userId),
    ]);

    // 3. Purge by email if present (catches any legacy or synced records)
    if (targetEmail) {
      await Promise.all([
        deleteCollectionByField("attendance", "email", targetEmail),
        deleteCollectionByField("teacherSessions", "teacherEmail", targetEmail),
        deleteCollectionByField("leaveRequests", "teacherEmail", targetEmail),
        deleteCollectionByField("notifications", "email", targetEmail),
      ]);
    }

    // 4. Purge notifications and live tracking
    await Promise.all([
      deleteCollectionByField("notifications", "toUid", userId),
      deleteCollectionByField("notifications", "userId", userId),
      deleteCollectionByField("live_tracking_logs", "workerId", userId),
      db.collection("live_tracking").doc(userId).delete().catch(() => undefined),
    ]);

    // 5. Unlink any students assigned to this teacher
    try {
      const studentSnap = await db.collection("students").where("teacherId", "==", userId).get();
      if (!studentSnap.empty) {
        const batch = db.batch();
        for (const sDoc of studentSnap.docs) {
          batch.update(sDoc.ref, {
            teacherId: FieldValue.delete(),
            teacherName: FieldValue.delete(),
          });
        }
        await batch.commit();
      }
    } catch (studentErr) {
      console.warn("Error unlinking students from teacher:", studentErr);
    }

    // 6. Delete user profile doc(s) in Firestore
    await db.collection("users").doc(userId).delete().catch(() => undefined);
    if (targetEmail) {
      try {
        const dupUsers = await db.collection("users").where("email", "==", targetEmail).get();
        for (const u of dupUsers.docs) {
          await u.ref.delete().catch(() => undefined);
        }
      } catch (dupErr) {
        console.warn("Error cleaning duplicate user docs:", dupErr);
      }
    }

    // 7. Release Employee ID so it can be reallocated cleanly
    await releaseEmployeeId(db, employeeId).catch(() => undefined);

    // 8. Delete user from Firebase Auth
    // By UID:
    await adminAuth().deleteUser(userId).catch((authErr: any) => {
      if (authErr?.code !== "auth/user-not-found") {
        console.warn("Could not delete auth user by uid:", authErr);
      }
    });

    // By Email if exists and UID differs:
    if (targetEmail) {
      try {
        const authUser = await adminAuth().getUserByEmail(targetEmail);
        if (authUser?.uid) {
          await adminAuth().deleteUser(authUser.uid).catch(() => undefined);
        }
      } catch {
        // user not found in auth, clean
      }
    }
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to delete user", 500);
  }

  invalidateUsersCache();
  return Response.json({ ok: true });
}
