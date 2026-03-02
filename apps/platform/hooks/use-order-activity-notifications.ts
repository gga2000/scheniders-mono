import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

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
 * Hook to track real-time order changes and show notifications
 * for activities performed by other team members
 */
export function useOrderActivityNotifications() {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState<OrderActivityNotification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [recentlyChangedOrders, setRecentlyChangedOrders] = useState<Set<string>>(new Set());

    // Subscribe to real-time order changes
    useEffect(() => {
        if (!user) return;

        const channel = supabase
            .channel('order-changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'orders',
                },
                async (payload: RealtimePostgresChangesPayload<any>) => {
                    // Skip if this is the current user's change (we don't want to notify ourselves)
                    // Note: You'll need to add a `last_modified_by` column to track this
                    // For now, we'll show all changes and you can add user tracking later

                    const eventType = payload.eventType;
                    const newRecord = payload.new as any;
                    const oldRecord = payload.old as any;

                    if (!newRecord || !newRecord.id) return;

                    // Fetch user info who made the change (if you have last_modified_by field)
                    // For now, we'll use a placeholder
                    const changedByUser = {
                        id: 'unknown',
                        name: 'Team Member',
                        avatar: undefined,
                    };

                    let notification: OrderActivityNotification | null = null;

                    if (eventType === 'UPDATE') {
                        // Check if status changed
                        if (oldRecord.status !== newRecord.status) {
                            notification = {
                                id: `${newRecord.id}-${Date.now()}`,
                                type: 'status_change',
                                orderId: newRecord.id,
                                orderDisplayId: `#${newRecord.order_id}`,
                                userId: changedByUser.id,
                                userName: changedByUser.name,
                                userAvatar: changedByUser.avatar,
                                message: `Order ${newRecord.order_id} status changed: ${oldRecord.status} → ${newRecord.status}`,
                                timestamp: new Date(),
                                isRead: false,
                                metadata: {
                                    oldStatus: oldRecord.status,
                                    newStatus: newRecord.status,
                                },
                            };
                        } else {
                            // Other update
                            notification = {
                                id: `${newRecord.id}-${Date.now()}`,
                                type: 'order_updated',
                                orderId: newRecord.id,
                                orderDisplayId: `#${newRecord.order_id}`,
                                userId: changedByUser.id,
                                userName: changedByUser.name,
                                userAvatar: changedByUser.avatar,
                                message: `Order ${newRecord.order_id} was updated`,
                                timestamp: new Date(),
                                isRead: false,
                            };
                        }

                        // Mark this order as recently changed (for animation)
                        setRecentlyChangedOrders(prev => new Set(prev).add(newRecord.id));

                        // Remove from recently changed after 5 seconds
                        setTimeout(() => {
                            setRecentlyChangedOrders(prev => {
                                const newSet = new Set(prev);
                                newSet.delete(newRecord.id);
                                return newSet;
                            });
                        }, 5000);
                    } else if (eventType === 'INSERT') {
                        notification = {
                            id: `${newRecord.id}-${Date.now()}`,
                            type: 'order_created',
                            orderId: newRecord.id,
                            orderDisplayId: `#${newRecord.order_id}`,
                            userId: changedByUser.id,
                            userName: changedByUser.name,
                            userAvatar: changedByUser.avatar,
                            message: `New order ${newRecord.order_id} created`,
                            timestamp: new Date(),
                            isRead: false,
                        };
                    }

                    if (notification) {
                        setNotifications(prev => [notification!, ...prev].slice(0, 50)); // Keep last 50
                        setUnreadCount(prev => prev + 1);
                    }
                }
            )
            .subscribe((status) => {
            });

        return () => {
            channel.unsubscribe();
        };
    }, [user]);

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
