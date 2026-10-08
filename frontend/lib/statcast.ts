/*
 * Savant's Statcast search, one season of one player's pitches as CSV — the
 * only place pitch locations live outside the warehouse. Undocumented, like
 * every Savant feed here, so a page sent in place of the CSV is an error.
 */
import type { Pitch } from "./api";
import { parseCsv } from "./advanced";
import { FETCH_TIMEOUT_MS, seasonOf, todayPT } from "./mlb";

/** One season's regular-season rows matching `filter`, as Savant names them. */
export async function statcastSearch(
  filter: Record<string, string>,
  season: number,
): Promise<Record<string, string>[]> {
  const query = new URLSearchParams({
    all: "true",
    hfSea: `${season}|`,
    hfGT: "R|",
    type: "details",
    ...filter,
  });
  const res = await fetch(
    `https://baseballsavant.mlb.com/statcast_search/csv?${query}`,
    {
      /* A finished season never changes; the running one moves daily. */
      next: { revalidate: season < seasonOf(todayPT()) ? 604800 : 3600 },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS * 3),
    },
  );
  if (!res.ok) throw new Error(`Savant ${res.status}: ${query}`);
  const text = await res.text();
  if (text.trimStart().startsWith("<"))
    throw new Error(`Savant: page, not CSV`);
  return parseCsv(text);
}

const num = (s: string | undefined) => {
  const n = Number.parseFloat(s ?? "");
  return Number.isFinite(n) ? n : null;
};
const str = (s: string | undefined) => s || null;

/** A Savant row as the warehouse's pitch, so the zone plot reads either. */
export const toPitch = (r: Record<string, string>): Pitch => ({
  pitch_type: str(r.pitch_type),
  pitch_name: str(r.pitch_name),
  plate_x: num(r.plate_x),
  plate_z: num(r.plate_z),
  release_speed: num(r.release_speed),
  release_spin_rate: num(r.release_spin_rate),
  pfx_x: num(r.pfx_x),
  pfx_z: num(r.pfx_z),
  description: str(r.description),
  stand: str(r.stand),
  sz_top: num(r.sz_top),
  sz_bot: num(r.sz_bot),
  game_date: str(r.game_date),
  balls: num(r.balls),
  strikes: num(r.strikes),
  outs_when_up: num(r.outs_when_up),
  inning: num(r.inning),
  runners_on: !!(r.on_1b || r.on_2b || r.on_3b),
  zone: num(r.zone),
  launch_speed: num(r.launch_speed),
  launch_angle: num(r.launch_angle),
  events: str(r.events),
});

/** The pitch that ended each of a pitcher's strikeouts this season. */
export const getStrikeouts = async (id: number, season: number) =>
  (
    await statcastSearch(
      {
        hfAB: "strikeout|strikeout_double_play|",
        player_type: "pitcher",
        "pitchers_lookup[]": String(id),
      },
      season,
    )
  ).map(toPitch);

/** Pitch tracking good enough to plot begins with Statcast itself. */
export const STATCAST_FIRST_SEASON = 2015;

/** Every regular-season pitch a player threw — or saw, as a batter. */
export const getSeasonPitches = async (
  id: number,
  season: number,
  role: "pitcher" | "batter",
) =>
  (
    // ponytail: a full season is ~2MB of CSV, at Next's fetch-cache ceiling;
    // a heavier workload just goes uncached. Trim columns server-side if it bites.
    await statcastSearch(
      { player_type: role, [`${role}s_lookup[]`]: String(id) },
      season,
    )
  ).map(toPitch);
