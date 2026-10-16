"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Search,
  Trash2,
  X,
  AlertCircle,
  GraduationCap,
  CheckCircle2,
  FileCheck,
  Bell,
  Loader2,
  Users,
  School,
  Sparkles,
} from "lucide-react";
import { AttendanceCalendar } from "@/components/client/attendance-calendar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { TableRowsSkeleton } from "@/components/client/dashboard-skeletons";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { DangerConfirmModal } from "@/components/client/danger-confirm-modal";

const TABLE_PAGE_SIZE = 15;

export type WingTab = "all" | "higher" | "lower" | "rewa_na_kasco";

export const WING_TABS: {
  key: WingTab;
  label: string;
  badgeLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}[] = [
  {
    key: "all",
    label: "All Members",
    icon: Users,
    description: "All registered teachers and staff members",
  },
  {
    key: "higher",
    label: "Higher",
    badgeLabel: "1st–12th",
    icon: GraduationCap,
    description: "Higher School Wing (Classes 1st to 12th)",
  },
  {
    key: "lower",
    label: "Lower",
    badgeLabel: "Pre-Nur–UKG",
    icon: School,
    description: "Lower School Wing (Pre-Nursery to UKG)",
  },
  {
    key: "rewa_na_kasco",
    label: "Rewa na Kasco",
    badgeLabel: "Special Wing",
    icon: Sparkles,
    description: "Rewa na Kasco / Khasko Special & Vocational Wing",
  },
];

export function getUserWing(u: {
  schoolWingId?: string | null;
  schoolClassId?: string | null;
  designation?: string | null;
  position?: string | null;
}): "higher" | "lower" | "rewa_na_kasco" | null {
  const raw = (u.schoolWingId || "").trim().toLowerCase();
  if (raw === "higher" || raw.includes("higher")) return "higher";
  if (raw === "lower" || raw.includes("lower")) return "lower";
  if (
    raw === "rewa_na_kasco" ||
    raw === "rewa na kasco" ||
    raw.includes("rewa") ||
    raw.includes("kasco") ||
    raw.includes("khasko")
  ) {
    return "rewa_na_kasco";
  }

  // Fallback heuristic based on class id
  const cid = (u.schoolClassId || "").trim().toLowerCase();
  if (cid) {
    if (["pre-nursery", "nursery", "lkg", "ukg"].some((k) => cid.includes(k))) return "lower";
    if (cid.includes("class") || cid.includes("grade") || cid.match(/\b([1-9]|1[0-2])\b/)) return "higher";
    if (cid.includes("vocational") || cid.includes("rewa")) return "rewa_na_kasco";
  }

  // Fallback heuristic based on designation/position
  const desig = `${u.designation || ""} ${u.position || ""}`.toLowerCase();
  if (
    desig.includes("ntt") ||
    desig.includes("nursery") ||
    desig.includes("kindergarten") ||
    desig.includes("pre-primary")
  ) {
    return "lower";
  }
  if (desig.includes("pgt") || desig.includes("tgt") || desig.includes("lecturer")) return "higher";
  if (
    desig.includes("rewa") ||
    desig.includes("kasco") ||
    desig.includes("khasko") ||
    desig.includes("vocational") ||
    desig.includes("handicraft")
  ) {
    return "rewa_na_kasco";
  }

  return null;
}

type Row = {
  id: string;
  employeeId?: string;
  name: string;
  email: string;
  role: string;
  phone?: string | null;
  schoolWingId?: string | null;
  position?: string | null;
  designation?: string | null;
  isClassTeacher?: boolean;
  schoolClassId?: string | null;
  schoolSectionId?: string | null;
  hasPendingLeave?: boolean;
  pendingLeave?: {
    id: string;
    type: string;
    startDate: string;
    endDate: string;
    reason: string;
    documentUrl?: string | null;
    createdAt?: unknown;
  } | null;
  onLeaveToday?: boolean;
  todayLeaveType?: string | null;
  activeLeave?: {
    id: string;
    type: string;
    startDate: string;
    endDate: string;
    reason: string;
    status: string;
    adminNotes?: string | null;
    reviewedByEmail?: string | null;
  } | null;
  workspaceAccessStatus?: "pending" | "approved" | "rejected";
  assignedSites?: string[];
};

function useBodyScrollLock(active: boolean) {
  React.useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}

