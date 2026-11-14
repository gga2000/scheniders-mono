"use client";

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/components/auth/auth-provider";
import type { PrimeCallCheck } from "@/lib/prime/call-check-load";
import type { Order } from "@/types/order";
import { authedFetch } from "@/lib/authed-fetch";

const fixReason = z.enum(["no_governorate", "bad_phone", "no_value", "bad_receipt", "amount_out_of_range"]);

const sendSchema = z.discriminatedUnion("kind", [
    z.object({ orderId: z.string(), kind: z.literal("ready"), fee: z.number().nullable(), caseId: z.number().nullable() }),
    z.object({ orderId: z.string(), kind: z.literal("fix"), reason: fixReason, caseId: z.number().nullable() }),
]);

const checkSchema = z.object({
    orderId: z.string(),
    record: z.object({
        parcels: z.number(),
        delivered: z.number(),
        returned: z.number(),
        moving: z.number(),
        recent: z.array(z.object({ kind: z.enum(["delivered", "returned", "moving"]), at: z.string() })),
        returnedInARow: z.number(),
    }),
    send: sendSchema.nullable(),
}) satisfies z.ZodType<PrimeCallCheck>;

const answerSchema = z.discriminatedUnion("connected", [
    z.object({ success: z.literal(true), connected: z.literal(false) }),
    z.object({ success: z.literal(true), connected: z.literal(true), checks: z.array(checkSchema) }),
]);

/** Orders still waiting on their confirmation call: the cards that show the customer's Prime record. */
export const PRIME_CALL_ORDER_STATUSES: ReadonlySet<string> = new Set(["new", "contacted", "no_response"]);

/** Cards that mount together (a screen of the list) share one request, up to the route's limit. */
const BATCH_MAX = 100;

type Pending = { resolve: (check: PrimeCallCheck | null) => void; reject: (err: unknown) => void };

/**
 * Gathers the call checks asked for in the same moment into one POST, so a
 * screen of cards is one request rather than one per card.
 */
function createBatcher() {
    let queue = new Map<string, Pending[]>();
    let token: string | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function flush(ids: string[], waiting: Map<string, Pending[]>) {
        try {
            const res = await authedFetch("/api/prime/call-check", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderIds: ids }),
            });
            if (!res.ok) throw new Error(`Prime call check failed: ${res.status}`);
            const answer = answerSchema.parse(await res.json());
            const byId = new Map(answer.connected ? answer.checks.map((c) => [c.orderId, c]) : []);
            for (const id of ids) for (const p of waiting.get(id) ?? []) p.resolve(byId.get(id) ?? null);
        } catch (err) {
            for (const id of ids) for (const p of waiting.get(id) ?? []) p.reject(err);
        }
    }

    function run() {
        timer = null;
        const waiting = queue;
        const auth = token;
        queue = new Map();
        if (!auth) return;
        const ids = [...waiting.keys()];
        for (let i = 0; i < ids.length; i += BATCH_MAX) void flush(ids.slice(i, i + BATCH_MAX), waiting);
    }

    return (orderId: string, auth: string) =>
        new Promise<PrimeCallCheck | null>((resolve, reject) => {
            if (token !== null && token !== auth && queue.size > 0) run();
            token = auth;
            queue.set(orderId, [...(queue.get(orderId) ?? []), { resolve, reject }]);
            timer ??= setTimeout(run, 30);
        });
}

const load = createBatcher();

/**
 * The confirmation call's Prime check for one card (POST /api/prime/call-check):
 * the customer's earlier Prime parcels and Prime's fee, or what to fix first.
 * Keyed by the order's version, so fixing the phone or governorate on the card
 * checks again. Null while Prime is not linked or the order is not on a call.
 */
export function usePrimeCallCheck(order: Pick<Order, "id" | "status" | "version">, connected: boolean) {
    const { session, tenantId } = useAuth();
    const token = session?.access_token;
    return useQuery({
        queryKey: ["prime-call-check", tenantId, order.id, order.version ?? 0],
        enabled: connected && !!token && PRIME_CALL_ORDER_STATUSES.has(order.status),
        staleTime: 5 * 60_000,
        placeholderData: (previous) => previous,
        queryFn: () => {
            if (!token) throw new Error("Not signed in");
            return load(order.id, token);
        },
    });
}
