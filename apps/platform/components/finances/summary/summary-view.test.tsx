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
        },
        failed: { refused_orders: 2, refused_value: 80_000, prime_returned_parcels: 0, prime_returned_fee: 0 },
        daily: [
            { day: "2026-11-01", orders: 6, revenue: 240_000, product_cost: 90_000, courier: 20_000, refunds: 0, expenses: 35_000, salaries: 0 },
            { day: "2026-11-02", orders: 4, revenue: 160_000, product_cost: 60_000, courier: 10_000, refunds: 40_000, expenses: 30_000, salaries: 0 },
        ],
        products: [{ key: "p1", name: "Envoy", units: 12, revenue: 400_000, cost: 150_000, missing_units: 0 }],
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

    it("lists every cost line with a minus, then the net profit and what stays of each 1,000", () => {
        renderView(query(summary()));
        expect(line("sales")?.textContent).toContain("400,000");
        expect(line("product_cost")?.textContent).toContain("−150,000");
        expect(line("ads")?.textContent).toContain("−60,000");
        expect(line("delivery")?.textContent).toContain("−30,000");
        expect(line("refunds")?.textContent).toContain("−40,000");
        expect(line("other")?.textContent).toContain("−5,000");
        expect(line("salaries")?.textContent).toContain("0");
        expect(line("net")?.textContent).toContain("115,000");
        expect(byTestId("statement-plain")?.textContent).toContain("288");
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

    it("shows what Prime still owes after its own fee", () => {
        renderView(query(summary()));
        expect(byTestId("money-prime")?.textContent).toContain("70,000");
        expect(byTestId("money-road")?.textContent).toContain("160,000");
    });

    it("says how often a parcel comes back", () => {
        renderView(query(summary()));
        // 2 refused of 12 that reached a door.
        expect(byTestId("failed-share")?.textContent).toContain("17");
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
        expect(byTestId("daily-bars")).toBeNull();
        expect(byTestId("order-slices")).toBeNull();
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