export function AdminUsersPanel() {
  const searchParams = useSearchParams();
  const { user: viewer } = useDashboardUser();
  const [users, setUsers] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [assignWorker, setAssignWorker] = React.useState<Row | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Row | null>(null);
  const [bulkDeleteTargets, setBulkDeleteTargets] = React.useState<Row[] | null>(null);
  const [deletePhrase, setDeletePhrase] = React.useState("");
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [activeWingTab, setActiveWingTab] = React.useState<WingTab>("all");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = React.useState<string[]>([]);
  const [page, setPage] = React.useState(1);
  const [archiveBusy, setArchiveBusy] = React.useState(false);

  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const [calendarWorkerId, setCalendarWorkerId] = React.useState("");
  const [selectedTeacher, setSelectedTeacher] = React.useState<Row | null>(null);

  // Leave review / inspection state
  const [leaveReviewTarget, setLeaveReviewTarget] = React.useState<{
    teacher: Row;
    leave: {
      id: string;
      type: string;
      startDate: string;
      endDate: string;
      reason: string;
      status?: string;
      documentUrl?: string | null;
      adminNotes?: string | null;
      reviewedByEmail?: string | null;
    };
    isPending: boolean;
  } | null>(null);
  const [reviewBusy, setReviewBusy] = React.useState(false);
  const [rejectNotes, setRejectNotes] = React.useState("");
  const [showRejectBox, setShowRejectBox] = React.useState(false);

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  useBodyScrollLock(calendarOpen || selectedTeacher != null || leaveReviewTarget != null);

  const approveAccess = async (workerId: string) => {
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const res = await fetch("/api/admin/workspace-access", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workerId, action: "approve" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to approve access");
      toast.success("Teacher workspace access approved!");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to approve access");
    }
  };


  React.useEffect(() => {
    if (!calendarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCalendarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [calendarOpen]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const res = await fetch("/api/admin/users?fresh=1", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { users?: Row[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load users");
      const list = data.users ?? [];
      setUsers(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleReviewLeave = async (leaveId: string, action: "approve" | "reject", notes?: string) => {
    setReviewBusy(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const res = await fetch("/api/school/leave/review", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ leaveId, action, notes: notes || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to review leave application");

      toast.success(
        action === "approve"
          ? "Leave application approved successfully!"
          : "Leave application marked as rejected."
      );
      setLeaveReviewTarget(null);
      setShowRejectBox(false);
      setRejectNotes("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error reviewing leave");
    } finally {
      setReviewBusy(false);
    }
  };

  React.useEffect(() => {
    void load();
  }, [load]);

  const firstCalendarUserId = React.useMemo(() => {
    const emp = users.find((r) => r.role === "employee");
    return emp?.id ?? users[0]?.id ?? "";
  }, [users]);

  React.useEffect(() => {
    const w = searchParams.get("worker")?.trim();
    if (!w || users.length === 0) return;
    if (users.some((u) => u.id === w)) {
      setCalendarWorkerId(w);
      setCalendarOpen(true);
    }
  }, [searchParams, users]);

  const openCalendarFor = (workerId: string) => {
    setCalendarWorkerId(workerId);
    setCalendarOpen(true);
  };

  const wingCounts = React.useMemo(() => {
    let higher = 0;
    let lower = 0;
    let rewa = 0;
    for (const u of users) {
      const w = getUserWing(u);
      if (w === "higher") higher++;
      else if (w === "lower") lower++;
      else if (w === "rewa_na_kasco") rewa++;
    }
    return {
      all: users.length,
      higher,
      lower,
      rewa_na_kasco: rewa,
    };
  }, [users]);

  const filteredUsers = React.useMemo(() => {
    let list = users;
    if (activeWingTab !== "all") {
      list = list.filter((u) => getUserWing(u) === activeWingTab);
    }
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => {
      const fields = [
        r.name,
        r.email,
        r.role,
        r.id,
        r.employeeId ?? "",
        r.designation ?? "",
        r.position ?? "",
        r.schoolWingId ?? "",
        r.schoolClassId ?? "",
      ];
      return fields.some((f) => (typeof f === "string" ? f : "").toLowerCase().includes(q));
    });
  }, [users, activeWingTab, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / TABLE_PAGE_SIZE));
  const paginatedUsers = React.useMemo(
    () => filteredUsers.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE),
    [filteredUsers, page]
  );

  React.useEffect(() => {
    setPage(1);
    setSelectedEmployeeIds([]);
  }, [searchQuery, activeWingTab]);

  React.useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const viewerId = viewer?.uid ?? "";

  const toggleSelectEmployee = (id: string) => {
    if (id === viewerId) return;
    setSelectedEmployeeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const deletableOnPage = React.useMemo(
    () => paginatedUsers.filter((r) => r.role === "employee" && r.id !== viewerId),
    [paginatedUsers, viewerId]
  );

  const allDeletablePageSelected =
    deletableOnPage.length > 0 &&
    deletableOnPage.every((r) => selectedEmployeeIds.includes(r.id));

  const toggleSelectAllDeletablePage = () => {
    const ids = deletableOnPage.map((r) => r.id);
    if (allDeletablePageSelected) {
      setSelectedEmployeeIds((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      setSelectedEmployeeIds((prev) => [...new Set([...prev, ...ids])]);
    }
  };

  const canManageAdmins = viewer?.role === "super_admin";
  const canDeleteUsers = viewer?.role === "admin" || viewer?.role === "super_admin";

  const [demoteTarget, setDemoteTarget] = React.useState<{ email: string; name: string } | null>(null);
  const [demoting, setDemoting] = React.useState(false);

  const confirmDemoteAdmin = async () => {
    if (!demoteTarget) return;
    setDemoting(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const res = await fetch("/api/admin/demote-admin", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: demoteTarget.email }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to demote admin");
      toast.success("Admin privileges removed");
      await load();
      setDemoteTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to demote admin");
    } finally {
      setDemoting(false);
    }
  };

  const deleteEmployeeRequest = async (userId: string) => {
    const auth = getFirebaseAuth();
    const u = auth.currentUser;
    if (!u) throw new Error("Not signed in");
    const token = await u.getIdToken();
    const res = await fetch("/api/admin/delete-user", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId, confirmPhrase: "DELETE EMPLOYEE" }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Failed");
  };

  const deleteUser = async () => {
    if (!deleteTarget) return;
    if (deletePhrase.trim().toUpperCase() !== "DELETE EMPLOYEE") {
      setDeleteError("Please type exactly: DELETE EMPLOYEE");
      return;
    }
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const uid = deleteTarget.id;
      const targetName = deleteTarget.name || deleteTarget.email;
      await deleteEmployeeRequest(uid);
      setDeleteTarget(null);
      setDeletePhrase("");
      setSelectedEmployeeIds((prev) => prev.filter((id) => id !== uid));
      toast.success(`Deleted ${targetName}. All records and credentials purged.`);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to delete employee";
      setDeleteError(msg);
      toast.error(msg);
    } finally {
      setDeleteBusy(false);
    }
  };

  const deleteBulkEmployees = async () => {
    if (!bulkDeleteTargets?.length) return;
    if (deletePhrase.trim().toUpperCase() !== "DELETE EMPLOYEE") {
      setDeleteError("Please type exactly: DELETE EMPLOYEE");
      return;
    }
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const count = bulkDeleteTargets.length;
      for (const row of bulkDeleteTargets) {
        await deleteEmployeeRequest(row.id);
      }
      const removed = new Set(bulkDeleteTargets.map((r) => r.id));
      setSelectedEmployeeIds((prev) => prev.filter((id) => !removed.has(id)));
      setBulkDeleteTargets(null);
      setDeletePhrase("");
      toast.success(`Successfully purged ${count} employees and all associated records.`);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to delete some employees";
      setDeleteError(msg);
      toast.error(msg);
    } finally {
      setDeleteBusy(false);
    }
  };

  const downloadWorkersArchive = async () => {
    setArchiveBusy(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const res = await fetch("/api/admin/export-workers-archive", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mhms-teachers-archive-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to download archive");
    } finally {
      setArchiveBusy(false);
    }
  };

  const calendarWorker = users.find((r) => r.id === calendarWorkerId);
  const calendarTitle = calendarWorker
    ? `Attendance — ${calendarWorker.name || calendarWorker.email}`
    : "Attendance calendar";

  const calendarModal =
    calendarOpen && mounted && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[1350] flex flex-col items-stretch justify-end sm:justify-center sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="workers-calendar-title"
          >
            <button
              type="button"
              className="absolute inset-0 bg-zinc-950/75 backdrop-blur-sm"
              aria-label="Close calendar"
              onClick={() => setCalendarOpen(false)}
            />
            <div
              className={cn(
                "relative z-[1] flex max-h-[min(92dvh,880px)] flex-col rounded-t-2xl border border-white/15 bg-zinc-950 shadow-2xl sm:mx-auto sm:max-w-lg sm:rounded-2xl md:max-w-xl lg:max-w-3xl"
              )}
            >
              <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
                <div className="min-w-0">
                  <h2 id="workers-calendar-title" className="text-lg font-semibold text-zinc-100">
                    Worker attendance calendar
                  </h2>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Search a user, then tap a day to open their timeline.
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
                  aria-label="Close"
                  onClick={() => setCalendarOpen(false)}
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
                <label className="mb-3 block text-sm">
                  <span className="text-zinc-400">Worker</span>
                  <SearchableSelect
                    value={calendarWorkerId}
                    onValueChange={setCalendarWorkerId}
                    options={users.map((r) => ({
                      value: r.id,
                      label: r.employeeId?.trim()
                        ? `${r.employeeId} (${r.name?.trim() || "User"})`
                        : `${r.name?.trim() || "User"}`,
                      keywords: [r.employeeId ?? "", r.id, r.name ?? "", r.email ?? "", r.role],
                    }))}
                    emptyLabel="Select worker…"
                    searchPlaceholder="Search workers…"
                    triggerClassName="mt-1 h-10 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm"
                    popoverContentClassName="z-[1400]"
                    listClassName="max-h-[min(240px,40vh)]"
                  />
                </label>
                {calendarWorkerId ? (
                  <AttendanceCalendar
                    workerId={calendarWorkerId}
                    title={calendarTitle}
                    description={`Tap any day for the full timeline in their work time zone.`}
                    adminDayDetailBasePath="/dashboard/admin/workers"
                  />
                ) : (
                  <p className="text-sm text-zinc-500">Choose a worker to load the month view.</p>
                )}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  const leaveReviewModal =
    leaveReviewTarget && mounted && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[1400] flex items-center justify-center p-4 animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
          >
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => {
                if (reviewBusy) return;
                setLeaveReviewTarget(null);
                setShowRejectBox(false);
              }}
            />
            <Card className="relative z-[1] w-full max-w-lg border-zinc-200 shadow-2xl dark:border-white/10 dark:bg-zinc-950 overflow-hidden">
              {/* Header banner */}
              <div
                className={cn(
                  "px-5 py-4 flex items-center justify-between border-b",
                  leaveReviewTarget.isPending
                    ? "bg-amber-500/10 border-amber-500/20 text-amber-900 dark:text-amber-200"
                    : "bg-blue-500/10 border-blue-500/20 text-blue-900 dark:text-blue-200"
                )}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      "p-2 rounded-xl text-white shadow-xs",
                      leaveReviewTarget.isPending ? "bg-amber-600" : "bg-blue-600"
                    )}
                  >
                    <Bell className="size-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">
                      {leaveReviewTarget.isPending ? "Leave Application Review" : "Approved Leave Record"}
                    </h3>
                    <p className="text-[11px] opacity-80">
                      Munshi Habibullah Mission School • Staff Leave Portal
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (reviewBusy) return;
                    setLeaveReviewTarget(null);
                    setShowRejectBox(false);
                  }}
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-black/10 hover:text-zinc-100 transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>

              <CardContent className="p-5 space-y-4 text-xs">
                {/* Teacher Profile Summary */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200 dark:border-white/10">
                  <div className="size-11 rounded-xl bg-blue-600 text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-xs">
                    {leaveReviewTarget.teacher.name ? leaveReviewTarget.teacher.name.charAt(0).toUpperCase() : "T"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm truncate">
                      {leaveReviewTarget.teacher.name}
                    </h4>
                    <p className="text-zinc-500 truncate">{leaveReviewTarget.teacher.email}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-zinc-400">
                      <span className="capitalize font-medium text-zinc-300">
                        {leaveReviewTarget.teacher.designation || leaveReviewTarget.teacher.position || "Teacher"}
                      </span>
                      {leaveReviewTarget.teacher.schoolWingId && (
                        <span>• {leaveReviewTarget.teacher.schoolWingId.replace(/_/g, " ").toUpperCase()}</span>
                      )}
                      {leaveReviewTarget.teacher.isClassTeacher && leaveReviewTarget.teacher.schoolClassId && (
                        <span className="text-blue-500 font-medium">
                          • {leaveReviewTarget.teacher.schoolClassId} Incharge
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Leave Period & Type */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.02]">
                    <span className="text-[11px] text-zinc-400 font-medium">Leave Type</span>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-md text-xs font-bold uppercase",
                          leaveReviewTarget.leave.type === "medical"
                            ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                            : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                        )}
                      >
                        {leaveReviewTarget.leave.type} Leave
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.02]">
                    <span className="text-[11px] text-zinc-400 font-medium">Leave Duration</span>
                    <p className="mt-1 font-bold text-zinc-800 dark:text-zinc-200">
                      {leaveReviewTarget.leave.startDate} to {leaveReviewTarget.leave.endDate}
                    </p>
                  </div>
                </div>

                {/* Stated Reason */}
                <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/[0.02] space-y-1">
                  <span className="text-[11px] text-zinc-400 font-medium">Teacher&apos;s Application Reason:</span>
                  <p className="text-xs text-zinc-700 dark:text-zinc-300 italic whitespace-pre-wrap font-sans">
                    &ldquo;{leaveReviewTarget.leave.reason}&rdquo;
                  </p>
                </div>

                {/* Medical Document attached (if medical) */}
                {leaveReviewTarget.leave.documentUrl && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs">
                    <span className="font-medium text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                      <FileCheck className="size-4" /> Medical Certificate Attached
                    </span>
                    <a
                      href={leaveReviewTarget.leave.documentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[11px] transition-colors"
                    >
                      View Document
                    </a>
                  </div>
                )}

                {/* Status indicator if already approved */}
                {!leaveReviewTarget.isPending && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold">
                      <CheckCircle2 className="size-4 text-emerald-500" />
                      Leave is Approved & Currently Active
                    </div>
                    {leaveReviewTarget.leave.reviewedByEmail && (
                      <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
                        Approved by: {leaveReviewTarget.leave.reviewedByEmail}
                      </p>
                    )}
                  </div>
                )}

                {/* Reject note box */}
                {showRejectBox && (
                  <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 space-y-2">
                    <span className="text-[11px] font-semibold text-red-700 dark:text-red-300">
                      Reason for Not Approving (Sent to Teacher):
                    </span>
                    <Input
                      value={rejectNotes}
                      onChange={(e) => setRejectNotes(e.target.value)}
                      placeholder="e.g. Inadequate medical doc, or scheduled exam duty"
                      className="text-xs"
                      disabled={reviewBusy}
                    />
                  </div>
                )}

                {/* Actions */}
                <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 dark:border-white/10">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={reviewBusy}
                    onClick={() => {
                      setLeaveReviewTarget(null);
                      setShowRejectBox(false);
                    }}
                    className="text-xs"
                  >
                    Close
                  </Button>

                  {leaveReviewTarget.isPending ? (
                    <div className="flex items-center gap-2">
                      {!showRejectBox ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={reviewBusy}
                          onClick={() => setShowRejectBox(true)}
                          className="text-xs text-red-500 hover:text-red-400 border-red-500/30 hover:bg-red-500/10"
                        >
                          <X className="size-3.5 mr-1" />
                          Not Approve
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={reviewBusy}
                          onClick={() => void handleReviewLeave(leaveReviewTarget.leave.id, "reject", rejectNotes)}
                          className="text-xs"
                        >
                          {reviewBusy ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <X className="size-3.5 mr-1" />}
                          Confirm Rejection
                        </Button>
                      )}

                      <Button
                        type="button"
                        size="sm"
                        disabled={reviewBusy}
                        onClick={() => void handleReviewLeave(leaveReviewTarget.leave.id, "approve")}
                        className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs"
                      >
                        {reviewBusy ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                        Approve Leave
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={reviewBusy}
                      onClick={() => void handleReviewLeave(leaveReviewTarget.leave.id, "reject", "Revoked by admin")}
                      className="text-xs text-red-500 hover:text-red-400 border-red-500/30 hover:bg-red-500/10"
                    >
                      Revoke Leave
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="space-y-6">
      {calendarModal}
      {leaveReviewModal}

      {selectedTeacher && mounted && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[1350] flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-black/65 backdrop-blur-sm"
                onClick={() => setSelectedTeacher(null)}
              />
              <Card className="relative z-[1] w-full max-w-lg border-zinc-200 shadow-2xl dark:border-white/10 dark:bg-zinc-950">
                <CardHeader className="flex flex-row items-start justify-between pb-3">
                  <div>
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                      <GraduationCap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      Teacher Profile & Details
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Munshi Habibullah Mission School staff records
                    </CardDescription>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedTeacher(null)}
                    className="text-zinc-400 hover:text-zinc-100 p-1"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </CardHeader>
                <CardContent className="space-y-4 text-xs">
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10">
                    <div className="flex size-12 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-base shrink-0">
                      {selectedTeacher.name ? selectedTeacher.name.charAt(0).toUpperCase() : "T"}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-50 truncate">
                        {selectedTeacher.name}
                      </h3>
                      <p className="text-zinc-500 truncate">{selectedTeacher.email}</p>
                      {selectedTeacher.phone && (
                        <p className="text-zinc-400 font-mono text-[11px] mt-0.5">
                          Phone: {selectedTeacher.phone}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl border border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-white/[0.02]">
                      <span className="text-zinc-400 font-medium">School Wing / Branch</span>
                      <p className="font-semibold text-zinc-800 dark:text-zinc-200 text-xs mt-0.5 uppercase">
                        {selectedTeacher.schoolWingId
                          ? selectedTeacher.schoolWingId.replace(/_/g, " ")
                          : "Not Assigned"}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl border border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-white/[0.02]">
                      <span className="text-zinc-400 font-medium">Role & Position</span>
                      <p className="font-semibold text-zinc-800 dark:text-zinc-200 text-xs mt-0.5">
                        {selectedTeacher.designation ||
                          selectedTeacher.position ||
                          selectedTeacher.role}
                      </p>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl border border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-white/[0.02]">
                    <span className="text-zinc-400 font-medium">Class Teacher Responsibility</span>
                    <p className="font-semibold text-zinc-800 dark:text-zinc-200 text-xs mt-0.5">
                      {selectedTeacher.isClassTeacher && selectedTeacher.schoolClassId
                        ? `${selectedTeacher.schoolClassId} (${selectedTeacher.schoolSectionId ?? "Section A"})`
                        : "No class assigned"}
                    </p>
                  </div>

                  {selectedTeacher.onLeaveToday && (
                    <div className="flex items-center justify-between p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400">
                      <span className="flex items-center gap-1.5 font-semibold text-xs">
                        <FileCheck className="size-4 shrink-0" /> On Approved {selectedTeacher.todayLeaveType ? selectedTeacher.todayLeaveType.toUpperCase() : ""} Leave Today
                      </span>
                      {selectedTeacher.activeLeave ? (
                        <Button
                          size="sm"
                          variant="outline"
                          type="button"
                          onClick={() => {
                            const l = selectedTeacher.activeLeave!;
                            const t = selectedTeacher;
                            setSelectedTeacher(null);
                            setLeaveReviewTarget({
                              teacher: t,
                              leave: l,
                              isPending: false,
                            });
                          }}
                          className="h-7 text-xs border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
                        >
                          View Details
                        </Button>
                      ) : (
                        <Button asChild size="sm" variant="outline" className="h-7 text-xs border-blue-500/30">
                          <Link href="/dashboard/admin/leaves">View Leave Queue</Link>
                        </Button>
                      )}
                    </div>
                  )}

                  {selectedTeacher.hasPendingLeave && (
                    <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500">
                      <span className="flex items-center gap-1.5 font-semibold text-xs">
                        <Bell className="size-4 shrink-0 fill-amber-500/20" /> Pending leave application
                      </span>
                      {selectedTeacher.pendingLeave ? (
                        <Button
                          size="sm"
                          type="button"
                          onClick={() => {
                            const pl = selectedTeacher.pendingLeave!;
                            const t = selectedTeacher;
                            setSelectedTeacher(null);
                            setLeaveReviewTarget({
                              teacher: t,
                              leave: pl,
                              isPending: true,
                            });
                          }}
                          className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                        >
                          Review &amp; Approve
                        </Button>
                      ) : (
                        <Button asChild size="sm" variant="outline" className="h-7 text-xs border-amber-500/30">
                          <Link href="/dashboard/admin/leaves">Review Leaves</Link>
                        </Button>
                      )}
                    </div>
                  )}

                  <div className="pt-2 flex flex-wrap justify-end gap-2">
                    {selectedTeacher.workspaceAccessStatus === "pending" && (
                      <Button
                        type="button"
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                        onClick={() => {
                          const id = selectedTeacher.id;
                          setSelectedTeacher(null);
                          void approveAccess(id);
                        }}
                      >
                        Approve Workspace Access
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => {
                        const id = selectedTeacher.id;
                        setSelectedTeacher(null);
                        openCalendarFor(id);
                      }}
                    >
                      Attendance Calendar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>,
            document.body
          )
        : null}

      {deleteTarget && mounted && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[1360] flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-zinc-950/75 backdrop-blur-sm"
                aria-label="Close delete dialog"
                onClick={() => {
                  if (deleteBusy) return;
                  setDeleteTarget(null);
                  setDeletePhrase("");
                  setDeleteError(null);
                }}
              />
              <Card className="relative z-[1] w-full max-w-lg border-red-500/30 bg-zinc-950 text-zinc-100">
                <CardHeader>
                  <CardTitle className="text-red-400">Danger: Permanent Employee Deletion</CardTitle>
                  <CardDescription className="text-zinc-400">
                    Permanently delete <strong>{deleteTarget.name || deleteTarget.id}</strong> ({deleteTarget.email}).
                    This will permanently purge their profile, attendance, leaves, class allocations, live tracking, and Firebase auth account.
                    If they sign in again, they will be required to start onboarding from the beginning.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {deleteError ? (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-400">
                      {deleteError}
                    </div>
                  ) : null}
                  <label className="block text-sm">
                    <span className="mb-1 block text-zinc-400">
                      Type <strong className="text-zinc-100">DELETE EMPLOYEE</strong> to confirm
                    </span>
                    <input
                      value={deletePhrase}
                      onChange={(e) => {
                        setDeletePhrase(e.target.value);
                        if (deleteError) setDeleteError(null);
                      }}
                      className="w-full rounded-xl border border-red-500/30 bg-zinc-900 px-3 py-2 font-mono text-sm uppercase placeholder:normal-case"
                      placeholder="DELETE EMPLOYEE"
                      disabled={deleteBusy}
                    />
                  </label>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={deleteBusy}
                      onClick={() => {
                        setDeleteTarget(null);
                        setDeletePhrase("");
                        setDeleteError(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="button" variant="destructive" disabled={deleteBusy} onClick={() => void deleteUser()}>
                      {deleteBusy ? "Deleting..." : "Permanently Delete"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>,
            document.body
          )
        : null}

      {bulkDeleteTargets && bulkDeleteTargets.length > 0 && mounted && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[1360] flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-zinc-950/75 backdrop-blur-sm"
                aria-label="Close bulk delete dialog"
                onClick={() => {
                  if (deleteBusy) return;
                  setBulkDeleteTargets(null);
                  setDeletePhrase("");
                  setDeleteError(null);
                }}
              />
              <Card className="relative z-[1] w-full max-w-lg border-red-500/30 bg-zinc-950 text-zinc-100">
                <CardHeader>
                  <CardTitle className="text-red-400">Delete {bulkDeleteTargets.length} employees</CardTitle>
                  <CardDescription className="text-zinc-400">
                    Permanently wipe profile, attendance, leaves, class allocations, live tracking, and authentication for all selected employees. They will need to onboard afresh if they sign in again.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {deleteError ? (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-400">
                      {deleteError}
                    </div>
                  ) : null}
                  <ul className="max-h-36 list-inside list-disc overflow-y-auto text-sm text-zinc-300">
                    {bulkDeleteTargets.slice(0, 15).map((r) => (
                      <li key={r.id}>
                        {r.name || r.email} <span className="text-zinc-500">({r.email})</span>
                      </li>
                    ))}
                    {bulkDeleteTargets.length > 15 ? (
                      <li className="list-none text-zinc-500">…and {bulkDeleteTargets.length - 15} more</li>
                    ) : null}
                  </ul>
                  <label className="block text-sm">
                    <span className="mb-1 block text-zinc-400">
                      Type <strong className="text-zinc-100">DELETE EMPLOYEE</strong> to confirm
                    </span>
                    <input
                      value={deletePhrase}
                      onChange={(e) => {
                        setDeletePhrase(e.target.value);
                        if (deleteError) setDeleteError(null);
                      }}
                      className="w-full rounded-xl border border-red-500/30 bg-zinc-900 px-3 py-2 font-mono text-sm uppercase placeholder:normal-case"
                      placeholder="DELETE EMPLOYEE"
                      disabled={deleteBusy}
                    />
                  </label>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={deleteBusy}
                      onClick={() => {
                        setBulkDeleteTargets(null);
                        setDeletePhrase("");
                        setDeleteError(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={deleteBusy}
                      onClick={() => void deleteBulkEmployees()}
                    >
                      {deleteBusy ? "Deleting..." : `Delete ${bulkDeleteTargets.length}`}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>,
            document.body
          )
        : null}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Teachers & Staff</CardTitle>
            <CardDescription>
              All registered teacher and staff accounts from Firestore. Click any teacher row to view their complete profile and assigned details.
            </CardDescription>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={archiveBusy}
              onClick={() => void downloadWorkersArchive()}
            >
              {archiveBusy ? "Preparing archive..." : "Download teachers archive"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="shrink-0"
              onClick={() => {
                setCalendarWorkerId((id) => id || firstCalendarUserId);
                setCalendarOpen(true);
              }}
            >
              Attendance calendar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <TableRowsSkeleton rows={TABLE_PAGE_SIZE} />
          ) : err ? (
            <p className="text-sm text-red-400">{err}</p>
          ) : (
            <>
              {/* Notification banner for pending leave requests */}
              {users.some((u) => u.hasPendingLeave && u.pendingLeave) && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200">
                  <div className="flex items-center gap-3 text-xs font-medium">
                    <div className="relative shrink-0">
                      <div className="p-2 rounded-xl bg-amber-600 text-white shadow-xs">
                        <Bell className="size-4 animate-bounce" />
                      </div>
                      <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-red-500 animate-ping" />
                      <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-red-500" />
                    </div>
                    <div>
                      <span className="font-bold text-sm">
                        {users.filter((u) => u.hasPendingLeave && u.pendingLeave).length}{" "}
                        {users.filter((u) => u.hasPendingLeave && u.pendingLeave).length === 1
                          ? "Leave Application"
                          : "Leave Applications"}{" "}
                        Awaiting Your Review
                      </span>
                      <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
                        Staff members have submitted leave requests. Click below or tap the &quot;Leave Request&quot; button in the table to review and approve/reject.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {users
                      .filter((u) => u.hasPendingLeave && u.pendingLeave)
                      .slice(0, 3)
                      .map((t) => (
                        <Button
                          key={t.id}
                          size="sm"
                          type="button"
                          onClick={() => {
                            setLeaveReviewTarget({
                              teacher: t,
                              leave: t.pendingLeave!,
                              isPending: true,
                            });
                          }}
                          className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs"
                        >
                          <Bell className="size-3.5" />
                          Review {t.name?.split(" ")[0] || "Staff"}
                        </Button>
                      ))}
                  </div>
                </div>
              )}

              {/* 4 Wing / Department Category Tabs */}
              <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-3 pt-1">
                {WING_TABS.map((tab) => {
                  const isActive = activeWingTab === tab.key;
                  const count = wingCounts[tab.key];
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => {
                        setActiveWingTab(tab.key);
                        setSelectedEmployeeIds([]);
                      }}
                      title={tab.description}
                      className={cn(
                        "group relative inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer",
                        isActive
                          ? "bg-white/10 text-white border border-white/20 shadow-xs shadow-black/20"
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent"
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-3.5 transition-colors",
                          isActive ? "text-cyan-400" : "text-zinc-500 group-hover:text-zinc-300"
                        )}
                      />
                      <span>{tab.label}</span>
                      {tab.badgeLabel && (
                        <span className="hidden sm:inline text-[10px] font-normal text-zinc-500">
                          ({tab.badgeLabel})
                        </span>
                      )}
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] tabular-nums font-bold leading-none transition-colors",
                          isActive
                            ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                            : "bg-white/[0.08] text-zinc-400 group-hover:bg-white/[0.12] group-hover:text-zinc-200"
                        )}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative max-w-md flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                  <Input
                    type="search"
                    placeholder="Search by name, email, employee ID, role…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-10 pl-9 dark:bg-zinc-950"
                    aria-label="Search teachers and staff"
                  />
                </div>
                {canDeleteUsers && selectedEmployeeIds.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-zinc-500">{selectedEmployeeIds.length} selected</span>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        const rows = users.filter(
                          (r) => r.role === "employee" && selectedEmployeeIds.includes(r.id)
                        );
                        if (rows.length === 0) return;
                        setBulkDeleteTargets(rows);
                        setDeletePhrase("");
                        setDeleteError(null);
                      }}
                    >
                      <Trash2 className="mr-1.5 size-4" />
                      Delete selected
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-zinc-500"
                      onClick={() => setSelectedEmployeeIds([])}
                    >
                      Clear
                    </Button>
                  </div>
                ) : null}
              </div>

              {users.length === 0 ? (
                <p className="text-sm text-zinc-500">No users found.</p>
              ) : filteredUsers.length === 0 ? (
                <div className="p-8 text-center rounded-xl border border-dashed border-white/10">
                  <p className="text-sm font-medium text-zinc-300">
                    {searchQuery
                      ? `No staff match "${searchQuery}" in ${WING_TABS.find((t) => t.key === activeWingTab)?.label}.`
                      : `No staff members found in ${WING_TABS.find((t) => t.key === activeWingTab)?.label}.`}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    {activeWingTab !== "all"
                      ? "Switch to \"All Members\" or check another tab to view other staff."
                      : "Try adjusting your search criteria."}
                  </p>
                  {activeWingTab !== "all" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveWingTab("all")}
                      className="mt-3 text-xs"
                    >
                      View All Members ({wingCounts.all})
                    </Button>
                  )}
                </div>
              ) : (
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm tabular-nums">
                <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase text-zinc-500">
                  <tr>
                    {canDeleteUsers ? (
                      <th className="w-10 px-2 py-2">
                        <input
                          type="checkbox"
                          className="size-4 rounded border-zinc-600 accent-cyan-600"
                          checked={allDeletablePageSelected}
                          onChange={toggleSelectAllDeletablePage}
                          aria-label="Select all deletable employees on this page"
                        />
                      </th>
                    ) : null}
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Contact</th>
                    <th className="px-3 py-2">Branch & Role</th>
                    {canManageAdmins ? <th className="px-3 py-2">Admin</th> : null}
                    <th className="px-3 py-2">Status & Leave</th>
                    <th className="px-3 py-2 text-right">Details</th>
                    {canDeleteUsers ? <th className="px-3 py-2 text-right">Delete</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {paginatedUsers.map((r) => (
                    <tr
                      key={r.id}
                      className="cursor-pointer border-b border-white/5 hover:bg-white/[0.02]"
                      onClick={() => setSelectedTeacher(r)}
                    >
                      {canDeleteUsers ? (
                        <td
                          className="px-2 py-2"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          {r.role === "employee" && r.id !== viewerId ? (
                            <input
                              type="checkbox"
                              className="size-4 rounded border-zinc-600 accent-blue-600"
                              checked={selectedEmployeeIds.includes(r.id)}
                              onChange={() => toggleSelectEmployee(r.id)}
                              aria-label={`Select ${r.name || r.email}`}
                            />
                          ) : (
                            <span className="inline-block w-4 text-center text-zinc-600">—</span>
                          )}
                        </td>
                      ) : null}
                      <td className="px-3 py-2 font-medium">
                        <div>{r.name}</div>
                        {r.isClassTeacher && r.schoolClassId && (
                          <div className="text-[11px] text-blue-500 font-normal">
                            Class Incharge: {r.schoolClassId}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-400">
                        <div>{r.email}</div>
                        {r.phone && <div className="text-[11px] text-zinc-500 font-mono">{r.phone}</div>}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div className="font-semibold text-zinc-200">
                          {r.designation || r.position || r.role}
                        </div>
                        {r.schoolWingId ? (
                          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
                            {r.schoolWingId.replace(/_/g, " ")}
                          </div>
                        ) : getUserWing(r) ? (
                          <div className="text-[10px] text-zinc-500/80 uppercase tracking-wider">
                            {getUserWing(r)?.replace(/_/g, " ")}
                          </div>
                        ) : null}
                      </td>
                      {canManageAdmins ? (
                        <td className="px-3 py-2">
                          {r.role === "admin" ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 text-amber-400 hover:text-amber-300 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDemoteTarget({ email: r.email, name: r.name });
                              }}
                            >
                              Remove admin
                            </Button>
                          ) : r.role === "super_admin" ? (
                            <span className="text-xs font-medium text-blue-400">
                              Super admin
                            </span>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                      ) : null}
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        {r.hasPendingLeave && r.pendingLeave ? (
                          <button
                            type="button"
                            onClick={() => {
                              setLeaveReviewTarget({
                                teacher: r,
                                leave: r.pendingLeave!,
                                isPending: true,
                              });
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-xs font-bold hover:bg-amber-500/25 transition-all shadow-xs group cursor-pointer animate-pulse"
                            title="Click to review leave application and approve or reject"
                          >
                            <Bell className="size-3.5 fill-amber-500 text-amber-500 group-hover:rotate-12 transition-transform" />
                            <span>Leave Request</span>
                            <span className="size-1.5 rounded-full bg-amber-500" />
                          </button>
                        ) : r.onLeaveToday ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (r.activeLeave) {
                                setLeaveReviewTarget({
                                  teacher: r,
                                  leave: r.activeLeave,
                                  isPending: false,
                                });
                              }
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30 text-xs font-bold hover:bg-blue-500/25 transition-all shadow-xs cursor-pointer"
                            title="Currently On Leave — Click to view details or revoke"
                          >
                            <FileCheck className="size-3.5 text-blue-600 dark:text-blue-400" />
                            <span>On Leave</span>
                            {r.todayLeaveType && (
                              <span className="text-[10px] uppercase font-semibold text-blue-600/90 dark:text-blue-300/90 bg-blue-500/10 px-1.5 py-0.2 rounded">
                                {r.todayLeaveType}
                              </span>
                            )}
                          </button>
                        ) : r.workspaceAccessStatus === "pending" ? (
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                            onClick={() => {
                              void approveAccess(r.id);
                            }}
                          >
                            Approve Access
                          </Button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                            <CheckCircle2 className="size-3" /> Active
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTeacher(r);
                          }}
                        >
                          View Details
                        </Button>
                      </td>
                      {canDeleteUsers ? (
                        <td className="px-3 py-2 text-right">
                          {r.role === "employee" ? (
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(r);
                                setDeletePhrase("");
                                setDeleteError(null);
                              }}
                            >
                              Delete
                            </Button>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>

              </table>
              {totalPages > 1 ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm">
                  <span className="text-zinc-400">
                    Showing {(page - 1) * TABLE_PAGE_SIZE + 1}–
                    {Math.min(page * TABLE_PAGE_SIZE, filteredUsers.length)} of {filteredUsers.length}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <span className="text-zinc-500">
                      Page {page} / {totalPages}
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="border-t border-white/10 px-3 py-2 text-xs text-zinc-500">
                  Showing 1–{filteredUsers.length} of {filteredUsers.length} ({TABLE_PAGE_SIZE} per page)
                </div>
              )}
            </div>
              )}
            </>
          )}

        </CardContent>
      </Card>

      {/* Demote Admin Warning Modal */}
      <DangerConfirmModal
        open={Boolean(demoteTarget)}
        onClose={() => setDemoteTarget(null)}
        onConfirm={confirmDemoteAdmin}
        title="Danger zone"
        subtitle="Remove admin privileges"
        description={
          <span>
            Remove administrative privileges for{" "}
            <strong className="text-white font-semibold">{demoteTarget?.name}</strong>{" "}
            ({demoteTarget?.email})? They will immediately be reverted to standard employee access.
          </span>
        }
        confirmText="Remove Admin Role"
        cancelText="Cancel"
        loading={demoting}
        variant="warning"
      />
    </div>
  );
}
