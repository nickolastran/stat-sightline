import { Table, Row, Empty } from "@/components/ui/StatTable";
import PlayerLink from "@/components/mlb/PlayerLink";
import { teamLogo, type TeamStatCol } from "@/lib/mlb";
import {
  DAY_HITTING_COLS,
  DAY_PITCHING_COLS,
  type DayLine,
  type FeedBoard,
  type GameFeed as Feed,
} from "@/lib/gamefeed";

/*
 * One day's feed: the four tracked boards across the top — the figures that
 * only exist pitch by pitch — then the day's best games with the bat and on
 * the mound. The tracked boards lead because they are what a season table
 * can't tell you; the two day lines are the same shape of table the player
 * pages use, so a reader already knows how to read them.
 */

/** One line of a tracked board: rank, player, what produced it, the figure. */
function BoardRow({ rank, row }: { rank: number; row: FeedBoard["rows"][number] }) {
  return (
    <li className="flex items-center gap-2 border-b border-grid px-3 py-1.5 text-xs last:border-b-0">
      <span className="w-4 text-right text-[10px] text-ink-3 tabular-nums">
        {rank}
      </span>
      <span className="min-w-0 flex-1 truncate text-ink-2">
        <PlayerLink id={row.personId}>{row.name}</PlayerLink>
      </span>
      {row.detail && (
        <span className="hidden shrink-0 truncate text-[10px] text-ink-3 sm:block sm:max-w-[9rem]">
          {row.detail}
        </span>
      )}
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

/** A day board — the same columns for every row, ranked, ordered by the first
 *  figure. The club rides as its mark rather than a name: eleven columns of
 *  numbers leave no room for "Arizona Diamondbacks". */
function DayTable({
  title,
  columns,
  lines,
}: {
  title: string;
  columns: TeamStatCol[];
  lines: DayLine[];
}) {
  return (
    <div className="space-y-1">
      <h3 className="text-[10px] tracking-[0.2em] text-ink-2">{title}</h3>
      <Table
        /* The long form of each abbreviation rides on the head cell, so the
           tab needs no glossary of its own under two tables of initials. */
        head={[
          "",
          "PLAYER",
          ...columns.map((c) => (
            <span key={c.key} title={c.title}>
              {c.label}
            </span>
          )),
        ]}
        align="rl"
        maxHeight="30rem"
      >
        {lines.length === 0 ? (
          <Empty what="NO GAMES PLAYED" cols={columns.length + 2} />
        ) : (
          lines.map((l, i) => (
            <Row key={l.personId}>
              <td className="px-3 py-1.5 text-right text-[10px] text-ink-3 tabular-nums">
                {i + 1}
              </td>
              <td className="px-3 py-1.5 text-xs">
                <span className="flex min-w-0 items-center gap-1.5">
                  {!!l.teamId && (
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
                  <PlayerLink id={l.personId} headshot={false}>
                    {l.name}
                  </PlayerLink>
                </span>
              </td>
              {l.cells.map((v, c) => (
                <td
                  key={columns[c].key}
                  className={`px-3 py-1.5 text-right text-xs tabular-nums ${
                    c === 0 ? "font-bold text-ink" : ""
                  }`}
                >
                  {v}
                </td>
              ))}
            </Row>
          ))
        )}
      </Table>
    </div>
  );
}

export default function GameFeed({ feed }: { feed: Feed }) {
  if (feed.games === 0 && feed.hitters.length === 0)
    return (
      <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
        NOTHING PLAYED YET ON THIS DAY
      </p>
    );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {feed.boards.map((b) => (
          <Board key={b.code} board={b} />
        ))}
      </div>
      <DayTable
        title="TOP HITTERS"
        columns={DAY_HITTING_COLS}
        lines={feed.hitters}
      />
      <DayTable
        title="TOP PITCHERS"
        columns={DAY_PITCHING_COLS}
        lines={feed.pitchers}
      />
    </div>
  );
}
