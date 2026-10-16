/**
 * Helper utilities for school morning arrival timing, school hours, and late check-in detection.
 * Supports configurable opening (e.g. 08:00 AM), morning arrival cutoff (e.g. 09:00 AM),
 * and evening closing time (e.g. 05:00 PM).
 */

export function parseTimeMinutes(timeStr?: string | null, fallbackMinutes = 9 * 60): number {
  if (!timeStr || typeof timeStr !== "string") return fallbackMinutes;
  const trimmed = timeStr.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?:\s*([AaPp][Mm]))?$/);
  if (!match) return fallbackMinutes;

  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const modifier = (match[3] || "AM").toUpperCase();

  // 12 AM is midnight (0h), 12 PM is noon (12h)
  if (modifier === "AM" && hour === 12) hour = 0;
  if (modifier === "PM" && hour < 12) hour += 12;

  return hour * 60 + minute;
}

/** Legacy alias for parseTimeMinutes */
export function parseAmTimeMinutes(timeStr?: string | null): number {
  return parseTimeMinutes(timeStr, 9 * 60);
}

export function formatMinutesToAmPm(totalMinutes: number): string {
  const norm = ((totalMinutes % 1440) + 1440) % 1440;
  const hours24 = Math.floor(norm / 60);
  const minutes = norm % 60;
  const h12 = hours24 % 12 || 12;
  const ampm = hours24 >= 12 ? "PM" : "AM";
  return `${String(h12).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${ampm}`;
}

export interface LateCheckResult {
  isBeforeOpen: boolean;
  isLate: boolean;
  isClosed: boolean;
  currentFormatted: string;
  cutoffFormatted: string;
  openWindowStartFormatted: string;
  minutesUntilOpen: number;
  minutesLate: number;
  reason?: "before_open" | "morning_cutoff" | "after_closing";
  openFormatted?: string;
  closeFormatted?: string;
}

/**
 * Checks whether a given Date is within the check-in window (starting 2 hours before opening),
 * past the morning arrival cutoff, or past closing time.
 * Defaults to Asia/Kolkata time zone (Kargil, UT Ladakh).
 *
 * Rules:
 * - Before (Open - 2 hours) (e.g. before 06:00 AM if open is 08:00 AM): Check-in NOT OPEN YET.
 * - (Open - 2 hours) to Cutoff (e.g. 06:00 AM to 09:00 AM): On-time morning check-in!
 * - Cutoff (09:00 AM) to Closing (05:00 PM): Past morning arrival cutoff -> LATE arrival.
 * - After Closing (05:00 PM to 11:59 PM): School is CLOSED for today. Attendance cannot be taken.
 */
export function isPastLateCutoff(
  date: Date = new Date(),
  lateCutoffStr: string = "09:00 AM",
  timeZone: string = "Asia/Kolkata",
  schoolCloseTimeStr: string = "05:00 PM",
  schoolOpenTimeStr: string = "08:00 AM"
): LateCheckResult {
  const openMinutes = parseTimeMinutes(schoolOpenTimeStr, 8 * 60);
  const cutoffMinutes = parseTimeMinutes(lateCutoffStr, 9 * 60);
  const closeMinutes = parseTimeMinutes(schoolCloseTimeStr, 17 * 60);

  // Morning check-in starts strictly 2 hours (120 minutes) before official school opening
  const checkInStartMinutes = Math.max(0, openMinutes - 120);
  const openWindowStartFormatted = formatMinutesToAmPm(checkInStartMinutes);

  let curHour = 0;
  let curMin = 0;
  let currentFormatted = "";

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    }).formatToParts(date);

    for (const p of parts) {
      if (p.type === "hour") curHour = parseInt(p.value, 10);
      if (p.type === "minute") curMin = parseInt(p.value, 10);
    }

    currentFormatted = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  } catch {
    // Fallback to local clock if timezone lookup fails
    curHour = date.getHours();
    curMin = date.getMinutes();
    const h12 = curHour % 12 || 12;
    const ampm = curHour >= 12 ? "PM" : "AM";
    currentFormatted = `${String(h12).padStart(2, "0")}:${String(curMin).padStart(2, "0")} ${ampm}`;
  }

  const currentMinutes = curHour * 60 + curMin;

  let isBeforeOpen = false;
  let isLate = false;
  let isClosed = false;
  let reason: "before_open" | "morning_cutoff" | "after_closing" | undefined;
  let minutesLate = 0;
  let minutesUntilOpen = 0;

  if (currentMinutes < checkInStartMinutes) {
    // Before 2-hour pre-opening window (e.g. 1:10 AM at night before 6:00 AM)
    isBeforeOpen = true;
    reason = "before_open";
    minutesUntilOpen = checkInStartMinutes - currentMinutes;
  } else if (currentMinutes > closeMinutes) {
    // Past evening closing (e.g. after 5:00 PM) - School is officially closed!
    isClosed = true;
    isLate = true;
    reason = "after_closing";
    minutesLate = currentMinutes - cutoffMinutes;
  } else if (currentMinutes > cutoffMinutes) {
    // Past morning arrival cutoff (e.g. 09:00 AM - 05:00 PM)
    isClosed = false;
    isLate = true;
    reason = "morning_cutoff";
    minutesLate = currentMinutes - cutoffMinutes;
  } else {
    // Within valid window: 06:00 AM to 09:00 AM (on-time)
    isBeforeOpen = false;
    isClosed = false;
    isLate = false;
    minutesLate = 0;
  }

  return {
    isBeforeOpen,
    isLate,
    isClosed,
    currentFormatted,
    cutoffFormatted: lateCutoffStr,
    openWindowStartFormatted,
    minutesUntilOpen,
    minutesLate,
    reason,
    openFormatted: schoolOpenTimeStr,
    closeFormatted: schoolCloseTimeStr,
  };
}

