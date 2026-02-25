# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

- Bumped language baseline to PSL v0.2 while preserving v0.1 compatibility.
- Added stable exercise identity + aliasing (`exercise_id`, `exercise_aliases`, per-exercise `aliases`).
- Added role-aware set modeling and role-referenced intensity targets (`percent_of_set`, `load_delta_from_set`).
- Added first-class time-based set semantics (`work_type`, `time_mode`, `duration_seconds`, `interval_seconds`, `target_total_reps`) and shorthand (`AMRAP`, `EMOM`, `density`, `for time`).
- Added session grouping and multi-locus rest semantics (`session.groups`, `exercise.group_id`, `session.rest_default_seconds`, `rest_before/after`).
- Added declarative constraints + repeat/termination shape (`constraints`, `repeat`) and shorthand caps/stop clauses.
- Expanded progression schema (`scope`, `criteria.aggregation`, `auto_adjust`, declarative actions) while keeping runtime execution limited to increment rules.
- Added deload/fatigue modifiers (`deload`, `volume_multiplier`, `intensity_cap`, `exercise_swap_map`) with deterministic compile-time transforms.
- Added multi-session slotting (`session.slot`) and slot-aware materialization ordering.
- Added exercise families/tags/substitutions model and units/rounding policies at global + exercise scopes.
- Added tempo/execution metadata (`tempo`, `pause_seconds`, `eccentric_seconds`).
- Massively expanded author-facing shorthand: schedule strings, exercise strings/blocks, multiline sets blocks, reps/intensity/rest duration shorthands, and progression shorthand strings.
- Added `%1RM + absolute load offset` intensity support (`plus_load`), with shorthand like `@70%+5lb`.
- Extended progression to support load-delta increments on `%1RM` targets (e.g. `progression: "+5lb every week"` on `@70%`).
- Added optional training blocks (`blocks`) for phased programs, with durations (weeks/days) that expand into bounded schedules.
- Added `schedule.end_offset_days` to bound repeating schedules without requiring a global `calendar.end_date`.
- Expanded machine-readable JSON mode coverage and documented CLI-level JSON error mappings.

## 0.1.0 - 2026-02-19

- Scaffolded repository structure for PSL v0.1.
- Added initial spec docs, schema, grammar, and examples.
- Added TypeScript parser/validator/compiler skeleton and CLI stubs.
- Added calendar scheduling + materialization to dated session instances.
- Added absolute load targets and load selection windows (`load`, `load_range`).
- Added completion-driven progression rules (`increment` / `weekly_increment`) with configurable cadence (weeks or sessions) (`psl materialize --results ...`).
