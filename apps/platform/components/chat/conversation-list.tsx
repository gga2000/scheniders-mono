// apps/platform/components/chat/conversation-list.tsx
"use client";
import { useMemo, useState } from "react";
import { AtSign, ChevronDown, ChevronRight, Hash, MessagesSquare, Package, Plus, Users, Pencil } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@scheniders/ui";
import { ChatAvatar } from "./chat-avatar";
import { ChatEmptyState } from "./chat-empty-state";
import { ConversationJump } from "./conversation-jump";
import { ConversationMenu } from "./conversation-menu";
import { ConversationSettingsDialog } from "./conversation-settings-dialog";
import { CreateChannelDialog } from "./create-channel-dialog";
import { CreateGroupDialog } from "./create-group-dialog";
import { usePresenceStore } from "@/store/use-presence-store";
import { useConversations, useArchivedConversations, useStartDm } from "@/hooks/chat/use-conversations";
import type { ConversationWithMeta } from "@/hooks/chat/use-conversations";
import { useTenantMembers } from "@/hooks/chat/use-tenant-members";
import type { TenantMember } from "@/hooks/chat/use-tenant-members";
import { useMentionNotifications } from "@/hooks/chat/use-mention-notifications";
import { useChatStore } from "@/store/use-chat-store";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/components/providers/language-provider";
import { filterConversations } from "@/lib/chat/filter-conversations";
import type { ConvFilter } from "@/lib/chat/filter-conversations";

type SectionIcon = typeof Hash;

function Section({
    title,
    icon: Icon,
    items,
    activeConversationId,
    currentUserId,
    onSelect,
    nameFor,
    onOpenSettings,
}: {
    title: string;
    icon: SectionIcon;
    items: ConversationWithMeta[];
    activeConversationId: string | null;
    currentUserId: string | undefined;
    onSelect: (id: string) => void;
    nameFor: (c: ConversationWithMeta) => string;
    onOpenSettings: (conversationId: string) => void;
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
                    const myMember = c.members.find((m) => m.user_id === currentUserId);
                    const isOwner = myMember?.role === "owner";
                    return (
                        <div
                            key={c.id}
                            className={`group relative flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors ${
                                isActive
                                    ? "bg-[var(--card-bg)] font-semibold text-foreground shadow-sm ring-1 ring-[var(--card-border)]"
                                    : "text-foreground/80 hover:bg-foreground/5"
                            }`}
                        >
                            {isActive && (
                                <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-[var(--ink)]" />
                            )}
                            <button
                                type="button"
                                onClick={() => onSelect(c.id)}
                                className="min-w-0 flex-1 truncate text-left active:scale-[0.99]"
                            >
                                {c.kind === "channel" ? <span className="text-muted-foreground"># </span> : null}
                                {nameFor(c)}
                            </button>
                            {c.unread > 0 && (
                                <span className="ml-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white shadow-sm">
                                    {c.unread > 99 ? "99+" : c.unread}
                                </span>
                            )}
                            <ConversationMenu
                                conversation={c}
                                isOwner={isOwner}
                                onOpenSettings={() => onOpenSettings(c.id)}
                            />
                        </div>
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
    const statuses = usePresenceStore((s) => s.statuses);
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
                        className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-foreground/80 transition-colors hover:bg-foreground/5 disabled:opacity-50"
                    >
                        <ChatAvatar
                            userId={m.user_id}
                            name={m.display_name}
                            avatarUrl={m.avatar_url}
                            size="sm"
                            status={statuses[m.user_id] ?? "offline"}
                            showStatus
                        />
                        <span className="min-w-0 flex-1 truncate">{m.display_name}</span>
                        <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                ))}
            </div>
        </div>
    );
}

const FILTER_CHIPS: { key: ConvFilter; labelKey: string; fallback: string }[] = [
    { key: "all",      labelKey: "chat.filter.all",      fallback: "All" },
    { key: "unread",   labelKey: "chat.filter.unread",   fallback: "Unread" },
    { key: "mentions", labelKey: "chat.filter.mentions", fallback: "Mentions" },
    { key: "channels", labelKey: "chat.filter.channels", fallback: "Channels" },
    { key: "direct",   labelKey: "chat.filter.direct",   fallback: "Direct" },
    { key: "orders",   labelKey: "chat.filter.orders",   fallback: "Orders" },
    { key: "archived", labelKey: "chat.filter.archived", fallback: "Archived" },
];

