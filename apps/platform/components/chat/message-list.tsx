// apps/platform/components/chat/message-list.tsx
"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isToday, isYesterday } from "date-fns";
import { ArrowDown, MessageSquareDashed } from "lucide-react";
import { MessageItem } from "./message-item";
import { useTenantMembers } from "@/hooks/chat/use-tenant-members";
import { useLanguage } from "@/components/providers/language-provider";
import type { ChatMessage } from "@/types/chat";

/** Calm, human-readable day separator label for grouping the timeline. */
function dayLabel(iso: string, locale: string): string {
    const d = new Date(iso);
    if (isToday(d)) return locale === "ar" ? "اليوم" : "Today";
    if (isYesterday(d)) return locale === "ar" ? "أمس" : "Yesterday";
    return d.toLocaleDateString(locale === "ar" ? "ar" : "en", {
        weekday: "short",
        month: "short",
        day: "numeric",
    });
}

export function MessageList({ messages }: { messages: ChatMessage[] }) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const nearBottomRef = useRef(true);
    const [showJump, setShowJump] = useState(false);
    const { t, language } = useLanguage();

    const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
        const el = scrollRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior });
        setShowJump(false);
    }, []);

    const onScroll = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
        nearBottomRef.current = distance < 120;
        if (nearBottomRef.current) setShowJump(false);
    }, []);

    // Authoritative sender identity: tenant_members covers offline users too,
    // so names/avatars resolve regardless of online status. The live tenant
    // presence channel is owned by LivePresenceStack in the top bar — opening a
    // second channel on the same topic/key here caused presence-leave flicker.
    const { data: members } = useTenantMembers();

    const memberMap = useMemo(() => {
        const map = new Map<string, { display_name: string; avatar_url: string | null }>();
        for (const m of members ?? []) map.set(m.user_id, { display_name: m.display_name, avatar_url: m.avatar_url });
        return map;
    }, [members]);

    // Auto-scroll only when the user is already near the bottom; otherwise surface a
    // "new messages" pill instead of yanking them away from history they're reading.
    const lastId = messages[messages.length - 1]?.id;
    useEffect(() => {
        if (messages.length === 0) return;
        if (nearBottomRef.current) scrollToBottom("auto");
        else setShowJump(true);
    }, [lastId, messages.length, scrollToBottom]);

    if (messages.length === 0) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--card-bg)] text-muted-foreground shadow-sm ring-1 ring-[var(--card-border)]">
                    <MessageSquareDashed className="h-6 w-6" />
                </span>
                <div>
                    <p className="text-sm font-semibold text-foreground">
                        {t("chat.emptyMessages", "No messages yet")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {t("chat.emptyMessagesDesc", "Say hi 👋 — be the first to post here.")}
                    </p>
                </div>
            </div>
        );
    }

    // First cut uses native scroll. Virtualization (@tanstack/react-virtual)
    // is a future optimization once per-conversation message volume warrants it.
    return (
        <div className="relative flex min-h-0 flex-1 flex-col">
        {showJump && (
            <button
                type="button"
                onClick={() => scrollToBottom("smooth")}
                className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[var(--ink)] px-3 py-1.5 text-xs font-semibold text-[var(--background)] shadow-lg transition-transform hover:scale-105 active:scale-95"
            >
                <ArrowDown className="h-3.5 w-3.5" />
                {t("chat.jumpToLatest", "New messages")}
            </button>
        )}
        <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto overscroll-contain py-2">
            {messages.map((m, i) => {
                const u = memberMap.get(m.sender_id);
                const thisDay = new Date(m.created_at).toDateString();
                const prev = i > 0 ? messages[i - 1] : null;
                const showSeparator = !prev || new Date(prev.created_at).toDateString() !== thisDay;
                return (
                    <div key={m.id}>
                        {showSeparator && (
                            <div className="sticky top-0 z-[1] flex items-center gap-3 px-4 py-2">
                                <span className="h-px flex-1 bg-[var(--card-border)]" />
                                <span className="rounded-full bg-[var(--card-bg)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground shadow-sm ring-1 ring-[var(--card-border)]">
                                    {dayLabel(m.created_at, language)}
                                </span>
                                <span className="h-px flex-1 bg-[var(--card-border)]" />
                            </div>
                        )}
                        <MessageItem
                            message={m}
                            senderName={u?.display_name ?? "Teammate"}
                            senderAvatar={u?.avatar_url}
                        />
                    </div>
                );
            })}
        </div>
        </div>
    );
}
