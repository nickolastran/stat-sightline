/*
 * The league reference sections, shared by the bar that links to them and the
 * route that renders them, so a new section is added in exactly one place.
 * `tab` is the short bar label; `title` is the panel heading on the page;
 * `description` is what a search result says under it.
 *
 * `inBar: false` keeps a section routable without giving it a bar tab of its
 * own — the wild-card race is reached from the standings page instead, since
 * the two are the same table read two ways.
 */
export const LEAGUE_SECTIONS = [
  { id: "gamefeed", tab: "GAME FEED", title: "GAME FEED", description: "The best of the day in MLB — the hardest-hit balls, longest homers, fastest pitches, most whiffs and the swings that turned games." },
  /* Set in mixed case, like the probables board: these two are read as a
     heading over a slate of games rather than as a shouted section label. */
  { id: "scoreboard", tab: "SCOREBOARD", title: "Scoreboard", description: "Live MLB scores for every game today, with box scores, starting pitchers and final lines." },
  { id: "probables", tab: "PROBABLES", title: "PROBABLE PITCHERS — TODAY", description: "MLB probable starting pitchers for today and the next few days." },
  { id: "standings", tab: "STANDINGS", title: "STANDINGS", description: "MLB standings by division — records, games back, run differential, streaks and last ten." },
  { id: "wildcard", tab: "WILD CARD", title: "WILD CARD RACE", inBar: false, description: "The MLB wild-card race in each league — games back of the last berth and elimination numbers." },
  { id: "leaders", tab: "STAT LEADERS", title: "STAT LEADERS", description: "MLB stat leaders in batting and pitching — home runs, average, ERA, strikeouts and more." },
  { id: "teamleaders", tab: "TEAM LEADERS", title: "TEAM LEADERS", description: "Each MLB club's leaders in the main batting and pitching categories." },
  { id: "players", tab: "PLAYER STATS", title: "PLAYER STATISTICS", description: "Sortable MLB player stats — batting, pitching and fielding, by season." },
  { id: "teams", tab: "TEAM STATS", title: "TEAM STATISTICS", description: "Sortable MLB team stats — batting, pitching and fielding for all thirty clubs, by season." },
  { id: "abs", tab: "ABS", title: "ABS CHALLENGES", description: "Automated ball-strike (ABS) challenge leaderboards — who challenges, how often, and how often they win." },
] as const;

export type LeagueSection = (typeof LEAGUE_SECTIONS)[number]["id"];

export const findSection = (id: string) =>
  LEAGUE_SECTIONS.find((s) => s.id === id);

/**
 * The standings page and the wild-card race, as the pair of buttons each of
 * them shows above its table. They are separate routes rather than one view
 * flag because each is its own MLB payload, fetched on the server.
 */
export const STANDINGS_VIEWS = [
  { id: "standings", label: "STANDINGS" },
  { id: "wildcard", label: "WILD CARD" },
] as const;

/*
 * How much room across a section gets. The ones that lay their content out in
 * cards rather than a table — the day's slate twice over, the six leader
 * boards, the day's tracked figures — fit another column of them on a wide
 * screen, where a table would only stretch its whitespace. Both the page and
 * its loading placeholder read this, so the skeleton lands at the width the
 * content arrives at.
 */
const WIDE = new Set([
  "scoreboard",
  "leaders",
  "teamleaders",
  "gamefeed",
  "probables",
  "players",
  "abs",
]);

export const sectionWidth = (id: string) =>
  WIDE.has(id) ? "max-w-[88rem]" : "max-w-7xl";
