import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue, adminDb } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { assertAdmin } from "@/lib/auth/assert-admin";
import { createNotification } from "@/lib/notifications/create-notification";
import { timeZoneFromUserSnapshot } from "@/lib/attendance/time-zone-from-snap";
import { invalidateTodayCache } from "@/lib/cache/today-cache";
import { DateTime } from "luxon";

export const runtime = "nodejs";

const patchSchema = z.object({
  status: z.enum(["approved", "rejected", "pending"]),
  note: z.string().max(1000).optional(),
});

type Segment = {
  siteId: string;
  inHm: string;
  outHm: string;
};

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const { uid, email } = auth.decoded;

  const denied = await assertAdmin(uid, email);
  if (denied) return denied;

  const { id } = await ctx.params;
  if (!id?.trim()) return jsonError("Missing id", 400);

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid body", 400);
  }

  const db = adminDb();
  const ref = db.collection("manualPunchRequests").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return jsonError("Not found", 404);

  const existing = snap.data() as {
    workerId?: string;
    date?: string;
    segments?: Segment[];
    status?: string;
  };

  const now = FieldValue.serverTimestamp();

  if (parsed.data.status === "pending") {
    const batch = db.batch();
    batch.update(ref, {
      status: "pending",
      reviewNote: null,
      reviewedByUid: FieldValue.delete(),
      reviewedByEmail: FieldValue.delete(),
      reviewedAt: FieldValue.delete(),
      updatedAt: now,
    });
    if (existing.workerId && existing.date) {
      const sessRef = db.collection("teacherSessions").doc(`${existing.workerId}_${existing.date}`);
      batch.set(
        sessRef,
        {
          "lateSignOutRequest.status": "pending",
          updatedAt: now,
        },
        { merge: true }
      );
    }
    if (existing.status === "approved" && existing.workerId && existing.date) {
      batch.delete(db.collection("attendance").doc(`${existing.workerId}_${existing.date}`));
    }
    await batch.commit();
    if (existing.workerId) invalidateTodayCache(existing.workerId);
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.status === "rejected") {
    const batch = db.batch();
    batch.update(ref, {
      status: "rejected",
      reviewNote: parsed.data.note?.trim() || null,
      reviewedByUid: uid,
      reviewedByEmail: email ?? null,
      reviewedAt: now,
      updatedAt: now,
    });
    if (existing.workerId && existing.date) {
      const sessRef = db.collection("teacherSessions").doc(`${existing.workerId}_${existing.date}`);
      batch.set(
        sessRef,
        {
          status: "absent",
          missedSignOut: true,
          lateSignOutRequest: {
            status: "rejected",
            reviewedAt: now,
            reviewedByEmail: email ?? null,
            reviewNote: parsed.data.note?.trim() || null,
          },
          updatedAt: now,
        },
        { merge: true }
      );
      const attRef = db.collection("attendance").doc(`${existing.workerId}_${existing.date}`);
      batch.set(
        attRef,
        {
          status: "absent",
          missedSignOut: true,
          updatedAt: now,
        },
        { merge: true }
      );
    }
    await batch.commit();

    if (existing.workerId) {
      try {
        await createNotification(db, {
          userId: existing.workerId,
          title: "Attendance Request Rejected",
          body: parsed.data.note?.trim()
            ? `Your attendance/late punch request for ${existing.date ?? ""} was rejected. Note: ${parsed.data.note.slice(0, 200)}`
            : `Your attendance/late punch request for ${existing.date ?? ""} was rejected. Attendance marked as absent.`,
          kind: "manual_punch_rejected",
          link: "/dashboard/employee/attendance",
        });
      } catch { /* non-critical */ }
      invalidateTodayCache(existing.workerId);
    }
    return NextResponse.json({ ok: true });
  }

  const { workerId, date, segments } = existing;
  if (!workerId || !date || !segments || segments.length === 0) {
    return jsonError("Request is missing critical data to approve", 500);
  }

  // 1. Get worker timezone
  const workerSnap = await db.collection("users").doc(workerId).get();
  const tz = timeZoneFromUserSnapshot(workerSnap);

  const parseToTimestamp = (hm: string) => {
    const jsDate = DateTime.fromISO(`${date}T${hm}:00`, { zone: tz }).toJSDate();
    return Timestamp.fromDate(jsDate);
  };

  // 2. Draft the attendance document completely
  const attRef = db.collection("attendance").doc(`${workerId}_${date}`);
  const first = segments[0];
  const last = segments[segments.length - 1];

  const checkIn = {
    time: parseToTimestamp(first.inHm),
    gps: { latitude: 0, longitude: 0 },
    photoUrl: "manual_punch",
    recordedByUid: uid,
  };

  const checkOut = {
    time: parseToTimestamp(last.outHm),
    gps: { latitude: 0, longitude: 0 },
    photoUrl: "manual_punch",
    recordedByUid: uid,
  };

  const siteSwitchLogs = segments.slice(1).map((s, idx) => ({
    fromSiteId: segments[idx].siteId,
    toSiteId: s.siteId,
    at: parseToTimestamp(s.inHm),
    previousSiteCheckOut: {
      siteId: segments[idx].siteId,
      time: parseToTimestamp(segments[idx].outHm),
      gps: { latitude: 0, longitude: 0 },
      photoUrl: "manual_punch",
    },
  }));

  const attendancePayload = {
    workerId,
    siteId: first.siteId,
    date,
    status: "present",
    checkIn,
    checkOut,
    siteSwitchLogs,
    updatedAt: now,
  };

  // 3. Update teacherSessions canonical document
  const sessRef = db.collection("teacherSessions").doc(`${workerId}_${date}`);
  const sessSnap = await sessRef.get();
  let isLateArrival = false;
  if (sessSnap.exists) {
    const sData = sessSnap.data() ?? {};
    isLateArrival =
      sData.isLate === true ||
      sData.lateArrival === true ||
      (typeof sData.lateMinutes === "number" && sData.lateMinutes > 0);
  }

  // Run as batch to ensure atomic
  const batch = db.batch();
  batch.update(ref, {
    status: "approved",
    reviewNote: parsed.data.note?.trim() || null,
    reviewedByUid: uid,
    reviewedByEmail: email ?? null,
    reviewedAt: now,
    updatedAt: now,
  });
  batch.set(attRef, attendancePayload);

  batch.set(
    sessRef,
    {
      status: isLateArrival ? "late" : "present",
      missedSignOut: false,
      checkInTime: parseToTimestamp(first.inHm),
      checkOutTime: parseToTimestamp(last.outHm),
      lateSignOutRequest: {
        status: "approved",
        reviewedAt: now,
        reviewedByEmail: email ?? null,
        reviewNote: parsed.data.note?.trim() || null,
      },
      updatedAt: now,
    },
    { merge: true }
  );

  // Clean up any legacy accidental leaveRequests for this day so it never marks as leave
  try {
    const legacySnap = await db
      .collection("leaveRequests")
      .where("teacherId", "==", workerId)
      .where("startDate", "==", date)
      .get();
    for (const legDoc of legacySnap.docs) {
      const legData = legDoc.data();
      if (legData.type === "late_sign_out" || legData.isLateSignOut) {
        batch.delete(legDoc.ref);
      }
    }
  } catch {
    /* non-critical */
  }

  await batch.commit();

  invalidateTodayCache(workerId);

  // Notify worker on approval
  try {
    await createNotification(db, {
      userId: workerId,
      title: "Attendance Request Approved ✓",
      body: `Your attendance record for ${date} has been approved and confirmed.`,
      kind: "manual_punch_approved",
      link: "/dashboard/employee/attendance",
    });
  } catch { /* non-critical */ }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireBearerUser(_req);
  if (!auth.ok) return auth.response;
  const { uid, email } = auth.decoded;

  const denied = await assertAdmin(uid, email);
  if (denied) return denied;

  const { id } = await ctx.params;
  if (!id?.trim()) return jsonError("Missing id", 400);

  const ref = adminDb().collection("manualPunchRequests").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return jsonError("Not found", 404);
  const existing = snap.data() as any;

  const batch = adminDb().batch();
  batch.delete(ref);
  if (existing.status === "approved" && existing.workerId && existing.date) {
    batch.delete(adminDb().collection("attendance").doc(`${existing.workerId}_${existing.date}`));
  }
  await batch.commit();

  if (existing.workerId) invalidateTodayCache(existing.workerId);
  return NextResponse.json({ ok: true });
}
