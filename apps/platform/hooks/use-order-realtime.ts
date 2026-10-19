"use client";

import { useCallback } from "react";
import { normalizeOrder } from "@/lib/order-normalize-utils";
import { pickListColumns } from "@/lib/repositories/order-columns";
import { notificationService } from "@/lib/notification-service";
import { orderKeys } from "@/hooks/use-orders-query";
import { useRealtimeQuery } from "@/hooks/use-realtime-query";
import type { Order } from "@/lib/supabase";
import type { RealtimeBatcher } from "@/lib/realtime-batcher";
import type { MutableRefObject } from "react";
import type { OrderWindow } from "@/lib/order-window";

// =============================================
// ORDER REALTIME HOOK
// Thin wrapper around useRealtimeQuery for the
// orders table. Handles order-specific concerns
// like notifications and exposes the batcher
// for mutation guard integration.
// =============================================

interface UseOrderRealtimeOptions {
    /** Current cache window, so realtime never adds rows outside it. */
    getWindow?: () => OrderWindow;
    onReconnect?: () => void;
}

interface UseOrderRealtimeReturn {
    batcherRef: MutableRefObject<RealtimeBatcher | null>;
}

export function useOrderRealtime({ onReconnect, getWindow }: UseOrderRealtimeOptions): UseOrderRealtimeReturn {
    const handleInsert = useCallback((order: Order) => {
        notificationService.showNewOrderNotification(
            order.customer_name,
            order.order_id,
            order.priority
        );
    }, []);

    const { batcherRef } = useRealtimeQuery<Order>({
        getWindow,
        table: "orders",
        queryKey: orderKeys.lists(),
        filter: { column: "is_archived", value: false },
        normalizer: (payload: unknown) => normalizeOrder(pickListColumns(payload as Record<string, unknown>) as unknown as Order),
        onReconnect,
        onInsert: handleInsert,
        batchDelayMs: 200,
    });

    return { batcherRef };
}
