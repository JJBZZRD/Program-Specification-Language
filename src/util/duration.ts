export function parseDurationSecondsString(raw: string): number | undefined {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "") {
    return undefined;
  }

  const mmssMatch = normalized.match(/^(?<min>\d+)\s*:\s*(?<sec>\d{2})$/);
  if (mmssMatch?.groups?.min !== undefined && mmssMatch.groups.sec !== undefined) {
    const min = Number(mmssMatch.groups.min);
    const sec = Number(mmssMatch.groups.sec);
    if (!Number.isFinite(min) || !Number.isFinite(sec) || min < 0 || sec < 0 || sec >= 60) {
      return undefined;
    }
    return min * 60 + sec;
  }

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
