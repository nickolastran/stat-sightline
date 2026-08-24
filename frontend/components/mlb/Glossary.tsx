/*
 * The key under a stat table: every abbreviation in the header spelled out,
 * plus whatever extra marks the table itself puts on a row. The tables already
 * carry a long form per column for the hover tooltip, so a caller passes those
 * straight through rather than keeping a second list in step with the first.
 */
export interface GlossaryEntry {
  label: string;
  title: string;
}

export default function Glossary({
  entries,
  groups = [],
}: {
  entries: GlossaryEntry[];
  /** Extra titled blocks below the stats — clinch marks, for the standings. */
  groups?: { name: string; entries: GlossaryEntry[] }[];
}) {
  return (
    <div className="space-y-2 border border-line bg-bg px-3 py-2.5">
      <h4 className="text-[10px] tracking-[0.2em] text-ink-3">GLOSSARY</h4>
      <List entries={entries} />
      {groups.map((g) => (
        <div key={g.name} className="space-y-1.5">
          <h5 className="text-[10px] tracking-[0.2em] text-ink-3">{g.name}</h5>
          <List entries={g.entries} />
        </div>
      ))}
    </div>
  );
}

function List({ entries }: { entries: GlossaryEntry[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-[10px] leading-relaxed sm:grid-cols-2 xl:grid-cols-3">
      {entries.map((e) => (
        <div key={e.label} className="flex gap-2">
          <dt className="w-12 shrink-0 font-bold tracking-wider text-ink">
            {e.label}
          </dt>
          <dd className="text-ink-3">{e.title}</dd>
        </div>
      ))}
    </dl>
  );
}
