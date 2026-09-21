import Link from "next/link";
import PlayerLink from "@/components/mlb/PlayerLink";
import { teamLogo, type Game, type GameSide } from "@/lib/mlb";
import GameStatus from "@/components/mlb/GameStatus";

/*
 * One game in the scoreboard.
 *
 * Three sizes of the same card. The compact one is the dashboard strip;
 * `detailed` adds probables, venue and the runs-hits-errors line a played
 * game is read by; `full` is the scoreboard grid, which also names the
 * pitchers of record and carries its own way into the game.
 *
 * `full` is what owns links of its own, so it is a separate flag rather than
 * more of `detailed`: the places that wrap the whole card in one link — the
 * strip, a club's next game — would nest anchors inside it.
 */

/** The line-score columns — one width for all three, so R, H and E divide the
 *  right of the card evenly and each figure sits under its own head. */
const FIG = "w-7 shrink-0 text-center tabular-nums";

function TeamRow({
  s,
  live,
  detailed,
  upcoming,
  line,
}: {
  s: GameSide;
  live: boolean;
  detailed: boolean;
  /** First pitch is still ahead, so an unnamed starter is one still to come. */
  upcoming: boolean;
  /** The game has a line score — hits and errors read beside the runs. */
  line: boolean;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={teamLogo(s.id)}
        alt=""
        width={20}
        height={20}
        className="h-5 w-5 shrink-0"
      />
      <span
        className={`min-w-0 flex-1 truncate text-xs ${
          s.isWinner ? "font-bold text-ink" : "text-ink-2"
        }`}
      >
        {s.abbr !== "—" ? s.abbr : s.name}
        {s.wins !== null && (
          <span className="ml-1.5 text-[10px] text-ink-3">
            {s.wins}-{s.losses}
          </span>
        )}
      </span>
      {/* Only a game still to come announces a starter: once the first pitch
          is thrown there is nothing left to announce, and a played game needs
          the room for its line score. */}
      {detailed && upcoming && (
        <span className="hidden truncate text-[10px] text-ink-3 sm:block">
          {s.probable?.name ?? "TBA"}
        </span>
      )}
      <span
        className={`${line ? FIG : "w-6 text-right tabular-nums"} text-sm ${
          s.isWinner ? "font-bold text-ink" : live ? "text-ink" : "text-ink-2"
        }`}
      >
        {s.score ?? "—"}
      </span>
      {line && (
        <>
          <span className={`${FIG} text-xs text-ink-2`}>{s.hits ?? "—"}</span>
          <span className={`${FIG} text-xs text-ink-3`}>{s.errors ?? "—"}</span>
        </>
      )}
    </div>
  );
}

/** Who won it, lost it and saved it, with the line each carries. */
function Decisions({
  game,
  lines,
}: {
  game: Game;
  lines?: Map<string, string>;
}) {
  /* All three slots, whether or not they were earned: a game nobody saved
     keeps the row empty rather than pulling the buttons up the card, so every
     card in the grid reads on the same lines. */
  const arms = [
    ["WIN", game.decisions.winner],
    ["LOSS", game.decisions.loser],
    ["SAVE", game.decisions.save],
  ] as const;
  /* A game with no pitcher of record at all — one still to be played — shows
     no block; the buttons hold the floor of the card on their own. */
  if (!arms.some(([, who]) => who)) return null;

  return (
    <div className="mt-1.5 space-y-1 border-t border-grid pt-1.5">
      {arms.map(([role, who]) => (
        <div key={role} className="flex h-6 items-center gap-2 text-[11px]">
          <span className="w-9 shrink-0 text-[9px] tracking-[0.15em] text-ink-3">
            {who ? role : ""}
          </span>
          {who && (
            <>
              <span className="min-w-0 truncate text-ink-2">
                <PlayerLink id={who.id}>{who.name}</PlayerLink>
              </span>
              <span className="tabular-nums text-ink-3">
                {lines?.get(`${game.pk}:${who.id}`) ?? ""}
              </span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

const BUTTON =
  "flex-1 border border-line px-2 py-1 text-center text-[10px] tracking-[0.15em] text-ink-2 hover:border-accent hover:text-ink";

export default function GameCard({
  game,
  detailed = false,
  full = false,
  lines,
  className = "",
}: {
  game: Game;
  detailed?: boolean;
  /** The scoreboard card: decisions and the two ways into the game. */
  full?: boolean;
  /** Each pitcher of record's line, keyed `${gamePk}:${pitcherId}`. */
  lines?: Map<string, string>;
  className?: string;
}) {
  const live = game.state === "Live";
  const upcoming = game.state === "Preview";
  /* Hits and errors only exist once somebody has batted. */
  const line =
    detailed && !upcoming && (game.away.hits !== null || game.home.hits !== null);

  return (
    <div
      className={`flex h-full flex-col border border-line bg-bg p-2 ${className}`}
    >
      <div className="mb-0.5 flex items-center justify-between gap-2">
        <GameStatus game={game} />
        {/* The scoreboard card has no room for the park: its own page names
            it, and the line score and the pitchers are what is read here. */}
        {detailed && !full && game.venue && (
          <span className="hidden truncate text-[10px] text-ink-3 sm:block">
            {game.venue}
          </span>
        )}
      </div>
      {line && (
        <div className="flex items-center gap-2 text-[9px] leading-none tracking-[0.15em] text-ink-3">
          <span className="flex-1" />
          {["R", "H", "E"].map((h) => (
            <span key={h} className={FIG}>
              {h}
            </span>
          ))}
        </div>
      )}
      <TeamRow
        s={game.away}
        live={live}
        detailed={detailed}
        upcoming={upcoming}
        line={line}
      />
      <TeamRow
        s={game.home}
        live={live}
        detailed={detailed}
        upcoming={upcoming}
        line={line}
      />
      {full && (
        <>
          <Decisions game={game} lines={lines} />
          {/* `mt-auto`: on a row of cards of uneven height — a game still to
              come beside one that went twelve — the buttons still land on the
              same line. */}
          <div className="mt-auto flex gap-2 pt-2">
            <Link href={`/game/${game.pk}?tab=gamecast`} className={BUTTON}>
              GAMECAST
            </Link>
            <Link href={`/game/${game.pk}?tab=box`} className={BUTTON}>
              BOX SCORE
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
