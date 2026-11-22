"use client";

import { useQueries } from "@tanstack/react-query";
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
 * Shops asked for in one request: the Merchants list's page size. A page that
 * loads asks for its own shops only, and the shops already shown keep theirs;
 * the route takes at most 200, so a long list never loses every badge (R3-6).
 */
export const LAST_ACTORS_CHUNK = 50;

/** The last staff step on each shop, keyed by shop id. A shop with none is absent. */
export function useLastActors(tenantIds: string[]): Record<string, LastActor> {
  const chunks: string[][] = [];
  for (let i = 0; i < tenantIds.length; i += LAST_ACTORS_CHUNK) {
    chunks.push(tenantIds.slice(i, i + LAST_ACTORS_CHUNK));
  }
  return useQueries({
    queries: chunks.map((ids) => ({
      queryKey: ["admin", "last-actors", [...ids].sort().join(",")],
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
    })),
    combine: (results) => Object.assign({}, ...results.map((r) => r.data ?? {})) as Record<string, LastActor>,
  });
}
