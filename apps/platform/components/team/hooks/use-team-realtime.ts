"use client";

import { useEffect, useRef, useCallback, useState, useId } from "react";
import { supabase } from "@/lib/supabase";
import { RealtimeChannel } from "@supabase/supabase-js";

// Types
export interface RealtimeActivity {
    id: string;
    user_id: string | null;
    user_email: string | null;
    action: string;
    entity_type: string | null;
    entity_id: string | null;
    details: Record<string, unknown>;
    created_at: string;
}

interface UseTeamRealtimeOptions {
    onNewActivity?: (activity: RealtimeActivity) => void;
    onUserActivity?: (userId: string) => void;
    enabled?: boolean;
}

interface UseTeamRealtimeReturn {
    isConnected: boolean;
    connectionError: string | null;
    lastActivity: RealtimeActivity | null;
    activeUserIds: Set<string>;
}

/**
 * Hook for real-time activity updates using Supabase Realtime
 * Subscribes to INSERT events on the activity_logs table
 */
export function useTeamRealtime(options: UseTeamRealtimeOptions = {}): UseTeamRealtimeReturn {
    const { onNewActivity, onUserActivity, enabled = true } = options;

    const [isConnected, setIsConnected] = useState(false);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const [lastActivity, setLastActivity] = useState<RealtimeActivity | null>(null);
    const [activeUserIds, setActiveUserIds] = useState<Set<string>>(new Set());

    const channelRef = useRef<RealtimeChannel | null>(null);
    const activeTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

    // Mark user as active for 15 seconds after their activity
    const markUserActive = useCallback((userId: string) => {
        // Clear existing timeout for this user
        const existingTimeout = activeTimeoutsRef.current.get(userId);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
        }

        // Add to active set
        setActiveUserIds(prev => new Set([...prev, userId]));

        // Set timeout to remove from active set after 15 seconds
        const timeout = setTimeout(() => {
            setActiveUserIds(prev => {
                const next = new Set(prev);
                next.delete(userId);
                return next;
            });
            activeTimeoutsRef.current.delete(userId);
        }, 15000);

        activeTimeoutsRef.current.set(userId, timeout);
    }, []);

    // Per-instance channel name so a remount/double-mount doesn't hand back an
    // already-subscribed channel (which makes `.on()` throw "after subscribe()").
    const instanceId = useId();

    useEffect(() => {
        if (!enabled) {
            return;
        }

        // Create subscription channel
        const channel = supabase
            .channel(`team-activity-realtime:${instanceId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "activity_logs",
                },
                (payload) => {
                    const activity = payload.new as RealtimeActivity;

                    // Update last activity
                    setLastActivity(activity);

                    // Mark user as active
                    if (activity.user_id) {
                        markUserActive(activity.user_id);
                        onUserActivity?.(activity.user_id);
                    }

                    // Call callback
                    onNewActivity?.(activity);
                }
            )
            .subscribe((status) => {
                if (status === "SUBSCRIBED") {
                    setIsConnected(true);
                    setConnectionError(null);
                } else if (status === "CHANNEL_ERROR") {
                    setIsConnected(false);
                    setConnectionError("Failed to connect to real-time updates");
                } else if (status === "TIMED_OUT") {
                    setIsConnected(false);
                    setConnectionError("Connection timed out");
                }
            });

        channelRef.current = channel;

        // Cleanup
        return () => {
            // Clear all timeouts
            activeTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
            activeTimeoutsRef.current.clear();

            // Unsubscribe from channel
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [enabled, onNewActivity, onUserActivity, markUserActive, instanceId]);

    return {
        isConnected,
        connectionError,
        lastActivity,
        activeUserIds,
    };
}

/**
 * Hook to get pulse animation trigger when a specific user has activity
 */
export function useActivityPulse(userId: string, activeUserIds: Set<string>): boolean {
    const [isPulsing, setIsPulsing] = useState(false);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (activeUserIds.has(userId)) {
            setIsPulsing(true);

            // Clear existing timeout
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }

            // Stop pulsing after 2 seconds
            timeoutRef.current = setTimeout(() => {
                setIsPulsing(false);
            }, 2000);
        }

        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [userId, activeUserIds]);

    return isPulsing;
}
