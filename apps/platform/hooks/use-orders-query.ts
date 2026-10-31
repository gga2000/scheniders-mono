import { hashKey, skipToken, useQuery, useMutation, useQueryClient, useIsMutating, type Query, type QueryClient, type QueryState } from "@tanstack/react-query";
import {
    ORDERS_LIST_MUTATION_KEY,
    advanceSyncWatermark,
    cancelListFetches,
    ensureCoverage,
    getCommitGeneration,
    getLoadedWindowKey,
    getSyncWatermark,
    markListLoaded,
    setActiveWindowKey,
    trackListFetch,
    useFailedOrdersWindowKey,
    useLoadedOrdersWindowKey,
} from "@/hooks/orders-list-coverage";
import { listCovers } from "@/lib/orders/coverage-key";
import { normalizePhoneLikeDb } from "@/lib/customer-trust-risk";
import { useEffect, useRef, useState } from "react";
import { type Order } from "@/types";
import { CACHE_PRESETS } from '@/lib/query-config';
import { diag } from "@/lib/diag";
import { perfTrace } from "@/lib/perf-trace";
import { attachRiskData, orderRepository } from "@/lib/repositories/order-repository";
import { readPersistedBook, writePersistedBook } from "@/lib/orders/persisted-book";
import { useAuth } from "@/components/auth/auth-provider";
import { toast } from "@/hooks/use-toast";
import { createOrderAction } from "@/app/actions/orders";
import type { CreateOrderInput } from "@/types/order";
import { shouldApplyRealtimeUpdate, toListRow, type RealtimeBatcher } from "@/lib/realtime-batcher";
import { resolveStaleContacted } from "@/hooks/use-auto-no-response";
import { belongsInWindow, windowCacheKey, type OrderWindow } from "@/lib/order-window";
import { FutureOrderDateError } from "@/lib/order-date-guard";
import { reportOrderError } from "@/lib/order-telemetry";
import type { OrderListPreview } from "@/lib/orders/list-preview";
// Refetch trigger constants
export const orderRefetchTriggers = {
    appReopen: "appReopen",
    realtimeReconnect: "realtimeReconnect",
} as const;

// Query keys for cache management
export const orderKeys = {
    all: ["orders"] as const,
    lists: () => [...orderKeys.all, "list"] as const,
    list: (filters: string) => [...orderKeys.lists(), { filters }] as const,
    details: () => [...orderKeys.all, "detail"] as const,
    detail: (id: string) => [...orderKeys.details(), id] as const,
    archived: () => [...orderKeys.all, "archived"] as const,
};

/**
 * Keys of the server order search (hooks/use-server-order-search.ts), under the
 * list prefix so a list mutation's cancel and a failed delta's invalidate reach
 * it. Defined here so the catch-up can name it without an import cycle.
 */
export const orderSearchKeys = {
    all: [...orderKeys.lists(), "search"] as const,
    term: (text: string, limit: number) => [...orderSearchKeys.all, text, limit] as const,
};

/**
 * Keys of the duplicate-alert margin (hooks/use-duplicate-window-alerts.ts):
 * `findWindow` over the visible window ±48h, under the list prefix. Defined
 * here, not in that hook, so the catch-up can merge into it without an import
 * cycle (the hook imports this module).
 */
export const duplicateCandidateKeys = {
    all: [...orderKeys.lists(), "duplicate-candidates"] as const,
    window: (window: OrderWindow) => [...duplicateCandidateKeys.all, windowCacheKey(window)] as const,
};

/**
 * Keys of the list preview: the head of a wide list fetch (lib/orders/list-preview.ts),
 * written by the list queryFn while the rest of the window loads. Deliberately
 * OUTSIDE `orderKeys.lists()`: mutations, realtime, deltas, the watermark and
 * the chip derivation never see it. It is read-only and short-lived — shown
 * only while the list does not cover its window, and removed once it does.
 */
export const orderPreviewKeys = {
    all: [...orderKeys.all, "preview"] as const,
    window: (tenantId: string, windowKey: string) => [...orderPreviewKeys.all, tenantId, windowKey] as const,
};
/** How long an unwatched preview is kept. Long enough to survive a re-render, short enough not to resurface stale. */
export const PREVIEW_GC_MS = 60_000;

/**
 * Store the head a list fetch for `windowKey` read. Skipped when the list
 * already covers that window (a refetch of a loaded window): the preview would
 * never be shown, and would linger to resurface stale.
 */
export function publishListPreview(queryClient: QueryClient, tenantId: string, windowKey: string, preview: OrderListPreview): void {
    if (listCovers(getLoadedWindowKey(queryClient), windowKey)) return;
    perfTrace.mark(preview.withRisk ? "orders:preview-risk" : "orders:preview-data", { rows: preview.rows.length, total: preview.total });
    // Same status resolution as the full rows get in fetchOrders, so a row
    // does not change status when the full list replaces the preview.
    queryClient.setQueryData<OrderListPreview>(orderPreviewKeys.window(tenantId, windowKey), {
        ...preview,
        rows: resolveStaleContacted(preview.rows),
    });
}

/** The preview stored for `windowKey`, if any. Never fetches: only the list queryFn writes it. */
export function useOrderListPreview(windowKey: string): OrderListPreview | undefined {
    const { tenantId } = useAuth();
    const { data } = useQuery<OrderListPreview>({
        queryKey: orderPreviewKeys.window(tenantId ?? "", windowKey),
        queryFn: skipToken,
        staleTime: Infinity,
        gcTime: PREVIEW_GC_MS,
    });
    return data;
}

/** A margin query's `meta`: the window its rows were fetched for, which decides what a delta row adds or drops. */
export function duplicateCandidateMeta(window: OrderWindow): { candidateWindow: OrderWindow } {
    return { candidateWindow: window };
}

function isOrderWindow(value: unknown): value is NonNullable<OrderWindow> {
    if (typeof value !== "object" || value === null) return false;
    const w = value as Record<string, unknown>;
    return typeof w.fromInstant === "number" && typeof w.toInstant === "number"
        && typeof w.fromDay === "string" && typeof w.toDay === "string";
}

/**
 * Merge a tenant-wide delta into rows fetched for `window`, by the batcher's
 * rules: version-checked, trashed / archived / out-of-window rows dropped,
 * newly-in-window rows added — unless the batcher has since seen the row
 * trashed, deleted or archived (`removedSince`: the delta read it first).
 * Returns `rows` unchanged when nothing differs.
 */
function mergeDeltaIntoWindowRows(
    rows: Order[] | undefined,
    changed: readonly Order[],
    window: OrderWindow,
): Order[] | undefined {
    if (!Array.isArray(rows)) return rows;
    const batcher = getOrderBatcher();
    // Several deltas can be merged at once (a margin fetch's buffer): newest per id.
    const incoming = new Map<string, Order>();
    for (const row of changed) {
        const seen = incoming.get(row.id);
        if (!seen || shouldApplyRealtimeUpdate(seen, row)) incoming.set(row.id, row);
    }
    let changedAny = false;
    const next: Order[] = [];
    for (const cached of rows) {
        const row = incoming.get(cached.id);
        if (!row) { next.push(cached); continue; }
        incoming.delete(cached.id);
        if (!shouldApplyRealtimeUpdate(cached, row)) { next.push(cached); continue; }
        changedAny = true;
        if (row.deleted_at != null || !belongsInWindow(row, window)) continue;
        next.push(toListRow(row));
    }
    const added: Order[] = [];
    for (const row of incoming.values()) {
        if (row.deleted_at != null || !belongsInWindow(row, window)) continue;
        if (batcher?.removedSince(row, { tenantWide: true })) continue;
        added.push(toListRow(row));
    }
    if (added.length === 0 && !changedAny) return rows;
    return [...added, ...next];
}

