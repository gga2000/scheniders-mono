"use client";

import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/components/auth/auth-provider";
import { authedFetch } from "@/lib/authed-fetch";

const summarySchema = z.object({
    parcels: z.number(),
    matched: z.number(),
    different: z.number(),
    unknown: z.number(),
    collect: z.number(),
    fees: z.number(),
    net: z.number(),
    diff: z.number(),
});
export type PrimeStatementSummaryView = z.infer<typeof summarySchema>;

const checkSchema = z.object({ parcels: z.number(), matched: z.number(), different: z.number(), unknown: z.number(), diff: z.number() });
const approvalSchema = z.object({ at: z.string(), source: z.enum(["app", "pdf"]) });
export type PrimeApprovalView = z.infer<typeof approvalSchema>;

const entrySchema = z.object({
    id: z.number(),
    amount: z.number(),
    at: z.string().nullable(),
    confirmed: z.boolean(),
    remarks: z.string().nullable(),
    /** How its parcels matched our orders when last checked; null until someone opens it or the watch reads it. */
    check: checkSchema.nullable(),
    /** Already closed in our books (approved here or imported from the PDF). */
    approval: approvalSchema.nullable(),
});
export type PrimeStatementEntryView = z.infer<typeof entrySchema>;

const listAnswer = z.union([
    z.object({ success: z.literal(true), connected: z.literal(false) }),
    z.object({
        success: z.literal(true),
        connected: z.literal(true),
        statements: z.array(entrySchema),
        latest: z.object({ id: z.number(), summary: summarySchema }).nullable(),
    }),
]);

const rowSchema = z.object({
    caseId: z.number().nullable(),
    receipt: z.string().nullable(),
    ours: z
        .object({
            orderId: z.string(),
            orderNumber: z.string(),
            customerName: z.string().nullable(),
            collect: z.number().nullable(),
            fee: z.number().nullable(),
            status: z.string(),
            linked: z.boolean(),
        })
        .nullable(),
    primeCollect: z.number(),
    primeFee: z.number(),
    primeNet: z.number(),
    diff: z.number().nullable(),
    kind: z.enum(["match", "different", "unknown"]),
});
export type PrimeStatementRowView = z.infer<typeof rowSchema>;

const oneAnswer = z.object({
    success: z.literal(true),
    connected: z.literal(true),
    statement: z.object({ rows: z.array(rowSchema), summary: summarySchema }),
    approval: approvalSchema.nullable(),
});

async function getJson<T>(url: string, token: string, schema: z.ZodType<T>): Promise<T> {
    const res = await authedFetch(url);
    if (!res.ok) throw new Error(`Prime statements failed: ${res.status}`);
    return schema.parse(await res.json());
}

/** Prime's payments to the store and the newest one's match against our orders (admins only). */
export function usePrimeStatements(enabled: boolean) {
    const { session, tenantId } = useAuth();
    const token = session?.access_token;
    return useQuery({
        queryKey: ["prime-statements", tenantId],
        enabled: enabled && !!token,
        staleTime: 5 * 60_000,
        queryFn: () => getJson("/api/prime/statements", token ?? "", listAnswer),
    });
}

/** One payment's parcels, each matched to its order. */
export function usePrimeStatement(id: number | null) {
    const { session, tenantId } = useAuth();
    const token = session?.access_token;
    return useQuery({
        queryKey: ["prime-statements", tenantId, id],
        enabled: id !== null && !!token,
        staleTime: 5 * 60_000,
        queryFn: () => getJson(`/api/prime/statements?id=${id}`, token ?? "", oneAnswer),
    });
}

const actionAnswer = z.union([
    z.object({
        success: z.literal(true),
        outcome: z.union([
            z.object({ kind: z.literal("approved"), completed: z.number() }),
            z.object({ kind: z.literal("already"), approval: approvalSchema }),
            z.object({ kind: z.literal("accepted"), price: z.number() }),
            z.object({ kind: z.literal("same") }),
        ]),
    }),
    z.object({
        success: z.literal(false),
        reason: z.enum(["prime_unreachable", "prime_rejected", "not_connected", "unknown_payment", "not_on_payment", "conflict", "prepaid"]),
        message: z.string().optional(),
    }),
]);
export type PrimeStatementActionAnswer = z.infer<typeof actionAnswer>;

export type PrimeStatementAction = { action: "approve"; id: number } | { action: "accept_price"; id: number; orderId: string };

/**
 * Closes a payment's matched orders as paid, or takes Prime's collected
 * amount as one order's price. Both refresh the payment and its list.
 */
export function usePrimeStatementAction() {
    const { tenantId } = useAuth();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (body: PrimeStatementAction): Promise<PrimeStatementActionAnswer> => {
            const res = await authedFetch("/api/prime/statements", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const parsed = actionAnswer.safeParse(await res.json().catch(() => null));
            if (!parsed.success) throw new Error(`Prime statement action failed: ${res.status}`);
            return parsed.data;
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: ["prime-statements", tenantId] }),
    });
}
