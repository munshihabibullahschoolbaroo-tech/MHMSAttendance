"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input, formFieldLabelClass } from "@/components/ui/input";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { toast } from "sonner";
import {
  Crown,
  ShieldCheck,
  UserPlus,
  UserMinus,
  Loader2,
  Mail,
  Shield,
  CheckCircle2,
} from "lucide-react";
import { DangerConfirmModal } from "@/components/client/danger-confirm-modal";
import { cn } from "@/lib/utils";

type AdminMember = {
  id: string;
  name: string;
  email: string;
  role: "super_admin" | "admin";
};

export function AdminAddAdminForm() {
  const [email, setEmail] = React.useState("");
  const [promoting, setPromoting] = React.useState(false);
  const [admins, setAdmins] = React.useState<AdminMember[]>([]);
  const [loadingAdmins, setLoadingAdmins] = React.useState(true);
  const [demoteTarget, setDemoteTarget] = React.useState<AdminMember | null>(null);
  const [demoting, setDemoting] = React.useState(false);

  // Load admins from API
  const fetchAdmins = React.useCallback(async () => {
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) return;
      const token = await u.getIdToken();

      const res = await fetch("/api/school/admins", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { ok?: boolean; admins?: AdminMember[] };
        setAdmins(data.admins ?? []);
      }
    } catch (err) {
      console.error("Failed to load admins:", err);
      toast.error("Failed to load administrators list");
    } finally {
      setLoadingAdmins(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchAdmins();
  }, [fetchAdmins]);

  // Promote email to admin
  const handlePromote = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      toast.error("Please enter a valid employee email address");
      return;
    }

    setPromoting(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();

      const res = await fetch("/api/admin/promote-admin", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: cleanEmail }),
      });

      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to promote admin");
      }

      toast.success(`Admin access granted to ${cleanEmail}!`);
      setEmail("");
      await fetchAdmins();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to promote user");
    } finally {
      setPromoting(false);
    }
  };

  // Demote admin back to employee
  const handleDemote = async () => {
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

      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to revoke admin access");
      }

      toast.success(`Revoked administrator access for ${demoteTarget.email}.`);
      setDemoteTarget(null);
      await fetchAdmins();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke admin");
    } finally {
      setDemoting(false);
    }
  };

  const superAdmins = admins.filter((a) => a.role === "super_admin");
  const regularAdmins = admins.filter((a) => a.role === "admin");

  return (
    <div className="space-y-6">
      {/* 1. Super Admin Card */}
      <Card className="rounded-2xl border-amber-500/30 bg-gradient-to-br from-amber-500/[0.07] via-amber-500/[0.03] to-transparent shadow-sm dark:border-amber-500/25">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Crown className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <span>Super Administrator</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                  Primary Owner
                </span>
              </CardTitle>
              <CardDescription className="text-xs text-zinc-500">
                Super admin possesses master system rights and manages administrator roles.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {superAdmins.map((sa) => (
              <div
                key={sa.id}
                className="flex items-center justify-between p-3 rounded-xl border border-amber-500/20 bg-white/70 dark:bg-zinc-900/60 text-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold text-xs">
                    {sa.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">
                      {sa.name}
                    </h4>
                    <p className="text-zinc-500 text-[11px]">{sa.email}</p>
                  </div>
                </div>
                <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                  Root Owner (Protected)
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 2. School Administrators List */}
      <Card className="rounded-2xl border-zinc-200 dark:border-white/10 shadow-sm bg-white dark:bg-zinc-900/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <ShieldCheck className="size-5" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <span>School Administrators</span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30">
                    {regularAdmins.length} {regularAdmins.length === 1 ? "Admin" : "Admins"}
                  </span>
                </CardTitle>
                <CardDescription className="text-xs text-zinc-500">
                  Administrators can approve leaves, review attendance corrections, and manage school configurations.
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingAdmins ? (
            <div className="flex items-center justify-center py-8 text-xs text-zinc-400 gap-2">
              <Loader2 className="size-4 animate-spin" />
              <span>Loading administrators…</span>
            </div>
          ) : regularAdmins.length === 0 ? (
            <div className="p-6 text-center rounded-xl border border-dashed border-zinc-200 dark:border-white/10 text-xs text-zinc-400 space-y-1">
              <Shield className="size-7 mx-auto text-zinc-300 dark:text-zinc-600 mb-2" />
              <p className="font-semibold text-zinc-700 dark:text-zinc-300">
                No appointed administrators yet
              </p>
              <p>Promote staff members to administrators using the form below.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {regularAdmins.map((adm) => (
                <div
                  key={adm.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50/60 dark:bg-zinc-800/40 text-xs transition-colors hover:border-zinc-300 dark:hover:border-white/20"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold text-xs border border-blue-500/20">
                      {adm.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">
                          {adm.name}
                        </h4>
                        <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/25">
                          Admin
                        </span>
                      </div>
                      <p className="text-zinc-500 text-[11px]">{adm.email}</p>
                    </div>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setDemoteTarget(adm)}
                    className="h-8 gap-1.5 text-xs font-semibold text-red-600 border-red-500/25 hover:bg-red-500/10 hover:border-red-500/40 dark:text-red-400 cursor-pointer rounded-lg"
                    title={`Remove admin privileges for ${adm.name}`}
                  >
                    <UserMinus className="size-3.5" />
                    <span>Remove Admin</span>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Promote New Administrator Form */}
      <Card className="rounded-2xl border-zinc-200 dark:border-white/10 shadow-sm bg-white dark:bg-zinc-900/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <UserPlus className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Appoint New Administrator
              </CardTitle>
              <CardDescription className="text-xs text-zinc-500">
                Promote an existing teacher or staff account to school administrator by email.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handlePromote}>
            <div className="space-y-1.5">
              <label className={formFieldLabelClass}>Employee Email *</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 size-4 text-zinc-400" />
                <Input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. teacher@school.com"
                  className="pl-9 text-xs h-9 rounded-xl"
                />
              </div>
              <p className="text-[11px] text-zinc-500">
                The account must already exist in the school system. Once promoted, they will immediately gain access to the admin dashboard.
              </p>
            </div>

            <Button
              type="submit"
              disabled={promoting || !email.trim()}
              className="gap-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-xs cursor-pointer h-9 px-4"
            >
              {promoting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Promoting…</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="size-4" />
                  <span>Promote to Admin</span>
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Demote / Revoke Access Confirmation Modal */}
      <DangerConfirmModal
        open={Boolean(demoteTarget)}
        onClose={() => setDemoteTarget(null)}
        onConfirm={handleDemote}
        title="Revoke Admin Access"
        subtitle={`Demote ${demoteTarget?.name || demoteTarget?.email}`}
        description={
          <span>
            Are you sure you want to revoke administrator access for{" "}
            <strong className="text-white font-bold">{demoteTarget?.name}</strong> ({demoteTarget?.email})?
            They will lose administrative privileges and revert to regular employee/teacher access.
          </span>
        }
        confirmText="Revoke Access"
        cancelText="Cancel"
        loading={demoting}
        variant="danger"
      />
    </div>
  );
}
