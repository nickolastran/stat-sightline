import type { Metadata } from "next";
import { Suspense } from "react";
import ChangelogView, { type Release } from "@/components/ChangelogView";

export const metadata: Metadata = {
  title: "Changelog",
  description: "What's new on Stat//Sightline: every release, newest first.",
};

/*
 * Hand-kept, newest first: add a release at the top when something ships.
 * Written for readers, so refactors, data refreshes and fixes nobody saw stay
 * out. Versions are the site's own, grouped by when things went live.
 */
const RELEASES: Release[] = [
  {
    version: "v0.13.0",
    date: "2026-11-12",
    title: "Easier to read, and free agents by what they did.",
    summary:
      "Small text is larger and darker everywhere, the league bar works on phones, board filters survive a refresh, and free agents are ranked by last season's WAR.",
    changes: [
      { kind: "added", text: "Last season's WAR and stat line for every free agent, ranked by WAR.", href: "/free-agents" },
      { kind: "added", text: "Privacy policy, terms of service and this changelog.", href: "/privacy" },
      { kind: "improved", text: "Larger small text, stronger contrast and visible keyboard focus across the site." },
      { kind: "improved", text: "Bigger tap targets in the league bar, and the offseason SCORES links as their own tabs on phones." },
      { kind: "improved", text: "Injury, salary and free agent filters live in the URL, so a refresh or shared link keeps them.", href: "/injuries" },
      { kind: "fixed", text: "The spray chart legend no longer runs HOME RUN into its count." },
    ],
  },
  {
    version: "v0.12.0",
    date: "2026-11-07",
    title: "The offseason: free agents and payrolls.",
    summary:
      "Follow the free agent market as it moves, see what every club pays, and find last fall's games after the World Series ends.",
    changes: [
      { kind: "added", text: "Free agent tracker: every player on the market, with summary and status counts.", href: "/free-agents" },
      { kind: "added", text: "Player salaries and a team payrolls view.", href: "/salaries" },
      { kind: "added", text: "Hitter chips with headshots on the front page.", href: "/" },
      { kind: "improved", text: "After the World Series, the game feed, scoreboard and probables fold under one SCORES tab, with the final on the scoreboard rail." },
      { kind: "fixed", text: "Postseason odds freeze once the games stop instead of drifting.", href: "/playoffs" },
    ],
  },
  {
    version: "v0.11.0",
    date: "2026-10-21",
    title: "Advanced analytics modules and a World Series forecast.",
    summary:
      "New pitcher and batter modules dig into sequencing, swing decisions and bat tracking, and the forecast now covers the World Series.",
    changes: [
      { kind: "added", text: "Pitch sequencing and times through the order on pitcher pages." },
      { kind: "added", text: "Swing decisions and bat tracking on batter pages." },
      { kind: "added", text: "World Series forecast that accounts for handedness.", href: "/playoffs" },
      { kind: "added", text: "Series odds and a pregame matchup edge, with pitch locations in the head-to-head.", href: "/matchup" },
      { kind: "added", text: "Compare two date ranges side by side.", href: "/compare" },
      { kind: "added", text: "Custom queries inside the modules, with filters kept in the URL.", href: "/query" },
      { kind: "added", text: "Playoff stats back to 2017, and prior World Series results." },
      { kind: "improved", text: "Matchup odds use team strength instead of coin flips." },
      { kind: "improved", text: "Redesigned landing page, navbar, playoff page, spray charts and ballpark renders." },
      { kind: "fixed", text: "Hitting movement charts and matchup forecast predictions." },
    ],
  },
  {
    version: "v0.10.0",
    date: "2026-10-16",
    title: "Your team, rolling form and shareable answers.",
    summary:
      "Star a favorite club, follow a player's form over time, and share Ask answers with a link that previews properly.",
    changes: [
      { kind: "added", text: "Favorite team: star a club to pin its game first and filter the stat boards to it." },
      { kind: "added", text: "Rolling-form charts with starter windows and a league-average line." },
      { kind: "added", text: "Pitcher vs. batter matchups, down to the pitch.", href: "/matchup" },
      { kind: "added", text: "Hot and cold streak badges." },
      { kind: "added", text: "Shareable Ask answers with a copy-link button.", href: "/ask" },
      { kind: "added", text: "Link preview images for players, games and Ask answers." },
      { kind: "added", text: "Spray charts and rolling form on the compare page.", href: "/compare" },
      { kind: "improved", text: "Branded 404 and error pages." },
    ],
  },
  {
    version: "v0.9.0",
    date: "2026-10-08",
    title: "Spray charts, zone plots and pitch movement.",
    summary:
      "See where a hitter puts the ball and where a pitcher puts it, with advanced sabermetrics on every player page.",
    changes: [
      { kind: "added", text: "Hitter spray charts drawn on each ballpark." },
      { kind: "added", text: "Zone plots, heat maps and pitch movement charts." },
      { kind: "added", text: "Advanced sabermetrics on player pages." },
      { kind: "added", text: "Playoff gamecast features." },
      { kind: "improved", text: "Sitemap, structured data and page descriptions so the site shows up properly in search." },
      { kind: "fixed", text: "Playoff team slots, search parameters and pitchers of record on the scoreboard." },
    ],
  },
  {
    version: "v0.8.0",
    date: "2026-09-30",
    title: "Playoff odds and a deeper compare.",
    summary:
      "Playoff odds and a matchup predictor arrive for October, and comparing players gets photos, career numbers and your choice of stats.",
    changes: [
      { kind: "added", text: "Playoff odds and a playoff matchup predictor.", href: "/playoffs" },
      { kind: "added", text: "PROJ, PACE and P162 columns in the standings.", href: "/league/standings" },
      { kind: "added", text: "Team leaders, playoff stat leaders and spring training leaders.", href: "/league/teamleaders" },
      { kind: "added", text: "Compare tables with photos, career or current season, and your choice of stats.", href: "/compare" },
      { kind: "added", text: "Qualified players in team stats." },
      { kind: "improved", text: "Playoff box scores, scoring summary and series panels." },
      { kind: "fixed", text: "Team stat positions, game headers and the leaders layout." },
    ],
  },
  {
    version: "v0.7.0",
    date: "2026-09-21",
    title: "Probables, minors, the draft and injuries.",
    summary:
      "Look ahead at who's starting, down into the minors, and across every injury and draft pick.",
    changes: [
      { kind: "added", text: "Probable pitchers for the coming days, with advanced detail.", href: "/league/probables" },
      { kind: "added", text: "Minor league stats.", href: "/minors" },
      { kind: "added", text: "The MLB draft.", href: "/draft" },
      { kind: "added", text: "Every injury in the league.", href: "/injuries" },
      { kind: "added", text: "Custom leaderboards with rookies and CSV downloads.", href: "/stats/custom" },
      { kind: "added", text: "Player splits, projections, recent games and quality starts." },
      { kind: "improved", text: "Team stats you can step through by year." },
      { kind: "fixed", text: "Browser tab titles and player stats." },
    ],
  },
  {
    version: "v0.6.0",
    date: "2026-09-14",
    title: "Sabermetrics, ABS and the playoff bracket.",
    summary:
      "Sabermetric tables, the automated ball-strike challenge board, awards and a first look at the bracket.",
    changes: [
      { kind: "added", text: "Sabermetric tables and WAR on team stats.", href: "/league/teams" },
      { kind: "added", text: "ABS challenge leaderboards.", href: "/league/abs" },
      { kind: "added", text: "Playoff bracket with predictions.", href: "/playoffs" },
      { kind: "added", text: "Game feed: the day's best moments.", href: "/league/gamefeed" },
      { kind: "added", text: "Season and monthly awards, with an award index.", href: "/award" },
      { kind: "added", text: "Rare stats." },
      { kind: "fixed", text: "Career stats, the MVP award layout and team leaders in the game feed." },
    ],
  },
  {
    version: "v0.5.0",
    date: "2026-09-06",
    title: "Live games and player pages.",
    summary:
      "Follow a game pitch by pitch from lineup to final, and open any player for their card, stats and splits.",
    changes: [
      { kind: "added", text: "Gamecast and live game feed with in-game box scores.", href: "/league/scoreboard" },
      { kind: "added", text: "Pregame stats, lineup cards, win probability and home run distances." },
      { kind: "added", text: "Player cards, stats, game logs and career splits." },
      { kind: "added", text: "Compare players.", href: "/compare" },
      { kind: "improved", text: "Faster loading and a new font." },
      { kind: "fixed", text: "Browser compatibility, the schedule, hot zones and the scoreboard." },
    ],
  },
  {
    version: "v0.4.0",
    date: "2026-08-31",
    title: "Team pages.",
    summary: "Every club gets a home: schedule, roster, injuries, transactions and stats.",
    changes: [
      { kind: "added", text: "Team directory, schedules and rosters." },
      { kind: "added", text: "Team injuries and transactions." },
      { kind: "added", text: "Team stats and splits.", href: "/league/teams" },
      { kind: "fixed", text: "Standings and spacing." },
    ],
  },
  {
    version: "v0.3.0",
    date: "2026-08-27",
    title: "Ask, search and the wild card.",
    summary:
      "Ask questions in plain English, search the whole site, and follow the wild card race.",
    changes: [
      { kind: "added", text: "Ask: plain-English questions answered from the Statcast warehouse.", href: "/ask" },
      { kind: "added", text: "Site search.", href: "/" },
      { kind: "added", text: "Wild card standings and past seasons.", href: "/league/wildcard" },
      { kind: "fixed", text: "Standings order, games back and the clinch symbol." },
    ],
  },
  {
    version: "v0.2.0",
    date: "2026-08-11",
    title: "League leaders and the scoreboard bar.",
    summary: "A scoreboard across the top of every page, and the league's leaders in one place.",
    changes: [
      { kind: "added", text: "Scoreboard bar.", href: "/league/scoreboard" },
      { kind: "added", text: "League and stat leaders.", href: "/league/leaders" },
      { kind: "added", text: "Player profiles by year." },
    ],
  },
  {
    version: "v0.1.0",
    date: "2026-07-31",
    title: "Stat//Sightline begins.",
    summary: "The first scoreboard, stats and standings, and the Statcast dashboard.",
    changes: [
      { kind: "added", text: "Scoreboard, player stats and team stats." },
      { kind: "added", text: "Standings.", href: "/league/standings" },
      { kind: "added", text: "The Statcast dashboard.", href: "/dashboard" },
      { kind: "added", text: "Times shown in your time zone." },
    ],
  },
];

export default function ChangelogPage() {
  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="border-x border-line px-4 py-8 sm:px-8">
        <p className="mb-2 text-xs tracking-[0.3em] text-ink-3">CHANGELOG // WHAT&apos;S NEW</p>
        <h1 className="mb-6 text-sm font-bold tracking-widest text-ink">EVERY RELEASE, NEWEST FIRST</h1>
        {/* useSearchParams (the URL-kept filters) needs a boundary on a static page. */}
        <Suspense>
          <ChangelogView releases={RELEASES} />
        </Suspense>
      </section>
    </div>
  );
}
