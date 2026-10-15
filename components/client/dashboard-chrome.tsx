"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { motion } from "framer-motion";
import { DashboardSidebar } from "@/components/client/dashboard-sidebar";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { NotificationsDropdown } from "@/components/client/notifications-dropdown";
import { UserAccountDropdown } from "@/components/client/user-account-dropdown";

export function DashboardChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useDashboardUser();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  React.useEffect(() => {
    // Check saved user preference first
    const saved = localStorage.getItem("mhms_sidebar_collapsed");
    if (saved !== null) {
      setIsCollapsed(saved === "true");
    } else {
      // Default to collapsed on tablets and screen widths <= 1400px (e.g. 1920x1200 tablets, iPad Pro)
      if (typeof window !== "undefined" && window.innerWidth <= 1400) {
        setIsCollapsed(true);
      }
    }
  }, []);

  const handleToggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("mhms_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  // During onboarding, provide full-screen immersive view without sidebar distractions
  if (pathname?.startsWith("/dashboard/onboarding")) {
    return (
      <div className="min-h-screen w-full bg-background text-foreground overflow-y-auto">
        {children}
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] min-h-0 w-full overflow-hidden bg-background text-foreground">
      <DashboardSidebar
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        collapsed={isCollapsed}
        onToggleCollapse={handleToggleCollapse}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile-only menu bar (drawer toggle on phones; profile & notifications on right) */}
        <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-zinc-200/80 bg-background/90 px-3 backdrop-blur-md dark:border-white/10 md:hidden z-30">
          <div className="flex items-center gap-2 min-w-0">
            <motion.button
              whileTap={{ scale: 0.9 }}
              type="button"
              className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200/90 bg-white/80 text-foreground dark:border-white/10 dark:bg-white/5 shadow-2xs hover:border-zinc-300 dark:hover:border-white/20 transition-colors cursor-pointer"
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="size-5" />
            </motion.button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <NotificationsDropdown />
            {loading ? (
              <div className="h-8 w-16 animate-pulse rounded-full bg-zinc-200 dark:bg-white/10" />
            ) : user ? (
              <UserAccountDropdown user={user} />
            ) : null}
          </div>
        </div>

        {/* Dashboard main page content starts directly from the top on desktop */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  );
}
