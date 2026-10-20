import Link from "next/link";

/*
 * Module navigation. Each module carries the players already on screen
 * across: the pitcher you're reading opens as that pitcher's matchup, and a
 * module with nobody picked opens on the heaviest workload ("top").
 */

export type ModuleCode = "P-01" | "H-01" | "M-01" | "Q-01";

interface Props {
  active: ModuleCode;
  pitcher?: number;
  batter?: number;
}

export default function Sidebar({ active, pitcher, batter }: Props) {
  const pair = new URLSearchParams();
  if (pitcher) pair.set("pitcher", String(pitcher));
  if (batter) pair.set("batter", String(batter));

  const modules: { code: ModuleCode; label: string; href: string }[] = [
    { code: "P-01", label: "PITCHING", href: `/pitcher/${pitcher ?? "top"}` },
    { code: "H-01", label: "HITTING", href: `/hitter/${batter ?? "top"}` },
    { code: "M-01", label: "MATCHUP FORECAST", href: `/matchup?${pair}` },
    { code: "Q-01", label: "CUSTOM QUERIES", href: "/ask" },
  ];

  return (
    <nav aria-label="Modules" className="border-b border-line">
      <h2 className="border-b border-line px-3 py-2 text-[10px] tracking-[0.25em] text-ink-3">
        MODULES
      </h2>
      <ul>
        {modules.map((m) => (
          <li key={m.code} className="border-b border-grid last:border-b-0">
            <Link
              href={m.href}
              aria-current={m.code === active ? "page" : undefined}
              className={`flex items-center justify-between px-3 py-2 text-xs ${
                m.code === active
                  ? "border-l-2 border-accent bg-surface-2 font-bold text-ink"
                  : "text-ink-2 hover:bg-surface-2 hover:text-ink"
              }`}
            >
              <span>{m.label}</span>
              <span className="text-[10px] font-normal text-ink-3">{m.code}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