/**
 * Delta rows that landed while a margin fetch was in flight, per margin query.
 * `promise` is that fetch: rows buffered for one fetch never reach another.
 */
const pendingMarginMerges = new WeakMap<Query, { promise: Promise<unknown>; rows: Order[] }>();

/**
 * Bring every cached duplicate margin up to date with a delta. The delta is
 * tenant-wide, so it holds every change to the margin's rows too: refetching
 * the margin (a `findWindow` over ~5 days for "Today") after each status
 * change cost more than the main list it replaced. A margin query without its
 * window in `meta` cannot be merged safely and is marked stale instead.
 */
function mergeDeltaIntoMargins(queryClient: QueryClient, changed: readonly Order[]): void {
    if (changed.length === 0) return;
    for (const query of queryClient.getQueryCache().findAll({ queryKey: duplicateCandidateKeys.all })) {
        const window = query.meta?.candidateWindow;
        if (!isOrderWindow(window)) {
            diag.warn(`[Diag:RQ:Delta] margin ${JSON.stringify(query.queryKey)} has no window — marking it stale`);
            void queryClient.invalidateQueries({ queryKey: query.queryKey, exact: true });
            continue;
        }
        const inFlight = query.state.fetchStatus === "fetching" ? query.promise : undefined;
        if (inFlight) {
            // Its read can predate these rows and lands after this merge,
            // overwriting it, while the watermark has already moved past them.
            // Buffer them and merge once, on top of what it commits — the
            // merge is version-checked, so a read newer than a buffered row
            // keeps its own copy. Refetching instead read the margin again per
            // delta, and every refetch was in flight for the next one.
            const pending = pendingMarginMerges.get(query);
            if (pending?.promise === inFlight) {
                pending.rows.push(...changed);
                continue;
            }
            const entry = { promise: inFlight, rows: [...changed] };
            pendingMarginMerges.set(query, entry);
            const queryKey = query.queryKey;
            // Settled either way, the query holds the rows to merge into: what
            // it committed, or — after an error or a reverting cancel — what it
            // held before, which these rows are newer than. A first load that
            // failed holds nothing and is left to its error and retry state; a
            // cancel by a list mutation is refetched by its flush
            // (orders-list-coverage).
            const merge = () => {
                if (pendingMarginMerges.get(query) === entry) pendingMarginMerges.delete(query);
                queryClient.setQueryData<Order[]>(queryKey, (old) => mergeDeltaIntoWindowRows(old, entry.rows, window));
            };
            inFlight.then(merge, (err: unknown) => {
                diag.log(`[Diag:RQ:Delta] margin ${JSON.stringify(queryKey)} fetch did not commit (${err instanceof Error ? err.name : "unknown"}) — merging ${entry.rows.length} buffered rows into its previous data`);
                merge();
            });
            continue;
        }
        queryClient.setQueryData<Order[]>(query.queryKey, (old) => mergeDeltaIntoWindowRows(old, changed, window));
    }
}

// =============================================
// BATCHER REGISTRY
// Module-level ref so mutations can call markMutated()
// on the active RealtimeBatcher without threading refs
// through the component tree.
// =============================================
let _orderBatcher: RealtimeBatcher | null = null;
const batcherWaiters = new Set<() => void>();
export function setOrderBatcher(b: RealtimeBatcher | null) {
    _orderBatcher = b;
    if (b) for (const wake of [...batcherWaiters]) wake();
}
function getOrderBatcher() { return _orderBatcher; }

/**
 * Resolves true once a batcher is registered (immediately if one is), false
 * after `timeoutMs`. A catch-up started on mount runs before useOrders'
 * effect registers the batcher of the same render.
 */
function whenBatcherReady(timeoutMs: number): Promise<boolean> {
    if (_orderBatcher) return Promise.resolve(true);
    return new Promise((resolve) => {
        const wake = () => {
            batcherWaiters.delete(wake);
            clearTimeout(timer);
            resolve(true);
        };
        const timer = setTimeout(() => {
            batcherWaiters.delete(wake);
            resolve(false);
        }, timeoutMs);
        batcherWaiters.add(wake);
    });
}

/**
 * Every hook that touches the list cache calls this first: it creates the
 * per-client coverage store (hooks/orders-list-coverage.ts) and wires its
 * mutation flush to the catch-up delta. Idempotent.
 */
function coverage(queryClient: QueryClient): QueryClient {
    ensureCoverage(queryClient, {
        listKey: orderKeys.lists(),
        onMainKeyFlush: (tenantId) => { void requestOrdersCatchUp(queryClient, tenantId, { source: "mutationCancel" }); },
    });
    return queryClient;
}

/** The fetch-start high-water mark, or null (reported) when it cannot be read. */
async function readListMark(tenantId: string): Promise<string | null> {
    try {
        return await orderRepository.findLatestUpdatedAt(tenantId);
    } catch (err) {
        // The list fetch still runs; the previous watermark (older, so a safe
        // lower bound) is kept, or a later delta falls back to a refetch.
        reportOrderError(err, { operation: "orders-sync-watermark", tenantId });
        return null;
    }
}

/**
 * How far before a fetch-start mark the first delta after it reads. `updated_at`
 * is `now()` — the transaction START — so a write stamped just before the mark
 * can commit after the list pages were read. Applied once, from a fetch mark.
 */
export const DELTA_OVERLAP_MS = 120_000;
/** The same allowance for commit lag, from a delta's own watermark. Small: it re-reads tenant-wide changes. */
export const DELTA_SKEW_MS = 10_000;
/**
 * PostgREST's `max-rows` on this project (confirmed live: an unpaged select
 * returns exactly 1,000). `findChangedSince` is one unpaged select, newest
 * first, so a result this long may be missing its OLDEST rows: it cannot
 * advance the watermark, and the main list is refetched instead.
 */
export const DELTA_ROW_CAP = 1000;

function minIso(a: string, b: string | undefined): string {
    return b && Date.parse(b) < Date.parse(a) ? b : a;
}

/**
 * Incremental delta sync — used on realtime reconnect / app-reopen / heartbeat
 * drift and after our own status changes, INSTEAD of re-pulling the whole
 * window. Fetches every row changed since the sync watermark (the tenant-wide
 * high-water mark read before the last list fetch, raised by each complete
 * delta) and merges them through the batcher (same rules as live events).
 *
 * `opts.since` only lowers the start (a caller that knows its own write is
 * newer than it). Falls back to a full invalidate when there's no
 * cache/batcher/tenant or the delta fetch fails, and to an exact refetch of
 * the main list when there is no watermark or the delta hit DELTA_ROW_CAP.
 */
