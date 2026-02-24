import type {
  DeloadModifiers,
  ExercisePrescription,
  ExerciseSubstitution,
  IntensityTarget,
  LanguageVersion,
  LoadUnit,
  PrescriptionConstraints,
  ProgramAst,
  ProgramCalendar,
  ProgramMetadata,
  ProgressionAction,
  ProgressionAggregation,
  ProgressionCondition,
  ProgressionCriteria,
  ProgressionRule,
  RepTarget,
  RepeatSpec,
  RoundingPolicy,
  Session,
  SessionGroup,
  SessionModifiers,
  SessionSchedule,
  SessionSlot,
  SetPrescription,
  SetRole,
  Tempo,
  WarmupSpec,
  WeeklyIncrementBy,
  Weekday
} from "../ast/types.js";
import { CURRENT_LANGUAGE_VERSION, SUPPORTED_LANGUAGE_VERSIONS } from "../ast/version.js";
import { parseIntensityExpression, parseRepTargetExpression, parseShorthand } from "../parse/parseShorthand.js";
import { parseDurationSecondsString } from "../util/duration.js";
import type { Diagnostic, ValidationResult } from "./diagnostics.js";

type UnknownRecord = Record<string, unknown>;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS: readonly Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const WEEKDAY_SET = new Set<string>(WEEKDAYS);
const COMPARISON_OP_SET = new Set<string>([">=", ">", "<=", "<", "==", "!="]);
const PROGRESSION_AGGREGATIONS: readonly ProgressionAggregation[] = [
  "all_sets",
  "any_set",
  "last_set",
  "total_reps",
  "avg_rpe",
  "min_load"
];
const RESERVED_SET_ROLES = new Set<string>([
  "warmup",
  "top",
  "backoff",
  "work",
  "amrap",
  "drop",
  "cluster",
  "giant",
  "circuit",
  "activation"
]);

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

function addError(diagnostics: Diagnostic[], path: string, message: string): void {
  diagnostics.push({ path, message, severity: "error" });
}

function addWarning(diagnostics: Diagnostic[], path: string, message: string): void {
  diagnostics.push({ path, message, severity: "warning" });
}

function hasNewErrors(diagnostics: Diagnostic[], startIndex: number): boolean {
  for (let index = startIndex; index < diagnostics.length; index += 1) {
    if (diagnostics[index]?.severity === "error") {
      return true;
    }
  }
  return false;
}

function normalizeAliasToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

function toUtcDate(dateIso: string): Date {
  return new Date(`${dateIso}T00:00:00Z`);
}

function formatIsoDateUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDaysIsoDate(startDateIso: string, days: number): string {
  const date = toUtcDate(startDateIso);
  date.setUTCDate(date.getUTCDate() + days);
  return formatIsoDateUtc(date);
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
    const parsed = parseDurationSecondsString(value);
    if (parsed === undefined) {
      addError(
        diagnostics,
        path,
        "Duration must be seconds (integer) or a string like 90s, 2m, 2m30s, or 2:30."
      );
      return undefined;
    }
    return parsed;
  }

  addError(diagnostics, path, "Duration must be an integer (seconds) or a duration string.");
  return undefined;
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

function parseStringArray(
  value: unknown,
  path: string,
  diagnostics: Diagnostic[],
  options: { minItems?: number } = {}
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    addError(diagnostics, path, "Expected an array of strings.");
    return undefined;
  }

  const result: string[] = [];
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (typeof item !== "string" || item.trim() === "") {
      addError(diagnostics, itemPath, "Expected a non-empty string.");
      return;
    }
    result.push(item.trim());
  });

  if (options.minItems !== undefined && result.length < options.minItems) {
    addError(diagnostics, path, `Expected at least ${options.minItems} item(s).`);
  }

  return result;
}

function parseLoadUnit(value: unknown, path: string, diagnostics: Diagnostic[]): LoadUnit | undefined {
  if (typeof value !== "string") {
    addError(diagnostics, path, "Unit must be kg or lb.");
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized !== "kg" && normalized !== "lb") {
    addError(diagnostics, path, "Unit must be kg or lb.");
    return undefined;
  }

  return normalized as LoadUnit;
}

function parseRoundingPolicy(
  rounding: unknown,
  path: string,
  diagnostics: Diagnostic[]
): RoundingPolicy | undefined {
  if (rounding === undefined) {
    return undefined;
  }

  const startIndex = diagnostics.length;
  if (!isRecord(rounding)) {
    addError(diagnostics, path, "rounding must be an object.");
    return undefined;
  }

  const roundToRaw = rounding.round_to;
  if (roundToRaw !== undefined) {
    if (typeof roundToRaw !== "number" || !Number.isFinite(roundToRaw) || roundToRaw <= 0) {
      addError(diagnostics, `${path}.round_to`, "round_to must be a number > 0.");
    }
  }

  const modeRaw = rounding.mode;
  if (modeRaw !== undefined) {
    if (modeRaw !== "nearest" && modeRaw !== "down" && modeRaw !== "up") {
      addError(diagnostics, `${path}.mode`, "mode must be nearest, down, or up.");
    }
  }

  const equipmentRaw = rounding.equipment;
  let equipment: RoundingPolicy["equipment"] | undefined;
  if (equipmentRaw !== undefined) {
    if (!isRecord(equipmentRaw)) {
      addError(diagnostics, `${path}.equipment`, "equipment must be an object.");
    } else {
      const parsed: NonNullable<RoundingPolicy["equipment"]> = {};
      (["barbell", "dumbbell", "machine"] as const).forEach((key) => {
        const current = equipmentRaw[key];
        if (current === undefined) {
          return;
        }
        if (typeof current !== "number" || !Number.isFinite(current) || current <= 0) {
          addError(diagnostics, `${path}.equipment.${key}`, "Equipment increment must be a number > 0.");
          return;
        }
        parsed[key] = current;
      });
      if (Object.keys(parsed).length > 0) {
        equipment = parsed;
      }
    }
  }

  if (hasNewErrors(diagnostics, startIndex)) {
    return undefined;
  }

  return {
    ...(roundToRaw !== undefined ? { round_to: roundToRaw as number } : {}),
    ...(modeRaw !== undefined ? { mode: modeRaw as "nearest" | "down" | "up" } : {}),
    ...(equipment ? { equipment } : {})
  };
}

function parseConstraints(
  constraints: unknown,
  path: string,
  diagnostics: Diagnostic[]
): PrescriptionConstraints | undefined {
  if (constraints === undefined) {
    return undefined;
  }

  const startIndex = diagnostics.length;
  if (!isRecord(constraints)) {
    addError(diagnostics, path, "constraints must be an object.");
    return undefined;
  }

  const parsed: PrescriptionConstraints = {};

  if (constraints.max_rpe !== undefined) {
    const value = constraints.max_rpe;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 1 || value > 10) {
      addError(diagnostics, `${path}.max_rpe`, "max_rpe must be a number between 1 and 10.");
    } else {
      parsed.max_rpe = value;
    }
  }

  if (constraints.min_rir !== undefined) {
    const value = constraints.min_rir;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 6) {
      addError(diagnostics, `${path}.min_rir`, "min_rir must be a number between 0 and 6.");
    } else {
      parsed.min_rir = value;
    }
  }

  if (constraints.max_sets !== undefined) {
    const value = constraints.max_sets;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      addError(diagnostics, `${path}.max_sets`, "max_sets must be an integer >= 1.");
    } else {
      parsed.max_sets = value;
    }
  }

  if (constraints.max_total_reps !== undefined) {
    const value = constraints.max_total_reps;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      addError(diagnostics, `${path}.max_total_reps`, "max_total_reps must be an integer >= 1.");
    } else {
      parsed.max_total_reps = value;
    }
  }

  if (constraints.stop_on_failure !== undefined) {
    if (typeof constraints.stop_on_failure !== "boolean") {
      addError(diagnostics, `${path}.stop_on_failure`, "stop_on_failure must be a boolean.");
    } else {
      parsed.stop_on_failure = constraints.stop_on_failure;
    }
  }

  if (constraints.velocity_loss_cap !== undefined) {
    const value = constraints.velocity_loss_cap;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
      addError(diagnostics, `${path}.velocity_loss_cap`, "velocity_loss_cap must be a number between 0 and 100.");
    } else {
      parsed.velocity_loss_cap = value;
    }
  }

  if (hasNewErrors(diagnostics, startIndex)) {
    return undefined;
  }

  return Object.keys(parsed).length > 0 ? parsed : undefined;
}

function parseRepeat(repeat: unknown, path: string, diagnostics: Diagnostic[]): RepeatSpec | undefined {
  if (repeat === undefined) {
    return undefined;
  }

  const startIndex = diagnostics.length;
  if (!isRecord(repeat)) {
    addError(diagnostics, path, "repeat must be an object.");
    return undefined;
  }

  let maxSets: number | undefined;
  if (repeat.max_sets !== undefined) {
    const value = repeat.max_sets;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      addError(diagnostics, `${path}.max_sets`, "repeat.max_sets must be an integer >= 1.");
    } else {
      maxSets = value;
    }
  }

  let until: RepeatSpec["until"] | undefined;
  if (repeat.until !== undefined) {
    const untilRaw = repeat.until;
    if (!isRecord(untilRaw)) {
      addError(diagnostics, `${path}.until`, "repeat.until must be an object.");
    } else if (untilRaw.metric === "failure") {
      if (untilRaw.op !== undefined && untilRaw.op !== "==" && untilRaw.op !== "!=") {
        addError(diagnostics, `${path}.until.op`, "failure metric only supports == or !=.");
      }
      if (untilRaw.value !== undefined && typeof untilRaw.value !== "boolean") {
        addError(diagnostics, `${path}.until.value`, "failure metric requires boolean value.");
      }
      until = {
        metric: "failure",
        op: (untilRaw.op as "==" | "!=" | undefined) ?? "==",
        value: (untilRaw.value as boolean | undefined) ?? true
      };
    } else {
      const metric = untilRaw.metric;
      if (metric !== "rpe" && metric !== "rir" && metric !== "velocity_loss") {
        addError(
          diagnostics,
          `${path}.until.metric`,
          "repeat.until.metric must be rpe, rir, velocity_loss, or failure."
        );
      }
      if (typeof untilRaw.op !== "string" || !COMPARISON_OP_SET.has(untilRaw.op)) {
        addError(diagnostics, `${path}.until.op`, "repeat.until.op must be a comparison operator.");
      }
      if (typeof untilRaw.value !== "number" || !Number.isFinite(untilRaw.value)) {
        addError(diagnostics, `${path}.until.value`, "repeat.until.value must be a finite number.");
      }

      if (
        (metric === "rpe" || metric === "rir" || metric === "velocity_loss") &&
        typeof untilRaw.op === "string" &&
        COMPARISON_OP_SET.has(untilRaw.op) &&
        typeof untilRaw.value === "number" &&
        Number.isFinite(untilRaw.value)
      ) {
        until = {
          metric,
          op: untilRaw.op as ">" | "<" | ">=" | "<=" | "==" | "!=",
          value: untilRaw.value
        };
      }
    }
  }

  if (hasNewErrors(diagnostics, startIndex)) {
    return undefined;
  }

  if (maxSets === undefined && until === undefined) {
    addError(diagnostics, path, "repeat requires at least one of max_sets or until.");
    return undefined;
  }

  return {
    ...(maxSets !== undefined ? { max_sets: maxSets } : {}),
    ...(until ? { until } : {})
  };
}

function parseTempo(tempo: unknown, path: string, diagnostics: Diagnostic[]): Tempo | undefined {
  if (tempo === undefined) {
    return undefined;
  }

  if (typeof tempo === "string") {
    if (tempo.trim() === "") {
      addError(diagnostics, path, "tempo string cannot be empty.");
      return undefined;
    }
    return tempo.trim();
  }

  if (!isRecord(tempo)) {
    addError(diagnostics, path, "tempo must be a string or object.");
    return undefined;
  }

  const result: NonNullable<Exclude<Tempo, string>> = {};
  (["eccentric", "pause_bottom", "concentric", "pause_top"] as const).forEach((key) => {
    const raw = tempo[key];
    if (raw === undefined) {
      return;
    }
    if (typeof raw !== "string" && typeof raw !== "number") {
      addError(diagnostics, `${path}.${key}`, `${key} must be a string or number.`);
      return;
    }
    result[key] = String(raw);
  });

  if (Object.keys(result).length === 0) {
    addError(diagnostics, path, "tempo object must include at least one field.");
    return undefined;
  }

  return result;
}

