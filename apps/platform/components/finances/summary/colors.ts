import type { CostLineId, OrderSliceId } from "@/lib/finance/summary";

/**
 * One colour per kind of money, the same in the statement, the order bar and
 * the chart, so a colour always means the same thing on the page. Mid-tones
 * that hold on both the light and the dark card.
 */
export const PROFIT_COLOR = "#13a06a";
export const LOSS_COLOR = "#e1486a";

export const COST_COLORS: Record<CostLineId, string> = {
    product_cost: "#e79a1b",
    ads: "#4f63d8",
    delivery: "#0e9aa7",
    refunds: "#e1486a",
    other: "#8f8a84",
    salaries: "#8a63d2",
};

export const SLICE_COLORS: Record<OrderSliceId, string> = {
    product_cost: COST_COLORS.product_cost,
    ads: COST_COLORS.ads,
    delivery: COST_COLORS.delivery,
    other: COST_COLORS.other,
    profit: PROFIT_COLOR,
};
