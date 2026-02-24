# Roadmap

## v0.1 Foundation

- Define canonical AST and schema
- Define shorthand grammar and parser behavior
- Expand shorthand across authoring surfaces (sets blocks, exercises blocks, schedule/rest/progression shorthands)
- Implement parser, validator, and compiler skeleton
- Provide examples and invalid fixtures
- Add calendar scheduling and recurrence (dates, `interval_days`, `weekdays`)
- Add materialization to dated session instances (basic)
- Add optional training blocks (phases) with durations (weeks/days) that expand into bounded schedules
- Add absolute load targets and load selection windows (`load`, `load_range`)
- Add progression rules (`increment` / `weekly_increment`) driven by completion results, with configurable cadence (weeks vs sessions)

## v0.2 Language Growth

- Expand exercise identity (`exercise_id`) and alias normalization
- Add role-aware set semantics (warmup/top/backoff/work/amrap/etc.)
- Add warmup specifications and role-referenced intensities
- Add grouping (`superset`/`circuit`/`giant_set`) and rest loci inheritance
- Add time-based prescriptions (`AMRAP`, `EMOM`, `for_time`, `density`)
- Add declarative constraints and repeat/termination representation
- Expand progression shape (`scope`, `criteria.aggregation`, `auto_adjust`, actions)
- Add deload/fatigue modifiers (`volume_multiplier`, `intensity_cap`, `exercise_swap_map`)
- Add multi-session per day slotting (`session.slot`)
- Add exercise families/tags/substitutions declarative model
- Add units/rounding policies at global and exercise scopes
- Add tempo/execution metadata
- Improve shorthand diagnostics and source mapping

## v0.3 Runtime Rules

- Add context-aware rule evaluation
- Add materialization with history/e1RM context (rules + athlete context)
- Add conformance test suite for cross-implementation parity
