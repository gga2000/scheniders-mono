import {
    supabase,
    type FollowUpReminder,
    type Order,
    type OrderNote,
    type OrderStatusHistory,
} from "@/lib/supabase";

// Order side records: notes, status timeline, print batches and follow-up
// reminders, plus the order-number lookup. None of these touch the cached
// order list, so they live outside useOrderCrud and take the tenant from it.

export async function checkOrderIdExists(orderId: string, excludeUuid?: string): Promise<boolean> {
    try {
        let query = supabase
            .from("orders")
            .select("id")
            .eq("order_id", orderId);

        if (excludeUuid) {
            query = query.neq("id", excludeUuid);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data && data.length > 0;
    } catch (err) {
        console.error("Error checking order ID:", err);
        return false;
    }
}

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

export async function getOrderNotes(orderId: string): Promise<OrderNote[]> {
    try {
        const { data, error: fetchError } = await supabase
            .from("order_notes")
            .select("*")
            .eq("order_id", orderId)
            .order("created_at", { ascending: false });

        if (fetchError) throw fetchError;
        return data || [];
    } catch (err) {
        console.error("Error fetching notes:", err);
        return [];
    }
}

export async function getOrderTimeline(orderId: string): Promise<OrderStatusHistory[]> {
    try {
        const { data, error: fetchError } = await supabase
            .from("order_status_history")
            .select("*")
            .eq("order_id", orderId)
            .order("changed_at", { ascending: true });

        if (fetchError) throw fetchError;
        return data || [];
    } catch (err) {
        console.error("Error fetching timeline:", err);
        return [];
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

export async function setFollowUpReminder(
    tenantId: string | null,
    orderId: string,
    reminderDate: Date,
    note?: string
) {
    try {
        const { data, error: insertError } = await supabase
            .from("follow_up_reminders")
            .insert([{
                order_id: orderId,
                reminder_date: reminderDate.toISOString(),
                note,
                tenant_id: tenantId,
            }])
            .select()
            .single();

        if (insertError) throw insertError;
        return { success: true, data };
    } catch (err) {
        console.error("Error setting reminder:", err);
        return {
            success: false,
            error: err instanceof Error ? err.message : "Failed to set reminder",
        };
    }
}

export async function getActiveReminders(): Promise<FollowUpReminder[]> {
    try {
        const { data, error: fetchError } = await supabase
            .from("follow_up_reminders")
            .select("*")
            .eq("is_completed", false)
            .lte("reminder_date", new Date().toISOString())
            .order("reminder_date");

        if (fetchError) throw fetchError;
        return data || [];
    } catch (err) {
        console.error("Error fetching reminders:", err);
        return [];
    }
}

export async function completeReminder(reminderId: string) {
    try {
        const { error: updateError } = await supabase
            .from("follow_up_reminders")
            .update({ is_completed: true })
            .eq("id", reminderId);

        if (updateError) throw updateError;
        return { success: true };
    } catch (err) {
        console.error("Error completing reminder:", err);
        return {
            success: false,
            error: err instanceof Error ? err.message : "Failed to complete reminder",
        };
    }
}