export async function syncOrdersDelta(
    queryClient: QueryClient,
    tenantId: string | null,
    source: string,
    opts: { since?: string } = {},
): Promise<void> {
    coverage(queryClient);
    // An empty array is a loaded, empty window (Today before the first order):
    // a delta applies to it like any other. Only "never loaded" refetches.
    const cached = queryClient.getQueryData<Order[]>(orderKeys.lists());
    const batcher = getOrderBatcher();
    if (!cached || !batcher || !tenantId) {
        diag.log(`[Diag:RQ:Delta] source=${source} — no cache/batcher, full refetch`);
        queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
        return;
    }
    const mark = getSyncWatermark(queryClient);
    if (!mark) {
        // No fetch-start mark (e.g. a snapshot hydrated without one). The cache's
        // own newest `updated_at` is not a safe start: client-rewritten rows carry
        // the client clock. Re-read the window instead.
        diag.log(`[Diag:RQ:Delta] source=${source} — no sync watermark, refetching the list`);
        void queryClient.refetchQueries({ queryKey: orderKeys.lists(), exact: true }, { cancelRefetch: false });
        return;
    }
    const since = minIso(
        new Date(Date.parse(mark.at) - (mark.fromFetch ? DELTA_OVERLAP_MS : DELTA_SKEW_MS)).toISOString(),
        opts.since,
    );
    const commitGen = getCommitGeneration(queryClient);
    try {
        const _t = performance.now();
        const changed = await orderRepository.findChangedSince(tenantId, since);
        if (changed.length >= DELTA_ROW_CAP) {
            diag.warn(`[Diag:RQ:Delta] overflow source=${source} since=${since} fetched=${changed.length} — watermark kept, refetching the list`);
            void queryClient.refetchQueries({ queryKey: orderKeys.lists(), exact: true }, { cancelRefetch: false });
            // The margin cannot take a partial delta either.
            void queryClient.invalidateQueries({ queryKey: duplicateCandidateKeys.all });
            return;
        }
        const applied = batcher.applyChangedOrders(changed);
        mergeDeltaIntoMargins(queryClient, changed);
        propagateRiskData(queryClient, changed);
        advanceSyncWatermark(queryClient, changed, commitGen);
        diag.log(`[Diag:RQ:Delta] source=${source} since=${since} fetched=${changed.length} applied=${applied} took=${(performance.now() - _t).toFixed(1)}ms`);
    } catch (err) {
        diag.error(`[Diag:RQ:Delta] source=${source} FAILED — full refetch`, err);
        queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
    }
}

interface CatchUpQueue {
    running: Promise<void> | null;
    /** Requests that arrived while `running` was in flight, merged into one follow-up. */
    next: { promise: Promise<void>; resolve: () => void; tenantId: string; source: string; since?: string } | null;
}
const catchUps = new WeakMap<QueryClient, CatchUpQueue>();

/**
 * Schedule a catch-up delta for the list cache. The one way mutation code asks
 * for one.
 *
 * Coalesced per client: at most one delta in flight, and every request that
 * arrives meanwhile shares ONE follow-up (lowest `since` wins). The returned
 * promise resolves only after a delta that STARTED AFTER THE REQUEST has
 * finished — a request never resolves on an in-flight delta that could not
 * contain its write. It never rejects (`syncOrdersDelta` reports and falls
 * back). A null tenant is a no-op: the list query is disabled then, and a
 * full invalidate would only refetch nothing.
 */
export function requestOrdersCatchUp(
    queryClient: QueryClient,
    tenantId: string | null,
    { source, since }: { source: string; since?: string },
): Promise<void> {
    if (!tenantId) return Promise.resolve();
    let queue = catchUps.get(queryClient);
    if (!queue) {
        queue = { running: null, next: null };
        catchUps.set(queryClient, queue);
    }
    const q = queue;

    const start = (t: string, s: string, floor: string | undefined): Promise<void> => {
        const run = syncOrdersDelta(queryClient, t, s, { since: floor })
            .catch((err: unknown) => { diag.error(`[Diag:RQ:Delta] catch-up source=${s} threw`, err); })
            .then(() => {
                const follow = q.next;
                q.next = null;
                if (follow) {
                    q.running = start(follow.tenantId, follow.source, follow.since);
                    void q.running.then(follow.resolve);
                } else {
                    q.running = null;
                }
            });
        return run;
    };

    if (!q.running) {
        q.running = start(tenantId, source, since);
        return q.running;
    }
    if (!q.next) {
        let resolve: () => void = () => {};
        const promise = new Promise<void>((r) => { resolve = r; });
        q.next = { promise, resolve, tenantId, source, since };
    } else {
        q.next.tenantId = tenantId;
        q.next.source = `${q.next.source}+${source}`;
        if (since) q.next.since = q.next.since ? minIso(q.next.since, since) : since;
    }
    return q.next.promise;
}

// Per-order mutation sequence: prevents stale onSuccess/onError from
// overwriting newer optimistic state when rapid-fire mutations overlap.
const _orderMutationSeq = new Map<string, { seq: number; ts: number }>();
const SEQ_CLEANUP_INTERVAL_MS = 30_000;
const SEQ_MAX_AGE_MS = 30_000;

function nextMutationSeq(orderId: string): number {
    const prev = _orderMutationSeq.get(orderId);
    const seq = (prev?.seq ?? 0) + 1;
    _orderMutationSeq.set(orderId, { seq, ts: Date.now() });
    return seq;
}
function isMutationCurrent(orderId: string, seq: number): boolean {
    return _orderMutationSeq.get(orderId)?.seq === seq;
}

// Periodic cleanup: remove entries older than 30s to prevent memory growth
if (typeof window !== 'undefined') {
    setInterval(() => {
        const now = Date.now();
        for (const [id, entry] of _orderMutationSeq) {
            if (now - entry.ts > SEQ_MAX_AGE_MS) _orderMutationSeq.delete(id);
        }
    }, SEQ_CLEANUP_INTERVAL_MS);
}

// =============================================
// PERSISTED ORDER BOOK (lib/orders/persisted-book.ts)
// The list is kept on the device between visits. Opening /orders restores the
// window from disk, then a delta from the saved watermark brings it current
// (the same path realtime reconnects use), and the row count is checked
// against the server. A full window read runs only when there is no usable
// copy, the count disagrees, or the delta overflows. Replaces the
// sessionStorage snapshot, which held 650 rows for 5 minutes, so an
// All Orders book was never kept, and which always refetched on mount.
// =============================================

// Moved to lib/order-window so pure modules (useOrderFilters) can use it
// without importing this one; re-exported for existing imports.
export { windowCacheKey };

/** Storage errors that recur on every write in a session (quota, blocked storage): reported once per page load. */
const reportedStorageErrors = new Set<string>();

function reportBookError(err: unknown, operation: string, extra: Record<string, unknown> = {}): void {
    const name = err instanceof DOMException ? err.name : null;
    if (name === "QuotaExceededError" || name === "SecurityError" || name === "InvalidStateError") {
        const key = `${operation}:${name}`;
        if (reportedStorageErrors.has(key)) return;
        reportedStorageErrors.add(key);
    }
    reportOrderError(err, { operation, extra });
}

