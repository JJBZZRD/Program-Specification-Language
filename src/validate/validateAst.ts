import type {
  ExercisePrescription,
  IntensityTarget,
  LanguageVersion,
  ProgramAst,
  ProgramMetadata,
  RepTarget,
  Session,
  SetPrescription
} from "../ast/types.js";
import { CURRENT_LANGUAGE_VERSION } from "../ast/version.js";
import { parseShorthand } from "../parse/parseShorthand.js";
import type { Diagnostic, ValidationResult } from "./diagnostics.js";

type UnknownRecord = Record<string, unknown>;

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

  if (type !== "percent_1rm" && type !== "rpe" && type !== "rir") {
    addError(diagnostics, `${path}.type`, "Intensity type must be percent_1rm, rpe, or rir.");
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
  }

  if (type === "rpe") {
    if (!(value >= 1 && value <= 10)) {
      addError(diagnostics, `${path}.value`, "rpe intensity must be between 1 and 10.");
      return undefined;
    }
  }

  if (type === "rir") {
    if (!(value >= 0 && value <= 6)) {
      addError(diagnostics, `${path}.value`, "rir intensity must be between 0 and 6.");
      return undefined;
    }
  }

  return { type, value };
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

  const day = session.day;
  if (typeof day !== "number" || !Number.isInteger(day) || day < 1) {
    addError(diagnostics, `${path}.day`, "Session day must be an integer >= 1.");
  }

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
    day: day as number,
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
      sessions
    }
  };
}
