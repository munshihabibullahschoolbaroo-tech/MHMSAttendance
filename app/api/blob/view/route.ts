import { get } from "@vercel/blob";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/blob/view?url=<encoded_blob_url>
 * Streams private Vercel Blob files (medical certificates, leave documents)
 * directly to the client browser with inline content-type for viewing in tab.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get("url") || searchParams.get("pathname");

  if (!targetUrl) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    return new NextResponse("Storage token not configured", { status: 503 });
  }

  try {
    const result = await get(targetUrl, {
      access: "private",
      token,
    });

    if (!result || !result.stream) {
      return new NextResponse("Document not found in storage", { status: 404 });
    }

    const { stream, blob } = result;
    const filename = blob.pathname.split("/").pop() || "document";
    const contentType = blob.contentType || "application/octet-stream";

    return new Response(stream as any, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (err: any) {
    console.error("[Blob View Route] Error fetching blob:", err?.message || err);
    // If it is already accessible or a public url, try redirecting
    try {
      return NextResponse.redirect(targetUrl);
    } catch {
      return new NextResponse("Document not found or access expired: " + (err?.message || ""), {
        status: 404,
      });
    }
  }
}
