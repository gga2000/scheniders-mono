"use server";

import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { Order, OrderItem } from "@/lib/supabase";
import { canCreateOrder, getCurrentUsage, getPlanLimits, getWallet } from "@/lib/tenant";
import { assertNotBlocked, TenantBlockedError } from "@/lib/restrictions";

// =============================================
// CHECK LIMITS (called from UI before showing create modal)
// =============================================

export async function checkOrderLimitsAction(
    tenantId: string
): Promise<{ allowed: boolean; reason?: string; warning?: string }> {
    return canCreateOrder(tenantId);
}

// =============================================
// CREATE ORDER (with charging + usage tracking)
// =============================================

export async function createOrderAction(
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

export async function splitOrderAction(
    originalOrderId: string,
    keptItems: OrderItem[],
    returnedItems: OrderItem[],
    tenantId: string | null
): Promise<{ success: boolean; data?: Order; error?: string }> {
    const supabase = createSupabaseServiceClient();

    try {
        // Splitting creates a new return-order row (a write). Block when paused.
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
        // We delegate the split operation to our new atomic PostgreSQL RPC
        // which encapsulates fetching, calculating, updating, and inserting inside
        // a SERIALIZABLE transaction via row locks.
        const { data: createdReturnOrder, error: splitError } = await supabase
            .rpc('split_order_atomic', {
                _original_order_id: originalOrderId,
                _kept_items: keptItems,
                _returned_items: returnedItems,
                _tenant_id: tenantId,
            });

        if (splitError) {
            throw new Error(splitError.message || "Failed to execute atomic split");
        }

        return { success: true, data: createdReturnOrder as Order };

    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Failed to split order";
        return { success: false, error: errorMessage };
    }
}

// =============================================
// POST-CREATION: Charge wallet + increment usage
// =============================================

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

// =============================================
// CHECK ORDER ID EXISTS
// =============================================

export async function checkOrderIdExists(orderId: string, excludeUuid?: string, tenantId?: string | null): Promise<boolean> {
    const supabase = createSupabaseServiceClient();

    try {
        let query = supabase
            .from("orders")
            .select("id")
            .eq("order_id", orderId);

        if (excludeUuid) {
            query = query.neq("id", excludeUuid);
        }

        if (tenantId) {
            query = query.eq("tenant_id", tenantId);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data && data.length > 0;
    } catch {
        return false;
    }
}
