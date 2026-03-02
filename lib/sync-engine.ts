import { get, set } from "idb-keyval";
import { orderRepository } from "@/lib/repositories/order-repository";
import { updateWithConflictCheck } from "@/lib/conflict-detection";
import { notificationService } from "@/lib/notification-service";
import type { Order } from "@/types/order";

export interface SyncTask {
    id: string;
    type: "CREATE_ORDER" | "UPDATE_ORDER" | "UPDATE_STATUS";
    payload: any;
    createdAt: number;
    status: "PENDING" | "FAILED";
    error?: string;
}

const SYNC_QUEUE_KEY = "offline-sync-queue";

/**
 * Advanced Sync Engine for handling offline mutations.
 * 
 * Features:
 * - Persistent IndexedDB queue
 * - Sequential replay to preserve temporal order
 * - Conflict awareness (uses Phase 2 optimistic locking)
 * - Error isolation (one failed task doesn't block the queue)
 */
export class SyncEngine {
    private static isSyncing = false;

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

        // Attempt to sync immediately if online
        if (typeof navigator !== "undefined" && navigator.onLine) {
            // Fire and forget
            this.sync().catch(console.error);
        }

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
     * Starts automatically when coming back online.
     */
    static async sync(): Promise<void> {
        if (this.isSyncing) return;
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

            for (const task of pendingTasks) {
                try {
                    await this.processTask(task);
                    await this.remove(task.id);
                    successCount++;
                } catch (err) {
                    failCount++;
                    const msg = err instanceof Error ? err.message : "Unknown sync error";
                    console.error(`[SyncEngine] Task ${task.id} failed:`, msg);
                    await this.markFailed(task.id, msg);
                }
            }

            if (successCount > 0) {
                notificationService.success(`Synced ${successCount} offline change${successCount > 1 ? 's' : ''}`);
            }
            if (failCount > 0) {
                notificationService.error(`${failCount} offline change${failCount > 1 ? 's' : ''} failed to sync. Review your connection or data.`);
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
                await this.handleUpdate(payload);
                break;
            case "UPDATE_STATUS":
                await this.handleUpdateStatus(payload);
                break;
            default:
                throw new Error(`Unknown sync task type: ${type}`);
        }
    }

    private static async handleCreate(payload: any) {
        // Need to use raw supabase insert because orderRepository.create doesn't exist yet
        // In the existing code, createOrder directly used a mutation calling supabase.insert
        const { supabase } = await import("@/lib/supabase");
        const { error } = await supabase.from("orders").insert(payload);
        if (error) throw error;
    }

    private static async handleUpdate(payload: { orderId: string, updates: Partial<Order>, expectedUpdatedAt: string }) {
        // Use the conflict-aware update from Phase 2
        const result = await updateWithConflictCheck(
            "orders",
            payload.orderId,
            payload.updates,
            payload.expectedUpdatedAt
        );

        if (result.conflict) {
            throw new Error(`Conflict: ${result.error}`);
        }
        if (!result.success) {
            throw new Error(result.error);
        }
    }

    private static async handleUpdateStatus(payload: { orderId: string, status: string, rejectionReason?: string, expectedUpdatedAt: string }) {
        // Similar to update, we must check for conflicts
        // Since updateStatus in the repo doesn't do conflict checks yet natively, we do it here
        const result = await updateWithConflictCheck(
            "orders",
            payload.orderId,
            {
                status: payload.status,
                rejection_reason: payload.rejectionReason,
                ...(payload.status === "delivered" ? { delivered_at: new Date().toISOString() } : {}),
                ...(payload.status === "cancelled" ? { cancelled_at: new Date().toISOString() } : {})
            },
            payload.expectedUpdatedAt
        );

        if (result.conflict) {
            throw new Error(`Conflict: ${result.error}`);
        }
        if (!result.success) {
            throw new Error(result.error);
        }
    }
}