/** Every row is `tenantId`'s. A list that is not is never restored or saved under it. */
function allRowsOfTenant(rows: readonly Order[], tenantId: string): boolean {
    return rows.every((row) => row.tenant_id === tenantId);
}

/**
 * Restore the saved copy of `windowKey` into the list cache. Returns the rows
 * restored, 0 on a miss (the query then reads the server). The restored rows
 * cover the window and are complete up to the saved watermark, exactly like a
 * committed fetch with that mark.
 */
export async function restoreOrdersBook(
    queryClient: QueryClient,
    { userId, tenantId, windowKey }: { userId: string; tenantId: string; windowKey: string },
): Promise<number> {
    coverage(queryClient);
    const result = await readPersistedBook(userId, tenantId, windowKey);
    if ("miss" in result) {
        if (result.error) reportBookError(result.error, "orders-book-read");
        diag.log(`[Diag:RQ:Book] miss=${result.miss} window=${windowKey}`);
        perfTrace.markRepeat("orders:book-miss", { reason: result.miss });
        return 0;
    }
    const { book } = result;
    if (!allRowsOfTenant(book.rows, tenantId)) {
        reportOrderError(new Error("Saved order book holds another tenant's rows"), { operation: "orders-book-read", tenantId });
        return 0;
    }
    const rows = dedupeById(resolveStaleContacted(book.rows));
    markListLoaded(queryClient, windowKey, book.mark);
    queryClient.setQueryData(orderKeys.lists(), rows, { updatedAt: book.savedAt });
    diag.log(`[Diag:RQ:Book] restored rows=${rows.length} age=${Math.round((Date.now() - book.savedAt) / 1000)}s window=${windowKey}`);
    perfTrace.markRepeat("orders:book-restored", { rows: rows.length, ageS: Math.round((Date.now() - book.savedAt) / 1000) });
    return rows.length;
}

/** How long a catch-up waits for the realtime batcher before falling back to a full read. */
const BATCHER_WAIT_MS = 3000;

/**
 * Bring a list that did not come from a fetch (restored from the device, or
 * still in memory from an earlier visit) up to date with a delta. With
 * `verify`, the row count is then checked against the server — a mismatch
 * (a hard delete the delta cannot see, or anything else missed) re-reads the
 * window — and risk_data is refreshed, which order deltas do not move.
 */
export async function catchUpRestoredList(
    queryClient: QueryClient,
    tenantId: string,
    window: OrderWindow,
    { source, verify }: { source: string; verify: boolean },
): Promise<void> {
    const refetchList = () => queryClient.refetchQueries({ queryKey: orderKeys.lists(), exact: true }, { cancelRefetch: false });
    if (!(await whenBatcherReady(BATCHER_WAIT_MS))) {
        diag.warn(`[Diag:RQ:Book] source=${source} — no realtime batcher after ${BATCHER_WAIT_MS}ms, reading the window`);
        await refetchList();
        return;
    }
    await requestOrdersCatchUp(queryClient, tenantId, { source });
    perfTrace.markRepeat("orders:book-caught-up", { source });
    if (!verify) return;
    // A delta that overflowed, or failed, has started a full read: that read is the check.
    if (queryClient.getQueryState(orderKeys.lists())?.fetchStatus === "fetching") return;
    const windowKey = windowCacheKey(window);
    const rows = queryClient.getQueryData<Order[]>(orderKeys.lists());
    if (!Array.isArray(rows) || getLoadedWindowKey(queryClient) !== windowKey) return;

    let total: number;
    try {
        total = await orderRepository.countWindow(tenantId, window);
    } catch (err) {
        // The delta succeeded; the list is as current as realtime keeps it.
        reportOrderError(err, { operation: "orders-book-verify", tenantId });
        return;
    }
    const current = queryClient.getQueryData<Order[]>(orderKeys.lists());
    if (!Array.isArray(current) || getLoadedWindowKey(queryClient) !== windowKey) return;
    if (total !== current.length) {
        diag.warn(`[Diag:RQ:Book] count mismatch cached=${current.length} server=${total} window=${windowKey} — reading the window`);
        perfTrace.markRepeat("orders:book-mismatch", { cached: current.length, server: total });
        await refetchList();
        return;
    }
    perfTrace.markRepeat("orders:book-verified", { rows: total });

    try {
        const trust = await orderRepository.findTrustFor(tenantId, current);
        queryClient.setQueryData<Order[]>(orderKeys.lists(), (old) => (Array.isArray(old) ? attachRiskData(old, trust) : old));
    } catch (err) {
        reportOrderError(err, { operation: "orders-book-risk", tenantId });
    }
}

/** Quiet time after the last change to the list before it is saved. */
const BOOK_SAVE_DEBOUNCE_MS = 1000;

/**
 * Save the list cache to the device whenever it settles: after a fetch, a
 * delta, realtime events or our own edits. Never while a mutation is pending
 * (the cache may hold an optimistic value that is about to be rolled back),
 * never rows of another tenant, never a window the cache does not cover.
 * Pending changes are saved when the tab is hidden or the page is left.
 */
function useOrdersBookWriter(queryClient: QueryClient, userId: string | null, tenantId: string | null): void {
    useEffect(() => {
        if (!userId || !tenantId) return;
        const listHash = hashKey(orderKeys.lists());
        let timer: ReturnType<typeof setTimeout> | null = null;
        let lastSaved: Order[] | null = null;

        const save = () => {
            timer = null;
            const rows = queryClient.getQueryData<Order[]>(orderKeys.lists());
            const windowKey = getLoadedWindowKey(queryClient);
            if (!Array.isArray(rows) || rows === lastSaved || !windowKey) return;
            if (queryClient.isMutating() > 0) {
                schedule();
                return;
            }
            if (!allRowsOfTenant(rows, tenantId)) return;
            lastSaved = rows;
            const startedAt = performance.now();
            writePersistedBook({ userId, tenantId, windowKey, rows, mark: getSyncWatermark(queryClient)?.at ?? null, savedAt: Date.now() })
                .then(() => perfTrace.markRepeat("orders:book-saved", { rows: rows.length, ms: Math.round(performance.now() - startedAt) }))
                .catch((err: unknown) => {
                    lastSaved = null;
                    reportBookError(err, "orders-book-write", { rows: rows.length });
                });
        };
        const schedule = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(save, BOOK_SAVE_DEBOUNCE_MS);
        };
        const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
            if (event.query.queryHash === listHash && event.type === "updated") schedule();
        });
        const flush = () => {
            if (timer) {
                clearTimeout(timer);
                save();
            }
        };
        const onHidden = () => {
            if (document.visibilityState === "hidden") flush();
        };
        document.addEventListener("visibilitychange", onHidden);
        // A reload or close: the write is best-effort, the next visit reads the server otherwise.
        window.addEventListener("pagehide", flush);
        return () => {
            // No save here: on a tenant switch or sign-out the cache may
            // already hold rows this user/tenant key must not receive.
            unsubscribe();
            document.removeEventListener("visibilitychange", onHidden);
            window.removeEventListener("pagehide", flush);
            if (timer) clearTimeout(timer);
        };
    }, [queryClient, userId, tenantId]);
}

