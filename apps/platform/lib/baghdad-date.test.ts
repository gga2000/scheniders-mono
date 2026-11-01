import { describe, it, expect } from "vitest";
import { formatBaghdadDate } from "./baghdad-date";

describe("formatBaghdadDate", () => {
    it("uses the Baghdad day, not the UTC one", () => {
        // 22:30Z on the 30th is 01:30 on the 31st in Baghdad (UTC+3).
        expect(formatBaghdadDate("2026-10-30T22:30:00Z")).toBe("31/10/2026");
    });
});
