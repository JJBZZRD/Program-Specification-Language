import type {
  ExercisePrescription,
  IntensityTarget,
  LanguageVersion,
  ProgramAst,
  ProgramCalendar,
  ProgramMetadata,
  ComparisonOp,
  ProgressionCondition,
  ProgressionRule,
  RepTarget,
  Session,
  LoadUnit,
  SessionSchedule,
  SetPrescription,
  WeeklyIncrementBy,
  Weekday
} from "../ast/types.js";
import { CURRENT_LANGUAGE_VERSION } from "../ast/version.js";
import { parseIntensityExpression, parseRepTargetExpression, parseShorthand } from "../parse/parseShorthand.js";
import type { Diagnostic, ValidationResult } from "./diagnostics.js";

type UnknownRecord = Record<string, unknown>;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS: readonly Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const WEEKDAY_SET = new Set<string>(WEEKDAYS);
const COMPARISON_OP_SET = new Set<string>([">=", ">", "<=", "<", "==", "!="]);

const WEEKDAY_ALIASES = new Map<string, Weekday>([
  ["MON", "MON"],
  ["MONDAY", "MON"],
  ["TUE", "TUE"],
  ["TUES", "TUE"],
  ["TUESDAY", "TUE"],
  ["WED", "WED"],
  ["WEDNESDAY", "WED"],
  ["THU", "THU"],
  ["THUR", "THU"],
  ["THURS", "THU"],
  ["THURSDAY", "THU"],
  ["FRI", "FRI"],
  ["FRIDAY", "FRI"],
  ["SAT", "SAT"],
  ["SATURDAY", "SAT"],
  ["SUN", "SUN"],
  ["SUNDAY", "SUN"]
]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseWeekdayToken(raw: string): Weekday | undefined {
  const token = raw.trim().toUpperCase();
  if (token === "") {
    return undefined;
  }
  return WEEKDAY_ALIASES.get(token);
}

function parseWeekdayList(raw: string): { days: Weekday[]; unknown: string[] } {
  const unknown: string[] = [];
  const days: Weekday[] = [];

  raw
    .split(/[\s,\/]+/)
    .map((token) => token.trim())
    .filter((token) => token !== "")
    .forEach((token) => {
      const upper = token.toUpperCase();
      if (upper === "AND" || upper === "&") {
        return;
      }

      const parsed = parseWeekdayToken(token);
      if (!parsed) {
        unknown.push(token);
        return;
      }

      if (!days.includes(parsed)) {
        days.push(parsed);
      }
    });

  return { days, unknown };
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

function parseDurationSecondsString(raw: string): number | undefined {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "") {
    return undefined;
  }

  // mm:ss
  const mmssMatch = normalized.match(/^(?<min>\d+)\s*:\s*(?<sec>\d{2})$/);
  if (mmssMatch?.groups?.min !== undefined && mmssMatch.groups.sec !== undefined) {
    const min = Number(mmssMatch.groups.min);
    const sec = Number(mmssMatch.groups.sec);
    if (!Number.isFinite(min) || !Number.isFinite(sec) || min < 0 || sec < 0 || sec >= 60) {
      return undefined;
    }
    return min * 60 + sec;
  }

  // 2m30s / 2m 30s / 2m
  const minutesSecondsMatch = normalized.match(
    /^(?<min>\d+(?:\.\d+)?)\s*m(?:\s*(?<sec>\d+(?:\.\d+)?)\s*s)?$/
  );
  if (minutesSecondsMatch?.groups?.min !== undefined) {
    const minutes = Number(minutesSecondsMatch.groups.min);
    const seconds = minutesSecondsMatch.groups.sec ? Number(minutesSecondsMatch.groups.sec) : 0;

    if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || minutes < 0 || seconds < 0) {
      return undefined;
    }

    const total = minutes * 60 + seconds;
    if (!Number.isFinite(total)) {
      return undefined;
    }

    const rounded = Math.round(total);
    // Only accept values that are effectively whole seconds.
    if (Math.abs(total - rounded) > 1e-9) {
      return undefined;
    }

    return rounded;
  }

  const secondsMatch = normalized.match(/^(?<sec>\d+(?:\.\d+)?)\s*s(?:ec(?:onds?)?)?$/);
  if (secondsMatch?.groups?.sec !== undefined) {
    const seconds = Number(secondsMatch.groups.sec);
    if (!Number.isFinite(seconds) || seconds < 0) {
      return undefined;
    }

    const rounded = Math.round(seconds);
    if (Math.abs(seconds - rounded) > 1e-9) {
      return undefined;
    }

    return rounded;
  }

  const minutesMatch = normalized.match(/^(?<min>\d+(?:\.\d+)?)\s*m(?:in(?:utes?)?)?$/);
  if (minutesMatch?.groups?.min !== undefined) {
    const minutes = Number(minutesMatch.groups.min);
    if (!Number.isFinite(minutes) || minutes < 0) {
      return undefined;
    }

    const total = minutes * 60;
    const rounded = Math.round(total);
    if (Math.abs(total - rounded) > 1e-9) {
      return undefined;
    }

    return rounded;
  }

  if (/^\d+$/.test(normalized)) {
    const seconds = Number(normalized);
    if (!Number.isFinite(seconds)) {
      return undefined;
    }
    return seconds;
  }

  return undefined;
}

function parseDurationSeconds(value: unknown, path: string, diagnostics: Diagnostic[]): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0) {
      addError(diagnostics, path, "Duration must be an integer >= 0 (seconds).");
      return undefined;
    }
    return value;
  }

  if (typeof value === "string") {
    const seconds = parseDurationSecondsString(value);
    if (seconds === undefined) {
      addError(
        diagnostics,
        path,
        "Duration must be seconds (integer) or a string like 90s, 2m, 2m30s, or 2:30."
      );
      return undefined;
    }

    return seconds;
  }

  addError(diagnostics, path, "Duration must be seconds (integer) or a duration string.");
  return undefined;
}

