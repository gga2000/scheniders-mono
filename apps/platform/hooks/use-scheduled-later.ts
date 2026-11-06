"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { orderKeys } from "@/hooks/use-orders-query";
import { useOrdersListSettledOnce } from "@/hooks/orders-list-coverage";
import { supabase } from "@/lib/supabase";
import { baghdadDayKey } from "@/lib/order-window";
import { scheduledLaterFrom, type ScheduledLater, type ScheduledLaterRow } from "@/lib/orders/scheduled-later";

async function fetchScheduledLater(tenantId: string): Promise<ScheduledLater | null> {
    const { data, error } = await supabase
        .from("orders")
        .select("id, scheduled_date")
        .eq("tenant_id", tenantId)
        .eq("status", "confirmed")
        .gt("scheduled_date", baghdadDayKey())
        .is("take_kind", null)
        .is("deleted_at", null)
        .eq("is_archived", false)
        .returns<ScheduledLaterRow[]>();
    if (error) throw error;
    return scheduledLaterFrom(data ?? []);
}

/**
 * Confirmed orders scheduled for a day after today, across all order dates.
 * Queried on its own because the list loads only the chosen window and most of
 * these arrived on an earlier day. Keyed under `orderKeys.lists()` so a status
 * or date change drops an order from the count.
 */
export function useScheduledLater(): ScheduledLater | null {
    const { session, clientReady, tenantId } = useAuth();
    // Not needed for the first card: waits for the list (see useOrdersListSettledOnce).
    const listSettled = useOrdersListSettledOnce();
    const { data } = useQuery({
        queryKey: [...orderKeys.lists(), "scheduled-later", tenantId],
        queryFn: () => {
            if (!tenantId) throw new Error("No active tenant");
            return fetchScheduledLater(tenantId);
        },
        enabled: !!session && clientReady && !!tenantId && listSettled,
        staleTime: 60_000,
    });
    return data ?? null;
}
