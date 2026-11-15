import { z } from "zod";

/**
 * The Finances summary: every figure on the page for one period, counted once
 * in the database by get_finance_summary() and turned into a profit statement
 * here.
 *
 * The rules, in one place:
 *   sale           a delivered or completed order, on the Baghdad day it was
 *                  delivered (the same rule as the orders bar)
 *   product cost   what the sold goods cost, frozen at delivery
 *   ads            `marketing` expenses (Meta spend is synced into them, so it
 *                  is never added a second time)
 *   delivery       the courier's fee on delivered Prime parcels and on the
 *                  parcels that came back (on the day they came back), plus
 *                  courier bills typed as `shipping` expenses
 *   refunds        money paid back, on the day it was paid
 *   other costs    every other expense category
 *   salaries       payroll actually paid in the period
 *   net profit     sales minus all of the above
 */

const DailySchema = z.object({
    day: z.string(),
    orders: z.number(),
    revenue: z.number(),
    product_cost: z.number(),
    courier: z.number(),
    refunds: z.number(),
    expenses: z.number(),
    salaries: z.number(),
});

const ProductSchema = z.object({
    key: z.string(),
    name: z.string(),
    units: z.number(),
    revenue: z.number(),
    cost: z.number(),
    missing_units: z.number(),
});

const CountAmountSchema = z.object({ count: z.number(), amount: z.number() });

export const FinanceSummarySchema = z.object({
    from: z.string(),
    to: z.string(),
    sales: z.object({
        orders: z.number(),
        revenue: z.number(),
        units: z.number(),
        product_cost: z.number(),
        missing_cost_units: z.number(),
    }),
    refunds: CountAmountSchema,
    expenses: z.array(z.object({ category: z.string(), amount: z.number() })),
    salaries_paid: z.number(),
    courier: z.object({ prime_fee: z.number(), prime_parcels: z.number() }),
    cash: z.object({
        in_transit: CountAmountSchema,
        stuck: CountAmountSchema,
        prime_linked: z.boolean(),
        prime_held: z.object({ parcels: z.number(), collected: z.number(), fee: z.number() }),
    }),
    failed: z.object({
        refused_orders: z.number(),
        refused_value: z.number(),
        prime_returned_parcels: z.number(),
        prime_returned_fee: z.number(),
    }),
    daily: z.array(DailySchema),
    products: z.array(ProductSchema),
});

export type FinanceSummary = z.infer<typeof FinanceSummarySchema>;
export type FinanceSummaryDay = z.infer<typeof DailySchema>;

/** The cost lines of the statement, in the order they are shown. */
export const COST_LINE_IDS = ["product_cost", "ads", "delivery", "refunds", "other", "salaries"] as const;
export type CostLineId = (typeof COST_LINE_IDS)[number];

/** What a cost line is made of, shown when the merchant opens the line. */
export interface CostPart {
    /** `prime_fee`, `prime_returned_fee`, `courier_bills` or an expense category. */
    key: string;
    amount: number;
}

export interface CostLine {
    id: CostLineId;
    amount: number;
    /** The line as a share of sales, 0 to 1 (0 when nothing was sold). */
    share: number;
    parts: CostPart[];
}

export interface ProfitStatement {
    orders: number;
    sales: number;
    lines: CostLine[];
    totalCosts: number;
    netProfit: number;
    /** Net profit as a share of sales; null when nothing was sold. */
    margin: number | null;
}

const ADS_CATEGORY = "marketing";
const COURIER_BILLS_CATEGORY = "shipping";

function expenseTotal(summary: FinanceSummary, category: string): number {
    return summary.expenses.filter((e) => e.category === category).reduce((sum, e) => sum + e.amount, 0);
}

export function buildStatement(summary: FinanceSummary): ProfitStatement {
    const sales = summary.sales.revenue;
    const ads = expenseTotal(summary, ADS_CATEGORY);
    const courierBills = expenseTotal(summary, COURIER_BILLS_CATEGORY);
    const otherParts = summary.expenses
        .filter((e) => e.category !== ADS_CATEGORY && e.category !== COURIER_BILLS_CATEGORY && e.amount !== 0)
        .map((e) => ({ key: e.category, amount: e.amount }));
    const other = otherParts.reduce((sum, p) => sum + p.amount, 0);

    const amounts: Record<CostLineId, { amount: number; parts: CostPart[] }> = {
        product_cost: { amount: summary.sales.product_cost, parts: [] },
        ads: { amount: ads, parts: [] },
        delivery: {
            amount: summary.courier.prime_fee + summary.failed.prime_returned_fee + courierBills,
            parts: [
                { key: "prime_fee", amount: summary.courier.prime_fee },
                { key: "prime_returned_fee", amount: summary.failed.prime_returned_fee },
                { key: "courier_bills", amount: courierBills },
            ].filter((p) => p.amount !== 0),
        },
        refunds: { amount: summary.refunds.amount, parts: [] },
        other: { amount: other, parts: otherParts },
        salaries: { amount: summary.salaries_paid, parts: [] },
    };

    const lines = COST_LINE_IDS.map((id): CostLine => ({
        id,
        amount: amounts[id].amount,
        share: sales > 0 ? amounts[id].amount / sales : 0,
        parts: amounts[id].parts,
    }));
    const totalCosts = lines.reduce((sum, l) => sum + l.amount, 0);
    const netProfit = sales - totalCosts;
    return {
        orders: summary.sales.orders,
        sales,
        lines,
        totalCosts,
        netProfit,
        margin: sales > 0 ? netProfit / sales : null,
    };
}

