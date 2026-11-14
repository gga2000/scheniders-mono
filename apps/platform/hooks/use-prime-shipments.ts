"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/components/auth/auth-provider";
import { orderKeys } from "@/hooks/use-orders-query";
import { useOrdersListSettledOnce } from "@/hooks/orders-list-coverage";
import { supabase } from "@/lib/supabase";
import type { PrimeShipmentView } from "@/lib/prime/chip-state";
import { primeBucket, primeIsStuck, type PrimeRowFilter } from "@/lib/prime/track";
import { authedFetch } from "@/lib/authed-fetch";

/** Orders whose card can carry a Prime chip: out with Prime, or cancelled after it was sent. */
const CHIP_STATUSES = ["confirmed", "in_transit", "cancelled"] as const;
/** Same window as the status sync: older shipments are a person's job. */
const LOOKBACK_DAYS = 60;
/** While a tenant ships through the link, chips refresh this often (the sync writes every 5 minutes). */
const REFRESH_MS = 60_000;

/** The prime_shipments columns a Prime view is read from. */
export const PRIME_VIEW_COLUMNS =
    "order_id, case_id, shipment_status, step_code, step_name, sent_at, receipt_amount_iqd, shipment_charge, checked_at, status_changed_at, push_needed_at, cancel_needed_at, push_error, cancelled_at, cancel_refused_at, resent_at, return_reason, postpone_reason, postponed_to, problem_checked_at, problem_checked_by, problem_note, failed_notice_sent_at, failed_notice_sent_by";

export const primeShipmentRowSchema = z.object({
    order_id: z.string(),
    case_id: z.coerce.number(),
    shipment_status: z.string().nullable(),
    step_code: z.string().nullable(),
    step_name: z.string().nullable(),
    sent_at: z.string(),
    receipt_amount_iqd: z.coerce.number().nullable(),
    shipment_charge: z.coerce.number().nullable(),
    checked_at: z.string().nullable(),
    status_changed_at: z.string().nullable(),
    push_needed_at: z.string().nullable(),
    cancel_needed_at: z.string().nullable(),
    push_error: z.string().nullable(),
    cancelled_at: z.string().nullable(),
    cancel_refused_at: z.string().nullable(),
    resent_at: z.string().nullable(),
    return_reason: z.string().nullable(),
    postpone_reason: z.string().nullable(),
    postponed_to: z.string().nullable(),
    problem_checked_at: z.string().nullable(),
    problem_checked_by: z.string().nullable(),
    problem_note: z.string().nullable(),
    failed_notice_sent_at: z.string().nullable(),
    failed_notice_sent_by: z.string().nullable(),
});

const EMPTY: ReadonlyMap<string, PrimeShipmentView> = new Map();

async function fetchPrimeShipments(tenantId: string): Promise<ReadonlyMap<string, PrimeShipmentView>> {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
    const { data, error } = await supabase
        .from("prime_shipments")
        .select(`${PRIME_VIEW_COLUMNS}, orders!inner(status)`)
        .eq("tenant_id", tenantId)
        .in("orders.status", [...CHIP_STATUSES])
        .gte("sent_at", since);
    if (error) throw error;
    if (!data || data.length === 0) return EMPTY;
    const rows = z.array(primeShipmentRowSchema).parse(data);
    return new Map(rows.map((r) => [r.order_id, primeViewFromRow(r)]));
}

/** A prime_shipments row as the cards and the Prime page read it. */
export function primeViewFromRow(r: z.infer<typeof primeShipmentRowSchema>): PrimeShipmentView {
    return {
        caseId: r.case_id,
        status: r.shipment_status,
        stepCode: r.step_code,
        stepName: r.step_name,
        sentAt: r.sent_at,
        receiptAmountIqd: r.receipt_amount_iqd,
        shipmentCharge: r.shipment_charge,
        checkedAt: r.checked_at,
        statusChangedAt: r.status_changed_at,
        pending: r.push_needed_at !== null || r.cancel_needed_at !== null,
        pushError: r.push_error,
        cancelledAt: r.cancelled_at,
        cancelRefusedAt: r.cancel_refused_at,
        resentAt: r.resent_at,
        returnReason: r.return_reason,
        postponeReason: r.postpone_reason,
        postponedTo: r.postponed_to,
        problemCheckedAt: r.problem_checked_at,
        problemCheckedBy: r.problem_checked_by,
        problemNote: r.problem_note,
        warnedAt: r.failed_notice_sent_at,
        warnedBy: r.failed_notice_sent_by,
    };
}

export const primeShipmentsKey = (tenantId: string | null | undefined) => [...orderKeys.lists(), "prime-shipments", tenantId] as const;

