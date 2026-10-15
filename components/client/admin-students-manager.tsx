"use client";

import * as React from "react";
import {
  GraduationCap,
  Calendar,
  Plus,
  Loader2,
  Users,
  Search,
  Filter,
  X,
  CheckCircle2,
  Clock,
  ArrowRight,
  RefreshCw,
  BarChart3,
  Layers,
  School,
  UserCheck,
  UserX,
  LayoutGrid,
  ClipboardList,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, formFieldLabelClass } from "@/components/ui/input";
import { StudentAttendanceBoard } from "@/components/client/student-attendance-board";
import { SchoolConfig, DEFAULT_SCHOOL_CONFIG, getSectionsForClass } from "@/lib/school/config";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { toast } from "sonner";
import { AppDatePicker } from "@/components/ui/app-date-picker";
import { AppSelect } from "@/components/ui/app-select";
import type { SchoolAttendanceSummaryResponse, ClassAttendanceSummary } from "@/app/api/school/students/school-summary/route";

type ViewMode = "matrix" | "rollcall";

export function AdminStudentsManager() {
  const [config, setConfig] = React.useState<SchoolConfig>(DEFAULT_SCHOOL_CONFIG);
  const [loadingConfig, setLoadingConfig] = React.useState(true);

  const [selectedWing, setSelectedWing] = React.useState<string>("higher");
  const [selectedClass, setSelectedClass] = React.useState<string>("Class 1");
  const [selectedSection, setSelectedSection] = React.useState<string>("Section A");

  const todayStr = React.useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const [selectedDate, setSelectedDate] = React.useState<string>(todayStr);

  const [viewMode, setViewMode] = React.useState<ViewMode>("matrix");

  // School-wide summary state
  const [summary, setSummary] = React.useState<SchoolAttendanceSummaryResponse | null>(null);
  const [loadingSummary, setLoadingSummary] = React.useState(true);
  const [refreshingSummary, setRefreshingSummary] = React.useState(false);

  // Matrix filters
  const [filterWing, setFilterWing] = React.useState<string>("all");
  const [filterStatus, setFilterStatus] = React.useState<"all" | "submitted" | "pending">("all");
  const [searchQuery, setSearchQuery] = React.useState<string>("");

  // Add student modal state
  const [addModalOpen, setAddModalOpen] = React.useState(false);
  const [addWing, setAddWing] = React.useState<string>("higher");
  const [addClass, setAddClass] = React.useState<string>("Class 1");
  const [addSection, setAddSection] = React.useState<string>("Section A");
  const [stName, setStName] = React.useState("");
  const [stRollNo, setStRollNo] = React.useState("");
  const [stPhone, setStPhone] = React.useState("");
  const [addingStudent, setAddingStudent] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);

  // Load school config
  React.useEffect(() => {
    fetch("/api/school/config")
      .then((r) => r.json())
      .then((data: SchoolConfig) => {
        if (data && data.wings) {
          setConfig(data);
          const firstWing = data.wings[0];
          let firstCls = "Class 1";
          if (firstWing) {
            setSelectedWing(firstWing.id);
            setAddWing(firstWing.id);
            if (firstWing.classes[0]) {
              firstCls = firstWing.classes[0];
              setSelectedClass(firstCls);
              setAddClass(firstCls);
            }
          }
          const secs = getSectionsForClass(data, firstCls);
          if (secs[0]) {
            setSelectedSection(secs[0]);
            setAddSection(secs[0]);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingConfig(false));
  }, []);

  // Fetch school-wide summary
  const fetchSummary = React.useCallback(async (date: string, isManual = false) => {
    if (isManual) setRefreshingSummary(true);
    else setLoadingSummary(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) return;
      const token = await u.getIdToken();

      const res = await fetch(`/api/school/students/school-summary?date=${encodeURIComponent(date)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = (await res.json()) as SchoolAttendanceSummaryResponse;
        setSummary(json);
      }
    } catch (err) {
      console.error("[AdminStudentsManager] fetchSummary error:", err);
    } finally {
      setLoadingSummary(false);
      setRefreshingSummary(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchSummary(selectedDate);
  }, [selectedDate, fetchSummary, reloadKey]);

  // Dynamically compute available sections for class in rollcall mode
  const availableSections = React.useMemo(() => {
    return getSectionsForClass(config, selectedClass);
  }, [config, selectedClass]);

  // Sections for add modal
  const addModalSections = React.useMemo(() => {
    return getSectionsForClass(config, addClass);
  }, [config, addClass]);

  React.useEffect(() => {
    if (availableSections.length > 0 && !availableSections.includes(selectedSection)) {
      setSelectedSection(availableSections[0]!);
    }
  }, [availableSections, selectedSection]);

  const activeWing = config.wings.find((w) => w.id === selectedWing) || config.wings[0];
  const activeAddWing = config.wings.find((w) => w.id === addWing) || config.wings[0];

  const handleWingChange = (wingId: string) => {
    setSelectedWing(wingId);
    const w = config.wings.find((x) => x.id === wingId);
    if (w && w.classes.length > 0) {
      setSelectedClass(w.classes[0]!);
    }
  };

  const handleAddWingChange = (wingId: string) => {
    setAddWing(wingId);
    const w = config.wings.find((x) => x.id === wingId);
    if (w && w.classes.length > 0) {
      setAddClass(w.classes[0]!);
    }
  };

  const handleOpenClassRollCall = (classItem: ClassAttendanceSummary) => {
    setSelectedWing(classItem.wingId);
    setSelectedClass(classItem.classId);
    setSelectedSection(classItem.sectionId);
    setViewMode("rollcall");
  };

  const openAddStudentForCurrentClass = () => {
    setAddWing(selectedWing);
    setAddClass(selectedClass);
    setAddSection(selectedSection);
    setStName("");
    setStRollNo("");
    setStPhone("");
    setAddModalOpen(true);
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    const rollNo = parseInt(stRollNo, 10);
    if (!stName.trim() || isNaN(rollNo) || rollNo <= 0) {
      toast.error("Please enter a valid student name and roll number.");
      return;
    }

    setAddingStudent(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();

      const res = await fetch("/api/school/students", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          wingId: addWing,
          classId: addClass,
          sectionId: addSection,
          rollNo,
          name: stName.trim(),
          parentPhone: stPhone.trim() || undefined,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to add student");

      toast.success(`Student ${stName.trim()} (Roll #${rollNo}) added to ${addClass} (${addSection})!`);
      setAddModalOpen(false);
      setStName("");
      setStRollNo("");
      setStPhone("");
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error adding student");
    } finally {
      setAddingStudent(false);
    }
  };

  // Filtered class matrix
  const filteredClasses = React.useMemo(() => {
    if (!summary?.classSummaries) return [];
    return summary.classSummaries.filter((cls) => {
      if (filterWing !== "all" && cls.wingId !== filterWing) return false;
      if (filterStatus === "submitted" && !cls.isSubmitted) return false;
      if (filterStatus === "pending" && cls.isSubmitted) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchClass = cls.classId.toLowerCase().includes(query);
        const matchSec = cls.sectionId.toLowerCase().includes(query);
        const matchWing = cls.wingName.toLowerCase().includes(query);
        if (!matchClass && !matchSec && !matchWing) return false;
      }
      return true;
    });
  }, [summary, filterWing, filterStatus, searchQuery]);

  if (loadingConfig) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const markedTotal = (summary?.totalPresent || 0) + (summary?.totalAbsent || 0) + (summary?.totalLate || 0);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl border border-zinc-200/90 bg-white p-5 sm:p-6 shadow-sm dark:border-white/10 dark:bg-zinc-950">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2">
            <School className="size-3.5" />
            School Administration Portal
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            Student Attendance & Rosters
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-2xl">
            Live school-wide strength overview, whole-school roll call monitoring, and unrestricted access to every class across Lower, Higher, and Rewa na Kasco wings.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          {/* Quick Date Picker */}
          <div className="w-44">
            <AppDatePicker
              value={selectedDate}
              onChange={(d) => setSelectedDate(d)}
              showClear={false}
              className="py-1.5 text-xs rounded-2xl"
            />
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void fetchSummary(selectedDate, true)}
            disabled={refreshingSummary}
            className="gap-1.5 text-xs font-semibold rounded-2xl h-9 border-zinc-200 dark:border-white/10"
            title="Refresh summary"
          >
            <RefreshCw className={`size-3.5 ${refreshingSummary ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={openAddStudentForCurrentClass}
            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-2xl h-9 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Add Student
          </Button>
        </div>
      </div>

      {/* Whole School Strength & Daily Attendance KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Whole School Strength */}
        <Card className="relative overflow-hidden border-zinc-200/90 shadow-sm dark:border-white/10 bg-gradient-to-br from-blue-50/60 via-white to-white dark:from-blue-950/20 dark:via-zinc-950 dark:to-zinc-950">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                Whole School Strength
              </span>
              <div className="flex size-9 items-center justify-center rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400">
                <Users className="size-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-zinc-50">
                {loadingSummary ? "..." : summary?.totalSchoolStudents || 0}
              </span>
              <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Total Enrolled</span>
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              Active across {summary?.totalClassesCount || 42} sections in 3 wings
            </p>
          </CardContent>
        </Card>

        {/* KPI 2: Overall Attendance Rate */}
        <Card className="relative overflow-hidden border-zinc-200/90 shadow-sm dark:border-white/10 bg-gradient-to-br from-emerald-50/60 via-white to-white dark:from-emerald-950/20 dark:via-zinc-950 dark:to-zinc-950">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                School Attendance
              </span>
              <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <BarChart3 className="size-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-zinc-50">
                {loadingSummary ? "..." : `${summary?.overallAttendancePercent ?? 0}%`}
              </span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                {markedTotal > 0 ? `${summary?.totalPresent || 0} Present` : "No records yet"}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              {markedTotal > 0
                ? `Based on ${markedTotal} students recorded for ${selectedDate}`
                : "Awaiting class roll calls for today"}
            </p>
          </CardContent>
        </Card>

        {/* KPI 3: Daily Present vs Absent */}
        <Card className="relative overflow-hidden border-zinc-200/90 shadow-sm dark:border-white/10 bg-gradient-to-br from-indigo-50/60 via-white to-white dark:from-indigo-950/20 dark:via-zinc-950 dark:to-zinc-950">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                Recorded Attendance
              </span>
              <div className="flex size-9 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                <UserCheck className="size-5" />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {summary?.totalPresent || 0}
                </span>
                <span className="text-[11px] font-bold text-zinc-500">Present</span>
              </div>
              <span className="text-zinc-300 dark:text-zinc-700 font-bold">•</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-rose-600 dark:text-rose-400">
                  {summary?.totalAbsent || 0}
                </span>
                <span className="text-[11px] font-bold text-zinc-500">Absent</span>
              </div>
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              {summary?.totalLate ? `${summary.totalLate} Late arrivals` : "0 Late arrivals"} recorded today
            </p>
          </CardContent>
        </Card>

        {/* KPI 4: Roll Call Submissions */}
        <Card className="relative overflow-hidden border-zinc-200/90 shadow-sm dark:border-white/10 bg-gradient-to-br from-amber-50/60 via-white to-white dark:from-amber-950/20 dark:via-zinc-950 dark:to-zinc-950">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                Class Submissions
              </span>
              <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <ClipboardList className="size-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-zinc-50">
                {summary?.submittedClassesCount || 0}
                <span className="text-sm font-semibold text-zinc-400">
                  /{summary?.totalClassesCount || 42}
                </span>
              </span>
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                {summary?.pendingClassesCount || 0} Pending
              </span>
            </div>
            {/* Progress Bar */}
            <div className="mt-2 h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all duration-500 rounded-full"
                style={{
                  width: `${
                    summary?.totalClassesCount
                      ? Math.round(((summary.submittedClassesCount || 0) / summary.totalClassesCount) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* View Switcher Tabs & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-200/90 pb-3 dark:border-white/10">
        <div className="inline-flex rounded-2xl bg-zinc-100 p-1 dark:bg-zinc-900 border border-zinc-200/80 dark:border-white/10 shadow-xs">
          <button
            type="button"
            onClick={() => setViewMode("matrix")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
              viewMode === "matrix"
                ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            <LayoutGrid className="size-4" />
            Whole School Matrix
            {summary && (
              <span className="ml-1 rounded-full bg-zinc-200/80 px-2 py-0.5 text-[10px] font-bold text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200">
                {summary.totalClassesCount} Classes
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setViewMode("rollcall")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
              viewMode === "rollcall"
                ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            <ClipboardList className="size-4" />
            Class Roll Call & Inspection
            <span className="ml-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400">
              {selectedClass} ({selectedSection})
            </span>
          </button>
        </div>

        {/* Wing breakdown quick pills */}
        {summary?.wings && summary.wings.length > 0 && (
          <div className="hidden lg:flex items-center gap-2 text-xs">
            {summary.wings.map((w) => (
              <div
                key={w.wingId}
                className="flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-zinc-50/70 px-2.5 py-1 text-[11px] font-medium dark:border-white/10 dark:bg-zinc-900/50"
              >
                <span className="font-bold text-zinc-700 dark:text-zinc-300">{w.wingName}:</span>
                <span className="font-extrabold text-blue-600 dark:text-blue-400">{w.totalStudents}</span>
                <span className="text-zinc-400">({w.submittedClassesCount}/{w.totalClassesCount} sub)</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* VIEW MODE 1: WHOLE SCHOOL MATRIX */}
      {viewMode === "matrix" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Filters Bar */}
          <Card className="border-zinc-200/90 shadow-sm dark:border-white/10">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                {/* Search input */}
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
                  <Input
                    placeholder="Search class or section (e.g. Class 1, Nursery, Section B)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 text-xs rounded-xl"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>

                {/* Wing & Status Filters */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Wing Selector Tabs */}
                  <div className="inline-flex rounded-xl bg-zinc-100 p-0.5 dark:bg-zinc-900 border border-zinc-200/80 dark:border-white/10 text-xs">
                    <button
                      type="button"
                      onClick={() => setFilterWing("all")}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                        filterWing === "all"
                          ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-100"
                          : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      All Wings
                    </button>
                    {config.wings.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => setFilterWing(w.id)}
                        className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                          filterWing === w.id
                            ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-100"
                            : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
                        }`}
                      >
                        {w.name}
                      </button>
                    ))}
                  </div>

                  {/* Status filter tabs */}
                  <div className="inline-flex rounded-xl bg-zinc-100 p-0.5 dark:bg-zinc-900 border border-zinc-200/80 dark:border-white/10 text-xs">
                    <button
                      type="button"
                      onClick={() => setFilterStatus("all")}
                      className={`px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                        filterStatus === "all"
                          ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-100"
                          : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      All Status
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterStatus("submitted")}
                      className={`px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                        filterStatus === "submitted"
                          ? "bg-white text-emerald-700 shadow-xs dark:bg-zinc-800 dark:text-emerald-400"
                          : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      Submitted
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterStatus("pending")}
                      className={`px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                        filterStatus === "pending"
                          ? "bg-white text-amber-700 shadow-xs dark:bg-zinc-800 dark:text-amber-400"
                          : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      Pending
                    </button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Matrix Grid */}
          {loadingSummary ? (
            <div className="flex min-h-[250px] items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
            </div>
          ) : filteredClasses.length === 0 ? (
            <div className="rounded-3xl border border-zinc-200 bg-white p-12 text-center shadow-xs dark:border-white/10 dark:bg-zinc-950">
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                No classes match the active filters
              </p>
              <p className="text-xs text-zinc-400 mt-1">Try clearing your search query or wing filters</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredClasses.map((cls) => {
                const isSelected =
                  selectedClass === cls.classId &&
                  selectedSection === cls.sectionId &&
                  selectedWing === cls.wingId;

                return (
                  <div
                    key={`${cls.wingId}_${cls.classId}_${cls.sectionId}`}
                    onClick={() => handleOpenClassRollCall(cls)}
                    className={`group relative rounded-3xl border p-4.5 transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md ${
                      cls.isSubmitted
                        ? "border-emerald-500/30 bg-emerald-500/[0.02] hover:border-emerald-500/50 hover:bg-emerald-500/[0.05]"
                        : "border-zinc-200/90 bg-white hover:border-blue-500/40 hover:bg-blue-500/[0.02] dark:border-white/10 dark:bg-zinc-950 dark:hover:border-blue-500/30"
                    } ${isSelected ? "ring-2 ring-blue-600 dark:ring-blue-500" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                          {cls.wingName}
                        </span>
                        <h3 className="text-base font-extrabold text-zinc-900 group-hover:text-blue-600 dark:text-zinc-100 dark:group-hover:text-blue-400 transition-colors">
                          {cls.classId} — {cls.sectionId}
                        </h3>
                      </div>

                      {/* Status Badge */}
                      {cls.isSubmitted ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                          <CheckCircle2 className="size-3" />
                          {cls.attendancePercent}%
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400 shrink-0">
                          <Clock className="size-3" />
                          Pending
                        </span>
                      )}
                    </div>

                    {/* Stats & Roster Count */}
                    <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-white/5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-zinc-100 px-2 py-0.5 text-[11px] font-bold text-zinc-700 dark:bg-white/5 dark:text-zinc-300">
                          {cls.totalStudents} Students
                        </span>
                        {cls.isSubmitted && (
                          <span className="text-[11px] font-semibold text-zinc-500">
                            {cls.presentCount}P / {cls.absentCount}A
                          </span>
                        )}
                      </div>

                      <span className="flex items-center gap-1 text-[11px] font-bold text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity dark:text-blue-400">
                        Roll Call <ArrowRight className="size-3" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW MODE 2: CLASS ROLL CALL & INSPECTION */}
      {viewMode === "rollcall" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Class Selectors Bar */}
          <Card className="border-zinc-200/90 shadow-sm dark:border-white/10">
            <CardContent className="p-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setViewMode("matrix")}
                    className="gap-1.5 text-xs font-bold rounded-xl h-9 border-zinc-200 dark:border-white/10"
                  >
                    ← All Classes Matrix
                  </Button>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <Sparkles className="size-3" />
                    Admin Master Access (All Classes Unlocked)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs flex-1 max-w-3xl">
                  {/* Wing */}
                  <div className="flex flex-col gap-1">
                    <span className={formFieldLabelClass}>School Wing</span>
                    <AppSelect
                      value={selectedWing}
                      onChange={(val) => handleWingChange(val)}
                      options={config.wings.map((w) => ({ value: w.id, label: w.name }))}
                      placeholder="Select Wing"
                      drawerTitle="Select School Wing"
                    />
                  </div>

                  {/* Class */}
                  <div className="flex flex-col gap-1">
                    <span className={formFieldLabelClass}>Class</span>
                    <AppSelect
                      value={selectedClass}
                      onChange={(val) => setSelectedClass(val)}
                      options={(activeWing?.classes || []).map((cls) => ({ value: cls, label: cls }))}
                      placeholder="Select Class"
                      drawerTitle="Select Class"
                    />
                  </div>

                  {/* Section */}
                  <div className="flex flex-col gap-1">
                    <span className={formFieldLabelClass}>Section</span>
                    <AppSelect
                      value={selectedSection}
                      onChange={(val) => setSelectedSection(val)}
                      options={availableSections.map((sec) => ({ value: sec, label: `Section ${sec}` }))}
                      placeholder="Select Section"
                      drawerTitle="Select Section"
                    />
                  </div>

                  {/* Date */}
                  <div className="flex flex-col gap-1">
                    <span className={formFieldLabelClass}>Attendance Date</span>
                    <AppDatePicker
                      value={selectedDate}
                      onChange={(d) => setSelectedDate(d)}
                      drawerTitle="Attendance Date"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Embedded Student Attendance Board with isAdmin={true} */}
          {selectedClass && selectedSection && (
            <div key={`${selectedWing}-${selectedClass}-${selectedSection}-${selectedDate}-${reloadKey}`}>
              <StudentAttendanceBoard
                classId={selectedClass}
                sectionId={selectedSection}
                wingId={selectedWing}
                dateStr={selectedDate}
                isAdmin={true}
              />
            </div>
          )}
        </div>
      )}

      {/* Add Student Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-[9999] flex flex-col justify-end sm:justify-center sm:items-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="fixed inset-0 -z-10" onClick={() => setAddModalOpen(false)} aria-hidden="true" />
          <Card className="relative w-full sm:max-w-lg rounded-t-[28px] sm:rounded-2xl border-t sm:border border-zinc-200 shadow-2xl dark:border-white/10 dark:bg-zinc-950 max-h-[90dvh] overflow-y-auto animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
            {/* Top drag handle for mobile */}
            <div className="mx-auto mt-3 mb-1 h-1.5 w-12 rounded-full bg-zinc-300 dark:bg-zinc-700 sm:hidden shrink-0" />

            {/* Top Right Close Button */}
            <button
              type="button"
              onClick={() => setAddModalOpen(false)}
              className="absolute top-4 right-4 z-20 flex size-8 items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/10 cursor-pointer shadow-xs transition-colors"
              title="Close"
            >
              <X className="size-4" />
            </button>

            <CardHeader className="pr-14">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Plus className="size-5 text-blue-600" />
                Add Student to Roster
              </CardTitle>
              <CardDescription className="text-xs">
                Select target class and fill out student information.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={(e) => void handleAddStudent(e)} className="space-y-4">
                {/* Target Class Selection in Modal */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 rounded-2xl border border-zinc-200/80 bg-zinc-50/60 p-3 text-xs dark:border-white/10 dark:bg-zinc-900/40">
                  <div className="flex flex-col gap-1">
                    <span className={formFieldLabelClass}>Wing</span>
                    <AppSelect
                      value={addWing}
                      onChange={(val) => handleAddWingChange(val)}
                      options={config.wings.map((w) => ({ value: w.id, label: w.name }))}
                      drawerTitle="Select Wing"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className={formFieldLabelClass}>Class</span>
                    <AppSelect
                      value={addClass}
                      onChange={(val) => setAddClass(val)}
                      options={(activeAddWing?.classes || []).map((cls) => ({ value: cls, label: cls }))}
                      drawerTitle="Select Class"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className={formFieldLabelClass}>Section</span>
                    <AppSelect
                      value={addSection}
                      onChange={(val) => setAddSection(val)}
                      options={addModalSections.map((sec) => ({ value: sec, label: `Section ${sec}` }))}
                      drawerTitle="Select Section"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="sm:col-span-2 flex flex-col gap-1 text-xs">
                    <span className={formFieldLabelClass}>Student Full Name</span>
                    <Input
                      required
                      value={stName}
                      onChange={(e) => setStName(e.target.value)}
                      placeholder="e.g. Fatima Banoo"
                      className="rounded-xl"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-xs">
                    <span className={formFieldLabelClass}>Roll Number</span>
                    <Input
                      type="number"
                      min="1"
                      required
                      value={stRollNo}
                      onChange={(e) => setStRollNo(e.target.value)}
                      placeholder="e.g. 1"
                      className="rounded-xl"
                    />
                  </label>
                </div>

                <label className="flex flex-col gap-1 text-xs">
                  <span className={formFieldLabelClass}>Parent Phone (Optional)</span>
                  <Input
                    type="tel"
                    value={stPhone}
                    onChange={(e) => setStPhone(e.target.value)}
                    placeholder="e.g. +91 9419123456"
                    className="rounded-xl"
                  />
                </label>

                <div className="pt-2 flex justify-end gap-2.5">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAddModalOpen(false)}
                    disabled={addingStudent}
                    className="text-xs rounded-xl"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={addingStudent}
                    className="gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl"
                  >
                    {addingStudent && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Save Student
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
