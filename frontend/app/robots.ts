import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/*
 * Player, team and game pages render per request, and every season picker,
 * tab and stat group multiplies them — a crawler following those links walks
 * millions of URLs and bills each one as CPU. The clean URLs carry the
 * canonicals and the sitemap, so the query-string variants are kept out.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/*?", "/game/", "/api/", "/stats/*/csv"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
