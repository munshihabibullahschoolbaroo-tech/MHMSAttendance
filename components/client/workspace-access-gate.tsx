"use client";

import * as React from "react";
import { signOut } from "firebase/auth";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { useDashboardUser } from "@/components/client/dashboard-user-context";

import { usePathname, useRouter } from "next/navigation";

export function WorkspaceAccessGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useDashboardUser();
  const router = useRouter();
  const pathname = usePathname();

  const blockState = React.useMemo(() => {
    if (loading || !user) return null;
    if (user.role !== "employee") return null;
    const s = user.workspaceAccessStatus;
    if (s === "pending") return "pending" as const;
    if (s === "rejected") return "rejected" as const;
    return null;
  }, [loading, user]);

  React.useEffect(() => {
    if (loading || !user) return;

    // If employee needs onboarding, let OnboardingGate handle routing to /dashboard/onboarding
    if (user.role === "employee" && !user.onboarded) return;

    const isWaitingRoute = pathname?.startsWith("/dashboard/waiting-approval") ?? false;
    const isOnboardingRoute = pathname?.startsWith("/dashboard/onboarding") ?? false;

    if (blockState !== null) {
      // Pending or rejected: must be on /dashboard/waiting-approval
      if (!isWaitingRoute && !isOnboardingRoute) {
        router.replace("/dashboard/waiting-approval");
      }
    } else {
      // User is approved (or admin): if currently on /dashboard/waiting-approval, take them Home
      if (isWaitingRoute) {
        router.replace("/");
      }
    }
  }, [loading, user, blockState, pathname, router]);

  // If pending/rejected and not on waiting-approval yet, show loading spinner while redirect completes
  if (
    blockState !== null &&
    !pathname?.startsWith("/dashboard/waiting-approval") &&
    !pathname?.startsWith("/dashboard/onboarding")
  ) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return <>{children}</>;
}
