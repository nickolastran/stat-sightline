import { Fragment } from "react";

/*
 * Titled bordered panel — the same chrome DashboardClient uses for its
 * cards, shared here so the MLB overview/games pages match exactly.
 */
export default function Panel({
  title,
  right,
  children,
  className = "",
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col border border-line bg-surface ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <h2 className="text-sm tracking-[0.25em] text-ink">{title}</h2>
        {/* Keyed rather than dropped in bare: `right` is usually a control bar
            built in a server component, and an element that reaches this array
            through the RSC payload has lost the mark that says a static child
            needs no key — React warns about it on hydration otherwise. */}
        <Fragment key="right">{right}</Fragment>
      </header>
      <div className="flex-1 p-3">{children}</div>
    </section>
  );
}
