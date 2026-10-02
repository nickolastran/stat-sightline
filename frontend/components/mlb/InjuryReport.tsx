import Link from "next/link";
import Panel from "@/components/ui/Panel";
import PlayerLink from "@/components/mlb/PlayerLink";
import { teamLogo } from "@/lib/mlb";
import type { Injury } from "@/lib/injuries";

/*
 * The two clubs' injured lists, one table each, under the game they are
 * missing. MLB publishes no expected return, so the date beside the list is
 * when the player went on it; the reason sits under the name.
 */

/** "Injured 10-Day" → "10-Day IL", the way a box score prints it. */
const list = (status: string) =>
  `${status.replace(/^injured\s*-?\s*/i, "")} IL`;

/** A placement date as "Sep 5", sliced rather than parsed (see lib/draft.ts). */
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const placed = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}/.test(iso)
    ? `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`
    : "—";

const TH =
  "border-b border-line px-2 py-1.5 text-[10px] font-normal tracking-widest text-ink-3";

export default function InjuryReport({
  clubs,
}: {
  clubs: { id: number; name: string; injuries: Injury[] | null }[];
}) {
  return (
    <Panel title="Injury Report" tight>
      <div className="space-y-3">
        {clubs.map((c) => (
          <div key={c.id}>
            <h3 className="mb-1.5 flex items-center gap-2 text-xs text-ink">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={teamLogo(c.id)} alt="" className="h-4 w-4" />
              {c.name}
            </h3>
            {c.injuries === null ? (
              <p className="border border-line px-2 py-1.5 text-xs text-ink-3">
                UNAVAILABLE — MLB API UNREACHABLE
              </p>
            ) : c.injuries.length === 0 ? (
              <p className="border border-line px-2 py-1.5 text-xs text-ink-3">
                NOBODY ON THE INJURED LIST
              </p>
            ) : (
              <div className="overflow-x-auto border border-line">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      <th scope="col" className={`${TH} text-left`}>NAME, POS</th>
                      <th scope="col" className={`${TH} text-right`}>STATUS</th>
                      <th scope="col" className={`${TH} text-right`}>PLACED</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.injuries.map((i) => (
                      <tr
                        key={i.id}
                        className="border-b border-grid last:border-b-0"
                      >
                        <td className="px-2 py-1.5">
                          <PlayerLink id={i.id} headshot={false}>
                            {i.name}
                          </PlayerLink>{" "}
                          <span className="text-[10px] text-ink-3">{i.position}</span>
                          {i.note && (
                            <span className="block text-[10px] text-ink-3">{i.note}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right align-top whitespace-nowrap text-ink-2">
                          {list(i.status)}
                        </td>
                        <td className="px-2 py-1.5 text-right align-top tabular-nums whitespace-nowrap">
                          {placed(i.since)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
      <Link
        href="/injuries"
        className="mt-2 block border border-line px-2 py-1.5 text-center text-[10px] tracking-[0.2em] text-ink-3 hover:border-accent hover:text-ink"
      >
        FULL INJURY REPORT
      </Link>
    </Panel>
  );
}
