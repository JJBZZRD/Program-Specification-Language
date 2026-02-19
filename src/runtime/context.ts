export interface AthleteContext {
  athlete_id: string;
  e1rm?: Record<string, number>;
  fatigue_score?: number;
}

export interface RuntimeContext {
  date_iso: string;
  athlete: AthleteContext;
}
