"use client";
import { MessageSquare } from "lucide-react";
import { useConversations } from "@/hooks/chat/use-conversations";
import { useChatStore } from "@/store/use-chat-store";

export function ChatTrigger() {
    const { data: conversations = [] } = useConversations();
    const total = conversations.reduce((n, c) => n + c.unread, 0);
    const { open } = useChatStore();
    return (
        <button onClick={() => open()} className="relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/5" title="Team chat">
            <MessageSquare className="h-5 w-5" />
            {total > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-red-500 px-1 text-center text-xs font-bold text-white">{total > 99 ? "99+" : total}</span>}
        </button>
    );
}
