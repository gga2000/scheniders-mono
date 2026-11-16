"use client";

import { useQuery } from "@tanstack/react-query";
import type { Lead, LeadActivity, LeadFollowUp, LeadSocialLink, LeadCompetitor } from "@/types/leads";
import { adminFetch } from "@/lib/admin-fetch";
import { okOrLoadFailure } from "@/lib/load-failure";

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
      const res = await adminFetch(`/api/leads/${id}`);
      okOrLoadFailure(res, "lead");
      return res.json();
    },
    enabled: !!id,
    staleTime: 30_000,
  });
}
