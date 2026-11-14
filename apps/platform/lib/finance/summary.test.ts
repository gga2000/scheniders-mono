import { describe, expect, it } from "vitest";
import {
    FinanceSummarySchema,
    averageOrder,
    barStep,
    buildStatement,
    changePct,
    dayProfit,
    perOrder,
    primeOwes,
    productRows,
    profitBars,
    refusedShare,
    type FinanceSummary,
    type FinanceSummaryDay,
} from "./summary";

const day = (d: string, over: Partial<FinanceSummaryDay> = {}): FinanceSummaryDay => ({
    day: d, orders: 0, revenue: 0, product_cost: 0, courier: 0, refunds: 0, expenses: 0, salaries: 0, ...over,
});

/** A shop's month, shaped like get_finance_summary()'s answer. */
function summary(over: Partial<FinanceSummary> = {}): FinanceSummary {
    return {
        from: "2026-11-01",
        to: "2026-11-03",
        sales: { orders: 10, revenue: 400_000, units: 12, product_cost: 150_000, missing_cost_units: 0 },
        refunds: { count: 1, amount: 40_000 },
        expenses: [
            { category: "marketing", amount: 60_000 },
            { category: "shipping", amount: 10_000 },
            { category: "packaging", amount: 5_000 },
            { category: "other", amount: 15_000 },
        ],
        salaries_paid: 20_000,
        courier: { prime_fee: 30_000, prime_parcels: 6 },
        cash: {
            in_transit: { count: 4, amount: 160_000 },
            stuck: { count: 1, amount: 40_000 },
            prime_linked: true,
            prime_held: { parcels: 2, collected: 80_000, fee: 10_000 },
        },
        failed: { refused_orders: 2, refused_value: 80_000, prime_returned_parcels: 1, prime_returned_fee: 5_000 },
        daily: [
            day("2026-11-01", { orders: 6, revenue: 240_000, product_cost: 90_000, courier: 20_000, expenses: 50_000 }),
            day("2026-11-02", { orders: 4, revenue: 160_000, product_cost: 60_000, courier: 10_000, refunds: 40_000, expenses: 40_000 }),
            day("2026-11-03", { salaries: 20_000 }),
        ],
        products: [
            { key: "p1", name: "Envoy", units: 8, revenue: 300_000, cost: 110_000, missing_units: 0 },
            { key: "p2", name: "Wayfarer", units: 4, revenue: 100_000, cost: 40_000, missing_units: 1 },
        ],
        ...over,
    };
}

describe("FinanceSummarySchema", () => {
    it("accepts the database's answer and refuses one with a figure missing", () => {
        expect(FinanceSummarySchema.safeParse(summary()).success).toBe(true);
        expect(FinanceSummarySchema.safeParse({ ...summary(), salaries_paid: undefined }).success).toBe(false);
    });
});

describe("buildStatement", () => {
    const statement = buildStatement(summary());
    const line = (id: string) => statement.lines.find((l) => l.id === id);

    it("lists the six cost lines in a fixed order", () => {
        expect(statement.lines.map((l) => l.id)).toEqual(["product_cost", "ads", "delivery", "refunds", "other", "salaries"]);
    });

    it("counts marketing expenses as ads and nowhere else", () => {
        expect(line("ads")?.amount).toBe(60_000);
        expect(line("other")?.parts.map((p) => p.key)).toEqual(["packaging", "other"]);
    });

    it("adds the courier's fee on delivered parcels to typed courier bills", () => {
        expect(line("delivery")?.amount).toBe(40_000);
        expect(line("delivery")?.parts).toEqual([
            { key: "prime_fee", amount: 30_000 },
            { key: "courier_bills", amount: 10_000 },
        ]);
    });

    it("subtracts every cost from sales exactly once", () => {
        // 400,000 - 150,000 - 60,000 - 40,000 - 40,000 - 20,000 - 20,000
        expect(statement.totalCosts).toBe(330_000);
        expect(statement.netProfit).toBe(70_000);
        expect(statement.margin).toBeCloseTo(0.175);
    });

    it("gives each line its share of sales", () => {
        expect(line("product_cost")?.share).toBeCloseTo(0.375);
    });

    it("reports a loss, and no margin when nothing was sold", () => {
        const empty = buildStatement(summary({ sales: { orders: 0, revenue: 0, units: 0, product_cost: 0, missing_cost_units: 0 } }));
        expect(empty.netProfit).toBe(-180_000);
        expect(empty.margin).toBeNull();
        expect(empty.lines.every((l) => l.share === 0)).toBe(true);
    });
});

describe("the days and the statement agree", () => {
    it("daily profits add up to the net profit", () => {
        const s = summary();
        const total = s.daily.reduce((sum, d) => sum + dayProfit(d), 0);
        expect(total).toBe(buildStatement(s).netProfit);
    });
});

