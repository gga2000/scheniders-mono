"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { LeadFollowUp } from "@/types/leads";
import { adminFetch } from "@/lib/admin-fetch";
import { okOrLoadFailure } from "@/lib/load-failure";

export function useLeadFollowUps(leadId: string | null) {
  return useQuery<LeadFollowUp[]>({
    queryKey: ["lead-follow-ups", leadId],
    queryFn: async () => {
      const res = await adminFetch(`/api/leads/${leadId}/follow-ups`);
      okOrLoadFailure(res, "follow-ups");
      const data = await res.json();
      return data.follow_ups;
    },
    enabled: !!leadId,
    staleTime: 30_000,
  });
}

/** The server's own words for a refused write ("A follow-up can only go to ..."), else `fallback`. */
async function refusal(res: Response, fallback: string): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  return typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
    ? body.error
    : fallback;
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
      assigned_to?: string;
    }) => {
      const res = await adminFetch(`/api/leads/${leadId}/follow-ups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await refusal(res, "Could not save the follow-up."));
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
      if (!res.ok) throw new Error(await refusal(res, "Could not mark the follow-up done."));
      return res.json();
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["lead-follow-ups", vars.leadId] });
      qc.invalidateQueries({ queryKey: ["lead", vars.leadId] });
    },
  });
}
