/**
 * Product Health Scoring Engine
 *
 * Calculates a composite health score (A–F) for each product based on:
 *   - Margin quality (0–25 pts)
 *   - Sales velocity (0–25 pts)
 *   - Inventory turnover (0–25 pts)
 *   - Supply coverage (0–25 pts)
 *
 * Also provides ABC revenue classification and dead-stock / slow-mover detection.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HealthGrade = "A" | "B" | "C" | "D" | "F";
export type ABCTier = "A" | "B" | "C";

export interface ProductScoreInput {
    id: string;
    price: number;
    cost: number | null | undefined;
    stock_quantity: number;
    reserved_quantity?: number;
    low_stock_threshold: number;
    times_sold: number;
    total_revenue: number;
    created_at: string; // ISO date
    last_sold_at?: string | null; // ISO date
    daily_sales_rate: number; // avg units/day over trailing 30 days
}

export interface ScoreComponents {
    marginScore: number; // 0–25
    velocityScore: number; // 0–25
    turnoverScore: number; // 0–25
    supplyScore: number; // 0–25
}

export interface ProductScore {
    overall: HealthGrade;
    numericScore: number; // 0–100
    components: ScoreComponents;
    daysOfSupply: number;
    daysSinceLastSale: number;
    flags: {
        isDeadStock: boolean; // no sales in 60+ days
        isSlowMover: boolean; // <1 sale/week for 30 days
        isOverstocked: boolean; // >90 days supply
        isUnderstocked: boolean; // <7 days supply
        isNegativeMargin: boolean;
    };
}

export interface DeadStockResult {
    status: "active" | "slow_mover" | "dead_stock";
    daysSinceLastSale: number;
    suggestedActions: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function daysBetween(dateA: Date, dateB: Date): number {
    return Math.abs(dateA.getTime() - dateB.getTime()) / (1000 * 60 * 60 * 24);
}

function gradeFromScore(score: number): HealthGrade {
    if (score >= 80) return "A";
    if (score >= 60) return "B";
    if (score >= 40) return "C";
    if (score >= 20) return "D";
    return "F";
}

// ---------------------------------------------------------------------------
// Core scoring
// ---------------------------------------------------------------------------

/**
 * Calculate margin score (0–25).
 * margin% = (price - cost) / price * 100
 * Score  = (margin% / 60) * 25  capped at 25.
 */
function marginScore(price: number, cost: number | null | undefined): number {
    if (!cost || cost <= 0 || price <= 0) return 0;
    const marginPct = ((price - cost) / price) * 100;
    if (marginPct < 0) return 0;
    return clamp(Math.round((marginPct / 60) * 25), 0, 25);
}

/**
 * Calculate velocity score (0–25).
 * Based on daily_sales_rate relative to the provided category average.
 * Top 20% of rates → 25, next 30% → 18, bottom 50% → 8, zero → 0.
 *
 * When no category average is available, use absolute thresholds:
 *   >2/day → 25, >0.5/day → 18, >0 → 8, 0 → 0
 */
function velocityScore(dailyRate: number, categoryAvgRate?: number): number {
    if (dailyRate <= 0) return 0;
    if (categoryAvgRate && categoryAvgRate > 0) {
        const ratio = dailyRate / categoryAvgRate;
        if (ratio >= 1.5) return 25; // top performers
        if (ratio >= 0.8) return 18; // average
        return 8; // below average
    }
    // Absolute thresholds
    if (dailyRate >= 2) return 25;
    if (dailyRate >= 0.5) return 18;
    return 8;
}

/**
 * Calculate turnover score (0–25).
 * turnover_days = stock / daily_sales_rate
 * <14d → 25, 14-30 → 20, 30-60 → 15, 60-90 → 8, >90 → 3
 */
function turnoverScore(stock: number, dailyRate: number): number {
    if (dailyRate <= 0) return stock === 0 ? 12 : 3; // no sales but no stock = neutral
    const turnoverDays = stock / dailyRate;
    if (turnoverDays < 14) return 25;
    if (turnoverDays < 30) return 20;
    if (turnoverDays < 60) return 15;
    if (turnoverDays < 90) return 8;
    return 3;
}

/**
 * Calculate supply coverage score (0–25).
 * days_of_supply = stock / daily_sales_rate
 * 14-45d = 25 (optimal), 7-14 or 45-90 → 18, <7 or >90 → 8, 0 stock → 0
 */
