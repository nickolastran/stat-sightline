import { INK_3, OG_SIZE, ogCard } from "@/lib/og";
import { gameDay, getGame, notStarted, teamLogo, type GameSide } from "@/lib/mlb";

/* Both logos and the score — or the records, before first pitch — with the
   state of play and the day underneath. */

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Game card — Stat//Sightline";

export default async function Image({
  params,
}: {
  params: Promise<{ pk: string }>;
}) {
  const { pk } = await params;
  const g = await getGame(Number(pk)).catch(() => null);
  if (!g) return ogCard("GAME");

  const pre = notStarted(g);
  const side = (t: GameSide) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 300 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={teamLogo(t.id)} alt="" width={180} height={180} />
      <div style={{ fontSize: 40, letterSpacing: 4, marginTop: 16 }}>{t.abbr}</div>
      <div style={{ fontSize: 24, color: INK_3 }}>
        {t.wins !== null ? `${t.wins}-${t.losses}` : ""}
      </div>
    </div>
  );
  const status =
    g.state === "Live" && !pre && g.inning
      ? `${g.inningState ?? ""} ${g.inning}`.trim().toUpperCase()
      : g.detailedState.toUpperCase();

  return ogCard(
    g.series ?? "GAME",
    <div style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between" }}>
      {side(g.away)}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ fontSize: 140, lineHeight: 1 }}>
          {pre ? "@" : `${g.away.score ?? 0} – ${g.home.score ?? 0}`}
        </div>
        <div style={{ fontSize: 30, letterSpacing: 4, marginTop: 24 }}>{status}</div>
        <div style={{ fontSize: 24, color: INK_3, marginTop: 8 }}>
          {[gameDay(g.startTime), g.venue].filter(Boolean).join(" · ")}
        </div>
      </div>
      {side(g.home)}
    </div>,
  );
}
