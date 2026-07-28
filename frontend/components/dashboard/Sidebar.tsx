/*
 * Module navigation. PITCHING is the built view; the other modules are
 * declared but not yet wired, so they render disabled with a WIP tag
 * instead of dead links.
 */
const MODULES = [
  { code: "P-01", label: "PITCHING", active: true },
  { code: "H-01", label: "HITTING", active: false },
  { code: "M-01", label: "MATCHUP FORECAST", active: false },
  { code: "Q-01", label: "CUSTOM QUERIES", active: false },
];

export default function Sidebar() {
  return (
    <nav aria-label="Modules" className="border-b border-line">
      <h2 className="border-b border-line px-3 py-2 text-[10px] tracking-[0.25em] text-ink-3">
        MODULES
      </h2>
      <ul>
        {MODULES.map((m) => (
          <li key={m.code} className="border-b border-grid last:border-b-0">
            {m.active ? (
              <span
                aria-current="page"
                className="flex items-center justify-between border-l-2 border-accent bg-surface-2 px-3 py-2 text-xs font-bold text-ink"
              >
                <span>{m.label}</span>
                <span className="text-[10px] font-normal text-ink-3">
                  {m.code}
                </span>
              </span>
            ) : (
              <span
                aria-disabled="true"
                className="flex items-center justify-between px-3 py-2 text-xs text-ink-3"
              >
                <span>{m.label}</span>
                <span className="border border-grid px-1 text-[9px]">WIP</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