function parseRole(role: unknown, path: string, diagnostics: Diagnostic[]): SetRole | undefined {
  if (role === undefined) {
    return undefined;
  }

  if (typeof role !== "string" || role.trim() === "") {
    addError(diagnostics, path, "role must be a non-empty string.");
    return undefined;
  }

  return role.trim().toLowerCase() as SetRole;
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
    type !== "load_range" &&
    type !== "percent_of_set" &&
    type !== "load_delta_from_set"
  ) {
    addError(
      diagnostics,
      `${path}.type`,
      "Intensity type must be percent_1rm, rpe, rir, load, load_range, percent_of_set, or load_delta_from_set."
    );
    return undefined;
  }

  if (type === "percent_of_set") {
    const value = intensity.value;
    const role = parseRole(intensity.role, `${path}.role`, diagnostics);
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      addError(diagnostics, `${path}.value`, "percent_of_set value must be a number > 0.");
      return undefined;
    }
    if (!role) {
      return undefined;
    }
    return { type: "percent_of_set", role, value };
  }

  if (type === "load_delta_from_set") {
    const value = intensity.value;
    const role = parseRole(intensity.role, `${path}.role`, diagnostics);
    const unit = parseLoadUnit(intensity.unit, `${path}.unit`, diagnostics);
    if (typeof value !== "number" || !Number.isFinite(value)) {
      addError(diagnostics, `${path}.value`, "load_delta_from_set value must be a finite number.");
      return undefined;
    }
    if (!role || !unit) {
      return undefined;
    }
    return { type: "load_delta_from_set", role, value, unit };
  }

  const plusLoadRaw = intensity.plus_load;

  if (type === "load_range") {
    if (plusLoadRaw !== undefined) {
      addError(diagnostics, `${path}.plus_load`, "plus_load is only supported for percent_1rm.");
      return undefined;
    }
    const minRaw = intensity.min;
    const maxRaw = intensity.max;
    const unit = parseLoadUnit(intensity.unit, `${path}.unit`, diagnostics);
    if (typeof minRaw !== "number" || !Number.isFinite(minRaw) || !(minRaw > 0)) {
      addError(diagnostics, `${path}.min`, "load_range.min must be a number > 0.");
      return undefined;
    }
    if (typeof maxRaw !== "number" || !Number.isFinite(maxRaw) || maxRaw < minRaw) {
      addError(diagnostics, `${path}.max`, "load_range.max must be >= min.");
      return undefined;
    }
    if (!unit) {
      return undefined;
    }
    return { type: "load_range", min: minRaw, max: maxRaw, unit };
  }

  const value = intensity.value;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    addError(diagnostics, `${path}.value`, "Intensity value must be a finite number.");
    return undefined;
  }

  if (type === "percent_1rm") {
    if (!(value > 0 && value <= 150)) {
      addError(diagnostics, `${path}.value`, "percent_1rm value must be > 0 and <= 150.");
      return undefined;
    }

    let plus_load: { value: number; unit: LoadUnit } | undefined;
    if (plusLoadRaw !== undefined) {
      if (!isRecord(plusLoadRaw)) {
        addError(diagnostics, `${path}.plus_load`, "plus_load must be an object {value,unit}.");
        return undefined;
      }

      if (typeof plusLoadRaw.value !== "number" || !Number.isFinite(plusLoadRaw.value)) {
        addError(diagnostics, `${path}.plus_load.value`, "plus_load.value must be a finite number.");
        return undefined;
      }

      const unit = parseLoadUnit(plusLoadRaw.unit, `${path}.plus_load.unit`, diagnostics);
      if (!unit) {
        return undefined;
      }
      plus_load = { value: plusLoadRaw.value, unit };
    }

    return { type: "percent_1rm", value, ...(plus_load ? { plus_load } : {}) };
  }

  if (plusLoadRaw !== undefined) {
    addError(diagnostics, `${path}.plus_load`, "plus_load is only supported for percent_1rm.");
    return undefined;
  }

  if (type === "rpe") {
    if (!(value >= 1 && value <= 10)) {
      addError(diagnostics, `${path}.value`, "rpe value must be between 1 and 10.");
      return undefined;
    }
    return { type: "rpe", value };
  }

  if (type === "rir") {
    if (!(value >= 0 && value <= 6)) {
      addError(diagnostics, `${path}.value`, "rir value must be between 0 and 6.");
      return undefined;
    }
    return { type: "rir", value };
  }

  const unit = parseLoadUnit(intensity.unit, `${path}.unit`, diagnostics);
  if (!unit) {
    return undefined;
  }
  if (!(value > 0)) {
    addError(diagnostics, `${path}.value`, "load value must be > 0.");
    return undefined;
  }

  return { type: "load", value, unit };
}

function parseProgressionCondition(
  condition: unknown,
  intensity: IntensityTarget | undefined,
  path: string,
  diagnostics: Diagnostic[]
): ProgressionCondition | undefined {
  if (condition === undefined) {
    return undefined;
  }

  if (!isRecord(condition)) {
    addError(diagnostics, path, "progression condition must be an object.");
    return undefined;
  }

  const type = condition.type;
  if (type !== "session_success" && type !== "metric_vs_target" && type !== "aggregate_metric") {
    addError(
      diagnostics,
      `${path}.type`,
      "progression condition type must be session_success, metric_vs_target, or aggregate_metric."
    );
    return undefined;
  }

  if (type === "session_success") {
    if (condition.equals !== undefined && typeof condition.equals !== "boolean") {
      addError(diagnostics, `${path}.equals`, "session_success.equals must be a boolean.");
      return undefined;
    }
    return { type: "session_success", equals: condition.equals as boolean | undefined };
  }

  if (type === "aggregate_metric") {
    const metricRaw = condition.metric;
    if (metricRaw !== "total_reps" && metricRaw !== "avg_rpe" && metricRaw !== "min_load") {
      addError(diagnostics, `${path}.metric`, "aggregate_metric.metric must be total_reps, avg_rpe, or min_load.");
      return undefined;
    }
    if (typeof condition.op !== "string" || !COMPARISON_OP_SET.has(condition.op)) {
      addError(diagnostics, `${path}.op`, "aggregate_metric.op must be a comparison operator.");
      return undefined;
    }
    if (typeof condition.value !== "number" || !Number.isFinite(condition.value)) {
      addError(diagnostics, `${path}.value`, "aggregate_metric.value must be a finite number.");
      return undefined;
    }

    let unit: LoadUnit | undefined;
    if (metricRaw === "min_load" && condition.unit !== undefined) {
      unit = parseLoadUnit(condition.unit, `${path}.unit`, diagnostics);
    }

    return {
      type: "aggregate_metric",
      metric: metricRaw,
      op: condition.op as ">" | "<" | ">=" | "<=" | "==" | "!=",
      value: condition.value,
      ...(unit ? { unit } : {})
    };
  }

  if (!intensity) {
    addError(diagnostics, path, "metric_vs_target requires a set intensity.");
    return undefined;
  }

  if (intensity.type === "percent_1rm" || intensity.type === "percent_of_set" || intensity.type === "load_delta_from_set") {
    addError(
      diagnostics,
      path,
      "metric_vs_target currently supports load/load_range/rpe/rir intensities only."
    );
    return undefined;
  }

  const metricRaw = condition.metric;
  if (metricRaw !== "load" && metricRaw !== "rpe" && metricRaw !== "rir") {
    addError(diagnostics, `${path}.metric`, "metric must be load, rpe, or rir.");
    return undefined;
  }
  if (typeof condition.op !== "string" || !COMPARISON_OP_SET.has(condition.op)) {
    addError(diagnostics, `${path}.op`, "op must be one of: >=, >, <=, <, ==, !=.");
    return undefined;
  }

  const target = (condition.target ?? (intensity.type === "load_range" ? "max" : "value")) as
    | "value"
    | "min"
    | "max";
  if (target !== "value" && target !== "min" && target !== "max") {
    addError(diagnostics, `${path}.target`, "target must be value, min, or max.");
    return undefined;
  }

  if (intensity.type === "load_range") {
    if (metricRaw !== "load") {
      addError(diagnostics, `${path}.metric`, "load_range conditions must use load metric.");
      return undefined;
    }
    if (target === "value") {
      addError(diagnostics, `${path}.target`, "load_range conditions require target min or max.");
      return undefined;
    }
  } else if (intensity.type === "load") {
    if (metricRaw !== "load") {
      addError(diagnostics, `${path}.metric`, "load conditions must use load metric.");
      return undefined;
    }
    if (target !== "value") {
      addError(diagnostics, `${path}.target`, "load conditions only support target value.");
      return undefined;
    }
  } else if (intensity.type === "rpe") {
    if (metricRaw !== "rpe") {
      addError(diagnostics, `${path}.metric`, "rpe conditions must use rpe metric.");
      return undefined;
    }
    if (target !== "value") {
      addError(diagnostics, `${path}.target`, "rpe conditions only support target value.");
      return undefined;
    }
  } else if (intensity.type === "rir") {
    if (metricRaw !== "rir") {
      addError(diagnostics, `${path}.metric`, "rir conditions must use rir metric.");
      return undefined;
    }
    if (target !== "value") {
      addError(diagnostics, `${path}.target`, "rir conditions only support target value.");
      return undefined;
    }
  }

  return {
    type: "metric_vs_target",
    metric: metricRaw,
    op: condition.op as ">" | "<" | ">=" | "<=" | "==" | "!=",
    target
  };
}

