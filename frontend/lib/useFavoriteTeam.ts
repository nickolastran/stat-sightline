"use client";

import { useSyncExternalStore } from "react";
import { FAVORITE_COOKIE } from "@/lib/site";

/*
 * The reader's favourite club, kept in localStorage — no account needed. It
 * pins that club's game to the front of the scoreboard and puts a MY TEAM tab
 * in the league bar. Its id is mirrored into a cookie, the one copy a server
 * render can read, so the custom stat board opens filtered to it.
 *
 * useSyncExternalStore rather than state, so every component reading it moves
 * together when the star is pressed, and another tab's change (the `storage`
 * event) lands too. The server snapshot is null: the server can't see the
 * browser's storage, so a favourite only appears after hydration.
 */

export type FavoriteTeam = { id: number; name: string };

const KEY = "favoriteTeam";
const EVENT = "favoriteteam"; // same-tab writes; `storage` only fires in others

const read = (): string | null => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // storage blocked — no favourite
  }
};

/* The snapshot has to be referentially stable between unchanged reads, so the
   parse is cached against the raw string it came from. */
let lastRaw: string | null = null;
let lastValue: FavoriteTeam | null = null;

const getSnapshot = (): FavoriteTeam | null => {
  const raw = read();
  if (raw === lastRaw) return lastValue;
  lastRaw = raw;
  try {
    const v = raw ? JSON.parse(raw) : null;
    lastValue =
      v && Number.isInteger(v.id) && typeof v.name === "string" ? v : null;
  } catch {
    lastValue = null;
  }
  return lastValue;
};

const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
};

export function setFavoriteTeam(team: FavoriteTeam | null) {
  try {
    if (team) localStorage.setItem(KEY, JSON.stringify(team));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked — nothing to keep it in */
  }
  document.cookie = team
    ? `${FAVORITE_COOKIE}=${team.id}; path=/; max-age=31536000; samesite=lax`
    : `${FAVORITE_COOKIE}=; path=/; max-age=0`;
  window.dispatchEvent(new Event(EVENT));
}

/* A favourite starred before the cookie existed lives in storage alone; the
   league bar loads this module on every page, so it is copied across once. */
if (typeof window !== "undefined") {
  const fav = getSnapshot();
  if (fav && !document.cookie.includes(`${FAVORITE_COOKIE}=`)) setFavoriteTeam(fav);
}

export const useFavoriteTeam = (): FavoriteTeam | null =>
  useSyncExternalStore(subscribe, getSnapshot, () => null);
