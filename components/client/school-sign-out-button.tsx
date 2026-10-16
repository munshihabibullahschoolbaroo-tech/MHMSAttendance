"use client";

import * as React from "react";
import { LogOut, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { toast } from "sonner";

import { DangerConfirmModal } from "@/components/client/danger-confirm-modal";

export function SchoolSignOutButton() {
  const [session, setSession] = React.useState<{ isCheckedIn: boolean; isCheckedOut: boolean } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

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
        setSession({ isCheckedIn: data.isCheckedIn, isCheckedOut: data.isCheckedOut });
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
        onClick={() => setConfirmOpen(true)}
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
    </>
  );
}
