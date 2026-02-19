import { createHash } from "node:crypto";

function stableSort(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableSort(item));
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );

    const sorted: Record<string, unknown> = {};
    entries.forEach(([key, entryValue]) => {
      sorted[key] = stableSort(entryValue);
    });

    return sorted;
  }

  return value;
}

export function hashSource(value: unknown): string {
  const normalized = JSON.stringify(stableSort(value));
  return createHash("sha256").update(normalized).digest("hex");
}
