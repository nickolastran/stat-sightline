/*
 * The Rule 4 draft, off StatsAPI's `/draft/{year}` feed — every pick of every
 * round of one year's draft, which is one payload rather than one per round.
 *
 * The feed answers for every year back to the first draft in 1965, but it
 * answers thinner the further back you go: a 1990 pick carries a name, a club
 * and a school, and nothing else. Everything below that is optional here for
 * that reason — a missing bonus, rank or class is a column that prints a dash,
 * not a board that fails to render.
 *
 * The shaping is split from the fetch so the degradation can be checked
 * against both payloads — see lib/draft.check.ts.
 */
import { mlb } from "@/lib/mlb";

/** The first Rule 4 draft. Nothing before this has a feed to read. */
export const DRAFT_FIRST_SEASON = 1965;

export interface DraftPick {
  /** As printed: "1", "2", but also "CB-A", "PPI" — not a number. */
  round: string;
  /** Overall pick, and the pick within the round. */
  pick: number;
  roundPick: number;
  /** MLB Pipeline's pre-draft prospect rank, from 2010ish on. */
  rank: number | null;
  teamId: number | null;
  team: string;
  id: number | null;
  name: string;
  /** "UCLA (CA)" — the state only where the feed carries one. */
  school: string;
  schoolClass: string;
  /** Country, with the town behind it as the cell's title. */
  country: string;
  /** School state — the column MLB's own tracker filters on. */
  state: string;
  home: string;
  position: string;
  bats: string;
  throws: string;
  height: string;
  weight: number | null;
  /** YYYY-MM-DD, formatted at the cell rather than here. */
  born: string;
  video: string | null;
  bonus: number | null;
  pickValue: number | null;
  /** A pick a club let lapse — a row with no player on it. */
  pass: boolean;
}

/** A numeric field that arrives as a string, or as nothing at all. */
const num = (v: unknown): number | null => {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n)
    ? null
    : n;
};

/** Flatten the rounds into picks, in the order the draft was held. */
export function draftPicks(rounds: any[]): DraftPick[] {
  return (rounds ?? []).flatMap((r) =>
    ((r.picks ?? []) as any[]).map((p): DraftPick => {
      const person = p.person ?? {};
      const school = p.school ?? {};
      const home = p.home ?? {};
      const state = school.state ?? "";
      return {
        round: String(p.pickRound ?? r.round ?? "—"),
        pick: num(p.pickNumber) ?? 0,
        roundPick: num(p.roundPickNumber) ?? 0,
        rank: num(p.rank),
        teamId: num(p.team?.id),
        team: p.team?.name ?? "—",
        id: num(person.id),
        name: person.fullName ?? (p.isPass ? "PASS" : "—"),
        school: school.name
          ? `${school.name}${state ? ` (${state})` : ""}`
          : "—",
        schoolClass: school.schoolClass ?? "",
        country: home.country ?? person.birthCountry ?? "",
        state,
        /* What the country cell says on hover: where the player is actually
           from, which the one-word column has no room for. */
        home: [home.city ?? person.birthCity, home.state ?? person.birthStateProvince]
          .filter(Boolean)
          .join(", "),
        position: person.primaryPosition?.abbreviation ?? "",
        bats: person.batSide?.code ?? "",
        throws: person.pitchHand?.code ?? "",
        height: person.height ?? "",
        weight: num(person.weight),
        born: person.birthDate ?? "",
        video: p.scoutingReport ?? null,
        bonus: num(p.signingBonus),
        pickValue: num(p.pickValue),
        pass: Boolean(p.isPass),
      };
    }),
  );
}

/** One year's draft. Cached for a day — a finished draft never changes. */
export async function getDraft(year: number): Promise<DraftPick[]> {
  const data = await mlb(`/draft/${year}`, 86400);
  return draftPicks(data.drafts?.rounds ?? []);
}

/** A `?year=` there is a draft for, else the most recent one. */
export const pickDraftYear = (raw: string | undefined, current: number): number => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= DRAFT_FIRST_SEASON && n <= current
    ? n
    : current;
};

/**
 * What the filter dropdowns offer — only what is actually on the board, so a
 * 1990 draft doesn't offer a school-state filter nothing answers.
 *
 * Rounds keep draft order (the compensation rounds sit between the numbered
 * ones and sort nowhere alphabetically); everything else sorts.
 */
export function draftFilters(picks: DraftPick[]) {
  const seen = <K extends keyof DraftPick>(key: K, sort: boolean) => {
    /* The dash a missing value prints as is not a value to filter on. */
    const values = [
      ...new Set(picks.map((p) => String(p[key])).filter((v) => v && v !== "—")),
    ];
    return sort ? values.sort() : values;
  };
  return {
    rounds: seen("round", false),
    positions: seen("position", true),
    teams: seen("team", true),
    states: seen("state", true),
    countries: seen("country", true),
  };
}

/** A signing bonus, the way a draft board prints one: $8.20m, or $425,000. */
export const money = (v: number | null): string =>
  v === null ? "—" : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}m` : `$${v.toLocaleString()}`;

/**
 * A birth date as MM/DD/YY. Sliced out of the string rather than parsed: a
 * bare YYYY-MM-DD is read as UTC midnight, which a west-coast reader would
 * see as the day before.
 */
export const dob = (iso: string): string =>
  /^\d{4}-\d{2}-\d{2}/.test(iso)
    ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(2, 4)}`
    : "—";
