import { readFile, writeFile } from "node:fs/promises";
import type { Weekday } from "../../../src/ast/types.js";
import type { CompiledProgram } from "../../../src/compile/compileProgram.js";
import type { MaterializedSession } from "../../../src/compile/materialize.js";
import { compileProgram, materialize, parseDocument, validateAst } from "../../../src/index.js";
import type { SessionCompletion } from "../../../src/runtime/progression.js";
import { encodeCsv } from "../util/csv.js";
import { writeXlsx } from "../util/xlsx.js";

type ExportFormat = "csv" | "xlsx";
type ExportTableName = "sets" | "calendar";
type ExportLayout = "data" | "client";

export type ExportTable = {
  name: string;
  columns: string[];
  rows: Array<Array<string | number | boolean | null | undefined>>;
};

const WEEKDAY_BY_UTC_DAY: readonly Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

function readFlagInt(args: string[], flag: string): number | undefined {
  const raw = readFlagValue(args, flag);
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    return undefined;
  }
  return value;
}

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

function getWeekdayFromIso(dateIso: string): Weekday {
  return getWeekdayUtc(parseIsoDate(dateIso));
}

function formatReps(reps: { min: number; max: number } | undefined): string {
  if (!reps) {
    return "";
  }
  return reps.min === reps.max ? String(reps.min) : `${reps.min}-${reps.max}`;
}

function formatIntensity(intensity: MaterializedSession["exercises"][number]["sets"][number]["intensity"]): string {
  if (!intensity) {
    return "";
  }

  if (intensity.type === "load") {
    return `${intensity.value}${intensity.unit}`;
  }

  if (intensity.type === "load_range") {
    return `[${intensity.min},${intensity.max}]${intensity.unit}`;
  }

  if (intensity.type === "percent_1rm") {
    if (!intensity.plus_load) {
      return `${intensity.value}%`;
    }

    const sign = intensity.plus_load.value >= 0 ? "+" : "-";
    return `${intensity.value}%${sign}${Math.abs(intensity.plus_load.value)}${intensity.plus_load.unit}`;
  }

  if (intensity.type === "rpe") {
    return `RPE${intensity.value}`;
  }

  if (intensity.type === "rir") {
    return `RIR${intensity.value}`;
  }

  if (intensity.type === "percent_of_set") {
    return `${intensity.value}%of(${intensity.role})`;
  }

  return `${intensity.value >= 0 ? "+" : ""}${intensity.value}${intensity.unit}from(${intensity.role})`;
}

function formatRestSeconds(restSeconds: number | undefined): string {
  if (restSeconds === undefined) {
    return "";
  }

  if (!Number.isFinite(restSeconds) || restSeconds < 0) {
    return String(restSeconds);
  }

  if (restSeconds === 0) {
    return "0s";
  }

  if (restSeconds % 60 === 0) {
    return `${restSeconds / 60}m`;
  }

  if (restSeconds > 60) {
    const minutes = Math.floor(restSeconds / 60);
    const seconds = restSeconds % 60;
    return `${minutes}m${seconds}s`;
  }

  return `${restSeconds}s`;
}

function computeEndDate(program: CompiledProgram, sessions: MaterializedSession[], startDate: Date): Date | undefined {
  const calendarEndIso = program.calendar?.end_date;
  if (calendarEndIso) {
    return parseIsoDate(calendarEndIso);
  }

  let maxDay = 0;

  program.sessions.forEach((session) => {
    if (typeof session.day === "number") {
      maxDay = Math.max(maxDay, session.day);
    }
    const endOffset = session.schedule?.end_offset_days;
    if (typeof endOffset === "number") {
      maxDay = Math.max(maxDay, endOffset + 1);
    }
  });

  sessions.forEach((session) => {
    if (typeof session.day === "number") {
      maxDay = Math.max(maxDay, session.day);
    }
  });

  if (maxDay <= 0) {
    return undefined;
  }

  return addDays(startDate, maxDay - 1);
}

