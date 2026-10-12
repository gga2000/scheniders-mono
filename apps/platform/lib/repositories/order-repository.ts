import { supabase } from "@/lib/supabase";
import type { Order } from "@/types/order";
import { normalizeOrder } from "@/lib/order-normalize-utils";
import { diag } from "@/lib/diag";
import type { OrderWindow } from "@/lib/order-window";
import { FutureOrderDateError, isFutureCreatedAtViolation } from "@/lib/order-date-guard";

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
  version,
  original_created_at,
  scheduled_date,
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
  last_contacted_at,
  rejection_reason,
  needs_attention,
  attention_reasons,
  last_status_changed_by_name,
  last_status_changed_by_avatar,
  delivered_at,
  completed_at
`.trim();
// attribution / ad_channel are NOT listed: the list reads v_orders_with_risk,
// which does not expose them yet, and requesting a missing column makes
// PostgREST reject the whole query (400) — the orders page went blank. Add them
// back only together with the view change that exposes them.

/**
 * Columns needed to build an export file. The list view deliberately omits some
 * of these to keep the page payload down, but `lib/export-utils.ts` reads them:
 * without `validated_governorate_code` and `is_replacement` they arrive
 * `undefined`, so every export silently fell back to the raw governorate code
 * and marked replacement orders as NOT containing returned goods.
 */
const EXPORT_VIEW_COLUMNS = `
${LIST_VIEW_COLUMNS},
  validated_governorate_code,
  is_replacement,
  delivery_order_id
