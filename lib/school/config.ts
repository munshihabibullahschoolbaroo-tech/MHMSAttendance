import { Firestore } from "firebase-admin/firestore";

export type SchoolWingId = "higher" | "lower" | "rewa_na_kasco";

export type SchoolConfig = {
  name: string;
  campusName: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  wings: {
    id: SchoolWingId;
    name: string;
    description: string;
    classes: string[];
    positions: Array<{ id: string; name: string; maxLimit?: number }>;
  }[];
  sections: string[];
  classSections?: Record<string, string[]>;
  teacherLateTime?: string;
};

export function getSectionsForClass(
  config: Partial<SchoolConfig> | null | undefined,
  classId?: string | null
): string[] {
  if (!config) return ["Section A", "Section B"];
  if (
    classId &&
    config.classSections &&
    Array.isArray(config.classSections[classId]) &&
    config.classSections[classId].length > 0
  ) {
    return config.classSections[classId];
  }
  if (Array.isArray(config.sections) && config.sections.length > 0) {
    return config.sections;
  }
  return ["Section A", "Section B"];
}

export const DEFAULT_SCHOOL_CONFIG: SchoolConfig = {
  name: "Munshi Habibullah Mission School",
  campusName: "Bemathang Campus, Kargil, UT Ladakh",
  latitude: 34.547063,
  longitude: 76.140028,
  radiusMeters: 250,
  wings: [
    {
      id: "lower",
      name: "Lower School",
      description: "Pre-Nursery to UKG Kindergarten Wing",
      classes: ["Pre-Nursery", "Nursery", "LKG", "UKG"],
      positions: [
        { id: "principal", name: "Principal", maxLimit: 1 },
        { id: "vice_principal", name: "Vice Principal", maxLimit: 2 },
        { id: "teacher", name: "Teacher" },
        { id: "helper", name: "Helper" },
      ],
    },
    {
      id: "higher",
      name: "Higher School",
      description: "Class 1st to 12th Senior Wing",
      classes: [
        "Class 1",
        "Class 2",
        "Class 3",
        "Class 4",
        "Class 5",
        "Class 6",
        "Class 7",
        "Class 8",
        "Class 9",
        "Class 10",
        "Class 11",
        "Class 12",
      ],
      positions: [
        { id: "principal", name: "Principal", maxLimit: 1 },
        { id: "vice_principal", name: "Vice Principal", maxLimit: 2 },
        { id: "lecturer", name: "Lecturer" },
        { id: "teacher", name: "Teacher" },
        { id: "helper", name: "Helper" },
      ],
    },
    {
      id: "rewa_na_kasco",
      name: "Rewa na Kasco",
      description: "Special Handicraft, Vocational & Arts Wing",
      classes: ["Vocational Class A", "Vocational Class B"],
      positions: [
        { id: "incharge", name: "Incharge", maxLimit: 1 },
        { id: "teacher", name: "Teacher" },
        { id: "helper", name: "Helper" },
      ],
    },
  ],
  sections: ["Section A", "Section B", "Section C", "Section D"],
  classSections: {
    "Pre-Nursery": ["Section A", "Section B"],
    "Nursery": ["Section A", "Section B"],
    "LKG": ["Section A", "Section B"],
    "UKG": ["Section A", "Section B"],
    "Class 1": ["Section A", "Section B", "Section C"],
    "Class 2": ["Section A", "Section B", "Section C"],
    "Class 3": ["Section A", "Section B", "Section C"],
    "Class 4": ["Section A", "Section B", "Section C"],
    "Class 5": ["Section A", "Section B", "Section C"],
    "Class 6": ["Section A", "Section B", "Section C"],
    "Class 7": ["Section A", "Section B", "Section C"],
    "Class 8": ["Section A", "Section B", "Section C"],
    "Class 9": ["Section A", "Section B"],
    "Class 10": ["Section A", "Section B"],
    "Class 11": ["Section A", "Section B"],
    "Class 12": ["Section A", "Section B"],
    "Vocational Class A": ["Section A"],
    "Vocational Class B": ["Section A"],
  },
  teacherLateTime: "09:00 AM",
};

export async function getSchoolConfig(db: Firestore): Promise<SchoolConfig> {
  const snap = await db.collection("schoolConfig").doc("main").get();
  if (!snap.exists) {
    return DEFAULT_SCHOOL_CONFIG;
  }
  const data = snap.data() as Partial<SchoolConfig>;
  const classSections =
    data.classSections && typeof data.classSections === "object"
      ? (data.classSections as Record<string, string[]>)
      : undefined;

  return {
    ...DEFAULT_SCHOOL_CONFIG,
    ...data,
    latitude: typeof data.latitude === "number" ? data.latitude : DEFAULT_SCHOOL_CONFIG.latitude,
    longitude: typeof data.longitude === "number" ? data.longitude : DEFAULT_SCHOOL_CONFIG.longitude,
    radiusMeters: typeof data.radiusMeters === "number" ? data.radiusMeters : DEFAULT_SCHOOL_CONFIG.radiusMeters,
    wings: Array.isArray(data.wings) && data.wings.length > 0 ? data.wings : DEFAULT_SCHOOL_CONFIG.wings,
    sections: Array.isArray(data.sections) && data.sections.length > 0 ? data.sections : DEFAULT_SCHOOL_CONFIG.sections,
    classSections: classSections ?? DEFAULT_SCHOOL_CONFIG.classSections ?? {},
    teacherLateTime:
      typeof data.teacherLateTime === "string" && data.teacherLateTime.trim()
        ? data.teacherLateTime.trim()
        : DEFAULT_SCHOOL_CONFIG.teacherLateTime ?? "09:00 AM",
  };
}

export async function saveSchoolConfig(db: Firestore, config: Partial<SchoolConfig>): Promise<void> {
  await db.collection("schoolConfig").doc("main").set(config, { merge: true });
}
