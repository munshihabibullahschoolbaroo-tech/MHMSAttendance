import { NextResponse } from "next/server";
import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { isRequestAdmin } from "@/lib/auth/require-admin";
import { isSuperAdminUserRow } from "@/lib/auth/super-admin";
import { jsonError } from "@/lib/api/json-error";

export const runtime = "nodejs";

function getTimestampMillis(c: unknown): number {
  if (c instanceof Timestamp) return c.toMillis();
  if (c && typeof c === "object" && "_seconds" in (c as Record<string, unknown>)) {
    return Number((c as { _seconds: number })._seconds) * 1000;
  }
  if (typeof c === "number") return c;
  return 0;
}

export type AdminNotificationItem = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  isAdmin: boolean;
  title: string;
  body: string;
  kind: string;
  read: boolean;
  createdAtIso: string;
  createdAtMs: number;
};

/**
 * GET /api/admin/notifications
 * Lists notifications with admin categorization, stats, and filtering options.
 */
export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  if (!(await isRequestAdmin(auth.decoded))) {
    return jsonError("Forbidden", 403);
  }

  try {
    const db = adminDb();
    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") || "all_without_admin";
    const targetUserId = url.searchParams.get("userId") || "";
    const searchQuery = (url.searchParams.get("q") || "").trim().toLowerCase();

    // 1. Fetch all users to identify admin accounts
    const usersSnap = await db.collection("users").get();
    const userMap = new Map<
      string,
      { name: string; email: string; role: string; isAdmin: boolean; designation?: string }
    >();
    const adminUserIds = new Set<string>();

    for (const doc of usersSnap.docs) {
      const data = doc.data();
      const role = String(data.role ?? "employee");
      const email = String(data.email ?? "").trim().toLowerCase();
      const isAdmin = role === "admin" || role === "super_admin" || isSuperAdminUserRow(email, role);
      if (isAdmin) adminUserIds.add(doc.id);

      userMap.set(doc.id, {
        name: String(data.name || data.displayName || email || "Unknown User"),
        email,
        role,
        isAdmin,
        designation: data.designation ? String(data.designation) : undefined,
      });
    }

    // 2. Fetch notifications
    const notifSnap = await db.collection("notifications").limit(800).get();

    let totalCount = 0;
    let withoutAdminCount = 0;
    let adminOnlyCount = 0;

    const allItems: AdminNotificationItem[] = [];

    for (const doc of notifSnap.docs) {
      const data = doc.data();
      const uid = String(data.userId || data.toUid || "");
      const uInfo = userMap.get(uid);

      const isAdmin = adminUserIds.has(uid) || (uInfo?.isAdmin ?? false);
      const createdAtMs = getTimestampMillis(data.createdAt);

      totalCount++;
      if (isAdmin) {
        adminOnlyCount++;
      } else {
        withoutAdminCount++;
      }

      allItems.push({
        id: doc.id,
        userId: uid,
        userName: uInfo?.name || "Unknown Staff",
        userEmail: uInfo?.email || "",
        userRole: uInfo?.role || (isAdmin ? "admin" : "employee"),
        isAdmin,
        title: String(data.title || "Notification"),
        body: String(data.body || ""),
        kind: String(data.kind || "system"),
        read: Boolean(data.read),
        createdAtIso: createdAtMs ? new Date(createdAtMs).toISOString() : new Date().toISOString(),
        createdAtMs,
      });
    }

    // Sort newest first
    allItems.sort((a, b) => b.createdAtMs - a.createdAtMs);

    // 3. Filter by scope
    let filtered = allItems;
    if (scope === "all_without_admin") {
      filtered = allItems.filter((i) => !i.isAdmin);
    } else if (scope === "individual" && targetUserId) {
      filtered = allItems.filter((i) => i.userId === targetUserId);
    }
    // "all_with_admin" keeps all items

    // 4. Filter by optional search query
    if (searchQuery) {
      filtered = filtered.filter(
        (i) =>
          i.title.toLowerCase().includes(searchQuery) ||
          i.body.toLowerCase().includes(searchQuery) ||
          i.userName.toLowerCase().includes(searchQuery) ||
          i.userEmail.toLowerCase().includes(searchQuery) ||
          i.kind.toLowerCase().includes(searchQuery)
      );
    }

    return NextResponse.json({
      items: filtered,
      stats: {
        total: totalCount,
        withoutAdmin: withoutAdminCount,
        withAdmin: totalCount,
        adminOnly: adminOnlyCount,
      },
    });
  } catch (err) {
    console.error("[api/admin/notifications GET] error:", err);
    return jsonError("Failed to fetch notifications", 500);
  }
}

