// apps/platform/components/chat/message-item.tsx
"use client";
import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { ChatAvatar } from "./chat-avatar";
import { MessageActions } from "./message-actions";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, CornerUpLeft, FileText, Paperclip, RefreshCw, Trash2 } from "lucide-react";
import { renderMarkdown } from "@/lib/chat/markdown";
import { ReferenceCard } from "./reference-card";
import { ReactionBar } from "./reaction-bar";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/components/providers/language-provider";
import { useTenantMembers } from "@/hooks/chat/use-tenant-members";
import { useChatStore } from "@/store/use-chat-store";
import { useAuth } from "@/hooks/use-auth";
import { usePins } from "@/hooks/chat/use-pins";
import { useMessages } from "@/hooks/chat/use-messages";
import { chatKeys } from "@/hooks/chat/use-conversations";
import { PIPELINE_STAGE_REGISTRY } from "@/lib/order-pipeline";
import type { PipelineStageId } from "@/lib/order-pipeline";
import type { ChatMessage, ChatSystemEvent } from "@/types/chat";

/** Image attachments use the paperclip glyph; other files a document glyph. */
function isImage(mime: string | null | undefined): boolean {
    return !!mime && mime.startsWith("image/");
}

/** Resolve a localized status label from the pipeline registry, falling back to the raw value. */
function statusLabel(status: string, t: (key: string, fallback: string) => string): string {
    const meta = PIPELINE_STAGE_REGISTRY[status as PipelineStageId];
    if (meta) return t(meta.labelKey, meta.fallback);
    return status;
}

/** Centered muted pill rendered for system-generated events (no avatar, no bubble). */
function SystemEventPill({ event, t, memberMap }: {
    event: ChatSystemEvent;
    t: (key: string, fallback: string, params?: Record<string, string>) => string;
    memberMap: Map<string, { display_name: string }>;
}) {
    let text: string;

    if (event.type === "status_changed") {
        const actor = event.actor_name ?? t("chat.system", "System");
        const toLabel = statusLabel(event.to, t);
        text = t("chat.event.statusChanged", "{actor} changed status to {to}", { actor, to: toLabel });
    } else if (event.type === "assigned") {
        const actor = event.actor_name ?? t("chat.system", "System");
        if (event.to === null) {
            text = t("chat.event.unassigned", "{actor} unassigned this", { actor });
        } else {
            const who = memberMap.get(event.to)?.display_name ?? t("chat.teammate", "Teammate");
            text = t("chat.event.assigned", "{actor} assigned this to {who}", { actor, who });
        }
    } else {
        // delivered
        text = t("chat.event.delivered", "Order delivered");
    }

    return (
        <div className="flex items-center justify-center px-4 py-1">
            <span className="inline-flex items-center rounded-full bg-(--pastel-mint)/60 px-3 py-0.5 text-[11px] text-muted-foreground ring-1 ring-(--card-border)">
                {text}
            </span>
        </div>
    );
}

/** Inline quote-reply preview shown above the message body. */
function QuotePreview({
    parentMessage,
    parentSenderName,
    conversationId,
    replyToId,
    t,
}: {
    parentMessage: ChatMessage | undefined;
    parentSenderName: string;
    conversationId: string;
    replyToId: string;
    t: (key: string, fallback: string) => string;
}) {
    const openMessage = useChatStore((s) => s.openMessage);

    const handleClick = () => {
        openMessage(conversationId, replyToId);
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            className="mb-1 flex w-full items-start gap-1.5 rounded-lg border-l-2 border-indigo-400 bg-indigo-50/60 px-2.5 py-1.5 text-left transition-colors hover:bg-indigo-50 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/30"
        >
            <CornerUpLeft className="mt-0.5 h-3 w-3 shrink-0 text-indigo-400" />
            <div className="min-w-0 flex-1">
                <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                    {parentSenderName}
                </span>
                <p className="truncate text-[11px] text-muted-foreground">
                    {parentMessage
                        ? (parentMessage.body || t("chat.attachment", "Attachment"))
                        : t("chat.originalMessage", "Original message")}
                </p>
            </div>
        </button>
    );
}

