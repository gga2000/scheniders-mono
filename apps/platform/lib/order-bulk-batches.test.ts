import { describe, it, expect, vi } from "vitest";
import {
    BULK_STATUS_BATCH_SIZE,
    chunkIdsInLockOrder,
    formatBulkProgress,
    runInSequentialBatches,
    type BatchOutcome,
    type BulkProgress,
} from "./order-bulk-batches";

type Row = { id: string };
const ok = (batch: string[]): BatchOutcome<Row> => ({ succeeded: batch.map((id) => ({ id })), failed: [] });

describe("chunkIdsInLockOrder", () => {
    it("sorts ascending, de-duplicates and cuts into batches", () => {
        expect(chunkIdsInLockOrder(["d", "b", "a", "b", "e", "c"], 2)).toEqual([["a", "b"], ["c", "d"], ["e"]]);
    });

    it("returns no batches for no ids", () => {
        expect(chunkIdsInLockOrder([], 5)).toEqual([]);
    });

    it("rejects a non-positive batch size", () => {
        expect(() => chunkIdsInLockOrder(["a"], 0)).toThrow(RangeError);
    });

    it("keeps the default batch inside the 5-10 band", () => {
        expect(BULK_STATUS_BATCH_SIZE).toBeGreaterThanOrEqual(5);
        expect(BULK_STATUS_BATCH_SIZE).toBeLessThanOrEqual(10);
    });
});

describe("runInSequentialBatches", () => {
    it("runs batches one at a time, in id order", async () => {
        let inFlight = 0;
        let maxInFlight = 0;
        const seen: string[][] = [];
        await runInSequentialBatches<Row>({
            ids: ["g", "c", "a", "f", "b", "e", "d"],
            batchSize: 3,
            runBatch: async (batch) => {
                inFlight++;
                maxInFlight = Math.max(maxInFlight, inFlight);
                seen.push(batch);
                await new Promise((r) => setTimeout(r, 1));
                inFlight--;
                return ok(batch);
            },
        });
        expect(maxInFlight).toBe(1);
        expect(seen).toEqual([["a", "b", "c"], ["d", "e", "f"], ["g"]]);
    });

    it("reports progress after every batch, counting failures as done", async () => {
        const progress: BulkProgress[] = [];
        await runInSequentialBatches<Row>({
            ids: ["a", "b", "c", "d", "e"],
            batchSize: 2,
            runBatch: async (batch) => ({
                succeeded: batch.filter((id) => id !== "c").map((id) => ({ id })),
                failed: batch.filter((id) => id === "c").map((id) => ({ id, error: new Error("x") })),
            }),
            onProgress: (p) => progress.push(p),
        });
        expect(progress).toEqual([
            { done: 0, total: 5, succeeded: 0, failed: 0 },
            { done: 2, total: 5, succeeded: 2, failed: 0 },
            { done: 4, total: 5, succeeded: 3, failed: 1 },
            { done: 5, total: 5, succeeded: 4, failed: 1 },
        ]);
    });

    it("fails the whole batch when it throws, and still runs the next one", async () => {
        const boom = new Error("57014 statement timeout");
        const result = await runInSequentialBatches<Row>({
            ids: ["a", "b", "c", "d"],
            batchSize: 2,
            runBatch: async (batch) => {
                if (batch[0] === "a") throw boom;
                return ok(batch);
            },
        });
        expect(result.succeeded.map((r) => r.id)).toEqual(["c", "d"]);
        expect(result.failed).toEqual([
            { id: "a", error: boom },
            { id: "b", error: boom },
        ]);
    });

    it("accounts for every id exactly once, even when a batch under- or over-reports", async () => {
        const result = await runInSequentialBatches<Row>({
            ids: ["a", "b", "c"],
            batchSize: 3,
            // Forgets "b", repeats "a", and reports an id it was never given.
            runBatch: async () => ({
                succeeded: [{ id: "a" }, { id: "a" }, { id: "zzz" }],
                failed: [{ id: "c", error: new Error("CONFLICT_DETECTED") }],
            }),
        });
        expect(result.succeeded).toEqual([{ id: "a" }]);
        expect(result.failed.map((f) => f.id)).toEqual(["c", "b"]);
    });

    it("awaits the per-batch hook before reporting that batch's progress", async () => {
        const events: string[] = [];
        await runInSequentialBatches<Row>({
            ids: ["a", "b", "c"],
            batchSize: 2,
            runBatch: async (batch) => {
                events.push(`write:${batch.join("")}`);
                return ok(batch);
            },
            onBatchSettled: async (outcome) => {
                await new Promise((r) => setTimeout(r, 1));
                events.push(`history:${outcome.succeeded.map((r) => r.id).join("")}`);
            },
            onProgress: (p) => events.push(`progress:${p.done}`),
        });
        expect(events).toEqual([
            "progress:0",
            "write:ab", "history:ab", "progress:2",
            "write:c", "history:c", "progress:3",
        ]);
    });

    it("does nothing for an empty selection", async () => {
        const runBatch = vi.fn(async (batch: string[]) => ok(batch));
        const result = await runInSequentialBatches<Row>({ ids: [], runBatch });
        expect(runBatch).not.toHaveBeenCalled();
        expect(result).toEqual({ succeeded: [], failed: [] });
    });
});

describe("formatBulkProgress", () => {
    const t = (key: string) =>
        ({
            "orders.bulk.progress": "{done} of {total}",
            "orders.bulk.progressFailed": "{done} of {total} · {failed} failed",
        })[key] ?? key;

    it("counts without failures", () => {
        expect(formatBulkProgress({ done: 10, total: 50, succeeded: 10, failed: 0 }, t)).toBe("10 of 50");
    });

    it("names failures once there are any", () => {
        expect(formatBulkProgress({ done: 12, total: 50, succeeded: 11, failed: 1 }, t)).toBe("12 of 50 · 1 failed");
    });
});
