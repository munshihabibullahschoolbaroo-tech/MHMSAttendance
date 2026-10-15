import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { adminDb } from "@/lib/firebase/admin";
import { assertAdmin } from "@/lib/auth/assert-admin";
import { jsonError } from "@/lib/api/json-error";
import { createNotification } from "@/lib/notifications/create-notification";

export const runtime = "nodejs";

const reviewSchema = z.object({
  leaveId: z.string().optional(),
  leaveIds: z.array(z.string()).optional(),
  action: z.enum(["approve", "reject"]),
  notes: z.string().optional(),
});

/** GET /api/school/leave/review - List all leaves for Admin inspection */
export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  const forbidden = await assertAdmin(auth.decoded.uid, auth.decoded.email);
  if (forbidden) return forbidden;

  const db = adminDb();
  const snap = await db.collection("leaveRequests").get();
  const leaves = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  leaves.sort((a: any, b: any) => {
    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
    return timeB - timeA;
  });

  return NextResponse.json({ leaves });
}

/** POST /api/school/leave/review - Approve or reject leave */
export async function POST(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  const forbidden = await assertAdmin(auth.decoded.uid, auth.decoded.email);
  if (forbidden) return forbidden;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = reviewSchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid review action", 400);
  }

  const { leaveId, leaveIds, action, notes } = parsed.data;
  const targetIds: string[] = [];
  if (leaveIds && Array.isArray(leaveIds) && leaveIds.length > 0) {
    targetIds.push(...leaveIds);
  } else if (leaveId) {
    targetIds.push(leaveId);
  }

  if (targetIds.length === 0) {
    return jsonError("No leave IDs provided for review.", 400);
  }

  const db = adminDb();
  const status = action === "approve" ? "approved" : "rejected";
  const batch = db.batch();
  const teachersToNotify: { teacherId: string; type: string; start: string; end: string }[] = [];

  for (const id of targetIds) {
    const leaveRef = db.collection("leaveRequests").doc(id);
    const leaveSnap = await leaveRef.get();
    if (leaveSnap.exists) {
      const data = leaveSnap.data() ?? {};
      batch.set(
        leaveRef,
        {
          status,
          reviewedBy: auth.decoded.uid,
          reviewedByEmail: auth.decoded.email ?? "Admin",
          reviewedAt: FieldValue.serverTimestamp(),
          adminNotes: notes ?? null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      if (data.teacherId) {
        teachersToNotify.push({
          teacherId: String(data.teacherId),
          type: String(data.type ?? ""),
          start: String(data.startDate ?? ""),
          end: String(data.endDate ?? ""),
        });
      }
    }
  }

  await batch.commit();

  // Send notifications
  for (const t of teachersToNotify) {
    try {
      await createNotification(db, {
        userId: t.teacherId,
        title: action === "approve" ? "Leave Request Approved" : "Leave Request Not Approved",
        body:
          action === "approve"
            ? `Your ${t.type.toUpperCase()} leave from ${t.start} to ${t.end} has been approved.`
            : `Your leave request from ${t.start} to ${t.end} was not approved.${notes ? ` Note: ${notes}` : ""}`,
        kind: action === "approve" ? "leave_approved" : "leave_rejected",
        link: "/dashboard/employee/leaves",
      });
    } catch {
      /* non-critical */
    }
  }

  return NextResponse.json({ ok: true, status, count: targetIds.length });
}
