"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Industry } from "@/types/leads";
import { adminFetch } from "@/lib/admin-fetch";
import { okOrLoadFailure } from "@/lib/load-failure";
import { answerLostWords } from "@/lib/answer-lost";
import { failureOf, sendJson, sendStep } from "@/lib/send-json";
import type { IndustryEdit } from "@/lib/industry-edit";

export function useIndustries() {
  return useQuery<Industry[]>({
    queryKey: ["industries"],
    queryFn: async () => {
      const res = await adminFetch("/api/industries");
      okOrLoadFailure(res, "industries");
      const data = await res.json();
      return data.industries;
    },
    staleTime: 120_000,
  });
}

/** A lost answer may have changed the list: look at it before pressing again. */
const INDUSTRIES_UNSURE = answerLostWords("the industries list");

export function useCreateIndustry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; name_ar?: string; icon?: string; color?: string; avg_order_value_iqd?: number }) => {
      return sendStep<unknown>("/api/industries", data, "POST", INDUSTRIES_UNSURE, "Could not add the industry.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["industries"] });
    },
  });
}

/**
 * A colleague removed the industry first (404): the edit or the confirm that
 * was open for it is closed, and the list read again shows it gone.
 */
export class IndustryGoneError extends Error {}

/** Sends one industry step; a refusal throws its words, a 404 as IndustryGoneError. */
async function sendIndustry<T>(url: string, body: unknown, method: "PATCH" | "DELETE", fallback: string): Promise<T> {
  const answer = await sendJson(url, body, method, INDUSTRIES_UNSURE);
  if (answer.ok) return answer.data as T;
  const failure = failureOf(answer.status, answer.data, fallback, INDUSTRIES_UNSURE);
  throw answer.status === 404 ? new IndustryGoneError(failure.message) : failure;
}

export function useUpdateIndustry() {
  const qc = useQueryClient();
  return useMutation({
    // Not the place in the list: that is useMoveIndustry.
    mutationFn: async ({ id, data }: { id: string; data: IndustryEdit }) => {
      return sendIndustry<unknown>(`/api/industries/${id}`, data, "PATCH", "Could not save the industry.");
    },
    // A new average order prices the industry's leads again on the server:
    // the lead numbers, lists and pages are read again to show it.
    onSuccess: (_, { data }) => {
      if (data.avg_order_value_iqd === undefined) return;
      for (const queryKey of [["leads"], ["lead"], ["lead-analytics"]]) qc.invalidateQueries({ queryKey });
    },
    // A refused save ("no longer exists") also means the list is out of date.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["industries"] });
    },
  });
}

/**
 * One place up or down. The server moves it, renumbers the list and logs it
 * in one write; the list is read again either way, so it shows where each
 * industry stands.
 */
export function useMoveIndustry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, direction }: { id: string; direction: "up" | "down" }) => {
      return sendStep<unknown>(`/api/industries/${id}/move`, { direction }, "POST", INDUSTRIES_UNSURE, "Could not move the industry.");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["industries"] });
    },
  });
}

/** What Delete did: an industry leads use is switched off, and they keep it. */
export type IndustryRemoval = { result: "removed" } | { result: "switched_off"; leads_using_it: number };

export function useDeleteIndustry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<IndustryRemoval> => {
      return sendIndustry<IndustryRemoval>(`/api/industries/${id}`, undefined, "DELETE", "Could not delete the industry.");
    },
    // A refused delete ("no longer exists") also means the list is out of date.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["industries"] });
    },
  });
}
