// apps/platform/lib/chat/avatar-identity.test.ts
import { describe, it, expect } from "vitest";
import { initials, colorFromId, AVATAR_PALETTE } from "./avatar-identity";

describe("initials", () => {
    it("uses first + last token", () => {
        expect(initials("Mohammed Ali")).toBe("MA");
    });
    it("handles a single token (up to 2 chars)", () => {
        expect(initials("noor")).toBe("NO");
    });
    it("handles Arabic names", () => {
        expect(initials("نور محمد")).toBe("نم");
    });
    it("falls back to ? for empty/whitespace", () => {
        expect(initials("   ")).toBe("?");
        expect(initials("")).toBe("?");
    });
    it("collapses extra whitespace", () => {
        expect(initials("  Ali   Hassan  ")).toBe("AH");
    });
});

describe("colorFromId", () => {
    it("is deterministic for the same id", () => {
        expect(colorFromId("user-123")).toEqual(colorFromId("user-123"));
    });
    it("returns a palette entry (pastel bg + ink fg)", () => {
        const c = colorFromId("user-123");
        expect(AVATAR_PALETTE).toContainEqual(c);
        expect(c.fg).toBe("var(--ink)");
    });
    it("spreads ids across more than one bucket", () => {
        const ids = Array.from({ length: 50 }, (_, i) => `id-${i}`);
        const buckets = new Set(ids.map((id) => colorFromId(id).bg));
        expect(buckets.size).toBeGreaterThan(1);
    });
});
