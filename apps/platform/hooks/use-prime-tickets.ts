"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/components/auth/auth-provider";

const ticketSchema = z.object({
    ticketId: z.number(),
    caseId: z.number(),
    orderId: z.string(),
    orderNumber: z.string(),
    customerName: z.string().nullable(),
    subject: z.string().nullable(),
    open: z.boolean(),
    latestMessage: z.string().nullable(),
    at: z.string().nullable(),
});
export type PrimeTicketView = z.infer<typeof ticketSchema>;

const subjectSchema = z.object({ code: z.string(), name: z.string() });
export type PrimeTicketSubjectView = z.infer<typeof subjectSchema>;

const listAnswer = z.union([
    z.object({ success: z.literal(true), connected: z.literal(false) }),
    z.object({ success: z.literal(true), connected: z.literal(true), tickets: z.array(ticketSchema), subjects: z.array(subjectSchema) }),
]);

const messageSchema = z.object({
    id: z.number().nullable(),
    text: z.string().nullable(),
    at: z.string().nullable(),
    sender: z.string().nullable(),
    fromPrime: z.boolean(),
    mediaUrl: z.string().nullable(),
});
export type PrimeTicketMessageView = z.infer<typeof messageSchema>;

const chatAnswer = z.object({ success: z.literal(true), connected: z.literal(true), open: z.boolean(), messages: z.array(messageSchema) });

const writeAnswer = z.union([
    z.object({ success: z.literal(true), ticketId: z.number().optional() }),
    z.object({ success: z.literal(false), reason: z.string().optional(), message: z.string().optional(), error: z.string().optional() }),
]);
export type PrimeTicketWriteAnswer = z.infer<typeof writeAnswer>;

const ticketsKey = (tenantId: string | null | undefined) => ["prime-tickets", tenantId] as const;
const REFRESH_MS = 2 * 60_000;

/** The store's tickets with Prime, and the subjects a new ticket can take. */
export function usePrimeTickets(enabled: boolean) {
    const { session, tenantId } = useAuth();
    const token = session?.access_token;
    return useQuery({
        queryKey: ticketsKey(tenantId),
        enabled: enabled && !!token,
        staleTime: 60_000,
        refetchInterval: enabled ? REFRESH_MS : false,
        queryFn: async () => {
            const res = await fetch("/api/prime/tickets", { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) throw new Error(`Prime tickets failed: ${res.status}`);
            return listAnswer.parse(await res.json());
        },
    });
}

/** One ticket's chat, read while it is open on screen. */
export function usePrimeTicketChat(ticketId: number | null) {
    const { session, tenantId } = useAuth();
    const token = session?.access_token;
    return useQuery({
        queryKey: [...ticketsKey(tenantId), ticketId],
        enabled: ticketId !== null && !!token,
        staleTime: 30_000,
        refetchInterval: ticketId !== null ? 60_000 : false,
        queryFn: async () => {
            const res = await fetch(`/api/prime/tickets?id=${ticketId}`, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) throw new Error(`Prime ticket failed: ${res.status}`);
            return chatAnswer.parse(await res.json());
        },
    });
}

/** Opens a ticket on an order's parcel, or writes into a ticket; refreshes the tickets after. */
export function usePrimeTicketWrite() {
    const { session, tenantId } = useAuth();
    const token = session?.access_token;
    const queryClient = useQueryClient();
    return useCallback(
        async (body: { action: "open"; orderId: string; subjectCode: string; message: string } | { action: "message"; ticketId: number; message: string }) => {
            if (!token) throw new Error("Not signed in");
            const res = await fetch("/api/prime/tickets", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const answer = writeAnswer.parse(await res.json().catch(() => ({ success: false })));
            await queryClient.invalidateQueries({ queryKey: ticketsKey(tenantId) });
            return answer;
        },
        [token, tenantId, queryClient],
    );
}
