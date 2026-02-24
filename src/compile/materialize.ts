import type {
  ComparisonOp,
  IntensityTarget,
  LoadUnit,
  ProgressionCondition,
  ProgressionRule,
  WeeklyIncrementBy,
  Weekday
} from "../ast/types.js";
import type { SessionCompletion, SetCompletion } from "../runtime/progression.js";
import type { CompiledProgram, CompiledSession } from "./compileProgram.js";

export interface MaterializedSession extends CompiledSession {
  sequence: number;
  date_iso?: string;
  occurrence?: number;
}

export interface MaterializeOptions {
  completions?: SessionCompletion[];
}

type IncrementRule = Extract<ProgressionRule, { type: "increment" | "weekly_increment" }>;

const WEEKDAY_BY_UTC_DAY: readonly Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function parseIsoDate(dateIso: string): Date {
  const date = new Date(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO date: ${dateIso}`);
  }
  return date;
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function diffDays(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((to.getTime() - from.getTime()) / msPerDay);
}

function getWeekdayUtc(date: Date): Weekday {
  return WEEKDAY_BY_UTC_DAY[date.getUTCDay()]!;
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

function isIncrementRule(rule: ProgressionRule | undefined): rule is IncrementRule {
  return rule?.type === "increment" || rule?.type === "weekly_increment";
}

function isLoadBy(by: WeeklyIncrementBy): by is { type: "load"; value: number; unit: LoadUnit } {
  return (
    typeof by === "object" &&
    by !== null &&
    "type" in by &&
    (by as { type?: unknown }).type === "load" &&
    typeof (by as { value?: unknown }).value === "number" &&
    typeof (by as { unit?: unknown }).unit === "string"
  );
}

function cloneSchedule(session: CompiledSession): CompiledSession["schedule"] {
  const schedule = session.schedule;
  if (!schedule) {
    return undefined;
  }

  if (schedule.type === "interval_days") {
    return {
      type: "interval_days",
      every: schedule.every,
      start_offset_days: schedule.start_offset_days,
      end_offset_days: schedule.end_offset_days
    };
  }

  return {
    type: "weekdays",
    days: [...schedule.days],
    start_offset_days: schedule.start_offset_days,
    end_offset_days: schedule.end_offset_days
  };
}

function cloneSession(session: CompiledSession): CompiledSession {
  return {
    id: session.id,
    name: session.name,
    day: session.day,
    slot: session.slot,
    rest_default_seconds: session.rest_default_seconds,
    groups: session.groups,
    constraints: session.constraints,
    modifiers: session.modifiers,
    block_id: session.block_id,
    schedule: cloneSchedule(session),
    exercises: session.exercises.map((exercise) => ({
      exercise: exercise.exercise,
      exercise_id: exercise.exercise_id,
      family: exercise.family,
      tags: exercise.tags,
      modifiers: exercise.modifiers,
      substitutions: exercise.substitutions,
      constraints: exercise.constraints,
      warmup: exercise.warmup,
      group_id: exercise.group_id,
      rest_seconds: exercise.rest_seconds,
      rest_before_seconds: exercise.rest_before_seconds,
      rest_after_seconds: exercise.rest_after_seconds,
      tempo: exercise.tempo,
      pause_seconds: exercise.pause_seconds,
      eccentric_seconds: exercise.eccentric_seconds,
      units: exercise.units,
      rounding: exercise.rounding,
      sets: exercise.sets.map((set) => ({
        index: set.index,
        reps: set.reps ? { ...set.reps } : undefined,
        work_type: set.work_type,
        time_mode: set.time_mode,
        duration_seconds: set.duration_seconds,
        interval_seconds: set.interval_seconds,
        target_total_reps: set.target_total_reps,
        intensity: cloneIntensity(set.intensity),
        role: set.role,
        rest_seconds: set.rest_seconds,
        rest_before_seconds: set.rest_before_seconds,
        rest_after_seconds: set.rest_after_seconds,
        constraints: set.constraints,
        repeat: set.repeat,
        progression: set.progression,
        tempo: set.tempo,
        pause_seconds: set.pause_seconds,
        eccentric_seconds: set.eccentric_seconds,
        note: set.note
      }))
    }))
  };
}

function weekIndexFromDay(day: number): number {
  return Math.floor((day - 1) / 7) + 1;
}

type SetKey = string;

function makeSetKey(sessionId: string, exerciseIndex: number, setIndex: number): SetKey {
  return `${sessionId}::${exerciseIndex}::${setIndex}`;
}

type CompletionKey = string;

function makeCompletionKey(sessionId: string, dateIso: string): CompletionKey {
  return `${sessionId}::${dateIso}`;
}

type SetProgressionState = {
  base: IntensityTarget;
  rule: IncrementRule;
  success_units: number;
};

function compare(op: ComparisonOp, left: number, right: number): boolean {
  if (op === ">=") {
    return left >= right;
  }
  if (op === ">") {
    return left > right;
  }
  if (op === "<=") {
    return left <= right;
  }
  if (op === "<") {
    return left < right;
  }
  if (op === "==") {
    return left === right;
  }
  return left !== right;
}

function applyWeeklyIncrement(base: IntensityTarget, by: WeeklyIncrementBy, times: number): IntensityTarget {
  if (times <= 0) {
    return cloneIntensity(base)!;
  }

  if (base.type === "load_range") {
    if (typeof by === "number") {
      const min = base.min + by * times;
      const max = base.max + by * times;
      return { type: "load_range", min, max, unit: base.unit };
    }

    if (isLoadBy(by)) {
      if (by.unit !== base.unit) {
        throw new Error(`Invalid progression.by unit: expected ${base.unit}, got ${by.unit}.`);
      }
      const min = base.min + by.value * times;
      const max = base.max + by.value * times;
      return { type: "load_range", min, max, unit: base.unit };
    }

    const minBy = by.min ?? 0;
    const maxBy = by.max ?? 0;
    return {
      type: "load_range",
      min: base.min + minBy * times,
      max: base.max + maxBy * times,
      unit: base.unit
    };
  }

  if (base.type === "percent_1rm") {
    if (typeof by === "number") {
      return {
        type: "percent_1rm",
        value: base.value + by * times,
        ...(base.plus_load ? { plus_load: { ...base.plus_load } } : {})
      };
    }

    if (isLoadBy(by)) {
      const current = base.plus_load;
      if (current && current.unit !== by.unit) {
        throw new Error(
          `Invalid progression.by unit: expected ${current.unit} (from intensity.plus_load), got ${by.unit}.`
        );
      }

      const nextValue = (current?.value ?? 0) + by.value * times;
      const keepPlusLoad = current !== undefined || nextValue !== 0;

      return {
        type: "percent_1rm",
        value: base.value,
        ...(keepPlusLoad ? { plus_load: { value: nextValue, unit: by.unit } } : {})
      };
    }

    throw new Error("Invalid progression.by: expected number or load delta for percent_1rm intensity.");
  }

  if (base.type === "rpe") {
    if (typeof by !== "number") {
      throw new Error("Invalid progression.by: expected number for rpe intensity.");
    }
    return { type: "rpe", value: base.value + by * times };
  }

  if (base.type === "rir") {
    if (typeof by !== "number") {
      throw new Error("Invalid progression.by: expected number for rir intensity.");
    }
    return { type: "rir", value: base.value + by * times };
  }

  if (base.type === "load") {
    if (typeof by === "number") {
      return { type: "load", value: base.value + by * times, unit: base.unit };
    }

    if (isLoadBy(by)) {
      if (by.unit !== base.unit) {
        throw new Error(`Invalid progression.by unit: expected ${base.unit}, got ${by.unit}.`);
      }
      return { type: "load", value: base.value + by.value * times, unit: base.unit };
    }

    throw new Error("Invalid progression.by: expected number or load delta for load intensity.");
  }

  return cloneIntensity(base)!;
}

type ResolvedCadence = {
  type: "weeks" | "sessions";
  every: number;
  on_weekdays?: Weekday[];
};

function resolveCadence(rule: IncrementRule): ResolvedCadence {
  const cadence = rule.cadence;
  if (!cadence) {
    return { type: "weeks", every: 1 };
  }

  const every = cadence.every ?? 1;

  if (cadence.type === "weeks") {
    return { type: "weeks", every };
  }

  return { type: "sessions", every, on_weekdays: cadence.on_weekdays };
}

function matchesCadenceWeekday(cadence: ResolvedCadence, occurrence: Omit<MaterializedSession, "sequence">): boolean {
  if (cadence.type !== "sessions") {
    return true;
  }

  const filter = cadence.on_weekdays;
  if (!filter || filter.length === 0) {
    return true;
  }

  const dateIso = occurrence.date_iso;
  if (!dateIso) {
    return false;
  }

  const weekday = getWeekdayUtc(parseIsoDate(dateIso));
  return filter.includes(weekday);
}

function ensureValidIntensity(intensity: IntensityTarget, context: string): void {
  if (intensity.type === "percent_1rm") {
    if (!(intensity.value > 0 && intensity.value <= 150)) {
      throw new Error(`${context}: percent_1rm intensity must be > 0 and <= 150.`);
    }

    const plusLoad = intensity.plus_load;
    if (plusLoad) {
      if (!Number.isFinite(plusLoad.value)) {
        throw new Error(`${context}: percent_1rm plus_load value must be finite.`);
      }
      if (plusLoad.unit !== "kg" && plusLoad.unit !== "lb") {
        throw new Error(`${context}: percent_1rm plus_load unit must be kg or lb.`);
      }
    }
    return;
  }

  if (intensity.type === "rpe") {
    if (!(intensity.value >= 1 && intensity.value <= 10)) {
      throw new Error(`${context}: rpe intensity must be between 1 and 10.`);
    }
    return;
  }

  if (intensity.type === "rir") {
    if (!(intensity.value >= 0 && intensity.value <= 6)) {
      throw new Error(`${context}: rir intensity must be between 0 and 6.`);
    }
    return;
  }

  if (intensity.type === "load") {
    if (!(intensity.value > 0)) {
      throw new Error(`${context}: load intensity must be > 0.`);
    }
    return;
  }

  if (intensity.type === "percent_of_set") {
    if (!(intensity.value > 0)) {
      throw new Error(`${context}: percent_of_set intensity must be > 0.`);
    }
    return;
  }

  if (intensity.type === "load_delta_from_set") {
    if (!Number.isFinite(intensity.value)) {
      throw new Error(`${context}: load_delta_from_set value must be finite.`);
    }
    return;
  }

  if (!(intensity.min > 0)) {
    throw new Error(`${context}: load_range intensity min must be > 0.`);
  }

  if (intensity.max < intensity.min) {
    throw new Error(`${context}: load_range intensity max must be >= min.`);
  }
}

function findSetCompletion(
  completion: SessionCompletion,
  exerciseName: string,
  exerciseId: string | undefined,
  setIndex: number
): SetCompletion | undefined {
  const exercises = completion.exercises;
  if (!exercises) {
    return undefined;
  }

  const exercise = exercises.find(
    (entry) =>
      (exerciseId !== undefined && entry.exercise_id !== undefined && entry.exercise_id === exerciseId) ||
      entry.exercise === exerciseName
  );
  const sets = exercise?.sets;
  if (!sets) {
    return undefined;
  }

  return sets.find((entry) => entry.index === setIndex);
}

function resolveCondition(rule: IncrementRule): ProgressionCondition {
  return rule.when ?? { type: "session_success", equals: true };
}

function getNumericTarget(intensity: IntensityTarget, condition: Extract<ProgressionCondition, { type: "metric_vs_target" }>): number | undefined {
  const targetRef = condition.target ?? (intensity.type === "load_range" ? "max" : "value");

  if (targetRef === "min") {
    return intensity.type === "load_range" ? intensity.min : undefined;
  }

  if (targetRef === "max") {
    return intensity.type === "load_range" ? intensity.max : undefined;
  }

  if (targetRef === "value") {
    return intensity.type === "load_range" || intensity.type === "percent_of_set" || intensity.type === "load_delta_from_set"
      ? undefined
      : intensity.value;
  }

  return undefined;
}

function evaluateCondition(
  condition: ProgressionCondition,
  completion: SessionCompletion,
  exerciseName: string,
  exerciseId: string | undefined,
  setIndex: number,
  targetIntensity: IntensityTarget
): boolean {
  if (condition.type === "session_success") {
    const desired = condition.equals ?? true;
    const actual = completion.success ?? false;
    return actual === desired;
  }

  if (condition.type === "aggregate_metric") {
    return false;
  }

  const target = getNumericTarget(targetIntensity, condition);
  if (target === undefined) {
    return false;
  }

  const setCompletion = findSetCompletion(completion, exerciseName, exerciseId, setIndex);
  if (!setCompletion) {
    return false;
  }

  if (condition.metric === "load") {
    const achieved = setCompletion.load;
    if (!achieved) {
      return false;
    }

    if (targetIntensity.type !== "load" && targetIntensity.type !== "load_range") {
      return false;
    }

    if (achieved.unit !== targetIntensity.unit) {
      return false;
    }

    return compare(condition.op, achieved.value, target);
  }

  if (condition.metric === "rpe") {
    const achieved = setCompletion.rpe;
    if (typeof achieved !== "number") {
      return false;
    }

    return compare(condition.op, achieved, target);
  }

  const achieved = setCompletion.rir;
  if (typeof achieved !== "number") {
    return false;
  }

  return compare(condition.op, achieved, target);
}

function buildCompletionIndex(completions: SessionCompletion[]): Map<CompletionKey, SessionCompletion> {
  const index = new Map<CompletionKey, SessionCompletion>();

  completions.forEach((completion) => {
    if (!completion || typeof completion !== "object") {
      return;
    }

    const sessionId = completion.session_id;
    const dateIso = completion.date_iso;
    if (typeof sessionId !== "string" || sessionId.trim() === "") {
      return;
    }
    if (typeof dateIso !== "string" || dateIso.trim() === "") {
      return;
    }

    index.set(makeCompletionKey(sessionId, dateIso), completion);
  });

  return index;
}

function applyProgression(
  program: CompiledProgram,
  occurrences: Omit<MaterializedSession, "sequence">[],
  completions: SessionCompletion[]
): void {
  const completionIndex = buildCompletionIndex(completions);
  const stateByKey = new Map<SetKey, SetProgressionState>();

  program.sessions.forEach((session) => {
    session.exercises.forEach((exercise, exerciseIndex) => {
      exercise.sets.forEach((set) => {
        const rule = set.progression;
        if (!isIncrementRule(rule)) {
          return;
        }

        if (!set.intensity) {
          throw new Error(
            `Cannot apply progression: ${session.id}/${exercise.exercise} set ${set.index} has progression but no intensity.`
          );
        }

        if (set.intensity.type === "percent_of_set" || set.intensity.type === "load_delta_from_set") {
          return;
        }

        stateByKey.set(makeSetKey(session.id, exerciseIndex, set.index), {
          base: cloneIntensity(set.intensity)!,
          rule,
          success_units: 0
        });
      });
    });
  });

  const occurrencesBySessionId = new Map<string, Omit<MaterializedSession, "sequence">[]>();

  occurrences.forEach((occurrence) => {
    const bucket = occurrencesBySessionId.get(occurrence.id);
    if (bucket) {
      bucket.push(occurrence);
      return;
    }

    occurrencesBySessionId.set(occurrence.id, [occurrence]);
  });

  // Progression is scoped to a session template id. There are no cross-session dependencies.
  for (const [sessionId, sessionOccurrences] of occurrencesBySessionId) {
    sessionOccurrences.sort((a, b) => (a.day ?? 0) - (b.day ?? 0));

    let activeWeekIndex: number | undefined;
    let latestCompletedInWeek:
      | { occurrence: Omit<MaterializedSession, "sequence">; completion: SessionCompletion }
      | undefined;

    function finalizeWeek(): void {
      if (!latestCompletedInWeek || activeWeekIndex === undefined) {
        return;
      }

      const { occurrence, completion } = latestCompletedInWeek;

      occurrence.exercises.forEach((exercise, exerciseIndex) => {
        exercise.sets.forEach((set) => {
          const stateKey = makeSetKey(sessionId, exerciseIndex, set.index);
          const state = stateByKey.get(stateKey);
          if (!state) {
            return;
          }

          const cadence = resolveCadence(state.rule);
          if (cadence.type !== "weeks") {
            return;
          }

          if (!set.intensity) {
            return;
          }

          const condition = resolveCondition(state.rule);
          const ok = evaluateCondition(
            condition,
            completion,
            exercise.exercise,
            exercise.exercise_id,
            set.index,
            set.intensity
          );
          if (ok) {
            state.success_units += 1;
          }
        });
      });
    }

    sessionOccurrences.forEach((occurrence) => {
      const day = occurrence.day;
      if (day === undefined) {
        throw new Error("Materialized occurrences must include day when calendar is present.");
      }

      const weekIndex = weekIndexFromDay(day);

      if (activeWeekIndex === undefined) {
        activeWeekIndex = weekIndex;
      } else if (weekIndex !== activeWeekIndex) {
        finalizeWeek();
        activeWeekIndex = weekIndex;
        latestCompletedInWeek = undefined;
      }

      // 1) Apply current offsets to this occurrence.
      occurrence.exercises.forEach((exercise, exerciseIndex) => {
        exercise.sets.forEach((set) => {
          const stateKey = makeSetKey(sessionId, exerciseIndex, set.index);
          const state = stateByKey.get(stateKey);
          if (!state) {
            return;
          }

          const cadence = resolveCadence(state.rule);
          const every = cadence.every > 0 ? cadence.every : 1;
          const applied = Math.floor(state.success_units / every);

          const next = applyWeeklyIncrement(state.base, state.rule.by, applied);
          ensureValidIntensity(
            next,
            `Invalid intensity after progression (${sessionId}/${exercise.exercise} set ${set.index})`
          );
          set.intensity = next;
        });
      });

      const dateIso = occurrence.date_iso;
      const completion = dateIso ? completionIndex.get(makeCompletionKey(sessionId, dateIso)) : undefined;

      if (!completion) {
        return;
      }

      // 2) Track latest completion in this week for weekly cadence evaluation.
      latestCompletedInWeek = { occurrence, completion };

      // 3) Evaluate session cadence progression immediately after the session.
      occurrence.exercises.forEach((exercise, exerciseIndex) => {
        exercise.sets.forEach((set) => {
          const stateKey = makeSetKey(sessionId, exerciseIndex, set.index);
          const state = stateByKey.get(stateKey);
          if (!state) {
            return;
          }

          const cadence = resolveCadence(state.rule);
          if (cadence.type !== "sessions") {
            return;
          }

          if (!matchesCadenceWeekday(cadence, occurrence)) {
            return;
          }

          if (!set.intensity) {
            return;
          }

          const condition = resolveCondition(state.rule);
          const ok = evaluateCondition(
            condition,
            completion,
            exercise.exercise,
            exercise.exercise_id,
            set.index,
            set.intensity
          );
          if (ok) {
            state.success_units += 1;
          }
        });
      });
    });

    finalizeWeek();
  }
}

function programUsesProgression(program: CompiledProgram): boolean {
  return program.sessions.some((session) =>
    session.exercises.some((exercise) =>
      exercise.sets.some(
        (set) => set.progression?.type === "increment" || set.progression?.type === "weekly_increment"
      )
    )
  );
}

export function materialize(program: CompiledProgram, options: MaterializeOptions = {}): MaterializedSession[] {
  const calendar = program.calendar;
  const usesProgression = programUsesProgression(program);

  if (!calendar?.start_date) {
    if (usesProgression) {
      throw new Error("calendar.start_date is required to materialize progression rules.");
    }

    return program.sessions.map((session, index) => ({
      ...cloneSession(session),
      sequence: index + 1
    }));
  }

  const startDate = parseIsoDate(calendar.start_date);
  const endDate = calendar.end_date ? parseIsoDate(calendar.end_date) : undefined;

  const occurrences: Omit<MaterializedSession, "sequence">[] = [];

  program.sessions.forEach((session) => {
    if (session.day !== undefined) {
      const date = addDays(startDate, session.day - 1);
      occurrences.push({
        ...cloneSession(session),
        date_iso: formatIsoDate(date),
        occurrence: 1
      });
      return;
    }

    if (!session.schedule) {
      return;
    }

    const offset = session.schedule.start_offset_days ?? 0;
    const scheduleEndOffset = session.schedule.end_offset_days;

    let effectiveEndDate = endDate;
    if (scheduleEndOffset !== undefined) {
      const bounded = addDays(startDate, scheduleEndOffset);
      if (!effectiveEndDate || bounded.getTime() < effectiveEndDate.getTime()) {
        effectiveEndDate = bounded;
      }
    }

    if (!effectiveEndDate) {
      throw new Error(
        "calendar.end_date is required to materialize repeating session schedules unless each schedule sets end_offset_days."
      );
    }

    if (session.schedule.type === "interval_days") {
      let date = addDays(startDate, offset);
      let occurrence = 1;

      while (date.getTime() <= effectiveEndDate.getTime()) {
        occurrences.push({
          ...cloneSession(session),
          day: diffDays(startDate, date) + 1,
          date_iso: formatIsoDate(date),
          occurrence
        });

        date = addDays(date, session.schedule.every);
        occurrence += 1;
      }

      return;
    }

    const allowed = new Set<Weekday>(session.schedule.days);
    let date = addDays(startDate, offset);
    let occurrence = 1;

    while (date.getTime() <= effectiveEndDate.getTime()) {
      if (allowed.has(getWeekdayUtc(date))) {
        occurrences.push({
          ...cloneSession(session),
          day: diffDays(startDate, date) + 1,
          date_iso: formatIsoDate(date),
          occurrence
        });

        occurrence += 1;
      }

      date = addDays(date, 1);
    }
  });

  const completions = options.completions ?? [];
  if (usesProgression && completions.length > 0) {
    applyProgression(program, occurrences, completions);
  }

  const slotOrder = (slot: MaterializedSession["slot"] | undefined): number => {
    if (slot === undefined) {
      return 0;
    }
    if (typeof slot === "number") {
      return slot;
    }
    if (slot === "AM") {
      return 10;
    }
    if (slot === "PM") {
      return 20;
    }
    if (slot === "EVE") {
      return 30;
    }
    return 100;
  };

  occurrences.sort((a, b) => {
    const dateA = a.date_iso ?? "";
    const dateB = b.date_iso ?? "";

    if (dateA !== dateB) {
      return dateA.localeCompare(dateB);
    }

    const slotA = slotOrder(a.slot);
    const slotB = slotOrder(b.slot);
    if (slotA !== slotB) {
      return slotA - slotB;
    }

    return a.id.localeCompare(b.id);
  });

  return occurrences.map((session, index) => ({
    ...session,
    sequence: index + 1
  }));
}
