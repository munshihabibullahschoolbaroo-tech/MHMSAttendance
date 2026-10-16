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

export default function EmployeeDayDetailPage() {
  const params = useParams();
  const date = typeof params?.date === "string" ? params.date : "";

  const valid = DATE_RE.test(date);

  const [data, setData] = React.useState<DayDetailPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!valid) {
      setLoading(false);
      setErr("Invalid date format. Expected YYYY-MM-DD.");
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
          `/api/attendance/day-detail?day=${encodeURIComponent(date)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const json = (await res.json()) as DayDetailPayload & { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Failed to load day details");
        setData(json);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load day details");
        setData(null);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [valid, date]);

  return (
    <div className="p-3 sm:p-6 md:p-8">
      <div className="mx-auto max-w-3xl">
        <AttendanceDayDetailView
          data={data}
          loading={loading}
          error={err}
          backHref="/dashboard/employee/calendar"
          backLabel="Calendar"
          showWorkerHeader
        />
      </div>
    </div>
  );
}
