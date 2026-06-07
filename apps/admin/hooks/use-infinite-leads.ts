"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import type { Lead } from "@/types/leads";
import { useLeadStore } from "@/store/use-lead-store";
import { adminFetch } from "@/lib/admin-fetch";

interface LeadsPage { leads: Lead[]; total: number; page: number; limit: number; }

const LIMIT = 20;

export function useInfiniteLeads() {
  const {
    statusFilter, platformFilter, priorityFilter, tierFilter, industryFilter,
    assigneeFilter, hasStoreFilter, scoreRange, searchQuery, sortBy,
  } = useLeadStore();

  return useInfiniteQuery<LeadsPage>({
    queryKey: [
      "leads", "infinite", statusFilter, platformFilter, priorityFilter, tierFilter,
      industryFilter, assigneeFilter, hasStoreFilter, scoreRange, searchQuery, sortBy,
    ],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("page", String(pageParam));
      params.set("limit", String(LIMIT));
      if (statusFilter) params.set("status", statusFilter);
      if (platformFilter) params.set("platform", platformFilter);
      if (priorityFilter) params.set("priority", priorityFilter);
      if (tierFilter) params.set("tier", tierFilter);
      if (industryFilter) params.set("industry_id", industryFilter);
      if (assigneeFilter) params.set("assigned_to", assigneeFilter);
      if (hasStoreFilter !== null) params.set("has_store", String(hasStoreFilter));
      if (scoreRange[0] > 0) params.set("score_min", String(scoreRange[0]));
      if (scoreRange[1] < 100) params.set("score_max", String(scoreRange[1]));
      if (searchQuery) params.set("search", searchQuery);
      if (sortBy) params.set("sort", sortBy);
      const res = await adminFetch(`/api/leads?${params}`);
      if (!res.ok) throw new Error("Failed to fetch leads");
      return res.json();
    },
    getNextPageParam: (lastPage) => {
      const loaded = lastPage.page * lastPage.limit;
      return loaded < lastPage.total ? lastPage.page + 1 : undefined;
    },
    staleTime: 30_000,
  });
}
