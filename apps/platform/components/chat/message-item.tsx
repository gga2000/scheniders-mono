// apps/platform/components/chat/message-item.tsx
"use client";
import { Avatar } from "@scheniders/ui";
import { formatDistanceToNow } from "date-fns";
import { ReferenceCard } from "./reference-card";
import { ReactionBar } from "./reaction-bar";
import { supabase } from "@/lib/supabase";
import type { ChatMessage } from "@/types/chat";

export function MessageItem({
    message,
    senderName,
    senderAvatar,
}: {
    message: ChatMessage;
    senderName: string;
    senderAvatar?: string | null;
}) {
    if (message.deleted_at) {
        return <div className="px-4 py-1 text-xs italic text-muted-foreground">message deleted</div>;
    }
    const openAttachment = async (storagePath: string) => {
        const { data } = await supabase.storage.from("chat-attachments").createSignedUrl(storagePath, 60);
        if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    };
    return (
        <div className={`flex gap-2.5 px-4 py-2 ${message.pending ? "opacity-60" : ""}`}>
            <Avatar src={senderAvatar ?? undefined} alt={senderName} size="sm" />
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-semibold">{senderName}</span>
                    <span className="text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                    </span>
                    {message.edited_at && <span className="text-[10px] text-muted-foreground">(edited)</span>}
                </div>
                {message.body && (
                    <div className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed">{message.body}</div>
                )}
                {(message.references ?? []).map((r, i) => (
                    <ReferenceCard key={i} reference={r} />
                ))}
                {(message.attachments ?? []).map((a, i) => (
                    <button
                        key={i}
                        type="button"
                        onClick={() => openAttachment(a.storage_path)}
                        className="mt-2 inline-block rounded-lg border px-3 py-2 text-xs"
                    >
                        📎 {a.file_name}
                    </button>
                ))}
                {!message.pending && (
                    <ReactionBar
                        messageId={message.id}
                        conversationId={message.conversation_id}
                        reactions={message.reactions ?? []}
                    />
                )}
            </div>
        </div>
    );
}
