/*
 * Thin server-side client for the free public MLB Stats API
 * (statsapi.mlb.com). Called from server components only, so there is no
 * CORS or key concern. Everything here normalizes the raw payloads into the
 * small shapes the dashboard/games pages actually render.
 */
export * from "./core";
export * from "./stats";
export * from "./schedule";
export * from "./boxscore";
export * from "./standings";
export * from "./teams";
export * from "./search";
export * from "./leaders";
export * from "./players";
export * from "./game";
export * from "./career";
export * from "./playerDetail";
export * from "./awards";
