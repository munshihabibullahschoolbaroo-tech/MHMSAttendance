import { WorkingHoursMonthPanel } from "@/components/client/working-hours-month-panel";

export default function EmployeeWorkingHoursPage() {
  return (
    <div className="p-3 sm:p-6 md:p-8">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
          My Attendance & Working Hours
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          View your verified campus punch-in/out records, monthly attendance summary, and download official attendance PDFs.
        </p>
      </div>
      <div className="mx-auto max-w-5xl">
        <WorkingHoursMonthPanel />
      </div>
    </div>
  );
}
