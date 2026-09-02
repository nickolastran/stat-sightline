import Link from "next/link";
import { playerHeadshot } from "@/lib/mlb";

/*
 * A player's name, wherever it appears (leaderboards, box score lines,
 * probables), pointing at their season summary. Navigates in place. An
 * unknown id renders as plain text rather than a dead link.
 *
 * The headshot rides along with the name so every list of players reads the
 * same; MLB serves a silhouette for anyone it has no photo of, so there is no
 * broken-image case to handle. `headshot={false}` for the few places a face
 * would crowd the line.
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
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={playerHeadshot(id)}
          alt=""
          width={20}
          height={20}
          loading="lazy"
          className="h-5 w-5 shrink-0 rounded-full bg-surface-2"
        />
      )}
      <span className="truncate underline decoration-line decoration-dotted underline-offset-2 group-hover/pl:decoration-accent">
        {children}
      </span>
    </Link>
  );
}
