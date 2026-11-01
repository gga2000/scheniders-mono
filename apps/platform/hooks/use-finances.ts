"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useExpenses } from "./use-expenses";
import { ExpenseCategory } from "@/types/expense";
import type { Order, Product } from "@/lib/supabase";
import { isRealizedRevenue, isSaleOrder } from "@/lib/order-revenue";
import { resolveOrderLineCost, type CostSnapshots } from "@/lib/finance/item-cost";
import { baghdadDayKey } from "@/lib/order-window";

export interface DateRange {
    startDate: string;
    endDate: string;
}

export interface RevenueStats {
    totalRevenue: number;
    deliveredRevenue: number;
    pendingRevenue: number;
    cancelledRevenue: number;
    orderCount: number;
    deliveredCount: number;
    averageOrderValue: number;
}

export interface ProfitStats {
    grossProfit: number;
    totalExpenses: number;
    netProfit: number;
    profitMargin: number;
}

export interface PeriodComparison {
    current: RevenueStats;
    previous: RevenueStats;
    revenueChange: number;
    revenueChangePercent: number;
    orderChange: number;
    orderChangePercent: number;
}

export interface DailyData {
    date: string;
    revenue: number;
    profit: number;
    orders: number;
    expenses: number;
}

export interface RejectionStats {
    totalRejected: number;
    rejectionRate: number;
    byReason: Array<{ reason: string; count: number; percentage: number }>;
}

export interface HourlyData {
    hour: number;
    orders: number;
    revenue: number;
}

/**
 * useFinances hook - now accepts orders and products as parameters
 * to avoid creating redundant subscriptions.
 * 
 * @param orders - Orders array from useOrders() in parent component
 * @param products - Products array from useProductsCrud() in parent component
 * @param dateRange - Optional date range filter
 * @param snapshots - Frozen per-line costs of delivered orders (see useOrderCostSnapshots)
 */
