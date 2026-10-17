import { WorkingHoursSkeleton } from "@/components/client/dashboard-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="p-3 sm:p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Teacher & Staff Attendance
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Monthly attendance records, campus punch-in/out logs, approved leaves, and official downloadable PDFs.
          </p>
        </div>
        <Skeleton className="h-10 w-48 rounded-xl" />
      </div>

      <div className="flex gap-2">
        <Skeleton className="h-11 w-72 rounded-xl" />
      </div>

      <WorkingHoursSkeleton />
    </div>
  );
}
