import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { getSchoolConfig, saveSchoolConfig, DEFAULT_SCHOOL_CONFIG } from "@/lib/school/config";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { assertAdmin } from "@/lib/auth/assert-admin";
import { jsonError } from "@/lib/api/json-error";

export const runtime = "nodejs";

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  campusName: z.string().min(2).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radiusMeters: z.number().min(20).max(5000).optional(),
  wings: z.array(z.any()).optional(),
  sections: z.array(z.string()).optional(),
  classSections: z.record(z.string(), z.array(z.string())).optional(),
  teacherLateTime: z.string().optional(),
  schoolOpenTime: z.string().optional(),
  schoolCloseTime: z.string().optional(),
  schoolSignOutDeadline: z.string().optional(),
  signOutGraceHours: z.number().min(0).max(12).optional(),
});

/** GET /api/school/config - Returns current school configuration */
export async function GET() {
  try {
    const db = adminDb();
    const config = await getSchoolConfig(db);
    return NextResponse.json(config);
  } catch (e) {
    return NextResponse.json(DEFAULT_SCHOOL_CONFIG);
  }
}

/** POST /api/school/config - Admin updates school geofence and wings */
export async function POST(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  const forbidden = await assertAdmin(auth.decoded.uid, auth.decoded.email);
  if (forbidden) return forbidden;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid configuration", 400);
  }

  const db = adminDb();
  await saveSchoolConfig(db, parsed.data);
  const updated = await getSchoolConfig(db);
  return NextResponse.json({ ok: true, config: updated });
}
