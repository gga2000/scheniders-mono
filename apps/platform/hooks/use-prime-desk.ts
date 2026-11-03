"use client";

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/components/auth/auth-provider";
import type { Order } from "@/lib/supabase";
import type { PrimeDeskRow } from "@/lib/prime/desk-preview";

const fixReason = z.enum(["no_governorate", "bad_phone", "no_value", "bad_receipt", "amount_out_of_range"]);

const rowSchema = z.discriminatedUnion("kind", [
    z.object({ orderId: z.string(), kind: z.literal("ready"), fee: z.number().nullable(), caseId: z.number().nullable() }),
    z.object({ orderId: z.string(), kind: z.literal("fix"), reason: fixReason, caseId: z.number().nullable() }),
    z.object({ orderId: z.string(), kind: z.literal("after_sale"), caseId: z.number().nullable() }),
]);

const answerSchema = z.discriminatedUnion("connected", [
    z.object({ success: z.literal(true), connected: z.literal(false) }),
    z.object({ success: z.literal(true), connected: z.literal(true), rows: z.array(rowSchema) }),
]);

const EMPTY: ReadonlyMap<string, PrimeDeskRow> = new Map();

/**
 * For each desk order, what Prime would do with it before anything is sent:
 * its fee, what to fix first, or its case number once sent (POST
 * /api/prime/desk-preview). Keyed by each order's version, so fixing a phone
 * on the desk re-checks that order. Off without the Prime link.
 */
export function usePrimeDeskPreview(orders: readonly Order[], connected: boolean): { rows: ReadonlyMap<string, PrimeDeskRow>; loading: boolean } {
    const { session, tenantId } = useAuth();
    const token = session?.access_token;
    const versions = orders.map((o) => `${o.id}:${o.version ?? 0}`).join(",");
    const query = useQuery({
        queryKey: ["prime-desk", tenantId, versions],
        enabled: connected && !!token && orders.length > 0,
        staleTime: 5 * 60_000,
        placeholderData: (previous) => previous,
        queryFn: async (): Promise<ReadonlyMap<string, PrimeDeskRow>> => {
            const res = await fetch("/api/prime/desk-preview", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ orderIds: orders.map((o) => o.id) }),
            });
            if (!res.ok) throw new Error(`Prime desk check failed: ${res.status}`);
            const answer = answerSchema.parse(await res.json());
            if (!answer.connected) return EMPTY;
            return new Map(answer.rows.map((r) => [r.orderId, r]));
        },
    });
    return { rows: query.data ?? EMPTY, loading: query.isPending && query.fetchStatus !== "idle" };
}
