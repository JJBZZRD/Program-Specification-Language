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
4. `load` value: `value > 0` and `unit` is `kg` or `lb`.

## Calendar and Scheduling

### Program Calendar

1. `calendar.start_date` must be an ISO date string `YYYY-MM-DD`.
2. If provided, `calendar.end_date` must be an ISO date string `YYYY-MM-DD`.
3. If both dates are provided, `end_date` must be on or after `start_date`.

### Session Timing

1. A session must specify either `day` or `schedule` (but not both).
2. `day` must be an integer >= 1 (relative to the program start).
3. If any session uses `schedule`, the program must include `calendar`.
4. If any session uses `schedule`, the program must include `calendar.end_date` so repeating sessions can be materialized into a finite list.

### Schedule Types

1. `schedule.type = interval_days` requires:
   - `every`: integer >= 1
   - optional `start_offset_days`: integer >= 0
2. `schedule.type = weekdays` requires:
   - `days`: non-empty array of `MON|TUE|WED|THU|FRI|SAT|SUN`
   - optional `start_offset_days`: integer >= 0

## Diagnostics

- Errors are blocking and must prevent compilation.
- Warnings are non-blocking and indicate potentially unsafe assumptions.
- Diagnostics should include a path, severity, and message.
