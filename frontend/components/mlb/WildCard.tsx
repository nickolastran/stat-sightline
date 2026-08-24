import TeamLink from "@/components/mlb/TeamLink";
import Glossary from "@/components/mlb/Glossary";
import { ClinchMark } from "@/components/mlb/Standings";
import { CLINCH_LEGEND, WC_BERTHS, type WildCardGroup } from "@/lib/mlb";

/*
 * The wild-card race, one table per league. MLB serves this as its own
 * standings type — division leaders removed, everyone else ranked by distance
 * from the last berth — so the table is a straight render of that order with
 * a rule drawn under the third row to mark the cut line.
 *
 * WCGB is the number that matters here and the one the sort is fixed to: a
 * club "+2.0" is two games clear of the cut, "2.0" is two games short of it.
 * Nothing sorts, because the race only reads correctly in its own order.
 */

const COLS = [
  { label: "W", title: "Wins" },
  { label: "L", title: "Losses" },
  { label: "PCT", title: "Winning percentage" },
  {
    label: "WCGB",
    title:
      "Wild-card games back — games behind the last playoff berth; a leading + is games clear of it",
  },
  {
    label: "E#",
    title:
      "Wild-card elimination number — combined wins by the clubs holding a berth and losses by this one that would end its chase; E once it already has",
  },
  { label: "STRK", title: "Current streak" },
  { label: "L10", title: "Record over the last ten games" },
];

const TH =
  "border-b border-line bg-surface px-2 py-1.5 text-center text-[10px] tracking-widest font-normal text-ink-3";
const TD = "whitespace-nowrap px-2 py-1.5 text-center tabular-nums";

export default function WildCard({
  groups,
  left,
}: {
  groups: WildCardGroup[];
  /** The view buttons, above the tables — the standings' controls row. */
  left?: React.ReactNode;
}) {
  if (groups.length === 0)
    return (
      <div className="space-y-3">
        {left}
        <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
          NO WILD CARD RACE FOR THIS SEASON YET
        </p>
      </div>
    );

  return (
    <div className="space-y-3">
      {left}
      {groups.map((g) => (
        <div key={g.id} className="border border-line bg-bg">
          <h3 className="border-b border-line px-3 py-1.5 text-[10px] tracking-[0.2em] text-ink-2">
            {g.name} WILD CARD
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-xs">
              <thead>
                <tr>
                  <th
                    scope="col"
                    className={`${TH} w-8 text-left`}
                  >
                    #
                  </th>
                  <th scope="col" className={`${TH} text-left`}>
                    TEAM
                  </th>
                  {COLS.map((c) => (
                    <th key={c.label} scope="col" className={TH} title={c.title}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.teams.map((t, i) => (
                  <tr
                    key={t.id}
                    /* The rule under the last berth is the whole point of the
                       table — everything above it is in, everything below is
                       chasing. */
                    className={`border-t text-ink-2 hover:bg-surface-2 ${
                      i === WC_BERTHS - 1
                        ? "border-t-grid border-b-2 border-b-accent"
                        : "border-grid"
                    }`}
                  >
                    <td className="px-2 py-1.5 text-[10px] tabular-nums text-ink-3">
                      {t.wcRank}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="flex items-center gap-1">
                        <ClinchMark row={t} />
                        <TeamLink id={t.id} name={t.name} className="min-w-0" />
                        <span className="shrink-0 text-[10px] tracking-wider text-ink-3">
                          {t.division}
                        </span>
                      </span>
                    </td>
                    <td className={`${TD} font-bold text-ink`}>{t.wins}</td>
                    <td className={TD}>{t.losses}</td>
                    <td className={TD}>{t.pct}</td>
                    <td className={`${TD} font-bold text-ink`}>{t.wcGb}</td>
                    <td className={TD}>{t.wcElim || "—"}</td>
                    <td className={TD}>{t.streak}</td>
                    <td className={TD}>{t.last10}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <p className="text-[10px] leading-relaxed text-ink-3">
        DIVISION LEADERS ARE EXCLUDED · THE RULE MARKS THE LAST OF {WC_BERTHS}{" "}
        WILD CARD BERTHS
      </p>

      <Glossary
        entries={COLS}
        groups={[{ name: "CLINCH", entries: CLINCH_LEGEND }]}
      />
    </div>
  );
}
