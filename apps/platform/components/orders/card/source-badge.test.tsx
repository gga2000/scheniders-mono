/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { SourceBadge } from "./source-badge";

afterEach(cleanup);

const show = (source: string) =>
    render(<LanguageProvider><SourceBadge source={source as never} /></LanguageProvider>);

describe("SourceBadge", () => {
    it("labels Prime orders", () => {
        show("prime");
        expect(screen.getByText("Prime")).toBeTruthy();
    });

    it("labels Excel-imported orders", () => {
        const { container } = show("excel_import");
        expect(container.textContent).toMatch(/Excel|إكسل/);
    });

    it("shows nothing for an order with no source", () => {
        const { container } = render(<LanguageProvider><SourceBadge source={undefined} /></LanguageProvider>);
        expect(container.textContent).toBe("");
    });
});
