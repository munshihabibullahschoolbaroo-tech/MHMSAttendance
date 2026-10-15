"use client";

import * as React from "react";
import { Loader2, ShieldCheck, Clock, XCircle, CheckCircle2 } from "lucide-react";
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

export function EmployeeLoginRequestPanel() {
  const { user } = useDashboardUser();
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const status = user?.workspaceAccessStatus;
  const label =
    status === "pending"
      ? "Pending Admin Review"
      : status === "rejected"
        ? "Access Not Approved"
        : status === "approved"
          ? "Approved & Active"
          : "Active";

  const resubmit = async () => {
    setMsg(null);
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const res = await fetch("/api/account/login-request", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setMsg("Request sent. School administrators have been notified.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to submit request");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="rounded-3xl border-zinc-200 dark:border-white/10">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <ShieldCheck className="size-4" />
          </span>
          <CardTitle className="text-lg">Staff Account Approval Status</CardTitle>
        </div>
        <CardDescription>
          New faculty and staff accounts are reviewed and approved by school administration after onboarding.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-2xl border border-zinc-200/80 bg-zinc-50/80 p-4 text-sm dark:border-white/10 dark:bg-white/[0.04]">
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Current Status</p>
            <p className="font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">{label}</p>
          </div>
          {status === "approved" || !status ? (
            <span className="flex size-7 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-4" />
            </span>
          ) : status === "pending" ? (
            <span className="flex size-7 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Clock className="size-4" />
            </span>
          ) : (
            <span className="flex size-7 items-center justify-center rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
              <XCircle className="size-4" />
            </span>
          )}
        </div>

        {status === "rejected" ? (
          <div className="space-y-3">
            <Button type="button" disabled={busy} onClick={() => void resubmit()} className="rounded-xl">
              {busy ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Sending…
                </>
              ) : (
                "Submit access request again"
              )}
            </Button>
            {msg && (
              <p
                className={
                  msg.startsWith("Request sent")
                    ? "text-xs font-semibold text-emerald-600 dark:text-emerald-400"
                    : "text-xs font-semibold text-red-600 dark:text-red-400"
                }
              >
                {msg}
              </p>
            )}
          </div>
        ) : status === "pending" ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Your registration is awaiting approval by the school principal or administration. Once approved, you will have complete access to attendance features.
          </p>
        ) : (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Your staff account is verified and fully approved. You can mark daily attendance, view student rosters, and apply for leaves.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
