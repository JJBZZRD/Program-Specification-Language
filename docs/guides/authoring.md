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
  - [Training Blocks](#training-blocks)
  - [Session](#session)
  - [Exercise](#exercise)
  - [Set](#set)
  - [Intensity Targets](#intensity-targets)
  - [Progression](#progression)
  - [Completion Results](#completion-results)
  - [Shorthand Syntax](#shorthand-syntax)
  - [Compilation Output](#compilation-output)
  - [Materialization Output](#materialization-output)
  - [Export (CSV/XLSX)](#export-csvxlsx)
  - [Validation and Diagnostics](#validation-and-diagnostics)
- [Known Limitations](#known-limitations)

## Quickstart

From the repo root:

```bash
# Validate
npm.cmd run psl:dev -- validate examples/hypertrophy_4day.psl.yaml

# Validate (shorthand-heavy demo)
npm.cmd run psl:dev -- validate examples/shorthand_demo.psl.yaml

# Validate (blocks demo)
npm.cmd run psl:dev -- validate examples/blocks_demo.psl.yaml

# Compile (canonical compiled structure)
npm.cmd run psl:dev -- compile examples/hypertrophy_4day.psl.yaml --out out.compiled.json

# Materialize (expand schedules into dated session instances)
npm.cmd run psl:dev -- materialize examples/scheduling_demo.psl.yaml --out out.materialized.json

# Materialize with progression (apply weekly_increment using completion results)
npm.cmd run psl:dev -- materialize examples/progression_demo.psl.yaml --results examples/progression_demo.results.json --out out.progression_demo.materialized.json

# Materialize (blocks demo)
npm.cmd run psl:dev -- materialize examples/blocks_demo.psl.yaml --out out.blocks.materialized.json

# Print (human-readable view)
npm.cmd run psl:dev -- print examples/powerlifting_peak.psl.yaml

# Export (CSV or XLSX workbook)
npm.cmd run psl:dev -- export examples/blocks_demo.psl.yaml --format csv --out out.program.sets.csv
npm.cmd run psl:dev -- export examples/blocks_demo.psl.yaml --format csv --table calendar --out out.program.calendar.csv
npm.cmd run psl:dev -- export examples/blocks_demo.psl.yaml --format xlsx --out out.program.xlsx
npm.cmd run psl:dev -- export examples/blocks_demo.psl.yaml --layout client --format xlsx --out out.client.xlsx
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
- If any session uses `schedule`, you must provide `calendar.end_date` so repetition can be materialized into a finite list, unless:
  - every repeating `schedule` sets `end_offset_days`, or
  - you author the program using [`blocks`](#training-blocks) (blocks compute a total end date).

Reference: [`calendar`](#calendar)

### Step 4: Define Sessions (`sessions`) or Training Blocks (`blocks`)

You can author a program either as a single list of session templates (`sessions`) or as sequential time-boxed blocks (`blocks`).

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
    exercises:
      - exercise: Example Lift
        sets: "1x1 @RPE8"
```

Reference: [`sessions`](#sessions)

Or, author the program as sequential **training blocks** (phases) with a duration:

```yaml
blocks:
  - id: accumulation
    name: Accumulation
    duration: "4w"
    sessions:
      - id: bench
        name: Bench
        schedule: "MON, FRI"
        exercises:
          - exercise: Example Lift
            sets: "1x1 @RPE8"

  - id: deload
    name: Deload
    duration: "1w"
    sessions: []
```

Reference: [`blocks`](#training-blocks), `examples/blocks_demo.psl.yaml`

### Step 5: Choose When Each Session Runs (`day` vs `schedule`)

You have two options.

1. Fixed day (relative to program start date):

```yaml
- id: squat-day
  name: Squat
  day: 1
  exercises:
    - exercise: Example Lift
      sets: "1x1 @RPE8"
```

2. Repeating schedule (requires `calendar`, and either `calendar.end_date` or `schedule.end_offset_days`):

Every other day:

```yaml
- id: every-other-day
  name: Every Other Day
  schedule:
    type: interval_days
    every: 2
  exercises:
    - exercise: Example Lift
      sets: "1x1 @RPE8"
```

Mondays and Fridays:

```yaml
- id: mon-fri
  name: Mon/Fri
  schedule:
    type: weekdays
    days: [MON, FRI]
  exercises:
    - exercise: Example Lift
      sets: "1x1 @RPE8"
```

Shorthand alternatives:

```yaml
schedule: "every other day"
schedule: "MON, FRI"
schedule: "every 4 days +1" # start offset
```

Reference: [`day`](#day), [`schedule`](#schedule)

### Step 6: Add Exercises (`exercises`)

Each session has `exercises`, which can be a list of exercise objects (structured):

```yaml
exercises:
  - exercise: Back Squat
    rest_seconds: 180
    sets: []
```

You can also use shorthand exercise strings:

```yaml
exercises:
  - "Bench Press: 5x5 @75%; rest 2m"
  - |
    Deadlift:
      1x5 @100kg
      1x5 @[95,105]kg # window
      rest 3m
```

Or a multi-exercise block string:

```yaml
exercises: |
  Bench Press:
    5x5 @75%
    rest 2m
  Row: 3x10 @RIR2
```

Reference: [`exercise`](#exercise)

### Step 7: Add Sets (`sets`)

`sets` can be an array of set prescriptions, or a multiline shorthand block string. Each set prescription can be:

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
  - "5x5 @[100,120]kg"
```

Multiline shorthand block:

```yaml
sets: |
  5x5 @75% # optional note
  1x5 @80%
```

Reference: [`sets`](#sets), [`intensity`](#intensity), [Shorthand Syntax](#shorthand-syntax)

### Step 8 (Optional): Add Progression (`progression`)

PSL supports basic, deterministic progression rules that can update future targets over time when you provide completion results.

Current progression support (v0.1):

- Set-level progression via `set.progression`
- `increment` (preferred) and `weekly_increment` (legacy alias)
- Cadence control (weeks vs sessions) including:
  - "every 3 sessions"
  - "only Fridays"
  - "every other week"
- Conditions can be session-level (`session_success`) or achieved-vs-target (`metric_vs_target`)

Important rules:

- Progression is only applied during materialization when you provide completion results (see: [Completion Results](#completion-results)).
- Your program must include a `calendar` (so cadence can be applied over time).

Example (simple weekly load increases on successful sessions):

```yaml
calendar:
  start_date: "2026-03-02"
  end_date: "2026-03-16"

sessions:
  - id: monday
    name: Monday
    schedule:
      type: weekdays
      days: [MON]
    exercises:
      - exercise: Deadlift
        sets:
          - count: 1
            reps: 5
            intensity:
              type: load
              value: 100
              unit: kg
            progression:
              type: weekly_increment
              # when omitted: session_success == true
              by: 2.5
```

Example (only progress when achieved load meets/exceeds the current target):

```yaml
progression:
  type: weekly_increment
  when:
    type: metric_vs_target
    metric: load
    op: ">="
    target: value
  by: 2.5
```

Example (increment every 3 successful sessions, even if the session is every 4 days):

```yaml
progression:
  type: increment
  cadence:
    type: sessions
    every: 3
  by: 2.5
```

Progression shorthand (equivalent to the structured form):

```yaml
progression: "+2.5kg every 3 sessions on FRI if load>=target"
```

Example (for a Mon/Fri session, only count Fridays as progression checks):

```yaml
progression:
  type: increment
  cadence:
    type: sessions
    on_weekdays: [FRI]
  by: 2.5
```

Example (increment every other successful week):

```yaml
progression:
  type: increment
  cadence:
    type: weeks
    every: 2
  by: 2.5
```

Reference: [`progression`](#progression)

### Step 9: Validate Early, Iterate Often

Validation is the fastest feedback loop:

```bash
npm.cmd run psl:dev -- validate path/to/program.psl.yaml
```

Reference: [Validation and Diagnostics](#validation-and-diagnostics)

### Step 10: Compile and Materialize

Use compile when you want a normalized structure (set counts expanded into explicit set instances):

```bash
npm.cmd run psl:dev -- compile path/to/program.psl.yaml --out out.compiled.json
```

Use materialize when you want scheduled programs expanded into dated sessions:

```bash
npm.cmd run psl:dev -- materialize path/to/program.psl.yaml --out out.materialized.json
```

If your program includes `progression`, provide completion results to materialize so progression can be applied:

```bash
npm.cmd run psl:dev -- materialize path/to/program.psl.yaml --results path/to/results.json --out out.materialized.json
```

Reference: [Compilation Output](#compilation-output), [Materialization Output](#materialization-output)

## Complete Example (Scheduled Program)

This is the full example included in the repo:

- `examples/scheduling_demo.psl.yaml`

It demonstrates:

- A program calendar (`start_date` + `end_date`)
- An `interval_days` session (every other day)
- A `weekdays` session (Mondays and Fridays)
- Shorthand sets, absolute load (`@150kg`), and load windows (`@[100,120]kg`)

Another example in the repo:

- `examples/progression_demo.psl.yaml`
- `examples/progression_demo.results.json`
- `examples/cadence_demo.psl.yaml`
- `examples/cadence_demo.results.json`

It demonstrates:

- Progression via `set.progression` (`increment` / `weekly_increment`)
- Cadence control (weeks vs sessions, every N, weekday filters)
- Applying progression during materialization via `--results`

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
- `end_date` (string, `YYYY-MM-DD`) optional
  - required when using repeating `schedule` unless:
    - every repeating schedule sets `end_offset_days`, or
    - you author using `blocks` (blocks compute a total end date)
- `timezone` (string) optional

Notes:

- Current materialization uses UTC midnight to compute `date_iso`. `timezone` is stored/validated but not yet used.

#### `sessions`

Type: array of session objects

You must provide either `sessions` or [`blocks`](#training-blocks).

If provided, it must contain at least one session.

#### `blocks`

Type: array of block objects

You must provide either `blocks` or [`sessions`](#sessions).

Blocks are optional; if provided, they define a sequential timeline of phases and contain their own sessions.

Reference: [Training Blocks](#training-blocks)

### Training Blocks

Training blocks are an optional authoring feature for phased programs, for example:

- 4-week accumulation block
- 1-week deload block
- 3-week peak block

When you use blocks, PSL expands them into regular session templates during validation by:

- Namespacing session ids with the block id (`<block_id>.<session_id>`)
- Constraining repeating schedules with `schedule.end_offset_days` so sessions only repeat inside the block window
- Computing a total `calendar.end_date` from `calendar.start_date` and the sum of block durations (so you do not need to manually calculate it)
  - If you provide `calendar.end_date`, it must match the computed total duration.

#### Block Shape

```yaml
blocks:
  - id: accumulation
    name: Accumulation (optional)
    duration: "4w" # required; also supports "28d"
    sessions: []   # optional; may be empty for a rest block
```

#### `duration`

Required.

Supported forms:

```yaml
duration: "4w"
duration: "10d"
```

```yaml
duration:
  type: weeks # or days
  value: 4
```

#### Sessions Inside Blocks

Sessions inside a block use the same structure as regular sessions, but their timing fields are interpreted relative to the block start:

- `session.id` becomes `<block_id>.<session_id>` in the normalized output and compiled program.
  - This is the `session_id` you use in completion results.
- `session.day` is 1-based relative to the block start (day 1 is the first day of the block).
- `session.schedule.start_offset_days` / `end_offset_days` are 0-based relative to the block start.
  - If `end_offset_days` is omitted inside a block, PSL treats it as the last day of the block.

Blocks are contiguous: block N+1 starts immediately after block N ends.

You can also use schedule offsets to make a session start late or end early inside a block:

```yaml
blocks:
  - id: block1
    duration: "4w"
    sessions:
      - id: overload
        name: Overload (weeks 3-4 only)
        schedule:
          type: weekdays
          days: [MON]
          start_offset_days: 14 # start on block day 15 (week 3)
        exercises:
          - exercise: Back Squat
            sets: "1x1 @85%"
```

Example: `examples/blocks_demo.psl.yaml`

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

Type: object or string

Optional. Use `schedule` for repeating sessions (requires `calendar`, and either `calendar.end_date` or `schedule.end_offset_days`).

Rule:

- You must specify either `day` or `schedule` (not both).

Shorthand examples:

```yaml
schedule: "every other day"
schedule: "every 4 days +1" # start offset
schedule: "MON, FRI"
schedule: "on Tuesday Thursday"
```

##### `schedule.type = interval_days`

Repeat every N days.

Fields:

- `every` (integer >= 1) required
- `start_offset_days` (integer >= 0) optional
- `end_offset_days` (integer >= 0) optional
  - If set, the schedule only repeats through `calendar.start_date + end_offset_days` (inclusive).
  - If omitted, `calendar.end_date` must be provided.

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
- `end_offset_days` (integer >= 0) optional
  - If set, the schedule only repeats through `calendar.start_date + end_offset_days` (inclusive).
  - If omitted, `calendar.end_date` must be provided.

Example (Mondays and Fridays):

```yaml
schedule:
  type: weekdays
  days: [MON, FRI]
```

#### `exercises`

Type: array or string

Required.

Structured form:

```yaml
exercises:
  - exercise: Back Squat
    sets:
      - "3x5 @75%"
```

Shorthand forms:

- An array of exercise shorthand strings (see [Shorthand Syntax](#shorthand-syntax))
- A multi-exercise block string (see [Shorthand Syntax](#shorthand-syntax))

### Exercise

In source YAML, an exercise can be authored as a structured object or as shorthand. All forms normalize into the same canonical exercise shape.

#### `exercise`

Type: string

Required. Human-readable name.

#### `sets`

Type: array or string

Required. Each element is either:

- A set object, or
- A shorthand string (see [Shorthand Syntax](#shorthand-syntax))

You may also provide `sets` as a multiline shorthand block string:

```yaml
sets: |
  5x5 @75%
  1x5 @80%
```

#### `rest_seconds`

Type: integer or string

Optional. Must be >= 0.

Duration strings are supported (e.g. `"90s"`, `"2m"`, `"2m30s"`, `"2:30"`).

Alias:

- `rest` (same accepted forms as `rest_seconds`)

### Set

A set prescription is either a structured object, a shorthand string, or a shorthand wrapper object.

#### Structured set object

Fields:

- `count` (integer >= 1) required
- `reps` (integer >= 1 OR `{min,max}`) required
- `intensity` (object) optional
- `progression` (object) optional
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

#### Shorthand wrapper object

If you like shorthand but need to attach structured fields (like `progression` or `note`), use the wrapper form:

```yaml
- shorthand: "1x5 @[80,90]kg"
  progression:
    type: weekly_increment
    by: 2.5
  note: "add 2.5kg each successful week"
```

You can also use a multiline `shorthand` block. It expands into multiple set prescriptions, and the wrapper fields (`progression`, `note`) apply to each expanded set:

```yaml
- shorthand: |
    1x5 @100kg
    3x5 @[90,100]kg # backoffs
  progression: "+2.5kg every week"
```

#### `reps`

Reps can be:

- A fixed integer: `reps: 5`
- A range object:
- A shorthand string: `reps: "8-12"`

```yaml
reps:
  min: 8
  max: 10
```

#### `intensity`

Type: object or string

Reference: [Intensity Targets](#intensity-targets)

#### `progression`

Type: object or string

Optional.

Reference: [Progression](#progression)

#### `note`

Type: string

Optional.

### Intensity Targets

Intensity is a tagged object with a `type` and associated fields.

In source YAML, you may also provide `intensity` as a shorthand string. It uses the same syntax as set shorthand intensities, with or without a leading `@`:

- `"75%"` or `"@75%"`
- `"RPE8"` or `"@RPE8"`
- `"150kg"` or `"@150kg"`
- `"[100,120]kg"` or `"@[100,120]kg"`
- `"70%+5lb"` or `"@70%+5lb"` (percent + absolute load offset)

#### `percent_1rm`

- Meaning: percent of 1RM
- Fields:
  - `type: percent_1rm`
  - `value` number, `0 < value <= 150`
  - optional `plus_load`: absolute load delta applied on top of the computed `%1RM` load
    - `value` number (may be positive or negative)
    - `unit` string enum: `kg` or `lb`

Examples:

```yaml
intensity:
  type: percent_1rm
  value: 75
```

Shorthand: `@75%`

Example (percent + offset):

```yaml
intensity:
  type: percent_1rm
  value: 70
  plus_load:
    value: 5
    unit: lb
```

Shorthand: `@70%+5lb` or `@70%-2.5kg`

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

#### `load_range`

- Meaning: absolute load selection window
- Fields:
  - `type: load_range`
  - `min` number, `min > 0`
  - `max` number, `max >= min`
  - `unit` string enum: `kg` or `lb`

Examples:

```yaml
intensity:
  type: load_range
  min: 100
  max: 120
  unit: kg
```

Shorthand: `@[100,120]kg` or `@[225,275]lb`

### Progression

Progression rules allow targets to change over time based on completion results.

In PSL v0.1, progression is:

- Defined per set prescription via `set.progression`
- Applied during materialization when you provide completion results (`--results`)
- Cadenced: progression can be evaluated per week or per session

#### `progression` (Set-Level)

Type: object or string

Optional.

Progression shorthand examples:

```yaml
progression: "+2.5kg every week"
progression: "+2.5% every week" # for percent_1rm targets
progression: "+5lb every week" # for percent_1rm targets (adds to computed load via intensity.plus_load)
progression: "+2.5 every 3 sessions"
progression: "+2.5 every 3 sessions on FRI if load>=target"
progression: "-0.5 every 2 weeks if success"
```

Percent targets (Smolov Jr style) can be progressed in two different ways:

- Percent points: `"+2.5% every week"` increases the `%1RM` value.
- Absolute load offset: `"+5lb every week"` keeps the `%1RM` the same but increases `intensity.plus_load` (so apps can compute `%1RM load + plus_load`).

Example (week-to-week load jump on a `%1RM` prescription):

```yaml
sets:
  - shorthand: "6x6 @70%"
    progression: "+5lb every week"
```

Notes:

- If cadence is omitted, shorthand defaults to weekly cadence.
- If the `if ...` clause is omitted, progression defaults to `session_success == true` when applying progression.

Supported types (v0.1):

- `increment` (preferred)
- `weekly_increment` (legacy alias)

Rules:

- If any set uses `progression`, your program must include a `calendar`.
- `progression` requires `intensity` (there must be a target to increment).

#### `increment` / `weekly_increment`

Fields:

- `type: increment` or `type: weekly_increment`
- `cadence`:
  - required for `increment`
  - optional for `weekly_increment` (defaults to `{type: weeks, every: 1}`)
- `by`:
  - `percent_1rm` intensity:
    - number (percent points, e.g. `by: 2.5` means `+2.5%1RM`)
    - or load delta object `by: { type: load, value: 5, unit: lb }` (adjusts `intensity.plus_load`)
  - `load` intensity:
    - number (same unit as the load target)
    - or load delta object `by: { type: load, value: 2.5, unit: kg }`
  - `rpe` / `rir` intensity:
    - number (RPE/RIR points)
  - `load_range` intensity:
    - `by: 2.5` shifts both `min` and `max` by `+2.5` each successful cadence unit
    - `by: { min: 2.5, max: 5 }` can shift bounds independently (at least one of `min`/`max` is required)
    - or load delta object `by: { type: load, value: 2.5, unit: kg }` to shift both bounds (unit must match)
- `when` (optional):
  - If omitted, defaults to `session_success == true`

Example (session-success weekly progression):

```yaml
progression:
  type: weekly_increment
  by: 2.5
```

#### `cadence`

`cadence` controls what "one progression check" means.

##### Weekly cadence

```yaml
cadence:
  type: weeks
  every: 2 # optional; every other week
```

##### Session cadence

```yaml
cadence:
  type: sessions
  every: 3 # optional; every 3 sessions
  on_weekdays: [FRI] # optional filter
```

#### `when: session_success`

Checks whether the session is marked successful in completion results.

Fields:

- `type: session_success`
- `equals` (boolean) optional (default: `true`)

Example:

```yaml
when:
  type: session_success
  equals: true
```

#### `when: metric_vs_target`

Compares achieved metrics in completion results to the current target (after any prior progression has been applied).

Fields:

- `type: metric_vs_target`
- `metric`: `load` | `rpe` | `rir`
- `op`: `>=` | `>` | `<=` | `<` | `==` | `!=`
- `target`: `value` | `min` | `max`
  - For `load_range` targets, use `min` or `max` (common: `max`)

Example (load must meet/exceed the prescribed load target):

```yaml
when:
  type: metric_vs_target
  metric: load
  op: ">="
  target: value
```

Example (load must meet/exceed the top of a prescribed `load_range` window):

```yaml
when:
  type: metric_vs_target
  metric: load
  op: ">="
  target: max
```

#### Cadence Semantics

- Weeks:
  - Week 1 is `day 1..7`, week 2 is `day 8..14`, etc (relative to `calendar.start_date`).
  - If a session occurs multiple times in the same week, weekly cadence is evaluated once per week using the latest occurrence in that week that has completion data.
- Sessions:
  - Session cadence is evaluated after each session occurrence that has completion data.
  - If `on_weekdays` is provided, only those occurrences count as progression checks.

### Completion Results

Completion results are runtime data (not part of PSL YAML) used to apply progression during materialization.

In the CLI, provide them via:

```bash
npm.cmd run psl:dev -- materialize path/to/program.psl.yaml --results path/to/results.json --out out.materialized.json
```

#### Results JSON Shape

The results file can be either:

- An array of sessions, or
- An object `{ "sessions": [...] }`

Each session entry:

- `session_id` (string): must match a session template `id`
- `date_iso` (string, `YYYY-MM-DD`): must match the materialized session `date_iso`
- `success` (boolean) optional: used by `session_success` conditions
- `exercises` (array) optional: per-exercise set achievements for `metric_vs_target`

Set achievements:

- `index` (number): 1-based set index within the exercise
- optional `load`: `{ value: number, unit: "kg" | "lb" }`
- optional `rpe`: number
- optional `rir`: number

Example:

```json
[
  {
    "session_id": "monday",
    "date_iso": "2026-03-02",
    "success": true,
    "exercises": [
      {
        "exercise": "Deadlift",
        "sets": [{ "index": 1, "load": { "value": 100, "unit": "kg" } }]
      }
    ]
  }
]
```

### Shorthand Syntax

Shorthand is a coach-friendly notation that compiles deterministically into canonical objects during validation.

Shorthand is accepted in multiple places in v0.1, not just set strings.

See also:

- `examples/shorthand_demo.psl.yaml`
- `examples/smolov_jr_bench.psl.yaml`
- `examples/blocks_demo.psl.yaml`
- `spec/shorthand.ebnf`

#### Where Shorthand Is Allowed

- `session.schedule`: object or string shorthand
- `session.exercises`: array of exercises OR a multi-exercise block string
- Exercise entries: object OR exercise shorthand string
- `exercise.sets`: array of sets OR a multiline sets block string
- Set entries: structured set object, set shorthand string, or shorthand wrapper object (`{ shorthand: "...", ... }`)
- `set.reps`: integer, `{min,max}`, or shorthand string (e.g. `"8-12"`)
- `set.intensity`: object or shorthand string (with or without leading `@`)
- `exercise.rest_seconds` and `exercise.rest`: integer seconds or duration string
- `set.progression`: object or shorthand string
- `block.duration`: string shorthand (e.g. `"4w"`, `"10d"`)

#### Set Shorthand

Set shorthand is the most common form. It expands into a set object with:

- `count`
- `reps` (fixed or range)
- optional `intensity`

Pattern:

- `"<count>x<reps>"`
- `"<count>x<min>-<max>"`
- optional intensity clause: `@<intensity>`

Spaces are allowed:

- `"5 x 5 @75%"`
- `"3x8 - 10 @RPE8"`

Intensity forms:

- Percent: `@75%` or `@75%1RM`
- Percent + offset: `@70%+5lb`, `@70%-2.5kg`
- RPE: `@RPE8`, `@8RPE`
- RIR: `@RIR2`, `@2RIR`
- Load: `@150kg`, `@315lb` (also accepts `kgs`/`lbs`)
- Load range: `@[100,120]kg` or `@100-120kg`

Examples:

- `"5x5"`
- `"5x5 @75%"`
- `"6x6 @70%+5lb"`
- `"3x8-10 @RPE8"`
- `"3x10 @RIR2"`
- `"5x5 @150kg"`
- `"5x5 @[100,120]kg"`
- `"5x5 @100-120kg"`

#### Sets Block Shorthand (`exercise.sets` as a string)

You can provide `exercise.sets` as a multiline string (YAML block scalar). Each non-empty line is parsed as set shorthand.

```yaml
sets: |
  5x5 @75%
  1x5 @80%
```

Notes:

- You can separate multiple set entries on a single line with `;`.
- In set blocks, a trailing `# ...` becomes `set.note`:

```yaml
sets: |
  5x5 @75% # volume work
  1x5 @80%
```

#### Exercise Shorthand (String Exercise Entries)

Inside `session.exercises`, you can use exercise shorthand strings.

One-line form:

```yaml
exercises:
  - "Bench Press: 5x5 @75%; 1x5 @80%; rest 2m"
```

Multiline form:

```yaml
exercises:
  - |
    Deadlift:
      1x5 @100kg
      1x5 @[95,105]kg # window
      rest 3m
```

Rules:

- The first line is the exercise name (optionally followed by `:` or `|` and inline sets).
- Subsequent lines are either set lines or a `rest ...` line.

#### Exercises Block Shorthand (`session.exercises` as a string)

You can define multiple exercises as a single block string:

```yaml
exercises: |
  Bench Press:
    5x5 @75%
    rest 2m
  Row: 3x10 @RIR2
```

#### Schedule Shorthand (`session.schedule` as a string)

Interval days:

- `"every other day"` (equivalent to `{ type: interval_days, every: 2 }`)
- `"every 4 days"` / `"4d"`

Weekdays:

- `"MON, FRI"` / `"on Monday Friday"` / `"every Tue/Thu"`

Start offsets:

- `"every 4 days +1"`
- `"MON, FRI offset 2"`

#### `reps` Shorthand (String Reps)

Structured sets can use string reps:

- `"5"`
- `"8-12"`

#### `intensity` Shorthand (String Intensity)

Structured sets can use string intensity (with or without leading `@`), e.g.:

- `"75%"`
- `"70%+5lb"`
- `"RPE8.5"`
- `"150kg"`
- `"[100,120]kg"`

#### Rest Shorthand (Duration Strings)

`rest_seconds` (or `rest`) can be:

- integer seconds: `rest_seconds: 120`
- duration strings: `rest: "2m"`, `rest_seconds: "90s"`, `rest_seconds: "2:30"`

#### Progression Shorthand (String Progression Rules)

Progression can be written as a string and expands into a structured `increment` rule with an explicit cadence.

Examples:

```yaml
progression: "+2.5kg every week"
progression: "+2.5% every week" # percent_1rm targets
progression: "+5lb every week" # percent_1rm targets (adds to computed load via intensity.plus_load)
progression: "+2.5 every 3 sessions"
progression: "+2.5 every 3 sessions on FRI if load>=target"
progression: "-0.5 every 2 weeks if success"
```

Defaults:

- If cadence is omitted, shorthand defaults to weekly cadence.
- If `if ...` is omitted, progression defaults to `session_success == true`.
- For `percent_1rm` targets:
  - `+2.5` and `+2.5%` mean `+2.5` percentage points.
  - `+5lb` / `+2.5kg` adjusts `intensity.plus_load` (adds to the computed `%1RM` load).

### Compilation Output

`compile` produces a normalized structure suitable for consumption by applications.

Key points:

- Each set prescription with `count: N` expands into N explicit set instances.
- Each compiled set has:
  - `index` (1-based within the exercise)
  - `reps` normalized to `{min,max}`
  - optional `intensity`
  - optional `progression`
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
- If you provide completion results (`--results`), `materialize` applies progression (`increment` / `weekly_increment`) and may adjust set intensity targets over time (weekly or per-session, depending on `cadence`).

See:

- `src/compile/materialize.ts`

### Export (CSV/XLSX)

`export` materializes the program (expands repeating schedules into dated instances) and writes a spreadsheet-friendly table.

Outputs:

- `--format xlsx` (default `--layout data`): writes an `.xlsx` workbook with two sheets:
  - `Calendar`: one row per day in the program date range (including rest days)
  - `Sets`: one row per set instance
- `--format csv` (default `--layout data`): writes a single table; defaults to `Sets`. Use `--table calendar` to export the daily calendar.
- `--layout client`: writes a client-facing, human-readable layout:
  - `--format xlsx`: a single `Program` sheet with grouped day/session/exercise rows.
  - `--format csv`: a single `program` table (suitable for Excel import).

Examples:

```bash
# Sets table (CSV)
npm.cmd run psl:dev -- export examples/blocks_demo.psl.yaml --format csv --out out.program.sets.csv

# Daily calendar (CSV)
npm.cmd run psl:dev -- export examples/blocks_demo.psl.yaml --format csv --table calendar --out out.program.calendar.csv

# Workbook (XLSX)
npm.cmd run psl:dev -- export examples/blocks_demo.psl.yaml --format xlsx --out out.program.xlsx

# Client-facing program sheet (XLSX)
npm.cmd run psl:dev -- export examples/blocks_demo.psl.yaml --layout client --format xlsx --out out.client.xlsx
```

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
- Session uses `schedule` but program lacks `calendar.end_date` (and the schedule does not set `end_offset_days`)

## Known Limitations

v0.1 focuses on structure, validation, compilation, and basic scheduling. Not yet implemented:

- Progression strategies beyond `weekly_increment` (planned)
- Richer progression aggregation (all-sets vs any-sets, exercise-level success rules) (planned)
- Exercise families/substitutions (planned)
- Rule engine and context-aware adjustments (planned)
- Timezone-aware scheduling/materialization (timezone is currently stored only)
