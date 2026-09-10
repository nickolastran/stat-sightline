import Link from "next/link";
import PlayerLink from "@/components/mlb/PlayerLink";
import { teamLogo } from "@/lib/mlb";
import type { TopCard } from "@/lib/advanced";

/*
 * Who leads each advanced column, five deep — the page that answers "who is
 * best at this" for the figures no standard leaderboard ranks.
 *
 * Same card as the stat-leader boards, in the same grid, so the two read as
 * one idea at two levels of derivation. A card whose column lives on one of
 * our own boards links into it already sorted; the fielding cards have no
 * board of their own here and are the whole view.
 */

/** The bands the cards fill in, in the order they appear. */
const ORDER = ["BATTING", "PITCHING", "FIELDING", "CATCHER"];

function Card({ card }: { card: TopCard }) {
  return (
    <div className="self-start border border-line bg-bg">
      <h3
        title={card.title}
        className="flex items-baseline gap-1.5 border-b border-line px-3 py-1.5 text-[10px] tracking-[0.2em]"
      >
        <span className="text-ink-3">{card.group}</span>
        <span className="text-ink-2">{card.label}</span>
      </h3>
      <ol>
        {card.leaders.map((l) => (
          <li
            key={l.id}
            className="flex items-center gap-2 border-b border-grid px-3 py-1.5 text-xs last:border-b-0"
          >
            <span className="w-4 text-right text-[10px] text-ink-3 tabular-nums">
              {l.rank}
            </span>
            {l.teamId !== null && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={teamLogo(l.teamId)}
                alt=""
                width={16}
                height={16}
                loading="lazy"
                className="h-4 w-4 shrink-0"
              />
            )}
            <span className="min-w-0 flex-1 truncate text-ink-2">
              <PlayerLink id={l.id} headshot={false}>
                {l.name}
              </PlayerLink>
            </span>
            <span className="shrink-0 text-right font-bold text-ink tabular-nums">
              {l.value}
            </span>
          </li>
        ))}
      </ol>
      {card.href && (
        <Link
          href={card.href}
          className="flex items-center justify-center gap-1 border-t border-line py-1 text-[10px] tracking-[0.2em] text-ink-3 hover:text-ink"
        >
          COMPLETE LIST →
        </Link>
      )}
    </div>
  );
}

export default function TopPerformers({ cards }: { cards: TopCard[] }) {
  if (cards.length === 0)
    return (
      <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
        NOTHING TRACKED FOR THIS SEASON YET
      </p>
    );

  const sorted = [...cards].sort(
    (a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group),
  );

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {sorted.map((c) => (
        <Card key={c.key} card={c} />
      ))}
    </div>
  );
}
