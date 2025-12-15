"use client";

import { useEffect, useState } from "react";
import { supabase, type Order } from "@/lib/supabase";

export function useOrders() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchOrders();

        // Set up real-time subscription
        const subscription = supabase
            .channel("orders_channel")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "orders" },
                (payload) => {
                    console.log("Change received!", payload);
                    fetchOrders(); // Refetch on any change
                }
            )
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    async function fetchOrders() {
        try {
            setLoading(true);
            const { data, error: fetchError } = await supabase
                .from("orders")
                .select("*")
                .order("created_at", { ascending: false });

            if (fetchError) throw fetchError;

            setOrders(data || []);
            setError(null);
        } catch (err) {
            console.error("Error fetching orders:", err);
            setError(err instanceof Error ? err.message : "Failed to fetch orders");
        } finally {
            setLoading(false);
        }
    }

    async function updateOrderStatus(
        orderId: string,
        status: Order["status"],
        rejectionReason?: string
    ) {
        try {
            const updateData: Partial<Order> = { status };
            if (rejectionReason) {
                updateData.rejection_reason = rejectionReason;
            }

            const { error: updateError } = await supabase
                .from("orders")
                .update(updateData)
                .eq("id", orderId);

            if (updateError) throw updateError;

            // Update local state
            setOrders((prev) =>
                prev.map((order) =>
                    order.id === orderId ? { ...order, ...updateData } : order
                )
            );

            return { success: true };
        } catch (err) {
            console.error("Error updating order:", err);
            return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to update order",
            };
        }
    }

    async function updateOrder(orderId: string, updates: Partial<Order>) {
        try {
            const { error: updateError } = await supabase
                .from("orders")
                .update(updates)
                .eq("id", orderId);

            if (updateError) throw updateError;

            // Update local state
            setOrders((prev) =>
                prev.map((order) =>
                    order.id === orderId ? { ...order, ...updates } : order
                )
            );

            return { success: true };
        } catch (err) {
            console.error("Error updating order:", err);
            return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to update order",
            };
        }
    }

    async function createOrder(orderData: Omit<Order, "id" | "created_at" | "updated_at">) {
        try {
            const { data, error: insertError } = await supabase
                .from("orders")
                .insert([orderData])
                .select()
                .single();

            if (insertError) throw insertError;

            // Add to local state
            if (data) {
                setOrders((prev) => [data, ...prev]);
            }

            return { success: true };
        } catch (err) {
            console.error("Error creating order:", err);
            return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to create order",
            };
        }
    }

    return {
        orders,
        loading,
        error,
        refetch: fetchOrders,
        updateOrderStatus,
        updateOrder,
        createOrder,
    };
}
