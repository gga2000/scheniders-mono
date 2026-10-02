// Regression cover for the two complaints the Activity Feed drew: entries that
// shuffled under the reader, and a wall of rows with nothing separating one day
// from the next.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import type { FeedNotification } from "@/hooks/use-notification-feed";

const feedState = {
    notifications: [] as FeedNotification[],
    unreadCount: 0,
    pendingCount: 0,
    refresh: vi.fn(),
    isLoading: false,
    hasMore: false,
    isLoadingMore: false,
    loadMore: vi.fn(),
    markAsRead: vi.fn(),
    dismiss: vi.fn(),
    markAllAsRead: vi.fn(),
    clearAll: vi.fn(),
};

vi.mock("@/hooks/use-notification-feed", () => ({
    useNotificationFeed: () => feedState,
}));

// Radix renders through a portal and measures the viewport; neither matters
// here, and the panel's contents are what's under test.
vi.mock("@scheniders/ui/popover", () => ({
    Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    PopoverTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/use-notification-push", () => ({
    useNotificationPush: () => ({ ready: false, availability: "unsupported", enabled: false, busy: false, toggle: vi.fn() }),
}));
vi.mock("@/hooks/use-notification-settings", () => ({
    useNotificationMute: () => ({ mute: vi.fn() }),
}));
vi.mock("@/hooks/use-title-badge", () => ({ useTitleBadge: () => {} }));
vi.mock("@/store/use-chat-store", () => ({ useChatStore: () => ({ open: vi.fn() }) }));
vi.mock("@/store/use-order-store", () => ({ useOrderStore: () => ({ openOrderDetails: vi.fn() }) }));
vi.mock("@/lib/repositories/order-repository", () => ({ orderRepository: { findById: vi.fn() } }));
vi.mock("@/hooks/use-toast", () => ({ toast: { error: vi.fn(), warning: vi.fn() } }));
vi.mock("./notification-settings-dialog", () => ({ NotificationSettingsDialog: () => null }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => "/orders",
}));
const language = {
    language: "en" as const,
    setLanguage: () => {},
    t: (key: string, fallback?: unknown, vars?: Record<string, string | number>) => {
        const template = typeof fallback === "string" ? fallback : key;
        const values = typeof fallback === "object" && fallback !== null
            ? (fallback as Record<string, string | number>)
            : vars;
        return values
            ? template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? `{${k}}`))
            : template;
    },
};

// `use-status-label` reads the context directly rather than the hook, so the
// context object has to exist on the mock too.
vi.mock("@/components/providers/language-provider", () => ({
    LanguageContext: { Provider: ({ children }: { children: unknown }) => children },
    useLanguage: () => language,
}));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => language }));


import { NotificationsDropdown } from "./notifications-dropdown";

// Anchored to midday so the fixtures land on the day they are meant to
// whatever hour the suite happens to run at.
const middayToday = () => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d.getTime();
};
const hoursAgo = (hours: number) =>
    new Date(middayToday() - hours * 3_600_000).toISOString();

const note = (over: Partial<FeedNotification> & { id: string; created_at: string }): FeedNotification => ({
    type: "order.status_changed",
    category: "orders",
    actor_name: "WhatsApp Bot",
    actor_avatar: "bot",
    entity_type: "order",
    entity_id: "o1",
    entity_label: "#7421",
    payload: {},
    priority: "normal",
    group_key: null,
    is_read: true,
    ...over,
});

beforeEach(() => {
    cleanup();
    feedState.notifications = [];
    feedState.pendingCount = 0;
    feedState.unreadCount = 0;
    feedState.refresh = vi.fn();
});

describe("NotificationsDropdown", () => {
    it("separates the feed into days instead of one undifferentiated run", () => {
        feedState.notifications = [
            note({ id: "a", created_at: hoursAgo(1) }),
            note({ id: "b", created_at: hoursAgo(30) }),
        ];

        render(<NotificationsDropdown />);

        expect(screen.getByText("Today")).toBeDefined();
        expect(screen.getByText("Yesterday")).toBeDefined();
    });

    it("keeps a row's DOM node when a newer entry folds into its group", () => {
        const existing = [
            note({ id: "a", created_at: hoursAgo(1), group_key: "order:1" }),
            note({ id: "b", created_at: hoursAgo(2), group_key: "order:1" }),
        ];
        feedState.notifications = existing;

        const { rerender, container } = render(<NotificationsDropdown />);
        const before = container.querySelector("[data-group-key]");

        feedState.notifications = [
            note({ id: "c", created_at: hoursAgo(0.5), group_key: "order:1" }),
            ...existing,
        ];
        rerender(<NotificationsDropdown />);
        const after = container.querySelector("[data-group-key]");

        // Same element, not a replacement: React kept the row, so nothing jumps.
        expect(after).toBe(before);
        expect(after?.textContent).toContain("+2 more updates");
    });

    it("holds new arrivals behind a pill rather than splicing them into the list", () => {
        feedState.notifications = [note({ id: "a", created_at: hoursAgo(1) })];
        feedState.pendingCount = 7;

        render(<NotificationsDropdown />);
        const pill = screen.getByText("Show 7 new");
        fireEvent.click(pill);

        expect(feedState.refresh).toHaveBeenCalled();
    });

    it("does not reflow the row when the unread check button appears", () => {
        // The complaint: marking everything read visibly re-laid-out the list.
        // An unread row carries an extra ✓ button, and while that button sat in
        // the row's flex flow it stole ~28px from a 384px row — enough to push
        // the actor's name and the timestamp onto lines of their own. The
        // buttons are positioned absolutely now, so the text column is the same
        // width whether or not they are there.
        feedState.notifications = [note({ id: "a", created_at: hoursAgo(1), is_read: false })];
        const unread = render(<NotificationsDropdown />);
        const unreadActions = unread.container.querySelector("[data-group-key] .absolute.top-2");
        const unreadText = unread.container.querySelector("[data-group-key] .flex-1");
        expect(unreadActions).not.toBeNull();
        expect(unreadActions?.querySelector("svg.lucide-check")).not.toBeNull();

        cleanup();
        feedState.notifications = [note({ id: "a", created_at: hoursAgo(1), is_read: true })];
        const read = render(<NotificationsDropdown />);
        const readActions = read.container.querySelector("[data-group-key] .absolute.top-2");
        const readText = read.container.querySelector("[data-group-key] .flex-1");

        // The ✓ is gone, but the buttons never occupied the text column either way.
        expect(readActions?.querySelector("svg.lucide-check")).toBeNull();
        expect(readText?.className).toBe(unreadText?.className);
        expect(unreadText?.contains(unreadActions!)).toBe(false);
        expect(readText?.contains(readActions!)).toBe(false);
    });

    it("shows no pill when nothing is waiting", () => {
        feedState.notifications = [note({ id: "a", created_at: hoursAgo(1) })];

        render(<NotificationsDropdown />);

        expect(screen.queryByText(/Show \d+ new/)).toBeNull();
    });
});
