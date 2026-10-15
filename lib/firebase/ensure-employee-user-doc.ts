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
  if (snap.exists()) {
    const existingData = snap.data();
    if (!existingData?.role) {
      const superEmail = getSuperAdminEmail();
      const isSuper = Boolean(superEmail && user.email.trim().toLowerCase() === superEmail);
      await setDoc(ref, { role: isSuper ? "super_admin" : "employee" }, { merge: true });
    }
    return;
  }

  const superEmail = getSuperAdminEmail();
  const isSuper = Boolean(superEmail && user.email.trim().toLowerCase() === superEmail);

  await setDoc(ref, {
    name: displayName.trim() || user.email.split("@")[0] || "User",
    email: user.email,
    role: isSuper ? "super_admin" : "employee",
    assignedSites: [],
    timeZone: getBrowserTimeZone(),
    createdAt: serverTimestamp(),
  });
}
