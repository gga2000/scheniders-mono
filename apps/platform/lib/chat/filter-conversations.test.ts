// apps/platform/lib/chat/filter-conversations.test.ts
import { describe, it, expect } from "vitest";
import { filterConversations, type ConvFilter } from "./filter-conversations";

const mk = (over: Partial<{ id: string; kind: string; unread: number; archived_at: string | null }>) => ({
    id: over.id ?? "c", kind: over.kind ?? "channel", unread: over.unread ?? 0, archived_at: over.archived_at ?? null,
} as Parameters<typeof filterConversations>[0][number]);

describe("filterConversations", () => {
    const list = [
        mk({ id: "ch", kind: "channel", unread: 0 }),
        mk({ id: "dm", kind: "dm", unread: 3 }),
        mk({ id: "or", kind: "order", unread: 0 }),
    ];
    const run = (f: ConvFilter, mention = new Set<string>()) => filterConversations(list, f, mention).map((c) => c.id);

    it("all → everything (non-archived)", () => expect(run("all")).toEqual(["ch", "dm", "or"]));
    it("unread → only unread>0", () => expect(run("unread")).toEqual(["dm"]));
    it("channels / direct / orders by kind", () => {
        expect(run("channels")).toEqual(["ch"]);
        expect(run("direct")).toEqual(["dm"]);
        expect(run("orders")).toEqual(["or"]);
    });
    it("mentions → only conversations in the mention set", () => expect(run("mentions", new Set(["or"]))).toEqual(["or"]));
});
