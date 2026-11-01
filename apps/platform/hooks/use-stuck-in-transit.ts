"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { orderKeys } from "@/hooks/use-orders-query";
import { supabase } from "@/lib/supabase";
import {
    inTransitSince,
    stuckOrderIds,
    type InTransitRow,
    type TransitHistoryRow,
} from "@/lib/orders/stuck-in-transit";

export interface StuckInTransit {
    /** When each live in-transit order entered that status. */
    since: ReadonlyMap<string, string>;
    /** Orders in transit 7+ days, oldest first. */
    stuckIds: readonly string[];
}

const EMPTY: StuckInTransit = { since: new Map(), stuckIds: [] };

async function fetchStuckInTransit(tenantId: string): Promise<StuckInTransit> {
    const { data: orders, error } = await supabase
        .from("orders")
        .select("id, updated_at")
        .eq("tenant_id", tenantId)
        .eq("status", "in_transit")
        .is("deleted_at", null)
        .eq("is_archived", false)
        .returns<InTransitRow[]>();
    if (error) throw error;
    if (!orders || orders.length === 0) return EMPTY;

    const { data: history, error: historyError } = await supabase
        .from("order_status_history")
        .select("order_id, changed_at")
        .eq("tenant_id", tenantId)
        .eq("to_status", "in_transit")
        .in("order_id", orders.map((o) => o.id))
        .returns<TransitHistoryRow[]>();
    if (historyError) throw historyError;

    const since = inTransitSince(orders, history ?? []);
    return { since, stuckIds: stuckOrderIds(since) };
}

/**
 * Every in-transit order across all dates, with how long it has been out.
 *
 * Queried on its own because the list loads only the chosen date window
 * (today by default), and a stuck order is by definition an old one. Keyed
 * under `orderKeys.lists()` so a status change, which invalidates that prefix,
 * drops a delivered order out of the stuck list.
 */
export function useStuckInTransit(): StuckInTransit {
    const { session, clientReady, tenantId } = useAuth();
    const { data } = useQuery({
        queryKey: [...orderKeys.lists(), "stuck-in-transit", tenantId],
        queryFn: () => {
            if (!tenantId) throw new Error("No active tenant");
            return fetchStuckInTransit(tenantId);
        },
        enabled: !!session && clientReady && !!tenantId,
        staleTime: 60_000,
    });
    return data ?? EMPTY;
}