/**
 * Whether a cache holding `window` is the COMPLETE set matching the merchant's
 * filters, or only a slice of it.
 *
 * A null window means no date filter is active, so the fetch loaded everything.
 * Any other window is by definition a subset — and the actions that mean "act on
 * everything I can see" (ship-with-no-selection, select-all) must refuse rather
 * than silently operate on whichever rows happened to load.
 */
export function ordersCacheIsCompleteSet(window: OrderWindow): boolean {
    return window === null;
}

/** One row per id, first occurrence kept (the list is newest-first). */
export function dedupeById(rows: Order[]): Order[] {
    const seen = new Set<string>();
    let duplicate = false;
    for (const row of rows) {
        if (seen.has(row.id)) { duplicate = true; break; }
        seen.add(row.id);
    }
    if (!duplicate) return rows;
    const kept = new Map<string, Order>();
    for (const row of rows) if (!kept.has(row.id)) kept.set(row.id, row);
    return [...kept.values()];
}

/**
 * Whether a window change must cancel the in-flight list fetch before
 * refetching. React Query cancels a running fetch on refetch only when data
 * already exists; with none it JOINS it, and the first fetch — for the old
 * window — commits under the new filter.
 */
export function shouldCancelBeforeWindowRefetch(state: Pick<QueryState<unknown>, "data" | "fetchStatus"> | undefined): boolean {
    return !!state && state.data === undefined && state.fetchStatus === "fetching";
}

// Fetch the active tenant's orders — auth gating is handled by the `enabled` flag in useOrdersQuery.
async function fetchOrders(
    tenantId: string,
    window: OrderWindow = null,
    onPreview?: (preview: OrderListPreview) => void,
): Promise<Order[]> {
    const _tFetch = performance.now();
    perfTrace.markRepeat('orders:fetch-start');
    diag.log(`[Diag:RQ:Fetch] fetchOrders START`);
    // Pages are read in parallel, so an order inserted mid-fetch can shift a
    // row across a page boundary and arrive twice; it must count once.
    const result = dedupeById(await orderRepository.findWindow(tenantId, window, { onPreview, trace: "list" }));
    perfTrace.mark('orders:fetch-done', { count: result.length });
    diag.log(`[Diag:RQ:Fetch] fetchOrders OK count=${result.length} took=${(performance.now() - _tFetch).toFixed(1)}ms`);

    // Layer 1: Resolve stale "contacted" orders → "no_response" at fetch time.
    // This ensures the React Query cache ALWAYS has correct statuses from the
    // first render — no flicker, no delayed effects, no cron dependency.
    const resolved = perfTrace.time('resolve-stale-contacted', () => resolveStaleContacted(result));

    perfTrace.markRepeat('orders:queryfn-done', { rows: resolved.length, window: windowCacheKey(window) });

    return resolved;
}

/**
 * The active tenant, or a thrown error. Queries that call this are disabled
 * until `useAuth` has a tenant, so it only throws if one runs anyway (a manual
 * refetch before the profile loads) — and then it must fail rather than read
 * every tenant RLS happens to allow.
 */
function requireTenant(tenantId: string | null): string {
    if (!tenantId) throw new Error("No active tenant");
    return tenantId;
}

/**
 * useOrdersQuery - React Query hook for fetching orders with caching
 *
 * FAANG-level optimizations:
 * 1. Saved on the device: a visit restores the window and fetches only what changed
 * 2. Auth-gated: only fetches when session is ready (no throw+retry)
 * 3. Column-pruned fetch via orderRepository.findAll()
 *
 * @param refetchTrigger - Optional trigger to force refetch
 */
