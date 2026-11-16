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
 *   delivery       what the courier kept on delivered orders, read from the
 *                  shop's confirmed payment files; the courier's fee on
 *                  delivered Prime parcels (an order with a Prime parcel is
 *                  charged there, never from a file too) and on the parcels
 *                  that came back (on the day they came back); plus courier
 *                  bills typed as `shipping` expenses
 *   refunds        money paid back, on the day it was paid
 *   other costs    every other expense category, except stock purchases
 *   salaries       payroll actually paid in the period
 *   net profit     sales minus all of the above
 *   stock purchase an expense typed as `product_cost`: cash out, but never a
 *                  cost of the period, because the goods are already counted
 *                  as product cost on the day they sell
 *   reached you    the courier's payments dated in the period, each payment
 *                  file counted once
 *   break-even     delivered orders a day that pay the daily bill (ads, other
 *                  costs, salaries) out of what one order leaves after its
 *                  goods, its delivery and the refunds
 */

const DailySchema = z.object({
    day: z.string(),
    orders: z.number(),
    revenue: z.number(),
    product_cost: z.number(),
    courier: z.number(),
    /** What the courier kept on that day's delivered orders, from the shop's payment files. */
    courier_file: z.number(),
    refunds: z.number(),
    expenses: z.number(),
    salaries: z.number(),
});

