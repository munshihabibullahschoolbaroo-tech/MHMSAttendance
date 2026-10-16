"use client";

import { signOut } from "firebase/auth";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  CalendarClock,
  Clock,
  Home,
  LayoutDashboard,
  LogOut,
  Settings,
  ChevronDown,
  ChevronUp,
  Inbox,
  UserPlus,
  Users,
  X,
  FileDown,
  FileWarning,
  Sliders,
  GraduationCap,
  FileCheck,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/client/theme-toggle";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { MtesBrandLockup } from "@/components/client/mtes-brand-lockup";
import { MhmsMark } from "@/components/mhms-mark";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { Separator } from "@/components/ui/separator";

type Props = {
  mobileOpen: boolean;
  onCloseMobile: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

export function DashboardSidebar({
  mobileOpen,
  onCloseMobile,
  collapsed = false,
  onToggleCollapse,
}: Props) {
  const pathname = usePathname();
  const { user } = useDashboardUser();
  const [employeeSectionOpen, setEmployeeSectionOpen] = React.useState(false);
  const [adminSectionOpen, setAdminSectionOpen] = React.useState(true);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  /** Lock body scroll on mobile when drawer is open */
  React.useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  /** Keep the section that owns the current route expanded so the active link stays visible. */
  React.useEffect(() => {
    const p = pathname.replace(/\/$/, "") || "/";
    if (p === "/dashboard/employee" || p.startsWith("/dashboard/employee/")) {
      setEmployeeSectionOpen(true);
    }
    if (p === "/dashboard/admin" || p.startsWith("/dashboard/admin/")) {
      setAdminSectionOpen(true);
    }
  }, [pathname]);

  const isAdminLike =
    user?.role === "admin" ||
    user?.role === "super_admin";

  const employeeNav: { href: string; label: string; icon: typeof LayoutDashboard }[] = [
    { href: "/dashboard/employee/check-in", label: "Daily Attendance", icon: Clock },
    { href: "/dashboard/employee/students", label: "Student Attendance", icon: GraduationCap },
    { href: "/dashboard/employee/leaves", label: "Staff Leaves", icon: FileCheck },
    { href: "/dashboard/employee/requests/manual", label: "Missed Attendance", icon: FileWarning },
    { href: "/dashboard/employee/calendar", label: "Calendar", icon: Calendar },
    {
      href: "/dashboard/employee/working-hours",
      label: "My Attendance",
      icon: CalendarClock,
    },
  ];

  const adminBase = "/dashboard/admin";
  const adminSubLinks = React.useMemo(() => {
    const links: { href: string; label: string; icon: typeof LayoutDashboard }[] = [
      { href: adminBase, label: "Overview", icon: LayoutDashboard },
      { href: `${adminBase}/workers`, label: "Teachers", icon: Users },
      { href: `${adminBase}/leaves`, label: "Staff Leaves", icon: FileCheck },
      { href: `${adminBase}/students`, label: "Student Attendance", icon: GraduationCap },
      { href: `${adminBase}/school-config`, label: "School & Geofence", icon: Sliders },
      { href: `${adminBase}/requests`, label: "Requests", icon: Inbox },
      {
        href: `${adminBase}/working-hours`,
        label: "Attendance Records",
        icon: CalendarClock,
      },
      {
        href: `${adminBase}/reports`,
        label: "Reports & PDF",
        icon: FileDown,
      },
    ];
    if (user?.role === "super_admin") {
      links.push({ href: `${adminBase}/team`, label: "Team & Admins", icon: UserPlus });
    }
    return links;
  }, [user?.role]);

  function adminLinkActive(href: string): boolean {
    const p = pathname.replace(/\/$/, "") || "/";
    if (href === adminBase) return p === adminBase;
    return p === href.replace(/\/$/, "") || p.startsWith(`${href.replace(/\/$/, "")}/`);
  }

  function employeeLinkActive(href: string): boolean {
    const p = pathname.replace(/\/$/, "") || "/";
    const h = href.replace(/\/$/, "") || "/";
    return p === h || p.startsWith(`${h}/`);
  }

  const bottomLinks = [
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
    { href: "/", label: "Home", icon: Home },
  ];

  /** Navigation items list (used in expanded desktop mode and in mobile drawer) */
  const renderNavItems = (isMobile: boolean) => (
    <div className="flex flex-col gap-1 w-full">
      {/* Teacher Section */}
      <button
        type="button"
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition-colors cursor-pointer",
          "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/5"
        )}
        aria-expanded={employeeSectionOpen}
        onClick={() => setEmployeeSectionOpen((o) => !o)}
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
          Teacher
        </span>
        {employeeSectionOpen ? (
          <ChevronUp className="size-4 shrink-0 text-zinc-500" aria-hidden />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-zinc-500" aria-hidden />
        )}
      </button>

      {employeeSectionOpen &&
        employeeNav.map(({ href, label, icon: Icon }) => {
          const active = employeeLinkActive(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => isMobile && onCloseMobile()}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-zinc-200/90 text-zinc-900 font-bold shadow-[0_0_20px_-8px_rgba(34,211,238,0.35)] dark:bg-white/10 dark:text-white dark:shadow-[0_0_20px_-8px_rgba(34,211,238,0.5)]"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100"
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span>{label}</span>
            </Link>
          );
        })}

      {/* Admin Section */}
      {isAdminLike ? (
        <div className="space-y-1 pt-1.5">
          <button
            type="button"
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition-colors cursor-pointer",
              "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/5"
            )}
            aria-expanded={adminSectionOpen}
            onClick={() => setAdminSectionOpen((o) => !o)}
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
              Admin
            </span>
            {adminSectionOpen ? (
              <ChevronUp className="size-4 shrink-0 text-zinc-500" aria-hidden />
            ) : (
              <ChevronDown className="size-4 shrink-0 text-zinc-500" aria-hidden />
            )}
          </button>
          {adminSectionOpen &&
            adminSubLinks.map(({ href, label, icon: Icon }) => {
              const active = adminLinkActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => isMobile && onCloseMobile()}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl py-2 pl-3 pr-2 text-xs font-medium transition-colors md:text-[13px]",
                    active
                      ? "bg-zinc-200/90 text-zinc-900 font-bold shadow-[0_0_16px_-8px_rgba(34,211,238,0.3)] dark:bg-white/10 dark:text-white dark:shadow-[0_0_16px_-8px_rgba(34,211,238,0.45)]"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100"
                  )}
                >
                  <Icon className="size-3.5 shrink-0 opacity-90 md:size-4" />
                  <span className="leading-tight">{label}</span>
                </Link>
              );
            })}
        </div>
      ) : null}

      {/* Bottom Nav Links */}
      <div className="pt-1 mt-1 space-y-1">
        <Separator className="my-2" />
        {bottomLinks.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => isMobile && onCloseMobile()}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-zinc-200/90 text-zinc-900 font-bold dark:bg-white/10 dark:text-white"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100"
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      {/* ─── DESKTOP STATIC SIDEBAR (screen >= md) ─────────────────────────── */}
      <aside
        className={cn(
          "hidden md:flex fixed inset-y-0 left-0 z-0 h-screen flex-shrink-0 flex-col border-r border-zinc-200/90 bg-zinc-50/98 py-5 transition-[width,padding] duration-300 md:static dark:border-white/10 dark:bg-black/40",
          collapsed ? "w-[70px] px-1.5" : "w-[276px] px-4"
        )}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between gap-2 px-1 md:mb-5">
          {collapsed ? (
            <div className="flex w-full flex-col items-center gap-2">
              <Link
                href="/dashboard"
                title="MHMS Attendance"
                className="flex size-11 items-center justify-center rounded-2xl p-0.5 transition-transform hover:scale-105"
              >
                <MhmsMark className="size-10 drop-shadow" />
              </Link>
              {onToggleCollapse && (
                <div className="group relative flex items-center justify-center">
                  <button
                    type="button"
                    onClick={onToggleCollapse}
                    className="flex size-8 items-center justify-center rounded-xl border border-zinc-200/80 bg-zinc-100/80 text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-200 hover:text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:border-white/20 dark:hover:bg-white/10 dark:hover:text-zinc-100 shadow-2xs cursor-pointer"
                    aria-label="Expand sidebar"
                  >
                    <PanelLeftOpen className="size-4" />
                  </button>
                  <span className="pointer-events-none fixed left-[76px] z-[100050] hidden whitespace-nowrap rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white shadow-2xl group-hover:block dark:bg-zinc-100 dark:text-zinc-900 border border-zinc-700/60 dark:border-zinc-300">
                    Expand sidebar
                  </span>
                </div>
              )}
              <Separator className="my-1.5 w-8" />
            </div>
          ) : (
            <>
              <MtesBrandLockup variant="sidebar" className="min-w-0 flex-1" showLogo />
              {onToggleCollapse && (
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  className="size-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200/80 bg-zinc-100/60 text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100 flex cursor-pointer"
                  title="Collapse sidebar"
                  aria-label="Collapse sidebar"
                >
                  <PanelLeftClose className="size-4" />
                </button>
              )}
            </>
          )}
        </div>

        {/* Navigation list */}
        <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {collapsed ? (
            <div className="flex w-full flex-col items-center gap-1.5">
              {employeeNav.map(({ href, label, icon: Icon }) => {
                const active = employeeLinkActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-label={label}
                    className={cn(
                      "group relative flex size-10 items-center justify-center rounded-xl transition-all",
                      active
                        ? "bg-zinc-200/90 text-zinc-900 shadow-[0_0_20px_-8px_rgba(34,211,238,0.35)] dark:bg-white/10 dark:text-white dark:shadow-[0_0_20px_-8px_rgba(34,211,238,0.5)] font-semibold"
                        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100"
                    )}
                  >
                    <Icon className="size-5 shrink-0" />
                    <span className="pointer-events-none fixed left-[76px] z-[100050] hidden whitespace-nowrap rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white shadow-2xl group-hover:block dark:bg-zinc-100 dark:text-zinc-900 border border-zinc-700/60 dark:border-zinc-300">
                      {label}
                    </span>
                  </Link>
                );
              })}

              {isAdminLike ? (
                <>
                  <Separator className="my-1.5 w-6" />
                  {adminSubLinks.map(({ href, label, icon: Icon }) => {
                    const active = adminLinkActive(href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        aria-label={label}
                        className={cn(
                          "group relative flex size-10 items-center justify-center rounded-xl transition-all",
                          active
                            ? "bg-zinc-200/90 text-zinc-900 shadow-[0_0_16px_-8px_rgba(34,211,238,0.3)] dark:bg-white/10 dark:text-white dark:shadow-[0_0_16px_-8px_rgba(34,211,238,0.45)] font-semibold"
                            : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100"
                        )}
                      >
                        <Icon className="size-4.5 shrink-0" />
                        <span className="pointer-events-none fixed left-[76px] z-[100050] hidden whitespace-nowrap rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white shadow-2xl group-hover:block dark:bg-zinc-100 dark:text-zinc-900 border border-zinc-700/60 dark:border-zinc-300">
                          {label}
                        </span>
                      </Link>
                    );
                  })}
                </>
              ) : null}

              <Separator className="my-1.5 w-6" />

              {bottomLinks.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-label={label}
                    className={cn(
                      "group relative flex size-10 items-center justify-center rounded-xl transition-all",
                      active
                        ? "bg-zinc-200/90 text-zinc-900 dark:bg-white/10 dark:text-white"
                        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100"
                    )}
                  >
                    <Icon className="size-5 shrink-0" />
                    <span className="pointer-events-none fixed left-[76px] z-[100050] hidden whitespace-nowrap rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white shadow-2xl group-hover:block dark:bg-zinc-100 dark:text-zinc-900 border border-zinc-700/60 dark:border-zinc-300">
                      {label}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            renderNavItems(false)
          )}
        </nav>

        {/* Footer */}
        {collapsed ? (
          <div className="mt-auto flex flex-col items-center gap-2 pt-2">
            <Separator className="mb-1" />
            <div className="group relative flex items-center justify-center">
              <ThemeToggle />
              <span className="pointer-events-none fixed left-[76px] z-[100050] hidden whitespace-nowrap rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white shadow-2xl group-hover:block dark:bg-zinc-100 dark:text-zinc-900 border border-zinc-700/60 dark:border-zinc-300">
                Theme
              </span>
            </div>
            <div className="group relative flex items-center justify-center">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="size-9 rounded-xl text-zinc-500 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400 cursor-pointer"
                aria-label="Sign out"
                onClick={() => void signOut(getFirebaseAuth())}
              >
                <LogOut className="size-4" />
              </Button>
              <span className="pointer-events-none fixed left-[76px] z-[100050] hidden whitespace-nowrap rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white shadow-2xl group-hover:block dark:bg-zinc-100 dark:text-zinc-900 border border-zinc-700/60 dark:border-zinc-300">
                Sign out
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-auto flex flex-col gap-3 pt-2">
            <Separator className="mb-1" />
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-zinc-500">Theme</span>
              <ThemeToggle />
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-full justify-start gap-2 rounded-xl"
              onClick={() => void signOut(getFirebaseAuth())}
            >
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        )}
      </aside>

      {/* ─── MOBILE ANIMATED DRAWER (screen < md) via framer-motion ────────── */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {mobileOpen && (
              <div className="fixed inset-0 z-[1200] md:hidden">
                {/* Backdrop Blur */}
                <motion.div
                  key="mobile-sidebar-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.24, ease: "easeOut" }}
                  className="fixed inset-0 bg-black/65 backdrop-blur-xs"
                  onClick={onCloseMobile}
                  aria-hidden="true"
                />

                {/* Sliding Mobile Drawer with Spring Physics */}
                <motion.aside
                  key="mobile-sidebar-drawer"
                  initial={{ x: "-100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "-100%" }}
                  transition={{
                    type: "spring",
                    damping: 28,
                    stiffness: 300,
                    mass: 0.8,
                  }}
                  className="fixed inset-y-0 left-0 z-10 flex w-[min(85vw,300px)] flex-col border-r border-zinc-200/90 bg-white/98 py-4 px-3.5 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-zinc-950/98"
                >
                  {/* Mobile Header with Brand & Close Button */}
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <MtesBrandLockup variant="sidebar" className="min-w-0 pr-1 flex-1" showLogo />
                    <motion.button
                      whileTap={{ scale: 0.88 }}
                      type="button"
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/20 transition-colors cursor-pointer"
                      aria-label="Close menu"
                      onClick={onCloseMobile}
                    >
                      <X className="size-4.5" />
                    </motion.button>
                  </div>
                  <Separator className="mb-3" />

                  {/* Mobile Nav Links */}
                  <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    {renderNavItems(true)}
                  </nav>

                  {/* Mobile Footer */}
                  <div className="mt-auto flex flex-col gap-3 pt-2">
                    <Separator className="mb-1" />
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-medium text-zinc-500">Theme</span>
                      <ThemeToggle />
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full justify-start gap-2 rounded-xl"
                      onClick={() => {
                        onCloseMobile();
                        void signOut(getFirebaseAuth());
                      }}
                    >
                      <LogOut className="size-4" />
                      Sign out
                    </Button>
                  </div>
                </motion.aside>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
