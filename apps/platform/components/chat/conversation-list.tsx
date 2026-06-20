// apps/platform/components/chat/conversation-list.tsx
"use client";
import { useMemo, useState } from "react";
import { AtSign, Hash, MessagesSquare, Package, Users, Pencil } from "lucide-react";
import { Avatar } from "@scheniders/ui";
import { useConversations, useStartDm } from "@/hooks/chat/use-conversations";
import type { ConversationWithMeta } from "@/hooks/chat/use-conversations";
import { useTenantMembers } from "@/hooks/chat/use-tenant-members";
import type { TenantMember } from "@/hooks/chat/use-tenant-members";
import { useChatStore } from "@/store/use-chat-store";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/components/providers/language-provider";

type SectionIcon = typeof Hash;

function Section({
    title,
    icon: Icon,
    items,
    activeConversationId,
    onSelect,
    nameFor,
}: {
    title: string;
    icon: SectionIcon;
    items: ConversationWithMeta[];
    activeConversationId: string | null;
    onSelect: (id: string) => void;
    nameFor: (c: ConversationWithMeta) => string;
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
                                {c.kind === "channel" ? <span className="text-muted-foreground"># </span> : null}
                                {nameFor(c)}
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

/** Directory of every teammate (online or not) you don't yet have a 1:1 DM with. Click → start a DM. */
function TeamDirectory({
    members,
    onStart,
    startingId,
    title,
    hint,
}: {
    members: TenantMember[];
    onStart: (userId: string) => void;
    startingId: string | null;
    title: string;
    hint: string;
}) {
    if (members.length === 0) return null;
    return (
        <div className="px-2 pb-2 pt-1">
            <div className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Users className="h-3 w-3" />
                {title}
            </div>
            <div className="space-y-0.5">
                {members.map((m) => (
                    <button
                        key={m.user_id}
                        onClick={() => onStart(m.user_id)}
                        disabled={startingId === m.user_id}
                        title={hint}
                        className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-foreground/80 transition-colors hover:bg-black/5 disabled:opacity-50"
                    >
                        <Avatar src={m.avatar_url ?? undefined} alt={m.display_name} size="sm" />
                        <span className="min-w-0 flex-1 truncate">{m.display_name}</span>
                        <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                ))}
            </div>
        </div>
    );
}

export function ConversationList() {
    const { user } = useAuth();
    const { data: conversations = [], isLoading } = useConversations();
    const { data: members = [] } = useTenantMembers();
    const startDm = useStartDm();
    const { activeConversationId, setActiveConversation } = useChatStore();
    const { t } = useLanguage();
    const [startingId, setStartingId] = useState<string | null>(null);

    const directLabel = t("chat.directMessage", "Direct message");

    const memberMap = useMemo(
        () => new Map(members.map((m) => [m.user_id, m])),
        [members]
    );

    const groups = useMemo(
        () => ({
            channel: conversations.filter((c) => c.kind === "channel"),
            dm: conversations.filter((c) => c.kind === "dm" || c.kind === "group"),
            order: conversations.filter((c) => c.kind === "order"),
        }),
        [conversations]
    );

    // user ids already reachable via an existing 1:1 DM (so we don't list them twice)
    const dmUserIds = useMemo(() => {
        const ids = new Set<string>();
        for (const c of groups.dm) {
            if (c.kind !== "dm") continue;
            const other = c.members.find((m) => m.user_id !== user?.id);
            if (other) ids.add(other.user_id);
        }
        return ids;
    }, [groups.dm, user?.id]);

    // everyone else in the tenant (excluding me + people I already DM) — start a new DM
    const directoryMembers = useMemo(
        () => members.filter((m) => m.user_id !== user?.id && !dmUserIds.has(m.user_id)),
        [members, user?.id, dmUserIds]
    );

    const nameFor = (c: ConversationWithMeta): string => {
        if (c.kind === "channel") return c.name ?? "";
        if (c.name) return c.name; // group/named
        const other = c.members.find((m) => m.user_id !== user?.id);
        return (other && memberMap.get(other.user_id)?.display_name) || directLabel;
    };

    const startConversation = async (userId: string) => {
        setStartingId(userId);
        try {
            const convId = await startDm.mutateAsync(userId);
            setActiveConversation(convId);
        } finally {
            setStartingId(null);
        }
    };

    return (
        <div className="w-full shrink-0 overflow-y-auto overscroll-contain bg-[var(--background-soft,var(--background))] md:w-[40%] md:max-w-[260px] md:border-r md:border-[var(--card-border)]">
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
            ) : (
                <div className="py-1">
                    <Section
                        title={t("chat.section.channels", "Channels")}
                        icon={Hash}
                        items={groups.channel}
                        activeConversationId={activeConversationId}
                        onSelect={setActiveConversation}
                        nameFor={nameFor}
                    />
                    <Section
                        title={t("chat.section.direct", "Direct")}
                        icon={AtSign}
                        items={groups.dm}
                        activeConversationId={activeConversationId}
                        onSelect={setActiveConversation}
                        nameFor={nameFor}
                    />
                    <Section
                        title={t("chat.section.orders", "Order threads")}
                        icon={Package}
                        items={groups.order}
                        activeConversationId={activeConversationId}
                        onSelect={setActiveConversation}
                        nameFor={nameFor}
                    />
                    <TeamDirectory
                        title={t("chat.section.team", "Team members")}
                        hint={t("chat.startDm", "Start a direct message")}
                        members={directoryMembers}
                        onStart={startConversation}
                        startingId={startingId}
                    />
                    {conversations.length === 0 && directoryMembers.length === 0 && (
                        <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--card-bg)] text-muted-foreground ring-1 ring-[var(--card-border)]">
                                <MessagesSquare className="h-5 w-5" />
                            </span>
                            <p className="text-xs font-semibold text-foreground">
                                {t("chat.emptyConversations", "No conversations yet")}
                            </p>
                            <p className="text-[11px] leading-snug text-muted-foreground">
                                {t("chat.emptyTeam", "You're the only member of this workspace so far.")}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
