import { describe, expect, it } from "vitest";
import { planMetaExpenses } from "./meta-ads-expenses";

describe("planMetaExpenses", () => {
    it("sums campaigns into one row per day with a stable key", () => {
        const rows = planMetaExpenses(
            "t1",
            [
                { spendDate: "2026-11-01", spendIqd: 1000 },
                { spendDate: "2026-11-01", spendIqd: 2500 },
                { spendDate: "2026-10-31", spendIqd: 700 },
            ],
            new Set(),
        );
        expect(rows.map((r) => [r.expense_date, r.amount, r.external_key])).toEqual([
            ["2026-10-31", 700, "meta_ads:2026-10-31"],
            ["2026-11-01", 3500, "meta_ads:2026-11-01"],
        ]);
        expect(rows.every((r) => r.tenant_id === "t1" && r.category === "marketing" && r.source === "meta_ads")).toBe(true);
    });

    it("skips days that already have a manual marketing expense", () => {
        const rows = planMetaExpenses("t1", [{ spendDate: "2026-11-01", spendIqd: 900 }], new Set(["2026-11-01"]));
        expect(rows).toEqual([]);
    });

    it("skips zero-spend days", () => {
        expect(planMetaExpenses("t1", [{ spendDate: "2026-11-01", spendIqd: 0 }], new Set())).toEqual([]);
    });
});
