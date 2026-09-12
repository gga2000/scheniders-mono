"use client";

import { CheckCircle2, RotateCcw } from "lucide-react";
import { useConversations } from "@/hooks/chat/use-conversations";
import { useSetConversationResolved } from "@/hooks/chat/use-order-actions";
import { useLanguage } from "@/components/providers/language-provider";
import { useToast } from "@/hooks/use-toast";

/**
 * Close / reopen this order's discussion thread without leaving the order.
 *
 * The thread also closes itself after a day of silence, but the moment you
 * actually know the problem is handled is while you are looking at the order —
 * so the manual control belongs here, next to Discuss, not only inside the chat
 * panel. Renders nothing until a thread exists: there is nothing to close yet.
 */
export function OrderThreadCloseButton({ orderId }: { orderId: string }) {
    const { t } = useLanguage();
    const { toast } = useToast();
    const { data: conversations = [] } = useConversations();
    const setResolved = useSetConversationResolved();

    const thread = conversations.find((c) => c.kind === "order" && c.order_id === orderId);
    if (!thread) return null;

    const isResolved = thread.resolved_at !== null;

    const handleClick = () => {
        setResolved.mutate(
            { conversationId: thread.id, resolved: !isResolved },
            {
                onError: (err) =>
                    toast({
                        title: isResolved
                            ? t("chat.reopenThread", "Reopen thread")
                            : t("chat.closeThread", "Close thread"),
                        description: err instanceof Error ? err.message : String(err),
                        variant: "error",
                    }),
            },
        );
    };

    return (
        <button
            onClick={handleClick}
            disabled={setResolved.isPending}
            title={isResolved ? t("chat.reopenThread", "Reopen thread") : t("chat.closeThread", "Close thread")}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                isResolved
                    ? "border-(--card-border) bg-(--card-bg) text-foreground/70 hover:text-foreground"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
        >
            {isResolved ? (
                <RotateCcw className="h-3.5 w-3.5" />
            ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            {isResolved ? t("chat.reopenThread", "Reopen thread") : t("chat.closeThread", "Close thread")}
        </button>
    );
}
