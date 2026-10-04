import type { Metadata } from "next";
import Link from "next/link";
import { preconnect } from "react-dom";
import SiteSearch from "@/components/mlb/SiteSearch";
import LeagueBar from "@/components/mlb/LeagueBar";
import ScoreboardSlot from "@/components/mlb/ScoreboardSlot";
import SiteFooter from "@/components/SiteFooter";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  /* "./" resolves against each page's own path, so every page names itself
     as canonical — and drops its query string, which is how ?season= and
     ?view= variants fold into the one page rather than reading as copies. */
  alternates: { canonical: "./" },
  /* The tab, not the page: read at 11px in a strip of other tabs, so it is
     the one place on the site that isn't set in capitals. Every page below
     names only itself and the template hangs the mark off the end. */
  title: {
    default: "Stat//Sightline - Scores, Stats, Advanced Analytics",
    template: "%s - Stat//Sightline",
  },
  description:
    "Live MLB scores, box scores, standings, player and team stats, Statcast analytics, playoff odds and the postseason bracket.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  /* Headshots and logos come off MLB's CDN on nearly every page; opening the
     connections up front takes them off the critical path. */
  preconnect("https://img.mlbstatic.com");
  preconnect("https://www.mlbstatic.com");
  return (
    <html lang="en" data-scroll-behavior="smooth">
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
              href="/signin"
              className="border border-accent bg-accent px-3 py-1.5 font-bold text-white hover:opacity-90"
            >
              SIGN IN
            </Link>
          </nav>
        </header>
        <LeagueBar />
        <ScoreboardSlot />
        {/* The page owns its own centred, max-width container. It needs a
            plain block to live in: as a direct flex item its `mx-auto` would
            absorb the free space instead of the box stretching, collapsing
            every page to the width of its content. At least a screen tall,
            so the footer starts below the fold: pages stream in behind
            skeletons shorter than what replaces them, and a footer sitting
            in view would jump down when they land. */}
        <div className="min-h-screen flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
