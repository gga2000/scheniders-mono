import { describe, expect, it } from "vitest";
import { daysWaiting, isOverdue } from "./intake";

const now = new Date("2026-10-29T12:00:00Z");

describe("receive-back intake", () => {
    it("counts whole days waited", () => {
        expect(daysWaiting("2026-10-19T12:00:00Z", now)).toBe(10);
        expect(daysWaiting("2026-10-19T12:00:01Z", now)).toBe(9);
    });

    it("is overdue only after the limit has passed", () => {
        expect(isOverdue("2026-10-19T12:00:00Z", now, 10)).toBe(false);
        expect(isOverdue("2026-10-18T11:00:00Z", now, 10)).toBe(true);
    });

    it("never goes negative for a clock ahead of the server", () => {
        expect(daysWaiting("2026-10-30T00:00:00Z", now)).toBe(0);
    });
});
