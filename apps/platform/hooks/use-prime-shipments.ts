"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/components/auth/auth-provider";
import { orderKeys } from "@/hooks/use-orders-query";
import { useOrdersListSettledOnce } from "@/hooks/orders-list-coverage";
import { supabase } from "@/lib/supabase";
import type { PrimeShipmentView } from "@/lib/prime/chip-state";

/** Orders whose card can carry a Prime chip: out with Prime, or cancelled after it was sent. */
const CHIP_STATUSES = ["confirmed", "in_transit", "cancelled"] as const;
/** Same window as the status sync: older shipments are a person's job. */
const LOOKBACK_DAYS = 60;
/** While a tenant ships through the link, chips refresh this often (the sync writes every 5 minutes). */
const REFRESH_MS = 60_000;

const rowSchema = z.object({
    order_id: z.string(),
    case_id: z.coerce.number(),
    shipment_status: z.string().nullable(),
    step_name: z.string().nullable(),
    checked_at: z.string().nullable(),
    status_changed_at: z.string().nullable(),
    push_needed_at: z.string().nullable(),
    cancel_needed_at: z.string().nullable(),
    push_error: z.string().nullable(),
    cancelled_at: z.string().nullable(),
    cancel_refused_at: z.string().nullable(),
    resent_at: z.string().nullable(),
});

const EMPTY: ReadonlyMap<string, PrimeShipmentView> = new Map();

async function fetchPrimeShipments(tenantId: string): Promise<ReadonlyMap<string, PrimeShipmentView>> {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
    const { data, error } = await supabase
        .from("prime_shipments")
        .select(
            "order_id, case_id, shipment_status, step_name, checked_at, status_changed_at, push_needed_at, cancel_needed_at, push_error, cancelled_at, cancel_refused_at, resent_at, orders!inner(status)",
        )
        .eq("tenant_id", tenantId)
        .in("orders.status", [...CHIP_STATUSES])
        .gte("sent_at", since);
    if (error) throw error;
    if (!data || data.length === 0) return EMPTY;
    const rows = z.array(rowSchema).parse(data);
    return new Map(
        rows.map((r) => [
            r.order_id,
            {
                caseId: r.case_id,
                status: r.shipment_status,
                stepName: r.step_name,
                checkedAt: r.checked_at,
                statusChangedAt: r.status_changed_at,
                pending: r.push_needed_at !== null || r.cancel_needed_at !== null,
                pushError: r.push_error,
                cancelledAt: r.cancelled_at,
                cancelRefusedAt: r.cancel_refused_at,
                resentAt: r.resent_at,
            },
        ]),
    );
}

const primeShipmentsKey = (tenantId: string | null | undefined) => [...orderKeys.lists(), "prime-shipments", tenantId] as const;

/**
 * The tenant's Prime shipments by order id, for the order cards' Prime chip.
 *
 * One query for the whole page, not one per card. Keyed under
 * `orderKeys.lists()` so a status change (which invalidates that prefix)
 * refreshes it. Tenants without the link get an empty map and no polling.
 */
export function usePrimeShipments(): ReadonlyMap<string, PrimeShipmentView> {
    const { session, clientReady, tenantId } = useAuth();
    // Not needed for the first card: waits for the list (see useOrdersListSettledOnce).
    const listSettled = useOrdersListSettledOnce();
    const { data } = useQuery({
        queryKey: primeShipmentsKey(tenantId),
        queryFn: () => {
            if (!tenantId) throw new Error("No active tenant");
            return fetchPrimeShipments(tenantId);
        },
        enabled: !!session && clientReady && !!tenantId && listSettled,
        staleTime: 30_000,
        refetchInterval: (query) => ((query.state.data?.size ?? 0) > 0 ? REFRESH_MS : false),
    });
    return data ?? EMPTY;
}

const resendAnswer = z.object({
    success: z.literal(true),
    ok: z.boolean(),
    alreadyResent: z.boolean().optional(),
    reason: z.string().optional(),
    message: z.string().optional(),
});
export type PrimeResendAnswer = z.infer<typeof resendAnswer>;

/** Ask Prime to deliver a returned parcel again (POST /api/prime/resend); refreshes the chips after. */
export function usePrimeResend() {
    const { session, tenantId } = useAuth();
    const token = session?.access_token;
    const queryClient = useQueryClient();
    return useCallback(
        async (orderId: string, note: string): Promise<PrimeResendAnswer> => {
            if (!token) throw new Error("Not signed in");
            const res = await fetch("/api/prime/resend", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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
