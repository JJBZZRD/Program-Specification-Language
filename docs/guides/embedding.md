# Embedding Guide

## Typical Integration Flow

1. Load PSL source from YAML.
2. Parse source into a document object.
3. Validate into diagnostics (errors/warnings).
4. Compile validated AST into app-facing plan structure.
5. Optionally materialize sessions into dated instances.
6. Optionally apply progression during materialization by providing completion results.

## Recommended Boundaries

- Keep parsing/validation/compilation in a dedicated service layer.
- Store canonical AST and compiled output separately for traceability.
- Persist `source_hash` with compiled artifacts for cache invalidation.
- Treat completion results (`--results`) as runtime data (separate from the PSL source).

## Error Handling

- Treat validation errors as blocking.
- Surface warnings in UX when non-blocking assumptions are applied.
