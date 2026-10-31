import { describe, it, expect } from "vitest";
import {
    classifyBulkFailure,
    describeBulkFailureReason,
    labelForOrder,
    formatFailedOrderList,
    summarizeBulkFailures,
    findUnaffectedIds,
    MAX_NAMED_FAILURES,
} from "./order-bulk-result";
import { ExchangedOrderStatusError } from "./order-status-guard";

const ORDERS = [
    { id: "a", order_id: "1260901001", customer_name: "أحمد" },
    { id: "b", order_id: null, customer_name: "نور" },
    { id: "c", order_id: null, customer_name: null },
];

describe("classifyBulkFailure", () => {
    it("recognises the optimistic-concurrency guard", () => {
        expect(classifyBulkFailure(new Error("CONFLICT_DETECTED"))).toBe("conflict");
    });

    it("recognises an RLS denial by code and by message", () => {
        expect(classifyBulkFailure({ code: "42501", message: "nope" })).toBe("permission");
        expect(classifyBulkFailure(new Error("permission denied for table orders"))).toBe("permission");
        expect(classifyBulkFailure(new Error("new row violates row-level security policy"))).toBe("permission");
    });

    it("separates missing rows from conflicts", () => {
        expect(classifyBulkFailure(new Error("row not found"))).toBe("missing");
    });

    it("recognises transport failures", () => {
        expect(classifyBulkFailure(new Error("fetch failed"))).toBe("network");
        expect(classifyBulkFailure(new Error("The operation was aborted"))).toBe("network");
    });

    it("falls back to unknown rather than guessing", () => {
        expect(classifyBulkFailure(new Error("something odd"))).toBe("unknown");
        expect(classifyBulkFailure(null)).toBe("unknown");
        expect(classifyBulkFailure(undefined)).toBe("unknown");
        expect(classifyBulkFailure("plain string")).toBe("unknown");
    });
});

describe("describeBulkFailureReason", () => {
    it("agrees with the count on singular and plural", () => {
        expect(describeBulkFailureReason("conflict", 1)).toContain("1 order changed");
        expect(describeBulkFailureReason("conflict", 3)).toContain("3 orders changed");
    });

    it("does not blame a conflict for a permission failure", () => {
        expect(describeBulkFailureReason("permission", 2)).toContain("permission");
        expect(describeBulkFailureReason("permission", 2)).not.toContain("someone else");
    });
});

describe("labelForOrder", () => {
    it("prefers the human order number", () => {
        expect(labelForOrder("a", ORDERS)).toBe("#1260901001");
    });

    it("falls back to the customer name, then to a short id", () => {
        expect(labelForOrder("b", ORDERS)).toBe("نور");
        expect(labelForOrder("c", ORDERS)).toBe("#c");
    });

    it("still names an order it has no record of", () => {
        expect(labelForOrder("deadbeef-0000", ORDERS)).toBe("#deadbeef");
    });
});

describe("formatFailedOrderList", () => {
    it("names every order when the list is short", () => {
        expect(formatFailedOrderList(["a", "b"], ORDERS)).toBe("#1260901001, نور");
    });

    it("collapses the tail so the message stays readable", () => {
        const ids = Array.from({ length: MAX_NAMED_FAILURES + 3 }, (_, i) => `id-${i}`);
        const out = formatFailedOrderList(ids, ORDERS);
        expect(out).toContain("+3 more");
        expect(out.split(", ").length).toBe(MAX_NAMED_FAILURES);
    });

    it("returns an empty string for no failures", () => {
        expect(formatFailedOrderList([], ORDERS)).toBe("");
    });
});

describe("summarizeBulkFailures", () => {
    it("reports each distinct cause instead of one guess", () => {
        const summary = summarizeBulkFailures(
            [
                { id: "a", error: new Error("CONFLICT_DETECTED") },
                { id: "b", error: { code: "42501", message: "denied" } },
                { id: "c", error: new Error("CONFLICT_DETECTED") },
            ],
            ORDERS,
            10,
        );

        expect(summary.total).toBe(3);
        expect(summary.title).toBe("3 of 10 orders were not updated");
        // Most common reason first.
        expect(summary.byReason[0]).toEqual({ reason: "conflict", count: 2 });
        expect(summary.byReason[1]).toEqual({ reason: "permission", count: 1 });
        expect(summary.description).toContain("permission");
        expect(summary.description).toContain("#1260901001");
    });

    it("returns the failed ids so they can stay selected for a retry", () => {
        const summary = summarizeBulkFailures(
            [{ id: "b", error: new Error("x") }],
            ORDERS,
            4,
        );
        expect(summary.failedIds).toEqual(["b"]);
        expect(summary.title).toBe("1 of 4 order were not updated");
    });

    it("takes the verb from the caller so delete does not say updated", () => {
        const summary = summarizeBulkFailures(
            [{ id: "a", error: new Error("x") }],
            ORDERS,
            2,
            "deleted",
        );
        expect(summary.title).toContain("not deleted");
    });
});

describe("findUnaffectedIds", () => {
    it("finds rows a single-statement write silently skipped", () => {
        expect(findUnaffectedIds(["a", "b", "c"], ["a", "c"])).toEqual(["b"]);
    });

    it("reports nothing when every row was written", () => {
        expect(findUnaffectedIds(["a", "b"], ["b", "a"])).toEqual([]);
    });

    it("treats a duplicated request id as one row", () => {
        expect(findUnaffectedIds(["a", "a", "b"], ["a"])).toEqual(["b"]);
    });

    it("reports everything when the write affected nothing", () => {
        expect(findUnaffectedIds(["a", "b"], [])).toEqual(["a", "b"]);
    });
});

describe("exchanged-original refusals", () => {
    const guardError = { code: "23514", message: "This order was delivered and has an exchange or return. Keep it delivered and record the outcome on the exchange or return order." };

    it("names the exchange guard and offers no retry for it", () => {
        const summary = summarizeBulkFailures(
            [{ id: "a", error: guardError }, { id: "b", error: new Error("CONFLICT_DETECTED") }],
            [{ id: "a", order_id: "1001" }, { id: "b", order_id: "1002" }],
            5,
        );
        expect(summary.byReason.map((r) => r.reason).sort()).toEqual(["conflict", "exchanged"]);
        expect(summary.description).toContain("delivered with an exchange or return");
        expect(summary.failedIds).toEqual(["a", "b"]);
        expect(summary.retryableIds).toEqual(["b"]);
    });

    it("recognises the typed error the repository throws", () => {
        expect(classifyBulkFailure(new ExchangedOrderStatusError())).toBe("exchanged");
    });
});
