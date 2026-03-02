import { useEffect, useState, useRef } from 'react';
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

    // Use refs for user and profile so the effect doesn't re-subscribe
    // on every object reference change (same pattern as use-global-presence)
    const userRef = useRef(user);
    const profileRef = useRef(profile);

    useEffect(() => {
        userRef.current = user;
        profileRef.current = profile;
    }, [user, profile]);

    // Only depend on stable primitives
    const userId = user?.id;

    useEffect(() => {
        if (!userId || !userRef.current || !profileRef.current || !channelId) return;

        const currentUser = userRef.current;
        const currentProfile = profileRef.current;

        // Create a unique channel for this resource (e.g. "order:123")
        const channel = supabase.channel(`presence:${channelId}`, {
            config: {
                presence: {
                    key: userId,
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
                        id: userId,
                        display_name: profileRef.current?.display_name || currentProfile.display_name || currentUser.email?.split('@')[0] || 'User',
                        avatar_url: profileRef.current?.avatar_url || currentProfile.avatar_url,
                        role: profileRef.current?.role || currentProfile.role,
                        online_at: new Date().toISOString(),
                    });
                }
            });

        return () => {
            channel.unsubscribe();
            setIsConnected(false);
        };
    }, [channelId, userId]); // Only re-subscribe on channelId or userId change, NOT on user/profile object references

    // Filter out current user from "others" list if needed, or return all
    const otherUsers = activeUsers.filter(u => u.id !== user?.id);

    return {
        activeUsers,
        otherUsers,
        isConnected,
        currentUser: user,
    };
}
