import { useEffect, useState, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { diag } from '@/lib/diag';

export type PresenceUser = {
    id: string;
    display_name: string;
    avatar_url?: string;
    role: string;
    online_at: string;
};

type Listener = (users: PresenceUser[], connected: boolean) => void;

interface Entry {
    channel: RealtimeChannel;
    /** How many mounted hooks are currently using this topic. */
    refs: number;
    users: PresenceUser[];
    connected: boolean;
    listeners: Set<Listener>;
}

/**
 * One shared subscription per presence topic, reference-counted.
 *
 * supabase-js dedupes channels by topic (RealtimeClient.channel() returns the
 * existing instance for a topic it already holds). Two components watching the
 * same resource — the order thread card in chat and the presence group in the
 * order details modal both watch `presence:<orderId>` — therefore received the
 * SAME channel object. Each attached its own listeners to it and, worse,
 * whichever unmounted first tore the subscription down underneath the other, so
 * presence silently died for the component still on screen. Refcounting keeps
 * exactly one subscription alive for as long as at least one consumer wants it.
 */
const registry = new Map<string, Entry>();

function emit(entry: Entry): void {
    for (const listener of entry.listeners) listener(entry.users, entry.connected);
}

function acquire(
    topic: string,
    identity: PresenceUser,
    listener: Listener,
): () => void {
    let entry = registry.get(topic);

    if (!entry) {
        const channel = supabase.channel(`presence:${topic}`, {
            config: { presence: { key: identity.id } },
        });
        const created: Entry = { channel, refs: 0, users: [], connected: false, listeners: new Set() };
        registry.set(topic, created);
        entry = created;

        channel
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState();
                const users = Object.values(state).flat() as unknown as PresenceUser[];
                // Dedupe by id — the presence key already prevents most collisions,
                // but a reconnect can briefly surface two entries for one user.
                created.users = Array.from(new Map(users.map((u) => [u.id, u])).values());
                emit(created);
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    created.connected = true;
                    emit(created);
                    void channel.track(identity);
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    created.connected = false;
                    emit(created);
                    if (status !== 'CLOSED') {
                        diag.warn(`[presence] channel ${status} topic=${topic}`);
                    }
                }
            });
    }

    const active = entry;
    active.refs += 1;
    active.listeners.add(listener);
    // Hand the newcomer whatever the shared channel already knows.
    listener(active.users, active.connected);

    let released = false;
    return () => {
        if (released) return;
        released = true;
        active.listeners.delete(listener);
        active.refs -= 1;
        if (active.refs > 0) return;
        registry.delete(topic);
        // removeChannel (not just unsubscribe) so the client drops it from its
        // registry — otherwise the next mount of this topic gets handed back the
        // dead instance with its stale listeners still attached.
        void supabase.removeChannel(active.channel);
    };
}

export function usePresence(channelId: string) {
    const { user, profile } = useAuth();
    const [activeUsers, setActiveUsers] = useState<PresenceUser[]>([]);
    const [isConnected, setIsConnected] = useState(false);

    // Refs so a new profile object reference doesn't re-subscribe.
    const profileRef = useRef(profile);
    const emailRef = useRef(user?.email);
    useEffect(() => {
        profileRef.current = profile;
        emailRef.current = user?.email;
    }, [profile, user?.email]);

    const userId = user?.id;
    const hasProfile = !!profile;

    useEffect(() => {
        if (!userId || !hasProfile || !channelId) return;

        const identity: PresenceUser = {
            id: userId,
            display_name:
                profileRef.current?.display_name || emailRef.current?.split('@')[0] || 'User',
            avatar_url: profileRef.current?.avatar_url ?? undefined,
            role: profileRef.current?.role ?? 'member',
            online_at: new Date().toISOString(),
        };

        const release = acquire(channelId, identity, (users, connected) => {
            setActiveUsers(users);
            setIsConnected(connected);
        });

        return () => {
            release();
            setIsConnected(false);
        };
    }, [channelId, userId, hasProfile]);

    // Filter out current user from "others" list if needed, or return all
    const otherUsers = activeUsers.filter(u => u.id !== user?.id);

    return {
        activeUsers,
        otherUsers,
        isConnected,
        currentUser: user,
    };
}
