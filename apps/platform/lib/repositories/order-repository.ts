import { supabase } from "@/lib/supabase";
import type { Order } from "@/types/order";
import { normalizeOrder } from "@/lib/order-normalize-utils";
import { diag } from "@/lib/diag";
import type { OrderWindow } from "@/lib/order-window";
import {
    PREVIEW_HEAD_ROWS,
    PREVIEW_PINNED_MAX,
    mergePreviewHead,
    windowWantsPreview,
    type OrderListPreview,
} from "@/lib/orders/list-preview";
import { FutureOrderDateError, isFutureCreatedAtViolation } from "@/lib/order-date-guard";
import { EXPORT_COLUMNS, LIST_COLUMNS, ORDER_READ_COLUMNS } from "@/lib/repositories/order-columns";
import { runInSequentialBatches, type BatchOutcome, type BulkProgress } from "@/lib/order-bulk-batches";
import {
    MAX_SEARCH_RESULTS,
    buildDirectSearchFilters,
    parseOrderSearchTerm,
    rankSearchResults,
} from "@/lib/order-server-search";
import {
    TRUST_RISK_COLUMNS,
    buildRiskData,
    normalizePhoneLikeDb,
    trustKey,
    type TrustRow,
} from "@/lib/customer-trust-risk";

/** Attribution and reason fields that ride along with a status change. */
type StatusUpdateContext = {
    rejectionReason?: string;
    rejectionReasonId?: string;
    changedByName?: string;
    changedByAvatar?: string;
};

/**
 * The column set a status change writes: the status, its timestamps, the
 * rejection reason (cleared when moving to a non-rejecting status) and the
 * actor. Shared by the single-order and batched paths so they cannot drift.
 */
function buildStatusUpdate(status: Order["status"], ctx: StatusUpdateContext): Partial<Order> {
    const updateData: Partial<Order> = { status };
    const loose = updateData as Record<string, unknown>;
    if (ctx.rejectionReason) {
        updateData.rejection_reason = ctx.rejectionReason;
    } else if (status !== "cancelled" && status !== "rejected") {
        loose.rejection_reason = null;
    }
    if (ctx.rejectionReasonId !== undefined) {
        loose.reason_id = ctx.rejectionReasonId || null;
    } else if (status !== "cancelled" && status !== "rejected") {
        loose.reason_id = null;
    }
    if (status === "delivered") updateData.delivered_at = new Date().toISOString();
    if (status === "cancelled") updateData.cancelled_at = new Date().toISOString();
    if (ctx.changedByName) updateData.last_status_changed_by_name = ctx.changedByName;
    if (ctx.changedByAvatar) updateData.last_status_changed_by_avatar = ctx.changedByAvatar;
    return updateData;
}

/** A batch status write gives up after this long; the batch then falls back to per-order writes. */
const STATUS_BATCH_TIMEOUT_MS = 30_000;

/**
 * PostgREST `or` filter that matches each id, pinned to its expected version
 * when one is known — the batched form of the optimistic-concurrency guard.
 */
export function buildVersionedIdFilter(ids: readonly string[], expectedVersions?: Record<string, number>): string {
    return ids
        .map((id) => {
            const version = expectedVersions?.[id];
            return typeof version === "number" ? `and(id.eq.${id},version.eq.${version})` : `id.eq.${id}`;
        })
        .join(",");
}

/**
 * OrderRepository — Centralized data access for orders.
 *
 * All Supabase queries for the `orders` table go through here.
 * This decouples query construction from hooks/components,
 * making it easy to swap backends or add instrumentation.
 *
 * Every read that is not keyed by the globally unique row `id` takes the
 * active `tenantId` (the caller's `user_profiles.current_tenant_id`, from
 * `useAuth`) and filters on it. RLS remains the enforcement — it limits rows to
 * the tenants the user belongs to — but RLS alone returns the UNION of those
 * tenants, so a user in two tenants would see both books mixed into one list
 * and a per-tenant number (sequence_number) could resolve to the wrong
 * tenant's order. The filter also lets the planner use the tenant-leading
 * indexes.
 */

