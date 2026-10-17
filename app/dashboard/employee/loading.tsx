import { TeacherHomeSkeleton } from "@/components/client/dashboard-skeletons";

export default function Loading() {
  return (
    <div className="p-3 sm:p-6 md:p-8">
      <TeacherHomeSkeleton />
    </div>
  );
}
