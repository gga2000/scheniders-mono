import { QueryClient } from "@tanstack/react-query";
import type { Order } from "@/lib/supabase";
import { diag } from "@/lib/diag";
import { belongsInWindow, type OrderWindow } from "@/lib/order-window";


// =============================================
// REALTIME EVENT BATCHER
// Buffers incoming Supabase realtime events and
// applies them as a single React Query cache
// update. Prevents 50 rapid events from causing
// 50 separate re-renders.
// =============================================

type RealtimeEvent = {
    eventType: "INSERT" | "UPDATE" | "DELETE";
    new?: Record<string, unknown>;
    old?: Record<string, unknown>;
};

interface RealtimeBatcherOptions {
    queryClient: QueryClient;
    queryKey: readonly unknown[];
    normalizer?: (raw: unknown) => unknown;
    flushDelayMs?: number; // Default: 200ms
    onNewOrder?: (order: Order) => void;
    /**
     * The window the cache currently holds, or null while it holds every
     * non-archived order. Rows outside it must never be prepended — see
     * lib/order-window.ts.
     */
    getWindow?: () => OrderWindow;
}

/**
 * Decide whether an incoming realtime row should replace what's in cache.
 *
 * Prefers `version` — a server-assigned counter bumped by a BEFORE UPDATE
 * trigger on every write, which a client cannot fabricate. Falls back to
 * `updated_at` only when a version is unavailable on either side (e.g. a row
 * cached before `version` was added to the list columns).
 *
 * Historically this compared `updated_at` first, but platform writes never
 * moved that column, so every peer edit arrived with an equal timestamp and was
 * discarded — realtime looked alive while silently delivering nothing (CON-2).
 */
export function shouldApplyRealtimeUpdate(
    cached: { version?: unknown; updated_at?: unknown },
    incoming: { version?: unknown; updated_at?: unknown },
): boolean {
    const cachedVersion = cached.version;
    const incomingVersion = incoming.version;
    if (typeof cachedVersion === "number" && typeof incomingVersion === "number") {
        // Strictly newer wins; equal means we already have this revision.
        return incomingVersion > cachedVersion;
    }

    const cachedAt = cached.updated_at;
    const incomingAt = incoming.updated_at;
    if (typeof cachedAt === "string" && typeof incomingAt === "string") {
        return incomingAt > cachedAt;
    }

    // Not enough information to prove the event is stale — apply it.
    return true;
}

export class RealtimeBatcher {
    private buffer: RealtimeEvent[] = [];
    private flushTimer: ReturnType<typeof setTimeout> | null = null;
    private queryClient: QueryClient;
    private queryKey: readonly unknown[];
    private normalizer: (raw: unknown) => unknown;
    private flushDelayMs: number;
    private onNewOrder?: (order: Order) => void;
    private getWindow?: () => OrderWindow;

    // Mutation guard: track recently-mutated order IDs to prevent
    // stale realtime broadcasts from overwriting optimistic updates
    private recentMutations = new Map<string, { at: number; baseVersion?: number }>();
    // The latest event the guard skipped, per guarded id, so a write that then
    // FAILS can re-apply it (it may have been a peer's, not our echo).
    private heldEvents = new Map<string, { event: RealtimeEvent } | { row: Order }>();
    private static readonly MUTATION_GUARD_MS = 3_000; // 3 seconds

    constructor(options: RealtimeBatcherOptions) {
        this.queryClient = options.queryClient;
        this.queryKey = options.queryKey;
        this.normalizer = options.normalizer ?? ((x: unknown) => x);
        this.flushDelayMs = options.flushDelayMs ?? 200;
        this.onNewOrder = options.onNewOrder;
        this.getWindow = options.getWindow;
    }

    /**
     * Mark an order as recently mutated. Realtime updates for this order
     * will be skipped for MUTATION_GUARD_MS to prevent stale broadcasts
     * from overwriting optimistic UI.
     *
     * With `baseVersion` (the cached version our write was based on) the guard
     * skips only what can be our own write's echo: versions up to base+1. A
     * status change writes the row twice — the PATCH (base+1), then the
     * history trigger's actor update (base+2) — and that second write, like
     * any later peer write, is newer than our optimistic state and applies.
     */
    markMutated(orderId: string, baseVersion?: number): void {
        this.recentMutations.set(orderId, { at: Date.now(), baseVersion });
        this.heldEvents.delete(orderId);
    }

