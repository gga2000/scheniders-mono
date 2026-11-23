"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SavedReplyInput, SupportSavedReply } from "@/lib/support";
import { adminFetch } from "@/lib/admin-fetch";
import { okOrLoadFailure } from "@/lib/load-failure";
import { answerLostWords } from "@/lib/answer-lost";
import { sendStep } from "@/lib/send-json";

const KEY = ["admin", "support", "replies"] as const;

/** A lost answer may have saved the change, so look before pressing again: a second add makes two. */
export const SAVED_REPLY_UNSURE = answerLostWords("the saved replies");

/** One saved-reply write through the console's one sender. */
function send<T>(url: string, method: "POST" | "PATCH" | "DELETE", body?: SavedReplyInput): Promise<T> {
  return sendStep<T>(url, body, method, SAVED_REPLY_UNSURE);
}

/** The team's saved replies, in the order they show above the reply box. */
export function useSavedReplies() {
  return useQuery<SupportSavedReply[]>({
    queryKey: KEY,
    queryFn: async () =>
      ((await okOrLoadFailure(await adminFetch("/api/support/replies"), "the saved replies").json()) as { replies: SupportSavedReply[] }).replies,
    staleTime: 60_000,
  });
}

export function useAddSavedReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SavedReplyInput) =>
      send<{ reply: SupportSavedReply }>("/api/support/replies", "POST", input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useChangeSavedReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: SavedReplyInput & { id: string }) =>
      send<{ reply: SupportSavedReply }>(`/api/support/replies/${id}`, "PATCH", input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRemoveSavedReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => send<{ success: true }>(`/api/support/replies/${id}`, "DELETE"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
