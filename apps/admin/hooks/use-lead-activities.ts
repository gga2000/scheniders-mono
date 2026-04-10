"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { LeadActivity, LeadActivityType } from "@/types/leads";

export function useLeadActivities(leadId: string | null) {
  return useQuery<LeadActivity[]>({
    queryKey: ["lead-activities", leadId],
    queryFn: async () => {
      const res = await fetch(`/api/leads/${leadId}/activities`);
      if (!res.ok) throw new Error("Failed to fetch activities");
      const data = await res.json();
      return data.activities;
    },
    enabled: !!leadId,
    staleTime: 15_000,
  });
}

export function useCreateActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      leadId,
      activity_type,
      title,
      description,
      metadata,
    }: {
      leadId: string;
      activity_type: LeadActivityType;
      title: string;
      description?: string;
      metadata?: Record<string, unknown>;
    }) => {
      const res = await fetch(`/api/leads/${leadId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activity_type, title, description, metadata }),
      });
      if (!res.ok) throw new Error("Failed to create activity");
      return res.json();
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["lead-activities", vars.leadId] });
      qc.invalidateQueries({ queryKey: ["lead", vars.leadId] });
    },
  });
}
