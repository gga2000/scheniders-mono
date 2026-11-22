"use client";

import { useInfiniteQuery, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import type { AdminTenant } from "@/types/admin";
import { useAdminStore } from "@/store/use-admin-store";
import { DEFAULT_MERCHANT_SORT } from "@/lib/merchant-sort";
import { useMemo } from "react";
import { adminFetch } from "@/lib/admin-fetch";

interface MerchantsPage {
  merchants: AdminTenant[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Optimistically change one merchant in every loaded merchants list. Returns a
 * function that puts every list back as it was, for when the server refuses
 * the change or the request fails: the card must not keep showing a status or
 * plan the shop does not have while the list is read again.
 */
export function patchMerchantInCache(
  queryClient: QueryClient,
  merchantId: string,
  patch: Partial<AdminTenant>,
): () => void {
  const before = queryClient.getQueriesData({ queryKey: ["admin", "merchants"] });
  queryClient.setQueriesData<InfiniteData<MerchantsPage>>({ queryKey: ["admin", "merchants"] }, (old) => {
    // Other queries share the key prefix; only the paged list has `pages`.
    if (!old?.pages) return old;
    return {
      ...old,
      pages: old.pages.map((page) => ({
        ...page,
        merchants: page.merchants.map((m) => (m.id === merchantId ? { ...m, ...patch } : m)),
      })),
    };
  });
  return () => {
    for (const [queryKey, data] of before) queryClient.setQueryData(queryKey, data);
  };
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

  // The store keeps only columns the database can order every shop by.
  const sortParam = sortConfig.length > 0
    ? sortConfig.map((s) => `${s.column}:${s.direction}`).join(",")
    : DEFAULT_MERCHANT_SORT;

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
      // The server searches every shop, by name, slug, email or shop number.
      if (searchQuery) params.set("search", searchQuery);
      if (dateRange.from) params.set("date_from", dateRange.from);
      if (dateRange.to) params.set("date_to", dateRange.to);

      const res = await adminFetch(`/api/merchants?${params.toString()}`);
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

  // Flatten pages, then float starred to top.
  const merchants = useMemo(() => {
    const flat = query.data?.pages.flatMap((p) => p.merchants) ?? [];

    if (starredMerchants.length === 0) return flat;

    const starredSet = new Set(starredMerchants);
    const starred = flat.filter((m) => starredSet.has(m.id));
    const unstarred = flat.filter((m) => !starredSet.has(m.id));
    return [...starred, ...unstarred];
  }, [query.data?.pages, starredMerchants]);

  // Each page's shop ids as the server sent them: a starred shop moving up
  // the list does not change them.
  const pageIds = useMemo(
    () => query.data?.pages.map((p) => p.merchants.map((m) => m.id)) ?? [],
    [query.data?.pages],
  );

  const total = query.data?.pages[0]?.total ?? 0;

  return {
    ...query,
    merchants,
    pageIds,
    total,
  };
}
