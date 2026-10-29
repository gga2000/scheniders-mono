import { createSupabaseServiceClient } from "@/lib/supabase-server";
import type { CreateOrderInput } from "@/types/order";
import { Order } from "@/lib/supabase";
import { canCreateOrder, getCurrentUsage, getPlanLimits, getWallet } from "@/lib/tenant";
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

        // ── 1. Check plan limits ──
        const limitCheck = await canCreateOrder(tenantId);
        if (!limitCheck.allowed) {
            return { success: false, error: limitCheck.reason };
        }
        const warning = limitCheck.warning;

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

        // ── 3. Post-creation: charge wallet + increment usage (fire-and-forget) ──
        chargeAndTrack(tenantId, supabase).catch((err) => {
            // Fire-and-forget, but a failure here means the order exists and was
            // never billed — silent revenue drift. Report it.
            reportOrderError(err, { operation: "chargeAndTrack", tenantId });
        });

        // ── 4. Staff WhatsApp alerts (fire-and-forget, tenant-scoped) ──
        // Reads the tenant's staff_alert_numbers settings and fans out the
        // new-order template to each registered phone. Failures are logged
        // but do not affect the order creation result.
        if (data) {
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
// POST-CREATION: Charge wallet + increment usage
// =============================================

export async function chargeAndTrack(tenantId: string, supabase: SupabaseAdmin) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // Get current usage + plan limits to determine price
    const [usage, wallet] = await Promise.all([
        getCurrentUsage(tenantId),
        getWallet(tenantId),
    ]);
    void wallet;

    // Determine per-order price
    // We need plan info from the tenant
    const { data: tenant } = await supabase
        .from('tenants')
        .select('plan')
        .eq('id', tenantId)
        .single();

    const limits = tenant ? await getPlanLimits(tenant.plan) : null;
    const isOverLimit = limits && limits.max_orders_per_month !== -1 && usage.orders_count >= limits.max_orders_per_month;
    const chargeAmount = isOverLimit
        ? (limits?.overage_price_iqd ?? 500)
        : (limits?.order_price_iqd ?? 100);

    // ── Increment usage_tracking atomically ──
    await supabase.rpc('increment_usage_tracking', {
        _tenant_id: tenantId,
        _year: year,
        _month: month,
    });

    // ── Charge wallet atomically (prevents race conditions) ──
    // A zero price (the 'internal' plan) means nothing to charge;
    // charge_wallet_atomic refuses non-positive amounts.
    if (chargeAmount <= 0) return;
    try {
        const { data: chargeResult, error: chargeError } = await supabase
            .rpc('charge_wallet_atomic', {
                _tenant_id: tenantId,
                _amount: chargeAmount,
                _description: `Order charge${isOverLimit ? ' (overage)' : ''}`,
                _order_id: null,
            });

        if (chargeError) {
            reportOrderError(chargeError, {
                operation: "chargeWallet",
                tenantId,
                extra: { amount: chargeAmount, isOverLimit },
            });
        } else if (chargeResult && !chargeResult.success) {
            // The RPC ran but declined the charge (e.g. insufficient balance).
            // Not an exception, but the tenant is now un-billed for this order.
            reportOrderError(new Error(`Wallet charge declined: ${chargeResult.error}`), {
                operation: "chargeWallet",
                tenantId,
                extra: { amount: chargeAmount, isOverLimit },
            });
        }
    } catch (err) {
        reportOrderError(err, { operation: "chargeWallet", tenantId, extra: { amount: chargeAmount } });
    }
}
