import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type Pathway = "suspected" | "diagnosed";

export type DiagnosisInfo = {
  completed: boolean;
  confirmedBy: string;
  diagnosisDate: string;
  stage: string;
  medicationPrescribed: string;
  surgeries: string;
  knownSideEffects: string;
  allergies: string;
  notes: string;
};

export type MedicationEffect = "Helped" | "Partly" | "No effect" | null;

export type DayRecord = {
  date: string;
  pain: number; // 0-10
  impact: 0 | 15 | 25;
  locations: Record<string, string[]>;
  generalSymptoms: string[];
  bleedingOutsideWindow: boolean;
  medicationName: string;
  medicationEffect: MedicationEffect;
  otherSymptoms: string;
  tookRegularTreatment: boolean;
  treatmentSideEffects: string;
  burdenScore: number; // 0-100
};

export const emptyDiagnosisInfo: DiagnosisInfo = {
  completed: false,
  confirmedBy: "",
  diagnosisDate: "",
  stage: "",
  medicationPrescribed: "",
  surgeries: "",
  knownSideEffects: "",
  allergies: "",
  notes: "",
};

export const emptyDayRecord = (): DayRecord => ({
  date: new Date().toISOString().slice(0, 10),
  pain: 0,
  impact: 0,
  locations: {},
  generalSymptoms: [],
  bleedingOutsideWindow: false,
  medicationName: "",
  medicationEffect: null,
  otherSymptoms: "",
  tookRegularTreatment: false,
  treatmentSideEffects: "",
  burdenScore: 0,
});

type CheckInContextValue = {
  pathway: Pathway;
  setPathway: (p: Pathway) => void;
  diagnosisInfo: DiagnosisInfo;
  setDiagnosisInfo: (updater: (prev: DiagnosisInfo) => DiagnosisInfo) => void;
  dayRecord: DayRecord;
  setDayRecord: (updater: (prev: DayRecord) => DayRecord) => void;
  resetDayRecord: () => void;
};

const CheckInContext = createContext<CheckInContextValue | null>(null);

export function CheckInProvider({ children }: { children: ReactNode }) {
  const [pathway, setPathway] = useState<Pathway>("suspected");
  const [diagnosisInfo, setDiagnosisInfoState] = useState<DiagnosisInfo>(emptyDiagnosisInfo);
  const [dayRecord, setDayRecordState] = useState<DayRecord>(() => emptyDayRecord());

  const value = useMemo<CheckInContextValue>(
    () => ({
      pathway,
      setPathway,
      diagnosisInfo,
      setDiagnosisInfo: (updater) => setDiagnosisInfoState((prev) => updater(prev)),
      dayRecord,
      setDayRecord: (updater) => setDayRecordState((prev) => updater(prev)),
      resetDayRecord: () => setDayRecordState(emptyDayRecord()),
    }),
    [pathway, diagnosisInfo, dayRecord],
  );

  return <CheckInContext.Provider value={value}>{children}</CheckInContext.Provider>;
}

export function useCheckIn() {
  const ctx = useContext(CheckInContext);
  if (!ctx) throw new Error("useCheckIn must be used within a CheckInProvider");
  return ctx;
}