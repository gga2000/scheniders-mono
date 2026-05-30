"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import type { AdminTenant } from "@/types/admin";
import { useAdminStore } from "@/store/use-admin-store";
import {
  getMerchantCode,
  isMerchantCodeQuery,
  normalizeMerchantCodeQuery,
} from "@scheniders/shared";
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

  const isCodeSearch = isMerchantCodeQuery(searchQuery);
  const codePrefix = isCodeSearch ? normalizeMerchantCodeQuery(searchQuery) : null;
  const apiSearch = isCodeSearch ? "" : searchQuery;

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
      // "attention" is resolved server-side via id allowlist (see API route)
      if (statusFilter) params.set("status", statusFilter);
      if (cityFilter) params.set("city", cityFilter);
      if (balanceFilter) params.set("balance", balanceFilter);
      if (healthFilter) params.set("health", healthFilter);
      if (apiSearch) params.set("search", apiSearch);
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

  // Flatten pages, apply the merchant-code prefix filter (client-only since
  // codes are derived from ids), then float starred to top.
  const merchants = useMemo(() => {
    let flat = query.data?.pages.flatMap((p) => p.merchants) ?? [];

    if (codePrefix) {
      flat = flat.filter((m) => getMerchantCode(m).includes(codePrefix));
    }

    if (starredMerchants.length === 0) return flat;

    const starredSet = new Set(starredMerchants);
    const starred = flat.filter((m) => starredSet.has(m.id));
    const unstarred = flat.filter((m) => !starredSet.has(m.id));
    return [...starred, ...unstarred];
  }, [query.data?.pages, starredMerchants, codePrefix]);

  const rawTotal = query.data?.pages[0]?.total ?? 0;
  const total = codePrefix ? merchants.length : rawTotal;

  return {
    ...query,
    merchants,
    total,
  };
}
