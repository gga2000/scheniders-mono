import { supabase, type Order } from "@/lib/supabase";

// Order side records: notes and print batches. Neither touches the cached
// order list, so they live outside useOrderCrud and take the tenant from it.
// The history tab reads its own feed through get_order_activity.

export async function addOrderNote(tenantId: string | null, orderId: string, note: string) {
    try {
        const { data, error: insertError } = await supabase
            .from("order_notes")
            .insert([{ order_id: orderId, note, tenant_id: tenantId }])
            .select()
            .single();

        if (insertError) throw insertError;
        return { success: true, data };
    } catch (err) {
        console.error("Error adding note:", err);
        return {
            success: false,
            error: err instanceof Error ? err.message : "Failed to add note",
        };
    }
}

export async function createBatch(
    tenantId: string | null,
    orders: Order[],
    name: string,
    orderIds: string[],
    invoiceTemplate: string = "prime",
    printType: string = "invoice"
) {
    try {
        const selectedOrders = orders.filter((o) => orderIds.includes(o.id));
        const totalValue = selectedOrders.reduce((sum, o) => sum + Number(o.price || 0), 0);
        const cities = [...new Set(selectedOrders.map((o) => o.city).filter(Boolean))] as string[];

        const { data, error } = await supabase
            .from("print_batches")
            .insert({
                name,
                order_count: orderIds.length,
                total_value: totalValue,
                cities,
                order_ids: orderIds,
                invoice_template: invoiceTemplate,
                print_type: printType,
                tenant_id: tenantId,
            })
            .select()
            .single();

        if (error) throw error;
        return { success: true, batch: data };
    } catch (err) {
        console.error("Error creating batch:", err);
        return { success: false, error: err instanceof Error ? err.message : "Failed to create batch" };
    }
}