export function useOrdersQuery(window: OrderWindow = null, filtersSettled = true, refetchTrigger?: string) {
    const queryClient = coverage(useQueryClient());
    const { session, clientReady, tenantId, user } = useAuth();
    const userId = user?.id ?? null;
    useOrdersBookWriter(queryClient, userId, tenantId);

    // The query key deliberately does NOT include the window. Realtime, every
    // mutation, delta sync and the saved book all read and write
    // `orderKeys.lists()`; keying per window would scatter those across caches.
    // The cache holds one window at a time and a change re-fetches it.
    //
    // Because the key is constant, the window has to reach the fetch some other
    // way, and a captured closure is not good enough. Filter state settles over
    // two renders — the defaults (today) first, then the merchant's persisted
    // filters — so the FIRST fetch would start with today's window, the filters
    // would then widen to "all", and the in-flight request would resolve and
    // populate the cache as fresh. One fetch, for a window nobody asked for.
    //
    // The list then showed today's rows while the server-computed chips
    // correctly reported the real filter: "In Transit 103" above an empty list,
    // righting itself minutes later when something else triggered a refetch.
    //
    // Reading the window from a ref at call time means whichever fetch runs uses
    // the CURRENT window, and refetch (rather than invalidate) guarantees a new
    // one actually runs when the window changes instead of racing the request
    // already in flight.
    const windowRef = useRef(window);
    windowRef.current = window;

    const windowKey = windowCacheKey(window);

    // The window the page shows; coverage compares the loaded window with it.
    useEffect(() => {
        setActiveWindowKey(queryClient, windowKey);
    }, [windowKey, queryClient]);

    const isFirstWindow = useRef(true);
    useEffect(() => {
        if (isFirstWindow.current) {
            // Nothing has been fetched yet; the query's own initial fetch covers it.
            isFirstWindow.current = false;
            return;
        }
        void (async () => {
            // A first load still running for the OLD window would be joined, not
            // replaced, and commit under the new filter. Cancel it first.
            if (shouldCancelBeforeWindowRefetch(queryClient.getQueryState(orderKeys.lists()))) {
                await queryClient.cancelQueries({ queryKey: orderKeys.lists(), exact: true });
            }
            await queryClient.refetchQueries({ queryKey: orderKeys.lists() });
        })();
    }, [windowKey, queryClient]);

    // Force refetch when trigger changes
    useEffect(() => {
        if (refetchTrigger) {
            diag.log(`[Diag:RQ:Query] refetchTrigger=${refetchTrigger}`);
            queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
        }
    }, [refetchTrigger, queryClient]);

    // Nothing is fetched or hydrated until the merchant's saved filter has
    // replaced the default seed. Before this gate the first fetch ran with the
    // seed window, and the refetch for the real window JOINED that in-flight
    // request (React Query only cancels a refetch when data already exists), so
    // the cache was filled with the wrong window and marked fresh: "Confirmed 1"
    // over "No confirmed orders" until a refocus 30s later.
    //
    // Once settled, the list starts from what is already here instead of a
    // full read: the cache from an earlier visit in this tab, else the copy
    // saved on the device (lib/orders/persisted-book.ts). Either is brought
    // current by a delta (catchUpRestoredList); the device copy is also
    // count-checked. Only when neither exists does the query read the window.
    const [snapshotChecked, setSnapshotChecked] = useState(false);
    // Survives StrictMode's effect re-run: a copy restored by the first run is
    // still verified by the second, which finds it already in the cache.
    const restoredUnverified = useRef(false);
    // The catch-up for a list that did not come from a fetch. Started by an
    // effect below once the query is enabled: before that, a re-read it asks
    // for (a count mismatch) would be skipped as a disabled query's.
    const pendingCatchUp = useRef<{ source: string; verify: boolean } | null>(null);
    useEffect(() => {
        if (!filtersSettled || snapshotChecked || !tenantId) return;
        let cancelled = false;
        const window = windowRef.current;
        const key = windowCacheKey(window);
        void (async () => {
            const cachedAlready = queryClient.getQueryData(orderKeys.lists()) !== undefined;
            let restoredRows = 0;
            // The saved book is keyed to the user: without one there is none to read.
            if (!cachedAlready && userId) {
                restoredRows = await restoreOrdersBook(queryClient, { userId, tenantId, windowKey: key });
                if (restoredRows > 0) restoredUnverified.current = true;
            }
            if (cancelled) return;
            // A list kept in memory or restored covers its window; anything
            // else is left to the query's own fetch or the coverage reconciler.
            if ((cachedAlready || restoredRows > 0) && listCovers(getLoadedWindowKey(queryClient), key)) {
                const verify = restoredUnverified.current;
                restoredUnverified.current = false;
                pendingCatchUp.current = { source: verify ? "restore" : "remount", verify };
            }
            perfTrace.markRepeat('orders:snapshot-checked', { cachedAlready, restoredRows });
            setSnapshotChecked(true);
        })();
        return () => { cancelled = true; };
    }, [filtersSettled, snapshotChecked, tenantId, userId, queryClient]);

    // CRITICAL: Wait for Supabase client's internal session to be ready
    // Not just React state - the client must have completed _initialize()
    const enabled = !!session && clientReady && !!tenantId && filtersSettled && snapshotChecked;

    const query = useQuery({
        queryKey: orderKeys.lists(),
        queryFn: () => {
            const t = requireTenant(tenantId);
            perfTrace.markRepeat('orders:queryfn-start', { window: windowCacheKey(windowRef.current) });
            return trackListFetch(queryClient, windowCacheKey(windowRef.current), () => perfTrace.span('list:watermark', () => readListMark(t)), () => {
                const fetchWindow = windowRef.current;
                const fetchKey = windowCacheKey(fetchWindow);
                return fetchOrders(t, fetchWindow, (preview) => publishListPreview(queryClient, t, fetchKey, preview));
            });
        },
        enabled,
        // Realtime, the reopen / reconnect / heartbeat deltas and the
        // remount catch-up above keep the list current. None of React
        // Query's automatic refetches may re-read the whole window: a focus
        // after 30s, a return to the page and a network reconnect each did,
        // on top of the delta that already covers them.
        staleTime: 30 * 1000,
        gcTime: CACHE_PRESETS.FREQUENT.gcTime, // 10 mins
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
        // Lighter retry since we no longer throw for missing auth
        retry: 2,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8000),
    });

    useEffect(() => {
        if (!enabled || !tenantId || !pendingCatchUp.current) return;
        const pending = pendingCatchUp.current;
        pendingCatchUp.current = null;
        void catchUpRestoredList(queryClient, tenantId, windowRef.current, pending);
    }, [enabled, tenantId, queryClient]);

    // Coverage reconciler. Whenever the query is idle and enabled, no list
    // mutation is pending, and the loaded window does not cover the one on
    // screen, fetch it. That ends every uncovered state: a window-change fetch
    // a mutation cancelled, a first load cancelled before it committed, a
    // snapshot of a different window. It cannot loop: a started fetch is not
    // idle, a commit covers the window, and a failed fetch for THIS window sets
    // `failedKey`, which leaves the query's own error and retry UI in charge.
    const loadedKey = useLoadedOrdersWindowKey();
    const failedKey = useFailedOrdersWindowKey();
    const listMutations = useIsMutating({ mutationKey: ORDERS_LIST_MUTATION_KEY });
    const fetchStatus = query.fetchStatus;
    useEffect(() => {
        if (!enabled || fetchStatus !== "idle" || listMutations > 0) return;
        if (listCovers(loadedKey, windowKey)) return;
        if (failedKey === windowKey) return;
        diag.log(`[Diag:RQ:Coverage] reconcile loaded=${loadedKey} active=${windowKey} — refetching`);
        void queryClient.refetchQueries({ queryKey: orderKeys.lists(), exact: true }, { cancelRefetch: false });
    }, [enabled, fetchStatus, listMutations, loadedKey, failedKey, windowKey, queryClient]);

    return query;
}

/**
 * useArchivedOrdersQuery - React Query hook for archived orders
 */
export function useArchivedOrdersQuery(enabled: boolean = true) {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: orderKeys.archived(),
        queryFn: () => orderRepository.findArchived(requireTenant(tenantId)),
        enabled: enabled && !!tenantId,
        // Archived orders don't need real-time freshness
        staleTime: CACHE_PRESETS.STATIC.staleTime * 2, // 1 hour
        gcTime: CACHE_PRESETS.STATIC.gcTime * 2,
        // Network Optimization: Exponential backoff for 3G drops
        retry: 3,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    });
}

/**
 * useUpdateOrderMutation - Optimistic update for order changes
 */
export function useUpdateOrderMutation() {
    const queryClient = coverage(useQueryClient());
    const { tenantId } = useAuth();

    return useMutation({
        mutationKey: [...ORDERS_LIST_MUTATION_KEY, "update"],
        mutationFn: async ({ orderId, updates, expectedVersion }: { orderId: string; updates: Partial<Order>; expectedVersion?: number }) => {
            const data = await orderRepository.update(orderId, updates, expectedVersion);
            return { orderId, updates, data };
        },
        // Optimistic update - update cache immediately
        onMutate: async ({ orderId, updates }) => {
            diag.log(`[Diag:RQ:UpdateMut] onMutate orderId=${orderId} fields=${Object.keys(updates).join(',')}`);
            getOrderBatcher()?.markMutated(orderId);
            await cancelListFetches(queryClient, tenantId);

            // Snapshot current data to revert if the request fails
            const previousOrders = queryClient.getQueryData<Order[]>(orderKeys.lists());

            // Optimistically update cache 
            queryClient.setQueryData<Order[]>(orderKeys.lists(), (old) => {
                const updated = old?.map((order) =>
                    order.id === orderId
                        ? { ...order, ...updates } as Order
                        : order
                );
                return updated;
            });

            return { previousOrders };
        },
        onSuccess: ({ orderId, data }) => {
            diag.log(`[Diag:RQ:UpdateMut] onSuccess orderId=${orderId}`);
            // Overwrite optimistic cache with actual server data to ensure consistency
            queryClient.setQueryData<Order[]>(orderKeys.lists(), (old) => {
                const updated = old?.map((order) =>
                    order.id === orderId ? { ...order, ...data } : order
                );
                return updated;
            });
        },
        onError: (err, variables, context) => {
            diag.log(`[Diag:RQ:UpdateMut] onError orderId=${variables.orderId} err=${err instanceof Error ? err.message : err} rollingBack=${!!context?.previousOrders}`);
            reportOrderError(err, {
                operation: "updateOrder",
                orderId: variables.orderId,
                extra: { fields: Object.keys(variables.updates ?? {}) },
            });

            if (context?.previousOrders) {
                queryClient.setQueryData(orderKeys.lists(), context.previousOrders);
            }

            // The caller tells staff what happened (orderWriteErrorMessage), so
            // a failure is one message in their language, not two.
            if (err instanceof Error && err.message === "CONFLICT_DETECTED") {
                // Force a fresh refetch immediately to get the latest state
                queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
            }
        },
    });
}

