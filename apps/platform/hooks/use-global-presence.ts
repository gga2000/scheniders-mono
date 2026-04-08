import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';

// DIAGNOSTIC: Track how many times the effect re-runs (should stay at 1)
let globalPresenceEffectCount = 0;

export type GlobalPresenceUser = {
    id: string;
    display_name: string;
    avatar_url?: string;
    role: string;
    online_at: string;
    current_page?: string;
};

/**
 * Global presence hook - tracks all online employees across the entire app
 * Unlike usePresence which is scoped to a specific resource (e.g., order),
 * this tracks who's online globally in the system
 */
export function useGlobalPresence() {
    const { user, profile } = useAuth();
    const [onlineUsers, setOnlineUsers] = useState<GlobalPresenceUser[]>([]);
    const [isConnected, setIsConnected] = useState(false);

    // Use refs for data that changes without needing to re-subscribe
    const userRef = useRef(user);
    const profileRef = useRef(profile);
    const isConnectedRef = useRef(false);

    // Keep refs up to date (without triggering effect re-run)
    useEffect(() => {
        userRef.current = user;
        profileRef.current = profile;
    }, [user, profile]);

    useEffect(() => {
        isConnectedRef.current = isConnected;
    }, [isConnected]);

    // Only depend on user.id (stable string) — NOT the whole user/profile objects
    const userId = user?.id;

    useEffect(() => {
        if (!userId || !userRef.current || !profileRef.current) {
            return;
        }

        globalPresenceEffectCount++;
        const effectId = globalPresenceEffectCount;
        console.log(`[GlobalPresence] Effect #${effectId} RUNNING — user.id=${userId}`);

        const currentUser = userRef.current;
        const currentProfile = profileRef.current;

        // Build presence data helper (reads from refs for latest values)
        const buildPresenceData = () => ({
            id: userRef.current?.id || currentUser.id,
            display_name: profileRef.current?.display_name || currentProfile.display_name || currentUser.email?.split('@')[0] || 'User',
            avatar_url: profileRef.current?.avatar_url || currentProfile.avatar_url,
            role: profileRef.current?.role || currentProfile.role,
            online_at: new Date().toISOString(),
            current_page: typeof window !== 'undefined' ? window.location.pathname : undefined,
        });

        // Global channel for all employees
        const channel = supabase.channel('presence:global', {
            config: {
                presence: {
                    key: userId,
                },
            },
        });

        channel
            .on('presence', { event: 'sync' }, () => {
                const newState = channel.presenceState();

                // Flatten the presence state
                const users = Object.values(newState).flat() as unknown as GlobalPresenceUser[];

                // Deduplicate and sort by most recent
                const uniqueUsers = Array.from(new Map(users.map(u => [u.id, u])).values());

                // Sort by online_at (most recent first)
                uniqueUsers.sort((a, b) =>
                    new Date(b.online_at).getTime() - new Date(a.online_at).getTime()
                );

                setOnlineUsers(uniqueUsers);
            })
            .subscribe(async (status) => {
                console.log(`[GlobalPresence] Effect #${effectId} status=${status}`);
                if (status === 'SUBSCRIBED') {
                    setIsConnected(true);
                    isConnectedRef.current = true;

                    // Track current user's presence
                    await channel.track(buildPresenceData());
                }
            });

        // Re-track presence when tab becomes visible again
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && isConnectedRef.current) {
                channel.track(buildPresenceData());
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            console.log(`[GlobalPresence] Effect #${effectId} CLEANUP — unsubscribing`);
            channel.unsubscribe();
            setIsConnected(false);
            isConnectedRef.current = false;
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [userId]); // Only re-subscribe when user ID changes (login/logout), NOT on object reference changes

    // Exclude current user
    const otherUsers = onlineUsers.filter(u => u.id !== user?.id);

    return {
        onlineUsers,
        otherUsers,
        isConnected,
        currentUser: user,
        totalOnline: onlineUsers.length,
    };
}
