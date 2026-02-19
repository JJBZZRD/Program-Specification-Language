# Glossary

- `AST`: Canonical, normalized representation of a PSL program.
- `Set prescription`: A set definition with reps/intensity/rest constraints.
- `Intensity`: Load target descriptor (`percent_1rm`, `rpe`, `rir`, `load`, `load_range`).
- `Rep range`: A minimum and maximum rep target.
- `Compiled plan`: Expanded representation used by consuming applications.
- `Materialization`: Optional conversion from compiled templates to dated session instances.
- `Progression`: Rule that updates future targets over time (e.g., weekly increments) using completion results.
- `Completion results`: Runtime data (separate from PSL YAML) describing what was achieved in a session.
