# Roadmap

Status legend: `[x]` implemented, `[ ]` not implemented

## v0.1 Foundation

- [x] Define canonical AST and schema
- [x] Define shorthand grammar and parser behavior
- [x] Expand shorthand across authoring surfaces (sets blocks, exercises blocks, schedule/rest/progression shorthands)
- [x] Implement parser, validator, and compiler skeleton
- [x] Provide examples and invalid fixtures
- [x] Add calendar scheduling and recurrence (dates, `interval_days`, `weekdays`)
- [x] Add materialization to dated session instances (basic)
- [x] Add optional training blocks (phases) with durations (weeks/days) that expand into bounded schedules
- [x] Add absolute load targets and load selection windows (`load`, `load_range`)
- [x] Add progression rules (`increment` / `weekly_increment`) driven by completion results, with configurable cadence (weeks vs sessions)

## v0.2 Language Growth

- [x] Expand exercise identity (`exercise_id`) and alias normalization
- [x] Add role-aware set semantics (warmup/top/backoff/work/amrap/etc.)
- [x] Add warmup specifications and role-referenced intensities
- [x] Add grouping (`superset`/`circuit`/`giant_set`) and rest loci inheritance
- [x] Add time-based prescriptions (`AMRAP`, `EMOM`, `for_time`, `density`)
- [x] Add declarative constraints and repeat/termination representation
- [x] Expand progression shape (`scope`, `criteria.aggregation`, `auto_adjust`, actions)
- [x] Add deload/fatigue modifiers (`volume_multiplier`, `intensity_cap`, `exercise_swap_map`)
- [x] Add multi-session per day slotting (`session.slot`)
- [x] Add exercise families/tags/substitutions declarative model
- [x] Add units/rounding policies at global and exercise scopes
- [x] Add tempo/execution metadata
- [x] Improve shorthand diagnostics and source mapping

## v0.3 Runtime Rules

- [ ] Add context-aware rule evaluation
- [ ] Add materialization with history/e1RM context (rules + athlete context)
- [ ] Add conformance test suite for cross-implementation parity
