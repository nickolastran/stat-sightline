import type { Metadata } from "next";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import SiteSearch from "@/components/mlb/SiteSearch";
import LeagueBar from "@/components/mlb/LeagueBar";
import ScoreboardSlot from "@/components/mlb/ScoreboardSlot";
import SiteFooter from "@/components/SiteFooter";
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
      </head>
      {/* A column, so the footer sits at the bottom of a short page rather
          than floating up under the content. */}
      <body className="flex min-h-screen flex-col antialiased">
        <header className="sticky top-0 z-40 flex h-12 items-center justify-between border-b border-line bg-bg px-4">
          <Link href="/" className="text-sm font-bold tracking-widest">
            STAT<span className="text-accent">//</span>SIGHTLINE
          </Link>
          <nav className="flex items-center gap-2 text-xs">
            <SiteSearch />
            <Link
              href="/ask"
              className="border border-line px-3 py-1.5 tracking-widest text-ink-2 hover:border-accent hover:text-ink"
            >
              ASK
            </Link>
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
        <LeagueBar />
        <ScoreboardSlot />
        {/* The page owns its own centred, max-width container. It needs a
            plain block to live in: as a direct flex item its `mx-auto` would
            absorb the free space instead of the box stretching, collapsing
            every page to the width of its content. */}
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
