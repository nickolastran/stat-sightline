import type { NextRequest } from "next/server";
import { ogCard } from "@/lib/og";

/* An Ask answer's preview card: the question itself. A route rather than an
   opengraph-image file because the question lives in ?q=, which image files
   never see. The answer stays off — there is no hosted warehouse to ask. */
export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim().slice(0, 160) ?? "";
  return ogCard(
    "ASK",
    q && (
      <div style={{ fontSize: q.length > 60 ? 60 : 80, lineHeight: 1.15 }}>
        {`“${q}”`}
      </div>
    ),
  );
}
