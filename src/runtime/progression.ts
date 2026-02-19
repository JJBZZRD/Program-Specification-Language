import type { IsoDate, LoadUnit } from "../ast/types.js";

export type ResultsFile = SessionCompletion[] | { sessions: SessionCompletion[] };

export interface CompletedLoad {
  value: number;
  unit: LoadUnit;
}

export interface SetCompletion {
  index: number;
  load?: CompletedLoad;
  rpe?: number;
  rir?: number;
}

export interface ExerciseCompletion {
  exercise: string;
  sets?: SetCompletion[];
}

export interface SessionCompletion {
  session_id: string;
  date_iso: IsoDate;
  success?: boolean;
  exercises?: ExerciseCompletion[];
}