function supplyScore(stock: number, dailyRate: number): number {
    if (stock <= 0) return 0;
    if (dailyRate <= 0) return 12; // stock exists but no sales — neutral
    const daysOfSupply = stock / dailyRate;
    if (daysOfSupply >= 14 && daysOfSupply <= 45) return 25; // sweet spot
    if ((daysOfSupply >= 7 && daysOfSupply < 14) || (daysOfSupply > 45 && daysOfSupply <= 90)) return 18;
    return 8; // <7 or >90
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate full health score for a single product.
 */
export function calculateProductScore(
    input: ProductScoreInput,
    categoryAvgRate?: number
): ProductScore {
    const availableStock = Math.max(0, input.stock_quantity - (input.reserved_quantity || 0));
    const rate = input.daily_sales_rate;
    const now = new Date();
    const lastSold = input.last_sold_at ? new Date(input.last_sold_at) : null;
    const daysSinceLastSale = lastSold ? daysBetween(now, lastSold) : Infinity;
    const daysOfSupply = rate > 0 ? availableStock / rate : Infinity;

    const components: ScoreComponents = {
        marginScore: marginScore(input.price, input.cost),
        velocityScore: velocityScore(rate, categoryAvgRate),
        turnoverScore: turnoverScore(availableStock, rate),
        supplyScore: supplyScore(availableStock, rate),
    };

    const numericScore =
        components.marginScore +
        components.velocityScore +
        components.turnoverScore +
        components.supplyScore;

    const cost = input.cost ?? 0;
    const marginPct = cost > 0 && input.price > 0 ? ((input.price - cost) / input.price) * 100 : 0;

    return {
        overall: gradeFromScore(numericScore),
        numericScore,
        components,
        daysOfSupply: Number.isFinite(daysOfSupply) ? Math.round(daysOfSupply) : Infinity,
        daysSinceLastSale: Number.isFinite(daysSinceLastSale) ? Math.round(daysSinceLastSale) : Infinity,
        flags: {
            isDeadStock: daysSinceLastSale >= 60 && availableStock > 0,
            isSlowMover: rate < 1 / 7 && rate > 0 && daysSinceLastSale < 60,
            isOverstocked: daysOfSupply > 90,
            isUnderstocked: daysOfSupply < 7 && daysOfSupply > 0,
            isNegativeMargin: marginPct < 0,
        },
    };
}

/**
 * Detect dead stock / slow mover status with actionable suggestions.
 */
export function detectDeadStock(input: ProductScoreInput): DeadStockResult {
    const now = new Date();
    const lastSold = input.last_sold_at ? new Date(input.last_sold_at) : null;
    const daysSinceLastSale = lastSold ? Math.round(daysBetween(now, lastSold)) : Infinity;
    const availableStock = Math.max(0, input.stock_quantity - (input.reserved_quantity || 0));

    if (daysSinceLastSale >= 60 && availableStock > 0) {
        return {
            status: "dead_stock",
            daysSinceLastSale,
            suggestedActions: ["Discount 20%", "Create bundle", "Archive"],
        };
    }

    if (input.daily_sales_rate < 1 / 7 && input.daily_sales_rate > 0) {
        return {
            status: "slow_mover",
            daysSinceLastSale,
            suggestedActions: ["Promote on storefront", "Discount 10%", "Review pricing"],
        };
    }

    return {
        status: "active",
        daysSinceLastSale,
        suggestedActions: [],
    };
}

/**
 * ABC classification by revenue (Pareto principle).
 * A = products accounting for top 80% of revenue
 * B = next 15% (80%–95%)
 * C = remaining 5%
 */
export function calculateABCTiers(
    products: { id: string; total_revenue: number }[]
): Map<string, ABCTier> {
    const result = new Map<string, ABCTier>();
    if (products.length === 0) return result;

    // Sort descending by revenue
    const sorted = [...products].sort((a, b) => (b.total_revenue || 0) - (a.total_revenue || 0));
    const totalRevenue = sorted.reduce((sum, p) => sum + (p.total_revenue || 0), 0);

    if (totalRevenue === 0) {
        // No revenue — all C
        sorted.forEach((p) => result.set(p.id, "C"));
        return result;
    }

    let cumulative = 0;
    for (const product of sorted) {
        cumulative += product.total_revenue || 0;
        const pct = cumulative / totalRevenue;
        if (pct <= 0.8) {
            result.set(product.id, "A");
        } else if (pct <= 0.95) {
            result.set(product.id, "B");
        } else {
            result.set(product.id, "C");
        }
    }

    return result;
}

/**
 * Convenience: compute daily sales rate from times_sold over N days.
 * Default window: 30 days.
 */
export function computeDailySalesRate(timesSold: number, windowDays: number = 30): number {
    return windowDays > 0 ? timesSold / windowDays : 0;
}

/**
 * Estimate days until stockout.
 * Returns Infinity if no sales velocity.
 */
export function estimateDaysUntilStockout(stock: number, dailyRate: number): number {
    if (dailyRate <= 0) return Infinity;
    return Math.max(0, stock / dailyRate);
}
