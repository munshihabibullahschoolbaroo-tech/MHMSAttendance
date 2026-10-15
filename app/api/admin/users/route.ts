import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { isRequestAdmin } from "@/lib/auth/require-admin";
import { isSuperAdminDecoded, isSuperAdminUserRow } from "@/lib/auth/super-admin";
import { normalizeTimeZoneId } from "@/lib/date/time-zone";
import { DEFAULT_SCHOOL_TIME_ZONE, getDayKeyFromDate } from "@/lib/date/timezone";
import { claimEmployeeId } from "@/lib/employee-id/allocator";

export const runtime = "nodejs";

// In-memory cache for the full users list — 2 min TTL
const CACHE_TTL_MS = 2 * 60_000;
let usersCache: { users: unknown[]; expiresAt: number } | null = null;

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const decoded = auth.decoded;

  if (!(await isRequestAdmin(decoded))) {
    return jsonError("Forbidden", 403);
  }

  const skipCache = new URL(req.url).searchParams.get("fresh") === "1";

  if (!skipCache && usersCache && usersCache.expiresAt > Date.now()) {
    const isSuperAdmin = isSuperAdminDecoded(decoded);
    const users = isSuperAdmin
      ? usersCache.users
      : (usersCache.users as Array<{ email: string; role: string }>).filter(
          (u) => !isSuperAdminUserRow(u.email, u.role)
        );
    return NextResponse.json({ users });
  }

  try {
    const db = adminDb();
    // Use school timezone (Asia/Kolkata) so IST midnight changes today date accurately
    const todayIso = getDayKeyFromDate(new Date(), DEFAULT_SCHOOL_TIME_ZONE);
    const [snap, pendingLeavesSnap, approvedLeavesSnap] = await Promise.all([
      db.collection("users").get(),
      db.collection("leaveRequests").where("status", "==", "pending").get().catch(() => ({ docs: [] })),
      db.collection("leaveRequests").where("status", "==", "approved").get().catch(() => ({ docs: [] })),
    ]);

    const pendingLeaveMap = new Map<string, any>();
    pendingLeavesSnap.docs.forEach((doc: any) => {
      const tId = doc.get("teacherId");
      if (tId) {
        pendingLeaveMap.set(tId, {
          id: doc.id,
          ...doc.data(),
        });
      }
    });

    const onLeaveTeacherMap = new Map<string, any>();
    approvedLeavesSnap.docs.forEach((doc: any) => {
      const tId = doc.get("teacherId");
      const start = String(doc.get("startDate") ?? "");
      const end = String(doc.get("endDate") ?? start);
      if (todayIso >= start && todayIso <= end && tId) {
        onLeaveTeacherMap.set(tId, {
          id: doc.id,
          ...doc.data(),
        });
      }
    });

    const usersRaw = await Promise.all(
      snap.docs.map(async (d: any) => {
        const data = d.data();
        const role = typeof data.role === "string" ? data.role : "employee";
        let employeeId = typeof data.employeeId === "string" ? data.employeeId.trim() : "";
        // Backfill missing employee IDs for legacy employee accounts.
        if (role === "employee" && !employeeId) {
          employeeId = await claimEmployeeId(db);
          await d.ref.set({ employeeId }, { merge: true });
        }
        const ws = data.workspaceAccessStatus;
        const workspaceAccessStatus =
          ws === "pending" || ws === "approved" || ws === "rejected" ? ws : undefined;
        return {
          id: d.id,
          employeeId,
          name: typeof data.name === "string" ? data.name : "",
          email: typeof data.email === "string" ? data.email : "",
          role,
          phone: typeof data.phone === "string" ? data.phone : null,
          schoolWingId: typeof data.schoolWingId === "string" ? data.schoolWingId : null,
          position: typeof data.position === "string" ? data.position : null,
          designation: typeof data.designation === "string" ? data.designation : null,
          isClassTeacher: Boolean(data.isClassTeacher),
          schoolClassId: typeof data.schoolClassId === "string" ? data.schoolClassId : null,
          schoolSectionId: typeof data.schoolSectionId === "string" ? data.schoolSectionId : null,
          hasPendingLeave: pendingLeaveMap.has(d.id),
          pendingLeave: pendingLeaveMap.get(d.id) ?? null,
          onLeaveToday: onLeaveTeacherMap.has(d.id),
          todayLeaveType: onLeaveTeacherMap.get(d.id)?.type ?? null,
          activeLeave: onLeaveTeacherMap.get(d.id) ?? null,
          assignedSites: Array.isArray(data.assignedSites) ? data.assignedSites : [],
          timeZone: normalizeTimeZoneId(
            typeof data.timeZone === "string" ? data.timeZone : undefined
          ),
          onboardingCompletedAt: data.onboardingCompletedAt
            ? typeof data.onboardingCompletedAt.toDate === "function"
              ? data.onboardingCompletedAt.toDate().toISOString()
              : String(data.onboardingCompletedAt)
            : null,
          createdAt: data.createdAt
            ? typeof data.createdAt.toDate === "function"
              ? data.createdAt.toDate().toISOString()
              : String(data.createdAt)
            : null,
          ...(workspaceAccessStatus ? { workspaceAccessStatus } : {}),
        };
      })
    );

    const allUsers = usersRaw.map((d: any) => ({ ...d }));
    allUsers.sort((a: any, b: any) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

    // Store full list in cache; filter per-request based on caller's role
    usersCache = { users: allUsers, expiresAt: Date.now() + CACHE_TTL_MS };

    const users = isSuperAdminDecoded(decoded)
      ? allUsers
      : allUsers.filter((u: any) => !isSuperAdminUserRow(u.email, u.role));

    return NextResponse.json({ users });
  } catch {
    // Quota exceeded or Firestore unavailable — serve stale cache if available
    const stale = usersCache;
    if (stale) {
      const isSuperAdmin = isSuperAdminDecoded(decoded);
      const users = isSuperAdmin
        ? stale.users
        : (stale.users as Array<{ email: string; role: string }>).filter(
            (u) => !isSuperAdminUserRow(u.email, u.role)
          );
      return NextResponse.json({ users });
    }
    return jsonError("Service temporarily unavailable, please try again shortly", 503);
  }
}
