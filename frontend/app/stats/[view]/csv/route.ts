import { NextResponse } from "next/server";
import { getClubs, seasonOf, todayPT, type Club } from "@/lib/mlb";
import {
  csvOf,
  getCustomBoard,
  pickAdvSeason,
  pickCustomQuery,
} from "@/lib/advanced";

/*
 * The custom board as a file.
 *
 * It takes the same query string the page does and builds the same board from
 * it, rather than the page handing its rows to the browser to write out: the
 * board is already a server read, the feeds behind it are cached for the hour,
 * and this way the download is a plain link — copyable, and no different to a
 * reader than any other one on the site.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ view: string }> },
) {
  const { view } = await params;
  if (view !== "custom") return new NextResponse("Not found", { status: 404 });

  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const season = pickAdvSeason(sp.season, seasonOf(todayPT()));
  const clubs = await getClubs().catch(() => [] as Club[]);
  const query = pickCustomQuery(sp, new Set(clubs.map((c) => String(c.id))));
  if (query.cols.length === 0)
    return new NextResponse("No columns chosen", { status: 400 });

  const board = await getCustomBoard(season, query);
  return new NextResponse(
    csvOf(board.columns, board.rows, board.rows.some((r) => r.position)),
    {
      headers: {
        "content-type": "text/csv;charset=utf-8",
        "content-disposition": `attachment; filename="${query.group}-${season}${
          query.rookies ? "-rookies" : ""
        }.csv"`,
      },
    },
  );
}
