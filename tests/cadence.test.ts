import assert from "node:assert/strict";
import type { SessionCompletion } from "../src/runtime/progression.js";
import { compileProgram } from "../src/compile/compileProgram.js";
import { materialize } from "../src/compile/materialize.js";

export async function run(): Promise<void> {
  {
    const compiled = compileProgram({
      language_version: "0.1",
      metadata: { id: "cadence-sessions", name: "Cadence Sessions" },
      calendar: {
        start_date: "2026-03-02",
        end_date: "2026-03-14"
      },
      sessions: [
        {
          id: "bench-4d",
          name: "Bench Every 4 Days",
          schedule: { type: "interval_days", every: 4 },
          exercises: [
            {
              exercise: "Barbell Bench Press",
              sets: [
                {
                  count: 1,
                  reps: 5,
                  intensity: { type: "load", value: 100, unit: "kg" },
                  progression: {
                    type: "increment",
                    cadence: { type: "sessions", every: 3 },
                    by: 2.5
                  }
                }
              ]
            }
          ]
        }
      ]
    });

    const completions: SessionCompletion[] = [
      { session_id: "bench-4d", date_iso: "2026-03-02", success: true },
      { session_id: "bench-4d", date_iso: "2026-03-06", success: true },
      { session_id: "bench-4d", date_iso: "2026-03-10", success: true }
    ];

    const sessions = materialize(compiled, { completions }).filter((session) => session.id === "bench-4d");

    const byDate = new Map(sessions.map((session) => [session.date_iso, session]));

    assert.equal(
      byDate.get("2026-03-02")?.exercises[0]?.sets[0]?.intensity?.type,
      "load"
    );
    assert.equal(
      (byDate.get("2026-03-02")?.exercises[0]?.sets[0]?.intensity as { value: number } | undefined)
        ?.value,
      100
    );

    assert.equal(
      (byDate.get("2026-03-06")?.exercises[0]?.sets[0]?.intensity as { value: number } | undefined)
        ?.value,
      100
    );

    assert.equal(
      (byDate.get("2026-03-10")?.exercises[0]?.sets[0]?.intensity as { value: number } | undefined)
        ?.value,
      100
    );

    assert.equal(
      (byDate.get("2026-03-14")?.exercises[0]?.sets[0]?.intensity as { value: number } | undefined)
        ?.value,
      102.5
    );
  }

  {
    const compiled = compileProgram({
      language_version: "0.1",
      metadata: { id: "cadence-friday", name: "Cadence Friday" },
      calendar: {
        start_date: "2026-03-02",
        end_date: "2026-03-13"
      },
      sessions: [
        {
          id: "bench-mf",
          name: "Bench Mon/Fri",
          schedule: { type: "weekdays", days: ["MON", "FRI"] },
          exercises: [
            {
              exercise: "Barbell Bench Press",
              sets: [
                {
                  count: 1,
                  reps: 5,
                  intensity: { type: "load", value: 80, unit: "kg" },
                  progression: {
                    type: "increment",
                    cadence: { type: "sessions", on_weekdays: ["FRI"] },
                    by: 2.5
                  }
                }
              ]
            }
          ]
        }
      ]
    });

    const completions: SessionCompletion[] = [
      { session_id: "bench-mf", date_iso: "2026-03-06", success: true },
      { session_id: "bench-mf", date_iso: "2026-03-13", success: true }
    ];

    const sessions = materialize(compiled, { completions }).filter((session) => session.id === "bench-mf");
    const byDate = new Map(sessions.map((session) => [session.date_iso, session]));

    assert.equal(
      (byDate.get("2026-03-02")?.exercises[0]?.sets[0]?.intensity as { value: number } | undefined)
        ?.value,
      80
    );
    assert.equal(
      (byDate.get("2026-03-06")?.exercises[0]?.sets[0]?.intensity as { value: number } | undefined)
        ?.value,
      80
    );
    assert.equal(
      (byDate.get("2026-03-09")?.exercises[0]?.sets[0]?.intensity as { value: number } | undefined)
        ?.value,
      82.5
    );
    assert.equal(
      (byDate.get("2026-03-13")?.exercises[0]?.sets[0]?.intensity as { value: number } | undefined)
        ?.value,
      82.5
    );
  }

  {
    const compiled = compileProgram({
      language_version: "0.1",
      metadata: { id: "cadence-weeks", name: "Cadence Weeks" },
      calendar: {
        start_date: "2026-03-02",
        end_date: "2026-03-16"
      },
      sessions: [
        {
          id: "squat-weekly",
          name: "Squat Weekly",
          schedule: { type: "weekdays", days: ["MON"] },
          exercises: [
            {
              exercise: "Back Squat",
              sets: [
                {
                  count: 1,
                  reps: 5,
                  intensity: { type: "load", value: 150, unit: "kg" },
                  progression: {
                    type: "increment",
                    cadence: { type: "weeks", every: 2 },
                    by: 5
                  }
                }
              ]
            }
          ]
        }
      ]
    });

    const completions: SessionCompletion[] = [
      { session_id: "squat-weekly", date_iso: "2026-03-02", success: true },
      { session_id: "squat-weekly", date_iso: "2026-03-09", success: true }
    ];

    const sessions = materialize(compiled, { completions }).filter((session) => session.id === "squat-weekly");
    const byDate = new Map(sessions.map((session) => [session.date_iso, session]));

    assert.equal(
      (byDate.get("2026-03-02")?.exercises[0]?.sets[0]?.intensity as { value: number } | undefined)
        ?.value,
      150
    );
    assert.equal(
      (byDate.get("2026-03-09")?.exercises[0]?.sets[0]?.intensity as { value: number } | undefined)
        ?.value,
      150
    );
    assert.equal(
      (byDate.get("2026-03-16")?.exercises[0]?.sets[0]?.intensity as { value: number } | undefined)
        ?.value,
      155
    );
  }
}

