"use server";

import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { Order, OrderItem } from "@/lib/supabase";
import { canCreateOrder } from "@/lib/tenant";
import { assertNotBlocked, TenantBlockedError } from "@/lib/restrictions";
import { createOrderCore } from "@/lib/orders/create-order-core";
import { authFailure, requireTenantMember } from "@/lib/auth/require-caller";

/**
 * ORD-A12. Every export here is a public HTTP endpoint.
 *
 * A Next.js Server Action is addressable independently of the component that
 * imports it — the action id ships in the client bundle and anyone can POST to
 * it with arbitrary arguments. These actions build a service-role client, which
 * bypasses RLS, and they take `tenantId` as a parameter. Until this change none
 * of them checked the caller, so any signed-in user could create orders in, and
 * bill, any tenant.
 *
 * `requireTenantMember` establishes the caller from the SESSION COOKIE — which
 * cannot be supplied as an argument — and proves membership of the tenant the
 * arguments name. Never trust the argument on its own.
 */

// =============================================
// CHECK LIMITS (called from UI before showing create modal)
// =============================================

export async function checkOrderLimitsAction(
    tenantId: string
): Promise<{ allowed: boolean; reason?: string; warning?: string }> {
    try {
        await requireTenantMember(tenantId);
    } catch (err) {
        if (authFailure(err)) return { allowed: false, reason: "Not authorised for this account." };
        throw err;
    }
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
    // Creating an order charges the tenant's wallet and consumes plan quota, so
    // the caller must be a member of the tenant they are billing.
    try {
        if (!tenantId) return { success: false, error: "No account specified." };
        await requireTenantMember(tenantId);
    } catch (err) {
        const denied = authFailure(err);
        if (denied) return denied;
        throw err;
    }
    return createOrderCore(orderData, tenantId, retryCount);
}

export async function splitOrderAction(
    originalOrderId: string,
    keptItems: OrderItem[],
    returnedItems: OrderItem[],
    tenantId: string | null
): Promise<{ success: boolean; data?: Order; error?: string }> {
    try {
        if (!tenantId) return { success: false, error: "No account specified." };
        await requireTenantMember(tenantId);
    } catch (err) {
        const denied = authFailure(err);
        if (denied) return denied;
        throw err;
    }

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

// =============================================
// CHECK ORDER ID EXISTS
// =============================================

export async function checkOrderIdExists(orderId: string, excludeUuid?: string, tenantId?: string | null): Promise<boolean> {
    // ORD-A12: `tenantId` was optional, and omitting it queried every tenant's
    // orders through a service-role client — a cross-tenant existence oracle
    // for any order id. It is now required and authorised.
    if (!tenantId) return false;
    try {
        await requireTenantMember(tenantId);
    } catch {
        return false;
    }

    const supabase = createSupabaseServiceClient();

    try {
        let query = supabase
            .from("orders")
            .select("id")
            .eq("order_id", orderId);

        if (excludeUuid) {
            query = query.neq("id", excludeUuid);
        }

        query = query.eq("tenant_id", tenantId);

        const { data, error } = await query;
        if (error) throw error;
        return data && data.length > 0;
    } catch {
        return false;
    }
}
