"use client";
import { useUnreadInbox } from "@/hooks/chat/use-unread-inbox";
import { useLastSeenHeartbeat } from "@/hooks/chat/use-user-status";
import { useConversations } from "@/hooks/chat/use-conversations";
import { useFaviconBadge } from "@/hooks/chat/use-favicon-badge";
import { ChatSheet } from "@/components/chat/chat-sheet";

/**
 * Mounts the chat drawer once and runs the side-effect hooks that keep the
 * unread inbox in sync and the current user's last-seen heartbeat fresh.
 * Render exactly once inside the authenticated provider tree.
 */
export function ChatRuntime() {
    useUnreadInbox();
    useLastSeenHeartbeat();

    const { data: conversations } = useConversations();
    // Sum unread only for un-muted conversations so muted threads don't shout
    const totalUnread = (conversations ?? []).reduce(
        (sum, c) => (c.my_muted ? sum : sum + c.unread),
        0
    );
    useFaviconBadge(totalUnread);

    return <ChatSheet />;
}
