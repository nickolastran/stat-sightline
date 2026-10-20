import type { Metadata } from "next";
import Sidebar from "@/components/dashboard/Sidebar";
import ZonePlot from "@/components/dashboard/ZonePlot";
import PlayerSearch from "@/components/landing/PlayerSearch";
import MetricCard from "@/components/ui/MetricCard";
import Panel from "@/components/ui/Panel";
import { getMatchups, getPlayerPitches, MATCHUP_COLS } from "@/lib/api";
import {
  edgeLines,
  getArsenalBoards,
  getSideMix,
  pitchEdges,
  REGRESS_PA,
  REGRESS_PITCHES,
  sideOf,
} from "@/lib/matchupEdge";
import { getPlayer, seasonOf, todayPT } from "@/lib/mlb";
import { slotFor } from "@/lib/pitchColors";
import { getMatchupPitches } from "@/lib/statcast";

/*
 * MATCHUP FORECAST: any hitter against any pitcher. The forecast is the
 * pregame lineup card's pitch-mix edge (lib/matchupEdge) for one pair, with
 * the per-pitch breakdown the card has no room for; under it, what actually
 * happened when the two met, pitch by pitch, from the warehouse (Savant's
 * search on the deployed site, which has none). Both players
 * live in the URL, so a forecast is a link.
 *
 * The forecast reads Savant's season boards, not the warehouse, so it works
 * whether or not the two have ever faced each other — weighted by the
 * pitcher's mix against the side this hitter bats from when both hands and
 * that split are known.
 */

export const metadata: Metadata = {
  title: "Matchup Forecast",
  description: "Projected xwOBA for any hitter against any pitcher, by pitch mix.",
};

const idOf = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
/** ".331", "+.018" — rates the way a box score writes them. */
const rate = (v: number) => v.toFixed(3).replace(/^(-?)0\./, "$1.");
const signed = (v: number) => (v >= 0 ? "+" : "") + rate(v);

/** The edge line's cells as headline tiles: key, label, caption. */
const FORECAST = [
  ["proj", "PROJ xwOBA", "WEIGHTED BY HIS MIX"],
  ["diff", "VS. LEAGUE", "+ FAVORS THE BATTER"],
  ["best", "BEST PITCH", "FOR THE BATTER"],
  ["worst", "WORST PITCH", "FOR THE BATTER"],
  ["pa", "PA SAMPLE", "BATTER VS. THESE PITCHES"],
] as const;

