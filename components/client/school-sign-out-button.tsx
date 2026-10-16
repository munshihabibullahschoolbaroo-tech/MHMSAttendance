"use client";

import * as React from "react";
import { LogOut, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { toast } from "sonner";

import { DangerConfirmModal } from "@/components/client/danger-confirm-modal";

export function SchoolSignOutButton() {
  const [session, setSession] = React.useState<{ isCheckedIn: boolean; isCheckedOut: boolean; config?: any } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [lateModalOpen, setLateModalOpen] = React.useState(false);
  const [lateReason, setLateReason] = React.useState("");
  const [lateInfo, setLateInfo] = React.useState<{ isLateSignOut: boolean; minutesLate: number; currentFormatted: string; signOutDeadlineFormatted: string } | null>(null);

  const checkStatus = React.useCallback(async () => {
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) return;
      const token = await u.getIdToken();
      const res = await fetch("/api/school/attendance/today", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSession({ isCheckedIn: data.isCheckedIn, isCheckedOut: data.isCheckedOut, config: data.config });
      }
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    void checkStatus();
    const interval = setInterval(() => void checkStatus(), 30000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const onSignOutClick = () => {
    const deadline = session?.config?.schoolSignOutDeadline || "07:00 PM";
    // Check if current time is past sign-out deadline
    const match = deadline.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/);
    let deadlineMinutes = 19 * 60;
    if (match) {
      let h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const ampm = (match[3] || "PM").toUpperCase();
      if (ampm === "AM" && h === 12) h = 0;
      if (ampm === "PM" && h < 12) h += 12;
      deadlineMinutes = h * 60 + m;
    }
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    if (currentMinutes > deadlineMinutes) {
      const h12 = now.getHours() % 12 || 12;
      const ampm = now.getHours() >= 12 ? "PM" : "AM";
      const currentFormatted = `${String(h12).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} ${ampm}`;
      setLateInfo({
        isLateSignOut: true,
        minutesLate: currentMinutes - deadlineMinutes,
        currentFormatted,
        signOutDeadlineFormatted: deadline,
      });
      setLateModalOpen(true);
      return;
    }

    setConfirmOpen(true);
  };

  const signOutFromSchool = async () => {
    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();

      let latitude: number | undefined;
      let longitude: number | undefined;

      if ("geolocation" in navigator) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 10000,
            });
          });
          latitude = pos.coords.latitude;
          longitude = pos.coords.longitude;
        } catch {
          throw new Error("Campus GPS location is required to sign out. Please allow location access.");
        }
      } else {
        throw new Error("Geolocation is not supported by your browser.");
      }

      const res = await fetch("/api/school/attendance/check-out", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ latitude, longitude }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to sign out from school");

      toast.success("Punched out from school successfully! Have a great evening.");
      setSession((prev) => (prev ? { ...prev, isCheckedOut: true } : null));
      setConfirmOpen(false);
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error signing out");
    } finally {
      setBusy(false);
    }
  };

  const submitLateSignOut = async () => {
    if (!lateReason.trim() || lateReason.trim().length < 3) {
      toast.error("Please provide a reason explaining your late sign-out.");
      return;
    }

    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();

      let latitude: number | undefined;
      let longitude: number | undefined;

      if ("geolocation" in navigator) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false,
              timeout: 5000,
            });
          });
          latitude = pos.coords.latitude;
          longitude = pos.coords.longitude;
        } catch {
          /* optional on late sign out */
        }
      }

      const res = await fetch("/api/school/attendance/check-out", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ latitude, longitude, reason: lateReason.trim() }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to submit late sign out");

      toast.success(data.message ?? "Late sign-out submitted for administrator review!");
      setLateModalOpen(false);
      setLateReason("");
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error signing out");
    } finally {
      setBusy(false);
    }
  };

  // Only show button if teacher is checked in today and has not checked out yet
  if (!session || !session.isCheckedIn || session.isCheckedOut) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={onSignOutClick}
        className="gap-2 border-red-500/30 bg-red-500/10 text-red-700 hover:bg-red-500/20 hover:text-red-800 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-500/20 shadow-sm cursor-pointer"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <LogOut className="h-4 w-4 text-red-500" />
        )}
        <span className="hidden sm:inline">Sign Out from School</span>
        <span className="sm:hidden">Punch Out</span>
      </Button>

      {/* Regular on-time punch out confirmation */}
      <DangerConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={signOutFromSchool}
        title="School Punch Out"
        subtitle="End school working day"
        description="Are you sure you want to punch out / sign out from school for today? Your checkout timestamp and today's hours will be logged."
        confirmText="Confirm Punch Out"
        cancelText="Cancel"
        loading={busy}
        variant="warning"
      />

      {/* Late sign-out reason modal */}
      {lateModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl border border-rose-500/30 bg-white p-5 shadow-2xl dark:border-rose-500/25 dark:bg-zinc-900 space-y-4">
            <div>
              <h3 className="text-base font-bold text-rose-600 dark:text-rose-400">
                Late School Sign-Out
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Past standard sign-out cutoff ({lateInfo?.signOutDeadlineFormatted || "07:00 PM"}). A reason is required for admin approval.
              </p>
            </div>

            <div className="rounded-xl bg-rose-50 dark:bg-rose-950/20 p-3 border border-rose-500/20 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-zinc-600 dark:text-zinc-400">Cutoff:</span>
                <span className="font-bold">{lateInfo?.signOutDeadlineFormatted || "07:00 PM"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-600 dark:text-zinc-400">Current Time:</span>
                <span className="font-bold text-rose-600">{lateInfo?.currentFormatted}</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Reason for late sign-out:
              </label>
              <textarea
                rows={3}
                value={lateReason}
                onChange={(e) => setLateReason(e.target.value)}
                placeholder="e.g. Extra class, test checking, parent meeting..."
                className="w-full rounded-xl border border-zinc-200 dark:border-white/10 p-2 text-xs bg-zinc-50 dark:bg-white/[0.04] focus:outline-none focus:ring-2 focus:ring-rose-500/50 resize-none"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                type="button"
                disabled={busy || !lateReason.trim()}
                onClick={submitLateSignOut}
                className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs h-9 rounded-xl shadow-md"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Submit for Approval"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setLateModalOpen(false)}
                className="text-xs h-9 rounded-xl"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
