import { createContext, useContext, useState, type ReactNode } from "react";

export type Entry = {
  observation: { title: string; notes: string };
  behavior: { behavior: "" | "excellent" | "good" | "average" | "needs_improvement"; notes: string };
  participation: { participation: "" | "highly_active" | "active" | "moderate" | "passive"; notes: string };
  academic: { subject: string; title: string; notes: string; strengths: string; improvements: string };
};

const emptyEntry: Entry = {
  observation: { title: "", notes: "" },
  behavior: { behavior: "", notes: "" },
  participation: { participation: "", notes: "" },
  academic: { subject: "", title: "", notes: "", strengths: "", improvements: "" },
};

type Ctx = {
  studentId: string; setStudentId: (v: string) => void;
  classId: string; setClassId: (v: string) => void;
  sectionId: string; setSectionId: (v: string) => void;
  recordDate: string; setRecordDate: (v: string) => void;
  entry: Entry;
  setSection: <K extends keyof Entry>(k: K, v: Entry[K]) => void;
  reset: () => void;
  resetAll: () => void;
};

const ProgressEntryCtx = createContext<Ctx | null>(null);

export function ProgressEntryProvider({ children }: { children: ReactNode }) {
  const [studentId, setStudentIdState] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [recordDate, setRecordDate] = useState(new Date().toISOString().slice(0, 10));
  const [entry, setEntry] = useState<Entry>(emptyEntry);

  const setStudentId = (v: string) => {
    if (v !== studentId) setEntry(emptyEntry);
    setStudentIdState(v);
  };
  const setSection = <K extends keyof Entry>(k: K, v: Entry[K]) =>
    setEntry((prev) => ({ ...prev, [k]: v }));
  const reset = () => setEntry(emptyEntry);
  const resetAll = () => {
    setStudentIdState(""); setClassId(""); setSectionId("");
    setEntry(emptyEntry);
  };

  return (
    <ProgressEntryCtx.Provider value={{
      studentId, setStudentId, classId, setClassId, sectionId, setSectionId,
      recordDate, setRecordDate, entry, setSection, reset, resetAll,
    }}>
      {children}
    </ProgressEntryCtx.Provider>
  );
}

export const useProgressEntry = () => {
  const v = useContext(ProgressEntryCtx);
  if (!v) throw new Error("ProgressEntryProvider missing");
  return v;
};

export function entryStatus(studentId: string, e: Entry) {
  const observation = e.observation.notes.trim().length > 0 || e.observation.title.trim().length > 0;
  const behavior = !!e.behavior.behavior;
  const participation = !!e.participation.participation;
  const academic = e.academic.subject.trim().length > 0
    && (e.academic.notes.trim().length > 0 || e.academic.title.trim().length > 0
        || e.academic.strengths.trim().length > 0 || e.academic.improvements.trim().length > 0);
  return {
    observation, behavior, participation, academic,
    allReady: !!studentId && observation && behavior && participation && academic,
  };
}
