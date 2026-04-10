"use client";

import { useQuery } from "@tanstack/react-query";
import type { Lead, LeadActivity, LeadFollowUp, LeadSocialLink, LeadCompetitor } from "@/types/leads";

interface LeadDetailResponse {
  lead: Lead;
  activities: LeadActivity[];
  follow_ups: LeadFollowUp[];
  social_links: LeadSocialLink[];
  competitors: LeadCompetitor[];
}

export function useLeadDetail(id: string | null) {
  return useQuery<LeadDetailResponse>({
    queryKey: ["lead", id],
    queryFn: async () => {
      const res = await fetch(`/api/leads/${id}`);
      if (!res.ok) throw new Error("Failed to fetch lead");
      return res.json();
    },
    enabled: !!id,
    staleTime: 30_000,
  });
}
