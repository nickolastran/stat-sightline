import Link from "next/link";

/*
 * A player's name, wherever it appears (leaderboards, box score lines,
 * probables), pointing at their season summary. Opens in its own tab so the
 * board or box score you were reading stays put — same convention as the
 * gameday link. An unknown id renders as plain text rather than a dead link.
 */
export default function PlayerLink({
  id,
  children,
  className = "",
}: {
  id: number | null | undefined;
  children: React.ReactNode;
  className?: string;
}) {
  if (!id) return <>{children}</>;
  return (
    <Link
      href={`/player/${id}`}
      target="_blank"
      className={`underline decoration-line decoration-dotted underline-offset-2 hover:text-accent hover:decoration-accent ${className}`}
    >
      {children}
    </Link>
  );
}
