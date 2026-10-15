import type { DecodedIdToken } from "firebase-admin/auth";
import { adminDb } from "@/lib/firebase/admin";

import { normalizeSuperAdminEmail } from "@/lib/auth/super-admin";

export async function isRequestAdmin(decoded: DecodedIdToken): Promise<boolean> {
  const superEmail = normalizeSuperAdminEmail();
  if (decoded.email && decoded.email.trim().toLowerCase() === superEmail) return true;

  const snap = await adminDb().collection("users").doc(decoded.uid).get();
  const role = snap.get("role") as string | undefined;
  return role === "admin" || role === "super_admin";
}
