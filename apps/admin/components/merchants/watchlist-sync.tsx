"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAdminStore } from "@/store/use-admin-store";
import { addToWatchlist, removeFromWatchlist, useWatchlist } from "@/hooks/use-watchlist";

// Mounts once at the app shell. Keeps the localStorage-backed Zustand
// `starredMerchants` and the DB-backed `admin_watchlist` table in sync.
// - On mount: hydrates Zustand from the API (API is source of truth).
// - On change: sends a POST/DELETE for each difference from the last server
//   state. A refused or lost save is undone, so the star shows what the
//   server keeps, and staff are told.
export function WatchlistSync() {
  const { data } = useWatchlist();
  const starred = useAdminStore((s) => s.starredMerchants);
  const setStarred = useAdminStore.setState;
  const hydratedRef = useRef(false);
  const lastRemoteRef = useRef<Set<string>>(new Set());

  // One effect, so the render that brings the server's stars never sends
  // anything: as two effects, the sync one ran in that same commit with the
  // browser's old list and took every server star off, then put it back.
  useEffect(() => {
    if (!data) return;

    // First read: merge the server's stars into this browser's (API wins on
    // conflict). The merged list comes back through `starred` next render.
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      const remote = new Set(data.watchlist.map((e) => e.tenant_id));
      lastRemoteRef.current = remote;
      setStarred((prev) => ({ starredMerchants: Array.from(new Set([...remote, ...prev.starredMerchants])) }));
      return;
    }

    // After that, send each change from the last server state.
    const local = new Set(starred);
    const remote = lastRemoteRef.current;
    const added = [...local].filter((id) => !remote.has(id));
    const removed = [...remote].filter((id) => !local.has(id));
    if (added.length === 0 && removed.length === 0) return;

    lastRemoteRef.current = new Set(local);

    const undo = (tenantId: string, starredNow: boolean) => {
      if (starredNow) lastRemoteRef.current.delete(tenantId);
      else lastRemoteRef.current.add(tenantId);
      setStarred((prev) => ({
        starredMerchants: starredNow
          ? prev.starredMerchants.filter((id) => id !== tenantId)
          : [...prev.starredMerchants, tenantId],
      }));
      toast.error(starredNow ? "The star was not saved. Try again." : "The star was not taken off. Try again.");
    };
    added.forEach((tenantId) => void addToWatchlist(tenantId).catch(() => undo(tenantId, true)));
    removed.forEach((tenantId) => void removeFromWatchlist(tenantId).catch(() => undo(tenantId, false)));
  }, [data, starred, setStarred]);

  return null;
}
