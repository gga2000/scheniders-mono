/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { EmptyState } from "./empty-states";

afterEach(cleanup);

const inArabic = (ui: React.ReactElement) => {
    localStorage.setItem("schneiders_language", "ar");
    return render(<LanguageProvider>{ui}</LanguageProvider>);
};

describe("orders empty state", () => {
    it("says the period is empty, not that filters matched nothing, when only a date window applies", () => {
        // Today is the default window: an empty Today used to say «الفلاتر مفعّلة».
        const { container } = inArabic(<EmptyState type="all" periodOnly />);
        expect(container.textContent).toContain("ماكو طلبات بهاي الفترة");
        expect(container.textContent).not.toContain("الفلاتر مفعّلة");
        expect(container.textContent).not.toContain("ماكو طلبات مطابقة");
    });

    it("still names the filters when a real filter (city, product, priority) is on", () => {
        const { container } = inArabic(<EmptyState type="all" hasFilters periodOnly={false} />);
        expect(container.textContent).toContain("ماكو طلبات مطابقة");
        expect(container.textContent).toContain("الفلاتر مفعّلة");
    });
});
