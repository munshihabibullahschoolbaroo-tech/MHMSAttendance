import type { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/json-error";
import { adminAuth, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import type { DecodedIdToken } from "firebase-admin/auth";

export async function verifyIdTokenFromRequest(
  req: Request
): Promise<
  | { ok: true; decoded: DecodedIdToken }
  | { ok: false; error: string; status: number }
> {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) {
    return { ok: false, error: "Missing Bearer authorization header.", status: 401 };
  }
  const token = h.slice(7).trim();
  if (!token) {
    return { ok: false, error: "Empty authorization token.", status: 401 };
  }

  try {
    const decoded = await adminAuth().verifyIdToken(token);
    return { ok: true, decoded };
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    if (process.env.NODE_ENV === "development") {
      console.warn("[verifyIdTokenFromRequest]", errMsg);
    }

    // Inspect if project mismatch between client token and server service account
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1]!, "base64").toString("utf8"));
        const tokenAud = payload.aud;
        const currentServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        let serviceAccountProj = "";
        if (currentServiceAccount) {
          try {
            serviceAccountProj = JSON.parse(currentServiceAccount).project_id || "";
          } catch {
            /* ignore */
          }
        }
        if (tokenAud && serviceAccountProj && tokenAud !== serviceAccountProj) {
          return {
            ok: false,
            error: `Firebase Project Mismatch: Your browser signed in to project "${tokenAud}", but the server's FIREBASE_SERVICE_ACCOUNT_KEY in .env.local is configured for "${serviceAccountProj}". Please update FIREBASE_SERVICE_ACCOUNT_KEY with the service account from project "${tokenAud}" (Firebase Console → Project Settings → Service Accounts → Generate new private key).`,
            status: 401,
          };
        }
      }
    } catch {
      /* ignore parse error */
    }

    return {
      ok: false,
      error: `Unauthorized — ${errMsg || "invalid or expired session. Sign out and sign in again."}`,
      status: 401,
    };
  }
}

/**
 * Verifies the caller’s Firebase ID token. Returns **503** if Firebase Admin is not configured
 * (so token verification is impossible — often misread as “Unauthorized”).
 */
export async function requireBearerUser(
  req: Request
): Promise<
  | { ok: true; decoded: DecodedIdToken }
  | { ok: false; response: NextResponse }
> {
  if (!isFirebaseAdminConfigured()) {
    return {
      ok: false,
      response: jsonError(
        "Server configuration: Firebase Admin is not set (missing service account). Add FIREBASE_SERVICE_ACCOUNT_KEY (one-line JSON), FIREBASE_SERVICE_ACCOUNT_KEY_FILE, or GOOGLE_APPLICATION_CREDENTIALS — the server cannot verify your login without it.",
        503
      ),
    };
  }
  const result = await verifyIdTokenFromRequest(req);
  if (!result.ok) {
    return {
      ok: false,
      response: jsonError(result.error, result.status),
    };
  }
  return { ok: true, decoded: result.decoded };
}

