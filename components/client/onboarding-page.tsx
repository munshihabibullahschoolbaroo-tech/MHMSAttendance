"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import {
  GraduationCap,
  Baby,
  Palette,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Phone,
  UserCheck,
  Building2,
  LogOut,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, formFieldLabelClass } from "@/components/ui/input";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { AppSelect } from "@/components/ui/app-select";
import { MhmsMark } from "@/components/mhms-mark";
import { MtesBrandLockup } from "@/components/client/mtes-brand-lockup";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { type SchoolConfig, type SchoolWingId, getSectionsForClass } from "@/lib/school/config";
import { DEFAULT_SCHOOL_CONFIG } from "@/lib/school/config";

type AssignedClassRecord = {
  classId: string;
  sectionId: string;
  wingId?: string;
  teacherName?: string;
  teacherId: string;
};

type PositionsStatus = {
  principalTaken: boolean;
  vicePrincipalFull: boolean;
  inchargeTaken: boolean;
  assignedClasses?: AssignedClassRecord[];
};

export function OnboardingPage() {
  const { user } = useDashboardUser();
  const router = useRouter();

  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [stepDirection, setStepDirection] = React.useState<1 | -1>(1);
  const [config, setConfig] = React.useState<SchoolConfig>(DEFAULT_SCHOOL_CONFIG);
  const [posStatus, setPosStatus] = React.useState<PositionsStatus>({
    principalTaken: false,
    vicePrincipalFull: false,
    inchargeTaken: false,
  });

  const [wingId, setWingId] = React.useState<SchoolWingId>("higher");
  const [fullName, setFullName] = React.useState(user?.name || "");
  const [position, setPosition] = React.useState<string>("teacher");
  const [customDesignation, setCustomDesignation] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [isClassTeacher, setIsClassTeacher] = React.useState<boolean>(false);
  const [schoolClassId, setSchoolClassId] = React.useState<string>("");
  const [schoolSectionId, setSchoolSectionId] = React.useState<string>("Section A");

  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  React.useEffect(() => {
    if (user?.name && !fullName) {
      setFullName(user.name);
    } else if (!fullName) {
      const auth = getFirebaseAuth();
      if (auth.currentUser?.displayName) {
        setFullName(auth.currentUser.displayName);
      }
    }
  }, [user?.name, fullName]);

  // Fetch school config and taken positions
  React.useEffect(() => {
    fetch("/api/school/config")
      .then((res) => res.json())
      .then((data: SchoolConfig) => setConfig(data))
      .catch(() => {});

    fetch("/api/school/positions-status")
      .then((res) => res.json())
      .then((data: PositionsStatus) => setPosStatus(data))
      .catch(() => {});
  }, []);

  const activeWing = config.wings.find((w) => w.id === wingId) || config.wings[0]!;

  const isSectionAssigned = React.useCallback(
    (classId: string, section: string) => {
      const normCls = classId.trim().toLowerCase();
      const normSec = section.replace(/^section\s+/i, "").trim().toLowerCase();
      return (posStatus.assignedClasses ?? []).some(
        (a) =>
          a.classId.trim().toLowerCase() === normCls &&
          a.sectionId.replace(/^section\s+/i, "").trim().toLowerCase() === normSec
      );
    },
    [posStatus.assignedClasses]
  );

  // Filter out classes where ALL sections are already assigned to someone
  const availableClassesForOnboarding = React.useMemo(() => {
    return activeWing.classes.filter((c) => {
      const allSecs = getSectionsForClass(config, c);
      return allSecs.some((s) => !isSectionAssigned(c, s));
    });
  }, [activeWing.classes, config, isSectionAssigned]);

  // Default class when wing changes
  React.useEffect(() => {
    if (availableClassesForOnboarding.length > 0) {
      if (!availableClassesForOnboarding.includes(schoolClassId)) {
        setSchoolClassId(availableClassesForOnboarding[0]!);
      }
    } else {
      setSchoolClassId("");
    }
    // Set appropriate default position for selected wing
    if (wingId === "rewa_na_kasco") {
      setPosition(posStatus.inchargeTaken ? "teacher" : "incharge");
    } else {
      setPosition("teacher");
    }
  }, [wingId, availableClassesForOnboarding, posStatus]);

  // Dynamically load sections configured for the chosen class, filtering out already assigned sections
  const availableSectionsForOnboarding = React.useMemo(() => {
    if (!schoolClassId) return [];
    const allSecs = getSectionsForClass(config, schoolClassId);
    return allSecs.filter((s) => !isSectionAssigned(schoolClassId, s));
  }, [config, schoolClassId, isSectionAssigned]);

  React.useEffect(() => {
    if (availableSectionsForOnboarding.length > 0 && !availableSectionsForOnboarding.includes(schoolSectionId)) {
      setSchoolSectionId(availableSectionsForOnboarding[0]!);
    } else if (availableSectionsForOnboarding.length === 0) {
      setSchoolSectionId("");
    }
  }, [availableSectionsForOnboarding, schoolSectionId]);

  const submit = async () => {
    setMsg(null);
    if (!fullName.trim()) {
      setMsg("Please enter your official full name.");
      return;
    }
    if (!phone.trim() || phone.trim().length < 7) {
      setMsg("Please enter a valid contact phone number.");
      return;
    }
    if (isClassTeacher && !schoolClassId) {
      setMsg("Please select your assigned class.");
      return;
    }

    setBusy(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();
      const res = await fetch("/api/account/onboarding", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: fullName.trim(),
          wingId,
          position,
          customDesignation: customDesignation.trim() || undefined,
          phone: phone.trim(),
          isClassTeacher,
          schoolClassId: isClassTeacher ? schoolClassId : undefined,
          schoolSectionId: isClassTeacher ? schoolSectionId : undefined,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save onboarding profile");

      window.location.href = "/dashboard/waiting-approval";
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to complete onboarding");
    } finally {
      setBusy(false);
    }
  };

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const [canScrollTop, setCanScrollTop] = React.useState(false);
  const [canScrollBottom, setCanScrollBottom] = React.useState(false);

  const checkScroll = React.useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const hasScrollable = el.scrollHeight > el.clientHeight + 4;
    const isTop = el.scrollTop <= 4;
    const isBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;

    setCanScrollTop(hasScrollable && !isTop);
    setCanScrollBottom(hasScrollable && !isBottom);
  }, []);

  React.useEffect(() => {
    checkScroll();
    const rafId = requestAnimationFrame(checkScroll);
    const handleResize = () => checkScroll();
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
    };
  }, [checkScroll, step, wingId, isClassTeacher]);

  React.useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    checkScroll();
  }, [step, checkScroll]);

  const maskStyle = React.useMemo(() => {
    if (canScrollTop && canScrollBottom) {
      return "linear-gradient(to bottom, transparent 0%, black 24px, black calc(100% - 24px), transparent 100%)";
    }
    if (canScrollTop) {
      return "linear-gradient(to bottom, transparent 0%, black 24px, black 100%)";
    }
    if (canScrollBottom) {
      return "linear-gradient(to bottom, black 0%, black calc(100% - 24px), transparent 100%)";
    }
    return "none";
  }, [canScrollTop, canScrollBottom]);

  return (
    <div className="relative h-screen w-full flex flex-col justify-between overflow-hidden sm:min-h-screen sm:h-auto sm:overflow-visible p-3 sm:p-6 md:p-8 bg-zinc-50 dark:bg-[#07090e]">
      <div className="pointer-events-none fixed inset-0 hero-mesh opacity-50 dark:opacity-30" />

      {/* Mobile Background Ambient Watermark (behind frosted glass) */}
      <div className="sm:hidden pointer-events-none fixed inset-0 flex items-center justify-center opacity-[0.05] dark:opacity-[0.07] z-0">
        <MhmsMark className="h-96 w-96 scale-125" size={384} />
      </div>

      {/* Mobile Top Section: Official School Brand & Prominent Emblem in Background */}
      <div className="sm:hidden absolute top-0 inset-x-0 h-[30vh] flex flex-col justify-between pt-3 pb-2 px-4 z-10">
        <div className="flex items-center justify-between w-full">
          <MtesBrandLockup variant="header" showLogo={true} showVendor={true} />
          <button
            type="button"
            onClick={async () => {
              const auth = getFirebaseAuth();
              await signOut(auth);
              window.location.href = "/login";
            }}
            className="text-[11px] text-zinc-500 hover:text-red-600 dark:hover:text-red-400 flex items-center gap-1 font-medium px-2.5 py-1 rounded-full border border-zinc-200/80 dark:border-white/10 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-sm cursor-pointer shadow-2xs shrink-0"
          >
            <LogOut className="size-3" />
            <span>Sign Out</span>
          </button>
        </div>

        {/* Prominent Authentic School Emblem in background */}
        <div className="flex flex-col items-center justify-center my-auto pointer-events-none">
          <div className="relative flex items-center justify-center">
            <div className="absolute size-24 rounded-full bg-blue-500/20 dark:bg-blue-400/20 blur-xl animate-pulse" />
            <MhmsMark className="h-14 w-14 drop-shadow-2xl" size={120} priority />
          </div>
          <p className="mt-1.5 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-800 dark:text-zinc-200">
            Munshi Habibullah Mission School
          </p>
          <p className="text-[9px] uppercase tracking-widest text-zinc-500 dark:text-zinc-400 font-medium">
            Bemathang, Kargil • Estd. 2004
          </p>
        </div>
      </div>

      {/* Desktop Top Header (Hidden on mobile) */}
      <header className="hidden sm:flex relative z-10 items-center justify-between max-w-3xl w-full mx-auto pb-4 pt-1">
        <MtesBrandLockup variant="header" showLogo={true} showVendor={true} />
        <button
          type="button"
          onClick={async () => {
            const auth = getFirebaseAuth();
            await signOut(auth);
            window.location.href = "/login";
          }}
          className="text-xs text-zinc-500 hover:text-red-600 dark:hover:text-red-400 flex items-center gap-1.5 font-medium px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-white/10 hover:border-red-500/30 transition-colors cursor-pointer bg-white/70 dark:bg-zinc-900/70 backdrop-blur-sm shadow-2xs"
        >
          <LogOut className="size-3.5" />
          <span>Sign Out</span>
        </button>
      </header>

      {/* Main Persistent Onboarding Card:
          - Mobile: Bottom sheet fixed at bottom, h-[70vh] max-h-[70vh], rounded-t-[2rem], blurred frosted glass.
          - Desktop: Centered card max-w-3xl.
          - Card container NEVER changes or unmounts; static header and static footer, only its inner middle content scrolls with smooth scroll-sensitive mask.
      */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex h-[70vh] max-h-[70vh] flex-col rounded-t-[2rem] border-t border-x-0 border-b-0 border-zinc-200/90 bg-white/90 shadow-2xl backdrop-blur-2xl dark:border-white/15 dark:bg-zinc-950/90 sm:relative sm:inset-auto sm:z-10 sm:h-auto sm:max-h-none sm:w-full sm:max-w-3xl sm:mx-auto sm:my-auto sm:rounded-2xl sm:border sm:bg-white/90 sm:backdrop-blur-xl sm:dark:bg-zinc-950/90 overflow-hidden sm:overflow-visible">
        
        {/* Mobile drag handle */}
        <div className="mx-auto mt-2.5 mb-1 h-1 w-10 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-700 sm:hidden" />

        {/* Card Header (Clean & Seamless without horizontal divider lines) */}
        <div className="px-4 py-2 sm:p-6 sm:pb-4 text-center shrink-0">
          <div className="mx-auto mb-2 hidden sm:block">
            <MhmsMark className="h-14 w-14 sm:h-16 sm:w-16" />
          </div>
          <h2 className="text-base sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Teacher Onboarding
          </h2>

          {/* Stepper indicator */}
          <div className="mt-2 sm:mt-3 flex items-center justify-center gap-1.5">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  step === s ? "w-6 sm:w-8 bg-blue-600 dark:bg-blue-500" : "w-1.5 sm:w-2 bg-zinc-300 dark:bg-white/20"
                )}
              />
            ))}
          </div>
        </div>

        {/* Middle Section (scrollable on mobile, seamless on desktop/tablets) */}
        <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden sm:overflow-visible">
          {/* Top smooth mask gradient indicator (mobile only) */}
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 h-5 z-10 bg-gradient-to-b from-white/95 dark:from-zinc-950/95 to-transparent transition-opacity duration-200 sm:hidden",
              canScrollTop ? "opacity-100" : "opacity-0"
            )}
          />

          <div
            ref={scrollContainerRef}
            onScroll={checkScroll}
            style={{
              WebkitMaskImage: isMobile ? maskStyle : undefined,
              maskImage: isMobile ? maskStyle : undefined,
              transition: "mask-image 0.15s ease-out, -webkit-mask-image 0.15s ease-out",
            }}
            className="flex-1 overflow-y-auto sm:overflow-y-visible px-4 py-3 sm:px-6 sm:py-5 no-scrollbar"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                initial={{ opacity: 0, x: stepDirection > 0 ? 18 : -18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: stepDirection > 0 ? -18 : 18 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="space-y-3 sm:space-y-4"
              >
                {/* STEP 1: Branch / Wing Selection */}
                {step === 1 && (
                  <div className="space-y-3 sm:space-y-4">
                    <div>
                      <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-zinc-100">
                        Select Your School Branch / Wing
                      </h3>
                      <p className="text-[11px] sm:text-xs text-zinc-500">
                        Choose which campus wing you are appointed to.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
                      {/* Higher Wing */}
                      <button
                        type="button"
                        onClick={() => setWingId("higher")}
                        className={cn(
                          "flex items-center sm:flex-col sm:items-center sm:justify-center p-3 sm:p-4 rounded-xl sm:rounded-2xl border text-left sm:text-center transition-all cursor-pointer gap-3 sm:gap-0",
                          wingId === "higher"
                            ? "border-blue-600 bg-blue-50/80 text-blue-900 shadow-xs dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-200"
                            : "border-zinc-200/90 hover:border-zinc-300 dark:border-white/10 dark:hover:border-white/20 bg-white/50 dark:bg-white/[0.02]"
                        )}
                      >
                        <div className="flex size-10 sm:size-12 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 sm:mb-2">
                          <GraduationCap className="size-5 sm:size-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">Higher School</p>
                          <p className="text-[11px] text-zinc-500">Class 1st to 12th</p>
                        </div>
                        <div className={cn(
                          "sm:hidden size-4.5 rounded-full border-2 flex items-center justify-center shrink-0",
                          wingId === "higher" ? "border-blue-600 bg-blue-600 text-white" : "border-zinc-300 dark:border-zinc-600"
                        )}>
                          {wingId === "higher" && <CheckCircle2 className="size-3 text-white" />}
                        </div>
                      </button>

                      {/* Lower Wing */}
                      <button
                        type="button"
                        onClick={() => setWingId("lower")}
                        className={cn(
                          "flex items-center sm:flex-col sm:items-center sm:justify-center p-3 sm:p-4 rounded-xl sm:rounded-2xl border text-left sm:text-center transition-all cursor-pointer gap-3 sm:gap-0",
                          wingId === "lower"
                            ? "border-emerald-600 bg-emerald-50/80 text-emerald-900 shadow-xs dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-200"
                            : "border-zinc-200/90 hover:border-zinc-300 dark:border-white/10 dark:hover:border-white/20 bg-white/50 dark:bg-white/[0.02]"
                        )}
                      >
                        <div className="flex size-10 sm:size-12 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 sm:mb-2">
                          <Baby className="size-5 sm:size-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">Lower School</p>
                          <p className="text-[11px] text-zinc-500">Pre-Nursery to UKG</p>
                        </div>
                        <div className={cn(
                          "sm:hidden size-4.5 rounded-full border-2 flex items-center justify-center shrink-0",
                          wingId === "lower" ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-300 dark:border-zinc-600"
                        )}>
                          {wingId === "lower" && <CheckCircle2 className="size-3 text-white" />}
                        </div>
                      </button>

                      {/* Rewa na Kasco */}
                      <button
                        type="button"
                        onClick={() => setWingId("rewa_na_kasco")}
                        className={cn(
                          "flex items-center sm:flex-col sm:items-center sm:justify-center p-3 sm:p-4 rounded-xl sm:rounded-2xl border text-left sm:text-center transition-all cursor-pointer gap-3 sm:gap-0",
                          wingId === "rewa_na_kasco"
                            ? "border-amber-600 bg-amber-50/80 text-amber-900 shadow-xs dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-200"
                            : "border-zinc-200/90 hover:border-zinc-300 dark:border-white/10 dark:hover:border-white/20 bg-white/50 dark:bg-white/[0.02]"
                        )}
                      >
                        <div className="flex size-10 sm:size-12 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 sm:mb-2">
                          <Palette className="size-5 sm:size-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">Rewa na Kasco</p>
                          <p className="text-[11px] text-zinc-500">Handicraft & Arts Wing</p>
                        </div>
                        <div className={cn(
                          "sm:hidden size-4.5 rounded-full border-2 flex items-center justify-center shrink-0",
                          wingId === "rewa_na_kasco" ? "border-amber-600 bg-amber-600 text-white" : "border-zinc-300 dark:border-zinc-600"
                        )}>
                          {wingId === "rewa_na_kasco" && <CheckCircle2 className="size-3 text-white" />}
                        </div>
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 2: Position & Contact */}
                {step === 2 && (
                  <div className="space-y-3 sm:space-y-4">
                    <div>
                      <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-zinc-100">
                        Position & Contact Details
                      </h3>
                      <p className="text-[11px] sm:text-xs text-zinc-500">
                        Appointed branch:{" "}
                        <strong className="text-zinc-800 dark:text-zinc-200 capitalize">
                          {wingId.replace(/_/g, " ")}
                        </strong>
                      </p>
                    </div>

                    {/* Full Official Name */}
                    <label className="flex flex-col gap-1 text-sm">
                      <span className={formFieldLabelClass}>Full Official Name *</span>
                      <div className="relative">
                        <Input
                          type="text"
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="e.g. Fatima Banoo / Mohammad Ali"
                          className="pl-9 rounded-xl font-medium h-10"
                        />
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                      </div>
                      <p className="text-[10px] sm:text-[11px] text-zinc-500">
                        Shown on staff attendance registers, PDF reports, and substitution records.
                      </p>
                    </label>

                    {/* Position dropdown */}
                    <div className="flex flex-col gap-1 text-sm">
                      <span className={formFieldLabelClass}>Designated Role / Position</span>
                      <AppSelect
                        value={position}
                        onChange={(val) => setPosition(val)}
                        options={activeWing.positions.map((p) => {
                          const isPrincipalTaken = p.id === "principal" && posStatus.principalTaken;
                          const isVpFull = p.id === "vice_principal" && posStatus.vicePrincipalFull;
                          const isInchargeTaken = p.id === "incharge" && posStatus.inchargeTaken;
                          const disabled = isPrincipalTaken || isVpFull || isInchargeTaken;
                          const note = isPrincipalTaken
                            ? "(Filled — 1 max)"
                            : isVpFull
                            ? "(Filled — 2 max)"
                            : isInchargeTaken
                            ? "(Filled — 1 max)"
                            : undefined;
                          return {
                            value: p.id,
                            label: p.name,
                            sublabel: note,
                            badge: disabled ? "Full" : undefined,
                          };
                        })}
                        drawerTitle="Select Designated Role"
                      />
                    </div>

                    {/* Optional Custom Designation */}
                    <label className="flex flex-col gap-1 text-sm">
                      <span className={formFieldLabelClass}>Specific Subject / Title (Optional)</span>
                      <Input
                        value={customDesignation}
                        onChange={(e) => setCustomDesignation(e.target.value)}
                        placeholder="e.g. Senior Mathematics Teacher, Science Faculty"
                        className="rounded-xl h-10"
                      />
                    </label>

                    {/* Contact Phone */}
                    <label className="flex flex-col gap-1 text-sm">
                      <span className={formFieldLabelClass}>Phone Number (For official records) *</span>
                      <div className="relative">
                        <Input
                          type="tel"
                          required
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="e.g. 98XXXXXXXX"
                          className="pl-9 rounded-xl h-10"
                        />
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                      </div>
                    </label>
                  </div>
                )}

                {/* STEP 3: Class Teacher Allocation & Review */}
                {step === 3 && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-zinc-100">
                        Class Teacher Allocation
                      </h3>
                      <p className="text-[11px] sm:text-xs text-zinc-500">
                        Are you responsible for daily class roll calls and student attendance?
                      </p>
                    </div>

                    {/* Toggle Question */}
                    <div className="flex items-center gap-4 p-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50/50 dark:bg-white/[0.02]">
                      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 flex-1">
                        Are you an assigned Class Teacher?
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setIsClassTeacher(true)}
                          className={cn(
                            "px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer",
                            isClassTeacher
                              ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                              : "border-zinc-300 dark:border-white/20 text-zinc-600 dark:text-zinc-300"
                          )}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsClassTeacher(false)}
                          className={cn(
                            "px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer",
                            !isClassTeacher
                              ? "border-zinc-700 bg-zinc-800 text-white shadow-sm"
                              : "border-zinc-300 dark:border-white/20 text-zinc-600 dark:text-zinc-300"
                          )}
                        >
                          No
                        </button>
                      </div>
                    </div>

                    {/* If Class Teacher is Yes, show Class and Section dropdowns */}
                    {isClassTeacher && (
                      <div className="space-y-3 p-3.5 rounded-xl border border-blue-500/20 bg-blue-50/30 dark:bg-blue-950/20">
                        {availableClassesForOnboarding.length === 0 ? (
                          <div className="p-3 text-xs rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
                            All classes in this branch are currently assigned to existing class teachers. You can continue onboarding without an assigned class, or contact an administrator.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1 text-sm">
                              <span className={formFieldLabelClass}>Assigned Class</span>
                              <AppSelect
                                value={schoolClassId}
                                onChange={(val) => setSchoolClassId(val)}
                                options={availableClassesForOnboarding.map((c) => ({ value: c, label: c }))}
                                drawerTitle="Select Assigned Class"
                              />
                            </div>

                            <div className="flex flex-col gap-1 text-sm">
                              <span className={formFieldLabelClass}>Assigned Section</span>
                              <AppSelect
                                value={schoolSectionId}
                                onChange={(val) => setSchoolSectionId(val)}
                                options={availableSectionsForOnboarding.map((s) => ({
                                  value: s,
                                  label: s.startsWith("Section ") ? s : `Section ${s}`,
                                }))}
                                drawerTitle="Select Assigned Section"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Summary recap */}
                    <div className="p-3 rounded-xl border border-zinc-200/80 bg-zinc-50 dark:border-white/10 dark:bg-zinc-900/40 text-xs space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Staff Member:</span>
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {fullName.trim() || user?.name || user?.email}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Branch:</span>
                        <span className="font-semibold capitalize text-zinc-900 dark:text-zinc-100">
                          {wingId.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Role:</span>
                        <span className="font-semibold capitalize text-zinc-900 dark:text-zinc-100">
                          {customDesignation.trim() || position.replace(/_/g, " ")}
                        </span>
                      </div>
                      {isClassTeacher && (
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Class Incharge:</span>
                          <span className="font-semibold text-blue-600 dark:text-blue-400">
                            {schoolClassId} ({schoolSectionId})
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Bottom smooth mask gradient indicator */}
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-x-0 bottom-0 h-5 z-10 bg-gradient-to-t from-white/95 dark:from-zinc-950/95 to-transparent transition-opacity duration-200",
              canScrollBottom ? "opacity-100" : "opacity-0"
            )}
          />
        </div>

        {/* Static Bottom Action Bar: Seamless without horizontal border line */}
        <div className="shrink-0 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md px-4 py-3 sm:px-6 sm:py-4 pb-[max(0.85rem,env(safe-area-inset-bottom))]">
          {msg && (
            <div className="mb-2.5 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400">
              {msg}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            {step > 1 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setMsg(null);
                  setStepDirection(-1);
                  setStep((prev) => (prev === 3 ? 2 : 1));
                }}
                className="gap-2 rounded-xl h-11 sm:h-10 font-medium cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            ) : (
              <div className="hidden sm:block" />
            )}

            {step === 1 && (
              <Button
                type="button"
                onClick={() => {
                  setStepDirection(1);
                  setStep(2);
                }}
                className="w-full sm:w-auto sm:min-w-[140px] ml-auto gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl h-11 sm:h-10 cursor-pointer shadow-sm"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}

            {step === 2 && (
              <Button
                type="button"
                onClick={() => {
                  if (!fullName.trim()) {
                    setMsg("Please enter your official full name.");
                    return;
                  }
                  if (!phone.trim() || phone.trim().length < 7) {
                    setMsg("Please enter your contact phone number.");
                    return;
                  }
                  setMsg(null);
                  setStepDirection(1);
                  setStep(3);
                }}
                className="gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl h-11 sm:h-10 flex-1 sm:flex-initial sm:min-w-[140px] justify-center cursor-pointer shadow-sm"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}

            {step === 3 && (
              <Button
                type="button"
                disabled={busy}
                onClick={() => void submit()}
                className="gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl h-11 sm:h-10 flex-1 sm:flex-initial sm:min-w-[180px] justify-center cursor-pointer shadow-sm"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Submit for Approval
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Footer (Desktop only) */}
      <footer className="relative z-10 text-center py-2 text-[11px] text-zinc-400 dark:text-zinc-500 hidden sm:block">
        MHMSAttendance • Bemathang, Kargil
      </footer>
    </div>
  );
}
