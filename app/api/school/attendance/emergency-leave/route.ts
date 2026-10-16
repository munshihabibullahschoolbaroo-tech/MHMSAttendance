import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { adminDb } from "@/lib/firebase/admin";
import { jsonError } from "@/lib/api/json-error";
import { getDayKeyFromDate, getIanaTimeZone } from "@/lib/date/timezone";
import { createNotification } from "@/lib/notifications/create-notification";
import { invalidateTodayCache } from "@/lib/cache/today-cache";

export const runtime = "nodejs";

const schema = z.object({
  type: z.enum(["school_duty", "emergency"]),
  departureTime: z.string().min(1),
  willReturn: z.boolean(),
  returnTime: z.string().optional().nullable(),
  reason: z.string().min(2).max(1000),
  assigneeAdminUid: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid request body", 400);
  }

  const { type, departureTime, willReturn, returnTime, reason, assigneeAdminUid } = parsed.data;
  const db = adminDb();

  const userSnap = await db.collection("users").doc(auth.decoded.uid).get();
  if (!userSnap.exists) return jsonError("User profile not found", 404);
  const userData = userSnap.data() ?? {};

  const timeZone = getIanaTimeZone(userData.timeZone as string | undefined);
  const dateKey = getDayKeyFromDate(new Date(), timeZone);
  const sessionId = `${auth.decoded.uid}_${dateKey}`;
  const sessionRef = db.collection("teacherSessions").doc(sessionId);

  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists || !sessionSnap.get("checkInTime")) {
    return jsonError(
      "You must be punched in at school to file an on-duty departure or emergency leave.",
      400
    );
  }

  const teacherName =
    (typeof userData.name === "string" && userData.name.trim()) ||
    auth.decoded.email?.split("@")[0] ||
    "Teacher";

  const emergencyPayload = {
    active: true,
    type,
    departureTime,
    willReturn,
    returnTime: willReturn ? returnTime ?? null : null,
    reason: reason.trim(),
    status: "pending" as const,
    assigneeAdminUid: assigneeAdminUid || null,
    submittedAt: FieldValue.serverTimestamp(),
  };

  // 1. Update active teacher session
  await sessionRef.set(
    {
      emergencyLeave: emergencyPayload,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // 2. Insert into leaveRequests collection so administrators can review it
  const leaveTypeStr = type === "school_duty" ? "on_duty" : "emergency";
  const displayLabel = type === "school_duty" ? "Official School Duty (OD)" : "Emergency Departure";

  const leaveDocRef = db.collection("leaveRequests").doc();
  await leaveDocRef.set({
    teacherId: auth.decoded.uid,
    teacherName,
    teacherEmail: auth.decoded.email ?? "",
    teacherPhone: userData.phone ?? null,
    wingId: userData.schoolWingId ?? "higher",
    position: userData.position ?? "teacher",
    designation: userData.designation ?? "Teacher",
    type: leaveTypeStr,
    startDate: dateKey,
    endDate: dateKey,
    reason: `[${displayLabel}] ${reason.trim()} (Departed at ${departureTime}${
      willReturn ? `, Returning by ${returnTime || "end of day"}` : ", Full Day Departure"
    })`,
    isEmergencyDeparture: true,
    departureTime,
    willReturn,
    returnTime: willReturn ? returnTime ?? null : null,
    status: "pending" as const,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // 3. Notify school administrators
  try {
    const adminUids: string[] = [];
    if (assigneeAdminUid) {
      adminUids.push(assigneeAdminUid);
    } else {
      const adminsSnap = await db
        .collection("users")
        .where("role", "in", ["admin", "super_admin"])
        .get();
      adminsSnap.docs.forEach((doc) => adminUids.push(doc.id));
    }

    for (const adminId of adminUids) {
      await createNotification(db, {
        userId: adminId,
        title: `🚨 ${displayLabel}: ${teacherName}`,
        body: `${teacherName} filed for ${displayLabel} departing at ${departureTime}. Reason: ${reason.trim()}`,
        kind: "leave_request",
        link: "/dashboard/admin/leaves",
      });
    }
  } catch (notifErr) {
    console.warn("[emergency-leave] Non-critical notification failed:", notifErr);
  }

  invalidateTodayCache(auth.decoded.uid);

  return NextResponse.json({
    ok: true,
    message: `${displayLabel} request submitted successfully for administration approval.`,
    emergencyLeave: emergencyPayload,
  });
}
