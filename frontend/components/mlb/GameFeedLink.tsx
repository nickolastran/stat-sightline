import { gamedayUrl } from "@/lib/mlb";

/*
 * ↗ to MLB's live Gameday feed for one game, in its own tab. Sits over the
 * card in the scoreboard rail and in the box score header — the card body
 * itself still opens our own box score, so this is a plain anchor that sits
 * beside that button rather than nesting inside it (invalid HTML, and it
 * would swallow the card's click). No handlers, so it stays a server
 * component and works inside the server-rendered probables list too.
 */
export default function GameFeedLink({
  pk,
  label,
  className = "",
}: {
  pk: number;
  label: string;
  className?: string;
}) {
  return (
    <a
      href={gamedayUrl(pk)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open MLB Gameday feed for ${label} in a new tab`}
      title="MLB Gameday feed (new tab)"
      className={`flex h-5 w-5 items-center justify-center border border-line bg-bg text-[10px] leading-none text-ink-3 hover:border-accent hover:text-accent ${className}`}
    >
      <span aria-hidden>↗</span>
    </a>
  );
}
