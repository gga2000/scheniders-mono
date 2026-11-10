import { createSupabaseServiceClient } from "@/lib/supabase-server";
import type { CreateOrderInput } from "@/types/order";
import { Order } from "@/lib/supabase";
import { canCreateOrder } from "@/lib/tenant";
import { assertNotBlocked, TenantBlockedError } from "@/lib/restrictions";
import { reportOrderError } from "@/lib/order-telemetry";
import { findForeignCatalogRefs, hasNegativeQuantity } from "@/lib/order-items-tenant";

/**
 * Trusted, server-side order creation.
 *
 * This module is NOT a server action — it is never reachable from the browser.
 * Callers must have already established which tenant the order belongs to:
 *   - `createOrderAction` derives it from the caller's verified session.
 *   - the Telegram webhook derives it from the verified account link.
 *
 * `tenantId` is required: the commercial guards (pause, plan limit, wallet
 * charge, usage) are the reason this path exists, and a nullable tenant made
 * them all skippable.
 */

type SupabaseAdmin = ReturnType<typeof createSupabaseServiceClient>;

export type CreateOrderResult = {
    success: boolean;
    data?: Order;
    error?: string;
    warning?: string;
};

export async function createOrderForTenant(
    orderData: CreateOrderInput,
    tenantId: string,
): Promise<CreateOrderResult> {
    const supabase = createSupabaseServiceClient();

    try {
        // ── 0. Tenant pause guard (admin-issued restrictions) ──
        try {
            await assertNotBlocked(tenantId, "new_orders");
        } catch (err) {
            if (err instanceof TenantBlockedError) {
                return {
                    success: false,
                    error: err.restrictions.reason
                        || "New orders are paused for this account.",
                };
            }
            throw err;
        }

        // A take (stock handed out in person) is not a sale: no plan limit, no
        // wallet charge, no staff alert.
        const isTake = Boolean(orderData.take_kind);

        // ── 1. Check plan limits ──
        let warning: string | undefined;
        if (!isTake) {
            const limitCheck = await canCreateOrder(tenantId);
            if (!limitCheck.allowed) {
                return { success: false, error: limitCheck.reason };
            }
            warning = limitCheck.warning;
        }

        // ── 1b. Every line's product / variant must be this tenant's (F-001) ──
        const items = Array.isArray(orderData.items) ? orderData.items : [];
        if (hasNegativeQuantity(items)) {
            return { success: false, error: "Item quantity cannot be negative." };
        }
        const foreign = await findForeignCatalogRefs(
            async (table, ids) => {
                const { data, error } = await supabase.from(table).select("id, tenant_id").in("id", ids);
                if (error) throw error;
                return data ?? [];
            },
            tenantId,
            items,
        );
        if (foreign.length > 0) {
            return { success: false, error: "One or more items are not products of this store." };
        }

        // ── 2. Create the order ──
        const payload = {
            ...orderData,
            status: orderData.status || "confirmed",
            priority: orderData.priority || "normal",
            payment_status: orderData.payment_status || "cod",
            is_return: orderData.is_return || false,
            is_archived: false,
        };

        const { data, error: insertError } = await supabase
            .rpc('create_order_atomic', { _order_data: payload, _tenant_id: tenantId });

        if (insertError) {
            throw insertError;
        }

        // ── 3. Post-creation: count the order in this month's usage ──
        if (!isTake) trackOrderUsage(tenantId, supabase).catch((err) => {
            reportOrderError(err, { operation: "trackOrderUsage", tenantId });
        });

        // ── 4. Staff WhatsApp alerts (fire-and-forget, tenant-scoped) ──
        // Reads the tenant's staff_alert_numbers settings and fans out the
        // new-order template to each registered phone. Failures are logged
        // but do not affect the order creation result.
        if (data && !isTake) {
            import("@/lib/staff-alerts").then(({ sendNewOrderAlertToStaff }) => {
                sendNewOrderAlertToStaff(data as Order, tenantId).catch((err) => {
                    console.error('[createOrderForTenant] Staff alert fanout failed:', err);
                });
            }).catch((err) => {
                console.error('[createOrderForTenant] Staff alert module load failed:', err);
            });
        }

        return { success: true, data: data as Order, warning };
    } catch (err: unknown) {
        // Extract more detailed error information
        let errorMessage = "Failed to create order";
        if (err instanceof Error) {
            errorMessage = err.message;
        } else if (typeof err === "object" && err !== null) {
            const errorObj = err as Record<string, unknown>;
            if (errorObj.message) {
                errorMessage = String(errorObj.message);
            } else if (errorObj.code) {
                errorMessage = `Database error: ${errorObj.code} - ${errorObj.details || errorObj.hint || 'Unknown error'}`;
            }
        }

        return {
            success: false,
            error: errorMessage,
        };
    }
}

// =============================================
// POST-CREATION: count the order in this month's usage.
// Money is not taken here: the one plan (Ali, 9 Nov) charges 55 IQD when an
// order is DELIVERED, in the database (charge_delivered_order trigger), so
// every path that delivers an order bills the same way, exactly once.
// =============================================

export async function trackOrderUsage(tenantId: string, supabase: SupabaseAdmin) {
    const now = new Date();
    const { error } = await supabase.rpc('increment_usage_tracking', {
        _tenant_id: tenantId,
        _year: now.getFullYear(),
        _month: now.getMonth() + 1,
    });
    if (error) reportOrderError(error, { operation: "trackOrderUsage", tenantId });
}
