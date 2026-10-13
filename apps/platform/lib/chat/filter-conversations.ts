// apps/platform/lib/chat/filter-conversations.ts
export type ConvFilter =
    | "all"
    | "unread"
    | "mentions"
    | "channels"
    | "direct"
    | "orders"
    | "resolved"
    | "archived";

interface FilterableConv {
    id: string;
    kind: string;
    unread: number;
    archived_at: string | null;
    resolved_at?: string | null;
}

/**
 * Pure list filter for the conversation-list chips. "archived" is handled by a
 * separate query upstream, so here it behaves like "all" over whatever list it's given.
 *
 * Resolved order threads are the working-set rule: at a few thousand order
 * threads a year the sidebar is only readable if finished work leaves it by
 * default, so "all" and "orders" hide them and the "resolved" chip is how you
 * look back. Two deliberate exceptions:
 *
 *   * "unread" always shows them — resolved is not the same as read, and an
 *     unread message must never be filtered out of the one view meant to find it.
 *   * "mentions" always shows them — someone asked for you by name.
 */
export function filterConversations<T extends FilterableConv>(
    list: T[],
    filter: ConvFilter,
    mentionConvIds: Set<string>,
): T[] {
    const isResolved = (c: T) => !!c.resolved_at;

    switch (filter) {
        case "unread":
            return list.filter((c) => c.unread > 0);
        case "mentions":
            return list.filter((c) => mentionConvIds.has(c.id));
        case "channels":
            return list.filter((c) => c.kind === "channel");
        case "direct":
            return list.filter((c) => c.kind === "dm" || c.kind === "group");
        case "orders":
            return list.filter((c) => c.kind === "order" && !isResolved(c));
        case "resolved":
            return list.filter(isResolved);
        case "all":
        case "archived":
        default:
            return list.filter((c) => !isResolved(c));
    }
}