/**
 * Unique phones above which `withRiskData` reads the caller's whole
 * `customer_trust` book (paged, PK order) instead of `phone=in.(...)` chunks:
 * a full-book list touches most customers anyway, and a few 1,000-row pages
 * beat dozens of chunked requests. Measured: 4.6 ms per 1,000-row trust page.
 */
const TRUST_LOOKUP_MAX_PHONES = 200;
/** Phones per `in.(...)` request — keeps the URL well under proxy limits. */
const TRUST_IN_CHUNK = 100;
/** Order uuids per `in.(...)` request — 100 uuids is ~3.7 KB of URL. */
const ID_IN_CHUNK = 100;
const PAGE = 1000;

/** Search rows carry `deleted_at` so a trashed match can be labelled. */
const SEARCH_COLUMNS = `${LIST_COLUMNS}, deleted_at, delivery_order_id, waseet_qr_id`;
/** Delta rows carry `deleted_at` so a soft delete realtime missed still removes the row. */
const DELTA_COLUMNS = `${LIST_COLUMNS}, deleted_at`;
/** PostgREST: "Could not find the function … in the schema cache". */
const RPC_NOT_FOUND = "PGRST202";
/**
 * Set once `search_orders_v2` is known to be missing, so every later keystroke
 * goes straight to the direct path instead of paying for a 404 first. Per page
 * load: applying the migration takes effect on the next reload.
 */
let searchRpcMissing = false;

async function fetchTrustRows(tenantId: string, phones: string[]): Promise<TrustRow[]> {
    if (phones.length === 0) return [];

    if (phones.length <= TRUST_LOOKUP_MAX_PHONES) {
        const chunks: string[][] = [];
        for (let i = 0; i < phones.length; i += TRUST_IN_CHUNK) {
            chunks.push(phones.slice(i, i + TRUST_IN_CHUNK));
        }
        const results = await Promise.all(
            chunks.map(chunk =>
                supabase.from("customer_trust").select(TRUST_RISK_COLUMNS).eq("tenant_id", tenantId).in("phone", chunk),
            ),
        );
        const rows: TrustRow[] = [];
        for (const { data, error } of results) {
            if (error) throw error;
            if (data) rows.push(...(data as unknown as TrustRow[]));
        }
        return rows;
    }

    return fetchTrustBook(tenantId);
}

/**
 * The caller's whole `customer_trust` book for `tenantId`: a count, then every
 * 1,000-row page at once (PK order). RLS (tenant_isolation_all) limits it to
 * the caller's tenants; the tenant filter keeps it to the one the list
 * belongs to.
 */
async function fetchTrustBook(tenantId: string): Promise<TrustRow[]> {
    const { count, error: countErr } = await supabase
        .from("customer_trust")
        .select("phone", { count: "exact", head: true })
        .eq("tenant_id", tenantId);
    if (countErr) throw countErr;
    const total = count ?? 0;
    const results = await Promise.all(
        Array.from({ length: Math.ceil(total / PAGE) }, (_, i) =>
            supabase
                .from("customer_trust")
                .select(TRUST_RISK_COLUMNS)
                .eq("tenant_id", tenantId)
                .order("tenant_id", { ascending: true })
                .order("phone", { ascending: true })
                .range(i * PAGE, i * PAGE + PAGE - 1),
        ),
    );
    const rows: TrustRow[] = [];
    for (const { data, error } of results) {
        if (error) throw error;
        if (data) rows.push(...(data as unknown as TrustRow[]));
    }
    return rows;
}

/** The distinct normalized phones of `rows` — the keys of their trust rows. */
function trustPhones(rows: readonly Order[]): string[] {
    const phones = new Set<string>();
    for (const row of rows) {
        const p = normalizePhoneLikeDb(row.phone);
        if (p) phones.add(p);
    }
    return [...phones];
}

/**
 * Attach `risk_data` to list rows from their tenant's trust rows, reproducing
 * `v_orders_with_risk`'s LEFT JOIN on (tenant_id, normalize_phone(phone)). A
 * row without a trust row gets `buildRiskData(undefined)`, as the view does.
 */
