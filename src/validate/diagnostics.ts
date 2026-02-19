export type DiagnosticSeverity = "error" | "warning";

export interface Diagnostic {
  path: string;
  message: string;
  severity: DiagnosticSeverity;
}

export interface ValidationResult<T = unknown> {
  valid: boolean;
  diagnostics: Diagnostic[];
  value?: T;
}
