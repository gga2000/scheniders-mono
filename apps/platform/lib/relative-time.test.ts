import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "./relative-time";

const NOW = new Date("2026-11-07T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const DAY = 86_400_000;

describe("formatRelativeTime", () => {
    it("uses the Arabic plural for 3-10 days", () => {
        expect(formatRelativeTime(ago(5 * DAY), NOW, "ar")).toBe("قبل 5 أيام");
    });
    it("words English past and future", () => {
        expect(formatRelativeTime(ago(2 * 3_600_000), NOW, "en")).toBe("2 hours ago");
        expect(formatRelativeTime(new Date(NOW.getTime() + DAY), NOW, "en")).toBe("tomorrow");
    });
});
