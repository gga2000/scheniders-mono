import { get, set } from "idb-keyval";
import { toast } from "sonner";
import type { Order } from "@/types/order";

export interface SyncTask {
    id: string;
    type: "CREATE_ORDER" | "UPDATE_ORDER" | "UPDATE_STATUS";
    payload: unknown;
    createdAt: number;
    status: "PENDING" | "FAILED";
    error?: string;
}

const SYNC_QUEUE_KEY = "offline-sync-queue";

/**
 * Executes a promise with a hard timeout.
 * Used to prevent Supabase fetches from hanging indefinitely
 * when the network is dropping packets but navigator.onLine is true.
 */
async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs = 8000): Promise<T> {
    let timeoutHandle: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error("NETWORK_TIMEOUT")), timeoutMs);
    });

    try {
        return await Promise.race([Promise.resolve(promise), timeoutPromise]);
    } finally {
        clearTimeout(timeoutHandle!);
    }
}

/**
 * Advanced Sync Engine for handling offline mutations.
 * 
 * Features:
 * - Persistent IndexedDB queue
 * - Strict Timeout handling for "False Online" scenarios
 * - Sequential replay to preserve temporal order
 * - Error isolation (one failed task doesn't block the queue)
 */
export class SyncEngine {
    private static isSyncing = false;
    private static syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    /** Get the current queue of tasks */
    static async getQueue(): Promise<SyncTask[]> {
        return (await get<SyncTask[]>(SYNC_QUEUE_KEY)) || [];
    }

    /** Add a task to the queue and optionally start syncing */
    static async enqueue(task: Omit<SyncTask, "id" | "createdAt" | "status" | "error">) {
        const queue = await this.getQueue();
        const newTask: SyncTask = {
            ...task,
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            status: "PENDING",
        };
        queue.push(newTask);
        await set(SYNC_QUEUE_KEY, queue);

        // Attempt to sync immediately. 
        // We debounce this slightly to allow React Query's onMutate to finish setup
        // and to batch multiple rapid enqueues into a single sync run.
        if (this.syncDebounceTimer) {
            clearTimeout(this.syncDebounceTimer);
        }

        this.syncDebounceTimer = setTimeout(() => {
            // Even if navigator.onLine is true, we rely on the actual fetch timeout
            // to prove connectivity during the sync() run.
            this.sync().catch(console.error);
        }, 100);

        return newTask;
    }

    /** Remove a specific task from the queue */
    static async remove(id: string) {
        const queue = await this.getQueue();
        const newQueue = queue.filter((t) => t.id !== id);
        await set(SYNC_QUEUE_KEY, newQueue);
    }

    /** Clear the entire queue */
    static async clear() {
        await set(SYNC_QUEUE_KEY, []);
    }

    /** Mark a task as failed with an error message */
    static async markFailed(id: string, errorMsg: string) {
        const queue = await this.getQueue();
        const newQueue = queue.map((t) =>
            t.id === id ? { ...t, status: "FAILED" as const, error: errorMsg } : t
        );
        await set(SYNC_QUEUE_KEY, newQueue);
    }

    /** 
     * Process the queue sequentially.
     */
    static async sync(): Promise<void> {
        if (this.isSyncing) return;

        // We check onLine initially to save battery/effort, but do not fully trust it.
        // If it says false, we definitively abort. If true, we proceed but rely on timeouts.
        if (typeof navigator !== "undefined" && !navigator.onLine) return;

        try {
            this.isSyncing = true;
            let queue = await this.getQueue();

            // Only process PENDING tasks
            const pendingTasks = queue.filter(t => t.status === "PENDING");
            if (pendingTasks.length === 0) return;

            console.log(`[SyncEngine] Starting sync of ${pendingTasks.length} offline tasks...`);
            let successCount = 0;
            let failCount = 0;
            let networkTimeoutHit = false;

            for (const task of pendingTasks) {
                // If we hit a pure network timeout, abort the rest of the queue
                // so we don't spam requests into a black hole.
                if (networkTimeoutHit) break;

                try {
                    await this.processTask(task);
                    await this.remove(task.id);
                    successCount++;
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : "Unknown sync error";

                    if (msg === "NETWORK_TIMEOUT" || msg.includes("Failed to fetch")) {
                        console.warn(`[SyncEngine] Network timeout on task ${task.id}. Pausing queue.`);
                        networkTimeoutHit = true;
                        // Do NOT mark as failed; keep it pending for next time
                    } else {
                        failCount++;
                        console.error(`[SyncEngine] Task ${task.id} failed permanently:`, msg);
                        await this.markFailed(task.id, msg);
                    }
                }
            }

            if (successCount > 0) {
                toast.success(`Synced ${successCount} offline change${successCount > 1 ? 's' : ''}`);
            }
            if (failCount > 0) {
                toast.error(`${failCount} offline change${failCount > 1 ? 's' : ''} failed due to server errors. Please review them.`);
            }

        } finally {
            this.isSyncing = false;
        }
    }

    /** Process a single offline task based on its type */
    private static async processTask(task: SyncTask): Promise<void> {
        const { type, payload } = task;

        switch (type) {
            case "CREATE_ORDER":
                await this.handleCreate(payload);
                break;
            case "UPDATE_ORDER":
                await this.handleUpdate(payload as { orderId: string, updates: Partial<Order>, expectedUpdatedAt: string });
                break;
            case "UPDATE_STATUS":
                await this.handleUpdateStatus(payload as { orderId: string, status: string, rejectionReason?: string, expectedUpdatedAt: string });
                break;
            default:
                throw new Error(`Unknown sync task type: ${type}`);
        }
    }

    private static async handleCreate(payload: unknown) {
        const { supabase } = await import("@/lib/supabase");
        // Use withTimeout to prevent hanging on "False Online"
        const { error } = await withTimeout<{ error: unknown }>(supabase.from("orders").insert(payload).select().single());
        if (error) throw error;
    }

    private static async handleUpdate(payload: { orderId: string, updates: Partial<Order>, expectedUpdatedAt: string }) {
        const { supabase } = await import("@/lib/supabase");
        const { error } = await withTimeout<{ error: unknown }>(
            supabase
                .from("orders")
                .update(payload.updates)
                .eq("id", payload.orderId)
                .select()
                .single()
        );

        if (error) throw error;
    }

    private static async handleUpdateStatus(payload: { orderId: string, status: string, rejectionReason?: string, expectedUpdatedAt: string }) {
        const { supabase } = await import("@/lib/supabase");
        const updateData: Record<string, string | null> = {
            status: payload.status,
            rejection_reason: payload.rejectionReason || null,
        };
        if (payload.status === "delivered") updateData.delivered_at = new Date().toISOString();
        if (payload.status === "cancelled") updateData.cancelled_at = new Date().toISOString();

        const { error } = await withTimeout<{ error: unknown }>(
            supabase
                .from("orders")
                .update(updateData)
                .eq("id", payload.orderId)
                .select()
                .single()
        );

        if (error) throw error;
    }
}
