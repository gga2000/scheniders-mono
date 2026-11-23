"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LeadActivityType } from "@/types/leads";
import { SAVED_ONCE_UNSURE } from "@/lib/answer-lost";
import { useSaveOnce } from "@/hooks/use-ask-ids";

/** A note on the lead carries its ask's id: pressing Save again after a lost answer saves it once. */
export function useCreateActivity() {
  const qc = useQueryClient();
  const saveOnce = useSaveOnce();
  return useMutation({
    mutationFn: async ({
      leadId,
      activity_type,
      title,
      description,
    }: {
      leadId: string;
      activity_type: LeadActivityType;
      title: string;
      description?: string;
    }) => {
      return saveOnce<unknown>(
        `/api/leads/${leadId}/activities`,
        { activity_type, title, description },
        SAVED_ONCE_UNSURE,
        "Could not save it. Try again.",
      );
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["lead", vars.leadId] });
    },
    // A refusal may mean a colleague deleted the lead: read it again, so the
    // page says so (lead-detail's "deleted" state).
    onError: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["lead", vars.leadId] });
    },
  });
}