function isRestDirectiveLine(raw: string): boolean {
  const match = /^rest\b\s*[:=]?\s*(?<dur>.+)$/i.exec(raw.trim());
  if (!match?.groups?.dur) {
    return false;
  }

  return /^\d/.test(match.groups.dur.trim());
}

function parseRestDirectiveSeconds(
  raw: string,
  path: string,
  diagnostics: Diagnostic[]
): number | undefined | null {
  const match = /^rest\b\s*[:=]?\s*(?<dur>.+)$/i.exec(raw.trim());
  if (!match?.groups?.dur) {
    return null;
  }

  const dur = match.groups.dur.trim();
  if (dur === "" || !/^\d/.test(dur)) {
    return null;
  }

  return parseDurationSeconds(dur, path, diagnostics);
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

  if (typeof reps === "string") {
    try {
      return parseRepTargetExpression(reps);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid reps shorthand.";
      addError(diagnostics, path, message);
      return undefined;
    }
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

  if (typeof intensity === "string") {
    try {
      // Allow intensity fields to reuse the set shorthand intensity syntax (with or without leading "@").
      return parseIntensity(parseIntensityExpression(intensity), path, diagnostics);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid intensity shorthand.";
      addError(diagnostics, path, message);
      return undefined;
    }
  }

  if (!isRecord(intensity)) {
    addError(diagnostics, path, "Intensity must be an object.");
    return undefined;
  }

  const type = intensity.type;

  if (
    type !== "percent_1rm" &&
    type !== "rpe" &&
    type !== "rir" &&
    type !== "load" &&
    type !== "load_range"
  ) {
    addError(
      diagnostics,
      `${path}.type`,
      "Intensity type must be percent_1rm, rpe, rir, load, or load_range."
    );
    return undefined;
  }

  const plusLoadRaw = intensity.plus_load;

  if (type === "load_range") {
    if (plusLoadRaw !== undefined) {
      addError(diagnostics, `${path}.plus_load`, "plus_load is only supported for percent_1rm intensity.");
      return undefined;
    }

    const minRaw = intensity.min;
    const maxRaw = intensity.max;

    if (typeof minRaw !== "number") {
      addError(diagnostics, `${path}.min`, "load_range intensity min must be a number.");
      return undefined;
    }

    if (typeof maxRaw !== "number") {
      addError(diagnostics, `${path}.max`, "load_range intensity max must be a number.");
      return undefined;
    }

    if (!(minRaw > 0)) {
      addError(diagnostics, `${path}.min`, "load_range intensity min must be > 0.");
      return undefined;
    }

    if (maxRaw < minRaw) {
      addError(diagnostics, `${path}.max`, "load_range intensity max must be >= min.");
      return undefined;
    }

    const unitRaw = intensity.unit;
    if (typeof unitRaw !== "string") {
      addError(diagnostics, `${path}.unit`, "load_range intensity requires unit kg or lb.");
      return undefined;
    }

    const unit = unitRaw.toLowerCase();
    if (unit !== "kg" && unit !== "lb") {
      addError(diagnostics, `${path}.unit`, "load_range intensity unit must be kg or lb.");
      return undefined;
    }

    return { type: "load_range", min: minRaw, max: maxRaw, unit: unit as LoadUnit };
  }

  const value = intensity.value;

  if (typeof value !== "number") {
    addError(diagnostics, `${path}.value`, "Intensity value must be a number.");
    return undefined;
  }

  if (type === "percent_1rm") {
    if (!(value > 0 && value <= 150)) {
      addError(diagnostics, `${path}.value`, "percent_1rm intensity must be > 0 and <= 150.");
      return undefined;
    }

    let plus_load: { value: number; unit: LoadUnit } | undefined;

    if (plusLoadRaw !== undefined) {
      if (!isRecord(plusLoadRaw)) {
        addError(diagnostics, `${path}.plus_load`, "plus_load must be an object {value,unit}.");
        return undefined;
      }

      const plusValueRaw = plusLoadRaw.value;
      if (typeof plusValueRaw !== "number" || !Number.isFinite(plusValueRaw)) {
        addError(diagnostics, `${path}.plus_load.value`, "plus_load.value must be a finite number.");
        return undefined;
      }

      const plusUnitRaw = plusLoadRaw.unit;
      if (typeof plusUnitRaw !== "string") {
        addError(diagnostics, `${path}.plus_load.unit`, "plus_load.unit must be kg or lb.");
        return undefined;
      }

      const plusUnit = plusUnitRaw.toLowerCase();
      if (plusUnit !== "kg" && plusUnit !== "lb") {
        addError(diagnostics, `${path}.plus_load.unit`, "plus_load.unit must be kg or lb.");
        return undefined;
      }

      plus_load = { value: plusValueRaw, unit: plusUnit as LoadUnit };
    }

    return { type, value, ...(plus_load ? { plus_load } : {}) };
  }

  if (plusLoadRaw !== undefined) {
    addError(diagnostics, `${path}.plus_load`, "plus_load is only supported for percent_1rm intensity.");
    return undefined;
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

function parseProgressionCondition(
  condition: unknown,
  intensity: IntensityTarget,
  path: string,
  diagnostics: Diagnostic[]
): ProgressionCondition | undefined {
  if (condition === undefined) {
    return undefined;
  }

  if (!isRecord(condition)) {
    addError(diagnostics, path, "progression.when must be an object.");
    return undefined;
  }

  const type = condition.type;

  if (type !== "session_success" && type !== "metric_vs_target") {
    addError(
      diagnostics,
      `${path}.type`,
      "progression.when.type must be session_success or metric_vs_target."
    );
    return undefined;
  }

  if (type === "session_success") {
    const equalsRaw = condition.equals;

    if (equalsRaw !== undefined && typeof equalsRaw !== "boolean") {
      addError(diagnostics, `${path}.equals`, "session_success.equals must be a boolean.");
      return undefined;
    }

    return {
      type: "session_success",
      equals: equalsRaw as boolean | undefined
    };
  }

  if (intensity.type === "percent_1rm") {
    addError(
      diagnostics,
      path,
      "metric_vs_target conditions are not supported for percent_1rm intensity."
    );
    return undefined;
  }

  const metricRaw = condition.metric;
  if (metricRaw !== "load" && metricRaw !== "rpe" && metricRaw !== "rir") {
    addError(diagnostics, `${path}.metric`, "metric must be load, rpe, or rir.");
    return undefined;
  }

  const opRaw = condition.op;
  if (typeof opRaw !== "string" || !COMPARISON_OP_SET.has(opRaw)) {
    addError(diagnostics, `${path}.op`, "op must be one of: >=, >, <=, <, ==, !=.");
    return undefined;
  }

  const targetRaw = condition.target;
  const defaultTarget = intensity.type === "load_range" ? "max" : "value";
  const targetValue = targetRaw === undefined ? defaultTarget : targetRaw;

  if (targetValue !== "value" && targetValue !== "min" && targetValue !== "max") {
    addError(diagnostics, `${path}.target`, "target must be value, min, or max.");
    return undefined;
  }

  if (intensity.type === "load_range") {
    if (metricRaw !== "load") {
      addError(diagnostics, `${path}.metric`, "load_range intensity progression must use metric load.");
      return undefined;
    }

    if (targetValue === "value") {
      addError(diagnostics, `${path}.target`, "load_range conditions require target min or max.");
      return undefined;
    }
  } else if (intensity.type === "load") {
    if (metricRaw !== "load") {
      addError(diagnostics, `${path}.metric`, "load intensity progression must use metric load.");
      return undefined;
    }

    if (targetValue !== "value") {
      addError(diagnostics, `${path}.target`, "load conditions only support target value.");
      return undefined;
    }
  } else if (intensity.type === "rpe") {
    if (metricRaw !== "rpe") {
      addError(diagnostics, `${path}.metric`, "rpe intensity progression must use metric rpe.");
      return undefined;
    }

    if (targetValue !== "value") {
      addError(diagnostics, `${path}.target`, "rpe conditions only support target value.");
      return undefined;
    }
  } else if (intensity.type === "rir") {
    if (metricRaw !== "rir") {
      addError(diagnostics, `${path}.metric`, "rir intensity progression must use metric rir.");
      return undefined;
    }

    if (targetValue !== "value") {
      addError(diagnostics, `${path}.target`, "rir conditions only support target value.");
      return undefined;
    }
  }

  return {
    type: "metric_vs_target",
    metric: metricRaw,
    op: opRaw as ComparisonOp,
    target: targetValue as "value" | "min" | "max"
  };
}

function parseProgressionCadence(
  cadence: unknown,
  path: string,
  diagnostics: Diagnostic[]
): ProgressionRule["cadence"] | undefined {
  if (cadence === undefined) {
    return undefined;
  }

  const startIndex = diagnostics.length;

  if (!isRecord(cadence)) {
    addError(diagnostics, path, "progression.cadence must be an object.");
    return undefined;
  }

  const type = cadence.type;
  if (type !== "weeks" && type !== "sessions") {
    addError(diagnostics, `${path}.type`, "progression.cadence.type must be weeks or sessions.");
    return undefined;
  }

  const everyRaw = cadence.every;
  if (everyRaw !== undefined) {
    if (typeof everyRaw !== "number" || !Number.isInteger(everyRaw) || everyRaw < 1) {
      addError(diagnostics, `${path}.every`, "progression.cadence.every must be an integer >= 1.");
    }
  }

  const onWeekdaysRaw = cadence.on_weekdays;

  if (type === "weeks") {
    if (onWeekdaysRaw !== undefined) {
      addError(diagnostics, `${path}.on_weekdays`, "progression.cadence.on_weekdays is only valid for sessions cadence.");
    }

    if (hasNewErrors(diagnostics, startIndex)) {
      return undefined;
    }

    return {
      type: "weeks",
      every: everyRaw as number | undefined
    };
  }

  if (onWeekdaysRaw !== undefined) {
    if (!Array.isArray(onWeekdaysRaw) || onWeekdaysRaw.length === 0) {
      addError(diagnostics, `${path}.on_weekdays`, "on_weekdays must be a non-empty array.");
    } else {
      onWeekdaysRaw.forEach((value, index) => {
        const weekdayPath = `${path}.on_weekdays[${index}]`;
        if (typeof value !== "string" || !WEEKDAY_SET.has(value)) {
          addError(diagnostics, weekdayPath, `Invalid weekday. Expected one of: ${WEEKDAYS.join(", ")}.`);
        }
      });
    }
  }

  if (hasNewErrors(diagnostics, startIndex)) {
    return undefined;
  }

  return {
    type: "sessions",
    every: everyRaw as number | undefined,
    on_weekdays: onWeekdaysRaw as Weekday[] | undefined
  };
}

function parseProgressionShorthand(
  progression: string,
  intensity: IntensityTarget,
  path: string,
  diagnostics: Diagnostic[]
): UnknownRecord | undefined {
  const normalized = progression.trim().replace(/\s+/g, " ");
  if (normalized === "") {
    addError(diagnostics, path, "progression shorthand cannot be empty.");
    return undefined;
  }

  const ifMatch = /\bif\b/i.exec(normalized);
  const main = ifMatch ? normalized.slice(0, ifMatch.index).trim() : normalized;
  const conditionRaw = ifMatch ? normalized.slice(ifMatch.index + ifMatch[0].length).trim() : undefined;

  if (main === "") {
    addError(diagnostics, path, "progression shorthand must start with an increment (e.g. +2.5).");
    return undefined;
  }

  const byRangeMatch =
    /^\s*(?<sign>[+-])?\s*\[\s*(?<min>\d+(?:\.\d+)?)\s*(?:,\s*(?<max>\d+(?:\.\d+)?)\s*)?\]\s*(?<unit>kg|kgs|lb|lbs)?/i.exec(
      main
    );

  let by: WeeklyIncrementBy | undefined;
  let byUnit: LoadUnit | undefined;
  let byExplicitUnit: "percent" | "rpe" | "rir" | undefined;
  let consumed = 0;

  if (byRangeMatch?.groups?.min !== undefined) {
    const sign = byRangeMatch.groups.sign === "-" ? -1 : 1;
    const min = Number(byRangeMatch.groups.min) * sign;
    const max =
      byRangeMatch.groups.max !== undefined ? Number(byRangeMatch.groups.max) * sign : undefined;

    if (!Number.isFinite(min) || (max !== undefined && !Number.isFinite(max))) {
      addError(diagnostics, path, "Invalid progression increment.");
      return undefined;
    }

    if (intensity.type !== "load_range") {
      addError(diagnostics, path, "Bracketed progression increments are only valid for load_range intensity.");
      return undefined;
    }

    by = max === undefined ? min : { min, max };

    if (byRangeMatch.groups.unit) {
      const unitToken = byRangeMatch.groups.unit.toLowerCase();
      byUnit = unitToken === "kg" || unitToken === "kgs" ? "kg" : "lb";
    }

    consumed = byRangeMatch[0].length;
  } else {
    const byMatch =
      /^\s*(?<sign>[+-])?\s*(?<value>\d+(?:\.\d+)?)\s*(?<unit>%\s*(?:1\s*rm)?|rpe|rir|kg|kgs|lb|lbs)?/i.exec(main);

    if (!byMatch?.groups?.value) {
      addError(diagnostics, path, "progression shorthand must start with an increment (e.g. +2.5).");
      return undefined;
    }

    const sign = byMatch.groups.sign === "-" ? -1 : 1;
    const value = Number(byMatch.groups.value) * sign;

    if (!Number.isFinite(value)) {
      addError(diagnostics, path, "Invalid progression increment.");
      return undefined;
    }

    by = value;

    if (byMatch.groups.unit) {
      const unitToken = byMatch.groups.unit.replace(/\s+/g, "").toLowerCase();
      if (unitToken.startsWith("%")) {
        byExplicitUnit = "percent";
      } else if (unitToken === "rpe") {
        byExplicitUnit = "rpe";
      } else if (unitToken === "rir") {
        byExplicitUnit = "rir";
      } else {
        byUnit = unitToken === "kg" || unitToken === "kgs" ? "kg" : "lb";
      }
    }

    consumed = byMatch[0].length;
  }

  if (byExplicitUnit === "percent") {
    if (intensity.type !== "percent_1rm") {
      addError(diagnostics, path, "Percent units in progression shorthand are only valid for percent_1rm intensity.");
      return undefined;
    }
  } else if (byExplicitUnit === "rpe") {
    if (intensity.type !== "rpe") {
      addError(diagnostics, path, "RPE units in progression shorthand are only valid for rpe intensity.");
      return undefined;
    }
  } else if (byExplicitUnit === "rir") {
    if (intensity.type !== "rir") {
      addError(diagnostics, path, "RIR units in progression shorthand are only valid for rir intensity.");
      return undefined;
    }
  }

  if (byUnit !== undefined) {
    if (intensity.type === "load" || intensity.type === "load_range") {
      if (intensity.unit !== byUnit) {
        addError(diagnostics, path, `Progression unit ${byUnit} does not match intensity unit ${intensity.unit}.`);
        return undefined;
      }
    } else if (intensity.type === "percent_1rm") {
      if (intensity.plus_load?.unit !== undefined && intensity.plus_load.unit !== byUnit) {
        addError(
          diagnostics,
          path,
          `Progression unit ${byUnit} does not match intensity.plus_load unit ${intensity.plus_load.unit}.`
        );
        return undefined;
      }

      if (typeof by !== "number") {
        addError(diagnostics, path, "Load-unit progression increments for percent_1rm intensity must be a number.");
        return undefined;
      }

      // For percent_1rm intensity, a kg/lb increment means "add to computed load", represented as a load delta.
      by = { type: "load", value: by, unit: byUnit };
    } else {
      addError(diagnostics, path, "Units in progression shorthand are only valid for load/load_range or percent_1rm intensity.");
      return undefined;
    }
  }

  let remainder = main.slice(consumed).trim();

  // Optional weekday filter suffix: "on FRI" / "only Friday"
  let onWeekdays: Weekday[] | undefined;
  const onMatch = /\b(?:on|only)\s+(?<days>[A-Za-z,\s/]+)$/i.exec(remainder);
  if (onMatch?.groups?.days !== undefined) {
    const parsedDays = parseWeekdayList(onMatch.groups.days);
    if (parsedDays.unknown.length > 0) {
      addError(diagnostics, path, `Invalid weekday(s) in progression shorthand: ${parsedDays.unknown.join(", ")}.`);
      return undefined;
    }

    if (parsedDays.days.length > 0) {
      onWeekdays = parsedDays.days;
      remainder = remainder.slice(0, onMatch.index).trim();
    }
  }

  // Default cadence: weekly.
  let cadenceType: "weeks" | "sessions" = "weeks";
  let cadenceEvery = 1;

  if (remainder !== "") {
    const slashCadence = /^\/\s*(?<every>\d+)?\s*(?<unit>w|weeks?|s|sessions?)\s*$/i.exec(remainder);
    if (slashCadence?.groups?.unit !== undefined) {
      const unit = slashCadence.groups.unit.toLowerCase();
      cadenceType = unit.startsWith("w") ? "weeks" : "sessions";
      cadenceEvery = slashCadence.groups.every ? Number(slashCadence.groups.every) : 1;
    } else {
      const otherCadence = /^(?:every\s+)?other\s+(?<unit>week|weeks|w|session|sessions|s)$/i.exec(remainder);
      if (otherCadence?.groups?.unit !== undefined) {
        const unit = otherCadence.groups.unit.toLowerCase();
        cadenceType = unit.startsWith("w") ? "weeks" : "sessions";
        cadenceEvery = 2;
      } else {
        const cadenceMatch =
          /^(?:every\s+)?(?<every>\d+)?\s*(?<unit>week|weeks|w|session|sessions|s)$/i.exec(remainder);
        if (cadenceMatch?.groups?.unit !== undefined) {
          const unit = cadenceMatch.groups.unit.toLowerCase();
          cadenceType = unit.startsWith("w") ? "weeks" : "sessions";
          cadenceEvery = cadenceMatch.groups.every ? Number(cadenceMatch.groups.every) : 1;
        } else if (/^weekly$/i.test(remainder)) {
          cadenceType = "weeks";
          cadenceEvery = 1;
        } else {
          addError(
            diagnostics,
            path,
            'Invalid progression cadence shorthand. Use e.g. "every week", "every 2 weeks", "every 3 sessions", or "/3s".'
          );
          return undefined;
        }
      }
    }

    if (!Number.isInteger(cadenceEvery) || cadenceEvery < 1) {
      addError(diagnostics, path, "progression cadence must be an integer >= 1.");
      return undefined;
    }
  }

  if (onWeekdays && cadenceType === "weeks") {
    // A weekday filter implies session-based cadence (e.g. "every 2 weeks on Fri" => "every 2 Fri occurrences").
    cadenceType = "sessions";
  }

  const cadence: UnknownRecord =
    cadenceType === "weeks"
      ? { type: "weeks", every: cadenceEvery }
      : { type: "sessions", every: cadenceEvery, on_weekdays: onWeekdays };

  let when: UnknownRecord | undefined;

  if (conditionRaw !== undefined) {
    const condition = conditionRaw.trim();
    if (condition === "") {
      addError(diagnostics, path, "progression shorthand if-clause cannot be empty.");
      return undefined;
    }

    if (/^(success|succeeded|pass|passed)$/i.test(condition)) {
      when = { type: "session_success", equals: true };
    } else if (/^(fail|failed|failure)$/i.test(condition)) {
      when = { type: "session_success", equals: false };
    } else {
      const metricOpTarget =
        /^(?<metric>load|rpe|rir)\s*(?<op>>=|>|<=|<|==|!=)\s*(?<target>target|value|min|max)?$/i.exec(condition);

      const opTargetOnly =
        /^(?<op>>=|>|<=|<|==|!=)\s*(?<target>target|value|min|max)?$/i.exec(condition);

      const metric =
        metricOpTarget?.groups?.metric !== undefined
          ? metricOpTarget.groups.metric.toLowerCase()
          : undefined;
      const op =
        metricOpTarget?.groups?.op !== undefined ? metricOpTarget.groups.op : opTargetOnly?.groups?.op;
      const targetRaw =
        metricOpTarget?.groups?.target !== undefined ? metricOpTarget.groups.target : opTargetOnly?.groups?.target;

      let inferredMetric = metric;
      if (!inferredMetric) {
        if (intensity.type === "load" || intensity.type === "load_range") {
          inferredMetric = "load";
        } else if (intensity.type === "rpe") {
          inferredMetric = "rpe";
        } else if (intensity.type === "rir") {
          inferredMetric = "rir";
        } else {
          addError(diagnostics, path, "Cannot infer metric for progression condition with percent_1rm intensity.");
          return undefined;
        }
      }

      if (!op || !COMPARISON_OP_SET.has(op)) {
        addError(diagnostics, path, "Invalid progression condition operator. Use one of: >=, >, <=, <, ==, !=.");
        return undefined;
      }

      let target: "value" | "min" | "max" | undefined;
      if (targetRaw !== undefined) {
        const token = targetRaw.toLowerCase();
        if (token === "min") {
          target = "min";
        } else if (token === "max") {
          target = "max";
        } else if (token === "value") {
          target = "value";
        } else {
          target = undefined;
        }
      }

      when = {
        type: "metric_vs_target",
        metric: inferredMetric,
        op,
        ...(target ? { target } : {})
      };
    }
  }

  return {
    type: "increment",
    by,
    cadence,
    ...(when ? { when } : {})
  };
}

function parseProgression(
  progression: unknown,
  intensity: IntensityTarget | undefined,
  path: string,
  diagnostics: Diagnostic[]
): ProgressionRule | undefined {
  if (progression === undefined) {
    return undefined;
  }

  const startIndex = diagnostics.length;

  let progressionValue: unknown = progression;

  if (typeof progression === "string") {
    if (!intensity) {
      addError(diagnostics, path, "progression requires intensity.");
      return undefined;
    }

    progressionValue = parseProgressionShorthand(progression, intensity, path, diagnostics);
    if (progressionValue === undefined) {
      return undefined;
    }
  }

  if (!isRecord(progressionValue)) {
    addError(diagnostics, path, "progression must be an object or shorthand string.");
    return undefined;
  }

  const type = progressionValue.type;
  if (type !== "weekly_increment" && type !== "increment") {
    addError(diagnostics, `${path}.type`, "progression.type must be weekly_increment or increment.");
    return undefined;
  }

  if (!intensity) {
    addError(diagnostics, path, "progression requires intensity.");
    return undefined;
  }

  const when = parseProgressionCondition(progressionValue.when, intensity, `${path}.when`, diagnostics);
  const cadence = parseProgressionCadence(progressionValue.cadence, `${path}.cadence`, diagnostics);

  if (type === "increment" && cadence === undefined) {
    addError(diagnostics, `${path}.cadence`, "increment progression requires cadence.");
    return undefined;
  }

  const byRaw = progressionValue.by;
  if (byRaw === undefined) {
    addError(diagnostics, `${path}.by`, "weekly_increment progression requires by.");
    return undefined;
  }

  let by: WeeklyIncrementBy | undefined;

  if (isRecord(byRaw) && byRaw.type === "load") {
    const valueRaw = byRaw.value;
    if (typeof valueRaw !== "number" || !Number.isFinite(valueRaw)) {
      addError(diagnostics, `${path}.by.value`, "by.value must be a finite number.");
      return undefined;
    }

    const unitRaw = byRaw.unit;
    if (typeof unitRaw !== "string") {
      addError(diagnostics, `${path}.by.unit`, "by.unit must be kg or lb.");
      return undefined;
    }

    const unit = unitRaw.toLowerCase();
    if (unit !== "kg" && unit !== "lb") {
      addError(diagnostics, `${path}.by.unit`, "by.unit must be kg or lb.");
      return undefined;
    }

    if (intensity.type === "load" || intensity.type === "load_range") {
      if (intensity.unit !== unit) {
        addError(diagnostics, `${path}.by`, `Progression unit ${unit} does not match intensity unit ${intensity.unit}.`);
        return undefined;
      }
    } else if (intensity.type === "percent_1rm") {
      if (intensity.plus_load?.unit !== undefined && intensity.plus_load.unit !== unit) {
        addError(
          diagnostics,
          `${path}.by`,
          `Progression unit ${unit} does not match intensity.plus_load unit ${intensity.plus_load.unit}.`
        );
        return undefined;
      }
    } else {
      addError(diagnostics, `${path}.by`, "Load-unit progression increments are only valid for load/load_range/percent_1rm intensity.");
      return undefined;
    }

    by = { type: "load", value: valueRaw, unit: unit as LoadUnit };
  } else if (intensity.type === "load_range") {
    if (typeof byRaw === "number") {
      if (!Number.isFinite(byRaw)) {
        addError(diagnostics, `${path}.by`, "by must be a finite number.");
      } else {
        by = byRaw;
      }
    } else if (isRecord(byRaw)) {
      const minRaw = byRaw.min;
      const maxRaw = byRaw.max;

      if (minRaw === undefined && maxRaw === undefined) {
        addError(diagnostics, `${path}.by`, "by must include at least one of: min, max.");
      }

      if (minRaw !== undefined) {
        if (typeof minRaw !== "number" || !Number.isFinite(minRaw)) {
          addError(diagnostics, `${path}.by.min`, "by.min must be a finite number.");
        }
      }

      if (maxRaw !== undefined) {
        if (typeof maxRaw !== "number" || !Number.isFinite(maxRaw)) {
          addError(diagnostics, `${path}.by.max`, "by.max must be a finite number.");
        }
      }

      by = {
        min: minRaw as number | undefined,
        max: maxRaw as number | undefined
      };
    } else {
      addError(diagnostics, `${path}.by`, "by must be a number or an object {min,max}.");
    }
  } else {
    if (typeof byRaw !== "number" || !Number.isFinite(byRaw)) {
      addError(diagnostics, `${path}.by`, "by must be a finite number.");
    } else {
      by = byRaw;
    }
  }

  if (hasNewErrors(diagnostics, startIndex)) {
    return undefined;
  }

  return {
    type: type as "weekly_increment" | "increment",
    when,
    by: by as WeeklyIncrementBy,
    cadence
  };
}

function parseSetShorthandBlock(raw: string, path: string, diagnostics: Diagnostic[]): SetPrescription[] {
  const sets: SetPrescription[] = [];
  const annotateLinePaths = /[\r\n]/.test(raw) || raw.includes(";");
  const lines = raw.split(/\r?\n/);

  lines.forEach((line, lineIndex) => {
    const lineNumber = lineIndex + 1;
    const trimmedLine = line.trim();

    if (trimmedLine === "" || trimmedLine.startsWith("#")) {
      return;
    }

    // Allow semicolon-separated entries (useful for one-line exercise shorthand).
    const segments = trimmedLine.split(";");

    segments.forEach((segment) => {
      let entry = segment.trim();
      if (entry === "" || entry.startsWith("#")) {
        return;
      }

      // Strip a common bullet prefix (useful inside YAML block scalars).
      entry = entry.replace(/^\-\s+/, "");

      let note: string | undefined;
      const hashIndex = entry.indexOf("#");
      if (hashIndex >= 0) {
        note = entry.slice(hashIndex + 1).trim();
        entry = entry.slice(0, hashIndex).trim();
      }

      if (entry === "") {
        return;
      }

      try {
        const shorthand = parseShorthand(entry);
        const linePath = annotateLinePaths ? `${path}[line ${lineNumber}]` : path;
        const intensity = parseIntensity(shorthand.intensity, `${linePath}.intensity`, diagnostics);

        if (shorthand.intensity !== undefined && intensity === undefined) {
          return;
        }

        const setValue: SetPrescription = {
          ...shorthand,
          intensity
        };

        if (note && note !== "") {
          setValue.note = note;
        }

        sets.push(setValue);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid shorthand expression.";
        addError(diagnostics, annotateLinePaths ? `${path}[line ${lineNumber}]` : path, message);
      }
    });
  });

  return sets;
}

function parseSet(
  set: unknown,
  path: string,
  diagnostics: Diagnostic[]
): SetPrescription[] | undefined {
  const startIndex = diagnostics.length;

  if (typeof set === "string") {
    const parsed = parseSetShorthandBlock(set, path, diagnostics);
    if (hasNewErrors(diagnostics, startIndex)) {
      return undefined;
    }
    return parsed;
  }

  if (!isRecord(set)) {
    addError(diagnostics, path, "Set must be an object or shorthand string.");
    return undefined;
  }

  const shorthandRaw = set.shorthand;
  if (typeof shorthandRaw === "string") {
    if (set.count !== undefined || set.reps !== undefined || set.intensity !== undefined) {
      addError(
        diagnostics,
        path,
        "Set object may specify either shorthand or (count,reps,intensity), not both."
      );
      return undefined;
    }

    const shorthandSets = parseSetShorthandBlock(shorthandRaw, `${path}.shorthand`, diagnostics);

    const wrapperNote = set.note;
    if (wrapperNote !== undefined && typeof wrapperNote !== "string") {
      addError(diagnostics, `${path}.note`, "Set note must be a string.");
    }

    const expanded: SetPrescription[] = [];

    shorthandSets.forEach((entry) => {
      const intensity = entry.intensity;
      const progression = parseProgression(set.progression, intensity, `${path}.progression`, diagnostics);

      let note: string | undefined = wrapperNote as string | undefined;
      if (entry.note) {
        note = note ? `${note}; ${entry.note}` : entry.note;
      }

      const expandedSet: SetPrescription = {
        ...entry,
        progression
      };

      if (note !== undefined) {
        expandedSet.note = note;
      }

      expanded.push(expandedSet);
    });

    if (hasNewErrors(diagnostics, startIndex)) {
      return undefined;
    }

    return expanded;
  }

  const count = set.count;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1) {
    addError(diagnostics, `${path}.count`, "Set count must be an integer >= 1.");
  }

  const reps = parseRepTarget(set.reps, `${path}.reps`, diagnostics);
  const intensity = parseIntensity(set.intensity, `${path}.intensity`, diagnostics);
  const progression = parseProgression(set.progression, intensity, `${path}.progression`, diagnostics);

  const note = set.note;
  if (note !== undefined && typeof note !== "string") {
    addError(diagnostics, `${path}.note`, "Set note must be a string.");
  }

  if (hasNewErrors(diagnostics, startIndex)) {
    return undefined;
  }

  return [
    {
      count: count as number,
      reps: reps as RepTarget,
      intensity,
      progression,
      note: note as string | undefined
    }
  ];
}

function parseSets(
  setsRaw: unknown,
  path: string,
  diagnostics: Diagnostic[]
): SetPrescription[] | undefined {
  if (typeof setsRaw === "string") {
    return parseSetShorthandBlock(setsRaw, path, diagnostics);
  }

  if (Array.isArray(setsRaw)) {
    const sets: SetPrescription[] = [];
    setsRaw.forEach((value, index) => {
      const parsed = parseSet(value, `${path}[${index}]`, diagnostics);
      if (parsed) {
        sets.push(...parsed);
      }
    });
    return sets;
  }

  addError(diagnostics, path, "sets must be an array, a shorthand string, or a shorthand block string.");
  return undefined;
}

function parseExerciseShorthand(
  source: string,
  path: string,
  diagnostics: Diagnostic[]
): ExercisePrescription | undefined {
  const startIndex = diagnostics.length;

  const lines = source.split(/\r?\n/);
  const meaningful = lines
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => line.replace(/^\-\s+/, ""));

  if (meaningful.length === 0) {
    addError(diagnostics, path, "Exercise shorthand cannot be empty.");
    return undefined;
  }

  const first = meaningful[0]!;
  const colonIndex = first.indexOf(":");
  const pipeIndex = first.indexOf("|");
  const splitIndex =
    colonIndex >= 0 && pipeIndex >= 0 ? Math.min(colonIndex, pipeIndex) : Math.max(colonIndex, pipeIndex);

  const name = splitIndex >= 0 ? first.slice(0, splitIndex).trim() : first.trim();
  const firstRemainder = splitIndex >= 0 ? first.slice(splitIndex + 1).trim() : "";

  if (name === "") {
    addError(diagnostics, path, "Exercise shorthand must start with an exercise name.");
    return undefined;
  }

  let restSeconds: number | undefined;
  const setLines: string[] = [];

  if (firstRemainder !== "") {
    setLines.push(firstRemainder);
  }

  meaningful.slice(1).forEach((line) => {
    const trimmed = line.trim();

    const restDirective = parseRestDirectiveSeconds(trimmed, `${path}.rest_seconds`, diagnostics);
    if (restDirective !== null) {
      if (restDirective !== undefined) {
        restSeconds = restDirective;
      }
      return;
    }

    setLines.push(trimmed);
  });

  // Pull out inline "rest ..." segments that may appear at the end of a semicolon-separated list.
  const normalizedSetLines: string[] = [];
  setLines.forEach((line) => {
    line
      .split(";")
      .map((segment) => segment.trim())
      .filter((segment) => segment !== "")
      .forEach((segment) => {
        const restDirective = parseRestDirectiveSeconds(segment, `${path}.rest_seconds`, diagnostics);
        if (restDirective !== null) {
          if (restDirective !== undefined) {
            restSeconds = restDirective;
          }
          return;
        }

        normalizedSetLines.push(segment);
      });
  });

  if (normalizedSetLines.length === 0) {
    addError(
      diagnostics,
      path,
      'Exercise shorthand must include at least one set line (e.g. "Bench Press: 5x5 @75%").'
    );
    return undefined;
  }

  const sets = parseSetShorthandBlock(normalizedSetLines.join("\n"), `${path}.sets`, diagnostics);

  if (sets.length === 0) {
    addError(diagnostics, `${path}.sets`, "Exercise shorthand produced no sets.");
  }

  if (hasNewErrors(diagnostics, startIndex)) {
    return undefined;
  }

  return {
    exercise: name,
    sets,
    rest_seconds: restSeconds
  };
}

function parseExercisesShorthandBlock(
  source: string,
  path: string,
  diagnostics: Diagnostic[]
): ExercisePrescription[] | undefined {
  const startIndex = diagnostics.length;

  const lines = source.split(/\r?\n/);
  const exercises: ExercisePrescription[] = [];

  let current: string[] = [];

  function flush(): void {
    if (current.length === 0) {
      return;
    }

    const block = current.join("\n");
    const parsed = parseExerciseShorthand(block, `${path}[${exercises.length}]`, diagnostics);
    if (parsed) {
      exercises.push(parsed);
    }
    current = [];
  }

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      return;
    }

    const content = trimmed.replace(/^\-\s+/, "");

    const isSetLine = /^\d/.test(content);
    const isRestLine = isRestDirectiveLine(content);
    const isHeaderLine = !isSetLine && !isRestLine;

    if (isHeaderLine) {
      flush();
      current.push(content);
      return;
    }

    if (current.length === 0) {
      addError(
        diagnostics,
        path,
        'Exercise block shorthand must start with an exercise name line (e.g. "Bench Press:").'
      );
      return;
    }

    current.push(content);
  });

  flush();

  if (hasNewErrors(diagnostics, startIndex)) {
    return undefined;
  }

  return exercises;
}

