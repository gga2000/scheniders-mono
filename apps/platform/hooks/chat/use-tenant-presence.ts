import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { tenantPresenceTopic } from "@/lib/chat/topics";
import { diag } from "@/lib/diag";

export type PresenceStatus = "online" | "idle" | "away";

export type TenantPresenceUser = {
    id: string;
    display_name: string;
    avatar_url?: string;
    role: string;
    online_at: string;
    activity?: string;       // e.g. "Order #7224"
    status: PresenceStatus;
    custom_emoji?: string;
    custom_text?: string;
};

const IDLE_MS = 5 * 60 * 1000;

export function useTenantPresence(activity?: string) {
    const { user, profile, tenantId } = useAuth();
    const [onlineUsers, setOnlineUsers] = useState<TenantPresenceUser[]>([]);
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const activityRef = useRef(activity);
    activityRef.current = activity;
    const lastActiveRef = useRef<number>(Date.now());

    const buildPayload = useCallback((): TenantPresenceUser => {
        const idleFor = Date.now() - lastActiveRef.current;
        const status: PresenceStatus = idleFor > IDLE_MS ? "idle" : "online";
        return {
            id: user!.id,
            display_name: profile?.display_name || user!.email?.split("@")[0] || "User",
            avatar_url: profile?.avatar_url ?? undefined,
            role: profile?.role || "member",
            online_at: new Date().toISOString(),
            activity: activityRef.current,
            status,
        };
    }, [user, profile]);

    // Always hold the latest buildPayload so the subscribe/activity effects can
    // read fresh payloads without listing buildPayload in their deps. A `profile`
    // object-identity change (e.g. on token refresh) would otherwise tear down
    // and rebuild the whole presence channel.
    const buildPayloadRef = useRef(buildPayload);
    buildPayloadRef.current = buildPayload;

    useEffect(() => {
        if (!user?.id || !tenantId) return;
        const channel = supabase.channel(tenantPresenceTopic(tenantId), {
            config: { presence: { key: user.id }, private: true },
        });
        channelRef.current = channel;

        channel
            .on("presence", { event: "sync" }, () => {
                const state = channel.presenceState<TenantPresenceUser>();
                const users = Object.values(state).flat() as TenantPresenceUser[];
                const unique = Array.from(new Map(users.map((u) => [u.id, u])).values());
                unique.sort((a, b) => new Date(b.online_at).getTime() - new Date(a.online_at).getTime());
                setOnlineUsers(unique);
            })
            .subscribe(async (status) => {
                if (status === "SUBSCRIBED") await channel.track(buildPayloadRef.current());
            });

        const markActive = () => { lastActiveRef.current = Date.now(); };
        const onVisible = () => {
            if (document.visibilityState === "visible") { markActive(); channel.track(buildPayloadRef.current()); }
        };
        window.addEventListener("mousemove", markActive, { passive: true });
        window.addEventListener("keydown", markActive);
        document.addEventListener("visibilitychange", onVisible);

        // re-track every 60s so idle status + activity stay fresh
        const interval = setInterval(() => { channel.track(buildPayloadRef.current()); }, 60_000);

        return () => {
            clearInterval(interval);
            window.removeEventListener("mousemove", markActive);
            window.removeEventListener("keydown", markActive);
            document.removeEventListener("visibilitychange", onVisible);
            channel.unsubscribe();
            channelRef.current = null;
        };
    }, [user?.id, tenantId]);

    // push a new activity label without re-subscribing
    useEffect(() => {
        if (channelRef.current) channelRef.current.track(buildPayloadRef.current());
    }, [activity]);

    const otherUsers = onlineUsers.filter((u) => u.id !== user?.id);
    return { onlineUsers, otherUsers, totalOnline: onlineUsers.length };
}
