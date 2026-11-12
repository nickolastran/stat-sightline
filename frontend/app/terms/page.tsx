import type { Metadata } from "next";
import { DocPage, DocSection } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using Stat//Sightline: free, as-is, unofficial, and not betting advice.",
};

const link = "text-ink underline decoration-dotted underline-offset-2 hover:text-accent";

export default function TermsPage() {
  return (
    <DocPage kicker="TERMS // USING THE SITE" title="TERMS OF SERVICE" updated="NOV 12, 2026">
      <p>
        By using Stat//Sightline you agree to these terms. They&apos;re short, since the
        site is free and personal.
      </p>

      <DocSection title="AN UNOFFICIAL, PERSONAL PROJECT">
        <p>
          Stat//Sightline is an independent project. It isn&apos;t affiliated with,
          endorsed by or sponsored by Major League Baseball, MLB Advanced Media, any
          club, Baseball Savant or FanGraphs. Team names, logos and player images
          belong to their owners and are shown only to identify the teams and players.
        </p>
      </DocSection>

      <DocSection title="THE DATA">
        <p>
          Stats come from public sources (the MLB Stats API, Baseball Savant and
          FanGraphs) and belong to their owners. They can be delayed, incomplete or
          wrong, and live game data can lag the broadcast. Use of that data is subject
          to their own terms, including{" "}
          <a href="http://gdx.mlb.com/components/copyright.txt" target="_blank" rel="noreferrer" className={link}>
            MLB&apos;s copyright notice
          </a>
          .
        </p>
      </DocSection>

      <DocSection title="PROJECTIONS ARE NOT ADVICE">
        <p>
          Playoff odds, series odds, matchup forecasts, projections and other model
          outputs are estimates for entertainment and analysis. They are not betting,
          fantasy or financial advice, and you rely on them at your own risk.
        </p>
      </DocSection>

      <DocSection title="FAIR USE OF THE SITE">
        <p>
          Browse, share links and download the CSV exports freely. Please don&apos;t
          scrape the site at volume, overload it with automated requests, or try to
          break or get around how it works. Access may be limited for traffic that
          does.
        </p>
      </DocSection>

      <DocSection title="THE CODE">
        <p>
          The site&apos;s source is open under the MIT License on{" "}
          <a href="https://github.com/nickolastran/stat-sightline" target="_blank" rel="noreferrer" className={link}>
            GitHub
          </a>
          . That license covers the code, not the third-party data or images the site
          displays.
        </p>
      </DocSection>

      <DocSection title="NO WARRANTY">
        <p>
          The site is provided &ldquo;as is&rdquo;, without warranty of any kind, and may
          change, break or go offline at any time. To the extent the law allows, the
          operator isn&apos;t liable for any loss arising from your use of it.
        </p>
      </DocSection>

      <DocSection title="CHANGES">
        <p>
          These terms may be updated; the date at the top shows the latest version.
          Continuing to use the site after a change means you accept it.
        </p>
      </DocSection>
    </DocPage>
  );
}