export function attachRiskData(rows: readonly Order[], trustRows: readonly TrustRow[]): Order[] {
    const trust = new Map<string, TrustRow>();
    for (const ct of trustRows) {
        trust.set(trustKey(ct.tenant_id, normalizePhoneLikeDb(ct.phone)), ct);
    }
    return rows.map(row => {
        const p = normalizePhoneLikeDb(row.phone);
        const ct = row.tenant_id && p ? trust.get(trustKey(row.tenant_id, p)) : undefined;
        return { ...row, risk_data: buildRiskData(ct) };
    });
}

/**
 * Attach `risk_data` to list rows read from `orders`. `rows` all belong to
 * `tenantId` (every list read below filters on it), so only that tenant's
 * `customer_trust` rows are fetched.
 */
async function withRiskData(tenantId: string, rows: Order[]): Promise<Order[]> {
    if (rows.length === 0) return rows;
    return attachRiskData(rows, await fetchTrustRows(tenantId, trustPhones(rows)));
}

/** Options of a list read. */
export interface ListReadOptions {
    /**
     * Called with the window's head (lib/orders/list-preview.ts) — every pinned
     * row and the newest rows — before the rest of a WIDE window has loaded,
     * and once more when the head's `risk_data` is in. Never after the read has
     * settled, and never for a window of a week or less (it loads in full fast).
     */
    onPreview?: (preview: OrderListPreview) => void;
}

/**
 * PostgREST `or` filter for "inside the window": arrived inside it OR was
 * scheduled for a day inside it — the same rule as `belongsInWindow`. Without
 * the second half a postponed order never appears on the day it was postponed
 * to. Values are quoted because ISO timestamps carry the PostgREST-reserved
 * "." and ":". Rides idx_orders_tenant_active_created and
 * idx_orders_scheduled_date (partial, scheduled rows only).
 */
function windowOrFilter(window: NonNullable<OrderWindow>): string {
    const fromIso = new Date(window.fromInstant).toISOString();
    const toIso = new Date(window.toInstant).toISOString();
    return (
        `and(created_at.gte."${fromIso}",created_at.lte."${toIso}"),` +
        `and(scheduled_date.gte.${window.fromDay},scheduled_date.lte.${window.toDay})`
    );
}

/** The list's rows: the tenant's live (not trashed, not archived) orders, inside the window when there is one. */
function listQuery(tenantId: string, window: OrderWindow, columns: string, options?: { count: "exact"; head?: boolean }) {
    let q = supabase
        .from("orders")
        .select(columns, options)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .eq("is_archived", false);
    if (window) q = q.or(windowOrFilter(window));
    return q;
}

/** Page `i` of the list, in the total order every list read uses. */
function listPage(tenantId: string, window: OrderWindow, i: number) {
    return listQuery(tenantId, window, LIST_COLUMNS)
        .order("created_at", { ascending: false })
        // Tie-break on id: parallel pages over a non-unique sort key can
        // repeat or skip rows at page boundaries, and a skipped row is missing
        // from every count.
        .order("id", { ascending: false })
        .range(i * PAGE, i * PAGE + PAGE - 1);
}

/** Every row of settled list reads, normalized, in order. Throws the first error. */
function pageRows(pages: ReadonlyArray<{ data: unknown; error: unknown }>): Order[] {
    const rows: Order[] = [];
    for (const { data, error } of pages) {
        if (error) throw error;
        if (Array.isArray(data)) {
            for (const row of data as Order[]) rows.push(normalizeOrder(row));
        }
    }
    return rows;
}

/**
 * The list's head: every pinned row and the newest `limit` rows, with the
 * window's exact row count, in two parallel requests. The preview is null when
 * the window is empty, or when the pinned read hit PREVIEW_PINNED_MAX (it may
 * then be missing pinned rows, and the preview would not be a prefix of the
 * list). `is_pinned` is a separate read, not a sort key: it is nullable, and
 * `order=is_pinned.desc` puts nulls first.
 */
