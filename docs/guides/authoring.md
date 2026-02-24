# PSL Authoring Guide (v0.2)

PSL is a declarative YAML DSL for resistance training programming.

v0.2 expands practical coaching coverage (powerlifting + bodybuilding) while keeping deterministic compilation to canonical AST.

## Quickstart

```bash
# Validate
npm.cmd run psl:dev -- validate examples/hypertrophy_4day.psl.yaml

# Compile to canonical structure
npm.cmd run psl:dev -- compile examples/hypertrophy_4day.psl.yaml --out out.compiled.json

# Materialize dated sessions
npm.cmd run psl:dev -- materialize examples/scheduling_demo.psl.yaml --out out.materialized.json

# Materialize with completion results (increment progression)
npm.cmd run psl:dev -- materialize examples/progression_demo.psl.yaml --results examples/progression_demo.results.json --out out.progression_demo.materialized.json
```

## Versioning

Set `language_version` per program:

```yaml
language_version: "0.2"
```

Compatibility:

- v0.1 source documents remain valid in v0.2 runtime.
- Use `"0.2"` to access new fields and shorthand.

## Core Authoring Flow

1. Define `metadata`.
2. Add optional `calendar`.
3. Author `sessions` or `blocks` (one of them).
4. Add exercises and sets (structured or shorthand).
5. Validate, then compile/materialize.

## v0.2 Additions

### Exercise identity + aliases

```yaml
exercise_aliases:
  "comp squat": squat_comp

exercises:
  - exercise: Competition Squat
    exercise_id: squat_comp
    aliases: ["high bar squat", "comp squat"]
```

### Set roles, top/backoff, warmup

```yaml
exercises:
  - exercise: Competition Bench Press
    warmup:
      type: percent_ramp
      from_percent: 40
      to_percent: 85
      steps: 4
      reps: 3
      based_on_role: top
    sets: |
      1x1 @RPE8 role top
      4x3 @-10% backoff
```

### Grouping + rest loci

```yaml
rest_default: 90s
groups:
  - id: A
    type: superset
    rounds: 4
    rest_between_rounds: 2m
exercises:
  - exercise: A1 Incline DB Press
    sets: ["1x10 @RIR2"]
  - exercise: A2 Chest Supported Row
    sets: ["1x12 @RIR2"]
```

Rest inheritance in canonical compilation:

`set.rest_seconds` → `exercise.rest_seconds` → `session.rest_default_seconds`

### Time-based prescriptions

```yaml
sets:
  - "AMRAP 8m @RPE8 cap12"
  - "EMOM 10m: 3 reps @70%"
  - "density 8m target 30 reps"
  - "for time 8m target 30 reps"
```

Canonical shape uses:

- `work_type: reps | time`
- `time_mode: amrap | emom | for_time | density`
- `duration_seconds`, `interval_seconds`, `target_total_reps`

### Constraints + repeat/termination

```yaml
sets:
  - count: 1
    reps: 5
    intensity: { type: rpe, value: 8 }
    constraints:
      max_rpe: 9
      velocity_loss_cap: 0.2
    repeat:
      max_sets: 5
      until:
        metric: rpe
        op: ">="
        value: 9
```

Shorthand:

```yaml
sets:
  - "1x5 @RPE8 cap@9 up to 5 sets until RPE9"
```

### Progression scope/aggregation/actions

```yaml
progression:
  type: auto_adjust
  scope: exercise
  criteria:
    aggregation: all_sets
    condition:
      type: metric_vs_target
      metric: load
      op: ">="
      target: max
  actions:
    - type: reduce_load
      by: { value: 2.5, unit: kg }
```

Runtime boundary:

- `increment` / `weekly_increment` execute during materialization with completion results.
- `auto_adjust` is validated/compiled declaratively in v0.2; runtime evaluation is deferred.
- Completion results remain backward-compatible and may optionally include `exercise_id` and `reps_completed`.

### Deload + fatigue modifiers

```yaml
blocks:
  - id: deload
    duration: "1w"
    deload: true
    exercise_swap_map:
      squat_comp: squat_paused
    sessions: []
```

`deload: true` expands defaults:

- `volume_multiplier: 0.6`
- `intensity_cap.max_rpe: 7`

### Multi-session per day

```yaml
sessions:
  - id: bench-am
    name: Bench Technique
    schedule: "MON"
    slot: AM
    exercises: [{ exercise: Bench Press, sets: ["5x3 @70%"] }]
  - id: bench-pm
    name: Bench Volume
    schedule: "MON"
    slot: PM
    exercises: [{ exercise: Bench Press, sets: ["4x8 @65%"] }]
```

Materialized output preserves `date_iso` and `slot` for same-day distinction.

### Families, substitutions, tags

```yaml
exercises:
  - exercise: Paused Squat
    exercise_id: squat_paused
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

### Units + rounding

```yaml
units: kg
rounding:
  round_to: 2.5
  mode: nearest
  equipment:
    barbell: 2.5
```

Per-exercise overrides are supported via `exercise.units` and `exercise.rounding`.

### Tempo + execution cues

```yaml
exercises:
  - exercise: Back Squat
    tempo: "31X0"
    sets:
      - count: 3
        reps: 5
        pause_seconds: 1
        eccentric_seconds: 3
```

## Shorthand Surfaces

Shorthand is allowed in:

- `session.schedule`
- `session.exercises` (array strings or multiline block)
- `exercise.sets` (array strings or multiline block)
- set-level intensity/progression/reps/rest clauses

Formal grammar: `spec/shorthand.ebnf`

## Validation + Diagnostics

Diagnostics include:

- `path`
- `severity` (`error` or `warning`)
- `message`

v0.2 improves shorthand source mapping for multiline blocks with line-aware paths.

Semantic rules: `spec/validation.md`

## Migration (v0.1 → v0.2)

1. Existing v0.1 files remain valid.
2. Keep `language_version: "0.1"` for frozen legacy docs.
3. Use `"0.2"` for new fields (`exercise_id`, `role`, `work_type`, `slot`, modifiers, etc.).
4. Incrementally adopt identity and group semantics first; they unlock progression/substitution interoperability.

## Reference Links

- `spec/versions/0.2.md`
- `spec/psl.schema.json`
- `spec/validation.md`
- `spec/shorthand.ebnf`
