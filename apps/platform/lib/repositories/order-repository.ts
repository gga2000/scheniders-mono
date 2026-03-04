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

// Columns needed for the orders list view and detail modals.
// Avoids `select("*")` which transfers unused columns for 600+ orders.
const ORDER_LIST_COLUMNS = [
    "id",
    "created_at",
    "updated_at",
    "order_id",
    "customer_name",
    "phone",
    "secondary_phone",
    "city",
    "governorate_code",
    "address_details",
    "items",
    "price",
    "status",
    "whatsapp_link",
    "notes",
    "internal_notes",
    "rejection_reason",
    "scheduled_date",
    "priority",
    "payment_status",
    "delivery_fee",
    "discount_amount",
    "is_return",
    "original_order_id",
    "original_created_at",
    "is_archived",
    "is_pinned",
    "delivery_slot",
    "source",
    "sequence_number",
    "delivered_at",
    "cancelled_at",
    "printed_at",
    "print_count",
    "last_batch_id",
    "is_gift",
    "is_shop_order",
    "needs_attention",
    "attention_reasons",
    "delivery_cost",
    "tag_color",
    "delivery_order_id",
    "is_reviewed",
    "is_verified_customer",
    "contact_count",
    "address_status",
    "address_issues",
    "validated_governorate_code",
    "risk_metadata",
].join(",");

export const orderRepository = {
    /** Fetch all active (non-archived) orders, newest first. */
    async findAll(): Promise<Order[]> {
        const { data, error } = await supabase
            .from("orders")
            .select(ORDER_LIST_COLUMNS)
            .eq("is_archived", false)
            .order("created_at", { ascending: false });

        if (error) throw error;
        return ((data || []) as unknown as Order[]).map(normalizeOrder);
    },

    /**
     * Incremental sync: fetch only orders modified after a given timestamp.
     * Returns both active and newly-archived orders so the client can
     * update its cache accordingly.
     */
    async findChangedSince(sinceTimestamp: string): Promise<Order[]> {
        const { data, error } = await supabase
            .from("orders")
            .select(ORDER_LIST_COLUMNS)
            .gt("updated_at", sinceTimestamp)
            .order("updated_at", { ascending: false });

        if (error) throw error;
        return ((data || []) as unknown as Order[]).map(normalizeOrder);
    },

    /** Fetch all archived orders, newest first. */
    async findArchived(): Promise<Order[]> {
        const { data, error } = await supabase
            .from("orders")
            .select(ORDER_LIST_COLUMNS)
            .eq("is_archived", true)
            .order("created_at", { ascending: false });

        if (error) throw error;
        return ((data || []) as unknown as Order[]).map(normalizeOrder);
    },

    /** Fetch a single order by ID (all columns for detail view). */
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

    /** Update an order by ID. Verifies the write actually affected a row. */
    async update(id: string, updates: Partial<Order>): Promise<Order> {
        const { data, error } = await supabase
            .from("orders")
            .update(updates)
            .eq("id", id)
            .select()
            .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error("Update failed: row not found or write was rejected. Try refreshing.");
        return normalizeOrder(data);
    },

    /**
     * Update order status with automatic timestamp fields. Verifies write.
     * Includes retry (2 attempts) and a 10s timeout per attempt.
     */
    async updateStatus(
        id: string,
        status: Order["status"],
        rejectionReason?: string
    ): Promise<Order> {
        const updateData: Partial<Order> = { status };
        if (rejectionReason) {
            updateData.rejection_reason = rejectionReason;
        } else if (status !== "cancelled" && status !== "rejected") {
            (updateData as Record<string, unknown>).rejection_reason = null;
        }
        if (status === "delivered") updateData.delivered_at = new Date().toISOString();
        if (status === "cancelled") updateData.cancelled_at = new Date().toISOString();

        // Retry with backoff: 2 attempts, 1s delay between
        const MAX_RETRIES = 2;
        let lastError: unknown;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                // Wrap the Supabase call with a timeout to prevent infinite hangs
                const timeoutMs = 10_000;
                const supabasePromise = supabase
                    .from("orders")
                    .update(updateData)
                    .eq("id", id)
                    .select()
                    .maybeSingle();

                const timeoutPromise = new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error(`updateStatus timed out after ${timeoutMs}ms for order ${id}`)), timeoutMs)
                );

                const { data, error } = await Promise.race([supabasePromise, timeoutPromise]);

                if (error) throw error;
                if (!data) throw new Error("Status update failed: row not found or write was rejected. Try refreshing.");
                return normalizeOrder(data);
            } catch (err) {
                lastError = err;
                // Don't retry on the last attempt
                if (attempt < MAX_RETRIES - 1) {
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
        }

        throw lastError;
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
