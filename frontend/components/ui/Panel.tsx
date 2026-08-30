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
    <section className={`border border-line bg-surface ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <h2 className="text-sm tracking-[0.25em] text-ink">{title}</h2>
        {right}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}
