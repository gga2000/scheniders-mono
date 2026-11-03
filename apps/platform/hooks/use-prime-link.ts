"use client";

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/components/auth/auth-provider";

const connectionSchema = z.object({ success: z.literal(true), connected: z.boolean() });

const failureReason = z.enum([
    "after_sale",
    "no_governorate",
    "bad_phone",
    "no_value",
    "not_found",
    "not_confirmed",
    "duplicate_receipt",
    "prime_rejected",
    "prime_unreachable",
]);
export type PrimeFailureReason = z.infer<typeof failureReason>;

const sendSchema = z.discriminatedUnion("connected", [
    z.object({ success: z.literal(true), connected: z.literal(false) }),
    z.object({
        success: z.literal(true),
        connected: z.literal(true),
        sent: z.array(z.object({ orderId: z.string(), caseId: z.number() })),
        failed: z.array(z.object({ orderId: z.string(), reason: failureReason, message: z.string().optional() })),
    }),
]);
export type PrimeSendResult = z.infer<typeof sendSchema>;

/**
 * The tenant's Prime API link: whether the dispatch desk sends orders to Prime
 * directly, and the call that does it. Without a link the desk keeps
 * downloading the Prime Excel file.
 */
export function usePrimeLink() {
    const { session } = useAuth();
    const token = session?.access_token ?? "";

    const connection = useQuery({
        queryKey: ["prime-link", "connection"],
        enabled: token !== "",
        staleTime: 5 * 60_000,
        queryFn: async () => {
            const res = await fetch("/api/prime/connection", { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) throw new Error(`Prime link status failed: ${res.status}`);
            return connectionSchema.parse(await res.json()).connected;
        },
    });

    /** Sends the orders; throws when the server or Prime could not be reached at all. */
    const send = useCallback(
        async (orderIds: string[]): Promise<PrimeSendResult> => {
            const res = await fetch("/api/prime/send", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ orderIds }),
            });
            if (!res.ok) throw new Error(`Sending to Prime failed: ${res.status}`);
            return sendSchema.parse(await res.json());
        },
        [token],
    );

    return { connected: connection.data === true, send };
}
