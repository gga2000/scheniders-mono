// apps/platform/lib/chat/unread.ts
// Pure helper: where does the "New messages" divider go? The first message from
// someone else whose created_at is strictly after the reader's frozen last_read_at.
// Messages are expected ascending by created_at. ISO timestamptz strings compare
// lexically in chronological order.

interface UnreadMsg {
    id: string;
    created_at: string;
    sender_id: string | null;
}

export function firstUnreadMessageId(
    messages: UnreadMsg[],
    lastReadAt: string | null,
    myUserId: string
): string | null {
    if (!lastReadAt) return null;
    for (const m of messages) {
        // Skip system rows (null sender_id) — they never count as unread
        if (!m.sender_id) continue;
        if (m.sender_id === myUserId) continue;
        if (m.created_at > lastReadAt) return m.id;
    }
    return null;
}
