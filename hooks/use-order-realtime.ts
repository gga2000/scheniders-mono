"use client";

import { useEffect, useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase, type Order } from "@/lib/supabase";
import { normalizeOrder } from "@/lib/order-normalize-utils";
import { notificationService } from "@/lib/notification-service";

// =============================================
// ORDER REALTIME HOOK
// Manages Supabase realtime subscription for
// live order updates (INSERT/UPDATE/DELETE).
// =============================================

interface UseOrderRealtimeOptions {
    setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
    onReconnect?: () => void; // Callback when realtime reconnects after disconnect
}

export function useOrderRealtime({ setOrders, onReconnect }: UseOrderRealtimeOptions) {
    const queryClient = useQueryClient();
    const [realtimeVersion, setRealtimeVersion] = useState(0);
    const wasConnectedRef = useRef(false);
    const onReconnectRef = useRef(onReconnect);

    // Update ref when callback changes (without triggering effect re-run)
    useEffect(() => {
        onReconnectRef.current = onReconnect;
    }, [onReconnect]);

    useEffect(() => {
        const subscriptionId = Math.random().toString(36).substring(7);

        let pollingInterval: NodeJS.Timeout | null = null;
        let realtimeRefetchTimeout: NodeJS.Timeout | null = null;

        const channel = supabase
            .channel(`orders_changes_${subscriptionId} `) // Unique channel name
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "orders"
                },
                (payload) => {
                    // Handle INSERT - add new order to state
                    if (payload.eventType === "INSERT" && payload.new) {
                        const newOrder = normalizeOrder(payload.new as Order);

                        // Skip archived orders (they shouldn't be in main list)
                        if (newOrder.is_archived) return;

                        // Show notification for new orders
                        notificationService.showNewOrderNotification(
                            newOrder.customer_name,
                            newOrder.order_id,
                            newOrder.priority
                        );

                        // Add to state (idempotent - skip if already present)
                        setOrders(prev => {
                            if (prev.some(o => o.id === newOrder.id)) return prev;
                            return [newOrder, ...prev];
                        });
                    }

                    // Handle UPDATE - efficiently patch the single order
                    if (payload.eventType === "UPDATE" && payload.new) {
                        const updatedOrder = normalizeOrder(payload.new as Order);

                        setOrders(prev => {
                            if (updatedOrder.is_archived) {
                                return prev.filter(o => o.id !== updatedOrder.id);
                            }

                            const exists = prev.some(o => o.id === updatedOrder.id);
                            if (exists) {
                                return prev.map(o => o.id === updatedOrder.id ? updatedOrder : o);
                            } else {
                                return [updatedOrder, ...prev];
                            }
                        });

                        // Notify React Query cache to stay in sync
                        queryClient.setQueryData<Order[]>(["orders", "list"], (old) => {
                            if (!old) return old;
                            if (updatedOrder.is_archived) return old.filter(o => o.id !== updatedOrder.id);
                            const exists = old.some(o => o.id === updatedOrder.id);
                            if (exists) return old.map(o => o.id === updatedOrder.id ? updatedOrder : o);
                            return [updatedOrder, ...old];
                        });

                        // Trigger a smooth UI refresh
                        setRealtimeVersion(v => v + 1);
                    }

                    // Handle DELETE - remove order from state
                    if (payload.eventType === "DELETE" && payload.old) {
                        const deletedId = (payload.old as { id: string }).id;
                        setOrders(prev => prev.filter(o => o.id !== deletedId));
                    }
                }
            )
            .subscribe((status, err) => {
                if (status === "SUBSCRIBED") {
                    // Clear polling if realtime starts working
                    if (pollingInterval) {
                        clearInterval(pollingInterval);
                        pollingInterval = null;
                    }

                    // Detect reconnection after disconnect
                    if (wasConnectedRef.current === false) {
                        console.log("[Realtime] Reconnected - triggering refetch to catch missed events");
                        onReconnectRef.current?.();
                    }
                    wasConnectedRef.current = true;

                } else if (status === "CHANNEL_ERROR" || status === "CLOSED") {
                    console.log(`[Realtime] Error - falling back to polling: `, err);
                    wasConnectedRef.current = false;

                    // Optional polling fallback (currently disabled)
                    // Uncomment if realtime is unreliable
                    // if (!pollingInterval) {
                    //     pollingInterval = setInterval(() => {
                    //         console.log("[Realtime] Polling fallback triggered");
                    //         onReconnectRef.current?.();
                    //     }, 60000); // Poll every 60 seconds
                    // }
                }
            });

        return () => {
            channel.unsubscribe();
            if (pollingInterval) clearInterval(pollingInterval);
            if (realtimeRefetchTimeout) clearTimeout(realtimeRefetchTimeout);
            wasConnectedRef.current = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only run once on mount - onReconnect handled via ref

    return { realtimeVersion };
}
