"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { orderKeys } from "@/hooks/use-orders-query";
import { useOrdersListSettledOnce } from "@/hooks/orders-list-coverage";
import { supabase } from "@/lib/supabase";
import { LOCK_PHASES, lockOrdersSince } from "@/lib/billing/lock-orders";

const EMPTY: readonly string[] = [];

async function fetchLockTimeOrders(tenantId: string): Promise<readonly string[]> {
    const { data, error } = await supabase
        .from("orders")
        .select("id")
        .eq("tenant_id", tenantId)
        .in("billing_phase", [...LOCK_PHASES])
        .is("deleted_at", null)
        .eq("is_archived", false)
        .gte("created_at", lockOrdersSince())
        .returns<{ id: string }[]>();
    if (error) throw error;
    return (data ?? []).map((o) => o.id);
}

/**
 * Orders of the last 30 days that came in while the shop was billing-locked,
 * across all dates (the list loads only today by default). Keyed under
 * `orderKeys.lists()` so a new or deleted order refreshes it.
 */
export function useLockTimeOrders(): readonly string[] {
    const { session, clientReady, tenantId } = useAuth();
    // Not needed for the first card: waits for the list (see useOrdersListSettledOnce).
    const listSettled = useOrdersListSettledOnce();
    const { data } = useQuery({
        queryKey: [...orderKeys.lists(), "lock-time", tenantId],
        queryFn: () => {
            if (!tenantId) throw new Error("No active tenant");
            return fetchLockTimeOrders(tenantId);
        },
        enabled: !!session && clientReady && !!tenantId && listSettled,
        staleTime: 60_000,
    });
    return data ?? EMPTY;
}
