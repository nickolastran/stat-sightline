import Link from "next/link";
import MetricCard from "@/components/ui/MetricCard";
import { getPlayoffOdds } from "@/lib/api";
import { getArsenalBoards, getSideMix, lineupEdge, sideOf, type SideMix } from "@/lib/matchupEdge";
import {
  gameDay,
  getArmIdentities,
  getStandings,
  getTeamRoster,
  type Game,
  type GameSide,
  type StandingRow,
} from "@/lib/mlb";
import type { PostSeries } from "@/lib/playoffs";
import {
  baseOdds,
  centered,
  gameOdds,
  projectRotation,
  REGRESS_GAMES,
  seriesForecast,
  strengthOf,
  type Start,
  type Starter,
} from "@/lib/worldSeries";

/*
 * The WORLD SERIES tab: the series called game by game off lib/worldSeries —
 * each club's run-based strength, the projected (or announced) starters, and
 * how each lineup projects against the other side's starter by pitch mix.
 * Every source but MLB's schedule degrades on its own: no standings is no
 * call, no arsenal board is no starter swing, no simulation is no cross-check.
 *
 * Once a game is final the series is called twice: as it stands, finals
 * counted as won and lost, and as it was called before Game 1 — the same
 * model with no results and every starter projected, since who actually
 * started is hindsight too. The two sit side by side so the call can be
 * read against what happened.
 *
 * ponytail: "before" is recomputed off today's inputs (season boards, active
 * rosters), not a stored snapshot from the eve of Game 1. Snapshot it then if
 * the two drift apart enough to matter.
 */

/** ".331", "+.018" — rates the way a box score writes them. */
const rate = (v: number) => v.toFixed(3).replace(/^(-?)0\./, "$1.");
const signed = (v: number) => (v >= 0 ? "+" : "") + rate(v);
const pct = (v: number) => `${(100 * v).toFixed(1)}%`;

/** A club's starts this October, off every series it played. */
const startsFor = (series: PostSeries[], id: number): Start[] =>
  series
    .flatMap((s) => s.games)
    .filter((g) => g.state === "Final")
    .flatMap((g) => {
      const side = g.home.id === id ? g.home : g.away.id === id ? g.away : null;
      return side?.probable && g.date
        ? [{ id: side.probable.id, name: side.probable.name, date: g.date }]
        : [];
    });

function StarterName({ s }: { s: Starter | null }) {
  if (!s) return <span className="text-ink-3">TBD</span>;
  return (
    <Link
      href={`/player/${s.id}`}
      className={s.announced ? "font-bold text-ink hover:text-accent" : "text-ink-2 hover:text-accent"}
    >
      {s.name}
      {!s.announced && <span className="ml-1 text-[9px] text-ink-3">PROJ</span>}
    </Link>
  );
}

