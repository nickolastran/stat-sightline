/*
 * Where a batter's hits landed, and the park to draw them in.
 *
 * MLB's own play logs say what a hit was but never where it went; Savant's
 * Statcast search carries the Gameday coordinates of every batted ball back
 * to 2008, as CSV. One request per season, so each is a cache entry of its
 * own well under Next's ceiling — a career in one request would not be.
 *
 * The park is the batter's current club's, off MLB's venue record, which
 * gives the wall's distance down each line, to each gap and to center.
 */
import { mlb, mlbTeams } from "./mlb";
import { statcastSearch, toPitch } from "./statcast";

export type HitKind = "single" | "double" | "triple" | "home_run";

export interface SprayHit {
  /** Feet from home plate: x toward right field, y toward center. */
  x: number;
  y: number;
  kind: HitKind;
  season: number;
  date: string;
  /** Statcast's projected distance, where it measured one. */
  feet: number | null;
}

export interface Park {
  name: string;
  /** Left line, left-center, center, right-center, right line — in feet. */
  walls: [number, number, number, number, number];
}

/** Gameday's coordinates begin with the 2008 season. */
export const SPRAY_FIRST_SEASON = 2008;

const KINDS = new Set<string>(["single", "double", "triple", "home_run"]);

/* Gameday plots home plate at (125.42, 198.27), y growing toward the
   catcher, about two and a half feet to the unit. */
const toFeet = (hcX: number, hcY: number) => ({
  x: Math.round((hcX - 125.42) * 2.5),
  y: Math.round((198.27 - hcY) * 2.5),
});

/** One season of a batter's regular-season hits, as Savant's rows. */
const hitRows = (id: number, season: number) =>
  statcastSearch(
    {
      hfAB: "single|double|triple|home_run|",
      player_type: "batter",
      "batters_lookup[]": String(id),
    },
    season,
  );

/** The pitches those hits came off — where in the zone a batter does damage. */
export const seasonHitPitches = async (id: number, season: number) =>
  (await hitRows(id, season)).map(toPitch);

/** One season's regular-season hits that Gameday placed on the field. */
export async function seasonHits(
  id: number,
  season: number,
): Promise<SprayHit[]> {
  return (await hitRows(id, season)).flatMap((r): SprayHit[] => {
    const hcX = Number.parseFloat(r.hc_x);
    const hcY = Number.parseFloat(r.hc_y);
    if (!KINDS.has(r.events) || !Number.isFinite(hcX) || !Number.isFinite(hcY))
      return [];
    const feet = Number.parseInt(r.hit_distance_sc, 10);
    return [
      {
        ...toFeet(hcX, hcY),
        kind: r.events as HitKind,
        season,
        date: r.game_date,
        feet: Number.isFinite(feet) ? feet : null,
      },
    ];
  });
}

/**
 * Every season's hits at once. A season Savant doesn't answer for is left
 * out rather than taking the career with it.
 */
export async function getSprayHits(
  id: number,
  seasons: number[],
): Promise<SprayHit[]> {
  const each = await Promise.all(
    seasons
      .filter((s) => s >= SPRAY_FIRST_SEASON)
      .map((s) => seasonHits(id, s).catch(() => [])),
  );
  return each.flat();
}

/** A club's home park, wall distances and all — null where MLB has none. */
export async function getHomePark(teamId: number): Promise<Park | null> {
  const venueId = (await mlbTeams()).find((t) => t.id === teamId)?.venue?.id;
  if (!venueId) return null;
  const data = await mlb(`/venues/${venueId}?hydrate=fieldInfo`, 86400);
  const v = data.venues?.[0];
  const f = v?.fieldInfo ?? {};
  const walls = [
    f.leftLine,
    f.leftCenter,
    f.center,
    f.rightCenter,
    f.rightLine,
  ];
  if (!walls.every((w) => typeof w === "number" && w > 0)) return null;
  return { name: v.name, walls: walls as Park["walls"] };
}
