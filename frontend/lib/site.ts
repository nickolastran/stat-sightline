/*
 * The production origin. Canonical links, the sitemap and structured data all
 * name this one, so a preview deployment's pages point Google at production
 * rather than competing with it.
 */
export const SITE_URL = "https://stat-sightline.vercel.app";

/*
 * The favourite club's id, mirrored out of localStorage into a cookie so a
 * server-rendered page can open on it — the custom stat board's CLUB filter.
 * Here rather than beside the hook because a "use client" module's exports
 * are references, not values, on the server.
 */
export const FAVORITE_COOKIE = "favoriteTeam";
