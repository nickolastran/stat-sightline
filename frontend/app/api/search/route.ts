import { searchAll } from "@/lib/mlb";

/*
 * Same-origin proxy for the header search, the counterpart of /api/games:
 * the typeahead runs in the browser, and this keeps it off statsapi's
 * cross-origin surface while reusing lib/mlb's cached server fetch.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  try {
    return Response.json({ hits: await searchAll(q) });
  } catch {
    return Response.json({ hits: [], error: true }, { status: 502 });
  }
}
