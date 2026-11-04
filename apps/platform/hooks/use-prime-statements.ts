"use client";

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/components/auth/auth-provider";

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

const entrySchema = z.object({ id: z.number(), amount: z.number(), at: z.string().nullable(), confirmed: z.boolean(), remarks: z.string().nullable() });
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
    ours: z.object({ orderId: z.string(), orderNumber: z.string(), customerName: z.string().nullable(), collect: z.number().nullable(), fee: z.number().nullable() }).nullable(),
    primeCollect: z.number(),
    primeFee: z.number(),
    primeNet: z.number(),
    diff: z.number().nullable(),
    kind: z.enum(["match", "different", "unknown"]),
});
export type PrimeStatementRowView = z.infer<typeof rowSchema>;

const oneAnswer = z.object({ success: z.literal(true), connected: z.literal(true), statement: z.object({ rows: z.array(rowSchema), summary: summarySchema }) });

async function getJson<T>(url: string, token: string, schema: z.ZodType<T>): Promise<T> {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
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
