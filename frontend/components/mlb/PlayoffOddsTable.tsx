import TeamLink from "@/components/mlb/TeamLink";
import type { TeamOdds } from "@/lib/api";

/*
 * Playoff odds, a table per division: what a club has done on the left, and
 * what the simulation says it will do on the right, under one banded heading
 * each.
 *
 * Every percentage here is a share of drawn seasons, so the columns read
 * across as well as down — WIN DIV plus WILD CARD is MAKE PLAYOFFS, exactly,
 * because a berth is one or the other. The two are printed side by side
 * rather than folded together for that reason: a club at 99% to play in
 * October is a very different story at 5% to win the division than at 80%.
 */

const PCT = (v: number) => `${(v * 100).toFixed(1)}%`;
/** A rate as a baseball line reads it — ".517", no leading zero. */
const RATE = (v: number) => v.toFixed(3).replace(/^0\./, ".");

type Col = {
  label: string;
  title: string;
  value: (t: TeamOdds) => string;
  /** Shaded by how likely it is — the odds columns, not the records. */
  odds?: (t: TeamOdds) => number;
};

const RESULTS: Col[] = [
  { label: "W", title: "Wins", value: (t) => String(t.wins) },
  { label: "L", title: "Losses", value: (t) => String(t.losses) },
  { label: "W%", title: "Winning percentage", value: (t) => RATE(t.win_pct) },
  {
    label: "GB",
    title: "Games behind the division leader",
    value: (t) => t.games_back.toFixed(1),
  },
];

const PROJECTIONS: Col[] = [
  {
    label: "PROJ W",
    title: "Projected final wins — the mean across every simulated season",
    value: (t) => t.projected_wins.toFixed(1),
  },
  {
    label: "PROJ L",
    title: "Projected final losses",
    value: (t) => t.projected_losses.toFixed(1),
  },
  {
    label: "ROS W%",
    title: "Expected winning percentage over the games still to be played",
    value: (t) => RATE(t.ros_win_pct),
  },
  {
    label: "SOS",
    title:
      "Strength of schedule — the mean projected winning percentage of the opponents left",
    value: (t) => RATE(t.strength_of_schedule),
  },
  {
    label: "WIN DIV",
    title: "Share of simulated seasons this club wins its division",
    value: (t) => PCT(t.win_division),
    odds: (t) => t.win_division,
  },
  {
    label: "BYE",
    title:
      "Share of simulated seasons this club takes a top-two seed, and so a bye through the wild-card round",
    value: (t) => PCT(t.clinch_bye),
    odds: (t) => t.clinch_bye,
  },
  {
    label: "WILD CARD",
    title:
      "Share of simulated seasons this club reaches October as a wild card rather than a division winner",
    value: (t) => PCT(t.clinch_wild_card),
    odds: (t) => t.clinch_wild_card,
  },
  {
    label: "PLAYOFFS",
    title: "Share of simulated seasons this club reaches October at all",
    value: (t) => PCT(t.make_playoffs),
    odds: (t) => t.make_playoffs,
  },
  {
    label: "WIN WS",
    title: "Share of simulated seasons this club wins the World Series",
    value: (t) => PCT(t.win_world_series),
    odds: (t) => t.win_world_series,
  },
];

/*
 * How strongly an odds cell is tinted. Bucketed rather than a continuous
 * alpha: eight steps are all the eye reads off a table anyway, and a
 * continuous ramp makes 3% and 6% look meaningfully different when the
 * simulation can't tell them apart.
 */
const shade = (p: number): string => {
  if (p >= 0.995) return "bg-accent/35 text-ink font-bold";
  if (p >= 0.75) return "bg-accent/25 text-ink";
  if (p >= 0.5) return "bg-accent/[0.18] text-ink";
  if (p >= 0.25) return "bg-accent/[0.12] text-ink-2";
  if (p >= 0.05) return "bg-accent/[0.06] text-ink-2";
  if (p > 0) return "text-ink-3";
  return "text-ink-3/50";
};

