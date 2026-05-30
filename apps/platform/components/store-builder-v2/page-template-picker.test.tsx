/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { PageTemplatePicker } from "./page-template-picker";
import { PAGE_TEMPLATES } from "@/lib/page-templates";
import type { SectionInstance } from "@scheniders/shared";

afterEach(() => {
    cleanup();
});

describe("PageTemplatePicker", () => {
    it("renders nothing when closed", () => {
        render(
            <PageTemplatePicker
                open={false}
                onClose={() => {}}
                currentSectionCount={0}
                onApply={() => {}}
            />,
        );
        expect(screen.queryByTestId("page-template-picker")).toBeNull();
    });

    it("lists all 5 templates with name + description + section count", () => {
        render(
            <PageTemplatePicker
                open
                onClose={() => {}}
                currentSectionCount={0}
                onApply={() => {}}
            />,
        );
        expect(screen.getByTestId("page-template-picker")).toBeTruthy();
        for (const t of PAGE_TEMPLATES) {
            expect(
                screen.getByTestId(`page-template-picker-card-${t.id}`),
            ).toBeTruthy();
            expect(
                screen.getByTestId(`page-template-picker-card-${t.id}-count`)
                    .textContent,
            ).toBe(String(t.sections.length));
        }
    });

    it("clicking a card opens a confirm step and shows the replace warning when not empty", () => {
        render(
            <PageTemplatePicker
                open
                onClose={() => {}}
                currentSectionCount={3}
                onApply={() => {}}
            />,
        );
        fireEvent.click(
            screen.getByTestId(`page-template-picker-card-${PAGE_TEMPLATES[0].id}`),
        );
        expect(screen.getByTestId("page-template-picker-confirm")).toBeTruthy();
        const warning = screen.getByTestId("page-template-picker-warning");
        expect(warning.textContent).toContain("3");
    });

    it("does NOT show the replace warning when the page is empty", () => {
        render(
            <PageTemplatePicker
                open
                onClose={() => {}}
                currentSectionCount={0}
                onApply={() => {}}
            />,
        );
        fireEvent.click(
            screen.getByTestId(`page-template-picker-card-${PAGE_TEMPLATES[1].id}`),
        );
        expect(screen.queryByTestId("page-template-picker-warning")).toBeNull();
    });

    it("confirming applies the template — onApply receives sections with fresh ids", () => {
        const onApply = vi.fn();
        const onClose = vi.fn();
        const t = PAGE_TEMPLATES[0];
        render(
            <PageTemplatePicker
                open
                onClose={onClose}
                currentSectionCount={2}
                onApply={onApply}
            />,
        );
        fireEvent.click(
            screen.getByTestId(`page-template-picker-card-${t.id}`),
        );
        fireEvent.click(screen.getByTestId("page-template-picker-apply"));
        expect(onApply).toHaveBeenCalledTimes(1);
        const sections = onApply.mock.calls[0][0] as SectionInstance[];
        expect(sections).toHaveLength(t.sections.length);
        for (const s of sections) {
            expect(s.id.startsWith("__template-")).toBe(false);
            expect(typeof s.id).toBe("string");
            expect(s.id.length).toBeGreaterThan(0);
        }
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("cancel returns to the picker list (no apply)", () => {
        const onApply = vi.fn();
        render(
            <PageTemplatePicker
                open
                onClose={() => {}}
                currentSectionCount={5}
                onApply={onApply}
            />,
        );
        fireEvent.click(
            screen.getByTestId(`page-template-picker-card-${PAGE_TEMPLATES[2].id}`),
        );
        expect(screen.getByTestId("page-template-picker-confirm")).toBeTruthy();
        fireEvent.click(screen.getByTestId("page-template-picker-cancel"));
        expect(screen.queryByTestId("page-template-picker-confirm")).toBeNull();
        expect(screen.getByTestId("page-template-picker-list")).toBeTruthy();
        expect(onApply).not.toHaveBeenCalled();
    });
});
