import type { IntensityTarget, LoadUnit, RepTarget, SetPrescription } from "../ast/types.js";
import { tokenizeShorthand } from "./tokenizer.js";

const MAIN_PATTERN =
  /^(?<count>\d+)x(?<repMin>\d+)(?:-(?<repMax>\d+))?(?:\s*@\s*(?<intensity>.+))?$/i;

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

function parseIntensity(raw: string): IntensityTarget {
  const normalized = raw.trim();

  const loadRangeMatch = normalized.match(
    /^\[(?<min>\d+(?:\.\d+)?)\s*,\s*(?<max>\d+(?:\.\d+)?)\]\s*(?<unit>kg|lb)$/i
  );
  if (
    loadRangeMatch?.groups?.min !== undefined &&
    loadRangeMatch.groups.max !== undefined &&
    loadRangeMatch.groups.unit !== undefined
  ) {
    const unit = loadRangeMatch.groups.unit.toLowerCase() as LoadUnit;
    return {
      type: "load_range",
      min: Number(loadRangeMatch.groups.min),
      max: Number(loadRangeMatch.groups.max),
      unit
    };
  }

  const percentMatch = normalized.match(/^(?<value>\d+(?:\.\d+)?)%$/);
  if (percentMatch?.groups?.value !== undefined) {
    return { type: "percent_1rm", value: Number(percentMatch.groups.value) };
  }

  const rpeMatch = normalized.match(/^rpe\s*(?<value>\d+(?:\.\d+)?)$/i);
  if (rpeMatch?.groups?.value !== undefined) {
    return { type: "rpe", value: Number(rpeMatch.groups.value) };
  }

  const rirMatch = normalized.match(/^rir\s*(?<value>\d+(?:\.\d+)?)$/i);
  if (rirMatch?.groups?.value !== undefined) {
    return { type: "rir", value: Number(rirMatch.groups.value) };
  }

  const loadMatch = normalized.match(/^(?<value>\d+(?:\.\d+)?)\s*(?<unit>kg|lb)$/i);
  if (loadMatch?.groups?.value !== undefined && loadMatch.groups.unit !== undefined) {
    const unit = loadMatch.groups.unit.toLowerCase() as LoadUnit;
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
    match.groups.intensity !== undefined ? parseIntensity(match.groups.intensity) : undefined;

  return {
    count,
    reps,
    intensity
  };
}
