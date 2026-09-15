// apps/platform/hooks/chat/use-mention-notifications.ts
//
// Chat mentions, read from the unified `notifications` table.
//
// Chat used to have its own `chat_notifications` table mirrored across to
// `notifications`; now chat_send_message writes the unified table directly, so
// this reads from the same place as the bell. The returned shape is unchanged —
// callers still get `ChatMentionNotification[]`.
//
// Read state lives in `notification_user_state`, keyed per user, rather than a
// column on the row: a tenant-wide read flag meant one person reading cleared
// everyone's badge.

import { useEffect, useId, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { diag } from "@/lib/diag";
import { chatKeys } from "./use-conversations";
import type { ChatMentionNotification } from "@/types/chat";

export function useMentionNotifications() {
    const { user } = useAuth();
    const qc = useQueryClient();
    // Per-instance channel name. This hook mounts in more than one place at once
    // (and React StrictMode double-invokes effects) — a STATIC channel name made
    // realtime-js dedupe to one channel and reject the second `.on()` after
    // `subscribe()`.
    const instanceId = useId();

    const { data: mentions = [] } = useQuery({
        queryKey: chatKeys.mentions(),
        enabled: !!user?.id,
        staleTime: 30_000,
        queryFn: async (): Promise<ChatMentionNotification[]> => {
            // The feed RPC already resolves audience, per-user read state,
            // dismissals and watermarks; asking it for the chat slice keeps this
            // hook and the bell from ever disagreeing.
            const { data, error } = await supabase.rpc("notification_feed", {
                p_limit: 50,
                p_before: null,
                p_filter: "mentions",
            });
            if (error) throw error;

            const rows = (data ?? []) as unknown as Record<string, unknown>[];
            return rows.flatMap((r): ChatMentionNotification[] => {
                if (typeof r.id !== "string" || typeof r.created_at !== "string") return [];
                const payload =
                    r.payload && typeof r.payload === "object"
                        ? (r.payload as Record<string, unknown>)
                        : {};
                return [{
                    id: r.id,
                    actor_name: typeof r.actor_name === "string" ? r.actor_name : "Teammate",
                    actor_avatar: typeof r.actor_avatar === "string" ? r.actor_avatar : null,
                    conversation_id: typeof r.entity_id === "string" ? r.entity_id : null,
                    message_id: typeof payload.message_id === "string" ? payload.message_id : null,
                    preview: typeof payload.preview === "string" ? payload.preview : "",
                    is_read: r.is_read === true,
                    created_at: r.created_at,
                }];
            });
        },
    });

    useEffect(() => {
        if (!user?.id) return;
        const channel = supabase
            .channel(`chat_mentions:${user.id}:${instanceId}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "notifications" },
                () => qc.invalidateQueries({ queryKey: chatKeys.mentions() }),
            )
            .subscribe((status, err) => {
                if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                    diag.warn(`[chat] mention notifications channel ${status}${err ? ` ${err.message}` : ""}`);
                }
            });
        return () => { void supabase.removeChannel(channel); };
    }, [user?.id, qc, instanceId]);

    const unreadCount = useMemo(() => mentions.filter((m) => !m.is_read).length, [mentions]);

    const markAsRead = useCallback(async (id: string) => {
        if (!user?.id) return;
        const { error } = await supabase.from("notification_user_state").upsert(
            { notification_id: id, user_id: user.id, read_at: new Date().toISOString() },
            { onConflict: "notification_id,user_id" },
        );
        if (error) throw error;
        qc.invalidateQueries({ queryKey: chatKeys.mentions() });
    }, [qc, user?.id]);

    /** Server-stamped: a browser clock running fast would otherwise write a
     *  future watermark and swallow genuinely new notifications. */
    const markAllAsRead = useCallback(async () => {
        const { error } = await supabase.rpc("mark_notifications_read");
        if (error) throw error;
        qc.invalidateQueries({ queryKey: chatKeys.mentions() });
    }, [qc]);

    const clearAll = useCallback(async () => {
        const { error } = await supabase.rpc("clear_notification_feed");
        if (error) throw error;
        qc.invalidateQueries({ queryKey: chatKeys.mentions() });
    }, [qc]);

    return { mentions, unreadCount, markAsRead, markAllAsRead, clearAll };
}
