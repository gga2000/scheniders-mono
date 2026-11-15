/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import type { UseQueryResult } from "@tanstack/react-query";
import { LanguageProvider } from "@/components/providers/language-provider";
import type { FinanceSummary } from "@/lib/finance/summary";
import { SummaryView } from "./summary-view";

// The real NumberFlow draws digits in a shadow root jsdom cannot read: render the final formatted text instead.
vi.mock("@/components/ui/number-ticker", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/components/ui/number-ticker")>()),
    NumberTicker: ({ value, format }: { value: number; format?: Intl.NumberFormatOptions }) => (
        <span>{new Intl.NumberFormat("en-US", format).format(value)}</span>
    ),
}));

afterEach(cleanup);

function summary(over: Partial<FinanceSummary> = {}): FinanceSummary {
    return {
        from: "2026-11-01",
        to: "2026-11-02",
        sales: { orders: 10, revenue: 400_000, units: 12, product_cost: 150_000, missing_cost_units: 0 },
        refunds: { count: 1, amount: 40_000 },
        expenses: [
            { category: "marketing", amount: 60_000 },
            { category: "packaging", amount: 5_000 },
        ],
        salaries_paid: 0,
        courier: { prime_fee: 30_000, prime_parcels: 6 },
        cash: {
            in_transit: { count: 4, amount: 160_000 },
            stuck: { count: 0, amount: 0 },
            prime_linked: true,
            prime_held: { parcels: 2, collected: 80_000, fee: 10_000 },
            reached: { payments: 2, amount: 300_000, last_day: "2026-11-02", last_amount: 120_000 },
        },
        failed: { refused_orders: 2, refused_value: 80_000, prime_returned_parcels: 0, prime_returned_fee: 0 },
        daily: [
            { day: "2026-11-01", orders: 6, revenue: 240_000, product_cost: 90_000, courier: 20_000, refunds: 0, expenses: 35_000, salaries: 0 },
            { day: "2026-11-02", orders: 4, revenue: 160_000, product_cost: 60_000, courier: 10_000, refunds: 40_000, expenses: 30_000, salaries: 0 },
        ],
        stock: { pieces: 120, costed_pieces: 100, cost_value: 900_000, missing_cost_products: 0 },
        products: [{ key: "p1", name: "Envoy", image_url: null, units: 12, revenue: 400_000, cost: 150_000, missing_units: 0 }],
        ...over,
    };
}

const refetch = vi.fn();
const query = (data: FinanceSummary | undefined, over: Record<string, unknown> = {}) =>
    ({ data, isError: false, isPlaceholderData: false, refetch, ...over }) as unknown as UseQueryResult<FinanceSummary>;

function renderView(current: UseQueryResult<FinanceSummary>, previous: UseQueryResult<FinanceSummary> | null = null, onOpenTab = vi.fn()) {
    render(
        <LanguageProvider>
            <SummaryView current={current} previous={previous} onOpenTab={onOpenTab} />
        </LanguageProvider>,
    );
    return onOpenTab;
}

const stat = (key: string) => document.querySelector(`[data-stat="${key}"]`)?.textContent ?? "";
const line = (id: string) => document.querySelector(`[data-line="${id}"]`);
const byTestId = (id: string) => document.querySelector(`[data-testid="${id}"]`);

