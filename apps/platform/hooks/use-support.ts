"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { authedFetch, readApiJson, type ApiReply } from "@/lib/authed-fetch";
import type { StaffVisit, SupportPost, SupportThread } from "@/lib/support/schema";

/** A refusal from /api/support; `code` is what the chat translates. */
export class SupportRequestError extends Error {
    constructor(readonly code: string) {
        super(code);
        this.name = "SupportRequestError";
    }
}

const threadKey = (tenantId: string | null) => ["support", "thread", tenantId] as const;

async function readThread(res: Response): Promise<SupportThread> {
    const reply = await readApiJson<ApiReply<SupportThread>>(res);
    if (!reply.success) throw new SupportRequestError(reply.error ?? "failed");
    return reply.data;
}

/**
 * My conversation with the support team. Polls: every 5 seconds while the
 * chat is open so a reply appears as it is written, once a minute otherwise
 * so the Help button can show a new reply.
 */
export function useSupportThread(live: boolean) {
    const { user, tenantId } = useAuth();
    return useQuery<SupportThread>({
        queryKey: threadKey(tenantId),
        queryFn: async () => readThread(await authedFetch("/api/support")),
        enabled: Boolean(user && tenantId),
        refetchInterval: live ? 5_000 : 60_000,
        staleTime: live ? 0 : 30_000,
    });
}

/** Send a message, answer "did this solve it?", or ask for a call. The reply is the fresh thread. */
export function useSupportAction() {
    const { tenantId } = useAuth();
    const queryClient = useQueryClient();
    return useMutation<SupportThread, Error, Extract<SupportPost, { action: "send" | "rate" | "callBack" }>>({
        mutationFn: async (body) =>
            readThread(
                await authedFetch("/api/support", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                }),
            ),
        onSuccess: (thread) => queryClient.setQueryData(threadKey(tenantId), thread),
    });
}

/** Tell the server the merchant has seen the staff replies, and clear the badge. */
export function useSupportMarkRead() {
    const { tenantId } = useAuth();
    const queryClient = useQueryClient();
    return useMutation<void, Error, void>({
        mutationFn: async () => {
            const reply = await readApiJson<ApiReply<never>>(
                await authedFetch("/api/support", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "read" }),
                }),
            );
            if (!reply.success) throw new SupportRequestError(reply.error ?? "failed");
        },
        onSuccess: () =>
            queryClient.setQueryData<SupportThread>(threadKey(tenantId), (thread) =>
                thread ? { ...thread, unread: 0 } : thread,
            ),
    });
}

/** Store a picture of the screen; the answer is its path, sent with the next message. */
export function useSupportShot() {
    return useMutation<string, Error, Blob>({
        mutationFn: async (picture) => {
            const reply = await readApiJson<ApiReply<{ path: string }>>(
                await authedFetch("/api/support/shot", {
                    method: "POST",
                    headers: { "Content-Type": "image/jpeg" },
                    body: picture,
                }),
            );
            if (!reply.success) throw new SupportRequestError(reply.error ?? "failed");
            return reply.data.path;
        },
    });
}

/** Uploads a recorded voice note; answers its stored path. */
export function useSupportVoice() {
    return useMutation<string, Error, Blob>({
        mutationFn: async (recording) => {
            const reply = await readApiJson<ApiReply<{ path: string }>>(
                await authedFetch("/api/support/voice", {
                    method: "POST",
                    // The server reads the kind from the bytes; the label is only a hint.
                    headers: { "Content-Type": recording.type.split(";")[0] || "audio/webm" },
                    body: recording,
                }),
            );
            if (!reply.success) throw new SupportRequestError(reply.error ?? "failed");
            return reply.data.path;
        },
    });
}

/** What our support staff did on my shop, for Settings. Shop admins only. */
export function useStaffVisits(enabled: boolean) {
    const { tenantId } = useAuth();
    return useQuery<StaffVisit[]>({
        queryKey: ["support", "visits", tenantId],
        queryFn: async () => {
            const reply = await readApiJson<ApiReply<StaffVisit[]>>(await authedFetch("/api/support/visits"));
            if (!reply.success) throw new SupportRequestError(reply.error ?? "failed");
            return reply.data;
        },
        enabled: enabled && Boolean(tenantId),
        staleTime: 60_000,
    });
}
