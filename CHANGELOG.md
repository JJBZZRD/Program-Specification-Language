# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

- Massively expanded author-facing shorthand: schedule strings, exercise strings/blocks, multiline sets blocks, reps/intensity/rest duration shorthands, and progression shorthand strings.
- Added `%1RM + absolute load offset` intensity support (`plus_load`), with shorthand like `@70%+5lb`.
- Extended progression to support load-delta increments on `%1RM` targets (e.g. `progression: "+5lb every week"` on `@70%`).
- Added optional training blocks (`blocks`) for phased programs, with durations (weeks/days) that expand into bounded schedules.
- Added `schedule.end_offset_days` to bound repeating schedules without requiring a global `calendar.end_date`.

## 0.1.0 - 2026-02-19

- Scaffolded repository structure for PSL v0.1.
- Added initial spec docs, schema, grammar, and examples.
- Added TypeScript parser/validator/compiler skeleton and CLI stubs.
- Added calendar scheduling + materialization to dated session instances.
- Added absolute load targets and load selection windows (`load`, `load_range`).
- Added completion-driven progression rules (`increment` / `weekly_increment`) with configurable cadence (weeks or sessions) (`psl materialize --results ...`).
