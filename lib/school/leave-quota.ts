/**
 * Shared Leave Quota Calculation with Rollover / Carry-Forward.
 *
 * Rules:
 * - Teachers/employees receive 2 regular casual leave days each calendar month.
 * - If a teacher does not use their casual leaves in prior month(s) of the calendar year,
 *   the unused days roll over and accumulate into subsequent months.
 */

export type CasualLeaveQuota = {
  year: number;
  month: number;
  usedThisMonth: number;
  usedPriorMonths: number;
  earnedPriorMonths: number;
  carriedForward: number;
  monthlyRegularQuota: number;
  maxCasualLeavesAllowed: number;
  remainingCasualLeaves: number;
  firstActiveDateKey?: string | null;
};

export function calculateCasualLeaveQuota(
  targetDateKey: string, // "YYYY-MM-DD" or "YYYY-MM"
  approvedOrPendingCasualDates: Iterable<string>,
  firstActiveDateKey?: string | null // "YYYY-MM-DD" or "YYYY-MM" or ISO string
): CasualLeaveQuota {
  const parts = targetDateKey.split("-");
  const year = parseInt(parts[0] || "2026", 10);
  const currentMonth = parseInt(parts[1] || "1", 10); // 1 to 12

  // Determine user's starting year and month on platform
  let joinYear = year;
  let joinMonth = currentMonth;

  if (firstActiveDateKey) {
    const raw = firstActiveDateKey.slice(0, 10);
    const m = raw.match(/^(\d{4})-(\d{2})/);
    if (m) {
      joinYear = parseInt(m[1]!, 10);
      joinMonth = parseInt(m[2]!, 10);
    }
  }

  const yyyyPrefix = `${parts[0]}-`;

  let usedPriorMonths = 0;
  let usedThisMonth = 0;

  for (const dateStr of approvedOrPendingCasualDates) {
    if (!dateStr.startsWith(yyyyPrefix)) continue; // Different calendar year
    const dMonth = parseInt(dateStr.slice(5, 7), 10);
    if (dMonth < currentMonth) {
      usedPriorMonths++;
    } else if (dMonth === currentMonth) {
      usedThisMonth++;
    }
  }

  // Calculate prior months earned IN THIS YEAR since user joined platform
  let earnedPriorMonths = 0;
  if (year < joinYear) {
    earnedPriorMonths = 0;
  } else if (year === joinYear) {
    if (currentMonth < joinMonth) {
      earnedPriorMonths = 0;
    } else {
      earnedPriorMonths = Math.max(0, currentMonth - joinMonth) * 2;
    }
  } else {
    // Subsequent calendar year: user active for all elapsed months of this year
    earnedPriorMonths = (currentMonth - 1) * 2;
  }

  const carriedForward = Math.max(0, earnedPriorMonths - usedPriorMonths);
  const monthlyRegularQuota =
    year < joinYear || (year === joinYear && currentMonth < joinMonth) ? 0 : 2;
  const maxCasualLeavesAllowed = monthlyRegularQuota + carriedForward;
  const remainingCasualLeaves = Math.max(0, maxCasualLeavesAllowed - usedThisMonth);

  return {
    year,
    month: currentMonth,
    usedThisMonth,
    usedPriorMonths,
    earnedPriorMonths,
    carriedForward,
    monthlyRegularQuota,
    maxCasualLeavesAllowed,
    remainingCasualLeaves,
    firstActiveDateKey: firstActiveDateKey ?? null,
  };
}
