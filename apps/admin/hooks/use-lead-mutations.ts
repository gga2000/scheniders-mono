"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Lead, LeadFormData, LeadStatus } from "@/types/leads";
import { z } from "zod";
import { answerLostWords } from "@/lib/answer-lost";
import { failureOf, sendJson, sendStep } from "@/lib/send-json";
import { bulkLeadResultSchema, type BulkLeadBody, type BulkLeadResult } from "@/lib/lead-bulk";
import { INDUSTRY_GONE, LeadGoneError, LeadListsChangedError, leadSaveRefusal, type LeadListsAsOpened } from "@/lib/lead-update";

/** A lost answer may have saved the step: look before pressing again. */
const LEADS_UNSURE = answerLostWords("the leads list");
const LEAD_UNSURE = answerLostWords("the lead");

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: LeadFormData & { is_draft?: boolean }) => {
      return sendStep<{ lead: Lead }>("/api/leads", data, "POST", LEADS_UNSURE, "Could not add the lead.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    // A colleague removed the picked industry: read the list again so it is gone from the picker.
    onError: (error) => {
      if (error.message === INDUSTRY_GONE) qc.invalidateQueries({ queryKey: ["industries"] });
    },
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
      was = {},
    }: {
      id: string;
      data: Partial<LeadFormData> & { status?: LeadStatus; is_draft?: boolean };
      /** The lists in `data` as the form opened them; the server refuses the save if one changed since. */
      was?: LeadListsAsOpened;
    }) => {
      const answer = await sendJson(`/api/leads/${id}`, Object.keys(was).length > 0 ? { ...data, was } : data, "PATCH", LEAD_UNSURE);
      if (!answer.ok) throw leadSaveRefusal(answer.status, answer.data, "Could not save the lead.", LEAD_UNSURE);
      return answer.data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", vars.id] });
      qc.invalidateQueries({ queryKey: ["lead-analytics"] });
    },
    // A refused save may mean this copy is out of date (a colleague changed
    // the lead's lists, removed its industry, or deleted the lead): read them
    // again. A draft reopened from the list reads its copy by id too
    // (use-resumed-draft); a deleted one leaves the list.
    onError: (error, vars) => {
      qc.invalidateQueries({ queryKey: ["lead", vars.id] });
      if (error instanceof LeadListsChangedError || error instanceof LeadGoneError) qc.invalidateQueries({ queryKey: ["leads"] });
      if (error.message === INDUSTRY_GONE) qc.invalidateQueries({ queryKey: ["industries"] });
    },
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return sendStep<unknown>(`/api/leads/${id}`, undefined, "DELETE", LEADS_UNSURE, "Could not delete the lead.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead-analytics"] });
    },
  });
}

/**
 * A bulk refusal with what the bar needs to ask again: "Assign to me" over
 * leads someone else owns answers how many, and moves nothing until asked.
 */
export class BulkLeadError extends Error {
  constructor(
    message: string,
    readonly ownedByOthers: number | null,
  ) {
    super(message);
  }
}

/** A bulk refusal in the server's words, with how many leads someone else owns when it asks. */
const bulkRefusalSchema = z.object({ error: z.string(), owned_by_others: z.number().optional() });

export function useBulkLeadAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: BulkLeadBody): Promise<BulkLeadResult> => {
      const answer = await sendJson("/api/leads/bulk", body, "POST", LEADS_UNSURE);
      if (!answer.ok) {
        const refused = bulkRefusalSchema.safeParse(answer.data);
        if (!refused.success) throw failureOf(answer.status, answer.data, "Bulk action failed", LEADS_UNSURE);
        throw new BulkLeadError(refused.data.error, refused.data.owned_by_others ?? null);
      }
      return bulkLeadResultSchema.parse(answer.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead-analytics"] });
    },
  });
}

export function useBuildStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      leadId,
      data,
    }: {
      leadId: string;
      data: Record<string, unknown>;
    }): Promise<{ tenant: { id: string; slug: string }; store_url: string }> => {
      return sendStep<{ tenant: { id: string; slug: string }; store_url: string }>(
        `/api/leads/${leadId}/build-store`,
        data,
        "POST",
        LEAD_UNSURE,
        "Failed to build store",
      );
    },
    // A refusal can mean the lead changed under the dialog ("A store already
    // exists", "Lead already converted"), so the lead is read again either
    // way; the page stopped offering Build Store only after a reload.
    onSettled: (_, __, vars) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", vars.leadId] });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "merchants"] });
      qc.invalidateQueries({ queryKey: ["lead-analytics"] });
    },
  });
}

export function useConvertLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, data }: { leadId: string; data?: Record<string, unknown> }) => {
      return sendStep<unknown>(`/api/leads/${leadId}/convert`, data ?? {}, "POST", LEAD_UNSURE, "Could not convert the lead.");
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", vars.leadId] });
      qc.invalidateQueries({ queryKey: ["admin", "merchants"] });
      qc.invalidateQueries({ queryKey: ["lead-analytics"] });
    },
  });
}
