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
 * Load the org-wide leads-table layout. Always resolves to a fully-normalized
 * ResolvedLayout (never null) so consumers never branch on "no saved layout".
 */
export function useLeadsTableLayout() {
  return useQuery({
    queryKey: LAYOUT_KEY,
    queryFn: async (): Promise<ResolvedLayout> => {
      const res = await adminFetch("/api/admin/leads-table-layout");
      if (!res.ok) throw new Error("Failed to load layout");
      const json = (await res.json()) as { layout: unknown };
      const parsed = layoutSchema.safeParse(json.layout);
      return resolveLeadLayout(parsed.success ? parsed.data : null);
    },
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
      qc.invalidateQueries({ queryKey: LAYOUT_KEY });
    },
  });
}