function getExportDateRange(program: CompiledProgram, sessions: MaterializedSession[]): { startDate: Date; endDate: Date } {
  const calendar = program.calendar;
  if (!calendar?.start_date) {
    throw new Error("calendar.start_date is required to export a dated program.");
  }

  const startDate = parseIsoDate(calendar.start_date);
  const endDate = computeEndDate(program, sessions, startDate);
  if (!endDate) {
    throw new Error(
      "Unable to determine an export date range. Provide calendar.end_date or ensure schedules are bounded (end_offset_days)."
    );
  }

  return { startDate, endDate };
}

export function buildExportTables(program: CompiledProgram, sessions: MaterializedSession[]): {
  calendar: ExportTable;
  sets: ExportTable;
} {
  const { startDate, endDate } = getExportDateRange(program, sessions);

  const sessionsByDate = new Map<string, MaterializedSession[]>();
  sessions.forEach((session) => {
    const dateIso = session.date_iso;
    if (!dateIso) {
      return;
    }
    const existing = sessionsByDate.get(dateIso);
    if (existing) {
      existing.push(session);
    } else {
      sessionsByDate.set(dateIso, [session]);
    }
  });

  const calendarColumns = ["date_iso", "weekday", "day", "week", "session_count", "sessions"];
  const calendarRows: ExportTable["rows"] = [];

  const totalDays = diffDays(startDate, endDate) + 1;
  for (let offset = 0; offset < totalDays; offset += 1) {
    const date = addDays(startDate, offset);
    const dateIso = formatIsoDate(date);
    const weekday = getWeekdayUtc(date);
    const day = offset + 1;
    const week = Math.floor(offset / 7) + 1;

    const daySessions = sessionsByDate.get(dateIso) ?? [];
    const summary = daySessions.map((s) => `${s.id}${s.occurrence ? `#${s.occurrence}` : ""}: ${s.name}`).join(" | ");

    calendarRows.push([dateIso, weekday, day, week, daySessions.length, summary]);
  }

  const setColumns = [
    "date_iso",
    "weekday",
    "day",
    "week",
    "session_sequence",
    "session_id",
    "session_name",
    "session_slot",
    "session_occurrence",
    "exercise",
    "rest_seconds",
    "set_index",
    "reps",
    "reps_min",
    "reps_max",
    "intensity",
    "intensity_type",
    "load_value",
    "load_min",
    "load_max",
    "load_unit",
    "percent_1rm",
    "plus_load_value",
    "plus_load_unit",
    "rpe",
    "rir",
    "note"
  ];

  const setRows: ExportTable["rows"] = [];

  sessions.forEach((session) => {
    const dateIso = session.date_iso ?? "";
    const weekday = session.date_iso ? getWeekdayFromIso(session.date_iso) : "";
    const day = session.day ?? "";
    const week = typeof session.day === "number" ? Math.floor((session.day - 1) / 7) + 1 : "";

    session.exercises.forEach((exercise) => {
      exercise.sets.forEach((set) => {
        const repsText = formatReps(set.reps);
        const intensityText = formatIntensity(set.intensity);

        let intensityType: string = "";
        let loadValue: number | undefined;
        let loadMin: number | undefined;
        let loadMax: number | undefined;
        let loadUnit: string = "";
        let percent1rm: number | undefined;
        let plusLoadValue: number | undefined;
        let plusLoadUnit: string = "";
        let rpe: number | undefined;
        let rir: number | undefined;

        if (set.intensity) {
          intensityType = set.intensity.type;
          if (set.intensity.type === "load") {
            loadValue = set.intensity.value;
            loadUnit = set.intensity.unit;
          } else if (set.intensity.type === "load_range") {
            loadMin = set.intensity.min;
            loadMax = set.intensity.max;
            loadUnit = set.intensity.unit;
          } else if (set.intensity.type === "percent_1rm") {
            percent1rm = set.intensity.value;
            if (set.intensity.plus_load) {
              plusLoadValue = set.intensity.plus_load.value;
              plusLoadUnit = set.intensity.plus_load.unit;
            }
          } else if (set.intensity.type === "rpe") {
            rpe = set.intensity.value;
          } else if (set.intensity.type === "rir") {
            rir = set.intensity.value;
          }
        }

        setRows.push([
          dateIso,
          weekday,
          day,
          week,
          session.sequence,
          session.id,
          session.name,
          session.slot ?? "",
          session.occurrence ?? "",
          exercise.exercise,
          exercise.rest_seconds ?? "",
          set.index,
          repsText,
          set.reps?.min ?? "",
          set.reps?.max ?? "",
          intensityText,
          intensityType,
          loadValue ?? "",
          loadMin ?? "",
          loadMax ?? "",
          loadUnit,
          percent1rm ?? "",
          plusLoadValue ?? "",
          plusLoadUnit,
          rpe ?? "",
          rir ?? "",
          set.note ?? ""
        ]);
      });
    });
  });

  return {
    calendar: { name: "calendar", columns: calendarColumns, rows: calendarRows },
    sets: { name: "sets", columns: setColumns, rows: setRows }
  };
}

function getBlockId(sessionId: string): string {
  const dot = sessionId.indexOf(".");
  return dot === -1 ? "" : sessionId.slice(0, dot);
}

function intensityKey(
  intensity: MaterializedSession["exercises"][number]["sets"][number]["intensity"]
): string {
  if (!intensity) {
    return "";
  }

  if (intensity.type === "load") {
    return `load:${intensity.value}:${intensity.unit}`;
  }

  if (intensity.type === "load_range") {
    return `load_range:${intensity.min}:${intensity.max}:${intensity.unit}`;
  }

  if (intensity.type === "percent_1rm") {
    const plus = intensity.plus_load ? `${intensity.plus_load.value}:${intensity.plus_load.unit}` : "";
    return `percent_1rm:${intensity.value}:${plus}`;
  }

  if (intensity.type === "rpe") {
    return `rpe:${intensity.value}`;
  }

  if (intensity.type === "rir") {
    return `rir:${intensity.value}`;
  }

  if (intensity.type === "percent_of_set") {
    return `percent_of_set:${intensity.value}:${intensity.role}`;
  }

  return `load_delta_from_set:${intensity.value}:${intensity.unit}:${intensity.role}`;
}

type SetGroup = {
  count: number;
  reps_min?: number;
  reps_max?: number;
  custom_prescription?: string;
  intensity?: MaterializedSession["exercises"][number]["sets"][number]["intensity"];
  note?: string;
};

function groupSetsForClient(exercise: MaterializedSession["exercises"][number]): SetGroup[] {
  const groups: SetGroup[] = [];

  exercise.sets.forEach((set) => {
    const customPrescription =
      set.reps === undefined
        ? `${set.time_mode ?? set.work_type ?? "set"}${set.duration_seconds !== undefined ? ` ${set.duration_seconds}s` : ""}${set.target_total_reps !== undefined ? ` target ${set.target_total_reps}` : ""}`
        : undefined;
    const repsKey = set.reps ? `${set.reps.min}:${set.reps.max}` : `custom:${customPrescription ?? ""}`;
    const key = `${repsKey}:${intensityKey(set.intensity)}:${set.note ?? ""}`;
    const last = groups[groups.length - 1];
    if (last) {
      const lastRepsKey =
        last.reps_min !== undefined && last.reps_max !== undefined
          ? `${last.reps_min}:${last.reps_max}`
          : `custom:${last.custom_prescription ?? ""}`;
      const lastKey = `${lastRepsKey}:${intensityKey(last.intensity)}:${last.note ?? ""}`;
      if (lastKey === key) {
        last.count += 1;
        return;
      }
    }

    groups.push({
      count: 1,
      ...(set.reps ? { reps_min: set.reps.min, reps_max: set.reps.max } : {}),
      ...(customPrescription ? { custom_prescription: customPrescription } : {}),
      intensity: set.intensity,
      note: set.note
    });
  });

  return groups;
}

function formatRepRange(min: number, max: number): string {
  return min === max ? String(min) : `${min}-${max}`;
}

function formatClientPrescription(group: SetGroup): string {
  const repsText =
    group.reps_min !== undefined && group.reps_max !== undefined
      ? formatRepRange(group.reps_min, group.reps_max)
      : group.custom_prescription ?? "set";
  const intensityText = formatIntensity(group.intensity);
  const noteText = group.note ? ` - ${group.note}` : "";
  const at = intensityText ? ` @${intensityText}` : "";
  return `${group.count}x${repsText}${at}${noteText}`;
}

export function buildClientTable(program: CompiledProgram, sessions: MaterializedSession[]): ExportTable {
  const { startDate, endDate } = getExportDateRange(program, sessions);

  const sessionsByDate = new Map<string, MaterializedSession[]>();
  sessions.forEach((session) => {
    const dateIso = session.date_iso;
    if (!dateIso) {
      return;
    }
    const existing = sessionsByDate.get(dateIso);
    if (existing) {
      existing.push(session);
    } else {
      sessionsByDate.set(dateIso, [session]);
    }
  });

  const columns = ["date_iso", "weekday", "week", "block", "session", "exercise", "prescription", "rest"];
  const rows: ExportTable["rows"] = [];

  const totalDays = diffDays(startDate, endDate) + 1;

  for (let offset = 0; offset < totalDays; offset += 1) {
    const date = addDays(startDate, offset);
    const dateIso = formatIsoDate(date);
    const weekday = getWeekdayUtc(date);
    const week = Math.floor(offset / 7) + 1;

    const daySessions = sessionsByDate.get(dateIso) ?? [];

    if (daySessions.length === 0) {
      rows.push([dateIso, weekday, week, undefined, "REST", undefined, undefined, undefined]);
      continue;
    }

    let wroteDate = false;

    daySessions.forEach((session) => {
      const block = getBlockId(session.id);
      let wroteSession = false;
      let wroteAnyRow = false;

      if (session.exercises.length === 0) {
        const dateCell = wroteDate ? undefined : dateIso;
        const weekdayCell = wroteDate ? undefined : weekday;
        const weekCell = wroteDate ? undefined : week;
        wroteDate = true;

        const blockCell = wroteSession ? undefined : block || undefined;
        const sessionCell = wroteSession ? undefined : session.name;

        rows.push([dateCell, weekdayCell, weekCell, blockCell, sessionCell, undefined, undefined, undefined]);
        wroteAnyRow = true;
        wroteSession = true;
        return;
      }

      session.exercises.forEach((exercise) => {
        const groups = groupSetsForClient(exercise);

        if (groups.length === 0) {
          const dateCell = wroteDate ? undefined : dateIso;
          const weekdayCell = wroteDate ? undefined : weekday;
          const weekCell = wroteDate ? undefined : week;
          wroteDate = true;

          const blockCell = wroteSession ? undefined : block || undefined;
          const sessionCell = wroteSession ? undefined : session.name;

          const restText = formatRestSeconds(exercise.rest_seconds);
          const restCell = restText ? restText : undefined;

          rows.push([dateCell, weekdayCell, weekCell, blockCell, sessionCell, exercise.exercise, undefined, restCell]);
          wroteAnyRow = true;
          wroteSession = true;
          return;
        }

        groups.forEach((group, groupIndex0) => {
          const dateCell = wroteDate ? undefined : dateIso;
          const weekdayCell = wroteDate ? undefined : weekday;
          const weekCell = wroteDate ? undefined : week;
          wroteDate = true;

          const blockCell = wroteSession ? undefined : block || undefined;
          const sessionCell = wroteSession ? undefined : session.name;

          const exerciseCell = groupIndex0 === 0 ? exercise.exercise : undefined;
          const restText = groupIndex0 === 0 ? formatRestSeconds(exercise.rest_seconds) : "";
          const restCell = restText ? restText : undefined;

          const prescription = formatClientPrescription(group);

          rows.push([dateCell, weekdayCell, weekCell, blockCell, sessionCell, exerciseCell, prescription, restCell]);
          wroteAnyRow = true;
          wroteSession = true;
        });
      });

      if (!wroteAnyRow) {
        const dateCell = wroteDate ? undefined : dateIso;
        const weekdayCell = wroteDate ? undefined : weekday;
        const weekCell = wroteDate ? undefined : week;
        wroteDate = true;

        const blockCell = wroteSession ? undefined : block || undefined;
        const sessionCell = wroteSession ? undefined : session.name;

        rows.push([dateCell, weekdayCell, weekCell, blockCell, sessionCell, undefined, undefined, undefined]);
      }
    });
  }

  return { name: "program", columns, rows };
}

function computeEndDateIsoFromStart(startDateIso: string, args: string[]): string | undefined {
  const days = readFlagInt(args, "--days");
  const weeks = readFlagInt(args, "--weeks");

  if (days === undefined && weeks === undefined) {
    return undefined;
  }

  if (days !== undefined && days < 1) {
    throw new Error("--days must be an integer >= 1.");
  }

  if (weeks !== undefined && weeks < 1) {
    throw new Error("--weeks must be an integer >= 1.");
  }

  if (days !== undefined && weeks !== undefined) {
    throw new Error("Specify only one of --days or --weeks.");
  }

  const startDate = parseIsoDate(startDateIso);
  const totalDays = days ?? weeks! * 7;
  return formatIsoDate(addDays(startDate, totalDays - 1));
}

function applyCalendarOverrides(ast: unknown, overrides: { start_date?: string; end_date?: string }): unknown {
  if (!isRecord(ast)) {
    return ast;
  }

  const next: Record<string, unknown> = { ...ast };
  const calendar = isRecord(next.calendar) ? { ...(next.calendar as Record<string, unknown>) } : {};

  if (overrides.start_date) {
    calendar.start_date = overrides.start_date;
  }
  if (overrides.end_date) {
    calendar.end_date = overrides.end_date;
  }

  if (Object.keys(calendar).length > 0) {
    next.calendar = calendar;
  }

  return next;
}

function readResultsPath(args: string[]): string | undefined {
  return readFlagValue(args, "--results");
}

function readOutPath(args: string[]): string | undefined {
  return readFlagValue(args, "--out");
}

function readFormat(args: string[], outPath: string | undefined): ExportFormat {
  const raw = readFlagValue(args, "--format");
  if (raw === "csv" || raw === "xlsx") {
    return raw;
  }

  if (!raw && outPath) {
    const lowered = outPath.toLowerCase();
    if (lowered.endsWith(".xlsx")) {
      return "xlsx";
    }
    if (lowered.endsWith(".csv")) {
      return "csv";
    }
  }

  return "csv";
}

function readTableName(args: string[]): ExportTableName {
  const raw = readFlagValue(args, "--table");
  if (raw === "calendar" || raw === "sets") {
    return raw;
  }
  return "sets";
}

function readLayout(args: string[]): ExportLayout {
  const raw = readFlagValue(args, "--layout");
  if (raw === "data" || raw === "client") {
    return raw;
  }
  return "data";
}

function printUsage(): void {
  console.log(
    "Usage: psl export <file> [--format csv|xlsx] [--layout data|client] [--out <output>] [--table sets|calendar] [--results <results.json>]"
  );
  console.log("               [--start-date YYYY-MM-DD] [--end-date YYYY-MM-DD] [--days N | --weeks N]");
}

export async function runExportCommand(args: string[]): Promise<number> {
  const [filePath] = args;

  if (!filePath || filePath === "--help" || args.includes("--help")) {
    printUsage();
    return filePath ? 0 : 1;
  }

  const outPath = readOutPath(args);
  const format = readFormat(args, outPath);
  const layout = readLayout(args);

  if (format === "xlsx" && !outPath) {
    console.error("[error] $: --out is required for --format xlsx.");
    return 1;
  }

  const source = await readFile(filePath, "utf8");

  let astRaw: unknown;
  try {
    astRaw = parseDocument(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[error] $: Invalid YAML: ${message}`);
    return 1;
  }

  const startDateOverride = readFlagValue(args, "--start-date");
  const explicitEndOverride = readFlagValue(args, "--end-date");

  let startForComputedEnd: string | undefined = startDateOverride;
  if (!startForComputedEnd && isRecord(astRaw) && isRecord(astRaw.calendar) && typeof astRaw.calendar.start_date === "string") {
    startForComputedEnd = astRaw.calendar.start_date;
  }

  let computedEnd: string | undefined;
  try {
    if (startForComputedEnd) {
      computedEnd = computeEndDateIsoFromStart(startForComputedEnd, args);
    } else if (readFlagValue(args, "--days") || readFlagValue(args, "--weeks")) {
      console.error("[error] $: --start-date (or calendar.start_date in the document) is required when using --days/--weeks.");
      return 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[error] $: ${message}`);
    return 1;
  }

  const astWithOverrides = applyCalendarOverrides(astRaw, {
    start_date: startDateOverride,
    end_date: explicitEndOverride ?? computedEnd
  });

  const validation = validateAst(astWithOverrides);
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

  const resultsPath = readResultsPath(args);
  let completions: SessionCompletion[] | undefined;
  if (resultsPath) {
    let resultsJson: unknown;
    try {
      const resultsText = await readFile(resultsPath, "utf8");
      resultsJson = JSON.parse(resultsText) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[error] $: Failed to read/parse results JSON: ${message}`);
      return 1;
    }

    if (Array.isArray(resultsJson)) {
      completions = resultsJson as SessionCompletion[];
    } else if (
      resultsJson &&
      typeof resultsJson === "object" &&
      !Array.isArray(resultsJson) &&
      Array.isArray((resultsJson as { sessions?: unknown }).sessions)
    ) {
      completions = (resultsJson as { sessions: unknown[] }).sessions as SessionCompletion[];
    } else {
      console.error("[error] $: Results JSON must be an array or an object { sessions: [...] }.");
      return 1;
    }
  }

  let sessions: MaterializedSession[];
  try {
    sessions = materialize(compiled, completions ? { completions } : undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[error] $: Failed to materialize sessions: ${message}`);
    return 1;
  }

  let tables: { calendar: ExportTable; sets: ExportTable };
  let clientTable: ExportTable | undefined;
  try {
    tables = buildExportTables(compiled, sessions);
    if (layout === "client") {
      clientTable = buildClientTable(compiled, sessions);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[error] $: Export failed: ${message}`);
    return 1;
  }

  if (format === "csv") {
    if (layout === "client") {
      const table = clientTable!;
      const csv = encodeCsv(table.columns, table.rows);

      if (outPath) {
        await writeFile(outPath, csv, "utf8");
        console.log(`Wrote ${table.name} CSV to ${outPath}`);
        return 0;
      }

      process.stdout.write(csv);
      return 0;
    }

    const tableName = readTableName(args);
    const table = tableName === "calendar" ? tables.calendar : tables.sets;
    const csv = encodeCsv(table.columns, table.rows);

    if (outPath) {
      await writeFile(outPath, csv, "utf8");
      console.log(`Wrote ${table.name} CSV to ${outPath}`);
      return 0;
    }

    process.stdout.write(csv);
    return 0;
  }

  // XLSX
  const sheets =
    layout === "client"
      ? [
          {
            name: "Program",
            rows: [clientTable!.columns, ...clientTable!.rows],
            freeze: { rows: 1 },
            col_widths: [12, 8, 6, 14, 26, 28, 34, 10]
          }
        ]
      : [
          {
            name: "Calendar",
            rows: [tables.calendar.columns, ...tables.calendar.rows],
            freeze: { rows: 1 },
            col_widths: [12, 8, 6, 6, 12, 80]
          },
          {
            name: "Sets",
            rows: [tables.sets.columns, ...tables.sets.rows],
            freeze: { rows: 1 },
            col_widths: [12, 8, 6, 6, 14, 20, 24, 10, 10, 24, 10, 8, 8, 8, 8, 16, 14, 10, 10, 10, 10, 10, 12, 10, 8, 8, 40]
          }
        ];

  const xlsx = writeXlsx(sheets);
  await writeFile(outPath!, Buffer.from(xlsx));
  console.log(`Wrote XLSX workbook to ${outPath}`);
  return 0;
}
