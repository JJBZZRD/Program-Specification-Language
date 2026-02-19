import type {
  ComparisonOp,
  IntensityTarget,
  ProgressionCondition,
  ProgressionRule,
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
    return { type: "percent_1rm", value: intensity.value };
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

  return { type: "load_range", min: intensity.min, max: intensity.max, unit: intensity.unit };
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
      start_offset_days: schedule.start_offset_days
    };
  }

  return {
    type: "weekdays",
    days: [...schedule.days],
    start_offset_days: schedule.start_offset_days
  };
}

function cloneSession(session: CompiledSession): CompiledSession {
  return {
    id: session.id,
    name: session.name,
    day: session.day,
    schedule: cloneSchedule(session),
    exercises: session.exercises.map((exercise) => ({
      exercise: exercise.exercise,
      rest_seconds: exercise.rest_seconds,
      sets: exercise.sets.map((set) => ({
        index: set.index,
        reps: { ...set.reps },
        intensity: cloneIntensity(set.intensity),
        progression: set.progression,
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
  rule: ProgressionRule;
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

function applyWeeklyIncrement(base: IntensityTarget, by: ProgressionRule["by"], times: number): IntensityTarget {
  if (times <= 0) {
    return cloneIntensity(base)!;
  }

  if (base.type === "load_range") {
    if (typeof by === "number") {
      const min = base.min + by * times;
      const max = base.max + by * times;
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

  if (typeof by !== "number") {
    throw new Error("Invalid progression.by: expected number for non-load_range intensity.");
  }

  if (base.type === "percent_1rm") {
    return { type: "percent_1rm", value: base.value + by * times };
  }

  if (base.type === "rpe") {
    return { type: "rpe", value: base.value + by * times };
  }

  if (base.type === "rir") {
    return { type: "rir", value: base.value + by * times };
  }

  return { type: "load", value: base.value + by * times, unit: base.unit };
}

type ResolvedCadence = {
  type: "weeks" | "sessions";
  every: number;
  on_weekdays?: Weekday[];
};

function resolveCadence(rule: ProgressionRule): ResolvedCadence {
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
  setIndex: number
): SetCompletion | undefined {
  const exercises = completion.exercises;
  if (!exercises) {
    return undefined;
  }

  const exercise = exercises.find((entry) => entry.exercise === exerciseName);
  const sets = exercise?.sets;
  if (!sets) {
    return undefined;
  }

  return sets.find((entry) => entry.index === setIndex);
}

function resolveCondition(rule: ProgressionRule): ProgressionCondition {
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
    return intensity.type === "load_range" ? undefined : intensity.value;
  }

  return undefined;
}

function evaluateCondition(
  condition: ProgressionCondition,
  completion: SessionCompletion,
  exerciseName: string,
  setIndex: number,
  targetIntensity: IntensityTarget
): boolean {
  if (condition.type === "session_success") {
    const desired = condition.equals ?? true;
    const actual = completion.success ?? false;
    return actual === desired;
  }

  const target = getNumericTarget(targetIntensity, condition);
  if (target === undefined) {
    return false;
  }

  const setCompletion = findSetCompletion(completion, exerciseName, setIndex);
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
        if (!rule) {
          return;
        }

        if (!set.intensity) {
          throw new Error(
            `Cannot apply progression: ${session.id}/${exercise.exercise} set ${set.index} has progression but no intensity.`
          );
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
          const ok = evaluateCondition(condition, completion, exercise.exercise, set.index, set.intensity);
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
          const ok = evaluateCondition(condition, completion, exercise.exercise, set.index, set.intensity);
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
    session.exercises.some((exercise) => exercise.sets.some((set) => set.progression !== undefined))
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

    if (!endDate) {
      throw new Error("calendar.end_date is required to materialize repeating session schedules.");
    }

    const offset = session.schedule.start_offset_days ?? 0;

    if (session.schedule.type === "interval_days") {
      let date = addDays(startDate, offset);
      let occurrence = 1;

      while (date.getTime() <= endDate.getTime()) {
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

    while (date.getTime() <= endDate.getTime()) {
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

  occurrences.sort((a, b) => {
    const dateA = a.date_iso ?? "";
    const dateB = b.date_iso ?? "";

    if (dateA !== dateB) {
      return dateA.localeCompare(dateB);
    }

    return a.id.localeCompare(b.id);
  });

  return occurrences.map((session, index) => ({
    ...session,
    sequence: index + 1
  }));
}
