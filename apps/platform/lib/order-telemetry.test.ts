import { describe, it, expect } from "vitest";
import { isExpectedOrderError, buildOrderErrorReport } from "./order-telemetry";

describe("isExpectedOrderError", () => {
    it("treats a concurrency conflict as expected, not a fault", () => {
        // Two staff edited the same order and the second was asked to refresh.
        // Reporting these would bury real failures under routine ones.
        expect(isExpectedOrderError(new Error("CONFLICT_DETECTED"))).toBe(true);
    });

    it("treats anything else as reportable", () => {
        expect(isExpectedOrderError(new Error("permission denied for table orders"))).toBe(false);
        expect(isExpectedOrderError(new Error("Failed to fetch"))).toBe(false);
    });

    it("handles non-Error values without throwing", () => {
        expect(isExpectedOrderError("CONFLICT_DETECTED")).toBe(true);
        expect(isExpectedOrderError(undefined)).toBe(false);
        expect(isExpectedOrderError(null)).toBe(false);
    });
});

describe("buildOrderErrorReport", () => {
    it("always tags the area and the operation", () => {
        const r = buildOrderErrorReport({ operation: "updateStatus" });
        expect(r.tags.area).toBe("orders");
        expect(r.tags.operation).toBe("updateStatus");
    });

    it("tags tenant and order so a report is actionable on a multi-tenant surface", () => {
        const r = buildOrderErrorReport({ operation: "bulkDelete", tenantId: "t1", orderId: "o1" });
        expect(r.tags).toMatchObject({ tenant_id: "t1", order_id: "o1" });
    });

    it("omits empty ids rather than tagging them as undefined", () => {
        const r = buildOrderErrorReport({ operation: "createOrder", tenantId: null, orderId: undefined });
        expect(r.tags).not.toHaveProperty("tenant_id");
        expect(r.tags).not.toHaveProperty("order_id");
    });

    it("carries extra detail through to the context", () => {
        const r = buildOrderErrorReport({ operation: "shipExport", extra: { company: "waseet", count: 12 } });
        expect(r.contexts.order).toMatchObject({ company: "waseet", count: 12 });
    });
});
