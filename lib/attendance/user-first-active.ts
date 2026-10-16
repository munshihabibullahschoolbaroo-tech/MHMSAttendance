import { DateTime } from "luxon";

/**
 * Extracts the ISO date key ("YYYY-MM-DD") representing when a user joined or first logged in.
 * Checks firstLoginAt, createdAt, onboardingCompletedAt, or earliest recorded activity date.
 */
export function extractFirstActiveDateKey(
  userData?: Record<string, unknown> | null,
  earliestActivityDate?: string | null,
  zone: string = "Asia/Kolkata"
): string {
  const dates: string[] = [];

  if (earliestActivityDate && /^\d{4}-\d{2}-\d{2}$/.test(earliestActivityDate.trim())) {
    dates.push(earliestActivityDate.trim());
  }

  if (userData) {
    const candidateFields = [
      userData.firstLoginAt,
      userData.firstLoginDate,
      userData.createdAt,
      userData.onboardingCompletedAt,
      userData.joinedAt,
    ];

    for (const val of candidateFields) {
      if (!val) continue;

      if (typeof (val as any).toDate === "function") {
        try {
          const d = (val as any).toDate() as Date;
          const dt = DateTime.fromJSDate(d, { zone });
          if (dt.isValid) dates.push(dt.toISODate()!);
        } catch {}
      } else if (typeof (val as any).toMillis === "function") {
        try {
          const ms = (val as any).toMillis() as number;
          const dt = DateTime.fromMillis(ms, { zone });
          if (dt.isValid) dates.push(dt.toISODate()!);
        } catch {}
      } else if (typeof (val as any).seconds === "number") {
        const ms = (val as any).seconds * 1000;
        const dt = DateTime.fromMillis(ms, { zone });
        if (dt.isValid) dates.push(dt.toISODate()!);
      } else if (typeof (val as any)._seconds === "number") {
        const ms = (val as any)._seconds * 1000;
        const dt = DateTime.fromMillis(ms, { zone });
        if (dt.isValid) dates.push(dt.toISODate()!);
      } else if (val instanceof Date) {
        const dt = DateTime.fromJSDate(val, { zone });
        if (dt.isValid) dates.push(dt.toISODate()!);
      } else if (typeof val === "string") {
        if (/^\d{4}-\d{2}-\d{2}$/.test(val.slice(0, 10))) {
          dates.push(val.slice(0, 10));
        }
      }
    }
  }

  if (dates.length > 0) {
    dates.sort();
    return dates[0]!;
  }

  return DateTime.now().setZone(zone).toISODate()!;
}