const TH =
  "border-b border-line bg-surface px-2 py-1.5 text-right text-[10px] font-normal tracking-widest text-ink-3";

function DivisionOdds({ name, teams }: { name: string; teams: TeamOdds[] }) {
  const cols = [...RESULTS, ...PROJECTIONS];
  return (
    <div className="border border-line">
      <h3 className="border-b border-line bg-surface-2 px-3 py-1.5 text-[11px] tracking-[0.2em] text-ink">
        {name}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            {/* The two halves of the line named once each, so a reader knows
                which figures already happened and which are a simulation. */}
            <tr>
              <th className={`${TH} text-left`} />
              <th className={`${TH} border-r border-line text-center`} colSpan={RESULTS.length}>
                RESULTS
              </th>
              <th className={`${TH} text-center`} colSpan={PROJECTIONS.length}>
                PROJECTIONS
              </th>
            </tr>
            <tr>
              {/* Wide enough for the longest club nickname: squeezed by the
                  fifteen columns beside it, the cell truncates "Diamondbacks"
                  down to a word nobody can read. The table scrolls instead. */}
              <th scope="col" className={`${TH} w-36 min-w-36 text-left`}>
                TEAM
              </th>
              {cols.map((c, i) => (
                <th
                  key={c.label}
                  scope="col"
                  title={c.title}
                  className={`${TH} ${
                    i === RESULTS.length - 1 ? "border-r border-line" : ""
                  }`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr
                key={t.team_id}
                className="border-b border-grid last:border-b-0 hover:bg-surface-2"
              >
                <td className="w-36 min-w-36 px-2 py-1.5 whitespace-nowrap">
                  <TeamLink id={t.team_id} name={t.name} />
                </td>
                {cols.map((c, i) => (
                  <td
                    key={c.label}
                    className={`px-2 py-1.5 text-right tabular-nums ${
                      i === RESULTS.length - 1 ? "border-r border-line" : ""
                    } ${c.odds ? shade(c.odds(t)) : "text-ink-2"}`}
                  >
                    {c.value(t)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PlayoffOddsTable({
  teams,
  simulations,
  asOf,
}: {
  teams: TeamOdds[];
  simulations: number;
  asOf: string | null;
}) {
  if (teams.length === 0)
    return (
      <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
        NO ODDS FOR THIS SEASON YET
      </p>
    );

  /* Grouped in the order the divisions arrive, which the API sorts east to
     west down each league — the order every scoreboard prints them in. */
  const order: number[] = [];
  const byDivision = new Map<number, TeamOdds[]>();
  for (const t of [...teams].sort((a, b) => b.wins - a.wins || a.losses - b.losses)) {
    if (!byDivision.has(t.division_id)) {
      byDivision.set(t.division_id, []);
      order.push(t.division_id);
    }
    byDivision.get(t.division_id)!.push(t);
  }
  order.sort((a, b) => {
    const la = byDivision.get(a)![0].league_id;
    const lb = byDivision.get(b)![0].league_id;
    return la - lb || a - b;
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
        {order.map((id) => (
          <DivisionOdds
            key={id}
            name={byDivision.get(id)![0].division}
            teams={byDivision.get(id)!}
          />
        ))}
      </div>
      <p className="text-[10px] leading-relaxed tracking-wider text-ink-3">
        {simulations.toLocaleString()} simulated seasons
        {asOf ? `, through ${asOf}` : ""}. Every remaining game is drawn at the
        model&apos;s own probability for it and the bracket is played out, so a
        club&apos;s odds are the share of those seasons ending its way. WIN DIV and
        WILD CARD add up to PLAYOFFS. Ties are settled by a coin flip rather
        than MLB&apos;s head-to-head ladder, and no club&apos;s form is allowed to move
        between now and October.
      </p>
    </div>
  );
}
