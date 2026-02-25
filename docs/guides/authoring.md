# PSL Authoring Guide (v0.2, v0.1-Compatible)

This is the primary tutorial for authoring PSL programs.

It combines:

- The full step-by-step v0.1 workflow.
- v0.2 language growth features for real coaching use (powerlifting + bodybuilding).
- A deep shorthand guide so coaches can author quickly without losing deterministic semantics.

PSL remains declarative internally. Shorthand is surface syntax that compiles to canonical AST.

## Table of Contents

- [Quickstart](#quickstart)
- [Versioning and Compatibility](#versioning-and-compatibility)
- [Step-by-Step: Build a Program](#step-by-step-build-a-program)
  - [Step 1: Set `language_version`](#step-1-set-language_version)
  - [Step 2: Add `metadata`](#step-2-add-metadata)
  - [Step 3: Add `calendar` (optional but often needed)](#step-3-add-calendar-optional-but-often-needed)
  - [Step 4: Choose `sessions` or `blocks`](#step-4-choose-sessions-or-blocks)
  - [Step 5: Place sessions in time (`day` or `schedule`)](#step-5-place-sessions-in-time-day-or-schedule)
  - [Step 6: Add exercises](#step-6-add-exercises)
  - [Step 7: Add set prescriptions](#step-7-add-set-prescriptions)
  - [Step 8: Add progression (optional)](#step-8-add-progression-optional)
  - [Step 9: Add v0.2 coach-grade features](#step-9-add-v02-coach-grade-features)
  - [Step 10: Validate](#step-10-validate)
  - [Step 11: Compile and materialize](#step-11-compile-and-materialize)
- [Reference](#reference)
  - [Top-Level Fields](#top-level-fields)
  - [Training Blocks](#training-blocks)
  - [Session](#session)
  - [Exercise](#exercise)
  - [Set](#set)
  - [Intensity Targets](#intensity-targets)
  - [Progression](#progression)
  - [Completion Results](#completion-results)
- [Shorthand Deep Dive (Coach-Focused)](#shorthand-deep-dive-coach-focused)
  - [Where shorthand is allowed](#where-shorthand-is-allowed)
  - [Set shorthand core](#set-shorthand-core)
  - [Intensity shorthand](#intensity-shorthand)
  - [Relative intensity shorthand (v0.2)](#relative-intensity-shorthand-v02)
  - [Time-based shorthand (v0.2)](#time-based-shorthand-v02)
  - [Tail clauses: caps, stop rules, rests (v0.2)](#tail-clauses-caps-stop-rules-rests-v02)
  - [Exercise shorthand](#exercise-shorthand)
  - [Schedule shorthand](#schedule-shorthand)
  - [Progression shorthand](#progression-shorthand)
  - [Shorthand recipes coaches actually use](#shorthand-recipes-coaches-actually-use)
  - [Shorthand troubleshooting](#shorthand-troubleshooting)
- [Compilation, Materialization, Export](#compilation-materialization-export)
- [Migration Notes (v0.1 -> v0.2)](#migration-notes-v01---v02)
- [Known Runtime Boundaries](#known-runtime-boundaries)

---

## Quickstart

From repo root:

```bash
# Validate
npm.cmd run psl:dev -- validate examples/hypertrophy_4day.psl.yaml

# Validate shorthand-heavy file
npm.cmd run psl:dev -- validate examples/shorthand_demo.psl.yaml

# Validate v0.2 growth example
npm.cmd run psl:dev -- validate examples/v0_2_language_growth.psl.yaml

# Compile canonical output
npm.cmd run psl:dev -- compile examples/v0_2_language_growth.psl.yaml --out out.compiled.json

# Materialize dated sessions
npm.cmd run psl:dev -- materialize examples/scheduling_demo.psl.yaml --out out.materialized.json

# Materialize with progression completions
npm.cmd run psl:dev -- materialize examples/progression_demo.psl.yaml --results examples/progression_demo.results.json --out out.progression_demo.materialized.json

# Print human-readable view
npm.cmd run psl:dev -- print examples/v0_2_language_growth.psl.yaml

# Export CSV/XLSX
npm.cmd run psl:dev -- export examples/v0_2_language_growth.psl.yaml --format csv --out out.program.sets.csv
npm.cmd run psl:dev -- export examples/v0_2_language_growth.psl.yaml --format xlsx --out out.program.xlsx
```

---

## Versioning and Compatibility

PSL currently accepts:

- `language_version: "0.1"`
- `language_version: "0.2"`

Recommended:

- Use `"0.2"` for new programs.
- Keep `"0.1"` for frozen historical programs if desired.

Compatibility guarantee in v0.2:

- Valid v0.1 documents still parse/validate/compile/materialize.

---

## Step-by-Step: Build a Program

### Step 1: Set `language_version`

For new authoring:

```yaml
language_version: "0.2"
```

---

### Step 2: Add `metadata`

```yaml
metadata:
  id: powerbuilding-12w
  name: Powerbuilding 12 Week
  description: Strength and hypertrophy blend.
  author: Team PSL
```

Required:

- `metadata.id`
- `metadata.name`

---

### Step 3: Add `calendar` (optional but often needed)

```yaml
calendar:
  start_date: "2026-03-02"
  end_date: "2026-05-24"
  timezone: "America/New_York" # stored/validated; runtime remains date-based
```

Use `calendar` when:

- You use repeating schedules (`session.schedule`), and/or
- You use executable progression (`increment` / `weekly_increment`), and/or
- You want materialized dated output.

---

### Step 4: Choose `sessions` or `blocks`

You must provide exactly one:

- `sessions` (flat program), or
- `blocks` (phased program).

#### Flat sessions

```yaml
sessions:
  - id: day-1
    name: Day 1
    day: 1
    exercises:
      - exercise: Back Squat
        sets: "3x5 @75%"
```

#### Blocks

```yaml
blocks:
  - id: accumulation
    name: Accumulation
    duration: "4w"
    sessions: []
  - id: deload
    duration: "1w"
    deload: true
    sessions: []
```

---

### Step 5: Place sessions in time (`day` or `schedule`)

Each session must use exactly one:

- `day` (fixed offset from `calendar.start_date`, 1-based), or
- `schedule` (repeating pattern).

#### Fixed day

```yaml
day: 3
```

#### Repeating schedule object

```yaml
schedule:
  type: weekdays
  days: [MON, THU]
```

or:

```yaml
schedule:
  type: interval_days
  every: 2
```

#### Schedule shorthand

```yaml
schedule: "MON, THU"
schedule: "every other day"
schedule: "every 4 days +1"
```

---

### Step 6: Add exercises

Structured:

```yaml
exercises:
  - exercise: Competition Bench Press
    sets: ["5x5 @75%"]
```

Shorthand:

```yaml
exercises:
  - "Competition Bench Press: 5x5 @75%; rest 2m"
```

Multi-exercise shorthand block:

```yaml
exercises: |
  Bench Press:
    5x5 @75%
    rest 2m
  Chest Supported Row: 4x10 @RIR2
```

---

### Step 7: Add set prescriptions

Structured set:

```yaml
sets:
  - count: 4
    reps:
      min: 6
      max: 8
    intensity:
      type: rpe
      value: 8
```

Shorthand set:

```yaml
sets:
  - "4x6-8 @RPE8"
```

Multiline sets block:

```yaml
sets: |
  1x1 @RPE8 # top
  4x4 @75% # volume
```

---

### Step 8: Add progression (optional)

Executable in v0.2 runtime:

- `increment`
- `weekly_increment`

Example:

```yaml
progression:
  type: increment
  cadence:
    type: sessions
    every: 3
    on_weekdays: [FRI]
  when:
    type: metric_vs_target
    metric: load
    op: ">="
    target: value
  by: 2.5
```

Shorthand:

```yaml
progression: "+2.5kg every 3 sessions on FRI if load>=target"
```

---

### Step 9: Add v0.2 coach-grade features

This is the main v0.2 expansion set.

#### 9.1 Exercise identity + aliases

```yaml
exercise_aliases:
  "comp squat": squat_comp
  "cgbp": bench_cg

exercises:
  - exercise: Competition Squat
    exercise_id: squat_comp
    aliases: ["high bar squat", "comp squat"]
```

#### 9.2 Warmup + top/backoff roles

```yaml
exercises:
  - exercise: Competition Squat
    warmup:
      type: percent_ramp
      from_percent: 40
      to_percent: 85
      steps: 4
      reps: 3
      based_on_role: top
    sets:
      - "1x1 @RPE8 role top"
      - "3x3 @-12% backoff"
```

#### 9.3 Grouping (A1/A2 supersets, circuits, giant sets)

```yaml
groups:
  - id: A
    type: superset
    rounds: 4
    rest_between_rounds: 2m
exercises:
  - "A1 Incline DB Press: 1x10 @RIR2"
  - "A2 Chest Supported Row: 1x12 @RIR2"
```

#### 9.4 Time prescriptions + density

```yaml
sets:
  - "AMRAP 8m @RPE8 cap12"
  - "EMOM 10m: 3 reps @70%"
  - "density 8m target 30 reps"
  - "for time 8m target 30 reps @RPE8"
```

#### 9.5 Constraints + repeat/termination shape

```yaml
sets:
  - "1x5 @RPE8 cap@9 up to 5 sets until RPE9"
```

Structured equivalent:

```yaml
sets:
  - count: 1
    reps: 5
    intensity: { type: rpe, value: 8 }
    constraints: { max_rpe: 9 }
    repeat:
      max_sets: 5
      until:
        metric: rpe
        op: ">="
        value: 9
```

#### 9.6 Progression scope/aggregation/action shape

```yaml
progression:
  type: auto_adjust
  scope: exercise
  criteria:
    aggregation: all_sets
    condition:
      type: session_success
      equals: true
  actions:
    - type: reduce_load
      by: { value: 2.5, unit: kg }
```

Runtime note: `auto_adjust` is declarative in v0.2 (validated + compiled), not executed during materialization yet.

#### 9.7 Deload + fatigue modifiers

```yaml
deload: true
volume_multiplier: 0.6
intensity_cap:
  max_rpe: 7
exercise_swap_map:
  squat_comp: squat_paused
```

`deload: true` can be used as sugar (it fills defaults if omitted).

#### 9.8 Multi-session per day

```yaml
slot: AM # or PM, EVE, or integer order
```

#### 9.9 Families/substitutions/tags

```yaml
family: squat
tags: [barbell, paused]
substitutions:
  - exercise_id: squat_comp
    rank: 1
  - exercise: Safety Bar Squat
    rank: 2
    constraints:
      requires: [safety_bar]
```

#### 9.10 Units, rounding, tempo metadata

```yaml
units: kg
rounding:
  round_to: 2.5
  mode: nearest
  equipment:
    barbell: 2.5

tempo: "31X0"
pause_seconds: 1
eccentric_seconds: 3
```

---

### Step 10: Validate

```bash
npm.cmd run psl:dev -- validate path/to/program.psl.yaml
```

#### Machine-readable JSON mode

When integrating PSL with automated tooling (including AI-assisted authoring loops), add `--json`.
In JSON mode, stdout contains exactly one JSON object and the process exit code is:

- `0` when `"ok": true`
- `1` when `"ok": false`

Examples:

```bash
psl validate --json examples/hypertrophy_4day.psl.yaml

cat program.psl.yaml | psl validate --stdin --json --filename program.psl.yaml

psl materialize --json --results examples/results.json --start-date 2026-03-02 --end-date 2026-03-16 program.psl.yaml
```

---

### Step 11: Compile and materialize

Compile (normalize to canonical program):

```bash
npm.cmd run psl:dev -- compile path/to/program.psl.yaml --out out.compiled.json
```

Materialize (generate dated occurrences):

```bash
npm.cmd run psl:dev -- materialize path/to/program.psl.yaml --out out.materialized.json
```

Materialize with results (for executable progression):

```bash
npm.cmd run psl:dev -- materialize path/to/program.psl.yaml --results path/to/results.json --out out.materialized.json
```

---

## Reference

### Top-Level Fields

Required:

- `language_version`
- `metadata`

And exactly one of:

- `sessions`
- `blocks`

Optional:

- `calendar`
- `units`
- `rounding`
- `exercise_aliases`

### Training Blocks

Block shape:

```yaml
blocks:
  - id: accumulation
    name: Accumulation
    duration: "4w" # or "28d" or { type: weeks|days, value: N }
    sessions: []
```

Blocks are expanded into normalized sessions with:

- Namespaced ids: `<block_id>.<session_id>`
- Shifted `day` or schedule offsets
- Schedule bounding via `end_offset_days`
- Calendar end-date derivation from total block duration

### Session

Core fields:

- `id`, `name`
- one of `day` or `schedule`
- `exercises`

v0.2 additions:

- `slot`
- `rest_default_seconds` / alias `rest_default`
- `groups`
- `constraints`
- `modifiers` and inline modifier sugar (`deload`, `volume_multiplier`, `intensity_cap`, `exercise_swap_map`)

### Exercise

Core:

- `exercise`
- `sets`
- optional `rest_seconds` / alias `rest`

v0.2 additions:

- `exercise_id`, `aliases`
- `family`, `tags`, `modifiers`
- `substitutions`
- `constraints`
- `warmup`
- `group_id`
- `rest_before_seconds` / `rest_after_seconds` (and aliases `rest_before` / `rest_after`)
- `units`, `rounding`
- `tempo`, `pause_seconds`, `eccentric_seconds`

### Set

Core:

- `count`
- `reps` (number / range object / range string)
- optional `intensity`
- optional `progression`

v0.2 additions:

- `work_type: reps | time`
- `time_mode: amrap | emom | for_time | density`
- `duration_seconds`, `interval_seconds`, `target_total_reps`
- `role`
- `rest_before_seconds`, `rest_after_seconds`
- `constraints`
- `repeat`
- `tempo`, `pause_seconds`, `eccentric_seconds`

### Intensity Targets

Supported:

- `percent_1rm`
- `rpe`
- `rir`
- `load`
- `load_range`
- `percent_of_set` (v0.2)
- `load_delta_from_set` (v0.2)

Examples:

```yaml
intensity: { type: percent_1rm, value: 75 }
intensity: { type: rpe, value: 8 }
intensity: { type: load, value: 180, unit: kg }
intensity: { type: load_range, min: 80, max: 90, unit: kg }
intensity: { type: percent_of_set, role: top, value: 88 }
intensity: { type: load_delta_from_set, role: top, value: -10, unit: kg }
```

### Progression

Executable in v0.2:

- `increment`
- `weekly_increment`

Declarative shape added in v0.2 (runtime deferred):

- `auto_adjust`
- `scope: set | exercise | session`
- `criteria.aggregation: all_sets | any_set | last_set | total_reps | avg_rpe | min_load`
- actions:
  - `repeat_week`
  - `reduce_load`
  - `reduce_volume`
  - `switch_variant`

### Completion Results

Results JSON can be:

- `[]` session list, or
- `{ "sessions": [] }`

Per session entry:

- `session_id`
- `date_iso`
- optional `success`
- optional `exercises`

Per exercise entry:

- `exercise` (legacy/name matching)
- optional `exercise_id` (v0.2 identity matching)
- `sets`

Per set entry:

- `index`
- optional achieved `load` / `rpe` / `rir`
- optional `reps_completed` (v0.2 extension)

---

## Shorthand Deep Dive (Coach-Focused)

This section is intentionally detailed.

### Where shorthand is allowed

- `session.schedule` as string
- `session.exercises` as:
  - array of exercise strings
  - multiline exercise block string
- `exercise.sets` as:
  - array of set strings
  - multiline set block string
- `set.reps` as string (`"8-12"`)
- `set.intensity` as string
- `set.progression` as string
- rest durations as strings (`"90s"`, `"2m"`, `"2:30"`)
- block duration as string (`"4w"`, `"10d"`)

### Set shorthand core

Base pattern:

- `<count>x<reps>`
- `<count>x<min>-<max>`

Examples:

- `5x5`
- `4x6-8`
- `3 x 8 - 10`

Add intensity with `@...`:

- `5x5 @75%`
- `3x8-10 @RPE8`

Inline progression can also be authored directly in set shorthand blocks/strings by adding a semicolon progression segment after a set:

- `1x4 @75%; +2.5kg every week if success`
- `3x8 @100kg; +2.5kg every 2 weeks if success`

Inline progression segment rule:

- It attaches to the immediately preceding set in the same shorthand block.
- It must follow a set (not start a block).
- It uses the same grammar as `set.progression` shorthand.

### Intensity shorthand

Percent / percent+offset:

- `@75%`
- `@75%1RM`
- `@70%+5lb`
- `@70%-2.5kg`

RPE / RIR:

- `@RPE8`, `@8RPE`
- `@RIR2`, `@2RIR`

Absolute load:

- `@150kg`
- `@315lb`

Load range:

- `@[100,120]kg`
- `@100-120kg`

### Relative intensity shorthand (v0.2)

Percent of prior role set:

- `@88% of top`
- `@88% from role top`

Percent delta from prior role set:

- `@-12%` (defaults role to `top`)
- `@-12% from top`
- `@+5% from top`

Load delta from prior role set:

- `@-10kg` (defaults role to `top`)
- `@-10kg from top`
- `@+5lb from top`

Important:

- Role-referenced intensity must point to a previously defined role inside the same exercise.

### Time-based shorthand (v0.2)

AMRAP:

- `AMRAP 8m @RPE8`
- `AMRAP 8m @RPE8 cap12`

EMOM:

- `EMOM 10m: 3 reps @70%`
- `EMOM 12m: 2-3 reps @RPE7`

Density:

- `density 8m target 30 reps`

For-time:

- `for time 8m target 30 reps`
- `for time 8m: 30 reps @RPE8`

### Tail clauses: caps, stop rules, rests (v0.2)

You can append clauses after set/intensity:

- `cap@9` -> `constraints.max_rpe = 9`
- `stop if RPE>9`
- `up to 5 sets until RPE9`
- `rest 2m`
- `rest_before 90s` or `before 90s`
- `rest_after 5m` or `after 5m`
- `role top`, `backoff`, `work`, etc.

Examples:

```yaml
sets:
  - "1x5 @RPE8 cap@9 up to 5 sets until RPE9"
  - "1x1 @RPE8 role top rest_after 5m"
  - "3x3 @-12% backoff rest 3m"
```

### Exercise shorthand

Single-line:

```yaml
exercises:
  - "Bench Press: 5x5 @75%; 1x5 @80%; rest 2m"
```

Exercise shorthand also supports inline progression segments for the previous set:

```yaml
exercises:
  - "Romanian Deadlift: 3x8 @100kg; rest 2m; +2.5kg every 2 weeks if success"
```

In that example, `+2.5kg every 2 weeks if success` applies to the `3x8 @100kg` set.

Multiline:

```yaml
exercises:
  - |
    Deadlift:
      1x5 @100kg
      3x5 @[90,100]kg # backoffs
      rest 3m
```

Multiple exercises in one block:

```yaml
exercises: |
  A1 Incline DB Press:
    1x10 @RIR2
  A2 Chest Supported Row:
    1x12 @RIR2
```

`A1` / `A2` prefixes infer `group_id: A`.

### Schedule shorthand

Interval:

- `every other day`
- `every 4 days`
- `4d`

Weekdays:

- `MON, FRI`
- `on Tuesday Thursday`
- `every Tue/Thu`

Offsets:

- `every 4 days +1`
- `MON, FRI offset 2`

### Progression shorthand

Examples:

```yaml
progression: "+2.5kg every week"
progression: "+2.5% every week"
progression: "+5lb every week"
progression: "+2.5 every 3 sessions on FRI if load>=target"
progression: "-0.5 every 2 weeks if success"
```

Defaults:

- Missing cadence -> weekly.
- Missing condition -> `session_success == true`.

Inline progression in set/exercise shorthand uses the exact same progression grammar.

### Shorthand recipes coaches actually use

#### Top set + backoffs

```yaml
sets: |
  1x1 @RPE8 role top
  4x3 @-10% backoff
```

#### Bodybuilding superset

```yaml
exercises: |
  A1 Incline DB Press: 1x10 @RIR2
  A2 Chest Supported Row: 1x12 @RIR2
```

#### Density finisher

```yaml
sets:
  - "density 8m target 30 reps @RPE8"
```

#### AMRAP with cap + stop

```yaml
sets:
  - "AMRAP 8m @RPE8 cap12 stop if RPE>9"
```

#### Repeat-until ladder

```yaml
sets:
  - "1x5 @RPE8 up to 5 sets until RPE9"
```

### Shorthand troubleshooting

If shorthand fails validation:

1. Validate first:
   - `npm.cmd run psl:dev -- validate your-program.psl.yaml`
2. Read diagnostic `path`:
   - multiline shorthand includes `[line N]` for faster location.
3. Check common issues:
   - Missing `@` before intensity token.
   - Invalid duration token (`8min` is invalid; use `8m`).
   - Role reference appears before any set with that role.
   - Inline progression appears before any set in the shorthand block.
   - Inline progression provided more than once for the same set.
   - `+kg`/`+lb` progression with non-load targets (for RPE/RIR targets, use numeric point changes or prescribe a load/percent target).
   - Mixed structured and shorthand fields in one set object (`shorthand` + `count/reps/intensity`).
   - Using time-only fields with `work_type: reps`.

---

## Compilation, Materialization, Export

### Compile

`compile` produces canonical normalized shape:

- Expands `count` into explicit set instances.
- Resolves rest inheritance:
  - `set.rest_seconds` overrides `exercise.rest_seconds` overrides `session.rest_default_seconds`.
- Applies deterministic deload transforms (`volume_multiplier`, `intensity_cap`, `exercise_swap_map`).

### Materialize

`materialize` creates dated session occurrences:

- `date_iso`
- `occurrence`
- `sequence`
- `day`
- `slot` (v0.2 multi-session/day separation)

Progression execution in v0.2 materialization:

- Executed: `increment`, `weekly_increment`
- Not executed yet: `auto_adjust` action logic

### Export

`export` supports:

- CSV
- XLSX
- `layout data`
- `layout client`

Sets export includes slot-aware data columns (for same-day AM/PM/EVE sessions).

---

## Migration Notes (v0.1 -> v0.2)

1. No forced rewrite: v0.1 programs remain valid.
2. For new documents, set:

```yaml
language_version: "0.2"
```

3. Recommended incremental migration:
   - Add `exercise_id` + alias maps first.
   - Add set `role` semantics for top/backoff structure.
   - Add groups (`A1/A2`) and rest loci as needed.
   - Add constraints/repeat shape where coaches currently write notes.
   - Keep runtime progression on increment rules until `auto_adjust` runtime lands.

---

## Known Runtime Boundaries

v0.2 intentionally separates declarative language shape from runtime execution maturity.

Implemented runtime behavior:

- Parse/validate/compile for all v0.2 fields in this guide.
- Materialize executable progression (`increment`, `weekly_increment`) with completion results.

Deferred runtime behavior (declarative now, executable later):

- `auto_adjust` action evaluation.
- Full repeat/until stopping engine during session execution.
- Runtime load realization for role-referenced intensities (`percent_of_set`, `load_delta_from_set`).
- Automatic substitution selection using constraints.

---

## Related Spec Files

- `spec/versions/0.2.md`
- `spec/versions/0.1.md`
- `spec/psl.schema.json`
- `spec/validation.md`
- `spec/shorthand.ebnf`
