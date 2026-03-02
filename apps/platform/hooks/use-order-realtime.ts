"use client";

import { useCallback } from "react";
import { normalizeOrder } from "@/lib/order-normalize-utils";
import { notificationService } from "@/lib/notification-service";
import { orderKeys } from "@/hooks/use-orders-query";
import { useRealtimeQuery } from "@/hooks/use-realtime-query";
import type { Order } from "@/lib/supabase";

// =============================================
// ORDER REALTIME HOOK
// Thin wrapper around useRealtimeQuery for the
// orders table. Handles order-specific concerns
// like notifications.
// =============================================

interface UseOrderRealtimeOptions {
    onReconnect?: () => void;
}

export function useOrderRealtime({ onReconnect }: UseOrderRealtimeOptions) {
    const handleInsert = useCallback((order: Order) => {
        notificationService.showNewOrderNotification(
            order.customer_name,
            order.order_id,
            order.priority
        );
    }, []);

    useRealtimeQuery<Order>({
        table: "orders",
        queryKey: orderKeys.lists(),
        normalizer: normalizeOrder,
        onReconnect,
        onInsert: handleInsert,
        batchDelayMs: 200,
    });
}