function parseExercise(
  exercise: unknown,
  path: string,
  diagnostics: Diagnostic[]
): ExercisePrescription | undefined {
  const startIndex = diagnostics.length;

  if (typeof exercise === "string") {
    return parseExerciseShorthand(exercise, path, diagnostics);
  }

  if (!isRecord(exercise)) {
    addError(diagnostics, path, "Exercise must be an object or shorthand string.");
    return undefined;
  }

  const name = exercise.exercise;
  if (typeof name !== "string" || name.trim() === "") {
    addError(diagnostics, `${path}.exercise`, "Exercise name is required.");
  }

  const hasRestSeconds = exercise.rest_seconds !== undefined;
  const hasRestAlias = exercise.rest !== undefined;

  if (hasRestSeconds && hasRestAlias) {
    addError(diagnostics, `${path}.rest_seconds`, "Specify either rest_seconds or rest, not both.");
    addError(diagnostics, `${path}.rest`, "Specify either rest_seconds or rest, not both.");
  }

  const restValue = hasRestAlias ? exercise.rest : exercise.rest_seconds;
  const restSeconds = parseDurationSeconds(
    restValue,
    hasRestAlias ? `${path}.rest` : `${path}.rest_seconds`,
    diagnostics
  );

  const sets = parseSets(exercise.sets, `${path}.sets`, diagnostics);

  if (!sets || sets.length === 0) {
    addError(diagnostics, `${path}.sets`, "Exercise must include sets.");
    return undefined;
  }

  if (hasNewErrors(diagnostics, startIndex)) {
    return undefined;
  }

  return {
    exercise: name as string,
    sets,
    rest_seconds: restSeconds
  };
}

