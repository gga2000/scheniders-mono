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
// `delivered_at` / `completed_at` are here because realized revenue and cycle time
// are dated by when an order was DELIVERED, not created (COR-D1). Without them the
// client engine reads null for every order and reports zero revenue. The Orders
// audit hit the same gap from the other side: its COR-4 could not bucket by
// delivered_at precisely because this list never selected it.
// NOTE: this string is sent verbatim as a PostgREST `select=` — no SQL comments.
export const LIST_VIEW_COLUMNS = `
  id,
  created_at,
  updated_at,
  original_created_at,
  scheduled_date,
  order_id,
  customer_name,
  phone,
  secondary_phone,
  whatsapp_contact_slot,
  city,
  governorate_code,
  address_details,
  items,
  price,
  status,
  delivered_at,
  completed_at,
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
  contact_count,
  last_contacted_at,
  rejection_reason,
  needs_attention,
  attention_reasons,
  last_status_changed_by_name,
  last_status_changed_by_avatar,
  last_followup_by_name,
  last_followup_by_avatar,
  last_followup_at,
  last_followup_type,
  attribution,
  ad_channel
`.trim();

export interface OrderSearchRow {
    id: string;
    order_id: string;
    customer_name: string | null;
    phone: string | null;
    city: string | null;
    status: string;
    price: number | null;
    governorate_code: string | null;
    created_at: string;
}

export interface CustomerSearchRow {
    customer_phone: string;
    latest_name: string | null;
    total_orders: number;
}

export interface ProductSearchRow {
    id: string;
    name: string;
    price: number | null;
}

/**
 * ORD-A3. The LIST queries read `public.orders` directly; only the two risk
 * lookups below read `v_orders_with_risk`.
 *
 * The view joins `customer_trust` on `normalize_phone(...)` to build one column,
 * `risk_data`. Postgres cannot prune a join the way it prunes an unused column,
 * so every read paid for it even after `risk_data` was removed from
 * LIST_VIEW_COLUMNS. Measured on one 1,000-row page as a real tenant member:
 * 413.0 ms via the view (seq scan + external merge sort spilling 2.2 MB to disk
 * + a 345 ms merge join) against 53.6 ms straight from `orders`
 * (`idx_orders_created_at` index scan) — and `findAll` issues five such pages in
 * parallel.
 *
 * The view also filters `deleted_at IS NULL`, which the table does not, so every
 * repointed query carries an explicit `.is("deleted_at", null)`. Verified column
 * delta before switching: the view adds only `risk_data` and omits
 * `idempotency_key` and `waseet_submit_started_at`, none of which these queries
 * select.
 *
 * Single-row lookups (`findById`, `findByOrderId`, `findByScanRef`) deliberately
 * stay on the view: they `select("*")`, so consumers may read `risk_data` from
 * them, and joining for one row is cheap.
 */

/** The risk assessment `v_orders_with_risk` builds from `customer_trust`. */
export type OrderRisk = NonNullable<Order["risk_data"]>;

