"use client";
import { useUnreadInbox } from "@/hooks/chat/use-unread-inbox";
import { useLastSeenHeartbeat } from "@/hooks/chat/use-user-status";
import { ChatSheet } from "@/components/chat/chat-sheet";

/**
 * Mounts the chat drawer once and runs the side-effect hooks that keep the
 * unread inbox in sync and the current user's last-seen heartbeat fresh.
 * Render exactly once inside the authenticated provider tree.
 */
export function ChatRuntime() {
    useUnreadInbox();
    useLastSeenHeartbeat();
    return <ChatSheet />;
}
