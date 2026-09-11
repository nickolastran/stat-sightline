/*
 * The league reference sections, shared by the bar that links to them and the
 * route that renders them, so a new section is added in exactly one place.
 * `tab` is the short bar label; `title` is the panel heading on the page.
 *
 * `inBar: false` keeps a section routable without giving it a bar tab of its
 * own — the wild-card race is reached from the standings page instead, since
 * the two are the same table read two ways.
 */
export const LEAGUE_SECTIONS = [
  { id: "scoreboard", tab: "SCOREBOARD", title: "SCOREBOARD" },
  { id: "leaders", tab: "STAT LEADERS", title: "STAT LEADERS" },
  { id: "gamefeed", tab: "GAME FEED", title: "GAME FEED" },
  { id: "probables", tab: "PROBABLES", title: "PROBABLE PITCHERS — TODAY" },
  { id: "standings", tab: "STANDINGS", title: "STANDINGS" },
  { id: "wildcard", tab: "WILD CARD", title: "WILD CARD RACE", inBar: false },
  { id: "teams", tab: "TEAM STATS", title: "TEAM STATISTICS" },
  { id: "players", tab: "PLAYER STATS", title: "PLAYER STATISTICS" },
  { id: "abs", tab: "ABS", title: "ABS CHALLENGES" },
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
  "gamefeed",
  "probables",
  "players",
  "abs",
]);

export const sectionWidth = (id: string) =>
  WIDE.has(id) ? "max-w-[88rem]" : "max-w-7xl";
