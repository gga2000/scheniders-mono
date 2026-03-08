import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrderStore } from '@/store/use-order-store';

export type OrderActivityType = 'status_change' | 'order_updated' | 'order_created';

export interface OrderActivityNotification {
    id: string;
    type: OrderActivityType;
    order_id: string;
    order_display_id: string; // e.g., "#1234"
    user_name: string;
    user_avatar?: string;
    message: string;
    created_at: string;
    old_status?: string;
    new_status?: string;
    is_read: boolean;
}

/**
 * Hook to fetch and listen for order activity notifications from the database.
 * This provides persistence across sessions and shared visibility for all team members.
 */
export function useOrderActivityNotifications() {
    const queryClient = useQueryClient();
    const { activeDateRange, notificationsEnabled } = useOrderStore();
    const [unreadCount, setUnreadCount] = useState(0);

    // Fetch notifications from the database based on the active date range
    const { data: notifications = [], isLoading } = useQuery({
        queryKey: ['order_notifications', activeDateRange.startDate, activeDateRange.endDate],
        queryFn: async () => {
            let query = supabase
                .from('order_notifications')
                .select('*')
                .order('created_at', { ascending: false });

            // Apply date filters if available
            if (activeDateRange.startDate) {
                query = query.gte('created_at', `${activeDateRange.startDate}T00:00:00Z`);
            }
            if (activeDateRange.endDate) {
                query = query.lte('created_at', `${activeDateRange.endDate}T23:59:59Z`);
            }

            const { data, error } = await query.limit(50);
            if (error) throw error;

            // For now, we track read status locally in the session. 
            // In a future update, we could add a `notification_reads` table for persistent per-user read status.
            return (data || []).map(n => ({ ...n, is_read: false }));
        },
        staleTime: 30000,
    });

    // Real-time updates via Supabase
    useEffect(() => {
        const channel = supabase
            .channel('order_notifications_db')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'order_notifications'
                },
                (payload) => {
                    const newNotification = payload.new as OrderActivityNotification;

                    // Invalidate query to trigger a refetch and update the UI
                    queryClient.invalidateQueries({ queryKey: ['order_notifications'] });

                    if (notificationsEnabled) {
                        setUnreadCount(prev => prev + 1);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [queryClient, notificationsEnabled]);

    const markAsRead = useCallback((_id: string) => {
        setUnreadCount(prev => Math.max(0, prev - 1));
    }, []);

    const markAllAsRead = useCallback(() => {
        setUnreadCount(0);
    }, []);

    const clearAll = useCallback(() => {
        // Optionally implement clearing logic (e.g. archiving notifications)
    }, []);

    const isOrderRecentlyChanged = useCallback(
        (_orderId: string) => false, // Simplified for now
        []
    );

    return {
        notifications,
        unreadCount,
        isLoading,
        markAsRead,
        markAllAsRead,
        clearAll,
        isOrderRecentlyChanged,
    };
}
