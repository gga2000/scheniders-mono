"use server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";

export async function getDeletedOrders() {
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
