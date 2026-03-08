# AI Context Pack: Program Specification Language (PSL)

This file is an agent-first orientation map for this repository.

## 1) Purpose and Philosophy

PSL is a declarative DSL for resistance training programs.

- Declarative core: author intent is normalized into canonical data structures, not imperative runtime scripts.
- Imperative-feeling shorthand is surface sugar only.
- Deterministic normalization: YAML + shorthand are validated into canonical AST (`ProgramAst`) and then compiled into canonical compiled output.

Primary design references:

- `docs/design/principles.md`
- `docs/design/decisions.md`

## 2) Core Ontology (Semantic Primitives)

- `Program`: top-level document (`language_version`, `metadata`, optional calendar/units/rounding, optional top-level `sequence`, and exactly one of `sessions` or `blocks`).
- `Calendar`: dated context (`start_date`, optional `end_date`, optional `timezone`) used for schedule expansion/materialization.
- `Block`: phase container with duration (`4w`, `10d`, or typed object), optional modifiers, and nested sessions; expands into namespaced sessions.
- `Session`: training template with `id`, `name`, exercises, and canonical timing via exactly one of `day` or `schedule` after normalization.
- `Group`: intra-session grouping (`superset`, `circuit`, `giant_set`) referenced by `exercise.group_id`.
- `Exercise`: movement prescription with sets and optional identity (`exercise_id`), aliases, constraints, warmups, substitutions, tempo, and rest loci.
- `Set`: atomic prescription (`count`, reps/time work, intensity, role, rest fields, constraints, repeat, progression, notes).
- `Intensity`: target union (`percent_1rm`, `rpe`, `rir`, `load`, `load_range`, `percent_of_set`, `load_delta_from_set`).
- `Progression`: rule attached to sets (`increment`, `weekly_increment`, `auto_adjust` declarative shape).
- `Constraints`: declarative limits such as `max_rpe`, `max_sets`, `max_total_reps`, `velocity_loss_cap`.
- `Substitutions`: ranked alternatives per exercise (validated and compiled as data; selection runtime is deferred).

## 3) Authoring Surfaces: Where Shorthand Is Accepted Today

Shorthand is currently accepted in these source fields:

- `session.schedule`: string shorthand (examples: `"MON, FRI"`, `"every other day"`, `"every 4 days +1"`).
- `program.sequence`: ordered split authoring sugar for flat `sessions` programs (`repeat`, `items[].session_id`, `items[].rest_after_days`), normalized to canonical timing primitives in validation.
- `session.exercises`: multi-exercise shorthand block string.
- `session.exercises[]`: exercise shorthand string entries (for example `"Bench Press: 5x5 @75%; rest 2m"`).
- `exercise.sets`: string shorthand block.
- `exercise.sets[]`: set shorthand string entries.
- `set.shorthand`: wrapper shorthand field inside structured set object.
- `set.reps`: string reps shorthand (for example `"8-12"`).
- `set.intensity`: string intensity shorthand.
- `set.progression`: string progression shorthand.
- Duration aliases across rest/time fields accept duration strings (`90s`, `2m`, `2:30`) where duration parsing is supported.
- `block.duration`: string shorthand (`"4w"`, `"10d"`).

Inline progression shorthand (`; +2.5kg every week if success`) is supported in set/exercise shorthand blocks and attaches to the immediately preceding shorthand set.

## 4) Key Invariants and Defaults (As Implemented)

### Structural invariants

- Program must define exactly one of `sessions` or `blocks`.
- Session must define exactly one of `day` or `schedule` in canonical AST; v0.3 source may use top-level `sequence` instead for flat sessions programs.
- Session must include at least one exercise.
- Exercise must include at least one set.
- Session IDs must be unique after block expansion (`<block_id>.<session_id>`).

### Scheduling and calendar invariants

- If any session uses `schedule`, `calendar` is required.
- If repeating schedules are unbounded (`end_offset_days` missing), `calendar.end_date` is required.
- With blocks + calendar, `calendar.end_date` is auto-derived from total block duration if omitted; if provided, it must match.

### Rest semantics and inheritance

Mutual-exclusion aliases are enforced:

- `set.rest` vs `set.rest_seconds`
- `exercise.rest` vs `exercise.rest_seconds`
- `session.rest_default` vs `session.rest_default_seconds`

Compile-time inheritance (implemented):

- `set.rest_seconds -> exercise.rest_seconds -> session.rest_default_seconds`
- `rest_before_seconds`: set overrides exercise (no session default)
- `rest_after_seconds`: set overrides exercise (no session default)

### Units and rounding defaults (implemented behavior)

- `units` supports `kg | lb` at top-level and exercise scope.
- `rounding` shape is validated and carried through compile output.
- Compile/materialize/export do not automatically apply rounding policies today.
- Helper defaults in `src/compile/rounding.ts`:
  - `roundLoad(value, "kg")` uses 2.5 increment by default.
  - `roundLoad(value, "lb")` uses 5 increment.

### Deload defaults

If `deload: true` is set in modifiers, defaults are filled when absent:

- `volume_multiplier: 0.6`
- `intensity_cap.max_rpe: 7`

### Materialization semantics

- `day` is 1-based from `calendar.start_date`.
- `schedule.start_offset_days`/`end_offset_days` are 0-based from `calendar.start_date`.
- Repeating schedules are expanded until effective end date (calendar end, optionally bounded by schedule end offset).
- Output occurrences are sorted by `date_iso`, then slot order, then session id.
- If no `calendar.start_date` and no executable progression is used, `materialize()` returns session templates with `sequence` only (no date expansion).

