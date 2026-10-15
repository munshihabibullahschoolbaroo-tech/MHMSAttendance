"use client";

import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { nameToInitials } from "@/lib/profile/initials";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { cn } from "@/lib/utils";
import { SettingsProfileEditor } from "@/components/client/settings-profile-editor";
import { AdminOnboardingSettings, SchoolConfigTab } from "@/components/client/admin-onboarding-settings";
import { Skeleton } from "@/components/ui/skeleton";
import { Input, formFieldLabelClass } from "@/components/ui/input";
import { formatRoleDisplay, roleBadgeClassNames } from "@/lib/profile/role-badge";
import { Building2, Layers, MapPin, User as UserIcon } from "lucide-react";

const DELETE_PHRASE = "DELETE MY ACCOUNT";

export type SettingsTabId = "campus" | "sections" | "wings" | "profile";

export function SettingsPage() {
  const router = useRouter();
  const { user, loading } = useDashboardUser();
  const [activeTab, setActiveTab] = React.useState<SettingsTabId>("campus");
  const [phrase, setPhrase] = React.useState("");
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [deleteMsg, setDeleteMsg] = React.useState<string | null>(null);

  const deleteAccount = async () => {
    setDeleteMsg(null);
    if (phrase !== DELETE_PHRASE) {
      setDeleteMsg(`Type exactly: ${DELETE_PHRASE}`);
      return;
    }
    setDeleteBusy(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirmPhrase: DELETE_PHRASE }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not delete account");
      await signOut(auth);
      router.replace("/");
    } catch (e) {
      setDeleteMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setDeleteBusy(false);
    }
  };

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const adminTabs: {
    id: SettingsTabId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: "campus", label: "Campus Geofence", icon: MapPin },
    { id: "sections", label: "Classes & Sections", icon: Layers },
    { id: "wings", label: "Wings & Roles", icon: Building2 },
    { id: "profile", label: "Profile & Account", icon: UserIcon },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-3 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Profile, onboarding parameters, and school configuration.
        </p>
      </div>

      {/* Pill Tab Bar Matching User Reference Design */}
      {isAdmin && (
        <div className="flex items-center overflow-x-auto pb-1 no-scrollbar">
          <div className="inline-flex items-center gap-1.5 p-1.5 rounded-full bg-zinc-100/90 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/60 shadow-xs backdrop-blur-sm">
            {adminTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs sm:text-sm font-semibold transition-all shrink-0 cursor-pointer",
                    isActive
                      ? "bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-zinc-900"
                      : "text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700/60 dark:hover:text-zinc-100"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Admin School Configuration Tab Content */}
      {isAdmin && (
        <div className={activeTab === "profile" ? "hidden" : "block"}>
          <AdminOnboardingSettings
            activeTab={activeTab === "profile" ? "campus" : (activeTab as SchoolConfigTab)}
            onTabChange={(t) => setActiveTab(t)}
            hideHeaderTabs
          />
        </div>
      )}

      {/* Profile & Account Tab Content */}
      {(!isAdmin || activeTab === "profile") && (
        <div className="grid gap-4 md:gap-6 lg:grid-cols-3 lg:items-start">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
              <CardDescription>Quick snapshot of your account.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex flex-wrap items-center gap-4" aria-hidden>
                  <Skeleton className="size-16 shrink-0 rounded-2xl sm:size-[4.5rem]" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-56" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ) : user ? (
                <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                  <span
                    className={cn(
                      "flex size-16 shrink-0 items-center justify-center rounded-2xl sm:size-[4.5rem]",
                      "bg-gradient-to-br from-violet-600 to-cyan-500 text-xl font-semibold text-white"
                    )}
                  >
                    {nameToInitials(user.name)}
                  </span>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="truncate text-lg font-medium text-zinc-900 dark:text-zinc-50">
                      {user.name}
                    </p>
                    <p className="truncate text-sm text-zinc-600 dark:text-zinc-400">{user.email}</p>
                    {user.employeeId ? (
                      <p className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
                        ID: <span className="font-semibold text-zinc-800 dark:text-zinc-200">{user.employeeId}</span>
                      </p>
                    ) : null}
                    <p className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                      <span>Role:</span>
                      <span className={roleBadgeClassNames(user.role)}>
                        {formatRoleDisplay(user.role)}
                      </span>
                    </p>
                    {user.designation ? (
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">
                        Designation: <span className="font-medium">{user.designation}</span>
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div>
            <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-400">Edit profile</h2>
            <SettingsProfileEditor />
          </div>
        </div>

        {isAdmin ? (
          <Card className="border-red-200 dark:border-red-500/25 lg:sticky lg:top-6 lg:self-start">
            <CardHeader>
              <CardTitle className="text-red-700 dark:text-red-400">Danger zone</CardTitle>
              <CardDescription>
                Permanently delete your account, Firestore profile, attendance
                history, and live tracking data. This cannot be undone.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className={formFieldLabelClass}>
                  Type{" "}
                  <strong className="font-bold text-zinc-950 dark:text-zinc-100">{DELETE_PHRASE}</strong>{" "}
                  to confirm
                </span>
                <Input
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  autoComplete="off"
                  placeholder={DELETE_PHRASE}
                  className="font-mono text-sm"
                />
              </label>
              {deleteMsg ? (
                <p className="text-sm font-medium text-red-700 dark:text-red-400">{deleteMsg}</p>
              ) : null}
              <Button
                type="button"
                variant="destructive"
                disabled={deleteBusy}
                onClick={() => void deleteAccount()}
              >
                {deleteBusy ? "Deleting…" : "Delete my account"}
              </Button>
            </CardContent>
          </Card>
        ) : null}
        </div>
      )}
    </div>
  );
}

