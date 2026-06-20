// apps/platform/hooks/chat/use-mention-notifications.ts
import { useEffect, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { chatKeys } from "./use-conversations";
import type { ChatMentionNotification } from "@/types/chat";

export function useMentionNotifications() {
    const { user } = useAuth();
    const qc = useQueryClient();
    const { data: mentions = [] } = useQuery({
        queryKey: chatKeys.mentions(),
        enabled: !!user?.id,
        staleTime: 30_000,
        queryFn: async (): Promise<ChatMentionNotification[]> => {
            const { data, error } = await supabase.from("chat_notifications")
                .select("id,actor_name,actor_avatar,conversation_id,message_id,preview,is_read,created_at")
                .order("created_at", { ascending: false }).limit(50);
            if (error) throw error;
            return (data ?? []) as ChatMentionNotification[];
        },
    });

    useEffect(() => {
        if (!user?.id) return;
        const channel = supabase.channel("chat_notifications_db")
            .on("postgres_changes", { event: "*", schema: "public", table: "chat_notifications" },
                () => qc.invalidateQueries({ queryKey: chatKeys.mentions() }))
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [user?.id, qc]);

    const unreadCount = useMemo(() => mentions.filter((m) => !m.is_read).length, [mentions]);
    const markAsRead = useCallback(async (id: string) => {
        await supabase.from("chat_notifications").update({ is_read: true }).eq("id", id);
        qc.invalidateQueries({ queryKey: chatKeys.mentions() });
    }, [qc]);

    return { mentions, unreadCount, markAsRead };
}