### Progression defaults and runtime boundary

- Progression shorthand defaults cadence to weekly (`every: 1`) if omitted.
- Progression shorthand defaults condition to session success when omitted.
- Executed at materialization runtime: `increment` and `weekly_increment`.
- Declarative-only in v0.2 (validated/compiled but not executed): `auto_adjust` action engine, repeat-until execution, substitution selection, full role-referenced load realization.

## 5) What Is Authoritative

Primary source-of-truth files:

- Schema: `spec/psl.schema.json`
- Shorthand grammar: `spec/shorthand.ebnf`
- Semantic validation rules: `spec/validation.md`
- Version notes: `spec/versions/0.1.md`, `spec/versions/0.2.md`, `spec/versions/0.3.md`

Authoring guides (high-level, not canonical over schema/validator behavior):

- `docs/guides/authoring.md`
- `docs/guides/authoring_v0.1.md`

Design/context references:

- `docs/context.md`
- `docs/design/principles.md`
- `docs/design/glossary.md`

## 6) Practical Commands (Windows-Friendly)

Use `npm.cmd` on PowerShell when script policy blocks `npm.ps1`.

### Validate

```bash
npm.cmd run psl:dev -- validate examples/hypertrophy_4day.psl.yaml
npm.cmd run psl:dev -- validate examples/shorthand_demo.psl.yaml --json
```

### Compile

```bash
npm.cmd run psl:dev -- compile examples/hypertrophy_4day.psl.yaml --out out.compiled.json
npm.cmd run psl:dev -- compile examples/hypertrophy_4day.psl.yaml --json
```

### Materialize

```bash
npm.cmd run psl:dev -- materialize examples/scheduling_demo.psl.yaml --out out.materialized.json
npm.cmd run psl:dev -- materialize examples/progression_demo.psl.yaml --results examples/progression_demo.results.json --json
```

### Export

```bash
npm.cmd run psl:dev -- export examples/blocks_demo.psl.yaml --format csv --out out.program.csv
npm.cmd run psl:dev -- export examples/blocks_demo.psl.yaml --layout client --format xlsx --out out.client.xlsx
```

### JSON mode contract

`--json` is implemented for:

- `validate`
- `compile`
- `materialize`

JSON mode is not implemented for `export` or `print`.

## 7) Cookbook (Minimal Patterns)

### A) Fixed-day session

```yaml
sessions:
  - id: day-1
    name: Day 1
    day: 1
    exercises:
      - exercise: Back Squat
        sets: ["3x5 @75%"]
```

### B) Weekdays schedule

```yaml
schedule:
  type: weekdays
  days: [MON, FRI]
```

### C) Interval-days schedule

```yaml
schedule:
  type: interval_days
  every: 2
```

### D) Shorthand exercise block

```yaml
exercises: |
  Bench Press:
    5x5 @75%
    rest 2m
  Row: 4x10 @RIR2
```

### E) Shorthand sets block

```yaml
sets: |
  1x1 @RPE8 role top
  3x3 @-12% backoff
```

### F) Percent + load offset intensity

```yaml
intensity:
  type: percent_1rm
  value: 70
  plus_load: { value: 5, unit: lb }
```

Shorthand equivalent: `@70%+5lb`

### G) Load window

```yaml
intensity:
  type: load_range
  min: 80
  max: 90
  unit: kg
```

Shorthand equivalent: `@[80,90]kg`

### H) Progression with cadence

```yaml
progression:
  type: increment
  cadence: { type: sessions, every: 3 }
  when: { type: metric_vs_target, metric: load, op: ">=", target: value }
  by: 2.5
```

### I) Blocks/phases

```yaml
blocks:
  - id: accumulation
    duration: "4w"
    sessions: []
  - id: deload
    duration: "1w"
    deload: true
    sessions: []
```

See full real examples in `examples/`:

- `examples/scheduling_demo.psl.yaml`
- `examples/shorthand_demo.psl.yaml`
- `examples/progression_demo.psl.yaml`
- `examples/blocks_demo.psl.yaml`
- `examples/v0_2_language_growth.psl.yaml`

## 8) Public API Entrypoint and Hot Spots

### Public API

- `src/index.ts`

Main exports include:

- `parseDocument`
- `validateAst`
- `compileProgram`
- `materialize`

### Implementation hot spots

- Parse: `src/parse/`
  - `parseDocument.ts`
  - `parseShorthand.ts`
- Validate and normalize: `src/validate/validateAst.ts`
- Compile canonical program: `src/compile/compileProgram.ts`
- Materialize schedules/progression: `src/compile/materialize.ts`
- CLI entrypoint and commands: `cli/src/main.ts`, `cli/src/commands/`
- Runtime placeholders/future rules: `src/runtime/`

## 9) Quick Routing for Agents

If you need...

- Syntax/shape constraints: start with `spec/psl.schema.json`.
- Shorthand grammar details: `spec/shorthand.ebnf` then `src/parse/parseShorthand.ts`.
- Semantic rule truth: `src/validate/validateAst.ts` and `spec/validation.md`.
- Runtime scheduling/progression behavior: `src/compile/materialize.ts`.
- Stable machine CLI responses: `cli/src/util/machine.ts` and `tests/cli-json.test.ts`.
- Current feature boundaries: `FEATURES.md` and `docs/roadmap.md`.
