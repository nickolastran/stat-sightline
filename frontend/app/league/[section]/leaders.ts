"use server";

import {
  getStatLeaders,
  pickLeaderOrder,
  pickLeaderStat,
  pickPlayerGameType,
  seasonOf,
  todayPT,
  FIRST_SEASON,
  LEADER_LEAGUES,
  LEADER_POSITIONS,
  type StatGroup,
  type StatLeaderRow,
} from "@/lib/mlb";

/*
 * The rest of the player board, for the table's own SHOW ALL — appended in
 * place rather than re-fetched as a whole page, so the rows already read stay
 * where they are.
 *
 * Everything is re-checked here rather than trusted from the caller: an action
 * is a public endpoint, and these values go straight into an upstream URL.
 */
export async function moreStatLeaders(q: {
  season: number;
  group: string;
  type: string;
  stat: string;
  league: string;
  position: string;
  order?: string;
  offset: number;
  limit: number;
}): Promise<StatLeaderRow[]> {
  const current = seasonOf(todayPT());
  const season =
    Number.isInteger(q.season) && q.season >= FIRST_SEASON && q.season <= current
      ? q.season
      : current;
  const group: StatGroup =
    q.group === "pitching" || q.group === "fielding" ? q.group : "hitting";
  const inList = (raw: string, options: { value: string }[]) =>
    options.some((o) => o.value === raw) ? raw : "all";

  const { rows } = await getStatLeaders({
    season,
    group,
    gameType: pickPlayerGameType(q.type),
    stat: pickLeaderStat(q.stat, group),
    league: inList(q.league, LEADER_LEAGUES),
    position: inList(q.position, LEADER_POSITIONS),
    order: pickLeaderOrder(q.order),
    limit: Math.min(Math.max(Math.trunc(q.limit) || 0, 1), 1000),
    offset: Math.min(Math.max(Math.trunc(q.offset) || 0, 0), 2000),
  });
  return rows;
}
