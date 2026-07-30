/*
 * The league reference sections, shared by the bar that links to them and the
 * route that renders them, so a new section is added in exactly one place.
 * `tab` is the short bar label; `title` is the panel heading on the page.
 */
export const LEAGUE_SECTIONS = [
  { id: "leaders", tab: "STAT LEADERS", title: "STAT LEADERS" },
  { id: "probables", tab: "PROBABLES", title: "PROBABLE PITCHERS — TODAY" },
  { id: "standings", tab: "STANDINGS", title: "STANDINGS" },
  { id: "teams", tab: "TEAM STATS", title: "TEAM STATISTICS" },
] as const;

export type LeagueSection = (typeof LEAGUE_SECTIONS)[number]["id"];

export const findSection = (id: string) =>
  LEAGUE_SECTIONS.find((s) => s.id === id);
