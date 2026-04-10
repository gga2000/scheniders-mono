"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import type { AdminTenant } from "@/types/admin";
import { useAdminStore } from "@/store/use-admin-store";
import { useMemo } from "react";

interface MerchantsPage {
  merchants: AdminTenant[];
  total: number;
  page: number;
  limit: number;
}

export function useInfiniteMerchants(limit = 50) {
  const {
    planFilter,
    statusFilter,
    cityFilter,
    balanceFilter,
    healthFilter,
    searchQuery,
    dateRange,
    sortConfig,
    starredMerchants,
  } = useAdminStore();

  const sortParam = sortConfig.length > 0
    ? sortConfig.map((s) => `${s.column}:${s.direction}`).join(",")
    : "created_at:desc";

  const query = useInfiniteQuery<MerchantsPage>({
    queryKey: [
      "admin",
      "merchants",
      "infinite",
      {
        limit,
        planFilter,
        statusFilter,
        cityFilter,
        balanceFilter,
        healthFilter,
        searchQuery,
        dateRange,
        sortParam,
      },
    ],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("page", String(pageParam));
      params.set("limit", String(limit));
      params.set("sort", sortParam);
      params.set("include_sparkline", "true");
      if (planFilter) params.set("plan", planFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (cityFilter) params.set("city", cityFilter);
      if (balanceFilter) params.set("balance", balanceFilter);
      if (healthFilter) params.set("health", healthFilter);
      if (searchQuery) params.set("search", searchQuery);
      if (dateRange.from) params.set("date_from", dateRange.from);
      if (dateRange.to) params.set("date_to", dateRange.to);

      const res = await fetch(`/api/merchants?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch merchants");
      return res.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const loaded = lastPage.page * lastPage.limit;
      return loaded < lastPage.total ? lastPage.page + 1 : undefined;
    },
    staleTime: 30_000,
  });

  // Flatten pages into a single list with starred merchants sorted to the top
  const merchants = useMemo(() => {
    const flat = query.data?.pages.flatMap((p) => p.merchants) ?? [];
    if (starredMerchants.length === 0) return flat;

    const starredSet = new Set(starredMerchants);
    const starred = flat.filter((m) => starredSet.has(m.id));
    const unstarred = flat.filter((m) => !starredSet.has(m.id));
    return [...starred, ...unstarred];
  }, [query.data?.pages, starredMerchants]);

  const total = query.data?.pages[0]?.total ?? 0;

  return {
    ...query,
    merchants,
    total,
  };
}
