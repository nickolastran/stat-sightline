/*
 * The chrome for the site's plain-reading pages — privacy, terms, changelog:
 * the 404's bordered column and kicker, with the body set in sentence case at
 * a reading size, since these are paragraphs rather than labels.
 */
export function DocPage({
  kicker,
  title,
  updated,
  children,
}: {
  kicker: string;
  title: string;
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="border-x border-line px-4 py-8 sm:px-8">
        {/* The card centred in the column; its text stays left-aligned. */}
        <div className="mx-auto max-w-3xl">
          <p className="mb-4 text-xs tracking-[0.3em] text-ink-3">{kicker}</p>
          <div className="border border-line bg-surface p-6">
            <h1 className="text-sm font-bold tracking-widest text-ink">{title}</h1>
            {updated && (
              <p className="mt-2 text-[11px] tracking-wider text-ink-3">
                LAST UPDATED {updated}
              </p>
            )}
            <div className="mt-6 space-y-6 text-sm leading-6 text-ink-2">{children}</div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[11px] font-bold tracking-[0.2em] text-ink">{title}</h2>
      {children}
    </section>
  );
}
