import type { Metadata } from "next";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import ScoreboardBar from "@/components/mlb/ScoreboardBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "STAT//SIGHTLINE — pitch-level MLB analytics",
  description:
    "Pitch-level Statcast warehouse: strike-zone plots, arsenal breakdowns, matchup forecasting.",
};

// Resolve the theme before first paint so there is no flash. Runs before
// React hydrates; the html attribute it sets is why <html> suppresses the
// hydration warning.
const NO_FLASH = `(function(){try{var t=localStorage.getItem('theme');if(!t){t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`;

const NAV = [{ href: "/dashboard", label: "DASHBOARD" }];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
      </head>
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-40 flex h-12 items-center justify-between border-b border-line bg-bg px-4">
          <Link href="/" className="text-sm font-bold tracking-widest">
            STAT<span className="text-accent">//</span>SIGHTLINE
          </Link>
          <nav className="flex items-center gap-px text-xs">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="border border-line px-3 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink"
              >
                {n.label}
              </Link>
            ))}
            <Link
              href="/#access"
              className="border border-accent bg-accent px-3 py-1.5 font-bold text-white hover:opacity-90"
            >
              SIGN IN
            </Link>
            <span className="ml-1">
              <ThemeToggle />
            </span>
          </nav>
        </header>
        <ScoreboardBar />
        {children}
      </body>
    </html>
  );
}
