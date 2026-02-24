import type {
  ComparisonOp,
  IntensityTarget,
  LoadUnit,
  RepTarget,
  RepeatUntilCondition,
  SetPrescription,
  SetRole
} from "../ast/types.js";
import { parseDurationSecondsString } from "../util/duration.js";
import { tokenizeShorthand } from "./tokenizer.js";

const MAIN_PATTERN = /^(?<count>\d+)\s*x\s*(?<repMin>\d+)(?:\s*-\s*(?<repMax>\d+))?(?<rest>.*)$/i;

const RESERVED_ROLES = new Set<string>([
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

export class ShorthandParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShorthandParseError";
  }
}

function parseReps(repMinRaw: string, repMaxRaw?: string): RepTarget {
  const repMin = Number(repMinRaw);

  if (!Number.isInteger(repMin) || repMin < 1) {
    throw new ShorthandParseError("Reps must be a positive integer.");
  }

  if (repMaxRaw === undefined) {
    return repMin;
  }

  const repMax = Number(repMaxRaw);

  if (!Number.isInteger(repMax) || repMax < repMin) {
    throw new ShorthandParseError("Rep ranges must be ascending positive integers.");
  }

  return { min: repMin, max: repMax };
}

export function parseRepTargetExpression(raw: string): RepTarget {
  const normalized = raw.trim();
  const match = normalized.match(/^(?<min>\d+)(?:\s*-\s*(?<max>\d+))?$/);

  if (!match?.groups?.min) {
    throw new ShorthandParseError(`Unsupported reps expression: ${raw}`);
  }

  return parseReps(match.groups.min, match.groups.max);
}

function normalizeLoadUnit(unitRaw: string): LoadUnit {
  const unit = unitRaw.trim().toLowerCase();

  if (unit === "kg" || unit === "kgs") {
    return "kg";
  }

  if (unit === "lb" || unit === "lbs") {
    return "lb";
  }

  throw new ShorthandParseError(`Unsupported load unit: ${unitRaw}`);
}

function normalizeRole(raw: string | undefined): SetRole {
  if (!raw) {
    return "top";
  }
  return raw.trim().toLowerCase();
}

function parseUntilCondition(raw: string): RepeatUntilCondition {
  const normalized = raw.trim().replace(/\s+/g, " ");
  if (normalized === "") {
    throw new ShorthandParseError("until condition cannot be empty.");
  }

  if (/^(?:failure|fail)$/i.test(normalized)) {
    return { metric: "failure", op: "==", value: true };
  }

  if (/^(?:not\s+failure|no\s+failure)$/i.test(normalized)) {
    return { metric: "failure", op: "==", value: false };
  }

  const compactMetric = /^(?<metric>rpe|rir|velocity(?:_loss)?)\s*(?<op>>=|>|<=|<|==|!=)?\s*(?<value>\d+(?:\.\d+)?)$/i.exec(
    normalized
  );
  if (compactMetric?.groups?.metric && compactMetric.groups.value) {
    const metricToken = compactMetric.groups.metric.toLowerCase();
    const metric = metricToken.startsWith("velocity") ? "velocity_loss" : metricToken;
    const op = (compactMetric.groups.op ?? ">=") as ComparisonOp;
    return {
      metric: metric as "rpe" | "rir" | "velocity_loss",
      op,
      value: Number(compactMetric.groups.value)
    };
  }

  const spacedMetric = /^(?<metric>rpe|rir|velocity(?:_loss)?)\s+(?<op>>=|>|<=|<|==|!=)\s+(?<value>\d+(?:\.\d+)?)$/i.exec(
    normalized
  );
  if (spacedMetric?.groups?.metric && spacedMetric.groups.value && spacedMetric.groups.op) {
    const metricToken = spacedMetric.groups.metric.toLowerCase();
    const metric = metricToken.startsWith("velocity") ? "velocity_loss" : metricToken;
    return {
      metric: metric as "rpe" | "rir" | "velocity_loss",
      op: spacedMetric.groups.op as ComparisonOp,
      value: Number(spacedMetric.groups.value)
    };
  }

  throw new ShorthandParseError(`Unsupported until condition: ${raw}`);
}

