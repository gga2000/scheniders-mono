// apps/platform/components/chat/message-list.tsx
"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isToday, isYesterday } from "date-fns";
import { ArrowDown, ArrowUp, MessageSquareDashed, Sparkles } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import { MessageItem } from "./message-item";
import { ChatEmptyState } from "./chat-empty-state";
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

export function MessageList({
    messages,
    loading,
    firstUnreadId,
    focusMessageId,
    onFocused,
    onForward,
}: {
    messages: ChatMessage[];
    loading?: boolean;
    firstUnreadId?: string | null;
    focusMessageId?: string | null;
    onFocused?: () => void;
    onForward?: (msg: ChatMessage) => void;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const nearBottomRef = useRef(true);
    const unreadDividerRef = useRef<HTMLDivElement>(null);
    const [showJump, setShowJump] = useState(false);
    const [showUnreadAbove, setShowUnreadAbove] = useState(false);
    const [highlightedId, setHighlightedId] = useState<string | null>(null);
    const { t, language } = useLanguage();
    const reduceMotion = useReducedMotion();

    const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
        const el = scrollRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior });
        setShowJump(false);
    }, []);

    const scrollToUnread = useCallback(() => {
        const divider = unreadDividerRef.current;
        if (divider) {
            divider.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
        }
    }, [reduceMotion]);

    const onScroll = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
        nearBottomRef.current = distance < 120;
        if (nearBottomRef.current) setShowJump(false);
        // Detect whether the unread divider is scrolled above the visible area.
        const divider = unreadDividerRef.current;
        if (divider) {
            const containerTop = el.getBoundingClientRect().top;
            const dividerTop = divider.getBoundingClientRect().top;
            // Divider is above viewport when its top is less than the scroll container top.
            setShowUnreadAbove(dividerTop < containerTop);
        }
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

    // id → message map for resolving reply-to parents without an extra fetch.
    const messageMap = useMemo(() => {
        const map = new Map<string, ChatMessage>();
        for (const m of messages) map.set(m.id, m);
        return map;
    }, [messages]);

    // Auto-scroll only when the user is already near the bottom; otherwise surface a
    // "new messages" pill instead of yanking them away from history they're reading.
    const lastId = messages[messages.length - 1]?.id;
    useEffect(() => {
        if (messages.length === 0) return;
        if (nearBottomRef.current) scrollToBottom("auto");
        else setShowJump(true);
    }, [lastId, messages.length, scrollToBottom]);

    // Scroll-to-focused-message: when the parent sets focusMessageId (e.g. from a
    // search result click), find the message element, scroll it into view, flash a
    // highlight ring, then call onFocused so the store can clear the id.
    useEffect(() => {
        if (!focusMessageId) return;
        const el = scrollRef.current?.querySelector<HTMLElement>(`[data-msg-id="${focusMessageId}"]`);
        if (!el) {
            // Message not in the loaded window — acknowledge and no-op scroll.
            console.log("[chat] focusMessageId not in view:", focusMessageId);
            onFocused?.();
            return;
        }
        el.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
        setHighlightedId(focusMessageId);
        const id = setTimeout(() => {
            setHighlightedId(null);
            onFocused?.();
        }, 1200);
        return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only re-run when focusMessageId changes, not onFocused
    }, [focusMessageId]);

    // Announcement for the polite live region. Memoized so frequent UI re-renders
    // (scroll, jump-pill toggle) don't recompute it; an unchanged string is also a
    // no-op DOM write, so screen readers only re-read when the latest message changes.
    const liveAnnouncement = useMemo(() => {
        const last = messages[messages.length - 1];
        if (!last || last.deleted_at) return "";
        // System rows (null sender_id) skip the announcement
        if (!last.sender_id) return "";
        const who = memberMap.get(last.sender_id)?.display_name ?? "Teammate";
        return `${who}: ${last.body}`;
    }, [messages, memberMap]);

    if (loading && messages.length === 0) {
        return (
            <div className="flex-1 space-y-4 overflow-hidden px-4 py-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex gap-2.5" style={{ opacity: 1 - i * 0.12 }}>
                        <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-foreground/10" />
                        <div className="flex-1 space-y-1.5">
                            <div className="h-3 w-24 animate-pulse rounded bg-foreground/10" />
                            <div className="h-3 animate-pulse rounded bg-foreground/5" style={{ width: `${60 + ((i * 13) % 35)}%` }} />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (messages.length === 0) {
        return (
            <ChatEmptyState
                icon={MessageSquareDashed}
                title={t("chat.emptyMessages", "No messages yet")}
                description={t("chat.emptyMessagesDesc", "Say hi 👋 — be the first to post here.")}
            />
        );
    }

    // First cut uses native scroll. Virtualization (@tanstack/react-virtual)
    // is a future optimization once per-conversation message volume warrants it.
    return (
        <div className="relative flex min-h-0 flex-1 flex-col">
            <div aria-live="polite" className="sr-only">
                {liveAnnouncement}
            </div>
        {/* Jump-to-unread pill: shown at top when the unread divider is scrolled above viewport.
             Not shown simultaneously with the bottom jump-to-latest pill (that one is "below"). */}
        {showUnreadAbove && firstUnreadId && (
            <button
                type="button"
                onClick={scrollToUnread}
                className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-(--pastel-pink) px-3 py-1.5 text-xs font-semibold text-(--ink) shadow-lg transition-transform hover:scale-105 active:scale-95"
            >
                <ArrowUp className="h-3.5 w-3.5" />
                {t("chat.jumpToUnread", "New messages above")}
            </button>
        )}
        {showJump && (
            <button
                type="button"
                onClick={() => scrollToBottom("smooth")}
                className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-(--ink) px-3 py-1.5 text-xs font-semibold text-background shadow-lg transition-transform hover:scale-105 active:scale-95"
            >
                <ArrowDown className="h-3.5 w-3.5" />
                {t("chat.jumpToLatest", "New messages")}
            </button>
        )}
        <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto overscroll-contain py-2">
            {messages.map((m, i) => {
                const u = m.sender_id ? memberMap.get(m.sender_id) : undefined;
                const thisDay = new Date(m.created_at).toDateString();
                const prev = i > 0 ? messages[i - 1] : null;
                const showSeparator = !prev || new Date(prev.created_at).toDateString() !== thisDay;
                const isHighlighted = highlightedId === m.id;
                return (
                    <div
                        key={m.client_msg_id ?? m.id}
                        data-msg-id={m.id}
                        className={isHighlighted ? "rounded-lg ring-2 ring-(--pastel-yellow) ring-offset-1 transition-shadow duration-300" : undefined}
                    >
                        {showSeparator && (() => {
                            const label = dayLabel(m.created_at, language);
                            return (
                                <div className="sticky top-0 z-1 flex items-center gap-3 px-4 py-2">
                                    <span className="h-px flex-1 bg-(--card-border)" />
                                    <button
                                        type="button"
                                        aria-label={t("chat.jumpToDay", "Jump to {day}", { day: label })}
                                        onClick={() => {
                                            // Scroll the message immediately following this separator to the top.
                                            const el = scrollRef.current?.querySelector<HTMLElement>(`[data-msg-id="${m.id}"]`);
                                            el?.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
                                        }}
                                        className="rounded-full bg-(--card-bg) px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground shadow-sm ring-1 ring-(--card-border) transition-colors hover:bg-(--card-border) hover:text-foreground"
                                    >
                                        {label}
                                    </button>
                                    <span className="h-px flex-1 bg-(--card-border)" />
                                </div>
                            );
                        })()}
                        {firstUnreadId === m.id && (
                            <div ref={unreadDividerRef} className="flex items-center gap-2 px-4 py-1.5">
                                <span className="h-px flex-1 bg-(--pastel-pink)" />
                                <span className="inline-flex items-center gap-1 rounded-full bg-(--pastel-pink) px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-(--ink)">
                                    <Sparkles className="h-3 w-3" />
                                    {t("chat.newMessages", "New messages")}
                                </span>
                                <span className="h-px flex-1 bg-(--pastel-pink)" />
                            </div>
                        )}
                        <MessageItem
                            message={m}
                            senderName={u?.display_name ?? "Teammate"}
                            senderAvatar={u?.avatar_url}
                            parentMessage={m.reply_to_id ? messageMap.get(m.reply_to_id) : undefined}
                            onForward={onForward}
                        />
                    </div>
                );
            })}
        </div>
        </div>
    );
}
