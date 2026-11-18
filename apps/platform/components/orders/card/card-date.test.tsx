import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { CardDate } from "./card-date";

// The card leaves the year out inside the current year, so pin "now" to 2026.
beforeEach(() => vi.setSystemTime(new Date("2026-11-19T00:00:00Z")));
afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

function renderIn(language: "ar" | "en", iso: string) {
    localStorage.setItem("schneiders_language", language);
    return render(<LanguageProvider><CardDate iso={iso} language={language} /></LanguageProvider>);
}

describe("CardDate", () => {
    it("names the month in Arabic, day first, on one line: never «18/11»", () => {
        // 05:35 PM Baghdad on 18 Nov 2026.
        const { container } = renderIn("ar", "2026-11-18T14:35:00Z");
        const stamp = container.querySelector("[data-card-date]");
        expect(stamp?.textContent).toBe("18 تشرين الثاني");
        expect(stamp?.textContent).not.toMatch(/\d+\/\d+/);
        expect(stamp?.className).toContain("whitespace-nowrap");
        expect(stamp?.querySelector("bdi")?.getAttribute("dir")).toBe("rtl");
    });

    it("counts the Baghdad day, not the browser's: 22:30 UTC on 18 Nov is 19 Nov", () => {
        const { container } = renderIn("ar", "2026-11-18T22:30:00Z");
        expect(container.querySelector("[data-card-date]")?.textContent).toBe("19 تشرين الثاني");
    });

    it("writes «Nov 18» in English", () => {
        const { container } = renderIn("en", "2026-11-18T14:35:00Z");
        expect(container.querySelector("[data-card-date]")?.textContent).toBe("Nov 18");
    });
});
