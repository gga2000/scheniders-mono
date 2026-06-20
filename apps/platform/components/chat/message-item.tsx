// apps/platform/components/chat/message-item.tsx
"use client";
import { Avatar } from "@scheniders/ui";
import { formatDistanceToNow } from "date-fns";
import { ReferenceCard } from "./reference-card";
import { ReactionBar } from "./reaction-bar";
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
                    <a key={i} href="#" className="mt-2 inline-block rounded-lg border px-3 py-2 text-xs">
                        📎 {a.file_name}
                    </a>
                ))}
                {!message.pending && <ReactionBar messageId={message.id} reactions={message.reactions ?? []} />}
            </div>
        </div>
    );
}
