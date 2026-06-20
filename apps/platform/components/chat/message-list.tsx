// apps/platform/components/chat/message-list.tsx
"use client";
import { useEffect, useMemo, useRef } from "react";
import { MessageItem } from "./message-item";
import { useTenantPresence } from "@/hooks/chat/use-tenant-presence";
import { useTenantMembers } from "@/hooks/chat/use-tenant-members";
import type { ChatMessage } from "@/types/chat";

export function MessageList({ messages }: { messages: ChatMessage[] }) {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Authoritative sender identity: tenant_members covers offline users too.
    const { data: members } = useTenantMembers();
    // Presence is a fallback for members not yet loaded (and stays cheap).
    const { onlineUsers } = useTenantPresence();

    const memberMap = useMemo(() => {
        const map = new Map<string, { display_name: string; avatar_url: string | null }>();
        for (const m of members ?? []) map.set(m.user_id, { display_name: m.display_name, avatar_url: m.avatar_url });
        return map;
    }, [members]);

    const presenceMap = useMemo(() => {
        const map = new Map<string, { display_name: string; avatar_url: string | null }>();
        for (const u of onlineUsers) map.set(u.id, { display_name: u.display_name, avatar_url: u.avatar_url ?? null });
        return map;
    }, [onlineUsers]);

    // Auto-scroll to bottom when a new message arrives.
    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [messages.length]);

    // First cut uses native scroll. Virtualization (@tanstack/react-virtual)
    // is a future optimization once per-conversation message volume warrants it.
    return (
        <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
            {messages.map((m) => {
                const u = memberMap.get(m.sender_id) ?? presenceMap.get(m.sender_id);
                return (
                    <MessageItem
                        key={m.id}
                        message={m}
                        senderName={u?.display_name ?? "Teammate"}
                        senderAvatar={u?.avatar_url}
                    />
                );
            })}
        </div>
    );
}
