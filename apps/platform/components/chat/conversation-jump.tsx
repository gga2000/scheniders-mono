// apps/platform/components/chat/conversation-jump.tsx
"use client";
import { useState, useMemo } from "react";
import { ArrowRightLeft, Hash, AtSign, Package, Users } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@scheniders/ui";
import { ChatAvatar } from "./chat-avatar";
import { useConversations, useStartDm } from "@/hooks/chat/use-conversations";
import type { ConversationWithMeta } from "@/hooks/chat/use-conversations";
import { useTenantMembers } from "@/hooks/chat/use-tenant-members";
import type { TenantMember } from "@/hooks/chat/use-tenant-members";
import { useChatStore } from "@/store/use-chat-store";
import { useAuth } from "@/hooks/use-auth";
import { usePresenceStore } from "@/store/use-presence-store";
import { useLanguage } from "@/components/providers/language-provider";
import { fuzzyRank } from "@/lib/chat/fuzzy";

type Candidate =
    | { type: "conversation"; conv: ConversationWithMeta; label: string }
    | { type: "member"; member: TenantMember };

function candidateLabel(c: Candidate): string {
    return c.type === "conversation" ? c.label : c.member.display_name;
}

function ConvIcon({ kind }: { kind: string }) {
    if (kind === "channel") return <Hash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
    if (kind === "order") return <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
    return <AtSign className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
}

export function ConversationJump() {
    const { t } = useLanguage();
    const { user } = useAuth();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");

    const { data: conversations = [] } = useConversations();
    const { data: members = [] } = useTenantMembers();
    const statuses = usePresenceStore((s) => s.statuses);
    const { setActiveConversation } = useChatStore();
    const startDm = useStartDm();

    // Replicate the nameFor logic from conversation-list exactly
    const memberMap = useMemo(
        () => new Map(members.map((m) => [m.user_id, m])),
        [members],
    );
    const directLabel = t("chat.directMessage", "Direct message");

    // User ids already reachable via an existing 1:1 DM (exclude from teammate list)
    const dmUserIds = useMemo(() => {
        const ids = new Set<string>();
        for (const c of conversations) {
            if (c.kind !== "dm") continue;
            const other = c.members.find((m) => m.user_id !== user?.id);
            if (other) ids.add(other.user_id);
        }
        return ids;
    }, [conversations, user?.id]);

    // Build candidate list: all non-archived conversations + teammates without a 1:1 DM yet
    // nameFor logic is inlined so all deps are correctly tracked
    const candidates = useMemo<Candidate[]>(() => {
        const resolveLabel = (c: ConversationWithMeta): string => {
            if (c.kind === "channel") return c.name ?? "";
            if (c.name) return c.name;
            const other = c.members.find((m) => m.user_id !== user?.id);
            return (other && memberMap.get(other.user_id)?.display_name) || directLabel;
        };

        const convCandidates: Candidate[] = conversations
            .filter((c) => !c.archived_at)
            .map((c) => ({ type: "conversation" as const, conv: c, label: resolveLabel(c) }));

        const memberCandidates: Candidate[] = members
            .filter((m) => m.user_id !== user?.id && !dmUserIds.has(m.user_id))
            .map((m) => ({ type: "member" as const, member: m }));

        return [...convCandidates, ...memberCandidates];
    }, [conversations, members, user?.id, dmUserIds, memberMap, directLabel]);

    const ranked = useMemo(
        () => fuzzyRank(candidates, query, candidateLabel),
        [candidates, query],
    );

    const [startingId, setStartingId] = useState<string | null>(null);

    const handleSelect = async (candidate: Candidate) => {
        if (candidate.type === "conversation") {
            setActiveConversation(candidate.conv.id);
            setOpen(false);
            setQuery("");
        } else {
            const userId = candidate.member.user_id;
            setStartingId(userId);
            try {
                const convId = await startDm.mutateAsync(userId);
                setActiveConversation(convId);
                setOpen(false);
                setQuery("");
            } finally {
                setStartingId(null);
            }
        }
    };

    const handleOpenChange = (v: boolean) => {
        setOpen(v);
        if (!v) setQuery("");
    };

    return (
        <>
            <button
                type="button"
                aria-label={t("chat.jumpTo", "Jump to…")}
                onClick={() => setOpen(true)}
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
                <ArrowRightLeft className="h-4 w-4" />
            </button>

            <Dialog open={open} onOpenChange={handleOpenChange}>
                <DialogContent className="max-w-sm border-(--card-border) bg-(--card-bg) p-0 shadow-xl">
                    <DialogHeader className="sr-only">
                        <DialogTitle>{t("chat.jumpTo", "Jump to…")}</DialogTitle>
                    </DialogHeader>

                    {/* Search input */}
                    <div className="border-b border-(--card-border) px-4 py-3">
                        <input
                            autoFocus
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={t("chat.jumpToPlaceholder", "Search conversations and people…")}
                            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                        />
                    </div>

                    {/* Results */}
                    <div className="max-h-72 overflow-y-auto py-1">
                        {ranked.length === 0 ? (
                            <p className="px-4 py-3 text-center text-sm text-muted-foreground">
                                {t("chat.jumpToEmpty", "No matches")}
                            </p>
                        ) : (
                            ranked.map((candidate) => {
                                if (candidate.type === "conversation") {
                                    const c = candidate.conv;
                                    return (
                                        <button
                                            key={`conv-${c.id}`}
                                            type="button"
                                            onClick={() => handleSelect(candidate)}
                                            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-foreground/5"
                                        >
                                            <ConvIcon kind={c.kind} />
                                            <span className="min-w-0 flex-1 truncate">{candidate.label}</span>
                                            {c.unread > 0 && (
                                                <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                                                    {c.unread > 99 ? "99+" : c.unread}
                                                </span>
                                            )}
                                        </button>
                                    );
                                }

                                const m = candidate.member;
                                const isStarting = startingId === m.user_id;
                                return (
                                    <button
                                        key={`member-${m.user_id}`}
                                        type="button"
                                        onClick={() => handleSelect(candidate)}
                                        disabled={isStarting}
                                        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-foreground/5 disabled:opacity-50"
                                    >
                                        <ChatAvatar
                                            userId={m.user_id}
                                            name={m.display_name}
                                            avatarUrl={m.avatar_url}
                                            size="xs"
                                            status={statuses[m.user_id] ?? "offline"}
                                            showStatus
                                        />
                                        <span className="min-w-0 flex-1 truncate">{m.display_name}</span>
                                        <Users className="h-3 w-3 shrink-0 text-muted-foreground opacity-50" />
                                    </button>
                                );
                            })
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
