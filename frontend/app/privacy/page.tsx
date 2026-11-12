import type { Metadata } from "next";
import Link from "next/link";
import { DocPage, DocSection } from "@/components/DocPage";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Stat//Sightline stores about you: almost nothing. No accounts, no analytics, no tracking.",
};

/* Keep in step with the code: lib/useFavoriteTeam.ts is the only thing the
   site writes to a browser, and nothing here sends data to a third party. */
export default function PrivacyPage() {
  return (
    <DocPage kicker="PRIVACY // WHAT WE KEEP" title="PRIVACY POLICY" updated="NOV 12, 2026">
      <p>
        Stat//Sightline is a free baseball stats site. You don&apos;t need an account to
        use it, and it doesn&apos;t collect personal information. Here is everything it
        stores and where your requests go.
      </p>

      <DocSection title="NO ACCOUNTS, NO ANALYTICS">
        <p>
          There are no sign-ups, no analytics scripts, no ad networks and no tracking
          pixels. The site doesn&apos;t build a profile of you or sell anything about
          you.
        </p>
      </DocSection>

      <DocSection title="WHAT YOUR BROWSER KEEPS">
        <p>
          If you star a favorite team, its id and name are saved in your browser&apos;s
          local storage, and the id is copied into a <code>favoriteTeam</code> cookie
          so pages can open filtered to that club. That&apos;s the only thing the site
          saves. It stays on your device, and you can remove it by un-starring the
          team or clearing this site&apos;s data in your browser.
        </p>
      </DocSection>

      <DocSection title="ASK QUESTIONS">
        <p>
          Questions typed into Ask are sent to the site&apos;s own server and answered
          by a rule-based parser over our own stats database. They aren&apos;t sent to
          any AI service or other third party, and they aren&apos;t saved to an
          account. A question appears in the page link so you can share it.
        </p>
      </DocSection>

      <DocSection title="SERVER LOGS">
        <p>
          The site runs on Vercel, and its API on a hosting provider. Like any web
          host, they keep standard request logs (IP address, page requested, browser
          type, time) for a limited period to operate and secure the service. We
          don&apos;t use these logs to identify visitors.
        </p>
      </DocSection>

      <DocSection title="THIRD-PARTY CONTENT">
        <p>
          Player headshots and team logos load straight from MLB&apos;s image servers,
          which see that request as they would on any site that shows them. Stats come
          from MLB, Baseball Savant and FanGraphs; the site fetches them on its own
          server, not from your browser.
        </p>
      </DocSection>

      <DocSection title="CHANGES">
        <p>
          If this ever changes (for example, if accounts arrive), this page will be
          updated first and the change noted in the{" "}
          <Link href="/changelog" className="text-ink underline decoration-dotted underline-offset-2 hover:text-accent">
            changelog
          </Link>
          .
        </p>
      </DocSection>
    </DocPage>
  );
}
