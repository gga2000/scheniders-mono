// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { StockIndicator } from "./stock-indicator";

afterEach(cleanup);

describe("product stock chip", () => {
    it("shows the count alone, never «53/10» that reads as 53 out of 10", () => {
        const { container } = render(
            <LanguageProvider>
                <StockIndicator status="in_stock" quantity={53} threshold={10} size="sm" />
            </LanguageProvider>,
        );
        const text = container.textContent ?? "";
        expect(text).toContain("(53)");
        expect(text).not.toContain("/");
    });

    it("names an oversell with the count Orders shows, not «نفد المخزون (0)»", () => {
        const { container } = render(
            <LanguageProvider>
                <StockIndicator status="out_of_stock" quantity={-55} threshold={10} size="sm" />
            </LanguageProvider>,
        );
        const text = container.textContent ?? "";
        expect(text).toBe("مباع بالزيادة (−55)");
    });
});
