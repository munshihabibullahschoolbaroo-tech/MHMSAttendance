import { TeacherStudentsManager } from "@/components/client/teacher-students-manager";

export const metadata = {
  title: "Student Attendance",
};

export default function EmployeeStudentsPage() {
  return (
    <div className="p-3 sm:p-6 md:p-8">
      <TeacherStudentsManager />
    </div>
  );
}