export interface UpdateStatusMutationOptions {
    /**
     * Who brings the list caches up to date after a successful write.
     * - "mutation" (default): onSuccess runs `catchUpAfterOwnWrite` from the
     *   PATCH's `updated_at` — one delta (our row, peer writes realtime missed,
     *   fresh risk) and a refresh of the active search / duplicate-margin keys.
     *   Every plain caller (the chat status dropdown and /status) gets this.
     * - "caller": the caller writes again after the PATCH and must catch up
     *   once that lands. useOrderCrud inserts the history row, whose trigger
     *   writes the order a second time (base+2); a catch-up here would run
     *   before it and the caller's would follow — two deltas for one change.
     */
    catchUp?: "mutation" | "caller";
}

/**
 * useUpdateStatusMutation - Optimistic status change
 */
export function useUpdateStatusMutation({ catchUp = "mutation" }: UpdateStatusMutationOptions = {}) {
    const queryClient = coverage(useQueryClient());
    const { tenantId } = useAuth();

    return useMutation({
        mutationKey: [...ORDERS_LIST_MUTATION_KEY, "status"],
        mutationFn: async ({
            orderId,
            status,
            rejectionReason,
            rejectionReasonId,
            last_status_changed_by_name,
            last_status_changed_by_avatar,
            expectedVersion,
        }: {
            orderId: string;
            status: Order["status"];
            rejectionReason?: string;
            rejectionReasonId?: string;
            last_status_changed_by_name?: string;
            last_status_changed_by_avatar?: string;
            expectedVersion?: number;
        }) => {
            const data = await orderRepository.updateStatus(
                orderId,
                status,
                rejectionReason,
                last_status_changed_by_name,
                last_status_changed_by_avatar,
                expectedVersion,
                rejectionReasonId
            );
            return { orderId, status, data };
        },
        onMutate: async ({ orderId, status, rejectionReason, last_status_changed_by_name, last_status_changed_by_avatar }) => {
            const mutSeq = nextMutationSeq(orderId);
            diag.log(`[Diag:RQ:StatusMut] onMutate orderId=${orderId} status=${status} mutSeq=${mutSeq}`);

            // Only this row is snapshotted: a whole-array rollback would also
            // undo every realtime update other rows received meanwhile.
            const previousRow = queryClient.getQueryData<Order[]>(orderKeys.lists())?.find((o) => o.id === orderId);

            // Guard the row against our own write's echo (versions up to base+1);
            // the history trigger's base+2 write and later peer writes apply.
            getOrderBatcher()?.markMutated(orderId, previousRow?.version);
            await cancelListFetches(queryClient, tenantId);

            // Optimistic update
            queryClient.setQueryData<Order[]>(orderKeys.lists(), (old) => {
                const updated = old?.map((order) =>
                    order.id === orderId
                        ? ({
                            ...order,
                            status,
                            rejection_reason: rejectionReason
                                ? rejectionReason
                                : (status === "cancelled" || status === "rejected")
                                    ? order.rejection_reason
                                    : undefined,
                            delivered_at: status === "delivered" ? new Date().toISOString() : order.delivered_at,
                            // Deliberately NOT stamping `updated_at` here: a
                            // client-clock value would be compared against real
                            // server timestamps by the realtime dedup and could
                            // suppress genuine incoming events. onSuccess writes
                            // the authoritative server row moments later.
                            last_status_changed_by_name,
                            last_status_changed_by_avatar,
                        } as Order)
                        : order
                );
                return updated;
            });

            return { previousRow, mutSeq };
        },
        onSuccess: ({ orderId, data }, variables, context) => {
            // This write landed, superseded or not: catch the caches up with it.
            // The delta merges through the batcher, whose guard keeps a newer
            // in-flight optimistic row. Not awaited — mutate() resolves on the
            // PATCH, and the catch-up never rejects.
            if (catchUp === "mutation") {
                void catchUpAfterOwnWrite(queryClient, tenantId, { source: "statusMutation", since: data.updated_at });
            }

            // LATEST-WINS: If a newer mutation has started for this order,
            // don't overwrite the cache — the newer mutation's optimistic state is correct.
            if (context?.mutSeq != null && !isMutationCurrent(orderId, context.mutSeq)) {
                diag.log(`[Diag:RQ:StatusMut] onSuccess SKIPPED (superseded) orderId=${orderId} mutSeq=${context.mutSeq}`);
                return;
            }
            diag.log(`[Diag:RQ:StatusMut] onSuccess orderId=${orderId} mutSeq=${context?.mutSeq}`);

            // The PATCH response, into every list-prefixed cache (main list,
            // search, duplicate margin) — version-checked, and only the keys
            // each cached row already has: the response is `select()` (every
            // column), and the margin columns must never enter a list cache.
            queryClient.setQueriesData<Order[]>({ queryKey: orderKeys.lists() }, (old) => patchRow(old, data));
        },
        onError: (err, variables, context) => {
            diag.log(`[Diag:RQ:StatusMut] onError orderId=${variables.orderId} err=${err instanceof Error ? err.message : err} mutSeq=${context?.mutSeq} reverting=${!!context?.previousRow}`);
            // LATEST-WINS: If a newer mutation has started for this order,
            // don't rollback — the newer mutation's optimistic state is correct.
            if (context?.mutSeq != null && !isMutationCurrent(variables.orderId, context.mutSeq)) return;

            reportOrderError(err, { operation: "updateOrderStatus", orderId: variables.orderId, extra: { status: variables.status } });

            // Revert only the fields the optimistic write set, and only while
            // the row is still at the version that write was based on.
            if (context?.previousRow) {
                const previousRow = context.previousRow;
                queryClient.setQueryData<Order[]>(orderKeys.lists(), (old) => revertOptimisticStatus(old, previousRow));
            }

            const conflict = err instanceof Error && err.message === "CONFLICT_DETECTED";
            // A non-conflict failure means the event the guard skipped was not
            // our echo: re-apply it. A conflict is superseded by the refetch.
            getOrderBatcher()?.releaseGuard(variables.orderId, { replay: !conflict });

            // The caller tells staff what happened (orderWriteErrorMessage).
            if (conflict) {
                // Force a fresh refetch immediately
                queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
            }
        },
        // No onSettled refetch: it re-downloaded the whole window 2s after
        // every status change. A successful write is caught up by one delta —
        // in onSuccess above, or by a `catchUp: "caller"` caller
        // (useOrderCrud.updateOrderStatus, after its history row lands).
    });
}

/** The fields the optimistic status write sets — and so the only ones a failed write reverts. */
const OPTIMISTIC_STATUS_FIELDS = [
    "status", "rejection_reason", "delivered_at", "last_status_changed_by_name", "last_status_changed_by_avatar",
] as const satisfies readonly (keyof Order)[];

