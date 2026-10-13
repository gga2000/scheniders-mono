// apps/platform/lib/chat/filter-conversations.test.ts
import { describe, it, expect } from "vitest";
import { filterConversations, type ConvFilter } from "./filter-conversations";

type Conv = Parameters<typeof filterConversations>[0][number];

const mk = (
    over: Partial<{ id: string; kind: string; unread: number; archived_at: string | null; resolved_at: string | null }>,
) =>
    ({
        id: over.id ?? "c",
        kind: over.kind ?? "channel",
        unread: over.unread ?? 0,
        archived_at: over.archived_at ?? null,
        resolved_at: over.resolved_at ?? null,
    }) as Conv;

describe("filterConversations", () => {
    const list = [
        mk({ id: "ch", kind: "channel", unread: 0 }),
        mk({ id: "dm", kind: "dm", unread: 3 }),
        mk({ id: "or", kind: "order", unread: 0 }),
    ];
    const run = (f: ConvFilter, mention = new Set<string>()) =>
        filterConversations(list, f, mention).map((c) => c.id);

    it("all → everything (non-archived)", () => expect(run("all")).toEqual(["ch", "dm", "or"]));
    it("unread → only unread>0", () => expect(run("unread")).toEqual(["dm"]));
    it("channels / direct / orders by kind", () => {
        expect(run("channels")).toEqual(["ch"]);
        expect(run("direct")).toEqual(["dm"]);
        expect(run("orders")).toEqual(["or"]);
    });
    it("mentions → only conversations in the mention set", () =>
        expect(run("mentions", new Set(["or"]))).toEqual(["or"]));
});

describe("filterConversations — resolved order threads", () => {
    const resolved = mk({ id: "done", kind: "order", unread: 0, resolved_at: "2026-09-11T10:00:00Z" });
    const open = mk({ id: "open", kind: "order", unread: 0 });
    const resolvedUnread = mk({ id: "unread", kind: "order", unread: 2, resolved_at: "2026-09-11T10:00:00Z" });
    const list = [open, resolved, resolvedUnread];
    const run = (f: ConvFilter, mention = new Set<string>()) =>
        filterConversations(list, f, mention).map((c) => c.id);

    it("keeps finished work out of the default list", () => expect(run("all")).toEqual(["open"]));
    it("keeps finished work out of the orders list", () => expect(run("orders")).toEqual(["open"]));
    it("resolved chip shows only finished threads", () =>
        expect(run("resolved")).toEqual(["done", "unread"]));

    it("never hides an unread thread, resolved or not", () => {
        // Resolved is not the same as read. Filtering a resolved-but-unread thread
        // out of the Unread view would bury the one message someone still owes a reply.
        expect(run("unread")).toEqual(["unread"]);
    });

    it("never hides a thread that mentioned you", () =>
        expect(run("mentions", new Set(["done"]))).toEqual(["done"]));
});
