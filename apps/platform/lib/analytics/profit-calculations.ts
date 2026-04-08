import { Order, Product } from "@/types";
import { isSameDay, subDays } from "date-fns";

/**
 * Daily profit breakdown with real cost calculations
 */
export interface DailyProfit {
    date: string;
    revenue: number;
    totalCost: number;
    netProfit: number;
    orderCount: number;
    breakdown: {
        productCost: number;
        deliveryCost: number;
        packagingCost: number;
        vialsCost: number;
        perfumeCost: number;
        sweetsCost: number;
        marketingCost: number;
    };
}

/**
 * Calculate order cost breakdown (reuses logic from useOrderProfits)
 */
function calculateOrderCost(
    order: Order,
    products: Product[],
    marketingCostPerOrder: number
): DailyProfit["breakdown"] {
    // Product cost calculation
    let productCost = 0;
    if (order.items && Array.isArray(order.items)) {
        for (const item of order.items) {
            const product = products.find(
                p => p.id === item.product_id || p.name === item.name
            );
            if (product && product.cost) {
                productCost += product.cost * (item.quantity || 1);
            }
        }
    }

    // Delivery cost (use order.delivery_cost if available, otherwise default 2,000 IQD)
    const deliveryCost = order.delivery_cost || 2000;

    // Packaging cost (1,000 IQD per order)
    const packagingCost = 1000;

    // Vials cost (500 IQD per order)
    const vialsCost = 500;

    // Sample perfume cost (check if order has sample perfume)
    const perfumeCost = order.items?.some(item =>
        item.name?.toLowerCase().includes("sample") ||
        item.name?.toLowerCase().includes("عينة")
    ) ? 1000 : 0;

    // Sweets cost (check if order has sweets/chocolates)
    const sweetsCost = order.items?.some(item =>
        item.name?.toLowerCase().includes("sweet") ||
        item.name?.toLowerCase().includes("chocolate") ||
        item.name?.toLowerCase().includes("حلويات")
    ) ? 500 : 0;

    return {
        productCost,
        deliveryCost,
        packagingCost,
        vialsCost,
        perfumeCost,
        sweetsCost,
        marketingCost: marketingCostPerOrder,
    };
}

/**
 * Calculate daily net profit with real cost data
 * Only considers delivered/completed orders (realized profit)
 */
export function calculateDailyNetProfit(
    orders: Order[],
    products: Product[],
    date: Date,
    marketingCostPerOrder: number
): DailyProfit {
    // Filter to delivered/completed orders on this date
    const dailyOrders = orders.filter(
        o =>
            (o.status === "delivered" || o.status === "completed") &&
            isSameDay(new Date(o.created_at), date)
    );

    let totalRevenue = 0;
    const aggregatedBreakdown: DailyProfit["breakdown"] = {
        productCost: 0,
        deliveryCost: 0,
        packagingCost: 0,
        vialsCost: 0,
        perfumeCost: 0,
        sweetsCost: 0,
        marketingCost: 0,
    };

    // Calculate revenue and aggregate costs
    for (const order of dailyOrders) {
        totalRevenue += order.price || 0;

        const costs = calculateOrderCost(order, products, marketingCostPerOrder);
        aggregatedBreakdown.productCost += costs.productCost;
        aggregatedBreakdown.deliveryCost += costs.deliveryCost;
        aggregatedBreakdown.packagingCost += costs.packagingCost;
        aggregatedBreakdown.vialsCost += costs.vialsCost;
        aggregatedBreakdown.perfumeCost += costs.perfumeCost;
        aggregatedBreakdown.sweetsCost += costs.sweetsCost;
        aggregatedBreakdown.marketingCost += costs.marketingCost;
    }

    const totalCost = Object.values(aggregatedBreakdown).reduce((sum, cost) => sum + cost, 0);
    const netProfit = totalRevenue - totalCost;

    return {
        date: date.toISOString().split("T")[0],
        revenue: totalRevenue,
        totalCost,
        netProfit,
        orderCount: dailyOrders.length,
        breakdown: aggregatedBreakdown,
    };
}

/**
 * Calculate profit pulse (today vs yesterday)
 */
export interface ProfitPulse {
    today: {
        netProfit: number;
        revenue: number;
        totalCost: number;
        orderCount: number;
    };
    yesterday: {
        netProfit: number;
        revenue: number;
        totalCost: number;
        orderCount: number;
    };
    change: {
        amount: number;
        percentage: number;
        trend: "up" | "down" | "neutral";
    };
}

export function calculateProfitPulse(
    orders: Order[],
    products: Product[],
    marketingCost: number
): ProfitPulse {
    // Only consider delivered/completed orders for marketing cost allocation
    const deliveredOrders = orders.filter(
        o => o.status === "delivered" || o.status === "completed"
    );

    const marketingPerOrder =
        deliveredOrders.length > 0 ? marketingCost / deliveredOrders.length : 0;

    const today = calculateDailyNetProfit(orders, products, new Date(), marketingPerOrder);
    const yesterday = calculateDailyNetProfit(
        orders,
        products,
        subDays(new Date(), 1),
        marketingPerOrder
    );

    const changeAmount = today.netProfit - yesterday.netProfit;
    const changePercentage =
        yesterday.netProfit !== 0
            ? (changeAmount / Math.abs(yesterday.netProfit)) * 100
            : 0;

    let trend: "up" | "down" | "neutral" = "neutral";
    if (changeAmount > 0) trend = "up";
    else if (changeAmount < 0) trend = "down";

    return {
        today: {
            netProfit: today.netProfit,
            revenue: today.revenue,
            totalCost: today.totalCost,
            orderCount: today.orderCount,
        },
        yesterday: {
            netProfit: yesterday.netProfit,
            revenue: yesterday.revenue,
            totalCost: yesterday.totalCost,
            orderCount: yesterday.orderCount,
        },
        change: {
            amount: changeAmount,
            percentage: changePercentage,
            trend,
        },
    };
}
