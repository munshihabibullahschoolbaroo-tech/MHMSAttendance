"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import {
  AttendanceDayDetailView,
  type DayDetailPayload,
} from "@/components/client/attendance-day-detail-view";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function AdminWorkerDayAttendancePage() {
  const params = useParams();
  const workerId = typeof params?.workerId === "string" ? params.workerId : "";
  const date = typeof params?.date === "string" ? params.date : "";

  const valid = workerId.length > 0 && DATE_RE.test(date);

  const [data, setData] = React.useState<DayDetailPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!valid) {
      setLoading(false);
      setErr("Invalid worker or date.");
      return;
    }

    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setLoading(false);
        setErr("Not signed in.");
        return;
      }
      setLoading(true);
      setErr(null);
      try {
        const token = await u.getIdToken();
        const res = await fetch(
          `/api/admin/worker-day-detail?workerId=${encodeURIComponent(workerId)}&day=${encodeURIComponent(date)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const json = (await res.json()) as DayDetailPayload & { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Failed to load");
        setData(json);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed");
        setData(null);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [valid, workerId, date]);

  return (
    <div className="p-3 sm:p-6 md:p-8">
      <div className="mx-auto max-w-3xl">
        <AttendanceDayDetailView
          data={data}
          loading={loading}
          error={err}
          backHref="/dashboard/admin/workers"
          backLabel="Teachers"
          showWorkerHeader
        />
      </div>
    </div>
  );
}
