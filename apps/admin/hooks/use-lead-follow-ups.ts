"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SAVED_ONCE_UNSURE, answerLostWords } from "@/lib/answer-lost";
import { sendStep } from "@/lib/send-json";
import { useSaveOnce } from "@/hooks/use-ask-ids";

/** A lost answer may have saved the step: look at the lead before pressing again. */
const FOLLOW_UP_UNSURE = answerLostWords("the lead's follow-ups");

/** A new follow-up carries its ask's id: pressing Schedule again after a lost answer saves it once. */
export function useCreateFollowUp() {
  const qc = useQueryClient();
  const saveOnce = useSaveOnce();
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
      return saveOnce<unknown>(`/api/leads/${leadId}/follow-ups`, data, SAVED_ONCE_UNSURE, "Could not save the follow-up.");
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

export function useCompleteFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, followUpId }: { leadId: string; followUpId: string }) => {
      return sendStep<unknown>(
        `/api/leads/${leadId}/follow-ups/${followUpId}`,
        { is_completed: true },
        "PATCH",
        FOLLOW_UP_UNSURE,
        "Could not mark the follow-up done.",
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