export function parseIntensityExpression(raw: string): IntensityTarget {
  const normalized = raw.trim().replace(/^@+/, "").trim();

  const percentOfSetMatch = normalized.match(
    /^(?<value>\d+(?:\.\d+)?)\s*%\s*(?:of|from)\s*(?:set\s*)?(?:role\s*)?(?<role>[a-zA-Z_][\w-]*)$/i
  );
  if (percentOfSetMatch?.groups?.value !== undefined && percentOfSetMatch.groups.role !== undefined) {
    return {
      type: "percent_of_set",
      role: normalizeRole(percentOfSetMatch.groups.role),
      value: Number(percentOfSetMatch.groups.value)
    };
  }

  const percentDeltaMatch = normalized.match(
    /^(?<sign>[+-])\s*(?<delta>\d+(?:\.\d+)?)\s*%\s*(?:from\s*(?<role>[a-zA-Z_][\w-]*))?$/i
  );
  if (percentDeltaMatch?.groups?.sign && percentDeltaMatch.groups.delta !== undefined) {
    const delta = Number(percentDeltaMatch.groups.delta) * (percentDeltaMatch.groups.sign === "-" ? -1 : 1);
    const value = 100 + delta;
    if (!(value > 0)) {
      throw new ShorthandParseError("Relative percent intensity must resolve to > 0% of reference set.");
    }

    return {
      type: "percent_of_set",
      role: normalizeRole(percentDeltaMatch.groups.role),
      value
    };
  }

  const loadDeltaMatch = normalized.match(
    /^(?<sign>[+-])\s*(?<value>\d+(?:\.\d+)?)\s*(?<unit>kg|kgs|lb|lbs)\s*(?:from\s*(?<role>[a-zA-Z_][\w-]*))?$/i
  );
  if (
    loadDeltaMatch?.groups?.sign &&
    loadDeltaMatch.groups.value !== undefined &&
    loadDeltaMatch.groups.unit !== undefined
  ) {
    const sign = loadDeltaMatch.groups.sign === "-" ? -1 : 1;
    return {
      type: "load_delta_from_set",
      role: normalizeRole(loadDeltaMatch.groups.role),
      value: Number(loadDeltaMatch.groups.value) * sign,
      unit: normalizeLoadUnit(loadDeltaMatch.groups.unit)
    };
  }

  const loadRangeMatch = normalized.match(
    /^\[\s*(?<min>\d+(?:\.\d+)?)\s*,\s*(?<max>\d+(?:\.\d+)?)\s*\]\s*(?<unit>kg|kgs|lb|lbs)$/i
  );

  if (
    loadRangeMatch?.groups?.min !== undefined &&
    loadRangeMatch.groups.max !== undefined &&
    loadRangeMatch.groups.unit !== undefined
  ) {
    const unit = normalizeLoadUnit(loadRangeMatch.groups.unit);
    return {
      type: "load_range",
      min: Number(loadRangeMatch.groups.min),
      max: Number(loadRangeMatch.groups.max),
      unit
    };
  }

  const hyphenLoadRangeMatch = normalized.match(
    /^(?<min>\d+(?:\.\d+)?)\s*-\s*(?<max>\d+(?:\.\d+)?)\s*(?<unit>kg|kgs|lb|lbs)$/i
  );

  if (
    hyphenLoadRangeMatch?.groups?.min !== undefined &&
    hyphenLoadRangeMatch.groups.max !== undefined &&
    hyphenLoadRangeMatch.groups.unit !== undefined
  ) {
    const unit = normalizeLoadUnit(hyphenLoadRangeMatch.groups.unit);
    return {
      type: "load_range",
      min: Number(hyphenLoadRangeMatch.groups.min),
      max: Number(hyphenLoadRangeMatch.groups.max),
      unit
    };
  }

  const percentPlusLoadMatch = normalized.match(
    /^(?<percent>\d+(?:\.\d+)?)\s*%\s*(?:1\s*rm)?\s*(?<sign>[+-])\s*(?<offset>\d+(?:\.\d+)?)\s*(?<unit>kg|kgs|lb|lbs)$/i
  );
  if (
    percentPlusLoadMatch?.groups?.percent !== undefined &&
    percentPlusLoadMatch.groups.sign !== undefined &&
    percentPlusLoadMatch.groups.offset !== undefined &&
    percentPlusLoadMatch.groups.unit !== undefined
  ) {
    const unit = normalizeLoadUnit(percentPlusLoadMatch.groups.unit);
    const sign = percentPlusLoadMatch.groups.sign === "-" ? -1 : 1;
    return {
      type: "percent_1rm",
      value: Number(percentPlusLoadMatch.groups.percent),
      plus_load: { value: Number(percentPlusLoadMatch.groups.offset) * sign, unit }
    };
  }

  const percentMatch = normalized.match(/^(?<value>\d+(?:\.\d+)?)\s*%\s*(?:1\s*rm)?$/i);
  if (percentMatch?.groups?.value !== undefined) {
    return { type: "percent_1rm", value: Number(percentMatch.groups.value) };
  }

  const rpeMatch = normalized.match(
    /^(?:rpe\s*(?<value>\d+(?:\.\d+)?)|(?<value2>\d+(?:\.\d+)?)\s*rpe)$/i
  );
  if (rpeMatch?.groups?.value !== undefined) {
    return { type: "rpe", value: Number(rpeMatch.groups.value) };
  }
  if (rpeMatch?.groups?.value2 !== undefined) {
    return { type: "rpe", value: Number(rpeMatch.groups.value2) };
  }

  const rirMatch = normalized.match(
    /^(?:rir\s*(?<value>\d+(?:\.\d+)?)|(?<value2>\d+(?:\.\d+)?)\s*rir)$/i
  );
  if (rirMatch?.groups?.value !== undefined) {
    return { type: "rir", value: Number(rirMatch.groups.value) };
  }
  if (rirMatch?.groups?.value2 !== undefined) {
    return { type: "rir", value: Number(rirMatch.groups.value2) };
  }

  const loadMatch = normalized.match(/^(?<value>\d+(?:\.\d+)?)\s*(?<unit>kg|kgs|lb|lbs)$/i);
  if (loadMatch?.groups?.value !== undefined && loadMatch.groups.unit !== undefined) {
    const unit = normalizeLoadUnit(loadMatch.groups.unit);
    return { type: "load", value: Number(loadMatch.groups.value), unit };
  }

  throw new ShorthandParseError(`Unsupported intensity expression: ${raw}`);
}

