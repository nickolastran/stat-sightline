/*
 * Player salaries — the one board on this site MLB's own API can't answer.
 * Nothing in StatsAPI carries a salary, a contract or a payroll, so this
 * reads a file instead: data/salaries.csv, one row per player per season.
 *
 *   year,name,team,position,salary,mlb_id
 *   2026,Aaron Judge,NYY,RF,40000000,592450
 *
 * Only the first five are required, and the header is matched loosely —
 * `season` for `year`, `player` for `name`, `pos` for `position`, `tm` for
 * `team` — because the file is somebody's export rather than our own format.
 * A salary may be written "$40,000,000" or "40000000".
 *
 * `mlb_id` is what links a row to the rest of the site; a row without one
 * still ranks and prints, it just isn't a link. The club is matched by
 * whatever the file calls it, so a row from 2003 that says MON reaches the
 * franchise that is now Washington.
 */
import fs from "node:fs";
import path from "node:path";
import { getClubs } from "@/lib/mlb";

/** Where the file lives, said once — the empty state prints it. */
export const SALARY_FILE = "data/salaries.csv";

export interface Salary {
  /** Within the season, by salary — ties share a rank. */
  rank: number;
  year: number;
  id: number | null;
  name: string;
  position: string;
  team: string;
  teamId: number | null;
  salary: number | null;
}

/** A row as the file has it, before it is ranked or joined to a club. */
export interface SalaryRow {
  year: number;
  name: string;
  team: string;
  position: string;
  salary: number | null;
  id: number | null;
}

/** RFC-4180 enough: quoted fields, commas inside them, doubled quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') (field += '"'), i++;
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") (row.push(field), (field = ""));
    else if (c === "\n") (row.push(field), (field = ""), rows.push(row), (row = []));
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length > 0) (row.push(field), rows.push(row));
  /* A trailing newline is not a row, and neither is a line of commas. */
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

/** What each column is called in this particular export. */
const HEADINGS: Record<keyof SalaryRow, string[]> = {
  year: ["year", "season", "yearid"],
  name: ["name", "player", "playername", "fullname"],
  team: ["team", "tm", "club", "teamid"],
  position: ["position", "pos"],
  salary: ["salary", "pay", "amount", "opening day salary"],
  id: ["mlb_id", "mlbid", "id", "playerid", "person_id"],
};

/** "$40,000,000" or "40000000" — anything unreadable is no salary at all. */
const dollars = (raw: string): number | null => {
  const n = Number(raw.replace(/[$,\s]/g, ""));
  return raw.trim() === "" || !Number.isFinite(n) ? null : n;
};

/**
 * The file's rows, as rows. Split from the read so the header matching and
 * the number parsing can be checked against an export nobody has to have —
 * see lib/salaries.check.ts.
 */
export function salaryRows(csv: string): SalaryRow[] {
  const [header, ...body] = parseCsv(csv);
  if (!header) return [];
  const key = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, ""));
  const at = (field: keyof SalaryRow) => {
    const names = HEADINGS[field].map((n) => n.replace(/\s+/g, ""));
    return key.findIndex((h) => names.includes(h));
  };
  const cols = {
    year: at("year"),
    name: at("name"),
    team: at("team"),
    position: at("position"),
    salary: at("salary"),
    id: at("id"),
  };
  /* Without a year, a name and a salary there is no board to build. */
  if (cols.year < 0 || cols.name < 0 || cols.salary < 0) return [];

  const cell = (r: string[], i: number) => (i < 0 ? "" : (r[i] ?? "").trim());
  /* Not Number() alone: an empty cell reads as 0, which is an integer, and a
     row with no year at all would pass for one. */
  const whole = (raw: string) => (raw === "" ? NaN : Number(raw));
  return body
    .map((r): SalaryRow => {
      const id = whole(cell(r, cols.id));
      return {
        year: whole(cell(r, cols.year)),
        name: cell(r, cols.name),
        team: cell(r, cols.team),
        position: cell(r, cols.position),
        salary: dollars(cell(r, cols.salary)),
        id: Number.isInteger(id) && id > 0 ? id : null,
      };
    })
    .filter((r) => Number.isInteger(r.year) && r.name !== "");
}

/**
 * Ranked, best-paid first. Ties share a rank and the next rank skips past
 * them, the way a salary table is always printed — two men at $40m are both
 * second, and nobody is third. A row with no salary is unranked and last.
 */
export function rankBySalary(rows: SalaryRow[]): (SalaryRow & { rank: number })[] {
  const sorted = [...rows].sort(
    (a, b) => (b.salary ?? -1) - (a.salary ?? -1) || a.name.localeCompare(b.name),
  );
  let rank = 0;
  let previous: number | null = NaN;
  return sorted.map((r, i) => {
    if (r.salary !== previous) (rank = i + 1), (previous = r.salary);
    return { ...r, rank: r.salary === null ? 0 : rank };
  });
}

/* Read once per server, not once per request: the file doesn't change under
   a running process, and re-reading it on every render would parse every
   season to answer for one. */
let cached: SalaryRow[] | null = null;

function allRows(): SalaryRow[] {
  if (cached) return cached;
  try {
    cached = salaryRows(
      fs.readFileSync(path.join(process.cwd(), SALARY_FILE), "utf8"),
    );
  } catch {
    /* No file yet — the page says so rather than failing. */
    cached = [];
  }
  return cached;
}

/** Every season the file covers, newest first. Empty until it has one. */
export const salaryYears = (): number[] =>
  [...new Set(allRows().map((r) => r.year))].sort((a, b) => b - a);

/**
 * Whatever the file calls a club, matched to the franchise it is now — so a
 * row from 2003 saying "MON" or "Montreal Expos" reaches Washington, whose
 * id it has always been.
 */
const ALIASES: Record<string, string> = {
  mon: "wsh", fla: "mia", flo: "mia", ana: "laa", cal: "laa",
  tb: "tbr", tbd: "tbr", cle: "cle", was: "wsh", wsn: "wsh",
  chn: "chc", cha: "cws", chw: "cws", nyn: "nym", nya: "nyy",
  sln: "stl", sfn: "sf", sdn: "sd", lan: "lad", ana_angels: "laa",
  kca: "kc", oak: "ath", ath: "ath", phi: "phi", ari: "az", az: "az",
};

const normalise = (s: string) => s.trim().toLowerCase().replace(/[^a-z]/g, "");

/** One season's salaries, ranked, with each club joined to its page. */
export async function getSalaries(year: number): Promise<Salary[]> {
  const rows = allRows().filter((r) => r.year === year);
  if (rows.length === 0) return [];

  const clubs = await getClubs().catch(() => []);
  const byKey = new Map<string, number>();
  for (const c of clubs) {
    byKey.set(normalise(c.abbr), c.id);
    byKey.set(normalise(c.name), c.id);
  }
  const clubId = (team: string): number | null => {
    const key = normalise(team);
    return byKey.get(key) ?? byKey.get(ALIASES[key] ?? "") ?? null;
  };

  return rankBySalary(rows).map(
    (r): Salary => ({
      rank: r.rank,
      year: r.year,
      id: r.id,
      name: r.name,
      position: r.position,
      team: r.team,
      teamId: clubId(r.team),
      salary: r.salary,
    }),
  );
}