export const orderRepository = {
    /**
     * Risk assessments keyed by order id.
     *
     * PERF-D1: this was a column on the shared list fetch, where it cost 28.2%
     * of the payload (2,803,916 of 9,951,233 bytes on the largest tenant) on
     * every route in the app — while only the orders route and the returns
     * panel ever read it. It now loads on its own, for the routes that render it.
     */
    async findRiskData(): Promise<Map<string, OrderRisk>> {
        const _t = performance.now();
        const { data, error } = await supabase
            .from("v_orders_with_risk")
            .select("id, risk_data")
            .eq("is_archived", false);
        if (error) {
            diag.log(`[Diag:Repo] findRiskData ERR err=${error.message}`);
            throw error;
        }
        const map = new Map<string, OrderRisk>();
        for (const row of (data ?? []) as { id: string; risk_data: OrderRisk | null }[]) {
            if (row.risk_data) map.set(row.id, row.risk_data);
        }
        diag.log(`[Diag:Repo] findRiskData OK rows=${map.size} took=${(performance.now() - _t).toFixed(1)}ms`);
        return map;
    },

    /**
     * Server-side order search. Returns matches, not the book.
     *
     * PERF-D1: global-search and chat's #ref search each filtered all ~4,700
     * orders in the browser, which is why the whole book had to be resident on
     * every route. See migration 20260909130000 — the 2-character floor and the
     * 50-row clamp are enforced in SQL, not here.
     */
    async searchOrders(term: string, limit = 20): Promise<OrderSearchRow[]> {
        const { data, error } = await supabase.rpc("search_orders", { p_term: term, p_limit: limit });
        if (error) throw error;
        return (data ?? []) as OrderSearchRow[];
    },

    /**
     * Customer search, from the tenant-scoped aggregates view.
     *
     * This also FIXES a defect: the old client-side version counted a customer's
     * orders from whatever happened to be loaded, so "N orders" was the number of
     * matches, not the number of orders. `total_orders` is the real count.
     */
    async searchCustomers(term: string, limit = 20): Promise<CustomerSearchRow[]> {
        const t = term.trim();
        if (t.length < 2) return [];
        const { data, error } = await supabase
            .from("customer_aggregates")
            .select("customer_phone, latest_name, total_orders")
            .or(`latest_name.ilike.%${t}%,customer_phone.ilike.%${t}%`)
            .limit(limit);
        if (error) throw error;
        return (data ?? []) as CustomerSearchRow[];
    },

    /**
     * Product search, from `products`.
     *
     * The old version scanned every order's `items` array to discover product
     * names — it could only find a product that had already been ordered, and it
     * priced it from the line rather than the catalogue.
     */
    async searchProducts(term: string, limit = 20): Promise<ProductSearchRow[]> {
        const t = term.trim();
        if (t.length < 2) return [];
        const { data, error } = await supabase
            .from("products")
            .select("id, name, price")
            .eq("is_archived", false)
            .ilike("name", `%${t}%`)
            .limit(limit);
        if (error) throw error;
        return (data ?? []) as ProductSearchRow[];
    },

    /** One order's risk assessment — for detail panels, which need exactly one. */
    async findRiskFor(orderId: string): Promise<OrderRisk | null> {
        const { data, error } = await supabase
            .from("v_orders_with_risk")
            .select("risk_data")
            .eq("id", orderId)
            .maybeSingle();
        if (error) throw error;
        return ((data as { risk_data: OrderRisk | null } | null)?.risk_data) ?? null;
    },

    /** Fetch all active (non-archived) orders, newest first.
     *  Uses a count query + parallel page fetches to cut latency in half. */
    async findAll(): Promise<Order[]> {
        const _t = performance.now();
        diag.log(`[Diag:Repo] findAll START`);

        const step = 1000;

        // 1. Get exact count so we know how many pages to fetch in parallel.
        //    The count query uses the same view/filter but returns only the count header,
        //    not actual rows — it's very fast (~50-100ms).
        const { count, error: countErr } = await supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("is_archived", false)
            .is("deleted_at", null);

        if (countErr) {
            diag.log(`[Diag:Repo] findAll COUNT ERR err=${countErr.message} took=${(performance.now() - _t).toFixed(1)}ms`);
            throw countErr;
        }

        const totalRows = count ?? 0;
        if (totalRows === 0) {
            diag.log(`[Diag:Repo] findAll OK rows=0 took=${(performance.now() - _t).toFixed(1)}ms`);
            return [];
        }

        // 2. Build page ranges and fetch all pages in parallel.
        const pageCount = Math.ceil(totalRows / step);
        const pagePromises = Array.from({ length: pageCount }, (_, i) => {
            const from = i * step;
            return supabase
                .from("orders")
                .select(LIST_VIEW_COLUMNS)
                .eq("is_archived", false)
                .is("deleted_at", null)
                .order("created_at", { ascending: false })
                .range(from, from + step - 1);
        });

        const pages = await Promise.all(pagePromises);

        // 3. Merge results, preserving page order for correct sort.
        let allData: any[] = [];
        for (let i = 0; i < pages.length; i++) {
            const { data, error } = pages[i];
            if (error) {
                diag.log(`[Diag:Repo] findAll page=${i} ERR err=${error.message} took=${(performance.now() - _t).toFixed(1)}ms`);
                throw error;
            }
            if (data && data.length > 0) {
                allData = [...allData, ...data];
            }
        }

        const result = allData.map(row => normalizeOrder(row as unknown as Order));
        diag.log(`[Diag:Repo] findAll OK rows=${allData.length} pages=${pageCount} took=${(performance.now() - _t).toFixed(1)}ms`);
        return result;
    },

    /**
     * Incremental sync: fetch only orders modified after a given timestamp.
     * Returns both active and newly-archived orders so the client can
     * update its cache accordingly.
     */
    async findChangedSince(sinceTimestamp: string): Promise<Order[]> {
        const { data, error } = await supabase
            .from("orders")
            .select(LIST_VIEW_COLUMNS)
            .is("deleted_at", null)
            .gt("updated_at", sinceTimestamp)
            .order("updated_at", { ascending: false });

        if (error) throw error;
        return (data || []).map(row => normalizeOrder(row as unknown as Order));
    },

    /** Fetch all archived orders, newest first. */
    async findArchived(): Promise<Order[]> {
        let allData: any[] = [];
        let from = 0;
        const step = 1000;

        while (true) {
            const { data, error } = await supabase
                .from("orders")
                .select(LIST_VIEW_COLUMNS)
                .eq("is_archived", true)
                .is("deleted_at", null)
                .order("created_at", { ascending: false })
                .range(from, from + step - 1);

            if (error) throw error;

            if (data && data.length > 0) {
                allData = [...allData, ...data];
                from += step;
            }

            if (!data || data.length < step) break;
        }

        return allData.map(row => normalizeOrder(row as unknown as Order));
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

    /** Fetch a single order by its display order_id (not the uuid). Returns null if none. Tenant-scoped via RLS. */
    async findByOrderId(orderId: string): Promise<Order | null> {
        const { data, error } = await supabase
            .from("v_orders_with_risk")
            .select("*")
            .eq("order_id", orderId)
            .limit(1)
            .maybeSingle();
        if (error) throw error;
        return data ? normalizeOrder(data as unknown as Order) : null;
    },

    /**
     * Resolve an order from a scanned or typed reference, for the returns flow.
     *
     * Printed labels and staff use several identifiers interchangeably, so a
     * single `order_id` lookup misses common cases (notably refund/returned
     * orders, which staff type by their short UI number). Tries, in priority:
     *   1. the canonical `order_id` (shipping-label barcode / QR),
     *   2. the short per-tenant `sequence_number` — the number shown in the UI
     *      and on invoices, so the one people type when a label won't scan,
     *   3. the delivery company's `waseet_qr_id` printed on its own label.
     * First exact match wins (deterministic; order_id takes precedence over a
     * colliding sequence_number). All lookups are tenant-scoped via RLS on
     * v_orders_with_risk. Returns null only when nothing matches.
     */
    async findByScanRef(ref: string): Promise<Order | null> {
        const value = (ref ?? "").trim();
        if (!value) return null;

        // 1. Canonical order_id (exact). Most labels carry this.
        const byOrderId = await this.findByOrderId(value);
        if (byOrderId) return byOrderId;

        // 2. Short per-tenant sequence_number — only attempt for a pure integer.
        if (/^\d+$/.test(value)) {
            const seq = Number(value);
            if (Number.isSafeInteger(seq)) {
                const { data, error } = await supabase
                    .from("v_orders_with_risk")
                    .select("*")
                    .eq("sequence_number", seq)
                    .limit(1)
                    .maybeSingle();
                if (error) throw error;
                if (data) return normalizeOrder(data as unknown as Order);
            }
        }

        // 3. Delivery-company QR id printed on the carrier's own label.
        const { data, error } = await supabase
            .from("v_orders_with_risk")
            .select("*")
            .eq("waseet_qr_id", value)
            .limit(1)
            .maybeSingle();
        if (error) throw error;
        return data ? normalizeOrder(data as unknown as Order) : null;
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
        expectedUpdatedAt?: string,
        rejectionReasonId?: string
    ): Promise<Order> {
        const updateData: Partial<Order> = { status };
        if (rejectionReason) {
            updateData.rejection_reason = rejectionReason;
        } else if (status !== "cancelled" && status !== "rejected") {
            (updateData as Record<string, unknown>).rejection_reason = null;
        }
        if (rejectionReasonId !== undefined) {
            (updateData as Record<string, unknown>).reason_id = rejectionReasonId || null;
        } else if (status !== "cancelled" && status !== "rejected") {
            (updateData as Record<string, unknown>).reason_id = null;
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