function parseIntensityFromTokens(tokens: string[]): { intensity?: IntensityTarget; consumed: number } {
  if (tokens.length === 0 || !tokens[0]!.startsWith("@")) {
    return { consumed: 0 };
  }

  const first = tokens[0]!.slice(1);
  const candidates = [first, ...tokens.slice(1)];

  for (let end = candidates.length; end >= 1; end -= 1) {
    const candidate = candidates.slice(0, end).join(" ").trim();
    if (candidate === "") {
      continue;
    }

    try {
      const intensity = parseIntensityExpression(candidate);
      return { intensity, consumed: end };
    } catch {
      // Try shorter candidate.
    }
  }

  throw new ShorthandParseError(`Unsupported intensity expression: @${candidates.join(" ")}`);
}

function ensureConstraints(set: SetPrescription): NonNullable<SetPrescription["constraints"]> {
  if (!set.constraints) {
    set.constraints = {};
  }
  return set.constraints;
}

function ensureRepeat(set: SetPrescription): NonNullable<SetPrescription["repeat"]> {
  if (!set.repeat) {
    set.repeat = {};
  }
  return set.repeat;
}

function parseTailClauses(set: SetPrescription, rawTail: string): void {
  let remainder = rawTail.trim().replace(/\s+/g, " ");
  if (remainder === "") {
    return;
  }

  while (remainder !== "") {
    remainder = remainder.replace(/^[,;]+/, "").trim();
    if (remainder === "") {
      return;
    }

    const roleMatch = /^(?:role\s+)?(?<role>[a-z_][\w-]*)(?:\s+sets?)?\b/i.exec(remainder);
    if (roleMatch?.groups?.role) {
      const role = roleMatch.groups.role.toLowerCase();
      if (RESERVED_ROLES.has(role)) {
        set.role = role as SetRole;
        remainder = remainder.slice(roleMatch[0].length).trim();
        continue;
      }
    }

    const capMatch = /^cap@(?<value>\d+(?:\.\d+)?)\b/i.exec(remainder);
    if (capMatch?.groups?.value !== undefined) {
      ensureConstraints(set).max_rpe = Number(capMatch.groups.value);
      remainder = remainder.slice(capMatch[0].length).trim();
      continue;
    }

    const stopIfMatch = /^stop\s+if\s+(?<condition>.+)$/i.exec(remainder);
    if (stopIfMatch?.groups?.condition) {
      ensureRepeat(set).until = parseUntilCondition(stopIfMatch.groups.condition);
      remainder = "";
      continue;
    }

    const upToMatch = /^up\s+to\s+(?<maxSets>\d+)\s+sets?(?:\s+until\s+(?<condition>.+))?$/i.exec(remainder);
    if (upToMatch?.groups?.maxSets !== undefined) {
      const repeat = ensureRepeat(set);
      repeat.max_sets = Number(upToMatch.groups.maxSets);
      if (upToMatch.groups.condition) {
        repeat.until = parseUntilCondition(upToMatch.groups.condition);
      }
      remainder = "";
      continue;
    }

    const restBeforeMatch = /^(?:rest_before|before)\s*[:=]?\s*(?<duration>.+)$/i.exec(remainder);
    if (restBeforeMatch?.groups?.duration) {
      const seconds = parseDurationSecondsString(restBeforeMatch.groups.duration);
      if (seconds === undefined) {
        throw new ShorthandParseError(`Unsupported duration: ${restBeforeMatch.groups.duration}`);
      }
      set.rest_before_seconds = seconds;
      remainder = "";
      continue;
    }

    const restAfterMatch = /^(?:rest_after|after)\s*[:=]?\s*(?<duration>.+)$/i.exec(remainder);
    if (restAfterMatch?.groups?.duration) {
      const seconds = parseDurationSecondsString(restAfterMatch.groups.duration);
      if (seconds === undefined) {
        throw new ShorthandParseError(`Unsupported duration: ${restAfterMatch.groups.duration}`);
      }
      set.rest_after_seconds = seconds;
      remainder = "";
      continue;
    }

    const restMatch = /^rest\s*[:=]?\s*(?<duration>.+)$/i.exec(remainder);
    if (restMatch?.groups?.duration) {
      const seconds = parseDurationSecondsString(restMatch.groups.duration);
      if (seconds === undefined) {
        throw new ShorthandParseError(`Unsupported duration: ${restMatch.groups.duration}`);
      }
      set.rest_seconds = seconds;
      remainder = "";
      continue;
    }

    throw new ShorthandParseError(`Unsupported shorthand suffix: ${remainder}`);
  }
}

