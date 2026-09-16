import PlayerLink from "@/components/mlb/PlayerLink";
import type { FeedBoard, GameFeed as Feed } from "@/lib/gamefeed";

/*
 * One day's feed: eight boards of five, each the best of the day at one
 * thing. Nothing but the player and the figure — what a ball went for or
 * which pitch it was is a detail of one swing, and a board of five is read
 * down its numbers.
 */

/** One line of a board: rank, player, the figure. */
function BoardRow({ rank, row }: { rank: number; row: FeedBoard["rows"][number] }) {
  return (
    <li className="flex items-center gap-2 border-b border-grid px-3 py-1.5 text-xs last:border-b-0">
      <span className="w-4 text-right text-[10px] text-ink-3 tabular-nums">
        {rank}
      </span>
      <span className="min-w-0 flex-1 truncate text-ink-2">
        <PlayerLink id={row.personId}>{row.name}</PlayerLink>
      </span>
      <span className="w-20 text-right font-bold text-ink tabular-nums">
        {row.value}
      </span>
    </li>
  );
}

function Board({ board }: { board: FeedBoard }) {
  return (
    <div className="self-start border border-line bg-bg">
      <h3 className="border-b border-line px-3 py-1.5 text-[10px] tracking-[0.2em] text-ink-2">
        {board.label}
      </h3>
      {board.rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-ink-3">NOT TRACKED</p>
      ) : (
        <ol>
          {board.rows.map((r, i) => (
            <BoardRow key={r.personId} rank={i + 1} row={r} />
          ))}
        </ol>
      )}
    </div>
  );
}

export default function GameFeed({ feed }: { feed: Feed }) {
  if (feed.games === 0 && feed.boards.every((b) => b.rows.length === 0))
    return (
      <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
        NOTHING PLAYED YET ON THIS DAY
      </p>
    );

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {feed.boards.map((b) => (
        <Board key={b.code} board={b} />
      ))}
    </div>
  );
}
