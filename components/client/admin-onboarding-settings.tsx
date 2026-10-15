"use client";

import * as React from "react";
import {
  Building2,
  MapPin,
  Shield,
  Save,
  Plus,
  Trash2,
  RotateCcw,
  Loader2,
  Sliders,
  CheckCircle2,
  Copy,
  Layers,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, formFieldLabelClass } from "@/components/ui/input";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { SchoolCampusMap } from "@/components/client/map/school-campus-map";
import { SchoolConfig, DEFAULT_SCHOOL_CONFIG } from "@/lib/school/config";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { DangerConfirmModal } from "@/components/client/danger-confirm-modal";
import { AppSelect } from "@/components/ui/app-select";

export type SchoolConfigTab = "campus" | "sections" | "wings";

export interface AdminOnboardingSettingsProps {
  activeTab?: SchoolConfigTab;
  onTabChange?: (tab: SchoolConfigTab) => void;
  hideHeaderTabs?: boolean;
}

export function AdminOnboardingSettings({
  activeTab: propActiveTab,
  onTabChange,
  hideHeaderTabs = false,
}: AdminOnboardingSettingsProps = {}) {
  const [internalTab, setInternalTab] = React.useState<SchoolConfigTab>("campus");
  const currentTab = propActiveTab ?? internalTab;
  const setTab = (t: SchoolConfigTab) => {
    if (onTabChange) {
      onTabChange(t);
    } else {
      setInternalTab(t);
    }
  };

  const [config, setConfig] = React.useState<SchoolConfig>(DEFAULT_SCHOOL_CONFIG);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [newSection, setNewSection] = React.useState("");
  const [newClassInputs, setNewClassInputs] = React.useState<Record<string, string>>({});

  const loadConfig = React.useCallback(async () => {
    try {
      const res = await fetch("/api/school/config");
      if (res.ok) {
        const json = (await res.json()) as SchoolConfig;
        setConfig(json);
      }
    } catch {
      toast.error("Failed to load school config");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const auth = getFirebaseAuth();
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");
      const token = await u.getIdToken();

      const res = await fetch("/api/school/config", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(config),
      });

      const resJson = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(resJson.error ?? "Failed to save configuration");

      toast.success("School & Onboarding settings saved successfully!");
      if (resJson.config) {
        setConfig(resJson.config);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error saving configuration");
    } finally {
      setSaving(false);
    }
  };

  const [resetConfirmOpen, setResetConfirmOpen] = React.useState(false);
  const [removeClassTarget, setRemoveClassTarget] = React.useState<{
    wingIdx: number;
    wingName: string;
    className: string;
  } | null>(null);

  const handleConfirmResetDefaults = () => {
    setConfig(DEFAULT_SCHOOL_CONFIG);
    toast.info("Reset to default configuration. Click 'Save Changes' to apply.");
    setResetConfirmOpen(false);
  };

  const handleConfirmRemoveClass = () => {
    if (!removeClassTarget) return;
    handleRemoveClassFromWing(removeClassTarget.wingIdx, removeClassTarget.className);
    setRemoveClassTarget(null);
  };

  const [selectedClassForSections, setSelectedClassForSections] = React.useState<string>("Class 1");

  // All available classes list across all wings
  const allClasses = React.useMemo(() => {
    const list: { wingId: string; wingName: string; className: string }[] = [];
    (config.wings ?? []).forEach((w) => {
      (w.classes ?? []).forEach((c) => {
        list.push({ wingId: w.id, wingName: w.name, className: c });
      });
    });
    return list;
  }, [config.wings]);

  // Ensure selectedClass is valid
  React.useEffect(() => {
    if (allClasses.length > 0 && !allClasses.some((x) => x.className === selectedClassForSections)) {
      setSelectedClassForSections(allClasses[0].className);
    }
  }, [allClasses, selectedClassForSections]);

  const activeClassSections = React.useMemo(() => {
    if (!selectedClassForSections) return [];
    if (config.classSections && Array.isArray(config.classSections[selectedClassForSections])) {
      return config.classSections[selectedClassForSections];
    }
    return config.sections ?? ["Section A", "Section B"];
  }, [config.classSections, config.sections, selectedClassForSections]);

  // Add section to the currently chosen class
  const handleAddSectionToClass = () => {
    const s = newSection.trim();
    if (!s || !selectedClassForSections) return;
    if (activeClassSections.includes(s)) {
      toast.warning(`Section "${s}" already exists in ${selectedClassForSections}`);
      return;
    }
    const nextSections = [...activeClassSections, s];
    setConfig((prev) => ({
      ...prev,
      classSections: {
        ...(prev.classSections ?? {}),
        [selectedClassForSections]: nextSections,
      },
    }));
    setNewSection("");
    toast.success(`Added ${s} to ${selectedClassForSections}`);
  };

  // Remove section from the currently chosen class
  const handleRemoveSectionFromClass = (sec: string) => {
    if (!selectedClassForSections) return;
    const nextSections = activeClassSections.filter((s) => s !== sec);
    setConfig((prev) => ({
      ...prev,
      classSections: {
        ...(prev.classSections ?? {}),
        [selectedClassForSections]: nextSections,
      },
    }));
  };

  // Presets
  const handleApplyPresetToClass = (preset: string[]) => {
    if (!selectedClassForSections) return;
    setConfig((prev) => ({
      ...prev,
      classSections: {
        ...(prev.classSections ?? {}),
        [selectedClassForSections]: preset,
      },
    }));
    toast.success(`Applied ${preset.join(", ")} to ${selectedClassForSections}`);
  };

  // Copy to all classes in same wing
  const handleCopySectionsToWing = () => {
    if (!selectedClassForSections) return;
    const currentItem = allClasses.find((x) => x.className === selectedClassForSections);
    if (!currentItem) return;
    const targetWing = config.wings.find((w) => w.id === currentItem.wingId);
    if (!targetWing) return;

    const sectionsToCopy = [...activeClassSections];
    setConfig((prev) => {
      const nextMap = { ...(prev.classSections ?? {}) };
      targetWing.classes.forEach((c) => {
        nextMap[c] = [...sectionsToCopy];
      });
      return { ...prev, classSections: nextMap };
    });
    toast.success(`Copied sections to all ${targetWing.classes.length} classes in ${targetWing.name}`);
  };

  // Copy to all classes across the school
  const handleCopySectionsToAllClasses = () => {
    if (!selectedClassForSections) return;
    const sectionsToCopy = [...activeClassSections];
    setConfig((prev) => {
      const nextMap = { ...(prev.classSections ?? {}) };
      allClasses.forEach(({ className }) => {
        nextMap[className] = [...sectionsToCopy];
      });
      return { ...prev, classSections: nextMap, sections: sectionsToCopy };
    });
    toast.success(`Copied sections to all ${allClasses.length} school classes`);
  };

  // Wing position update
  const handleUpdatePositionLimit = (wingIndex: number, posIndex: number, maxLimit?: number) => {
    setConfig((prev) => {
      const nextWings = [...prev.wings];
      const nextPositions = [...nextWings[wingIndex].positions];
      nextPositions[posIndex] = {
        ...nextPositions[posIndex],
        maxLimit: maxLimit && maxLimit > 0 ? maxLimit : undefined,
      };
      nextWings[wingIndex] = { ...nextWings[wingIndex], positions: nextPositions };
      return { ...prev, wings: nextWings };
    });
  };

  const handleAddClassToWing = (wingIndex: number, className: string) => {
    const trimmed = className.trim();
    if (!trimmed) return;
    const targetWing = config.wings[wingIndex];
    if (targetWing?.classes.includes(trimmed)) {
      toast.warning(`"${trimmed}" is already assigned to ${targetWing.name}`);
      return;
    }
    setConfig((prev) => {
      const nextWings = [...prev.wings];
      nextWings[wingIndex] = {
        ...nextWings[wingIndex],
        classes: [...nextWings[wingIndex].classes, trimmed],
      };
      // Auto-assign default sections if new class
      const nextClassSections = { ...(prev.classSections ?? {}) };
      if (!nextClassSections[trimmed] || nextClassSections[trimmed].length === 0) {
        nextClassSections[trimmed] = ["Section A", "Section B"];
      }
      return { ...prev, wings: nextWings, classSections: nextClassSections };
    });
    toast.success(`Added ${trimmed} to ${targetWing?.name ?? "wing"}`);
  };

  const handleRemoveClassFromWing = (wingIndex: number, className: string) => {
    const targetWing = config.wings[wingIndex];
    setConfig((prev) => {
      const nextWings = [...prev.wings];
      nextWings[wingIndex] = {
        ...nextWings[wingIndex],
        classes: nextWings[wingIndex].classes.filter((c) => c !== className),
      };
      return { ...prev, wings: nextWings };
    });
    toast.info(`Removed ${className} from ${targetWing?.name ?? "wing"}`);
  };

  const schoolTabs = [
    { id: "campus" as const, label: "Campus Geofence", icon: MapPin },
    { id: "sections" as const, label: "Classes & Sections", icon: Layers },
    { id: "wings" as const, label: "Wings & Roles", icon: Building2 },
  ];

  const tabMeta: Record<
    SchoolConfigTab,
    { title: string; description: string; icon: React.ComponentType<{ className?: string }> }
  > = {
    campus: {
      title: "Campus Geofence Parameters",
      description:
        "Configure permanent campus coordinates, geofence radius in meters, and preview on live satellite map.",
      icon: MapPin,
    },
    sections: {
      title: "Class Sections Configuration",
      description:
        "Configure specific sections for each individual class so every class has its exact required sections.",
      icon: Layers,
    },
    wings: {
      title: "Wings, Positions & Quota Caps",
      description:
        "Configure school wings, teacher positions, maximum faculty limits, and class assignments.",
      icon: Building2,
    },
  };

  const TabHeaderIcon = tabMeta[currentTab].icon;

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Save actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-950">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <TabHeaderIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            {tabMeta[currentTab].title}
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            {tabMeta[currentTab].description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setResetConfirmOpen(true)}
            className="gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Defaults
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={() => void handleSave()}
            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-md shadow-blue-500/20"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Standalone Pill Tab Bar if header tabs not hidden by parent */}
      {!hideHeaderTabs && (
        <div className="flex items-center overflow-x-auto pb-1 no-scrollbar">
          <div className="inline-flex items-center gap-1.5 p-1.5 rounded-full bg-zinc-100/90 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/60 shadow-xs backdrop-blur-sm">
            {schoolTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = currentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTab(tab.id)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs sm:text-sm font-semibold transition-all shrink-0 cursor-pointer",
                    isActive
                      ? "bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-zinc-900"
                      : "text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700/60 dark:hover:text-zinc-100"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Geofence & Campus Location Form */}
      {currentTab === "campus" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <Card className="border-zinc-200 shadow-sm dark:border-white/10">
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <MapPin className="h-4 w-4 text-blue-600" />
              Campus Geofence Parameters
            </CardTitle>
            <CardDescription className="text-xs">
              Teachers must be physically inside this radius to punch in or punch out.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex flex-col gap-1 text-xs">
              <span className={formFieldLabelClass}>School Name</span>
              <Input
                value={config.name}
                onChange={(e) => setConfig({ ...config, name: e.target.value })}
                placeholder="Munshi Habibullah Mission School"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className={formFieldLabelClass}>Campus Description</span>
              <Input
                value={config.campusName}
                onChange={(e) => setConfig({ ...config, campusName: e.target.value })}
                placeholder="Bemathang Campus, Kargil, UT Ladakh"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs">
                <span className={formFieldLabelClass}>Latitude (School Center)</span>
                <Input
                  type="number"
                  step="0.000001"
                  value={config.latitude}
                  onChange={(e) =>
                    setConfig({ ...config, latitude: parseFloat(e.target.value) || 0 })
                  }
                />
              </label>

              <label className="flex flex-col gap-1 text-xs">
                <span className={formFieldLabelClass}>Longitude (School Center)</span>
                <Input
                  type="number"
                  step="0.000001"
                  value={config.longitude}
                  onChange={(e) =>
                    setConfig({ ...config, longitude: parseFloat(e.target.value) || 0 })
                  }
                />
              </label>
            </div>

            <label className="flex flex-col gap-1 text-xs">
              <span className={formFieldLabelClass}>
                Geofence Radius (Meters) — Current: <strong>{config.radiusMeters}m</strong>
              </span>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="50"
                  max="1500"
                  step="25"
                  value={config.radiusMeters}
                  onChange={(e) =>
                    setConfig({ ...config, radiusMeters: parseInt(e.target.value, 10) || 250 })
                  }
                  className="flex-1 accent-blue-600"
                />
                <Input
                  type="number"
                  min="20"
                  max="5000"
                  value={config.radiusMeters}
                  onChange={(e) =>
                    setConfig({ ...config, radiusMeters: parseInt(e.target.value, 10) || 250 })
                  }
                  className="w-24 text-center font-bold"
                />
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">
                If teachers face GPS accuracy issues due to Kargil terrain/weather, increase the radius.
              </p>
            </label>
          </CardContent>
        </Card>

        {/* Live Geofence Preview Map */}
        <div className="space-y-4">
          <SchoolCampusMap
            schoolLat={config.latitude}
            schoolLng={config.longitude}
            radiusMeters={config.radiusMeters}
            schoolName={config.name}
            campusName={config.campusName}
          />
        </div>
      </div>
    )}

      {/* Advanced Per-Class Sections Configuration */}
      {currentTab === "sections" && (
        <Card className="border-zinc-200 shadow-sm dark:border-white/10">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Layers className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  Class Sections (Per-Class Configuration)
                </CardTitle>
              <CardDescription className="text-xs">
                Configure specific sections for each individual class so every class has its exact required sections.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Single Dropdown to select class */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-zinc-200 bg-zinc-50/80 dark:border-white/10 dark:bg-zinc-900/40">
            <div className="space-y-0.5">
              <label className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                Select Class to Customize Sections:
              </label>
              <p className="text-[11px] text-zinc-500">
                Choose any class below to view and edit its dedicated sections.
              </p>
            </div>
            <div className="min-w-[280px]">
              <AppSelect
                value={selectedClassForSections}
                onChange={(val) => setSelectedClassForSections(val)}
                options={config.wings.flatMap((w) =>
                  w.classes.map((c) => {
                    const count = (config.classSections?.[c] ?? config.sections ?? []).length;
                    return {
                      value: c,
                      label: c,
                      sublabel: `${w.name} • ${count} ${count === 1 ? "section" : "sections"}`,
                      badge: `${count} sec`,
                    };
                  })
                )}
                drawerTitle="Select Class to Customize"
                searchable={true}
                searchPlaceholder="Search class..."
              />
            </div>
          </div>

          {/* Active Class Sections Manager Box */}
          <div className="rounded-xl border border-blue-500/20 bg-blue-50/40 p-4 dark:border-blue-500/20 dark:bg-blue-950/20 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-blue-950 dark:text-blue-100">
                  Sections Configured for:
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-600 text-white shadow-xs">
                  {selectedClassForSections}
                </span>
                <span className="text-xs font-medium text-zinc-500">
                  ({activeClassSections.length} {activeClassSections.length === 1 ? "section" : "sections"})
                </span>
              </div>

              {/* Quick presets */}
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-zinc-400 font-medium">Quick presets:</span>
                <button
                  type="button"
                  onClick={() => handleApplyPresetToClass(["Section A", "Section B", "Section C", "Section D"])}
                  className="px-2 py-0.5 rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 hover:border-blue-500 text-zinc-700 dark:text-zinc-300 font-medium transition-colors"
                >
                  A, B, C, D
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPresetToClass(["Section A", "Section B", "Section C"])}
                  className="px-2 py-0.5 rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 hover:border-blue-500 text-zinc-700 dark:text-zinc-300 font-medium transition-colors"
                >
                  A, B, C
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPresetToClass(["Section A", "Section B"])}
                  className="px-2 py-0.5 rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 hover:border-blue-500 text-zinc-700 dark:text-zinc-300 font-medium transition-colors"
                >
                  A, B
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPresetToClass(["Section A"])}
                  className="px-2 py-0.5 rounded bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 hover:border-blue-500 text-zinc-700 dark:text-zinc-300 font-medium transition-colors"
                >
                  A only
                </button>
              </div>
            </div>

            {/* Section Pills */}
            <div className="flex flex-wrap gap-2">
              {activeClassSections.length === 0 ? (
                <span className="text-xs text-zinc-400 italic">No sections configured for this class yet. Add one below.</span>
              ) : (
                activeClassSections.map((sec) => (
                  <span
                    key={sec}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-white shadow-xs text-xs font-semibold text-blue-900 dark:border-white/10 dark:bg-zinc-900 dark:text-blue-200"
                  >
                    {sec}
                    <button
                      type="button"
                      onClick={() => handleRemoveSectionFromClass(sec)}
                      className="text-zinc-400 hover:text-red-500 transition-colors"
                      title={`Remove ${sec} from ${selectedClassForSections}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                ))
              )}
            </div>

            {/* Add input */}
            <div className="flex items-center gap-2 max-w-md pt-1">
              <Input
                placeholder={`e.g. Section D or Section Blue`}
                value={newSection}
                onChange={(e) => setNewSection(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddSectionToClass()}
                className="text-xs"
              />
              <Button
                type="button"
                size="sm"
                onClick={handleAddSectionToClass}
                className="gap-1 text-xs shrink-0 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                Add to {selectedClassForSections}
              </Button>
            </div>

            {/* Batch Copy Options */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-blue-200/50 dark:border-white/5 text-xs text-zinc-500">
              <span className="font-medium text-zinc-600 dark:text-zinc-400">Batch Tools:</span>
              <button
                type="button"
                onClick={handleCopySectionsToWing}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-zinc-200 bg-white hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-800 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 transition-colors"
              >
                <Copy className="h-3 w-3" />
                Copy this setup to all classes in this Wing
              </button>
              <button
                type="button"
                onClick={handleCopySectionsToAllClasses}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-zinc-200 bg-white hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-800 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 transition-colors"
              >
                <Sparkles className="h-3 w-3 text-amber-500" />
                Copy this setup to ALL classes across School
              </button>
            </div>
          </div>

          {/* Quick Jump Grid for all classes */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              <span>All Classes Overview ({allClasses.length} classes):</span>
              <span className="text-[11px] font-normal text-zinc-400">Click any class pill to jump to it</span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2.5 rounded-xl border border-zinc-200/70 dark:border-white/10 bg-zinc-50/50 dark:bg-white/[0.02]">
              {allClasses.map(({ className }) => {
                const secs = config.classSections?.[className] ?? config.sections ?? [];
                const isSelected = selectedClassForSections === className;
                return (
                  <button
                    key={className}
                    type="button"
                    onClick={() => setSelectedClassForSections(className)}
                    className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all",
                      isSelected
                        ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                        : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-300 dark:bg-zinc-900 dark:text-zinc-300 dark:border-white/10"
                    )}
                  >
                    <span>{className}</span>
                    <span
                      className={cn(
                        "px-1.5 py-0.2 rounded-full text-[10px] font-bold",
                        isSelected
                          ? "bg-white/20 text-white"
                          : "bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-400"
                      )}
                    >
                      {secs.length}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Wings and Positions */}
      {currentTab === "wings" && (
        <div className="space-y-6">
        <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
          Wings, Positions & Quota Caps
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {config.wings.map((wing, wingIdx) => (
            <Card key={wing.id} className="border-zinc-200 shadow-sm dark:border-white/10 flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold text-blue-600 dark:text-blue-400">
                  {wing.name}
                </CardTitle>
                <CardDescription className="text-xs line-clamp-1">
                  {wing.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 flex-1 text-xs">
                {/* Positions with limits */}
                <div>
                  <h5 className="font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                    Positions & Max Limits
                  </h5>
                  <div className="space-y-2">
                    {wing.positions.map((pos, posIdx) => (
                      <div
                        key={pos.id}
                        className="flex items-center justify-between gap-2 p-2 rounded-lg border border-zinc-200/80 bg-zinc-50 dark:border-white/5 dark:bg-white/[0.02]"
                      >
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">
                          {pos.name}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-zinc-400">Max:</span>
                          <input
                            type="number"
                            min="1"
                            max="50"
                            placeholder="∞"
                            value={pos.maxLimit ?? ""}
                            onChange={(e) => {
                              const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                              handleUpdatePositionLimit(wingIdx, posIdx, val);
                            }}
                            className="w-12 h-7 rounded border border-zinc-300 dark:border-white/15 bg-white dark:bg-zinc-900 text-center text-xs font-semibold"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Classes under wing */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="font-semibold text-zinc-700 dark:text-zinc-300">
                      Assigned Classes ({wing.classes.length})
                    </h5>
                    <span className="text-[10px] text-zinc-400">Tap 🗑 to remove</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1.5 rounded-lg border border-zinc-200/50 dark:border-white/5 bg-zinc-50/50 dark:bg-white/[0.01]">
                    {wing.classes.length === 0 ? (
                      <span className="text-[11px] text-zinc-400 italic p-1">No classes in this wing. Add one below.</span>
                    ) : (
                      wing.classes.map((cls) => (
                        <span
                          key={cls}
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-200/70 text-[11px] font-medium text-zinc-800 dark:bg-white/10 dark:text-zinc-200"
                        >
                          {cls}
                          <button
                            type="button"
                            onClick={() =>
                              setRemoveClassTarget({
                                wingIdx,
                                wingName: wing.name,
                                className: cls,
                              })
                            }
                            className="text-zinc-400 hover:text-red-500 transition-colors p-0.5 cursor-pointer"
                            title={`Remove ${cls} from ${wing.name}`}
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ))
                    )}
                  </div>

                  {/* Add Class Input Row */}
                  <div className="flex items-center gap-1.5 pt-1">
                    <Input
                      placeholder={`Add class (e.g. Class 13)`}
                      value={newClassInputs[wing.id] ?? ""}
                      onChange={(e) =>
                        setNewClassInputs((prev) => ({ ...prev, [wing.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const val = (newClassInputs[wing.id] ?? "").trim();
                          if (val) {
                            handleAddClassToWing(wingIdx, val);
                            setNewClassInputs((prev) => ({ ...prev, [wing.id]: "" }));
                          }
                        }
                      }}
                      className="h-8 text-xs px-2.5"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        const val = (newClassInputs[wing.id] ?? "").trim();
                        if (val) {
                          handleAddClassToWing(wingIdx, val);
                          setNewClassInputs((prev) => ({ ...prev, [wing.id]: "" }));
                        }
                      }}
                      className="h-8 px-2.5 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold shrink-0 gap-1"
                    >
                      <Plus className="size-3.5" />
                      Add
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      )}

      {/* Danger Zone: Reset School Config Defaults */}
      <DangerConfirmModal
        open={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        onConfirm={handleConfirmResetDefaults}
        title="Danger zone"
        subtitle="Reset school configuration"
        description="Reset all school settings, geofencing boundary coordinates, wings, classes, and sections back to the official default MHMS configuration? Unsaved modifications will be discarded."
        confirmText="Reset to Defaults"
        cancelText="Cancel"
        variant="danger"
      />

      {/* Danger Zone: Remove Class from Wing */}
      <DangerConfirmModal
        open={Boolean(removeClassTarget)}
        onClose={() => setRemoveClassTarget(null)}
        onConfirm={handleConfirmRemoveClass}
        title="Danger zone"
        subtitle="Remove class from category"
        description={
          <span>
            Are you sure you want to remove{" "}
            <strong className="text-white font-semibold">“{removeClassTarget?.className}”</strong> from{" "}
            <strong>{removeClassTarget?.wingName}</strong>? Teachers and students associated with this class will lose wing categorization.
          </span>
        }
        confirmText="Remove Class"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}
