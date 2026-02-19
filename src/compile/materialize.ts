import type { Weekday } from "../ast/types.js";
import type { CompiledProgram, CompiledSession } from "./compileProgram.js";

export interface MaterializedSession extends CompiledSession {
  sequence: number;
  date_iso?: string;
  occurrence?: number;
}

const WEEKDAY_BY_UTC_DAY: readonly Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function parseIsoDate(dateIso: string): Date {
  const date = new Date(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO date: ${dateIso}`);
  }
  return date;
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function diffDays(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((to.getTime() - from.getTime()) / msPerDay);
}

function getWeekdayUtc(date: Date): Weekday {
  return WEEKDAY_BY_UTC_DAY[date.getUTCDay()]!;
}

export function materialize(program: CompiledProgram): MaterializedSession[] {
  const calendar = program.calendar;

  if (!calendar?.start_date) {
    return program.sessions.map((session, index) => ({
      ...session,
      sequence: index + 1
    }));
  }

  const startDate = parseIsoDate(calendar.start_date);
  const endDate = calendar.end_date ? parseIsoDate(calendar.end_date) : undefined;

  const occurrences: Omit<MaterializedSession, "sequence">[] = [];

  program.sessions.forEach((session) => {
    if (session.day !== undefined) {
      const date = addDays(startDate, session.day - 1);
      occurrences.push({
        ...session,
        date_iso: formatIsoDate(date),
        occurrence: 1
      });
      return;
    }

    if (!session.schedule) {
      return;
    }

    if (!endDate) {
      throw new Error("calendar.end_date is required to materialize repeating session schedules.");
    }

    const offset = session.schedule.start_offset_days ?? 0;

    if (session.schedule.type === "interval_days") {
      let date = addDays(startDate, offset);
      let occurrence = 1;

      while (date.getTime() <= endDate.getTime()) {
        occurrences.push({
          ...session,
          day: diffDays(startDate, date) + 1,
          date_iso: formatIsoDate(date),
          occurrence
        });

        date = addDays(date, session.schedule.every);
        occurrence += 1;
      }

      return;
    }

    const allowed = new Set<Weekday>(session.schedule.days);
    let date = addDays(startDate, offset);
    let occurrence = 1;

    while (date.getTime() <= endDate.getTime()) {
      if (allowed.has(getWeekdayUtc(date))) {
        occurrences.push({
          ...session,
          day: diffDays(startDate, date) + 1,
          date_iso: formatIsoDate(date),
          occurrence
        });

        occurrence += 1;
      }

      date = addDays(date, 1);
    }
  });

  occurrences.sort((a, b) => {
    const dateA = a.date_iso ?? "";
    const dateB = b.date_iso ?? "";

    if (dateA !== dateB) {
      return dateA.localeCompare(dateB);
    }

    return a.id.localeCompare(b.id);
  });

  return occurrences.map((session, index) => ({
    ...session,
    sequence: index + 1
  }));
}
