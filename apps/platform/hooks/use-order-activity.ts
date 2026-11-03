"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { orderActivitySchema, type OrderActivity } from "@/lib/orders/order-activity";

/**
 * Everything the history tab shows for one order, in one request
 * (get_order_activity: status changes, edits, notes, WhatsApp, courier,
 * payment, refunds, linked orders). The order's `version` is part of the key,
 * so a save from this modal or anyone else's refetches it.
 */
export function useOrderActivity(orderId: string, version: number | null | undefined, enabled: boolean) {
    return useQuery<OrderActivity>({
        queryKey: ["order-activity", orderId, version ?? 0],
        queryFn: async () => {
            const { data, error } = await supabase.rpc("get_order_activity", { p_order_id: orderId });
            if (error) throw error;
            return orderActivitySchema.parse(data);
        },
        enabled,
        staleTime: 30_000,
    });
}
