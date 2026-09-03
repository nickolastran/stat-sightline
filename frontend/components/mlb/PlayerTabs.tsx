import Link from "next/link";

/*
 * The player's sections. Links rather than local state, the same trade
 * TeamTabs makes: each tab is its own server-rendered payload, so switching
 * is a navigation Next can prefetch and a tab is linkable.
 *
 * Unlike the club's tabs these carry the query string across, because the
 * season and stat group are picked once and meant for whichever section is
 * being read — dropping back to the running year on every tab press is the
 * one thing that makes a year picker useless. The page hands it over rather
 * than the strip reading it, which keeps this on the server with the rest.
 */
export const PLAYER_TABS = [
  { id: "overview", label: "OVERVIEW" },
  { id: "stats", label: "STATS" },
  { id: "bio", label: "BIO" },
  { id: "splits", label: "SPLITS" },
  { id: "gamelog", label: "GAME LOG" },
] as const;

export type PlayerTab = (typeof PLAYER_TABS)[number]["id"];

export const isPlayerTab = (id: string): id is PlayerTab =>
  PLAYER_TABS.some((t) => t.id === id);

export default function PlayerTabs({
  id,
  active,
  query,
}: {
  id: number;
  active: string;
  /** The page's own query string, carried across every tab. */
  query: string;
}) {
  return (
    <nav
      aria-label="Player sections"
      className="flex flex-wrap gap-px border border-line bg-surface p-1"
    >
      {PLAYER_TABS.map((t) => (
        <Link
          key={t.id}
          href={`/player/${id}${t.id === "overview" ? "" : `/${t.id}`}${
            query ? `?${query}` : ""
          }`}
          aria-current={t.id === active ? "page" : undefined}
          className={`border px-2 py-1 text-[11px] tracking-wide ${
            t.id === active
              ? "border-accent bg-accent/15 font-bold text-ink"
              : "border-line text-ink-3 hover:bg-surface-2 hover:text-ink"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