function parseProgressionCadence(
  cadence: unknown,
  path: string,
  diagnostics: Diagnostic[]
): { type: "weeks"; every?: number } | { type: "sessions"; every?: number; on_weekdays?: Weekday[] } | undefined {
  if (cadence === undefined) {
    return undefined;
  }

  const startIndex = diagnostics.length;
  if (!isRecord(cadence)) {
    addError(diagnostics, path, "progression.cadence must be an object.");
    return undefined;
  }

  if (cadence.type !== "weeks" && cadence.type !== "sessions") {
    addError(diagnostics, `${path}.type`, "progression.cadence.type must be weeks or sessions.");
    return undefined;
  }

  if (cadence.every !== undefined) {
    if (typeof cadence.every !== "number" || !Number.isInteger(cadence.every) || cadence.every < 1) {
      addError(diagnostics, `${path}.every`, "progression.cadence.every must be an integer >= 1.");
    }
  }

  if (cadence.type === "weeks") {
    if (cadence.on_weekdays !== undefined) {
      addError(diagnostics, `${path}.on_weekdays`, "on_weekdays is only valid for sessions cadence.");
    }
    if (hasNewErrors(diagnostics, startIndex)) {
      return undefined;
    }
    return { type: "weeks", ...(cadence.every !== undefined ? { every: cadence.every as number } : {}) };
  }

  let on_weekdays: Weekday[] | undefined;
  if (cadence.on_weekdays !== undefined) {
    if (!Array.isArray(cadence.on_weekdays) || cadence.on_weekdays.length === 0) {
      addError(diagnostics, `${path}.on_weekdays`, "on_weekdays must be a non-empty array.");
    } else {
      const parsed: Weekday[] = [];
      cadence.on_weekdays.forEach((day, index) => {
        if (typeof day !== "string" || !WEEKDAY_SET.has(day)) {
          addError(diagnostics, `${path}.on_weekdays[${index}]`, `Invalid weekday. Expected one of: ${WEEKDAYS.join(", ")}.`);
          return;
        }
        parsed.push(day as Weekday);
      });
      if (parsed.length > 0) {
        on_weekdays = parsed;
      }
    }
  }

  if (hasNewErrors(diagnostics, startIndex)) {
    return undefined;
  }

  return {
    type: "sessions",
    ...(cadence.every !== undefined ? { every: cadence.every as number } : {}),
    ...(on_weekdays ? { on_weekdays } : {})
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
    addError(diagnostics, path, "progression shorthand must start with an increment.");
    return undefined;
  }

  const byMatch =
    /^\s*(?<sign>[+-])?\s*(?<value>\d+(?:\.\d+)?)\s*(?<unit>%\s*(?:1\s*rm)?|rpe|rir|kg|kgs|lb|lbs)?/i.exec(main);
  if (!byMatch?.groups?.value) {
    addError(diagnostics, path, "progression shorthand must start with an increment.");
    return undefined;
  }

  const sign = byMatch.groups.sign === "-" ? -1 : 1;
  const value = Number(byMatch.groups.value) * sign;
  if (!Number.isFinite(value)) {
    addError(diagnostics, path, "Invalid progression increment.");
    return undefined;
  }

  let by: WeeklyIncrementBy = value;
  if (byMatch.groups.unit) {
    const unitToken = byMatch.groups.unit.replace(/\s+/g, "").toLowerCase();
    if (unitToken === "kg" || unitToken === "kgs" || unitToken === "lb" || unitToken === "lbs") {
      const unit = unitToken.startsWith("kg") ? "kg" : "lb";
      if (intensity.type === "load" || intensity.type === "load_range") {
        if (intensity.unit !== unit) {
          addError(diagnostics, path, `Progression unit ${unit} does not match intensity unit ${intensity.unit}.`);
          return undefined;
        }
      } else if (intensity.type === "percent_1rm") {
        by = { type: "load", value, unit };
      } else {
        addError(diagnostics, path, "Load units are only valid for load/load_range or percent_1rm intensities.");
        return undefined;
      }
    }
  }

  let remainder = main.slice(byMatch[0].length).trim();
  let onWeekdays: Weekday[] | undefined;

  const onMatch = /\b(?:on|only)\s+(?<days>[A-Za-z,\s/]+)$/i.exec(remainder);
  if (onMatch?.groups?.days !== undefined) {
    const parsedDays = parseWeekdayList(onMatch.groups.days);
    if (parsedDays.unknown.length > 0) {
      addError(diagnostics, path, `Invalid weekday(s): ${parsedDays.unknown.join(", ")}.`);
      return undefined;
    }
    onWeekdays = parsedDays.days.length > 0 ? parsedDays.days : undefined;
    remainder = remainder.slice(0, onMatch.index).trim();
  }

  let cadence: { type: "weeks"; every?: number } | { type: "sessions"; every?: number; on_weekdays?: Weekday[] } = {
    type: "weeks",
    every: 1
  };
  if (remainder !== "") {
    const cadenceMatch =
      /^(?:every\s+)?(?<every>\d+)?\s*(?<unit>week|weeks|w|session|sessions|s)$/i.exec(remainder);
    if (cadenceMatch?.groups?.unit) {
      cadence =
        cadenceMatch.groups.unit.toLowerCase().startsWith("w")
          ? { type: "weeks", every: cadenceMatch.groups.every ? Number(cadenceMatch.groups.every) : 1 }
          : { type: "sessions", every: cadenceMatch.groups.every ? Number(cadenceMatch.groups.every) : 1 };
    } else if (/^weekly$/i.test(remainder)) {
      cadence = { type: "weeks", every: 1 };
    } else {
      addError(diagnostics, path, "Invalid cadence shorthand.");
      return undefined;
    }
  }

  if (onWeekdays) {
    if (cadence.type === "weeks") {
      cadence = { type: "sessions", every: cadence.every ?? 1, on_weekdays: onWeekdays };
    } else {
      cadence = { ...cadence, on_weekdays: onWeekdays };
    }
  }

  let when: UnknownRecord | undefined;
  if (conditionRaw) {
    if (/^(success|succeeded|pass|passed)$/i.test(conditionRaw)) {
      when = { type: "session_success", equals: true };
    } else if (/^(fail|failed|failure)$/i.test(conditionRaw)) {
      when = { type: "session_success", equals: false };
    } else {
      const metricMatch =
        /^(?<metric>load|rpe|rir)\s*(?<op>>=|>|<=|<|==|!=)\s*(?<target>target|value|min|max)?$/i.exec(conditionRaw);
      if (!metricMatch?.groups?.metric || !metricMatch.groups.op) {
        addError(diagnostics, path, "Invalid progression condition.");
        return undefined;
      }
      const targetToken = metricMatch.groups.target?.toLowerCase();
      const normalizedTarget =
        targetToken === "target"
          ? "value"
          : targetToken === "value" || targetToken === "min" || targetToken === "max"
            ? targetToken
            : undefined;
      when = {
        type: "metric_vs_target",
        metric: metricMatch.groups.metric.toLowerCase(),
        op: metricMatch.groups.op,
        ...(normalizedTarget ? { target: normalizedTarget } : {})
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

function parseProgressionAggregation(
  aggregation: unknown,
  path: string,
  diagnostics: Diagnostic[]
): ProgressionAggregation | undefined {
  if (aggregation === undefined) {
    return undefined;
  }
  if (typeof aggregation !== "string" || !PROGRESSION_AGGREGATIONS.includes(aggregation as ProgressionAggregation)) {
    addError(
      diagnostics,
      path,
      `aggregation must be one of: ${PROGRESSION_AGGREGATIONS.join(", ")}.`
    );
    return undefined;
  }
  return aggregation as ProgressionAggregation;
}

function parseProgressionCriteria(
  criteria: unknown,
  intensity: IntensityTarget | undefined,
  path: string,
  diagnostics: Diagnostic[]
): ProgressionCriteria | undefined {
  if (criteria === undefined) {
    return undefined;
  }

  if (!isRecord(criteria)) {
    addError(diagnostics, path, "progression.criteria must be an object.");
    return undefined;
  }

  const aggregation = parseProgressionAggregation(criteria.aggregation, `${path}.aggregation`, diagnostics);
  const condition = parseProgressionCondition(criteria.condition, intensity, `${path}.condition`, diagnostics);

  if (!aggregation && !condition) {
    addError(diagnostics, path, "progression.criteria must include aggregation and/or condition.");
    return undefined;
  }

  return {
    ...(aggregation ? { aggregation } : {}),
    ...(condition ? { condition } : {})
  };
}

function parseProgressionAction(
  action: unknown,
  path: string,
  diagnostics: Diagnostic[]
): ProgressionAction | undefined {
  if (!isRecord(action)) {
    addError(diagnostics, path, "action must be an object.");
    return undefined;
  }

  const type = action.type;
  if (type !== "repeat_week" && type !== "reduce_load" && type !== "reduce_volume" && type !== "switch_variant") {
    addError(diagnostics, `${path}.type`, "action.type must be repeat_week, reduce_load, reduce_volume, or switch_variant.");
    return undefined;
  }

  if (type === "repeat_week") {
    return { type: "repeat_week" };
  }

  if (type === "reduce_load") {
    if (typeof action.by === "number") {
      if (!Number.isFinite(action.by)) {
        addError(diagnostics, `${path}.by`, "reduce_load.by must be finite.");
        return undefined;
      }
      return { type: "reduce_load", by: action.by };
    }
    if (isRecord(action.by) && action.by.value !== undefined && action.by.unit !== undefined) {
      const unit = parseLoadUnit(action.by.unit, `${path}.by.unit`, diagnostics);
      if (typeof action.by.value !== "number" || !Number.isFinite(action.by.value) || !unit) {
        addError(diagnostics, `${path}.by`, "reduce_load.by load delta must include finite value and unit.");
        return undefined;
      }
      return { type: "reduce_load", by: { value: action.by.value, unit } };
    }
    addError(diagnostics, `${path}.by`, "reduce_load.by must be a number or {value,unit}.");
    return undefined;
  }

  if (type === "reduce_volume") {
    if (typeof action.by !== "number" || !Number.isFinite(action.by) || action.by <= 0) {
      addError(diagnostics, `${path}.by`, "reduce_volume.by must be a number > 0.");
      return undefined;
    }
    return { type: "reduce_volume", by: action.by };
  }

  if (typeof action.to_exercise_id !== "string" || action.to_exercise_id.trim() === "") {
    addError(diagnostics, `${path}.to_exercise_id`, "switch_variant.to_exercise_id is required.");
    return undefined;
  }
  return { type: "switch_variant", to_exercise_id: action.to_exercise_id.trim() };
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
      addError(diagnostics, path, "progression shorthand requires intensity.");
      return undefined;
    }
    progressionValue = parseProgressionShorthand(progression, intensity, path, diagnostics);
    if (!progressionValue) {
      return undefined;
    }
  }

  if (!isRecord(progressionValue)) {
    addError(diagnostics, path, "progression must be an object or shorthand string.");
    return undefined;
  }

  if (progressionValue.type === "auto_adjust") {
    const scope = progressionValue.scope;
    if (scope !== undefined && scope !== "set" && scope !== "exercise" && scope !== "session") {
      addError(diagnostics, `${path}.scope`, "scope must be set, exercise, or session.");
    }
    const criteria = parseProgressionCriteria(progressionValue.criteria, intensity, `${path}.criteria`, diagnostics);

    let actions: ProgressionAction[] | undefined;
    if (!Array.isArray(progressionValue.actions) || progressionValue.actions.length === 0) {
      addError(diagnostics, `${path}.actions`, "auto_adjust.actions must be a non-empty array.");
    } else {
      const parsed: ProgressionAction[] = [];
      progressionValue.actions.forEach((entry, index) => {
        const action = parseProgressionAction(entry, `${path}.actions[${index}]`, diagnostics);
        if (action) {
          parsed.push(action);
        }
      });
      actions = parsed;
    }

    if (hasNewErrors(diagnostics, startIndex) || !criteria || !actions || actions.length === 0) {
      return undefined;
    }

    return {
      type: "auto_adjust",
      ...(scope ? { scope: scope as "set" | "exercise" | "session" } : {}),
      criteria,
      actions
    };
  }

  if (progressionValue.type !== "weekly_increment" && progressionValue.type !== "increment") {
    addError(diagnostics, `${path}.type`, "progression.type must be weekly_increment, increment, or auto_adjust.");
    return undefined;
  }

  if (!intensity) {
    addError(diagnostics, path, "increment progression requires intensity.");
    return undefined;
  }

  const when = parseProgressionCondition(progressionValue.when, intensity, `${path}.when`, diagnostics);
  const criteria = parseProgressionCriteria(
    progressionValue.criteria,
    intensity,
    `${path}.criteria`,
    diagnostics
  );
  if (when && criteria?.condition) {
    addError(diagnostics, `${path}.criteria.condition`, "Specify progression.when or progression.criteria.condition, not both.");
  }

  const cadence = parseProgressionCadence(progressionValue.cadence, `${path}.cadence`, diagnostics);
  if (progressionValue.type === "increment" && cadence === undefined) {
    addError(diagnostics, `${path}.cadence`, "increment progression requires cadence.");
  }

  const scope = progressionValue.scope;
  if (scope !== undefined && scope !== "set" && scope !== "exercise" && scope !== "session") {
    addError(diagnostics, `${path}.scope`, "scope must be set, exercise, or session.");
  }

  if (progressionValue.by === undefined) {
    addError(diagnostics, `${path}.by`, "increment progression requires by.");
    return undefined;
  }

  let by: WeeklyIncrementBy | undefined;
  if (isRecord(progressionValue.by) && progressionValue.by.type === "load") {
    const unit = parseLoadUnit(progressionValue.by.unit, `${path}.by.unit`, diagnostics);
    if (typeof progressionValue.by.value !== "number" || !Number.isFinite(progressionValue.by.value) || !unit) {
      addError(diagnostics, `${path}.by.value`, "by.value must be a finite number.");
    } else {
      by = { type: "load", value: progressionValue.by.value, unit };
    }
  } else if (intensity.type === "load_range" && isRecord(progressionValue.by)) {
    const min = progressionValue.by.min;
    const max = progressionValue.by.max;
    if (min === undefined && max === undefined) {
      addError(diagnostics, `${path}.by`, "by must include min and/or max.");
    } else if (
      (min !== undefined && (typeof min !== "number" || !Number.isFinite(min))) ||
      (max !== undefined && (typeof max !== "number" || !Number.isFinite(max)))
    ) {
      addError(diagnostics, `${path}.by`, "by.min/by.max must be finite numbers.");
    } else {
      by = {
        ...(min !== undefined ? { min: min as number } : {}),
        ...(max !== undefined ? { max: max as number } : {})
      };
    }
  } else if (typeof progressionValue.by === "number" && Number.isFinite(progressionValue.by)) {
    by = progressionValue.by;
  } else {
    addError(diagnostics, `${path}.by`, "by must be a finite number, load delta object, or {min,max}.");
  }

  if (hasNewErrors(diagnostics, startIndex) || by === undefined) {
    return undefined;
  }

  return {
    type: progressionValue.type as "weekly_increment" | "increment",
    when,
    by,
    cadence,
    ...(scope ? { scope: scope as "set" | "exercise" | "session" } : {}),
    ...(criteria ? { criteria } : {})
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
    addError(diagnostics, path, "Reps must be an integer, range object, or shorthand string.");
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

function parseWarmup(warmup: unknown, path: string, diagnostics: Diagnostic[]): WarmupSpec | undefined {
  if (warmup === undefined) {
    return undefined;
  }

  const startIndex = diagnostics.length;
  if (!isRecord(warmup)) {
    addError(diagnostics, path, "warmup must be an object.");
    return undefined;
  }

  const type = warmup.type ?? "percent_ramp";
  const based_on_role = parseRole(warmup.based_on_role, `${path}.based_on_role`, diagnostics);

  if (type === "percent_ramp") {
    if (typeof warmup.from_percent !== "number" || !Number.isFinite(warmup.from_percent) || warmup.from_percent <= 0) {
      addError(diagnostics, `${path}.from_percent`, "from_percent must be a number > 0.");
    }
    if (typeof warmup.to_percent !== "number" || !Number.isFinite(warmup.to_percent) || warmup.to_percent <= 0) {
      addError(diagnostics, `${path}.to_percent`, "to_percent must be a number > 0.");
    }
    if (
      typeof warmup.from_percent === "number" &&
      typeof warmup.to_percent === "number" &&
      warmup.to_percent < warmup.from_percent
    ) {
      addError(diagnostics, `${path}.to_percent`, "to_percent must be >= from_percent.");
    }
    if (typeof warmup.steps !== "number" || !Number.isInteger(warmup.steps) || warmup.steps < 1) {
      addError(diagnostics, `${path}.steps`, "steps must be an integer >= 1.");
    }
    const reps = parseRepTarget(warmup.reps ?? 5, `${path}.reps`, diagnostics);
    if (hasNewErrors(diagnostics, startIndex) || !reps) {
      return undefined;
    }
    return {
      type: "percent_ramp",
      from_percent: warmup.from_percent as number,
      to_percent: warmup.to_percent as number,
      steps: warmup.steps as number,
      reps,
      ...(based_on_role ? { based_on_role } : {})
    };
  }

  if (type === "steps") {
    if (!Array.isArray(warmup.steps) || warmup.steps.length === 0) {
      addError(diagnostics, `${path}.steps`, "steps warmup requires a non-empty steps array.");
      return undefined;
    }

    const steps: Array<{ percent?: number; reps?: RepTarget; note?: string }> = [];
    warmup.steps.forEach((entry, index) => {
      if (!isRecord(entry)) {
        addError(diagnostics, `${path}.steps[${index}]`, "Warmup step must be an object.");
        return;
      }
      let percent: number | undefined;
      if (entry.percent !== undefined) {
        if (typeof entry.percent !== "number" || !Number.isFinite(entry.percent) || entry.percent <= 0) {
          addError(diagnostics, `${path}.steps[${index}].percent`, "percent must be a number > 0.");
        } else {
          percent = entry.percent;
        }
      }
      const reps = entry.reps !== undefined ? parseRepTarget(entry.reps, `${path}.steps[${index}].reps`, diagnostics) : undefined;
      let note: string | undefined;
      if (entry.note !== undefined) {
        if (typeof entry.note !== "string" || entry.note.trim() === "") {
          addError(diagnostics, `${path}.steps[${index}].note`, "note must be a non-empty string.");
        } else {
          note = entry.note.trim();
        }
      }
      steps.push({
        ...(percent !== undefined ? { percent } : {}),
        ...(reps ? { reps } : {}),
        ...(note ? { note } : {})
      });
    });

    if (hasNewErrors(diagnostics, startIndex)) {
      return undefined;
    }

    return {
      type: "steps",
      steps,
      ...(based_on_role ? { based_on_role } : {})
    };
  }

  addError(diagnostics, `${path}.type`, 'warmup.type must be "percent_ramp" or "steps".');
  return undefined;
}

function parseSubstitutions(
  substitutions: unknown,
  path: string,
  diagnostics: Diagnostic[]
): ExerciseSubstitution[] | undefined {
  if (substitutions === undefined) {
    return undefined;
  }
  if (!Array.isArray(substitutions)) {
    addError(diagnostics, path, "substitutions must be an array.");
    return undefined;
  }

  const result: ExerciseSubstitution[] = [];
  substitutions.forEach((entry, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      addError(diagnostics, itemPath, "substitution entry must be an object.");
      return;
    }

    const exercise_id =
      typeof entry.exercise_id === "string" && entry.exercise_id.trim() !== ""
        ? entry.exercise_id.trim()
        : undefined;
    const exercise =
      typeof entry.exercise === "string" && entry.exercise.trim() !== "" ? entry.exercise.trim() : undefined;
    if (!exercise_id && !exercise) {
      addError(diagnostics, itemPath, "substitution requires exercise_id or exercise.");
      return;
    }

    let rank: number | undefined;
    if (entry.rank !== undefined) {
      if (typeof entry.rank !== "number" || !Number.isInteger(entry.rank) || entry.rank < 1) {
        addError(diagnostics, `${itemPath}.rank`, "rank must be an integer >= 1.");
      } else {
        rank = entry.rank;
      }
    }

    const tags = parseStringArray(entry.tags, `${itemPath}.tags`, diagnostics);
    let constraints: ExerciseSubstitution["constraints"] | undefined;
    if (entry.constraints !== undefined) {
      if (!isRecord(entry.constraints)) {
        addError(diagnostics, `${itemPath}.constraints`, "constraints must be an object.");
      } else {
        const requires = parseStringArray(
          entry.constraints.requires,
          `${itemPath}.constraints.requires`,
          diagnostics
        );
        if (requires && requires.length > 0) {
          constraints = { requires };
        }
      }
    }

    result.push({
      ...(exercise_id ? { exercise_id } : {}),
      ...(exercise ? { exercise } : {}),
      ...(rank !== undefined ? { rank } : {}),
      ...(tags && tags.length > 0 ? { tags } : {}),
      ...(constraints ? { constraints } : {})
    });
  });

  return result;
}

function parseInlineStringMap(
  value: unknown,
  path: string,
  diagnostics: Diagnostic[]
): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    addError(diagnostics, path, "Expected an object map of strings.");
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "string" || raw.trim() === "") {
      addError(diagnostics, `${path}.${key}`, "Map values must be non-empty strings.");
      continue;
    }
    result[key] = raw.trim();
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function parseSetShorthandBlock(raw: string, path: string, diagnostics: Diagnostic[]): SetPrescription[] {
  const sets: SetPrescription[] = [];
  const annotateLinePaths = /[\r\n]/.test(raw) || raw.includes(";");
  const lines = raw.split(/\r?\n/);
  let lastSet: SetPrescription | undefined;

  const looksLikeProgressionShorthand = (entry: string): boolean => /^[+-]\s*\d/.test(entry.trim());

  lines.forEach((line, lineIndex) => {
    const lineNumber = lineIndex + 1;
    const trimmedLine = line.trim();
    if (trimmedLine === "" || trimmedLine.startsWith("#")) {
      return;
    }

    const segments = trimmedLine.split(";");
    segments.forEach((segment) => {
      let entry = segment.trim();
      if (entry === "" || entry.startsWith("#")) {
        return;
      }

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

      const linePath = annotateLinePaths ? `${path}[line ${lineNumber}]` : path;

      if (looksLikeProgressionShorthand(entry)) {
        if (!lastSet) {
          addError(
            diagnostics,
            `${linePath}.progression`,
            "Inline progression shorthand must follow a set shorthand in the same block."
          );
          return;
        }

        if (lastSet.progression !== undefined) {
          addError(
            diagnostics,
            `${linePath}.progression`,
            "Set already has progression; remove duplicate inline progression shorthand."
          );
          return;
        }

        const progression = parseProgression(entry, lastSet.intensity, `${linePath}.progression`, diagnostics);
        if (progression) {
          lastSet.progression = progression;
        }
        return;
      }

      try {
        const parsed = parseShorthand(entry);
        const intensity = parseIntensity(parsed.intensity, `${linePath}.intensity`, diagnostics);
        if (parsed.intensity !== undefined && intensity === undefined) {
          return;
        }
        const setValue: SetPrescription = { ...parsed, intensity };
        if (note) {
          setValue.note = note;
        }
        sets.push(setValue);
        lastSet = setValue;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid shorthand expression.";
        addError(diagnostics, annotateLinePaths ? `${path}[line ${lineNumber}]` : path, message);
      }
    });
  });

  return sets;
}

function validateRoleReferences(
  exercise: ExercisePrescription,
  path: string,
  diagnostics: Diagnostic[]
): void {
  const seenRoles = new Set<string>();
  exercise.sets.forEach((set, index) => {
    const intensity = set.intensity;
    if (intensity && (intensity.type === "percent_of_set" || intensity.type === "load_delta_from_set")) {
      if (!seenRoles.has(intensity.role)) {
        addError(
          diagnostics,
          `${path}.sets[${index}].intensity.role`,
          `Referenced role "${intensity.role}" must exist in a prior set.`
        );
      }
    }
    if (set.role) {
      seenRoles.add(set.role);
    }
  });

  const basedOnRole = exercise.warmup?.based_on_role;
  if (basedOnRole && !exercise.sets.some((set) => set.role === basedOnRole)) {
    addError(
      diagnostics,
      `${path}.warmup.based_on_role`,
      `warmup.based_on_role "${basedOnRole}" must match at least one set role.`
    );
  }
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
      addError(diagnostics, path, "Set may specify shorthand or structured fields, not both.");
      return undefined;
    }

    const shorthandSets = parseSetShorthandBlock(shorthandRaw, `${path}.shorthand`, diagnostics);
    const wrapperRole = parseRole(set.role, `${path}.role`, diagnostics);
    const wrapperConstraints = parseConstraints(set.constraints, `${path}.constraints`, diagnostics);
    const wrapperRepeat = parseRepeat(set.repeat, `${path}.repeat`, diagnostics);
    const wrapperTempo = parseTempo(set.tempo, `${path}.tempo`, diagnostics);
    const hasWrapperRestSeconds = set.rest_seconds !== undefined;
    const hasWrapperRestAlias = set.rest !== undefined;
    if (hasWrapperRestSeconds && hasWrapperRestAlias) {
      addError(diagnostics, `${path}.rest_seconds`, "Specify either rest_seconds or rest, not both.");
      addError(diagnostics, `${path}.rest`, "Specify either rest_seconds or rest, not both.");
    }
    const wrapperRestSeconds = parseDurationSeconds(
      hasWrapperRestAlias ? set.rest : set.rest_seconds,
      hasWrapperRestAlias ? `${path}.rest` : `${path}.rest_seconds`,
      diagnostics
    );
    const wrapperRestBefore = parseDurationSeconds(
      set.rest_before ?? set.rest_before_seconds,
      set.rest_before !== undefined ? `${path}.rest_before` : `${path}.rest_before_seconds`,
      diagnostics
    );
    const wrapperRestAfter = parseDurationSeconds(
      set.rest_after ?? set.rest_after_seconds,
      set.rest_after !== undefined ? `${path}.rest_after` : `${path}.rest_after_seconds`,
      diagnostics
    );

    const expanded: SetPrescription[] = [];
    shorthandSets.forEach((entry) => {
      const progression = parseProgression(set.progression, entry.intensity, `${path}.progression`, diagnostics);
      expanded.push({
        ...entry,
        ...(wrapperRole && !entry.role ? { role: wrapperRole } : {}),
        ...(wrapperConstraints && !entry.constraints ? { constraints: wrapperConstraints } : {}),
        ...(wrapperRepeat && !entry.repeat ? { repeat: wrapperRepeat } : {}),
        ...(wrapperTempo && !entry.tempo ? { tempo: wrapperTempo } : {}),
        ...(wrapperRestSeconds !== undefined && entry.rest_seconds === undefined
          ? { rest_seconds: wrapperRestSeconds }
          : {}),
        ...(wrapperRestBefore !== undefined && entry.rest_before_seconds === undefined
          ? { rest_before_seconds: wrapperRestBefore }
          : {}),
        ...(wrapperRestAfter !== undefined && entry.rest_after_seconds === undefined
          ? { rest_after_seconds: wrapperRestAfter }
          : {}),
        ...(progression ? { progression } : {}),
        ...(typeof set.note === "string" && set.note.trim() !== ""
          ? { note: entry.note ? `${set.note.trim()}; ${entry.note}` : set.note.trim() }
          : {})
      });
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

  const work_type =
    set.work_type === undefined
      ? undefined
      : set.work_type === "reps" || set.work_type === "time"
        ? set.work_type
        : undefined;
  if (set.work_type !== undefined && work_type === undefined) {
    addError(diagnostics, `${path}.work_type`, 'work_type must be "reps" or "time".');
  }

  const inferredTimeMode =
    set.time_mode === "amrap" ||
    set.time_mode === "emom" ||
    set.time_mode === "for_time" ||
    set.time_mode === "density";
  const effectiveWorkType: "reps" | "time" =
    work_type ?? (inferredTimeMode || set.duration_seconds !== undefined ? "time" : "reps");

  const time_mode =
    set.time_mode === undefined ||
    set.time_mode === "amrap" ||
    set.time_mode === "emom" ||
    set.time_mode === "for_time" ||
    set.time_mode === "density"
      ? (set.time_mode as "amrap" | "emom" | "for_time" | "density" | undefined)
      : undefined;
  if (set.time_mode !== undefined && time_mode === undefined) {
    addError(diagnostics, `${path}.time_mode`, 'time_mode must be amrap, emom, for_time, or density.');
  }

  const reps = set.reps !== undefined ? parseRepTarget(set.reps, `${path}.reps`, diagnostics) : undefined;
  if (effectiveWorkType === "reps" && reps === undefined) {
    addError(diagnostics, `${path}.reps`, "reps is required when work_type is reps.");
  }

  const duration_seconds = parseDurationSeconds(set.duration_seconds, `${path}.duration_seconds`, diagnostics);
  if (effectiveWorkType === "time" && duration_seconds === undefined) {
    addError(diagnostics, `${path}.duration_seconds`, "duration_seconds is required when work_type is time.");
  }
  if (effectiveWorkType === "reps" && duration_seconds !== undefined) {
    addError(diagnostics, `${path}.duration_seconds`, "duration_seconds is only valid when work_type is time.");
  }

  const interval_seconds = parseDurationSeconds(set.interval_seconds, `${path}.interval_seconds`, diagnostics);
  if (effectiveWorkType === "reps" && interval_seconds !== undefined) {
    addError(diagnostics, `${path}.interval_seconds`, "interval_seconds is only valid when work_type is time.");
  }

  let target_total_reps: number | undefined;
  if (set.target_total_reps !== undefined) {
    if (
      typeof set.target_total_reps !== "number" ||
      !Number.isInteger(set.target_total_reps) ||
      set.target_total_reps < 1
    ) {
      addError(diagnostics, `${path}.target_total_reps`, "target_total_reps must be an integer >= 1.");
    } else {
      target_total_reps = set.target_total_reps;
    }
  }
  if (effectiveWorkType === "reps" && target_total_reps !== undefined) {
    addError(diagnostics, `${path}.target_total_reps`, "target_total_reps is only valid when work_type is time.");
  }
  if (time_mode === "emom" && reps === undefined) {
    addError(diagnostics, `${path}.reps`, "EMOM sets require reps.");
  }
  if (time_mode === "emom" && interval_seconds === undefined) {
    addWarning(
      diagnostics,
      `${path}.interval_seconds`,
      "EMOM defaults to 60s intervals when interval_seconds is omitted."
    );
  }
  if (time_mode === "density" && target_total_reps === undefined) {
    addWarning(
      diagnostics,
      `${path}.target_total_reps`,
      "Density sets usually define target_total_reps."
    );
  }
  if (time_mode === "for_time" && target_total_reps === undefined && reps === undefined) {
    addWarning(
      diagnostics,
      path,
      "for_time sets usually define reps or target_total_reps."
    );
  }

  const intensity = parseIntensity(set.intensity, `${path}.intensity`, diagnostics);
  const role = parseRole(set.role, `${path}.role`, diagnostics);

  const hasRestSeconds = set.rest_seconds !== undefined;
  const hasRestAlias = set.rest !== undefined;
  if (hasRestSeconds && hasRestAlias) {
    addError(diagnostics, `${path}.rest_seconds`, "Specify either rest_seconds or rest, not both.");
    addError(diagnostics, `${path}.rest`, "Specify either rest_seconds or rest, not both.");
  }
  const rest_seconds = parseDurationSeconds(
    hasRestAlias ? set.rest : set.rest_seconds,
    hasRestAlias ? `${path}.rest` : `${path}.rest_seconds`,
    diagnostics
  );
  const rest_before_seconds = parseDurationSeconds(
    set.rest_before ?? set.rest_before_seconds,
    set.rest_before !== undefined ? `${path}.rest_before` : `${path}.rest_before_seconds`,
    diagnostics
  );
  const rest_after_seconds = parseDurationSeconds(
    set.rest_after ?? set.rest_after_seconds,
    set.rest_after !== undefined ? `${path}.rest_after` : `${path}.rest_after_seconds`,
    diagnostics
  );

  const constraints = parseConstraints(set.constraints, `${path}.constraints`, diagnostics);
  const repeat = parseRepeat(set.repeat, `${path}.repeat`, diagnostics);
  if (constraints?.max_sets !== undefined && repeat?.max_sets !== undefined && repeat.max_sets > constraints.max_sets) {
    addError(diagnostics, `${path}.repeat.max_sets`, "repeat.max_sets cannot exceed constraints.max_sets.");
  }

  const progression = parseProgression(set.progression, intensity, `${path}.progression`, diagnostics);
  const tempo = parseTempo(set.tempo, `${path}.tempo`, diagnostics);
  const pause_seconds = parseDurationSeconds(set.pause_seconds, `${path}.pause_seconds`, diagnostics);
  const eccentric_seconds = parseDurationSeconds(set.eccentric_seconds, `${path}.eccentric_seconds`, diagnostics);

  if (set.note !== undefined && (typeof set.note !== "string" || set.note.trim() === "")) {
    addError(diagnostics, `${path}.note`, "Set note must be a non-empty string.");
  }

  if (hasNewErrors(diagnostics, startIndex)) {
    return undefined;
  }

  return [
    {
      count: count as number,
      ...(reps ? { reps } : {}),
      ...((work_type ?? effectiveWorkType) === "time" ? { work_type: "time" as const } : {}),
      ...(time_mode ? { time_mode } : {}),
      ...(duration_seconds !== undefined ? { duration_seconds } : {}),
      ...(interval_seconds !== undefined ? { interval_seconds } : {}),
      ...(target_total_reps !== undefined ? { target_total_reps } : {}),
      ...(intensity ? { intensity } : {}),
      ...(role ? { role } : {}),
      ...(rest_seconds !== undefined ? { rest_seconds } : {}),
      ...(rest_before_seconds !== undefined ? { rest_before_seconds } : {}),
      ...(rest_after_seconds !== undefined ? { rest_after_seconds } : {}),
      ...(constraints ? { constraints } : {}),
      ...(repeat ? { repeat } : {}),
      ...(progression ? { progression } : {}),
      ...(tempo ? { tempo } : {}),
      ...(pause_seconds !== undefined ? { pause_seconds } : {}),
      ...(eccentric_seconds !== undefined ? { eccentric_seconds } : {}),
      ...(typeof set.note === "string" ? { note: set.note.trim() } : {})
    }
  ];
}

function parseSets(setsRaw: unknown, path: string, diagnostics: Diagnostic[]): SetPrescription[] | undefined {
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

  addError(diagnostics, path, "sets must be an array, shorthand string, or shorthand block string.");
  return undefined;
}

function parseWarmupGroupFromName(name: string): { exercise: string; group_id?: string } {
  const match = /^(?<label>[A-Za-z]+)(?<order>\d+)\s+(?<exercise>.+)$/.exec(name.trim());
  if (!match?.groups?.label || !match.groups.order || !match.groups.exercise) {
    return { exercise: name.trim() };
  }

  return {
    exercise: match.groups.exercise.trim(),
    group_id: match.groups.label.toUpperCase()
  };
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
  const duration = match.groups.dur.trim();
  if (duration === "" || !/^\d/.test(duration)) {
    return null;
  }
  return parseDurationSeconds(duration, path, diagnostics);
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

  const rawName = splitIndex >= 0 ? first.slice(0, splitIndex).trim() : first.trim();
  const firstRemainder = splitIndex >= 0 ? first.slice(splitIndex + 1).trim() : "";
  if (rawName === "") {
    addError(diagnostics, path, "Exercise shorthand must start with an exercise name.");
    return undefined;
  }

  const parsedName = parseWarmupGroupFromName(rawName);
  let rest_seconds: number | undefined;
  const setLines: string[] = [];

  if (firstRemainder !== "") {
    setLines.push(firstRemainder);
  }

  meaningful.slice(1).forEach((line) => {
    const restDirective = parseRestDirectiveSeconds(line, `${path}.rest_seconds`, diagnostics);
    if (restDirective !== null) {
      if (restDirective !== undefined) {
        rest_seconds = restDirective;
      }
      return;
    }
    setLines.push(line);
  });

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
            rest_seconds = restDirective;
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
    exercise: parsedName.exercise,
    ...(parsedName.group_id ? { group_id: parsedName.group_id } : {}),
    sets,
    ...(rest_seconds !== undefined ? { rest_seconds } : {})
  };
}

function parseExercisesShorthandBlock(
  source: string,
  path: string,
  diagnostics: Diagnostic[]
): ExercisePrescription[] | undefined {
  const lines = source.split(/\r?\n/);
  const exercises: ExercisePrescription[] = [];
  let current: string[] = [];

  function flush(): void {
    if (current.length === 0) {
      return;
    }
    const parsed = parseExerciseShorthand(current.join("\n"), `${path}[${exercises.length}]`, diagnostics);
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
    const isSetLine = /^\d/.test(content) || /^(amrap|emom|density)\b/i.test(content);
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
  return exercises;
}

function parseExercise(
  exercise: unknown,
  path: string,
  diagnostics: Diagnostic[],
  aliasMap: Record<string, string>
): ExercisePrescription | undefined {
  const startIndex = diagnostics.length;

  if (typeof exercise === "string") {
    const parsed = parseExerciseShorthand(exercise, path, diagnostics);
    if (!parsed) {
      return undefined;
    }
    validateRoleReferences(parsed, path, diagnostics);
    return parsed;
  }

  if (!isRecord(exercise)) {
    addError(diagnostics, path, "Exercise must be an object or shorthand string.");
    return undefined;
  }

  const nameRaw = exercise.exercise;
  if (typeof nameRaw !== "string" || nameRaw.trim() === "") {
    addError(diagnostics, `${path}.exercise`, "Exercise name is required.");
  }
  const parsedName = typeof nameRaw === "string" ? parseWarmupGroupFromName(nameRaw) : { exercise: "" };

  let exercise_id: string | undefined;
  if (exercise.exercise_id !== undefined) {
    if (typeof exercise.exercise_id !== "string" || exercise.exercise_id.trim() === "") {
      addError(diagnostics, `${path}.exercise_id`, "exercise_id must be a non-empty string.");
    } else {
      exercise_id = exercise.exercise_id.trim();
    }
  } else if (parsedName.exercise) {
    const aliasHit = aliasMap[normalizeAliasToken(parsedName.exercise)];
    if (aliasHit) {
      exercise_id = aliasHit;
    }
  }

  const aliases = parseStringArray(exercise.aliases, `${path}.aliases`, diagnostics);
  if (aliases && aliases.length > 0 && !exercise_id) {
    addError(diagnostics, `${path}.exercise_id`, "aliases require exercise_id for stable identity.");
  }

  const family =
    typeof exercise.family === "string" && exercise.family.trim() !== "" ? exercise.family.trim() : undefined;
  if (exercise.family !== undefined && !family) {
    addError(diagnostics, `${path}.family`, "family must be a non-empty string.");
  }

  const tags = parseStringArray(exercise.tags, `${path}.tags`, diagnostics);
  const modifiers = parseInlineStringMap(exercise.modifiers, `${path}.modifiers`, diagnostics);
  const substitutions = parseSubstitutions(exercise.substitutions, `${path}.substitutions`, diagnostics);
  const constraints = parseConstraints(exercise.constraints, `${path}.constraints`, diagnostics);
  const warmup = parseWarmup(exercise.warmup, `${path}.warmup`, diagnostics);

  const group_id =
    typeof exercise.group_id === "string" && exercise.group_id.trim() !== ""
      ? exercise.group_id.trim().toUpperCase()
      : parsedName.group_id;

  const hasRestSeconds = exercise.rest_seconds !== undefined;
  const hasRestAlias = exercise.rest !== undefined;
  if (hasRestSeconds && hasRestAlias) {
    addError(diagnostics, `${path}.rest_seconds`, "Specify either rest_seconds or rest, not both.");
    addError(diagnostics, `${path}.rest`, "Specify either rest_seconds or rest, not both.");
  }
  const rest_seconds = parseDurationSeconds(
    hasRestAlias ? exercise.rest : exercise.rest_seconds,
    hasRestAlias ? `${path}.rest` : `${path}.rest_seconds`,
    diagnostics
  );
  const rest_before_seconds = parseDurationSeconds(
    exercise.rest_before ?? exercise.rest_before_seconds,
    exercise.rest_before !== undefined ? `${path}.rest_before` : `${path}.rest_before_seconds`,
    diagnostics
  );
  const rest_after_seconds = parseDurationSeconds(
    exercise.rest_after ?? exercise.rest_after_seconds,
    exercise.rest_after !== undefined ? `${path}.rest_after` : `${path}.rest_after_seconds`,
    diagnostics
  );

  const tempo = parseTempo(exercise.tempo, `${path}.tempo`, diagnostics);
  const pause_seconds = parseDurationSeconds(exercise.pause_seconds, `${path}.pause_seconds`, diagnostics);
  const eccentric_seconds = parseDurationSeconds(exercise.eccentric_seconds, `${path}.eccentric_seconds`, diagnostics);

  const units = exercise.units !== undefined ? parseLoadUnit(exercise.units, `${path}.units`, diagnostics) : undefined;
  const rounding = parseRoundingPolicy(exercise.rounding, `${path}.rounding`, diagnostics);

  const sets = parseSets(exercise.sets, `${path}.sets`, diagnostics);
  if (!sets || sets.length === 0) {
    addError(diagnostics, `${path}.sets`, "Exercise must include sets.");
  }

  if (hasNewErrors(diagnostics, startIndex) || !sets) {
    return undefined;
  }

  const parsedExercise: ExercisePrescription = {
    exercise: parsedName.exercise,
    ...(exercise_id ? { exercise_id } : {}),
    ...(aliases && aliases.length > 0 ? { aliases } : {}),
    ...(family ? { family } : {}),
    ...(tags && tags.length > 0 ? { tags } : {}),
    ...(modifiers ? { modifiers } : {}),
    ...(substitutions && substitutions.length > 0 ? { substitutions } : {}),
    ...(constraints ? { constraints } : {}),
    ...(warmup ? { warmup } : {}),
    ...(group_id ? { group_id } : {}),
    sets,
    ...(rest_before_seconds !== undefined ? { rest_before_seconds } : {}),
    ...(rest_after_seconds !== undefined ? { rest_after_seconds } : {}),
    ...(rest_seconds !== undefined ? { rest_seconds } : {}),
    ...(tempo ? { tempo } : {}),
    ...(pause_seconds !== undefined ? { pause_seconds } : {}),
    ...(eccentric_seconds !== undefined ? { eccentric_seconds } : {}),
    ...(units ? { units } : {}),
    ...(rounding ? { rounding } : {})
  };

  validateRoleReferences(parsedExercise, path, diagnostics);
  return parsedExercise;
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

  let start_offset_days: number | undefined;
  const plusOffsetMatch = /\+\s*(?<offset>\d+)\s*$/i.exec(raw);
  if (plusOffsetMatch?.groups?.offset !== undefined) {
    start_offset_days = Number(plusOffsetMatch.groups.offset);
    raw = raw.slice(0, plusOffsetMatch.index).trim();
  } else {
    const offsetMatch = /\boffset\s+(?<offset>\d+)\s*$/i.exec(raw);
    if (offsetMatch?.groups?.offset !== undefined) {
      start_offset_days = Number(offsetMatch.groups.offset);
      raw = raw.slice(0, offsetMatch.index).trim();
    }
  }

  if (start_offset_days !== undefined && (!Number.isInteger(start_offset_days) || start_offset_days < 0)) {
    addError(diagnostics, path, "schedule start offset must be an integer >= 0.");
    return undefined;
  }

  const normalized = raw.replace(/\s+/g, " ").trim();
  if (/^every other day(s)?$/i.test(normalized)) {
    return { type: "interval_days", every: 2, ...(start_offset_days !== undefined ? { start_offset_days } : {}) };
  }
  if (/^every day(s)?$/i.test(normalized)) {
    return { type: "interval_days", every: 1, ...(start_offset_days !== undefined ? { start_offset_days } : {}) };
  }

  const intervalMatch = /^every\s+(?<every>\d+)\s*(?:d|day|days)$/i.exec(normalized);
  if (intervalMatch?.groups?.every !== undefined) {
    const every = Number(intervalMatch.groups.every);
    if (!Number.isInteger(every) || every < 1) {
      addError(diagnostics, path, "schedule interval must be an integer >= 1.");
      return undefined;
    }
    return { type: "interval_days", every, ...(start_offset_days !== undefined ? { start_offset_days } : {}) };
  }

  const shortIntervalMatch = /^(?<every>\d+)\s*(?:d|day|days)$/i.exec(normalized);
  if (shortIntervalMatch?.groups?.every !== undefined) {
    const every = Number(shortIntervalMatch.groups.every);
    if (!Number.isInteger(every) || every < 1) {
      addError(diagnostics, path, "schedule interval must be an integer >= 1.");
      return undefined;
    }
    return { type: "interval_days", every, ...(start_offset_days !== undefined ? { start_offset_days } : {}) };
  }

  const weekdaySource = normalized.replace(/^(?:on|every)\s+/i, "");
  const parsed = parseWeekdayList(weekdaySource);
  if (parsed.unknown.length > 0) {
    addError(diagnostics, path, `Invalid weekday(s) in schedule shorthand: ${parsed.unknown.join(", ")}.`);
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
  return { type: "weekdays", days: parsed.days, ...(start_offset_days !== undefined ? { start_offset_days } : {}) };
}

function parseScheduleObject(
  schedule: UnknownRecord,
  path: string,
  diagnostics: Diagnostic[]
): SessionSchedule | undefined {
  const startIndex = diagnostics.length;
  if (schedule.type !== "interval_days" && schedule.type !== "weekdays") {
    addError(diagnostics, `${path}.type`, "schedule.type must be interval_days or weekdays.");
    return undefined;
  }

  const start_offset_days = schedule.start_offset_days;
  const end_offset_days = schedule.end_offset_days;
  if (start_offset_days !== undefined && (typeof start_offset_days !== "number" || !Number.isInteger(start_offset_days) || start_offset_days < 0)) {
    addError(diagnostics, `${path}.start_offset_days`, "start_offset_days must be an integer >= 0.");
  }
  if (end_offset_days !== undefined && (typeof end_offset_days !== "number" || !Number.isInteger(end_offset_days) || end_offset_days < 0)) {
    addError(diagnostics, `${path}.end_offset_days`, "end_offset_days must be an integer >= 0.");
  }
  if (
    typeof start_offset_days === "number" &&
    typeof end_offset_days === "number" &&
    end_offset_days < start_offset_days
  ) {
    addError(diagnostics, `${path}.end_offset_days`, "end_offset_days must be >= start_offset_days.");
  }

  if (schedule.type === "interval_days") {
    if (typeof schedule.every !== "number" || !Number.isInteger(schedule.every) || schedule.every < 1) {
      addError(diagnostics, `${path}.every`, "every must be an integer >= 1.");
    }
    if (hasNewErrors(diagnostics, startIndex)) {
      return undefined;
    }
    return {
      type: "interval_days",
      every: schedule.every as number,
      ...(start_offset_days !== undefined ? { start_offset_days: start_offset_days as number } : {}),
      ...(end_offset_days !== undefined ? { end_offset_days: end_offset_days as number } : {})
    };
  }

  if (!Array.isArray(schedule.days) || schedule.days.length === 0) {
    addError(diagnostics, `${path}.days`, "days must be a non-empty array.");
    return undefined;
  }
  const days: Weekday[] = [];
  schedule.days.forEach((day, index) => {
    if (typeof day !== "string" || !WEEKDAY_SET.has(day)) {
      addError(diagnostics, `${path}.days[${index}]`, `Invalid weekday. Expected one of: ${WEEKDAYS.join(", ")}.`);
      return;
    }
    days.push(day as Weekday);
  });

  if (hasNewErrors(diagnostics, startIndex)) {
    return undefined;
  }
  return {
    type: "weekdays",
    days,
    ...(start_offset_days !== undefined ? { start_offset_days: start_offset_days as number } : {}),
    ...(end_offset_days !== undefined ? { end_offset_days: end_offset_days as number } : {})
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

function parseSessionGroup(
  group: unknown,
  path: string,
  diagnostics: Diagnostic[]
): SessionGroup | undefined {
  if (!isRecord(group)) {
    addError(diagnostics, path, "group must be an object.");
    return undefined;
  }

  if (typeof group.id !== "string" || group.id.trim() === "") {
    addError(diagnostics, `${path}.id`, "group.id is required.");
  }
  if (group.type !== "superset" && group.type !== "circuit" && group.type !== "giant_set") {
    addError(diagnostics, `${path}.type`, "group.type must be superset, circuit, or giant_set.");
  }
  if (group.rounds !== undefined && (typeof group.rounds !== "number" || !Number.isInteger(group.rounds) || group.rounds < 1)) {
    addError(diagnostics, `${path}.rounds`, "rounds must be an integer >= 1.");
  }

  const exercise_ids = parseStringArray(group.exercise_ids, `${path}.exercise_ids`, diagnostics);
  const rest_between_exercises_seconds = parseDurationSeconds(
    group.rest_between_exercises ?? group.rest_between_exercises_seconds,
    group.rest_between_exercises !== undefined
      ? `${path}.rest_between_exercises`
      : `${path}.rest_between_exercises_seconds`,
    diagnostics
  );
  const rest_between_rounds_seconds = parseDurationSeconds(
    group.rest_between_rounds ?? group.rest_between_rounds_seconds,
    group.rest_between_rounds !== undefined ? `${path}.rest_between_rounds` : `${path}.rest_between_rounds_seconds`,
    diagnostics
  );

  if (typeof group.id !== "string" || group.id.trim() === "" || (group.type !== "superset" && group.type !== "circuit" && group.type !== "giant_set")) {
    return undefined;
  }

  return {
    id: group.id.trim().toUpperCase(),
    type: group.type,
    ...(group.rounds !== undefined ? { rounds: group.rounds as number } : {}),
    ...(exercise_ids && exercise_ids.length > 0 ? { exercise_ids } : {}),
    ...(rest_between_exercises_seconds !== undefined ? { rest_between_exercises_seconds } : {}),
    ...(rest_between_rounds_seconds !== undefined ? { rest_between_rounds_seconds } : {})
  };
}

function parseSessionGroups(
  groups: unknown,
  path: string,
  diagnostics: Diagnostic[]
): SessionGroup[] | undefined {
  if (groups === undefined) {
    return undefined;
  }
  if (!Array.isArray(groups)) {
    addError(diagnostics, path, "groups must be an array.");
    return undefined;
  }

  const parsed: SessionGroup[] = [];
  const seen = new Set<string>();
  groups.forEach((group, index) => {
    const current = parseSessionGroup(group, `${path}[${index}]`, diagnostics);
    if (!current) {
      return;
    }
    if (seen.has(current.id)) {
      addError(diagnostics, `${path}[${index}].id`, `Duplicate group id: ${current.id}`);
      return;
    }
    seen.add(current.id);
    parsed.push(current);
  });

  return parsed;
}

function mergeModifiers(base: DeloadModifiers | undefined, override: DeloadModifiers | undefined): SessionModifiers | undefined {
  if (!base && !override) {
    return undefined;
  }

  const merged: SessionModifiers = {
    ...(base ?? {}),
    ...(override ?? {})
  };

  if (base?.intensity_cap || override?.intensity_cap) {
    merged.intensity_cap = {
      ...(base?.intensity_cap ?? {}),
      ...(override?.intensity_cap ?? {})
    };
  }

  if (base?.exercise_swap_map || override?.exercise_swap_map) {
    merged.exercise_swap_map = {
      ...(base?.exercise_swap_map ?? {}),
      ...(override?.exercise_swap_map ?? {})
    };
  }

  if (merged.deload) {
    if (merged.volume_multiplier === undefined) {
      merged.volume_multiplier = 0.6;
    }
    if (!merged.intensity_cap) {
      merged.intensity_cap = { max_rpe: 7 };
    } else if (merged.intensity_cap.max_rpe === undefined) {
      merged.intensity_cap.max_rpe = 7;
    }
  }

  return merged;
}

function parseModifierObject(
  value: unknown,
  path: string,
  diagnostics: Diagnostic[]
): DeloadModifiers | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    addError(diagnostics, path, "modifiers must be an object.");
    return undefined;
  }

  const result: DeloadModifiers = {};

  if (value.deload !== undefined) {
    if (typeof value.deload !== "boolean") {
      addError(diagnostics, `${path}.deload`, "deload must be a boolean.");
    } else {
      result.deload = value.deload;
    }
  }

  if (value.volume_multiplier !== undefined) {
    if (
      typeof value.volume_multiplier !== "number" ||
      !Number.isFinite(value.volume_multiplier) ||
      value.volume_multiplier <= 0
    ) {
      addError(diagnostics, `${path}.volume_multiplier`, "volume_multiplier must be a number > 0.");
    } else {
      result.volume_multiplier = value.volume_multiplier;
    }
  }

  if (value.intensity_cap !== undefined) {
    if (!isRecord(value.intensity_cap)) {
      addError(diagnostics, `${path}.intensity_cap`, "intensity_cap must be an object.");
    } else if (value.intensity_cap.max_rpe !== undefined) {
      if (
        typeof value.intensity_cap.max_rpe !== "number" ||
        !Number.isFinite(value.intensity_cap.max_rpe) ||
        value.intensity_cap.max_rpe < 1 ||
        value.intensity_cap.max_rpe > 10
      ) {
        addError(diagnostics, `${path}.intensity_cap.max_rpe`, "max_rpe must be between 1 and 10.");
      } else {
        result.intensity_cap = { max_rpe: value.intensity_cap.max_rpe };
      }
    }
  }

  const exercise_swap_map = parseInlineStringMap(value.exercise_swap_map, `${path}.exercise_swap_map`, diagnostics);
  if (exercise_swap_map) {
    result.exercise_swap_map = exercise_swap_map;
  }

  if (result.deload) {
    if (result.volume_multiplier === undefined) {
      result.volume_multiplier = 0.6;
    }
    if (!result.intensity_cap) {
      result.intensity_cap = { max_rpe: 7 };
    } else if (result.intensity_cap.max_rpe === undefined) {
      result.intensity_cap.max_rpe = 7;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function parseSessionModifiers(
  source: UnknownRecord,
  path: string,
  diagnostics: Diagnostic[]
): SessionModifiers | undefined {
  const objectModifiers = parseModifierObject(source.modifiers, `${path}.modifiers`, diagnostics);
  const inlineModifiers = parseModifierObject(
    {
      deload: source.deload,
      volume_multiplier: source.volume_multiplier,
      intensity_cap: source.intensity_cap,
      exercise_swap_map: source.exercise_swap_map
    },
    path,
    diagnostics
  );
  return mergeModifiers(objectModifiers, inlineModifiers);
}

function parseSessionSlot(slot: unknown, path: string, diagnostics: Diagnostic[]): SessionSlot | undefined {
  if (slot === undefined) {
    return undefined;
  }

  if (typeof slot === "number") {
    if (!Number.isInteger(slot) || slot < 1) {
      addError(diagnostics, path, "slot numeric value must be an integer >= 1.");
      return undefined;
    }
    return slot;
  }

  if (typeof slot === "string") {
    const normalized = slot.trim().toUpperCase();
    if (normalized === "AM" || normalized === "PM" || normalized === "EVE") {
      return normalized as SessionSlot;
    }
    if (/^\d+$/.test(normalized)) {
      const numeric = Number(normalized);
      if (!Number.isInteger(numeric) || numeric < 1) {
        addError(diagnostics, path, "slot numeric string must represent an integer >= 1.");
        return undefined;
      }
      return numeric;
    }
  }

  addError(diagnostics, path, "slot must be AM, PM, EVE, or an integer.");
  return undefined;
}

function parseSession(
  session: unknown,
  path: string,
  seenIds: Set<string>,
  diagnostics: Diagnostic[],
  aliasMap: Record<string, string>
): Session | undefined {
  const startIndex = diagnostics.length;

  if (!isRecord(session)) {
    addError(diagnostics, path, "Session must be an object.");
    return undefined;
  }

  if (typeof session.id !== "string" || session.id.trim() === "") {
    addError(diagnostics, `${path}.id`, "Session id is required.");
  } else if (seenIds.has(session.id.trim())) {
    addError(diagnostics, `${path}.id`, `Duplicate session id: ${session.id.trim()}`);
  } else {
    seenIds.add(session.id.trim());
  }

  if (typeof session.name !== "string" || session.name.trim() === "") {
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

  const day =
    session.day === undefined
      ? undefined
      : typeof session.day === "number" && Number.isInteger(session.day) && session.day >= 1
        ? session.day
        : undefined;
  if (hasDay && day === undefined) {
    addError(diagnostics, `${path}.day`, "Session day must be an integer >= 1.");
  }

  const schedule = hasSchedule ? parseSchedule(session.schedule, `${path}.schedule`, diagnostics) : undefined;
  const slot = parseSessionSlot(session.slot, `${path}.slot`, diagnostics);

  const hasRestDefaultSeconds = session.rest_default_seconds !== undefined;
  const hasRestDefaultAlias = session.rest_default !== undefined;
  if (hasRestDefaultSeconds && hasRestDefaultAlias) {
    addError(diagnostics, `${path}.rest_default_seconds`, "Specify either rest_default_seconds or rest_default, not both.");
    addError(diagnostics, `${path}.rest_default`, "Specify either rest_default_seconds or rest_default, not both.");
  }
  const rest_default_seconds = parseDurationSeconds(
    hasRestDefaultAlias ? session.rest_default : session.rest_default_seconds,
    hasRestDefaultAlias ? `${path}.rest_default` : `${path}.rest_default_seconds`,
    diagnostics
  );

  const groups = parseSessionGroups(session.groups, `${path}.groups`, diagnostics);
  const constraints = parseConstraints(session.constraints, `${path}.constraints`, diagnostics);
  const modifiers = parseSessionModifiers(session, path, diagnostics);

  const exercises: ExercisePrescription[] = [];
  if (typeof session.exercises === "string") {
    const parsed = parseExercisesShorthandBlock(session.exercises, `${path}.exercises`, diagnostics);
    if (!parsed || parsed.length === 0) {
      addError(diagnostics, `${path}.exercises`, "Session must include exercises.");
    } else {
      exercises.push(...parsed);
    }
  } else if (Array.isArray(session.exercises)) {
    if (session.exercises.length === 0) {
      addError(diagnostics, `${path}.exercises`, "Session must include exercises.");
    }
    session.exercises.forEach((entry, index) => {
      const parsed = parseExercise(entry, `${path}.exercises[${index}]`, diagnostics, aliasMap);
      if (parsed) {
        exercises.push(parsed);
      }
    });
  } else {
    addError(diagnostics, `${path}.exercises`, "Session exercises must be an array or shorthand block string.");
  }

  const explicitGroups = groups ? [...groups] : [];
  const derivedGroups = new Map<string, SessionGroup>();
  exercises.forEach((exercise) => {
    if (!exercise.group_id) {
      return;
    }
    const groupId = exercise.group_id.toUpperCase();
    if (!derivedGroups.has(groupId)) {
      derivedGroups.set(groupId, { id: groupId, type: "superset" });
    }
  });
  const mergedGroups = explicitGroups.length > 0 ? explicitGroups : [...derivedGroups.values()];

  if (mergedGroups.length > 0) {
    const validIds = new Set(mergedGroups.map((group) => group.id.toUpperCase()));
    exercises.forEach((exercise, index) => {
      if (!exercise.group_id) {
        return;
      }
      if (!validIds.has(exercise.group_id.toUpperCase())) {
        addError(
          diagnostics,
          `${path}.exercises[${index}].group_id`,
          `Unknown group_id "${exercise.group_id}".`
        );
      }
    });
  }

  if (hasNewErrors(diagnostics, startIndex)) {
    return undefined;
  }

  return {
    id: (session.id as string).trim(),
    name: (session.name as string).trim(),
    ...(day !== undefined ? { day } : {}),
    ...(schedule ? { schedule } : {}),
    ...(slot !== undefined ? { slot } : {}),
    ...(rest_default_seconds !== undefined ? { rest_default_seconds } : {}),
    ...(mergedGroups.length > 0 ? { groups: mergedGroups } : {}),
    ...(constraints ? { constraints } : {}),
    ...(modifiers ? { modifiers } : {}),
    exercises
  };
}

function parseBlockDurationDays(duration: unknown, path: string, diagnostics: Diagnostic[]): number | undefined {
  if (typeof duration === "string") {
    const normalized = duration.trim().toLowerCase();
    if (normalized === "") {
      addError(diagnostics, path, "Block duration cannot be empty.");
      return undefined;
    }

    const weeksMatch = normalized.match(/^(?<value>\d+)\s*(?:w|week|weeks)$/);
    if (weeksMatch?.groups?.value !== undefined) {
      const weeks = Number(weeksMatch.groups.value);
      if (!Number.isInteger(weeks) || weeks < 1) {
        addError(diagnostics, path, "Block duration weeks must be an integer >= 1.");
        return undefined;
      }
      return weeks * 7;
    }

    const daysMatch = normalized.match(/^(?<value>\d+)\s*(?:d|day|days)$/);
    if (daysMatch?.groups?.value !== undefined) {
      const days = Number(daysMatch.groups.value);
      if (!Number.isInteger(days) || days < 1) {
        addError(diagnostics, path, "Block duration days must be an integer >= 1.");
        return undefined;
      }
      return days;
    }

    addError(diagnostics, path, 'Invalid block duration. Use e.g. "4w" or "10d".');
    return undefined;
  }

  if (!isRecord(duration)) {
    addError(diagnostics, path, 'Block duration must be a string (e.g. "4w") or object {type,value}.');
    return undefined;
  }

  if (duration.type !== "weeks" && duration.type !== "days") {
    addError(diagnostics, `${path}.type`, "duration.type must be weeks or days.");
    return undefined;
  }

  if (typeof duration.value !== "number" || !Number.isInteger(duration.value) || duration.value < 1) {
    addError(diagnostics, `${path}.value`, "duration.value must be an integer >= 1.");
    return undefined;
  }

  return duration.type === "weeks" ? duration.value * 7 : duration.value;
}

function parseCalendar(
  calendar: unknown,
  path: string,
  diagnostics: Diagnostic[]
): ProgramCalendar | undefined {
  if (calendar === undefined) {
    return undefined;
  }
  if (!isRecord(calendar)) {
    addError(diagnostics, path, "Calendar must be an object.");
    return undefined;
  }

  const start_date = parseIsoDate(calendar.start_date, `${path}.start_date`, diagnostics);
  const end_date = calendar.end_date === undefined ? undefined : parseIsoDate(calendar.end_date, `${path}.end_date`, diagnostics);
  const timezone = calendar.timezone;

  if (timezone !== undefined && (typeof timezone !== "string" || timezone.trim() === "")) {
    addError(diagnostics, `${path}.timezone`, "timezone must be a non-empty string.");
  }

  if (start_date && end_date && toUtcDate(end_date).getTime() < toUtcDate(start_date).getTime()) {
    addError(diagnostics, `${path}.end_date`, "end_date must be on or after start_date.");
  }

  if (!start_date) {
    return undefined;
  }

  return {
    start_date,
    ...(end_date ? { end_date } : {}),
    ...(typeof timezone === "string" && timezone.trim() !== "" ? { timezone: timezone.trim() } : {})
  };
}

function parseMetadata(
  metadata: unknown,
  path: string,
  diagnostics: Diagnostic[]
): ProgramMetadata | undefined {
  if (!isRecord(metadata)) {
    addError(diagnostics, path, "Metadata is required.");
    return undefined;
  }

  if (typeof metadata.id !== "string" || metadata.id.trim() === "") {
    addError(diagnostics, `${path}.id`, "metadata.id is required.");
  }
  if (typeof metadata.name !== "string" || metadata.name.trim() === "") {
    addError(diagnostics, `${path}.name`, "metadata.name is required.");
  }
  if (metadata.description !== undefined && typeof metadata.description !== "string") {
    addError(diagnostics, `${path}.description`, "description must be a string.");
  }
  if (metadata.author !== undefined && typeof metadata.author !== "string") {
    addError(diagnostics, `${path}.author`, "author must be a string.");
  }

  if (typeof metadata.id !== "string" || typeof metadata.name !== "string") {
    return undefined;
  }

  return {
    id: metadata.id.trim(),
    name: metadata.name.trim(),
    ...(typeof metadata.description === "string" ? { description: metadata.description } : {}),
    ...(typeof metadata.author === "string" ? { author: metadata.author } : {})
  };
}

function parseExerciseAliasMap(
  value: unknown,
  path: string,
  diagnostics: Diagnostic[]
): Record<string, string> {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    addError(diagnostics, path, "exercise_aliases must be an object map.");
    return {};
  }

  const result: Record<string, string> = {};
  for (const [rawAlias, rawTarget] of Object.entries(value)) {
    if (typeof rawTarget !== "string" || rawTarget.trim() === "") {
      addError(diagnostics, `${path}.${rawAlias}`, "exercise_aliases values must be non-empty strings.");
      continue;
    }
    const normalized = normalizeAliasToken(rawAlias);
    if (result[normalized] && result[normalized] !== rawTarget.trim()) {
      addError(diagnostics, `${path}.${rawAlias}`, "Alias is already mapped to a different exercise_id.");
      continue;
    }
    result[normalized] = rawTarget.trim();
  }

  return result;
}

function parseProgramLevelModifiers(
  source: UnknownRecord,
  path: string,
  diagnostics: Diagnostic[]
): DeloadModifiers | undefined {
  return parseModifierObject(
    {
      deload: source.deload,
      volume_multiplier: source.volume_multiplier,
      intensity_cap: source.intensity_cap,
      exercise_swap_map: source.exercise_swap_map
    },
    path,
    diagnostics
  );
}

export function validateAst(ast: unknown): ValidationResult<ProgramAst> {
  const diagnostics: Diagnostic[] = [];

  if (!isRecord(ast)) {
    addError(diagnostics, "$", "Program must be an object.");
    return { valid: false, diagnostics };
  }

  const startIndex = diagnostics.length;
  const validLanguage = SUPPORTED_LANGUAGE_VERSIONS.includes(ast.language_version as LanguageVersion)
    ? (ast.language_version as LanguageVersion)
    : undefined;
  if (!validLanguage) {
    addError(
      diagnostics,
      "$.language_version",
      `Unsupported language version. Expected one of: ${SUPPORTED_LANGUAGE_VERSIONS.join(", ")}.`
    );
  }

  const metadata = parseMetadata(ast.metadata, "$.metadata", diagnostics);
  const calendar = parseCalendar(ast.calendar, "$.calendar", diagnostics);
  const units = ast.units !== undefined ? parseLoadUnit(ast.units, "$.units", diagnostics) : undefined;
  const rounding = parseRoundingPolicy(ast.rounding, "$.rounding", diagnostics);
  const exerciseAliasMap = parseExerciseAliasMap(ast.exercise_aliases, "$.exercise_aliases", diagnostics);

  const sessions: Session[] = [];
  let totalBlockDays: number | undefined;

  const hasSessions = ast.sessions !== undefined;
  const hasBlocks = ast.blocks !== undefined;

  if (hasSessions && hasBlocks) {
    addError(diagnostics, "$.sessions", "Specify either sessions or blocks, not both.");
    addError(diagnostics, "$.blocks", "Specify either blocks or sessions, not both.");
  } else if (hasBlocks) {
    if (!Array.isArray(ast.blocks) || ast.blocks.length === 0) {
      addError(diagnostics, "$.blocks", "At least one block is required.");
    } else {
      const seenSessionIds = new Set<string>();
      const seenBlockIds = new Set<string>();
      let offsetDays = 0;
      let totalDays = 0;

      ast.blocks.forEach((blockValue, blockIndex) => {
        const blockPath = `$.blocks[${blockIndex}]`;
        if (!isRecord(blockValue)) {
          addError(diagnostics, blockPath, "Block must be an object.");
          return;
        }

        let blockId = `block_${blockIndex + 1}`;
        if (typeof blockValue.id !== "string" || blockValue.id.trim() === "") {
          addError(diagnostics, `${blockPath}.id`, "Block id is required.");
        } else {
          blockId = blockValue.id.trim();
          if (seenBlockIds.has(blockId)) {
            addError(diagnostics, `${blockPath}.id`, `Duplicate block id: ${blockId}`);
            blockId = `${blockId}__${blockIndex + 1}`;
          } else {
            seenBlockIds.add(blockId);
          }
        }

        const durationDays = parseBlockDurationDays(blockValue.duration, `${blockPath}.duration`, diagnostics);
        const blockStartOffset = offsetDays;
        if (durationDays !== undefined) {
          offsetDays += durationDays;
          totalDays += durationDays;
        }

        const blockModifiers = mergeModifiers(
          parseModifierObject(blockValue.modifiers, `${blockPath}.modifiers`, diagnostics),
          parseProgramLevelModifiers(blockValue, blockPath, diagnostics)
        );

        if (blockValue.sessions !== undefined && !Array.isArray(blockValue.sessions)) {
          addError(diagnostics, `${blockPath}.sessions`, "Block sessions must be an array.");
          return;
        }

        const blockSessions = Array.isArray(blockValue.sessions) ? blockValue.sessions : [];
        blockSessions.forEach((sessionValue, sessionIndex) => {
          const sessionPath = `${blockPath}.sessions[${sessionIndex}]`;
          let normalizedSessionValue: unknown = sessionValue;
          if (isRecord(sessionValue) && typeof sessionValue.id === "string" && sessionValue.id.trim() !== "") {
            normalizedSessionValue = {
              ...sessionValue,
              id: `${blockId}.${sessionValue.id}`
            };
          }

          const parsed = parseSession(
            normalizedSessionValue,
            sessionPath,
            seenSessionIds,
            diagnostics,
            exerciseAliasMap
          );
          if (!parsed) {
            return;
          }

          parsed.block_id = blockId;
          parsed.modifiers = mergeModifiers(blockModifiers, parsed.modifiers);

          if (durationDays !== undefined) {
            if (parsed.day !== undefined) {
              if (parsed.day > durationDays) {
                addError(diagnostics, `${sessionPath}.day`, `Session day must be <= block duration (${durationDays} days).`);
              } else {
                parsed.day = blockStartOffset + parsed.day;
              }
            }

            if (parsed.schedule) {
              const startWithinBlock = parsed.schedule.start_offset_days ?? 0;
              if (startWithinBlock >= durationDays) {
                addError(
                  diagnostics,
                  `${sessionPath}.schedule.start_offset_days`,
                  `start_offset_days must be < block duration (${durationDays} days).`
                );
              }

              const endWithinBlock = parsed.schedule.end_offset_days ?? durationDays - 1;
              if (endWithinBlock >= durationDays) {
                addError(
                  diagnostics,
                  `${sessionPath}.schedule.end_offset_days`,
                  `end_offset_days must be < block duration (${durationDays} days).`
                );
              }

              parsed.schedule.start_offset_days = blockStartOffset + startWithinBlock;
              parsed.schedule.end_offset_days = blockStartOffset + endWithinBlock;
            }
          }

          sessions.push(parsed);
        });
      });

      totalBlockDays = totalDays;
    }
  } else {
    if (!Array.isArray(ast.sessions) || ast.sessions.length === 0) {
      addError(diagnostics, "$.sessions", "At least one session is required.");
    } else {
      const seenSessionIds = new Set<string>();
      ast.sessions.forEach((sessionValue, index) => {
        const parsed = parseSession(
          sessionValue,
          `$.sessions[${index}]`,
          seenSessionIds,
          diagnostics,
          exerciseAliasMap
        );
        if (parsed) {
          sessions.push(parsed);
        }
      });
    }
  }

  if (sessions.length === 0) {
    addError(diagnostics, hasBlocks ? "$.blocks" : "$.sessions", "At least one session is required.");
  }

  if (calendar && totalBlockDays !== undefined && totalBlockDays > 0) {
    const expectedEndDate = addDaysIsoDate(calendar.start_date, totalBlockDays - 1);
    if (calendar.end_date === undefined) {
      calendar.end_date = expectedEndDate;
    } else if (calendar.end_date !== expectedEndDate) {
      addError(
        diagnostics,
        "$.calendar.end_date",
        `calendar.end_date does not match blocks duration. Expected ${expectedEndDate}.`
      );
    }
  }

  const usesSchedule = sessions.some((session) => session.schedule !== undefined);
  if (usesSchedule) {
    if (!calendar) {
      addError(diagnostics, "$.calendar", "calendar is required when using session schedules.");
    } else if (!calendar.end_date && sessions.some((session) => session.schedule?.end_offset_days === undefined)) {
      addError(
        diagnostics,
        "$.calendar.end_date",
        "calendar.end_date is required when using repeating session schedules (unless end_offset_days is set)."
      );
    }
  }

  const usesExecutableProgression = sessions.some((session) =>
    session.exercises.some((exercise) =>
      exercise.sets.some((set) => set.progression?.type === "increment" || set.progression?.type === "weekly_increment")
    )
  );
  if (usesExecutableProgression && !calendar) {
    addError(diagnostics, "$.calendar", "calendar is required when using increment/weekly_increment progression.");
  }

  const valid = !hasNewErrors(diagnostics, startIndex);
  if (!valid || !metadata || !validLanguage) {
    return { valid: false, diagnostics };
  }

  return {
    valid: true,
    diagnostics,
    value: {
      language_version: validLanguage,
      metadata,
      ...(calendar ? { calendar } : {}),
      ...(units ? { units } : {}),
      ...(rounding ? { rounding } : {}),
      ...(Object.keys(exerciseAliasMap).length > 0 ? { exercise_aliases: exerciseAliasMap } : {}),
      sessions
    }
  };
}