/**
 * The tenant's Prime shipments by order id, for the order cards' Prime chip.
 *
 * One query for the whole page, not one per card. Keyed under
 * `orderKeys.lists()` so a status change (which invalidates that prefix)
 * refreshes it. Tenants without the link get an empty map and no polling.
 */
export function usePrimeShipments(): ReadonlyMap<string, PrimeShipmentView> {
    return usePrimeShipmentsQuery().data ?? EMPTY;
}

function usePrimeShipmentsQuery() {
    const { session, clientReady, tenantId } = useAuth();
    // Not needed for the first card: waits for the list (see useOrdersListSettledOnce).
    const listSettled = useOrdersListSettledOnce();
    return useQuery({
        queryKey: primeShipmentsKey(tenantId),
        queryFn: () => {
            if (!tenantId) throw new Error("No active tenant");
            return fetchPrimeShipments(tenantId);
        },
        enabled: !!session && clientReady && !!tenantId && listSettled,
        staleTime: 30_000,
        refetchInterval: (query) => ((query.state.data?.size ?? 0) > 0 ? REFRESH_MS : false),
    });
}

const NO_SETS: ReadonlyMap<PrimeRowFilter, ReadonlySet<string>> = new Map();

/**
 * Order ids per bucket of the "in transit" Prime row (on the way, postponed,
 * needs you, coming back) and of "stuck 3+ days". Stuck is measured against
 * when the shipments were read, so it moves with each refresh, not each render.
 */
export function usePrimeRowSets(): { sets: ReadonlyMap<PrimeRowFilter, ReadonlySet<string>>; readAt: number } {
    const { data, dataUpdatedAt } = usePrimeShipmentsQuery();
    const sets = useMemo(() => {
        if (!data || data.size === 0) return NO_SETS;
        const byFilter = new Map<PrimeRowFilter, Set<string>>();
        const add = (filter: PrimeRowFilter, orderId: string) => {
            const ids = byFilter.get(filter) ?? new Set<string>();
            ids.add(orderId);
            byFilter.set(filter, ids);
        };
        for (const [orderId, view] of data) {
            const bucket = primeBucket(view);
            if (bucket) add(bucket, orderId);
            if (primeIsStuck(view, dataUpdatedAt)) add("stuck", orderId);
        }
        return byFilter;
    }, [data, dataUpdatedAt]);
    return { sets, readAt: dataUpdatedAt };
}

const journeyAnswer = z.discriminatedUnion("ok", [
    z.object({
        success: z.literal(true),
        ok: z.literal(true),
        caseId: z.number(),
        sentAt: z.string(),
        resentAt: z.string().nullable(),
        steps: z.array(
            z.object({ at: z.string().nullable(), stepCode: z.string().nullable(), stepName: z.string().nullable(), status: z.string().nullable() }),
        ),
    }),
    z.object({ success: z.literal(true), ok: z.literal(false), reason: z.string() }),
]);
export type PrimeJourneyAnswer = z.infer<typeof journeyAnswer>;

/** The parcel's journey at Prime (GET /api/prime/history), read when its panel opens and kept a minute. */
export function usePrimeJourney(orderId: string, enabled: boolean) {
    const { session, tenantId } = useAuth();
    const token = session?.access_token;
    return useQuery({
        queryKey: ["prime-journey", tenantId, orderId],
        enabled: enabled && !!token,
        staleTime: 60_000,
        queryFn: async (): Promise<PrimeJourneyAnswer> => {
            const res = await authedFetch(`/api/prime/history?orderId=${encodeURIComponent(orderId)}`, { });
            if (!res.ok) throw new Error(`Prime journey failed: ${res.status}`);
            return journeyAnswer.parse(await res.json());
        },
    });
}

/** A customer's earlier parcels with Prime, by phone: how many, and how many came back. */
export interface PrimeCustomerRecord {
    parcels: number;
    delivered: number;
    returned: number;
}

const recordRowSchema = z.object({ order_id: z.string(), shipment_status: z.string().nullable() });
const DELIVERED = new Set(["DELIVERED", "PART_DELIVERED", "DELIVERED_CHANGE_PRICE"]);