/** Pre-defined standard morning opening options for admin settings */
export const STANDARD_AM_OPEN_OPTIONS = [
  "06:30 AM",
  "07:00 AM",
  "07:30 AM",
  "07:45 AM",
  "08:00 AM",
  "08:15 AM",
  "08:30 AM",
  "09:00 AM",
] as const;

/** Pre-defined standard morning late arrival cutoff options for admin settings */
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

/** Pre-defined standard evening closing options for admin settings */
export const STANDARD_PM_CLOSE_OPTIONS = [
  "02:00 PM",
  "02:30 PM",
  "03:00 PM",
  "03:30 PM",
  "04:00 PM",
  "04:30 PM",
  "05:00 PM",
  "05:30 PM",
  "06:00 PM",
  "06:30 PM",
  "07:00 PM",
] as const;

/** Pre-defined standard evening sign-out deadline options for admin settings */
export const STANDARD_PM_SIGNOUT_OPTIONS = [
  "05:00 PM",
  "05:30 PM",
  "06:00 PM",
  "06:30 PM",
  "07:00 PM",
  "07:30 PM",
  "08:00 PM",
  "08:30 PM",
  "09:00 PM",
] as const;

export interface SignOutCheckResult {
  isLateSignOut: boolean;
  minutesLate: number;
  currentFormatted: string;
  signOutDeadlineFormatted: string;
  closeFormatted: string;
}

/**
 * Checks whether the current time is past the official school sign-out deadline (e.g. 07:00 PM).
 * After the deadline, sign-out is classified as "late sign-out" and requires a reason / admin approval.
 */
export function checkSignOutTiming(
  date: Date = new Date(),
  signOutDeadlineStr: string = "07:00 PM",
  timeZone: string = "Asia/Kolkata",
  schoolCloseTimeStr: string = "05:00 PM"
): SignOutCheckResult {
  const deadlineMinutes = parseTimeMinutes(signOutDeadlineStr, 19 * 60);

  let curHour = 0;
  let curMin = 0;
  let currentFormatted = "";

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    }).formatToParts(date);

    for (const p of parts) {
      if (p.type === "hour") curHour = parseInt(p.value, 10);
      if (p.type === "minute") curMin = parseInt(p.value, 10);
    }

    currentFormatted = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  } catch {
    curHour = date.getHours();
    curMin = date.getMinutes();
    const h12 = curHour % 12 || 12;
    const ampm = curHour >= 12 ? "PM" : "AM";
    currentFormatted = `${String(h12).padStart(2, "0")}:${String(curMin).padStart(2, "0")} ${ampm}`;
  }

  const currentMinutes = curHour * 60 + curMin;
  const isLateSignOut = currentMinutes > deadlineMinutes;
  const minutesLate = isLateSignOut ? currentMinutes - deadlineMinutes : 0;

  return {
    isLateSignOut,
    minutesLate,
    currentFormatted,
    signOutDeadlineFormatted: signOutDeadlineStr,
    closeFormatted: schoolCloseTimeStr,
  };
}

