"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { Bell, Check, CheckCheck, ArrowLeft, ExternalLink, Loader2, Trash2 } from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Row = {
  id: string;
  title?: string;
  body?: string;
  kind?: string;
  read?: boolean;
  link?: string;
  createdAt?: { seconds?: number } | null;
};

const KIND_META: Record<string, { label: string; color: string }> = {
  assignment:       { label: "Assignment",        color: "text-cyan-400" },
  overtime_request: { label: "Overtime request",  color: "text-amber-400" },
  overtime_approved:{ label: "Overtime approved", color: "text-emerald-400" },
  overtime_rejected:{ label: "Overtime rejected", color: "text-red-400" },
  offsite_request:  { label: "Off-site request",  color: "text-violet-400" },
  offsite_approved: { label: "Off-site approved", color: "text-emerald-400" },
  offsite_rejected: { label: "Off-site rejected", color: "text-red-400" },
  login_request:    { label: "Login request",     color: "text-sky-400" },
  login_approved:   { label: "Login approved",    color: "text-emerald-400" },
  login_rejected:   { label: "Login rejected",    color: "text-red-400" },
  system:           { label: "System",            color: "text-zinc-400" },
};

function fmtTime(row: Row): string {
  const s = row.createdAt?.seconds;
  if (!s) return "";
  return new Date(s * 1000).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function NotificationsPage() {
  const pathname = usePathname();
  const [items, setItems] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [marking, setMarking] = React.useState(false);

  const authHeaders = React.useCallback(async () => {
    const auth = getFirebaseAuth();
    const u = auth.currentUser;
    if (!u) throw new Error("Not signed in");
    const token = await u.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }, []);

  const load = React.useCallback(async (opts?: { fresh?: boolean }) => {
    const h = await authHeaders();
    const q = opts?.fresh ? "?fresh=1" : "";
    const res = await fetch(`/api/notifications${q}`, { headers: h, cache: "no-store" });
    const data = (await res.json()) as { items?: Row[]; error?: string };
    if (!res.ok) throw new Error(data.error ?? "Failed to load");
    setItems(data.items ?? []);
  }, [authHeaders]);

  React.useEffect(() => {
    let cancelled = false;
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) { setItems([]); setLoading(false); return; }
      setLoading(true);
      void load({ fresh: true })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLoading(false); });
    });
    return () => { cancelled = true; unsub(); };
  }, [load]);

  React.useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth.currentUser) return;
    void load({ fresh: true }).catch(() => {});
  }, [pathname, load]);

  const markAll = async () => {
    const ids = items.filter((i) => !i.read).map((i) => i.id);
    if (!ids.length && unread === 0) return;
    setMarking(true);
    // Instant optimistic update
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    try {
      const h = await authHeaders();
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ all: true, ids }),
      });
      if (!res.ok) throw new Error("Failed to mark read");
      toast.success("All notifications marked as read");
      await load({ fresh: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to mark all read");
    } finally {
      setMarking(false);
    }
  };

  const markOne = async (id: string) => {
    // Instant optimistic update
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, read: true } : i)));
    try {
      const h = await authHeaders();
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      void load({ fresh: true });
    } catch {
      /* ignore */
    }
  };

  const deleteOne = async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      const h = await authHeaders();
      await fetch("/api/notifications", {
        method: "DELETE",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      toast.success("Notification deleted");
      void load({ fresh: true });
    } catch {
      toast.error("Failed to delete notification");
    }
  };

  const [deleting, setDeleting] = React.useState(false);
  const clearAll = async () => {
    if (items.length === 0) return;
    setDeleting(true);
    setItems([]);
    try {
      const h = await authHeaders();
      const res = await fetch("/api/notifications", {
        method: "DELETE",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!res.ok) throw new Error("Failed to clear notifications");
      toast.success("All notifications cleared");
      await load({ fresh: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clear notifications");
    } finally {
      setDeleting(false);
    }
  };

  const unread = items.filter((i) => !i.read).length;

  return (
    <div className="mx-auto max-w-2xl p-3 sm:p-6 md:p-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="shrink-0">
          <Link href="/dashboard/employee/check-in" aria-label="Back">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <div className="flex flex-1 items-center gap-2">
          <Bell className="size-5 text-cyan-400" aria-hidden />
          <h1 className="text-xl font-semibold tracking-tight">Notifications</h1>
          {unread > 0 && (
            <span className="flex min-w-[1.25rem] items-center justify-center rounded-full bg-cyan-500 px-1.5 py-0.5 text-[11px] font-bold text-white">
              {unread}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unread > 0 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={marking}
              onClick={() => void markAll()}
              className="gap-1.5 cursor-pointer"
            >
              {marking ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCheck className="size-4" />
              )}
              <span>Mark read</span>
            </Button>
          )}
          {items.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={deleting}
              onClick={() => void clearAll()}
              className="gap-1 text-xs text-zinc-500 hover:text-red-500 hover:bg-red-500/10 dark:text-zinc-400 cursor-pointer"
              title="Clear all notifications"
            >
              {deleting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              <span>Clear all</span>
            </Button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-800/50" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Bell className="size-10 text-zinc-600" aria-hidden />
          <p className="text-zinc-400">No notifications yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((row) => {
            const meta = KIND_META[row.kind ?? ""] ?? { label: row.kind ?? "Notice", color: "text-zinc-400" };
            return (
              <li
                key={row.id}
                className={cn(
                  "group relative rounded-xl border px-4 py-3.5 transition-colors",
                  !row.read
                    ? "border-cyan-500/25 bg-cyan-500/[0.06] hover:bg-cyan-500/10"
                    : "border-white/8 bg-white/[0.02] hover:bg-white/5"
                )}
              >
                {/* Unread dot */}
                {!row.read && (
                  <span className="absolute right-3 top-3.5 size-2 rounded-full bg-cyan-500" aria-label="Unread" />
                )}

                <div className="flex flex-col gap-1 pr-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("text-[10px] font-semibold uppercase tracking-wider", meta.color)}>
                      {meta.label}
                    </span>
                    <span className="text-[10px] text-zinc-500">{fmtTime(row)}</span>
                  </div>
                  <p className="text-sm font-medium text-zinc-100">{row.title ?? "Notice"}</p>
                  {row.body && (
                    <p className="text-xs leading-relaxed text-zinc-400">{row.body}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {row.link && (
                      <Button asChild size="sm" variant="secondary" className="h-7 gap-1 text-xs"
                        onClick={() => { if (!row.read) void markOne(row.id); }}
                      >
                        <Link href={row.link}>
                          View <ExternalLink className="size-3" />
                        </Link>
                      </Button>
                    )}
                    {!row.read && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs text-zinc-500 hover:text-cyan-600 hover:bg-cyan-500/10 dark:text-zinc-400 dark:hover:text-cyan-300 cursor-pointer"
                        onClick={() => void markOne(row.id)}
                      >
                        <Check className="size-3" />
                        <span>Mark read</span>
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs text-zinc-400 hover:text-red-500 hover:bg-red-500/10 dark:hover:text-red-400 cursor-pointer ml-auto"
                      onClick={() => void deleteOne(row.id)}
                      title="Delete notification"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
