// apps/platform/types/chat.ts
export type ConversationKind = "channel" | "dm" | "group" | "order";

export interface ChatConversation {
    id: string;
    tenant_id: string;
    kind: ConversationKind;
    name: string | null;
    topic: string | null;
    order_id: string | null;
    is_private: boolean;
    created_by: string | null;
    last_message_at: string | null;
    archived_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface ChatMember {
    id: string;
    conversation_id: string;
    user_id: string;
    role: "owner" | "member";
    last_read_at: string;
    muted: boolean;
    joined_at: string;
}

export type ChatRefType = "order" | "customer" | "product";

export interface ChatReference {
    id?: string;
    ref_type: ChatRefType;
    ref_id: string;
    snapshot: Record<string, unknown>;
}

export interface ChatReaction { id: string; message_id: string; user_id: string; emoji: string; }
export interface ChatAttachment {
    id?: string; message_id?: string; storage_path: string; file_name: string;
    mime?: string | null; size_bytes?: number | null; width?: number | null; height?: number | null;
}

export interface ChatMessage {
    id: string;
    conversation_id: string;
    tenant_id: string;
    sender_id: string;
    body: string;
    reply_to_id: string | null;
    client_msg_id: string | null;
    edited_at: string | null;
    deleted_at: string | null;
    created_at: string;
    // hydrated client-side:
    references?: ChatReference[];
    reactions?: ChatReaction[];
    attachments?: ChatAttachment[];
    pending?: boolean;       // optimistic, not yet acked
}

export interface ChatMentionNotification {
    id: string;
    actor_name: string;
    actor_avatar: string | null;
    conversation_id: string | null;
    message_id: string | null;
    preview: string;
    is_read: boolean;
    created_at: string;
}

export interface ChatSearchResult {
    message_id: string;
    conversation_id: string;
    conversation_name: string | null;
    conversation_kind: string;
    sender_id: string;
    body: string;
    snippet: string;
    created_at: string;
}
