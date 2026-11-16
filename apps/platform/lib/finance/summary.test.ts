import { describe, expect, it } from "vitest";
import {
    FinanceSummarySchema,
    adReturn,
    barStep,
    breakEven,
    buildStatement,
    changePct,
    dayProfit,
    deliveryOverlap,
    isComparablePeriod,
    lensChange,
    perOrder,
    productRows,
    bulkDates,
    bulkDays,
    wholePercents,
    profitBars,
    profitPath,
    refusedShare,
    scaleMarks,
    stockPurchases,
    throughLens,
    waterfall,
    type FinanceSummary,
    type FinanceSummaryDay,
} from "./summary";

const day = (d: string, over: Partial<FinanceSummaryDay> = {}): FinanceSummaryDay => ({
    day: d, orders: 0, revenue: 0, product_cost: 0, courier: 0, courier_file: 0, refunds: 0, expenses: 0, salaries: 0, ...over,
});

/** A shop's month, shaped like get_finance_summary()'s answer. */
function summary(over: Partial<FinanceSummary> = {}): FinanceSummary {
    return {
        from: "2026-11-01",
        to: "2026-11-03",
        sales: { orders: 10, revenue: 400_000, units: 12, product_cost: 150_000, missing_cost_units: 0, paid_orders: 0 },
        refunds: { count: 1, amount: 40_000 },
        expenses: [
            { category: "marketing", amount: 60_000 },
            { category: "shipping", amount: 10_000 },
            { category: "packaging", amount: 5_000 },
            { category: "other", amount: 15_000 },
        ],
        salaries_paid: 20_000,
        courier: { prime_fee: 30_000, prime_parcels: 6, file_fee: 0, file_orders: 0 },
        cash: {
            in_transit: { count: 4, amount: 160_000 },
            stuck: { count: 1, amount: 40_000 },
            returning: { count: 0, amount: 0 },
            prime_linked: true,
            prime_held: { parcels: 2, collected: 80_000, fee: 10_000 },
            reached: { payments: 2, amount: 300_000, last_day: "2026-11-02", last_amount: 120_000 },
            split: { reached: 330_000, reached_orders: 7, fee: 30_000, unpaid: 40_000, unpaid_orders: 3, unpaid_prime: 1, reached_before: 0, reached_now: 0, reached_other: 0, reached_prepaid: 0, reached_prepaid_orders: 0 },
        statement: { returns: 0, returns_orders: 0, returns_open: 0, returns_open_orders: 0, prepaid_gap: 0, prepaid_orders: 0, price_gap: 0, price_gap_orders: 0, undelivered: 0, undelivered_orders: 0 },
        statement_orders: [],
            unpaid_list: [],
        },
        failed: { refused_orders: 2, refused_value: 80_000, prime_returned_parcels: 1, prime_returned_fee: 5_000 },
        daily: [
            day("2026-11-01", { orders: 6, revenue: 240_000, product_cost: 90_000, courier: 20_000, expenses: 50_000 }),
            day("2026-11-02", { orders: 4, revenue: 160_000, product_cost: 60_000, courier: 10_000, refunds: 40_000, expenses: 40_000 }),
            day("2026-11-03", { courier: 5_000, salaries: 20_000 }),
        ],
        products: [
            { key: "p1", name: "Envoy", image_url: "https://x.supabase.co/storage/v1/object/public/p/envoy.webp", units: 8, revenue: 300_000, cost: 110_000, missing_units: 0 },
            { key: "p2", name: "Wayfarer", image_url: null, units: 4, revenue: 100_000, cost: 40_000, missing_units: 1 },
        ],
        stock: { pieces: 120, costed_pieces: 100, cost_value: 900_000, missing_cost_products: 2, top: [] },
        ...over,
    };
}

