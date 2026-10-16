"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useDashboardUser } from "@/components/client/dashboard-user-context";

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useDashboardUser();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (loading || !user) return;
    const needsOnboarding = user.role === "employee" && !user.onboarded;
    const onOnboardingPage = pathname?.startsWith("/dashboard/onboarding") ?? false;
    if (needsOnboarding && !onOnboardingPage) {
      router.replace("/dashboard/onboarding");
      return;
    }
    if (!needsOnboarding && onOnboardingPage) {
      if (user.role === "admin" || user.role === "super_admin") {
        router.replace("/dashboard/admin");
      } else if (
        user.workspaceAccessStatus === "pending" ||
        user.workspaceAccessStatus === "rejected"
      ) {
        router.replace("/dashboard/waiting-approval");
      } else {
        router.replace("/");
      }
    }
  }, [loading, pathname, router, user]);

  return <>{children}</>;
}
