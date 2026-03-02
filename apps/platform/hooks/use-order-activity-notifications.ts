import { useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { orderKeys } from '@/hooks/use-orders-query';
import type { Order } from '@/lib/supabase';

export type OrderActivityType = 'status_change' | 'order_updated' | 'order_created';

export interface OrderActivityNotification {
    id: string;
    type: OrderActivityType;
    orderId: string;
    orderDisplayId: string; // e.g., "#1234"
    userId: string;
    userName: string;
    userAvatar?: string;
    message: string;
    timestamp: Date;
    isRead: boolean;
    metadata?: {
        oldStatus?: string;
        newStatus?: string;
        [key: string]: any;
    };
}

/**
 * Hook to track order changes via React Query cache observer and show notifications.
 *
 * Previously this opened a separate Supabase realtime channel on the orders table,
 * duplicating the subscription from useOrderRealtime and doubling bandwidth.
 * Now it observes the React Query cache instead — same notifications, zero extra connections.
 */
export function useOrderActivityNotifications() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [notifications, setNotifications] = useState<OrderActivityNotification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [recentlyChangedOrders, setRecentlyChangedOrders] = useState<Set<string>>(new Set());

    // Keep a snapshot of the previous orders to detect changes
    const prevOrdersRef = useRef<Map<string, Order>>(new Map());
    const isInitializedRef = useRef(false);

    useEffect(() => {
        if (!user) return;

        const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
            if (event.type !== 'updated' || event.action.type !== 'success') return;

            // Only care about the orders list query
            const queryKey = event.query.queryKey;
            const listsKey = orderKeys.lists();
            if (JSON.stringify(queryKey) !== JSON.stringify(listsKey)) return;

            const newOrders = event.query.state.data as Order[] | undefined;
            if (!newOrders) return;

            const prevMap = prevOrdersRef.current;
            const newMap = new Map(newOrders.map(o => [o.id, o]));

            // Skip generating notifications on first load
            if (!isInitializedRef.current) {
                prevOrdersRef.current = newMap;
                isInitializedRef.current = true;
                return;
            }

            const newNotifications: OrderActivityNotification[] = [];

            for (const [id, order] of newMap) {
                const prev = prevMap.get(id);

                if (!prev) {
                    // New order appeared (INSERT or un-archived)
                    newNotifications.push({
                        id: `${id}-${Date.now()}`,
                        type: 'order_created',
                        orderId: id,
                        orderDisplayId: `#${order.order_id}`,
                        userId: 'unknown',
                        userName: 'Team Member',
                        message: `New order ${order.order_id} created`,
                        timestamp: new Date(),
                        isRead: false,
                    });
                } else if (prev.updated_at !== order.updated_at) {
                    // Order was updated — check what changed
                    if (prev.status !== order.status) {
                        newNotifications.push({
                            id: `${id}-${Date.now()}`,
                            type: 'status_change',
                            orderId: id,
                            orderDisplayId: `#${order.order_id}`,
                            userId: 'unknown',
                            userName: 'Team Member',
                            message: `Order ${order.order_id} status changed: ${prev.status} → ${order.status}`,
                            timestamp: new Date(),
                            isRead: false,
                            metadata: {
                                oldStatus: prev.status,
                                newStatus: order.status,
                            },
                        });
                    } else {
                        newNotifications.push({
                            id: `${id}-${Date.now()}`,
                            type: 'order_updated',
                            orderId: id,
                            orderDisplayId: `#${order.order_id}`,
                            userId: 'unknown',
                            userName: 'Team Member',
                            message: `Order ${order.order_id} was updated`,
                            timestamp: new Date(),
                            isRead: false,
                        });
                    }

                    // Mark as recently changed for animation
                    setRecentlyChangedOrders(prev => new Set(prev).add(id));
                    setTimeout(() => {
                        setRecentlyChangedOrders(prev => {
                            const newSet = new Set(prev);
                            newSet.delete(id);
                            return newSet;
                        });
                    }, 5000);
                }
            }

            // Update snapshot
            prevOrdersRef.current = newMap;

            if (newNotifications.length > 0) {
                setNotifications(prev => [...newNotifications, ...prev].slice(0, 50));
                setUnreadCount(prev => prev + newNotifications.length);
            }
        });

        return () => unsubscribe();
    }, [user, queryClient]);

    // Mark notification as read
    const markAsRead = useCallback((notificationId: string) => {
        setNotifications(prev =>
            prev.map(n => (n.id === notificationId ? { ...n, isRead: true } : n))
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
    }, []);

    // Mark all as read
    const markAllAsRead = useCallback(() => {
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        setUnreadCount(0);
    }, []);

    // Clear all notifications
    const clearAll = useCallback(() => {
        setNotifications([]);
        setUnreadCount(0);
    }, []);

    // Check if an order was recently changed (for animation)
    const isOrderRecentlyChanged = useCallback(
        (orderId: string) => recentlyChangedOrders.has(orderId),
        [recentlyChangedOrders]
    );

    return {
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        clearAll,
        isOrderRecentlyChanged,
    };
}