    /**
     * End the guard for `orderId` early. With `replay`, re-apply the latest
     * event it skipped: our write failed, so that event was not its echo.
     */
    releaseGuard(orderId: string, { replay }: { replay: boolean }): void {
        const held = this.heldEvents.get(orderId);
        this.recentMutations.delete(orderId);
        this.heldEvents.delete(orderId);
        if (!replay || !held) return;
        diag.log(`[Diag:Batcher] RELEASE_REPLAY id=${orderId}`);
        if ("event" in held) this.push(held.event);
        else this.applyChangedOrders([held.row]);
    }

    /** Whether an incoming row for `id` is (possibly) the echo of our own guarded write. */
    private isGuardedEcho(id: string, incomingVersion: unknown): boolean {
        const guard = this.recentMutations.get(id);
        if (!guard) return false;
        if (Date.now() - guard.at > RealtimeBatcher.MUTATION_GUARD_MS) {
            this.recentMutations.delete(id);
            this.heldEvents.delete(id);
            return false;
        }
        if (typeof guard.baseVersion !== "number" || typeof incomingVersion !== "number") return true;
        return incomingVersion <= guard.baseVersion + 1;
    }

    /**
     * Add an event to the buffer. The buffer will be flushed
     * after `flushDelayMs` of inactivity (debounce).
     */
    push(event: RealtimeEvent): void {
        const id = (event.new as Record<string, unknown>)?.id || (event.old as Record<string, unknown>)?.id || 'unknown';

        // MUTATION GUARD check at push time (early skip). A soft delete is never
        // an echo of a status write: it always goes through.
        if (
            event.eventType === "UPDATE" && typeof id === 'string' &&
            event.new?.deleted_at == null &&
            this.isGuardedEcho(id, event.new?.version)
        ) {
            diag.log(`[Diag:Batcher] PUSH_SKIPPED id=${id} reason=mutationGuard`);
            this.heldEvents.set(id, { event });
            return; // Actually skip — don't push stale realtime data into the buffer
        }

        diag.log(`[Diag:Batcher] PUSH type=${event.eventType} id=${id} bufferSize=${this.buffer.length + 1}`);
        this.buffer.push(event);

        // Reset the flush timer (debounce)
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
        }

