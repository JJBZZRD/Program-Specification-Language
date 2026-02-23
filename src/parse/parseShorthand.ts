import type { IntensityTarget, LoadUnit, RepTarget, SetPrescription } from "../ast/types.js";
import { tokenizeShorthand } from "./tokenizer.js";

const MAIN_PATTERN =
  /^(?<count>\d+)\s*x\s*(?<repMin>\d+)(?:\s*-\s*(?<repMax>\d+))?(?:\s*@\s*(?<intensity>.+))?$/i;

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

export function parseIntensityExpression(raw: string): IntensityTarget {
  const normalized = raw.trim().replace(/^@+/, "").trim();

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

export function parseShorthand(input: string): SetPrescription {
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
  const intensity =
    match.groups.intensity !== undefined ? parseIntensityExpression(match.groups.intensity) : undefined;

  return {
    count,
    reps,
    intensity
  };
}
