// apps/platform/hooks/chat/use-typing-indicator.ts
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { typingTopic } from "@/lib/chat/topics";
import { diag } from "@/lib/diag";

type TypingPayload = { user_id: string; display_name: string };

const TYPING_TTL_MS = 4000;     // hide a typer this long after their last keystroke
const SEND_THROTTLE_MS = 2500;  // at most one "typing" broadcast per this window

export function useTypingIndicator(conversationId: string | null) {
    const { user, profile } = useAuth();
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const [typers, setTypers] = useState<TypingPayload[]>([]);
    const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    const lastSentRef = useRef(0);

    useEffect(() => {
        if (!conversationId) return;
        // Dedicated typing channel (NOT the messages topic) so the two hooks don't
        // share one realtime-js channel instance and tear down each other.
        const channel = supabase.channel(typingTopic(conversationId), { config: { private: true } });
        const localTimers = timers.current;
        channel
            .on("broadcast", { event: "typing" }, ({ payload }) => {
                const p = payload as TypingPayload;
                if (!p.user_id || p.user_id === user?.id) return;
                setTypers((prev) => (prev.some((t) => t.user_id === p.user_id) ? prev : [...prev, p]));
                const existing = localTimers.get(p.user_id);
                if (existing) clearTimeout(existing);
                localTimers.set(p.user_id, setTimeout(() => {
                    setTypers((prev) => prev.filter((t) => t.user_id !== p.user_id));
                    localTimers.delete(p.user_id);
                }, TYPING_TTL_MS));
            })
            .subscribe((status, err) => {
                if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                    diag.warn(`[chat] typing channel ${status}${err ? ` ${err.message}` : ""} conv=${conversationId}`);
                }
            });
        channelRef.current = channel;
        return () => {
            for (const t of localTimers.values()) clearTimeout(t);
            localTimers.clear();
            setTypers([]);
            supabase.removeChannel(channel);
            channelRef.current = null;
        };
    }, [conversationId, user?.id]);

    const notifyTyping = useCallback(() => {
        if (!user?.id || !channelRef.current) return;
        const now = Date.now();
        if (now - lastSentRef.current < SEND_THROTTLE_MS) return; // throttle keystroke storm
        lastSentRef.current = now;
        channelRef.current.send({
            type: "broadcast", event: "typing",
            payload: { user_id: user.id, display_name: profile?.display_name || "Someone" },
        });
    }, [user?.id, profile?.display_name]);

    return { typers, notifyTyping };
}
