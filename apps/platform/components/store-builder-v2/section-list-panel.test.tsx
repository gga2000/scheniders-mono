/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { SectionInstance } from "@scheniders/shared";
import { SectionListPanel } from "./section-list-panel";

afterEach(() => {
    cleanup();
});

/* ─────────────────────────────────────────────────────────────────── */
/* Fixtures                                                              */
/* ─────────────────────────────────────────────────────────────────── */

function makeSection(
    overrides: Partial<SectionInstance> & { id: string; type: string },
): SectionInstance {
    return {
        id: overrides.id,
        type: overrides.type,
        enabled: overrides.enabled ?? true,
        base: overrides.base ?? {},
        label: overrides.label,
        variants: overrides.variants,
    };
}

const THREE_SECTIONS: SectionInstance[] = [
    makeSection({ id: "sec-1", type: "hero_image" }),
    makeSection({ id: "sec-2", type: "trust_strip" }),
    makeSection({ id: "sec-3", type: "product_grid" }),
];

/* ─────────────────────────────────────────────────────────────────── */
/* Tests                                                                */
/* ─────────────────────────────────────────────────────────────────── */

describe("SectionListPanel", () => {
    it("shows the empty state when there are 0 sections", () => {
        const onAdd = vi.fn();
        render(
            <SectionListPanel
                pageId="home"
                pageLabel="Home"
                sections={[]}
                onChange={() => {}}
                onAdd={onAdd}
            />,
        );
        expect(screen.getByTestId("section-list-empty")).toBeTruthy();
        expect(screen.getByTestId("section-list-count").textContent).toContain("0");
        fireEvent.click(screen.getByTestId("section-list-empty-add"));
        expect(onAdd).toHaveBeenCalledTimes(1);
    });

    it("renders one row per section, with manifest-derived names", () => {
        render(
            <SectionListPanel
                pageId="home"
                pageLabel="Home"
                sections={THREE_SECTIONS}
                onChange={() => {}}
                onAdd={() => {}}
            />,
        );
        expect(screen.getByTestId("section-row-sec-1")).toBeTruthy();
        expect(screen.getByTestId("section-row-sec-2")).toBeTruthy();
        expect(screen.getByTestId("section-row-sec-3")).toBeTruthy();
        expect(screen.getByText("Image hero")).toBeTruthy();
        expect(screen.getByText("Trust strip")).toBeTruthy();
        expect(screen.getByText("Product grid")).toBeTruthy();
        expect(screen.getByTestId("section-list-count").textContent).toContain("3");
    });

    it("toggles a section's `enabled` flag when the eye icon is clicked", () => {
        const onChange = vi.fn();
        render(
            <SectionListPanel
                pageId="home"
                pageLabel="Home"
                sections={THREE_SECTIONS}
                onChange={onChange}
                onAdd={() => {}}
            />,
        );
        fireEvent.click(screen.getByTestId("section-row-sec-2-toggle"));
        expect(onChange).toHaveBeenCalledTimes(1);
        const next = onChange.mock.calls[0][0] as SectionInstance[];
        expect(next.find((s) => s.id === "sec-2")?.enabled).toBe(false);
        // Other rows untouched.
        expect(next.find((s) => s.id === "sec-1")?.enabled).toBe(true);
    });

    it("deletes a section after confirmation", () => {
        const onChange = vi.fn();
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

        render(
            <SectionListPanel
                pageId="home"
                pageLabel="Home"
                sections={THREE_SECTIONS}
                onChange={onChange}
                onAdd={() => {}}
            />,
        );
        fireEvent.click(screen.getByTestId("section-row-sec-2-menu-trigger"));
        fireEvent.click(screen.getByTestId("section-row-sec-2-delete"));

        expect(confirmSpy).toHaveBeenCalled();
        expect(onChange).toHaveBeenCalledTimes(1);
        const next = onChange.mock.calls[0][0] as SectionInstance[];
        expect(next.map((s) => s.id)).toEqual(["sec-1", "sec-3"]);

        confirmSpy.mockRestore();
    });

    it("does NOT delete when the confirmation is declined", () => {
        const onChange = vi.fn();
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
        render(
            <SectionListPanel
                pageId="home"
                pageLabel="Home"
                sections={THREE_SECTIONS}
                onChange={onChange}
                onAdd={() => {}}
            />,
        );
        fireEvent.click(screen.getByTestId("section-row-sec-2-menu-trigger"));
        fireEvent.click(screen.getByTestId("section-row-sec-2-delete"));
        expect(onChange).not.toHaveBeenCalled();
        confirmSpy.mockRestore();
    });

    it("duplicates a section with a fresh id", () => {
        const onChange = vi.fn();
        render(
            <SectionListPanel
                pageId="home"
                pageLabel="Home"
                sections={THREE_SECTIONS}
                onChange={onChange}
                onAdd={() => {}}
            />,
        );
        fireEvent.click(screen.getByTestId("section-row-sec-1-menu-trigger"));
        fireEvent.click(screen.getByTestId("section-row-sec-1-duplicate"));
        expect(onChange).toHaveBeenCalledTimes(1);
        const next = onChange.mock.calls[0][0] as SectionInstance[];
        expect(next).toHaveLength(4);
        // Clone is right after the source.
        expect(next[0].id).toBe("sec-1");
        expect(next[1].type).toBe("hero_image");
        expect(next[1].id).not.toBe("sec-1");
    });

    it("calls onEditSection when the Edit menu item is clicked", () => {
        const onEdit = vi.fn();
        render(
            <SectionListPanel
                pageId="home"
                pageLabel="Home"
                sections={THREE_SECTIONS}
                onChange={() => {}}
                onAdd={() => {}}
                onEditSection={onEdit}
            />,
        );
        fireEvent.click(screen.getByTestId("section-row-sec-3-menu-trigger"));
        fireEvent.click(screen.getByTestId("section-row-sec-3-edit"));
        expect(onEdit).toHaveBeenCalledWith("sec-3");
    });

    it("opens the picker via the header Add button", () => {
        const onAdd = vi.fn();
        render(
            <SectionListPanel
                pageId="home"
                pageLabel="Home"
                sections={THREE_SECTIONS}
                onChange={() => {}}
                onAdd={onAdd}
            />,
        );
        fireEvent.click(screen.getByTestId("section-list-add"));
        expect(onAdd).toHaveBeenCalledTimes(1);
    });
});
