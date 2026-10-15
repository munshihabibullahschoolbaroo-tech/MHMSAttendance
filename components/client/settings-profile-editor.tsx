"use client";

import { doc, updateDoc } from "firebase/firestore";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase/client";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { Skeleton } from "@/components/ui/skeleton";
import { Input, formFieldLabelClass } from "@/components/ui/input";

export function SettingsProfileEditor() {
  const { user, loading, refresh } = useDashboardUser();
  const [name, setName] = React.useState("");
  const [designation, setDesignation] = React.useState("");
  const [nameMsg, setNameMsg] = React.useState<{ text: string; isError: boolean } | null>(null);
  const [nameBusy, setNameBusy] = React.useState(false);

  React.useEffect(() => {
    if (user?.name) setName(user.name);
    setDesignation(user?.designation ?? "");
  }, [user?.designation, user?.name]);

  const saveName = async () => {
    setNameMsg(null);
    const auth = getFirebaseAuth();
    const u = auth.currentUser;
    if (!u || !user) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setNameMsg({ text: "Name cannot be empty.", isError: true });
      return;
    }
    setNameBusy(true);
    try {
      const token = await u.getIdToken();
      const res = await fetch("/api/user/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: trimmed,
          designation: designation.trim(),
        }),
      });

      if (!res.ok) {
        // Fallback to client updateDoc if route fails
        const db = getFirebaseDb();
        await updateDoc(doc(db, "users", u.uid), {
          name: trimmed,
          designation: designation.trim(),
        });
      }

      await refresh();
      setNameMsg({ text: "Profile updated successfully.", isError: false });
    } catch {
      setNameMsg({ text: "Could not save profile changes.", isError: true });
    } finally {
      setNameBusy(false);
    }
  };

  if (loading || !user) {
    return (
      <Card className="max-w-xl">
        <CardContent className="space-y-3 pt-6" aria-hidden>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-32 rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>Edit details</CardTitle>
          <CardDescription>
            Updates your display name and designation in MHMSAttendance.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className={formFieldLabelClass}>Full name</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. John Doe"
              autoComplete="name"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className={formFieldLabelClass}>Designation</span>
            <Input
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              placeholder="e.g. Maths Teacher"
              autoComplete="organization-title"
            />
          </label>
          {nameMsg ? (
            <p
              className={`text-sm font-medium ${
                nameMsg.isError
                  ? "text-red-600 dark:text-red-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {nameMsg.text}
            </p>
          ) : null}
          <div>
            <Button type="button" disabled={nameBusy} onClick={() => void saveName()}>
              {nameBusy ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
