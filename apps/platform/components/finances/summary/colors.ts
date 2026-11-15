import type { CostLineId } from "@/lib/finance/summary";

/**
 * One colour per kind of money, the same in the statement, the chart and the
 * small cards, so a colour always means the same thing on the page. Mid-tones
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
