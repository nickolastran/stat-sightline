/*
 * Site footer — attribution and provenance, on every page rather than only the
 * landing one it used to live on. The year is read at render, so it follows the
 * calendar instead of going stale in a string someone has to remember to bump.
 */
const REPO = "https://github.com/nickolastran/stat-sightline";

export default function SiteFooter() {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line px-6 py-4 text-[10px] tracking-wider text-ink-3 sm:px-10">
      <span>
        © {new Date().getFullYear()} NICKOLAS TRAN · STAT//SIGHTLINE v0.1
      </span>
      <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span>DATA: MLB STATCAST. NOT AFFILIATED WITH MLB.</span>
        <a
          href={REPO}
          target="_blank"
          rel="noreferrer"
          className="border border-line px-2 py-1 hover:border-accent hover:text-ink"
        >
          SOURCE ON GITHUB ↗
        </a>
      </span>
    </footer>
  );
}
