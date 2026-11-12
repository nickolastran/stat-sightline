import type { Metadata } from "next";
import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "Changelog",
  description: "What's new on Stat//Sightline, month by month.",
};

/*
 * Hand-kept, newest first: add a line when something ships. Written for
 * readers, so refactors, data refreshes and fixes nobody saw stay out.
 */
const LOG: { month: string; items: string[] }[] = [
  {
    month: "NOVEMBER 2026",
    items: [
      "Free agent tracker: every player on the market, with last season's WAR and stat line, status counts and URL-saved filters.",
      "Salaries: player pay and a team payrolls view.",
      "Offseason scoreboard: the game feed, scoreboard and probables fold under one SCORES tab once the World Series ends, with the final on the scoreboard rail.",
      "Readability pass: larger small text, stronger contrast, visible keyboard focus and bigger tap targets on phones.",
      "Injury, salary and free agent filters now live in the URL, so a refresh or shared link keeps them.",
      "Hitter chips with headshots on the front page.",
      "Postseason odds freeze once the games stop.",
      "Privacy policy, terms of service and this changelog.",
    ],
  },
  {
    month: "OCTOBER 2026",
    items: [
      "Advanced analytics modules: pitch sequencing and times through the order on pitcher pages; swing decisions and bat tracking on batter pages.",
      "World Series forecast, with handedness accounted for.",
      "Matchup forecast: series odds, team strength instead of coin flips, a pregame matchup edge, and pitch locations in the head-to-head.",
      "Compare: two date ranges side by side, plus spray charts and rolling form.",
      "Custom queries inside the modules, with filters kept in the URL.",
      "Playoff stats extended back to 2017, and prior World Series results.",
      "Rolling-form charts with starter windows and a league-average line.",
      "Pitcher vs. batter matchups, and hot/cold streak badges.",
      "Favorite team: star a club to pin its game first and filter the stat boards to it.",
      "Shareable Ask answers with a copy-link button and preview cards.",
      "Pitch movement charts, zone plots and heat maps.",
      "Advanced sabermetrics on player pages.",
      "Link preview images, a sitemap, structured data and page descriptions for search.",
      "Branded 404 and error pages.",
      "Redesigned landing page, navbar, playoff page, spray charts and ballpark renders.",
    ],
  },
  {
    month: "SEPTEMBER 2026",
    items: [
      "Playoff bracket, matchup predictor, series titles and playoff odds.",
      "Playoff gamecast, box scores, scoring summary and series panels.",
      "Projected standings columns: PROJ, PACE and P162.",
      "Hitter spray charts.",
      "Compare players and teams: photos, career or current season, and your choice of stats.",
      "Awards: season awards, monthly awards and the award index.",
      "Game feed with top performers, and the ABS challenge board.",
      "Sabermetric tables, rare stats and WAR on team stats.",
      "Custom leaderboards with rookies and CSV downloads.",
      "Probable pitchers for the coming days, with advanced detail.",
      "Minor league stats, the MLB draft, the full injury list and a first pass at salaries.",
      "Player overview: splits, projections, recent games, quality starts and career splits.",
      "Team stats you can step through by year, with qualified players.",
      "Pregame, live and postgame game pages: lineups, win probability, home run distance and in-game box scores.",
      "Player cards and player stat pages.",
    ],
  },
  {
    month: "AUGUST 2026",
    items: [
      "Team pages: directory, schedule, roster, injuries, transactions, stats and splits.",
      "Ask: plain-English questions answered from the Statcast warehouse.",
      "Standings with wild card and past seasons.",
      "Site search and footer.",
      "Scoreboard bar, league leaders and stat leaders.",
    ],
  },
  {
    month: "JULY 2026",
    items: [
      "Scoreboard, player and team statistics, standings and the first dashboard.",
      "Times shown in your time zone.",
    ],
  },
  {
    month: "JUNE 2026",
    items: ["Stat//Sightline starts."],
  },
];

export default function ChangelogPage() {
  return (
    <DocPage kicker="CHANGELOG // WHAT'S NEW" title="CHANGELOG">
      {LOG.map((m) => (
        <section key={m.month} className="space-y-2">
          <h2 className="text-[11px] font-bold tracking-[0.2em] text-ink">{m.month}</h2>
          <ul className="list-disc space-y-1 pl-5 marker:text-ink-3">
            {m.items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </section>
      ))}
    </DocPage>
  );
}
