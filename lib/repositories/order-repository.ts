import { supabase } from "@/lib/supabase";
import type { Order } from "@/types/order";
import { normalizeOrder } from "@/lib/order-normalize-utils";

/**
 * OrderRepository — Centralized data access for orders.
 *
 * All Supabase queries for the `orders` table go through here.
 * This decouples query construction from hooks/components,
 * making it easy to swap backends or add instrumentation.
 */
export const orderRepository = {
    /** Fetch all active (non-archived) orders, newest first. */
    async findAll(): Promise<Order[]> {
        const { data, error } = await supabase
            .from("orders")
            .select("*")
            .eq("is_archived", false)
            .order("created_at", { ascending: false });

        if (error) throw error;
        return (data || []).map(normalizeOrder);
    },

    /** Fetch all archived orders, newest first. */
    async findArchived(): Promise<Order[]> {
        const { data, error } = await supabase
            .from("orders")
            .select("*")
            .eq("is_archived", true)
            .order("created_at", { ascending: false });

        if (error) throw error;
        return (data || []).map(normalizeOrder);
    },

    /** Fetch a single order by ID. */
    async findById(id: string): Promise<Order | null> {
        const { data, error } = await supabase
            .from("orders")
            .select("*")
            .eq("id", id)
            .single();

        if (error) {
            if (error.code === "PGRST116") return null; // Not found
            throw error;
        }
        return data ? normalizeOrder(data) : null;
    },

    /** Update an order by ID. Returns nothing — caller handles cache. */
    async update(id: string, updates: Partial<Order>): Promise<void> {
        const { error } = await supabase
            .from("orders")
            .update(updates)
            .eq("id", id);

        if (error) throw error;
    },

    /** Update order status with automatic timestamp fields. */
    async updateStatus(
        id: string,
        status: Order["status"],
        rejectionReason?: string
    ): Promise<Partial<Order>> {
        const updateData: Partial<Order> = { status };
        if (rejectionReason) {
            updateData.rejection_reason = rejectionReason;
        } else if (status !== "cancelled" && status !== "rejected") {
            // Clear stale rejection/cancellation reason when reverting to any other status
            (updateData as any).rejection_reason = null;
        }
        if (status === "delivered") updateData.delivered_at = new Date().toISOString();
        if (status === "cancelled") updateData.cancelled_at = new Date().toISOString();

        const { error } = await supabase
            .from("orders")
            .update(updateData)
            .eq("id", id);

        if (error) throw error;
        return updateData;
    },

    /** Hard-delete an order by ID. */
    async delete(id: string): Promise<void> {
        const { error } = await supabase
            .from("orders")
            .delete()
            .eq("id", id);

        if (error) throw error;
    },
};
