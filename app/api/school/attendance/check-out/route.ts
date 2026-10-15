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
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accuracy: z.number().optional(),
});

export async function POST(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  let json: unknown = {};
  try {
    json = await req.json();
  } catch {
    /* coordinates optional on checkout */
  }

  const parsed = checkOutSchema.safeParse(json);
  const { latitude, longitude, accuracy } = parsed.success ? parsed.data : { latitude: undefined, longitude: undefined, accuracy: undefined };
  const db = adminDb();

  const userSnap = await db.collection("users").doc(auth.decoded.uid).get();
  if (!userSnap.exists) return jsonError("User profile not found", 404);

  const userData = userSnap.data() ?? {};
  const timeZone = getIanaTimeZone(userData.timeZone as string | undefined);
  const dateKey = getDayKeyFromDate(new Date(), timeZone);
  const sessionId = `${auth.decoded.uid}_${dateKey}`;
  const sessionRef = db.collection("teacherSessions").doc(sessionId);

  const existingSession = await sessionRef.get();
  if (!existingSession.exists || !existingSession.get("checkInTime")) {
    return jsonError("You have not punched in today.", 400);
  }

  let distance: number | undefined;
  if (typeof latitude === "number" && typeof longitude === "number") {
    const config = await getSchoolConfig(db);
    distance = Math.round(haversineMeters(latitude, longitude, config.latitude, config.longitude));
  }

  await sessionRef.set(
    {
      checkOutTime: FieldValue.serverTimestamp(),
      checkOutGps:
        typeof latitude === "number" && typeof longitude === "number"
          ? {
              latitude,
              longitude,
              accuracy: accuracy ?? null,
              distanceM: distance ?? null,
            }
          : null,
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
