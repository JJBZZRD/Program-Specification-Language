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

- `session.schedule`: object or shorthand string (e.g. `every other day`, `MON,FRI`, `every 4 days +1`)
- `session.exercises`: array of exercises OR a multi-exercise block string
- Exercise entries: object OR exercise shorthand string (single-line or multiline block)
- `exercise.sets`: array of sets OR a multiline sets block string
- Set entries: structured set object, set shorthand string, or shorthand wrapper object (`{ shorthand: "...", ... }`)
- `set.reps`: integer, `{min,max}`, or shorthand string (e.g. `"8-12"`)
- `set.intensity`: object or shorthand string (e.g. `"75%"`, `"@RPE8"`, `"150kg"`, `"[100,120]kg"`)
- `exercise.rest_seconds` and `exercise.rest`: integer seconds or a duration string (e.g. `"90s"`, `"2m"`, `"2m30s"`, `"2:30"`)
- `set.progression`: object or shorthand string (e.g. `"+2.5kg every 3 sessions on FRI if load>=target"`)

Normalization notes:

- Multiline set blocks are split on newlines; `;` can separate multiple set entries on one line.
- In set blocks, trailing `# ...` is captured as a `set.note`.
- Shorthand parsing failures are surfaced as validation diagnostics.

## Reps and Sets

1. `count` must be an integer >= 1.
2. Reps as number: integer >= 1.
3. Reps as range: `min >= 1`, `max >= min`.
4. Reps shorthand strings must be either:
   - `<reps>` (e.g. `"5"`), or
   - `<min>-<max>` (e.g. `"8-12"`)

## Intensity

1. `percent_1rm` value: `0 < value <= 150`.
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
   - a number for `percent_1rm`, `rpe`, `rir`, and `load`
   - a number or an object `{min,max}` (at least one of `min`/`max`) for `load_range`
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
4. If any session uses `schedule`, the program must include `calendar.end_date` so repeating sessions can be materialized into a finite list.
5. `schedule` may be provided as a structured object or as a shorthand string; shorthand is parsed into one of the schedule types below.

### Schedule Types

1. `schedule.type = interval_days` requires:
   - `every`: integer >= 1
   - optional `start_offset_days`: integer >= 0
2. `schedule.type = weekdays` requires:
   - `days`: non-empty array of `MON|TUE|WED|THU|FRI|SAT|SUN`
   - optional `start_offset_days`: integer >= 0

## Diagnostics

- Errors are blocking and must prevent compilation.
- Warnings are non-blocking and indicate potentially unsafe assumptions.
- Diagnostics should include a path, severity, and message.
