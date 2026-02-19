import type {
  ExercisePrescription,
  IntensityTarget,
  LanguageVersion,
  ProgramAst,
  ProgramCalendar,
  ProgramMetadata,
  RepTarget,
  Session,
  LoadUnit,
  SessionSchedule,
  SetPrescription,
  Weekday
} from "../ast/types.js";
import { CURRENT_LANGUAGE_VERSION } from "../ast/version.js";
import { parseShorthand } from "../parse/parseShorthand.js";
import type { Diagnostic, ValidationResult } from "./diagnostics.js";

type UnknownRecord = Record<string, unknown>;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS: readonly Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const WEEKDAY_SET = new Set<string>(WEEKDAYS);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addError(diagnostics: Diagnostic[], path: string, message: string): void {
  diagnostics.push({ path, message, severity: "error" });
}

function hasNewErrors(diagnostics: Diagnostic[], startIndex: number): boolean {
  for (let index = startIndex; index < diagnostics.length; index += 1) {
    if (diagnostics[index]?.severity === "error") {
      return true;
    }
  }
  return false;
}

function toUtcDate(dateIso: string): Date {
  return new Date(`${dateIso}T00:00:00Z`);
}

function parseIsoDate(value: unknown, path: string, diagnostics: Diagnostic[]): string | undefined {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) {
    addError(diagnostics, path, "Date must be an ISO string YYYY-MM-DD.");
    return undefined;
  }

  const date = toUtcDate(value);
  if (Number.isNaN(date.getTime())) {
    addError(diagnostics, path, "Invalid date.");
    return undefined;
  }

  return value;
}

function parseCalendar(
  calendar: unknown,
  path: string,
  diagnostics: Diagnostic[]
): ProgramCalendar | undefined {
  if (calendar === undefined) {
    return undefined;
  }

  const startIndex = diagnostics.length;

  if (!isRecord(calendar)) {
    addError(diagnostics, path, "Calendar must be an object.");
    return undefined;
  }

  const startDate = parseIsoDate(calendar.start_date, `${path}.start_date`, diagnostics);

  const endDateRaw = calendar.end_date;
  const endDate = endDateRaw === undefined ? undefined : parseIsoDate(endDateRaw, `${path}.end_date`, diagnostics);

  const timezone = calendar.timezone;
  if (timezone !== undefined) {
    if (typeof timezone !== "string" || timezone.trim() === "") {
      addError(diagnostics, `${path}.timezone`, "timezone must be a non-empty string.");
    }
  }

  if (startDate && endDate) {
    if (toUtcDate(endDate).getTime() < toUtcDate(startDate).getTime()) {
      addError(diagnostics, `${path}.end_date`, "end_date must be on or after start_date.");
    }
  }

  if (hasNewErrors(diagnostics, startIndex)) {
    return undefined;
  }

  return {
    start_date: startDate as string,
    end_date: endDate as string | undefined,
    timezone: timezone as string | undefined
  };
}

function parseRepTarget(reps: unknown, path: string, diagnostics: Diagnostic[]): RepTarget | undefined {
  if (typeof reps === "number") {
    if (!Number.isInteger(reps) || reps < 1) {
      addError(diagnostics, path, "Reps must be an integer >= 1.");
      return undefined;
    }
    return reps;
  }

  if (!isRecord(reps)) {
    addError(diagnostics, path, "Reps must be an integer or an object range {min,max}.");
    return undefined;
  }

  const min = reps.min;
  const max = reps.max;

  if (typeof min !== "number" || !Number.isInteger(min) || min < 1) {
    addError(diagnostics, `${path}.min`, "Rep range min must be an integer >= 1.");
    return undefined;
  }

  if (typeof max !== "number" || !Number.isInteger(max) || max < min) {
    addError(diagnostics, `${path}.max`, "Rep range max must be an integer >= min.");
    return undefined;
  }

  return { min, max };
}

