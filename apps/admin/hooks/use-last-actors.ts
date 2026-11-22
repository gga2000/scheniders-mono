"use client";

import { useQueries, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/admin-fetch";

export interface LastActor {
  display_name: string;
  email: string | null;
  avatar_url: string | null;
  action: string;
  when: string;
  is_system: boolean;
}

/**
 * Shops asked for in one request at most: the Merchants list's page size. Each
 * page of shops the server sent asks for its own badges, so a page that loads
 * asks for its shops only, and starring a shop, which moves it up the list,
 * asks for nothing. The route takes at most 200 (R3-6, round 23 new 3).
 */
export const LAST_ACTORS_CHUNK = 50;

export interface LastActors {
  /** The last staff step on each shop, keyed by shop id. A shop with none is absent. */
  actors: Record<string, LastActor>;
  /**
   * Some shops' badges could not be read, so those shops show none. That is
   * not "no staff step", so the page says so with Try again.
   */
  failed: boolean;
  error: unknown;
  retrying: boolean;
  retry: () => void;
}

/**
 * Under the shop list's own key, so every step that reads the list again after
 * a change (the shop page's panels, the card's status and plan, bulk steps)
 * reads the badges again too, and a badge never names the step before the
 * one just done (round 24 data new 2).
 */
export const LAST_ACTORS_KEY = ["admin", "merchants", "last-actors"] as const;

/**
 * The badges already read for these shops, from any page's answer. A new shop
 * at the top moves one shop from each page to the next, so every page asks
 * again under a new key; until it answers, each shop keeps the badge it had
 * (round 24 structure new 7). Undefined when none of them was read yet.
 */
function knownActors(client: QueryClient, ids: readonly string[]): Record<string, LastActor> | undefined {
  const known = new Map<string, LastActor>();
  for (const [, answer] of client.getQueriesData<Record<string, LastActor>>({ queryKey: LAST_ACTORS_KEY })) {
    for (const [id, actor] of Object.entries(answer ?? {})) known.set(id, actor);
  }
  const kept = ids.flatMap((id) => {
    const actor = known.get(id);
    return actor ? [[id, actor] as const] : [];
  });
  return kept.length > 0 ? Object.fromEntries(kept) : undefined;
}

/** `pages`: the shop ids of each page the server sent, in its own order. */
export function useLastActors(pages: readonly (readonly string[])[]): LastActors {
  const client = useQueryClient();
  const chunks: string[][] = [];
  for (const page of pages) {
    for (let i = 0; i < page.length; i += LAST_ACTORS_CHUNK) {
      chunks.push(page.slice(i, i + LAST_ACTORS_CHUNK));
    }
  }
  return useQueries({
    queries: chunks.map((ids) => ({
      queryKey: [...LAST_ACTORS_KEY, [...ids].sort().join(",")],
      queryFn: async (): Promise<Record<string, LastActor>> => {
        const res = await adminFetch("/api/admin/last-actors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenant_ids: ids }),
        });
        if (!res.ok) throw new Error("Failed to fetch last actors");
        return ((await res.json()) as { actors: Record<string, LastActor> }).actors;
      },
      staleTime: 60_000,
      placeholderData: () => knownActors(client, ids),
    })),
    combine: (results) => {
      // A chunk that keeps an earlier answer still shows its badges.
      const lost = results.filter((r) => r.isError && r.data === undefined);
      return {
        actors: Object.assign({}, ...results.map((r) => r.data ?? {})) as Record<string, LastActor>,
        failed: lost.length > 0,
        error: lost[0]?.error,
        retrying: lost.some((r) => r.isFetching),
        retry: () => {
          for (const r of lost) void r.refetch();
        },
      };
    },
  });
}
