# PSL Authoring Guide (v0.1)

This guide walks you step by step through authoring a PSL program in YAML.

PSL is designed to be:

- Declarative: you describe the plan, not an execution script.
- Portable: programs compile into a canonical structure consumable by apps.
- Coach-friendly: shorthand is allowed, but compiles into a canonical AST.

If you want the formal schema/spec, see:

- `spec/psl.schema.json`
- `spec/validation.md`
- `spec/shorthand.ebnf`

## Table of Contents

- [Quickstart](#quickstart)
- [Step-by-Step: Build a Program](#step-by-step-build-a-program)
- [Complete Example (Scheduled Program)](#complete-example-scheduled-program)
- [Reference](#reference)
  - [Top-Level Fields](#top-level-fields)
  - [Session](#session)
  - [Exercise](#exercise)
  - [Set](#set)
  - [Intensity Targets](#intensity-targets)
  - [Shorthand Syntax](#shorthand-syntax)
  - [Compilation Output](#compilation-output)
  - [Materialization Output](#materialization-output)
  - [Validation and Diagnostics](#validation-and-diagnostics)
- [Known Limitations](#known-limitations)

## Quickstart

From the repo root:

```bash
# Validate
npm.cmd run psl:dev -- validate examples/hypertrophy_4day.psl.yaml

# Compile (canonical compiled structure)
npm.cmd run psl:dev -- compile examples/hypertrophy_4day.psl.yaml --out out.compiled.json

# Materialize (expand schedules into dated session instances)
npm.cmd run psl:dev -- materialize examples/scheduling_demo.psl.yaml --out out.materialized.json

# Print (human-readable view)
npm.cmd run psl:dev -- print examples/powerlifting_peak.psl.yaml
```

## Step-by-Step: Build a Program

This section is the linear workflow. Each step links to a deeper reference section.

### Step 1: Pick a Language Version (`language_version`)

PSL documents are versioned. For v0.1, set:

```yaml
language_version: "0.1"
```

Reference: [`language_version`](#language_version)

### Step 2: Add Program Metadata (`metadata`)

At minimum you need an `id` and `name`:

```yaml
metadata:
  id: hypertrophy-4day
  name: Hypertrophy 4 Day
  description: Upper/lower split with moderate volume.
```

Reference: [`metadata`](#metadata)

### Step 3 (Optional): Add Dates With a Program Calendar (`calendar`)

If you want a dated plan (and/or you want repeating schedules), define a calendar window:

```yaml
calendar:
  start_date: "2026-03-02"
  end_date: "2026-03-13"
  # timezone: "America/New_York"  # optional; currently stored but not used by materialization
```

Rules:

- Dates must be `YYYY-MM-DD`.
- If any session uses `schedule`, you must provide `calendar.end_date` so repetition can be materialized into a finite list.

Reference: [`calendar`](#calendar)

### Step 4: Define Sessions (`sessions`)

`sessions` is a list of session templates. Each session has:

- `id`: stable identifier
- `name`: display name
- either `day` (fixed, relative) or `schedule` (repeating)
- `exercises`

Start with a single session:

```yaml
sessions:
  - id: day-1
    name: Day 1
    day: 1
    exercises: []
```

Reference: [`sessions`](#sessions)

### Step 5: Choose When Each Session Runs (`day` vs `schedule`)

You have two options.

1. Fixed day (relative to program start date):

```yaml
- id: squat-day
  name: Squat
  day: 1
  exercises: []
```

2. Repeating schedule (requires `calendar` and `calendar.end_date`):

Every other day:

```yaml
- id: every-other-day
  name: Every Other Day
  schedule:
    type: interval_days
    every: 2
  exercises: []
```

Mondays and Fridays:

```yaml
- id: mon-fri
  name: Mon/Fri
  schedule:
    type: weekdays
    days: [MON, FRI]
  exercises: []
```

Reference: [`day`](#day), [`schedule`](#schedule)

### Step 6: Add Exercises (`exercises`)

Each session has `exercises`, which is a list:

```yaml
exercises:
  - exercise: Back Squat
    rest_seconds: 180
    sets: []
```

Reference: [`exercise`](#exercise)

### Step 7: Add Sets (`sets`)

`sets` is an array of set prescriptions. Each set prescription can be:

- A structured object (`count`, `reps`, optional `intensity`, optional `note`)
- A shorthand string that compiles to a structured object

Structured form:

```yaml
sets:
  - count: 3
    reps: 5
    intensity:
      type: percent_1rm
      value: 75
```

Shorthand form:

```yaml
sets:
  - "5x5 @75%"
  - "3x8-10 @RPE8"
  - "3x10 @RIR2"
  - "5x5 @150kg"
```

Reference: [`sets`](#sets), [`intensity`](#intensity), [Shorthand Syntax](#shorthand-syntax)

### Step 8: Validate Early, Iterate Often

Validation is the fastest feedback loop:

```bash
npm.cmd run psl:dev -- validate path/to/program.psl.yaml
```

Reference: [Validation and Diagnostics](#validation-and-diagnostics)

### Step 9: Compile and Materialize

Use compile when you want a normalized structure (set counts expanded into explicit set instances):

```bash
npm.cmd run psl:dev -- compile path/to/program.psl.yaml --out out.compiled.json
```

Use materialize when you want scheduled programs expanded into dated sessions:

```bash
npm.cmd run psl:dev -- materialize path/to/program.psl.yaml --out out.materialized.json
```

Reference: [Compilation Output](#compilation-output), [Materialization Output](#materialization-output)

## Complete Example (Scheduled Program)

This is the full example included in the repo:

- `examples/scheduling_demo.psl.yaml`

It demonstrates:

- A program calendar (`start_date` + `end_date`)
- An `interval_days` session (every other day)
- A `weekdays` session (Mondays and Fridays)
- Shorthand sets and absolute load (`@150kg`)

## Reference

This section is the field-by-field reference for PSL v0.1.

### Top-Level Fields

#### `language_version`

Type: string

Required. Current value:

- `"0.1"`

#### `metadata`

Type: object

Required fields:

- `id` (string)
- `name` (string)

Optional fields:

- `description` (string)
- `author` (string)

#### `calendar`

Type: object

Optional, but required if any session uses `schedule`.

Fields:

- `start_date` (string, `YYYY-MM-DD`) required when `calendar` exists
- `end_date` (string, `YYYY-MM-DD`) required when using repeating `schedule`
- `timezone` (string) optional

Notes:

- Current materialization uses UTC midnight to compute `date_iso`. `timezone` is stored/validated but not yet used.

#### `sessions`

Type: array of session objects

Required. Must contain at least one session.

### Session

A session is a template that contains exercises and either a fixed `day` or a repeating `schedule`.

#### `id`

Type: string

Required. Must be unique within the program.

#### `name`

Type: string

Required.

#### `day`

Type: integer

Optional. Use `day` for a fixed session on a specific relative day.

- `day: 1` means the session occurs on `calendar.start_date` (if you have a calendar)
- `day: 2` means `start_date + 1 day`

Rule:

- You must specify either `day` or `schedule` (not both).

#### `schedule`

Type: object

Optional. Use `schedule` for repeating sessions (requires `calendar.end_date`).

Rule:

- You must specify either `day` or `schedule` (not both).

##### `schedule.type = interval_days`

Repeat every N days.

Fields:

- `every` (integer >= 1) required
- `start_offset_days` (integer >= 0) optional

Example (every other day):

```yaml
schedule:
  type: interval_days
  every: 2
```

##### `schedule.type = weekdays`

Repeat on selected weekdays.

Fields:

- `days` (array) required; each element is one of `MON|TUE|WED|THU|FRI|SAT|SUN`
- `start_offset_days` (integer >= 0) optional

Example (Mondays and Fridays):

```yaml
schedule:
  type: weekdays
  days: [MON, FRI]
```

### Exercise

#### `exercise`

Type: string

Required. Human-readable name.

#### `sets`

Type: array

Required. Each element is either:

- A set object, or
- A shorthand string (see [Shorthand Syntax](#shorthand-syntax))

#### `rest_seconds`

Type: integer

Optional. Must be >= 0.

### Set

A set prescription is either a structured object or a shorthand string.

#### Structured set object

Fields:

- `count` (integer >= 1) required
- `reps` (integer >= 1 OR `{min,max}`) required
- `intensity` (object) optional
- `note` (string) optional

Example:

```yaml
- count: 4
  reps:
    min: 8
    max: 12
  intensity:
    type: rir
    value: 2
  note: "leave 2 reps in reserve"
```

#### `reps`

Reps can be:

- A fixed integer: `reps: 5`
- A range object:

```yaml
reps:
  min: 8
  max: 10
```

#### `intensity`

Type: object

Reference: [Intensity Targets](#intensity-targets)

#### `note`

Type: string

Optional.

### Intensity Targets

Intensity is a tagged object with a `type` and associated fields.

#### `percent_1rm`

- Meaning: percent of 1RM
- Fields:
  - `type: percent_1rm`
  - `value` number, `0 < value <= 150`

Examples:

```yaml
intensity:
  type: percent_1rm
  value: 75
```

Shorthand: `@75%`

#### `rpe`

- Meaning: Rate of Perceived Exertion
- Fields:
  - `type: rpe`
  - `value` number, `1 <= value <= 10`

Examples:

```yaml
intensity:
  type: rpe
  value: 8.5
```

Shorthand: `@RPE8.5`

#### `rir`

- Meaning: Reps In Reserve
- Fields:
  - `type: rir`
  - `value` number, `0 <= value <= 6`

Examples:

```yaml
intensity:
  type: rir
  value: 2
```

Shorthand: `@RIR2`

#### `load`

- Meaning: absolute load target
- Fields:
  - `type: load`
  - `value` number, `value > 0`
  - `unit` string enum: `kg` or `lb`

Examples:

```yaml
intensity:
  type: load
  value: 150
  unit: kg
```

Shorthand: `@150kg` or `@315lb`

### Shorthand Syntax

Shorthand is a coach-friendly, imperative-looking notation that compiles into canonical set objects.

Supported patterns (v0.1):

- `"<count>x<reps>"`
- `"<count>x<min>-<max>"`
- Optional intensity clause: `@<intensity>`

Intensity forms:

- Percent: `@75%`
- RPE: `@RPE8` / `@rpe8.5`
- RIR: `@RIR2` / `@rir1`
- Load: `@150kg` / `@315lb`

Examples:

- `"5x5"`
- `"5x5 @75%"`
- `"3x8-10 @RPE8"`
- `"3x10 @RIR2"`
- `"5x5 @150kg"`

### Compilation Output

`compile` produces a normalized structure suitable for consumption by applications.

Key points:

- Each set prescription with `count: N` expands into N explicit set instances.
- Each compiled set has:
  - `index` (1-based within the exercise)
  - `reps` normalized to `{min,max}`
  - optional `intensity`
  - optional `note`

See:

- `src/compile/compileProgram.ts`

### Materialization Output

`materialize` expands schedules into dated session instances.

Key points:

- Each output session occurrence includes:
  - `date_iso` (YYYY-MM-DD)
  - `occurrence` (1, 2, 3, ...) per repeating session template
  - `sequence` (1, 2, 3, ...) across the full materialized list
  - computed `day` relative to `calendar.start_date` (1-based)

See:

- `src/compile/materialize.ts`

### Validation and Diagnostics

Validation returns diagnostics with:

- `path` (JSONPath-like)
- `severity` (`error` or `warning`)
- `message`

Current behavior:

- Any `error` makes validation fail and blocks compilation/materialization.

Examples of errors:

- Missing required fields (`metadata.id`, session `id`, etc.)
- Intensity out of range (e.g. `rpe: 12`)
- Session declares both `day` and `schedule`
- Session uses `schedule` but program lacks `calendar.end_date`

## Known Limitations

v0.1 focuses on structure, validation, compilation, and basic scheduling. Not yet implemented:

- Progression strategy objects (planned)
- Exercise families/substitutions (planned)
- Rule engine and context-aware adjustments (planned)
- Timezone-aware scheduling/materialization (timezone is currently stored only)
