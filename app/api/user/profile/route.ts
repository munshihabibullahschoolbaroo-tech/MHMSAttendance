import { NextResponse } from "next/server";
import { z } from "zod";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

const bodySchema = z.object({
  name: z.string().trim().min(1, "Name cannot be empty"),
  designation: z.string().trim().optional(),
});

export async function POST(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid body", 400);
  }

  const { name, designation } = parsed.data;
  const uid = auth.decoded.uid;

  const updatePayload: Record<string, unknown> = {
    name,
  };
  if (designation !== undefined) {
    updatePayload.designation = designation;
  }

  await adminDb().collection("users").doc(uid).set(updatePayload, { merge: true });

  try {
    await adminAuth().updateUser(uid, { displayName: name });
  } catch (err) {
    console.warn("Failed to update Firebase Auth displayName:", err);
  }

  return NextResponse.json({ ok: true, name, designation });
}
