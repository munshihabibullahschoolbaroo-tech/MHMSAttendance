import { adminDb } from "@/lib/firebase/admin";
import { jsonError } from "@/lib/api/json-error";

import { normalizeSuperAdminEmail } from "@/lib/auth/super-admin";

/** Returns null if the user is admin or super_admin (or super-admin email bypass). */
export async function assertAdmin(
  uid: string,
  email: string | undefined
): Promise<Response | null> {
  const superEmail = normalizeSuperAdminEmail();
  if (email && email.trim().toLowerCase() === superEmail) return null;

  const db = adminDb();
  const snap = await db.collection("users").doc(uid).get();
  const role = snap.get("role") as string | undefined;
  if (role === "admin" || role === "super_admin") return null;
  return jsonError("Forbidden", 403);
}
