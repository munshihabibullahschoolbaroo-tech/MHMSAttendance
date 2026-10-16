/**
 * Helper utilities for school morning arrival timing and late check-in detection.
 * Strictly operates on AM school arrival hours.
 */

export function parseAmTimeMinutes(timeStr?: string | null): number {
  if (!timeStr || typeof timeStr !== "string") return 9 * 60; // Default 09:00 AM
  const trimmed = timeStr.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?:\s*([AaPp][Mm]))?$/);
  if (!match) return 9 * 60;

  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const modifier = (match[3] || "AM").toUpperCase();

  // AM rules: 12 AM is midnight (0h), 1-11 AM is standard
  if (modifier === "AM" && hour === 12) hour = 0;
  if (modifier === "PM" && hour < 12) hour += 12;

  return hour * 60 + minute;
}

export interface LateCheckResult {
  isLate: boolean;
  currentFormatted: string;
  cutoffFormatted: string;
  minutesLate: number;
}

/**
 * Checks whether a given Date is past the school arrival cutoff time.
 * Defaults to Asia/Kolkata time zone (Kargil, UT Ladakh).
 */
export function isPastLateCutoff(
  date: Date = new Date(),
  lateCutoffStr: string = "09:00 AM",
  timeZone: string = "Asia/Kolkata"
): LateCheckResult {
  const cutoffMinutes = parseAmTimeMinutes(lateCutoffStr);

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    }).formatToParts(date);

    let curHour = 0;
    let curMin = 0;
    for (const p of parts) {
      if (p.type === "hour") curHour = parseInt(p.value, 10);
      if (p.type === "minute") curMin = parseInt(p.value, 10);
    }

    const currentMinutes = curHour * 60 + curMin;
    const isLate = currentMinutes > cutoffMinutes;
    const minutesLate = isLate ? currentMinutes - cutoffMinutes : 0;

    const currentFormatted = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(date);

    return {
      isLate,
      currentFormatted,
      cutoffFormatted: lateCutoffStr,
      minutesLate,
    };
  } catch (err) {
    // Fallback to local clock if timezone fails
    const localHour = date.getHours();
    const localMin = date.getMinutes();
    const currentMinutes = localHour * 60 + localMin;
    const isLate = currentMinutes > cutoffMinutes;
    const minutesLate = isLate ? currentMinutes - cutoffMinutes : 0;

    const h12 = localHour % 12 || 12;
    const ampm = localHour >= 12 ? "PM" : "AM";
    const currentFormatted = `${String(h12).padStart(2, "0")}:${String(localMin).padStart(2, "0")} ${ampm}`;

    return {
      isLate,
      currentFormatted,
      cutoffFormatted: lateCutoffStr,
      minutesLate,
    };
  }
}

/** Pre-defined standard morning AM options for admin settings */
export const STANDARD_AM_CUTOFF_OPTIONS = [
  "07:30 AM",
  "07:45 AM",
  "08:00 AM",
  "08:15 AM",
  "08:30 AM",
  "08:45 AM",
  "09:00 AM",
  "09:15 AM",
  "09:30 AM",
  "09:45 AM",
  "10:00 AM",
  "10:15 AM",
  "10:30 AM",
  "10:45 AM",
  "11:00 AM",
  "11:30 AM",
] as const;
