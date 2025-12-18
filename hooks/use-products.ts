"use client";

import { useMemo } from "react";
import { useOrders } from "./use-orders";

export interface Product {
    id: string;
    name: string;
    price: number;
    timesSold: number;
    totalRevenue: number;
    lastSoldDate: string;
}

export function useProducts() {
    const { orders, loading, error } = useOrders();

    const products = useMemo(() => {
        const productMap = new Map<string, Product>();

        orders.forEach((order) => {
            if (!order.items || order.items.length === 0) return;

            order.items.forEach((item) => {
                const key = item.name.toLowerCase().trim();

                if (productMap.has(key)) {
                    const existing = productMap.get(key)!;
                    existing.timesSold += item.quantity;
                    existing.totalRevenue += item.price * item.quantity;

                    // Update price to latest
                    existing.price = item.price;

                    // Update last sold date
                    if (new Date(order.created_at) > new Date(existing.lastSoldDate)) {
                        existing.lastSoldDate = order.created_at;
                    }
                } else {
                    productMap.set(key, {
                        id: key,
                        name: item.name,
                        price: item.price,
                        timesSold: item.quantity,
                        totalRevenue: item.price * item.quantity,
                        lastSoldDate: order.created_at,
                    });
                }
            });
        });

        return Array.from(productMap.values()).sort(
            (a, b) => b.timesSold - a.timesSold
        );
    }, [orders]);

    const stats = useMemo(() => {
        const totalProducts = products.length;
        const totalSold = products.reduce((sum, p) => sum + p.timesSold, 0);
        const totalRevenue = products.reduce((sum, p) => sum + p.totalRevenue, 0);
        const bestSeller = products[0] || null;

        return {
            totalProducts,
            totalSold,
            totalRevenue,
            bestSeller,
        };
    }, [products]);

    return {
        products,
        stats,
        loading,
        error,
    };
}
