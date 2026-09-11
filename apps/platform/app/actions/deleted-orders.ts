"use server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";
import { authFailure, requireCaller } from "@/lib/auth/require-caller";

/**
 * ORD-A12. Unlike the other action files, these two use the COOKIE-scoped
 * client, so RLS is in force and they were never part of that P0 — a caller
 * only ever sees and restores rows their own tenant policies allow.
 *
 * The explicit `requireCaller` below adds nothing to that isolation. It is here
 * so an unauthenticated call fails with a clear message instead of an empty
 * result, and so this file cannot be read as an example of an action that needs
 * no auth — which is exactly how the pattern spread the first time.
 */

export async function getDeletedOrders() {
    try {
        await requireCaller();
    } catch (err) {
        const denied = authFailure(err);
        if (denied) return denied;
        throw err;
    }
    const supabase = await createSupabaseServerClient();
    
    // Fetch directly from orders table where deleted_at is not null
    const { data, error } = await supabase
        .from("orders")
        .select("id, order_id, sequence_number, customer_name, phone, price, status, created_at, deleted_at, items")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });

    if (error) {
        console.error("Failed to fetch deleted orders:", error);
        return { success: false, error: error.message };
    }

    return { success: true, data };
}

export async function restoreDeletedOrder(orderId: string) {
    try {
        await requireCaller();
    } catch (err) {
        const denied = authFailure(err);
        if (denied) return denied;
        throw err;
    }
    const supabase = await createSupabaseServerClient();
    
    const { error } = await supabase
        .from("orders")
        .update({ deleted_at: null })
        .eq("id", orderId);

    if (error) {
        console.error("Failed to restore order:", error);
        return { success: false, error: error.message };
    }

    revalidatePath("/orders");
    revalidatePath("/orders/trash");
    
    return { success: true };
}

/**
 * Restore several soft-deleted orders at once.
 *
 * WF-2: bulk delete had no undo, even though the delete is only a soft delete
 * and the rows sit recoverable until the 30-day purge. Restoring one id at a
 * time from the client would be a request per order; this is a single statement.
 *
 * Tenant scoping comes from RLS: this uses the caller's session client, so the
 * update can only touch rows in tenants they belong to.
 */
export async function restoreDeletedOrders(orderIds: string[]) {
    if (orderIds.length === 0) return { success: true, restored: 0 };

    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
        .from("orders")
        .update({ deleted_at: null })
        .in("id", orderIds)
        .not("deleted_at", "is", null)
        .select("id");

    if (error) {
        console.error("Failed to restore orders:", error);
        return { success: false, error: error.message };
    }

    revalidatePath("/orders");
    revalidatePath("/orders/trash");

    // `.in()` succeeds even when RLS filters rows out, so report what actually
    // came back rather than assuming the whole batch was restored.
    return { success: true, restored: (data ?? []).length };
}
