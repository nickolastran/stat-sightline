import { teamLogo, type Game, type GameSide } from "@/lib/mlb";

/*
 * One game in the scoreboard. `detailed` adds probable pitchers + venue for
 * the games/schedule page; the compact form is used in the dashboard strip.
 * Server component — no interactivity.
 */

function statusTag(g: Game) {
  if (g.state === "Live") {
    const half = g.inningState ? g.inningState.slice(0, 3).toUpperCase() : "";
    return { text: `${half} ${g.inning ?? ""}`.trim(), tone: "live" as const };
  }
  if (g.state === "Final")
    return { text: g.detailedState.toUpperCase(), tone: "final" as const };
  // Preview — show first-pitch time in ET.
  const t = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(g.startTime));
  return { text: `${t} ET`, tone: "pre" as const };
}

function TeamRow({
  s,
  live,
  detailed,
}: {
  s: GameSide;
  live: boolean;
  detailed: boolean;
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
      {detailed && s.probable && (
        <span className="hidden truncate text-[10px] text-ink-3 sm:block">
          {s.probable.name}
        </span>
      )}
      <span
        className={`w-6 text-right text-sm tabular-nums ${
          s.isWinner ? "font-bold text-ink" : live ? "text-ink" : "text-ink-2"
        }`}
      >
        {s.score ?? "—"}
      </span>
    </div>
  );
}

export default function GameCard({
  game,
  detailed = false,
}: {
  game: Game;
  detailed?: boolean;
}) {
  const st = statusTag(game);
  const live = game.state === "Live";
  const tone =
    st.tone === "live"
      ? "text-good"
      : st.tone === "final"
        ? "text-ink-3"
        : "text-accent";

  return (
    <div className="border border-line bg-bg p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className={`text-[10px] tracking-widest ${tone}`}>
          {live && (
            <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-good align-middle" />
          )}
          {st.text}
        </span>
        {detailed && game.venue && (
          <span className="hidden truncate text-[10px] text-ink-3 sm:block">
            {game.venue}
          </span>
        )}
      </div>
      <TeamRow s={game.away} live={live} detailed={detailed} />
      <TeamRow s={game.home} live={live} detailed={detailed} />
    </div>
  );
}
