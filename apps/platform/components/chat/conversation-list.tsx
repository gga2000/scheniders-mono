// apps/platform/components/chat/conversation-list.tsx
"use client";
import { AtSign, Hash, MessagesSquare, Package } from "lucide-react";
import { useConversations } from "@/hooks/chat/use-conversations";
import type { ConversationWithMeta } from "@/hooks/chat/use-conversations";
import { useChatStore } from "@/store/use-chat-store";
import { useLanguage } from "@/components/providers/language-provider";

type SectionIcon = typeof Hash;

function Section({
    title,
    icon: Icon,
    items,
    activeConversationId,
    onSelect,
    directLabel,
}: {
    title: string;
    icon: SectionIcon;
    items: ConversationWithMeta[];
    activeConversationId: string | null;
    onSelect: (id: string) => void;
    directLabel: string;
}) {
    if (items.length === 0) return null;
    return (
        <div className="px-2 pb-2 pt-1">
            <div className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Icon className="h-3 w-3" />
                {title}
            </div>
            <div className="space-y-0.5">
                {items.map((c) => {
                    const isActive = activeConversationId === c.id;
                    return (
                        <button
                            key={c.id}
                            onClick={() => onSelect(c.id)}
                            className={`group relative flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors active:scale-[0.99] ${
                                isActive
                                    ? "bg-[var(--card-bg)] font-semibold text-foreground shadow-sm ring-1 ring-[var(--card-border)]"
                                    : "text-foreground/80 hover:bg-black/5"
                            }`}
                        >
                            {isActive && (
                                <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-[var(--ink)]" />
                            )}
                            <span className="min-w-0 flex-1 truncate">
                                {c.kind === "channel" ? (
                                    <span className="text-muted-foreground">#</span>
                                ) : null}
                                {c.kind === "channel" ? " " : ""}
                                {c.kind === "channel" ? c.name : c.name ?? directLabel}
                            </span>
                            {c.unread > 0 && (
                                <span className="ml-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white shadow-sm">
                                    {c.unread > 99 ? "99+" : c.unread}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export function ConversationList() {
    const { data: conversations = [], isLoading } = useConversations();
    const { activeConversationId, setActiveConversation } = useChatStore();
    const { t } = useLanguage();
    const groups = {
        channel: conversations.filter((c) => c.kind === "channel"),
        dm: conversations.filter((c) => c.kind === "dm" || c.kind === "group"),
        order: conversations.filter((c) => c.kind === "order"),
    };
    const directLabel = t("chat.directMessage", "Direct message");
    const isEmpty = !isLoading && conversations.length === 0;

    return (
        <div className="w-[40%] max-w-[260px] overflow-y-auto overscroll-contain border-r border-[var(--card-border)] bg-[var(--background-soft,var(--background))]">
            {isLoading ? (
                <div className="space-y-1 p-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div
                            key={i}
                            className="h-8 animate-pulse rounded-lg bg-black/5"
                            style={{ animationDelay: `${i * 60}ms` }}
                        />
                    ))}
                </div>
            ) : isEmpty ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--card-bg)] text-muted-foreground ring-1 ring-[var(--card-border)]">
                        <MessagesSquare className="h-5 w-5" />
                    </span>
                    <p className="text-xs font-semibold text-foreground">
                        {t("chat.emptyConversations", "No conversations yet")}
                    </p>
                    <p className="text-[11px] leading-snug text-muted-foreground">
                        {t("chat.emptyConversationsDesc", "Start a direct message from the team presence menu.")}
                    </p>
                </div>
            ) : (
                <div className="py-1">
                    <Section
                        title={t("chat.section.channels", "Channels")}
                        icon={Hash}
                        items={groups.channel}
                        activeConversationId={activeConversationId}
                        onSelect={setActiveConversation}
                        directLabel={directLabel}
                    />
                    <Section
                        title={t("chat.section.direct", "Direct")}
                        icon={AtSign}
                        items={groups.dm}
                        activeConversationId={activeConversationId}
                        onSelect={setActiveConversation}
                        directLabel={directLabel}
                    />
                    <Section
                        title={t("chat.section.orders", "Order threads")}
                        icon={Package}
                        items={groups.order}
                        activeConversationId={activeConversationId}
                        onSelect={setActiveConversation}
                        directLabel={directLabel}
                    />
                </div>
            )}
        </div>
    );
}
