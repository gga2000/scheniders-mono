"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
    hashKey,
    notifyManager,
    partialMatchKey,
    useQueryClient,
    type QueryClient,
    type QueryKey,
} from "@tanstack/react-query";
import { diag } from "@/lib/diag";
import { listCovers } from "@/lib/orders/coverage-key";

// =============================================
// ORDERS LIST COVERAGE + SYNC WATERMARK
//
// The list cache (`orderKeys.lists()`) holds ONE window at a time and its key
// never changes, so the cache cannot say which window its rows are for. This
// store records it, per QueryClient:
//
//   loadedKey     the window of the last list fetch that COMMITTED (a non-manual
//                 `success` dispatch). Optimistic writes, realtime and deltas
//                 are `setQueryData` (manual) and never move it. A cancelled or
//                 superseded fetch never dispatches success, so it never claims
//                 a window it did not deliver.
//   activeKey     the window the page is showing.
//   failedKey     the window whose last tracked fetch rejected with an error.
//   syncedThrough the server `updated_at` the cache is known complete up to.
//                 Set from the tenant-wide high-water mark read BEFORE each list
//                 fetch (never from the fetched rows: a window's own newest row
//                 says when that window was last edited, not what the cache has
//                 seen, and `resolveStaleContacted` stamps rewritten rows with
//                 the client clock). Raised by every complete delta.
//
// The cache "covers" the active window when `listCovers(loadedKey, activeKey)`.
// Counts are shown only then (lib/orders/count-visibility.ts).
//
// It also holds the list fetches a list mutation cancelled, and flushes them
// once no list mutation is pending (see `cancelListFetches`).
// =============================================

/** Mutation-key prefix of the four list mutations in use-orders-query. */
export const ORDERS_LIST_MUTATION_KEY = ["orders", "list-mutation"] as const;

export interface SyncWatermark {
    /** Server `updated_at` (ISO) the cache is complete up to. */
    at: string;
    /**
     * True while the mark comes from a fetch-start read: the next delta must
     * reach back by the full overlap (a transaction stamped before the mark can
     * commit after the fetch). False once a delta has run from it.
     */
    fromFetch: boolean;
}

interface InFlightFetch {
    token: number;
    key: string;
    /** The fetch-start high-water mark, once read. */
    mark: string | null;
}

interface CoverageOptions {
    listKey: QueryKey;
    /** Catch up the main list after a mutation cancelled its same-window refresh. */
    onMainKeyFlush: (tenantId: string | null) => void;
}

interface Store {
    listKey: QueryKey;
    listHash: string;
    onMainKeyFlush: (tenantId: string | null) => void;
    activeKey: string | null;
    loadedKey: string | null;
    failedKey: string | null;
    syncedThrough: SyncWatermark | null;
    /** Bumped on every committed fetch; a delta that spans one does not move the watermark. */
    commitGen: number;
    tokenSeq: number;
    inFlight: InFlightFetch | null;
    /** Keys (by hash) of list-prefixed queries a list mutation cancelled mid-fetch. */
    cancelled: Map<string, QueryKey>;
    flushTenant: string | null;
    listeners: Set<() => void>;
}

const stores = new WeakMap<QueryClient, Store>();
/** Kept apart from the store so a component can subscribe before `ensureCoverage` has run. */
const listenerSets = new WeakMap<QueryClient, Set<() => void>>();

function listenersFor(qc: QueryClient): Set<() => void> {
    let set = listenerSets.get(qc);
    if (!set) {
        set = new Set();
        listenerSets.set(qc, set);
    }
    return set;
}

function emit(store: Store): void {
    // Through React Query's scheduler, so a coverage change and the rows change
    // of the same commit reach React in one flush: no render sees the new key
    // with the old rows, or the reverse.
    for (const listener of store.listeners) notifyManager.schedule(listener);
}

/** "all" loaded while a narrower window is active holds that window only (the batcher prunes to it). */
function normalize(store: Store, key: string | null): string | null {
    return key === "all" && store.activeKey !== null && store.activeKey !== "all" ? store.activeKey : key;
}

function maxIso(a: string | null, b: string | null): string | null {
    if (!a) return b;
    if (!b) return a;
    return Date.parse(a) >= Date.parse(b) ? a : b;
}

