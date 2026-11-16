"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SavedReplyInput, SupportSavedReply } from "@/lib/support";

const KEY = ["admin", "support", "replies"] as const;

async function readJson<T>(res: Response): Promise<T> {
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : "Request failed";
    throw new Error(message);
  }
  return body as T;
}

const send = (url: string, method: "POST" | "PATCH" | "DELETE", body?: SavedReplyInput) =>
  fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

/** The team's saved replies, in the order they show above the reply box. */
export function useSavedReplies() {
  return useQuery<SupportSavedReply[]>({
    queryKey: KEY,
    queryFn: async () =>
      (await readJson<{ replies: SupportSavedReply[] }>(await fetch("/api/support/replies"))).replies,
    staleTime: 60_000,
  });
}

export function useAddSavedReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SavedReplyInput) =>
      readJson<{ reply: SupportSavedReply }>(await send("/api/support/replies", "POST", input)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useChangeSavedReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: SavedReplyInput & { id: string }) =>
      readJson<{ reply: SupportSavedReply }>(await send(`/api/support/replies/${id}`, "PATCH", input)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRemoveSavedReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => readJson<{ success: true }>(await send(`/api/support/replies/${id}`, "DELETE")),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
