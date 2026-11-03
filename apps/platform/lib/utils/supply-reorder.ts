export type ReorderUrgency = "critical" | "warning" | "ok";

/** How soon a supply runs out compared with how long a reorder takes to arrive. */
export function urgencyFor(days: number | null, leadTime: number): ReorderUrgency {
    if (days === null) return "ok";
    if (days <= leadTime) return "critical";
    if (days <= leadTime * 2) return "warning";
    return "ok";
}

/** Quantity to order: cover lead time x 1.3 safety plus the gap to the reorder point, rounded up to the MOQ. */
interface ReorderInput {
    leadTimeDays: number;
    dailyRate: number;
    reorderPoint: number;
    stock: number;
}

/**
 * Units still missing to cover the lead time (x 1.3 safety) and land at the
 * reorder point after receipt. Zero or less means the stock given (including
 * what is already on order) is enough.
 */
export function reorderShortfall({ leadTimeDays, dailyRate, reorderPoint, stock }: ReorderInput): number {
    return Math.ceil(leadTimeDays * dailyRate * 1.3 + (reorderPoint - stock));
}

export function calcSuggestedQty({
    leadTimeDays,
    dailyRate,
    reorderPoint,
    stock,
    moq,
}: ReorderInput & { moq: number }): number {
    const needed = Math.max(moq, reorderShortfall({ leadTimeDays, dailyRate, reorderPoint, stock }));
    if (moq <= 1) return needed;
    return Math.ceil(needed / moq) * moq;
}

/** The supply fields the reorder rule reads. */
export interface ReorderSupply {
    stock_quantity?: number | null;
    reserved_quantity?: number | null;
    reorder_point?: number | null;
    low_stock_threshold?: number | null;
    /** 30-day usage (the supplies tab fills it from supply_usage_30d). */
    times_sold_30d?: number | null;
    suppliers?: { is_primary?: boolean | null; lead_time_days?: number | null; minimum_order_quantity?: number | null }[] | null;
}

export interface ReorderState {
    /** Below its reorder point, or runs out within two lead times. */
    low: boolean;
    /** Low, but what is already on an open PO covers it. */
    covered: boolean;
    /** Low and not covered: the one "needs ordering" every screen counts. */
    needsOrder: boolean;
    belowReorder: boolean;
    reorderPoint: number;
    leadTimeDays: number;
    moq: number;
    dailyRate: number;
    daysUntilStockout: number | null;
}

/**
 * One rule for "does this supply need ordering", shared by the Reorder button
 * badge, the KPI strip, Today's Actions and the reorder drawer, so they never
 * disagree. `onOrder` is what open (sent / confirmed / partial) POs still bring.
 */
export function supplyReorderState(s: ReorderSupply, onOrder: number): ReorderState {
    const stock = s.stock_quantity ?? 0;
    const reorderPoint = s.reorder_point ?? s.low_stock_threshold ?? 5;
    const available = Math.max(0, stock - (s.reserved_quantity ?? 0));
    const dailyRate = (s.times_sold_30d ?? 0) / 30;
    const daysUntilStockout = dailyRate > 0 ? Math.round(available / dailyRate) : null;
    const suppliers = Array.isArray(s.suppliers) ? s.suppliers : [];
    const primary = suppliers.find((x) => x.is_primary) ?? suppliers[0] ?? null;
    const leadTimeDays = primary?.lead_time_days ?? 7;
    const moq = primary?.minimum_order_quantity ?? 1;

    const belowReorder = stock <= reorderPoint;
    const atRisk = daysUntilStockout !== null && daysUntilStockout <= leadTimeDays * 2;
    const low = belowReorder || atRisk;
    // Covered once what is arriving reaches the reorder point and lasts through
    // the lead time; then a new PO would only double-buy.
    const covered =
        low &&
        onOrder > 0 &&
        stock + onOrder > reorderPoint &&
        reorderShortfall({ leadTimeDays, dailyRate, reorderPoint, stock: stock + onOrder }) <= 0;
    return { low, covered, needsOrder: low && !covered, belowReorder, reorderPoint, leadTimeDays, moq, dailyRate, daysUntilStockout };
}

/**
 * The one status colour a supply shows everywhere (days pill, stock bar):
 * - out: nothing on hand
 * - critical: runs out before a new order could arrive, and nothing covers it
 * - low: needs ordering
 * - ok: fine, or what is already on order covers it
 */
export type SupplyTone = "out" | "critical" | "low" | "ok";

export function supplyTone(s: ReorderSupply, onOrder: number): SupplyTone {
    const state = supplyReorderState(s, onOrder);
    if ((s.stock_quantity ?? 0) <= 0 && !state.covered) return "out";
    if (!state.needsOrder) return "ok";
    if (state.daysUntilStockout !== null && state.daysUntilStockout <= state.leadTimeDays) return "critical";
    return "low";
}
