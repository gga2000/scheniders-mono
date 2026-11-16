// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { StockStatusBadges } from "./stock-status-badges";

afterEach(cleanup);

const flags = { isDeadStock: false, isSlowMover: false, isOverstocked: true, isUnderstocked: false, isNegativeMargin: false };

function chipText(daysOfSupply: number): string {
    const { container } = render(
        <LanguageProvider>
            <StockStatusBadges flags={flags} dailySalesRate={0} daysSinceLastSale={10} daysOfSupply={daysOfSupply} />
        </LanguageProvider>,
    );
    return container.textContent ?? "";
}

describe("product stock chips", () => {
    it("says only «فائض» when there are no sales to count days of supply from", () => {
        const text = chipText(Number.POSITIVE_INFINITY);
        expect(text).toBe("فائض");
        expect(text).not.toContain("—");
    });

    it("keeps the days when there is a number", () => {
        expect(chipText(120)).toMatch(/^فائض · .*120/);
    });
});
