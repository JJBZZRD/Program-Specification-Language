# Authoring Guide

## Minimal Program

```yaml
language_version: "0.1"
metadata:
  id: beginner-a
  name: Beginner A
sessions:
  - id: day-1
    name: Full Body
    day: 1
    exercises:
      - exercise: Back Squat
        sets:
          - count: 3
            reps: 5
            intensity:
              type: percent_1rm
              value: 75
```

## Shorthand Example

`5x5 @75%` compiles to `count=5`, `reps=5`, `intensity=percent_1rm(75)`.

## Shorthand In YAML

You can use shorthand strings inside `sets`:

```yaml
language_version: "0.1"
metadata:
  id: shorthand-demo
  name: Shorthand Demo
sessions:
  - id: day-1
    name: Day 1
    day: 1
    exercises:
      - exercise: Barbell Bench Press
        sets:
          - "5x5 @75%"
          - "3x8-10 @RPE8"
```

## Validate With CLI

From the repo root:

```bash
npm.cmd run psl:dev -- validate examples/hypertrophy_4day.psl.yaml
```

## Authoring Tips

- Keep exercise names consistent across sessions.
- Prefer explicit set objects when using advanced constraints.
- Validate early with CLI before integrating into applications.
