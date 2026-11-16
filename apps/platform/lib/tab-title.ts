// apps/platform/lib/tab-title.ts
//
// One owner for the browser tab title: "(unread) Page · شنايدر".
//
// Three parts come from three places: the page name from the shell, the
// notification count from the bell, the chat count from the chat runtime.
// Each used to write document.title on its own, so every tab read
// "(99+) شنايدر" and a merchant with orders, finances and reports open could
// not tell the tabs apart. Each part is now kept here and the title is rebuilt
// from all three, so no writer erases another's part.

export const BRAND = "شنايدر";

export type TabTitleParts = { page: string; notifications: number; chat: number };

const parts: TabTitleParts = { page: "", notifications: 0, chat: 0 };

export function composeTabTitle({ page, notifications, chat }: TabTitleParts): string {
    const unread = Math.max(0, notifications) + Math.max(0, chat);
    const badge = unread > 0 ? `(${unread > 99 ? "99+" : unread}) ` : "";
    return `${badge}${page ? `${page} · ` : ""}${BRAND}`;
}

export function setTabTitlePart<K extends keyof TabTitleParts>(key: K, value: TabTitleParts[K]): void {
    parts[key] = value;
    if (typeof document !== "undefined") document.title = composeTabTitle(parts);
}
