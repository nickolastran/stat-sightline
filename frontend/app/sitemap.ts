import type { MetadataRoute } from "next";
import { LEAGUE_SECTIONS } from "@/lib/leagueSections";
import { ADV_VIEWS } from "@/lib/advanced";
import { AWARD_PAGES, mlb, mlbTeams, seasonOf, teamHref, todayPT } from "@/lib/mlb";
import { SITE_URL } from "@/lib/site";

/*
 * Every page worth a search result: the fixed boards, the thirty clubs, and
 * everyone who has played in the majors this season. Games are left out —
 * thousands a year, each one stale by morning, and every one is linked from
 * the scoreboard and the team schedules anyway.
 *
 * Rebuilt daily. The clubs and players come off live MLB requests; if those
 * fail the fixed pages still go out rather than the whole map.
 */
export const revalidate = 86400;

const STATIC = [
  "/",
  "/playoffs",
  "/injuries",
  "/minors",
  "/draft",
  "/salaries",
  "/award",
  "/compare",
  "/compare/teams",
  ...LEAGUE_SECTIONS.map((s) => `/league/${s.id}`),
  ...ADV_VIEWS.map((v) => `/stats/${v.id}`),
  ...AWARD_PAGES.map((a) => `/award/${a.id}`),
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const season = seasonOf(todayPT());
  const [teams, players] = await Promise.all([
    mlbTeams().catch(() => [] as any[]),
    mlb(`/sports/1/players?season=${season}`, 86400)
      .then((d) => (d.people ?? []) as any[])
      .catch(() => [] as any[]),
  ]);
  const paths = [
    ...STATIC,
    ...teams.map((t) => teamHref(t.id, t.name)),
    ...players.map((p) => `/player/${p.id}`),
  ];
  return paths.map((p) => ({ url: `${SITE_URL}${p === "/" ? "" : p}` }));
}
