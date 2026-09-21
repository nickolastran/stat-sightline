/*
 * The injury report — every club's injured players, in one board.
 *
 * Two feeds, because neither answers it alone. A club's 40-man roster says
 * who is hurt and which list they are on, but never why; the transaction log
 * carries the reason ("Right forearm inflammation") in the sentence after the
 * placement. So the roster is the truth about who is out, and the log is
 * read only to put a reason and a date against a name already on it.
 *
 * Both are fetched per club rather than league-wide: a season of every club's
 * transactions in one payload is several megabytes, which is over Next's data
 * cache ceiling and so would be re-fetched on every request.
 */
import { getClubs, mlb, seasonOf, todayPT } from "@/lib/mlb";

export interface Injury {
  id: number;
  name: string;
  position: string;
  teamId: number;
  team: string;
  abbr: string;
  /** "Injured 60-Day", "Injured - Full Season" — the list, as MLB names it. */
  status: string;
  /** "Right forearm inflammation", or "" where the log doesn't say. */
  note: string;
  /** The date of the placement, YYYY-MM-DD, or "". */
  since: string;
}

/** A roster status that means hurt — every list MLB spells "Injured …". */
export const isInjured = (description: string): boolean =>
  description.toLowerCase().includes("injured");

/**
 * The reason, out of a transaction line. MLB writes the move as one sentence
 * and the injury as the next one:
 *
 *   "… placed RHP Matt Waldron on the 15-day injured list retroactive to
 *    September 5, 2026. Chest inflammation."
 *
 * An activation has no second sentence, and leaves no note behind.
 */
export const injuryNote = (description: string): string =>
  description
    .split(/\.\s+/)
    .slice(1)
    .join(". ")
    .replace(/\.$/, "")
    .trim();

/**
 * What one club's transaction log says about each of its injured players —
 * the most recent placement, since a transfer from the 15-day to the 60-day
 * restates the same injury later.
 *
 * Activations are skipped: they carry no reason, and a player the roster
 * still lists as hurt has been placed again since.
 */
export function noteMap(transactions: any[]): Map<number, { note: string; since: string }> {
  const notes = new Map<number, { note: string; since: string }>();
  for (const t of transactions) {
    const description: string = t.description ?? "";
    const id: number | undefined = t.person?.id;
    if (!id || !/injured list/i.test(description)) continue;
    if (!/\b(placed|transferred)\b/i.test(description)) continue;
    const since: string = t.date ?? t.effectiveDate ?? "";
    const held = notes.get(id);
    if (held && held.since > since) continue;
    notes.set(id, { note: injuryNote(description), since });
  }
  return notes;
}

/** One club's injured players, off its roster and its own transaction log. */
export function clubInjuries(
  club: { id: number; name: string; abbr: string },
  roster: any[],
  transactions: any[],
): Injury[] {
  const notes = noteMap(transactions);
  return roster
    .filter((r) => isInjured(r.status?.description ?? ""))
    .map((r): Injury => {
      const found = notes.get(r.person?.id) ?? { note: "", since: "" };
      return {
        id: r.person?.id ?? 0,
        name: r.person?.fullName ?? "—",
        position: r.position?.abbreviation ?? "",
        teamId: club.id,
        team: club.name,
        abbr: club.abbr,
        status: r.status?.description ?? "—",
        note: found.note,
        since: found.since,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Every club's injured players. A club whose feed doesn't answer contributes
 * nothing rather than taking the board down with it — 29 clubs' injuries is a
 * report, and one empty club is visible as an empty club.
 */
export async function getInjuries(): Promise<Injury[]> {
  const clubs = await getClubs();
  const season = seasonOf(todayPT());
  const [rosters, logs] = await Promise.all([
    Promise.all(
      clubs.map((c) =>
        mlb(`/teams/${c.id}/roster?rosterType=40Man`, 1800).catch(() => null),
      ),
    ),
    Promise.all(
      clubs.map((c) =>
        mlb(
          `/transactions?teamId=${c.id}&startDate=${season}-01-01&endDate=${todayPT()}`,
          3600,
        ).catch(() => null),
      ),
    ),
  ]);
  /* Clubs keep the order getClubs sorts them into — east to west down each
     league, the way every board on the site reads them. */
  return clubs.flatMap((c, i) =>
    clubInjuries(c, rosters[i]?.roster ?? [], logs[i]?.transactions ?? []),
  );
}
