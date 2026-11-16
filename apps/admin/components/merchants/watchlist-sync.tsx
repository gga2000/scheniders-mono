"use client";

import { useEffect, useRef } from "react";
import { useAdminStore } from "@/store/use-admin-store";
import { useWatchlist } from "@/hooks/use-watchlist";

// Mounts once at the app shell. Keeps the localStorage-backed Zustand
// `starredMerchants` and the DB-backed `admin_watchlist` table in sync.
// - On mount: hydrates Zustand from the API (API is source of truth).
// - On change: fires fire-and-forget POST/DELETE for diff vs. last server state.
export function WatchlistSync() {
  const { data } = useWatchlist();
  const starred = useAdminStore((s) => s.starredMerchants);
  const setStarred = useAdminStore.setState;
  const hydratedRef = useRef(false);
  const lastRemoteRef = useRef<Set<string>>(new Set());

  // 1. One-time hydration from API → Zustand (merge: API wins on conflict).
  useEffect(() => {
    if (hydratedRef.current || !data) return;
    hydratedRef.current = true;

    const remote = new Set(data.watchlist.map((e) => e.tenant_id));
    lastRemoteRef.current = remote;

    setStarred((prev) => {
      const merged = Array.from(new Set([...remote, ...prev.starredMerchants]));
      return { starredMerchants: merged };
    });
  }, [data, setStarred]);

  // 2. After hydration, sync local changes back to the API.
  useEffect(() => {
    if (!hydratedRef.current) return;

    const local = new Set(starred);
    const remote = lastRemoteRef.current;

    const added = [...local].filter((id) => !remote.has(id));
    const removed = [...remote].filter((id) => !local.has(id));

    if (added.length === 0 && removed.length === 0) return;

    added.forEach((tenantId) => {
      void fetch("/api/admin/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId }),
      }).catch(() => {});
    });
    removed.forEach((tenantId) => {
      void fetch(`/api/admin/watchlist/${tenantId}`, { method: "DELETE" }).catch(() => {});
    });

    lastRemoteRef.current = new Set(local);
  }, [starred]);

  return null;
}
