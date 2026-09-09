import { describe, it, expect } from "vitest";
import { LIST_VIEW_COLUMNS } from "./order-repository";

/**
 * PERF-D1. This string is sent verbatim to PostgREST as `select=`, and the
 * result is fetched by every route in the app. Both facts make it worth pinning:
 * a stray comment breaks the query, and a re-added heavy column silently costs
 * every page load.
 */
describe("LIST_VIEW_COLUMNS", () => {
    it("carries no SQL comments — the string is sent verbatim as PostgREST select=", () => {
        expect(LIST_VIEW_COLUMNS).not.toMatch(/--/);
        expect(LIST_VIEW_COLUMNS).not.toMatch(/\/\*/);
    });

    it("THE COST: does not ship risk_data to every route", () => {
        // Measured 2026-09-09 on the largest tenant (4,743 active orders):
        // 9,951,233 bytes of JSON with risk_data, 7,147,317 without — 28.2% of
        // every route's payload, for a column the orders route and the returns
        // panel are the only readers of.
        expect(LIST_VIEW_COLUMNS).not.toContain("risk_data");
    });

    it("still carries the columns realized revenue and cycle time need (COR-D1)", () => {
        expect(LIST_VIEW_COLUMNS).toContain("delivered_at");
        expect(LIST_VIEW_COLUMNS).toContain("completed_at");
    });
});