/** Create (once) the store for `qc` and subscribe it to the query and mutation caches. Idempotent. */
export function ensureCoverage(qc: QueryClient, options: CoverageOptions): void {
    if (stores.has(qc)) return;
    const store: Store = {
        listKey: options.listKey,
        listHash: hashKey(options.listKey),
        onMainKeyFlush: options.onMainKeyFlush,
        activeKey: null,
        loadedKey: null,
        failedKey: null,
        syncedThrough: null,
        commitGen: 0,
        tokenSeq: 0,
        inFlight: null,
        cancelled: new Map(),
        flushTenant: null,
        listeners: listenersFor(qc),
    };
    stores.set(qc, store);

    qc.getQueryCache().subscribe((event) => {
        if (event.query.queryHash !== store.listHash) return;
        if (event.type === "removed") {
            // Sign-out / cache clear: nothing is covered or synced any more.
            store.loadedKey = null;
            store.failedKey = null;
            store.syncedThrough = null;
            store.inFlight = null;
            store.commitGen++;
            emit(store);
            return;
        }
        if (event.type !== "updated" || event.action.type !== "success" || event.action.manual) return;

        // A fetch committed. Only tracked fetches run against this key, so the
        // in-flight record is that fetch's.
        const fetched = store.inFlight;
        store.inFlight = null;
        store.commitGen++;
        if (!fetched) {
            diag.warn("[Diag:RQ:Coverage] untracked commit on the orders list — treating it as uncovered");
            store.loadedKey = null;
        } else {
            store.loadedKey = normalize(store, fetched.key);
            if (fetched.mark) {
                store.syncedThrough = { at: maxIso(store.syncedThrough?.at ?? null, fetched.mark) ?? fetched.mark, fromFetch: true };
            }
        }
        emit(store);
    });

    qc.getMutationCache().subscribe((event) => {
        if (event.type !== "updated") return;
        const action = event.action;
        if (action.type !== "success" && action.type !== "error") return;
        const key = event.mutation.options.mutationKey;
        if (!key || !partialMatchKey(key, ORDERS_LIST_MUTATION_KEY)) return;
        // The mutation's state is updated before this notification, so a
        // settled mutation no longer counts: two that settle in the same tick
        // flush exactly once, on the second.
        if (qc.isMutating({ mutationKey: ORDERS_LIST_MUTATION_KEY }) > 0) return;
        flushCancelled(qc, store);
    });
}

function storeFor(qc: QueryClient): Store {
    const store = stores.get(qc);
    if (!store) throw new Error("orders list coverage used before ensureCoverage");
    return store;
}

/**
 * Run one list fetch for `windowKey`, recording it so its commit can claim the
 * window. Reads the tenant-wide high-water mark first (`readMark`); the
 * watermark is taken from that, never from the rows. `readMark` reports its
 * own errors and resolves null when the mark is unavailable — the fetch still
 * runs, and the previous watermark (an older, so safe, lower bound) is kept.
 */
export async function trackListFetch<T>(
    qc: QueryClient,
    windowKey: string,
    readMark: () => Promise<string | null>,
    /** Receives the mark, so a snapshot of the rows can store what they are complete up to. */
    run: (mark: string | null) => Promise<T>,
): Promise<T> {
    const store = storeFor(qc);
    const token = ++store.tokenSeq;
    store.inFlight = { token, key: windowKey, mark: null };
    if (store.failedKey !== null) {
        store.failedKey = null;
        emit(store);
    }

    const mark = await readMark();
    if (store.inFlight?.token === token) store.inFlight.mark = mark;

    try {
        return await run(mark);
    } catch (err) {
        // `fetchOrders` ignores the abort signal, so a cancelled fetch resolves
        // and is discarded by React Query; a rejection here is a real error.
        if (store.inFlight?.token === token) {
            store.failedKey = windowKey;
            emit(store);
        }
        throw err;
    }
}

/** A sessionStorage snapshot of `windowKey` was hydrated into the cache. */
export function markListLoaded(qc: QueryClient, windowKey: string, mark: string | null): void {
    const store = storeFor(qc);
    store.loadedKey = normalize(store, windowKey);
    if (mark) store.syncedThrough = { at: maxIso(store.syncedThrough?.at ?? null, mark) ?? mark, fromFetch: true };
    emit(store);
}