export default async function MatchupPage({
  searchParams,
}: {
  searchParams: Promise<{ pitcher?: string; batter?: string }>;
}) {
  const sp = await searchParams;
  const pitcher = idOf(sp.pitcher);
  const batter = idOf(sp.batter);
  const season = seasonOf(todayPT());
  const both = pitcher !== undefined && batter !== undefined;

  const [arm, bat, boards, h2h, metPitches, sideMix] = await Promise.all([
    pitcher ? getPlayer(pitcher, season).catch(() => null) : null,
    batter ? getPlayer(batter, season).catch(() => null) : null,
    both ? getArsenalBoards(season).catch(() => null) : null,
    both ? getMatchups(pitcher, [batter]).catch(() => null) : null,
    both
      ? getPlayerPitches("pitcher", pitcher, { vs: batter })
          .then((d) => d.pitches)
          .catch(() => getMatchupPitches(pitcher, batter, season))
          .catch(() => null)
      : null,
    both ? getSideMix(pitcher, season).catch(() => null) : null,
  ]);
  /* The side he stands in against this arm; without it, or the split, the
     forecast reads the pitcher's whole-season mix. */
  const side = sideOf(bat?.bats, arm?.throws);
  const platoon = both && sideMix && side ? { mix: sideMix, sides: { [batter]: side } } : null;
  const line = both && boards ? edgeLines(boards, pitcher, [batter], platoon)?.[batter] : null;
  const parts = both && boards ? pitchEdges(boards, pitcher, batter, platoon) : null;
  const met = both ? h2h?.[batter] : null;

  return (
    <div className="flex min-h-[calc(100vh-3rem)] flex-col lg:flex-row">
      <aside className="shrink-0 border-b border-line bg-surface lg:sticky lg:top-12 lg:h-[calc(100vh-3rem)] lg:w-64 lg:overflow-y-auto lg:border-r lg:border-b-0">
        <Sidebar active="M-01" pitcher={pitcher} batter={batter} />
      </aside>

      <main className="min-w-0 flex-1 space-y-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border border-line bg-surface px-3 py-2">
          <div className="flex items-baseline gap-3">
            <h1 className="text-base font-bold tracking-wide">
              {bat && arm ? `${bat.name} vs. ${arm.name}` : "MATCHUP FORECAST"}
            </h1>
            <span className="text-[11px] text-ink-3">
              {season} · PITCH-MIX MODEL
            </span>
          </div>
          <div className="grid w-full gap-2 sm:w-[36rem] sm:grid-cols-2">
            <PlayerSearch
              role="batter"
              param="batter"
              size="compact"
              placeholder={bat ? `BATTER: ${bat.name.toUpperCase()}` : "PICK BATTER"}
            />
            <PlayerSearch
              role="pitcher"
              param="pitcher"
              size="compact"
              placeholder={arm ? `PITCHER: ${arm.name.toUpperCase()}` : "PICK PITCHER"}
            />
          </div>
        </div>

        {!both ? (
          <Panel title="PICK A MATCHUP">
            <dl className="mb-3 grid grid-cols-[5rem_1fr] gap-y-1 text-xs">
              <dt className="text-ink-3">BATTER</dt>
              <dd className={bat ? "font-bold text-ink" : "text-ink-3"}>
                {bat?.name ?? "— not picked"}
              </dd>
              <dt className="text-ink-3">PITCHER</dt>
              <dd className={arm ? "font-bold text-ink" : "text-ink-3"}>
                {arm?.name ?? "— not picked"}
              </dd>
            </dl>
            <p className="text-xs leading-5 text-ink-2">
              Choose a batter and a pitcher above. The forecast weights the
              pitcher&apos;s {season} mix by how this hitter and the league do
              against each pitch, so it reads even for two players who have
              never met.
            </p>
          </Panel>
        ) : !line || !parts ? (
          <Panel title="NO FORECAST">
            <p className="text-xs leading-5 text-ink-2">
              {boards
                ? `${arm?.name ?? "This pitcher"} has no pitch mix on Savant's ${season} arsenal board.`
                : "Savant's arsenal board didn't answer. It's usually momentary; try again."}
            </p>
          </Panel>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-px sm:grid-cols-3 xl:grid-cols-5">
              {FORECAST.map(([key, label, sub]) => (
                <MetricCard
                  key={key}
                  label={label}
                  value={line[key] === null ? "—" : String(line[key])}
                  sub={key === "proj" && platoon ? `HIS MIX VS. ${side}HB` : sub}
                />
              ))}
            </div>

            <Panel title="FORECAST — PITCH BY PITCH">
              <div className="overflow-x-auto border border-line">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-line text-[10px] tracking-widest text-ink-3">
                      <th scope="col" className="px-3 py-2 text-left font-normal">PITCH</th>
                      <th scope="col" className="px-3 py-2 text-right font-normal">USE%</th>
                      <th scope="col" className="px-3 py-2 text-right font-normal" title="Hitter's xwOBA against the pitch">BATTER</th>
                      <th scope="col" className="px-3 py-2 text-right font-normal" title="Pitcher's xwOBA allowed with the pitch">PITCHER</th>
                      <th scope="col" className="px-3 py-2 text-right font-normal">LEAGUE</th>
                      <th scope="col" className="px-3 py-2 text-right font-normal">PROJ</th>
                      <th scope="col" className="px-3 py-2 text-right font-normal">+/-</th>
                      <th scope="col" className="px-3 py-2 text-right font-normal" title="Hitter's PAs against the pitch this season">PA</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {parts.pitches.map((p) => {
                      const diff = p.proj - p.league;
                      return (
                        <tr key={p.type} className="border-b border-grid last:border-b-0">
                          <td className="px-3 py-1.5 font-bold text-ink">
                            <span className="flex items-center gap-1.5">
                              <span aria-hidden className="inline-block h-2.5 w-2.5" style={{ background: slotFor(p.type).color }} />
                              {p.type}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right text-ink-2">{p.usage.toFixed(1)}%</td>
                          <td className="px-3 py-1.5 text-right text-ink-2">{rate(p.hitter)}</td>
                          <td className="px-3 py-1.5 text-right text-ink-2">{rate(p.pitcher)}</td>
                          <td className="px-3 py-1.5 text-right text-ink-3">{rate(p.league)}</td>
                          <td className="px-3 py-1.5 text-right font-bold text-ink">{rate(p.proj)}</td>
                          <td className={`px-3 py-1.5 text-right ${diff >= 0 ? "text-good" : "text-crit"}`}>{signed(diff)}</td>
                          <td className="px-3 py-1.5 text-right text-ink-2">{p.pa}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[10px] leading-4 text-ink-3">
                xwOBA, {season}. Each side&apos;s figure on a pitch is pulled
                toward the league&apos;s with {`${REGRESS_PA} PAs`} of average; the
                two edges over the league are added, then weighted by the
                pitcher&apos;s usage
                {platoon
                  ? ` against ${side === "L" ? "left" : "right"}-handed hitters (pulled toward his overall mix with ${REGRESS_PITCHES} pitches of it)`
                  : ""}
                . + favors the batter.
              </p>
            </Panel>
          </>
        )}

        {both && (
          <Panel title="HEAD TO HEAD — TRACKED PITCHES">
            {met && (
              <div className="grid grid-cols-2 gap-px sm:grid-cols-4 xl:grid-cols-7">
                {MATCHUP_COLS.map((c) => (
                  <MetricCard
                    key={c.key}
                    label={c.label}
                    value={met[c.key] === null ? "—" : String(met[c.key])}
                    sub={c.title?.toUpperCase()}
                  />
                ))}
              </div>
            )}
            {metPitches?.length ? (
              <div className={`max-w-md ${met ? "mt-3" : ""}`}>
                <ZonePlot pitches={metPitches} mode="scatter" colorBy="result" />
              </div>
            ) : (
              !met && (
                <p className="text-xs text-ink-2">
                  {h2h || metPitches
                    ? "These two haven't met in the pitch warehouse."
                    : "The pitch warehouse didn't answer for the head-to-head."}
                </p>
              )
            )}
          </Panel>
        )}
      </main>
    </div>
  );
}
