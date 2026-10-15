/** Must match the email you set in Firestore rules for super admin. */
export const APP_NAME = "MHMSAttendance";

/** Shown under the wordmark. */
export const APP_VENDOR = "Bemathang, Kargil";

/** MHMS wordmark colors: brown in light, yellow in dark. */
export const BRAND_MHMS_BROWN = "#7A3818";
export const BRAND_MHMS_YELLOW = "#FBBF24";
export const BRAND_MTES_BLUE = "#2A3B8F";

export const DEFAULT_SUPER_ADMIN_EMAIL = "munshihabibullahschoolbaroo@gmail.com";

export function getSuperAdminEmail(): string {
  return (
    process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL?.trim().toLowerCase() ||
    DEFAULT_SUPER_ADMIN_EMAIL
  );
}

