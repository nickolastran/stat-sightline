/*
 * The key under a stat table: every abbreviation in the header spelled out,
 * plus whatever extra marks the table itself puts on a row. The tables already
 * carry a long form per column for the hover tooltip, so a caller passes those
 * straight through rather than keeping a second list in step with the first.
 */
export interface GlossaryEntry {
  label: string;
  title: string;
  /** Takes two columns, for a definition too long for one. */
  wide?: boolean;
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
    <div className="space-y-3 border border-line bg-bg px-4 py-3">
      <Section name="GLOSSARY" entries={entries} />
      {groups.map((g) => (
        <Section key={g.name} name={g.name} entries={g.entries} />
      ))}
    </div>
  );
}

/* Fixed-width columns centred in the box, so every gap is the same width and
   a short block (one mark) lines up under the columns of the long one. */
function Section({
  name,
  entries,
}: {
  name: string;
  entries: GlossaryEntry[];
}) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-[10px] tracking-[0.2em] text-ink-3">{name}</h4>
      <dl className="grid grid-cols-[repeat(auto-fill,16rem)] justify-center gap-x-6 gap-y-1 text-[10px] leading-relaxed">
        {entries.map((e) => (
          <div
            key={e.label}
            className={`grid grid-cols-[3rem_1fr] items-baseline gap-2 ${e.wide ? "sm:col-span-2" : ""}`}
          >
            <dt className="font-bold tracking-wider text-ink">{e.label}</dt>
            <dd className="text-ink-3">{e.title}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
