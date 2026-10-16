import { del, list, get, put } from "@vercel/blob";
import { DateTime } from "luxon";
import { z } from "zod";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { isRequestAdmin } from "@/lib/auth/require-admin";
import { jsonError } from "@/lib/api/json-error";
import { adminDb } from "@/lib/firebase/admin";
import sharp from "sharp";
import { compressPdfBuffer } from "@/lib/server/compress-pdf";

export const runtime = "nodejs";

const MonthSchema = z.string().regex(/^\d{4}-\d{2}$/);

function parseUploadInstant(pathname: string, uploadedAtRaw: unknown): DateTime | null {
  if (uploadedAtRaw instanceof Date) return DateTime.fromJSDate(uploadedAtRaw);
  if (typeof uploadedAtRaw === "string" || typeof uploadedAtRaw === "number") {
    const up = DateTime.fromJSDate(new Date(uploadedAtRaw));
    if (up.isValid) return up;
  }

  const base = pathname.split("/").pop() ?? "";
  const m = base.match(/^(\d{13})-/);
  if (!m?.[1]) return null;
  const ts = Number(m[1]);
  if (!Number.isFinite(ts)) return null;
  const d = DateTime.fromMillis(ts);
  return d.isValid ? d : null;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function authorize(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return { ok: false as const, response: auth.response };
  if (!(await isRequestAdmin(auth.decoded))) {
    return { ok: false as const, response: jsonError("Forbidden", 403) };
  }
  return { ok: true as const };
}

export type BlobFileItem = {
  url: string;
  pathname: string;
  size: number;
  sizeFormatted: string;
  uploadedAtIso: string;
  viewUrl: string;
  category: string;
  userId: string | null;
  userName: string;
  fileName: string;
};

/** GET: List stored medical certificates, leave documents, and pictures in Vercel Blob */
export async function GET(req: Request) {
  const authz = await authorize(req);
  if (!authz.ok) return authz.response;

  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) return jsonError("BLOB_READ_WRITE_TOKEN not configured", 503);

  const u = new URL(req.url);
  const fromMonth = u.searchParams.get("fromMonth");
  const toMonth = u.searchParams.get("toMonth");
  const showAll = u.searchParams.get("all") === "1" || (!fromMonth && !toMonth);

  let from: DateTime | null = null;
  let toExclusive: DateTime | null = null;

  if (!showAll && fromMonth && toMonth) {
    if (!MonthSchema.safeParse(fromMonth).success || !MonthSchema.safeParse(toMonth).success) {
      return jsonError("Month must be yyyy-MM", 400);
    }
    from = DateTime.fromFormat(fromMonth, "yyyy-MM", { zone: "utc" }).startOf("month");
    toExclusive = DateTime.fromFormat(toMonth, "yyyy-MM", { zone: "utc" }).plus({ months: 1 }).startOf("month");
  }

  try {
    const rawBlobs: Array<{ url: string; pathname: string; size: number; uploadedAt: Date }> = [];
    let cursor: string | undefined;

    while (true) {
      const page = await list({ token, limit: 1000, cursor });
      for (const b of page.blobs) {
        rawBlobs.push({
          url: b.url,
          pathname: b.pathname,
          size: b.size,
          uploadedAt: b.uploadedAt,
        });
      }
      if (!page.hasMore || !page.cursor) break;
      cursor = page.cursor;
    }

    // Extract user IDs to resolve names from Firestore
    const userIds = new Set<string>();
    for (const b of rawBlobs) {
      const parts = b.pathname.split("/");
      if (parts.length >= 2 && parts[1].length > 5) {
        userIds.add(parts[1]);
      }
    }

    const userNameMap = new Map<string, string>();
    if (userIds.size > 0) {
      const db = adminDb();
      const uids = Array.from(userIds);
      for (let i = 0; i < uids.length; i += 30) {
        const chunk = uids.slice(i, i + 30);
        try {
          const snap = await db.collection("users").where("__name__", "in", chunk).get();
          for (const doc of snap.docs) {
            const d = doc.data();
            const name = d.name?.trim() || d.email?.split("@")[0] || doc.id;
            userNameMap.set(doc.id, name);
          }
        } catch {
          /* ignore */
        }
      }
    }

    let totalBytes = 0;
    const files: BlobFileItem[] = [];

    for (const b of rawBlobs) {
      const when = parseUploadInstant(b.pathname, b.uploadedAt);
      if (from && toExclusive && when) {
        if (when < from || when >= toExclusive) {
          continue;
        }
      }

      totalBytes += b.size;

      const parts = b.pathname.split("/");
      const category = parts[0] || "uploads";
      const userId = parts.length >= 2 && parts[1].length > 5 ? parts[1] : null;
      const rawFileName = parts.pop() || "document";
      const cleanFileName = rawFileName.replace(/^\d{13}-/, "");

      const isPrivate = b.url.includes(".private.blob.vercel-storage.com");
      const viewUrl = isPrivate ? `/api/blob/view?url=${encodeURIComponent(b.url)}` : b.url;

      files.push({
        url: b.url,
        pathname: b.pathname,
        size: b.size,
        sizeFormatted: formatBytes(b.size),
        uploadedAtIso: when?.toISO() ?? b.uploadedAt.toISOString(),
        viewUrl,
        category,
        userId,
        userName: (userId && userNameMap.get(userId)) || "Unknown Staff",
        fileName: cleanFileName,
      });
    }

    // Sort newest first
    files.sort((a, b) => b.uploadedAtIso.localeCompare(a.uploadedAtIso));

    return Response.json({
      ok: true,
      totalCount: files.length,
      totalBytes,
      totalBytesFormatted: formatBytes(totalBytes),
      scannedCount: rawBlobs.length,
      deleteCandidateCount: files.length,
      files,
      sample: files.slice(0, 20),
    });
  } catch (e: any) {
    console.error("[Storage Photos GET] Error:", e);
    return jsonError(e instanceof Error ? e.message : "Failed to list files", 500);
  }
}

