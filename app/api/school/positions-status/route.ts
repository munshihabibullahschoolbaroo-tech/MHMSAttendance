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
    const assignedClasses: Array<{
      classId: string;
      sectionId: string;
      rawSectionId?: string;
      wingId?: string;
      teacherName?: string;
      teacherId: string;
    }> = [];

    usersSnap.forEach((doc) => {
      const pos = String(doc.get("position") ?? "").toLowerCase().trim();
      if (pos === "principal") principalCount++;
      if (pos === "vice_principal" || pos === "vice principal") vicePrincipalCount++;
      if (pos === "incharge") inchargeCount++;

      const isClassTeacher = doc.get("isClassTeacher") === true;
      const schoolClassId = doc.get("schoolClassId");
      const schoolSectionId = doc.get("schoolSectionId");
      if (
        isClassTeacher &&
        typeof schoolClassId === "string" &&
        schoolClassId.trim()
      ) {
        const rawSec =
          typeof schoolSectionId === "string" && schoolSectionId.trim()
            ? schoolSectionId.trim()
            : "Section A";
        const cleanSec = rawSec.replace(/^section\s+/i, "");
        const normalizedSec = `Section ${cleanSec}`;
        assignedClasses.push({
          classId: schoolClassId.trim(),
          sectionId: normalizedSec,
          rawSectionId: rawSec,
          wingId: typeof doc.get("schoolWingId") === "string" ? doc.get("schoolWingId") : undefined,
          teacherName: typeof doc.get("name") === "string" ? doc.get("name") : "Teacher",
          teacherId: doc.id,
        });
      }
    });

    return NextResponse.json({
      principalTaken: principalCount >= 1,
      vicePrincipalCount,
      vicePrincipalFull: vicePrincipalCount >= 2,
      inchargeTaken: inchargeCount >= 1,
      assignedClasses,
    });
  } catch (e) {
    return NextResponse.json({
      principalTaken: false,
      vicePrincipalCount: 0,
      vicePrincipalFull: false,
      inchargeTaken: false,
      assignedClasses: [],
    });
  }
}
