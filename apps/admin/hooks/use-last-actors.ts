"use client";

import { useQuery } from "@tanstack/react-query";

export interface LastActor {
  display_name: string;
  email: string | null;
  avatar_url: string | null;
  action: string;
  when: string;
  is_system: boolean;
}

export function useLastActors(tenantIds: string[]) {
  const sortedKey = [...tenantIds].sort().join(",");
  return useQuery<{ actors: Record<string, LastActor> }>({
    queryKey: ["admin", "last-actors", sortedKey],
    queryFn: async () => {
      if (tenantIds.length === 0) return { actors: {} };
      const res = await fetch("/api/admin/last-actors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_ids: tenantIds }),
      });
      if (!res.ok) throw new Error("Failed to fetch last actors");
      return res.json();
    },
    enabled: tenantIds.length > 0,
    staleTime: 60_000,
  });
}

export function useLastActor(tenantId: string | null) {
  const ids = tenantId ? [tenantId] : [];
  const { data, ...rest } = useLastActors(ids);
  return {
    ...rest,
    actor: tenantId ? data?.actors[tenantId] ?? null : null,
  };
}
