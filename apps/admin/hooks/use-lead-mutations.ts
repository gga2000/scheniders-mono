"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LeadFormData, LeadStatus } from "@/types/leads";
import { adminFetch } from "@/lib/admin-fetch";
import { refusal } from "@/lib/refusal";
import { bulkLeadResultSchema, type BulkLeadBody, type BulkLeadResult } from "@/lib/lead-bulk";
import { INDUSTRY_GONE, type LeadListsAsOpened } from "@/lib/lead-update";

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: LeadFormData & { is_draft?: boolean }) => {
      const res = await adminFetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create lead");
      }
      return res.json();
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
      const res = await adminFetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.keys(was).length > 0 ? { ...data, was } : data),
      });
      if (!res.ok) throw new Error(await refusal(res, "Could not save the lead."));
      return res.json();
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", vars.id] });
      qc.invalidateQueries({ queryKey: ["lead-analytics"] });
      qc.invalidateQueries({ queryKey: ["lead-activities", vars.id] });
    },
    // A refused save may mean this copy is out of date (a colleague changed
    // the lead's lists, or removed its industry): read them again.
    onError: (error, vars) => {
      qc.invalidateQueries({ queryKey: ["lead", vars.id] });
      if (error.message === INDUSTRY_GONE) qc.invalidateQueries({ queryKey: ["industries"] });
    },
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await adminFetch(`/api/leads/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(typeof body?.error === "string" ? body.error : "Could not delete the lead");
      }
      return res.json();
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

export function useBulkLeadAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: BulkLeadBody): Promise<BulkLeadResult> => {
      const res = await adminFetch("/api/leads/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err: { error?: unknown; owned_by_others?: unknown } = await res.json().catch(() => ({}));
        throw new BulkLeadError(
          typeof err.error === "string" ? err.error : "Bulk action failed",
          typeof err.owned_by_others === "number" ? err.owned_by_others : null,
        );
      }
      return bulkLeadResultSchema.parse(await res.json());
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
      const res = await adminFetch(`/api/leads/${leadId}/build-store`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await refusal(res, "Failed to build store"));
      return res.json();
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
      const res = await adminFetch(`/api/leads/${leadId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data ?? {}),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to convert lead");
      }
      return res.json();
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", vars.leadId] });
      qc.invalidateQueries({ queryKey: ["admin", "merchants"] });
      qc.invalidateQueries({ queryKey: ["lead-analytics"] });
    },
  });
}
