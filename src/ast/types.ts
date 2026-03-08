export type LanguageVersion = "0.1" | "0.2" | "0.3";

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
  end_offset_days?: number;
}

export interface WeekdaysSchedule {
  type: "weekdays";
  days: Weekday[];
  start_offset_days?: number;
  end_offset_days?: number;
}

export type SessionSchedule = IntervalDaysSchedule | WeekdaysSchedule;

export type LoadUnit = "kg" | "lb";

export type LoadDelta = {
  value: number;
  unit: LoadUnit;
};

export type Percent1rmIntensity = {
  type: "percent_1rm";
  value: number;
  plus_load?: LoadDelta;
};

export type SetRole =
  | "warmup"
  | "top"
  | "backoff"
  | "work"
  | "amrap"
  | "drop"
  | "cluster"
  | "giant"
  | "circuit"
  | "activation"
  | (string & {});

export type PercentOfSetIntensity = {
  type: "percent_of_set";
  role: SetRole;
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

export type LoadRangeIntensity = {
  type: "load_range";
  min: number;
  max: number;
  unit: LoadUnit;
};

export type LoadDeltaFromSetIntensity = {
  type: "load_delta_from_set";
  role: SetRole;
  value: number;
  unit: LoadUnit;
};

export type IntensityTarget =
  | Percent1rmIntensity
  | PercentOfSetIntensity
  | RpeIntensity
  | RirIntensity
  | LoadIntensity
  | LoadRangeIntensity
  | LoadDeltaFromSetIntensity;

export type IntensityType = IntensityTarget["type"];

export type RepRange = {
  min: number;
  max: number;
};

export type RepTarget = number | RepRange;

export type ComparisonOp = ">=" | ">" | "<=" | "<" | "==" | "!=";

export type ProgressionCondition =
  | {
      type: "session_success";
      equals?: boolean;
    }
  | {
      type: "metric_vs_target";
      metric: "load" | "rpe" | "rir";
      op: ComparisonOp;
      target?: "value" | "min" | "max";
    }
  | {
      type: "aggregate_metric";
      metric: "total_reps" | "avg_rpe" | "min_load";
      op: ComparisonOp;
      value: number;
      unit?: LoadUnit;
    };

export type WeeklyIncrementBy = number | { min?: number; max?: number } | LoadIntensity;

export type ProgressionCadence =
  | {
      type: "weeks";
      every?: number;
    }
  | {
      type: "sessions";
      every?: number;
      on_weekdays?: Weekday[];
    };

export type ProgressionScope = "set" | "exercise" | "session";

export type ProgressionAggregation =
  | "all_sets"
  | "any_set"
  | "last_set"
  | "total_reps"
  | "avg_rpe"
  | "min_load";

export type ProgressionCriteria = {
  aggregation?: ProgressionAggregation;
  condition?: ProgressionCondition;
};

export type ProgressionAction =
  | {
      type: "repeat_week";
    }
  | {
      type: "reduce_load";
      by: number | LoadDelta;
    }
  | {
      type: "reduce_volume";
      by: number;
    }
  | {
      type: "switch_variant";
      to_exercise_id: string;
    };

export type WeeklyIncrementProgression = {
  type: "weekly_increment" | "increment";
  when?: ProgressionCondition;
  by: WeeklyIncrementBy;
  cadence?: ProgressionCadence;
  scope?: ProgressionScope;
  criteria?: ProgressionCriteria;
};

export type StrategyProgression = {
  type: "auto_adjust";
  scope?: ProgressionScope;
  criteria: ProgressionCriteria;
  actions: ProgressionAction[];
};

export type ProgressionRule = WeeklyIncrementProgression | StrategyProgression;

export type WorkType = "reps" | "time";

export type TimeSetMode = "amrap" | "emom" | "for_time" | "density";

export type RepeatUntilCondition =
  | {
      metric: "rpe" | "rir" | "velocity_loss";
      op: ComparisonOp;
      value: number;
    }
  | {
      metric: "failure";
      op?: "==" | "!=";
      value?: boolean;
    };

export interface RepeatSpec {
  max_sets?: number;
  until?: RepeatUntilCondition;
}

export interface PrescriptionConstraints {
  max_rpe?: number;
  min_rir?: number;
  max_sets?: number;
  max_total_reps?: number;
  stop_on_failure?: boolean;
  velocity_loss_cap?: number;
}

export interface WarmupRampSpec {
  type: "percent_ramp";
  from_percent: number;
  to_percent: number;
  steps: number;
  reps: RepTarget;
  based_on_role?: SetRole;
}

export interface WarmupStepsSpec {
  type: "steps";
  steps: Array<{
    percent?: number;
    reps?: RepTarget;
    note?: string;
  }>;
  based_on_role?: SetRole;
}

export type WarmupSpec = WarmupRampSpec | WarmupStepsSpec;

export type Tempo =
  | string
  | {
      eccentric?: string;
      pause_bottom?: string;
      concentric?: string;
      pause_top?: string;
    };

export interface ExerciseRequirementConstraints {
  requires?: string[];
}

export interface ExerciseSubstitution {
  exercise_id?: string;
  exercise?: string;
  rank?: number;
  tags?: string[];
  constraints?: ExerciseRequirementConstraints;
}

export interface RoundingPolicy {
  round_to?: number;
  mode?: "nearest" | "down" | "up";
  equipment?: {
    barbell?: number;
    dumbbell?: number;
    machine?: number;
  };
}

export interface DeloadModifiers {
  deload?: boolean;
  volume_multiplier?: number;
  intensity_cap?: {
    max_rpe?: number;
  };
  exercise_swap_map?: Record<string, string>;
}

export interface SetPrescription {
  count: number;
  reps?: RepTarget;
  work_type?: WorkType;
  time_mode?: TimeSetMode;
  duration_seconds?: number;
  interval_seconds?: number;
  target_total_reps?: number;
  intensity?: IntensityTarget;
  role?: SetRole;
  rest_seconds?: number;
  rest_before_seconds?: number;
  rest_after_seconds?: number;
  constraints?: PrescriptionConstraints;
  repeat?: RepeatSpec;
  progression?: ProgressionRule;
  tempo?: Tempo;
  pause_seconds?: number;
  eccentric_seconds?: number;
  note?: string;
}

export interface ExercisePrescription {
  exercise: string;
  exercise_id?: string;
  aliases?: string[];
  family?: string;
  tags?: string[];
  modifiers?: Record<string, string>;
  substitutions?: ExerciseSubstitution[];
  constraints?: PrescriptionConstraints;
  warmup?: WarmupSpec;
  group_id?: string;
  sets: SetPrescription[];
  rest_before_seconds?: number;
  rest_after_seconds?: number;
  rest_seconds?: number;
  tempo?: Tempo;
  pause_seconds?: number;
  eccentric_seconds?: number;
  units?: LoadUnit;
  rounding?: RoundingPolicy;
}

export interface SessionGroup {
  id: string;
  type: "superset" | "circuit" | "giant_set";
  rounds?: number;
  exercise_ids?: string[];
  rest_between_exercises_seconds?: number;
  rest_between_rounds_seconds?: number;
}

export type SessionSlot = "AM" | "PM" | "EVE" | number;

export interface SessionModifiers extends DeloadModifiers {}

export interface Session {
  id: string;
  name: string;
  day?: number;
  schedule?: SessionSchedule;
  slot?: SessionSlot;
  rest_default_seconds?: number;
  groups?: SessionGroup[];
  constraints?: PrescriptionConstraints;
  modifiers?: SessionModifiers;
  block_id?: string;
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
  units?: LoadUnit;
  rounding?: RoundingPolicy;
  exercise_aliases?: Record<string, string>;
  sessions: Session[];
}
