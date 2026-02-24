import type {
  ExercisePrescription,
  IntensityTarget,
  ProgramAst,
  ProgressionRule,
  RepRange,
  RepTarget,
  SessionGroup,
  SessionSchedule,
  SessionSlot,
  Tempo
} from "../ast/types.js";
import { hashSource } from "../util/hash.js";

export interface CompiledSet {
  index: number;
  reps?: RepRange;
  work_type?: "reps" | "time";
  time_mode?: "amrap" | "emom" | "for_time" | "density";
  duration_seconds?: number;
  interval_seconds?: number;
  target_total_reps?: number;
  intensity?: IntensityTarget;
  role?: string;
  rest_seconds?: number;
  rest_before_seconds?: number;
  rest_after_seconds?: number;
  constraints?: ExercisePrescription["constraints"];
  repeat?: ExercisePrescription["sets"][number]["repeat"];
  progression?: ProgressionRule;
  tempo?: Tempo;
  pause_seconds?: number;
  eccentric_seconds?: number;
  note?: string;
}

export interface CompiledExercise {
  exercise: string;
  exercise_id?: string;
  family?: string;
  tags?: string[];
  modifiers?: Record<string, string>;
  substitutions?: ExercisePrescription["substitutions"];
  constraints?: ExercisePrescription["constraints"];
  warmup?: ExercisePrescription["warmup"];
  group_id?: string;
  rest_seconds?: number;
  rest_before_seconds?: number;
  rest_after_seconds?: number;
  tempo?: Tempo;
  pause_seconds?: number;
  eccentric_seconds?: number;
  units?: ProgramAst["units"];
  rounding?: ProgramAst["rounding"];
  sets: CompiledSet[];
}

export interface CompiledSession {
  id: string;
  name: string;
  day?: number;
  schedule?: SessionSchedule;
  slot?: SessionSlot;
  rest_default_seconds?: number;
  groups?: SessionGroup[];
  constraints?: ProgramAst["sessions"][number]["constraints"];
  modifiers?: ProgramAst["sessions"][number]["modifiers"];
  block_id?: string;
  exercises: CompiledExercise[];
}

export interface CompiledProgram {
  language_version: ProgramAst["language_version"];
  source_hash: string;
  metadata: ProgramAst["metadata"];
  calendar?: ProgramAst["calendar"];
  units?: ProgramAst["units"];
  rounding?: ProgramAst["rounding"];
  exercise_aliases?: ProgramAst["exercise_aliases"];
  sessions: CompiledSession[];
}

function normalizeReps(reps: RepTarget | undefined): RepRange | undefined {
  if (reps === undefined) {
    return undefined;
  }
  if (typeof reps === "number") {
    return { min: reps, max: reps };
  }
  return reps;
}

function cloneIntensity(intensity: IntensityTarget | undefined): IntensityTarget | undefined {
  if (!intensity) {
    return undefined;
  }

  if (intensity.type === "percent_1rm") {
    return {
      type: "percent_1rm",
      value: intensity.value,
      ...(intensity.plus_load ? { plus_load: { ...intensity.plus_load } } : {})
    };
  }

  if (intensity.type === "rpe") {
    return { type: "rpe", value: intensity.value };
  }

  if (intensity.type === "rir") {
    return { type: "rir", value: intensity.value };
  }

  if (intensity.type === "load") {
    return { type: "load", value: intensity.value, unit: intensity.unit };
  }

  if (intensity.type === "load_range") {
    return { type: "load_range", min: intensity.min, max: intensity.max, unit: intensity.unit };
  }

  if (intensity.type === "percent_of_set") {
    return { type: "percent_of_set", role: intensity.role, value: intensity.value };
  }

  return {
    type: "load_delta_from_set",
    role: intensity.role,
    value: intensity.value,
    unit: intensity.unit
  };
}

function applySessionIntensityCap(
  intensity: IntensityTarget | undefined,
  maxRpe: number | undefined
): IntensityTarget | undefined {
  if (!intensity || maxRpe === undefined) {
    return intensity;
  }
  if (intensity.type !== "rpe") {
    return intensity;
  }
  if (intensity.value <= maxRpe) {
    return intensity;
  }
  return { type: "rpe", value: maxRpe };
}

function resolveExerciseSwap(
  exercise: ExercisePrescription,
  swapMap: Record<string, string> | undefined
): { exercise: string; exercise_id?: string } {
  if (!swapMap) {
    return { exercise: exercise.exercise, ...(exercise.exercise_id ? { exercise_id: exercise.exercise_id } : {}) };
  }

  if (exercise.exercise_id && swapMap[exercise.exercise_id]) {
    const swapped = swapMap[exercise.exercise_id]!;
    return { exercise: swapped, exercise_id: swapped };
  }

  if (swapMap[exercise.exercise]) {
    return { exercise: swapMap[exercise.exercise]! };
  }

  return { exercise: exercise.exercise, ...(exercise.exercise_id ? { exercise_id: exercise.exercise_id } : {}) };
}

function resolveCount(baseCount: number, volumeMultiplier: number | undefined): number {
  if (volumeMultiplier === undefined) {
    return baseCount;
  }
  return Math.max(1, Math.round(baseCount * volumeMultiplier));
}

