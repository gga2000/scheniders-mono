"use server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";

type SessionClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * The tenant the session user is working in: their own
 * `user_profiles.current_tenant_id`, read through the session client. The
 * profile's update policy only accepts a tenant the user is an active member
 * of, and RLS on `orders` still applies, so this can only ever narrow what the
 * caller sees — it keeps a user in several tenants to the one they are in.
 */
async function sessionTenantId(supabase: SessionClient): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
        .from("user_profiles")
        .select("current_tenant_id")
        .eq("id", user.id)
        .maybeSingle();
    return (data as { current_tenant_id: string | null } | null)?.current_tenant_id ?? null;
}

export async function getDeletedOrders() {
    const supabase = await createSupabaseServerClient();
    const tenantId = await sessionTenantId(supabase);
    if (!tenantId) return { success: false, error: "No active tenant" };

    // Fetch directly from orders table where deleted_at is not null
    const { data, error } = await supabase
        .from("orders")
        .select("id, order_id, sequence_number, customer_name, phone, price, status, created_at, deleted_at, items")
        .eq("tenant_id", tenantId)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });

    if (error) {
        console.error("Failed to fetch deleted orders:", error);
        return { success: false, error: error.message };
    }

    return { success: true, data };
}

export async function restoreDeletedOrder(orderId: string) {
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
