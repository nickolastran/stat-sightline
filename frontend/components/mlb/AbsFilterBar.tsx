import ParamSelect from "@/components/mlb/ParamSelect";
import ParamMultiSelect, {
  type MultiGroup,
} from "@/components/mlb/ParamMultiSelect";
import { slotFor } from "@/lib/pitchColors";
import type { Club } from "@/lib/mlb";
import {
  ABS_CONF,
  ABS_GAME_TYPES,
  ABS_GROUP_BY,
  ABS_IN_OUT,
  ABS_LEVELS,
  ABS_LEVERAGE,
  ABS_MINS,
  ABS_REMAINING,
  ABS_SIDES,
  ABS_PITCH_GROUPS,
  ABS_TYPES,
  ABS_ZONES,
  ABS_ZONE_IMAGE,
  ABS_ZONE_QUICK,
  type AbsQuery,
} from "@/lib/abs";

/*
 * Everything the ABS board is filtered by, in one block above the table —
 * Savant's own control set — under a short note on how the board reads.
 *
 * A server component holding client controls: the club list behind the two
 * org pickers is a cached MLB read, so it is resolved once here rather than
 * fetched again in the browser. The bar is rendered outside the section's
 * Suspense boundary, which is what lets a pop-out stay open while the board
 * it just filtered re-fetches behind it.
 */

/** The thirty clubs as six division blocks, AL down one column, NL the other. */
function orgGroups(clubs: Club[]): MultiGroup[] {
  const seen: string[] = [];
  for (const c of clubs) if (!seen.includes(c.division)) seen.push(c.division);
  return seen.map((division) => ({
    label: division,
    options: clubs
      .filter((c) => c.division === division)
      .map((c) => ({ value: String(c.id), label: c.name.toUpperCase() })),
  }));
}

const PITCH_GROUPS: MultiGroup[] = ABS_PITCH_GROUPS.map((g) => ({
  label: g.label,
  options: g.options.map((o) => ({ ...o, color: slotFor(o.value).color })),
}));

/* One option per block, so two columns deal 11-14 down the first and 16-19
   down the second — the ring read the way the diagram under it is drawn. */
const ZONE_GROUPS: MultiGroup[] = ABS_ZONES.map((z) => ({ options: [z] }));

const GROUP_BY_GROUPS: MultiGroup[] = ABS_GROUP_BY.map((g) => ({
  options: [g],
}));

export default function AbsFilterBar({
  query,
  clubs,
}: {
  query: AbsQuery;
  clubs: Club[];
}) {
  const leagues = (id: number) =>
    clubs.filter((c) => c.leagueId === id).map((c) => String(c.id));
  const orgQuick = [
    { label: "AMERICAN LEAGUE", values: leagues(103) },
    { label: "NATIONAL LEAGUE", values: leagues(104) },
  ];
  const orgs = orgGroups(clubs);

  return (
    <>
    <details open className="mb-3 border border-line bg-bg px-3 py-2 text-xs leading-5 text-ink-2">
      <summary className="cursor-pointer text-[10px] tracking-[0.2em] text-ink-3">
        HOW TO READ THIS BOARD
      </summary>
      <div className="mt-2 space-y-2">
        <p>
          The Automated Ball-Strike challenge system arrived in 2026. Only the
          batter, pitcher or catcher can challenge a call; each team starts a
          game with two and keeps a challenge it wins. The ABS zone runs from
          27% to 53.5% of the batter&apos;s height, measured at the middle of the
          plate.
        </p>
        <p>
          <b className="text-ink">RUNS ABOVE AVG.</b>{" "}is what a side&apos;s challenges
          were worth in runs beyond what an average challenger gets out of the
          very same calls — the runs its wins gained over expected, plus the
          runs its losses cost under expected.{" "}
          <b className="text-ink">POSS. RUNS</b> is the run value of every wrong
          call against it while it still had a challenge, and{" "}
          <b className="text-ink">% RUNS TAKEN</b> the share of that it actually
          won back; <b className="text-ink">POSS. OVR.</b> and{" "}
          <b className="text-ink">% OVR. TAKEN</b> are the same read in plain
          overturns. A high share is a side taking its chances, a low one a
          side sitting on them.
        </p>
        <p>
          <b className="text-ink">AS CHALLENGED</b> flips every row to the
          challenges made against it. Hover any heading for its definition,
          or see the glossary under the table.
        </p>
      </div>
    </details>
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 border border-line bg-bg px-3 py-2">
      <ParamSelect param="type" label="BOARD" value={query.type} options={ABS_TYPES} />
      <ParamSelect param="as" label="VIEW" value={query.side} options={ABS_SIDES} />
      <ParamSelect param="gt" label="SEASON TYPE" value={query.gameType} options={ABS_GAME_TYPES} />
      <ParamSelect param="level" label="LEVEL" value={query.level} options={ABS_LEVELS} />
      <ParamMultiSelect
        param="org"
        label="CHAL. ORG."
        value={query.org}
        groups={orgs}
        quick={orgQuick}
        cols={2}
        width="w-[26rem]"
      />
      <ParamMultiSelect
        param="opp"
        label="OPP. ORG."
        value={query.opp}
        groups={orgs}
        quick={orgQuick}
        cols={2}
        width="w-[26rem]"
      />
      <ParamMultiSelect
        param="pitch"
        label="PITCH TYPE"
        value={query.pitch}
        groups={PITCH_GROUPS}
        width="w-48"
      />
      <ParamMultiSelect
        param="zone"
        label="ATTACK ZONE"
        value={query.zone}
        groups={ZONE_GROUPS}
        quick={ABS_ZONE_QUICK}
        cols={2}
        width="w-64"
        image={ABS_ZONE_IMAGE}
      />
      <ParamSelect
        param="inout"
        label="IN/OUT OF ZONE"
        value={query.inOut}
        options={ABS_IN_OUT}
      />
      <ParamSelect
        param="leverage"
        label="LEVERAGE"
        value={query.leverage}
        options={ABS_LEVERAGE}
      />
      <ParamSelect
        param="conf"
        label="CHAL. CONF. REQ."
        value={query.conf}
        options={ABS_CONF}
      />
      <ParamSelect
        param="left"
        label="CHAL. REMAINING"
        value={query.remaining}
        options={ABS_REMAINING}
      />
      <ParamMultiSelect
        param="split"
        label="GROUP BY"
        value={query.group}
        groups={GROUP_BY_GROUPS}
        cols={2}
        width="w-96"
      />
      <ParamSelect param="min" label="MIN. CHAL." value={query.min} options={ABS_MINS} />
      <ParamSelect
        param="minopp"
        label="MIN. OPP. CHAL."
        value={query.minOpp}
        options={ABS_MINS}
      />
    </div>
    </>
  );
}