function parseScheduleShorthand(
  schedule: string,
  path: string,
  diagnostics: Diagnostic[]
): SessionSchedule | undefined {
  let raw = schedule.trim();
  if (raw === "") {
    addError(diagnostics, path, "schedule shorthand cannot be empty.");
    return undefined;
  }

  let startOffset: number | undefined;

  const plusOffsetMatch = /\+\s*(?<offset>\d+)\s*$/i.exec(raw);
  if (plusOffsetMatch?.groups?.offset !== undefined) {
    startOffset = Number(plusOffsetMatch.groups.offset);
    raw = raw.slice(0, plusOffsetMatch.index).trim();
  } else {
    const offsetMatch = /\boffset\s+(?<offset>\d+)\s*$/i.exec(raw);
    if (offsetMatch?.groups?.offset !== undefined) {
      startOffset = Number(offsetMatch.groups.offset);
      raw = raw.slice(0, offsetMatch.index).trim();
    }
  }

  if (startOffset !== undefined) {
    if (!Number.isInteger(startOffset) || startOffset < 0) {
      addError(diagnostics, path, "schedule start offset must be an integer >= 0.");
      return undefined;
    }
  }

  const normalized = raw.replace(/\s+/g, " ").trim();

  if (/^every other day(s)?$/i.test(normalized)) {
    return { type: "interval_days", every: 2, start_offset_days: startOffset };
  }

  if (/^every day(s)?$/i.test(normalized)) {
    return { type: "interval_days", every: 1, start_offset_days: startOffset };
  }

  const intervalMatch = /^every\s+(?<every>\d+)\s*(?:d|day|days)$/i.exec(normalized);
  if (intervalMatch?.groups?.every !== undefined) {
    const every = Number(intervalMatch.groups.every);
    if (!Number.isInteger(every) || every < 1) {
      addError(diagnostics, path, "schedule interval must be an integer >= 1.");
      return undefined;
    }

    return { type: "interval_days", every, start_offset_days: startOffset };
  }

  const shortIntervalMatch = /^(?<every>\d+)\s*(?:d|day|days)$/i.exec(normalized);
  if (shortIntervalMatch?.groups?.every !== undefined) {
    const every = Number(shortIntervalMatch.groups.every);
    if (!Number.isInteger(every) || every < 1) {
      addError(diagnostics, path, "schedule interval must be an integer >= 1.");
      return undefined;
    }

    return { type: "interval_days", every, start_offset_days: startOffset };
  }

  const weekdaySource = normalized.replace(/^(?:on|every)\s+/i, "");
  const parsed = parseWeekdayList(weekdaySource);

  if (parsed.unknown.length > 0) {
    addError(
      diagnostics,
      path,
      `Invalid weekday(s) in schedule shorthand: ${parsed.unknown.join(", ")}.`
    );
    return undefined;
  }

  if (parsed.days.length === 0) {
    addError(
      diagnostics,
      path,
      'Invalid schedule shorthand. Use e.g. "every 4 days", "every other day", or "MON,FRI".'
    );
    return undefined;
  }

  return { type: "weekdays", days: parsed.days, start_offset_days: startOffset };
}