/** `amount` for each delivered order, rounded to a whole dinar; null when no order was delivered. */
export function perOrder(amount: number, orders: number): number | null {
    return orders > 0 ? Math.round(amount / orders) : null;
}

export const ORDER_SLICE_IDS = ["product_cost", "ads", "delivery", "other", "profit"] as const;
export type OrderSliceId = (typeof ORDER_SLICE_IDS)[number];

export interface OrderSlice {
    id: OrderSliceId;
    /** Dinars of the average delivered order that go here. */
    amount: number;
    /** Width of the slice in the bar, 0 to 1; the slices add up to 1. */
    share: number;
}

export interface AverageOrder {
    price: number;
    slices: OrderSlice[];
    /** What the average order leaves; negative when it loses money. */
    profit: number;
}

/**
 * Where the money of one average delivered order goes. Refunds, other costs
 * and salaries are one slice ("other") so the bar stays readable. A losing
 * period has no profit slice: the costs fill the bar and `profit` is negative.
 */
export function averageOrder(statement: ProfitStatement): AverageOrder | null {
    if (statement.orders <= 0 || statement.sales <= 0) return null;
    const cost = (id: CostLineId) => statement.lines.find((l) => l.id === id)?.amount ?? 0;
    const costs: Array<[OrderSliceId, number]> = [
        ["product_cost", cost("product_cost")],
        ["ads", cost("ads")],
        ["delivery", cost("delivery")],
        ["other", cost("refunds") + cost("other") + cost("salaries")],
    ];
    const profit = Math.max(statement.netProfit, 0);
    const whole = costs.reduce((sum, [, amount]) => sum + amount, 0) + profit;
    const slices = [...costs, ["profit", profit] as [OrderSliceId, number]]
        .filter(([, amount]) => amount > 0)
        .map(([id, amount]): OrderSlice => ({
            id,
            amount: Math.round(amount / statement.orders),
            share: amount / whole,
        }));
    return {
        price: Math.round(statement.sales / statement.orders),
        slices,
        profit: Math.round(statement.netProfit / statement.orders),
    };
}

export interface ProfitBar {
    /** First and last Baghdad day the bar covers (the same day for a daily bar). */
    from: string;
    to: string;
    orders: number;
    sales: number;
    profit: number;
}

export type BarStep = "day" | "week" | "month";

/** A day's profit: its sales minus every cost dated that day. Days add up to the statement's net profit. */
export function dayProfit(day: FinanceSummaryDay): number {
    return day.revenue - day.product_cost - day.courier - day.refunds - day.expenses - day.salaries;
}

/** Daily bars up to two months, weekly up to about a year, monthly beyond: the chart never gets too thin to read. */
export function barStep(days: number): BarStep {
    if (days <= 62) return "day";
    if (days <= 371) return "week";
    return "month";
}

/** The period's days as chart bars. Weeks are runs of seven days from the period's first day. */
export function profitBars(daily: readonly FinanceSummaryDay[]): { step: BarStep; bars: ProfitBar[] } {
    const step = barStep(daily.length);
    const bars: ProfitBar[] = [];
    let groupKey: string | null = null;
    daily.forEach((day, index) => {
        const key = step === "day" ? day.day : step === "week" ? String(Math.floor(index / 7)) : day.day.slice(0, 7);
        const last = bars[bars.length - 1];
        if (last && key === groupKey) {
            last.to = day.day;
            last.orders += day.orders;
            last.sales += day.revenue;
            last.profit += dayProfit(day);
            return;
        }
        groupKey = key;
        bars.push({ from: day.day, to: day.day, orders: day.orders, sales: day.revenue, profit: dayProfit(day) });
    });
    return { step, bars };
}

export interface ProductProfitRow {
    key: string;
    name: string;
    units: number;
    sales: number;
    cost: number;
    /** Sales minus the cost of the goods (before ads, delivery and other costs). */
    profit: number;
    /** Profit as a share of sales; null when the product sold for nothing. */
    margin: number | null;
    /** Pieces sold with no cost on file: the profit shown is too high by their cost. */
    missingUnits: number;
}

export function productRows(summary: FinanceSummary): ProductProfitRow[] {
    return summary.products.map((p) => {
        const profit = p.revenue - p.cost;
        return {
            key: p.key,
            name: p.name,
            units: p.units,
            sales: p.revenue,
            cost: p.cost,
            profit,
            margin: p.revenue > 0 ? profit / p.revenue : null,
            missingUnits: p.missing_units,
        };
    });
}

/** Of every parcel that reached a door in the period, the share the customer refused; null when none did. */
export function refusedShare(summary: FinanceSummary): number | null {
    const reachedDoor = summary.sales.orders + summary.failed.refused_orders;
    return reachedDoor > 0 ? summary.failed.refused_orders / reachedDoor : null;
}

/** What Prime still owes the shop for delivered parcels: the cash it collected minus its own fee. */
export function primeOwes(summary: FinanceSummary): number {
    return summary.cash.prime_held.collected - summary.cash.prime_held.fee;
}

/** Percent change from `previous` to `current`; null when the base is zero or negative (no honest percent exists). */
export function changePct(current: number, previous: number | null | undefined): number | null {
    if (previous === null || previous === undefined || previous <= 0) return null;
    return ((current - previous) / previous) * 100;
}
