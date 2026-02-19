import type { RuntimeContext } from "./context.js";

export interface RuleResult {
  applied: boolean;
  message: string;
}

export function evaluateRules(_context: RuntimeContext): RuleResult[] {
  return [];
}