/** The window the page shows. A loaded "all" then only counts as covering it. */
export function setActiveWindowKey(qc: QueryClient, windowKey: string): void {
    const store = storeFor(qc);
    const loaded = normalize({ ...store, activeKey: windowKey }, store.loadedKey);
    if (store.activeKey === windowKey && loaded === store.loadedKey) return;
    store.activeKey = windowKey;
    store.loadedKey = loaded;
    emit(store);
}

export function getSyncWatermark(qc: QueryClient): SyncWatermark | null {
    return stores.get(qc)?.syncedThrough ?? null;
}

/** Opaque token: pass back to `advanceSyncWatermark` so a delta that spans a commit cannot move the mark. */
export function getCommitGeneration(qc: QueryClient): number {
    return stores.get(qc)?.commitGen ?? 0;
}

/**
 * A complete delta read every row changed since its `since`: the cache is now
 * complete up to the newest `updated_at` it returned, and the fetch overlap has
 * been applied. A no-op when a fetch committed while the delta ran (that
 * commit's mark is the authority, and its overlap must still be applied).
 */
export function advanceSyncWatermark(qc: QueryClient, rows: readonly { updated_at?: string | null }[], commitGen: number): void {
    const store = stores.get(qc);
    if (!store || store.commitGen !== commitGen || !store.syncedThrough) return;
    let at: string | null = store.syncedThrough.at;
    for (const row of rows) at = maxIso(at, row.updated_at ?? null);
    store.syncedThrough = { at: at ?? store.syncedThrough.at, fromFetch: false };
}

export function getLoadedWindowKey(qc: QueryClient): string | null {
    return stores.get(qc)?.loadedKey ?? null;
}

/** Whether the cache covers the window the page shows. */
export function cacheCoversActiveWindow(qc: QueryClient): boolean {
    const store = stores.get(qc);
    return !!store && store.activeKey !== null && listCovers(store.loadedKey, store.activeKey);
}

/**
 * Cancel every in-flight list-prefixed fetch (the main list, server search,
 * duplicate margin) before an optimistic write, remembering which were
 * running. They are re-run once no list mutation is pending: the main list by
 * a catch-up delta when it covers the window (the reconciler refetches it when
 * it does not), every other key by an exact refetch. A cancel used to drop the
 * refresh silently.
 */
export async function cancelListFetches(qc: QueryClient, tenantId: string | null): Promise<void> {
    const store = storeFor(qc);
    store.flushTenant = tenantId;
    for (const query of qc.getQueryCache().findAll({ queryKey: store.listKey, fetchStatus: "fetching" })) {
        store.cancelled.set(query.queryHash, query.queryKey);
    }
    await qc.cancelQueries({ queryKey: store.listKey });
}

function flushCancelled(qc: QueryClient, store: Store): void {
    if (store.cancelled.size === 0) return;
    const keys = [...store.cancelled.entries()];
    store.cancelled.clear();
    for (const [hash, key] of keys) {
        if (hash === store.listHash) {
            if (store.activeKey !== null && listCovers(store.loadedKey, store.activeKey)) {
                diag.log("[Diag:RQ:Coverage] flush — main list refresh was cancelled; catching up by delta");
                store.onMainKeyFlush(store.flushTenant);
            }
            // Uncovered: the reconciler in useOrdersQuery refetches it.
        } else {
            void qc.refetchQueries({ queryKey: key, exact: true }, { cancelRefetch: false });
        }
    }
}

function useCoverageValue(pick: (store: Store) => string | null): string | null {
    const qc = useQueryClient();
    const subscribe = useCallback((listener: () => void) => {
        const listeners = listenersFor(qc);
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    }, [qc]);
    const getSnapshot = () => {
        const store = stores.get(qc);
        return store ? pick(store) : null;
    };
    // Server snapshot null: during SSR and hydration nothing is covered.
    return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

/** The window the list cache was last loaded for, or null (nothing committed). */
export function useLoadedOrdersWindowKey(): string | null {
    return useCoverageValue((s) => s.loadedKey);
}

/** The window whose last list fetch failed, or null. */
export function useFailedOrdersWindowKey(): string | null {
    return useCoverageValue((s) => s.failedKey);
}
