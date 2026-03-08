# PSL Feature Matrix

Status values:

- `implemented`: works end-to-end for intended v0.3 scope.
- `partial`: shape exists but runtime/consumer behavior is limited.
- `spec-only`: represented/validated but not executed in runtime behavior.
- `planned`: not implemented yet.

Pipeline columns:

- `Y` = supported
- `P` = partial support
- `N` = not supported

| Feature | Spec Status | Parse | Validate | Compile | Materialize | Export | CLI-JSON | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| YAML source parsing (`parseDocument`) | implemented | Y | Y | Y | Y | Y | Y | YAML -> object parse is the entrypoint for all CLI commands. |
| Language versions `0.1` + `0.2` + `0.3` | implemented | Y | Y | Y | Y | Y | Y | Enforced in validator (`SUPPORTED_LANGUAGE_VERSIONS`). |
| Program structure (`sessions` xor `blocks`) | implemented | Y | Y | Y | Y | Y | Y | Exactly one of `sessions` or `blocks`. |
| Session timing invariant (`day` xor `schedule`, or top-level `sequence` in flat v0.3 programs) | implemented | Y | Y | Y | Y | Y | Y | Validator normalizes `sequence` into canonical session timing. |
| Top-level ordered split `sequence` (`repeat`, `session_id`, `rest_after_days`) | implemented | Y | Y | Y | Y | Y | Y | v0.3 authoring sugar only; normalized to `day` or `interval_days` schedules before compile/materialize. |
| Schedule model (`interval_days`, `weekdays`, offsets) | implemented | Y | Y | Y | Y | Y | Y | Includes schedule shorthand parsing and bounded windows. |
| Block durations + expansion + namespaced ids | implemented | Y | Y | Y | Y | Y | Y | Block sessions become `<block_id>.<session_id>`; offsets are shifted. |
| Shorthand surfaces (schedule/exercise/set/reps/intensity/progression) | implemented | Y | Y | Y | Y | Y | Y | Parsed in validator normalization path; deterministic mapping. |
| Time-based sets (`amrap`, `emom`, `density`, `for_time`) | implemented | Y | Y | Y | Y | Y | Y | Stored as set metadata; no workout simulation engine. |
| Core intensity types (`percent_1rm`, `rpe`, `rir`, `load`, `load_range`) | implemented | Y | Y | Y | Y | Y | Y | Range/value constraints enforced. |
| Role-referenced intensity (`percent_of_set`, `load_delta_from_set`) | partial | Y | Y | Y | P | Y | Y | Role refs validated; runtime absolute load realization is deferred. |
| Exercise identity + aliases (`exercise_id`, `exercise_aliases`, `aliases`) | implemented | Y | Y | Y | Y | Y | Y | Alias normalization and duplicate checks are enforced. |
| Grouping (`session.groups`, `exercise.group_id`, A1/A2 shorthand) | implemented | Y | Y | Y | Y | P | Y | Structural grouping supported; export is table-oriented, not group-workflow execution. |
| Rest aliasing + inheritance (`set -> exercise -> session`) | implemented | Y | Y | Y | Y | Y | Y | Conflicting alias fields are rejected. |
| Executable progression (`increment`, `weekly_increment`) | implemented | Y | Y | Y | Y | Y | Y | Applied during materialization using completion results. |
| Progression shorthand (`+2.5kg every ... if ...`) | implemented | Y | Y | Y | Y | Y | Y | Parsed into canonical `increment` rules. |
| Progression `scope` and `criteria` fields on increment rules | partial | Y | Y | Y | P | Y | Y | Shape is accepted; runtime progression logic mainly uses `when` + cadence. |
| `aggregate_metric` progression condition | partial | Y | Y | Y | P | Y | Y | Parsed/validated; runtime evaluator currently does not execute aggregate logic. |
| `auto_adjust` progression strategy + actions | spec-only | Y | Y | Y | N | Y | Y | Declarative shape only in v0.2; no materialization action engine yet. |
| Constraints + repeat (`constraints`, `repeat.until`) | partial | Y | Y | Y | P | Y | Y | Validated/compiled; no stop/termination runtime engine in materialization. |
| Deload/fatigue modifiers (`deload`, `volume_multiplier`, `intensity_cap`, `exercise_swap_map`) | implemented | Y | Y | Y | Y | Y | Y | Deterministic compile-time transforms are active. |
| Warmup specifications | partial | Y | Y | Y | P | P | Y | Shape + role checks are enforced; no dedicated warmup expansion runtime. |
| Substitutions (`substitutions`, requirement constraints) | partial | Y | Y | Y | N | P | Y | Represented in compiled data; automatic substitution selection is deferred. |
| Units + rounding policy fields | partial | Y | Y | Y | P | P | Y | Policy shape is validated; automatic rounding application is not wired through pipeline. |
| Multi-session day slotting (`slot`) and ordering | implemented | Y | Y | Y | Y | Y | Y | Materialization sorts by date, slot, id. |
| CSV/XLSX export (`data` and `client` layouts) | implemented | N | P | Y | Y | Y | N | `export` command has no JSON mode but supports CSV/XLSX outputs. |
| CLI JSON envelope (`--json`) for validate/compile/materialize | implemented | N | N | N | N | N | Y | Stable machine output + diagnostic codes in `cli/src/util/machine.ts`. |
| Runtime rules engine (`src/runtime/rules.ts`) | planned | N | N | N | N | N | N | Current implementation returns no applied rules. |
| Calendar timezone runtime semantics | partial | Y | Y | Y | P | P | Y | `timezone` is validated/stored; date math currently uses UTC dates. |

## Deferred / Later-Version Focus

Roadmap and docs indicate deferred runtime behavior beyond current v0.3 implementation:

- Context-aware runtime rule evaluation (`docs/roadmap.md`, v0.3 section).
- Full execution of declarative progression strategies (`auto_adjust`) and aggregate criteria logic.
- Runtime `repeat.until` stop behavior.
- Runtime load realization for role-referenced intensities.
- Automatic substitution selection from declared alternatives.

When in doubt, treat `src/validate/validateAst.ts` + `src/compile/materialize.ts` as implementation truth and verify against tests in `tests/`.
