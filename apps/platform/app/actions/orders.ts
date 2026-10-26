"use server";

import { createSupabaseServiceClient, verifyAccessToken } from "@/lib/supabase-server";
import type { CreateOrderInput } from "@/types/order";
import { Order, OrderItem } from "@/lib/supabase";
import { canCreateOrder } from "@/lib/tenant";
import { createOrderForTenant } from "@/lib/order-service";
import { assertNotBlocked, TenantBlockedError } from "@/lib/restrictions";
import { resolveActiveTenant } from "@/lib/auth/resolve-active-tenant";
import { isPastDaySystemOrderNumber, isSystemOrderNumber, merchantOrderNumberSchema } from "@/lib/order-number";
import { ORDER_READ_COLUMNS, RESTORE_ORDERS_BATCH_SIZE, pickOrderWriteColumns } from "@/lib/repositories/order-columns";
import { z } from "zod";

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

    // The tenant comes from the caller's own profile and is accepted only while
    // they are an active member of it (resolveActiveTenant).
    const active = await resolveActiveTenant(user.id);
    if (!active.ok) return { error: active.error };

    return { caller: { userId: user.id, tenantId: active.tenantId, role: active.role } };
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

    // Returns, replacements and clones carry their own derived numbers
    // (RTN-/RPL-/CLN-); a number in the generator's format is the server's to
    // assign (F-040).
    if (orderData.order_id && isSystemOrderNumber(orderData.order_id)) {
        return { success: false, error: "Order numbers in the automatic format are assigned by the system" };
    }

    return createOrderForTenant(orderData, tenantId);
}

// =============================================
// RENAME ORDER NUMBER
// =============================================

const renameOrderNumberInput = z.object({
    orderUuid: z.string().uuid(),
    orderNumber: merchantOrderNumberSchema,
});

/**
 * Change an order's visible number (the order-details "edit ID" control).
 *
 * Browsers cannot write orders.order_id (trg_orders_order_id_server_only):
 * the number space is shared by every tenant, so the server checks the caller
 * and the value before writing it with the service role, scoped to the
 * caller's own tenant.
 */
export async function renameOrderNumberAction(
    orderUuid: string,
    orderNumber: string,
    accessToken: string,
): Promise<{ success: boolean; data?: Order; error?: string }> {
    const resolved = await resolveCaller(accessToken);
    if ("error" in resolved) return { success: false, error: resolved.error };

    const { tenantId, role } = resolved.caller;
    if (!ORDER_WRITE_ROLES.includes(role)) {
        return { success: false, error: "You do not have permission to edit orders" };
    }

    const parsed = renameOrderNumberInput.safeParse({ orderUuid, orderNumber });
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid order number" };
    }

    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
        .from("orders")
        .update({ order_id: parsed.data.orderNumber })
        .eq("id", parsed.data.orderUuid)
        .eq("tenant_id", tenantId)
        .select(ORDER_READ_COLUMNS)
        .maybeSingle();

    if (error) {
        // orders_order_id_key is global: the number may belong to any tenant.
        if (error.code === "23505") return { success: false, error: "This order number is already in use" };
        return { success: false, error: error.message };
    }
    if (!data) return { success: false, error: "Order not found" };
    return { success: true, data: data as Order };
}

// =============================================
// RESTORE ORDERS FROM A BACKUP
// =============================================

const restoreOrdersInput = z
    .array(z.looseObject({ id: z.string().uuid() }))
    .min(1)
    .max(RESTORE_ORDERS_BATCH_SIZE);

/**
 * Upsert order rows from a snapshot or vault file into the caller's tenant.
 *
 * Browsers cannot insert orders (trg_orders_order_id_server_only), so the
 * restore runs here with the service role, which skips RLS. That makes these
 * checks the only tenant boundary:
 * - every row is written with the caller's tenant_id, whatever the file says;
 * - a batch holding an id that belongs to another tenant is refused whole, or
 *   the upsert would overwrite that tenant's order;
 * - an order that still exists keeps its current number (numbers change only
 *   through renameOrderNumberAction);
 * - a new row may carry a generator-format number only from an earlier day,
 *   so a file cannot take today's numbers from other tenants.
 */
export async function restoreOrdersAction(
    rows: unknown,
    accessToken: string,
): Promise<{ success: boolean; restored?: number; error?: string }> {
    const resolved = await resolveCaller(accessToken);
    if ("error" in resolved) return { success: false, error: resolved.error };

    const { tenantId, role } = resolved.caller;
    if (!ORDER_WRITE_ROLES.includes(role)) {
        return { success: false, error: "You do not have permission to restore orders" };
    }

    const parsed = restoreOrdersInput.safeParse(rows);
    if (!parsed.success) {
        return { success: false, error: "The backup's orders are not in the expected format" };
    }

    const supabase = createSupabaseServiceClient();
    const ids = parsed.data.map((row) => row.id);
    const { data: existing, error: existingError } = await supabase
        .from("orders")
        .select("id, tenant_id, order_id")
        .in("id", ids);
    if (existingError) return { success: false, error: existingError.message };

    const existingById = new Map((existing ?? []).map((row) => [row.id, row]));
    const foreign = (existing ?? []).filter((row) => row.tenant_id !== tenantId).length;
    if (foreign > 0) {
        return { success: false, error: `${foreign} order(s) in this backup belong to another store` };
    }

    const now = new Date();
    const writes: Record<string, unknown>[] = [];
    for (const row of parsed.data) {
        const write: Record<string, unknown> = { ...pickOrderWriteColumns(row), tenant_id: tenantId };
        const current = existingById.get(row.id);
        if (current) {
            write.order_id = current.order_id;
        } else if (
            typeof write.order_id === "string"
            && isSystemOrderNumber(write.order_id)
            && !isPastDaySystemOrderNumber(write.order_id, now)
        ) {
            return { success: false, error: `Order number ${write.order_id} is assigned by the system and cannot be restored` };
        }
        writes.push(write);
    }

    const { error } = await supabase.from("orders").upsert(writes, { onConflict: "id" });
    if (error) {
        // orders_order_id_key is global: the number may belong to any tenant.
        if (error.code === "23505") return { success: false, error: "An order number in this backup is already in use" };
        return { success: false, error: error.message };
    }
    return { success: true, restored: writes.length };
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
