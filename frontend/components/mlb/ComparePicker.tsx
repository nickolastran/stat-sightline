"use client";

import { useState } from "react";
import Link from "next/link";
import { useTypeahead } from "@/lib/useTypeahead";
import { useSetParam } from "@/lib/useSetParam";
import type { SearchHit } from "@/lib/mlb";

/*
 * Up to `max` slots of one kind — players or teams — read and written as the
 * `ids` query param. A filled slot is a small card with a way to remove it; an
 * open slot is a typeahead onto the same /api/search the header uses, narrowed
 * to this page's kind so a team search on the player page finds nothing.
 *
 * Identity for the filled slots (name, image, link) comes from the caller
 * rather than a second lookup here — the server page already fetched every
 * selected entity for the rest of the page.
 */

export interface CompareSlot {
  id: number;
  name: string;
  image: string;
  href: string;
}

export default function ComparePicker({
  kind,
  slots,
  max = 4,
}: {
  kind: "player" | "team";
  slots: CompareSlot[];
  max?: number;
}) {
  const setParam = useSetParam();
  const [q, setQ] = useState("");
  const ids = slots.map((s) => s.id);

  const setIds = (next: number[]) => setParam({ ids: next.length ? next.join(",") : null });
  const remove = (id: number) => setIds(ids.filter((i) => i !== id));

  async function search(query: string): Promise<SearchHit[]> {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error(String(res.status));
    const hits = ((await res.json()).hits ?? []) as SearchHit[];
    return hits.filter((h) => h.kind === kind && !ids.includes(h.id));
  }

  const t = useTypeahead<SearchHit>(q, search, (hit) => {
    setQ("");
    setIds([...ids, hit.id]);
  });

  return (
    <div className="flex flex-wrap items-start gap-3">
      {slots.map((s) => (
        <div
          key={s.id}
          className="flex items-center gap-2 rounded border border-line bg-surface py-2 pr-2 pl-3"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.image} alt="" width={32} height={32} className="h-8 w-8 shrink-0" />
          <Link href={s.href} className="max-w-[10rem] truncate text-xs font-bold text-ink hover:text-accent">
            {s.name}
          </Link>
          <button
            type="button"
            aria-label={`Remove ${s.name}`}
            onClick={() => remove(s.id)}
            className="ml-1 rounded-full px-1.5 text-ink-3 hover:bg-surface-2 hover:text-crit"
          >
            ✕
          </button>
        </div>
      ))}
      {slots.length < max && (
        <div ref={t.rootRef} className="relative">
          <input
            type="search"
            role="combobox"
            autoComplete="off"
            aria-expanded={t.open}
            aria-label={`Add ${kind}`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={t.onKeyDown}
            onFocus={() => t.results.length && t.setOpen(true)}
            placeholder={`+ ADD ${kind.toUpperCase()}`}
            className="h-[52px] w-56 rounded border border-dashed border-line bg-bg px-3 text-xs tracking-wide text-ink placeholder:text-ink-3 focus:border-accent focus:border-solid focus:outline-none"
          />
          {t.error && (
            <p className="absolute z-30 mt-px border border-crit bg-surface px-2 py-1 text-[10px] text-crit">
              {t.error}
            </p>
          )}
          {t.open && (
            <ul
              role="listbox"
              className="absolute z-30 mt-px max-h-80 w-72 overflow-y-auto border border-line bg-surface"
            >
              {t.results.length === 0 && (
                <li className="px-3 py-2 text-xs text-ink-3">NO MATCH</li>
              )}
              {t.results.map((hit, i) => (
                <li key={hit.id} role="option" aria-selected={i === t.active}>
                  <button
                    type="button"
                    onMouseEnter={() => t.setActive(i)}
                    onClick={() => t.pick(hit)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${
                      i === t.active ? "bg-surface-2 text-ink" : "text-ink-2"
                    }`}
                  >
                    <span className="truncate">{hit.name}</span>
                    {hit.detail && (
                      <span className="ml-auto shrink-0 truncate text-[10px] text-ink-3">
                        {hit.detail}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
