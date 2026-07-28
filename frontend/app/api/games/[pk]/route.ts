import { getBoxScore } from "@/lib/mlb";

/*
 * Same-origin proxy for one game's box score, fetched on demand when a card
 * in the scoreboard strip is opened. Mirrors ../route.ts: reuses lib/mlb's
 * cached server fetch and reports failure as a flag the client can render.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ pk: string }> }
) {
  const { pk } = await ctx.params;
  if (!/^\d+$/.test(pk))
    return Response.json({ error: true }, { status: 400 });
  try {
    return Response.json({ box: await getBoxScore(Number(pk)) });
  } catch {
    return Response.json({ error: true }, { status: 502 });
  }
}