`.trim();

export const orderRepository = {
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
            .from("v_orders_with_risk")
            .select("id", { count: "exact", head: true })
            .eq("is_archived", false);

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
                .from("v_orders_with_risk")
                .select(LIST_VIEW_COLUMNS)
                .eq("is_archived", false)
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
     * Fetch orders for an export file, straight from the server.
     *
     * Exports must never be limited to whatever the page happens to have
     * loaded: "this month" or "all orders" has to mean what it says, even once
     * the list fetch is windowed. Tenant scoping comes from RLS on
     * `v_orders_with_risk` (security_invoker), same as every other read here.
     */
    async findForExport(opts: { dateFrom?: string; dateTo?: string } = {}): Promise<Order[]> {
        const _t = performance.now();
        const step = 1000;
        const fromTs = opts.dateFrom ? `${opts.dateFrom}T00:00:00.000Z` : null;
        const toTs = opts.dateTo ? `${opts.dateTo}T23:59:59.999Z` : null;

        let countQuery = supabase
            .from("v_orders_with_risk")
            .select("id", { count: "exact", head: true })
            .eq("is_archived", false);
        if (fromTs) countQuery = countQuery.gte("created_at", fromTs);
        if (toTs) countQuery = countQuery.lte("created_at", toTs);

        const { count, error: countErr } = await countQuery;
        if (countErr) throw countErr;

        const totalRows = count ?? 0;
        if (totalRows === 0) return [];

        const pageCount = Math.ceil(totalRows / step);
        const pages = await Promise.all(
            Array.from({ length: pageCount }, (_, i) => {
                let q = supabase
                    .from("v_orders_with_risk")
                    .select(EXPORT_VIEW_COLUMNS)
                    .eq("is_archived", false);
                if (fromTs) q = q.gte("created_at", fromTs);
                if (toTs) q = q.lte("created_at", toTs);
                return q
                    .order("created_at", { ascending: false })
                    .range(i * step, i * step + step - 1);
            }),
        );

        let rows: unknown[] = [];
        for (const { data, error } of pages) {
            if (error) throw error;
            if (data) rows = rows.concat(data);
        }

        diag.log(`[Diag:Repo] findForExport rows=${rows.length} took=${(performance.now() - _t).toFixed(1)}ms`);
        return rows.map(row => normalizeOrder(row as Order));
    },

    /**
     * Fetch only the orders inside the active window.
     *
     * Replaces `findAll()`'s whole-book download for the common case. Takes the
     * same `OrderWindow` the realtime predicate uses (lib/order-window.ts), so
     * the rows fetched and the rows realtime is willing to add can never drift
     * apart. A null window means "no date filter" and falls back to findAll().
     *
     * Rides idx_orders_tenant_active_created — measured 0.388 ms / 47 buffers for
     * 50 rows, against 4,019 kB for the full book.
     */
    async findWindow(window: OrderWindow): Promise<Order[]> {
        if (!window) return this.findAll();

        const _t = performance.now();
        const step = 1000;
        const fromIso = new Date(window.fromInstant).toISOString();
        const toIso = new Date(window.toInstant).toISOString();

        // Count first, then page through ALL of them.
        //
        // Deliberately NOT a bare `.limit(n)`: truncating would leave the list
        // showing 1,000 rows while the server-computed status chips report the
        // real total, i.e. the list silently disagreeing with its own counts.
        // The payload win comes from the window being narrow (the default view
        // is a single day), never from dropping rows the merchant filtered for.
        // An order belongs to the window if it arrived inside it OR was
        // scheduled for a day inside it — the same rule as `belongsInWindow`.
        // Without the second half a postponed order never appears on the day it
        // was postponed to. Values are quoted because ISO timestamps carry the
        // PostgREST-reserved "." and ":". Rides idx_orders_tenant_active_created
        // and idx_orders_scheduled_date (partial, scheduled rows only).
        const inWindow =
            `and(created_at.gte."${fromIso}",created_at.lte."${toIso}"),` +
            `and(scheduled_date.gte.${window.fromDay},scheduled_date.lte.${window.toDay})`;

        const { count, error: countErr } = await supabase
            .from("v_orders_with_risk")
            .select("id", { count: "exact", head: true })
            .eq("is_archived", false)
            .or(inWindow);
        if (countErr) throw countErr;

        const totalRows = count ?? 0;
        if (totalRows === 0) return [];

        const pageCount = Math.ceil(totalRows / step);
        const pages = await Promise.all(
            Array.from({ length: pageCount }, (_, i) =>
                supabase
                    .from("v_orders_with_risk")
                    .select(LIST_VIEW_COLUMNS)
                    .eq("is_archived", false)
                    .or(inWindow)
                    .order("created_at", { ascending: false })
                    // Tie-break on id: paging over a non-unique sort key can
                    // repeat or skip rows at page boundaries.
                    .order("id", { ascending: false })
                    .range(i * step, i * step + step - 1),
            ),
        );

        let rows: unknown[] = [];
        for (const { data, error } of pages) {
            if (error) throw error;
            if (data) rows = rows.concat(data);
        }

        diag.log(`[Diag:Repo] findWindow rows=${rows.length} pages=${pageCount} took=${(performance.now() - _t).toFixed(1)}ms`);
        return rows.map(row => normalizeOrder(row as Order));
    },

    /**
     * Row count for an export scope, without transferring any rows.
     *
     * The export scope picker advertises "this month — N orders" before the
     * merchant commits. Those numbers have to describe the server's data, not
     * the window the page happens to hold, or the picker promises one thing and
     * the file delivers another.
     */
    async countForExport(opts: { dateFrom?: string; dateTo?: string } = {}): Promise<number> {
        let q = supabase
            .from("v_orders_with_risk")
            .select("id", { count: "exact", head: true })
            .eq("is_archived", false);
        if (opts.dateFrom) q = q.gte("created_at", `${opts.dateFrom}T00:00:00.000Z`);
        if (opts.dateTo) q = q.lte("created_at", `${opts.dateTo}T23:59:59.999Z`);
        const { count, error } = await q;
        if (error) throw error;
        return count ?? 0;
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
            .gte("updated_at", sinceTimestamp)
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
                .from("v_orders_with_risk")
                .select(LIST_VIEW_COLUMNS)
                .eq("is_archived", true)
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

    /**
     * Update an order by ID. Verifies the write actually affected a row.
     *
     * Conflict detection uses `version`, not `updated_at`: `version` is
     * incremented server-side by the `increment_orders_version` trigger on every
     * UPDATE, so it always moves. `updated_at` was not maintained on platform
     * writes, which silently disabled this guard entirely (CON-1).
     */
    async update(id: string, updates: Partial<Order>, expectedVersion?: number): Promise<Order> {
        const _t = performance.now();
        diag.log(`[Diag:Repo] update START orderId=${id} fields=${Object.keys(updates).join(',')} expectedVersion=${expectedVersion}`);

        let query = supabase
            .from("orders")
            .update(updates)
            .eq("id", id);

        if (typeof expectedVersion === "number") {
            query = query.eq("version", expectedVersion);
        }

        const { data, error } = await query
            .select()
            .maybeSingle();

        if (error) {
            if (typeof expectedVersion === "number" && error.code === 'PGRST116') {
                diag.log(`[Diag:Repo] update CONFLICT orderId=${id} (PGRST116) took=${(performance.now() - _t).toFixed(1)}ms`);
                throw new Error("CONFLICT_DETECTED");
            }
            diag.log(`[Diag:Repo] update ERR orderId=${id} err=${error.message} took=${(performance.now() - _t).toFixed(1)}ms`);
            // The future-created_at trigger refusing a write is a field error
            // the form can point at, not a generic failure.
            if (isFutureCreatedAtViolation(error)) throw new FutureOrderDateError();
            throw error;
        }
        
        if (!data) {
            if (typeof expectedVersion === "number") {
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
        expectedVersion?: number,
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

        diag.log(`[Diag:Repo] updateStatus START orderId=${id} status=${status} expectedVersion=${expectedVersion}`);
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const t0 = performance.now();
                // Wrap the Supabase call with a timeout to prevent infinite hangs
                const timeoutMs = 30_000;
                let query = supabase
                    .from("orders")
                    .update(updateData)
                    .eq("id", id);
                    
                if (typeof expectedVersion === "number") {
                    query = query.eq("version", expectedVersion);
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
                    if (typeof expectedVersion === "number" && error.code === 'PGRST116') {
                        diag.error(`[updateStatus] attempt ${attempt + 1} CONFLICT for ${id} in ${elapsed}ms (PGRST116)`);
                        throw new Error("CONFLICT_DETECTED");
                    }
                    diag.error(`[updateStatus] attempt ${attempt + 1} FAILED for ${id} in ${elapsed}ms:`, error.message);
                    throw error;
                }
                if (!data) {
                    if (typeof expectedVersion === "number") {
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

                // A CONFLICT after a retry is usually OUR OWN earlier attempt that
                // committed before its response arrived (network timeout). Re-read
                // the row: if it already carries the status we were setting, the
                // write landed and this is a false conflict. Anything else is a
                // genuine concurrent edit and must still surface.
                if (err instanceof Error && err.message === "CONFLICT_DETECTED" && attempt > 0) {
                    const { data: current } = await supabase
                        .from("orders")
                        .select("*")
                        .eq("id", id)
                        .maybeSingle();
                    if (current && current.status === status) {
                        diag.log(`[updateStatus] CONFLICT resolved: our own write had already landed for ${id}`);
                        return normalizeOrder(current);
                    }
                }

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
     * and conflict detection if expectedVersions is provided.
     * Keeps track of successful and failed operations.
     */
    async bulkUpdateStatus(
        orderIds: string[],
        status: Order["status"],
        rejectionReason?: string,
        last_status_changed_by_name?: string,
        last_status_changed_by_avatar?: string,
        expectedVersions?: Record<string, number>
    ): Promise<{
        successfulOperations: { id: string, order: Order }[],
        failedOperations: { id: string, error: unknown }[]
    }> {
        diag.log(`[Diag:Repo] bulkUpdateStatus START count=${orderIds.length} status=${status}`);
        
        const results = await Promise.allSettled(
            orderIds.map(async id => {
                const expectedAt = expectedVersions ? expectedVersions[id] : undefined;
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
