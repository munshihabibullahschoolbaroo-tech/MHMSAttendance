import { z } from "zod";
import { requireBearerUser } from "@/lib/auth/verify-request";
import { adminDb } from "@/lib/firebase/admin";
import { jsonError } from "@/lib/api/json-error";
import { claimEmployeeId } from "@/lib/employee-id/allocator";
import { createNotification } from "@/lib/notifications/create-notification";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const onboardingSchema = z.object({
  name: z.string().trim().min(1).optional(),
  wingId: z.enum(["higher", "lower", "rewa_na_kasco"]),
  position: z.string().min(1),
  customDesignation: z.string().optional(),
  phone: z.string().trim().min(7).max(20),
  isClassTeacher: z.boolean(),
  schoolClassId: z.string().optional(),
  schoolSectionId: z.string().optional(),
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

  const parsed = onboardingSchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid onboarding data", 400);
  }

  const { name, wingId, position, customDesignation, phone, isClassTeacher, schoolClassId, schoolSectionId } = parsed.data;

  try {
    const db = adminDb();
    const userRef = db.collection("users").doc(auth.decoded.uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return jsonError("User profile not found", 404);

    const role = String(userSnap.get("role") ?? "employee");

    // Position quota check across school:
    const posNormalized = position.toLowerCase().trim();
    if (posNormalized === "principal" || posNormalized === "vice_principal" || posNormalized === "incharge") {
      const allUsersSnap = await db.collection("users").get();
      let principalCount = 0;
      let vpCount = 0;
      let inchargeCount = 0;

      allUsersSnap.forEach((doc) => {
        if (doc.id === auth.decoded.uid) return; // ignore current updating user
        const p = String(doc.get("position") ?? "").toLowerCase().trim();
        if (p === "principal") principalCount++;
        if (p === "vice_principal" || p === "vice principal") vpCount++;
        if (p === "incharge") inchargeCount++;
      });

      if (posNormalized === "principal" && principalCount >= 1) {
        return jsonError("The Principal position has already been registered. Please select your official role.", 400);
      }
      if (posNormalized === "vice_principal" && vpCount >= 2) {
        return jsonError("Both Vice Principal positions are already assigned.", 400);
      }
      if (posNormalized === "incharge" && wingId === "rewa_na_kasco" && inchargeCount >= 1) {
        return jsonError("The Incharge position for Rewa na Kasco is already assigned.", 400);
      }
    }

    // Check if requested class and section is already assigned to another teacher
    if (isClassTeacher && schoolClassId && schoolSectionId) {
      const allUsersSnap = await db.collection("users").get();
      const existingTeacher = allUsersSnap.docs.find((doc) => {
        if (doc.id === auth.decoded.uid) return false;
        return (
          doc.get("isClassTeacher") === true &&
          doc.get("schoolClassId") === schoolClassId &&
          doc.get("schoolSectionId") === schoolSectionId
        );
      });
      if (existingTeacher) {
        return jsonError(
          `${schoolClassId} (${schoolSectionId}) is already assigned to another teacher. Please select an available class or request an assignment switch.`,
          400
        );
      }
    }

    let employeeId = userSnap.get("employeeId");
    if (role === "employee" && (typeof employeeId !== "string" || !employeeId.trim())) {
      employeeId = await claimEmployeeId(db);
    }

    const existingAccess = userSnap.get("workspaceAccessStatus") as string | undefined;
    const needsLoginApproval =
      role === "employee" && existingAccess !== "approved" && existingAccess !== "rejected";

    const displayDesignation =
      customDesignation?.trim() ||
      position.charAt(0).toUpperCase() + position.slice(1).replace("_", " ");

    const resolvedName =
      (typeof name === "string" && name.trim()) ||
      (typeof userSnap.get("name") === "string" && String(userSnap.get("name")).trim()) ||
      auth.decoded.name ||
      auth.decoded.email?.split("@")[0] ||
      "Staff Member";

    const resolvedEmail =
      auth.decoded.email ||
      (typeof userSnap.get("email") === "string" ? String(userSnap.get("email")) : "");

    await userRef.set(
      {
        name: resolvedName,
        email: resolvedEmail,
        role: role || "employee",
        schoolWingId: wingId,
        position,
        designation: displayDesignation,
        phone,
        isClassTeacher,
        schoolClassId: isClassTeacher ? (schoolClassId ?? null) : null,
        schoolSectionId: isClassTeacher ? (schoolSectionId ?? null) : null,
        ...(typeof employeeId === "string" && employeeId.trim() ? { employeeId } : {}),
        onboardingCompletedAt: new Date(),
        onboarded: true,
        ...(needsLoginApproval ? { workspaceAccessStatus: "pending" as const } : {}),
      },
      { merge: true }
    );

    // Sync displayName to Firebase Auth
    try {
      const authAdmin = (await import("firebase-admin")).auth();
      await authAdmin.updateUser(auth.decoded.uid, { displayName: resolvedName });
    } catch {
      /* ignore auth update failure */
    }

    if (needsLoginApproval) {
      try {
        const adminSnap = await db
          .collection("users")
          .where("role", "in", ["admin", "super_admin"])
          .get();
        const teacherLabel =
          (typeof userSnap.get("name") === "string" && String(userSnap.get("name")).trim()) ||
          auth.decoded.email ||
          auth.decoded.uid;

        for (const adminDoc of adminSnap.docs) {
          await createNotification(db, {
            userId: adminDoc.id,
            title: "New Teacher Registration",
            body: `${teacherLabel} submitted onboarding details (${displayDesignation}) and is waiting for workspace approval.`,
            kind: "login_request",
            link: "/dashboard/admin/workers",
          });
        }
      } catch {
        /* non-critical */
      }
    }

    return NextResponse.json({ ok: true, status: needsLoginApproval ? "pending" : "approved" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to save profile";
    return jsonError(msg, 500);
  }
}
