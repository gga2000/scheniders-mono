// apps/platform/hooks/chat/use-unread-inbox.ts
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { userInboxTopic } from "@/lib/chat/topics";
import { chatKeys } from "./use-conversations";
import type { ConversationWithMeta } from "./use-conversations";
import { useNotificationSound } from "./use-notification-sound";
import { useChatStore } from "@/store/use-chat-store";

interface InboxNewPayload {
    sender_id?: string;
    conversation_id?: string;
}

// Subscribes to the per-user inbox topic; on any new message, refresh conversation list
// (which recomputes unread). Returns nothing; mount once high in the tree.
export function useUnreadInbox() {
    const { user } = useAuth();
    const qc = useQueryClient();
    const { playChime } = useNotificationSound();

    useEffect(() => {
        if (!user?.id) return;
        const channel = supabase.channel(userInboxTopic(user.id), { config: { private: true } });
        channel
            .on("broadcast", { event: "inbox:new" }, ({ payload }) => {
                const p = payload as InboxNewPayload;
                if (p.sender_id === user.id) return;
                qc.invalidateQueries({ queryKey: chatKeys.conversations() });

                // Play chime when: sound is on AND conversation isn't muted AND
                // it's not the currently-active+open conversation.
                const store = useChatStore.getState();
                if (!store.soundEnabled) return;

                const convId = p.conversation_id;
                if (!convId) return;

                // Check if the active conversation is open and focused on this conversation
                if (store.isOpen && store.activeConversationId === convId) return;

                // Resolve muted from cache — skip if conversation is muted
                const cached = qc.getQueryData<ConversationWithMeta[]>(chatKeys.conversations());
                const conv = cached?.find((c) => c.id === convId);
                if (conv?.my_muted) return;

                playChime();
            })
            .on("broadcast", { event: "inbox:refresh" }, () => {
                qc.invalidateQueries({ queryKey: chatKeys.conversations() });
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [user?.id, qc, playChime]);
}
