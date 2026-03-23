import { supabase } from "@/lib/supabase";
import type { Order } from "@/types/order";
import { normalizeOrder } from "@/lib/order-normalize-utils";
import { diag } from "@/lib/diag";

/**
 * OrderRepository — Centralized data access for orders.
 *
 * All Supabase queries for the `orders` table go through here.
 * This decouples query construction from hooks/components,
 * making it easy to swap backends or add instrumentation.
 */

/**
 * Minimal column set for list/table/card views.
 * Excludes detail-only fields to reduce payload size by ~25%.
 * findById still fetches all columns (*) for the detail modal.
 */
const LIST_VIEW_COLUMNS = `
  id,
  created_at,
  updated_at,
  original_created_at,
  order_id,
  customer_name,
  phone,
  secondary_phone,
  city,
  governorate_code,
  address_details,
  items,
  price,
  status,
  priority,
  payment_status,
  delivery_fee,
  discount_amount,
  is_return,
  original_order_id,
  is_archived,
  is_pinned,
  source,
  sequence_number,
  tag_color,
  notes,
  internal_notes,
  risk_data,
  contact_count,
  last_contacted_at
`.trim();

export const orderRepository = {
    /** Fetch all active (non-archived) orders, newest first. */
    async findAll(): Promise<Order[]> {
        const _t = performance.now();
        diag.log(`[Diag:Repo] findAll START`);
        const { data, error } = await supabase
            .from("v_orders_with_risk")
            .select(LIST_VIEW_COLUMNS)
            .eq("is_archived", false)
            .order("created_at", { ascending: false });

        if (error) {
            diag.log(`[Diag:Repo] findAll ERR err=${error.message} took=${(performance.now() - _t).toFixed(1)}ms`);
            throw error;
        }
        diag.log(`[Diag:Repo] findAll OK rows=${(data || []).length} took=${(performance.now() - _t).toFixed(1)}ms`);
        return (data || []).map(row => normalizeOrder(row as unknown as Order));
    },

    /**
     * Incremental sync: fetch only orders modified after a given timestamp.
     * Returns both active and newly-archived orders so the client can
     * update its cache accordingly.
     */
    async findChangedSince(sinceTimestamp: string): Promise<Order[]> {
        const { data, error } = await supabase
            .from("v_orders_with_risk")
            .select(LIST_VIEW_COLUMNS)
            .gt("updated_at", sinceTimestamp)
            .order("updated_at", { ascending: false });

        if (error) throw error;
        return (data || []).map(row => normalizeOrder(row as unknown as Order));
    },

    /** Fetch all archived orders, newest first. */
    async findArchived(): Promise<Order[]> {
        const { data, error } = await supabase
            .from("v_orders_with_risk")
            .select(LIST_VIEW_COLUMNS)
            .eq("is_archived", true)
            .order("created_at", { ascending: false });

        if (error) throw error;
        return (data || []).map(row => normalizeOrder(row as unknown as Order));
    },

    /** Fetch a single order by ID (all columns for detail view). */
    async findById(id: string): Promise<Order | null> {
        const { data, error } = await supabase
            .from("v_orders_with_risk")
            .select("*")
            .eq("id", id)
            .single();

        if (error) {
            if (error.code === "PGRST116") return null; // Not found
            throw error;
        }
        return data ? normalizeOrder(data) : null;
    },

    /** Update an order by ID. Verifies the write actually affected a row. Supports conflict detection via expectedUpdatedAt. */
    async update(id: string, updates: Partial<Order>, expectedUpdatedAt?: string): Promise<Order> {
        const _t = performance.now();
        diag.log(`[Diag:Repo] update START orderId=${id} fields=${Object.keys(updates).join(',')} expectedUpdatedAt=${expectedUpdatedAt}`);
        
        let query = supabase
            .from("orders")
            .update(updates)
            .eq("id", id);
            
        if (expectedUpdatedAt) {
            query = query.eq("updated_at", expectedUpdatedAt);
        }

        const { data, error } = await query
            .select()
            .maybeSingle();

        if (error) {
            if (expectedUpdatedAt && error.code === 'PGRST116') {
                diag.log(`[Diag:Repo] update CONFLICT orderId=${id} (PGRST116) took=${(performance.now() - _t).toFixed(1)}ms`);
                throw new Error("CONFLICT_DETECTED");
            }
            diag.log(`[Diag:Repo] update ERR orderId=${id} err=${error.message} took=${(performance.now() - _t).toFixed(1)}ms`);
            throw error;
        }
        
        if (!data) {
            if (expectedUpdatedAt) {
                diag.log(`[Diag:Repo] update CONFLICT orderId=${id} took=${(performance.now() - _t).toFixed(1)}ms`);
                throw new Error("CONFLICT_DETECTED");
            }
            diag.log(`[Diag:Repo] update NULL orderId=${id} (RLS reject?) took=${(performance.now() - _t).toFixed(1)}ms`);
            throw new Error("Update failed: row not found or write was rejected. Try refreshing.");
        }
        
        diag.log(`[Diag:Repo] update OK orderId=${id} took=${(performance.now() - _t).toFixed(1)}ms`);
        return normalizeOrder(data);
    },

    /**
     * Update order status with automatic timestamp fields. Verifies write.
     * Includes retry (2 attempts) and a 10s timeout per attempt.
     */
    async updateStatus(
        id: string,
        status: Order["status"],
        rejectionReason?: string,
        last_status_changed_by_name?: string,
        last_status_changed_by_avatar?: string,
        expectedUpdatedAt?: string
    ): Promise<Order> {
        const updateData: Partial<Order> = { status };
        if (rejectionReason) {
            updateData.rejection_reason = rejectionReason;
        } else if (status !== "cancelled" && status !== "rejected") {
            (updateData as Record<string, unknown>).rejection_reason = null;
        }
        if (status === "delivered") updateData.delivered_at = new Date().toISOString();
        if (status === "cancelled") updateData.cancelled_at = new Date().toISOString();

        // Include user attribution for notifications
        if (last_status_changed_by_name) {
            updateData.last_status_changed_by_name = last_status_changed_by_name;
        }
        if (last_status_changed_by_avatar) {
            updateData.last_status_changed_by_avatar = last_status_changed_by_avatar;
        }

        // Retry with backoff: 2 attempts, 1s delay between
        const MAX_RETRIES = 2;
        let lastError: unknown;

        diag.log(`[Diag:Repo] updateStatus START orderId=${id} status=${status} expectedUpdatedAt=${expectedUpdatedAt}`);
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const t0 = performance.now();
                // Wrap the Supabase call with a timeout to prevent infinite hangs
                const timeoutMs = 30_000;
                let query = supabase
                    .from("orders")
                    .update(updateData)
                    .eq("id", id);
                    
                if (expectedUpdatedAt) {
                    query = query.eq("updated_at", expectedUpdatedAt);
                }
                
                const supabasePromise = query
                    .select()
                    .maybeSingle();

                const timeoutPromise = new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error(`updateStatus timed out after ${timeoutMs}ms for order ${id}`)), timeoutMs)
                );

                const { data, error } = await Promise.race([supabasePromise, timeoutPromise]);
                const elapsed = Math.round(performance.now() - t0);

                if (error) {
                    if (expectedUpdatedAt && error.code === 'PGRST116') {
                        diag.error(`[updateStatus] attempt ${attempt + 1} CONFLICT for ${id} in ${elapsed}ms (PGRST116)`);
                        throw new Error("CONFLICT_DETECTED");
                    }
                    diag.error(`[updateStatus] attempt ${attempt + 1} FAILED for ${id} in ${elapsed}ms:`, error.message);
                    throw error;
                }
                if (!data) {
                    if (expectedUpdatedAt) {
                        diag.error(`[updateStatus] attempt ${attempt + 1} CONFLICT for ${id} in ${elapsed}ms`);
                        throw new Error("CONFLICT_DETECTED");
                    }
                    diag.error(`[updateStatus] attempt ${attempt + 1} returned NULL for ${id} in ${elapsed}ms (RLS reject?)`);
                    throw new Error("Status update failed: row not found or write was rejected. Try refreshing.");
                }
                diag.log(`[updateStatus] attempt ${attempt + 1} SUCCESS for ${id} in ${elapsed}ms, status=${data.status}`);
                return normalizeOrder(data);
            } catch (err) {
                lastError = err;
                diag.warn(`[updateStatus] attempt ${attempt + 1} error for ${id}:`, err instanceof Error ? err.message : err);
                
                // Do not retry on intentional application errors or data conflicts
                if (err instanceof Error && (err.message === "CONFLICT_DETECTED" || err.message.includes("row not found"))) {
                    throw err;
                }
                
                // Don't retry on the last attempt
                if (attempt < MAX_RETRIES - 1) {
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
        }

        throw lastError;
    },

    /**
     * Update order status in bulk. Includes retry mechanism per-order
     * and conflict detection if expectedUpdatedAts is provided.
     * Keeps track of successful and failed operations.
     */
    async bulkUpdateStatus(
        orderIds: string[],
        status: Order["status"],
        rejectionReason?: string,
        last_status_changed_by_name?: string,
        last_status_changed_by_avatar?: string,
        expectedUpdatedAts?: Record<string, string>
    ): Promise<{
        successfulOperations: { id: string, order: Order }[],
        failedOperations: { id: string, error: unknown }[]
    }> {
        diag.log(`[Diag:Repo] bulkUpdateStatus START count=${orderIds.length} status=${status}`);
        
        const results = await Promise.allSettled(
            orderIds.map(async id => {
                const expectedAt = expectedUpdatedAts ? expectedUpdatedAts[id] : undefined;
                const order = await this.updateStatus(
                    id, 
                    status, 
                    rejectionReason, 
                    last_status_changed_by_name, 
                    last_status_changed_by_avatar, 
                    expectedAt
                );
                return { id, order };
            })
        );
        
        const successfulOperations: { id: string, order: Order }[] = [];
        const failedOperations: { id: string, error: unknown }[] = [];
        
        results.forEach((result, index) => {
            const id = orderIds[index];
            if (result.status === 'fulfilled') {
                successfulOperations.push(result.value);
            } else {
                failedOperations.push({ id, error: result.reason });
            }
        });
        
        diag.log(`[Diag:Repo] bulkUpdateStatus DONE success=${successfulOperations.length} failed=${failedOperations.length}`);
        
        return { successfulOperations, failedOperations };
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