async function readListHead(
    tenantId: string,
    window: OrderWindow,
    limit: number,
): Promise<{ total: number; preview: OrderListPreview | null }> {
    const [top, pinned] = await Promise.all([
        listQuery(tenantId, window, LIST_COLUMNS, { count: "exact" })
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(limit),
        listQuery(tenantId, window, LIST_COLUMNS)
            .eq("is_pinned", true)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(PREVIEW_PINNED_MAX),
    ]);
    if (top.error) throw top.error;
    if (pinned.error) throw pinned.error;
    const total = top.count ?? 0;
    const topRows = pageRows([top]);
    const pinnedRows = pageRows([pinned]);
    if (total === 0 || topRows.length === 0 || pinnedRows.length >= PREVIEW_PINNED_MAX) return { total, preview: null };
    return { total, preview: { ...mergePreviewHead(pinnedRows, topRows, total), total, withRisk: false } };
}

/**
 * A wide window (All Orders, or one over a week) in two stages:
 *
 *   1. small requests only: the head with the exact count when a preview is
 *      wanted (`onPreview`), else a count HEAD. Measured: run beside the
 *      pages, the head took 0.5-1.15s instead of 0.36-0.45s.
 *   2. every order page at once, the trust book (count, then its pages)
 *      alongside them rather than after, and the head's own trust rows so the
 *      preview gets its risk badges early.
 *
 * Page 0 re-reads the head: the result never depends on the preview. Returns
 * the same rows and `risk_data` as the old count → pages → trust read.
 */
async function readWideList(tenantId: string, window: OrderWindow, onPreview?: ListReadOptions["onPreview"]): Promise<Order[]> {
    const _t = performance.now();
    let settled = false;
    const publish = (preview: OrderListPreview) => {
        if (!settled && onPreview) onPreview(preview);
    };
    try {
        let total: number;
        let head: OrderListPreview | null = null;
        if (onPreview) {
            ({ total, preview: head } = await readListHead(tenantId, window, PREVIEW_HEAD_ROWS));
        } else {
            const { count, error } = await listQuery(tenantId, window, "id", { count: "exact", head: true });
            if (error) throw error;
            total = count ?? 0;
        }
        if (total === 0) {
            diag.log(`[Diag:Repo] wide list rows=0 took=${(performance.now() - _t).toFixed(1)}ms`);
            return [];
        }
        if (head) {
            diag.log(`[Diag:Repo] wide list head rows=${head.rows.length} total=${total} took=${(performance.now() - _t).toFixed(1)}ms`);
            publish(head);
        }

        const pageCount = Math.ceil(total / PAGE);
        // Over TRUST_LOOKUP_MAX_PHONES rows there can be that many customers:
        // read the whole trust book now, beside the pages. Below it, the rows'
        // own phones are looked up once they are in (at most two requests).
        const wholeTrustBook = total > TRUST_LOOKUP_MAX_PHONES;
        const headPreview = head;
        const [pages, trustBook] = await Promise.all([
            Promise.all(Array.from({ length: pageCount }, (_, i) => listPage(tenantId, window, i))),
            wholeTrustBook ? fetchTrustBook(tenantId) : Promise.resolve(null),
            headPreview
                ? fetchTrustRows(tenantId, trustPhones(headPreview.rows)).then((trust) => {
                    publish({ ...headPreview, rows: attachRiskData(headPreview.rows, trust), withRisk: true });
                })
                : Promise.resolve(),
        ]);
        const rows = pageRows(pages);
        const trust = trustBook ?? await fetchTrustRows(tenantId, trustPhones(rows));
        const result = attachRiskData(rows, trust);
        diag.log(`[Diag:Repo] wide list OK rows=${rows.length} pages=${pageCount} took=${(performance.now() - _t).toFixed(1)}ms`);
        return result;
    } catch (err) {
        diag.log(`[Diag:Repo] wide list ERR err=${err instanceof Error ? err.message : JSON.stringify(err)} took=${(performance.now() - _t).toFixed(1)}ms`);
        throw err;
    } finally {
        settled = true;
    }
}

