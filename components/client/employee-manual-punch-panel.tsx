"use client";

import * as React from "react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateField } from "@/components/ui/date-field";
import { getBrowserTimeZone } from "@/lib/date/time-zone";
import { Button } from "@/components/ui/button";
import { Input, formFieldLabelClass } from "@/components/ui/input";
import { AppTimePicker } from "@/components/ui/app-time-picker";
import { Clock, Send, Loader2, Building, AlertCircle } from "lucide-react";

type Assignee = { id: string; name: string; email: string; role: string };
type Site = { id: string; name: string };

export function EmployeeManualPunchPanel() {
  const [assignees, setAssignees] = React.useState<Assignee[]>([]);
  const [sites, setSites] = React.useState<Site[]>([]);
  const [loadingInitial, setLoadingInitial] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);

  const [date, setDate] = React.useState("");
  const [assigneeId, setAssigneeId] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [inTime, setInTime] = React.useState("09:00");
  const [outTime, setOutTime] = React.useState("16:00");

  const tz = React.useMemo(() => getBrowserTimeZone(), []);

  React.useEffect(() => {
    let active = true;
    async function load() {
      try {
        const auth = getFirebaseAuth();
        const u = auth.currentUser;
        if (!u) return;
        const token = await u.getIdToken();
        const hdrs = { Authorization: `Bearer ${token}` };

        const resA = await fetch("/api/school/admins", { headers: hdrs });
        const dataA = (await resA.json()) as { admins?: { id: string; name: string; email: string; role?: string }[] };

        if (active) {
          const loadedAdmins = dataA.admins ?? [];
          const adminAssignees: Assignee[] = loadedAdmins.map((t) => ({
            id: t.id,
            name: t.name,
            email: t.email,
            role: t.role || "admin",
          }));
          setAssignees(adminAssignees);
          if (adminAssignees.length > 0) {
            setAssigneeId(adminAssignees[0]!.id);
          }
          setSites([{ id: "main-campus", name: "Main Campus" }]);
        }
      } catch {
        toast.error("Failed to load school administrators");
      } finally {
        if (active) setLoadingInitial(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) return toast.error("Please select the date of your missed attendance.");
    if (!assigneeId) return toast.error("Please select a school admin for approval.");
    if (reason.trim().length < 3) return toast.error("Please provide a reason for the missing punch.");

    const defaultSiteId = sites[0]?.id || "main-campus";

    setSubmitting(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();

      const res = await fetch("/api/manual-punch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date,
          assigneeAdminUid: assigneeId,
          reason: reason.trim(),
          segments: [
            {
              siteId: defaultSiteId,
              inHm: inTime,
              outHm: outTime,
            },
          ],
        }),
      });

      const resJson = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resJson.error ?? "Failed to submit missed attendance request");
      }

      toast.success("Missed attendance request submitted for admin approval!");
      setDate("");
      setReason("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingInitial) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="rounded-2xl border-zinc-200/90 dark:border-white/10 bg-white dark:bg-white/[0.03] shadow-sm overflow-hidden">
          <CardHeader className="pb-4 border-b border-zinc-100 dark:border-white/5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400">
                <Clock className="size-5" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Missed Attendance Details
                </CardTitle>
                <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                  Request timeline correction for dates you were present at school.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            <div className="grid gap-4 sm:grid-cols-2 min-w-0">
              <div className="min-w-0">
                <DateField
                  id="manual-punch-date"
                  label="Date of Missing Attendance"
                  value={date}
                  onChange={setDate}
                  timeZone={tz}
                  className="w-full min-w-0"
                />
              </div>
              <div className="min-w-0">
                <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Assign to School Admin <span className="text-red-500">*</span>
                </label>
                <SearchableSelect
                  value={assigneeId}
                  onValueChange={setAssigneeId}
                  className="w-full min-w-0"
                  triggerClassName="w-full min-w-0 truncate"
                  options={assignees.map((a) => {
                    const isSuper = a.role === "super_admin";
                    const roleBadge = isSuper ? "👑 Super Admin" : "🛡️ School Admin";
                    const displayName = (a.name || a.email.split("@")[0] || "Admin").trim();
                    const label = `${displayName} — ${roleBadge}`;
                    return {
                      value: a.id,
                      label,
                      keywords: [a.name, a.email, a.role, isSuper ? "super" : "admin"],
                    };
                  })}
                  emptyLabel="Select admin..."
                />
              </div>
            </div>

            {/* In Time and Out Time */}
            <div className="grid gap-4 sm:grid-cols-2 rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-4 dark:border-white/5 dark:bg-white/[0.02]">
              <div>
                <AppTimePicker
                  id="manual-punch-in-time"
                  label="School Arrival Time (Punch In)"
                  value={inTime}
                  onChange={setInTime}
                />
              </div>
              <div>
                <AppTimePicker
                  id="manual-punch-out-time"
                  label="School Departure Time (Punch Out)"
                  value={outTime}
                  onChange={setOutTime}
                />
              </div>
              <p className="sm:col-span-2 text-[11px] text-zinc-500 flex items-center gap-1.5 pt-1">
                <Building className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                <span>Campus: Munshi Habibullah Mission School (Bemathang Campus, Kargil)</span>
              </p>
            </div>

            {/* Reason */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Reason for Missing Attendance <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Phone battery ran out upon arrival, or was assigned to special school duty."
                className="w-full rounded-xl border border-zinc-300 bg-white p-3 text-xs text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-white/15 dark:bg-zinc-900 dark:text-white"
              />
            </div>
          </CardContent>
        </Card>

        <Button
          type="submit"
          disabled={submitting}
          className="h-12 w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl shadow-md shadow-blue-500/20 transition-all active:scale-[0.99]"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Submit Missed Attendance Request
        </Button>
      </form>
    </div>
  );
}
