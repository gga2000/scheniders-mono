"use client";

import { useQuery } from "@tanstack/react-query";
import type { LeadAnalytics } from "@/types/leads";
import { adminFetch } from "@/lib/admin-fetch";

export function useLeadAnalytics() {
  return useQuery<LeadAnalytics>({
    queryKey: ["lead-analytics"],
    queryFn: async () => {
      const res = await adminFetch("/api/leads/analytics");
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
    staleTime: 60_000,
  });
}
