/**
 * Sequential batching for bulk order writes.
 *
 * A bulk status change used to fire one PATCH per order, all at once. Every one
 * of those rows runs the same AFTER triggers (inventory, trust score), which take
 * a lock on shared `products` rows and hold it for the length of the trigger —
 * so fifty parallel requests queued behind each other inside Postgres, waited
 * 4.5–9s, hit the 8s statement timeout (57014), and deadlocked (40P01) when two
 * of them reached the same products in a different order. The history insert
 * that followed was one big POST at the end, and it timed out too.
 *
 * Here the selection is split into small batches that run ONE AT A TIME, ids in
 * ascending order. Only one batch from this client is ever in flight, so the
 * bulk cannot contend with itself, and a fixed order means any two batches touch
 * rows in the same sequence. Each batch reports when it settles, which is what
 * the counting toast and the per-batch history write hang off.
 *
 * The long-term fix is one server-side RPC that changes the statuses and writes
 * their history in the same transaction; this keeps the client honest until then.
 */

import type { BulkFailure } from "@/lib/order-bulk-result";

/** Orders per write. Small enough that a batch stays well under the 8s statement timeout. */
export const BULK_STATUS_BATCH_SIZE = 5;

/** What one batch (or the whole run) produced. Every requested id lands in exactly one list. */
export type BatchOutcome<T extends { id: string }> = {
    succeeded: T[];
    failed: BulkFailure[];
};

export type BulkProgress = {
    /** Orders settled so far — successes and failures both count, so it never stalls. */
    done: number;
    total: number;
    succeeded: number;
    failed: number;
};

/** De-duplicate, sort ascending, and cut into batches of `size`. */
export function chunkIdsInLockOrder(ids: readonly string[], size: number): string[][] {
    if (!Number.isInteger(size) || size < 1) {
        throw new RangeError(`Batch size must be a positive integer, got ${size}`);
    }
    const sorted = [...new Set(ids)].sort();
    const batches: string[][] = [];
    for (let i = 0; i < sorted.length; i += size) {
        batches.push(sorted.slice(i, i + size));
    }
    return batches;
}

/**
 * Make a batch's outcome account for exactly the ids it was given: anything the
 * worker returned that was not asked for is dropped, and anything it forgot is a
 * failure rather than silently vanishing from the totals.
 */
function reconcile<T extends { id: string }>(batch: readonly string[], outcome: BatchOutcome<T>): BatchOutcome<T> {
    const wanted = new Set(batch);
    const seen = new Set<string>();
    const succeeded: T[] = [];
    const failed: BulkFailure[] = [];
    for (const item of outcome.succeeded) {
        if (wanted.has(item.id) && !seen.has(item.id)) {
            seen.add(item.id);
            succeeded.push(item);
        }
    }
    for (const failure of outcome.failed) {
        if (wanted.has(failure.id) && !seen.has(failure.id)) {
            seen.add(failure.id);
            failed.push(failure);
        }
    }
    for (const id of batch) {
        if (!seen.has(id)) failed.push({ id, error: new Error("No result was returned for this order") });
    }
    return { succeeded, failed };
}

export type RunBatchesOptions<T extends { id: string }> = {
    ids: readonly string[];
    batchSize?: number;
    /** Write one batch. A throw fails every order in that batch; later batches still run. */
    runBatch: (batch: string[]) => Promise<BatchOutcome<T>>;
    /** Awaited after each batch, before progress is reported (e.g. the history insert). */
    onBatchSettled?: (outcome: BatchOutcome<T>) => Promise<void> | void;
    onProgress?: (progress: BulkProgress) => void;
};

/** Run `runBatch` over the ids one batch at a time and aggregate the results. */
export async function runInSequentialBatches<T extends { id: string }>({
    ids,
    batchSize = BULK_STATUS_BATCH_SIZE,
    runBatch,
    onBatchSettled,
    onProgress,
}: RunBatchesOptions<T>): Promise<BatchOutcome<T>> {
    const batches = chunkIdsInLockOrder(ids, batchSize);
    const total = batches.reduce((n, b) => n + b.length, 0);
    const succeeded: T[] = [];
    const failed: BulkFailure[] = [];

    onProgress?.({ done: 0, total, succeeded: 0, failed: 0 });

    for (const batch of batches) {
        let outcome: BatchOutcome<T>;
        try {
            outcome = reconcile(batch, await runBatch(batch));
        } catch (error) {
            outcome = { succeeded: [], failed: batch.map((id) => ({ id, error })) };
        }
        succeeded.push(...outcome.succeeded);
        failed.push(...outcome.failed);
        await onBatchSettled?.(outcome);
        onProgress?.({
            done: succeeded.length + failed.length,
            total,
            succeeded: succeeded.length,
            failed: failed.length,
        });
    }

    return { succeeded, failed };
}

/** The counting line under the loading toast: "12 of 50", or "12 of 50 · 1 failed". */
export function formatBulkProgress(progress: BulkProgress, t: (key: string) => string): string {
    const key = progress.failed > 0 ? "orders.bulk.progressFailed" : "orders.bulk.progress";
    return t(key)
        .replace("{done}", String(progress.done))
        .replace("{total}", String(progress.total))
        .replace("{failed}", String(progress.failed));
}