describe("FinanceSummarySchema", () => {
    it("accepts the database's answer and refuses one with a figure missing", () => {
        expect(FinanceSummarySchema.safeParse(summary()).success).toBe(true);
        expect(FinanceSummarySchema.safeParse({ ...summary(), salaries_paid: undefined }).success).toBe(false);
        // a server older than the unpaid list sends none: the card shows no list rather than failing
        const old = summary();
        const parsed = FinanceSummarySchema.parse({ ...old, cash: { ...old.cash, unpaid_list: undefined } });
        expect(parsed.cash.unpaid_list).toEqual([]);
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

    it("adds the courier's fee on delivered and returned parcels to typed courier bills", () => {
        expect(line("delivery")?.amount).toBe(45_000);
        expect(line("delivery")?.parts).toEqual([
            { key: "prime_fee", amount: 30_000 },
            { key: "prime_returned_fee", amount: 5_000 },
            { key: "courier_bills", amount: 10_000 },
        ]);
    });

    it("leaves a part out of the delivery line when it is zero", () => {
        const s = summary();
        const none = buildStatement({ ...s, failed: { ...s.failed, prime_returned_parcels: 0, prime_returned_fee: 0 } });
        expect(none.lines.find((l) => l.id === "delivery")?.parts.map((p) => p.key)).toEqual(["prime_fee", "courier_bills"]);
        expect(none.netProfit).toBe(70_000);
    });

    it("counts what the courier kept in the payment files as delivery, ahead of the other parts", () => {
        const s = summary();
        const withFiles = buildStatement({ ...s, courier: { ...s.courier, file_fee: 25_000, file_orders: 5 } });
        const delivery = withFiles.lines.find((l) => l.id === "delivery");
        expect(delivery?.amount).toBe(70_000);
        expect(delivery?.parts[0]).toEqual({ key: "file_fee", amount: 25_000 });
        expect(withFiles.netProfit).toBe(statement.netProfit - 25_000);
    });

    it("subtracts every cost from sales exactly once", () => {
        // 400,000 - 150,000 - 60,000 - 45,000 - 40,000 - 20,000 - 20,000
        expect(statement.totalCosts).toBe(335_000);
        expect(statement.netProfit).toBe(65_000);
        expect(statement.margin).toBeCloseTo(0.1625);
    });

    it("gives each line its share of sales", () => {
        expect(line("product_cost")?.share).toBeCloseTo(0.375);
    });

    it("reports a loss, and no margin when nothing was sold", () => {
        const empty = buildStatement(summary({ sales: { orders: 0, revenue: 0, units: 0, product_cost: 0, missing_cost_units: 0, paid_orders: 0 } }));
        expect(empty.netProfit).toBe(-185_000);
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

    it("still agree when the courier kept a fee in the payment files", () => {
        const base = summary();
        const s = summary({
            courier: { ...base.courier, file_fee: 25_000, file_orders: 5 },
            daily: base.daily.map((d, i) => (i === 0 ? { ...d, courier_file: 15_000 } : i === 1 ? { ...d, courier_file: 10_000 } : d)),
        });
        expect(dayProfit(s.daily[0])).toBe(dayProfit(base.daily[0]) - 15_000);
        expect(s.daily.reduce((sum, d) => sum + dayProfit(d), 0)).toBe(buildStatement(s).netProfit);
    });
});

describe("deliveryOverlap", () => {
    it("speaks up only when the payment files and typed courier bills both carry a fee", () => {
        const s = summary();
        expect(deliveryOverlap(s)).toBeNull();
        expect(deliveryOverlap({ ...s, courier: { ...s.courier, file_fee: 25_000, file_orders: 5 } })).toEqual({ fileFee: 25_000, bills: 10_000 });
        expect(deliveryOverlap({ ...s, expenses: [], courier: { ...s.courier, file_fee: 25_000, file_orders: 5 } })).toBeNull();
    });
});

describe("scaleMarks", () => {
    it("marks zero and round steps up to the highest value, never fewer than three marks", () => {
        expect(scaleMarks(0, 6_600_000)).toEqual([0, 2_500_000, 5_000_000]);
        expect(scaleMarks(0, 9_000_000)).toEqual([0, 2_500_000, 5_000_000, 7_500_000]);
        expect(scaleMarks(0, 2_700_000)).toEqual([0, 1_000_000, 2_000_000]);
        expect(scaleMarks(0, 450_000)).toEqual([0, 200_000, 400_000]);
        expect(scaleMarks(0, 115_000)).toEqual([0, 50_000, 100_000]);
    });

    it("goes under zero for a period that dipped into a loss, and stays at zero when nothing moved", () => {
        expect(scaleMarks(-1_100_000, 1_995_756)).toEqual([-1_000_000, 0, 1_000_000]);
        expect(scaleMarks(-300_000, 700_000)).toEqual([-250_000, 0, 250_000, 500_000]);
        expect(scaleMarks(0, 0)).toEqual([0]);
    });
});

describe("perOrder", () => {
    it("divides by delivered orders and has no answer without any", () => {
        expect(perOrder(70_000, 10)).toBe(7_000);
        expect(perOrder(100, 3)).toBe(33);
        expect(perOrder(70_000, 0)).toBeNull();
    });
});

describe("stock purchases", () => {
    const withPurchase = summary({ expenses: [...summary().expenses, { category: "product_cost", amount: 90_000 }] });

    it("are cash out, never a cost of the period", () => {
        expect(stockPurchases(withPurchase)).toBe(90_000);
        expect(buildStatement(withPurchase).netProfit).toBe(buildStatement(summary()).netProfit);
        expect(buildStatement(withPurchase).lines.find((l) => l.id === "other")?.parts.map((part) => part.key)).toEqual(["packaging", "other"]);
    });

    it("are zero when none was typed", () => {
        expect(stockPurchases(summary())).toBe(0);
    });
});

describe("throughLens", () => {
    const statement = buildStatement(summary());

    it("reads a figure as a total or per delivered order", () => {
        expect(throughLens(60_000, statement, "total")).toBe(60_000);
        expect(throughLens(60_000, statement, "order")).toBe(6_000);
    });

    it("has no per-order answer when nothing was delivered", () => {
        const empty = buildStatement(summary({ sales: { orders: 0, revenue: 0, units: 0, product_cost: 0, missing_cost_units: 0, paid_orders: 0 } }));
        expect(throughLens(60_000, empty, "total")).toBe(60_000);
        expect(throughLens(60_000, empty, "order")).toBeNull();
    });
});

describe("waterfall", () => {
    it("steps down from sales to the margin, each cost starting where the next one ends", () => {
        const statement = buildStatement(summary());
        const steps = waterfall(statement);
        expect(steps.map((step) => step.id)).toEqual(["product_cost", "ads", "delivery", "refunds", "other", "salaries"]);
        expect(steps[0].start).toBeCloseTo(0.625);
        expect(steps[0].width).toBeCloseTo(0.375);
        steps.slice(1).forEach((step, i) => expect(step.start + step.width).toBeCloseTo(steps[i].start));
        expect(steps[steps.length - 1].start).toBeCloseTo(statement.margin ?? Number.NaN);
    });

    it("cuts a cost that is bigger than what is left, and skips empty lines", () => {
        const steps = waterfall(buildStatement(summary({ salaries_paid: 200_000, refunds: { count: 0, amount: 0 } })));
        expect(steps.map((step) => step.id)).not.toContain("refunds");
        const salaries = steps[steps.length - 1];
        expect(salaries.start).toBeCloseTo(0);
        expect(salaries.width).toBeCloseTo(0.3125);
    });
});

describe("adReturn", () => {
    it("says what each 1,000 IQD of ads brought in sales", () => {
        expect(adReturn(buildStatement(summary()))).toBe(6_667);
    });

    it("has no answer when nothing was spent on ads", () => {
        expect(adReturn(buildStatement(summary({ expenses: [] })))).toBeNull();
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

describe("profitPath", () => {
    it("adds the days up, ending on the net profit", () => {
        const { step, points } = profitPath(summary().daily);
        expect(step).toBe("day");
        expect(points.map((point) => point.running)).toEqual([80_000, 90_000, 65_000]);
        expect(points[points.length - 1].running).toBe(buildStatement(summary()).netProfit);
    });

    it("is empty for an empty period", () => {
        expect(profitPath([]).points).toEqual([]);
    });
});

describe("bulkDays", () => {
    it("names the days that hold a big part of the period's orders, marked delivered at once", () => {
        // the live shop on 16 Nov: 206 and 138 of 406 orders on two days
        const daily = [206, 1, 5, 1, 1, 1, 1, 138, 17, 17, 11, 1, 6].map((orders) => ({ orders }));
        const bulk = bulkDays(daily);
        expect(bulk?.days).toBe(2);
        expect(bulk?.share).toBeCloseTo(344 / 406);
        expect(bulk?.orders).toBe(344);
        expect(bulk?.total).toBe(406);
    });

    it("leaves a steady period, a small one and an empty one alone", () => {
        expect(bulkDays([14, 12, 15, 13, 16].map((orders) => ({ orders })))).toBeNull();
        expect(bulkDays([3, 1, 0, 2].map((orders) => ({ orders })))).toBeNull();
        expect(bulkDays([])).toBeNull();
    });

    it("gives the dates of those days, so the chart can say its big days were bulk marking", () => {
        const daily = [206, 1, 5, 138, 17].map((orders, i) => ({ day: `2026-10-${String(18 + i)}`, orders }));
        expect([...bulkDates(daily)]).toEqual(["2026-10-18", "2026-10-21"]);
        expect(bulkDates([14, 12, 15].map((orders, i) => ({ day: `2026-11-0${i + 1}`, orders }))).size).toBe(0);
    });
});

describe("productRows", () => {
    it("shows profit before ads and delivery, and flags pieces with no cost", () => {
        const rows = productRows(summary());
        expect(rows[0]).toMatchObject({ name: "Envoy", sales: 300_000, cost: 110_000, profit: 190_000, missingUnits: 0 });
        expect(rows[0].margin).toBeCloseTo(0.6333, 3);
        expect(rows[1].missingUnits).toBe(1);
    });

    it("carries the picture, the profit on one piece and each product's part of the profit", () => {
        const rows = productRows(summary());
        expect(rows[0]).toMatchObject({ imageUrl: "https://x.supabase.co/storage/v1/object/public/p/envoy.webp", profitPerPiece: 23_750 });
        expect(rows[0].profitShare).toBeCloseTo(0.76);
        expect(rows[1]).toMatchObject({ imageUrl: null, profitPerPiece: 15_000 });
        expect(rows[1].profitShare).toBeCloseTo(0.24);
    });

    it("ranks by what was earned, not by what was sold, and gives a losing product no part", () => {
        const rows = productRows(summary({
            products: [
                { key: "big", name: "Big seller", image_url: null, units: 10, revenue: 500_000, cost: 480_000, missing_units: 0 },
                { key: "earner", name: "Earner", image_url: null, units: 2, revenue: 100_000, cost: 20_000, missing_units: 0 },
                { key: "loser", name: "Loser", image_url: null, units: 1, revenue: 10_000, cost: 30_000, missing_units: 0 },
            ],
        }));
        expect(rows.map((row) => row.key)).toEqual(["earner", "big", "loser"]);
        expect(rows[0].profitShare).toBeCloseTo(0.8);
        expect(rows[2].profitShare).toBe(0);
    });

    it("shows whole percents that add up to 100, not 99", () => {
        // the live shop's three products: 4,528,591 / 4,034,200 / 2,198,535 used to read 42 + 37 + 20
        expect(wholePercents([4_528_591, 4_034_200, 2_198_535].map((p) => p / 10_761_326))).toEqual([42, 38, 20]);
        expect(wholePercents([1 / 3, 1 / 3, 1 / 3])).toEqual([34, 33, 33]);
        expect(wholePercents([0.8, 0.2, 0])).toEqual([80, 20, 0]);
        expect(wholePercents([])).toEqual([]);
        const rows = productRows(summary());
        expect(rows.reduce((sum, row) => sum + row.sharePercent, 0)).toBe(100);
    });

    it("has no margin for a product given away", () => {
        const rows = productRows(summary({ products: [{ key: "g", name: "Gift", image_url: null, units: 1, revenue: 0, cost: 5_000, missing_units: 0 }] }));
        expect(rows[0].margin).toBeNull();
        expect(rows[0].profit).toBe(-5_000);
        expect(rows[0].profitPerPiece).toBe(-5_000);
    });
});

describe("money still outside", () => {
    it("counts refused parcels against the ones that reached a door", () => {
        expect(refusedShare(summary())).toBeCloseTo(2 / 12);
        expect(
            refusedShare(summary({
                sales: { orders: 0, revenue: 0, units: 0, product_cost: 0, missing_cost_units: 0, paid_orders: 0 },
                failed: { refused_orders: 0, refused_value: 0, prime_returned_parcels: 0, prime_returned_fee: 0 },
            })),
        ).toBeNull();
    });
});

describe("lensChange", () => {
    const now = buildStatement(summary());
    const before = buildStatement(summary({ sales: { orders: 20, revenue: 320_000, units: 22, product_cost: 120_000, missing_cost_units: 0, paid_orders: 0 } }));

    it("compares the figure on screen with the same figure before", () => {
        // 150,000 against 120,000 in total; 15,000 an order against 6,000
        expect(lensChange(150_000, now, 120_000, before, "total")).toBe(25);
        expect(lensChange(150_000, now, 120_000, before, "order")).toBe(150);
        // ads: 6,000 an order now, 3,000 before
        expect(lensChange(60_000, now, 60_000, before, "order")).toBe(100);
    });

    it("compares no average against a period that delivered too few orders, only the totals", () => {
        const thin = buildStatement(summary({ sales: { orders: 8, revenue: 320_000, units: 9, product_cost: 120_000, missing_cost_units: 0, paid_orders: 0 } }));
        expect(lensChange(150_000, now, 120_000, thin, "total")).toBe(25);
        expect(lensChange(150_000, now, 120_000, thin, "order")).toBeNull();
    });

    it("has no answer when the period before delivered nothing", () => {
        const empty = buildStatement(summary({ sales: { orders: 0, revenue: 0, units: 0, product_cost: 0, missing_cost_units: 0, paid_orders: 0 } }));
        expect(lensChange(150_000, now, 0, empty, "total")).toBeNull();
        expect(lensChange(150_000, now, 0, empty, "order")).toBeNull();
        expect(lensChange(150_000, empty, 120_000, before, "order")).toBeNull();
    });
});

describe("isComparablePeriod", () => {
    const now = buildStatement(summary());
    const sold = (revenue: number) => buildStatement(summary({ sales: { orders: 20, revenue, units: 22, product_cost: 0, missing_cost_units: 0, paid_orders: 0 } }));

    it("takes a period before that sold a fair share of today's sales", () => {
        expect(isComparablePeriod(now, sold(320_000))).toBe(true);
        // today's 400,000 is ten times 40,000: still a base
        expect(isComparablePeriod(now, sold(40_000))).toBe(true);
    });

    it("refuses a period before that sold nothing, or under a tenth of today's sales", () => {
        expect(isComparablePeriod(now, sold(0))).toBe(false);
        expect(isComparablePeriod(now, sold(30_000))).toBe(false);
    });
});

describe("breakEven", () => {
    it("divides the daily bill by what one delivered order leaves", () => {
        const s = summary();
        const even = breakEven(s, buildStatement(s));
        // one order leaves (400,000 - 150,000 - 45,000 - 40,000) / 10; ads + other + salaries are 100,000 over 3 days
        expect(even?.leftPerOrder).toBe(16_500);
        expect(even?.dailyBill).toBe(33_333);
        expect(even?.needed).toBeCloseTo(100_000 / 3 / 16_500);
        expect(even?.delivered).toBeCloseTo(10 / 3);
    });

    it("pays the whole net profit out of the orders past break-even", () => {
        const s = summary();
        const statement = buildStatement(s);
        const even = breakEven(s, statement);
        const past = (even?.delivered ?? 0) - (even?.needed ?? 0);
        expect(past * 16_500 * s.daily.length).toBeCloseTo(statement.netProfit);
    });

    it("needs no orders when nothing is spent by the day, and has no answer when an order leaves nothing", () => {
        const free = summary({ expenses: [], salaries_paid: 0 });
        expect(breakEven(free, buildStatement(free))?.needed).toBe(0);
        const losing = summary({ sales: { orders: 10, revenue: 400_000, units: 12, product_cost: 400_000, missing_cost_units: 0, paid_orders: 0 } });
        expect(breakEven(losing, buildStatement(losing))?.needed).toBeNull();
    });

    it("has nothing to say when nothing was delivered", () => {
        const none = summary({ sales: { orders: 0, revenue: 0, units: 0, product_cost: 0, missing_cost_units: 0, paid_orders: 0 } });
        expect(breakEven(none, buildStatement(none))).toBeNull();
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
