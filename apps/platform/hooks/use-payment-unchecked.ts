"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { orderKeys } from "@/hooks/use-orders-query";
import { supabase } from "@/lib/supabase";
import { PAYMENT_CHECK_STATUSES, paymentCheckSince } from "@/lib/orders/payment-check";

const EMPTY: readonly string[] = [];

async function fetchPaymentUnchecked(tenantId: string): Promise<readonly string[]> {
    const since = paymentCheckSince();
    const { data, error } = await supabase
        .from("orders")
        .select("id")
        .eq("tenant_id", tenantId)
        .in("status", [...PAYMENT_CHECK_STATUSES])
        .eq("is_reviewed", false)
        .is("deleted_at", null)
        .eq("is_archived", false)
        .or(`delivered_at.gte.${since},and(delivered_at.is.null,updated_at.gte.${since})`)
        .returns<{ id: string }[]>();
    if (error) throw error;
    return (data ?? []).map((o) => o.id);
}

/**
 * Delivered or completed orders of the last 30 days whose payment nobody has
 * checked yet, across all dates (the list loads only today by default). Keyed
 * under `orderKeys.lists()` so ticking an order drops it from the queue.
 */
export function usePaymentUnchecked(): readonly string[] {
    const { session, clientReady, tenantId } = useAuth();
    const { data } = useQuery({
        queryKey: [...orderKeys.lists(), "payment-unchecked", tenantId],
        queryFn: () => {
            if (!tenantId) throw new Error("No active tenant");
            return fetchPaymentUnchecked(tenantId);
        },
        enabled: !!session && clientReady && !!tenantId,
        staleTime: 60_000,
    });
    return data ?? EMPTY;
}
