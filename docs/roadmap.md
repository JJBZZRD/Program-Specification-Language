# Roadmap

## v0.1 Foundation

- Define canonical AST and schema
- Define shorthand grammar and parser behavior
- Implement parser, validator, and compiler skeleton
- Provide examples and invalid fixtures
- Add calendar scheduling and recurrence (dates, `interval_days`, `weekdays`)
- Add materialization to dated session instances (basic)
- Add absolute load targets and load selection windows (`load`, `load_range`)
- Add progression rules (`increment` / `weekly_increment`) driven by completion results, with configurable cadence (weeks vs sessions)

## v0.2 Language Growth

- Add additional progression strategy objects (beyond basic increment rules)
- Add richer progression conditions (all-sets vs any-sets, per-exercise aggregation)
- Add exercise families and substitution rules
- Add richer diagnostics and source mapping

## v0.3 Runtime Rules

- Add context-aware rule evaluation
- Add materialization with history/e1RM context (rules + athlete context)
- Add conformance test suite for cross-implementation parity
