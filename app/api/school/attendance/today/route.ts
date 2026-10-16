import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { adminDb } from "@/lib/firebase/admin";
import { getSchoolConfig } from "@/lib/school/config";
import { getDayKeyFromDate, getIanaTimeZone } from "@/lib/date/timezone";
import { jsonError } from "@/lib/api/json-error";
import { FieldValue } from "firebase-admin/firestore";
import { calculateCasualLeaveQuota } from "@/lib/school/leave-quota";
import { extractFirstActiveDateKey } from "@/lib/attendance/user-first-active";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  const db = adminDb();
  const userSnap = await db.collection("users").doc(auth.decoded.uid).get();
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
    try {
      await db.collection("users").doc(auth.decoded.uid).set(
        {
          ...userData,
          createdAt: new Date(),
        },
        { merge: true }
      );
    } catch (e) {
      console.warn("[attendance/today] auto-create userDoc:", e);
    }
  }
  const timeZone = getIanaTimeZone(userData.timeZone as string | undefined);
  const dateKey = getDayKeyFromDate(new Date(), timeZone);
  const config = await getSchoolConfig(db);

  const sessionId = `${auth.decoded.uid}_${dateKey}`;
  const sessionSnap = await db.collection("teacherSessions").doc(sessionId).get();

  // Check if teacher has an approved or pending leave for today
  let activeLeave: Record<string, unknown> | null = null;
  const leavesSnap = await db
    .collection("leaveRequests")
    .where("teacherId", "==", auth.decoded.uid)
    .where("status", "in", ["approved", "pending"])
    .get();

  for (const doc of leavesSnap.docs) {
    const l = doc.data();
    const start = String(l.startDate ?? "");
    const end = String(l.endDate ?? "");
    if (dateKey >= start && dateKey <= end) {
      activeLeave = { id: doc.id, ...l };
      break;
    }
  }

  // Count casual leaves used this calendar year and calculate monthly quota with rollover
  const currentYear = dateKey.slice(0, 4); // "YYYY"
  const allCasualLeavesSnap = await db
    .collection("leaveRequests")
    .where("teacherId", "==", auth.decoded.uid)
    .where("type", "==", "casual")
    .where("status", "in", ["approved", "pending"])
    .get();

  const allTeacherCasualDates = new Set<string>();
  allCasualLeavesSnap.forEach((doc) => {
    const d = doc.data();
    const startStr = String(d.startDate ?? "");
    const endStr = String(d.endDate ?? startStr);
    const curr = new Date(startStr + "T00:00:00Z");
    const end = new Date(endStr + "T00:00:00Z");
    if (!isNaN(curr.getTime()) && !isNaN(end.getTime()) && curr <= end) {
      while (curr <= end) {
        const yyyy = curr.getUTCFullYear();
        const mm = String(curr.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(curr.getUTCDate()).padStart(2, "0");
        const dateStr = `${yyyy}-${mm}-${dd}`;
        if (dateStr.startsWith(currentYear)) {
          allTeacherCasualDates.add(dateStr);
        }
        curr.setUTCDate(curr.getUTCDate() + 1);
      }
    } else if (startStr.startsWith(currentYear)) {
      allTeacherCasualDates.add(startStr);
    }
  });

  const firstActiveDateKey = extractFirstActiveDateKey(userData, sessionSnap.exists ? dateKey : null, timeZone);

  // If user doc doesn't have firstLoginAt recorded yet, record it now
  if (!userData.firstLoginAt && !userData.createdAt) {
    db.collection("users")
      .doc(auth.decoded.uid)
      .set({ firstLoginAt: FieldValue.serverTimestamp() }, { merge: true })
      .catch(() => {});
  }

  const casualQuota = calculateCasualLeaveQuota(dateKey, allTeacherCasualDates, firstActiveDateKey);

  return NextResponse.json({
    date: dateKey,
    config: {
      name: config.name,
      campusName: config.campusName,
      latitude: config.latitude,
      longitude: config.longitude,
      radiusMeters: config.radiusMeters,
      teacherLateTime: config.teacherLateTime || "09:00 AM",
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
    session: sessionSnap.exists
      ? (() => {
          const s = sessionSnap.data() ?? {};
          return {
            ...s,
            checkInTime: s.checkInTime?.toDate
              ? s.checkInTime.toDate().toISOString()
              : s.checkInTime?.seconds
              ? new Date(s.checkInTime.seconds * 1000).toISOString()
              : s.checkInTime?._seconds
              ? new Date(s.checkInTime._seconds * 1000).toISOString()
              : s.checkInTime,
            checkOutTime: s.checkOutTime?.toDate
              ? s.checkOutTime.toDate().toISOString()
              : s.checkOutTime?.seconds
              ? new Date(s.checkOutTime.seconds * 1000).toISOString()
              : s.checkOutTime?._seconds
              ? new Date(s.checkOutTime._seconds * 1000).toISOString()
              : s.checkOutTime,
          };
        })()
      : null,
    isCheckedIn: sessionSnap.exists && !!sessionSnap.get("checkInTime"),
    isCheckedOut: sessionSnap.exists && !!sessionSnap.get("checkOutTime"),
    leave: activeLeave,
  });
}
