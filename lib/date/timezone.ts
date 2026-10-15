import { normalizeTimeZoneId } from "./time-zone";
import { calendarDateKeyInTimeZone } from "./calendar-day-key";

export const DEFAULT_SCHOOL_TIME_ZONE = "Asia/Kolkata";

export function getIanaTimeZone(raw?: string | null): string {
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    return DEFAULT_SCHOOL_TIME_ZONE;
  }
  return normalizeTimeZoneId(raw);
}

export function getDayKeyFromDate(d: Date = new Date(), timeZone = DEFAULT_SCHOOL_TIME_ZONE): string {
  return calendarDateKeyInTimeZone(d, timeZone);
}
