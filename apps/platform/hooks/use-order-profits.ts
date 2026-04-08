"use client";

import { useMemo, useCallback } from "react";
import { Order, Product } from "@/lib/supabase";
import {
    ORDER_FIXED_COSTS,
    OrderCostBreakdown,
    ProfitSummary,
    CustomerAnalytics,
    PipelineSummary,
    FunnelSummary,
} from "@/types/expense";

/**
 * Hook for calculating per-order profits and customer analytics
 */
export function useOrderProfits(
    orders: Order[],
    products: Product[],
    marketingCost: number = 0
) {
    /**
     * Find product by name, SKU, or alias
     */
    const findProduct = useCallback((itemName: string, itemSku?: string): Product | null => {
        if (!itemName && !itemSku) return null;

        // First try exact SKU match
        if (itemSku) {
            const bySkuExact = products.find(
                p => p.sku?.toLowerCase() === itemSku.toLowerCase()
            );
            if (bySkuExact) return bySkuExact;
        }

        // Try exact name match
        const byNameExact = products.find(
            p => p.name.toLowerCase() === itemName.toLowerCase()
        );
        if (byNameExact) return byNameExact;

        // Try partial name match
        const byNamePartial = products.find(
            p => itemName.toLowerCase().includes(p.name.toLowerCase()) ||
                p.name.toLowerCase().includes(itemName.toLowerCase())
        );
        if (byNamePartial) return byNamePartial;

        // Try aliases
        const byAlias = products.find(p => {
            if (!p.lightfunnels_aliases) return false;
            return p.lightfunnels_aliases.some(
                alias => alias.toLowerCase() === itemName.toLowerCase()
            );
        });
        if (byAlias) return byAlias;

        return null;
    }, [products]);

    /**
     * Calculate cost breakdown for a single order
     */
    const calculateOrderCost = useCallback((order: Order): OrderCostBreakdown => {
        const items = order.items || [];

        // Count items and unique products
        const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
        const uniqueProductNames = new Set(items.map(item => item.name.toLowerCase()));
        const uniqueProductCount = uniqueProductNames.size;

        // Calculate product costs (wholesale cost × quantity)
        let productCost = 0;
        const matchedProducts: Product[] = [];

        items.forEach(item => {
            const product = findProduct(item.name, item.sku);
            if (product) {
                productCost += (product.cost || 0) * item.quantity;
                if (!matchedProducts.find(p => p.id === product.id)) {
                    matchedProducts.push(product);
                }
            }
        });

        // Fixed costs per order
        const deliveryCost = ORDER_FIXED_COSTS.DELIVERY;
        const sweetsCost = ORDER_FIXED_COSTS.SWEETS;

        // Packaging: 1 bag per item
        const packagingCost = ORDER_FIXED_COSTS.PACKAGING_PER_BAG * itemCount;

        // Vial cost: 1 vial per unique product
        const vialCost = ORDER_FIXED_COSTS.VIAL_COST * uniqueProductCount;

        // Sample perfume cost: (wholesale cost / 100) for each unique product
        // This represents the 1ml of perfume we put in each sample vial
        const samplePerfumeCost = matchedProducts.reduce((sum, product) => {
            return sum + (product.cost || 0) / 100;
        }, 0);

        // Total cost
        const totalCost = productCost + deliveryCost + packagingCost + vialCost + samplePerfumeCost + sweetsCost;

        // Profit calculations
        const revenue = order.price || 0;
        const grossProfit = revenue - totalCost;
        const profitMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

        return {
            orderId: order.id,
            orderNumber: order.sequence_number,
            customerName: order.customer_name || "Unknown",
            orderDate: order.created_at,
            revenue,
            productCost,
            deliveryCost,
            packagingCost,
            vialCost,
            samplePerfumeCost,
            sweetsCost,
            totalCost,
            grossProfit,
            profitMargin,
            itemCount,
            uniqueProductCount,
        };
    }, [findProduct]);

    /**
     * Calculate cost breakdowns for delivered/completed orders only
     */
    const orderCostBreakdowns = useMemo((): OrderCostBreakdown[] => {
        // Only calculate for successfully delivered/completed orders
        const relevantOrders = orders.filter(
            o => o.status === "delivered" || o.status === "completed"
        );

        return relevantOrders.map(order => calculateOrderCost(order));
    }, [orders, calculateOrderCost]);

    /**
     * Aggregate profit summary for the period
     */
    const profitSummary = useMemo((): ProfitSummary => {
        const breakdown = orderCostBreakdowns.reduce(
            (acc, order) => ({
                totalRevenue: acc.totalRevenue + order.revenue,
                totalProductCost: acc.totalProductCost + order.productCost,
                totalDeliveryCost: acc.totalDeliveryCost + order.deliveryCost,
                totalPackagingCost: acc.totalPackagingCost + order.packagingCost,
                totalVialCost: acc.totalVialCost + order.vialCost,
                totalSamplePerfumeCost: acc.totalSamplePerfumeCost + order.samplePerfumeCost,
                totalSweetsCost: acc.totalSweetsCost + order.sweetsCost,
            }),
            {
                totalRevenue: 0,
                totalProductCost: 0,
                totalDeliveryCost: 0,
                totalPackagingCost: 0,
                totalVialCost: 0,
                totalSamplePerfumeCost: 0,
                totalSweetsCost: 0,
            }
        );

        const totalOperationalCost =
            breakdown.totalProductCost +
            breakdown.totalDeliveryCost +
            breakdown.totalPackagingCost +
            breakdown.totalVialCost +
            breakdown.totalSamplePerfumeCost +
            breakdown.totalSweetsCost;

        const totalCost = totalOperationalCost + marketingCost;
        const grossProfit = breakdown.totalRevenue - totalOperationalCost;
        const netProfit = grossProfit - marketingCost;
        const grossProfitMargin = breakdown.totalRevenue > 0
            ? (grossProfit / breakdown.totalRevenue) * 100
            : 0;
        const netProfitMargin = breakdown.totalRevenue > 0
            ? (netProfit / breakdown.totalRevenue) * 100
            : 0;

        const orderCount = orderCostBreakdowns.length;
        const deliveredCount = orders.filter(o => o.status === "delivered").length;
        const completedCount = orders.filter(o => o.status === "completed").length;
        const avgProfitPerOrder = orderCount > 0 ? grossProfit / orderCount : 0;

        return {
            ...breakdown,
            totalOperationalCost,
            marketingCost,
            totalCost,
            grossProfit,
            netProfit,
            grossProfitMargin,
            netProfitMargin,
            orderCount,
            deliveredCount,
            completedCount,
            avgProfitPerOrder,
        };
    }, [orderCostBreakdowns, marketingCost, orders]);

    /**
     * Customer analytics: single vs repeat customers
     */
    const customerAnalytics = useMemo((): CustomerAnalytics => {
        // Use delivered/completed orders for customer analysis
        const relevantOrders = orders.filter(
            o => o.status === "delivered" || o.status === "completed"
        );

        // Group orders by phone number (normalized)
        const customerMap = new Map<string, {
            phone: string;
            name: string;
            orders: Order[];
            totalRevenue: number;
        }>();

        relevantOrders.forEach(order => {
            if (!order.phone) return;

            const normalizedPhone = order.phone.replace(/\s/g, "");
            const existing = customerMap.get(normalizedPhone);

            if (existing) {
                existing.orders.push(order);
                existing.totalRevenue += order.price || 0;
            } else {
                customerMap.set(normalizedPhone, {
                    phone: normalizedPhone,
                    name: order.customer_name || "Unknown",
                    orders: [order],
                    totalRevenue: order.price || 0,
                });
            }
        });

        const customers = Array.from(customerMap.values());
        const totalCustomers = customers.length;

        const singleOrderCustomers = customers.filter(c => c.orders.length === 1).length;
        const repeatCustomers = customers.filter(c => c.orders.length > 1).length;

        const singleOrderRevenue = customers
            .filter(c => c.orders.length === 1)
            .reduce((sum, c) => sum + c.totalRevenue, 0);

        const repeatCustomerRevenue = customers
            .filter(c => c.orders.length > 1)
            .reduce((sum, c) => sum + c.totalRevenue, 0);

        const totalOrders = relevantOrders.length;
        const avgOrdersPerCustomer = totalCustomers > 0 ? totalOrders / totalCustomers : 0;

        // Top customers by revenue
        const topCustomers = customers
            .sort((a, b) => b.totalRevenue - a.totalRevenue)
            .slice(0, 10)
            .map(c => ({
                phone: c.phone,
                name: c.name,
                orderCount: c.orders.length,
                totalRevenue: c.totalRevenue,
            }));

        return {
            totalCustomers,
            singleOrderCustomers,
            repeatCustomers,
            singleOrderRevenue,
            repeatCustomerRevenue,
            avgOrdersPerCustomer,
            topCustomers,
        };
    }, [orders]);

    /**
     * Product profit analysis
     */
    const productProfitAnalysis = useMemo(() => {
        const productStats = new Map<string, {
            name: string;
            sold: number;
            revenue: number;
            cost: number;
            profit: number;
        }>();

        orderCostBreakdowns.forEach(order => {
            const originalOrder = orders.find(o => o.id === order.orderId);
            if (!originalOrder?.items) return;

            originalOrder.items.forEach(item => {
                const product = findProduct(item.name, item.sku);
                const key = product?.name || item.name;

                const existing = productStats.get(key) || {
                    name: key,
                    sold: 0,
                    revenue: 0,
                    cost: 0,
                    profit: 0,
                };

                existing.sold += item.quantity;
                existing.revenue += item.price * item.quantity;
                existing.cost += (product?.cost || 0) * item.quantity;
                existing.profit = existing.revenue - existing.cost;

                productStats.set(key, existing);
            });
        });

        return Array.from(productStats.values())
            .sort((a, b) => b.profit - a.profit);
    }, [orderCostBreakdowns, orders, findProduct]);

    /**
     * Pipeline summary for confirmed + in_transit orders
     */
    const pipelineSummary = useMemo((): PipelineSummary => {
        // Filter for pipeline orders (confirmed + in_transit)
        const pipelineOrders = orders.filter(
            o => o.status === "confirmed" || o.status === "in_transit"
        );

        const confirmedCount = pipelineOrders.filter(o => o.status === "confirmed").length;
        const inTransitCount = pipelineOrders.filter(o => o.status === "in_transit").length;
        const orderCount = pipelineOrders.length;

        // Calculate potential revenue
        const potentialRevenue = pipelineOrders.reduce(
            (sum, order) => sum + (order.price || 0),
            0
        );

        // Calculate estimated costs for pipeline orders
        let estimatedCosts = 0;
        pipelineOrders.forEach(order => {
            const breakdown = calculateOrderCost(order);
            estimatedCosts += breakdown.totalCost;
        });

        // Projected profit
        const projectedProfit = potentialRevenue - estimatedCosts;
        const projectedProfitMargin = potentialRevenue > 0
            ? (projectedProfit / potentialRevenue) * 100
            : 0;

        const avgOrderValue = orderCount > 0 ? potentialRevenue / orderCount : 0;

        return {
            orderCount,
            confirmedCount,
            inTransitCount,
            potentialRevenue,
            projectedProfit,
            projectedProfitMargin,
            estimatedCosts,
            avgOrderValue,
        };
    }, [orders, calculateOrderCost]);

    /**
     * Order funnel: tracks all non-negative orders through lifecycle stages
     */
    const funnelSummary = useMemo((): FunnelSummary => {
        const excludedStatuses = new Set([
            "cancelled", "rejected", "no_response",
            "refund_delivered", "refund_failed",
            "suspended", "return_pending",
        ]);

        const funnelOrders = orders.filter(o => !excludedStatuses.has(o.status));
        const totalOrders = funnelOrders.length;

        const pendingCount = funnelOrders.filter(
            o => o.status === "new" || o.status === "contacted" || o.status === "pending_checkout"
        ).length;

        const confirmedCount = funnelOrders.filter(o => o.status === "confirmed").length;
        const inTransitCount = funnelOrders.filter(o => o.status === "in_transit").length;
        const deliveredCount = funnelOrders.filter(
            o => o.status === "delivered" || o.status === "completed"
        ).length;

        const confirmationRate = totalOrders > 0
            ? ((confirmedCount + inTransitCount + deliveredCount) / totalOrders) * 100
            : 0;
        const deliveryRate = totalOrders > 0
            ? (deliveredCount / totalOrders) * 100
            : 0;

        const totalRevenue = funnelOrders.reduce((sum, o) => sum + (o.price || 0), 0);
        const deliveredRevenue = funnelOrders
            .filter(o => o.status === "delivered" || o.status === "completed")
            .reduce((sum, o) => sum + (o.price || 0), 0);

        return {
            totalOrders,
            pendingCount,
            confirmedCount,
            inTransitCount,
            deliveredCount,
            confirmationRate,
            deliveryRate,
            totalRevenue,
            deliveredRevenue,
        };
    }, [orders]);

    return {
        calculateOrderCost,
        orderCostBreakdowns,
        profitSummary,
        customerAnalytics,
        productProfitAnalysis,
        pipelineSummary,
        funnelSummary,
    };
}
