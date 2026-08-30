import Link from "next/link";
import { teamHref, teamLogo } from "@/lib/mlb";

/*
 * A club's name with its mark, wherever it appears (standings, team stats),
 * pointing at its season page. The team-page counterpart of PlayerLink:
 * navigates in place, and an unknown id degrades to plain text rather than a
 * dead link. No handlers, so it stays a server component and works inside the
 * client tables too.
 */
export default function TeamLink({
  id,
  name,
  className = "",
}: {
  id: number | null | undefined;
  name: string;
  className?: string;
}) {
  const label = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={teamLogo(id ?? 0)}
        alt=""
        width={16}
        height={16}
        className="h-4 w-4 shrink-0"
      />
      <span className="truncate">{name}</span>
    </>
  );

  if (!id)
    return (
      <span className={`flex items-center gap-1.5 ${className}`}>{label}</span>
    );

  return (
    <Link
      href={teamHref(id, name)}
      className={`flex items-center gap-1.5 hover:text-accent ${className}`}
    >
      {label}
    </Link>
  );
}
