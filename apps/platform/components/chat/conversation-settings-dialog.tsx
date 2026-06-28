// apps/platform/components/chat/conversation-settings-dialog.tsx
"use client";
import { useState, useEffect, useMemo } from "react";
import { X, Users, UserMinus, UserPlus } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@scheniders/ui";
import { useConversationMembers, useAddMembers, useRemoveMember } from "@/hooks/chat/use-conversation-members";
import { useRenameConversation, useLeaveConversation, useDeleteConversation, useConversations, useArchivedConversations } from "@/hooks/chat/use-conversations";
import { useTenantMembers } from "@/hooks/chat/use-tenant-members";
import { useChatStore } from "@/store/use-chat-store";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/components/providers/language-provider";
import { useToast } from "@/hooks/use-toast";
import { ChatAvatar } from "./chat-avatar";
import { ChatEmptyState } from "./chat-empty-state";

type ConfirmKind = "leave" | "delete" | "removeMember" | null;

export function ConversationSettingsDialog({
    conversationId,
    onClose,
}: {
    conversationId: string | null;
    onClose: () => void;
}) {
    const { t } = useLanguage();
    const { toast } = useToast();
    const { user } = useAuth();
    const { setActiveConversation, activeConversationId } = useChatStore();

    const { data: members = [], isLoading: membersLoading } = useConversationMembers(conversationId);
    const { data: tenantMembers = [] } = useTenantMembers();

    // Resolve the conversation row (may be active or archived) so we can pre-populate the form.
    const { data: activeConvs = [] } = useConversations();
    const { data: archivedConvs = [] } = useArchivedConversations();
    const conversation = useMemo(
        () => [...activeConvs, ...archivedConvs].find((c) => c.id === conversationId) ?? null,
        [activeConvs, archivedConvs, conversationId]
    );

    const renameMutation = useRenameConversation();
    const leaveMutation = useLeaveConversation();
    const deleteMutation = useDeleteConversation();
    const addMembersMutation = useAddMembers(conversationId ?? "");
    const removeMemberMutation = useRemoveMember(conversationId ?? "");

    // Determine current user's role in this conversation
    const myRole = useMemo(
        () => members.find((m) => m.user_id === user?.id)?.role ?? null,
        [members, user?.id]
    );
    const isOwner = myRole === "owner";

    // Details form (name + topic) — only visible to owners
    const [name, setName] = useState("");
    const [topic, setTopic] = useState("");
    const [detailsSaving, setDetailsSaving] = useState(false);

    // When the dialog opens/changes conversation, seed the form from the current conversation data.
    // Keyed on both conversationId and conversation so it fires once the row is resolved.
    useEffect(() => {
        setName(conversation?.name ?? "");
        setTopic(conversation?.topic ?? "");
    }, [conversationId, conversation]);

    // Add members — multi-select from tenant members not already in conversation
    const existingMemberIds = useMemo(() => new Set(members.map((m) => m.user_id)), [members]);
    const addableTenantMembers = useMemo(
        () => tenantMembers.filter((m) => m.user_id !== user?.id && !existingMemberIds.has(m.user_id)),
        [tenantMembers, user?.id, existingMemberIds]
    );
    const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set());
    const [addPending, setAddPending] = useState(false);

    // Reset selection when conversation changes
    useEffect(() => {
        setSelectedToAdd(new Set());
    }, [conversationId]);

    // Confirm dialog
    const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);
    const [confirmMemberId, setConfirmMemberId] = useState<string | null>(null);
    const [confirmPending, setConfirmPending] = useState(false);

    const openConfirm = (kind: ConfirmKind, memberId?: string) => {
        setConfirmKind(kind);
        setConfirmMemberId(memberId ?? null);
        setConfirmPending(false);
    };

    const closeConfirm = () => {
        setConfirmKind(null);
        setConfirmMemberId(null);
        setConfirmPending(false);
    };

    const handleSaveDetails = async () => {
        if (!conversationId) return;
        setDetailsSaving(true);
        try {
            await renameMutation.mutateAsync({
                conversationId,
                name: name.trim() || "",
                topic: topic.trim() || null,
            });
            toast({ title: t("chat.save", "Save"), description: t("chat.rename", "Rename") });
        } catch (err) {
            toast({
                title: t("chat.rename", "Rename"),
                description: err instanceof Error ? err.message : String(err),
                variant: "error",
            });
        } finally {
            setDetailsSaving(false);
        }
    };

    const toggleAddSelection = (userId: string) => {
        setSelectedToAdd((prev) => {
            const next = new Set(prev);
            if (next.has(userId)) next.delete(userId);
            else next.add(userId);
            return next;
        });
    };

    const handleAddMembers = async () => {
        if (!conversationId || selectedToAdd.size === 0) return;
        setAddPending(true);
        try {
            await addMembersMutation.mutateAsync(Array.from(selectedToAdd));
            setSelectedToAdd(new Set());
        } catch (err) {
            toast({
                title: t("chat.addMembers", "Add members"),
                description: err instanceof Error ? err.message : String(err),
                variant: "error",
            });
        } finally {
            setAddPending(false);
        }
    };

    const handleConfirm = async () => {
        if (!confirmKind || !conversationId) return;
        setConfirmPending(true);
        try {
            if (confirmKind === "leave") {
                await leaveMutation.mutateAsync(conversationId);
                if (activeConversationId === conversationId) {
                    setActiveConversation(null);
                }
                onClose();
            } else if (confirmKind === "delete") {
                await deleteMutation.mutateAsync(conversationId);
                if (activeConversationId === conversationId) {
                    setActiveConversation(null);
                }
                onClose();
            } else if (confirmKind === "removeMember" && confirmMemberId) {
                await removeMemberMutation.mutateAsync(confirmMemberId);
                closeConfirm();
            }
        } catch (err) {
            setConfirmPending(false);
            toast({
                title:
                    confirmKind === "delete"
                        ? t("chat.delete", "Delete")
                        : confirmKind === "leave"
                        ? t("chat.leave", "Leave")
                        : t("chat.removeMember", "Remove"),
                description: err instanceof Error ? err.message : String(err),
                variant: "error",
            });
        }
    };

    const isOpen = conversationId !== null;

    return (
        <>
            <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
                <DialogContent className="max-h-[85vh] overflow-y-auto md:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{t("chat.settings", "Settings")}</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-6 py-2">
                        {/* Details section — owners only */}
                        {isOwner && (
                            <section>
                                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    {t("chat.rename", "Rename")}
                                </h3>
                                <div className="space-y-2">
                                    <input
                                        type="text"
                                        placeholder={t("chat.channelName", "Name")}
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="w-full rounded-lg border border-(--card-border) bg-(--card-bg) px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                                    />
                                    <input
                                        type="text"
                                        placeholder={t("chat.channelTopic", "Topic (optional)")}
                                        value={topic}
                                        onChange={(e) => setTopic(e.target.value)}
                                        className="w-full rounded-lg border border-(--card-border) bg-(--card-bg) px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => void handleSaveDetails()}
                                        disabled={detailsSaving || (!name.trim() && !topic.trim())}
                                        className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                    >
                                        {detailsSaving ? "…" : t("chat.save", "Save")}
                                    </button>
                                </div>
                            </section>
                        )}

                        {/* Members section */}
                        <section>
                            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {t("chat.members", "Members")}
                            </h3>

                            {membersLoading ? (
                                <div className="space-y-2">
                                    {Array.from({ length: 3 }).map((_, i) => (
                                        <div
                                            key={i}
                                            className="h-10 animate-pulse rounded-lg bg-foreground/5"
                                            style={{ animationDelay: `${i * 60}ms` }}
                                        />
                                    ))}
                                </div>
                            ) : members.length === 0 ? (
                                <ChatEmptyState
                                    icon={Users}
                                    title={t("chat.members", "Members")}
                                    description={t("chat.selectMembers", "Select teammates")}
                                />
                            ) : (
                                <ul className="space-y-1">
                                    {members.map((m) => (
                                        <li
                                            key={m.user_id}
                                            className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-foreground/5"
                                        >
                                            <ChatAvatar
                                                userId={m.user_id}
                                                name={m.display_name}
                                                avatarUrl={m.avatar_url}
                                                size="sm"
                                            />
                                            <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                                                {m.display_name}
                                            </span>
                                            {m.role === "owner" && (
                                                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                                    {t("chat.owner", "Owner")}
                                                </span>
                                            )}
                                            {/* Admin can remove any member (but not self here — Leave button handles that) */}
                                            {isOwner && m.user_id !== user?.id && (
                                                <button
                                                    type="button"
                                                    aria-label={t("chat.removeMember", "Remove")}
                                                    onClick={() => openConfirm("removeMember", m.user_id)}
                                                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/20"
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}

                            {/* Add members — owners only */}
                            {isOwner && addableTenantMembers.length > 0 && (
                                <div className="mt-4">
                                    <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
                                        {t("chat.addMembers", "Add members")}
                                    </h4>
                                    <ul className="max-h-36 space-y-0.5 overflow-y-auto">
                                        {addableTenantMembers.map((m) => {
                                            const selected = selectedToAdd.has(m.user_id);
                                            return (
                                                <li key={m.user_id}>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleAddSelection(m.user_id)}
                                                        className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                                                            selected
                                                                ? "bg-primary/10 text-primary"
                                                                : "text-foreground/80 hover:bg-foreground/5"
                                                        }`}
                                                    >
                                                        <ChatAvatar
                                                            userId={m.user_id}
                                                            name={m.display_name}
                                                            avatarUrl={m.avatar_url}
                                                            size="xs"
                                                        />
                                                        <span className="min-w-0 flex-1 truncate">{m.display_name}</span>
                                                        {selected && (
                                                            <UserMinus className="h-3.5 w-3.5 shrink-0" />
                                                        )}
                                                        {!selected && (
                                                            <UserPlus className="h-3.5 w-3.5 shrink-0 opacity-40" />
                                                        )}
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                    {selectedToAdd.size > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => void handleAddMembers()}
                                            disabled={addPending}
                                            className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                                        >
                                            <UserPlus className="h-3.5 w-3.5" />
                                            {addPending
                                                ? "…"
                                                : `${t("chat.addMembers", "Add members")} (${selectedToAdd.size})`}
                                        </button>
                                    )}
                                </div>
                            )}
                        </section>
                    </div>

                    <DialogFooter className="flex-col gap-2 sm:flex-row">
                        {/* Leave — available to all members (except the last sole owner; RPC enforces that) */}
                        <button
                            type="button"
                            onClick={() => openConfirm("leave")}
                            className="inline-flex h-9 items-center justify-center rounded-md border border-(--card-border) px-3 text-sm font-medium text-foreground/80 hover:text-foreground"
                        >
                            {t("chat.leave", "Leave")}
                        </button>

                        {/* Delete — owners only */}
                        {isOwner && (
                            <button
                                type="button"
                                onClick={() => openConfirm("delete")}
                                className="inline-flex h-9 items-center justify-center rounded-md bg-red-500 px-4 text-sm font-semibold text-white hover:bg-red-600"
                            >
                                {t("chat.delete", "Delete")}
                            </button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Destructive / remove-member confirm dialog */}
            <Dialog open={confirmKind !== null} onOpenChange={(open) => { if (!open) closeConfirm(); }}>
                <DialogContent className="md:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>
                            {confirmKind === "delete"
                                ? t("chat.delete", "Delete")
                                : confirmKind === "leave"
                                ? t("chat.leave", "Leave")
                                : t("chat.removeMember", "Remove")}
                        </DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        {confirmKind === "delete"
                            ? t("chat.confirmDelete", "Delete this conversation? This can't be undone.")
                            : confirmKind === "leave"
                            ? t("chat.confirmLeave", "Leave this conversation?")
                            : t("chat.confirmRemoveMember", "Remove this member?")}
                    </p>
                    <DialogFooter>
                        <button
                            type="button"
                            onClick={closeConfirm}
                            disabled={confirmPending}
                            className="inline-flex h-9 items-center justify-center rounded-md border border-(--card-border) bg-(--card-bg) px-3 text-sm font-medium text-foreground/80 hover:text-foreground disabled:opacity-50"
                        >
                            {t("chat.cancel", "Cancel")}
                        </button>
                        <button
                            type="button"
                            onClick={() => void handleConfirm()}
                            disabled={confirmPending}
                            className="inline-flex h-9 items-center justify-center rounded-md bg-red-500 px-4 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
                        >
                            {confirmPending
                                ? "…"
                                : confirmKind === "delete"
                                ? t("chat.delete", "Delete")
                                : confirmKind === "leave"
                                ? t("chat.leave", "Leave")
                                : t("chat.removeMember", "Remove")}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
