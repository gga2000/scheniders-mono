// apps/platform/hooks/chat/use-typing-indicator.ts
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { conversationTopic } from "@/lib/chat/topics";

type TypingPayload = { user_id: string; display_name: string };

export function useTypingIndicator(conversationId: string | null) {
    const { user, profile } = useAuth();
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const [typers, setTypers] = useState<TypingPayload[]>([]);
    const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    useEffect(() => {
        if (!conversationId) return;
        const channel = supabase.channel(conversationTopic(conversationId), { config: { private: true } });
        channel
            .on("broadcast", { event: "typing" }, ({ payload }) => {
                const p = payload as TypingPayload;
                if (p.user_id === user?.id) return;
                setTypers((prev) => (prev.some((t) => t.user_id === p.user_id) ? prev : [...prev, p]));
                const existing = timers.current.get(p.user_id);
                if (existing) clearTimeout(existing);
                timers.current.set(p.user_id, setTimeout(() => {
                    setTypers((prev) => prev.filter((t) => t.user_id !== p.user_id));
                    timers.current.delete(p.user_id);
                }, 4000));
            })
            .subscribe();
        channelRef.current = channel;
        return () => { supabase.removeChannel(channel); channelRef.current = null; };
    }, [conversationId, user?.id]);

    const notifyTyping = useCallback(() => {
        channelRef.current?.send({
            type: "broadcast", event: "typing",
            payload: { user_id: user?.id, display_name: profile?.display_name || "Someone" },
        });
    }, [user?.id, profile?.display_name]);

    return { typers, notifyTyping };
}
