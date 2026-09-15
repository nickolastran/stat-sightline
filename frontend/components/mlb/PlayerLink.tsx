import Link from "next/link";
import { playerHeadshot } from "@/lib/mlb";

/*
 * A player's name, wherever it appears (leaderboards, box score lines,
 * probables), pointing at their season summary. Navigates in place. An
 * unknown id renders as plain text rather than a dead link.
 *
 * The headshot rides along with the name so every list of players reads the
 * same. It is a background rather than an `<img>` because MLB 404s on anyone
 * it has no photo of — most of the men on an award page's early decades — and
 * a background that fails to load leaves the gap the name sits beside, where
 * an image that fails leaves a broken frame. `headshot={false}` for the few
 * places a face would crowd the line.
 */
export default function PlayerLink({
  id,
  children,
  className = "",
  headshot = true,
}: {
  id: number | null | undefined;
  children: React.ReactNode;
  className?: string;
  headshot?: boolean;
}) {
  if (!id) return <>{children}</>;
  return (
    <Link
      href={`/player/${id}`}
      className={`group/pl inline-flex max-w-full min-w-0 items-center gap-1.5 align-middle hover:text-accent ${className}`}
    >
      {headshot && (
        <span
          aria-hidden
          style={{ backgroundImage: `url(${playerHeadshot(id)})` }}
          className="h-5 w-5 shrink-0 bg-contain bg-center bg-no-repeat"
        />
      )}
      <span className="truncate underline decoration-line decoration-dotted underline-offset-2 group-hover/pl:decoration-accent">
        {children}
      </span>
    </Link>
  );
}