function parseAmrapShorthand(input: string): SetPrescription | undefined {
  const match = /^amrap\s+(?<duration>[^\s]+)\s*(?<rest>.*)$/i.exec(input.trim());
  if (!match?.groups?.duration) {
    return undefined;
  }

  const durationSeconds = parseDurationSecondsString(match.groups.duration);
  if (durationSeconds === undefined || durationSeconds <= 0) {
    throw new ShorthandParseError("AMRAP duration must be a positive duration (e.g. 8m).");
  }

  const set: SetPrescription = {
    count: 1,
    work_type: "time",
    time_mode: "amrap",
    duration_seconds: durationSeconds,
    role: "amrap"
  };

  const restRaw = match.groups.rest ?? "";
  const tokens = restRaw.trim() === "" ? [] : restRaw.trim().split(/\s+/);
  let cursor = 0;

  if (tokens[cursor]?.startsWith("@")) {
    const parsed = parseIntensityFromTokens(tokens.slice(cursor));
    if (parsed.intensity) {
      set.intensity = parsed.intensity;
      cursor += parsed.consumed;
    }
  }

  if (tokens[cursor]) {
    const capCompact = /^cap(?<value>\d+)$/i.exec(tokens[cursor]!);
    if (capCompact?.groups?.value !== undefined) {
      ensureConstraints(set).max_total_reps = Number(capCompact.groups.value);
      cursor += 1;
    } else if (/^cap$/i.test(tokens[cursor]!) && tokens[cursor + 1]) {
      if (!/^\d+$/.test(tokens[cursor + 1]!)) {
        throw new ShorthandParseError("AMRAP cap must be an integer.");
      }
      ensureConstraints(set).max_total_reps = Number(tokens[cursor + 1]);
      cursor += 2;
    }
  }

  const tail = tokens.slice(cursor).join(" ");
  if (tail !== "") {
    parseTailClauses(set, tail);
  }

  return set;
}

