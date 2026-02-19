export type LanguageVersion = "0.1";

export type IntensityType = "percent_1rm" | "rpe" | "rir";

export interface IntensityTarget {
  type: IntensityType;
  value: number;
}

export type RepRange = {
  min: number;
  max: number;
};

export type RepTarget = number | RepRange;

export interface SetPrescription {
  count: number;
  reps: RepTarget;
  intensity?: IntensityTarget;
  note?: string;
}

export interface ExercisePrescription {
  exercise: string;
  sets: SetPrescription[];
  rest_seconds?: number;
}

export interface Session {
  id: string;
  name: string;
  day: number;
  exercises: ExercisePrescription[];
}

export interface ProgramMetadata {
  id: string;
  name: string;
  description?: string;
  author?: string;
}

export interface ProgramAst {
  language_version: LanguageVersion;
  metadata: ProgramMetadata;
  sessions: Session[];
}
