"use client";

import { useQuery } from "@tanstack/react-query";
import { adminFetch } from "@/lib/admin-fetch";
import { answerLostWords } from "@/lib/answer-lost";
import { sendStep } from "@/lib/send-json";

/** Starring twice keeps one star, so a lost answer only needs a look. */
const STAR_UNSURE = answerLostWords("the star");

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
  return sendStep<unknown>("/api/admin/watchlist", { tenant_id: tenantId }, "POST", STAR_UNSURE, "The star was not added.");
}

/** Takes a shop's star off; throws when the server refuses or cannot be reached. */
export async function removeFromWatchlist(tenantId: string): Promise<unknown> {
  return sendStep<unknown>(`/api/admin/watchlist/${tenantId}`, undefined, "DELETE", STAR_UNSURE, "The star was not taken off.");
}

export function useWatchlist() {
  return useQuery({
    queryKey: WATCHLIST_KEY,
    queryFn: fetchWatchlist,
    staleTime: 5 * 60 * 1000,
  });
}
