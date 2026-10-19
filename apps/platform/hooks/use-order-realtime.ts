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
    /**
     * Active tenant (useAuth). Realtime applies RLS, which admits every tenant
     * the user belongs to, so without this filter a member of two tenants
     * would get the other book's rows merged into the list cache and its new
     * orders notified. Null keeps the channel closed until the tenant is known.
     */
    tenantId: string | null;
    /** Current cache window, so realtime never adds rows outside it. */
    getWindow?: () => OrderWindow;
    onReconnect?: () => void;
}

interface UseOrderRealtimeReturn {
    batcherRef: MutableRefObject<RealtimeBatcher | null>;
}

export function useOrderRealtime({ tenantId, onReconnect, getWindow }: UseOrderRealtimeOptions): UseOrderRealtimeReturn {
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
        // postgres_changes takes one filter, so it scopes the tenant; archived
        // rows are dropped by the batcher (INSERT skip, UPDATE removes).
        filter: tenantId ? { column: "tenant_id", value: tenantId } : undefined,
        enabled: tenantId !== null,
        normalizer: (payload: unknown) => normalizeOrder(pickListColumns(payload as Record<string, unknown>) as unknown as Order),
        onReconnect,
        onInsert: handleInsert,
        batchDelayMs: 200,
    });

    return { batcherRef };
}
