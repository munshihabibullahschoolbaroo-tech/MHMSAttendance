import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { adminDb } from "@/lib/firebase/admin";
import { getSchoolConfig } from "@/lib/school/config";
import { getDayKeyFromDate, getIanaTimeZone } from "@/lib/date/timezone";
import { jsonError } from "@/lib/api/json-error";
import { FieldValue } from "firebase-admin/firestore";
import { calculateCasualLeaveQuota } from "@/lib/school/leave-quota";
import { extractFirstActiveDateKey } from "@/lib/attendance/user-first-active";
import { todayCache } from "@/lib/cache/today-cache";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  const defaultTz = "Asia/Kolkata";
  const defaultDateKey = getDayKeyFromDate(new Date(), defaultTz);
  const cacheKey = `${auth.decoded.uid}:${defaultDateKey}`;
  const now = Date.now();
  const cached = todayCache.get(cacheKey);
  if (cached && now < cached.expiresAt) {
    return NextResponse.json(cached.data, {
      headers: { "Cache-Control": "private, no-cache, stale-while-revalidate=15" },
    });
  }

  const db = adminDb();

  // Run all primary reads IN PARALLEL for maximum speed
  const [userSnap, config, leavesSnap, initialSessionSnap] = await Promise.all([
    db.collection("users").doc(auth.decoded.uid).get(),
    getSchoolConfig(db),
    db.collection("leaveRequests")
      .where("teacherId", "==", auth.decoded.uid)
      .where("status", "in", ["approved", "pending"])
      .get(),
    db.collection("teacherSessions").doc(`${auth.decoded.uid}_${defaultDateKey}`).get(),
  ]);

  let userData: Record<string, unknown> = {};
  if (userSnap.exists) {
    userData = userSnap.data() ?? {};
  } else {
    userData = {
      name: auth.decoded.name || (auth.decoded.email ? auth.decoded.email.split("@")[0] : "Teacher"),
      email: auth.decoded.email || "",
      role: "employee",
      schoolWingId: "higher",
      designation: "Teacher",
      position: "teacher",
      workspaceAccessStatus: "approved",
    };
    db.collection("users").doc(auth.decoded.uid).set(
      {
        ...userData,
        createdAt: new Date(),
      },
      { merge: true }
    ).catch((e) => console.warn("[attendance/today] auto-create userDoc:", e));
  }

  const timeZone = getIanaTimeZone(userData.timeZone as string | undefined);
  const dateKey = timeZone === defaultTz ? defaultDateKey : getDayKeyFromDate(new Date(), timeZone);

  // If user has custom timezone that changed dateKey, fetch matching session, otherwise use already loaded sessionSnap
  let sessionSnap = initialSessionSnap;
  if (dateKey !== defaultDateKey) {
    sessionSnap = await db.collection("teacherSessions").doc(`${auth.decoded.uid}_${dateKey}`).get();
  }

  // Check if teacher has an approved or pending leave for today
  let activeLeave: Record<string, unknown> | null = null;
  const currentYear = dateKey.slice(0, 4); // "YYYY"
  const allTeacherCasualDates = new Set<string>();

  for (const doc of leavesSnap.docs) {
    const l = doc.data();
    if (l.type === "late_sign_out" || l.isLateSignOut) continue;
    const start = String(l.startDate ?? "");
    const end = String(l.endDate ?? "");
    if (dateKey >= start && dateKey <= end) {
      activeLeave = { id: doc.id, ...l };
    }

    // Accumulate casual leaves directly from leavesSnap in memory (0ms, no second network query!)
    if (l.type === "casual") {
      const curr = new Date(start + "T00:00:00Z");
      const endDt = new Date(end + "T00:00:00Z");
      if (!isNaN(curr.getTime()) && !isNaN(endDt.getTime()) && curr <= endDt) {
        while (curr <= endDt) {
          const yyyy = curr.getUTCFullYear();
          const mm = String(curr.getUTCMonth() + 1).padStart(2, "0");
          const dd = String(curr.getUTCDate()).padStart(2, "0");
          const dStr = `${yyyy}-${mm}-${dd}`;
          if (dStr.startsWith(currentYear)) {
            allTeacherCasualDates.add(dStr);
          }
          curr.setUTCDate(curr.getUTCDate() + 1);
        }
      } else if (start.startsWith(currentYear)) {
        allTeacherCasualDates.add(start);
      }
    }
  }

  const firstActiveDateKey = extractFirstActiveDateKey(userData, sessionSnap.exists ? dateKey : null, timeZone);

  // If user doc doesn't have firstLoginAt recorded yet, record it asynchronously without blocking
  if (!userData.firstLoginAt && !userData.createdAt) {
    db.collection("users")
      .doc(auth.decoded.uid)
      .set({ firstLoginAt: FieldValue.serverTimestamp() }, { merge: true })
      .catch(() => {});
  }

  const casualQuota = calculateCasualLeaveQuota(dateKey, allTeacherCasualDates, firstActiveDateKey);

  const payload = {
    date: dateKey,
    config: {
      name: config.name,
      campusName: config.campusName,
      latitude: config.latitude,
      longitude: config.longitude,
      radiusMeters: config.radiusMeters,
      schoolOpenTime: config.schoolOpenTime || "08:00 AM",
      teacherLateTime: config.teacherLateTime || "09:00 AM",
      schoolCloseTime: config.schoolCloseTime || "05:00 PM",
      schoolSignOutDeadline: config.schoolSignOutDeadline || "07:00 PM",
      signOutGraceHours: config.signOutGraceHours ?? 2,
    },
    teacher: {
      name: userData.name ?? auth.decoded.email?.split("@")[0] ?? "Teacher",
      role: userData.role ?? "employee",
      wingId: userData.schoolWingId ?? "higher",
      position: userData.position ?? "teacher",
      designation: userData.designation ?? "Teacher",
      isClassTeacher: userData.isClassTeacher === true,
      schoolClassId: userData.schoolClassId ?? null,
      schoolSectionId: userData.schoolSectionId ?? null,
      firstActiveDate: firstActiveDateKey,
      casualLeavesThisMonth: casualQuota.usedThisMonth,
      maxCasualLeavesAllowed: casualQuota.maxCasualLeavesAllowed,
      carriedForwardCasualLeaves: casualQuota.carriedForward,
      remainingCasualLeaves: casualQuota.remainingCasualLeaves,
    },
    session: (() => {
      if (!sessionSnap.exists) return null;
      const s = sessionSnap.data() ?? {};
      const formatTime = (t: any) => {
        if (!t) return t;
        if (typeof t.toDate === "function") return t.toDate().toISOString();
        if (typeof t.seconds === "number") return new Date(t.seconds * 1000).toISOString();
        if (typeof t._seconds === "number") return new Date(t._seconds * 1000).toISOString();
        return t;
      };
      return {
        ...s,
        checkInTime: formatTime(s.checkInTime),
        checkOutTime: formatTime(s.checkOutTime),
      };
    })(),
    isCheckedIn: sessionSnap.exists && !!sessionSnap.get("checkInTime"),
    isCheckedOut: sessionSnap.exists && !!sessionSnap.get("checkOutTime"),
    leave: activeLeave,
  };

  todayCache.set(cacheKey, { data: payload, expiresAt: now + 15_000 });

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "private, no-cache, stale-while-revalidate=15" },
  });
}
