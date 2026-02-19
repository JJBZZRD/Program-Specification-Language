import type {
  IntensityTarget,
  ProgramAst,
  RepRange,
  RepTarget,
  SessionSchedule
} from "../ast/types.js";
import { hashSource } from "../util/hash.js";

export interface CompiledSet {
  index: number;
  reps: RepRange;
  intensity?: IntensityTarget;
  note?: string;
}

export interface CompiledExercise {
  exercise: string;
  rest_seconds?: number;
  sets: CompiledSet[];
}

export interface CompiledSession {
  id: string;
  name: string;
  day?: number;
  schedule?: SessionSchedule;
  exercises: CompiledExercise[];
}

export interface CompiledProgram {
  language_version: ProgramAst["language_version"];
  source_hash: string;
  metadata: ProgramAst["metadata"];
  calendar?: ProgramAst["calendar"];
  sessions: CompiledSession[];
}

function normalizeReps(reps: RepTarget): RepRange {
  if (typeof reps === "number") {
    return { min: reps, max: reps };
  }

  return reps;
}

export function compileProgram(ast: ProgramAst): CompiledProgram {
  return {
    language_version: ast.language_version,
    source_hash: hashSource(ast),
    metadata: ast.metadata,
    calendar: ast.calendar,
    sessions: ast.sessions.map((session) => ({
      id: session.id,
      name: session.name,
      day: session.day,
      schedule: session.schedule,
      exercises: session.exercises.map((exercise) => {
        const sets: CompiledSet[] = [];

        exercise.sets.forEach((set) => {
          for (let index = 0; index < set.count; index += 1) {
            sets.push({
              index: sets.length + 1,
              reps: normalizeReps(set.reps),
              intensity: set.intensity,
              note: set.note
            });
          }
        });

        return {
          exercise: exercise.exercise,
          rest_seconds: exercise.rest_seconds,
          sets
        };
      })
    }))
  };
}
