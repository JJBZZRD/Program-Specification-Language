import { hashSource } from "./hash.js";

export function createId(prefix: string, value: string): string {
  const normalizedPrefix = prefix.trim().toLowerCase().replace(/\s+/g, "-");
  const normalizedValue = value.trim().toLowerCase();
  const suffix = hashSource(normalizedValue).slice(0, 8);

  return `${normalizedPrefix}-${suffix}`;
}
