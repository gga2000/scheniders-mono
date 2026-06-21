// apps/platform/lib/chat/filter-conversations.ts
export type ConvFilter = "all" | "unread" | "mentions" | "channels" | "direct" | "orders" | "archived";

interface FilterableConv { id: string; kind: string; unread: number; archived_at: string | null }

/** Pure list filter for the conversation-list chips. "archived" is handled by a
 *  separate query upstream, so here it behaves like "all" over whatever list it's given. */
export function filterConversations<T extends FilterableConv>(
    list: T[], filter: ConvFilter, mentionConvIds: Set<string>
): T[] {
    switch (filter) {
        case "unread":   return list.filter((c) => c.unread > 0);
        case "mentions": return list.filter((c) => mentionConvIds.has(c.id));
        case "channels": return list.filter((c) => c.kind === "channel");
        case "direct":   return list.filter((c) => c.kind === "dm" || c.kind === "group");
        case "orders":   return list.filter((c) => c.kind === "order");
        case "all":
        case "archived":
        default:         return list;
    }
}
