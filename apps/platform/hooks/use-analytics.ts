"use client";

import { useMemo } from "react";
import type { Order } from "@/lib/supabase";

export interface AnalyticsData {
    // Revenue metrics
    totalRevenue: number;
    confirmedRevenue: number;
    averageOrderValue: number;

    // Time-based data
    dailyRevenue: Array<{ date: string; revenue: number; orders: number }>;
    weeklyRevenue: Array<{ week: string; revenue: number; orders: number }>;

    // Status distribution
    statusDistribution: Array<{ name: string; value: number; color: string }>;

    // Geographic data
    topCities: Array<{ city: string; orders: number; revenue: number }>;

    // Product data
    topProducts: Array<{ name: string; quantity: number; revenue: number }>;
}

export function useAnalytics(orders: Order[]): AnalyticsData {
    return useMemo(() => {
        if (!orders || orders.length === 0) {
            return {
                totalRevenue: 0,
                confirmedRevenue: 0,
                averageOrderValue: 0,
                dailyRevenue: [],
                weeklyRevenue: [],
                statusDistribution: [],
                topCities: [],
                topProducts: [],
            };
        }

        // Calculate total revenue
        const totalRevenue = orders.reduce((sum, order) => sum + Number(order.price), 0);

        // Calculate confirmed revenue (confirmed + delivered)
        const confirmedRevenue = orders
            .filter(o => o.status === "confirmed" || o.status === "delivered")
            .reduce((sum, order) => sum + Number(order.price), 0);

        // Average order value
        const averageOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;

        // Daily revenue (last 30 days)
        const dailyMap = new Map<string, { revenue: number; orders: number }>();
        const today = new Date();

        // Initialize last 30 days
        for (let i = 29; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            dailyMap.set(dateStr, { revenue: 0, orders: 0 });
        }

        // Fill with actual data
        orders.forEach(order => {
            const dateStr = new Date(order.created_at).toISOString().split('T')[0];
            if (dailyMap.has(dateStr)) {
                const current = dailyMap.get(dateStr)!;
                dailyMap.set(dateStr, {
                    revenue: current.revenue + Number(order.price),
                    orders: current.orders + 1,
                });
            }
        });

        const dailyRevenue = Array.from(dailyMap.entries())
            .map(([date, data]) => ({
                date: new Date(date).toLocaleDateString('ar-IQ', { month: 'short', day: 'numeric' }),
                revenue: data.revenue,
                orders: data.orders,
            }));

        // Weekly revenue (last 12 weeks)
        const weeklyMap = new Map<string, { revenue: number; orders: number }>();

        orders.forEach(order => {
            const date = new Date(order.created_at);
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay());
            const weekStr = weekStart.toISOString().split('T')[0];

            const current = weeklyMap.get(weekStr) || { revenue: 0, orders: 0 };
            weeklyMap.set(weekStr, {
                revenue: current.revenue + Number(order.price),
                orders: current.orders + 1,
            });
        });

        const weeklyRevenue = Array.from(weeklyMap.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .slice(-12)
            .map(([week, data]) => ({
                week: new Date(week).toLocaleDateString('ar-IQ', { month: 'short', day: 'numeric' }),
                revenue: data.revenue,
                orders: data.orders,
            }));

        // Status distribution
        const statusCounts = orders.reduce((acc, order) => {
            acc[order.status] = (acc[order.status] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const statusColors = {
            new: "#3b82f6",
            contacted: "#fbbf24",
            confirmed: "#10b981",
            rejected: "#f43f5e",
            delivered: "#10b981",
        };

        const statusLabels = {
            new: "جديد",
            contacted: "تم الاتصال",
            confirmed: "مؤكد",
            rejected: "مرفوض",
            delivered: "تم التوصيل",
        };

        const statusDistribution = Object.entries(statusCounts).map(([status, count]) => ({
            name: statusLabels[status as keyof typeof statusLabels] || status,
            value: count,
            color: statusColors[status as keyof typeof statusColors] || "#666",
        }));

        // Top cities
        const cityMap = new Map<string, { orders: number; revenue: number }>();

        orders.forEach(order => {
            const city = order.city || "غير محدد";
            const current = cityMap.get(city) || { orders: 0, revenue: 0 };
            cityMap.set(city, {
                orders: current.orders + 1,
                revenue: current.revenue + Number(order.price),
            });
        });

        const topCities = Array.from(cityMap.entries())
            .map(([city, data]) => ({
                city,
                orders: data.orders,
                revenue: data.revenue,
            }))
            .sort((a, b) => b.orders - a.orders)
            .slice(0, 10);

        // Top products
        const productMap = new Map<string, { quantity: number; revenue: number }>();

        orders.forEach(order => {
            if (order.items && Array.isArray(order.items)) {
                order.items.forEach(item => {
                    const current = productMap.get(item.name) || { quantity: 0, revenue: 0 };
                    productMap.set(item.name, {
                        quantity: current.quantity + item.quantity,
                        revenue: current.revenue + (item.price * item.quantity),
                    });
                });
            }
        });

        const topProducts = Array.from(productMap.entries())
            .map(([name, data]) => ({
                name,
                quantity: data.quantity,
                revenue: data.revenue,
            }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);

        return {
            totalRevenue,
            confirmedRevenue,
            averageOrderValue,
            dailyRevenue,
            weeklyRevenue,
            statusDistribution,
            topCities,
            topProducts,
        };
    }, [orders]);
}
