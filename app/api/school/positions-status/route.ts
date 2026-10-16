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

      // 2. Pending Class Assignment Request on user document
      const pendingAssignment = doc.get("pendingClassAssignment");
      if (
        pendingAssignment &&
        pendingAssignment.status === "pending" &&
        typeof pendingAssignment.classId === "string" &&
        pendingAssignment.classId.trim()
      ) {
        const rawSec =
          typeof pendingAssignment.sectionId === "string" && pendingAssignment.sectionId.trim()
            ? pendingAssignment.sectionId.trim()
            : "Section A";
        const cleanSec = rawSec.replace(/^section\s+/i, "");
        const normalizedSec = `Section ${cleanSec}`;
        const alreadyIn = assignedClasses.some(
          (a) =>
            a.classId.toLowerCase() === pendingAssignment.classId.trim().toLowerCase() &&
            a.sectionId.toLowerCase() === normalizedSec.toLowerCase()
        );
        if (!alreadyIn) {
          assignedClasses.push({
            classId: pendingAssignment.classId.trim(),
            sectionId: normalizedSec,
            rawSectionId: rawSec,
            wingId: typeof pendingAssignment.wingId === "string" ? pendingAssignment.wingId : undefined,
            teacherName: typeof doc.get("name") === "string" ? doc.get("name") : "Teacher",
            teacherId: doc.id,
          });
        }
      }
    });

    // 3. Pending requests in classAssignmentRequests collection
    try {
      const pendingReqsSnap = await db
        .collection("classAssignmentRequests")
        .where("status", "==", "pending")
        .get();

      pendingReqsSnap.forEach((d) => {
        const data = d.data();
        const c = typeof data.requestedClass === "string" ? data.requestedClass.trim() : "";
        const rawSec = typeof data.requestedSection === "string" ? data.requestedSection.trim() : "Section A";
        if (c) {
          const cleanSec = rawSec.replace(/^section\s+/i, "");
          const normalizedSec = `Section ${cleanSec}`;
          const alreadyIn = assignedClasses.some(
            (a) => a.classId.toLowerCase() === c.toLowerCase() && a.sectionId.toLowerCase() === normalizedSec.toLowerCase()
          );
          if (!alreadyIn) {
            assignedClasses.push({
              classId: c,
              sectionId: normalizedSec,
              rawSectionId: rawSec,
              wingId: data.wingId,
              teacherName: data.teacherName || "Teacher",
              teacherId: data.teacherId || d.id,
            });
          }
        }
      });
    } catch {
      /* ignore */
    }

    // 4. Pending & approved class switch requests for today
    try {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const switchesSnap = await db
        .collection("classSwitchRequests")
        .where("date", "==", todayStr)
        .where("status", "in", ["pending", "approved"])
        .get();

      switchesSnap.forEach((d) => {
        const data = d.data();
        const c = typeof data.requestedClass === "string" ? data.requestedClass.trim() : "";
        const rawSec = typeof data.requestedSection === "string" ? data.requestedSection.trim() : "Section A";
        if (c) {
          const cleanSec = rawSec.replace(/^section\s+/i, "");
          const normalizedSec = `Section ${cleanSec}`;
          const alreadyIn = assignedClasses.some(
            (a) => a.classId.toLowerCase() === c.toLowerCase() && a.sectionId.toLowerCase() === normalizedSec.toLowerCase()
          );
          if (!alreadyIn) {
            assignedClasses.push({
              classId: c,
              sectionId: normalizedSec,
              rawSectionId: rawSec,
              wingId: data.wingId,
              teacherName: data.teacherName || "Teacher",
              teacherId: data.teacherId || d.id,
            });
          }
        }
      });
    } catch {
      /* ignore */
    }

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