export function useFinances(orders: Order[], products: Product[], dateRange?: DateRange, snapshots?: CostSnapshots) {
    const { expenses } = useExpenses();

    // Filter orders by date range
    const filteredOrders = useMemo(() => {
        if (!dateRange) return orders;

        return orders.filter((order) => {
            const orderDate = baghdadDayKey(new Date(order.created_at));
            return orderDate >= dateRange.startDate && orderDate <= dateRange.endDate;
        });
    }, [orders, dateRange]);

    // Filter expenses by date range
    const filteredExpenses = useMemo(() => {
        if (!dateRange) return expenses;

        return expenses.filter((expense) => {
            return expense.expense_date >= dateRange.startDate &&
                expense.expense_date <= dateRange.endDate;
        });
    }, [expenses, dateRange]);

    // Calculate revenue stats
    const revenueStats = useMemo((): RevenueStats => {
        let totalRevenue = 0;
        let deliveredRevenue = 0;
        let pendingRevenue = 0;
        let cancelledRevenue = 0;
        let deliveredCount = 0;

        filteredOrders.forEach((order) => {
            const orderValue = order.price || 0;
            if (!isSaleOrder(order)) {
                if (order.status === "rejected") cancelledRevenue += orderValue;
                return;
            }
            totalRevenue += orderValue;
            if (isRealizedRevenue(order)) {
                deliveredRevenue += orderValue;
                deliveredCount++;
            } else {
                pendingRevenue += orderValue;
            }
        });

        const orderCount = filteredOrders.filter(isSaleOrder).length;

        return {
            totalRevenue,
            deliveredRevenue,
            pendingRevenue,
            cancelledRevenue,
            orderCount,
            deliveredCount,
            averageOrderValue: orderCount > 0 ? totalRevenue / orderCount : 0,
        };
    }, [filteredOrders]);

    // Calculate profit stats
    const profitStats = useMemo((): ProfitStats => {
        const totalExpenses = filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0);

        // Calculate product costs from delivered orders
        let productCosts = 0;
        filteredOrders.forEach((order) => {
            if (isRealizedRevenue(order) && order.items) {
                order.items.forEach((item, index) => {
                    productCosts += resolveOrderLineCost(order, index, item, products, snapshots).cost;
                });
            }
        });

        const grossProfit = revenueStats.deliveredRevenue - productCosts;
        const netProfit = grossProfit - totalExpenses;
        const profitMargin = revenueStats.deliveredRevenue > 0
            ? (netProfit / revenueStats.deliveredRevenue) * 100
            : 0;

        return {
            grossProfit,
            totalExpenses,
            netProfit,
            profitMargin,
        };
    }, [filteredOrders, filteredExpenses, products, snapshots, revenueStats]);

    // Get daily data for charts
    const dailyData = useMemo((): DailyData[] => {
        const dataMap = new Map<string, DailyData>();

        // Process orders
        filteredOrders.forEach((order) => {
            if (!isSaleOrder(order)) return;

            const date = baghdadDayKey(new Date(order.created_at));
            const existing = dataMap.get(date) || { date, revenue: 0, profit: 0, orders: 0, expenses: 0 };

            existing.revenue += order.price || 0;
            existing.orders += 1;

            dataMap.set(date, existing);
        });

        // Process expenses
        filteredExpenses.forEach((expense) => {
            const date = expense.expense_date;
            const existing = dataMap.get(date) || { date, revenue: 0, profit: 0, orders: 0, expenses: 0 };

            existing.expenses += expense.amount;

            dataMap.set(date, existing);
        });

        // Calculate profit for each day
        dataMap.forEach((data) => {
            data.profit = data.revenue - data.expenses;
        });

        return Array.from(dataMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    }, [filteredOrders, filteredExpenses]);

    // Get hourly distribution for peak analysis
    const hourlyData = useMemo((): HourlyData[] => {
        const hourlyMap = new Map<number, HourlyData>();

        // Initialize all hours
        for (let i = 0; i < 24; i++) {
            hourlyMap.set(i, { hour: i, orders: 0, revenue: 0 });
        }

        filteredOrders.forEach((order) => {
            if (!isSaleOrder(order)) return;

            const hour = new Date(order.created_at).getHours();
            const existing = hourlyMap.get(hour)!;

            existing.orders += 1;
            existing.revenue += order.price || 0;
        });

        return Array.from(hourlyMap.values());
    }, [filteredOrders]);

    // Get expense breakdown by category
    const expensesByCategory = useMemo(() => {
        const byCategory: Record<ExpenseCategory, number> = {
            product_cost: 0,
            packaging: 0,
            sample_vial: 0,
            sample_perfume: 0,
            thank_you_cards: 0,
            sweets: 0,
            marketing: 0,
            shipping: 0,
            other: 0,
        };

        filteredExpenses.forEach((expense) => {
            byCategory[expense.category] += expense.amount;
        });

        return byCategory;
    }, [filteredExpenses]);

    // Calculate Rejection Stats
    const rejectionStats = useMemo((): RejectionStats => {
        let totalRejected = 0;
        const reasonsMap = new Map<string, number>();

        filteredOrders.forEach((order) => {
            if (order.status === "rejected") {
                totalRejected++;
                const reason = order.rejection_reason || "Unknown";
                reasonsMap.set(reason, (reasonsMap.get(reason) || 0) + 1);
            }
        });

        // Calculate total relevant orders (excluding cancelled? or all?)
        // Usually rejection rate is Rejected / (Delivered + Rejected) or Total Shipped
        // Let's use (Delivered + Rejected) as "Attempted Deliveries"
        const attemptedDeliveries = filteredOrders.filter(o => isRealizedRevenue(o) || o.status === "rejected").length;
        const rejectionRate = attemptedDeliveries > 0 ? (totalRejected / attemptedDeliveries) * 100 : 0;

        const byReason = Array.from(reasonsMap.entries()).map(([reason, count]) => ({
            reason,
            count,
            percentage: totalRejected > 0 ? (count / totalRejected) * 100 : 0
        })).sort((a, b) => b.count - a.count);

        return {
            totalRejected,
            rejectionRate,
            byReason
        };
    }, [filteredOrders]);

    // Compare with previous period
    const comparePeriods = useCallback((currentRange: DateRange): PeriodComparison | null => {
        // Validate date range
        if (!currentRange.startDate || !currentRange.endDate) {
            return null;
        }

        const currentStart = new Date(currentRange.startDate);
        const currentEnd = new Date(currentRange.endDate);

        // Check for invalid dates
        if (isNaN(currentStart.getTime()) || isNaN(currentEnd.getTime())) {
            return null;
        }

        const periodLength = currentEnd.getTime() - currentStart.getTime();

        // Prevent issues with negative or zero period length
        if (periodLength < 0) {
            return null;
        }

        const previousEnd = new Date(currentStart.getTime() - 1);
        const previousStart = new Date(previousEnd.getTime() - periodLength);

        const previousRange = {
            startDate: baghdadDayKey(previousStart),
            endDate: baghdadDayKey(previousEnd),
        };

        // Calculate previous period stats
        const previousOrders = orders.filter((order) => {
            const orderDate = baghdadDayKey(new Date(order.created_at));
            return orderDate >= previousRange.startDate && orderDate <= previousRange.endDate;
        });

        let prevTotal = 0;
        let prevDelivered = 0;
        let prevDeliveredCount = 0;
        let prevPending = 0;
        let prevCancelled = 0;

        previousOrders.forEach((order) => {
            const value = order.price || 0;
            if (!isSaleOrder(order)) {
                if (order.status === "rejected") prevCancelled += value;
                return;
            }
            prevTotal += value;
            if (isRealizedRevenue(order)) {
                prevDelivered += value;
                prevDeliveredCount++;
            } else {
                prevPending += value;
            }
        });

        const prevCount = previousOrders.filter(isSaleOrder).length;

        const previousStats: RevenueStats = {
            totalRevenue: prevTotal,
            deliveredRevenue: prevDelivered,
            pendingRevenue: prevPending,
            cancelledRevenue: prevCancelled,
            orderCount: prevCount,
            deliveredCount: prevDeliveredCount,
            averageOrderValue: prevCount > 0 ? prevTotal / prevCount : 0,
        };

        const revenueChange = revenueStats.totalRevenue - previousStats.totalRevenue;
        const revenueChangePercent = previousStats.totalRevenue > 0
            ? (revenueChange / previousStats.totalRevenue) * 100
            : 0;

        const orderChange = revenueStats.orderCount - previousStats.orderCount;
        const orderChangePercent = previousStats.orderCount > 0
            ? (orderChange / previousStats.orderCount) * 100
            : 0;

        return {
            current: revenueStats,
            previous: previousStats,
            revenueChange,
            revenueChangePercent,
            orderChange,
            orderChangePercent,
        };
    }, [orders, revenueStats]);

    // Get sales by status
    const salesByStatus = useMemo(() => {
        const byStatus = {
            new: { count: 0, revenue: 0 },
            contacted: { count: 0, revenue: 0 },
            confirmed: { count: 0, revenue: 0 },
            cancelled: { count: 0, revenue: 0 },
            in_transit: { count: 0, revenue: 0 },
            delivered: { count: 0, revenue: 0 },
            rejected: { count: 0, revenue: 0 },
            completed: { count: 0, revenue: 0 },
            no_response: { count: 0, revenue: 0 },
            return_pending: { count: 0, revenue: 0 },
            refund_delivered: { count: 0, revenue: 0 },
            refund_failed: { count: 0, revenue: 0 },
            pending_checkout: { count: 0, revenue: 0 },
            suspended: { count: 0, revenue: 0 },
        };

        filteredOrders.forEach((order) => {
            byStatus[order.status].count++;
            byStatus[order.status].revenue += order.price || 0;
        });

        return byStatus;
    }, [filteredOrders]);

    return {
        // Stats
        revenueStats,
        profitStats,
        salesByStatus,
        expensesByCategory,
        rejectionStats,

        // Chart data
        dailyData,
        hourlyData,

        // Comparison
        comparePeriods,

        // Raw filtered data
        filteredOrders,
        filteredExpenses,
    };
}