/** The customer's other Prime parcels in this store (RLS keeps it to the tenant), for the order's Prime panel. */
export function usePrimeCustomerRecord(orderId: string, phone: string, enabled: boolean) {
    const { session, clientReady, tenantId } = useAuth();
    return useQuery({
        queryKey: [...orderKeys.lists(), "prime-customer", tenantId, phone],
        enabled: enabled && !!session && clientReady && !!tenantId && phone.trim() !== "",
        staleTime: 5 * 60_000,
        queryFn: async (): Promise<PrimeCustomerRecord> => {
            if (!tenantId) throw new Error("No active tenant");
            const { data, error } = await supabase
                .from("prime_shipments")
                .select("order_id, shipment_status, orders!inner(phone)")
                .eq("tenant_id", tenantId)
                .eq("orders.phone", phone)
                .is("cancelled_at", null);
            if (error) throw error;
            const others = z.array(recordRowSchema).parse(data ?? []).filter((r) => r.order_id !== orderId);
            return {
                parcels: others.length,
                delivered: others.filter((r) => r.shipment_status !== null && DELIVERED.has(r.shipment_status)).length,
                returned: others.filter((r) => r.shipment_status === "FAILED_DELIVER_RETURNED_TO_SENDER").length,
            };
        },
    });
}

const resendAnswer = z.object({
    success: z.literal(true),
    ok: z.boolean(),
    alreadyResent: z.boolean().optional(),
    reason: z.string().optional(),
    message: z.string().optional(),
});
export type PrimeResendAnswer = z.infer<typeof resendAnswer>;

const pullBackAnswer = z.object({
    success: z.literal(true),
    ok: z.boolean(),
    reason: z.string().optional(),
    message: z.string().optional(),
});
export type PrimePullBackAnswer = z.infer<typeof pullBackAnswer>;

/** Take a parcel back from Prime before pickup (POST /api/prime/pull-back); refreshes the chips after. */
export function usePrimePullBack() {
    const { session, tenantId } = useAuth();
    const token = session?.access_token;
    const queryClient = useQueryClient();
    return useCallback(
        async (orderId: string): Promise<PrimePullBackAnswer> => {
            if (!token) throw new Error("Not signed in");
            const res = await authedFetch("/api/prime/pull-back", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId }),
            });
            if (!res.ok) throw new Error(`Pull back failed: ${res.status}`);
            const answer = pullBackAnswer.parse(await res.json());
            await queryClient.invalidateQueries({ queryKey: primeShipmentsKey(tenantId) });
            return answer;
        },
        [token, tenantId, queryClient],
    );
}

/** Ask Prime to deliver a returned parcel again (POST /api/prime/resend); refreshes the chips after. */
export function usePrimeResend() {
    const { session, tenantId } = useAuth();
    const token = session?.access_token;
    const queryClient = useQueryClient();
    return useCallback(
        async (orderId: string, note: string): Promise<PrimeResendAnswer> => {
            if (!token) throw new Error("Not signed in");
            const res = await authedFetch("/api/prime/resend", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId, ...(note.trim() ? { note: note.trim() } : {}) }),
            });
            if (!res.ok) throw new Error(`Resend failed: ${res.status}`);
            const answer = resendAnswer.parse(await res.json());
            await queryClient.invalidateQueries({ queryKey: primeShipmentsKey(tenantId) });
            return answer;
        },
        [token, tenantId, queryClient],
    );
}

const problemAnswer = z.object({ success: z.boolean(), error: z.string().optional() });

/** Marks a problem parcel handled (with an optional note) or takes the mark off (POST /api/prime/problem); refreshes the Prime views after. */
export function usePrimeProblemMark() {
    const { session, tenantId } = useAuth();
    const token = session?.access_token;
    const queryClient = useQueryClient();
    return useCallback(
        async (body: { action: "handled"; orderId: string; note?: string } | { action: "reopen"; orderId: string }): Promise<boolean> => {
            if (!token) throw new Error("Not signed in");
            const res = await authedFetch("/api/prime/problem", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const answer = problemAnswer.parse(await res.json().catch(() => ({ success: false })));
            await queryClient.invalidateQueries({ queryKey: primeShipmentsKey(tenantId) });
            return answer.success;
        },
        [token, tenantId, queryClient],
    );
}

/**
 * Sends the failed-delivery WhatsApp to one order's customer now (POST
 * /api/prime/failed-notice/send); refreshes the Prime views after, so the
 * button turns into the "sent" note. Resolves with the server's error, or null.
 */
export function usePrimeFailedNoticeSend() {
    const { session, tenantId } = useAuth();
    const token = session?.access_token;
    const queryClient = useQueryClient();
    return useCallback(
        async (orderId: string): Promise<string | null> => {
            if (!token) throw new Error("Not signed in");
            const res = await authedFetch("/api/prime/failed-notice/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId }),
            });
            const answer = problemAnswer.parse(await res.json().catch(() => ({ success: false })));
            await queryClient.invalidateQueries({ queryKey: primeShipmentsKey(tenantId) });
            return answer.success ? null : (answer.error ?? "Not sent");
        },
        [token, tenantId, queryClient],
    );
}
