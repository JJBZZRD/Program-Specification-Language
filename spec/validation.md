# Semantic Validation Rules (v0.1)

## Structural

1. `language_version` must be `0.1`.
2. `metadata.id` and `metadata.name` are required and non-empty.
3. Program must include at least one session.
4. Each session must have at least one exercise.
5. Each exercise must include at least one set prescription.

## Reps and Sets

1. `count` must be an integer >= 1.
2. Reps as number: integer >= 1.
3. Reps as range: `min >= 1`, `max >= min`.

## Intensity

1. `percent_1rm` value: `0 < value <= 150`.
2. `rpe` value: `1 <= value <= 10`.
3. `rir` value: `0 <= value <= 6`.

## Diagnostics

- Errors are blocking and must prevent compilation.
- Warnings are non-blocking and indicate potentially unsafe assumptions.
- Diagnostics should include a path, severity, and message.
