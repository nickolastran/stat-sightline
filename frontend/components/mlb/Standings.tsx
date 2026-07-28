import { teamLogo, type Division } from "@/lib/mlb";

/* Division standings — one compact table per division, in a responsive grid. */
export default function Standings({ divisions }: { divisions: Division[] }) {
  if (divisions.length === 0)
    return (
      <p className="border border-line bg-bg px-3 py-6 text-center text-xs text-ink-3">
        NO STANDINGS FOR THIS SEASON YET
      </p>
    );

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {divisions.map((d) => (
        <div key={d.id} className="border border-line bg-bg">
          <h3 className="border-b border-line px-3 py-1.5 text-[10px] tracking-[0.2em] text-ink-2">
            {d.name}
          </h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] tracking-widest text-ink-3">
                <th className="px-3 py-1 text-left font-normal">TEAM</th>
                <th className="px-1 py-1 text-right font-normal">W</th>
                <th className="px-1 py-1 text-right font-normal">L</th>
                <th className="px-1 py-1 text-right font-normal">PCT</th>
                <th className="px-1 py-1 text-right font-normal">GB</th>
                <th className="px-3 py-1 text-right font-normal">STRK</th>
              </tr>
            </thead>
            <tbody>
              {d.teams.map((t) => (
                <tr
                  key={t.id}
                  className="border-t border-grid text-ink-2 hover:bg-surface-2"
                >
                  <td className="flex items-center gap-1.5 px-3 py-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={teamLogo(t.id)}
                      alt=""
                      width={16}
                      height={16}
                      className="h-4 w-4 shrink-0"
                    />
                    <span className="truncate">{t.name}</span>
                  </td>
                  <td className="px-1 py-1.5 text-right font-bold text-ink tabular-nums">
                    {t.wins}
                  </td>
                  <td className="px-1 py-1.5 text-right tabular-nums">
                    {t.losses}
                  </td>
                  <td className="px-1 py-1.5 text-right tabular-nums">
                    {t.pct}
                  </td>
                  <td className="px-1 py-1.5 text-right tabular-nums">{t.gb}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {t.streak}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
