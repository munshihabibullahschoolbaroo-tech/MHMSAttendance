import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { jsonError } from "@/lib/api/json-error";
import { isRequestAdmin } from "@/lib/auth/require-admin";
import { requireBearerUser } from "@/lib/auth/verify-request";

export const runtime = "nodejs";

const querySchema = z.object({
  workerId: z.string().min(1),
});

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const decoded = auth.decoded;
  if (!(await isRequestAdmin(decoded))) return jsonError("Forbidden", 403);

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    workerId: url.searchParams.get("workerId") ?? "",
  });
  if (!parsed.success) {
    return jsonError("workerId required", 400);
  }

  const [attSnap, leavesSnap] = await Promise.all([
    adminDb()
      .collection("attendance")
      .where("workerId", "==", parsed.data.workerId)
      .get(),
    adminDb()
      .collection("leaveRequests")
      .where("teacherId", "==", parsed.data.workerId)
      .where("status", "==", "approved")
      .get()
      .catch(() => ({ docs: [] })),
  ]);

  const dates: string[] = [];
  for (const d of attSnap.docs) {
    const data = d.data() as { date?: unknown };
    if (typeof data.date === "string") dates.push(data.date);
  }

  const leaveDates: string[] = [];
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
        leaveDates.push(`${yyyy}-${mm}-${dd}`);
        curr.setUTCDate(curr.getUTCDate() + 1);
      }
    } else if (startStr) {
      leaveDates.push(startStr);
    }
  }

  return NextResponse.json({ dates, leaveDates });
}
