import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';

export type PresenceUser = {
    id: string;
    display_name: string;
    avatar_url?: string;
    role: string;
    online_at: string;
};

export function usePresence(channelId: string) {
    const { user, profile } = useAuth();
    const [activeUsers, setActiveUsers] = useState<PresenceUser[]>([]);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        if (!user || !profile || !channelId) return;

        // Create a unique channel for this resource (e.g. "order:123")
        const channel = supabase.channel(`presence:${channelId}`, {
            config: {
                presence: {
                    key: user.id,
                },
            },
        });

        channel
            .on('presence', { event: 'sync' }, () => {
                const newState = channel.presenceState();
                // presenceState returns { [key]: [PresenceUser, ...] }
                // We flatten it to get a simple array of users
                const users = Object.values(newState).flat() as unknown as PresenceUser[];

                // Sort by online_at (most recent first) or by ordering preference
                // Here we deduplicate by ID just in case (though key: user.id prevents this mostly)
                const uniqueUsers = Array.from(new Map(users.map(u => [u.id, u])).values());

                setActiveUsers(uniqueUsers);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    setIsConnected(true);
                    await channel.track({
                        id: user.id,
                        display_name: profile.display_name || user.email?.split('@')[0] || 'User',
                        avatar_url: profile.avatar_url,
                        role: profile.role,
                        online_at: new Date().toISOString(),
                    });
                }
            });

        return () => {
            channel.unsubscribe();
            setIsConnected(false);
        };
    }, [channelId, user, profile]);

    // Filter out current user from "others" list if needed, or return all
    const otherUsers = activeUsers.filter(u => u.id !== user?.id);

    return {
        activeUsers,
        otherUsers,
        isConnected,
        currentUser: user,
    };
}
