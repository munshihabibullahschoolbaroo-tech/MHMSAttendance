"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AdminLoginAccessPanel } from "@/components/client/admin-login-access-panel";
import { AdminManualPunchRequestsPanel } from "@/components/client/admin-manual-punch-requests-panel";
import { AdminClassSwitchRequestsPanel } from "@/components/client/admin-class-switch-requests-panel";
import { AdminClassAssignmentRequestsPanel } from "@/components/client/admin-class-assignment-requests-panel";

const TABS = ["login", "manual_punch", "class_switch", "class_assignment"] as const;
type Tab = (typeof TABS)[number];

function normalizeTab(raw: string | null): Tab {
  if (raw === "manual_punch" || raw === "login" || raw === "class_switch" || raw === "class_assignment") return raw;
  return "login";
}

const TAB_LABEL: Record<Tab, string> = {
  login: "Staff Approvals",
  manual_punch: "Missed & Late Sign-Out",
  class_switch: "Class Switch Requests",
  class_assignment: "Class Teacher Assignments",
};

export function AdminRequestsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = normalizeTab(searchParams.get("tab"));

  const setTab = React.useCallback(
    (next: Tab) => {
      router.replace(`${pathname}?tab=${next}`, { scroll: false });
    },
    [pathname, router]
  );

  return (
    <div className="p-3 md:p-8">
      <div className="mb-6 md:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Requests & Approvals</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Review staff onboarding access, missed attendance & late sign-out approvals, and teacher class switch requests.
          </p>
        </div>
        <Button asChild variant="outline" className="shrink-0 gap-2">
          <Link href="/dashboard/admin/leaves">
            Review Leave Applications →
          </Link>
        </Button>
      </div>

      <div
        role="tablist"
        aria-label="Request categories"
        className="mb-6 flex flex-wrap gap-2 border-b border-zinc-200/90 pb-3 dark:border-white/10"
      >
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-medium transition-colors",
              tab === t
                ? "bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200/90 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/10"
            )}
            onClick={() => setTab(t)}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === "login" ? <AdminLoginAccessPanel /> : null}
        {tab === "manual_punch" ? <AdminManualPunchRequestsPanel embedded /> : null}
        {tab === "class_switch" ? <AdminClassSwitchRequestsPanel embedded /> : null}
        {tab === "class_assignment" ? <AdminClassAssignmentRequestsPanel embedded /> : null}
      </div>
    </div>
  );
}
