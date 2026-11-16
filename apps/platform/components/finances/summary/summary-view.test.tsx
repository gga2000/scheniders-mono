/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { parseFilterParam } from "@/lib/product-filter-param";
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
            split: { reached: 330_000, reached_orders: 7, fee: 30_000, unpaid: 40_000, unpaid_orders: 3, unpaid_prime: 1, reached_before: 0, reached_now: 0, reached_other: 0, reached_prepaid: 0, reached_prepaid_orders: 0 },
            statement: { returns: 0, returns_orders: 0, returns_open: 0, returns_open_orders: 0, prepaid_gap: 0, prepaid_orders: 0, price_gap: 0, price_gap_orders: 0, undelivered: 0, undelivered_orders: 0 },
            statement_orders: [],
            unpaid_list: [
                { id: "11111111-1111-4111-8111-111111111111", code: "4260905001", customer: "محمد كاظم", amount: 25_000, day: "2026-11-01", prime: false },
                { id: "22222222-2222-4222-8222-222222222222", code: "1261112002", customer: "عباس عادل", amount: 15_000, day: "2026-11-15", prime: true },
            ],
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
        expect(byTestId("statement-quiet")?.textContent).toContain("الرواتب");
        expect(line("net")?.textContent).toContain("115,000");
        // the total says what stays of each 1,000 under the label, once (no second "% of sales" for the same thing)
        expect(byTestId("statement-plain")?.textContent).toContain("288");
        expect(byTestId("statement-plain")?.textContent).not.toContain("%");
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
        expect(line("delivery")?.textContent).toContain("أجرة التوصيل في الكشوف عن 4 طلبات");
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
        expect(byTestId("statement-quiet")?.textContent).toContain("أعلى من الحقيقي");
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
        expect(byTestId("money-reached")?.textContent).toContain("ثمن 7 طلبات مسلَّمة في هذه الفترة، بعد أجرة التوصيل");
        expect(byTestId("money-fee")?.textContent).toContain("30,000");
        // the statement's delivery line has nothing more here, so no second figure to explain
        expect(byTestId("money-fee-statement")).toBeNull();
        expect(byTestId("money-unpaid")?.textContent).toContain("40,000");
        // the note counts every unpaid order, so 7 paid + 3 unpaid = the 10 orders
        expect(byTestId("money-unpaid")?.textContent).toContain("3 طلبات: 1 عند برايم و2 عند شركة التوصيل");
        // the courier's fee is not known before its statement: its rows say so
        expect(byTestId("money-unpaid")?.textContent).toContain("عند شركة التوصيل، قبل أجرتها");
        expect(byTestId("money-unpaid-courier-fee")?.textContent).toContain("فيصلك منها أقل من هذا");
        expect(byTestId("money-split")?.getAttribute("aria-label")).toContain("83%");
        // the road is not a sale yet: it sits under the line, apart from the three parts
        expect(byTestId("money-road")?.textContent).toContain("160,000");
        expect(byTestId("money-road")?.textContent).toContain("بسعر البيع، ولم تُحسب في المبيعات بعد");
        cleanup();
        const s = summary();
        renderView(query(summary({ cash: { ...s.cash, split: { ...s.cash.split, reached: 370_000, reached_orders: 10, unpaid: 0, unpaid_orders: 0, unpaid_prime: 0 } } })));
        expect(byTestId("money-unpaid")?.textContent).toContain("كل الطلبات المسلّمة مدفوعة لك");
        expect(byTestId("money-split")?.querySelectorAll("i")).toHaveLength(2);
    });

    it("lists the unpaid orders, each opening its order, says how long each waited, and what the rest owe", () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2026-11-20T09:00:00Z"));
        renderView(query(summary()));
        const ages = Array.from(byTestId("money-unpaid-list")?.querySelectorAll("li p span") ?? []);
        expect(ages.map((age) => age.textContent)).toEqual(["تسلّمه الزبون قبل 19 يوماً", "تسلّمه الزبون قبل 5 أيام"]);
        // over two weeks is late: only the first row is marked
        expect(ages.map((age) => age.hasAttribute("data-late"))).toEqual([true, false]);
        // a late row says once what to do about it
        expect(byTestId("money-unpaid-late")?.textContent).toBe("الطلبات المكتوبة بالبرتقالي تسلّمها الزبائن قبل أكثر من أسبوعين ولم يُدفع لك ثمنها بعد: اسأل عنها شركة التوصيل التي أوصلتها.");
        vi.useRealTimers();
        const list = byTestId("money-unpaid-list");
        const links = Array.from(list?.querySelectorAll("a") ?? []);
        expect(links.map((a) => a.getAttribute("href"))).toEqual([
            "/orders?order=11111111-1111-4111-8111-111111111111",
            "/orders?order=22222222-2222-4222-8222-222222222222",
        ]);
        expect(links[0]?.textContent).toBe("4260905001");
        expect(list?.textContent).toContain("محمد كاظم");
        expect(list?.textContent).toContain("25,000");
        expect(list?.textContent).toContain("عند شركة التوصيل");
        expect(list?.textContent).toContain("عند برايم، بعد أجرتها");
        // 3 unpaid, 2 listed: the third owes nothing after the delivery fee
        expect(byTestId("money-unpaid-rest")?.textContent).toBe("وطلب آخر لا تنتظر عنه مالاً: مجاني، أو سعره لا يزيد على أجرة التوصيل.");
        cleanup();
        const s = summary();
        const full = Array.from({ length: 20 }, (_, i) => ({ ...s.cash.unpaid_list[0], id: `id-${i}`, code: `${i}` }));
        renderView(query(summary({ cash: { ...s.cash, unpaid_list: full, split: { ...s.cash.split, unpaid_orders: 25 } } })));
        // a long list shows the oldest five and a button for the rest
        expect(byTestId("money-unpaid-list")?.querySelectorAll("li")).toHaveLength(5);
        const more = byTestId("money-unpaid-list")?.querySelector("button");
        expect(more?.textContent).toBe("اعرض الكل (20)");
        if (more) fireEvent.click(more);
        expect(byTestId("money-unpaid-list")?.querySelectorAll("li")).toHaveLength(20);
        expect(byTestId("money-unpaid-rest")?.textContent).toBe("هذه أقدم 20 طلباً، والباقي (5) في صفحة الطلبات.");
        cleanup();
        renderView(query(summary({ cash: { ...s.cash, unpaid_list: [], split: { ...s.cash.split, unpaid: 0, unpaid_orders: 0, unpaid_prime: 0 } } })));
        expect(byTestId("money-unpaid-list")).toBeNull();
    });

    it("names Prime's unpaid orders and links to Prime even with no link row (the demo store), and says Prime took part of the fee", () => {
        const s = summary();
        renderView(query(summary({ cash: { ...s.cash, prime_linked: false } })));
        expect(byTestId("money-unpaid")?.textContent).toContain("1 عند برايم");
        expect(byTestId("money-unpaid")?.querySelector('a[href="/prime"]')).not.toBeNull();
        expect(byTestId("money-fee")?.textContent).toContain("وبرايم");
        cleanup();
        renderView(query(summary({
            cash: { ...s.cash, prime_linked: false, split: { ...s.cash.split, unpaid_prime: 0 } },
            courier: { ...s.courier, prime_fee: 0, prime_parcels: 0 },
        })));
        expect(byTestId("money-unpaid")?.querySelector('a[href="/prime"]')).toBeNull();
        expect(byTestId("money-fee")?.textContent).not.toContain("برايم");
    });

    it("explains why the statement's delivery line is bigger than the fee in the money card", () => {
        const s = summary();
        renderView(query(summary({ failed: { ...s.failed, prime_returned_parcels: 3, prime_returned_fee: 15_000 } })));
        // 30,000 on delivered parcels here, 45,000 in the statement
        expect(byTestId("money-fee")?.textContent).toContain("30,000");
        expect(byTestId("money-fee-statement")?.textContent).toContain("45,000");
        expect(byTestId("money-fee-statement")?.textContent).toContain("15,000 د.ع أجرة الطرود الراجعة");
    });

    it("shows what the courier paid out in the period, taken apart so the lines add up to it", () => {
        renderView(query(summary()));
        expect(byTestId("money-payments")?.textContent).toContain("دفعات استلمتها من شركات التوصيل");
        expect(byTestId("money-payments")?.textContent).toContain("دفعتان");
        expect(byTestId("money-payments")?.textContent).toContain("300,000");
        // nothing of the period's payments is tied to its orders: say why the two figures differ
        expect(byTestId("money-payments")?.textContent).toContain("أيّاً كان تاريخ الدفعة");
        expect(byTestId("money-payments-parts")).toBeNull();
        cleanup();
        const s = summary();
        renderView(query(summary({ cash: { ...s.cash, reached: { payments: 0, amount: 0, last_day: null, last_amount: 0 } } })));
        expect(byTestId("money-payments")?.textContent).toContain("لم تستلم من شركات التوصيل أي دفعة");
        cleanup();
        // 300,000 paid = 380,000 for the period's orders − 30,000 refunds marked done − 20,000 refunds not marked
        // − 10,000 on two prepaid orders + 5,000 price + 3,000 for an order not marked delivered − 28,000 other
        renderView(query(summary({
            cash: {
                ...s.cash,
                split: { ...s.cash.split, reached_now: 380_000, reached_before: 1_000 },
                statement: {
                    returns: -50_000,
                    returns_orders: 3,
                    returns_open: -20_000,
                    returns_open_orders: 1,
                    prepaid_gap: -9_999,
                    prepaid_orders: 2,
                    price_gap: 5_000,
                    price_gap_orders: 1,
                    undelivered: 3_000,
                    undelivered_orders: 1,
                },
                statement_orders: [
                    { kind: "price", id: "p-1", code: "4261101004", amount: 5_000 },
                    { kind: "refund_open", id: "r-1", code: "RTN-4108-1", amount: -20_000 },
                    { kind: "undelivered", id: "u-1", code: "4261102012", amount: 3_000 },
                    { kind: "prepaid", id: "pp-1", code: "1261030001", amount: -4_999 },
                    { kind: "prepaid", id: "pp-2", code: "1261104002", amount: -5_000 },
                ],
            },
        })));
        const rows = Array.from(byTestId("money-payments-parts")?.querySelectorAll("dl > div") ?? []).map((row) => row.textContent);
        expect(rows).toEqual([
            "ثمن طلبات هذه الفترة في الكشوف380,000د.ع",
            "مبلغان مستردان دفعتهما شركة التوصيل لزبونين عنك (2)غيّرتَ حالتها إلى «تم الاسترجاع»، فهي ضمن «مبالغ مستردة» في حساب الربح، وهو هناك 40,000 د.ع لأنه يشمل أيضاً مبالغ مستردة دُفعت في الفترة وليست في هذه الكشوف.−30,000د.ع",
            "مبلغ مسترد دفعته شركة التوصيل ولم تسجّله بعد (1)غيّر حالة كل طلب إلى «تم الاسترجاع» ليُخصم من ربحك في «مبالغ مستردة». وإلى أن تفعل ذلك يبقى صافي الربح أعلى من الحقيقي بـ20,000 د.ع.RTN-4108-1−20,000د.ع",
            "أجرة توصيل خصمتها شركة التوصيل عن طلبين مدفوعين مسبقاً (2)دفع الزبون ثمنها لك مسبقاً، فخصمت شركة التوصيل أجرتها فقط (5,000 د.ع عن كل طلب)، عدا الطلب 1261030001: ذكر الكشف أنها قبضت عنه 1 د.ع، فخصمت 4,999 د.ع. لا تحتاج إلى فعل شيء.1261030001−4,999د.ع1261104002−5,000د.ع−9,999د.ع",
            "طلب قُبض فيه سعر مختلف (1)قبضت شركة التوصيل 5,000 د.ع أكثر من سعر الطلب المسجّل. إن كان السعر في الطلب خطأ فصحّحه.4261101004+5,000د.ع",
            "طلب دُفع ثمنه وما زال غير «مُسلَّم» عندك (1)غيّر حالته إلى «مُسلَّم» ليُحسب في مبيعاتك.4261102012+3,000د.ع",
            "فروق أخرى−28,001د.ع",
        ]);
        expect(byTestId("money-payments-parts")?.querySelector('a[href="/orders?order=u-1"]')?.textContent).toBe("4261102012");
        expect(byTestId("money-payments-parts")?.querySelector('a[href="/orders?order=r-1"]')?.textContent).toBe("RTN-4108-1");
        // the profit card says its net profit is too high until the open refund is marked, and links to it
        expect(byTestId("statement-refunds-open")?.textContent).toBe("صافي الربح أدناه أعلى من الحقيقي بـ20,000 د.ع: مبالغ مستردة دفعتها شركة التوصيل ولم تُسجَّل بعد.اعرضها");
        expect(byTestId("statement-refunds-open")?.querySelector("a")?.getAttribute("href")).toBe("#courier-payments");
        // The refund not marked yet also warns at the top, and the warning scrolls to this card.
        const refundsAlert = document.querySelector('[data-alert="refunds_open"]');
        expect(refundsAlert?.textContent).toContain("مبلغ مسترد واحد دفعته شركة التوصيل لزبونك ولم تغيّر حالة طلبه إلى «تم الاسترجاع» بعد، لذلك صافي الربح أعلى من الحقيقي بـ20,000 د.ع.");
        expect(refundsAlert?.getAttribute("href")).toBe("#courier-payments");
        expect(document.getElementById("courier-payments")).toBe(byTestId("money-payments"));
        expect(byTestId("money-payments-link")?.textContent).toBe(
            "هذا ما دفعته لك شركات التوصيل فعلاً خلال الفترة: ثمن طلبات هذه الفترة في الكشوف (380,000 د.ع) بعد الفروق أدناه. أما 1,000 د.ع في «دُفع لك» فوصلك في كشوف مؤرَّخة قبل هذه الفترة.",
        );
        expect(byTestId("money-payments")?.textContent).not.toContain("أيّاً كان تاريخ الدفعة");
    });

    it("lists where \"paid to you\" came from, including orders the customer paid up front", () => {
        const s = summary();
        renderView(query(summary({ cash: { ...s.cash, split: { ...s.cash.split, reached_now: 100_000, reached_before: 200_000, reached_prepaid: 20_000, reached_prepaid_orders: 2, reached_other: 10_000 } } })));
        const parts = byTestId("money-reached-parts")?.textContent ?? "";
        expect(parts).toContain("من كشوف هذه الفترةاعرض الدفعات وفروقها100,000");
        expect(byTestId("money-from-now-link")?.getAttribute("href")).toBe("#courier-payments");
        expect(parts).toContain("طلبات دُفع ثمنها لك سابقاً، وسجّلتها «مُسلَّمة» متأخراً في هذه الفترة200,000");
        expect(parts).toContain("دفعها الزبون لك مسبقاً (طلبان)20,000");
        expect(parts).toContain("من كشوف مؤرَّخة بعد هذه الفترة10,000");
        cleanup();
        renderView(query(summary()));
        expect(byTestId("money-reached-parts")).toBeNull();
    });

    it("names the parcels on their way back beside the road", () => {
        renderView(query(summary()));
        expect(byTestId("money-returning")).toBeNull();
        cleanup();
        const s = summary();
        renderView(query(summary({ cash: { ...s.cash, returning: { count: 5, amount: 90_000 } } })));
        // 3 to 10 take the plural noun in Arabic
        expect(byTestId("money-returning")?.textContent).toContain("وهناك 5 طرود مرفوضة تعيدها برايم إليك الآن");
    });

    it("says the stuck parcels are part of the road, so the strip's two parcel counts are not added up", () => {
        const s = summary();
        renderView(query(summary({ cash: { ...s.cash, stuck: { count: 2, amount: 50_000 } } })));
        expect(stat("stuck")).toBe("2");
        expect(document.querySelector('[data-alert="stuck"]')?.textContent).toContain("50,000");
        expect(byTestId("money-road-stuck")?.textContent).toBe("منها طردان على الطريق منذ 15 يوماً أو أكثر (50,000 د.ع).");
        cleanup();
        renderView(query(summary()));
        expect(byTestId("money-road-stuck")).toBeNull();
    });

    it("says how often a parcel comes back, and what the way back cost", () => {
        renderView(query(summary()));
        // 2 refused of 12 that reached a door.
        expect(byTestId("failed-share")?.textContent).toContain("17");
        expect(byTestId("failed-share")?.textContent).toContain("من كل 100");
        expect(byTestId("failed-cost")?.textContent).toContain("طلبان مرفوضان");
        expect(byTestId("failed-cost")?.textContent).toContain("80,000");
        // the hundred squares are named: 17 came back, 83 were accepted
        expect(byTestId("returned-parcels")?.textContent).toContain("رُفض: 17 من 100");
        expect(byTestId("returned-parcels")?.textContent).toContain("وصل للزبون: 83 من 100");
        // every refused order, whatever date filter the merchant left on Orders
        expect(byTestId("returned-parcels")?.querySelector("a")?.getAttribute("href")).toBe("/orders?status=rejected&dates=all");
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
        expect(byTestId("returned-parcels")?.textContent).toContain("أجرة برايم عن 13 طرداً مرفوضاً من طرودها (ضمن بند التوصيل)");
        expect(byTestId("stock-shelf")?.textContent).toContain("29 منتجاً");
        expect(document.querySelector('[data-product="p1"]')?.textContent).toContain("5 قطع ·");
        expect(document.body.textContent).toContain("4 قطع مسلّمة بلا كلفة");
    });

    it("says what each 1,000 IQD of ads brought as a rate, not as money, or that nothing was spent", () => {
        renderView(query(summary()));
        // 400,000 of sales on 60,000 of ads.
        const figure = byTestId("ad-return-figure")?.textContent ?? "";
        expect(figure).toContain("6,667");
        expect(figure).toContain("دينار مبيعات لكل 1,000 دينار إعلان");
        expect(figure).not.toContain("د.ع");
        expect(byTestId("ad-return")?.textContent).toContain("صرفت 60,000 د.ع على الإعلانات في هذه الفترة.");
        expect(byTestId("ad-return")?.textContent).toContain("صرفت 60,000 د.ع على الإعلانات في هذه الفترة");
        // the cost per order stays in the dark strip only
        expect(byTestId("ad-return")?.textContent).not.toContain("6,000");
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
        // The warning opens the products list on exactly those products.
        const fix = byTestId("stock-missing-fix")?.getAttribute("href") ?? "";
        expect(parseFilterParam(new URL(fix, "https://x.test").searchParams.get("filters") ?? "")?.missingCost).toBe(true);
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
        expect(byTestId("profit-path-big")?.textContent).toContain("ربح 95,000 د.ع");
        // and what the other days did together, so the named days and the rest add up to the period's profit
        expect(byTestId("profit-path-big")?.textContent).toContain("وباقي الأيام معاً ربح 20,000 د.ع.");
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
        expect(byTestId("profit-statement")?.textContent).toContain("لا توجد مقارنة");
        cleanup();
        renderView(query(summary()));
        expect(change("sales")).toBeNull();
        expect(byTestId("profit-statement")?.textContent).not.toContain("لا توجد مقارنة");
    });

    it("says how many delivered orders a day cover the costs, and what happens when none are needed or none can", () => {
        renderView(query(summary()));
        // one order leaves (400,000 - 150,000 - 30,000 - 40,000) / 10 = 18,000; ads and packaging are 32,500 a day
        // so 1.8 orders a day pay the bill (not rounded up), and 3.2 of the 5 delivered a day are profit:
        // 3.2 x 18,000 = 57,600, the 5 x 11,500 a day left after the costs, give or take the rounding
        const bar = byTestId("break-even-bar");
        expect(bar?.getAttribute("data-state")).toBe("above");
        expect(bar?.textContent).toContain("1.8 طلب تغطي مصروفات اليوم");
        expect(bar?.textContent).toContain("من كل 5 طلبات في اليوم، 3.2 منها ربح لك");
        expect(bar?.textContent).toContain("18,000");
        expect(bar?.textContent).toContain("32,500");
        // and what each order leaves after the daily costs: the strip's profit per order
        expect(bar?.textContent).toContain("و11,500 د.ع بعدها");
        // the brackets name only the daily costs this period has: no salaries here
        expect(bar?.textContent).toContain("مصروفاتك اليومية 32,500 د.ع (إعلانات، مصروفات أخرى)");
        expect(byTestId("break-even-bulk")).toBeNull();
        cleanup();
        // four times the ads: 122,500 a day asks for 6.8 orders, and the shop delivers 5
        renderView(query(summary({ expenses: [{ category: "marketing", amount: 240_000 }, { category: "packaging", amount: 5_000 }] })));
        expect(byTestId("break-even-bar")?.getAttribute("data-state")).toBe("below");
        expect(byTestId("break-even-bar")?.textContent).toContain("معدّل طلباتك اليومية: 5");
        expect(byTestId("break-even-bar")?.textContent).toContain("الطلبات التي تغطي مصروفات اليوم: 6.8");
        cleanup();
        renderView(query(summary({ expenses: [] })));
        expect(byTestId("break-even-free")).not.toBeNull();
        cleanup();
        renderView(query(summary({ sales: { orders: 10, revenue: 400_000, units: 12, product_cost: 400_000, missing_cost_units: 0, paid_orders: 0 } })));
        expect(byTestId("break-even-never")).not.toBeNull();
    });

    it("names a cost that was almost nothing before, and says it is behind a fall in profit", () => {
        const s = summary();
        // the same period, but with 1,000 of ads before against 60,000 now: too big a change for an arrow
        const before = summary({ expenses: s.expenses.map((e) => (e.category === "marketing" ? { ...e, amount: 1_000 } : e)) });
        renderView(query(s), query(before));
        const ads = document.querySelector('[data-change="ads"]');
        expect(ads?.hasAttribute("data-new-cost")).toBe(true);
        expect(ads?.textContent).toBe("شبه لا شيء قبلها");
        expect(byTestId("statement-fall-cause")?.textContent).toBe("أغلب هذا الانخفاض من «الإعلانات»: 60,000 د.ع في هذه الفترة، وشبه لا شيء في الفترة السابقة.");
        cleanup();
        // the same ads both times: no words, no cause
        renderView(query(s), query(summary()));
        expect(document.querySelector("[data-new-cost]")).toBeNull();
        expect(byTestId("statement-fall-cause")).toBeNull();
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
        // Stuck parcels open the orders list on the stuck ones only, not every parcel on the road.
        expect(document.querySelector('[data-alert="stuck"]')?.getAttribute("href")).toBe("/orders?stuck=1");
        expect(document.querySelector('[data-cell="stuck"] a')?.getAttribute("href")).toBe("/orders?stuck=1");
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
