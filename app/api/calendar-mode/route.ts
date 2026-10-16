import { requireBearerUser } from "@/lib/auth/verify-request";
import { adminDb } from "@/lib/firebase/admin";
import {
  getCalendarModeCache,
  setCalendarModeCache,
  CALENDAR_MODE_CACHE_TTL_MS,
} from "@/lib/cache/calendar-mode-cache";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  // Calendar mode is permanently Gregorian (AD)
  return Response.json({ mode: "ad" });
}