export function compileProgram(ast: ProgramAst): CompiledProgram {
  return {
    language_version: ast.language_version,
    source_hash: hashSource(ast),
    metadata: ast.metadata,
    ...(ast.calendar ? { calendar: ast.calendar } : {}),
    ...(ast.units ? { units: ast.units } : {}),
    ...(ast.rounding ? { rounding: ast.rounding } : {}),
    ...(ast.exercise_aliases ? { exercise_aliases: ast.exercise_aliases } : {}),
    sessions: ast.sessions.map((session) => {
      const volumeMultiplier = session.modifiers?.volume_multiplier;
      const maxRpeCap = session.modifiers?.intensity_cap?.max_rpe;
      const swapMap = session.modifiers?.exercise_swap_map;

      return {
        id: session.id,
        name: session.name,
        ...(session.day !== undefined ? { day: session.day } : {}),
        ...(session.schedule ? { schedule: session.schedule } : {}),
        ...(session.slot !== undefined ? { slot: session.slot } : {}),
        ...(session.rest_default_seconds !== undefined
          ? { rest_default_seconds: session.rest_default_seconds }
          : {}),
        ...(session.groups && session.groups.length > 0 ? { groups: session.groups } : {}),
        ...(session.constraints ? { constraints: session.constraints } : {}),
        ...(session.modifiers ? { modifiers: session.modifiers } : {}),
        ...(session.block_id ? { block_id: session.block_id } : {}),
        exercises: session.exercises.map((exercise) => {
          const sets: CompiledSet[] = [];
          const swapped = resolveExerciseSwap(exercise, swapMap);

          exercise.sets.forEach((set) => {
            const expandedCount = resolveCount(set.count, volumeMultiplier);
            for (let index = 0; index < expandedCount; index += 1) {
              const inheritedRest = set.rest_seconds ?? exercise.rest_seconds ?? session.rest_default_seconds;
              const inheritedRestBefore = set.rest_before_seconds ?? exercise.rest_before_seconds;
              const inheritedRestAfter = set.rest_after_seconds ?? exercise.rest_after_seconds;
              const inheritedTempo = set.tempo ?? exercise.tempo;
              const inheritedPause = set.pause_seconds ?? exercise.pause_seconds;
              const inheritedEccentric = set.eccentric_seconds ?? exercise.eccentric_seconds;
              const cappedIntensity = applySessionIntensityCap(cloneIntensity(set.intensity), maxRpeCap);

              sets.push({
                index: sets.length + 1,
                ...(normalizeReps(set.reps) ? { reps: normalizeReps(set.reps) } : {}),
                ...(set.work_type ? { work_type: set.work_type } : {}),
                ...(set.time_mode ? { time_mode: set.time_mode } : {}),
                ...(set.duration_seconds !== undefined ? { duration_seconds: set.duration_seconds } : {}),
                ...(set.interval_seconds !== undefined ? { interval_seconds: set.interval_seconds } : {}),
                ...(set.target_total_reps !== undefined ? { target_total_reps: set.target_total_reps } : {}),
                ...(cappedIntensity ? { intensity: cappedIntensity } : {}),
                ...(set.role ? { role: set.role } : {}),
                ...(inheritedRest !== undefined ? { rest_seconds: inheritedRest } : {}),
                ...(inheritedRestBefore !== undefined ? { rest_before_seconds: inheritedRestBefore } : {}),
                ...(inheritedRestAfter !== undefined ? { rest_after_seconds: inheritedRestAfter } : {}),
                ...(set.constraints ? { constraints: set.constraints } : {}),
                ...(set.repeat ? { repeat: set.repeat } : {}),
                progression: set.progression,
                ...(inheritedTempo ? { tempo: inheritedTempo } : {}),
                ...(inheritedPause !== undefined ? { pause_seconds: inheritedPause } : {}),
                ...(inheritedEccentric !== undefined ? { eccentric_seconds: inheritedEccentric } : {}),
                note: set.note
              });
            }
          });

          return {
            exercise: swapped.exercise,
            ...(swapped.exercise_id ? { exercise_id: swapped.exercise_id } : {}),
            ...(exercise.family ? { family: exercise.family } : {}),
            ...(exercise.tags && exercise.tags.length > 0 ? { tags: exercise.tags } : {}),
            ...(exercise.modifiers ? { modifiers: exercise.modifiers } : {}),
            ...(exercise.substitutions && exercise.substitutions.length > 0
              ? { substitutions: exercise.substitutions }
              : {}),
            ...(exercise.constraints ? { constraints: exercise.constraints } : {}),
            ...(exercise.warmup ? { warmup: exercise.warmup } : {}),
            ...(exercise.group_id ? { group_id: exercise.group_id } : {}),
            ...(exercise.rest_seconds !== undefined ? { rest_seconds: exercise.rest_seconds } : {}),
            ...(exercise.rest_before_seconds !== undefined
              ? { rest_before_seconds: exercise.rest_before_seconds }
              : {}),
            ...(exercise.rest_after_seconds !== undefined
              ? { rest_after_seconds: exercise.rest_after_seconds }
              : {}),
            ...(exercise.tempo ? { tempo: exercise.tempo } : {}),
            ...(exercise.pause_seconds !== undefined ? { pause_seconds: exercise.pause_seconds } : {}),
            ...(exercise.eccentric_seconds !== undefined
              ? { eccentric_seconds: exercise.eccentric_seconds }
              : {}),
            ...(exercise.units ? { units: exercise.units } : {}),
            ...(exercise.rounding ? { rounding: exercise.rounding } : {}),
            sets
          };
        })
      };
    })
  };
}
