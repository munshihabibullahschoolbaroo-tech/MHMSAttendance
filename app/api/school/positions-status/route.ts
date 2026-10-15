import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

/** GET /api/school/positions-status - Counts existing assigned capped positions */
export async function GET() {
  try {
    const db = adminDb();
    const usersSnap = await db.collection("users").get();

    let principalCount = 0;
    let vicePrincipalCount = 0;
    let inchargeCount = 0;

    usersSnap.forEach((doc) => {
      const pos = String(doc.get("position") ?? "").toLowerCase().trim();
      if (pos === "principal") principalCount++;
      if (pos === "vice_principal" || pos === "vice principal") vicePrincipalCount++;
      if (pos === "incharge") inchargeCount++;
    });

    return NextResponse.json({
      principalTaken: principalCount >= 1,
      vicePrincipalCount,
      vicePrincipalFull: vicePrincipalCount >= 2,
      inchargeTaken: inchargeCount >= 1,
    });
  } catch (e) {
    return NextResponse.json({
      principalTaken: false,
      vicePrincipalCount: 0,
      vicePrincipalFull: false,
      inchargeTaken: false,
    });
  }
}
