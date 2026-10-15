import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB limit for documents and medical certificates

export async function POST(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const user = auth.decoded;

  const reqContentType = req.headers.get("content-type") || "";
  let buffer: Buffer;
  let filename = "document";
  let mimeType = "application/octet-stream";
  let folder = "uploads";

  if (reqContentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (e) {
      return jsonError("Invalid form data upload", 400);
    }

    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
      return jsonError("No file uploaded in form data", 400);
    }

    filename = (file as any).name || "document";
    mimeType = file.type || "application/octet-stream";
    const customFolder = formData.get("folder") || formData.get("category");
    if (typeof customFolder === "string" && customFolder.trim()) {
      folder = customFolder.trim().replace(/[^\w-]/g, "_");
    }

    const arrayBuffer = await file.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } else {
    // Handle JSON payload with base64
    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid upload request. Expected FormData or JSON.", 400);
    }

    if (!body.base64 || typeof body.base64 !== "string") {
      return jsonError("Missing base64 data", 400);
    }

    filename = body.filename || "file";
    mimeType = body.contentType || "image/webp";
    if (body.folder && typeof body.folder === "string") {
      folder = body.folder.trim().replace(/[^\w-]/g, "_");
    }

    const comma = body.base64.indexOf(",");
    const raw = comma >= 0 ? body.base64.slice(comma + 1) : body.base64;
    buffer = Buffer.from(raw, "base64");
  }

  if (buffer.length > MAX_BYTES) {
    return jsonError("File size exceeds 10MB limit", 413);
  }

  const safeName = filename.replace(/[^\w.\-]/g, "_");
  const path = `${folder}/${user.uid}/${Date.now()}-${safeName}`;
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();

  // Try Vercel Blob first
  if (token) {
    const access = process.env.BLOB_STORE_ACCESS === "public" ? "public" : "public";
    try {
      const blob = await put(path, buffer, {
        access,
        token,
        contentType: mimeType,
      });
      return NextResponse.json({ ok: true, url: blob.url });
    } catch (blobErr) {
      console.warn("[Upload API] Vercel Blob put failed, falling back to base64 Data URL:", blobErr);
    }
  }

  // Graceful fallback to inline Data URL so user is never blocked
  const base64Str = buffer.toString("base64");
  const fallbackDataUrl = `data:${mimeType};base64,${base64Str}`;
  return NextResponse.json({ ok: true, url: fallbackDataUrl });
}