const DeletePayloadSchema = z.object({
  url: z.string().url().optional(),
  urls: z.array(z.string().url()).optional(),
  fromMonth: MonthSchema.optional(),
  toMonth: MonthSchema.optional(),
  all: z.boolean().optional(),
  confirmed: z.boolean().optional(),
});

/** DELETE: Delete individual stored file, selected files, or prune by month range */
export async function DELETE(req: Request) {
  const authz = await authorize(req);
  if (!authz.ok) return authz.response;

  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) return jsonError("BLOB_READ_WRITE_TOKEN not configured", 503);

  let body: z.infer<typeof DeletePayloadSchema>;
  try {
    body = DeletePayloadSchema.parse(await req.json());
  } catch (err: any) {
    return jsonError(err?.message || "Invalid delete payload", 400);
  }

  const { url, urls, fromMonth, toMonth, all } = body;

  const targetUrls: string[] = [];

  if (url) {
    targetUrls.push(url);
  } else if (urls && urls.length > 0) {
    targetUrls.push(...urls);
  } else if (all || (fromMonth && toMonth)) {
    // Scan matching blobs to delete
    let from: DateTime | null = null;
    let toExclusive: DateTime | null = null;
    if (fromMonth && toMonth) {
      from = DateTime.fromFormat(fromMonth, "yyyy-MM", { zone: "utc" }).startOf("month");
      toExclusive = DateTime.fromFormat(toMonth, "yyyy-MM", { zone: "utc" }).plus({ months: 1 }).startOf("month");
    }

    let cursor: string | undefined;
    while (true) {
      const page = await list({ token, limit: 1000, cursor });
      for (const b of page.blobs) {
        if (from && toExclusive) {
          const when = parseUploadInstant(b.pathname, b.uploadedAt);
          if (when && when >= from && when < toExclusive) {
            targetUrls.push(b.url);
          }
        } else {
          // All files
          targetUrls.push(b.url);
        }
      }
      if (!page.hasMore || !page.cursor) break;
      cursor = page.cursor;
    }
  } else {
    return jsonError("Must specify url, urls, or a month range to delete.", 400);
  }

  if (targetUrls.length === 0) {
    return Response.json({ ok: true, deletedCount: 0, message: "No matching files to delete." });
  }

  try {
    let deletedCount = 0;
    for (const fileUrl of targetUrls) {
      try {
        await del(fileUrl, { token });
        deletedCount++;
      } catch (err) {
        console.warn(`[Storage Delete] Failed deleting ${fileUrl}:`, err);
      }
    }

    return Response.json({
      ok: true,
      deletedCount,
      requestedCount: targetUrls.length,
      message: `Successfully deleted ${deletedCount} file(s) from Vercel Blob storage.`,
    });
  } catch (e: any) {
    console.error("[Storage Delete Error]:", e);
    return jsonError(e instanceof Error ? e.message : "Failed to delete from storage", 500);
  }
}

/** PATCH: Compress and optimize an existing stored file (PDF or Image) in Vercel Blob */
export async function PATCH(req: Request) {
  const authz = await authorize(req);
  if (!authz.ok) return authz.response;

  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) return jsonError("BLOB_READ_WRITE_TOKEN not configured", 503);

  const { url } = await req.json().catch(() => ({}));
  if (!url || typeof url !== "string") {
    return jsonError("Valid URL is required", 400);
  }

  try {
    const result = await get(url, { access: "private", token });
    if (!result || !result.stream) {
      return jsonError("File not found in storage", 404);
    }

    const { blob } = result;
    const response = new Response(result.stream);
    const arrayBuffer = await response.arrayBuffer();
    const originalBuffer = Buffer.from(arrayBuffer);
    const contentType = blob.contentType || "application/octet-stream";
    const pathname = blob.pathname;

    let optimizedBuffer: any = originalBuffer;

    if (contentType.includes("pdf") || pathname.toLowerCase().endsWith(".pdf")) {
      optimizedBuffer = await compressPdfBuffer(originalBuffer);
    } else if (contentType.startsWith("image/") && contentType !== "image/svg+xml") {
      try {
        const compressed = await sharp(originalBuffer)
          .rotate()
          .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 70, effort: 6 })
          .toBuffer();
        if (compressed.length < originalBuffer.length) {
          optimizedBuffer = compressed;
        }
      } catch {}
    }

    if (optimizedBuffer.length >= originalBuffer.length) {
      return Response.json({
        ok: true,
        message: "File is already at optimal compression",
        originalSize: originalBuffer.length,
        newSize: originalBuffer.length,
        savedBytes: 0,
        savedPercent: 0,
      });
    }

    // Overwrite the blob at same pathname
    const newBlob = await put(pathname, optimizedBuffer, {
      access: "private",
      token,
      contentType: contentType.includes("pdf") ? "application/pdf" : "image/webp",
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    const savedBytes = originalBuffer.length - optimizedBuffer.length;
    const savedPercent = Math.round((savedBytes / originalBuffer.length) * 100);

    return Response.json({
      ok: true,
      message: `Successfully compressed file: saved ${formatBytes(savedBytes)} (${savedPercent}% reduction)`,
      originalSize: originalBuffer.length,
      newSize: optimizedBuffer.length,
      savedBytes,
      savedPercent,
      newUrl: newBlob.url,
    });
  } catch (err: any) {
    console.error("[Storage Compress PATCH] Error:", err);
    return jsonError(err?.message || "Failed to compress file", 500);
  }
}
