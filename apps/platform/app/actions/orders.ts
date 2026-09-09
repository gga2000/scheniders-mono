"use server";

import { createSupabaseServiceClient, verifyAccessToken } from "@/lib/supabase-server";
import type { CreateOrderInput } from "@/types/order";
import { Order, OrderItem } from "@/lib/supabase";
import { canCreateOrder } from "@/lib/tenant";
import { createOrderForTenant } from "@/lib/order-service";
import { assertNotBlocked, TenantBlockedError } from "@/lib/restrictions";

// =============================================
// CALLER RESOLUTION
// =============================================

/**
 * Server actions are public POST endpoints — anyone who can read the client
 * bundle can invoke them. Every mutating action below therefore verifies the
 * caller's access token and derives the tenant from their own profile.
 *
 * The tenant is NEVER taken from an argument: a client-supplied tenant id let
 * any signed-in user write into any other tenant, and a null one skipped the
 * pause / plan-limit / wallet-charge guards entirely.
 */
type Caller = { userId: string; tenantId: string; role: string };

/** Roles permitted to mutate orders. `viewer` is read-only. */
const ORDER_WRITE_ROLES = ["admin", "super_admin", "employee"];

async function resolveCaller(
    accessToken: string | undefined,
): Promise<{ caller: Caller } | { error: string }> {
    if (!accessToken) return { error: "Unauthorized" };

    const { user, error } = await verifyAccessToken(accessToken);
    if (error || !user) return { error: "Unauthorized" };

    const supabase = createSupabaseServiceClient();
    const { data: profile } = await supabase
        .from("user_profiles")
        .select("current_tenant_id, role, is_active")
        .eq("id", user.id)
        .maybeSingle();

    // Deactivating a user is a soft flag and does not revoke their existing
    // session, so the check has to happen on every call.
    if (profile?.is_active === false) return { error: "Account deactivated" };

    const tenantId = profile?.current_tenant_id as string | undefined;
    if (!tenantId) return { error: "No active tenant" };

    // Deny by default: an absent/NULL role must not inherit write access.
    return {
        caller: {
            userId: user.id,
            tenantId,
            role: (profile?.role as string) ?? "",
        },
    };
}

// =============================================
// CHECK LIMITS (called from UI before showing create modal)
// =============================================

export async function checkOrderLimitsAction(
    accessToken: string,
): Promise<{ allowed: boolean; reason?: string; warning?: string }> {
    const resolved = await resolveCaller(accessToken);
    if ("error" in resolved) return { allowed: false, reason: resolved.error };
    return canCreateOrder(resolved.caller.tenantId);
}

// =============================================
// CREATE ORDER (with charging + usage tracking)
// =============================================

export async function createOrderAction(
    orderData: CreateOrderInput,
    accessToken: string,
): Promise<{ success: boolean; data?: Order; error?: string; warning?: string }> {
    const resolved = await resolveCaller(accessToken);
    if ("error" in resolved) return { success: false, error: resolved.error };

    const { tenantId, role } = resolved.caller;
    if (!ORDER_WRITE_ROLES.includes(role)) {
        return { success: false, error: "You do not have permission to create orders" };
    }

    return createOrderForTenant(orderData, tenantId);
}

// =============================================
// SPLIT ORDER
// =============================================

export async function splitOrderAction(
    originalOrderId: string,
    keptItems: OrderItem[],
    returnedItems: OrderItem[],
    accessToken: string,
): Promise<{ success: boolean; data?: Order; error?: string }> {
    const resolved = await resolveCaller(accessToken);
    if ("error" in resolved) return { success: false, error: resolved.error };

    const { tenantId, role } = resolved.caller;
    if (!ORDER_WRITE_ROLES.includes(role)) {
        return { success: false, error: "You do not have permission to split orders" };
    }

    const supabase = createSupabaseServiceClient();

    try {
        // Splitting creates a new return-order row (a write). Block when paused.
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

        // We delegate the split operation to our atomic PostgreSQL RPC which
        // encapsulates fetching, calculating, updating, and inserting inside a
        // SERIALIZABLE transaction via row locks. The tenant passed here is the
        // caller's own — the RPC's membership guard rejects anything else.
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
// CHECK ORDER ID EXISTS
// =============================================

export async function checkOrderIdExists(
    orderId: string,
    excludeUuid: string | undefined,
    accessToken: string,
): Promise<boolean> {
    // Never answer "false" (i.e. "this id is free") when we could not actually
    // check — the caller renders that as an "available" badge and the insert
    // then fails on the global unique index. Surface the failure instead.
    const resolved = await resolveCaller(accessToken);
    if ("error" in resolved) throw new Error(resolved.error);

    const supabase = createSupabaseServiceClient();

    // NOTE: `orders_order_id_key` is a GLOBAL unique index (not per-tenant), so
    // this existence check must be global too — scoping it to the caller's tenant
    // would report a taken order_id as free and fail the insert on 23505.
    let query = supabase
        .from("orders")
        .select("id")
        .eq("order_id", orderId);

    if (excludeUuid) {
        query = query.neq("id", excludeUuid);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data.length > 0;
}

/**
 * Reverse a split, restoring the original order and retracting the return it
 * created.
 *
 * WF-2: only valid while that return order is untouched — the RPC refuses once
 * it has moved off `rejected`, been sent to a courier, or had a refund recorded,
 * because by then the split reflects something that already happened.
 */
export async function unsplitOrderAction(
    splitLogId: string,
    accessToken: string,
): Promise<{ success: boolean; error?: string }> {
    const resolved = await resolveCaller(accessToken);
    if ("error" in resolved) return { success: false, error: resolved.error };

    const { tenantId, role } = resolved.caller;
    if (!ORDER_WRITE_ROLES.includes(role)) {
        return { success: false, error: "You do not have permission to undo a split" };
    }

    const supabase = createSupabaseServiceClient();
    const { error } = await supabase.rpc("unsplit_order_atomic", {
        _split_log_id: splitLogId,
        _tenant_id: tenantId,
    });

    if (error) {
        return { success: false, error: error.message };
    }
    return { success: true };
}
