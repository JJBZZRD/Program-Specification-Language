import { readFile } from "node:fs/promises";
import type { SessionSchedule } from "../../../src/ast/types.js";
import { compileProgram, parseDocument, validateAst } from "../../../src/index.js";

function formatSchedule(schedule: SessionSchedule): string {
  if (schedule.type === "interval_days") {
    const offset = schedule.start_offset_days ?? 0;
    const end = schedule.end_offset_days !== undefined ? `, end_offset ${schedule.end_offset_days}` : "";
    return `every ${schedule.every} day(s) (offset ${offset}${end})`;
  }

  const offset = schedule.start_offset_days ?? 0;
  const end = schedule.end_offset_days !== undefined ? `, end_offset ${schedule.end_offset_days}` : "";
  return `on ${schedule.days.join(", ")} (offset ${offset}${end})`;
}

export async function runPrintCommand(args: string[]): Promise<number> {
  const [filePath] = args;

  if (!filePath) {
    console.error("Usage: psl print <file>");
    return 1;
  }

  const source = await readFile(filePath, "utf8");

  let ast: unknown;
  try {
    ast = parseDocument(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[error] $: Invalid YAML: ${message}`);
    return 1;
  }

  const validation = validateAst(ast);

  if (!validation.valid) {
    validation.diagnostics.forEach((diagnostic) => {
      console.error(`[${diagnostic.severity}] ${diagnostic.path}: ${diagnostic.message}`);
    });
    return 1;
  }

  if (!validation.value) {
    console.error("[error] $: Validation succeeded but no program value was produced.");
    return 1;
  }

  const compiled = compileProgram(validation.value);

  compiled.sessions.forEach((session) => {
    const header =
      session.day !== undefined
        ? `Day ${session.day}`
        : session.schedule
          ? `Schedule ${formatSchedule(session.schedule)}`
          : "Session";

    console.log(`${header}: ${session.name}`);

    session.exercises.forEach((exercise) => {
      console.log(`  - ${exercise.exercise}`);
      exercise.sets.forEach((set) => {
        const repText =
          set.reps.min === set.reps.max ? `${set.reps.min}` : `${set.reps.min}-${set.reps.max}`;
        let intensityText = "";
        const intensity = set.intensity;
        if (intensity) {
          if (intensity.type === "load") {
            intensityText = ` @ ${intensity.value}${intensity.unit}`;
          } else if (intensity.type === "load_range") {
            intensityText = ` @ [${intensity.min},${intensity.max}]${intensity.unit}`;
          } else if (intensity.type === "percent_1rm") {
            const plus = intensity.plus_load;
            const plusText = plus
              ? ` ${plus.value >= 0 ? "+" : "-"} ${Math.abs(plus.value)}${plus.unit}`
              : "";
            intensityText = ` @ ${intensity.value}%${plusText}`;
          } else if (intensity.type === "rpe") {
            intensityText = ` @ RPE${intensity.value}`;
          } else if (intensity.type === "rir") {
            intensityText = ` @ RIR${intensity.value}`;
          }
        }
        console.log(`    set ${set.index}: ${repText}${intensityText}`);
      });
    });
  });

  return 0;
}
