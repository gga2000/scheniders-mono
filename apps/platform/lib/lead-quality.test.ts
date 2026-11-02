import { describe, expect, it } from "vitest";
import { leadQuality } from "./lead-quality";

const o = (status: string, extra: Record<string, boolean> = {}) => ({ status, is_return: false, is_replacement: false, ...extra }) as Parameters<typeof leadQuality>[0][number];

describe("leadQuality", () => {
    it("measures finished orders only and leaves in-flight and dead ones out", () => {
        const q = leadQuality([
            o("completed"), o("delivered"), o("completed"), o("no_response"), o("rejected"),
            o("in_transit"), o("new"), o("cancelled"), o("pending_checkout"),
        ]);
        expect(q).toMatchObject({ finished: 5, delivered: 3, noAnswer: 1, rejected: 1, inProgress: 2 });
        expect([q.deliveredPct, q.noAnswerPct, q.rejectedPct]).toEqual([60, 20, 20]);
    });
    it("ignores return and replacement rows", () => {
        const q = leadQuality([o("completed"), o("completed", { is_return: true }), o("rejected", { is_replacement: true })]);
        expect(q.finished).toBe(1);
    });
    it("has no percentages before anything finishes", () => {
        const q = leadQuality([o("new")]);
        expect(q.deliveredPct).toBeNull();
        expect(q.inProgress).toBe(1);
    });
});
