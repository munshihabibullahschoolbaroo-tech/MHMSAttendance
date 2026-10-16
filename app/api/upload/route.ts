import { put, del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { jsonError } from "@/lib/api/json-error";
import sharp from "sharp";
import { compressPdfBuffer } from "@/lib/server/compress-pdf";

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

  // Enforce image-only policy for leave medical certificates & documents
  if (
    folder === "leave_docs" ||
    folder === "medical_certificate" ||
    folder.includes("leave") ||
    folder.includes("medical")
  ) {
    const isImage = mimeType.startsWith("image/") && mimeType !== "image/svg+xml";
    const hasPdfExtension = filename.toLowerCase().endsWith(".pdf");
    if (!isImage || hasPdfExtension) {
      return jsonError(
        "Only photo/image uploads (JPG, PNG, WebP) are allowed for medical documents. PDF files are not supported.",
        400
      );
    }
  }

  if (buffer.length > MAX_BYTES) {
    return jsonError("File size exceeds 10MB limit", 413);
  }

  // Ultra-efficient image compression: auto-orient, scale to 1280px max, strip metadata, encode to WebP (Q70)
  if (mimeType.startsWith("image/") && mimeType !== "image/svg+xml") {
    try {
      const optimized = await sharp(buffer)
        .rotate()
        .resize({
          width: 1280,
          height: 1280,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 70, effort: 6, smartSubsample: true })
        .toBuffer();

      if (optimized.length < buffer.length) {
        buffer = optimized;
        mimeType = "image/webp";
        if (!filename.toLowerCase().endsWith(".webp")) {
          filename = filename.replace(/\.[^/.]+$/, "") + ".webp";
        }
      }
    } catch (sharpErr) {
      console.warn("[Upload API] Sharp image optimization skipped:", sharpErr);
    }
  }

  // Ultra-efficient PDF compression: downscale embedded image scans and pack object streams
  if (mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
    try {
      const optimizedPdf = await compressPdfBuffer(buffer);
      if (optimizedPdf.length < buffer.length) {
        buffer = optimizedPdf;
      }
    } catch (pdfErr) {
      console.warn("[Upload API] PDF optimization skipped:", pdfErr);
    }
  }

  const safeName = filename.replace(/[^\w.\-]/g, "_");
  const path = `${folder}/${user.uid}/${Date.now()}-${safeName}`;
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();

  // Upload to Vercel Blob
  if (token) {
    const configuredAccess =
      process.env.BLOB_STORE_ACCESS?.trim().toLowerCase() === "public" ? "public" : "private";

    try {
      let blob;
      try {
        blob = await put(path, buffer, {
          access: configuredAccess,
          token,
          contentType: mimeType,
        });
      } catch (err: any) {
        const msg = String(err?.message || "");
        if (msg.includes("private store") && configuredAccess !== "private") {
          // Retry with private access
          blob = await put(path, buffer, {
            access: "private",
            token,
            contentType: mimeType,
          });
        } else if (msg.includes("public store") && configuredAccess !== "public") {
          // Retry with public access
          blob = await put(path, buffer, {
            access: "public",
            token,
            contentType: mimeType,
          });
        } else {
          throw err;
        }
      }

      if (blob) {
        const isPrivate = blob.url.includes(".private.blob.vercel-storage.com");
        const resolvedUrl = isPrivate
          ? `/api/blob/view?url=${encodeURIComponent(blob.url)}`
          : blob.url;

        return NextResponse.json({
          ok: true,
          url: resolvedUrl,
          rawUrl: blob.url,
          pathname: blob.pathname,
        });
      }
    } catch (blobErr: any) {
      console.error("[Upload API] Vercel Blob put failed:", blobErr?.message || blobErr);
      return jsonError(
        `Vercel Blob upload failed: ${blobErr?.message || "Unknown error"}. Check storage configuration.`,
        500
      );
    }
  }

  // If no Blob token configured, only allow small thumbnails as base64 to avoid Firestore document overflow
  if (buffer.length > 400 * 1024) {
    return jsonError(
      "BLOB_READ_WRITE_TOKEN is not configured on server and document is too large to store directly.",
      500
    );
  }

  const base64Str = buffer.toString("base64");
  const fallbackDataUrl = `data:${mimeType};base64,${base64Str}`;
  return NextResponse.json({ ok: true, url: fallbackDataUrl });
}

/** DELETE /api/upload - Immediately delete an uploaded file from Vercel Blob storage */
export async function DELETE(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const user = auth.decoded;

  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) return jsonError("Storage token not configured", 503);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const { url } = body;
  if (!url || typeof url !== "string") {
    return jsonError("URL is required", 400);
  }

  // Extract raw blob URL if it was wrapped in /api/blob/view?url=...
  let targetUrl = url;
  if (url.includes("/api/blob/view")) {
    try {
      const parsed = new URL(url, "http://localhost");
      targetUrl = parsed.searchParams.get("url") || url;
    } catch {}
  }

  // If file was stored as fallback base64 data URL, nothing to delete from Vercel Blob
  if (targetUrl.startsWith("data:")) {
    return NextResponse.json({ ok: true, message: "Local data cleared" });
  }

  // Security check: ensure user owns this file (their uid is in path) or user is admin
  const isOwner = targetUrl.includes(`/${user.uid}/`) || targetUrl.includes(user.uid);
  const isAdmin = user.role === "admin" || user.role === "super_admin";

  if (!isOwner && !isAdmin) {
    return jsonError("Forbidden: You cannot delete this file", 403);
  }

  try {
    await del(targetUrl, { token });
    return NextResponse.json({ ok: true, message: "File deleted from storage" });
  } catch (err: any) {
    console.error("[Upload DELETE] Error deleting blob:", err?.message || err);
    return jsonError(err?.message || "Failed to delete file from storage", 500);
  }
}