const deleteBodySchema = z.object({
  scope: z.enum(["all_without_admin", "all_with_admin", "individual", "selected_ids"]),
  userId: z.string().optional(),
  ids: z.array(z.string().min(1)).optional(),
});

/**
 * DELETE /api/admin/notifications
 * Prunes notifications by scope:
 * - "all_without_admin": deletes all notifications for staff/teachers, preserving admins
 * - "all_with_admin": deletes all notifications across the school
 * - "individual": deletes notifications for a specific user
 * - "selected_ids": deletes specific notification IDs
 */
export async function DELETE(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  if (!(await isRequestAdmin(auth.decoded))) {
    return jsonError("Forbidden", 403);
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = deleteBodySchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid deletion parameters", 400);
  }

  const { scope, userId: targetUserId, ids: targetIds } = parsed.data;
  const db = adminDb();

  try {
    let docRefsToDelete: FirebaseFirestore.DocumentReference[] = [];

    if (scope === "selected_ids") {
      if (!targetIds || targetIds.length === 0) {
        return jsonError("No notification IDs provided", 400);
      }
      docRefsToDelete = targetIds.map((id) => db.collection("notifications").doc(id));
    } else if (scope === "individual") {
      if (!targetUserId) {
        return jsonError("userId is required for individual deletion", 400);
      }
      const [snap1, snap2] = await Promise.all([
        db.collection("notifications").where("userId", "==", targetUserId).get(),
        db.collection("notifications").where("toUid", "==", targetUserId).get(),
      ]);
      const seen = new Set<string>();
      for (const d of [...snap1.docs, ...snap2.docs]) {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          docRefsToDelete.push(d.ref);
        }
      }
    } else if (scope === "all_with_admin") {
      const snap = await db.collection("notifications").get();
      docRefsToDelete = snap.docs.map((d) => d.ref);
    } else if (scope === "all_without_admin") {
      // Find all admin IDs
      const usersSnap = await db.collection("users").get();
      const adminUserIds = new Set<string>();
      for (const doc of usersSnap.docs) {
        const data = doc.data();
        const role = String(data.role ?? "employee");
        const email = String(data.email ?? "").trim().toLowerCase();
        if (role === "admin" || role === "super_admin" || isSuperAdminUserRow(email, role)) {
          adminUserIds.add(doc.id);
        }
      }

      const notifSnap = await db.collection("notifications").get();
      for (const doc of notifSnap.docs) {
        const uid = String(doc.get("userId") || doc.get("toUid") || "");
        if (!adminUserIds.has(uid)) {
          docRefsToDelete.push(doc.ref);
        }
      }
    }

    if (docRefsToDelete.length === 0) {
      return NextResponse.json({ ok: true, deletedCount: 0 });
    }

    // Execute deletion in chunks of 400 (Firestore limit is 500)
    const chunkSize = 400;
    for (let i = 0; i < docRefsToDelete.length; i += chunkSize) {
      const batch = db.batch();
      for (const ref of docRefsToDelete.slice(i, i + chunkSize)) {
        batch.delete(ref);
      }
      await batch.commit();
    }

    return NextResponse.json({
      ok: true,
      deletedCount: docRefsToDelete.length,
      scope,
    });
  } catch (err) {
    console.error("[api/admin/notifications DELETE] error:", err);
    return jsonError("Failed to delete notifications", 500);
  }
}
