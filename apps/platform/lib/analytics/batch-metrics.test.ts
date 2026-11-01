import { describe, expect, it } from "vitest";
import type { PrintBatch } from "@/lib/supabase";
import { calculateBatchMetrics, summarizeBatches } from "./batch-metrics";

function batch(id: string, order_ids: string[]): PrintBatch {
    return {
        id, name: id, created_at: "2026-10-15T10:00:00.000Z", order_ids, order_count: order_ids.length,
        total_value: 100000, cities: ["Basra"],
    } as PrintBatch;
}

describe("calculateBatchMetrics", () => {
    it("delivery rate is delivered / (delivered + rejected): orders still in transit do not lower it", () => {
        const statuses = new Map([["a", "delivered"], ["b", "rejected"], ["c", "in_transit"], ["d", "in_transit"]]);
        const [m] = calculateBatchMetrics([batch("x", ["a", "b", "c", "d"])], statuses);
        expect(m?.deliveryRate).toBe(50);
        expect(m?.rejectionRate).toBe(50);
        expect(m?.status).toBe("mixed");
    });

    it("leaves out deleted orders (missing from the live status map) instead of counting them as unfinished", () => {
        const statuses = new Map([["a", "delivered"]]);
        const [m] = calculateBatchMetrics([batch("x", ["a", "gone1", "gone2"])], statuses);
        expect(m?.delivered).toBe(1);
        expect(m?.status).toBe("completed");
        expect(m?.deliveryRate).toBe(100);
    });

    it("a batch with no outcomes yet is pending at 0%, not NaN", () => {
        const [m] = calculateBatchMetrics([batch("x", ["a"])], new Map([["a", "in_transit"]]));
        expect(m?.deliveryRate).toBe(0);
        expect(m?.status).toBe("pending");
    });
});

describe("summarizeBatches", () => {
    it("pools the delivery rate over every outcome rather than averaging batch rates", () => {
        const statuses = new Map<string, string>([["s1", "rejected"]]);
        const bigIds = Array.from({ length: 100 }, (_, i) => `d${i}`);
        bigIds.forEach(id => statuses.set(id, "delivered"));
        const batches = calculateBatchMetrics([batch("small", ["s1"]), batch("big", bigIds)], statuses);
        // Mean of 0% and 100% would say 50%; 100 of 101 outcomes were delivered.
        expect(summarizeBatches(batches).avgDeliveryRate).toBeCloseTo((100 / 101) * 100);
    });
});
