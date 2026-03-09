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
    const { activeDateRange } = useOrderStore();

    // Fetch notifications from the database based on the active date range
    const { data: notifications = [], isLoading } = useQuery({
        queryKey: ['order_notifications', activeDateRange?.startDate, activeDateRange?.endDate],
        queryFn: async () => {
            let query = supabase
                .from('order_notifications')
                .select('*')
                .order('created_at', { ascending: false });

            // Apply date filters if available
            if (activeDateRange?.startDate) {
                query = query.gte('created_at', `${activeDateRange.startDate}T00:00:00Z`);
            }
            if (activeDateRange?.endDate) {
                query = query.lte('created_at', `${activeDateRange.endDate}T23:59:59Z`);
            }

            const { data, error } = await query.limit(50);

            // Handle table/column missing error gracefully if it happens during fetch
            if (error) {
                console.warn('Error fetching notifications:', error.message);
                if (error.code === '42703' || error.message.includes('is_read')) {
                    // If is_read is missing, try fetching without it if we were filtering (but we aren't filtering yet)
                }
                throw error;
            }

            return (data || []).map(n => ({
                ...n,
                is_read: n.is_read ?? false // Fallback if column missing but data returns
            }));
        },
        staleTime: 30000,
    });

    // Derive unread count from data
    const unreadCount = useMemo(() =>
        notifications.filter(n => !n.is_read).length,
        [notifications]);

    // Real-time updates via Supabase
    useEffect(() => {
        const channel = supabase
            .channel('order_notifications_db')
            .on(
                'postgres_changes',
                {
                    event: '*', // Listen for all events (INSERT, UPDATE)
                    schema: 'public',
                    table: 'order_notifications'
                },
                () => {
                    // Invalidate query to trigger a refetch and update the UI
                    queryClient.invalidateQueries({ queryKey: ['order_notifications'] });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [queryClient]);

    const markAsRead = useCallback(async (id: string) => {
        // Optimistically update the cache
        queryClient.setQueryData(['order_notifications', activeDateRange?.startDate, activeDateRange?.endDate], (old: any) => {
            if (!old) return old;
            return old.map((n: any) => n.id === id ? { ...n, is_read: true } : n);
        });

        const { error } = await supabase
            .from('order_notifications')
            .update({ is_read: true })
            .eq('id', id);

        if (error) {
            console.error('Error marking notification as read:', error);
            // If column is missing, we still want the optimistic UI to "stick" for the session
            // Invalidate will revert it, so we only invalidate if it's NOT a missing column error
            if (error.code !== '42703') {
                queryClient.invalidateQueries({ queryKey: ['order_notifications'] });
            }
        }
    }, [queryClient, activeDateRange]);

    const markAllAsRead = useCallback(async () => {
        // Optimistically update the cache
        queryClient.setQueryData(['order_notifications', activeDateRange?.startDate, activeDateRange?.endDate], (old: any) => {
            if (!old) return old;
            return old.map((n: any) => ({ ...n, is_read: true }));
        });

        const { error } = await supabase
            .from('order_notifications')
            .update({ is_read: true })
            .eq('is_read', false);

        if (error) {
            console.error('Error marking all notifications as read:', error);
            if (error.code !== '42703') {
                queryClient.invalidateQueries({ queryKey: ['order_notifications'] });
            }
        }
    }, [queryClient, activeDateRange]);

    const clearAll = useCallback(async () => {
        const { error } = await supabase
            .from('order_notifications')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete everything

        if (!error) {
            queryClient.invalidateQueries({ queryKey: ['order_notifications'] });
        }
    }, [queryClient]);

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
