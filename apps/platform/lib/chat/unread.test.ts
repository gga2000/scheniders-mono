// apps/platform/lib/chat/unread.test.ts
import { describe, it, expect } from "vitest";
import { firstUnreadMessageId } from "./unread";

const me = "me";
const msgs = [
    { id: "a", created_at: "2026-06-21T10:00:00Z", sender_id: "other" },
    { id: "b", created_at: "2026-06-21T10:05:00Z", sender_id: "me" },
    { id: "c", created_at: "2026-06-21T10:10:00Z", sender_id: "other" },
    { id: "d", created_at: "2026-06-21T10:15:00Z", sender_id: "other" },
];

describe("firstUnreadMessageId", () => {
    it("returns the first message from others after lastReadAt", () => {
        expect(firstUnreadMessageId(msgs, "2026-06-21T10:06:00Z", me)).toBe("c");
    });
    it("skips my own messages when finding the boundary", () => {
        // lastRead just before b (mine) and c (other) → boundary is c, not b
        expect(firstUnreadMessageId(msgs, "2026-06-21T10:04:00Z", me)).toBe("c");
    });
    it("returns null when everything is read", () => {
        expect(firstUnreadMessageId(msgs, "2026-06-21T11:00:00Z", me)).toBeNull();
    });
    it("returns the earliest unread when all are unread", () => {
        expect(firstUnreadMessageId(msgs, "2026-06-21T09:00:00Z", me)).toBe("a");
    });
    it("returns null when lastReadAt is null", () => {
        expect(firstUnreadMessageId(msgs, null, me)).toBeNull();
    });
});
