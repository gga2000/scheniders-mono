import { supabase } from "@/lib/supabase";
import type { Order } from "@/types/order";
import { normalizeOrder } from "@/lib/order-normalize-utils";
import { getSupabaseCircuitBreaker } from "@/lib/circuit-breaker";

/**
 * OrderRepository — Centralized data access for orders.
 *
 * All Supabase queries for the `orders` table go through here.
 * This decouples query construction from hooks/components,
 * making it easy to swap backends or add instrumentation.
 *
 * All queries are wrapped with a circuit breaker to prevent
 * hammering a down Supabase instance.
 */
export const orderRepository = {
    /** Fetch all active (non-archived) orders, newest first. */
    async findAll(): Promise<Order[]> {
        const breaker = getSupabaseCircuitBreaker();
        return breaker.execute(async () => {
            const { data, error } = await supabase
                .from("orders")
                .select("*")
                .eq("is_archived", false)
                .order("created_at", { ascending: false });

            if (error) throw error;
            return (data || []).map(normalizeOrder);
        });
    },

    /**
     * Incremental sync: fetch only orders modified after a given timestamp.
     * Returns both active and newly-archived orders so the client can
     * update its cache accordingly.
     *
     * This is orders of magnitude faster than findAll() for large datasets.
     */
    async findChangedSince(sinceTimestamp: string): Promise<Order[]> {
        const breaker = getSupabaseCircuitBreaker();
        return breaker.execute(async () => {
            const { data, error } = await supabase
                .from("orders")
                .select("*")
                .gt("updated_at", sinceTimestamp)
                .order("updated_at", { ascending: false });

            if (error) throw error;
            return (data || []).map(normalizeOrder);
        });
    },

    /** Fetch all archived orders, newest first. */
    async findArchived(): Promise<Order[]> {
        const breaker = getSupabaseCircuitBreaker();
        return breaker.execute(async () => {
            const { data, error } = await supabase
                .from("orders")
                .select("*")
                .eq("is_archived", true)
                .order("created_at", { ascending: false });

            if (error) throw error;
            return (data || []).map(normalizeOrder);
        });
    },

    /** Fetch a single order by ID. */
    async findById(id: string): Promise<Order | null> {
        const breaker = getSupabaseCircuitBreaker();
        return breaker.execute(async () => {
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
        });
    },

    /** Update an order by ID. Verifies the write actually affected a row. */
    async update(id: string, updates: Partial<Order>): Promise<Order> {
        const breaker = getSupabaseCircuitBreaker();
        return breaker.execute(async () => {
            const { data, error } = await supabase
                .from("orders")
                .update(updates)
                .eq("id", id)
                .select()
                .maybeSingle();

            if (error) throw error;
            if (!data) throw new Error("Update failed: row not found or write was rejected. Try refreshing.");
            return normalizeOrder(data);
        });
    },

    /** Update order status with automatic timestamp fields. Verifies write. */
    async updateStatus(
        id: string,
        status: Order["status"],
        rejectionReason?: string
    ): Promise<Order> {
        const breaker = getSupabaseCircuitBreaker();
        return breaker.execute(async () => {
            const updateData: Partial<Order> = { status };
            if (rejectionReason) {
                updateData.rejection_reason = rejectionReason;
            } else if (status !== "cancelled" && status !== "rejected") {
                // Clear stale rejection/cancellation reason when reverting to any other status
                (updateData as Record<string, unknown>).rejection_reason = null;
            }
            if (status === "delivered") updateData.delivered_at = new Date().toISOString();
            if (status === "cancelled") updateData.cancelled_at = new Date().toISOString();

            const { data, error } = await supabase
                .from("orders")
                .update(updateData)
                .eq("id", id)
                .select()
                .maybeSingle();

            if (error) throw error;
            if (!data) throw new Error("Status update failed: row not found or write was rejected. Try refreshing.");
            return normalizeOrder(data);
        });
    },

    /** Hard-delete an order by ID. */
    async delete(id: string): Promise<void> {
        const breaker = getSupabaseCircuitBreaker();
        return breaker.execute(async () => {
            const { error } = await supabase
                .from("orders")
                .delete()
                .eq("id", id);

            if (error) throw error;
        });
    },
};