export function ConversationList() {
    const { user } = useAuth();
    const { data: conversations = [], isLoading } = useConversations();
    const { data: archivedConversations = [] } = useArchivedConversations();
    const { data: members = [] } = useTenantMembers();
    const { mentions } = useMentionNotifications();
    const startDm = useStartDm();
    const { activeConversationId, setActiveConversation, settingsConversationId, openSettings, closeSettings } = useChatStore();
    const { t } = useLanguage();
    const [startingId, setStartingId] = useState<string | null>(null);
    const [newMenuOpen, setNewMenuOpen] = useState(false);
    const [channelDialogOpen, setChannelDialogOpen] = useState(false);
    const [groupDialogOpen, setGroupDialogOpen] = useState(false);
    const [archivedOpen, setArchivedOpen] = useState(false);
    const [filter, setFilter] = useState<ConvFilter>("all");

    const directLabel = t("chat.directMessage", "Direct message");

    const memberMap = useMemo(
        () => new Map(members.map((m) => [m.user_id, m])),
        [members]
    );

    const mentionConvIds = useMemo(
        () => new Set(mentions.map((n) => n.conversation_id).filter((id): id is string => id !== null)),
        [mentions]
    );

    // Apply filter before grouping into sections
    const filteredConversations = useMemo(
        () => filterConversations(conversations, filter, mentionConvIds),
        [conversations, filter, mentionConvIds]
    );

    const groups = useMemo(
        () => ({
            channel: filteredConversations.filter((c) => c.kind === "channel"),
            dm: filteredConversations.filter((c) => c.kind === "dm" || c.kind === "group"),
            order: filteredConversations.filter((c) => c.kind === "order"),
        }),
        [filteredConversations]
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
        <>
            <CreateChannelDialog open={channelDialogOpen} onOpenChange={setChannelDialogOpen} />
            <CreateGroupDialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen} />
            <ConversationSettingsDialog conversationId={settingsConversationId} onClose={closeSettings} />
            <div className="w-full shrink-0 overflow-y-auto overscroll-contain bg-(--background-soft,var(--background)) md:w-[40%] md:max-w-[260px] md:border-r md:border-(--card-border)">
                {/* List header */}
                <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("chat.conversations", "Conversations")}
                    </span>
                    <div className="flex items-center gap-1">
                        <ConversationJump />
                        <Popover open={newMenuOpen} onOpenChange={setNewMenuOpen}>
                            <PopoverTrigger asChild>
                                <button
                                    type="button"
                                    aria-label={t("chat.newChannel", "New channel")}
                                    className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                                >
                                    <Plus className="h-4 w-4" />
                                </button>
                            </PopoverTrigger>
                            <PopoverContent
                                align="end"
                                className="w-44 border-(--card-border) bg-(--card-bg) p-1 shadow-lg"
                            >
                                <button
                                    type="button"
                                    onClick={() => {
                                        setNewMenuOpen(false);
                                        setChannelDialogOpen(true);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-foreground/5"
                                >
                                    <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                                    {t("chat.newChannel", "New channel")}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setNewMenuOpen(false);
                                        setGroupDialogOpen(true);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-foreground/5"
                                >
                                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                    {t("chat.newGroup", "New group")}
                                </button>
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>

                {/* Filter chips */}
                <div className="flex gap-1 overflow-x-auto px-3 pb-2 scrollbar-none">
                    {FILTER_CHIPS.map(({ key, labelKey, fallback }) => {
                        const isActive = filter === key;
                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setFilter(key)}
                                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                                    isActive
                                        ? "bg-[color-mix(in_srgb,var(--ink)_15%,transparent)] text-foreground"
                                        : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                                }`}
                            >
                                {t(labelKey, fallback)}
                            </button>
                        );
                    })}
                </div>

                {isLoading ? (
                    <div className="space-y-1 p-3">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div
                                key={i}
                                className="h-8 animate-pulse rounded-lg bg-foreground/5"
                                style={{ animationDelay: `${i * 60}ms` }}
                            />
                        ))}
                    </div>
                ) : filter === "archived" ? (
                    /* Archived filter: replace live sections with a flat archived list */
                    <div className="py-1">
                        {archivedConversations.length === 0 ? (
                            <ChatEmptyState
                                icon={MessagesSquare}
                                title={t("chat.filter.archived", "Archived")}
                                description={t("chat.emptyConversations", "No conversations yet")}
                            />
                        ) : (
                            <div className="px-2 pb-2 pt-1">
                                <div className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    {t("chat.archived", "Archived")}
                                    <span className="ml-auto tabular-nums">{archivedConversations.length}</span>
                                </div>
                                <div className="space-y-0.5 pt-0.5">
                                    {archivedConversations.map((c) => {
                                        const isActive = activeConversationId === c.id;
                                        const myMember = c.members.find((m) => m.user_id === user?.id);
                                        const isOwner = myMember?.role === "owner";
                                        return (
                                            <div
                                                key={c.id}
                                                className={`group relative flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors ${
                                                    isActive
                                                        ? "bg-(--card-bg) font-semibold text-foreground shadow-sm ring-1 ring-(--card-border)"
                                                        : "text-foreground/60 hover:bg-foreground/5"
                                                }`}
                                            >
                                                {isActive && (
                                                    <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-(--ink)" />
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveConversation(c.id)}
                                                    className="min-w-0 flex-1 truncate text-left active:scale-[0.99]"
                                                >
                                                    {c.kind === "channel" ? <span className="text-muted-foreground"># </span> : null}
                                                    {nameFor(c)}
                                                </button>
                                                <ConversationMenu
                                                    conversation={c}
                                                    isOwner={isOwner}
                                                    onOpenSettings={() => openSettings(c.id)}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    /* Live sections (All / Unread / Mentions / Channels / Direct / Orders) */
                    <div className="py-1">
                        <Section
                            title={t("chat.section.channels", "Channels")}
                            icon={Hash}
                            items={groups.channel}
                            activeConversationId={activeConversationId}
                            currentUserId={user?.id}
                            onSelect={setActiveConversation}
                            nameFor={nameFor}
                            onOpenSettings={openSettings}
                        />
                        <Section
                            title={t("chat.section.direct", "Direct")}
                            icon={AtSign}
                            items={groups.dm}
                            activeConversationId={activeConversationId}
                            currentUserId={user?.id}
                            onSelect={setActiveConversation}
                            nameFor={nameFor}
                            onOpenSettings={openSettings}
                        />
                        <Section
                            title={t("chat.section.orders", "Order threads")}
                            icon={Package}
                            items={groups.order}
                            activeConversationId={activeConversationId}
                            currentUserId={user?.id}
                            onSelect={setActiveConversation}
                            nameFor={nameFor}
                            onOpenSettings={openSettings}
                        />
                        <TeamDirectory
                            title={t("chat.section.team", "Team members")}
                            hint={t("chat.startDm", "Start a direct message")}
                            members={directoryMembers}
                            onStart={startConversation}
                            startingId={startingId}
                        />
                        {archivedConversations.length > 0 && (
                            <div className="px-2 pb-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setArchivedOpen((o) => !o)}
                                    className="flex w-full items-center gap-1.5 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                                >
                                    {archivedOpen ? (
                                        <ChevronDown className="h-3 w-3 shrink-0" />
                                    ) : (
                                        <ChevronRight className="h-3 w-3 shrink-0" />
                                    )}
                                    {t("chat.archived", "Archived")}
                                    <span className="ml-auto tabular-nums">{archivedConversations.length}</span>
                                </button>
                                {archivedOpen && (
                                    <div className="space-y-0.5 pt-0.5">
                                        {archivedConversations.map((c) => {
                                            const isActive = activeConversationId === c.id;
                                            const myMember = c.members.find((m) => m.user_id === user?.id);
                                            const isOwner = myMember?.role === "owner";
                                            return (
                                                <div
                                                    key={c.id}
                                                    className={`group relative flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors ${
                                                        isActive
                                                            ? "bg-(--card-bg) font-semibold text-foreground shadow-sm ring-1 ring-(--card-border)"
                                                            : "text-foreground/60 hover:bg-foreground/5"
                                                    }`}
                                                >
                                                    {isActive && (
                                                        <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-(--ink)" />
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveConversation(c.id)}
                                                        className="min-w-0 flex-1 truncate text-left active:scale-[0.99]"
                                                    >
                                                        {c.kind === "channel" ? <span className="text-muted-foreground"># </span> : null}
                                                        {nameFor(c)}
                                                    </button>
                                                    <ConversationMenu
                                                        conversation={c}
                                                        isOwner={isOwner}
                                                        onOpenSettings={() => openSettings(c.id)}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                        {conversations.length === 0 && directoryMembers.length === 0 && (
                            <ChatEmptyState
                                icon={MessagesSquare}
                                title={t("chat.emptyConversations", "No conversations yet")}
                                description={t("chat.emptyTeam", "You're the only member of this workspace so far.")}
                            />
                        )}
                    </div>
                )}
            </div>
        </>
    );
}