        this.flushTimer = setTimeout(() => this.flush(), this.flushDelayMs);
    }

    /**
     * Immediately flush all buffered events into a single cache update.
     */
    flush(): void {
        if (this.buffer.length === 0) return;

        const events = [...this.buffer];
        this.buffer = [];

        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }

        this.pruneGuards();

        // Build maps by id for efficient processing
        const inserts = new Map<string, Order>();
        const updates = new Map<string, Order>();
        const deletes = new Set<string>();

        for (const event of events) {
            if (event.eventType === "INSERT" && event.new) {
                const order = this.normalizer(event.new as unknown as Order) as Order;
                if (order.is_archived) continue;
                inserts.set(order.id, order);
                // Fire notification for new orders
                this.onNewOrder?.(order);
            } else if (event.eventType === "UPDATE" && event.new) {
                // A soft delete (someone moved the order to the trash) arrives as
                // an UPDATE. Read `deleted_at` off the RAW payload: the
                // normalizer projects to the list columns, which do not include
                // it, so after normalizing a trashed row looks like a live edit
                // and stayed on screen as a ghost.
                if (event.new.deleted_at != null) {
                    const id = String(event.new.id);
                    deletes.add(id);
                    inserts.delete(id);
                    updates.delete(id);
                    continue;
                }

                const order = this.normalizer(event.new as unknown as Order) as Order;

                // MUTATION GUARD: Skip realtime updates that can be our own echo.
                if (this.isGuardedEcho(order.id, order.version)) {
                    this.heldEvents.set(order.id, { event });
                    continue;
                }

                updates.set(order.id, order);
                // If the same order was inserted in this batch, update the insert instead
                if (inserts.has(order.id)) {
                    inserts.set(order.id, order);
                }
            } else if (event.eventType === "DELETE" && event.old) {
                const id = (event.old as { id: string }).id;
                deletes.add(id);
                // Remove from inserts/updates if in same batch
                inserts.delete(id);
                updates.delete(id);
            }
        }


        diag.log(`[Diag:Batcher] FLUSH count=${events.length} inserts=${inserts.size} updates=${updates.size} deletes=${deletes.size}`);

        // Apply all changes in a single setQueryData call
        this.queryClient.setQueryData<Order[]>(this.queryKey, (old) => {
            if (!old) return old;

            const win = this.getWindow?.() ?? null;

            const result = old
                // Remove deleted orders
                .filter((o) => {
                    return !deletes.has(o.id);
                })
                // Apply updates (or archive removals)
                .map((o) => {
                    const updated = updates.get(o.id);
                    if (updated) {
                        updates.delete(o.id); // Mark as applied
                        if (updated.is_archived) return null; // Remove archived from active list
                        // Edited out of the loaded window (e.g. its date moved):
                        // drop it rather than leave a row that no longer matches.
                        if (!belongsInWindow(updated, win)) return null;

                        // Version-first dedup (see shouldApplyRealtimeUpdate).
                        if (!shouldApplyRealtimeUpdate(o, updated)) {
                            return o; // Keep current (newer) data
                        }
                        return carryRiskData(o, updated);
                    }
                    return o;
                })
                .filter((o): o is Order => o !== null);

            // Add new inserts + any updates for orders not in the current list.
            // Only rows that belong in the loaded window: with a windowed cache,
            // prepending anything else invents a row the merchant can act on.
            const newOrders: Order[] = [];
            for (const [, order] of inserts) {
                if (!belongsInWindow(order, win)) continue;
                if (!result.some((o) => o.id === order.id)) {
                    newOrders.push(order);
                }
            }
            // Updates for orders that weren't in the list (e.g., un-archived)
            for (const [, order] of updates) {
                if (!belongsInWindow(order, win)) continue;
                if (!order.is_archived && !result.some((o) => o.id === order.id)) {
                    newOrders.push(order);
                }
            }

            const finalOrders = [...newOrders, ...result];

            return finalOrders;
        });
    }

    /**
     * Apply a batch of already-normalized changed rows (from an incremental
     * `findChangedSince` delta) directly into the cache, using the SAME merge
     * rules as flush(): mutation-guard skip, timestamp-aware dedup, archived →
     * remove, and prepend genuinely-new rows. Used on realtime reconnect /
     * app-reopen / heartbeat-drift instead of re-pulling the entire table.
     * Returns the number of rows actually applied.
     */
    applyChangedOrders(changed: Order[]): number {
        if (changed.length === 0) return 0;

        this.pruneGuards();

        const updates = new Map<string, Order>();
        const archived = new Set<string>();
        for (const o of changed) {
            // Don't clobber an order we just mutated optimistically with what
            // can be its own echo (a newer version, e.g. the history trigger's
            // base+2 write, applies).
            if (this.isGuardedEcho(o.id, o.version)) {
                this.heldEvents.set(o.id, { row: o });
                continue;
            }
            if (o.is_archived) { archived.add(o.id); continue; }
            updates.set(o.id, o);
        }

        let applied = 0;
        const win = this.getWindow?.() ?? null;
        this.queryClient.setQueryData<Order[]>(this.queryKey, (old) => {
            if (!old) return old;

            const result = old
                .filter((o) => !archived.has(o.id))
                .map((o) => {
                    const updated = updates.get(o.id);
                    if (!updated) return o;
                    updates.delete(o.id); // mark applied
                    // Version-first dedup (see shouldApplyRealtimeUpdate).
                    if (!shouldApplyRealtimeUpdate(o, updated)) {
                        return o;
                    }
                    applied++;
                    // Moved out of the loaded window (e.g. its date changed while
                    // we were offline): drop it, as flush() does for live events.
                    if (!belongsInWindow(updated, win)) return null;
                    return carryRiskData(o, updated);
                })
                .filter((o): o is Order => o !== null);

            // Genuinely-new rows (not already in the list) → prepend (newest-first),
            // but only those belonging to the loaded window.
            const newOnes: Order[] = [];
            for (const [, order] of updates) {
                if (!belongsInWindow(order, win)) continue;
                if (!result.some((o) => o.id === order.id)) { newOnes.push(order); applied++; }
            }

            return newOnes.length ? [...newOnes, ...result] : result;
        });

        diag.log(`[Diag:Batcher] DELTA_APPLY changed=${changed.length} archived=${archived.size} applied=${applied}`);
        return applied;
    }

    private pruneGuards(): void {
        const now = Date.now();
        for (const [id, guard] of this.recentMutations) {
            if (now - guard.at > RealtimeBatcher.MUTATION_GUARD_MS) {
                this.recentMutations.delete(id);
                this.heldEvents.delete(id);
            }
        }
    }

    /**
     * Cancel pending flush and clear buffer (for cleanup).
     */
    destroy(): void {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        this.buffer = [];
        this.recentMutations.clear();
        this.heldEvents.clear();
    }
}

/**
 * Keep the cached `risk_data` when an incoming row has none. Realtime payloads
 * never carry it (it is not a column; `withRiskData` attaches it after a
 * fetch), so replacing the row dropped every risk badge until the next full
 * refetch. Only while the phone is unchanged: risk is keyed by phone.
 */
function carryRiskData(cached: Order, incoming: Order): Order {
    if (incoming.risk_data === undefined && incoming.phone === cached.phone && cached.risk_data !== undefined) {
        return { ...incoming, risk_data: cached.risk_data };
    }
    return incoming;
}
