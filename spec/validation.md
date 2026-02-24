# Semantic Validation Rules (v0.2)

PSL v0.2 is backward-compatible with v0.1 source documents and adds richer authoring semantics.

## Structural

1. `language_version` must be `0.1` or `0.2`.
2. `metadata.id` and `metadata.name` are required and non-empty.
3. Program must include exactly one of `sessions` or `blocks`.
4. Every session must include at least one exercise.
5. Every exercise must include at least one set prescription.
6. Session ids must be unique after block expansion (`<block_id>.<session_id>`).

## Shorthand + Source Mapping

v0.2 keeps v0.1 shorthand and adds time and constraint clauses.

- New set shorthand families: `AMRAP`, `EMOM`, `density`, `for time`.
- Tail clauses: `role`, `cap@`, `stop if ...`, `up to N sets until ...`, `rest_before`, `rest_after`.
- Relative intensity shorthand:
  - `@-12%` / `@+5%` (normalized as `percent_of_set` from role `top` by default)
  - `@-10kg` / `@+5lb` (normalized as `load_delta_from_set` from role `top` by default)
  - optional explicit role: `@-12% from top`.
- Inline progression shorthand segments are allowed in set/exercise shorthand blocks:
  - `1x4 @75%; +2.5kg every week if success`
  - attaches to the immediately preceding set shorthand.
- Multiline shorthand diagnostics annotate line locations via `[line N]`.

## Exercise Identity and Aliases

1. `exercise_id` must be a non-empty string when provided.
2. Top-level `exercise_aliases` maps alias tokens to `exercise_id`.
3. Per-exercise `aliases` require `exercise_id`.
4. Alias collisions are errors.

## Sets, Work Types, and Time Modes

1. `count` must be integer `>= 1`.
2. `reps` must be integer `>=1`, valid range, or valid shorthand range string.
3. `work_type` must be `reps` or `time` when provided.
4. `time_mode` must be one of `amrap | emom | for_time | density`.
5. `duration_seconds` is required for time work.
6. `duration_seconds`, `interval_seconds`, and `target_total_reps` are invalid for rep work.
7. `EMOM` requires `reps`; omitting `interval_seconds` emits a warning (defaults to 60s).
8. `density` without `target_total_reps` emits a warning.
9. `for_time` without `reps` or `target_total_reps` emits a warning.

## Intensity

Supported types:

- `percent_1rm`
- `rpe`
- `rir`
- `load`
- `load_range`
- `percent_of_set` (role reference)
- `load_delta_from_set` (role reference)

Rules:

1. Numeric constraints are enforced (`rpe`, `rir`, positive loads, valid ranges).
2. `percent_of_set` and `load_delta_from_set` require role references.
3. Referenced roles must exist in prior sets within the same exercise.

## Role and Warmup Semantics

1. `set.role` is optional but, if provided, must be a non-empty token.
2. `exercise.warmup` must be valid `percent_ramp` or `steps`.
3. `warmup.based_on_role` must match at least one role in the exercise.

## Rest Semantics

1. `set.rest` and `set.rest_seconds` are mutually exclusive aliases.
2. `exercise.rest` and `exercise.rest_seconds` are mutually exclusive aliases.
3. `session.rest_default` and `session.rest_default_seconds` are mutually exclusive aliases.
4. Canonical inheritance at compile time: `set.rest_seconds` → `exercise.rest_seconds` → `session.rest_default_seconds`.
5. `rest_before` / `rest_after` map to `rest_before_seconds` / `rest_after_seconds`.

## Constraints and Repeat

Supported constraints:

- `max_rpe`
- `min_rir`
- `max_sets`
- `max_total_reps`
- `stop_on_failure`
- `velocity_loss_cap`

Repeat:

- `repeat.max_sets`
- `repeat.until` using `rpe | rir | velocity_loss | failure`

Rules:

1. `repeat` requires at least one of `max_sets` or `until`.
2. `repeat.max_sets` cannot exceed `constraints.max_sets`.
3. `failure` condition supports only `==`/`!=` and boolean values.

## Grouping and Session Loci

1. `session.groups` supports `superset | circuit | giant_set`.
2. Group ids must be unique per session.
3. `exercise.group_id` must reference a known group; shorthand `A1/A2` style labels derive group ids.
4. Unknown `group_id` values are errors.
5. `session.slot` must be `AM | PM | EVE` or integer `>=1`.

## Progression

### Executable progression (v0.2 runtime-compatible)

- `increment`
- `weekly_increment`

Rules:

1. Increment progression requires `intensity`.
2. `increment` requires explicit `cadence`.
3. `calendar` is required when executable progression is used.
4. `progression.when` and `progression.criteria.condition` cannot both be defined.
5. `scope` (if provided) must be `set | exercise | session`.
6. Inline progression shorthand must follow a set shorthand in the same block; duplicate inline progression on one set is invalid.

### Declarative-only progression (v0.2 shape, v0.3 runtime)

- `auto_adjust`
- criteria aggregation: `all_sets | any_set | last_set | total_reps | avg_rpe | min_load`
- actions: `repeat_week | reduce_load | reduce_volume | switch_variant`

Rules:

1. `auto_adjust.criteria` is required.
2. `auto_adjust.actions` must be a non-empty array.
3. Action payloads are validated for shape and basic numeric sanity.

## Deload and Fatigue Modifiers

Supported at block/session:

- `deload`
- `volume_multiplier`
- `intensity_cap.max_rpe`
- `exercise_swap_map`

Rules:

1. `deload: true` expands defaults:
   - `volume_multiplier: 0.6`
   - `intensity_cap.max_rpe: 7`
2. Block-level modifiers merge into sessions; session modifiers override block values.
3. Modifier values are validated for finite numeric ranges.

## Units and Rounding

1. `units` supports `kg | lb` at top-level and per exercise.
2. `rounding` validates `round_to`, `mode`, and optional equipment increments.
3. Schema/validation define representation only; numeric realization is consumer-driven.

## Blocks and Scheduling

1. Block durations support string shorthand (`4w`, `10d`) or `{type,value}`.
2. Block sessions are expanded with id namespacing and offset-bounded schedules.
3. If calendar is present with blocks, computed end-date must match explicit `calendar.end_date` when provided.
4. Repeating schedules require bounded horizon via `calendar.end_date` or per-schedule `end_offset_days`.

## Diagnostics

- Errors are blocking.
- Warnings are non-blocking.
- Each diagnostic includes `path`, `severity`, and `message`.
- v0.2 improves shorthand error localization with line annotations for block parsing.
