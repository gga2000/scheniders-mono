"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminFetch } from "@/lib/admin-fetch";
import {
  layoutSchema,
  resolveLeadLayout,
  serializeLayout,
  type ResolvedLayout,
} from "@/lib/leads-table-layout";

/** Single global key — there is exactly one shared, org-wide layout. */
const LAYOUT_KEY = ["leads-table-layout"] as const;

/**
 * Per-browser cache of the last layout this client saw. Used purely as the
 * query's synchronous placeholder so a reload paints the correct column order on
 * the FIRST frame instead of flashing the default order and snapping once the
 * network resolves. The network fetch is still authoritative and reconciles it.
 */
const LS_CACHE_KEY = "scheniders.leads-table-layout";

function readCachedLayout(): ResolvedLayout | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(LS_CACHE_KEY);
    if (!raw) return undefined;
    const parsed = layoutSchema.safeParse(JSON.parse(raw));
    return parsed.success ? resolveLeadLayout(parsed.data) : undefined;
  } catch {
    // localStorage unavailable (private mode) or malformed JSON — fall back to
    // the network fetch; this cache is only a first-paint optimization.
    return undefined;
  }
}

function writeCachedLayout(layout: ResolvedLayout): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_CACHE_KEY, JSON.stringify(serializeLayout(layout)));
  } catch {
    // localStorage write can throw (quota / disabled) — non-fatal for a cache.
  }
}

/**
 * Load the org-wide leads-table layout. Always resolves to a fully-normalized
 * ResolvedLayout (never null). Hydrates instantly from the per-browser cache to
 * avoid a column-order flash on reload, then reconciles with the server.
 */
export function useLeadsTableLayout() {
  return useQuery({
    queryKey: LAYOUT_KEY,
    queryFn: async (): Promise<ResolvedLayout> => {
      const res = await adminFetch("/api/admin/leads-table-layout");
      if (!res.ok) throw new Error("Failed to load layout");
      const json = (await res.json()) as { layout: unknown };
      const parsed = layoutSchema.safeParse(json.layout);
      const resolved = resolveLeadLayout(parsed.success ? parsed.data : null);
      writeCachedLayout(resolved);
      return resolved;
    },
    // Synchronous first-paint value from localStorage (undefined on first-ever visit).
    placeholderData: () => readCachedLayout(),
    staleTime: 60_000,
  });
}

/**
 * Persist the layout for everyone (super_admin only — the route 403s others).
 * On success the cache is updated immediately so the saver converges at once;
 * other employees pick up the shared layout on their next refetch.
 */
export function useSaveLeadsTableLayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (layout: ResolvedLayout): Promise<ResolvedLayout> => {
      const res = await adminFetch("/api/admin/leads-table-layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serializeLayout(layout)),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to save layout");
      }
      const json = (await res.json()) as { layout: unknown };
      const parsed = layoutSchema.safeParse(json.layout);
      return resolveLeadLayout(parsed.success ? parsed.data : null);
    },
    onSuccess: (resolved) => {
      qc.setQueryData<ResolvedLayout>(LAYOUT_KEY, resolved);
      writeCachedLayout(resolved);
      qc.invalidateQueries({ queryKey: LAYOUT_KEY });
    },
  });
}
