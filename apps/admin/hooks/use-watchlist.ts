"use client";

import { useQuery } from "@tanstack/react-query";
import { adminFetch } from "@/lib/admin-fetch";

interface WatchlistEntry {
  tenant_id: string;
  note: string | null;
  created_at: string;
}

const WATCHLIST_KEY = ["admin", "watchlist"] as const;

async function fetchWatchlist(): Promise<{ watchlist: WatchlistEntry[] }> {
  const res = await adminFetch("/api/admin/watchlist");
  if (!res.ok) throw new Error("Failed to fetch watchlist");
  return res.json();
}

/** Stars a shop for this staff login; throws when the server refuses or cannot be reached. */
export async function addToWatchlist(tenantId: string): Promise<unknown> {
  const res = await adminFetch("/api/admin/watchlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenant_id: tenantId }),
  });
  if (!res.ok) throw new Error("Failed to add to watchlist");
  return res.json();
}

/** Takes a shop's star off; throws when the server refuses or cannot be reached. */
export async function removeFromWatchlist(tenantId: string): Promise<unknown> {
  const res = await adminFetch(`/api/admin/watchlist/${tenantId}`, {
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
