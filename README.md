# Program Specification Language (PSL)

Program Specification Language (PSL) is a declarative DSL for defining structured resistance training programs.

PSL is designed to be readable by coaches, deterministic for software, and portable across platforms.

## Repository Layout

- `docs/`: context, design notes, and authoring/embedding guides
- `spec/`: canonical schema, shorthand grammar, and semantic validation notes
- `examples/`: reference PSL documents
- `testdata/`: invalid fixtures and expected compilation outputs
- `src/`: parser, validator, compiler, and runtime scaffolding
- `cli/`: command-line tool scaffolding
- `tests/`: parser/validator/compiler tests

## Getting Started

```bash
npm install
npm run test
npm run build
```

## CLI (Local)

On Windows PowerShell (when `npm.ps1` is blocked), use `npm.cmd`:

```bash
npm.cmd run psl:dev -- validate examples/hypertrophy_4day.psl.yaml
npm.cmd run psl:dev -- compile examples/hypertrophy_4day.psl.yaml --out out.compiled.json
npm.cmd run psl:dev -- materialize examples/scheduling_demo.psl.yaml --out out.materialized.json
npm.cmd run psl:dev -- materialize examples/progression_demo.psl.yaml --results examples/progression_demo.results.json --out out.progression_demo.materialized.json
npm.cmd run psl:dev -- print examples/powerlifting_peak.psl.yaml
```

## Status

This repository provides a v0.1 specification and a working TypeScript reference implementation (parse/validate/compile/materialize), including scheduling, basic progression (`increment` / `weekly_increment`), and expanded coach-friendly shorthand (see `examples/shorthand_demo.psl.yaml`).
