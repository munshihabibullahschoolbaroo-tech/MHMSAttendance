import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { adminDb } from "@/lib/firebase/admin";
import { jsonError } from "@/lib/api/json-error";
import { haversineMeters } from "@/lib/geo/haversine";
import { getSchoolConfig } from "@/lib/school/config";
import { getDayKeyFromDate, getIanaTimeZone } from "@/lib/date/timezone";

export const runtime = "nodejs";

const checkOutSchema = z.object({
  latitude: z.number().min(-90).max(90, "Latitude must be valid"),
  longitude: z.number().min(-180).max(180, "Longitude must be valid"),
  accuracy: z.number().optional(),
});

export async function POST(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  let json: unknown = {};
  try {
    json = await req.json();
  } catch {
    return jsonError("Campus GPS location is required to punch out / sign out. Please allow location access.", 400);
  }

  const parsed = checkOutSchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Campus GPS location is required to punch out / sign out. Please allow location access.",
      400
    );
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
      `You are ${distance}m away from ${config.name} (${config.campusName}). You must be within the school campus boundary (${config.radiusMeters}m) to punch out / sign out.`,
      403
    );
  }

  const timeZone = getIanaTimeZone(userData.timeZone as string | undefined);
  const dateKey = getDayKeyFromDate(new Date(), timeZone);
  const sessionId = `${auth.decoded.uid}_${dateKey}`;
  const sessionRef = db.collection("teacherSessions").doc(sessionId);

  const existingSession = await sessionRef.get();
  if (!existingSession.exists || !existingSession.get("checkInTime")) {
    return jsonError("You have not punched in today.", 400);
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
          gps:
            typeof latitude === "number" && typeof longitude === "number"
              ? { latitude, longitude, accuracyM: accuracy }
              : null,
          photoUrl: "",
        },
      },
      { merge: true }
    );
  } catch {
    /* non-critical */
  }

  return NextResponse.json({
    ok: true,
    message: "Signed out / Punched out from school successfully.",
    date: dateKey,
  });
}
