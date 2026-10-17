import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { DateTime } from "luxon";
import { calendarDateKeyInTimeZone } from "@/lib/date/calendar-day-key";
import { timeZoneFromUserSnapshot } from "@/lib/attendance/time-zone-from-snap";
import { jsonError } from "@/lib/api/json-error";
import { isRequestAdmin } from "@/lib/auth/require-admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { getSchoolConfig } from "@/lib/school/config";
import { parseAmTimeMinutes } from "@/lib/date/late-check";

export const runtime = "nodejs";

type AttendanceDoc = {
  checkIn?: { time?: { toMillis?: () => number; seconds?: number } };
  checkOut?: unknown;
};

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const decoded = auth.decoded;
  if (!(await isRequestAdmin(decoded))) return jsonError("Forbidden", 403);

  const db = adminDb();
  const viewerTz = timeZoneFromUserSnapshot(await db.collection("users").doc(decoded.uid).get());
  const day = calendarDateKeyInTimeZone(new Date(), viewerTz);

  // Fetch canonical MHMS teacherSessions, legacy/fallback attendance, and school config in parallel
  const [teacherSessionsSnap, attendanceSnap, config] = await Promise.all([
    db.collection("teacherSessions").where("date", "==", day).get(),
    db.collection("attendance").where("date", "==", day).get(),
    getSchoolConfig(db),
  ]);

  const cutoffMinutes = parseAmTimeMinutes(config.teacherLateTime || "09:00 AM");
  const cutoffHour = Math.floor(cutoffMinutes / 60);
  const cutoffMinute = cutoffMinutes % 60;

  // Merge records by workerId to prevent double counting
  const recordsMap = new Map<string, any>();

  for (const doc of teacherSessionsSnap.docs) {
    const d = doc.data();
    const workerId = (d.teacherId as string) || doc.id.split("_")[0];
    if (workerId) {
      recordsMap.set(workerId, { ...d, workerId });
    }
  }

  for (const doc of attendanceSnap.docs) {
    const d = doc.data();
    const workerId = (d.workerId as string) || doc.id.split("_")[0];
    if (workerId && !recordsMap.has(workerId)) {
      recordsMap.set(workerId, { ...d, workerId });
    }
  }

  const allRecords = Array.from(recordsMap.values());

  let totalCheckIns = 0;
  let completed = 0;
  let pending = 0;
  let activeWorkers = 0;
  let lateArrivals = 0;

  for (const r of allRecords) {
    const hasCheckIn = !!(
      r.checkInTime ||
      r.checkIn?.time ||
      r.status === "present" ||
      r.status === "checked_out"
    );

    const hasCheckOut = !!(
      r.checkOutTime ||
      r.checkOut?.time ||
      r.status === "checked_out"
    );

    if (hasCheckIn) {
      totalCheckIns++;
    }

    if (hasCheckIn && hasCheckOut) {
      completed++;
    }

    // In-session / Pending checkout
    const isCurrentlyInSchool = hasCheckIn && !hasCheckOut && r.status !== "absent";
    if (isCurrentlyInSchool) {
      pending++;

      // Active on campus: within geofence and not departed on active emergency leave
      const isAwayOnEmergency =
        r.emergencyLeave &&
        r.emergencyLeave.active === true &&
        r.emergencyLeave.status !== "rejected";

      if (!isAwayOnEmergency) {
        activeWorkers++;
      }
    }

    // Late arrival check
    let isLate = r.isLate === true || r.lateArrival === true;
    if (!isLate && hasCheckIn) {
      const rawTime = r.checkInTime || r.checkIn?.time;
      let ms: number | null = null;
      if (rawTime && typeof rawTime.toMillis === "function") {
        ms = rawTime.toMillis();
      } else if (rawTime && typeof rawTime.seconds === "number") {
        ms = rawTime.seconds * 1000;
      } else if (rawTime && typeof rawTime._seconds === "number") {
        ms = rawTime._seconds * 1000;
      } else if (typeof rawTime === "number") {
        ms = rawTime > 1e11 ? rawTime : rawTime * 1000;
      } else if (typeof rawTime === "string") {
        const p = Date.parse(rawTime);
        if (!isNaN(p)) ms = p;
      }

      if (ms != null) {
        const local = DateTime.fromMillis(ms, { zone: "utc" }).setZone(viewerTz);
        if (local.hour > cutoffHour || (local.hour === cutoffHour && local.minute > cutoffMinute)) {
          isLate = true;
        }
      }
    }

    if (isLate) {
      lateArrivals++;
    }
  }

  const completionRate =
    totalCheckIns === 0 ? 0 : Math.round((completed / totalCheckIns) * 100);

  return NextResponse.json({
    activeWorkers,
    totalCheckIns,
    completed,
    pending,
    lateArrivals,
    completionRate,
    date: day,
  });
}