describe("SummaryView", () => {
    it("shows the strip figures from one database answer", () => {
        renderView(query(summary()));
        // 400,000 - 150,000 - 60,000 - 30,000 - 40,000 - 5,000
        expect(stat("net_profit")).toContain("115,000");
        expect(stat("sales")).toContain("400,000");
        expect(stat("profit_per_order")).toContain("11,500");
        expect(stat("ad_per_order")).toContain("6,000");
        expect(stat("on_road")).toContain("160,000");
        expect(stat("stuck")).toBe("0");
    });

    it("lists every cost line with a minus, folds the empty ones, then the net profit and what stays of each 1,000", () => {
        renderView(query(summary()));
        expect(line("sales")?.textContent).toContain("400,000");
        expect(line("product_cost")?.textContent).toContain("−150,000");
        expect(line("ads")?.textContent).toContain("−60,000");
        expect(line("delivery")?.textContent).toContain("−30,000");
        expect(line("refunds")?.textContent).toContain("−40,000");
        expect(line("other")?.textContent).toContain("−5,000");
        expect(line("salaries")).toBeNull();
        expect(byTestId("statement-quiet")?.textContent).toContain("رواتب مدفوعة");
        expect(line("net")?.textContent).toContain("115,000");
        expect(byTestId("statement-plain")?.textContent).toContain("288");
    });

    it("re-reads the statement per order and per 1,000 IQD sold", () => {
        renderView(query(summary()));
        const lens = (name: string) => document.querySelector(`[data-lens="${name}"]`);
        expect(lens("total")?.getAttribute("aria-pressed")).toBe("true");
        const perOrder = lens("order");
        if (perOrder) fireEvent.click(perOrder);
        expect(lens("order")?.getAttribute("aria-pressed")).toBe("true");
        expect(line("sales")?.textContent).toContain("40,000");
        expect(line("product_cost")?.textContent).toContain("−15,000");
        expect(line("net")?.textContent).toContain("11,500");
        const perThousand = lens("thousand");
        if (perThousand) fireEvent.click(perThousand);
        expect(line("sales")?.textContent).toContain("1,000");
        expect(line("product_cost")?.textContent).toContain("−375");
        expect(line("ads")?.textContent).toContain("−150");
    });

    it("sends the quiet line's link to Expenses", () => {
        const onOpenTab = renderView(query(summary()));
        const add = byTestId("statement-quiet")?.querySelector("button");
        if (add) fireEvent.click(add);
        expect(onOpenTab).toHaveBeenCalledWith("expenses");
    });

    it("opens a cost line to show what is inside, and its link opens the tab", () => {
        const onOpenTab = renderView(query(summary()));
        const row = line("delivery");
        const toggle = row?.querySelector("button");
        expect(toggle?.getAttribute("aria-expanded")).toBe("false");
        if (toggle) fireEvent.click(toggle);
        expect(toggle?.getAttribute("aria-expanded")).toBe("true");
        // Prime's fee on the 6 delivered parcels.
        expect(row?.textContent).toContain("6");
        expect(row?.textContent).toContain("30,000");
        const link = [...(row?.querySelectorAll("button") ?? [])].at(-1);
        if (link) fireEvent.click(link);
        expect(onOpenTab).toHaveBeenCalledWith("expenses");
    });

    it("counts Prime's fee on parcels that came back in the delivery line", () => {
        const s = summary();
        renderView(query(summary({
            failed: { ...s.failed, prime_returned_parcels: 3, prime_returned_fee: 15_000 },
            daily: s.daily.map((d, i) => (i === 1 ? { ...d, courier: d.courier + 15_000 } : d)),
        })));
        // 30,000 on delivered parcels + 15,000 on the 3 that came back.
        expect(line("delivery")?.textContent).toContain("−45,000");
        expect(stat("net_profit")).toContain("100,000");
        const toggle = line("delivery")?.querySelector("button");
        if (toggle) fireEvent.click(toggle);
        expect(line("delivery")?.textContent).toContain("15,000");
    });

    it("shows what Prime still owes after its own fee", () => {
        renderView(query(summary()));
        expect(byTestId("money-prime")?.textContent).toContain("70,000");
        expect(byTestId("money-road")?.textContent).toContain("160,000");
    });

    it("ends the road on the courier payments that reached the shop in the period", () => {
        renderView(query(summary()));
        expect(byTestId("money-reached")?.textContent).toContain("300,000");
        expect(byTestId("money-reached")?.textContent).toContain("120,000");
        cleanup();
        const s = summary();
        renderView(query(summary({ cash: { ...s.cash, reached: { payments: 0, amount: 0, last_day: null, last_amount: 0 } } })));
        expect(byTestId("money-reached")?.textContent).toContain("لا توجد دفعة");
    });

    it("names the stuck parcels on the road they are stuck on", () => {
        renderView(query(summary()));
        expect(byTestId("money-stuck")).toBeNull();
        cleanup();
        const s = summary();
        renderView(query(summary({ cash: { ...s.cash, stuck: { count: 2, amount: 50_000 } } })));
        expect(byTestId("money-stuck")?.textContent).toContain("50,000");
    });

    it("says how often a parcel comes back, and what the way back cost", () => {
        renderView(query(summary()));
        // 2 refused of 12 that reached a door.
        expect(byTestId("failed-share")?.textContent).toContain("17");
        expect(byTestId("returned-parcels")?.textContent).toContain("80,000");
        expect(byTestId("failed-fee")).toBeNull();
        cleanup();
        const s = summary();
        renderView(query(summary({ failed: { ...s.failed, prime_returned_parcels: 3, prime_returned_fee: 15_000 } })));
        expect(byTestId("failed-fee")?.textContent).toContain("15,000");
    });

    it("ranks the products with the profit on one piece", () => {
        renderView(query(summary()));
        const row = document.querySelector('[data-product="p1"]');
        // 250,000 profit on 12 pieces.
        expect(row?.textContent).toContain("250,000");
        expect(row?.textContent).toContain("20,833");
        expect(row?.textContent).toContain("63%");
    });

    it("says what each 1,000 IQD of ads brought, or that nothing was spent", () => {
        renderView(query(summary()));
        // 400,000 of sales on 60,000 of ads.
        expect(byTestId("ad-return-say")?.textContent).toContain("6,667");
        cleanup();
        renderView(query(summary({ expenses: [] })));
        expect(byTestId("ad-return-say")).toBeNull();
        expect(byTestId("ad-return")).not.toBeNull();
    });

    it("shows the stock on the shelf, and keeps a stock purchase out of the profit", () => {
        renderView(query(summary()));
        expect(byTestId("stock-say")?.textContent).toContain("120");
        expect(byTestId("stock-say")?.textContent).toContain("900,000");
        expect(byTestId("stock-missing")).toBeNull();
        expect(byTestId("stock-bought")).toBeNull();
        cleanup();
        const s = summary();
        renderView(query(summary({
            expenses: [...s.expenses, { category: "product_cost", amount: 200_000 }],
            stock: { ...s.stock, missing_cost_products: 4 },
        })));
        expect(stat("net_profit")).toContain("115,000");
        expect(line("other")?.textContent).toContain("−5,000");
        expect(byTestId("stock-bought")?.textContent).toContain("200,000");
        expect(byTestId("stock-missing")?.textContent).toContain("4");
    });

    it("draws the profit path with a readout for the day under the pointer", () => {
        renderView(query(summary()));
        expect(byTestId("profit-path-readout")).toBeNull();
        const second = document.querySelector('[data-point="2026-11-02"]');
        if (second) fireEvent.mouseEnter(second);
        // Day 2 sold 160,000 and left 20,000; the two days together left 115,000.
        const readout = byTestId("profit-path-readout")?.textContent ?? "";
        expect(readout).toContain("160,000");
        expect(readout).toContain("20,000");
        expect(readout).toContain("115,000");
    });

    it("puts an arrow on each statement line that moved against the period before, through the chosen lens", () => {
        const change = (id: string) => document.querySelector(`[data-change="${id}"]`)?.textContent ?? null;
        const lens = (id: string) => {
            const button = document.querySelector(`[data-lens="${id}"]`);
            if (button) fireEvent.click(button);
        };
        const before = (orders: number) => query(summary({ sales: { orders, revenue: 320_000, units: orders, product_cost: 120_000, missing_cost_units: 0 } }));
        renderView(query(summary()), before(20));
        expect(change("sales")).toBe("25%");
        expect(change("product_cost")).toBe("25%");
        // the ads cost 60,000 both times: nothing to say in total
        expect(change("ads")).toBeNull();
        // 115,000 against 65,000
        expect(change("net")).toBe("77%");
        lens("order");
        // goods went from 6,000 to 15,000 an order, ads from 3,000 to 6,000
        expect(change("product_cost")).toBe("150%");
        expect(change("ads")).toBe("100%");
        cleanup();
        // 8 delivered orders before: the totals still compare, the averages do not
        renderView(query(summary()), before(8));
        expect(change("product_cost")).toBe("25%");
        lens("order");
        expect(change("product_cost")).toBeNull();
        cleanup();
        renderView(query(summary()));
        expect(change("sales")).toBeNull();
    });

    it("says how many delivered orders a day cover the costs, and what happens when none are needed or none can", () => {
        renderView(query(summary()));
        // one order leaves (400,000 - 150,000 - 30,000 - 40,000) / 10 = 18,000; ads and packaging are 32,500 a day
        const say = byTestId("break-even-say")?.textContent ?? "";
        expect(say).toContain("2");
        expect(say).toContain("5");
        expect(byTestId("break-even")?.textContent).toContain("18,000");
        expect(byTestId("break-even")?.textContent).toContain("32,500");
        cleanup();
        renderView(query(summary({ expenses: [] })));
        expect(byTestId("break-even-free")).not.toBeNull();
        cleanup();
        renderView(query(summary({ sales: { orders: 10, revenue: 400_000, units: 12, product_cost: 400_000, missing_cost_units: 0 } })));
        expect(byTestId("break-even-never")).not.toBeNull();
    });

    it("compares against the period before only when that period is big enough to compare", () => {
        renderView(query(summary()), query(summary({ sales: { orders: 8, revenue: 320_000, units: 9, product_cost: 120_000, missing_cost_units: 0 } })));
        expect(document.querySelector('[data-cell="sales"]')?.textContent).toContain("25%");
        cleanup();
        renderView(query(summary()), query(summary({ sales: { orders: 1, revenue: 1_000, units: 1, product_cost: 0, missing_cost_units: 0 } })));
        expect(document.querySelector('[data-cell="sales"]')?.textContent).not.toContain("%");
    });

    it("raises stuck parcels and goods with no cost, and nothing otherwise", () => {
        renderView(query(summary()));
        expect(byTestId("summary-alerts")).toBeNull();
        cleanup();
        const s = summary();
        renderView(query(summary({
            sales: { ...s.sales, missing_cost_units: 3 },
            cash: { ...s.cash, stuck: { count: 2, amount: 50_000 } },
        })));
        expect(document.querySelector('[data-alert="stuck"]')?.textContent).toContain("50,000");
        expect(document.querySelector('[data-alert="no_cost"]')?.textContent).toContain("3");
    });

    it("keeps the costs on screen when nothing was delivered, without the charts", () => {
        renderView(query(summary({
            sales: { orders: 0, revenue: 0, units: 0, product_cost: 0, missing_cost_units: 0 },
            products: [],
        })));
        expect(byTestId("summary-empty")).not.toBeNull();
        expect(byTestId("profit-path")).toBeNull();
        expect(byTestId("product-ranking")).toBeNull();
        expect(byTestId("money-route")).not.toBeNull();
        expect(line("ads")?.textContent).toContain("−60,000");
        expect(stat("profit_per_order")).toBe("—");
    });

    it("shows a skeleton while loading and a retry when the load fails", () => {
        renderView(query(undefined));
        expect(byTestId("summary-loading")).not.toBeNull();
        cleanup();
        renderView(query(undefined, { isError: true }));
        const retry = byTestId("summary-error")?.querySelector("button");
        if (retry) fireEvent.click(retry);
        expect(refetch).toHaveBeenCalled();
    });
});
