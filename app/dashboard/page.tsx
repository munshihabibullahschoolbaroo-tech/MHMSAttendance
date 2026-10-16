"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { Loader2 } from "lucide-react";

export default function DashboardRootPage() {
  const { user, loading } = useDashboardUser();
  const router = useRouter();

  React.useEffect(() => {
    if (loading || !user) return;
    if (user.role === "admin" || user.role === "super_admin") {
      router.replace("/dashboard/admin");
      return;
    }
    if (user.role === "employee") {
      if (!user.onboarded) {
        router.replace("/dashboard/onboarding");
        return;
      }
      if (
        user.workspaceAccessStatus === "pending" ||
        user.workspaceAccessStatus === "rejected"
      ) {
        router.replace("/dashboard/waiting-approval");
        return;
      }
      router.replace("/");
    }
  }, [user, loading, router]);

  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="size-6 animate-spin text-zinc-400" />
    </div>
  );
}
