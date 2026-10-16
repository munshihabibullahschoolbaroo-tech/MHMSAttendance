"use client";

import * as React from "react";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { Clock, Loader2, LogOut, RefreshCw, ShieldAlert, CheckCircle2 } from "lucide-react";
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
import { MhmsMark } from "@/components/mhms-mark";
import { toast } from "sonner";

export default function WaitingApprovalPage() {
  const { user, loading } = useDashboardUser();
  const router = useRouter();
  const [resubmitBusy, setResubmitBusy] = React.useState(false);
  const [resubmitMsg, setResubmitMsg] = React.useState<string | null>(null);

  const blockState = React.useMemo(() => {
    if (loading || !user) return null;
    if (user.role !== "employee") return null;
    const s = user.workspaceAccessStatus;
    if (s === "pending") return "pending" as const;
    if (s === "rejected") return "rejected" as const;
    return null;
  }, [loading, user]);

  // Automatic transition: once approved or if admin, immediately navigate to Home
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
      if (user.workspaceAccessStatus === "approved" || !user.workspaceAccessStatus) {
        toast.success("Workspace access approved! Welcome to MHMS.");
        router.replace("/");
        return;
      }
    }
  }, [loading, user, router]);

  const resubmit = async () => {
    setResubmitMsg(null);
    setResubmitBusy(true);
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
      setResubmitMsg("Request sent. An admin will review it shortly.");
      toast.success("New access request submitted to administration.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      setResubmitMsg(msg);
      toast.error(msg);
    } finally {
      setResubmitBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center p-4 bg-zinc-950 text-zinc-100">
      {/* Background ambient gradient glow */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-blue-950/20 via-zinc-950/80 to-zinc-950" />

      <div className="relative z-10 w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <MhmsMark className="size-16 drop-shadow-md animate-pulse" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">
            Munshi Habibullah Mission School
          </h2>
        </div>

        <Card className="border-zinc-800 bg-zinc-900/90 shadow-2xl backdrop-blur-xl">
          <CardHeader className="text-center pb-3">
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              {blockState === "rejected" ? (
                <ShieldAlert className="size-6 text-red-400" />
              ) : (
                <Clock className="size-6 text-amber-400 animate-spin" style={{ animationDuration: "6s" }} />
              )}
            </div>
            <CardTitle className="text-lg font-bold text-zinc-100">
              {blockState === "rejected" ? "Workspace Access On Hold" : "Waiting for Admin Approval"}
            </CardTitle>
            <CardDescription className="text-xs text-zinc-400 leading-relaxed mt-1">
              {blockState === "rejected"
                ? "An administrator did not approve access for this account. You can send a new request, or sign out and contact your school supervisor."
                : "Your profile setup is complete! An administrator is reviewing your details to activate your login. Once approved, you will be taken automatically to the home screen."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 pt-1">
            {/* Real-time live status indicator when pending */}
            {blockState !== "rejected" && (
              <div className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-zinc-800/60 border border-zinc-700/50 text-[11px] text-zinc-300">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                <span>Listening for admin approval in real-time…</span>
              </div>
            )}

            {/* Rejection Resubmit Option */}
            {blockState === "rejected" && (
              <div className="space-y-2">
                <Button
                  type="button"
                  disabled={resubmitBusy}
                  onClick={() => void resubmit()}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-10 gap-2 cursor-pointer shadow-sm"
                >
                  {resubmitBusy ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="size-4" />
                      Submit Access Request Again
                    </>
                  )}
                </Button>
                {resubmitMsg && (
                  <p
                    className={`text-center text-xs ${
                      resubmitMsg.startsWith("Request sent")
                        ? "text-emerald-400"
                        : "text-red-400"
                    }`}
                  >
                    {resubmitMsg}
                  </p>
                )}
              </div>
            )}

            {/* Sign Out Button */}
            <Button
              type="button"
              variant="outline"
              className="w-full border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800 hover:text-white text-xs h-10 gap-2 cursor-pointer"
              onClick={() => void signOut(getFirebaseAuth())}
            >
              <LogOut className="size-4" />
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
