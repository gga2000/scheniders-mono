import type { FinanceSummary, FinanceSummaryDay } from "../summary";

export const financeDay = (d: string, over: Partial<FinanceSummaryDay> = {}): FinanceSummaryDay => ({
    day: d, orders: 0, revenue: 0, product_cost: 0, courier: 0, courier_file: 0, refunds: 0, expenses: 0, salaries: 0, ...over,
});

/** A shop's month, shaped like get_finance_summary()'s answer. */
export function financeSummaryFixture(over: Partial<FinanceSummary> = {}): FinanceSummary {
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
            financeDay("2026-11-01", { orders: 6, revenue: 240_000, product_cost: 90_000, courier: 20_000, expenses: 50_000 }),
            financeDay("2026-11-02", { orders: 4, revenue: 160_000, product_cost: 60_000, courier: 10_000, refunds: 40_000, expenses: 40_000 }),
            financeDay("2026-11-03", { courier: 5_000, salaries: 20_000 }),
        ],
        products: [
            { key: "p1", name: "Envoy", image_url: "https://x.supabase.co/storage/v1/object/public/p/envoy.webp", units: 8, revenue: 300_000, cost: 110_000, missing_units: 0 },
            { key: "p2", name: "Wayfarer", image_url: null, units: 4, revenue: 100_000, cost: 40_000, missing_units: 1 },
        ],
        stock: { pieces: 120, costed_pieces: 100, cost_value: 900_000, missing_cost_products: 2, top: [] },
        ...over,
    };
}
