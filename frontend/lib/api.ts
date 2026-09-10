const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface Pitcher {
  player_id: number;
  full_name: string | null;
  throws: string | null;
  pitches?: number | null;
}

export interface Pitch {
  pitch_type: string | null;
  pitch_name: string | null;
  plate_x: number | null;
  plate_z: number | null;
  release_speed: number | null;
  release_spin_rate: number | null;
  pfx_x: number | null;
  pfx_z: number | null;
  description: string | null;
  stand: string | null;
  sz_top: number | null; // this batter's zone top, ft
  sz_bot: number | null; // this batter's zone bottom, ft
  game_date: string | null; // ISO date
  balls: number | null;
  strikes: number | null;
  outs_when_up: number | null;
  inning: number | null;
  runners_on: boolean | null;
  zone: number | null; // Statcast 1-14; 1-9 = in zone
  launch_speed: number | null; // exit velocity, mph
  launch_angle: number | null; // degrees
  events: string | null;
}

export interface PitcherPitches {
  pitcher: Pitcher;
  count: number;
  pitches: Pitch[];
}

/* ── Standings projection ───────────────────────────────────────────── */

/** Chronological-holdout quality of the projection model. */
export interface ProjectionModel {
  holdout_season: number | null;
  holdout_games: number | null;
  train_games: number | null;
  accuracy: number | null;
  /** Always-pick-the-home-team accuracy — the bar the model has to clear. */
  home_baseline: number | null;
  log_loss: number | null;
  run_diff_mae: number | null;
  trained_at: string | null;
}

export interface TeamProjection {
  team_id: number; // MLB team id — joins to StandingRow.id
  name: string;
  wins: number;
  losses: number;
  games_played: number;
  games_remaining: number;
  projected_wins: number;
  projected_losses: number;
  pace_wins: number;
  pace_162: number;
}

export interface StandingsProjection {
  season: number;
  as_of: string | null;
  model: ProjectionModel;
  teams: TeamProjection[];
}

/**
 * Projected final standings for a season.
 *
 * Called from server components. Cached for half an hour, matching the
 * standings themselves: the projection only moves as games go final, and it
 * scores every remaining game on the schedule to answer.
 */
export async function getProjections(
  season: number
): Promise<StandingsProjection> {
  const res = await fetch(`${API_URL}/api/standings/projections?season=${season}`, {
    next: { revalidate: 1800 },
  });
  if (!res.ok) throw new Error(`getProjections failed: ${res.status}`);
  return res.json();
}

/* ── Playoff odds ───────────────────────────────────────────────────── */

/**
 * One club's line on the odds table. The four odds are shares, 0-1, of the
 * simulated seasons: `clinchWildCard` is a berth that wasn't the division, so
 * it and `winDivision` add up to `makePlayoffs` — which is how the table
 * reads across.
 */
export interface TeamOdds {
  team_id: number;
  name: string;
  league_id: number;
  division_id: number;
  division: string;
  wins: number;
  losses: number;
  win_pct: number;
  games_back: number;
  games_remaining: number;
  projected_wins: number;
  projected_losses: number;
  ros_win_pct: number;
  strength_of_schedule: number;
  win_division: number;
  clinch_bye: number;
  clinch_wild_card: number;
  make_playoffs: number;
  win_world_series: number;
}

export interface PlayoffOdds {
  season: number;
  as_of: string | null;
  /** Drawn seasons behind every share above. */
  simulations: number;
  model: ProjectionModel;
  teams: TeamOdds[];
}

/**
 * Playoff odds for a season.
 *
 * Thousands of simulated seasons behind one call, so this is cached for half
 * an hour like the projection it sits beside — the answer only moves as games
 * go final. Called from server components.
 */
export async function getPlayoffOdds(season: number): Promise<PlayoffOdds> {
  const res = await fetch(`${API_URL}/api/standings/odds?season=${season}`, {
    next: { revalidate: 1800 },
  });
  if (!res.ok) throw new Error(`getPlayoffOdds failed: ${res.status}`);
  return res.json();
}

/** `revalidate` seconds turns the lookup into a cached read — for the fixed
 *  seed lists that don't need to be fresh, unlike the live typeahead. */
export async function searchPitchers(
  q = "",
  limit = 25,
  revalidate?: number
): Promise<Pitcher[]> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  const res = await fetch(`${API_URL}/api/pitchers?${params}`, {
    ...(revalidate ? { next: { revalidate } } : { cache: "no-store" as const }),
  });
  if (!res.ok) throw new Error(`searchPitchers failed: ${res.status}`);
  return res.json();
}

export async function getPitcherPitches(
  pitcherId: number,
  opts: { pitchType?: string; stand?: "L" | "R"; limit?: number } = {}
): Promise<PitcherPitches> {
  const params = new URLSearchParams();
  if (opts.pitchType) params.set("pitch_type", opts.pitchType);
  if (opts.stand) params.set("stand", opts.stand);
  if (opts.limit) params.set("limit", String(opts.limit));
  const res = await fetch(
    `${API_URL}/api/pitchers/${pitcherId}/pitches?${params.toString()}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error(`getPitcherPitches failed: ${res.status}`);
  return res.json();
}

/* ── Natural-language query ("ask") ─────────────────────────────────── */

export interface AskAnswer {
  value: number;
  /** Pre-formatted headline — "42" or ".311". Never re-round it here. */
  display: string;
  label: string;
  subject: string;
  subject_id: number | null;
  subject_kind: "player" | "team";
  role: "batter" | "pitcher";
  timeframe: string;
  filters: string[];
  rank: string | null;
}

export interface AskLeader {
  rank: number;
  player_id: number;
  name: string;
  value: number;
  display: string;
}

export interface AskGame {
  date: string;
  day_of_week: string;
  game_pk: number;
  team: string | null;
  opponent: string | null;
  is_home: boolean | null;
  venue_team: string | null;
  result: string | null; // "W 6-4", from the subject's side
  inning: number | null;
  event: string | null;
  detail: string | null;
  count: number;
  other_id: number | null;
  other_name: string | null;
  other_hand: string | null;
  launch_speed: number | null;
  launch_angle: number | null;
  distance: number | null;
}

export interface AskSummary {
  total: number;
  denom: number;
  home: number;
  road: number;
  vs_lhp: number;
  vs_rhp: number;
  games: number;
  first_date: string | null;
  last_date: string | null;
}

export interface AskResponse {
  query: string;
  query_type: "player_stat" | "comparative" | "team_stat";
  answer: AskAnswer | null;
  comparison: (AskLeader | AskAnswer)[];
  game_log: AskGame[];
  truncated: boolean;
  summary_stats: AskSummary | null;
  /** Why the answer is what it is — unparsed stat, unknown name, empty slice. */
  notes: string[];
  suggestions: string[];
  data_through: string | null;
}

/**
 * Answer one plain-English question from the pitch warehouse.
 *
 * Cached for an hour: the warehouse only moves when the ETL runs, and the
 * same handful of questions get asked repeatedly.
 */
export async function ask(q: string): Promise<AskResponse> {
  const res = await fetch(`${API_URL}/api/ask?q=${encodeURIComponent(q)}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`ask failed: ${res.status}`);
  return res.json();
}
