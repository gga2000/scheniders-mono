"use client";

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/components/auth/auth-provider";

const connectionSchema = z.object({ success: z.literal(true), connected: z.boolean(), branchName: z.string().nullish() });

/** The tenant's Prime link as the screens read it. */
export interface PrimeConnectionState {
    connected: boolean;
    /** The Prime branch the parcels go through («فرع الكوت»); null when not set. */
    branchName: string | null;
    /** False until the server has answered (connected reads false meanwhile). */
    checked: boolean;
}

const NOT_CONNECTED: PrimeConnectionState = { connected: false, branchName: null, checked: false };

const failureReason = z.enum([
    "no_governorate",
    "bad_phone",
    "no_value",
    "bad_receipt",
    "amount_out_of_range",
    "not_found",
    "not_confirmed",
    "duplicate_receipt",
    "prime_closed",
    "prime_rejected",
    "prime_unreachable",
]);
export type PrimeFailureReason = z.infer<typeof failureReason>;

const chunkSchema = z.discriminatedUnion("connected", [
    z.object({ success: z.literal(true), connected: z.literal(false) }),
    z.object({
        success: z.literal(true),
        connected: z.literal(true),
        sent: z.array(z.object({ orderId: z.string(), caseId: z.number() })),
        skipped: z.array(z.object({ orderId: z.string(), reason: z.literal("after_sale") })),
        failed: z.array(z.object({ orderId: z.string(), reason: failureReason, message: z.string().optional() })),
    }),
]);
type ChunkResult = z.infer<typeof chunkSchema>;
type LinkedResult = Extract<ChunkResult, { connected: true }>;

export type PrimeSendResult = { connected: false } | Pick<LinkedResult, "connected" | "sent" | "skipped" | "failed">;

/**
 * Orders per request: about a second of Prime calls each, well inside the
 * route's time budget, and small enough that the desk shows each parcel
 * getting its case number while the run goes.
 */
const CHUNK = 10;
const RETRY_DELAY_MS = 1000;

async function postChunk(orderIds: string[], token: string): Promise<ChunkResult> {
    const res = await fetch("/api/prime/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds }),
    });
    if (!res.ok) throw new Error(`Sending to Prime failed: ${res.status}`);
    return chunkSchema.parse(await res.json());
}

const allUnreachable = (chunk: LinkedResult) =>
    chunk.sent.length === 0 && chunk.failed.length > 0 && chunk.failed.every((f) => f.reason === "prime_unreachable");

/** Progress of a send: orders answered so far, each answered order's outcome, and the chunk on its way now. */
export interface PrimeSendProgress {
    done: number;
    total: number;
    /** Order id → Prime's case. */
    sent: ReadonlyMap<string, number>;
    /** Orders the API did not take (they go in the Excel file). */
    failed: ReadonlySet<string>;
    /** The orders of the request in flight. */
    sending: ReadonlySet<string>;
}

/**
 * Whether the tenant ships through the Prime API (a switched-on
 * prime_connections row). One request per page, shared by every caller.
 * Everything Prime shows on the orders page and the desk hides without it.
 */
export function usePrimeConnection(): PrimeConnectionState {
    const { session, tenantId } = useAuth();
    const token = session?.access_token ?? "";
    const connection = useQuery({
        queryKey: ["prime-link", "connection", tenantId],
        enabled: token !== "",
        staleTime: 5 * 60_000,
        queryFn: async (): Promise<PrimeConnectionState> => {
            const res = await fetch("/api/prime/connection", { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) throw new Error(`Prime link status failed: ${res.status}`);
            const answer = connectionSchema.parse(await res.json());
            return { connected: answer.connected, branchName: answer.branchName ?? null, checked: true };
        },
    });
    return connection.data ?? NOT_CONNECTED;
}

/**
 * The tenant's Prime API link: whether the dispatch desk sends orders to Prime
 * directly, and the call that does it. Without a link the desk keeps
 * downloading the Prime Excel file.
 */
export function usePrimeLink() {
    const { session } = useAuth();
    const token = session?.access_token ?? "";
    const connection = usePrimeConnection();

    /**
     * Sends the orders in chunks. A dropped request is asked once more: the
     * server reports orders it already sent as sent, so nothing is doubled.
     * Once Prime stops answering, the remaining orders are reported
     * unreachable without more waiting. Never throws: every order ends up in
     * `sent`, `skipped` or `failed`. `onProgress` hears after each chunk.
     */
    const send = useCallback(
        async (orderIds: string[], onProgress?: (progress: PrimeSendProgress) => void): Promise<PrimeSendResult> => {
            const result: Extract<PrimeSendResult, { connected: true }> = { connected: true, sent: [], skipped: [], failed: [] };
            const report = (sending: readonly string[] = []) =>
                onProgress?.({
                    done: result.sent.length + result.skipped.length + result.failed.length,
                    total: orderIds.length,
                    sent: new Map(result.sent.map((s) => [s.orderId, s.caseId])),
                    failed: new Set([...result.skipped, ...result.failed].map((f) => f.orderId)),
                    sending: new Set(sending),
                });
            report();
            let primeDown = false;
            for (let i = 0; i < orderIds.length; i += CHUNK) {
                const ids = orderIds.slice(i, i + CHUNK);
                if (primeDown) {
                    for (const orderId of ids) result.failed.push({ orderId, reason: "prime_unreachable" });
                    report();
                    continue;
                }
                let chunk: ChunkResult;
                report(ids);
                try {
                    chunk = await postChunk(ids, token);
                } catch (first) {
                    console.error("Prime send request failed, asking once more:", first);
                    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
                    try {
                        chunk = await postChunk(ids, token);
                    } catch (second) {
                        console.error("Prime send request failed again:", second);
                        primeDown = true;
                        for (const orderId of ids) result.failed.push({ orderId, reason: "prime_unreachable" });
                        report();
                        continue;
                    }
                }
                // The link is off: for the first chunk the whole run goes to the Excel file as before;
                // later (switched off mid-run) the rest is reported, never silently dropped.
                if (!chunk.connected) {
                    if (i === 0) return { connected: false };
                    for (const orderId of ids) result.failed.push({ orderId, reason: "prime_unreachable", message: "The Prime link was switched off" });
                    report();
                    continue;
                }
                result.sent.push(...chunk.sent);
                result.skipped.push(...chunk.skipped);
                result.failed.push(...chunk.failed);
                report();
                if (allUnreachable(chunk)) primeDown = true;
            }
            return result;
        },
        [token],
    );

    return { connected: connection.connected, branchName: connection.branchName, send };
}