export function MessageItem({
    message,
    senderName,
    senderAvatar,
    parentMessage,
    onForward,
}: {
    message: ChatMessage;
    senderName: string;
    senderAvatar?: string | null;
    parentMessage?: ChatMessage;
    onForward?: (msg: ChatMessage) => void;
}) {
    const { t } = useLanguage();
    const reduceMotion = useReducedMotion();
    const { data: members } = useTenantMembers();
    const { user } = useAuth();
    const qc = useQueryClient();
    const setReplyTo = useChatStore((s) => s.setReplyTo);
    const { data: pins } = usePins(message.conversation_id);
    const { retrySend } = useMessages(message.conversation_id);

    const [isEditing, setIsEditing] = useState(false);
    const [editBody, setEditBody] = useState(message.body);

    // Memoized member map for resolving assignee display names in system events.
    // The same query data is already cached (MessageList uses it too), so this
    // only recomputes when the members list actually changes.
    const memberMap = useMemo(
        () => new Map<string, { display_name: string }>(
            (members ?? []).map((m) => [m.user_id, { display_name: m.display_name }])
        ),
        [members]
    );

    const parentSenderName = useMemo(() => {
        if (!parentMessage?.sender_id) return t("chat.teammate", "Teammate");
        return memberMap.get(parentMessage.sender_id)?.display_name ?? t("chat.teammate", "Teammate");
    }, [parentMessage, memberMap, t]);

    const isPinned = useMemo(
        () => (pins ?? []).some((p) => p.message_id === message.id),
        [pins, message.id]
    );

    const isOwn = message.sender_id === user?.id;

    // System events render as a centered muted pill — no avatar, no bubble.
    if (message.is_system && message.system_event) {
        return (
            <SystemEventPill
                event={message.system_event}
                t={t}
                memberMap={memberMap}
            />
        );
    }

    if (message.deleted_at) {
        return (
            <div className="px-4 py-1.5 text-xs italic text-muted-foreground">
                {t("chat.messageDeleted", "Message deleted")}
            </div>
        );
    }

    const openAttachment = async (storagePath: string) => {
        const { data } = await supabase.storage.from("chat-attachments").createSignedUrl(storagePath, 60);
        if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    };

    const handleEditSave = async () => {
        const newBody = editBody.trim();
        if (!newBody || newBody === message.body) {
            setIsEditing(false);
            setEditBody(message.body);
            return;
        }
        const { error } = await supabase
            .from("chat_messages")
            .update({ body: newBody, edited_at: new Date().toISOString() })
            .eq("id", message.id);
        if (error) {
            toast.error(t("chat.editFailed", "Couldn't edit message"));
        }
        setIsEditing(false);
    };

    const handleDelete = async () => {
        const { error } = await supabase
            .from("chat_messages")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", message.id);
        if (error) {
            toast.error(t("chat.deleteFailed", "Couldn't delete message"));
        }
    };

    return (
        <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 4 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className={`group relative flex gap-2.5 px-4 py-1.5 transition-colors hover:bg-black/2.5 ${
                message.pending && !message.failed ? "opacity-60" : ""
            }`}
        >
            {/* Action menu: positioned in the top-right corner, shown on hover */}
            {!message.pending && (
                <div className="absolute top-1 right-3 z-10">
                    <MessageActions
                        message={message}
                        isPinned={isPinned}
                        isOwn={isOwn}
                        onReply={() => setReplyTo(message.id)}
                        onForward={() => onForward?.(message)}
                        onEdit={() => {
                            setEditBody(message.body);
                            setIsEditing(true);
                        }}
                        onDelete={() => void handleDelete()}
                    />
                </div>
            )}

            <ChatAvatar userId={message.sender_id ?? ""} name={senderName} avatarUrl={senderAvatar} size="sm" />
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-semibold text-foreground">{senderName}</span>
                    <span className="text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                    </span>
                    {message.edited_at && (
                        <span className="text-[10px] text-muted-foreground/80">({t("chat.edited", "edited")})</span>
                    )}
                </div>

                {/* Quote-reply preview */}
                {message.reply_to_id && (
                    <QuotePreview
                        parentMessage={parentMessage}
                        parentSenderName={parentSenderName}
                        conversationId={message.conversation_id}
                        replyToId={message.reply_to_id}
                        t={t}
                    />
                )}

                {/* Body: inline edit textarea or rendered text */}
                {isEditing ? (
                    <div className="flex flex-col gap-1.5">
                        <textarea
                            value={editBody}
                            onChange={(e) => setEditBody(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                                    e.preventDefault();
                                    void handleEditSave();
                                }
                                if (e.key === "Escape") {
                                    setIsEditing(false);
                                    setEditBody(message.body);
                                }
                            }}
                            autoFocus
                            rows={2}
                            className="w-full resize-none rounded-lg border border-(--card-border) bg-(--card-bg) px-2.5 py-1.5 text-[13.5px] leading-relaxed text-foreground/90 outline-none focus:ring-2 focus:ring-indigo-400/40"
                        />
                        <div className="flex items-center gap-2 text-[11px]">
                            <button
                                type="button"
                                onClick={() => void handleEditSave()}
                                className="rounded-md bg-indigo-600 px-2.5 py-1 font-semibold text-white transition-colors hover:bg-indigo-700"
                            >
                                {t("chat.save", "Save")}
                            </button>
                            <button
                                type="button"
                                onClick={() => { setIsEditing(false); setEditBody(message.body); }}
                                className="rounded-md px-2.5 py-1 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                            >
                                {t("chat.cancel", "Cancel")}
                            </button>
                        </div>
                    </div>
                ) : (
                    message.body && (
                        <div className="whitespace-pre-wrap wrap-break-word text-[13.5px] leading-relaxed text-foreground/90">
                            {renderMarkdown(message.body)}
                        </div>
                    )
                )}

                {(message.references ?? []).map((r, i) => (
                    <ReferenceCard key={i} reference={r} />
                ))}
                {(message.attachments ?? []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                        {(message.attachments ?? []).map((a, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={() => openAttachment(a.storage_path)}
                                className="inline-flex max-w-[220px] items-center gap-2 rounded-xl border border-(--card-border) bg-(--card-bg) px-3 py-2 text-xs text-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
                            >
                                {isImage(a.mime) ? (
                                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                ) : (
                                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                )}
                                <span className="truncate">{a.file_name}</span>
                            </button>
                        ))}
                    </div>
                )}
                {/* Send-failure affordance — shown instead of the reaction bar */}
                {message.failed ? (
                    <div className="mt-1 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50/80 px-2.5 py-1.5 dark:border-red-900/40 dark:bg-red-900/20">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                        <span className="text-[11px] font-medium text-red-600 dark:text-red-400">
                            {t("chat.sendFailedLabel", "Failed to send")}
                        </span>
                        <div className="ml-auto flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => {
                                    if (message.client_msg_id) retrySend(message.client_msg_id);
                                }}
                                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/40"
                            >
                                <RefreshCw className="h-3 w-3" />
                                {t("chat.retry", "Retry")}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (!message.client_msg_id) return;
                                    qc.setQueryData<ChatMessage[]>(
                                        chatKeys.messages(message.conversation_id),
                                        (old = []) => old.filter((m) => m.client_msg_id !== message.client_msg_id)
                                    );
                                }}
                                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                            >
                                <Trash2 className="h-3 w-3" />
                                {t("chat.delete", "Delete")}
                            </button>
                        </div>
                    </div>
                ) : (
                    !message.pending && (
                        <ReactionBar
                            messageId={message.id}
                            conversationId={message.conversation_id}
                            reactions={message.reactions ?? []}
                        />
                    )
                )}
            </div>
        </motion.div>
    );
}
