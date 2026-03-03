import { QueryClient } from "@tanstack/react-query";
import type { Order } from "@/lib/supabase";

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

    constructor(options: RealtimeBatcherOptions) {
        this.queryClient = options.queryClient;
        this.queryKey = options.queryKey;
        this.normalizer = options.normalizer ?? ((x: unknown) => x);
        this.flushDelayMs = options.flushDelayMs ?? 200;
        this.onNewOrder = options.onNewOrder;
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

        // Build maps by id for efficient processing
        const inserts = new Map<string, Order>();
        const updates = new Map<string, Order>();
        const deletes = new Set<string>();

        for (const event of events) {
            if (event.eventType === "INSERT" && event.new) {
                const order = this.normalizer(event.new as Order) as Order;
                if (order.is_archived) continue;
                inserts.set(order.id, order);
                // Fire notification for new orders
                this.onNewOrder?.(order);
            } else if (event.eventType === "UPDATE" && event.new) {
                const order = this.normalizer(event.new as Order) as Order;
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
                .filter((o) => !deletes.has(o.id))
                // Apply updates (or archive removals)
                .map((o) => {
                    const updated = updates.get(o.id);
                    if (updated) {
                        updates.delete(o.id); // Mark as applied
                        if (updated.is_archived) return null; // Remove archived from active list
                        // Version-aware: skip stale events (if version column exists)
                        const oVersion = (o as Record<string, unknown>).version;
                        const updatedVersion = (updated as Record<string, unknown>).version;
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

            return [...newOrders, ...result];
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
    }
}
