/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { PageSettings } from "./pages-settings";

afterEach(cleanup);

function cells(route: string) {
    const row = screen.getByTestId(`page-row-${route}`);
    return within(row).getAllByRole("cell").slice(1).map((c) => c.textContent);
}

describe("PageSettings", () => {
    it("shows the real rule: orders open to every role", () => {
        render(<LanguageProvider><PageSettings /></LanguageProvider>);
        expect(cells("/orders")).toEqual(["يفتحها", "يفتحها", "يفتحها"]);
    });

    it("finances: admin only, plus anyone given the financial permission", () => {
        render(<LanguageProvider><PageSettings /></LanguageProvider>);
        expect(cells("/finances")).toEqual(["يفتحها", "مغلقة", "مغلقة"]);
        expect(screen.getByTestId("page-row-/finances").textContent).toContain("عرض البيانات المالية");
    });

    it("printing: staff yes, viewer no", () => {
        render(<LanguageProvider><PageSettings /></LanguageProvider>);
        expect(cells("/printing")).toEqual(["يفتحها", "يفتحها", "مغلقة"]);
    });
});