function parseIntensity(
  intensity: unknown,
  path: string,
  diagnostics: Diagnostic[]
): IntensityTarget | undefined {
  if (intensity === undefined) {
    return undefined;
  }

  if (!isRecord(intensity)) {
    addError(diagnostics, path, "Intensity must be an object.");
    return undefined;
  }

  const type = intensity.type;
  const value = intensity.value;

  if (type !== "percent_1rm" && type !== "rpe" && type !== "rir" && type !== "load") {
    addError(diagnostics, `${path}.type`, "Intensity type must be percent_1rm, rpe, rir, or load.");
    return undefined;
  }

  if (typeof value !== "number") {
    addError(diagnostics, `${path}.value`, "Intensity value must be a number.");
    return undefined;
  }

  if (type === "percent_1rm") {
    if (!(value > 0 && value <= 150)) {
      addError(diagnostics, `${path}.value`, "percent_1rm intensity must be > 0 and <= 150.");
      return undefined;
    }

    return { type, value };
  }

  if (type === "rpe") {
    if (!(value >= 1 && value <= 10)) {
      addError(diagnostics, `${path}.value`, "rpe intensity must be between 1 and 10.");
      return undefined;
    }

    return { type, value };
  }

  if (type === "rir") {
    if (!(value >= 0 && value <= 6)) {
      addError(diagnostics, `${path}.value`, "rir intensity must be between 0 and 6.");
      return undefined;
    }

    return { type, value };
  }

  if (!(value > 0)) {
    addError(diagnostics, `${path}.value`, "load intensity must be > 0.");
    return undefined;
  }

  const unitRaw = intensity.unit;
  if (typeof unitRaw !== "string") {
    addError(diagnostics, `${path}.unit`, "load intensity requires unit kg or lb.");
    return undefined;
  }

  const unit = unitRaw.toLowerCase();
  if (unit !== "kg" && unit !== "lb") {
    addError(diagnostics, `${path}.unit`, "load intensity unit must be kg or lb.");
    return undefined;
  }

  return { type: "load", value, unit: unit as LoadUnit };
}
function parseSet(
  set: unknown,
  path: string,
  diagnostics: Diagnostic[]
): SetPrescription | undefined {
  const startIndex = diagnostics.length;

  if (typeof set === "string") {
    try {
      const shorthand = parseShorthand(set);
      const intensity = parseIntensity(shorthand.intensity, `${path}.intensity`, diagnostics);

      if (shorthand.intensity !== undefined && intensity === undefined) {
        return undefined;
      }

      return {
        ...shorthand,
        intensity
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid shorthand expression.";
      addError(diagnostics, path, message);
      return undefined;
    }
  }

  if (!isRecord(set)) {
    addError(diagnostics, path, "Set must be an object or shorthand string.");
    return undefined;
  }

  const count = set.count;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1) {
    addError(diagnostics, `${path}.count`, "Set count must be an integer >= 1.");
  }

  const reps = parseRepTarget(set.reps, `${path}.reps`, diagnostics);
  const intensity = parseIntensity(set.intensity, `${path}.intensity`, diagnostics);

  const note = set.note;
  if (note !== undefined && typeof note !== "string") {
    addError(diagnostics, `${path}.note`, "Set note must be a string.");
  }

  if (hasNewErrors(diagnostics, startIndex)) {
    return undefined;
  }

  return {
    count: count as number,
    reps: reps as RepTarget,
    intensity,
    note: note as string | undefined
  };
}

function parseExercise(
  exercise: unknown,
  path: string,
  diagnostics: Diagnostic[]
): ExercisePrescription | undefined {
  const startIndex = diagnostics.length;

  if (!isRecord(exercise)) {
    addError(diagnostics, path, "Exercise must be an object.");
    return undefined;
  }

  const name = exercise.exercise;
  if (typeof name !== "string" || name.trim() === "") {
    addError(diagnostics, `${path}.exercise`, "Exercise name is required.");
  }

  const restSeconds = exercise.rest_seconds;
  if (restSeconds !== undefined) {
    if (typeof restSeconds !== "number" || !Number.isInteger(restSeconds) || restSeconds < 0) {
      addError(diagnostics, `${path}.rest_seconds`, "rest_seconds must be an integer >= 0.");
    }
  }

  const setsRaw = exercise.sets;
  const setsArray =
    typeof setsRaw === "string" ? [setsRaw] : Array.isArray(setsRaw) ? setsRaw : undefined;

  if (!setsArray || setsArray.length === 0) {
    addError(diagnostics, `${path}.sets`, "Exercise must include sets.");
    return undefined;
  }

  const sets: SetPrescription[] = [];
  setsArray.forEach((setValue, index) => {
    const parsed = parseSet(setValue, `${path}.sets[${index}]`, diagnostics);
    if (parsed) {
      sets.push(parsed);
    }
  });

  if (hasNewErrors(diagnostics, startIndex)) {
    return undefined;
  }

  return {
    exercise: name as string,
    sets,
    rest_seconds: restSeconds as number | undefined
  };
}

