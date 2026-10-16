"use client";

import type { User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import { getBrowserTimeZone } from "@/lib/date/time-zone";
import { getSuperAdminEmail } from "@/lib/constants";

/** Workspace profile can be created for any signed-in user with an email (credential or OAuth). */
export function canCreateEmployeeProfile(user: User): boolean {
  return typeof user.email === "string" && user.email.length > 0;
}

export async function ensureEmployeeUserDoc(user: User, displayName: string): Promise<void> {
  if (!user.uid || !user.email) {
    throw new Error("Missing user identity.");
  }
  if (!canCreateEmployeeProfile(user)) {
    throw new Error("VERIFY_EMAIL");
  }
  const db = getFirebaseDb();
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const photoUrl = user.photoURL || null;

  const superEmail = getSuperAdminEmail();
  const isSuper = Boolean(superEmail && user.email.trim().toLowerCase() === superEmail);
  const resolvedName = displayName.trim() || user.displayName?.trim() || user.email.split("@")[0] || "User";

  if (snap.exists()) {
    const existingData = snap.data();
    const patch: Record<string, unknown> = {};
    if (!existingData?.name || existingData.name === "undefined") {
      patch.name = resolvedName;
    }
    if (!existingData?.email || existingData.email === "undefined") {
      patch.email = user.email;
    }
    if (isSuper && existingData?.role !== "super_admin") {
      patch.role = "super_admin";
    } else if (!existingData?.role) {
      patch.role = isSuper ? "super_admin" : "employee";
    }
    if (photoUrl && (!existingData?.photoUrl || existingData.photoUrl !== photoUrl)) {
      patch.photoUrl = photoUrl;
    }
    if (Object.keys(patch).length > 0) {
      await setDoc(ref, patch, { merge: true });
    }
    return;
  }

  await setDoc(ref, {
    name: resolvedName,
    email: user.email,
    photoUrl,
    role: isSuper ? "super_admin" : "employee",
    assignedSites: [],
    timeZone: getBrowserTimeZone(),
    createdAt: serverTimestamp(),
  });
}
