"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
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
  Clock,
  Pencil,
  X,
  FolderPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, formFieldLabelClass } from "@/components/ui/input";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { SchoolCampusMap } from "@/components/client/map/school-campus-map";
import { SchoolConfig, DEFAULT_SCHOOL_CONFIG } from "@/lib/school/config";
import {
  STANDARD_AM_OPEN_OPTIONS,
  STANDARD_AM_CUTOFF_OPTIONS,
  STANDARD_PM_CLOSE_OPTIONS,
  STANDARD_PM_SIGNOUT_OPTIONS,
} from "@/lib/date/late-check";
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

  // Add / Edit / Delete Class states
  const [addClassModalOpen, setAddClassModalOpen] = React.useState(false);
  const [newClassName, setNewClassName] = React.useState("");
  const [newClassWingId, setNewClassWingId] = React.useState("");
  const [newClassSections, setNewClassSections] = React.useState<string[]>([
    "Section A",
    "Section B",
    "Section C",
  ]);
  const [customSectionInput, setCustomSectionInput] = React.useState("");

  const [editClassModalOpen, setEditClassModalOpen] = React.useState(false);
  const [editingClassName, setEditingClassName] = React.useState("");
  const [editingClassWingId, setEditingClassWingId] = React.useState("");

  const [deleteClassTarget, setDeleteClassTarget] = React.useState<{
    className: string;
    wingName: string;
    wingIdx: number;
    sectionCount: number;
  } | null>(null);

  // Add / Edit / Delete Position states
  const [addingPositionWingIdx, setAddingPositionWingIdx] = React.useState<number | null>(null);
  const [newPositionName, setNewPositionName] = React.useState("");
  const [newPositionLimit, setNewPositionLimit] = React.useState<string>("");
  const [editingPosition, setEditingPosition] = React.useState<{
    wingIdx: number;
    posIdx: number;
    name: string;
  } | null>(null);
  const [deletePositionTarget, setDeletePositionTarget] = React.useState<{
    wingIdx: number;
    posIdx: number;
    wingName: string;
    positionName: string;
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

  const handleConfirmAddPosition = (wingIndex: number) => {
    const trimmed = newPositionName.trim();
    if (!trimmed) {
      toast.error("Please enter a position title");
      return;
    }
    const targetWing = config.wings[wingIndex];
    if (targetWing?.positions.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.warning(`Position "${trimmed}" already exists in ${targetWing.name}`);
      return;
    }
    const maxLimitNum = newPositionLimit.trim() ? parseInt(newPositionLimit, 10) : undefined;
    const cleanId =
      trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") ||
      `pos_${Date.now()}`;

    setConfig((prev) => {
      const nextWings = [...prev.wings];
      const nextPositions = [
        ...nextWings[wingIndex].positions,
        {
          id: cleanId,
          name: trimmed,
          maxLimit: maxLimitNum && maxLimitNum > 0 ? maxLimitNum : undefined,
        },
      ];
      nextWings[wingIndex] = { ...nextWings[wingIndex], positions: nextPositions };
      return { ...prev, wings: nextWings };
    });

    setNewPositionName("");
    setNewPositionLimit("");
    setAddingPositionWingIdx(null);
    toast.success(`Added position "${trimmed}" to ${targetWing?.name ?? "wing"}. Click "Save Changes" to apply.`);
  };

  const handleRemovePositionFromWing = (wingIndex: number, posIndex: number) => {
    const targetWing = config.wings[wingIndex];
    const pos = targetWing?.positions[posIndex];
    if (!pos) return;
    setConfig((prev) => {
      const nextWings = [...prev.wings];
      const nextPositions = nextWings[wingIndex].positions.filter((_, idx) => idx !== posIndex);
      nextWings[wingIndex] = { ...nextWings[wingIndex], positions: nextPositions };
      return { ...prev, wings: nextWings };
    });
    toast.info(`Removed position "${pos.name}" from ${targetWing?.name ?? "wing"}. Click "Save Changes" to apply.`);
  };

  const handleSaveEditedPositionName = (wingIndex: number, posIndex: number, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setConfig((prev) => {
      const nextWings = [...prev.wings];
      const nextPositions = [...nextWings[wingIndex].positions];
      nextPositions[posIndex] = {
        ...nextPositions[posIndex],
        name: trimmed,
      };
      nextWings[wingIndex] = { ...nextWings[wingIndex], positions: nextPositions };
      return { ...prev, wings: nextWings };
    });
    setEditingPosition(null);
    toast.success(`Renamed position to "${trimmed}". Click "Save Changes" to apply.`);
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

  // Create new class with wing categorization and initial sections
  const handleCreateClass = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newClassName.trim();
    if (!name) {
      toast.error("Please enter a class name (e.g. 'Class 13' or 'Pre-KG')");
      return;
    }
    if (allClasses.some((x) => x.className.toLowerCase() === name.toLowerCase())) {
      toast.error(`A class named "${name}" already exists!`);
      return;
    }
    const wingIdx = config.wings.findIndex((w) => w.id === newClassWingId);
    if (wingIdx === -1) {
      toast.error("Please select a wing category for this class");
      return;
    }

    const sectionsToAssign =
      newClassSections.length > 0 ? newClassSections : ["Section A"];

    setConfig((prev) => {
      const nextWings = [...prev.wings];
      nextWings[wingIdx] = {
        ...nextWings[wingIdx],
        classes: [...nextWings[wingIdx].classes, name],
      };
      const nextClassSections = {
        ...(prev.classSections ?? {}),
        [name]: sectionsToAssign,
      };
      return {
        ...prev,
        wings: nextWings,
        classSections: nextClassSections,
      };
    });

    setSelectedClassForSections(name);
    setAddClassModalOpen(false);
    setNewClassName("");
    toast.success(`Created "${name}" with ${sectionsToAssign.length} sections in ${config.wings[wingIdx].name}!`);
  };

  // Edit / Rename class and update wing categorization
  const handleUpdateClass = (e: React.FormEvent) => {
    e.preventDefault();
    const newName = editingClassName.trim();
    const oldName = selectedClassForSections;
    if (!newName) {
      toast.error("Class name cannot be empty");
      return;
    }
    if (
      newName !== oldName &&
      allClasses.some((x) => x.className.toLowerCase() === newName.toLowerCase())
    ) {
      toast.error(`A class named "${newName}" already exists!`);
      return;
    }

    const currentWingItem = allClasses.find((x) => x.className === oldName);
    if (!currentWingItem) return;

    const oldWingId = currentWingItem.wingId;
    const newWingId = editingClassWingId || oldWingId;

    setConfig((prev) => {
      const nextWings = prev.wings.map((w) => {
        if (w.id === oldWingId && oldWingId === newWingId) {
          return {
            ...w,
            classes: w.classes.map((c) => (c === oldName ? newName : c)),
          };
        } else if (w.id === oldWingId) {
          return {
            ...w,
            classes: w.classes.filter((c) => c !== oldName),
          };
        } else if (w.id === newWingId) {
          return {
            ...w,
            classes: [...w.classes.filter((c) => c !== newName), newName],
          };
        }
        return w;
      });

      const nextClassSections = { ...(prev.classSections ?? {}) };
      const existingSections =
        nextClassSections[oldName] ?? prev.sections ?? ["Section A", "Section B"];
      if (newName !== oldName) {
        delete nextClassSections[oldName];
      }
      nextClassSections[newName] = existingSections;

      return {
        ...prev,
        wings: nextWings,
        classSections: nextClassSections,
      };
    });

    setSelectedClassForSections(newName);
    setEditClassModalOpen(false);
    toast.success(`Updated class details successfully!`);
  };

  // Permanently delete class
  const handleDeleteClass = () => {
    if (!deleteClassTarget) return;
    const { className, wingIdx } = deleteClassTarget;

    setConfig((prev) => {
      const nextWings = [...prev.wings];
      if (nextWings[wingIdx]) {
        nextWings[wingIdx] = {
          ...nextWings[wingIdx],
          classes: nextWings[wingIdx].classes.filter((c) => c !== className),
        };
      }
      const nextClassSections = { ...(prev.classSections ?? {}) };
      delete nextClassSections[className];

      return {
        ...prev,
        wings: nextWings,
        classSections: nextClassSections,
      };
    });

    const remaining = allClasses.filter((x) => x.className !== className);
    if (remaining.length > 0) {
      setSelectedClassForSections(remaining[0].className);
    } else {
      setSelectedClassForSections("");
    }

    toast.info(`Deleted class "${className}" and its section configurations.`);
    setDeleteClassTarget(null);
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
          {/* LEFT COLUMN: Campus Geofence Parameters + Live Map */}
          <div className="space-y-6">
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

        {/* Live Geofence Preview Map (placed directly beneath the Campus Geofence Parameters) */}
        <SchoolCampusMap
          schoolLat={config.latitude}
          schoolLng={config.longitude}
          radiusMeters={config.radiusMeters}
          schoolName={config.name}
          campusName={config.campusName}
        />
      </div>

      {/* RIGHT COLUMN: School Working Schedule & Late Timings */}
      <Card className="border-zinc-200 shadow-sm dark:border-white/10">
        <CardHeader>
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            School Working Schedule & Late Timings
          </CardTitle>
          <CardDescription className="text-xs">
            Configure school opening, arrival cutoff, and closing hours. Teachers checking in past cutoff or after 5:00 PM closing will see the late arrival card. At 12:00 AM midnight, the new day starts fresh and shows normally.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
              {/* 1. School Opening Time (Morning) */}
              <div className="space-y-2 p-3 rounded-2xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/70 dark:border-white/10">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <Clock className="size-3.5 text-blue-500" />
                    School Opening Time (Morning)
                  </span>
                  <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded-full border border-blue-500/20">
                    Opens: {config.schoolOpenTime || "08:00 AM"}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Campus morning opening time for faculty arrival and morning assemblies (8:00 AM standard).
                </p>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                  <div className="flex-1">
                    <AppSelect
                      value={
                        STANDARD_AM_OPEN_OPTIONS.includes(config.schoolOpenTime as any)
                          ? (config.schoolOpenTime as string)
                          : "custom"
                      }
                      onChange={(val) => {
                        if (val !== "custom") {
                          setConfig((prev) => ({ ...prev, schoolOpenTime: val }));
                        }
                      }}
                      options={[
                        ...STANDARD_AM_OPEN_OPTIONS.map((time) => ({
                          value: time,
                          label: `${time} ${time === "08:00 AM" ? "(Standard Default)" : ""}`,
                        })),
                        { value: "custom", label: "Custom AM Time…" },
                      ]}
                      title="Select School Opening Time"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Input
                      type="text"
                      value={config.schoolOpenTime || "08:00 AM"}
                      onChange={(e) => {
                        let val = e.target.value.toUpperCase();
                        val = val.replace(/PM/g, "AM");
                        if (!val.includes("AM") && val.trim().length >= 4) {
                          val = val.replace(/\s*[A-Z]*$/, "").trim() + " AM";
                        }
                        setConfig((prev) => ({ ...prev, schoolOpenTime: val }));
                      }}
                      placeholder="08:00 AM"
                      className="w-28 text-center font-bold text-xs"
                    />
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2.5 py-1.5 rounded-lg border border-blue-500/20">
                      AM
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. Teacher Late Arrival Cutoff (Morning) */}
              <div className="space-y-2 p-3 rounded-2xl bg-amber-50/50 dark:bg-amber-950/15 border border-amber-500/30">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                    <Clock className="size-3.5 text-amber-500" />
                    Teacher Late Arrival Cutoff (Morning Cutoff)
                  </span>
                  <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                    Cutoff: {config.teacherLateTime || "09:00 AM"}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  School morning arrival cutoff (9:00 AM standard). Teachers checking in after this time will see the <strong>&ldquo;You are late, sir!&rdquo;</strong> prompt card and be logged as Late Arrival.
                </p>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                  <div className="flex-1">
                    <AppSelect
                      value={
                        STANDARD_AM_CUTOFF_OPTIONS.includes(config.teacherLateTime as any)
                          ? (config.teacherLateTime as string)
                          : "custom"
                      }
                      onChange={(val) => {
                        if (val !== "custom") {
                          setConfig((prev) => ({ ...prev, teacherLateTime: val }));
                        }
                      }}
                      options={[
                        ...STANDARD_AM_CUTOFF_OPTIONS.map((time) => ({
                          value: time,
                          label: `${time} ${time === "09:00 AM" ? "(Standard Default)" : ""}`,
                        })),
                        { value: "custom", label: "Custom AM Time…" },
                      ]}
                      title="Select Late Arrival Cutoff"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Input
                      type="text"
                      value={config.teacherLateTime || "09:00 AM"}
                      onChange={(e) => {
                        let val = e.target.value.toUpperCase();
                        val = val.replace(/PM/g, "AM");
                        if (!val.includes("AM") && val.trim().length >= 4) {
                          val = val.replace(/\s*[A-Z]*$/, "").trim() + " AM";
                        }
                        setConfig((prev) => ({ ...prev, teacherLateTime: val }));
                      }}
                      placeholder="09:00 AM"
                      className="w-28 text-center font-bold text-xs"
                    />
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 dark:bg-amber-500/15 px-2.5 py-1.5 rounded-lg border border-amber-500/20">
                      AM
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. School Closing Time (Evening) */}
              <div className="space-y-2 p-3 rounded-2xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/70 dark:border-white/10">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <Clock className="size-3.5 text-purple-500" />
                    School Closing Time (Evening)
                  </span>
                  <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2.5 py-0.5 rounded-full border border-purple-500/20">
                    Closes: {config.schoolCloseTime || "05:00 PM"}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Campus evening closing time (5:00 PM standard). Any check-in after 5:00 PM is marked late. When midnight (12:00 AM) passes, the system treats it as the new day and shows normally.
                </p>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                  <div className="flex-1">
                    <AppSelect
                      value={
                        STANDARD_PM_CLOSE_OPTIONS.includes(config.schoolCloseTime as any)
                          ? (config.schoolCloseTime as string)
                          : "custom"
                      }
                      onChange={(val) => {
                        if (val !== "custom") {
                          setConfig((prev) => ({ ...prev, schoolCloseTime: val }));
                        }
                      }}
                      options={[
                        ...STANDARD_PM_CLOSE_OPTIONS.map((time) => ({
                          value: time,
                          label: `${time} ${time === "05:00 PM" ? "(Standard Default)" : ""}`,
                        })),
                        { value: "custom", label: "Custom PM Time…" },
                      ]}
                      title="Select School Closing Time"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Input
                      type="text"
                      value={config.schoolCloseTime || "05:00 PM"}
                      onChange={(e) => {
                        let val = e.target.value.toUpperCase();
                        val = val.replace(/AM/g, "PM");
                        if (!val.includes("PM") && val.trim().length >= 4) {
                          val = val.replace(/\s*[A-Z]*$/, "").trim() + " PM";
                        }
                        setConfig((prev) => ({ ...prev, schoolCloseTime: val }));
                      }}
                      placeholder="05:00 PM"
                      className="w-28 text-center font-bold text-xs"
                    />
                    <span className="text-xs font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 dark:bg-purple-500/15 px-2.5 py-1.5 rounded-lg border border-purple-500/20">
                      PM
                    </span>
                  </div>
                </div>
              </div>

              {/* 4. Evening Sign-Out Deadline & Grace Period */}
              <div className="space-y-3 p-3 rounded-2xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-500/30">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-rose-900 dark:text-rose-200 flex items-center gap-1.5">
                    <Clock className="size-3.5 text-rose-500" />
                    School Sign-Out Timing & Grace Period
                  </span>
                  <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-full border border-rose-500/20">
                    On-Time Until: {config.schoolSignOutDeadline || "07:00 PM"}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Teachers signing out before or by {config.schoolSignOutDeadline || "07:00 PM"} are signed out on time. Signing out after {config.schoolSignOutDeadline || "07:00 PM"} (late sign-out) requires a reason and admin approval (can be done remotely). At 12:00 AM midnight (next day), any punch without sign-out is automatically marked absent.
                </p>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                  <div className="flex-1">
                    <AppSelect
                      value={
                        STANDARD_PM_SIGNOUT_OPTIONS.includes(config.schoolSignOutDeadline as any)
                          ? (config.schoolSignOutDeadline as string)
                          : "custom"
                      }
                      onChange={(val) => {
                        if (val !== "custom") {
                          setConfig((prev) => ({ ...prev, schoolSignOutDeadline: val }));
                        }
                      }}
                      options={[
                        ...STANDARD_PM_SIGNOUT_OPTIONS.map((time) => ({
                          value: time,
                          label: `${time} ${time === "07:00 PM" ? "(Standard Default)" : ""}`,
                        })),
                        { value: "custom", label: "Custom PM Time…" },
                      ]}
                      title="Select Sign-Out Deadline"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Input
                      type="text"
                      value={config.schoolSignOutDeadline || "07:00 PM"}
                      onChange={(e) => {
                        let val = e.target.value.toUpperCase();
                        val = val.replace(/AM/g, "PM");
                        if (!val.includes("PM") && val.trim().length >= 4) {
                          val = val.replace(/\s*[A-Z]*$/, "").trim() + " PM";
                        }
                        setConfig((prev) => ({ ...prev, schoolSignOutDeadline: val }));
                      }}
                      placeholder="07:00 PM"
                      className="w-28 text-center font-bold text-xs"
                    />
                    <span className="text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 dark:bg-rose-500/15 px-2.5 py-1.5 rounded-lg border border-rose-500/20">
                      PM
                    </span>
                  </div>
                </div>

                {/* Grace period indicator / explanation */}
                <div className="flex items-center justify-between text-xs pt-1 border-t border-rose-200/50 dark:border-rose-900/30">
                  <span className="text-[11px] text-zinc-600 dark:text-zinc-400">
                    Late sign-out grace period: <strong>{config.signOutGraceHours ?? 2} hours</strong> after closing ({config.schoolCloseTime || "05:00 PM"} → {config.schoolSignOutDeadline || "07:00 PM"})
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-zinc-500">Grace Hours:</span>
                    <Input
                      type="number"
                      min="0"
                      max="12"
                      value={config.signOutGraceHours ?? 2}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          signOutGraceHours: Math.max(0, parseInt(e.target.value, 10) || 0),
                        }))
                      }
                      className="w-16 h-7 text-center font-bold text-xs"
                    />
                  </div>
                </div>
              </div>
        </CardContent>
      </Card>
    </div>
  )}

      {/* Advanced Per-Class Sections Configuration */}
      {currentTab === "sections" && (
        <Card className="border-zinc-200 shadow-sm dark:border-white/10">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Layers className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  Class Sections & Categorization
                </CardTitle>
                <CardDescription className="text-xs">
                  Create, rename, or delete school classes, categorize them by wing, and configure custom sections.
                </CardDescription>
              </div>

              {/* Add New Class Button */}
              <Button
                type="button"
                onClick={() => {
                  setNewClassName("");
                  setNewClassWingId(config.wings[0]?.id ?? "");
                  setNewClassSections(["Section A", "Section B", "Section C"]);
                  setAddClassModalOpen(true);
                }}
                className="gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl shadow-xs cursor-pointer h-9 px-3.5"
              >
                <Plus className="size-4" />
                <span>Add New Class</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Class Selector & Actions Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 rounded-xl border border-zinc-200 bg-zinc-50/80 dark:border-white/10 dark:bg-zinc-900/40">
              <div className="space-y-0.5">
                <label className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  Select Class to Customize Sections:
                </label>
                <p className="text-[11px] text-zinc-500">
                  Choose any class below to view its sections, rename it, or update its wing categorization.
                </p>
              </div>
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                <div className="min-w-[260px] flex-1">
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

                {selectedClassForSections && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const currWing = allClasses.find((x) => x.className === selectedClassForSections)?.wingId;
                        setEditingClassName(selectedClassForSections);
                        setEditingClassWingId(currWing || (config.wings[0]?.id ?? ""));
                        setEditClassModalOpen(true);
                      }}
                      className="h-10 px-3 gap-1.5 text-xs font-semibold rounded-xl border-zinc-200 dark:border-white/10 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                      title="Rename or change wing categorization"
                    >
                      <Pencil className="size-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Edit Class</span>
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const currentItem = allClasses.find((x) => x.className === selectedClassForSections);
                        if (!currentItem) return;
                        const wingIdx = config.wings.findIndex((w) => w.id === currentItem.wingId);
                        setDeleteClassTarget({
                          className: selectedClassForSections,
                          wingName: currentItem.wingName,
                          wingIdx,
                          sectionCount: activeClassSections.length,
                        });
                      }}
                      className="h-10 px-3 gap-1.5 text-xs font-semibold rounded-xl border-red-500/20 bg-red-500/5 text-red-600 hover:bg-red-500/15 dark:text-red-400 dark:border-red-500/30 cursor-pointer"
                      title="Delete this class"
                    >
                      <Trash2 className="size-3.5" />
                      <span>Delete</span>
                    </Button>
                  </div>
                )}
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
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="font-semibold text-zinc-700 dark:text-zinc-300">
                      Positions &amp; Max Limits ({wing.positions.length})
                    </h5>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (addingPositionWingIdx === wingIdx) {
                          setAddingPositionWingIdx(null);
                        } else {
                          setAddingPositionWingIdx(wingIdx);
                          setNewPositionName("");
                          setNewPositionLimit("");
                        }
                      }}
                      className="h-6 px-2 text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40 gap-1 cursor-pointer"
                    >
                      <Plus className="h-3 w-3" />
                      Add Position
                    </Button>
                  </div>

                  {/* Inline Add Position Form */}
                  {addingPositionWingIdx === wingIdx && (
                    <div className="p-2.5 rounded-lg border border-blue-200 bg-blue-50/60 dark:border-blue-900/40 dark:bg-blue-950/20 space-y-2 animate-in fade-in duration-200">
                      <div className="text-[11px] font-bold text-blue-700 dark:text-blue-300 flex items-center justify-between">
                        <span>New Position for {wing.name}</span>
                        <button
                          type="button"
                          onClick={() => setAddingPositionWingIdx(null)}
                          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="sm:col-span-2">
                          <input
                            type="text"
                            placeholder="Title (e.g. Lab Assistant)"
                            value={newPositionName}
                            onChange={(e) => setNewPositionName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleConfirmAddPosition(wingIdx);
                              }
                            }}
                            className="w-full h-7 px-2 rounded border border-zinc-300 dark:border-white/15 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100"
                            autoFocus
                          />
                        </div>
                        <div>
                          <input
                            type="number"
                            min="1"
                            max="50"
                            placeholder="Max (∞)"
                            value={newPositionLimit}
                            onChange={(e) => setNewPositionLimit(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleConfirmAddPosition(wingIdx);
                              }
                            }}
                            className="w-full h-7 px-1.5 rounded border border-zinc-300 dark:border-white/15 bg-white dark:bg-zinc-900 text-center text-xs text-zinc-900 dark:text-zinc-100 font-semibold"
                            title="Optional maximum faculty cap. Leave blank for unlimited."
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-1.5 pt-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setAddingPositionWingIdx(null)}
                          className="h-6 px-2 text-[11px] text-zinc-500 hover:text-zinc-700 cursor-pointer"
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleConfirmAddPosition(wingIdx)}
                          className="h-6 px-2.5 text-[11px] bg-blue-600 hover:bg-blue-700 text-white font-medium cursor-pointer shadow-xs"
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* List of positions */}
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
                    {wing.positions.length === 0 ? (
                      <div className="text-center py-3 border border-dashed border-zinc-200 dark:border-white/10 rounded-lg text-zinc-400 text-xs italic">
                        No positions configured. Click &ldquo;Add Position&rdquo; above.
                      </div>
                    ) : (
                      wing.positions.map((pos, posIdx) => (
                        <div
                          key={pos.id || `${pos.name}-${posIdx}`}
                          className="flex items-center justify-between gap-2 p-1.5 rounded-lg border border-zinc-200/80 bg-zinc-50 dark:border-white/5 dark:bg-white/[0.02] hover:border-zinc-300 dark:hover:border-white/15 transition-colors"
                        >
                          {editingPosition?.wingIdx === wingIdx && editingPosition?.posIdx === posIdx ? (
                            <div className="flex items-center gap-1 flex-1 min-w-0">
                              <input
                                type="text"
                                value={editingPosition.name}
                                onChange={(e) =>
                                  setEditingPosition({ ...editingPosition, name: e.target.value })
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleSaveEditedPositionName(wingIdx, posIdx, editingPosition.name);
                                  } else if (e.key === "Escape") {
                                    setEditingPosition(null);
                                  }
                                }}
                                className="h-6 px-1.5 rounded border border-blue-400 bg-white dark:bg-zinc-900 text-xs flex-1 min-w-0 text-zinc-900 dark:text-zinc-100"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  handleSaveEditedPositionName(wingIdx, posIdx, editingPosition.name)
                                }
                                className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer"
                                title="Save name"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingPosition(null)}
                                className="p-1 rounded text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                                title="Cancel"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate text-xs">
                                {pos.name}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingPosition({ wingIdx, posIdx, name: pos.name })
                                }
                                className="p-0.5 rounded text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
                                title={`Rename ${pos.name}`}
                              >
                                <Pencil className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          )}

                          <div className="flex items-center gap-1.5 shrink-0">
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
                              className="w-11 h-6 rounded border border-zinc-300 dark:border-white/15 bg-white dark:bg-zinc-900 text-center text-xs font-semibold"
                              title="Maximum allowed faculty with this position (blank for unlimited ∞)"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setDeletePositionTarget({
                                  wingIdx,
                                  posIdx,
                                  wingName: wing.name,
                                  positionName: pos.name,
                                })
                              }
                              className="p-1 rounded text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                              title={`Delete ${pos.name} position`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
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

                  {/* Note: Classes are added & categorized in Classes & Sections tab */}
                  <p className="text-[10px] text-zinc-500 italic pt-1">
                    To add new classes or edit sections, use the{" "}
                    <button
                      type="button"
                      onClick={() => setTab("sections")}
                      className="text-blue-600 dark:text-blue-400 font-semibold underline hover:text-blue-500 cursor-pointer"
                    >
                      Classes & Sections
                    </button>{" "}
                    tab.
                  </p>
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

      {/* Danger Zone: Remove Position from Wing */}
      <DangerConfirmModal
        open={Boolean(deletePositionTarget)}
        onClose={() => setDeletePositionTarget(null)}
        onConfirm={() => {
          if (!deletePositionTarget) return;
          handleRemovePositionFromWing(deletePositionTarget.wingIdx, deletePositionTarget.posIdx);
          setDeletePositionTarget(null);
        }}
        title="Delete Position"
        subtitle="Remove position from wing"
        description={
          <span>
            Are you sure you want to permanently delete the position{" "}
            <strong className="text-zinc-900 dark:text-white font-semibold">
              &ldquo;{deletePositionTarget?.positionName}&rdquo;
            </strong>{" "}
            from <strong>{deletePositionTarget?.wingName}</strong>? Staff onboarding will no longer be able to select this position. Remember to click &ldquo;Save Changes&rdquo; to apply.
          </span>
        }
        confirmText="Delete Position"
        cancelText="Cancel"
        variant="danger"
      />

      {/* Add New Class Modal */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {addClassModalOpen && (
              <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm"
                  onClick={() => setAddClassModalOpen(false)}
                />

                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 12 }}
                  transition={{ type: "spring", damping: 25, stiffness: 320 }}
                  className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-900 flex flex-col"
                >
                  <div className="flex items-center justify-between border-b border-zinc-100 p-4 dark:border-white/10 shrink-0">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        <FolderPlus className="size-4" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                          Add New Class & Sections
                        </h3>
                        <p className="text-[11px] text-zinc-500">
                          Create a class and assign its wing category
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAddClassModalOpen(false)}
                      className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-white/15 dark:hover:text-zinc-100 transition-colors cursor-pointer"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  <form onSubmit={handleCreateClass} className="p-4 space-y-4 text-xs">
                    {/* Class Name */}
                    <div className="space-y-1.5">
                      <label className={formFieldLabelClass}>Class Name *</label>
                      <Input
                        required
                        placeholder="e.g. Class 13, Pre-KG, Special Arts"
                        value={newClassName}
                        onChange={(e) => setNewClassName(e.target.value)}
                        className="text-xs h-9"
                        autoFocus
                      />
                    </div>

                    {/* Wing Categorization Dropdown */}
                    <div className="space-y-1.5">
                      <label className={formFieldLabelClass}>Wing Category *</label>
                      <AppSelect
                        value={newClassWingId}
                        onChange={setNewClassWingId}
                        placeholder="Select Wing Category..."
                        options={config.wings.map((w) => ({
                          value: w.id,
                          label: w.name,
                          sublabel: w.description,
                        }))}
                      />
                    </div>

                    {/* Initial Sections */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className={formFieldLabelClass}>Initial Sections ({newClassSections.length})</label>
                        <div className="flex items-center gap-1 text-[10px]">
                          <button
                            type="button"
                            onClick={() => setNewClassSections(["Section A", "Section B", "Section C"])}
                            className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:text-blue-600 font-medium cursor-pointer"
                          >
                            A, B, C
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewClassSections(["Section A", "Section B"])}
                            className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:text-blue-600 font-medium cursor-pointer"
                          >
                            A, B
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewClassSections(["Section A"])}
                            className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:text-blue-600 font-medium cursor-pointer"
                          >
                            A only
                          </button>
                        </div>
                      </div>

                      {/* Section pills */}
                      <div className="flex flex-wrap gap-1.5 p-2 rounded-xl border border-zinc-200/70 dark:border-white/10 bg-zinc-50/50 dark:bg-zinc-950/40 min-h-[44px]">
                        {newClassSections.map((sec) => (
                          <span
                            key={sec}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-900 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-500/30 text-xs font-semibold"
                          >
                            {sec}
                            <button
                              type="button"
                              onClick={() => setNewClassSections(newClassSections.filter((s) => s !== sec))}
                              className="text-zinc-400 hover:text-red-500 ml-0.5 cursor-pointer"
                            >
                              <X className="size-3" />
                            </button>
                          </span>
                        ))}
                      </div>

                      {/* Add custom section */}
                      <div className="flex items-center gap-1.5">
                        <Input
                          placeholder="Add custom section (e.g. Section Red)"
                          value={customSectionInput}
                          onChange={(e) => setCustomSectionInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const trimmed = customSectionInput.trim();
                              if (trimmed && !newClassSections.includes(trimmed)) {
                                setNewClassSections([...newClassSections, trimmed]);
                                setCustomSectionInput("");
                              }
                            }
                          }}
                          className="h-8 text-xs"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const trimmed = customSectionInput.trim();
                            if (trimmed && !newClassSections.includes(trimmed)) {
                              setNewClassSections([...newClassSections, trimmed]);
                              setCustomSectionInput("");
                            }
                          }}
                          className="h-8 px-2.5 text-xs font-semibold shrink-0 cursor-pointer"
                        >
                          Add
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-white/10">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setAddClassModalOpen(false)}
                        className="h-9 px-4 rounded-xl text-xs"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        className="h-9 px-4 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white gap-1.5 shadow-sm cursor-pointer"
                      >
                        <Plus className="size-3.5" />
                        <span>Create Class</span>
                      </Button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* Edit Class Modal */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {editClassModalOpen && (
              <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm"
                  onClick={() => setEditClassModalOpen(false)}
                />

                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 12 }}
                  transition={{ type: "spring", damping: 25, stiffness: 320 }}
                  className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-900 flex flex-col"
                >
                  <div className="flex items-center justify-between border-b border-zinc-100 p-4 dark:border-white/10 shrink-0">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        <Pencil className="size-4" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                          Edit Class & Categorization
                        </h3>
                        <p className="text-[11px] text-zinc-500">
                          Rename class or move to another wing
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditClassModalOpen(false)}
                      className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-white/15 dark:hover:text-zinc-100 transition-colors cursor-pointer"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  <form onSubmit={handleUpdateClass} className="p-4 space-y-4 text-xs">
                    {/* Class Name */}
                    <div className="space-y-1.5">
                      <label className={formFieldLabelClass}>Class Name *</label>
                      <Input
                        required
                        value={editingClassName}
                        onChange={(e) => setEditingClassName(e.target.value)}
                        className="text-xs h-9"
                        autoFocus
                      />
                    </div>

                    {/* Wing Categorization Dropdown */}
                    <div className="space-y-1.5">
                      <label className={formFieldLabelClass}>Wing Category *</label>
                      <AppSelect
                        value={editingClassWingId}
                        onChange={setEditingClassWingId}
                        placeholder="Select Wing Category..."
                        options={config.wings.map((w) => ({
                          value: w.id,
                          label: w.name,
                          sublabel: w.description,
                        }))}
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-white/10">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setEditClassModalOpen(false)}
                        className="h-9 px-4 rounded-xl text-xs"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        className="h-9 px-4 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white gap-1.5 shadow-sm cursor-pointer"
                      >
                        <CheckCircle2 className="size-3.5" />
                        <span>Save Changes</span>
                      </Button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* Delete Class Confirmation Modal */}
      <DangerConfirmModal
        open={Boolean(deleteClassTarget)}
        onClose={() => setDeleteClassTarget(null)}
        onConfirm={handleDeleteClass}
        title="Delete Class"
        subtitle={`Permanently remove ${deleteClassTarget?.className}`}
        description={
          <span>
            Are you sure you want to delete <strong className="text-white font-bold">{deleteClassTarget?.className}</strong>?
            This will remove it from <strong>{deleteClassTarget?.wingName}</strong> and erase its {deleteClassTarget?.sectionCount} configured section(s).
          </span>
        }
        confirmText="Delete Class"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}
