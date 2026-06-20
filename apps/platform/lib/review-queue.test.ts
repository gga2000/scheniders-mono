import { describe, it, expect } from "vitest";
import { countReviewsByStatus } from "./review-queue";

describe("countReviewsByStatus", () => {
    it("tallies each status + total", () => {
        const c = countReviewsByStatus([
            { status: "pending" },
            { status: "pending" },
            { status: "approved" },
            { status: "rejected" },
        ]);
        expect(c).toEqual({ pending: 2, approved: 1, rejected: 1, total: 4 });
    });

    it("is empty-safe", () => {
        expect(countReviewsByStatus([])).toEqual({
            pending: 0,
            approved: 0,
            rejected: 0,
            total: 0,
        });
    });
});
