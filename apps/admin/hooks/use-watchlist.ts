"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface WatchlistEntry {
  tenant_id: string;
  note: string | null;
  created_at: string;
}

const WATCHLIST_KEY = ["admin", "watchlist"] as const;

async function fetchWatchlist(): Promise<{ watchlist: WatchlistEntry[] }> {
  const res = await fetch("/api/admin/watchlist");
  if (!res.ok) throw new Error("Failed to fetch watchlist");
  return res.json();
}

async function addToWatchlist(tenantId: string): Promise<unknown> {
  const res = await fetch("/api/admin/watchlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenant_id: tenantId }),
  });
  if (!res.ok) throw new Error("Failed to add to watchlist");
  return res.json();
}

async function removeFromWatchlist(tenantId: string): Promise<unknown> {
  const res = await fetch(`/api/admin/watchlist/${tenantId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to remove from watchlist");
  return res.json();
}

export function useWatchlist() {
  return useQuery({
    queryKey: WATCHLIST_KEY,
    queryFn: fetchWatchlist,
    staleTime: 5 * 60 * 1000,
  });
}

export function useToggleWatchlist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      tenantId,
      starred,
    }: {
      tenantId: string;
      starred: boolean;
    }) => {
      // If currently starred → remove. Otherwise → add.
      return starred ? removeFromWatchlist(tenantId) : addToWatchlist(tenantId);
    },
    onMutate: async ({ tenantId, starred }) => {
      await queryClient.cancelQueries({ queryKey: WATCHLIST_KEY });
      const previous = queryClient.getQueryData<{ watchlist: WatchlistEntry[] }>(
        WATCHLIST_KEY
      );
      queryClient.setQueryData<{ watchlist: WatchlistEntry[] }>(
        WATCHLIST_KEY,
        (old) => {
          const list = old?.watchlist ?? [];
          if (starred) {
            return { watchlist: list.filter((e) => e.tenant_id !== tenantId) };
          }
          return {
            watchlist: [
              { tenant_id: tenantId, note: null, created_at: new Date().toISOString() },
              ...list,
            ],
          };
        }
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(WATCHLIST_KEY, ctx.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: WATCHLIST_KEY });
    },
  });
}

export function useIsStarred(tenantId: string): boolean {
  const { data } = useWatchlist();
  return !!data?.watchlist.some((e) => e.tenant_id === tenantId);
}
