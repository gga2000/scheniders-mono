import { QueryClient } from "@tanstack/react-query";
import type { Order } from "@/lib/supabase";
import { setCachedOrders } from "@/hooks/use-orders-query";

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
}

export class RealtimeBatcher {
    private buffer: RealtimeEvent[] = [];
    private flushTimer: ReturnType<typeof setTimeout> | null = null;
    private queryClient: QueryClient;
    private queryKey: readonly unknown[];
    private normalizer: (raw: unknown) => unknown;
    private flushDelayMs: number;
    private onNewOrder?: (order: Order) => void;

    // Mutation guard: track recently-mutated order IDs to prevent
    // stale realtime broadcasts from overwriting optimistic updates
    private recentMutations = new Map<string, number>();
    private static readonly MUTATION_GUARD_MS = 3_000; // 3 seconds

    constructor(options: RealtimeBatcherOptions) {
        this.queryClient = options.queryClient;
        this.queryKey = options.queryKey;
        this.normalizer = options.normalizer ?? ((x: unknown) => x);
        this.flushDelayMs = options.flushDelayMs ?? 200;
        this.onNewOrder = options.onNewOrder;
    }

    /**
     * Mark an order as recently mutated. Realtime updates for this order
     * will be skipped for MUTATION_GUARD_MS to prevent stale broadcasts
     * from overwriting optimistic UI.
     */
    markMutated(orderId: string): void {
        this.recentMutations.set(orderId, Date.now());
    }

    /**
     * Add an event to the buffer. The buffer will be flushed
     * after `flushDelayMs` of inactivity (debounce).
     */
    push(event: RealtimeEvent): void {
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

        // Prune expired mutation guards
        const now = Date.now();
        for (const [id, ts] of this.recentMutations) {
            if (now - ts > RealtimeBatcher.MUTATION_GUARD_MS) {
                this.recentMutations.delete(id);
            }
        }

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
                const order = this.normalizer(event.new as unknown as Order) as Order;

                // MUTATION GUARD: Skip realtime updates for orders we just mutated.
                if (this.recentMutations.has(order.id)) {
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


        // Apply all changes in a single setQueryData call
        this.queryClient.setQueryData<Order[]>(this.queryKey, (old) => {
            if (!old) return old;

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

                        // Timestamp-aware: skip broadcasts whose updated_at is older
                        // than or equal to what's already in cache (deterministic dedup)
                        if (o.updated_at && updated.updated_at && updated.updated_at <= o.updated_at) {
                            return o; // Keep current (newer) data
                        }

                        // Version-aware: skip stale events (if version column exists)
                        const oVersion = (o as unknown as Record<string, unknown>).version;
                        const updatedVersion = (updated as unknown as Record<string, unknown>).version;
                        if (typeof oVersion === "number" && typeof updatedVersion === "number") {
                            if (updatedVersion < oVersion) {
                                return o; // Keep current (newer) version
                            }
                        }
                        return updated;
                    }
                    return o;
                })
                .filter((o): o is Order => o !== null);

            // Add new inserts + any updates for orders not in the current list
            const newOrders: Order[] = [];
            for (const [, order] of inserts) {
                if (!result.some((o) => o.id === order.id)) {
                    newOrders.push(order);
                }
            }
            // Updates for orders that weren't in the list (e.g., un-archived)
            for (const [, order] of updates) {
                if (!order.is_archived && !result.some((o) => o.id === order.id)) {
                    newOrders.push(order);
                }
            }

            const finalOrders = [...newOrders, ...result];

            // Keep sessionStorage in sync so a hard refresh shows
            // realtime-updated data instead of the last fetchOrders result
            setCachedOrders(finalOrders);

            return finalOrders;
        });
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
    }
}
