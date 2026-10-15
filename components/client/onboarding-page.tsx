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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input, formFieldLabelClass } from "@/components/ui/input";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { useDashboardUser } from "@/components/client/dashboard-user-context";
import { AppSelect } from "@/components/ui/app-select";
import { MhmsMark } from "@/components/mhms-mark";
import { cn } from "@/lib/utils";
import { type SchoolConfig, type SchoolWingId, getSectionsForClass } from "@/lib/school/config";
import { DEFAULT_SCHOOL_CONFIG } from "@/lib/school/config";

type PositionsStatus = {
  principalTaken: boolean;
  vicePrincipalFull: boolean;
  inchargeTaken: boolean;
};

export function OnboardingPage() {
  const { user } = useDashboardUser();
  const router = useRouter();

  const [step, setStep] = React.useState<1 | 2 | 3>(1);
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

  // Default class when wing changes
  React.useEffect(() => {
    if (activeWing.classes.length > 0) {
      setSchoolClassId(activeWing.classes[0]!);
    }
    // Set appropriate default position for selected wing
    if (wingId === "rewa_na_kasco") {
      setPosition(posStatus.inchargeTaken ? "teacher" : "incharge");
    } else {
      setPosition("teacher");
    }
  }, [wingId, activeWing, posStatus]);

  // Dynamically load sections configured for the chosen class
  const availableSections = React.useMemo(() => {
    return getSectionsForClass(config, schoolClassId);
  }, [config, schoolClassId]);

  React.useEffect(() => {
    if (availableSections.length > 0 && !availableSections.includes(schoolSectionId)) {
      setSchoolSectionId(availableSections[0]!);
    }
  }, [availableSections, schoolSectionId]);

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

      window.location.href = "/dashboard";
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to complete onboarding");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between p-3 sm:p-6 md:p-8 bg-zinc-50 dark:bg-[#07090e]">
      <div className="pointer-events-none fixed inset-0 hero-mesh opacity-50 dark:opacity-30" />

      {/* Top Header */}
      <header className="relative z-10 flex items-center justify-between max-w-3xl w-full mx-auto pb-4 pt-1">
        <div className="flex items-center gap-2.5">
          <MhmsMark className="h-8 w-8 sm:h-9 sm:w-9 shrink-0" />
          <div>
            <p className="text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              Munshi Habibullah Mission School
            </p>
            <p className="text-[10px] sm:text-[11px] text-zinc-500 font-medium">Bemathang, Kargil • Staff Portal Setup</p>
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            const auth = getFirebaseAuth();
            await signOut(auth);
            window.location.href = "/login";
          }}
          className="text-xs text-zinc-500 hover:text-red-600 dark:hover:text-red-400 flex items-center gap-1.5 font-medium px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-white/10 hover:border-red-500/30 transition-colors cursor-pointer"
        >
          <LogOut className="size-3.5" />
          <span className="hidden sm:inline">Sign Out</span>
        </button>
      </header>

      {/* Main Full-Screen Center Card */}
      <div className="relative z-10 mx-auto flex w-full max-w-3xl items-center my-auto py-2">
        <Card className="w-full border-zinc-200/90 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/90">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-2">
              <MhmsMark className="h-14 w-14 sm:h-16 sm:w-16" />
            </div>
            <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">Teacher Onboarding</CardTitle>
            <CardDescription className="text-xs md:text-sm text-zinc-500">
              Complete your profile setup to activate your teacher attendance portal
            </CardDescription>

          {/* Stepper indicator */}
          <div className="mt-4 flex items-center justify-center gap-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  step === s ? "w-8 bg-blue-600 dark:bg-blue-500" : "w-2 bg-zinc-300 dark:bg-white/20"
                )}
              />
            ))}
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-2">
          {/* STEP 1: Branch / Wing Selection */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  Select Your School Branch / Wing
                </h3>
                <p className="text-xs text-zinc-500">
                  Please choose which section of the school campus you are appointed to.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {/* Higher Wing */}
                <button
                  type="button"
                  onClick={() => setWingId("higher")}
                  className={cn(
                    "flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all",
                    wingId === "higher"
                      ? "border-blue-600 bg-blue-50/70 text-blue-900 shadow-sm dark:border-blue-500 dark:bg-blue-950/30 dark:text-blue-200"
                      : "border-zinc-200 hover:border-zinc-300 dark:border-white/10 dark:hover:border-white/20"
                  )}
                >
                  <GraduationCap className="h-8 w-8 mb-2 text-blue-600 dark:text-blue-400" />
                  <span className="font-semibold text-sm">Higher School</span>
                  <span className="text-[11px] text-zinc-500 mt-1">Class 1st to 12th</span>
                </button>

                {/* Lower Wing */}
                <button
                  type="button"
                  onClick={() => setWingId("lower")}
                  className={cn(
                    "flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all",
                    wingId === "lower"
                      ? "border-emerald-600 bg-emerald-50/70 text-emerald-900 shadow-sm dark:border-emerald-500 dark:bg-emerald-950/30 dark:text-emerald-200"
                      : "border-zinc-200 hover:border-zinc-300 dark:border-white/10 dark:hover:border-white/20"
                  )}
                >
                  <Baby className="h-8 w-8 mb-2 text-emerald-600 dark:text-emerald-400" />
                  <span className="font-semibold text-sm">Lower School</span>
                  <span className="text-[11px] text-zinc-500 mt-1">Pre-Nursery to UKG</span>
                </button>

                {/* Rewa na Kasco */}
                <button
                  type="button"
                  onClick={() => setWingId("rewa_na_kasco")}
                  className={cn(
                    "flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all",
                    wingId === "rewa_na_kasco"
                      ? "border-amber-600 bg-amber-50/70 text-amber-900 shadow-sm dark:border-amber-500 dark:bg-amber-950/30 dark:text-amber-200"
                      : "border-zinc-200 hover:border-zinc-300 dark:border-white/10 dark:hover:border-white/20"
                  )}
                >
                  <Palette className="h-8 w-8 mb-2 text-amber-600 dark:text-amber-400" />
                  <span className="font-semibold text-sm">Rewa na Kasco</span>
                  <span className="text-[11px] text-zinc-500 mt-1">Handicraft & Arts Wing</span>
                </button>
              </div>

              <div className="pt-4 flex justify-end">
                <Button type="button" onClick={() => setStep(2)} className="gap-2">
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: Position & Contact */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  Position & Contact Details
                </h3>
                <p className="text-xs text-zinc-500">
                  Appointed branch:{" "}
                  <strong className="text-zinc-800 dark:text-zinc-200 capitalize">
                    {wingId.replace(/_/g, " ")}
                  </strong>
                </p>
              </div>

              {/* Full Official Name */}
              <label className="flex flex-col gap-1.5 text-sm">
                <span className={formFieldLabelClass}>Full Official Name *</span>
                <div className="relative">
                  <Input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Fatima Banoo / Mohammad Ali"
                    className="pl-9 rounded-xl font-medium"
                  />
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                </div>
                <p className="text-[11px] text-zinc-500">
                  Your full name will be shown on staff attendance registers, PDF reports, and substitution records.
                </p>
              </label>

              {/* Position dropdown */}
              <div className="flex flex-col gap-1.5 text-sm">
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
              <label className="flex flex-col gap-1.5 text-sm">
                <span className={formFieldLabelClass}>Specific Subject / Title (Optional)</span>
                <Input
                  value={customDesignation}
                  onChange={(e) => setCustomDesignation(e.target.value)}
                  placeholder="e.g. Senior Mathematics Teacher, Science Faculty"
                />
              </label>

              {/* Contact Phone */}
              <label className="flex flex-col gap-1.5 text-sm">
                <span className={formFieldLabelClass}>Phone Number (For official records)</span>
                <div className="relative">
                  <Input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 98XXXXXXXX"
                    className="pl-9"
                  />
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                </div>
              </label>

              <div className="pt-4 flex justify-between">
                <Button type="button" variant="outline" onClick={() => setStep(1)} className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
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
                    setStep(3);
                  }}
                  className="gap-2"
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: Class Teacher Allocation & Review */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  Class Teacher Allocation
                </h3>
                <p className="text-xs text-zinc-500">
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
                      "px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all",
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
                      "px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all",
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl border border-blue-500/20 bg-blue-50/30 dark:bg-blue-950/20">
                  <div className="flex flex-col gap-1.5 text-sm">
                    <span className={formFieldLabelClass}>Assigned Class</span>
                    <AppSelect
                      value={schoolClassId}
                      onChange={(val) => setSchoolClassId(val)}
                      options={activeWing.classes.map((c) => ({ value: c, label: c }))}
                      drawerTitle="Select Assigned Class"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 text-sm">
                    <span className={formFieldLabelClass}>Assigned Section</span>
                    <AppSelect
                      value={schoolSectionId}
                      onChange={(val) => setSchoolSectionId(val)}
                      options={availableSections.map((s) => ({ value: s, label: `Section ${s}` }))}
                      drawerTitle="Select Assigned Section"
                    />
                  </div>
                </div>
              )}

              {/* Summary recap */}
              <div className="p-3.5 rounded-xl border border-zinc-200/80 bg-zinc-50 dark:border-white/10 dark:bg-zinc-900/40 text-xs space-y-1.5">
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

              {msg && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-700 dark:text-red-400">
                  {msg}
                </div>
              )}

              <div className="pt-2 flex justify-between">
                <Button type="button" variant="outline" onClick={() => setStep(2)} className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void submit()}
                  className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
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
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>

    {/* Bottom Footer */}
    <footer className="relative z-10 text-center py-2 text-[11px] text-zinc-400 dark:text-zinc-500">
      Munshi Habibullah Mission School, Kargil • Verified Staff Portal Setup
    </footer>
  </div>
);
}
