import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { isRequestAdmin } from "@/lib/auth/require-admin";
import { isSuperAdminDecoded, isSuperAdminUserRow } from "@/lib/auth/super-admin";
import { normalizeTimeZoneId } from "@/lib/date/time-zone";
import { DEFAULT_SCHOOL_TIME_ZONE, getDayKeyFromDate } from "@/lib/date/timezone";
import { claimEmployeeId } from "@/lib/employee-id/allocator";

import { getUsersCache, setUsersCache } from "@/lib/server/users-cache";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const decoded = auth.decoded;

  if (!(await isRequestAdmin(decoded))) {
    return jsonError("Forbidden", 403);
  }

  const skipCache = new URL(req.url).searchParams.get("fresh") === "1";
  const cachedUsers = getUsersCache();

  if (!skipCache && cachedUsers) {
    const isSuperAdmin = isSuperAdminDecoded(decoded);
    const users = isSuperAdmin
      ? cachedUsers
      : (cachedUsers as Array<{ email: string; role: string }>).filter(
          (u) => !isSuperAdminUserRow(u.email, u.role)
        );
    return NextResponse.json(
      { users },
      { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=120" } }
    );
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
        let name = typeof data.name === "string" ? data.name.trim() : "";
        let email = typeof data.email === "string" ? data.email.trim() : "";

        // If doc has no name and no email, attempt to recover from Firebase Auth
        if (!name && !email) {
          try {
            const authRecord = await adminAuth().getUser(d.id);
            if (authRecord?.email) {
              email = authRecord.email;
              name = authRecord.displayName?.trim() || email.split("@")[0] || "Staff Member";
              await d.ref.set({ email, name }, { merge: true });
            }
          } catch {
            // No Firebase Auth record exists for this ID; delete the orphaned doc
            await d.ref.delete().catch(() => {});
            return null;
          }
        }

        // If still completely nameless and email-less, do not display ghost user
        if (!name && !email) {
          return null;
        }

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
          name,
          email,
          photoUrl: typeof data.photoUrl === "string" ? data.photoUrl : null,
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

    const allUsers = usersRaw
      .filter((u): u is NonNullable<typeof u> => Boolean(u && (u.email || u.name)))
      .map((d: any) => ({ ...d }));
    allUsers.sort((a: any, b: any) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

    // Store full list in cache; filter per-request based on caller's role
    setUsersCache(allUsers);

    const users = isSuperAdminDecoded(decoded)
      ? allUsers
      : allUsers.filter((u: any) => !isSuperAdminUserRow(u.email, u.role));

    return NextResponse.json(
      { users },
      { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=120" } }
    );
  } catch {
    // Quota exceeded or Firestore unavailable — serve stale cache if available
    const stale = getUsersCache();
    if (stale) {
      const isSuperAdmin = isSuperAdminDecoded(decoded);
      const users = isSuperAdmin
        ? stale
        : (stale as Array<{ email: string; role: string }>).filter(
            (u) => !isSuperAdminUserRow(u.email, u.role)
          );
      return NextResponse.json({ users });
    }
    return jsonError("Service temporarily unavailable, please try again shortly", 503);
  }
}
