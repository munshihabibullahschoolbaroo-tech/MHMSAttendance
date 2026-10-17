import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { adminDb } from "@/lib/firebase/admin";
import { jsonError } from "@/lib/api/json-error";

export const runtime = "nodejs";

let cachedTeachers: any[] | null = null;
let cachedTeachersExpiresAt = 0;

function invalidateTeachersCache() {
  cachedTeachers = null;
  cachedTeachersExpiresAt = 0;
}

export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const skipCache = url.searchParams.get("fresh") === "1";
  const now = Date.now();

  if (!skipCache && cachedTeachers && now < cachedTeachersExpiresAt) {
    return NextResponse.json(
      { ok: true, teachers: cachedTeachers },
      { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=120" } }
    );
  }

  try {
    const db = adminDb();
    const usersSnap = await db.collection("users").get();

    const teachers: Array<{
      id: string;
      name: string;
      email: string;
      employeeId?: string;
      designation?: string;
      wingId?: string;
      isClassTeacher?: boolean;
      schoolClassId?: string;
      schoolSectionId?: string;
    }> = [];

    usersSnap.forEach((doc) => {
      const d = doc.data();
      const role = String(d.role ?? "employee");
      // Include teachers and staff (exclude current caller from being their own substitute if needed, or include all)
      if (role === "employee" || role === "admin" || role === "super_admin") {
        teachers.push({
          id: doc.id,
          name:
            typeof d.name === "string" && d.name.trim()
              ? d.name.trim()
              : typeof d.email === "string" && d.email.trim()
              ? d.email.split("@")[0]!
              : typeof d.employeeId === "string" && d.employeeId.trim()
              ? `Staff Member (${d.employeeId})`
              : "Staff Member",
          email: typeof d.email === "string" ? d.email : "",
          employeeId: typeof d.employeeId === "string" ? d.employeeId : undefined,
          designation:
            (d.designation as string) || (d.position as string) || "Teacher",
          wingId: (d.schoolWingId as string) || (d.wingId as string) || "higher",
          isClassTeacher: d.isClassTeacher === true,
          schoolClassId: typeof d.schoolClassId === "string" ? d.schoolClassId : undefined,
          schoolSectionId: typeof d.schoolSectionId === "string" ? d.schoolSectionId : undefined,
        });
      }
    });

    teachers.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );

    cachedTeachers = teachers;
    cachedTeachersExpiresAt = Date.now() + 60_000;

    return NextResponse.json(
      { ok: true, teachers },
      { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=120" } }
    );
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to load teachers", 500);
  }
}
