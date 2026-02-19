# Architecture Decisions (ADR-lite)

## 2026-02-19: v0.1 Uses YAML as Primary Source Format

- Decision: Source format is YAML for v0.1.
- Rationale: Human-friendly, mature tooling, easy comments and nesting.
- Consequence: Parser entrypoint handles YAML parsing before semantic validation.

## 2026-02-19: Canonical Intensity Union

- Decision: Intensity is a tagged union (`percent_1rm`, `rpe`, `rir`, `load`, `load_range`).
- Rationale: Explicit semantics and easier validation.
- Consequence: Shorthand parser maps textual forms into union members.

## 2026-02-19: Shorthand Compiles to Canonical AST

- Decision: Shorthand is never runtime-executed directly.
- Rationale: Deterministic behavior and cross-implementation consistency.
- Consequence: Parse stage emits canonical set fragments only.

## 2026-02-19: Progression Is Set-Level (v0.1)

- Decision: Progression rules attach to set prescriptions via `set.progression`.
- Rationale: Progression is usually prescribed per exercise/set pattern (e.g., weekly load increases) and should travel with the prescription.
- Consequence: Materialization can apply progression deterministically when provided completion results, without modifying the authored source.
