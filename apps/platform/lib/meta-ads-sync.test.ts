import { describe, expect, it } from "vitest";
import { isoDay } from "./meta-ads-sync";

describe("isoDay", () => {
    it("names the day in Baghdad time, not UTC", () => {
        // 23:35 UTC on 5 Nov is 02:35 on 6 Nov in Baghdad.
        expect(isoDay(new Date("2026-11-05T23:35:00Z"))).toBe("2026-11-06");
    });

    it("keeps the same day before Baghdad midnight", () => {
        expect(isoDay(new Date("2026-11-05T20:59:00Z"))).toBe("2026-11-05");
    });
});