function parseSchedule(
  schedule: unknown,
  path: string,
  diagnostics: Diagnostic[]
): SessionSchedule | undefined {
  const startIndex = diagnostics.length;

  if (!isRecord(schedule)) {
    addError(diagnostics, path, "schedule must be an object.");
    return undefined;
  }

  const type = schedule.type;
  if (type !== "interval_days" && type !== "weekdays") {
    addError(diagnostics, `${path}.type`, "schedule.type must be interval_days or weekdays.");
    return undefined;
  }

  const startOffset = schedule.start_offset_days;
  if (startOffset !== undefined) {
    if (typeof startOffset !== "number" || !Number.isInteger(startOffset) || startOffset < 0) {
      addError(diagnostics, `${path}.start_offset_days`, "start_offset_days must be an integer >= 0.");
    }
  }

  if (type === "interval_days") {
    const every = schedule.every;
    if (typeof every !== "number" || !Number.isInteger(every) || every < 1) {
      addError(diagnostics, `${path}.every`, "every must be an integer >= 1.");
    }

    if (hasNewErrors(diagnostics, startIndex)) {
      return undefined;
    }

    return {
      type,
      every: every as number,
      start_offset_days: startOffset as number | undefined
    };
  }

  const daysRaw = schedule.days;
  if (!Array.isArray(daysRaw) || daysRaw.length === 0) {
    addError(diagnostics, `${path}.days`, "days must be a non-empty array.");
    return undefined;
  }

  const days: Weekday[] = [];
  daysRaw.forEach((dayValue, index) => {
    const dayPath = `${path}.days[${index}]`;
    if (typeof dayValue !== "string" || !WEEKDAY_SET.has(dayValue)) {
      addError(diagnostics, dayPath, `Invalid weekday. Expected one of: ${WEEKDAYS.join(", ")}.`);
      return;
    }

    days.push(dayValue as Weekday);
  });

  if (hasNewErrors(diagnostics, startIndex)) {
    return undefined;
  }

  return {
    type,
    days,
    start_offset_days: startOffset as number | undefined
  };
}

function parseSession(
  session: unknown,
  path: string,
  seenIds: Set<string>,
  diagnostics: Diagnostic[]
): Session | undefined {
  const startIndex = diagnostics.length;

  if (!isRecord(session)) {
    addError(diagnostics, path, "Session must be an object.");
    return undefined;
  }

  const id = session.id;
  if (typeof id !== "string" || id.trim() === "") {
    addError(diagnostics, `${path}.id`, "Session id is required.");
  } else if (seenIds.has(id)) {
    addError(diagnostics, `${path}.id`, `Duplicate session id: ${id}`);
  } else {
    seenIds.add(id);
  }

  const name = session.name;
  if (typeof name !== "string" || name.trim() === "") {
    addError(diagnostics, `${path}.name`, "Session name is required.");
  }

  const hasDay = session.day !== undefined;
  const hasSchedule = session.schedule !== undefined;

  if (hasDay && hasSchedule) {
    addError(diagnostics, `${path}.day`, "Specify either day or schedule, not both.");
    addError(diagnostics, `${path}.schedule`, "Specify either day or schedule, not both.");
  }

  if (!hasDay && !hasSchedule) {
    addError(diagnostics, path, "Session must specify either day or schedule.");
  }

  const day = session.day;
  if (hasDay) {
    if (typeof day !== "number" || !Number.isInteger(day) || day < 1) {
      addError(diagnostics, `${path}.day`, "Session day must be an integer >= 1.");
    }
  }

  const schedule = hasSchedule ? parseSchedule(session.schedule, `${path}.schedule`, diagnostics) : undefined;

  if (!Array.isArray(session.exercises) || session.exercises.length === 0) {
    addError(diagnostics, `${path}.exercises`, "Session must include exercises.");
    return undefined;
  }

  const exercises: ExercisePrescription[] = [];
  session.exercises.forEach((exerciseValue, index) => {
    const parsed = parseExercise(exerciseValue, `${path}.exercises[${index}]`, diagnostics);
    if (parsed) {
      exercises.push(parsed);
    }
  });

  if (hasNewErrors(diagnostics, startIndex)) {
    return undefined;
  }

  return {
    id: id as string,
    name: name as string,
    day: day as number | undefined,
    schedule,
    exercises
  };
}

