import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { jsonError } from "@/lib/api/json-error";
import { isRequestAdmin } from "@/lib/auth/require-admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { extractFirstActiveDateKey } from "@/lib/attendance/user-first-active";

export const runtime = "nodejs";

const querySchema = z.object({
  workerId: z.string().min(1),
});

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const decoded = auth.decoded;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    workerId: url.searchParams.get("workerId") ?? "",
  });
  if (!parsed.success) {
    return jsonError("workerId required", 400);
  }

  const workerId = parsed.data.workerId;
  const isSelf = workerId === decoded.uid;
  const isAdmin = await isRequestAdmin(decoded);

  if (!isSelf && !isAdmin) {
    return jsonError("Forbidden", 403);
  }

  const db = adminDb();

  // Query teacherSessions, legacy attendance, approved leaves, and user doc
  const [teacherSessionsSnap, attSnap, leavesSnap, userSnap] = await Promise.all([
    db
      .collection("teacherSessions")
      .where("teacherId", "==", workerId)
      .get()
      .catch(() => ({ docs: [] })),
    db
      .collection("attendance")
      .where("workerId", "==", workerId)
      .get()
      .catch(() => ({ docs: [] })),
    db
      .collection("leaveRequests")
      .where("teacherId", "==", workerId)
      .where("status", "==", "approved")
      .get()
      .catch(() => ({ docs: [] })),
    db
      .collection("users")
      .doc(workerId)
      .get()
      .catch(() => null),
  ]);

  const datesSet = new Set<string>();
  const lateDatesSet = new Set<string>();
  const onTimeDatesSet = new Set<string>();
  const details: Record<
    string,
    {
      isLate: boolean;
      lateMinutes?: number;
      cutoffTime?: string;
      status: string;
      emergencyLeave?: {
        active: boolean;
        type: string;
        status: string;
      } | null;
    }
  > = {};

  // Process teacherSessions (primary MHMS attendance store)
  for (const d of teacherSessionsSnap.docs) {
    const data = d.data();
    const dateStr = typeof data.date === "string" ? data.date : d.id.split("_")[1];
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;

    const hasCheckedIn = Boolean(data.checkInTime || data.status === "present");
    if (hasCheckedIn) {
      datesSet.add(dateStr);
      const isLate =
        data.isLate === true ||
        data.lateArrival === true ||
        (typeof data.lateMinutes === "number" && data.lateMinutes > 0);

      if (isLate) {
        lateDatesSet.add(dateStr);
      } else {
        onTimeDatesSet.add(dateStr);
      }

      details[dateStr] = {
        isLate,
        lateMinutes: typeof data.lateMinutes === "number" ? data.lateMinutes : undefined,
        cutoffTime: typeof data.cutoffTime === "string" ? data.cutoffTime : undefined,
        status: String(data.status ?? (isLate ? "late" : "present")),
        emergencyLeave: data.emergencyLeave
          ? {
              active: data.emergencyLeave.active === true,
              type: String(data.emergencyLeave.type ?? "school_duty"),
              status: String(data.emergencyLeave.status ?? "pending"),
            }
          : null,
      };
    }
  }

  // Also process legacy attendance collection (for backward compatibility)
  for (const d of attSnap.docs) {
    const data = d.data() as {
      date?: unknown;
      status?: unknown;
      isLate?: unknown;
      lateArrival?: unknown;
      lateMinutes?: unknown;
    };
    const dateStr = typeof data.date === "string" ? data.date : d.id.split("_")[1];
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;

    datesSet.add(dateStr);
    const isLate =
      data.isLate === true ||
      data.lateArrival === true ||
      (typeof data.lateMinutes === "number" && data.lateMinutes > 0);

    if (isLate) {
      lateDatesSet.add(dateStr);
      onTimeDatesSet.delete(dateStr);
    } else if (!lateDatesSet.has(dateStr)) {
      onTimeDatesSet.add(dateStr);
    }

    if (!details[dateStr]) {
      details[dateStr] = {
        isLate,
        lateMinutes: typeof data.lateMinutes === "number" ? data.lateMinutes : undefined,
        status: String(data.status ?? (isLate ? "late" : "present")),
      };
    }
  }

  // Process approved leaves
  const leaveDatesSet = new Set<string>();
  for (const d of leavesSnap.docs) {
    const data = d.data();
    const startStr = String(data.startDate ?? "");
    const endStr = String(data.endDate ?? startStr);
    const curr = new Date(startStr + "T00:00:00Z");
    const end = new Date(endStr + "T00:00:00Z");
    if (!isNaN(curr.getTime()) && !isNaN(end.getTime()) && curr <= end) {
      while (curr <= end) {
        const yyyy = curr.getUTCFullYear();
        const mm = String(curr.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(curr.getUTCDate()).padStart(2, "0");
        const iso = `${yyyy}-${mm}-${dd}`;
        leaveDatesSet.add(iso);
        curr.setUTCDate(curr.getUTCDate() + 1);
      }
    } else if (startStr && /^\d{4}-\d{2}-\d{2}$/.test(startStr)) {
      leaveDatesSet.add(startStr);
    }
  }

  const allActivityDates = Array.from(datesSet).sort();
  const earliestActivity = allActivityDates.length > 0 ? allActivityDates[0] : null;
  const firstActiveDate = extractFirstActiveDateKey(userSnap?.data(), earliestActivity);

  return NextResponse.json({
    dates: Array.from(datesSet),
    onTimeDates: Array.from(onTimeDatesSet),
    lateDates: Array.from(lateDatesSet),
    leaveDates: Array.from(leaveDatesSet),
    details,
    firstActiveDate,
  });
}
