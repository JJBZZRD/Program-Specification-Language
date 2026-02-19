export type LanguageVersion = "0.1";

export type IsoDate = string;

export type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

export interface ProgramCalendar {
  start_date: IsoDate;
  end_date?: IsoDate;
  timezone?: string;
}

export interface IntervalDaysSchedule {
  type: "interval_days";
  every: number;
  start_offset_days?: number;
}

export interface WeekdaysSchedule {
  type: "weekdays";
  days: Weekday[];
  start_offset_days?: number;
}

export type SessionSchedule = IntervalDaysSchedule | WeekdaysSchedule;

export type LoadUnit = "kg" | "lb";

export type Percent1rmIntensity = {
  type: "percent_1rm";
  value: number;
};

export type RpeIntensity = {
  type: "rpe";
  value: number;
};

export type RirIntensity = {
  type: "rir";
  value: number;
};

export type LoadIntensity = {
  type: "load";
  value: number;
  unit: LoadUnit;
};

export type IntensityTarget = Percent1rmIntensity | RpeIntensity | RirIntensity | LoadIntensity;

export type IntensityType = IntensityTarget["type"];

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
  day?: number;
  schedule?: SessionSchedule;
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
  calendar?: ProgramCalendar;
  sessions: Session[];
}