function parseMetadata(
  metadata: unknown,
  path: string,
  diagnostics: Diagnostic[]
): ProgramMetadata | undefined {
  const startIndex = diagnostics.length;

  if (!isRecord(metadata)) {
    addError(diagnostics, path, "Metadata is required.");
    return undefined;
  }

  const id = metadata.id;
  if (typeof id !== "string" || id.trim() === "") {
    addError(diagnostics, `${path}.id`, "Metadata id is required.");
  }

  const name = metadata.name;
  if (typeof name !== "string" || name.trim() === "") {
    addError(diagnostics, `${path}.name`, "Metadata name is required.");
  }

  const description = metadata.description;
  if (description !== undefined && typeof description !== "string") {
    addError(diagnostics, `${path}.description`, "Metadata description must be a string.");
  }

  const author = metadata.author;
  if (author !== undefined && typeof author !== "string") {
    addError(diagnostics, `${path}.author`, "Metadata author must be a string.");
  }

  if (hasNewErrors(diagnostics, startIndex)) {
    return undefined;
  }

  return {
    id: id as string,
    name: name as string,
    description: description as string | undefined,
    author: author as string | undefined
  };
}

export function validateAst(ast: unknown): ValidationResult<ProgramAst> {
  const diagnostics: Diagnostic[] = [];

  if (!isRecord(ast)) {
    addError(diagnostics, "$", "Program must be an object.");
    return { valid: false, diagnostics };
  }

  const startIndex = diagnostics.length;

  const languageVersion = ast.language_version;
  const validLanguage =
    languageVersion === CURRENT_LANGUAGE_VERSION ? (languageVersion as LanguageVersion) : undefined;

  if (!validLanguage) {
    addError(
      diagnostics,
      "$.language_version",
      `Unsupported language version. Expected ${CURRENT_LANGUAGE_VERSION}.`
    );
  }

  const metadata = parseMetadata(ast.metadata, "$.metadata", diagnostics);
  const calendar = parseCalendar(ast.calendar, "$.calendar", diagnostics);

  if (!Array.isArray(ast.sessions) || ast.sessions.length === 0) {
    addError(diagnostics, "$.sessions", "At least one session is required.");
    return { valid: false, diagnostics };
  }

  const seenSessionIds = new Set<string>();
  const sessions: Session[] = [];

  ast.sessions.forEach((sessionValue, index) => {
    const parsed = parseSession(sessionValue, `$.sessions[${index}]`, seenSessionIds, diagnostics);
    if (parsed) {
      sessions.push(parsed);
    }
  });

  const usesSchedule = sessions.some((session) => session.schedule !== undefined);
  if (usesSchedule) {
    if (!calendar) {
      addError(diagnostics, "$.calendar", "calendar is required when using session schedules.");
    } else if (!calendar.end_date) {
      addError(
        diagnostics,
        "$.calendar.end_date",
        "calendar.end_date is required when using repeating session schedules."
      );
    }
  }

  const valid = !hasNewErrors(diagnostics, startIndex);
  if (!valid || !validLanguage || !metadata) {
    return { valid: false, diagnostics };
  }

  return {
    valid: true,
    diagnostics,
    value: {
      language_version: validLanguage,
      metadata,
      calendar,
      sessions
    }
  };
}