export default async function WorldSeriesForecast({
  season,
  series,
}: {
  season: number;
  series: PostSeries[];
}) {
  const ws = series.find((s) => s.round === "WS");
  const [divisions, boards, odds, homeRoster, awayRoster] = await Promise.all([
    getStandings(season, "R").catch(() => []),
    getArsenalBoards(season).catch(() => null),
    getPlayoffOdds(season).catch(() => null),
    ws ? getTeamRoster(ws.home.id, season, "active") : [],
    ws ? getTeamRoster(ws.away.id, season, "active") : [],
  ]);
  const clubs = divisions.flatMap((d) => d.teams);
  const H = ws && clubs.find((t) => t.id === ws.home.id);
  const A = ws && clubs.find((t) => t.id === ws.away.id);
  if (!ws || !H || !A)
    return (
      <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
        THE WORLD SERIES FORECAST OPENS ONCE BOTH PENNANTS ARE WON
      </p>
    );

  /* "Home"/"away" below are the Game 1 sides: home field in the series. */
  const games = ws.games.slice(0, ws.best);
  const dates = games.map((g) => g.date ?? g.startTime.slice(0, 10));
  /** A club's starter each game: MLB's probables where named, or — for the
   *  pre-series call — every one projected. */
  const starterOf = (club: GameSide, named: boolean) =>
    projectRotation(
      startsFor(series.filter((s) => s !== ws), club.id),
      dates,
      named ? games.map((g) => (g.home.id === club.id ? g.home : g.away).probable) : [],
    );
  const homeSP = starterOf(ws.home, true);
  const awaySP = starterOf(ws.away, true);
  /* Once a game is final, the call from before Game 1 is worth keeping. */
  const started = games.some((g) => g.state === "Final");
  const homePre = started ? starterOf(ws.home, false) : [];
  const awayPre = started ? starterOf(ws.away, false) : [];
  /* Each starter's hand and mix by batter side, once a starter; a miss on
     either reads his whole-season mix. */
  const starterIds = [
    ...new Set([...homeSP, ...awaySP, ...homePre, ...awayPre].flatMap((s) => (s ? [s.id] : []))),
  ];
  const [arms, mixes] = await Promise.all([
    getArmIdentities(starterIds),
    Promise.all(starterIds.map((id) => getSideMix(id, season).catch(() => null))),
  ]);
  const mixOf = new Map<number, SideMix | null>(starterIds.map((id, i) => [id, mixes[i]]));
  const hitters = (roster: typeof homeRoster) => roster.filter((r) => r.posType !== "Pitcher");
  /** A lineup's xwOBA over the league against a starter; 0 off the board. */
  const over = (sp: Starter | null, lineup: typeof homeRoster) => {
    const mix = sp && mixOf.get(sp.id);
    const platoon = mix && {
      mix,
      sides: Object.fromEntries(lineup.map((r) => [r.id, sideOf(r.bats, arms[sp.id]?.throws)])),
    };
    const e = sp && boards ? lineupEdge(boards, sp.id, lineup.map((r) => r.id), platoon) : null;
    return e ? { proj: e.proj, over: e.proj - e.league } : null;
  };

  const strength = Object.fromEntries(
    [H, A].map((t) => [t.id, strengthOf(t.runsScored, t.runsAllowed, t.wins + t.losses)]),
  );
  /** The series called game by game off one pair of rotations; `played`
   *  counts the finals as decided, where the pre-series call reads none. */
  const callSeries = (hSPs: (Starter | null)[], aSPs: (Starter | null)[], played: boolean) => {
    /* Each series side's lineup against the other's starter, game by game,
       then read against the whole rotation it faces. */
    const homeBats = aSPs.map((sp) => over(sp, hitters(homeRoster)));
    const awayBats = hSPs.map((sp) => over(sp, hitters(awayRoster)));
    const homeSwing = centered(homeBats.map((b) => b?.over ?? null));
    const awaySwing = centered(awayBats.map((b) => b?.over ?? null));

    const rows = games.map((g: Game, i) => {
      /* Each game's own home club: the series sides swap parks 2-3-2. */
      const atHome = g.home.id === ws.home.id;
      const [hSP, aSP] = atHome ? [hSPs[i], aSPs[i]] : [aSPs[i], hSPs[i]];
      const [hitHome, hitAway] = atHome ? [homeBats[i], awayBats[i]] : [awayBats[i], homeBats[i]];
      const pHome = gameOdds(
        baseOdds(strength[g.home.id], strength[g.away.id]),
        atHome ? homeSwing[i] : awaySwing[i],
        atHome ? awaySwing[i] : homeSwing[i],
      );
      /* The series side's chance this game — fixed once it's final. */
      const pSeriesHome =
        played && g.state === "Final"
          ? Number((atHome ? g.home : g.away).isWinner)
          : atHome ? pHome : 1 - pHome;
      return { g, i, atHome, hSP, aSP, hitHome, hitAway, pHome, pSeriesHome };
    });
    const f = seriesForecast(rows.map((r) => r.pSeriesHome));
    const outcomes = [
      ...f.aIn.map((q, k) => ({ who: ws.home.abbr, k, q })),
      ...f.bIn.map((q, k) => ({ who: ws.away.abbr, k, q })),
    ].filter((o) => o.k >= Math.ceil(ws.best / 2));
    const likeliest = outcomes.reduce((a, b) => (b.q > a.q ? b : a));
    return { rows, f, outcomes, likeliest };
  };
  const { rows, f, outcomes, likeliest } = callSeries(homeSP, awaySP, true);
  const pre = started ? callSeries(homePre, awayPre, false) : null;
  const finals = games.filter((g) => g.state === "Final").length;
  /* Decided is a side at four, not seven games played. */
  const nowLabel = f.odds === 0 || f.odds === 1 ? "FINAL" : `AFTER GAME ${finals}`;
  const sim = (id: number) => odds?.teams.find((t) => t.team_id === id)?.win_world_series;

  const tape: [string, (t: StandingRow) => string][] = [
    ["RECORD", (t) => `${t.wins}-${t.losses}`],
    ["RUN DIFF", (t) => (t.runDiff > 0 ? `+${t.runDiff}` : String(t.runDiff))],
    ["TRUE TALENT W%", (t) => rate(strength[t.id])],
    ["POSTSEASON", (t) => {
      const won = series.filter((s) => s !== ws).flatMap((s) => s.games).filter((g) => g.state === "Final" && (g.home.id === t.id || g.away.id === t.id));
      const w = won.filter((g) => (g.home.id === t.id ? g.home : g.away).isWinner).length;
      return `${w}-${won.length - w}`;
    }],
    ["SIM TITLE ODDS", (t) => (sim(t.id) === undefined ? "—" : pct(sim(t.id)!))],
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-px sm:grid-cols-4">
        <MetricCard
          label={`${ws.home.abbr} WINS SERIES`}
          value={pct(f.odds)}
          sub={pre ? `BEFORE GAME 1: ${pct(pre.f.odds)} · HOME FIELD` : `${ws.home.name.toUpperCase()} · HOME FIELD`}
        />
        <MetricCard
          label={`${ws.away.abbr} WINS SERIES`}
          value={pct(1 - f.odds)}
          sub={pre ? `BEFORE GAME 1: ${pct(1 - pre.f.odds)}` : ws.away.name.toUpperCase()}
        />
        <MetricCard
          label={pre ? (nowLabel === "FINAL" ? "HOW IT ENDED" : "MOST LIKELY NOW") : "MOST LIKELY"}
          value={`${likeliest.who} IN ${likeliest.k}`}
          sub={
            pre
              ? `CALLED BEFORE GAME 1: ${pre.likeliest.who} IN ${pre.likeliest.k}, ${pct(pre.likeliest.q)}`
              : `${pct(likeliest.q)} OF OUTCOMES`
          }
        />
        <MetricCard label="STARTS" value={gameDay(games[0].startTime).toUpperCase()} sub={`GAME 1 AT ${games[0].home.abbr}`} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_2fr]">
        <section className="border border-line">
          <h3 className="border-b border-line bg-surface-2 px-3 py-1.5 text-[11px] tracking-[0.2em]">TALE OF THE TAPE</h3>
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="border-b border-line text-[10px] tracking-widest text-ink-3">
                <th className="px-3 py-1.5 text-left font-normal" />
                <th className="px-3 py-1.5 text-right font-normal">{ws.home.abbr}</th>
                <th className="px-3 py-1.5 text-right font-normal">{ws.away.abbr}</th>
              </tr>
            </thead>
            <tbody>
              {tape.map(([label, cell]) => (
                <tr key={label} className="border-b border-grid last:border-b-0">
                  <td className="px-3 py-1.5 text-[10px] tracking-widest text-ink-3">{label}</td>
                  <td className="px-3 py-1.5 text-right text-ink">{cell(H)}</td>
                  <td className="px-3 py-1.5 text-right text-ink">{cell(A)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="border border-line">
          <h3 className="border-b border-line bg-surface-2 px-3 py-1.5 text-[11px] tracking-[0.2em]">HOW IT ENDS</h3>
          {/* Before on top, as it stands below; one row until a game is final.
              The pre-series bars are muted so the two never read as one. */}
          {[
            ...(pre ? [{ label: "BEFORE GAME 1", call: pre, bar: "bg-ink-3" }] : []),
            { label: pre ? nowLabel : null, call: { outcomes, likeliest }, bar: "bg-accent" },
          ].map(({ label, call, bar }) => (
            <div key={label ?? "now"} className="p-2 pb-0 last:pb-2">
              {label && <p className="mb-1 text-[10px] tracking-[0.2em] text-ink-3">{label}</p>}
              <div className="grid grid-cols-4 gap-px sm:grid-cols-8">
                {call.outcomes.map((o) => {
                  /* The outcome that came true, ringed on the pre-series row. */
                  const happened = label === "BEFORE GAME 1" && nowLabel === "FINAL" && o.who === likeliest.who && o.k === likeliest.k;
                  return (
                    <div key={`${o.who}${o.k}`} className={`border p-2 ${happened ? "border-accent" : "border-line"}`}>
                      <p className="text-[10px] tracking-wider text-ink-3">
                        {o.who} IN {o.k}
                        {happened && <span className="ml-1 font-bold text-accent">✓</span>}
                      </p>
                      <p className="mt-1 text-sm font-bold tabular-nums text-ink">{pct(o.q)}</p>
                      <div className="mt-1 h-1 bg-grid">
                        <div className={`h-1 ${bar}`} style={{ width: `${(100 * o.q) / call.likeliest.q}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      </div>

      <section className="border border-line">
        <h3 className="border-b border-line bg-surface-2 px-3 py-1.5 text-[11px] tracking-[0.2em]">GAME BY GAME — STARTERS AND MATCHUPS</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="border-b border-line text-[10px] tracking-widest text-ink-3">
                <th className="px-3 py-1.5 text-left font-normal">GAME</th>
                <th className="px-3 py-1.5 text-left font-normal">AWAY SP</th>
                <th className="px-3 py-1.5 text-left font-normal">HOME SP</th>
                <th className="px-3 py-1.5 text-right font-normal" title="Away lineup's projected xwOBA against the home starter">AWAY BATS</th>
                <th className="px-3 py-1.5 text-right font-normal" title="Home lineup's projected xwOBA against the away starter">HOME BATS</th>
                {pre && (
                  <th className="px-3 py-1.5 text-right font-normal" title="The home club's chance as called before Game 1, off projected starters">
                    PRE-SERIES
                  </th>
                )}
                <th className="px-3 py-1.5 text-right font-normal">HOME WIN</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ g, i, hSP, aSP, hitHome, hitAway, pHome }) => (
                <tr key={g.pk} className="border-b border-grid last:border-b-0">
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <Link href={`/game/${g.pk}`} className="text-ink hover:text-accent">
                      G{i + 1} · {g.away.abbr} @ {g.home.abbr}
                    </Link>
                    <span className="ml-2 text-[10px] text-ink-3">{gameDay(g.startTime).toUpperCase()}</span>
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap"><StarterName s={aSP} /></td>
                  <td className="px-3 py-1.5 whitespace-nowrap"><StarterName s={hSP} /></td>
                  <td className="px-3 py-1.5 text-right">
                    {hitAway ? <>{rate(hitAway.proj)} <span className={hitAway.over >= 0 ? "text-good" : "text-crit"}>{signed(hitAway.over)}</span></> : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {hitHome ? <>{rate(hitHome.proj)} <span className={hitHome.over >= 0 ? "text-good" : "text-crit"}>{signed(hitHome.over)}</span></> : "—"}
                  </td>
                  {pre && <td className="px-3 py-1.5 text-right text-ink-3">{pct(pre.rows[i].pHome)}</td>}
                  <td className="px-3 py-1.5 text-right font-bold text-ink">
                    {g.state === "Final" ? `${g.away.score}-${g.home.score} F` : pct(pHome)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-[10px] leading-4 text-ink-3">
        Each game starts from the clubs&apos; Pythagorean records (season runs
        scored and allowed), regressed toward .500 by {`${REGRESS_GAMES} games`},
        by log5, with home field. The starters then swing
        it: each lineup&apos;s {`${season} xwOBA`} against the other starter&apos;s
        pitch mix (shown against the league), read against the rotation it
        faces over the series — the run differential already holds how good
        a staff is — at about a tenth of a win per run. PROJ
        starters are the most trusted arms of each club&apos;s October on full
        rest, until MLB names its probables. The series is the seven games
        played out exactly; SIM TITLE ODDS is the season simulation, for a
        second opinion.
        {pre &&
          " BEFORE GAME 1 is the same model with no games played and every starter projected, so it can be read against how the series went."}
      </p>
    </div>
  );
}
