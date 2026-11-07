/*
 * The free-agent class — everyone MLB lists as a free agent this offseason,
 * off StatsAPI's own `/people/freeAgents`. MLB files the class under the
 * season just played: the winter after 2026 is `season=2026`, the class the
 * contract sites call "2027 free agents".
 *
 * MLB carries no money, so the salary column is whatever data/salaries.csv
 * says the player made in that season (see lib/salaries.ts) — blank until
 * that file is filled.
 */
import { getClubs, mlb, titleCase } from "@/lib/mlb";
import { getSalaries } from "@/lib/salaries";

export interface FreeAgent {
  id: number;
  name: string;
  position: string;
  age: number | null;
  /** "R/L", bats then throws. */
  hand: string;
  fromId: number | null;
  fromAbbr: string;
  fromName: string;
  /** The club he signed with, or null while he is still available. */
  toId: number | null;
  toAbbr: string;
  toName: string;
  /** "MLB", or "MiLB" for a minor-league free agent. */
  type: "MLB" | "MiLB";
  /** MLB's own note, evened out: "Club Option Declined", "Claimed Off Waivers"… */
  note: string;
  declared: string;
  salary: number | null;
}

/** One `/people/freeAgents` entry, joined to the club, the person and the pay. */
export function toFreeAgent(
  fa: any,
  person: any,
  abbr: (id: number | null) => string,
  salary: number | null,
): FreeAgent {
  const fromId = fa.originalTeam?.id ?? null;
  const toId = fa.newTeam?.id ?? null;
  const raw: string = fa.notes ?? "";
  const milb = /minor league free agent/i.test(raw);
  return {
    id: fa.player?.id ?? 0,
    name: fa.player?.fullName ?? "—",
    position:
      fa.position?.abbreviation ?? person?.primaryPosition?.abbreviation ?? "",
    age: person?.currentAge ?? null,
    hand: [person?.batSide?.code, person?.pitchHand?.code]
      .filter(Boolean)
      .join("/"),
    fromId,
    fromAbbr: abbr(fromId),
    fromName: fa.originalTeam?.name ?? "",
    toId,
    toAbbr: abbr(toId),
    toName: fa.newTeam?.name ?? "",
    type: milb ? "MiLB" : "MLB",
    /* MLB types its notes by hand — "Claimed off waivers." and "Claimed Off
       Waivers" are one note — and the minor-league one is the TYPE column. */
    note: milb ? "" : titleCase(raw.trim().replace(/\.$/, "")),
    declared: fa.dateDeclared ?? "",
    salary,
  };
}

export async function getFreeAgents(season: number): Promise<FreeAgent[]> {
  const data = await mlb(`/people/freeAgents?season=${season}`, 3600);
  const list: any[] = data.freeAgents ?? [];
  if (list.length === 0) return [];

  /* Age and handedness aren't on the list — one batched people call is. */
  const ids = list.map((f) => f.player?.id).filter(Boolean);
  const [people, clubs, salaries] = await Promise.all([
    mlb(
      `/people?personIds=${ids.join(",")}&fields=people,id,currentAge,batSide,pitchHand,code,primaryPosition,abbreviation`,
      86400,
    ).catch(() => ({ people: [] })),
    getClubs().catch(() => []),
    getSalaries(season).catch(() => []),
  ]);
  const byId = new Map<number, any>(
    (people.people ?? []).map((p: any) => [p.id, p]),
  );
  const abbrs = new Map(clubs.map((c) => [c.id, c.abbr]));
  const pay = new Map(
    salaries.filter((s) => s.id).map((s) => [s.id, s.salary]),
  );

  return list.map((fa) =>
    toFreeAgent(
      fa,
      byId.get(fa.player?.id),
      (id) => (id && abbrs.get(id)) || "",
      pay.get(fa.player?.id) ?? null,
    ),
  );
}
