"use client";

import { useEffect, useId } from "react";
import { z } from "zod";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/lib/supabase";
import { notificationService } from "@/lib/notification-service";
import { diag } from "@/lib/diag";

/** The part of a realtime INSERT payload the alert reads. */
const NewOrderRowSchema = z.object({
    order_id: z.string(),
    customer_name: z.string().nullish(),
    priority: z.enum(["normal", "high", "urgent"]).nullish(),
    is_archived: z.boolean().nullish(),
});

/**
 * The "New Order!" browser notification and sound, on every route.
 *
 * This used to ride on the order book's realtime channel, and the book was
 * mounted by the root layout, so the alert fired wherever the merchant was. The
 * book is now mounted only by the routes that show orders; this keeps the alert
 * app-wide on a channel that listens for INSERTs alone and touches no cache.
 *
 * Scoped to the active tenant: RLS admits every tenant the user belongs to, and
 * another tenant's orders must not be announced here. Archived inserts are not
 * announced, as before.
 */
export function useNewOrderAlerts(): void {
    const { tenantId } = useAuth();
    const instanceId = useId();

    useEffect(() => {
        if (!tenantId) return;
        const channel = supabase
            .channel(`orders_new_alerts:${tenantId}:${instanceId}`)
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "orders", filter: `tenant_id=eq.${tenantId}` },
                (payload) => {
                    const row = NewOrderRowSchema.safeParse(payload.new);
                    if (!row.success) {
                        diag.warn(`[new-order-alerts] unexpected INSERT payload: ${row.error.message}`);
                        return;
                    }
                    if (row.data.is_archived) return;
                    void notificationService.showNewOrderNotification(
                        row.data.customer_name ?? "",
                        row.data.order_id,
                        row.data.priority ?? undefined,
                    );
                },
            )
            .subscribe((status, err) => {
                if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                    diag.warn(`[new-order-alerts] channel ${status}${err ? ` ${err.message}` : ""}`);
                }
            });
        return () => {
            void supabase.removeChannel(channel);
        };
    }, [tenantId, instanceId]);
}