function parseEmomShorthand(input: string): SetPrescription | undefined {
  const match = /^emom\s+(?<duration>[^:]+)\s*:\s*(?<rest>.+)$/i.exec(input.trim());
  if (!match?.groups?.duration || !match.groups.rest) {
    return undefined;
  }

  const durationSeconds = parseDurationSecondsString(match.groups.duration.trim());
  if (durationSeconds === undefined || durationSeconds <= 0) {
    throw new ShorthandParseError("EMOM duration must be a positive duration (e.g. 10m).");
  }

  const rest = match.groups.rest.trim();
  const repsMatch = /^(?<reps>\d+(?:\s*-\s*\d+)?)\s*reps?(?<tail>.*)$/i.exec(rest);
  if (!repsMatch?.groups?.reps) {
    throw new ShorthandParseError('EMOM shorthand must include reps, e.g. "EMOM 10m: 3 reps @70%".');
  }

  const set: SetPrescription = {
    count: 1,
    work_type: "time",
    time_mode: "emom",
    duration_seconds: durationSeconds,
    interval_seconds: 60,
    reps: parseRepTargetExpression(repsMatch.groups.reps)
  };

  const emomTailRaw = repsMatch.groups.tail ?? "";
  const tailTokens =
    emomTailRaw.trim() === "" ? [] : emomTailRaw.trim().replace(/^,/, "").split(/\s+/);

  let cursor = 0;
  if (tailTokens[cursor]?.startsWith("@")) {
    const parsed = parseIntensityFromTokens(tailTokens.slice(cursor));
    if (parsed.intensity) {
      set.intensity = parsed.intensity;
      cursor += parsed.consumed;
    }
  }

  const tail = tailTokens.slice(cursor).join(" ");
  if (tail !== "") {
    parseTailClauses(set, tail);
  }

  return set;
}

function parseDensityShorthand(input: string): SetPrescription | undefined {
  const match = /^density\s+(?<duration>[^\s]+)\s+target\s+(?<target>\d+)\s*reps?(?<tail>.*)$/i.exec(input.trim());
  if (!match?.groups?.duration || !match.groups.target) {
    return undefined;
  }

  const durationSeconds = parseDurationSecondsString(match.groups.duration);
  if (durationSeconds === undefined || durationSeconds <= 0) {
    throw new ShorthandParseError("Density duration must be a positive duration (e.g. 8m).");
  }

  const set: SetPrescription = {
    count: 1,
    work_type: "time",
    time_mode: "density",
    duration_seconds: durationSeconds,
    target_total_reps: Number(match.groups.target)
  };

  const densityTailRaw = match.groups.tail ?? "";
  const tailTokens = densityTailRaw.trim() === "" ? [] : densityTailRaw.trim().split(/\s+/);

  let cursor = 0;
  if (tailTokens[cursor]?.startsWith("@")) {
    const parsed = parseIntensityFromTokens(tailTokens.slice(cursor));
    if (parsed.intensity) {
      set.intensity = parsed.intensity;
      cursor += parsed.consumed;
    }
  }

  const tail = tailTokens.slice(cursor).join(" ");
  if (tail !== "") {
    parseTailClauses(set, tail);
  }

  return set;
}

