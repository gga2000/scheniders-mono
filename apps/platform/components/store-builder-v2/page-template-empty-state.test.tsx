/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { PageTemplateEmptyState } from "./page-template-empty-state";
import { PAGE_TEMPLATES } from "@/lib/page-templates";

afterEach(() => cleanup());

describe("PageTemplateEmptyState", () => {
    it("renders one bento card per registered page template", () => {
        render(
            <PageTemplateEmptyState
                currentSectionCount={0}
                onApply={() => {}}
                onStartBlank={() => {}}
            />,
        );
        expect(screen.getByTestId("page-template-empty-state")).toBeTruthy();
        for (const tpl of PAGE_TEMPLATES) {
            expect(
                screen.getByTestId(`page-template-empty-state-card-${tpl.id}`),
            ).toBeTruthy();
            // Each card has a synthesized thumbnail since no template
            // ships a `thumbnail` field today.
            expect(
                screen.getByTestId(`page-template-empty-state-card-${tpl.id}-thumb`),
            ).toBeTruthy();
        }
        // 5 curated templates ship.
        expect(PAGE_TEMPLATES.length).toBe(5);
    });

    it("opens a confirm overlay when a card is picked, then applies on confirm", () => {
        const onApply = vi.fn();
        render(
            <PageTemplateEmptyState
                currentSectionCount={0}
                onApply={onApply}
                onStartBlank={() => {}}
            />,
        );
        // Pick the sale-page card.
        fireEvent.click(screen.getByTestId("page-template-empty-state-card-sale_page"));
        // Confirm overlay opens.
        expect(screen.getByTestId("page-template-empty-state-confirm")).toBeTruthy();
        // Confirm.
        fireEvent.click(screen.getByTestId("page-template-empty-state-confirm-apply"));
        expect(onApply).toHaveBeenCalledTimes(1);
        const sections = onApply.mock.calls[0][0] as Array<{
            id: string;
            type: string;
        }>;
        expect(Array.isArray(sections)).toBe(true);
        expect(sections.length).toBeGreaterThan(0);
        // Every applied section gets a fresh non-placeholder id.
        for (const s of sections) {
            expect(s.id).not.toMatch(/^__template-/);
        }
    });

    it("shows the replace warning when the page is defensively non-empty", () => {
        render(
            <PageTemplateEmptyState
                currentSectionCount={3}
                onApply={() => {}}
                onStartBlank={() => {}}
            />,
        );
        fireEvent.click(screen.getByTestId("page-template-empty-state-card-sale_page"));
        expect(
            screen.getByTestId("page-template-empty-state-confirm-warning"),
        ).toBeTruthy();
    });

    it("fires onStartBlank when the merchant clicks 'Or start blank ↓'", () => {
        const onStartBlank = vi.fn();
        render(
            <PageTemplateEmptyState
                currentSectionCount={0}
                onApply={() => {}}
                onStartBlank={onStartBlank}
            />,
        );
        fireEvent.click(
            screen.getByTestId("page-template-empty-state-start-blank"),
        );
        expect(onStartBlank).toHaveBeenCalledTimes(1);
    });
});
