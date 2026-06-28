"use client";
import { useEffect } from "react";
import { useUnreadInbox } from "@/hooks/chat/use-unread-inbox";
import { useLastSeenHeartbeat } from "@/hooks/chat/use-user-status";
import { useConversations } from "@/hooks/chat/use-conversations";
import { useFaviconBadge } from "@/hooks/chat/use-favicon-badge";
import { useChatStore } from "@/store/use-chat-store";
import { ChatSheet } from "@/components/chat/chat-sheet";

/**
 * Mounts the chat drawer once and runs the side-effect hooks that keep the
 * unread inbox in sync and the current user's last-seen heartbeat fresh.
 * Render exactly once inside the authenticated provider tree.
 */
export function ChatRuntime() {
    useUnreadInbox();
    useLastSeenHeartbeat();

    // Listen for "open-conversation" messages posted by the service worker
    // when the user clicks a push notification (notificationclick handler).
    // SSR-guarded: navigator is browser-only.
    useEffect(() => {
        if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

        function handleMessage(event: MessageEvent) {
            if (event.data?.type === "open-conversation") {
                const { conversationId } = event.data as { conversationId?: string };
                if (typeof conversationId === "string" && conversationId) {
                    useChatStore.getState().open(conversationId);
                }
            }
        }

        navigator.serviceWorker.addEventListener("message", handleMessage);
        return () => {
            navigator.serviceWorker.removeEventListener("message", handleMessage);
        };
    }, []);

    const { data: conversations } = useConversations();
    // Sum unread only for un-muted conversations so muted threads don't shout
    const totalUnread = (conversations ?? []).reduce(
        (sum, c) => (c.my_muted ? sum : sum + c.unread),
        0
    );
    useFaviconBadge(totalUnread);

    return <ChatSheet />;
}