/** Revert the optimistic fields of `previous.id`, if the cached row is still at `previous.version`. */
export function revertOptimisticStatus(rows: Order[] | undefined, previous: Order): Order[] | undefined {
    if (!rows) return rows;
    let changed = false;
    const next = rows.map((o) => {
        if (o.id !== previous.id || o.version !== previous.version) return o;
        changed = true;
        const reverted: Order = { ...o };
        for (const key of OPTIMISTIC_STATUS_FIELDS) {
            Object.assign(reverted, { [key]: previous[key] });
        }
        return reverted;
    });
    return changed ? next : rows;
}

/**
 * Write a server row into a cached list: skipped when the cache already holds
 * a newer version, and limited to the keys the cached row already has (so a
 * `select()` response cannot add the margin columns to a list cache). Returns
 * `rows` unchanged when nothing differs.
 */
export function patchRow(rows: Order[] | undefined, data: Order): Order[] | undefined {
    if (!Array.isArray(rows)) return rows;
    let changed = false;
    const next = rows.map((o) => {
        if (o.id !== data.id) return o;
        if (typeof o.version === "number" && typeof data.version === "number" && data.version < o.version) return o;
        const source = data as unknown as Record<string, unknown>;
        const current = o as unknown as Record<string, unknown>;
        let patched: Record<string, unknown> | null = null;
        for (const key of Object.keys(current)) {
            if (key in source && source[key] !== current[key]) {
                patched ??= { ...current };
                patched[key] = source[key];
            }
        }
        if (!patched) return o;
        changed = true;
        return patched as unknown as Order;
    });
    return changed ? next : rows;
}

function riskDataEqual(a: Order["risk_data"], b: Order["risk_data"]): boolean {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * `risk_data` is a pure function of (tenant, normalized phone): a status change
 * moves the customer's trust row in the same transaction, so every cached
 * order with that phone has new risk. Delta rows carry fresh `risk_data`
 * (withRiskData); copy it onto same-customer rows in the main list. No request.
 */
export function propagateRiskData(queryClient: QueryClient, changed: readonly Order[]): void {
    const fresh = new Map<string, Order["risk_data"]>();
    for (const row of changed) {
        if (row.risk_data === undefined || !row.tenant_id) continue;
        const phone = normalizePhoneLikeDb(row.phone);
        if (phone) fresh.set(`${row.tenant_id}|${phone}`, row.risk_data);
    }
    if (fresh.size === 0) return;
    queryClient.setQueryData<Order[]>(orderKeys.lists(), (old) => {
        if (!old) return old;
        let changedAny = false;
        const next = old.map((o) => {
            if (!o.tenant_id) return o;
            const risk = fresh.get(`${o.tenant_id}|${normalizePhoneLikeDb(o.phone)}`);
            if (risk === undefined || riskDataEqual(o.risk_data, risk)) return o;
            changedAny = true;
            return { ...o, risk_data: risk };
        });
        return changedAny ? next : old;
    });
}

/**
 * After our own write has fully landed (for a status change: the PATCH and the
 * history row whose trigger writes the row again), bring every list cache up
 * to date with one catch-up delta. It carries our row at its final version,
 * any peer writes since the watermark and fresh risk, and is merged into the
 * main list and every cached duplicate margin (`syncOrdersDelta`). Search
 * results span every date, status and the trash, so no window decides what a
 * delta row adds there: the search is marked stale, which refetches it only
 * while a search is on screen.
 *
 * Resolves when the delta has been applied — the next change to the same
 * order waits on this (use-order-crud.ts `catchUpRef`) for its base version,
 * and must not also wait on the search refetch. Never rejects.
 */
export async function catchUpAfterOwnWrite(
    queryClient: QueryClient,
    tenantId: string | null,
    { source, since }: { source: string; since?: string },
): Promise<void> {
    if (!tenantId) return;
    await requestOrdersCatchUp(queryClient, tenantId, { source, since });
    void queryClient
        .invalidateQueries({ queryKey: orderSearchKeys.all })
        .catch((err: unknown) => { diag.error("[Diag:RQ:CatchUp] search refresh failed", err); });
}

/**
 * useDeleteOrderMutation - Optimistic delete
 */
export function useDeleteOrderMutation() {
    const queryClient = coverage(useQueryClient());
    const { tenantId } = useAuth();

    return useMutation({
        mutationKey: [...ORDERS_LIST_MUTATION_KEY, "delete"],
        mutationFn: async (orderId: string) => {
            await orderRepository.update(orderId, { deleted_at: new Date().toISOString() });
            return orderId;
        },
        onMutate: async (orderId) => {
            await cancelListFetches(queryClient, tenantId);

            const previousOrders = queryClient.getQueryData<Order[]>(orderKeys.lists());

            // Optimistic update
            queryClient.setQueryData<Order[]>(orderKeys.lists(), (old) => {
                const updated = old?.filter((order) => order.id !== orderId) || [];
                return updated;
            });

            return { previousOrders };
        },
        onError: (err, variables, context) => {
            reportOrderError(err, { operation: "deleteOrder", orderId: variables });
            if (context?.previousOrders) {
                queryClient.setQueryData(orderKeys.lists(), context.previousOrders);
            }
            toast.error(err instanceof Error ? err.message : "Failed to delete order");
        },
    });
}

/**
 * useCreateOrderMutation - Optimistic create
 */
export function useCreateOrderMutation() {
    const queryClient = coverage(useQueryClient());
    // The server action derives the tenant from this token — the client no
    // longer tells the server which tenant to write into.
    const { session, tenantId } = useAuth();

    return useMutation({
        mutationKey: [...ORDERS_LIST_MUTATION_KEY, "create"],
        mutationFn: async (orderData: CreateOrderInput) => {
            const result = await createOrderAction(orderData, session?.access_token ?? "");
            if (!result.success || !result.data) {
                console.error("[createOrderMutation] Server action failed:", result.error);
                throw new Error(result.error || "Failed to create order");
            }
            return result.data;
        },
        onMutate: async (newOrder) => {
            await cancelListFetches(queryClient, tenantId);

            const previousOrders = queryClient.getQueryData<Order[]>(orderKeys.lists());

            // Create a temporary optimistic order
            const tempId = `temp-${Date.now()}`;
            const optimisticOrder = {
                ...newOrder,
                id: tempId,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                // Fill other required fields with defaults if missing
                status: newOrder.status || "new",
                is_archived: false,
                payment_status: newOrder.payment_status || "cod",
            } as Order;

            // Optimistic update - add to top
            queryClient.setQueryData<Order[]>(orderKeys.lists(), (old) =>
                [optimisticOrder, ...(old || [])]
            );

            return { previousOrders, tempId };
        },
        onSuccess: (realOrder, _variables, context) => {
            // Replace the temporary optimistic order with the real server data
            if (context?.tempId) {
                queryClient.setQueryData<Order[]>(orderKeys.lists(), (old) =>
                    (old || []).map(o => o.id === context.tempId ? realOrder : o)
                );
            }
        },
        onError: (err, _variables, context) => {
            reportOrderError(err, { operation: "createOrder" });
            if (context?.previousOrders) {
                queryClient.setQueryData(orderKeys.lists(), context.previousOrders);
            }
            toast.error(err instanceof Error ? err.message : "Failed to create order");
        },
    });
}
