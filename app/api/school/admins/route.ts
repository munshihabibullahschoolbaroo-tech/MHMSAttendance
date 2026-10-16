import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { adminDb } from "@/lib/firebase/admin";
import { jsonError } from "@/lib/api/json-error";
import { normalizeSuperAdminEmail } from "@/lib/auth/super-admin";

export const runtime = "nodejs";

let cachedAdmins: Array<{
  id: string;
  name: string;
  email: string;
  role: "super_admin" | "admin";
}> | null = null;
let cachedAdminsExpiresAt = 0;

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  const now = Date.now();
  if (cachedAdmins && now < cachedAdminsExpiresAt) {
    return NextResponse.json(
      { ok: true, admins: cachedAdmins },
      { headers: { "Cache-Control": "private, max-age=60" } }
    );
  }

  try {
    const db = adminDb();
    const superEmail = normalizeSuperAdminEmail().toLowerCase();

    // 1. Fetch users with role in ["admin", "super_admin"]
    const snap = await db
      .collection("users")
      .where("role", "in", ["admin", "super_admin"])
      .get();

    const seenEmails = new Set<string>();
    const seenIds = new Set<string>();
    const admins: Array<{
      id: string;
      name: string;
      email: string;
      role: "super_admin" | "admin";
    }> = [];

    snap.forEach((doc) => {
      const d = doc.data();
      const email = typeof d.email === "string" ? d.email.trim().toLowerCase() : "";
      if (seenIds.has(doc.id)) return;
      if (email && seenEmails.has(email)) return;

      seenIds.add(doc.id);
      if (email) seenEmails.add(email);

      const isSuper = email === superEmail || d.role === "super_admin";
      const name =
        typeof d.name === "string" && d.name.trim()
          ? d.name.trim()
          : email
          ? email.split("@")[0]!
          : isSuper
          ? "Super Admin"
          : "Administrator";

      admins.push({
        id: doc.id,
        name,
        email: d.email || "",
        role: isSuper ? "super_admin" : "admin",
      });
    });

    // 2. If Super Admin is not in the list yet, find or create their entry
    if (superEmail && !seenEmails.has(superEmail)) {
      const superSnap = await db
        .collection("users")
        .where("email", "==", superEmail)
        .limit(1)
        .get();

      if (!superSnap.empty) {
        const sDoc = superSnap.docs[0]!;
        const sData = sDoc.data();
        seenIds.add(sDoc.id);
        seenEmails.add(superEmail);

        // Ensure role is persisted as super_admin in Firestore
        if (sData.role !== "super_admin") {
          await sDoc.ref.set({ role: "super_admin" }, { merge: true }).catch(() => {});
        }

        const name =
          typeof sData.name === "string" && sData.name.trim()
            ? sData.name.trim()
            : "MHMS Super Admin";

        admins.push({
          id: sDoc.id,
          name,
          email: sData.email || superEmail,
          role: "super_admin",
        });
      } else {
        admins.push({
          id: "super_admin_account",
          name: "Super Admin (MHMS)",
          email: superEmail,
          role: "super_admin",
        });
      }
    }

    // Sort: Super Admin(s) first, then regular Admins sorted alphabetically
    admins.sort((a, b) => {
      if (a.role === "super_admin" && b.role !== "super_admin") return -1;
      if (b.role === "super_admin" && a.role !== "super_admin") return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    cachedAdmins = admins;
    cachedAdminsExpiresAt = Date.now() + 60_000;

    return NextResponse.json(
      { ok: true, admins },
      { headers: { "Cache-Control": "private, max-age=60" } }
    );
  } catch (e: any) {
    console.error("[api/school/admins] Error:", e);
    return jsonError("Failed to fetch school administrators", 500);
  }
}
