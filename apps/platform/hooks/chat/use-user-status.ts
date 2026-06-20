import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";

export interface UserStatusRow {
    user_id: string;
    custom_emoji: string | null;
    custom_text: string | null;
    last_seen_at: string | null;
}

export function useTenantUserStatuses() {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: ["chat", "user-status", tenantId],
        enabled: !!tenantId,
        staleTime: 30_000,
        queryFn: async (): Promise<UserStatusRow[]> => {
            const { data, error } = await supabase
                .from("chat_user_status")
                .select("user_id,custom_emoji,custom_text,last_seen_at");
            if (error) throw error;
            return (data ?? []) as UserStatusRow[];
        },
    });
}

export function useSetMyStatus() {
    const { user, tenantId } = useAuth();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (args: { emoji: string | null; text: string | null }) => {
            const { error } = await supabase.from("chat_user_status").upsert({
                user_id: user!.id,
                tenant_id: tenantId,
                custom_emoji: args.emoji,
                custom_text: args.text,
                updated_at: new Date().toISOString(),
            });
            if (error) throw error;
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "user-status"] }),
    });
}

const HEARTBEAT_MS = 60_000;

/**
 * Heartbeat last_seen on an interval + when the tab is hidden / unloaded.
 * Call once high in the tree. Mirrors the interval/cleanup pattern in
 * use-tenant-presence.ts.
 */
export function useLastSeenHeartbeat() {
    const { user, tenantId } = useAuth();
    const userId = user?.id;

    useEffect(() => {
        if (!userId || !tenantId) return;

        const beat = () => {
            const now = new Date().toISOString();
            // Fire-and-forget upsert; a failed heartbeat must not crash the app.
            void supabase
                .from("chat_user_status")
                .upsert({
                    user_id: userId,
                    tenant_id: tenantId,
                    last_seen_at: now,
                    updated_at: now,
                });
        };

        // Beat immediately so last_seen is fresh on mount, then on an interval.
        beat();
        const interval = setInterval(beat, HEARTBEAT_MS);

        const onVisibility = () => {
            if (document.visibilityState === "hidden") beat();
        };
        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("beforeunload", beat);

        return () => {
            clearInterval(interval);
            document.removeEventListener("visibilitychange", onVisibility);
            window.removeEventListener("beforeunload", beat);
        };
    }, [userId, tenantId]);
}
