import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { adminDb } from "@/lib/firebase/admin";
import { jsonError } from "@/lib/api/json-error";
import { haversineMeters } from "@/lib/geo/haversine";
import { getSchoolConfig } from "@/lib/school/config";
import { getDayKeyFromDate, getIanaTimeZone } from "@/lib/date/timezone";
import { isPastLateCutoff } from "@/lib/date/late-check";

export const runtime = "nodejs";

const checkInSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().optional(),
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

  const parsed = checkInSchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid coordinates", 400);
  }

  const { latitude, longitude, accuracy } = parsed.data;
  const db = adminDb();

  const userSnap = await db.collection("users").doc(auth.decoded.uid).get();
  if (!userSnap.exists) return jsonError("User profile not found", 404);

  const userData = userSnap.data() ?? {};
  const config = await getSchoolConfig(db);

  // Validate geofence against MHMS school campus (34.547063, 76.140028)
  const distance = Math.round(
    haversineMeters(latitude, longitude, config.latitude, config.longitude)
  );

  if (distance > config.radiusMeters) {
    return jsonError(
      `You are ${distance}m away from ${config.name} (${config.campusName}). You must be within the school boundary (${config.radiusMeters}m) to check in.`,
      403
    );
  }

  const timeZone = getIanaTimeZone(userData.timeZone as string | undefined);
  const dateKey = getDayKeyFromDate(new Date(), timeZone);
  const sessionId = `${auth.decoded.uid}_${dateKey}`;
  const sessionRef = db.collection("teacherSessions").doc(sessionId);

  const existingSession = await sessionRef.get();
  if (existingSession.exists && existingSession.get("checkInTime")) {
    return NextResponse.json({
      ok: true,
      alreadyCheckedIn: true,
      message: "You are already punched in for today.",
      session: existingSession.data(),
    });
  }

  const lateCheck = isPastLateCutoff(new Date(), config.teacherLateTime || "09:00 AM", timeZone);
  const isLate = lateCheck.isLate;

  const sessionData = {
    teacherId: auth.decoded.uid,
    teacherName: (userData.name as string) || auth.decoded.email?.split("@")[0] || "Teacher",
    teacherEmail: (userData.email as string) || auth.decoded.email || "",
    teacherPhone: (userData.phone as string) || null,
    wingId: (userData.schoolWingId as string) || "higher",
    position: (userData.position as string) || "teacher",
    designation: (userData.designation as string) || "Teacher",
    isClassTeacher: userData.isClassTeacher === true,
    schoolClassId: (userData.schoolClassId as string) || null,
    schoolSectionId: (userData.schoolSectionId as string) || null,
    date: dateKey,
    checkInTime: FieldValue.serverTimestamp(),
    checkInGps: {
      latitude,
      longitude,
      accuracy: accuracy ?? null,
      distanceM: distance,
    },
    status: "present" as const,
    isLate: isLate === true,
    lateArrival: isLate === true,
    lateMinutes: lateCheck.minutesLate,
    cutoffTime: lateCheck.cutoffFormatted,
    updatedAt: FieldValue.serverTimestamp(),
  };

  await sessionRef.set(sessionData, { merge: true });

  // Mirror to legacy attendance collection for compatibility with reports
  try {
    await db.collection("attendance").doc(sessionId).set(
      {
        workerId: auth.decoded.uid,
        date: dateKey,
        siteId: "mhms_main_campus",
        status: "present",
        isLate: isLate === true,
        lateArrival: isLate === true,
        checkIn: {
          time: FieldValue.serverTimestamp(),
          gps: { latitude, longitude, accuracyM: accuracy },
          photoUrl: "", // No photo needed
        },
      },
      { merge: true }
    );
  } catch {
    /* non-critical */
  }

  return NextResponse.json({
    ok: true,
    message: `Punched in successfully at ${config.name}! Distance: ${distance}m.`,
    distance,
    date: dateKey,
  });
}
