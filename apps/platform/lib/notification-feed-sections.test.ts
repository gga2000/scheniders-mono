import { describe, expect, it } from "vitest";
import {
    buildFeedSections,
    firstUnreadBoundary,
} from "@/lib/notification-feed-sections";
import type { FeedNotification } from "@/hooks/use-notification-feed";

const NOW = new Date("2026-10-03T12:00:00");

const at = (iso: string): string => new Date(iso).toISOString();

const note = (over: Partial<FeedNotification> & { id: string; created_at: string }): FeedNotification => ({
    type: "order.status_changed",
    category: "orders",
    actor_name: "Automation",
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

describe("buildFeedSections", () => {
    it("splits the feed by local calendar day", () => {
        const sections = buildFeedSections(
            [
                note({ id: "a", created_at: at("2026-10-03T11:00:00") }),
                note({ id: "b", created_at: at("2026-10-03T09:00:00") }),
                note({ id: "c", created_at: at("2026-10-02T23:00:00") }),
                note({ id: "d", created_at: at("2026-09-28T10:00:00") }),
            ],
            NOW,
        );

        expect(sections.map((s) => s.bucket)).toEqual(["today", "yesterday", "earlier"]);
        expect(sections[0].groups.map((g) => g.head.id)).toEqual(["a", "b"]);
        expect(sections[2].key).toBe("2026-09-28");
    });

    it("folds runs that share a group key", () => {
        const sections = buildFeedSections(
            [
                note({ id: "a", created_at: at("2026-10-03T11:00:00"), group_key: "order:1" }),
                note({ id: "b", created_at: at("2026-10-03T10:30:00"), group_key: "order:1" }),
                note({ id: "c", created_at: at("2026-10-03T10:00:00"), group_key: "order:1" }),
            ],
            NOW,
        );

        expect(sections[0].groups).toHaveLength(1);
        expect(sections[0].groups[0].head.id).toBe("a");
        expect(sections[0].groups[0].rest.map((n) => n.id)).toEqual(["b", "c"]);
    });

    it("does not fold across an unrelated entry in between", () => {
        const sections = buildFeedSections(
            [
                note({ id: "a", created_at: at("2026-10-03T11:00:00"), group_key: "order:1" }),
                note({ id: "x", created_at: at("2026-10-03T10:45:00"), group_key: "order:2" }),
                note({ id: "b", created_at: at("2026-10-03T10:30:00"), group_key: "order:1" }),
            ],
            NOW,
        );

        expect(sections[0].groups.map((g) => g.head.id)).toEqual(["a", "x", "b"]);
    });

    it("keeps a group's key stable when a newer entry folds into it", () => {
        const existing = [
            note({ id: "a", created_at: at("2026-10-03T11:00:00"), group_key: "order:1" }),
            note({ id: "b", created_at: at("2026-10-03T10:30:00"), group_key: "order:1" }),
        ];
        const before = buildFeedSections(existing, NOW)[0].groups[0];

        const after = buildFeedSections(
            [note({ id: "new", created_at: at("2026-10-03T11:30:00"), group_key: "order:1" }), ...existing],
            NOW,
        )[0].groups[0];

        // The head changed — the React key must not, or the row remounts and jumps.
        expect(after.head.id).toBe("new");
        expect(after.key).toBe(before.key);
        expect(after.key).toBe("b");
    });

    it("counts unread per day and marks a folded group unread from any member", () => {
        const sections = buildFeedSections(
            [
                note({ id: "a", created_at: at("2026-10-03T11:00:00"), group_key: "order:1" }),
                note({
                    id: "b",
                    created_at: at("2026-10-03T10:30:00"),
                    group_key: "order:1",
                    is_read: false,
                }),
                note({ id: "c", created_at: at("2026-10-02T10:00:00"), is_read: false }),
            ],
            NOW,
        );

        expect(sections[0].groups[0].unread).toBe(true);
        expect(sections[0].unread).toBe(1);
        expect(sections[1].unread).toBe(1);
    });

    it("drops entries with an unparseable timestamp rather than inventing a day", () => {
        const sections = buildFeedSections(
            [
                note({ id: "bad", created_at: "not a date" }),
                note({ id: "good", created_at: at("2026-10-03T11:00:00") }),
            ],
            NOW,
        );

        expect(sections).toHaveLength(1);
        expect(sections[0].groups.map((g) => g.head.id)).toEqual(["good"]);
    });
});

describe("firstUnreadBoundary", () => {
    it("marks the first unread group when something read sits above it", () => {
        const sections = buildFeedSections(
            [
                note({ id: "a", created_at: at("2026-10-03T11:00:00") }),
                note({ id: "b", created_at: at("2026-10-03T10:00:00"), is_read: false }),
            ],
            NOW,
        );

        expect(firstUnreadBoundary(sections)).toBe("b");
    });

    it("stays null when the unread run starts at the top — there is no boundary", () => {
        const sections = buildFeedSections(
            [
                note({ id: "a", created_at: at("2026-10-03T11:00:00"), is_read: false }),
                note({ id: "b", created_at: at("2026-10-03T10:00:00") }),
            ],
            NOW,
        );

        expect(firstUnreadBoundary(sections)).toBeNull();
    });

    it("finds a boundary that falls in a later day section", () => {
        const sections = buildFeedSections(
            [
                note({ id: "a", created_at: at("2026-10-03T11:00:00") }),
                note({ id: "b", created_at: at("2026-10-02T10:00:00"), is_read: false }),
            ],
            NOW,
        );

        expect(firstUnreadBoundary(sections)).toBe("b");
    });

    it("stays null when everything is read", () => {
        const sections = buildFeedSections(
            [note({ id: "a", created_at: at("2026-10-03T11:00:00") })],
            NOW,
        );

        expect(firstUnreadBoundary(sections)).toBeNull();
    });
});
