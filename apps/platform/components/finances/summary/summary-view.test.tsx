/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
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

// The real import dialog talks to the server: stand in a dialog that can only be closed.
vi.mock("@/components/delivery-import/delivery-import-modal", () => ({
    DeliveryImportModal: ({ onClose }: { onClose: () => void }) => (
        <button type="button" data-testid="import-dialog" onClick={onClose}>close</button>
    ),
}));

afterEach(cleanup);

function summary(over: Partial<FinanceSummary> = {}): FinanceSummary {
    return {
        from: "2026-11-01",
        to: "2026-11-02",
        sales: { orders: 10, revenue: 400_000, units: 12, product_cost: 150_000, missing_cost_units: 0, paid_orders: 0 },
        refunds: { count: 1, amount: 40_000 },
        expenses: [
            { category: "marketing", amount: 60_000 },
            { category: "packaging", amount: 5_000 },
        ],
        salaries_paid: 0,
        courier: { prime_fee: 30_000, prime_parcels: 6, file_fee: 0, file_orders: 0 },
        cash: {
            in_transit: { count: 4, amount: 160_000 },
            stuck: { count: 0, amount: 0 },
            returning: { count: 0, amount: 0 },
            prime_linked: true,
            prime_held: { parcels: 2, collected: 80_000, fee: 10_000 },
            reached: { payments: 2, amount: 300_000, last_day: "2026-11-02", last_amount: 120_000 },
            split: { reached: 330_000, reached_orders: 7, fee: 30_000, unpaid: 40_000, unpaid_orders: 3, unpaid_prime: 1 },
        },
        failed: { refused_orders: 2, refused_value: 80_000, prime_returned_parcels: 0, prime_returned_fee: 0 },
        daily: [
            { day: "2026-11-01", orders: 6, revenue: 240_000, product_cost: 90_000, courier: 20_000, courier_file: 0, refunds: 0, expenses: 35_000, salaries: 0 },
            { day: "2026-11-02", orders: 4, revenue: 160_000, product_cost: 60_000, courier: 10_000, courier_file: 0, refunds: 40_000, expenses: 30_000, salaries: 0 },
        ],
        stock: { pieces: 120, costed_pieces: 100, cost_value: 900_000, missing_cost_products: 0, top: [] },
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
        // the total says its share of sales and what stays of each 1,000, in one line under the label
        expect(byTestId("statement-plain")?.textContent).toContain("29%");
        expect(byTestId("statement-plain")?.textContent).toContain("288");
    });

    it("re-reads the statement per order, and offers no other view", () => {
        renderView(query(summary()));
        const lens = (name: string) => document.querySelector(`[data-lens="${name}"]`);
        expect(lens("total")?.getAttribute("aria-pressed")).toBe("true");
        const perOrder = lens("order");
        if (perOrder) fireEvent.click(perOrder);
        expect(lens("order")?.getAttribute("aria-pressed")).toBe("true");
        expect(line("sales")?.textContent).toContain("40,000");
        expect(line("product_cost")?.textContent).toContain("−15,000");
        expect(line("net")?.textContent).toContain("11,500");
        expect(lens("thousand")).toBeNull();
        expect(document.querySelectorAll("[data-lens]")).toHaveLength(2);
    });

    it("counts what the courier kept in the payment files as delivery, and says on how many orders", () => {
        const s = summary();
        renderView(query(summary({
            courier: { ...s.courier, file_fee: 20_000, file_orders: 4 },
            daily: s.daily.map((d, i) => (i === 0 ? { ...d, courier_file: 20_000 } : d)),
        })));
        // 30,000 of Prime's fee + 20,000 the courier kept in the files
        expect(line("delivery")?.textContent).toContain("−50,000");
        expect(stat("net_profit")).toContain("95,000");
        expect(byTestId("profit-path-end")?.textContent).toContain("95,000");
        const toggle = line("delivery")?.querySelector("button");
        if (toggle) fireEvent.click(toggle);
        expect(line("delivery")?.textContent).toContain("أجرة المندوب في كشوف الدفع عن 4 طلبات");
        expect(line("delivery")?.textContent).toContain("20,000");
        // no courier bill is typed: nothing can be counted twice
        expect(document.querySelector('[data-alert="delivery_twice"]')).toBeNull();
    });

    it("warns that delivery may be counted twice when a courier bill is typed beside the payment files", () => {
        const s = summary();
        const onOpenTab = renderView(query(summary({
            courier: { ...s.courier, file_fee: 20_000, file_orders: 4 },
            expenses: [...s.expenses, { category: "shipping", amount: 12_000 }],
        })));
        const alert = document.querySelector('[data-alert="delivery_twice"]');
        expect(alert?.textContent).toContain("20,000");
        expect(alert?.textContent).toContain("12,000");
        if (alert) fireEvent.click(alert);
        expect(onOpenTab).toHaveBeenCalledWith("expenses");
    });

    it("sends the quiet line's link to Expenses", () => {
        const onOpenTab = renderView(query(summary()));
        const add = byTestId("statement-quiet")?.querySelector("button");
        if (add) fireEvent.click(add);
        expect(onOpenTab).toHaveBeenCalledWith("expenses");
        // the empty lines are named, and so is what that means for the profit under them
        expect(byTestId("statement-quiet")?.textContent).toContain("لا يشملها");
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
        // ... of the shop's 10 delivered orders
        expect(row?.textContent).toContain("10");
        expect(byTestId("detail-totals")).toBeNull();
        const link = [...(row?.querySelectorAll("button") ?? [])].at(-1);
        if (link) fireEvent.click(link);
        expect(onOpenTab).toHaveBeenCalledWith("expenses");
    });

    it("keeps the inside of a line as real totals when the statement is read per order, and says so", () => {
        renderView(query(summary()));
        const toggle = line("delivery")?.querySelector("button");
        if (toggle) fireEvent.click(toggle);
        const perOrder = document.querySelector('[data-lens="order"]');
        if (perOrder) fireEvent.click(perOrder);
        // the line is 3,000 an order; Prime's fee on its 6 parcels is still 30,000, not 3,000
        expect(line("delivery")?.querySelector("button")?.textContent).toContain("−3,000");
        expect(byTestId("detail-totals")).not.toBeNull();
        expect(line("delivery")?.textContent).toContain("30,000");
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

    it("splits the delivered sales into what reached you, the delivery fee and what is not paid yet, adding up to the sales", () => {
        renderView(query(summary()));
        expect(byTestId("money-sold")?.textContent).toContain("400,000");
        expect(byTestId("money-sold")?.textContent).toContain("10 طلبات");
        // 330,000 + 30,000 + 40,000 = 400,000
        expect(byTestId("money-reached")?.textContent).toContain("330,000");
        expect(byTestId("money-reached")?.textContent).toContain("ثمن 7 طلبات بعد أجرة التوصيل");
        expect(byTestId("money-fee")?.textContent).toContain("30,000");
        expect(byTestId("money-unpaid")?.textContent).toContain("40,000");
        expect(byTestId("money-unpaid")?.textContent).toContain("3 طلبات: 1 عند برايم و2 عند المندوب");
        expect(byTestId("money-split")?.getAttribute("aria-label")).toContain("83%");
        // the road is not a sale yet: it sits under the line, apart from the three parts
        expect(byTestId("money-road")?.textContent).toContain("160,000");
        expect(byTestId("money-road")?.textContent).toContain("ليست مبيعات بعد");
        cleanup();
        const s = summary();
        renderView(query(summary({ cash: { ...s.cash, split: { ...s.cash.split, reached: 370_000, reached_orders: 10, unpaid: 0, unpaid_orders: 0, unpaid_prime: 0 } } })));
        expect(byTestId("money-unpaid")?.textContent).toContain("كل الطلبات المسلّمة مدفوعة لك");
        expect(byTestId("money-split")?.querySelectorAll("i")).toHaveLength(2);
    });

    it("names the courier payments dated in the period in one quiet line under the card", () => {
        renderView(query(summary()));
        expect(byTestId("money-payments")?.textContent).toContain("2");
        expect(byTestId("money-payments")?.textContent).toContain("300,000");
        cleanup();
        const s = summary();
        renderView(query(summary({ cash: { ...s.cash, reached: { payments: 0, amount: 0, last_day: null, last_amount: 0 } } })));
        expect(byTestId("money-payments")?.textContent).toContain("لا توجد دفعة");
    });

    it("names the parcels on their way back beside the road", () => {
        renderView(query(summary()));
        expect(byTestId("money-returning")).toBeNull();
        cleanup();
        const s = summary();
        renderView(query(summary({ cash: { ...s.cash, returning: { count: 5, amount: 90_000 } } })));
        // 3 to 10 take the plural noun in Arabic
        expect(byTestId("money-returning")?.textContent).toContain("5 طرود راجعة");
    });

    it("leaves the stuck parcels to the strip and the banner: the money card does not say them a third time", () => {
        const s = summary();
        renderView(query(summary({ cash: { ...s.cash, stuck: { count: 2, amount: 50_000 } } })));
        expect(stat("stuck")).toBe("2");
        expect(document.querySelector('[data-alert="stuck"]')?.textContent).toContain("50,000");
        expect(byTestId("money-route")?.textContent).not.toContain("50,000");
        expect(byTestId("money-route")?.textContent).not.toContain("عالق");
    });

    it("says how often a parcel comes back, and what the way back cost", () => {
        renderView(query(summary()));
        // 2 refused of 12 that reached a door.
        expect(byTestId("failed-share")?.textContent).toContain("17");
        expect(byTestId("failed-share")?.textContent).toContain("من كل 100");
        expect(byTestId("failed-cost")?.textContent).toContain("طلبان مرفوضان");
        expect(byTestId("failed-cost")?.textContent).toContain("80,000");
        // the hundred squares are named: 17 came back, 83 were accepted
        expect(byTestId("returned-parcels")?.textContent).toContain("17 رجعت");
        expect(byTestId("returned-parcels")?.textContent).toContain("83 استلمها الزبون");
        expect(byTestId("failed-fee")).toBeNull();
        cleanup();
        const s = summary();
        renderView(query(summary({ failed: { ...s.failed, prime_returned_parcels: 3, prime_returned_fee: 15_000 } })));
        expect(byTestId("failed-fee")?.textContent).toContain("15,000");
    });

    it("lists the products, best first, with the profit on one piece, no rank number and a plain margin", () => {
        renderView(query(summary()));
        const row = document.querySelector('[data-product="p1"]');
        // 250,000 profit on 12 pieces.
        expect(row?.textContent).toContain("250,000");
        expect(row?.textContent).toContain("20,833");
        expect(document.querySelector('[data-margin="p1"]')?.textContent).toBe("63%");
        expect(document.querySelector('[data-margin="p1"]')?.className).not.toContain("emerald");
        // the row opens on the picture, not on a rank number
        expect(row?.firstElementChild?.textContent).toBe("");
        // the only product made all of the products' profit
        expect(document.querySelector('[data-share="p1"]')?.textContent).toBe("100%");
    });

    it("counts things the way Arabic does: 3 to 10 in the plural, 11 to 99 with the singular in the accusative", () => {
        renderView(query(summary({
            sales: { orders: 27, revenue: 400_000, units: 5, product_cost: 150_000, missing_cost_units: 4, paid_orders: 0 },
            cash: { ...summary().cash, in_transit: { count: 27, amount: 160_000 } },
            failed: { refused_orders: 36, refused_value: 80_000, prime_returned_parcels: 13, prime_returned_fee: 65_000 },
            stock: { pieces: 120, costed_pieces: 100, cost_value: 900_000, missing_cost_products: 29, top: [] },
            products: [{ key: "p1", name: "Envoy", image_url: null, units: 5, revenue: 400_000, cost: 150_000, missing_units: 0 }],
        })));
        expect(document.querySelector('[data-cell="sales"]')?.textContent).toContain("27 طلباً");
        expect(document.querySelector('[data-cell="on_road"]')?.textContent).toContain("27 طرداً");
        expect(byTestId("returned-parcels")?.textContent).toContain("36 طلباً مرفوضاً");
        expect(byTestId("returned-parcels")?.textContent).toContain("13 طرداً راجعاً");
        expect(byTestId("stock-shelf")?.textContent).toContain("29 منتجاً");
        expect(document.querySelector('[data-product="p1"]')?.textContent).toContain("5 قطع ·");
        expect(document.body.textContent).toContain("4 قطع مسلّمة بلا كلفة");
    });

    it("says what each 1,000 IQD of ads brought, or that nothing was spent", () => {
        renderView(query(summary()));
        // 400,000 of sales on 60,000 of ads.
        expect(byTestId("ad-return")?.textContent).toContain("6,667");
        expect(byTestId("ad-return")?.textContent).toContain("مبيعات لكل 1,000 دينار تصرفها على الإعلان");
        // 60,000 spent, 6,000 an order
        expect(byTestId("ad-return")?.textContent).toContain("60,000");
        expect(byTestId("ad-return")?.textContent).toContain("6,000");
        cleanup();
        renderView(query(summary({ expenses: [] })));
        expect(byTestId("ad-return")).toBeNull();
        expect(byTestId("ad-return-none")).not.toBeNull();
        expect(byTestId("daily-costs")).not.toBeNull();
    });

    it("names the three products holding the most stock money", () => {
        renderView(query(summary()));
        expect(byTestId("stock-top")).toBeNull();
        cleanup();
        const s = summary();
        renderView(query(summary({
            stock: {
                ...s.stock,
                top: [
                    { key: "a", name: "Envoy Blue", pieces: 80, value: 991_760 },
                    { key: "b", name: "Identity", pieces: 50, value: 710_000 },
                    { key: "c", name: "Tobacco", pieces: 2, value: 40_000 },
                ],
            },
        })));
        const top = byTestId("stock-top")?.textContent ?? "";
        expect(top).toContain("أكثر ما يحبس أموالك");
        expect(top).toContain("Envoy Blue");
        expect(top).toContain("991,760");
        expect(top).toContain("80 قطعة");
        expect(top).toContain("قطعتان");
    });

    it("ends the page on one panel of three columns, not three boxes", () => {
        renderView(query(summary()));
        const panel = byTestId("summary-bottom");
        for (const id of ["returned-parcels", "daily-costs", "stock-shelf"]) {
            const card = byTestId(id);
            expect(card?.parentElement).toBe(panel);
            expect(card?.className).not.toContain("rounded-2xl");
        }
        expect(byTestId("money-route")?.className).toContain("rounded-2xl");
    });

    it("shows the stock on the shelf, and keeps a stock purchase out of the profit", () => {
        renderView(query(summary()));
        // 100 of the 120 pieces have a cost: the worth is theirs alone
        expect(byTestId("stock-say")?.textContent).toContain("100");
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
        // Day 2 left 20,000; the two days together left 115,000.
        const readout = byTestId("profit-path-readout")?.textContent ?? "";
        expect(readout).toContain("20,000");
        expect(readout).toContain("115,000");
    });

    it("gives the profit path a money scale, and no best day, daily average or sales bars", () => {
        renderView(query(summary()));
        const marks = [...document.querySelectorAll("[data-mark]")].map((mark) => mark.textContent);
        // the path climbs to 115,000
        expect(marks).toEqual(["0", "50 ألف", "100 ألف"]);
        expect(byTestId("profit-path")?.textContent).not.toContain("أفضل يوم");
        expect(byTestId("profit-path")?.textContent).not.toContain("معدّل اليوم");
        expect(byTestId("profit-path-end")?.textContent).toContain("115,000");
    });

    it("rings the day that jumped instead of covering the line with a label, and names it under the chart", () => {
        renderView(query(summary()));
        // Day 1 left 95,000 of the 115,000; day 2 only 20,000.
        const rings = document.querySelectorAll("[data-jump]");
        expect(rings).toHaveLength(1);
        expect(rings[0]?.textContent).toBe("");
        expect(byTestId("profit-path-big")?.textContent).toContain("أكبر يوم");
        expect(byTestId("profit-path-big")?.textContent).toContain("6 طلبات");
        expect(byTestId("profit-path-big")?.textContent).toContain("+95,000");
    });

    it("puts the money card before the chart", () => {
        renderView(query(summary()));
        const money = byTestId("money-route");
        const path = byTestId("profit-path");
        expect(money && path ? money.compareDocumentPosition(path) & Node.DOCUMENT_POSITION_FOLLOWING : 0).toBeTruthy();
    });

    it("puts an arrow on each statement line that moved against the period before, through the chosen lens", () => {
        const change = (id: string) => document.querySelector(`[data-change="${id}"]`)?.textContent ?? null;
        const lens = (id: string) => {
            const button = document.querySelector(`[data-lens="${id}"]`);
            if (button) fireEvent.click(button);
        };
        const before = (orders: number) => query(summary({ sales: { orders, revenue: 320_000, units: orders, product_cost: 120_000, missing_cost_units: 0, paid_orders: 0 } }));
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
        // the period before sold a fortieth of today: its refunds could still be compared, and one arrow alone would read as a mistake
        renderView(query(summary()), query(summary({ sales: { orders: 20, revenue: 10_000, units: 20, product_cost: 4_000, missing_cost_units: 0, paid_orders: 0 } })));
        expect(document.querySelector("[data-change]")).toBeNull();
        expect(byTestId("profit-statement")?.textContent).not.toContain("الأسهم تقارن");
        // and the statement says why no arrow shows
        expect(byTestId("profit-statement")?.textContent).toContain("لا أسهم مقارنة");
        cleanup();
        renderView(query(summary()));
        expect(change("sales")).toBeNull();
        expect(byTestId("profit-statement")?.textContent).not.toContain("لا أسهم مقارنة");
    });

    it("says how many delivered orders a day cover the costs, and what happens when none are needed or none can", () => {
        renderView(query(summary()));
        // one order leaves (400,000 - 150,000 - 30,000 - 40,000) / 10 = 18,000; ads and packaging are 32,500 a day
        // so 2 orders a day pay the bill, and 3 of the 5 delivered a day are profit
        const bar = byTestId("break-even-bar");
        expect(bar?.getAttribute("data-state")).toBe("above");
        expect(bar?.textContent).toContain("طلبان يغطيان مصروفات اليوم");
        expect(bar?.textContent).toContain("الباقي ربح: 3 من 5 في اليوم");
        expect(bar?.textContent).toContain("18,000");
        expect(bar?.textContent).toContain("32,500");
        cleanup();
        // four times the ads: 122,500 a day asks for 7 orders, and the shop delivers 5
        renderView(query(summary({ expenses: [{ category: "marketing", amount: 240_000 }, { category: "packaging", amount: 5_000 }] })));
        expect(byTestId("break-even-bar")?.getAttribute("data-state")).toBe("below");
        expect(byTestId("break-even-bar")?.textContent).toContain("معدّلك 5 في اليوم");
        expect(byTestId("break-even-bar")?.textContent).toContain("تحتاج 7");
        cleanup();
        renderView(query(summary({ expenses: [] })));
        expect(byTestId("break-even-free")).not.toBeNull();
        cleanup();
        renderView(query(summary({ sales: { orders: 10, revenue: 400_000, units: 12, product_cost: 400_000, missing_cost_units: 0, paid_orders: 0 } })));
        expect(byTestId("break-even-never")).not.toBeNull();
    });

    it("compares against the period before only when that period is big enough to compare", () => {
        renderView(query(summary()), query(summary({ sales: { orders: 8, revenue: 320_000, units: 9, product_cost: 120_000, missing_cost_units: 0, paid_orders: 0 } })));
        expect(document.querySelector('[data-cell="sales"]')?.textContent).toContain("25%");
        cleanup();
        renderView(query(summary()), query(summary({ sales: { orders: 1, revenue: 1_000, units: 1, product_cost: 0, missing_cost_units: 0, paid_orders: 0 } })));
        expect(document.querySelector('[data-cell="sales"]')?.textContent).not.toContain("%");
    });

    it("opens Expenses from the daily costs card", () => {
        const onOpenTab = renderView(query(summary()));
        const open = byTestId("daily-costs-expenses");
        if (open) fireEvent.click(open);
        expect(onOpenTab).toHaveBeenCalledWith("expenses");
    });

    it("raises stuck parcels and goods with no cost, and nothing otherwise", () => {
        renderView(query(summary()));
        expect(byTestId("summary-alerts")).toBeNull();
        cleanup();
        const s = summary();
        renderView(query(summary({
            sales: { ...s.sales, missing_cost_units: 3, paid_orders: 0 },
            cash: { ...s.cash, stuck: { count: 2, amount: 50_000 } },
        })));
        expect(document.querySelector('[data-alert="stuck"]')?.textContent).toContain("50,000");
        expect(document.querySelector('[data-alert="no_cost"]')?.textContent).toContain("3");
    });

    it("keeps the costs on screen when nothing was delivered, without the charts", () => {
        renderView(query(summary({
            sales: { orders: 0, revenue: 0, units: 0, product_cost: 0, missing_cost_units: 0, paid_orders: 0 },
            products: [],
        })));
        expect(byTestId("summary-empty")).not.toBeNull();
        expect(byTestId("profit-path")).toBeNull();
        expect(byTestId("product-ranking")).toBeNull();
        expect(byTestId("money-route")).not.toBeNull();
        expect(line("ads")?.textContent).toContain("−60,000");
        expect(stat("profit_per_order")).toBe("—");
    });

    it("opens the courier payment file import from the money card and reads the figures again after it", async () => {
        renderView(query(summary()));
        expect(byTestId("import-dialog")).toBeNull();
        const add = byTestId("money-add-payment");
        expect(add?.textContent).toContain("استيراد كشف التوصيل");
        if (add) fireEvent.click(add);
        await waitFor(() => expect(byTestId("import-dialog")).not.toBeNull());
        refetch.mockClear();
        const dialog = byTestId("import-dialog");
        if (dialog) fireEvent.click(dialog);
        expect(byTestId("import-dialog")).toBeNull();
        expect(refetch).toHaveBeenCalledTimes(1);
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
