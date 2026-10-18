import type { Pitch } from "@/lib/api";
import { timesThrough, type TtoRow } from "@/lib/timesThrough";

/*
 * A pitcher's first, second, third and later trips through a lineup, each
 * figure with its change from the first trip beneath it — the fade, if
 * there is one, reads straight down a column.
 */

/** Below this many PAs a trip is shown faded — most relievers' second time. */
const THIN = 30;

const ORDINAL = ["", "1ST", "2ND", "3RD", "4TH+"];

type Col = {
  key: keyof TtoRow;
  label: string;
  title: string;
  fmt: (v: number) => string;
  delta: (v: number) => string;
};

const rate3 = (v: number) => v.toFixed(3).replace(/^(-?)0\./, "$1.");
const sign = (v: number, s: string) => (v >= 0 ? `+${s}` : `−${s.replace("-", "")}`);

export default function TimesThroughPanel({ pitches }: { pitches: Pitch[] }) {
  const { fastball, rows } = timesThrough(pitches);
  if (rows.length === 0)
    return <p className="text-xs text-ink-3">NO TIMES-THROUGH DATA ON THESE PITCHES</p>;

  const cols: Col[] = [
    ...(fastball
      ? [{
          key: "velo" as const,
          label: `${fastball} VELO`,
          title: `Average ${fastball} velocity, mph`,
          fmt: (v: number) => v.toFixed(1),
          delta: (v: number) => sign(v, Math.abs(v).toFixed(1)),
        }]
      : []),
    {
      key: "whiffRate",
      label: "WHIFF%",
      title: "Whiffs per swing",
      fmt: (v) => `${(v * 100).toFixed(1)}%`,
      delta: (v) => sign(v, `${Math.abs(v * 100).toFixed(1)}`),
    },
    {
      key: "xwoba",
      label: "xwOBA",
      title: "Expected wOBA allowed — contact quality, walks and strikeouts",
      fmt: rate3,
      delta: (v) => sign(v, rate3(Math.abs(v))),
    },
  ];
  const first = rows.find((r) => r.tto === 1);
  const th = "border-b border-line bg-surface px-2 py-2 text-[10px] font-normal tracking-widest text-ink-3";

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto border border-line">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th scope="col" className={`${th} text-left`}>TIME THROUGH</th>
              <th scope="col" className={`${th} text-right`}>PA</th>
              {cols.map((c) => (
                <th key={c.key} scope="col" title={c.title} className={`${th} text-right`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.tto}
                className={`border-b border-grid last:border-b-0 ${r.pas < THIN ? "opacity-50" : ""}`}
                title={r.pas < THIN ? `Only ${r.pas} PAs — a small sample` : undefined}
              >
                <th scope="row" className="px-2 py-1.5 text-left font-bold tracking-wider text-ink">
                  {ORDINAL[r.tto]}
                </th>
                <td className="px-2 py-1.5 text-right tabular-nums text-ink-3">{r.pas.toLocaleString()}</td>
                {cols.map((c) => {
                  const v = r[c.key];
                  const base = first?.[c.key];
                  return (
                    <td key={c.key} className="px-2 py-1.5 text-right tabular-nums">
                      <span className="text-ink">{v === null ? "—" : c.fmt(v)}</span>
                      {r.tto !== 1 && v !== null && base != null && (
                        <span className="ml-1.5 text-[10px] text-ink-3">{c.delta(v - base)}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] tracking-wider text-ink-3">
        CHANGE FROM THE FIRST TIME THROUGH BESIDE EACH FIGURE. VELOCITY IS HIS MAIN FASTBALL&apos;S.
        FADED ROWS HAVE FEWER THAN {THIN} PA.
      </p>
    </div>
  );
}
