"use client";

import { useMemo } from "react";
import type { Order } from "@/lib/supabase";

export function useStats(orders: Order[]) {
    const stats = useMemo(() => {
        const totalOrders = orders.length;

        // Calculate total revenue
        const totalRevenue = orders.reduce((sum, order) => sum + Number(order.price), 0);

        // Count by status
        const statusCounts = orders.reduce((acc, order) => {
            acc[order.status] = (acc[order.status] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        // Today's orders
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayOrders = orders.filter((order) => {
            const orderDate = new Date(order.created_at);
            orderDate.setHours(0, 0, 0, 0);
            return orderDate.getTime() === today.getTime();
        }).length;

        // Revenue from confirmed orders only
        const confirmedRevenue = orders
            .filter((order) => order.status === "confirmed" || order.status === "delivered")
            .reduce((sum, order) => sum + Number(order.price), 0);

        return {
            totalOrders,
            totalRevenue,
            confirmedRevenue,
            todayOrders,
            newOrders: statusCounts.new || 0,
            contactedOrders: statusCounts.contacted || 0,
            confirmedOrders: statusCounts.confirmed || 0,
            rejectedOrders: statusCounts.rejected || 0,
            deliveredOrders: statusCounts.delivered || 0,
        };
    }, [orders]);

    return stats;
}
