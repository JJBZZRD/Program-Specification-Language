# Architecture Decisions (ADR-lite)

## 2026-02-19: v0.1 Uses YAML as Primary Source Format

- Decision: Source format is YAML for v0.1.
- Rationale: Human-friendly, mature tooling, easy comments and nesting.
- Consequence: Parser entrypoint handles YAML parsing before semantic validation.

## 2026-02-19: Canonical Intensity Union

- Decision: Intensity is a tagged union (`percent_1rm`, `rpe`, `rir`).
- Rationale: Explicit semantics and easier validation.
- Consequence: Shorthand parser maps textual forms into union members.

## 2026-02-19: Shorthand Compiles to Canonical AST

- Decision: Shorthand is never runtime-executed directly.
- Rationale: Deterministic behavior and cross-implementation consistency.
- Consequence: Parse stage emits canonical set fragments only.
