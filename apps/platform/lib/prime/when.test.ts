import { describe, expect, it } from "vitest";
import { primeWhen } from "./when";

const t = (key: string, vars?: Record<string, string | number>) =>
    key === "orders.prime.when.yesterday" ? `أمس ${vars?.time}` : key === "orders.prime.when.today" ? `اليوم ${vars?.time}` : key;

describe("primeWhen", () => {
    // 2026-11-16 01:00 in Baghdad.
    const now = Date.parse("2026-11-15T22:00:00Z");

    it("writes the time with ص/م on an Arabic screen", () => {
        expect(primeWhen("2026-11-15T12:00:00Z", t, "ar", now)).toBe("أمس 03:00 م");
        expect(primeWhen("2026-11-13T17:24:00Z", t, "ar", now)).toBe("13 تشرين الثاني · 08:24 م");
    });

    it("names the month on an older day, with the year only when it is not this year", () => {
        expect(primeWhen("2025-12-30T09:00:00Z", t, "ar", now)).toBe("30 كانون الأول 2025 · 12:00 م");
    });

    it("keeps am/pm on an English screen", () => {
        expect(primeWhen("2026-11-13T17:24:00Z", t, "en", now)).toBe("Nov 13 · 08:24pm");
    });
});
