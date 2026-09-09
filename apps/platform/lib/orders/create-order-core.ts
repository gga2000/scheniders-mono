import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { Order } from "@/lib/supabase";
import { canCreateOrder, getCurrentUsage, getPlanLimits, getWallet } from "@/lib/tenant";
import { assertNotBlocked, TenantBlockedError } from "@/lib/restrictions";

/**
 * ORD-A12. The order-creation implementation, deliberately NOT a Server Action.
 *
 * Everything exported from a "use server" module becomes a publicly callable
 * HTTP endpoint. This work has two callers with completely different trust
 * stories:
 *
 *   - the browser, which must prove who it is (createOrderAction in
 *     app/actions/orders.ts authenticates, then delegates here), and
 *   - the Telegram webhook, which has no user session at all and is trusted by
 *     its own signature check before it ever reaches this code.
 *
 * Keeping the implementation here means the second caller no longer forces the
 * first to be unauthenticated. Nothing in this file is reachable over HTTP.
 *
 * CALLERS MUST AUTHORISE tenantId THEMSELVES. This function deliberately does
 * not — it cannot know which trust story applies.
 */

export async function createOrderCore(
    orderData: Omit<Order, "id" | "created_at" | "updated_at">,
    tenantId: string | null,
    retryCount = 0
): Promise<{ success: boolean; data?: Order; error?: string; warning?: string }> {
    const MAX_RETRIES = 5;
    const supabase = createSupabaseServiceClient();

    try {
        // ── 0. Tenant pause guard (admin-issued restrictions) ──
        if (tenantId) {
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
        }

        // ── 1. Check plan limits (if tenant exists) ──
        let warning: string | undefined;
        if (tenantId) {
            const limitCheck = await canCreateOrder(tenantId);
            if (!limitCheck.allowed) {
                return { success: false, error: limitCheck.reason };
            }
            warning = limitCheck.warning;
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
        if (tenantId) {
            chargeAndTrack(tenantId, supabase).catch((err) => {
                console.error('[createOrderAction] Post-creation charge/track failed:', err);
            });
        }

        // ── 4. Staff WhatsApp alerts (fire-and-forget, tenant-scoped) ──
        // Reads the tenant's staff_alert_numbers settings and fans out the
        // new-order template to each registered phone. Failures are logged
        // but do not affect the order creation result.
        if (data) {
            import("@/lib/staff-alerts").then(({ sendNewOrderAlertToStaff }) => {
                sendNewOrderAlertToStaff(data as Order, tenantId).catch((err) => {
                    console.error('[createOrderAction] Staff alert fanout failed:', err);
                });
            }).catch((err) => {
                console.error('[createOrderAction] Staff alert module load failed:', err);
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

type SupabaseAdmin = ReturnType<typeof createSupabaseServiceClient>;

async function chargeAndTrack(tenantId: string, supabase: SupabaseAdmin) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // Get current usage + plan limits to determine price
    const [usage, wallet] = await Promise.all([
        getCurrentUsage(tenantId),
        getWallet(tenantId),
    ]);

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
    try {
        const { data: chargeResult, error: chargeError } = await supabase
            .rpc('charge_wallet_atomic', {
                _tenant_id: tenantId,
                _amount: chargeAmount,
                _description: `Order charge${isOverLimit ? ' (overage)' : ''}`,
                _order_id: null,
            });

        if (chargeError) {
            console.error('[chargeAndTrack] Wallet charge RPC error:', chargeError.message);
        } else if (chargeResult && !chargeResult.success) {
            console.warn('[chargeAndTrack] Wallet charge failed:', chargeResult.error);
        }
    } catch (err) {
        console.error('[chargeAndTrack] Wallet charge exception:', err);
    }
}