export const orderRepository = {
    /**
     * Every active (non-archived, not trashed) order, newest first — the
     * All Orders list. See `readWideList`; `onPreview` gets the head first.
     */
    async findAll(tenantId: string, opts: ListReadOptions = {}): Promise<Order[]> {
        return readWideList(tenantId, null, opts.onPreview);
    },

    /**
     * The list's head (lib/orders/list-preview.ts) and the window's exact row
     * count: two small parallel reads.
     */
    async findHead(tenantId: string, window: OrderWindow, limit = PREVIEW_HEAD_ROWS): Promise<{ total: number; preview: OrderListPreview | null }> {
        return readListHead(tenantId, window, limit);
    },

    /**
     * Fetch orders for an export file, straight from the server.
     *
     * Exports must never be limited to whatever the page happens to have
     * loaded: "this month" or "all orders" has to mean what it says, even once
     * the list fetch is windowed. Scoped to `tenantId`, like every other list
     * read here. No `risk_data`: exports never read it.
     */
    async findForExport(tenantId: string, opts: { dateFrom?: string; dateTo?: string } = {}): Promise<Order[]> {
        const _t = performance.now();
        const step = 1000;
        const fromTs = opts.dateFrom ? `${opts.dateFrom}T00:00:00.000Z` : null;
        const toTs = opts.dateTo ? `${opts.dateTo}T23:59:59.999Z` : null;

        let countQuery = supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .is("deleted_at", null)
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
                    .from("orders")
                    .select(EXPORT_COLUMNS)
                    .eq("tenant_id", tenantId)
                    .is("deleted_at", null)
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
     * Takes the same `OrderWindow` the realtime predicate uses
     * (lib/order-window.ts), so the rows fetched and the rows realtime is
     * willing to add can never drift apart. A null window means "no date
     * filter" (findAll). A window over a week is read like All Orders
     * (`readWideList`, with `onPreview`); a narrower one — Today, the default —
     * is a count and its pages, whose trust rows follow.
     *
     * Rides idx_orders_tenant_active_created — measured 0.388 ms / 47 buffers for
     * 50 rows, against 4,019 kB for the full book.
     */
    async findWindow(tenantId: string, window: OrderWindow, opts: ListReadOptions = {}): Promise<Order[]> {
        if (!window) return this.findAll(tenantId, opts);
        if (windowWantsPreview(window)) return readWideList(tenantId, window, opts.onPreview);

        const _t = performance.now();

        // Count first, then page through ALL of them.
        //
        // Deliberately NOT a bare `.limit(n)`: truncating would leave the list
        // showing 1,000 rows while the status chips report the real total, i.e.
        // the list silently disagreeing with its own counts. The payload win
        // comes from the window being narrow (the default view is a single
        // day), never from dropping rows the merchant filtered for.
        const { count, error: countErr } = await listQuery(tenantId, window, "id", { count: "exact", head: true });
        if (countErr) throw countErr;

        const totalRows = count ?? 0;
        if (totalRows === 0) return [];

        const pageCount = Math.ceil(totalRows / PAGE);
        const rows = pageRows(await Promise.all(
            Array.from({ length: pageCount }, (_, i) => listPage(tenantId, window, i)),
        ));

        diag.log(`[Diag:Repo] findWindow rows=${rows.length} pages=${pageCount} took=${(performance.now() - _t).toFixed(1)}ms`);
        return withRiskData(tenantId, rows);
    },

    /**
     * Row count for an export scope, without transferring any rows.
     *
     * The export scope picker advertises "this month — N orders" before the
     * merchant commits. Those numbers have to describe the server's data, not
     * the window the page happens to hold, or the picker promises one thing and
     * the file delivers another.
     */
    async countForExport(tenantId: string, opts: { dateFrom?: string; dateTo?: string } = {}): Promise<number> {
        let q = supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .is("deleted_at", null)
            .eq("is_archived", false);
        if (opts.dateFrom) q = q.gte("created_at", `${opts.dateFrom}T00:00:00.000Z`);
        if (opts.dateTo) q = q.lte("created_at", `${opts.dateTo}T23:59:59.999Z`);
        const { count, error } = await q;
        if (error) throw error;
        return count ?? 0;
    },

    /**
     * Incremental sync: every order modified at or after a given timestamp —
     * live, archived and trashed — so the client can apply each kind of change.
     * Rows carry `deleted_at` on top of LIST_COLUMNS: a soft delete is an
     * UPDATE (trg_orders_updated_at moves `updated_at`), and a delta that
     * filtered trashed rows out could never remove a trashed order realtime
     * missed. Callers drop the column before a row enters a list cache.
     */
    async findChangedSince(tenantId: string, sinceTimestamp: string): Promise<Order[]> {
        const { data, error } = await supabase
            .from("orders")
            .select(DELTA_COLUMNS)
            .eq("tenant_id", tenantId)
            .gte("updated_at", sinceTimestamp)
            .order("updated_at", { ascending: false });

        if (error) throw error;
        return withRiskData(tenantId, (data || []).map(row => normalizeOrder(row as unknown as Order)));
    },

    /**
     * The newest `updated_at` among the tenant's orders (archived and trashed
     * included — the same rows `findChangedSince` reads), or null when
     * there are none. Read BEFORE a list fetch, it is the point the fetched
     * cache is known complete up to: every later change has a later stamp and
     * a delta from here (minus an overlap) returns it. One row, the same shape
     * as the realtime heartbeat's check.
     */
    async findLatestUpdatedAt(tenantId: string): Promise<string | null> {
        const { data, error } = await supabase
            .from("orders")
            .select("updated_at")
            .eq("tenant_id", tenantId)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error) throw error;
        return (data as { updated_at: string | null } | null)?.updated_at ?? null;
    },

    /** Fetch all archived orders, newest first. */
    async findArchived(tenantId: string): Promise<Order[]> {
        const rows: Order[] = [];
        let from = 0;
        const step = 1000;

        while (true) {
            const page = await supabase
                .from("orders")
                .select(LIST_COLUMNS)
                .eq("tenant_id", tenantId)
                .is("deleted_at", null)
                .eq("is_archived", true)
                .order("created_at", { ascending: false })
                .range(from, from + step - 1);

            const pageOrders = pageRows([page]);
            rows.push(...pageOrders);
            from += step;
            if (pageOrders.length < step) break;
        }

        return withRiskData(tenantId, rows);
    },

    /**
     * Search the caller's whole order book — every date, every status, archived
     * and trashed included — for a typed term. See lib/order-server-search.ts
     * for what a term matches and how results are ranked.
     *
     * Prefers `search_orders_v2` (migration 20261012120000: indexed, and folds
     * Arabic name variants). Until that migration is applied the RPC does not
     * exist (PostgREST PGRST202); the same search then runs as two selects on
     * `orders`. Both paths are limited to `tenantId`. Any OTHER error is
     * thrown — a failing search must not read as "no orders match".
     */
    async search(tenantId: string, term: string, limit = MAX_SEARCH_RESULTS): Promise<Order[]> {
        const parsed = parseOrderSearchTerm(term);
        if (!parsed) return [];
        const cappedLimit = Math.min(Math.max(1, limit), MAX_SEARCH_RESULTS);

        let rows: Order[] | null = null;
        if (!searchRpcMissing) {
            const { data, error } = await supabase
                .rpc("search_orders_v2", { p_tenant_id: tenantId, p_term: parsed.text, p_limit: cappedLimit })
                .select(SEARCH_COLUMNS);
            if (error) {
                if (error.code !== RPC_NOT_FOUND) throw error;
                searchRpcMissing = true;
                diag.log(`[Diag:Repo] search_orders_v2 not deployed; using direct selects`);
            } else {
                rows = (data ?? []) as unknown as Order[];
            }
        }

        if (rows === null) {
            const filters = buildDirectSearchFilters(parsed);
            const [exact, partial] = await Promise.all(
                [filters.exact, filters.partial].map(or =>
                    supabase
                        .from("orders")
                        .select(SEARCH_COLUMNS)
                        .eq("tenant_id", tenantId)
                        .or(or)
                        .order("created_at", { ascending: false })
                        .order("id", { ascending: false })
                        .limit(cappedLimit),
                ),
            );
            if (exact.error) throw exact.error;
            if (partial.error) throw partial.error;
            rows = [
                ...((exact.data ?? []) as unknown as Order[]),
                ...((partial.data ?? []) as unknown as Order[]),
            ];
        }

        const ranked = rankSearchResults(parsed, [rows], cappedLimit);
        return withRiskData(tenantId, ranked.map(row => normalizeOrder(row)));
    },

    /**
     * Specific orders of `tenantId` by uuid, in the list columns, whatever their
     * date or archive state. For readers that link to orders (chat threads) —
     * the loaded list is a date window, so a linked order is usually not in it.
     * Trashed orders are left out, as they are from the list.
     */
    async findByIds(tenantId: string, ids: readonly string[]): Promise<Order[]> {
        const unique = [...new Set(ids)];
        if (unique.length === 0) return [];
        const chunks: string[][] = [];
        for (let i = 0; i < unique.length; i += ID_IN_CHUNK) {
            chunks.push(unique.slice(i, i + ID_IN_CHUNK));
        }
        const results = await Promise.all(
            chunks.map(chunk =>
                supabase
                    .from("orders")
                    .select(LIST_COLUMNS)
                    .eq("tenant_id", tenantId)
                    .is("deleted_at", null)
                    .in("id", chunk),
            ),
        );
        const rows: Order[] = [];
        for (const { data, error } of results) {
            if (error) throw error;
            for (const row of data ?? []) rows.push(normalizeOrder(row as unknown as Order));
        }
        return withRiskData(tenantId, rows);
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

    /** Fetch a single order of `tenantId` by its display order_id (not the uuid). Returns null if none. */
    async findByOrderId(tenantId: string, orderId: string): Promise<Order | null> {
        const { data, error } = await supabase
            .from("v_orders_with_risk")
            .select("*")
            .eq("tenant_id", tenantId)
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
     * colliding sequence_number). Every lookup is limited to `tenantId`:
     * sequence_number is only unique per tenant, so without it a user in two
     * tenants could get the other tenant's order. Returns null only when
     * nothing matches.
     */
    async findByScanRef(tenantId: string, ref: string): Promise<Order | null> {
        const value = (ref ?? "").trim();
        if (!value) return null;

        // 1. Canonical order_id (exact). Most labels carry this.
        const byOrderId = await this.findByOrderId(tenantId, value);
        if (byOrderId) return byOrderId;

        // 2. Short per-tenant sequence_number — only attempt for a pure integer.
        if (/^\d+$/.test(value)) {
            const seq = Number(value);
            if (Number.isSafeInteger(seq)) {
                const { data, error } = await supabase
                    .from("v_orders_with_risk")
                    .select("*")
                    .eq("tenant_id", tenantId)
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
            .eq("tenant_id", tenantId)
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
            .select(ORDER_READ_COLUMNS)
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
        const updateData = buildStatusUpdate(status, {
            rejectionReason,
            rejectionReasonId,
            changedByName: last_status_changed_by_name,
            changedByAvatar: last_status_changed_by_avatar,
        });

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
                    .select(ORDER_READ_COLUMNS)
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
                        .select(ORDER_READ_COLUMNS)
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
     * Change the status of up to one batch of orders in a single statement.
     *
     * One UPDATE for the whole batch, so its row triggers run inside one
     * transaction instead of N transactions queueing for the same products lock.
     * Rows that come back were written; rows that do not were filtered out by
     * the version guard (a concurrent edit) or by RLS, and are reported failed.
     *
     * If the statement itself errors — one row refused by a trigger, a timeout,
     * a deadlock — nothing in it committed, so the batch is retried one order at
     * a time to isolate the bad row and land the rest.
     */
    async updateStatusBatch(
        orderIds: string[],
        status: Order["status"],
        ctx: StatusUpdateContext,
        expectedVersions?: Record<string, number>
    ): Promise<{
        successfulOperations: { id: string, order: Order }[],
        failedOperations: { id: string, error: unknown }[]
    }> {
        const t0 = performance.now();
        const { data, error } = await supabase
            .from("orders")
            .update(buildStatusUpdate(status, ctx))
            .in("id", orderIds)
            .or(buildVersionedIdFilter(orderIds, expectedVersions))
            .select(ORDER_READ_COLUMNS)
            .abortSignal(AbortSignal.timeout(STATUS_BATCH_TIMEOUT_MS));
        const elapsed = Math.round(performance.now() - t0);

        if (error) {
            diag.warn(`[updateStatusBatch] batch of ${orderIds.length} failed in ${elapsed}ms (${error.code ?? "?"}: ${error.message}); retrying per order`);
            return this.updateStatusOneByOne(orderIds, status, ctx, expectedVersions);
        }

        const written = new Map((data ?? []).map((row) => [row.id as string, normalizeOrder(row)]));
        const successfulOperations: { id: string, order: Order }[] = [];
        const failedOperations: { id: string, error: unknown }[] = [];
        for (const id of orderIds) {
            const order = written.get(id);
            if (order) {
                successfulOperations.push({ id, order });
            } else if (typeof expectedVersions?.[id] === "number") {
                failedOperations.push({ id, error: new Error("CONFLICT_DETECTED") });
            } else {
                failedOperations.push({ id, error: new Error("Status update failed: row not found or write was rejected. Try refreshing.") });
            }
        }
        diag.log(`[updateStatusBatch] batch of ${orderIds.length} in ${elapsed}ms ok=${successfulOperations.length} failed=${failedOperations.length}`);
        return { successfulOperations, failedOperations };
    },

    /**
     * Per-order fallback for a batch whose statement errored. Sequential, so it
     * cannot contend with itself. A transport error on the batch may still have
     * committed it, so a version conflict here is re-read: if the row already
     * carries the target status, that is our own write, not someone else's.
     */
    async updateStatusOneByOne(
        orderIds: string[],
        status: Order["status"],
        ctx: StatusUpdateContext,
        expectedVersions?: Record<string, number>
    ): Promise<{
        successfulOperations: { id: string, order: Order }[],
        failedOperations: { id: string, error: unknown }[]
    }> {
        const successfulOperations: { id: string, order: Order }[] = [];
        const failedOperations: { id: string, error: unknown }[] = [];
        for (const id of orderIds) {
            try {
                const order = await this.updateStatus(
                    id,
                    status,
                    ctx.rejectionReason,
                    ctx.changedByName,
                    ctx.changedByAvatar,
                    expectedVersions?.[id],
                    ctx.rejectionReasonId
                );
                successfulOperations.push({ id, order });
            } catch (error) {
                if (error instanceof Error && error.message === "CONFLICT_DETECTED") {
                    const { data: current, error: readError } = await supabase
                        .from("orders")
                        .select(ORDER_READ_COLUMNS)
                        .eq("id", id)
                        .maybeSingle();
                    if (!readError && current && current.status === status) {
                        successfulOperations.push({ id, order: normalizeOrder(current) });
                        continue;
                    }
                }
                failedOperations.push({ id, error });
            }
        }
        return { successfulOperations, failedOperations };
    },

    /**
     * Update order status in bulk: small batches, one at a time, ids ascending
     * (see lib/order-bulk-batches for why). `onBatchSettled` runs after each
     * batch — the caller writes that batch's status history there — and
     * `onProgress` reports orders settled so far.
     */
    async bulkUpdateStatus(
        orderIds: string[],
        status: Order["status"],
        rejectionReason?: string,
        last_status_changed_by_name?: string,
        last_status_changed_by_avatar?: string,
        expectedVersions?: Record<string, number>,
        hooks?: {
            onBatchSettled?: (outcome: BatchOutcome<{ id: string, order: Order }>) => Promise<void> | void;
            onProgress?: (progress: BulkProgress) => void;
        }
    ): Promise<{
        successfulOperations: { id: string, order: Order }[],
        failedOperations: { id: string, error: unknown }[]
    }> {
        diag.log(`[Diag:Repo] bulkUpdateStatus START count=${orderIds.length} status=${status}`);
        const ctx: StatusUpdateContext = {
            rejectionReason,
            changedByName: last_status_changed_by_name,
            changedByAvatar: last_status_changed_by_avatar,
        };

        const { succeeded, failed } = await runInSequentialBatches<{ id: string, order: Order }>({
            ids: orderIds,
            runBatch: async (batch) => {
                const { successfulOperations, failedOperations } =
                    await this.updateStatusBatch(batch, status, ctx, expectedVersions);
                return { succeeded: successfulOperations, failed: failedOperations };
            },
            onBatchSettled: hooks?.onBatchSettled,
            onProgress: hooks?.onProgress,
        });

        diag.log(`[Diag:Repo] bulkUpdateStatus DONE success=${succeeded.length} failed=${failed.length}`);
        return { successfulOperations: succeeded, failedOperations: failed };
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
