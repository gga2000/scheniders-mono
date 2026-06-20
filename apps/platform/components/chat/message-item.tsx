// apps/platform/components/chat/message-item.tsx
"use client";
import { motion } from "framer-motion";
import { Avatar } from "@scheniders/ui";
import { formatDistanceToNow } from "date-fns";
import { FileText, Paperclip } from "lucide-react";
import { ReferenceCard } from "./reference-card";
import { ReactionBar } from "./reaction-bar";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/components/providers/language-provider";
import type { ChatMessage } from "@/types/chat";

/** Image attachments use the paperclip glyph; other files a document glyph. */
function isImage(mime: string | null | undefined): boolean {
    return !!mime && mime.startsWith("image/");
}

export function MessageItem({
    message,
    senderName,
    senderAvatar,
}: {
    message: ChatMessage;
    senderName: string;
    senderAvatar?: string | null;
}) {
    const { t } = useLanguage();

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
    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className={`group relative flex gap-2.5 px-4 py-1.5 transition-colors hover:bg-black/[0.025] ${
                message.pending ? "opacity-60" : ""
            }`}
        >
            <Avatar src={senderAvatar ?? undefined} alt={senderName} size="sm" />
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
                {message.body && (
                    <div className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-foreground/90">
                        {message.body}
                    </div>
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
                                className="inline-flex max-w-[220px] items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2 text-xs text-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
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
                {!message.pending && (
                    <ReactionBar
                        messageId={message.id}
                        conversationId={message.conversation_id}
                        reactions={message.reactions ?? []}
                    />
                )}
            </div>
        </motion.div>
    );
}
