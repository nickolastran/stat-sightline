import { INK_3, OG_SIZE, ogCard } from "@/lib/og";
import { getPlayer, playerHeadshot, seasonOf, teamLogo, todayPT } from "@/lib/mlb";

/* Headshot, name, and the season's four headline numbers per line — the same
   four the page's tiles lead with. Sits above the tab catch-all, so every tab
   unfurls as the player. */

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Player card — Stat//Sightline";

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const season = seasonOf(todayPT());
  const p = await getPlayer(Number(id), season).catch(() => null);
  if (!p) return ogCard("PLAYER");

  return ogCard(
    "PLAYER",
    <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={playerHeadshot(p.id, 360)} alt="" width={300} height={300} />
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {p.teamId && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={teamLogo(p.teamId)} alt="" width={64} height={64} />
          )}
          <div style={{ fontSize: 28, letterSpacing: 4, color: INK_3 }}>
            {[p.pos, p.team.toUpperCase()].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div style={{ fontSize: 76, lineHeight: 1 }}>{p.name}</div>
        {p.lines.map((line) => (
          <div key={line.group} style={{ display: "flex", gap: 40 }}>
            {line.stats.slice(0, 4).map(([label, value]) => (
              <div key={label} style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 22, letterSpacing: 3, color: INK_3 }}>
                  {`${season} ${label}`}
                </div>
                <div style={{ fontSize: 56 }}>{value}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>,
  );
}
