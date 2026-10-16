import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { adminDb } from "@/lib/firebase/admin";
import { jsonError } from "@/lib/api/json-error";
import { haversineMeters } from "@/lib/geo/haversine";
import { getSchoolConfig } from "@/lib/school/config";
import { getDayKeyFromDate, getIanaTimeZone } from "@/lib/date/timezone";
import { checkSignOutTiming } from "@/lib/date/late-check";
import { createNotification } from "@/lib/notifications/create-notification";
import { DateTime } from "luxon";
import { invalidateTodayCache } from "@/lib/cache/today-cache";

export const runtime = "nodejs";

const checkOutSchema = z.object({
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  accuracy: z.number().optional().nullable(),
  reason: z.string().max(1000).optional().nullable(),
});

export async function POST(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  let json: unknown = {};
  try {
    json = await req.json();
  } catch {
    json = {};
  }

  const parsed = checkOutSchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Invalid sign-out parameters.",
      400
    );
  }

  const { latitude, longitude, accuracy, reason } = parsed.data;
  const db = adminDb();

  const userSnap = await db.collection("users").doc(auth.decoded.uid).get();
  if (!userSnap.exists) return jsonError("User profile not found", 404);

  const userData = userSnap.data() ?? {};
  const config = await getSchoolConfig(db);
  const timeZone = getIanaTimeZone(userData.timeZone as string | undefined);
  const dateKey = getDayKeyFromDate(new Date(), timeZone);
  const sessionId = `${auth.decoded.uid}_${dateKey}`;
  const sessionRef = db.collection("teacherSessions").doc(sessionId);

  const existingSession = await sessionRef.get();
  if (!existingSession.exists || !existingSession.get("checkInTime")) {
    return jsonError("You have not punched in today.", 400);
  }

  // Check sign-out timing against configured deadline (e.g. 07:00 PM)
  const signOutTiming = checkSignOutTiming(
    new Date(),
    config.schoolSignOutDeadline || "07:00 PM",
    timeZone,
    config.schoolCloseTime || "05:00 PM"
  );

  const hasCoords = typeof latitude === "number" && typeof longitude === "number";
  let distance: number | null = null;
  if (hasCoords) {
    distance = Math.round(
      haversineMeters(latitude, longitude, config.latitude, config.longitude)
    );
  }

  const teacherName =
    (typeof userData.name === "string" && userData.name.trim()) ||
    auth.decoded.email?.split("@")[0] ||
    "Teacher";

  // CASE 1: LATE SIGN-OUT (After schoolSignOutDeadline, e.g. past 7:00 PM)
  if (signOutTiming.isLateSignOut) {
    if (!reason || reason.trim().length < 3) {
      return jsonError(
        `It is past the official sign-out time (${signOutTiming.signOutDeadlineFormatted}). A reason is required to submit your late sign-out request for administration approval.`,
        400
      );
    }

    const sData = existingSession.data() ?? {};
    let inHm = "09:00";
    if (sData.checkInTime?.toMillis) {
      inHm = DateTime.fromMillis(sData.checkInTime.toMillis(), { zone: timeZone }).toFormat("HH:mm");
    }
    const outDt = DateTime.now().setZone(timeZone);
    const outHm = outDt.toFormat("HH:mm");

    // File into manualPunchRequests (Attendance / Missed Punch Requests queue) - NOT a leave!
    const manualPunchRef = db.collection("manualPunchRequests").doc();
    await manualPunchRef.set({
      workerId: auth.decoded.uid,
      workerEmail: auth.decoded.email ?? null,
      workerName: teacherName,
      date: dateKey,
      reason: `[Late Sign-Out] Submitted at ${signOutTiming.currentFormatted} (+${signOutTiming.minutesLate}m past ${signOutTiming.signOutDeadlineFormatted}). Reason: ${reason.trim()}`,
      type: "late_sign_out",
      isLateSignOut: true,
      segments: [
        {
          siteId: "main-campus",
          inHm,
          outHm,
        },
      ],
      lateSignOut: {
        minutesLate: signOutTiming.minutesLate,
        currentFormatted: signOutTiming.currentFormatted,
        signOutDeadlineFormatted: signOutTiming.signOutDeadlineFormatted,
        gps: hasCoords ? { latitude, longitude, distanceM: distance } : null,
      },
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const lateSignOutPayload = {
      isLate: true,
      minutesLate: signOutTiming.minutesLate,
      reason: reason.trim(),
      status: "pending" as const,
      submittedAt: FieldValue.serverTimestamp(),
      timeFormatted: signOutTiming.currentFormatted,
      requestId: manualPunchRef.id,
      gps: hasCoords
        ? {
            latitude,
            longitude,
            accuracy: accuracy ?? null,
            distanceM: distance,
          }
        : null,
    };

    // Update teacherSession with pending late sign-out request
    await sessionRef.set(
      {
        lateSignOutRequest: lateSignOutPayload,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Clean up any legacy accidental leaveRequests for this day
    try {
      const legacySnap = await db
        .collection("leaveRequests")
        .where("teacherId", "==", auth.decoded.uid)
        .where("startDate", "==", dateKey)
        .get();
      for (const legDoc of legacySnap.docs) {
        const legData = legDoc.data();
        if (legData.type === "late_sign_out" || legData.isLateSignOut) {
          await legDoc.ref.delete();
        }
      }
    } catch {
      /* non-critical */
    }

    // Notify administrators for Attendance Request review
    try {
      const adminsSnap = await db
        .collection("users")
        .where("role", "in", ["admin", "super_admin"])
        .get();
      for (const adminDoc of adminsSnap.docs) {
        await createNotification(db, {
          userId: adminDoc.id,
          title: `🌙 Late Sign-Out Request: ${teacherName}`,
          body: `${teacherName} checked out late at ${signOutTiming.currentFormatted} (+${signOutTiming.minutesLate}m late). Reason: ${reason.trim()}`,
          kind: "manual_punch_request",
          link: "/dashboard/admin/requests?tab=manual_punch",
        });
      }
    } catch {
      /* non-critical */
    }

    invalidateTodayCache(auth.decoded.uid);

    return NextResponse.json({
      ok: true,
      pendingApproval: true,
      isLateSignOut: true,
      message: `Late sign-out request submitted for administration approval (+${signOutTiming.minutesLate}m past ${signOutTiming.signOutDeadlineFormatted}).`,
      date: dateKey,
    });
  }

  // CASE 2: REGULAR ON-TIME SIGN-OUT (Before or at schoolSignOutDeadline, e.g. <= 7:00 PM)
  // Requires campus GPS geofence validation
  if (!hasCoords) {
    return jsonError(
      "Campus GPS location is required to sign out. Please allow location access.",
      400
    );
  }

  if (distance !== null && distance > config.radiusMeters) {
    return jsonError(
      `You are ${distance}m away from ${config.name} (${config.campusName}). You must be within the school campus boundary (${config.radiusMeters}m) to punch out / sign out.`,
      403
    );
  }

  await sessionRef.set(
    {
      checkOutTime: FieldValue.serverTimestamp(),
      checkOutGps: {
        latitude,
        longitude,
        accuracy: accuracy ?? null,
        distanceM: distance,
      },
      status: "checked_out" as const,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // Mirror to legacy attendance record
  try {
    await db.collection("attendance").doc(sessionId).set(
      {
        checkOut: {
          time: FieldValue.serverTimestamp(),
          gps: { latitude, longitude, accuracyM: accuracy },
          photoUrl: "",
        },
      },
      { merge: true }
    );
  } catch {
    /* non-critical */
  }

  invalidateTodayCache(auth.decoded.uid);

  return NextResponse.json({
    ok: true,
    pendingApproval: false,
    isLateSignOut: false,
    message: "Signed out / Punched out from school successfully.",
    date: dateKey,
  });
}

