import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { isRequestAdmin } from "@/lib/auth/require-admin";
import { adminDb } from "@/lib/firebase/admin";
import { jsonError } from "@/lib/api/json-error";
import { DEFAULT_SCHOOL_CONFIG, SchoolConfig, getSchoolConfig, getSectionsForClass } from "@/lib/school/config";

export const runtime = "nodejs";

export interface ClassAttendanceSummary {
  wingId: string;
  wingName: string;
  classId: string;
  sectionId: string;
  totalStudents: number;
  isSubmitted: boolean;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  attendancePercent: number;
  savedByTeacherName?: string;
  updatedAt?: string;
}

export interface WingAttendanceSummary {
  wingId: string;
  wingName: string;
  totalStudents: number;
  submittedClassesCount: number;
  totalClassesCount: number;
  totalPresent: number;
  totalAbsent: number;
  totalLate: number;
  attendancePercent: number;
  classes: ClassAttendanceSummary[];
}

export interface SchoolAttendanceSummaryResponse {
  date: string;
  totalSchoolStudents: number;
  totalPresent: number;
  totalAbsent: number;
  totalLate: number;
  overallAttendancePercent: number;
  totalClassesCount: number;
  submittedClassesCount: number;
  pendingClassesCount: number;
  wings: WingAttendanceSummary[];
  classSummaries: ClassAttendanceSummary[];
}

const summaryCache = new Map<string, { data: SchoolAttendanceSummaryResponse; expiresAt: number }>();

function invalidateSchoolSummaryCache(date?: string) {
  if (date) summaryCache.delete(date);
  else summaryCache.clear();
}

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  const isAdmin = await isRequestAdmin(auth.decoded);
  if (!isAdmin) {
    return jsonError("Only administrators can view school-wide student attendance statistics.", 403);
  }

  const url = new URL(req.url);
  const now = new Date();
  const defaultDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const date = url.searchParams.get("date") || defaultDate;
  const skipCache = url.searchParams.get("fresh") === "1";

  const cached = summaryCache.get(date);
  if (!skipCache && cached && Date.now() < cached.expiresAt) {
    return NextResponse.json(cached.data, {
      headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=60" },
    });
  }

  const db = adminDb();

  // 1. Get school config using cached helper
  const config: SchoolConfig = await getSchoolConfig(db);

  // 2. Fetch all student documents to count roster sizes per class & section
  const studentCountMap: Record<string, number> = {};
  let totalSchoolStudents = 0;

  try {
    const studentsSnap = await db.collection("students").select("classId", "sectionId", "wingId").get();
    totalSchoolStudents = studentsSnap.size;
    studentsSnap.docs.forEach((d) => {
      const data = d.data();
      const cId = String(data.classId || "");
      const sId = String(data.sectionId || "");
      const key = `${cId}__${sId}`;
      studentCountMap[key] = (studentCountMap[key] || 0) + 1;
    });
  } catch (err) {
    console.error("[school-summary] Error fetching students collection:", err);
  }

  // 3. Fetch all student attendance records for the given date
  const attendanceMap: Record<string, any> = {};
  try {
    const attSnap = await db.collection("studentAttendance").where("date", "==", date).get();
    attSnap.docs.forEach((doc) => {
      const data = doc.data();
      const cId = String(data.classId || "");
      const sId = String(data.sectionId || "");
      const key = `${cId}__${sId}`;
      attendanceMap[key] = data;
    });
  } catch (err) {
    console.error("[school-summary] Error fetching studentAttendance docs:", err);
  }

  // 4. Build class summaries based on configured wings and classes
  let totalPresent = 0;
  let totalAbsent = 0;
  let totalLate = 0;
  let submittedClassesCount = 0;
  let totalClassesCount = 0;

  const allClassSummaries: ClassAttendanceSummary[] = [];

  const wingsSummary: WingAttendanceSummary[] = config.wings.map((wing) => {
    let wingTotalStudents = 0;
    let wingSubmittedClasses = 0;
    let wingPresent = 0;
    let wingAbsent = 0;
    let wingLate = 0;
    const wingClasses: ClassAttendanceSummary[] = [];

    wing.classes.forEach((classId) => {
      const sections = getSectionsForClass(config, classId);
      sections.forEach((sectionId) => {
        totalClassesCount++;
        const key = `${classId}__${sectionId}`;
        const totalInClass = studentCountMap[key] || 0;
        wingTotalStudents += totalInClass;

        const att = attendanceMap[key];
        const isSubmitted = Boolean(att && Array.isArray(att.records) && att.records.length > 0);

        let presentCount = 0;
        let absentCount = 0;
        let lateCount = 0;

        if (isSubmitted) {
          wingSubmittedClasses++;
          submittedClassesCount++;
          att.records.forEach((r: { status?: string }) => {
            if (r.status === "present") {
              presentCount++;
              wingPresent++;
              totalPresent++;
            } else if (r.status === "absent") {
              absentCount++;
              wingAbsent++;
              totalAbsent++;
            } else if (r.status === "late") {
              lateCount++;
              wingLate++;
              totalLate++;
            }
          });
        }

        const marked = presentCount + absentCount + lateCount;
        const attendancePercent = marked > 0 ? Math.round((presentCount / marked) * 100) : 0;

        const summary: ClassAttendanceSummary = {
          wingId: wing.id,
          wingName: wing.name,
          classId,
          sectionId,
          totalStudents: totalInClass,
          isSubmitted,
          presentCount,
          absentCount,
          lateCount,
          attendancePercent,
          savedByTeacherName: att?.savedByTeacherName || undefined,
          updatedAt: att?.updatedAt ? String(att.updatedAt) : undefined,
        };

        wingClasses.push(summary);
        allClassSummaries.push(summary);
      });
    });

    const wingMarked = wingPresent + wingAbsent + wingLate;
    const wingPercent = wingMarked > 0 ? Math.round((wingPresent / wingMarked) * 100) : 0;

    return {
      wingId: wing.id,
      wingName: wing.name,
      totalStudents: wingTotalStudents,
      submittedClassesCount: wingSubmittedClasses,
      totalClassesCount: wingClasses.length,
      totalPresent: wingPresent,
      totalAbsent: wingAbsent,
      totalLate: wingLate,
      attendancePercent: wingPercent,
      classes: wingClasses,
    };
  });

  const totalMarkedAcrossSchool = totalPresent + totalAbsent + totalLate;
  const overallAttendancePercent =
    totalMarkedAcrossSchool > 0 ? Math.round((totalPresent / totalMarkedAcrossSchool) * 100) : 0;

  const result: SchoolAttendanceSummaryResponse = {
    date,
    totalSchoolStudents,
    totalPresent,
    totalAbsent,
    totalLate,
    overallAttendancePercent,
    totalClassesCount,
    submittedClassesCount,
    pendingClassesCount: Math.max(0, totalClassesCount - submittedClassesCount),
    wings: wingsSummary,
    classSummaries: allClassSummaries,
  };

  summaryCache.set(date, { data: result, expiresAt: Date.now() + 30_000 });

  return NextResponse.json(result, {
    headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=60" },
  });
}
