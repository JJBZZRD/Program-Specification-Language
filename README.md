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

## AI Context

Quick orientation files for AI agents and humans:

- `AI_CONTEXT.md`: curated high-signal overview and routing map
- `ai-manifest.json`: machine-readable index of specs, entrypoints, examples, and commands
- `FEATURES.md`: implementation matrix (implemented vs partial vs spec-only vs planned)

## Getting Started

```bash
npm install
npm run test
npm run build
```

## Install As A Dependency

Install from a GitHub tag:

```bash
npm i github:JJBZZRD/Program-Specification-Language#v0.2.0
```

Install from a specific commit:

```bash
npm i github:JJBZZRD/Program-Specification-Language#<commit-sha>
```

Basic usage:

```ts
import {
  compileProgram,
  materialize,
  parseDocument,
  validateAst
} from "program-specification-language";

const ast = parseDocument(sourceText);
const validation = validateAst(ast);

if (validation.value) {
  const compiled = compileProgram(validation.value);
  const sessions = materialize(compiled);
  console.log(sessions);
}
```

Expo/Metro note:

- Consume PSL through `program-specification-language` package imports only.
- Do not import from `src/*.ts`; the package is intended to be consumed from compiled JS in `dist/`.

## CLI (Local)

On Windows PowerShell (when `npm.ps1` is blocked), use `npm.cmd`:

```bash
npm.cmd run psl:dev -- validate examples/hypertrophy_4day.psl.yaml
npm.cmd run psl:dev -- validate examples/blocks_demo.psl.yaml
npm.cmd run psl:dev -- compile examples/hypertrophy_4day.psl.yaml --out out.compiled.json
npm.cmd run psl:dev -- materialize examples/scheduling_demo.psl.yaml --out out.materialized.json
npm.cmd run psl:dev -- materialize examples/progression_demo.psl.yaml --results examples/progression_demo.results.json --out out.progression_demo.materialized.json
npm.cmd run psl:dev -- print examples/powerlifting_peak.psl.yaml
npm.cmd run psl:dev -- export examples/blocks_demo.psl.yaml --format csv --out out.program.csv
npm.cmd run psl:dev -- export examples/blocks_demo.psl.yaml --format xlsx --out out.program.xlsx
npm.cmd run psl:dev -- export examples/blocks_demo.psl.yaml --layout client --format xlsx --out out.client.xlsx
```

Notes:

- `export --format xlsx` writes an `.xlsx` workbook with two sheets: `Calendar` (one row per day) and `Sets` (one row per set).
- `export --format csv` defaults to exporting the `Sets` table; use `--table calendar` to export the daily calendar as CSV.
- `export --layout client` writes a client-facing, human-readable program layout (one sheet for XLSX, one table for CSV).

## Status

This repository provides a v0.2 specification (backward-compatible with v0.1) and a working TypeScript reference implementation (parse/validate/compile/materialize), including scheduling, progression (`increment` / `weekly_increment` plus declarative `auto_adjust` shape), `%1RM + load offset` targets (`plus_load`), role-referenced intensity (`percent_of_set`, `load_delta_from_set`), training blocks (`blocks`), grouping/rest semantics, time-based prescriptions, deload modifiers, and expanded coach-friendly shorthand (see `examples/shorthand_demo.psl.yaml` and `spec/versions/0.2.md`).
