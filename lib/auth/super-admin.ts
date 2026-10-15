import type { DecodedIdToken } from "firebase-admin/auth";

export const DEFAULT_SUPER_ADMIN_EMAIL = "munshihabibullahschoolbaroo@gmail.com";

/** Server: `SUPER_ADMIN_EMAIL` env (lowercase), falling back to school super admin email. */
export function normalizeSuperAdminEmail(): string {
  const e = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  return e || DEFAULT_SUPER_ADMIN_EMAIL;
}

/** True when the signed-in user is the designated super admin (by email). */
export function isSuperAdminDecoded(decoded: {
  email?: string | null;
}): boolean {
  const s = normalizeSuperAdminEmail();
  if (!s || !decoded.email) return false;
  return decoded.email.trim().toLowerCase() === s;
}

export function isSuperAdminToken(decoded: DecodedIdToken): boolean {
  return isSuperAdminDecoded(decoded);
}

/** Hide this user row from non–super-admin viewers (Workers list, etc.). */
export function isSuperAdminUserRow(email: string, role: string): boolean {
  const s = normalizeSuperAdminEmail();
  if (role === "super_admin") return true;
  if (s && email.trim().toLowerCase() === s) return true;
  return false;
}
