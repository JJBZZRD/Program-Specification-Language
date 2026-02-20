# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

- Massively expanded author-facing shorthand: schedule strings, exercise strings/blocks, multiline sets blocks, reps/intensity/rest duration shorthands, and progression shorthand strings.

## 0.1.0 - 2026-02-19

- Scaffolded repository structure for PSL v0.1.
- Added initial spec docs, schema, grammar, and examples.
- Added TypeScript parser/validator/compiler skeleton and CLI stubs.
- Added calendar scheduling + materialization to dated session instances.
- Added absolute load targets and load selection windows (`load`, `load_range`).
- Added completion-driven progression rules (`increment` / `weekly_increment`) with configurable cadence (weeks or sessions) (`psl materialize --results ...`).
