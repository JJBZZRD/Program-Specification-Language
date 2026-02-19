# Embedding Guide

## Typical Integration Flow

1. Load PSL source from YAML.
2. Parse source into a document object.
3. Validate into diagnostics (errors/warnings).
4. Compile validated AST into app-facing plan structure.
5. Optionally materialize sessions into dated instances.

## Recommended Boundaries

- Keep parsing/validation/compilation in a dedicated service layer.
- Store canonical AST and compiled output separately for traceability.
- Persist `source_hash` with compiled artifacts for cache invalidation.

## Error Handling

- Treat validation errors as blocking.
- Surface warnings in UX when non-blocking assumptions are applied.
