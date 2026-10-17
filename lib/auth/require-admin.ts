import type { DecodedIdToken } from "firebase-admin/auth";
import { adminDb } from "@/lib/firebase/admin";
import { normalizeSuperAdminEmail } from "@/lib/auth/super-admin";

const adminCheckCache = new Map<string, { isAdmin: boolean; expiresAt: number }>();

export function invalidateAdminCache(uid?: string) {
  if (uid) {
    adminCheckCache.delete(uid);
  } else {
    adminCheckCache.clear();
  }
}

export async function isRequestAdmin(decoded: DecodedIdToken): Promise<boolean> {
  const superEmail = normalizeSuperAdminEmail();
  if (decoded.email && decoded.email.trim().toLowerCase() === superEmail) return true;

  const now = Date.now();
  const cached = adminCheckCache.get(decoded.uid);
  if (cached && now < cached.expiresAt) {
    return cached.isAdmin;
  }

  const snap = await adminDb().collection("users").doc(decoded.uid).get();
  const role = snap.get("role") as string | undefined;
  const isAdmin = role === "admin" || role === "super_admin";

  adminCheckCache.set(decoded.uid, { isAdmin, expiresAt: now + 60_000 });
  return isAdmin;
}
