// apps/platform/components/chat/message-actions.tsx
"use client";

import { useState } from "react";
import { Copy, CornerUpLeft, MoreHorizontal, Pin, PinOff, Share2, Pencil, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@scheniders/ui/popover";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/components/providers/language-provider";
import { usePinMessage, useUnpinMessage } from "@/hooks/chat/use-pins";
import type { ChatMessage } from "@/types/chat";

interface MessageActionsProps {
    message: ChatMessage;
    isPinned: boolean;
    isOwn: boolean;
    onReply: () => void;
    onForward: (message: ChatMessage) => void;
    onEdit: () => void;
    onDelete: () => void;
}

export function MessageActions({
    message,
    isPinned,
    isOwn,
    onReply,
    onForward,
    onEdit,
    onDelete,
}: MessageActionsProps) {
    const { t } = useLanguage();
    const [open, setOpen] = useState(false);

    const pinMessage = usePinMessage(message.conversation_id);
    const unpinMessage = useUnpinMessage(message.conversation_id);

    const close = () => setOpen(false);

    const handleCopy = () => {
        if (message.body) {
            void navigator.clipboard.writeText(message.body).then(() => {
                toast.success(t("chat.copied", "Copied"));
            });
        }
        close();
    };

    const handleReply = () => {
        onReply();
        close();
    };

    const handlePin = () => {
        if (isPinned) {
            unpinMessage.mutate(message.id);
        } else {
            pinMessage.mutate(message.id);
        }
        close();
    };

    const handleForward = () => {
        onForward(message);
        close();
    };

    const handleEdit = () => {
        onEdit();
        close();
    };

    const handleDelete = () => {
        onDelete();
        close();
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={t("chat.messageActions", "Message actions")}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 hover:bg-foreground/8 hover:text-foreground"
                >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                side="top"
                sideOffset={4}
                className="w-44 p-1 bg-[var(--card-bg)] border-[var(--card-border)]"
            >
                <button
                    type="button"
                    onClick={handleReply}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-foreground/5"
                >
                    <CornerUpLeft className="h-3.5 w-3.5 text-muted-foreground" />
                    {t("chat.reply", "Reply")}
                </button>

                <button
                    type="button"
                    onClick={handlePin}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-foreground/5"
                >
                    {isPinned ? (
                        <PinOff className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                        <Pin className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    {isPinned ? t("chat.unpin", "Unpin") : t("chat.pin", "Pin")}
                </button>

                <button
                    type="button"
                    onClick={handleForward}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-foreground/5"
                >
                    <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
                    {t("chat.forward", "Forward")}
                </button>

                <button
                    type="button"
                    onClick={handleCopy}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-foreground/5"
                >
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    {t("chat.copy", "Copy")}
                </button>

                {isOwn && (
                    <>
                        <div className="my-1 h-px bg-[var(--card-border)]" />
                        <button
                            type="button"
                            onClick={handleEdit}
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-foreground/5"
                        >
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            {t("chat.edit", "Edit")}
                        </button>
                        <button
                            type="button"
                            onClick={handleDelete}
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/5"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t("chat.delete", "Delete")}
                        </button>
                    </>
                )}
            </PopoverContent>
        </Popover>
    );
}