function parseForTimeShorthand(input: string): SetPrescription | undefined {
  const match =
    /^for\s*time\s+(?<duration>[^\s:]+)(?:(?:\s*:\s*|\s+target\s+)(?<target>\d+)\s*reps?)?(?<tail>.*)$/i.exec(
      input.trim()
    );
  if (!match?.groups?.duration) {
    return undefined;
  }

  const durationSeconds = parseDurationSecondsString(match.groups.duration);
  if (durationSeconds === undefined || durationSeconds <= 0) {
    throw new ShorthandParseError("For-time duration must be a positive duration (e.g. 8m).");
  }

  const set: SetPrescription = {
    count: 1,
    work_type: "time",
    time_mode: "for_time",
    duration_seconds: durationSeconds
  };

  if (match.groups.target !== undefined) {
    set.target_total_reps = Number(match.groups.target);
  }

  const forTimeTailRaw = match.groups.tail ?? "";
  const tailTokens = forTimeTailRaw.trim() === "" ? [] : forTimeTailRaw.trim().split(/\s+/);

  let cursor = 0;
  if (tailTokens[cursor]?.startsWith("@")) {
    const parsed = parseIntensityFromTokens(tailTokens.slice(cursor));
    if (parsed.intensity) {
      set.intensity = parsed.intensity;
      cursor += parsed.consumed;
    }
  }

  const tail = tailTokens.slice(cursor).join(" ");
  if (tail !== "") {
    parseTailClauses(set, tail);
  }

  return set;
}

function parseClassicSetShorthand(input: string): SetPrescription {
  const normalized = input.trim().replace(/\s+/g, " ");
  const tokens = tokenizeShorthand(normalized);

  if (tokens.length === 0) {
    throw new ShorthandParseError("Shorthand cannot be empty.");
  }

  const match = normalized.match(MAIN_PATTERN);
  if (!match?.groups?.count || !match.groups.repMin) {
    throw new ShorthandParseError(`Invalid shorthand expression: ${input}`);
  }

  const count = Number(match.groups.count);
  if (!Number.isInteger(count) || count < 1) {
    throw new ShorthandParseError("Set count must be a positive integer.");
  }

  const reps = parseReps(match.groups.repMin, match.groups.repMax);
  let rest = match.groups.rest?.trim() ?? "";
  let intensity: IntensityTarget | undefined;

  if (rest.startsWith("@")) {
    const rawTokens = rest.split(/\s+/);
    const parsed = parseIntensityFromTokens(rawTokens);
    if (!parsed.intensity || parsed.consumed < 1) {
      throw new ShorthandParseError(`Unsupported intensity expression: ${rest}`);
    }
    intensity = parsed.intensity;
    rest = rawTokens.slice(parsed.consumed).join(" ").trim();
  }

  const set: SetPrescription = {
    count,
    reps,
    intensity
  };

  if (rest !== "") {
    parseTailClauses(set, rest);
  }

  return set;
}

export function parseShorthand(input: string): SetPrescription {
  const normalized = input.trim();
  if (normalized === "") {
    throw new ShorthandParseError("Shorthand cannot be empty.");
  }

  const amrap = parseAmrapShorthand(normalized);
  if (amrap) {
    return amrap;
  }

  const emom = parseEmomShorthand(normalized);
  if (emom) {
    return emom;
  }

  const density = parseDensityShorthand(normalized);
  if (density) {
    return density;
  }

  const forTime = parseForTimeShorthand(normalized);
  if (forTime) {
    return forTime;
  }

  return parseClassicSetShorthand(normalized);
}
