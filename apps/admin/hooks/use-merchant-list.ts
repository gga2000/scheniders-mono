"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { ListSort, MerchantListRow, MerchantTab } from "@/lib/merchant-list";
import { okOrLoadFailure } from "@/lib/load-failure";

interface MerchantListPage {
  merchants: MerchantListRow[];
  total: number;
  page: number;
  limit: number;
}

export const LIST_PAGE_SIZE = 50;

/** The Merchants list for one tab, search and sort, 50 shops a page. */
export function useMerchantList({ tab, search, sort }: { tab: MerchantTab; search: string; sort: ListSort }) {
  const query = useInfiniteQuery<MerchantListPage>({
    queryKey: ["admin", "merchants", "list", { tab, search, sort }],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ tab, sort, page: String(pageParam), limit: String(LIST_PAGE_SIZE) });
      if (search) params.set("search", search);
      const res = await fetch(`/api/merchants?${params.toString()}`);
      okOrLoadFailure(res, "the merchants");
      return res.json();
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
    staleTime: 30_000,
  });
  return {
    ...query,
    merchants: query.data?.pages.flatMap((page) => page.merchants) ?? [],
    total: query.data?.pages[0]?.total ?? 0,
  };
}

/** How many shops each tab holds, for the counts on the tabs. */
export function useMerchantTabCounts() {
  return useQuery<Record<MerchantTab, number>>({
    queryKey: ["admin", "merchants", "tabs"],
    queryFn: async () => {
      const res = await fetch("/api/merchants/tabs");
      okOrLoadFailure(res, "the shop counts");
      const body: { counts: Record<MerchantTab, number> } = await res.json();
      return body.counts;
    },
    staleTime: 30_000,
  });
}
