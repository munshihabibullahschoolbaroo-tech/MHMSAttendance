import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { adminDb } from "@/lib/firebase/admin";
import { jsonError } from "@/lib/api/json-error";
import { createNotification } from "@/lib/notifications/create-notification";

export const runtime = "nodejs";

const leaveSchema = z.object({
  type: z.enum(["casual", "medical"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(5).max(500),
  documentUrl: z.string().url().optional().or(z.literal("")),
});

/** GET /api/school/leave - List teacher's leave requests */
export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  const db = adminDb();
  const snap = await db
    .collection("leaveRequests")
    .where("teacherId", "==", auth.decoded.uid)
    .get();

  const leaves = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  leaves.sort((a: any, b: any) => {
    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
    return timeB - timeA;
  });
  return NextResponse.json({ leaves });
}

/** POST /api/school/leave - Submit a new leave request */
export async function POST(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = leaveSchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid leave application", 400);
  }

  const { type, startDate, endDate, reason, documentUrl } = parsed.data;

  if (type === "medical" && (!documentUrl || !documentUrl.trim())) {
    return jsonError("Medical leave requires a medical certificate or doctor prescription document.", 400);
  }

  if (startDate > endDate) {
    return jsonError("Start date cannot be after end date.", 400);
  }

  function getDatesInRange(startStr: string, endStr: string): string[] {
    const dates: string[] = [];
    const curr = new Date(startStr + "T00:00:00Z");
    const end = new Date(endStr + "T00:00:00Z");
    if (isNaN(curr.getTime()) || isNaN(end.getTime()) || curr > end) return [startStr];
    while (curr <= end) {
      const yyyy = curr.getUTCFullYear();
      const mm = String(curr.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(curr.getUTCDate()).padStart(2, "0");
      dates.push(`${yyyy}-${mm}-${dd}`);
      curr.setUTCDate(curr.getUTCDate() + 1);
    }
    return dates;
  }

  const requestedDates = getDatesInRange(startDate, endDate);

  const db = adminDb();

  // Check for any overlapping leaves (casual or medical)
  const existingTeacherLeavesSnap = await db
    .collection("leaveRequests")
    .where("teacherId", "==", auth.decoded.uid)
    .where("status", "in", ["approved", "pending"])
    .get();

  for (const doc of existingTeacherLeavesSnap.docs) {
    const s = String(doc.get("startDate") ?? "");
    const e = String(doc.get("endDate") ?? s);
    const existingDates = getDatesInRange(s, e);
    for (const d of requestedDates) {
      if (existingDates.includes(d)) {
        return jsonError(
          `You already have a leave request (${doc.get("type")?.toString().toUpperCase()} - ${doc.get("status")}) covering ${d}.`,
          400
        );
      }
    }
  }

  // Casual leave quota verification: strictly max 2 days per calendar month
  if (type === "casual") {
    // Group requested dates by month (e.g., "2026-10")
    const requestedByMonth: Record<string, string[]> = {};
    for (const d of requestedDates) {
      const m = d.slice(0, 7);
      if (!requestedByMonth[m]) requestedByMonth[m] = [];
      requestedByMonth[m].push(d);
    }

    for (const [monthKey, reqDates] of Object.entries(requestedByMonth)) {
      const usedDatesInMonth = new Set<string>();
      existingTeacherLeavesSnap.forEach((d) => {
        if (d.get("type") === "casual") {
          const s = String(d.get("startDate") ?? "");
          const e = String(d.get("endDate") ?? s);
          const dates = getDatesInRange(s, e);
          for (const date of dates) {
            if (date.startsWith(monthKey)) {
              usedDatesInMonth.add(date);
            }
          }
        }
      });

      if (usedDatesInMonth.size + reqDates.length > 2) {
        return jsonError(
          `Casual leave quota exceeded for ${monthKey}: Maximum 2 casual leave days allowed per month. You currently have ${usedDatesInMonth.size} day(s) recorded/pending, and this application requests ${reqDates.length} day(s).`,
          400
        );
      }
    }
  }

  const userSnap = await db.collection("users").doc(auth.decoded.uid).get();
  if (!userSnap.exists) return jsonError("User profile not found", 404);

  const userData = userSnap.data() ?? {};

  const teacherName =
    (typeof userData.name === "string" && userData.name.trim()) ||
    auth.decoded.email?.split("@")[0] ||
    "Teacher";

  const docRef = db.collection("leaveRequests").doc();
  const leaveData = {
    teacherId: auth.decoded.uid,
    teacherName,
    teacherEmail: auth.decoded.email ?? "",
    teacherPhone: userData.phone ?? null,
    wingId: userData.schoolWingId ?? "higher",
    position: userData.position ?? "teacher",
    designation: userData.designation ?? "Teacher",
    type,
    startDate,
    endDate,
    reason,
    documentUrl: documentUrl || null,
    status: "pending" as const,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await docRef.set(leaveData);

  // Notify admins
  try {
    const adminsSnap = await db
      .collection("users")
      .where("role", "in", ["admin", "super_admin"])
      .get();

    for (const adminDoc of adminsSnap.docs) {
      await createNotification(db, {
        userId: adminDoc.id,
        title: `Leave Application: ${teacherName}`,
        body: `${teacherName} applied for ${type.toUpperCase()} leave (${startDate} to ${endDate}): ${reason}`,
        kind: "leave_request",
        link: "/dashboard/admin/leaves",
      });
    }
  } catch {
    /* non-critical */
  }

  return NextResponse.json({ ok: true, leaveId: docRef.id, message: "Leave application submitted successfully." });
}
