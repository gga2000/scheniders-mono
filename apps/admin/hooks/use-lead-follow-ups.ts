"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { LeadFollowUp } from "@/types/leads";
import { adminFetch } from "@/lib/admin-fetch";

export function useLeadFollowUps(leadId: string | null) {
  return useQuery<LeadFollowUp[]>({
    queryKey: ["lead-follow-ups", leadId],
    queryFn: async () => {
      const res = await adminFetch(`/api/leads/${leadId}/follow-ups`);
      if (!res.ok) throw new Error("Failed to fetch follow-ups");
      const data = await res.json();
      return data.follow_ups;
    },
    enabled: !!leadId,
    staleTime: 30_000,
  });
}

export function useCreateFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      leadId,
      ...data
    }: {
      leadId: string;
      scheduled_at: string;
      title: string;
      description?: string;
      assigned_to: string;
    }) => {
      const res = await adminFetch(`/api/leads/${leadId}/follow-ups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create follow-up");
      return res.json();
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["lead-follow-ups", vars.leadId] });
      qc.invalidateQueries({ queryKey: ["lead", vars.leadId] });
    },
  });
}

export function useCompleteFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, followUpId }: { leadId: string; followUpId: string }) => {
      const res = await adminFetch(`/api/leads/${leadId}/follow-ups/${followUpId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_completed: true }),
      });
      if (!res.ok) throw new Error("Failed to complete follow-up");
      return res.json();
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["lead-follow-ups", vars.leadId] });
      qc.invalidateQueries({ queryKey: ["lead", vars.leadId] });
    },
  });
}
