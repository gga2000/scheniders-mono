import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';

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

    useEffect(() => {
        if (!user || !profile) {
            console.log('[GlobalPresence] No user or profile:', { user: !!user, profile: !!profile });
            return;
        }

        console.log('[GlobalPresence] Setting up channel for user:', user.id);

        // Global channel for all employees
        const channel = supabase.channel('presence:global', {
            config: {
                presence: {
                    key: user.id,
                },
            },
        });

        channel
            .on('presence', { event: 'sync' }, () => {
                const newState = channel.presenceState();
                console.log('[GlobalPresence] Presence sync:', newState);

                // Flatten the presence state
                const users = Object.values(newState).flat() as unknown as GlobalPresenceUser[];

                // Deduplicate and sort by most recent
                const uniqueUsers = Array.from(new Map(users.map(u => [u.id, u])).values());

                // Sort by online_at (most recent first)
                uniqueUsers.sort((a, b) =>
                    new Date(b.online_at).getTime() - new Date(a.online_at).getTime()
                );

                console.log('[GlobalPresence] Online users:', uniqueUsers);
                setOnlineUsers(uniqueUsers);
            })
            .subscribe(async (status) => {
                console.log('[GlobalPresence] Channel status:', status);

                if (status === 'SUBSCRIBED') {
                    setIsConnected(true);

                    const presenceData = {
                        id: user.id,
                        display_name: profile.display_name || user.email?.split('@')[0] || 'User',
                        avatar_url: profile.avatar_url,
                        role: profile.role,
                        online_at: new Date().toISOString(),
                        current_page: typeof window !== 'undefined' ? window.location.pathname : undefined,
                    };

                    console.log('[GlobalPresence] Tracking presence:', presenceData);

                    // Track current user's presence
                    await channel.track(presenceData);
                }
            });

        // Update current page when pathname changes
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && isConnected) {
                channel.track({
                    id: user.id,
                    display_name: profile.display_name || user.email?.split('@')[0] || 'User',
                    avatar_url: profile.avatar_url,
                    role: profile.role,
                    online_at: new Date().toISOString(),
                    current_page: typeof window !== 'undefined' ? window.location.pathname : undefined,
                });
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            channel.unsubscribe();
            setIsConnected(false);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [user, profile]);

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
