import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { adminDb } from "@/lib/firebase/admin";
import { jsonError } from "@/lib/api/json-error";
import { createNotification } from "@/lib/notifications/create-notification";
import { calculateCasualLeaveQuota } from "@/lib/school/leave-quota";
import { extractFirstActiveDateKey } from "@/lib/attendance/user-first-active";

import { put } from "@vercel/blob";
import { compressPdfBuffer } from "@/lib/server/compress-pdf";

export const runtime = "nodejs";

const leaveSchema = z.object({
  type: z.enum(["casual", "medical"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(5).max(500),
  documentUrl: z.string().trim().optional().or(z.literal("")),
  documentUrls: z.array(z.string().trim()).optional(),
});

/** GET /api/school/leave - List teacher's leave requests */
export async function GET(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  const db = adminDb();
  const snap = await db
    .collection("leaveRequests")
    .where("teacherId", "==", auth.decoded.uid)
    .get();

  const leaves = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((l: any) => l.type !== "late_sign_out" && !l.isLateSignOut);
  leaves.sort((a: any, b: any) => {
    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
    return timeB - timeA;
  });
  return NextResponse.json({ leaves });
}

/** POST /api/school/leave - Submit a new leave request */
export async function POST(req: Request) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = leaveSchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid leave application", 400);
  }

  try {
    const { type, startDate, endDate, reason } = parsed.data;

    // Collect all submitted documents (supporting both single and multi-file submissions)
    const rawList = Array.isArray(parsed.data.documentUrls) && parsed.data.documentUrls.length > 0
      ? parsed.data.documentUrls
      : (parsed.data.documentUrl ? [parsed.data.documentUrl] : []);

    const finalDocumentUrls: string[] = [];

    for (let docUrl of rawList) {
      if (!docUrl || !docUrl.trim()) continue;
      // If client sent base64 data url directly, upload it to Vercel Blob to prevent Firestore doc size limit overflow
      if (docUrl.startsWith("data:")) {
        try {
          const comma = docUrl.indexOf(",");
          const raw = comma >= 0 ? docUrl.slice(comma + 1) : docUrl;
          let buf: any = Buffer.from(raw, "base64");
          const mimeMatch = docUrl.match(/^data:([^;]+);/);
          const mime = mimeMatch ? mimeMatch[1] : "application/pdf";
          if (mime === "application/pdf" || docUrl.includes("application/pdf")) {
            try {
              buf = await compressPdfBuffer(buf);
            } catch {}
          }
          const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
          if (token) {
            const blob = await put(`medical_certificate/${auth.decoded.uid}/${Date.now()}-medical-doc`, buf, {
              access: "private",
              token,
              contentType: mime,
            });
            docUrl = `/api/blob/view?url=${encodeURIComponent(blob.url)}`;
          }
        } catch (uploadErr) {
          console.error("[Leave POST] Failed to auto-upload base64 to Vercel Blob:", uploadErr);
          if (docUrl.length > 500000) {
            return jsonError("Uploaded document is too large for database storage. Please re-upload.", 400);
          }
        }
      }
      finalDocumentUrls.push(docUrl);
    }

    if (type === "medical") {
      if (finalDocumentUrls.length === 0) {
        return jsonError("Medical leave requires at least one medical certificate or doctor prescription image.", 400);
      }
      for (const dUrl of finalDocumentUrls) {
        if (dUrl.toLowerCase().endsWith(".pdf") || dUrl.toLowerCase().includes(".pdf")) {
          return jsonError("Only photo/image uploads (JPG, PNG, WebP) are allowed for medical documents. PDF files are not supported.", 400);
        }
      }
    }

    if (startDate > endDate) {
      return jsonError("Start date cannot be after end date.", 400);
    }

    function getDatesInRange(startStr: string, endStr: string): string[] {
      const dates: string[] = [];
      const curr = new Date(startStr + "T00:00:00Z");
      const end = new Date(endStr + "T00:00:00Z");
      if (isNaN(curr.getTime()) || isNaN(end.getTime()) || curr > end) return [startStr];
      while (curr <= end) {
        const yyyy = curr.getUTCFullYear();
        const mm = String(curr.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(curr.getUTCDate()).padStart(2, "0");
        dates.push(`${yyyy}-${mm}-${dd}`);
        curr.setUTCDate(curr.getUTCDate() + 1);
      }
      return dates;
    }

    const requestedDates = getDatesInRange(startDate, endDate);

    const db = adminDb();

    // Check for any overlapping leaves (casual or medical)
    const existingTeacherLeavesSnap = await db
      .collection("leaveRequests")
      .where("teacherId", "==", auth.decoded.uid)
      .where("status", "in", ["approved", "pending"])
      .get();

    for (const doc of existingTeacherLeavesSnap.docs) {
      if (doc.get("type") === "late_sign_out" || doc.get("isLateSignOut")) continue;
      const s = String(doc.get("startDate") ?? "");
      const e = String(doc.get("endDate") ?? s);
      const existingDates = getDatesInRange(s, e);
      for (const d of requestedDates) {
        if (existingDates.includes(d)) {
          return jsonError(
            `You already have a leave request (${doc.get("type")?.toString().toUpperCase()} - ${doc.get("status")}) covering ${d}.`,
            400
          );
        }
      }
    }

    const userSnap = await db.collection("users").doc(auth.decoded.uid).get();
    if (!userSnap.exists) return jsonError("User profile not found", 404);

    const userData = userSnap.data() ?? {};
    const firstActiveDateKey = extractFirstActiveDateKey(userData);

    // Casual leave quota verification with rollover: 2 regular days/month + carried forward days from prior months of the year
    if (type === "casual") {
      const allCasualDates = new Set<string>();
      existingTeacherLeavesSnap.forEach((d) => {
        if (d.get("type") === "casual") {
          const s = String(d.get("startDate") ?? "");
          const e = String(d.get("endDate") ?? s);
          const dates = getDatesInRange(s, e);
          for (const date of dates) {
            allCasualDates.add(date);
          }
        }
      });

      const requestedByMonth: Record<string, string[]> = {};
      for (const d of requestedDates) {
        const m = d.slice(0, 7);
        if (!requestedByMonth[m]) requestedByMonth[m] = [];
        requestedByMonth[m].push(d);
      }

      for (const [monthKey, reqDates] of Object.entries(requestedByMonth)) {
        const quota = calculateCasualLeaveQuota(monthKey, allCasualDates, firstActiveDateKey);

        if (quota.usedThisMonth + reqDates.length > quota.maxCasualLeavesAllowed) {
          const rolloverNote =
            quota.carriedForward > 0
              ? ` (2 regular + ${quota.carriedForward} carried over from previous months)`
              : "";
          return jsonError(
            `Casual leave quota exceeded for ${monthKey}: Maximum ${quota.maxCasualLeavesAllowed} casual leave day(s) allowed${rolloverNote}. You currently have ${quota.usedThisMonth} day(s) recorded/pending, and this application requests ${reqDates.length} day(s).`,
            400
          );
        }
      }
    }

    const teacherName =
      (typeof userData.name === "string" && userData.name.trim()) ||
      auth.decoded.email?.split("@")[0] ||
      "Teacher";

    const docRef = db.collection("leaveRequests").doc();
    const leaveData = {
      teacherId: auth.decoded.uid,
      teacherName,
      teacherEmail: auth.decoded.email ?? "",
      teacherPhone: userData.phone ?? null,
      wingId: userData.schoolWingId ?? "higher",
      position: userData.position ?? "teacher",
      designation: userData.designation ?? "Teacher",
      type,
      startDate,
      endDate,
      reason,
      documentUrl: finalDocumentUrls[0] || null,
      documentUrls: finalDocumentUrls,
      status: "pending" as const,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await docRef.set(leaveData);

    // Notify admins
    try {
      const adminsSnap = await db
        .collection("users")
        .where("role", "in", ["admin", "super_admin"])
        .get();

      for (const adminDoc of adminsSnap.docs) {
        await createNotification(db, {
          userId: adminDoc.id,
          title: `Leave Application: ${teacherName}`,
          body: `${teacherName} applied for ${type.toUpperCase()} leave (${startDate} to ${endDate}): ${reason}`,
          kind: "leave_request",
          link: "/dashboard/admin/leaves",
        });
      }
    } catch {
      /* non-critical */
    }

    return NextResponse.json({ ok: true, leaveId: docRef.id, message: "Leave application submitted successfully." });
  } catch (err: any) {
    console.error("[Leave POST] Unexpected error:", err);
    return jsonError(err?.message || "Internal server error submitting leave application.", 500);
  }
}
