export function roundToIncrement(value: number, increment: number): number {
  return Math.round(value / increment) * increment;
}

export function roundLoad(value: number, units: "kg" | "lb" = "kg"): number {
  const increment = units === "kg" ? 2.5 : 5;
  return roundToIncrement(value, increment);
}