describe("perOrder", () => {
    it("divides by delivered orders and has no answer without any", () => {
        expect(perOrder(70_000, 10)).toBe(7_000);
        expect(perOrder(100, 3)).toBe(33);
        expect(perOrder(70_000, 0)).toBeNull();
    });
});

describe("averageOrder", () => {
    it("splits the average order into slices that fill the bar", () => {
        const avg = averageOrder(buildStatement(summary()));
        expect(avg?.price).toBe(40_000);
        expect(avg?.profit).toBe(7_000);
        expect(avg?.slices.map((s) => [s.id, s.amount])).toEqual([
            ["product_cost", 15_000],
            ["ads", 6_000],
            ["delivery", 4_000],
            ["other", 8_000],
            ["profit", 7_000],
        ]);
        expect(avg?.slices.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1);
    });

    it("drops the profit slice when the order loses money", () => {
        const avg = averageOrder(buildStatement(summary({ salaries_paid: 200_000 })));
        expect(avg?.slices.some((s) => s.id === "profit")).toBe(false);
        expect(avg?.profit).toBe(-11_000);
        expect(avg?.slices.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1);
    });

    it("has nothing to show when no order was delivered", () => {
        expect(averageOrder(buildStatement(summary({ sales: { orders: 0, revenue: 0, units: 0, product_cost: 0, missing_cost_units: 0 } })))).toBeNull();
    });
});

describe("profitBars", () => {
    const days = (n: number, start = "2026-01-01") =>
        Array.from({ length: n }, (_, i) => {
            const d = new Date(Date.parse(`${start}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
            return day(d, { orders: 1, revenue: 1_000, product_cost: 400 });
        });

    it("picks a step the chart can still show", () => {
        expect(barStep(30)).toBe("day");
        expect(barStep(62)).toBe("day");
        expect(barStep(63)).toBe("week");
        expect(barStep(365)).toBe("week");
        expect(barStep(400)).toBe("month");
    });

    it("keeps one bar a day for a month", () => {
        const { step, bars } = profitBars(days(30));
        expect(step).toBe("day");
        expect(bars).toHaveLength(30);
        expect(bars[0]).toEqual({ from: "2026-01-01", to: "2026-01-01", orders: 1, sales: 1_000, profit: 600 });
    });

    it("groups a quarter into weeks without losing a dinar", () => {
        const { step, bars } = profitBars(days(90));
        expect(step).toBe("week");
        expect(bars).toHaveLength(13);
        expect(bars[0]).toMatchObject({ from: "2026-01-01", to: "2026-01-07", orders: 7, sales: 7_000, profit: 4_200 });
        expect(bars[12]).toMatchObject({ from: "2026-03-26", to: "2026-03-31", orders: 6 });
        expect(bars.reduce((sum, b) => sum + b.profit, 0)).toBe(90 * 600);
    });

    it("groups two years into calendar months", () => {
        const { step, bars } = profitBars(days(400));
        expect(step).toBe("month");
        expect(bars[0]).toMatchObject({ from: "2026-01-01", to: "2026-01-31", orders: 31 });
        expect(bars[1]).toMatchObject({ from: "2026-02-01", to: "2026-02-28", orders: 28 });
        expect(bars.reduce((sum, b) => sum + b.orders, 0)).toBe(400);
    });
});

describe("productRows", () => {
    it("shows profit before ads and delivery, and flags pieces with no cost", () => {
        const rows = productRows(summary());
        expect(rows[0]).toMatchObject({ name: "Envoy", sales: 300_000, cost: 110_000, profit: 190_000, missingUnits: 0 });
        expect(rows[0].margin).toBeCloseTo(0.6333, 3);
        expect(rows[1].missingUnits).toBe(1);
    });

    it("has no margin for a product given away", () => {
        const rows = productRows(summary({ products: [{ key: "g", name: "Gift", units: 1, revenue: 0, cost: 5_000, missing_units: 0 }] }));
        expect(rows[0].margin).toBeNull();
        expect(rows[0].profit).toBe(-5_000);
    });
});

describe("money still outside", () => {
    it("counts refused parcels against the ones that reached a door", () => {
        expect(refusedShare(summary())).toBeCloseTo(2 / 12);
        expect(
            refusedShare(summary({
                sales: { orders: 0, revenue: 0, units: 0, product_cost: 0, missing_cost_units: 0 },
                failed: { refused_orders: 0, refused_value: 0, prime_returned_parcels: 0, prime_returned_fee: 0 },
            })),
        ).toBeNull();
    });

    it("takes Prime's own fee off what it collected", () => {
        expect(primeOwes(summary())).toBe(70_000);
    });
});

describe("changePct", () => {
    it("compares against the earlier period, and refuses a zero or missing base", () => {
        expect(changePct(150, 100)).toBe(50);
        expect(changePct(50, 100)).toBe(-50);
        expect(changePct(50, 0)).toBeNull();
        expect(changePct(50, -20)).toBeNull();
        expect(changePct(50, null)).toBeNull();
    });
});
