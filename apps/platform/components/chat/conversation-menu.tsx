// apps/platform/components/chat/conversation-menu.tsx
"use client";
import { useState } from "react";
import { MoreHorizontal, Settings, Archive, ArchiveRestore, LogOut, Trash2, BellOff, Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@scheniders/ui";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@scheniders/ui";
import {
    useArchiveConversation,
    useLeaveConversation,
    useDeleteConversation,
    useToggleMute,
} from "@/hooks/chat/use-conversations";
import type { ConversationWithMeta } from "@/hooks/chat/use-conversations";
import { useChatStore } from "@/store/use-chat-store";
import { useLanguage } from "@/components/providers/language-provider";
import { useToast } from "@/hooks/use-toast";

type ConfirmKind = "leave" | "delete" | null;

export function ConversationMenu({
    conversation,
    isOwner,
    onOpenSettings,
}: {
    conversation: ConversationWithMeta;
    isOwner: boolean;
    onOpenSettings: () => void;
}) {
    const { t } = useLanguage();
    const { toast } = useToast();
    const { activeConversationId, setActiveConversation } = useChatStore();
    const archiveMutation = useArchiveConversation();
    const leaveMutation = useLeaveConversation();
    const deleteMutation = useDeleteConversation();
    const { toggle: toggleMute } = useToggleMute();

    const [popoverOpen, setPopoverOpen] = useState(false);
    const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);
    const [confirmPending, setConfirmPending] = useState(false);

    const isManageable = conversation.kind === "channel" || conversation.kind === "group";
    const isArchived = !!conversation.archived_at;

    const handleArchive = async () => {
        setPopoverOpen(false);
        try {
            await archiveMutation.mutateAsync({
                conversationId: conversation.id,
                archived: !isArchived,
            });
        } catch (err) {
            toast({
                title: isArchived
                    ? t("chat.unarchive", "Unarchive")
                    : t("chat.archive", "Archive"),
                description: err instanceof Error ? err.message : String(err),
                variant: "error",
            });
        }
    };

    const handleMute = () => {
        setPopoverOpen(false);
        toggleMute({ conversationId: conversation.id, muted: !conversation.my_muted });
    };

    const openConfirm = (kind: ConfirmKind) => {
        setPopoverOpen(false);
        setConfirmKind(kind);
    };

    const closeConfirm = () => {
        setConfirmKind(null);
        setConfirmPending(false);
    };

    const handleConfirm = async () => {
        if (!confirmKind) return;
        setConfirmPending(true);
        try {
            if (confirmKind === "leave") {
                await leaveMutation.mutateAsync(conversation.id);
                if (activeConversationId === conversation.id) {
                    setActiveConversation(null);
                }
            } else if (confirmKind === "delete") {
                await deleteMutation.mutateAsync(conversation.id);
                if (activeConversationId === conversation.id) {
                    setActiveConversation(null);
                }
            }
            closeConfirm();
        } catch (err) {
            setConfirmPending(false);
            toast({
                title: confirmKind === "delete"
                    ? t("chat.delete", "Delete")
                    : t("chat.leave", "Leave"),
                description: err instanceof Error ? err.message : String(err),
                variant: "error",
            });
        }
    };

    return (
        <>
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        aria-label="More options"
                        onClick={(e) => {
                            e.stopPropagation();
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                    >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                </PopoverTrigger>
                <PopoverContent
                    align="end"
                    className="w-44 border-(--card-border) bg-(--card-bg) p-1 shadow-lg"
                    onClick={(e) => e.stopPropagation()}
                >
                    {isManageable && (
                        <button
                            type="button"
                            onClick={() => {
                                setPopoverOpen(false);
                                onOpenSettings();
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-foreground/5"
                        >
                            <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                            {t("chat.settings", "Settings")}
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={() => void handleArchive()}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-foreground/5"
                    >
                        {isArchived ? (
                            <>
                                <ArchiveRestore className="h-3.5 w-3.5 text-muted-foreground" />
                                {t("chat.unarchive", "Unarchive")}
                            </>
                        ) : (
                            <>
                                <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                                {t("chat.archive", "Archive")}
                            </>
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={handleMute}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-foreground/5"
                    >
                        {conversation.my_muted ? (
                            <>
                                <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                                {t("chat.unmute", "Unmute")}
                            </>
                        ) : (
                            <>
                                <BellOff className="h-3.5 w-3.5 text-muted-foreground" />
                                {t("chat.mute", "Mute")}
                            </>
                        )}
                    </button>

                    {isManageable && (
                        <button
                            type="button"
                            onClick={() => openConfirm("leave")}
                            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-foreground/5"
                        >
                            <LogOut className="h-3.5 w-3.5 text-muted-foreground" />
                            {t("chat.leave", "Leave")}
                        </button>
                    )}

                    {isOwner && isManageable && (
                        <button
                            type="button"
                            onClick={() => openConfirm("delete")}
                            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t("chat.delete", "Delete")}
                        </button>
                    )}
                </PopoverContent>
            </Popover>

            {/* Destructive confirm dialog */}
            <Dialog open={confirmKind !== null} onOpenChange={(open) => { if (!open) closeConfirm(); }}>
                <DialogContent className="md:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>
                            {confirmKind === "delete"
                                ? t("chat.delete", "Delete")
                                : t("chat.leave", "Leave")}
                        </DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        {confirmKind === "delete"
                            ? t("chat.confirmDelete", "Delete this conversation? This can't be undone.")
                            : t("chat.confirmLeave", "Leave this conversation?")}
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
                                    : t("chat.leave", "Leave")}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