function parseScheduleObject(
  schedule: UnknownRecord,
  path: string,
  diagnostics: Diagnostic[]
): SessionSchedule | undefined {
  const startIndex = diagnostics.length;

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

function parseSchedule(
  schedule: unknown,
  path: string,
  diagnostics: Diagnostic[]
): SessionSchedule | undefined {
  if (typeof schedule === "string") {
    return parseScheduleShorthand(schedule, path, diagnostics);
  }

  if (!isRecord(schedule)) {
    addError(diagnostics, path, "schedule must be an object or shorthand string.");
    return undefined;
  }

  return parseScheduleObject(schedule, path, diagnostics);
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

  const exercisesRaw = session.exercises;
  const exercises: ExercisePrescription[] = [];

  if (typeof exercisesRaw === "string") {
    const parsed = parseExercisesShorthandBlock(exercisesRaw, `${path}.exercises`, diagnostics);
    if (!parsed || parsed.length === 0) {
      addError(diagnostics, `${path}.exercises`, "Session must include exercises.");
      return undefined;
    }

    exercises.push(...parsed);
  } else if (Array.isArray(exercisesRaw)) {
    if (exercisesRaw.length === 0) {
      addError(diagnostics, `${path}.exercises`, "Session must include exercises.");
      return undefined;
    }

    exercisesRaw.forEach((exerciseValue, index) => {
      const parsed = parseExercise(exerciseValue, `${path}.exercises[${index}]`, diagnostics);
      if (parsed) {
        exercises.push(parsed);
      }
    });
  } else {
    addError(diagnostics, `${path}.exercises`, "Session exercises must be an array or a shorthand block string.");
    return undefined;
  }

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

  const usesProgression = sessions.some((session) =>
    session.exercises.some((exercise) => exercise.sets.some((set) => set.progression !== undefined))
  );

  if (usesProgression && !calendar) {
    addError(diagnostics, "$.calendar", "calendar is required when using progression.");
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