const ProductSchema = z.object({
    key: z.string(),
    name: z.string(),
    image_url: z.string().nullable(),
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
        /** Delivered orders of the period a courier payment already covers. */
        paid_orders: z.number(),
    }),
    refunds: CountAmountSchema,
    expenses: z.array(z.object({ category: z.string(), amount: z.number() })),
    salaries_paid: z.number(),
    courier: z.object({
        prime_fee: z.number(),
        prime_parcels: z.number(),
        /** What the courier kept on the period's delivered orders, read from confirmed payment files. */
        file_fee: z.number(),
        file_orders: z.number(),
    }),
    cash: z.object({
        in_transit: CountAmountSchema,
        stuck: CountAmountSchema,
        /** Parcels Prime is bringing back: still "in transit" in the app, but goods, not money. */
        returning: CountAmountSchema,
        prime_linked: z.boolean(),
        prime_held: z.object({ parcels: z.number(), collected: z.number(), fee: z.number() }),
        /** Courier payments dated in the period: each payment file once, net of the courier's fee. */
        reached: z.object({
            payments: z.number(),
            amount: z.number(),
            last_day: z.string().nullable(),
            last_amount: z.number(),
        }),
    }),
    failed: z.object({
        refused_orders: z.number(),
        refused_value: z.number(),
        prime_returned_parcels: z.number(),
        prime_returned_fee: z.number(),
    }),
    /** What is on the shelf now (not tied to the period). */
    stock: z.object({
        pieces: z.number(),
        costed_pieces: z.number(),
        cost_value: z.number(),
        missing_cost_products: z.number(),
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
    /** `file_fee`, `prime_fee`, `prime_returned_fee`, `courier_bills` or an expense category. */
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
const STOCK_PURCHASE_CATEGORY = "product_cost";
const OUTSIDE_OTHER = new Set([ADS_CATEGORY, COURIER_BILLS_CATEGORY, STOCK_PURCHASE_CATEGORY]);

function expenseTotal(summary: FinanceSummary, category: string): number {
    return summary.expenses.filter((e) => e.category === category).reduce((sum, e) => sum + e.amount, 0);
}

/** Money spent on new stock in the period: cash out, outside the profit statement. */
export function stockPurchases(summary: FinanceSummary): number {
    return expenseTotal(summary, STOCK_PURCHASE_CATEGORY);
}

export function buildStatement(summary: FinanceSummary): ProfitStatement {
    const sales = summary.sales.revenue;
    const ads = expenseTotal(summary, ADS_CATEGORY);
    const courierBills = expenseTotal(summary, COURIER_BILLS_CATEGORY);
    const otherParts = summary.expenses
        .filter((e) => !OUTSIDE_OTHER.has(e.category) && e.amount !== 0)
        .map((e) => ({ key: e.category, amount: e.amount }));
    const other = otherParts.reduce((sum, p) => sum + p.amount, 0);

    const amounts: Record<CostLineId, { amount: number; parts: CostPart[] }> = {
        product_cost: { amount: summary.sales.product_cost, parts: [] },
        ads: { amount: ads, parts: [] },
        delivery: {
            amount: summary.courier.file_fee + summary.courier.prime_fee + summary.failed.prime_returned_fee + courierBills,
            parts: [
                { key: "file_fee", amount: summary.courier.file_fee },
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

/** How the statement's figures are read: the period's totals, or one average delivered order. */
export const LENSES = ["total", "order"] as const;
export type Lens = (typeof LENSES)[number];

/** `amount` through a lens, as a whole number; null when the lens has no base (no order delivered). */
export function throughLens(amount: number, statement: ProfitStatement, lens: Lens): number | null {
    return lens === "total" ? amount : perOrder(amount, statement.orders);
}

/** Under this many delivered orders, a period's averages are too jumpy to compare against. */
const COMPARABLE_ORDERS = 20;

/**
 * A figure against the same figure of the period before, both read through the
 * lens, as a percent change. Null when either side has no reading, the earlier
 * one is zero (no honest percent exists), or an average is asked of an earlier
 * period that delivered too few orders to have a steady one.
 */
export function lensChange(
    amount: number,
    statement: ProfitStatement,
    amountBefore: number,
    statementBefore: ProfitStatement,
    lens: Lens,
): number | null {
    if (lens !== "total" && statementBefore.orders < COMPARABLE_ORDERS) return null;
    const now = throughLens(amount, statement, lens);
    if (now === null) return null;
    return changePct(now, throughLens(amountBefore, statementBefore, lens));
}

export interface WaterfallStep {
    id: CostLineId;
    /** Where the cost's segment starts, as a share of sales (0 to 1): what is left after it. */
    start: number;
    /** The segment's width, as a share of sales. A cost bigger than what is left is cut to what is left. */
    width: number;
}

/**
 * The statement as a staircase: each cost bites its share off the right end of
 * what the costs before it left, so the bars step down from sales to profit.
 */
export function waterfall(statement: ProfitStatement): WaterfallStep[] {
    let left = 1;
    return statement.lines
        .filter((line) => line.amount > 0)
        .map((line) => {
            const width = Math.min(line.share, left);
            left -= width;
            return { id: line.id, start: left, width };
        });
}

/** Sales brought by each 1,000 IQD of ads, rounded; null when nothing was spent on ads. */
export function adReturn(statement: ProfitStatement): number | null {
    const ads = statement.lines.find((l) => l.id === "ads")?.amount ?? 0;
    return ads > 0 ? Math.round((statement.sales / ads) * 1000) : null;
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
    return day.revenue - day.product_cost - day.courier - day.courier_file - day.refunds - day.expenses - day.salaries;
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

export interface PathPoint extends ProfitBar {
    /** Net profit from the period's first day to the end of this point. */
    running: number;
}

/** The period as a path: each day (week, month) with the profit added up so far. The last point is the net profit. */
export function profitPath(daily: readonly FinanceSummaryDay[]): { step: BarStep; points: PathPoint[] } {
    const { step, bars } = profitBars(daily);
    let running = 0;
    const points = bars.map((bar): PathPoint => {
        running += bar.profit;
        return { ...bar, running };
    });
    return { step, points };
}

export interface ProductProfitRow {
    key: string;
    name: string;
    imageUrl: string | null;
    units: number;
    sales: number;
    cost: number;
    /** Sales minus the cost of the goods (before ads, delivery and other costs). */
    profit: number;
    /** Profit as a share of sales; null when the product sold for nothing. */
    margin: number | null;
    /** Profit on one piece, rounded; null when no piece was sold. */
    profitPerPiece: number | null;
    /** This product's part of all the profit the products made, 0 to 1 (0 for a losing product). */
    profitShare: number;
    /** Pieces sold with no cost on file: the profit shown is too high by their cost. */
    missingUnits: number;
}

/** The products of the period, the one that earned most first. */
export function productRows(summary: FinanceSummary): ProductProfitRow[] {
    const profits = summary.products.map((p) => p.revenue - p.cost);
    const earned = profits.reduce((sum, profit) => sum + Math.max(profit, 0), 0);
    return summary.products
        .map((p, i): ProductProfitRow => {
            const profit = profits[i];
            return {
                key: p.key,
                name: p.name,
                imageUrl: p.image_url,
                units: p.units,
                sales: p.revenue,
                cost: p.cost,
                profit,
                margin: p.revenue > 0 ? profit / p.revenue : null,
                profitPerPiece: p.units > 0 ? Math.round(profit / p.units) : null,
                profitShare: earned > 0 ? Math.max(profit, 0) / earned : 0,
                missingUnits: p.missing_units,
            };
        })
        .sort((a, b) => b.profit - a.profit);
}

/**
 * The courier's fee may be in the statement twice: the payment files already
 * carry it, and courier bills were typed as `shipping` expenses too. The page
 * cannot tell whether a typed bill covers the same orders, so it counts both
 * and says so. Null when only one of the two sources has a fee.
 */
export function deliveryOverlap(summary: FinanceSummary): { fileFee: number; bills: number } | null {
    const bills = expenseTotal(summary, COURIER_BILLS_CATEGORY);
    return summary.courier.file_fee > 0 && bills > 0 ? { fileFee: summary.courier.file_fee, bills } : null;
}

/**
 * The marks of a chart's money scale: zero, then round steps (1, 2, 2.5 or 5
 * times a power of ten) up to the highest value and down to the lowest. The
 * widest step that still leaves three marks is used, so the scale reads
 * "0, 2.5, 5 million" and never shrinks to a lone zero.
 */
export function scaleMarks(low: number, high: number): number[] {
    const top = Math.max(high, 0);
    const bottom = Math.min(low, 0);
    const range = top - bottom;
    if (range <= 0) return [0];
    const power = 10 ** Math.floor(Math.log10(range));
    const steps = [power / 10, power].flatMap((p) => [1, 2, 2.5, 5].map((m) => m * p)).filter((step) => step >= 1);
    const count = (step: number) => Math.floor(top / step) - Math.ceil(bottom / step) + 1;
    const step = steps.reverse().find((candidate) => count(candidate) >= 3);
    if (step === undefined) return [0];
    const marks: number[] = [];
    // `|| 0` keeps a rounded-up negative from printing as minus zero.
    for (let k = Math.ceil(bottom / step); k * step <= top; k += 1) marks.push(k * step || 0);
    return marks;
}

/** How many times the sales before a period may fit into it and still be a fair base: past this, every arrow is noise. */
const COMPARABLE_SALES_RATIO = 11;

/**
 * Whether the period before sold enough to compare a statement against. When
 * it did not (nothing sold, or a tenth of today's sales), no line is compared:
 * one arrow alone on a line that happens to pass reads as a mistake.
 */
export function isComparablePeriod(statement: ProfitStatement, before: ProfitStatement): boolean {
    return before.sales > 0 && statement.sales < before.sales * COMPARABLE_SALES_RATIO;
}

export interface BreakEven {
    /** What one delivered order leaves after its goods, its delivery and the period's refunds. */
    leftPerOrder: number;
    /** Ads, other costs and salaries for one day of the period. */
    dailyBill: number;
    /** Delivered orders a day that pay the daily bill; null when an order leaves nothing to pay it with. */
    needed: number | null;
    /** Delivered orders a day in the period. */
    delivered: number;
}

/**
 * How many delivered orders a day cover the costs that do not come with an
 * order. Goods, delivery and refunds travel with each order, so they come off
 * what an order leaves; ads, other costs and salaries are the daily bill that
 * money has to pay. Null when nothing was delivered.
 */
export function breakEven(summary: FinanceSummary, statement: ProfitStatement): BreakEven | null {
    const days = summary.daily.length;
    if (statement.orders === 0 || days === 0) return null;
    const line = (id: CostLineId) => statement.lines.find((l) => l.id === id)?.amount ?? 0;
    const left = (statement.sales - line("product_cost") - line("delivery") - line("refunds")) / statement.orders;
    const dailyBill = (line("ads") + line("other") + line("salaries")) / days;
    return {
        leftPerOrder: Math.round(left),
        dailyBill: Math.round(dailyBill),
        needed: left > 0 ? dailyBill / left : null,
        delivered: statement.orders / days,
    };
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
