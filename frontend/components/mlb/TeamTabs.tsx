import Link from "next/link";
import { teamHref } from "@/lib/mlb";

/*
 * The club's sections. Links rather than local state: each tab is its own
 * server-rendered payload, so switching is a navigation Next can prefetch and
 * a tab is linkable — the same trade StandingsViews makes.
 */
export const TEAM_TABS = [
  { id: "home", label: "HOME" },
  { id: "schedule", label: "SCHEDULE" },
  { id: "stats", label: "STATS" },
  { id: "roster", label: "ROSTER" },
  { id: "splits", label: "SPLITS" },
  { id: "injuries", label: "INJURIES" },
  { id: "transactions", label: "TRANSACTIONS" },
] as const;

export type TeamTab = (typeof TEAM_TABS)[number]["id"];

export const isTeamTab = (id: string): id is TeamTab =>
  TEAM_TABS.some((t) => t.id === id);

export default function TeamTabs({
  id,
  name,
  active,
}: {
  id: number;
  /** The club's name, which rides along in every tab's URL. */
  name: string;
  active: string;
}) {
  return (
    <nav
      aria-label="Team sections"
      className="flex flex-wrap gap-px border border-line bg-surface p-1"
    >
      {TEAM_TABS.map((t) => (
        <Link
          key={t.id}
          href={teamHref(id, name, t.id === "home" ? "" : t.id)}
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
