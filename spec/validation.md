# Semantic Validation Rules (v0.1)

## Structural

1. `language_version` must be `0.1`.
2. `metadata.id` and `metadata.name` are required and non-empty.
3. Program must include at least one session.
4. Each session must have at least one exercise.
5. Each exercise must include at least one set prescription.

## Source Shorthand and Normalization

PSL v0.1 accepts coach-friendly shorthand in the source YAML. Validation normalizes these into canonical AST objects before compilation/materialization.

Accepted shorthand input shapes:

- Top-level: either `sessions` or `blocks` (mutually exclusive)
- `session.schedule`: object or shorthand string (e.g. `every other day`, `MON,FRI`, `every 4 days +1`)
- `session.exercises`: array of exercises OR a multi-exercise block string
- Exercise entries: object OR exercise shorthand string (single-line or multiline block)
- `exercise.sets`: array of sets OR a multiline sets block string
- Set entries: structured set object, set shorthand string, or shorthand wrapper object (`{ shorthand: "...", ... }`)
- `set.reps`: integer, `{min,max}`, or shorthand string (e.g. `"8-12"`)
- `set.intensity`: object or shorthand string (e.g. `"75%"`, `"70%+5lb"`, `"@RPE8"`, `"150kg"`, `"[100,120]kg"`)
- `exercise.rest_seconds` and `exercise.rest`: integer seconds or a duration string (e.g. `"90s"`, `"2m"`, `"2m30s"`, `"2:30"`)
- `set.progression`: object or shorthand string (e.g. `"+2.5kg every 3 sessions on FRI if load>=target"`)
- `block.duration`: string shorthand (e.g. `"4w"`, `"10d"`) or object `{type,value}`

Normalization notes:

- Multiline set blocks are split on newlines; `;` can separate multiple set entries on one line.
- In set blocks, trailing `# ...` is captured as a `set.note`.
- Shorthand parsing failures are surfaced as validation diagnostics.
- Blocks expand into regular sessions by namespacing session ids (`<block_id>.<session_id>`), shifting session timing relative to the block start, and bounding schedules with `schedule.end_offset_days`.

## Reps and Sets

1. `count` must be an integer >= 1.
2. Reps as number: integer >= 1.
3. Reps as range: `min >= 1`, `max >= min`.
4. Reps shorthand strings must be either:
   - `<reps>` (e.g. `"5"`), or
   - `<min>-<max>` (e.g. `"8-12"`)

## Intensity

1. `percent_1rm` value: `0 < value <= 150`.
   - Optional `plus_load`: a load delta applied on top of the computed `%1RM` load.
     - Shape: `{ value: number, unit: "kg" | "lb" }`
     - `value` may be positive or negative.
2. `rpe` value: `1 <= value <= 10`.
3. `rir` value: `0 <= value <= 6`.
4. `load` value: `value > 0` and `unit` is `kg` or `lb`.
5. `load_range` values: `min > 0`, `max >= min`, and `unit` is `kg` or `lb`.
6. Intensity may be provided as an object or as a shorthand string; shorthand forms are defined in `spec/shorthand.ebnf`.

## Progression

Progression is optional and is defined per set prescription.

### Types

- `weekly_increment` (legacy alias)
- `increment` (preferred)

Both represent the same increment rule shape; `weekly_increment` defaults to a weekly cadence when `cadence` is omitted.

### `increment` / `weekly_increment`

1. `progression.type` must be `weekly_increment` or `increment`.
   - Progression may also be provided as a shorthand string; shorthand expands into an `increment` rule with an explicit cadence (default weekly).
2. `progression` requires `intensity` (there must be a target to increment).
3. `progression.by` must be:
   - `percent_1rm` intensity:
     - a number (percent points, e.g. `+2.5` means `+2.5%1RM`), or
     - a load delta object `{ type: "load", value: number, unit: "kg" | "lb" }` (adjusts `intensity.plus_load`)
   - `load` intensity:
     - a number (same unit as the load target), or
     - a load delta object `{ type: "load", value: number, unit: "kg" | "lb" }`
   - `rpe` / `rir` intensity:
     - a number (RPE/RIR points)
   - `load_range` intensity:
     - a number (shifts both `min` and `max`), or
     - an object `{min,max}` (at least one of `min`/`max`) to shift bounds independently, or
     - a load delta object `{ type: "load", value: number, unit: "kg" | "lb" }` (shifts both `min` and `max`)
4. `progression.when` is optional:
   - If omitted, it defaults to `session_success == true` when applying progression.
   - `session_success` checks the session completion `success` boolean (default `true`).
   - `metric_vs_target` compares achieved metrics from completion data to the current target:
     - `metric`: `load` | `rpe` | `rir`
     - `op`: one of `>=`, `>`, `<=`, `<`, `==`, `!=`
     - `target`: `value` | `min` | `max` (for `load_range`, `target` must be `min` or `max`)
5. `progression.cadence` controls how often increments can be earned/applied:
   - `type: weeks` (weekly cadence)
   - `type: sessions` (per-session cadence)
   - optional `every` (integer >= 1) controls "every N weeks" or "every N sessions"
   - for `sessions` cadence, optional `on_weekdays` can filter which session dates count (e.g., only Fridays)
6. If `progression.type = increment`, `progression.cadence` is required.
7. If any set uses `progression`, the program must include a `calendar` (so cadence can be applied over time).

## Calendar and Scheduling

### Program Calendar

1. `calendar.start_date` must be an ISO date string `YYYY-MM-DD`.
2. If provided, `calendar.end_date` must be an ISO date string `YYYY-MM-DD`.
3. If both dates are provided, `end_date` must be on or after `start_date`.

### Session Timing

1. A session must specify either `day` or `schedule` (but not both).
2. `day` must be an integer >= 1 (relative to the program start).
3. If any session uses `schedule`, the program must include `calendar`.
4. If any session uses `schedule`, the program must include `calendar.end_date` unless all repeating schedules set `schedule.end_offset_days` (so repetition can be materialized into a finite list).
5. `schedule` may be provided as a structured object or as a shorthand string; shorthand is parsed into one of the schedule types below.

### Schedule Types

1. `schedule.type = interval_days` requires:
   - `every`: integer >= 1
   - optional `start_offset_days`: integer >= 0
   - optional `end_offset_days`: integer >= 0
2. `schedule.type = weekdays` requires:
   - `days`: non-empty array of `MON|TUE|WED|THU|FRI|SAT|SUN`
   - optional `start_offset_days`: integer >= 0
   - optional `end_offset_days`: integer >= 0

### Training Blocks

Blocks are an optional authoring feature for phased programs.

1. Program must specify exactly one of:
   - `sessions` (top-level session templates), or
   - `blocks` (sequential phases containing sessions)
2. Each block must have:
   - `id` (string, unique)
   - `duration` (string shorthand like `"4w"` / `"10d"`, or object `{type,value}`)
   - optional `sessions` (array; may be empty for a rest block)
3. Blocks are contiguous: block N+1 starts immediately after block N ends.
4. Normalization when using blocks:
   - session ids are namespaced to `<block_id>.<session_id>`
   - `day` and schedule offsets are interpreted relative to the block start and shifted into program-relative values
   - repeating schedules are bounded using `schedule.end_offset_days` to the block window
   - if a calendar is present, `calendar.end_date` is computed from `calendar.start_date` and the sum of block durations (and must match if explicitly provided)

## Diagnostics

- Errors are blocking and must prevent compilation.
- Warnings are non-blocking and indicate potentially unsafe assumptions.
- Diagnostics should include a path, severity, and message.
