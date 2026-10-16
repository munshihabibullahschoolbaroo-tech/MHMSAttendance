"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  GraduationCap,
  Loader2,
  Mail,
  Phone,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { Separator } from "@/components/ui/separator";
import { TableRowsSkeleton } from "@/components/client/dashboard-skeletons";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/client/user-avatar";

export type LoginAccessUser = {
  id: string;
  employeeId?: string;
  name: string;
  email: string;
  photoUrl?: string | null;
  role: string;
  phone?: string | null;
  schoolWingId?: string | null;
  position?: string | null;
  designation?: string | null;
  isClassTeacher?: boolean;
  schoolClassId?: string | null;
  schoolSectionId?: string | null;
  workspaceAccessStatus?: "pending" | "approved" | "rejected";
  onboardingCompletedAt?: string | null;
  createdAt?: string | null;
};

function formatWing(wingId?: string | null) {
  if (!wingId) return "Not specified";
  if (wingId === "higher") return "Higher School (1st to 12th)";
  if (wingId === "lower") return "Lower School (Pre-Nur to UKG)";
  if (wingId === "rewa_na_kasco") return "Rewa na Kasco (Inclusive Wing)";
  return wingId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPosition(pos?: string | null, customDesig?: string | null) {
  if (customDesig?.trim()) return customDesig.trim();
  if (!pos) return "Teacher / Staff";
  const map: Record<string, string> = {
    principal: "Principal",
    vice_principal: "Vice Principal",
    headmaster: "Headmaster / Headmistress",
    pgt: "Post Graduate Teacher (PGT)",
    tgt: "Trained Graduate Teacher (TGT)",
    prt: "Primary Teacher (PRT)",
    ntt: "Nursery Teacher (NTT)",
    special_educator: "Special Educator",
    activity_teacher: "Activity / Sports Teacher",
    other: "Staff Member",
  };
  return map[pos] ?? pos.replace(/_/g, " ").toUpperCase();
}

function formatTimestamp(ts?: string | null) {
  if (!ts) return "Recently submitted";
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

export function AdminLoginAccessPanel() {
  const [users, setUsers] = React.useState<LoginAccessUser[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [workspaceBusy, setWorkspaceBusy] = React.useState<string | null>(null);
  const [selectedUser, setSelectedUser] = React.useState<LoginAccessUser | null>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

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
      const data = (await res.json()) as { users?: LoginAccessUser[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load users");
      setUsers(data.users ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const setWorkspaceAccess = async (workerId: string, action: "approve" | "reject") => {
    setWorkspaceBusy(workerId + action);
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
        body: JSON.stringify({ workerId, action }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update access");

      toast.success(
        action === "approve"
          ? "Login access approved! Staff member can now use the portal."
          : "Login access rejected."
      );
      if (selectedUser?.id === workerId) {
        setSelectedUser(null);
      }
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update access";
      setErr(msg);
      toast.error(msg);
    } finally {
      setWorkspaceBusy(null);
    }
  };

  const pending = React.useMemo(
    () =>
      users.filter(
        (r) =>
          (r.role === "employee" || r.role === "staff" || !r.role) &&
          r.workspaceAccessStatus === "pending"
      ),
    [users]
  );
  const rejected = React.useMemo(
    () =>
      users.filter(
        (r) =>
          (r.role === "employee" || r.role === "staff" || !r.role) &&
          r.workspaceAccessStatus === "rejected"
      ),
    [users]
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <UserCheck className="size-5 text-blue-500" />
            Staff Onboarding Approvals
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Review detailed onboarding profiles, staff designations, and grant dashboard access.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
            <Clock className="size-3.5" />
            {pending.length} Pending
          </span>
        </div>
      </div>
      <Separator />

      {err ? (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-600 dark:text-red-400 text-xs font-medium">
          {err}
        </div>
      ) : null}

      {/* PENDING APPROVALS CARD */}
      <Card className="border-zinc-200/90 shadow-sm dark:border-white/10">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                Pending Login Access Requests
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                New staff members who completed onboarding setup and are waiting for administrator activation.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableRowsSkeleton rows={3} />
          ) : pending.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl bg-zinc-50/50 dark:bg-white/[0.01] border border-dashed border-zinc-200 dark:border-white/10">
              <CheckCircle2 className="size-10 text-emerald-500/60 mb-2" />
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                All Caught Up!
              </p>
              <p className="text-xs text-zinc-500 max-w-sm mt-0.5">
                No staff members are currently waiting for onboarding approval.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {pending.map((r) => {
                const displayName = r.name?.trim() || r.email.split("@")[0] || "Staff Member";
                const initials = displayName
                  .split(" ")
                  .map((w) => w[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join("")
                  .toUpperCase() || "T";

                return (
                  <li
                    key={r.id}
                    className="flex flex-col gap-3.5 rounded-xl border border-zinc-200/90 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-zinc-900/60 transition-all hover:border-blue-500/40 hover:shadow-sm"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Avatar */}
                        <UserAvatar
                          name={displayName}
                          photoUrl={r.photoUrl}
                          className="size-10 shrink-0"
                          textClassName="text-xs"
                        />

                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">
                              {displayName}
                            </span>
                            {r.employeeId && (
                              <span className="rounded-md bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[11px] font-mono font-bold text-zinc-700 dark:text-zinc-300 border border-zinc-200/60 dark:border-white/10">
                                {r.employeeId}
                              </span>
                            )}
                            {r.isClassTeacher && (
                              <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                                Class Teacher
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                            <span className="flex items-center gap-1 truncate">
                              <Mail className="size-3 text-zinc-400 shrink-0" />
                              {r.email}
                            </span>
                            {r.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="size-3 text-zinc-400 shrink-0" />
                                {r.phone}
                              </span>
                            )}
                          </div>

                          {/* Onboarding Summary Badges */}
                          <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                            {r.schoolWingId && (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-purple-500/10 px-2 py-0.5 text-[11px] font-semibold text-purple-700 dark:text-purple-300 border border-purple-500/20">
                                <Building2 className="size-3 text-purple-500" />
                                {formatWing(r.schoolWingId)}
                              </span>
                            )}

                            {(r.designation || r.position) && (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:text-blue-300 border border-blue-500/20">
                                <GraduationCap className="size-3 text-blue-500" />
                                {r.designation || formatPosition(r.position)}
                              </span>
                            )}

                            {r.isClassTeacher && r.schoolClassId && (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-teal-500/10 px-2 py-0.5 text-[11px] font-semibold text-teal-700 dark:text-teal-300 border border-teal-500/20">
                                Class: {r.schoolClassId} ({r.schoolSectionId || "A"})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex shrink-0 flex-wrap items-center gap-2 pt-2 sm:pt-0">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedUser(r)}
                          className="h-8 text-xs gap-1.5 border-blue-500/30 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 font-semibold cursor-pointer"
                        >
                          <Eye className="size-3.5 text-blue-500" />
                          View Details
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          disabled={workspaceBusy !== null}
                          onClick={() => void setWorkspaceAccess(r.id, "approve")}
                          className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs cursor-pointer"
                        >
                          {workspaceBusy === `${r.id}approve` ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="size-3.5" />
                          )}
                          Approve
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={workspaceBusy !== null}
                          onClick={() => void setWorkspaceAccess(r.id, "reject")}
                          className="h-8 text-xs gap-1.5 border-zinc-200 dark:border-white/10 text-red-600 hover:bg-red-50 hover:border-red-500/30 dark:hover:bg-red-950/20 font-semibold cursor-pointer"
                        >
                          {workspaceBusy === `${r.id}reject` ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <XCircle className="size-3.5" />
                          )}
                          Reject
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* REJECTED / SUSPENDED ACCESS */}
      {rejected.length > 0 && (
        <Card className="border-zinc-200/90 shadow-sm dark:border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
              <ShieldAlert className="size-4 text-red-500" />
              Rejected Access Records ({rejected.length})
            </CardTitle>
            <CardDescription className="text-xs">
              Teachers whose login request was previously rejected. You can review details or re-approve them anytime.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {rejected.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.02] p-3.5 dark:border-red-500/20 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
                        {r.name || r.email.split("@")[0]}
                      </p>
                      {r.employeeId && (
                        <span className="rounded-md bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono font-medium text-zinc-600 dark:text-zinc-300">
                          {r.employeeId}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-zinc-500 mt-0.5">{r.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedUser(r)}
                      className="h-8 text-xs gap-1.5 cursor-pointer"
                    >
                      <Eye className="size-3.5" />
                      Details
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={workspaceBusy !== null}
                      onClick={() => void setWorkspaceAccess(r.id, "approve")}
                      className="h-8 text-xs gap-1.5 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 cursor-pointer"
                    >
                      {workspaceBusy === `${r.id}approve` ? "…" : "Approve Access"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* FULL ONBOARDING DETAILS MODAL */}
      {mounted &&
        selectedUser &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedUser(null);
            }}
          >
            <div className="relative w-full max-w-xl rounded-2xl border border-zinc-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-950 max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <ShieldCheck className="size-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-zinc-900 dark:text-zinc-100">
                      Staff Onboarding Review
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Complete profile details submitted during staff setup
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  <X className="size-5" />
                </button>
              </div>
              <Separator />

              {/* Modal Body: Detailed Breakdown */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm">
                {/* Teacher Profile Summary Box */}
                <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-50/40 dark:bg-blue-950/20 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      name={selectedUser.name || "Staff Member"}
                      photoUrl={selectedUser.photoUrl}
                      className="size-12 shrink-0 shadow-sm"
                      textClassName="text-base font-bold"
                    />
                    <div>
                      <h4 className="font-bold text-zinc-900 dark:text-zinc-100 text-base">
                        {selectedUser.name || "Staff Member"}
                      </h4>
                      <p className="text-xs text-zinc-500">{selectedUser.email}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                          {selectedUser.employeeId || "Pending Allocation"}
                        </span>
                        <span className="text-zinc-300 dark:text-zinc-700">•</span>
                        <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <Clock className="size-3" />
                          Awaiting Approval
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Wing / Branch */}
                  <div className="p-3.5 rounded-xl border border-zinc-200/80 bg-zinc-50/70 dark:border-white/10 dark:bg-white/[0.02]">
                    <span className="text-xs text-zinc-400 font-medium flex items-center gap-1 mb-1">
                      <Building2 className="size-3.5 text-purple-500" />
                      Assigned Branch / Wing
                    </span>
                    <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">
                      {formatWing(selectedUser.schoolWingId)}
                    </p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      {selectedUser.schoolWingId === "higher"
                        ? "Main campus higher wing"
                        : selectedUser.schoolWingId === "lower"
                        ? "Junior primary wing"
                        : "Special inclusive branch"}
                    </p>
                  </div>

                  {/* Academic Role & Position */}
                  <div className="p-3.5 rounded-xl border border-zinc-200/80 bg-zinc-50/70 dark:border-white/10 dark:bg-white/[0.02]">
                    <span className="text-xs text-zinc-400 font-medium flex items-center gap-1 mb-1">
                      <GraduationCap className="size-3.5 text-blue-500" />
                      Academic Role / Designation
                    </span>
                    <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">
                      {selectedUser.designation || formatPosition(selectedUser.position)}
                    </p>
                    <p className="text-[11px] text-zinc-500 mt-0.5 capitalize">
                      Category: {selectedUser.position?.replace(/_/g, " ") || "Faculty"}
                    </p>
                  </div>

                  {/* Class Teacher Allocation */}
                  <div className="p-3.5 rounded-xl border border-zinc-200/80 bg-zinc-50/70 dark:border-white/10 dark:bg-white/[0.02]">
                    <span className="text-xs text-zinc-400 font-medium flex items-center gap-1 mb-1">
                      <Users className="size-3.5 text-emerald-500" />
                      Class Teacher Incharge
                    </span>
                    {selectedUser.isClassTeacher ? (
                      <div>
                        <p className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                          {selectedUser.schoolClassId} ({selectedUser.schoolSectionId || "A"})
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          Authorized for daily student roll call
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="font-medium text-zinc-600 dark:text-zinc-400 text-sm">
                          Not a Class Incharge
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          Subject / General Faculty Member
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Contact Phone */}
                  <div className="p-3.5 rounded-xl border border-zinc-200/80 bg-zinc-50/70 dark:border-white/10 dark:bg-white/[0.02]">
                    <span className="text-xs text-zinc-400 font-medium flex items-center gap-1 mb-1">
                      <Phone className="size-3.5 text-amber-500" />
                      Contact Phone
                    </span>
                    <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">
                      {selectedUser.phone || "Not provided"}
                    </p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Teacher registered mobile number
                    </p>
                  </div>
                </div>

                {/* Submission Timestamp info */}
                <div className="p-3 rounded-xl bg-zinc-100/60 dark:bg-white/[0.03] border border-zinc-200/60 dark:border-white/10 flex items-center justify-between text-xs text-zinc-500">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="size-3.5 text-zinc-400" />
                    Setup Submitted:
                  </span>
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                    {formatTimestamp(selectedUser.onboardingCompletedAt || selectedUser.createdAt)}
                  </span>
                </div>
              </div>

              {/* Modal Footer Actions */}
              <Separator />
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-zinc-50/80 px-5 py-4 dark:bg-zinc-900/60">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedUser(null)}
                  className="w-full sm:w-auto text-xs cursor-pointer"
                >
                  Close
                </Button>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={workspaceBusy !== null}
                    onClick={() => void setWorkspaceAccess(selectedUser.id, "reject")}
                    className="flex-1 sm:flex-initial text-xs gap-1.5 border-red-500/30 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                  >
                    {workspaceBusy === `${selectedUser.id}reject` ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <XCircle className="size-3.5" />
                    )}
                    Reject Request
                  </Button>

                  <Button
                    type="button"
                    disabled={workspaceBusy !== null}
                    onClick={() => void setWorkspaceAccess(selectedUser.id, "approve")}
                    className="flex-1 sm:flex-initial text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs cursor-pointer"
                  >
                    {workspaceBusy === `${selectedUser.id}approve` ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-3.5" />
                    )}
                    Approve & Grant Access
                  </Button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
