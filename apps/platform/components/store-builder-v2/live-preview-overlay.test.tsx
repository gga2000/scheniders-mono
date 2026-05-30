/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { LivePreviewOverlay, type OverlayRect } from "./live-preview-overlay";

afterEach(() => {
    cleanup();
});

const RECT: OverlayRect = { top: 200, left: 40, width: 600, height: 240 };

function renderOverlay(overrides: Partial<React.ComponentProps<typeof LivePreviewOverlay>> = {}) {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onAction = vi.fn();
    const utils = render(
        <LivePreviewOverlay
            hoveredRect={null}
            selectedRect={null}
            selectedSectionLabel={null}
            onEdit={onEdit}
            onDelete={onDelete}
            onAction={onAction}
            {...overrides}
        />,
    );
    return { onEdit, onDelete, onAction, ...utils };
}

describe("LivePreviewOverlay", () => {
    it("renders nothing visible when no rects are present", () => {
        renderOverlay();
        expect(screen.queryByTestId("live-preview-overlay-hover-ring")).toBeNull();
        expect(screen.queryByTestId("live-preview-overlay-selected-ring")).toBeNull();
        expect(screen.queryByTestId("live-preview-overlay-toolbar")).toBeNull();
    });

    it("renders the hover ring only", () => {
        renderOverlay({ hoveredRect: RECT });
        expect(screen.getByTestId("live-preview-overlay-hover-ring")).toBeTruthy();
        expect(screen.queryByTestId("live-preview-overlay-selected-ring")).toBeNull();
    });

    it("renders the selected ring + toolbar when a rect is selected", () => {
        renderOverlay({ selectedRect: RECT, selectedSectionLabel: "Hero" });
        expect(screen.getByTestId("live-preview-overlay-selected-ring")).toBeTruthy();
        const toolbar = screen.getByTestId("live-preview-overlay-toolbar");
        expect(toolbar).toBeTruthy();
        expect(screen.getByTestId("live-preview-overlay-toolbar-label").textContent).toBe(
            "Hero",
        );
    });

    it("hides the hover ring when it coincides with the selected ring", () => {
        renderOverlay({ hoveredRect: RECT, selectedRect: RECT });
        expect(screen.queryByTestId("live-preview-overlay-hover-ring")).toBeNull();
        expect(screen.getByTestId("live-preview-overlay-selected-ring")).toBeTruthy();
    });

    it("fires onEdit / onDelete / onAction with the correct kinds", () => {
        const { onEdit, onDelete, onAction } = renderOverlay({
            selectedRect: RECT,
            selectedSectionLabel: "Hero",
        });
        fireEvent.click(screen.getByTestId("live-preview-overlay-toolbar-edit"));
        expect(onEdit).toHaveBeenCalled();

        fireEvent.click(screen.getByTestId("live-preview-overlay-toolbar-duplicate"));
        expect(onAction).toHaveBeenCalledWith("duplicate");

        fireEvent.click(screen.getByTestId("live-preview-overlay-toolbar-up"));
        expect(onAction).toHaveBeenCalledWith("up");

        fireEvent.click(screen.getByTestId("live-preview-overlay-toolbar-down"));
        expect(onAction).toHaveBeenCalledWith("down");

        fireEvent.click(screen.getByTestId("live-preview-overlay-toolbar-delete"));
        expect(onDelete).toHaveBeenCalled();
    });

    it("flips the toolbar below the section when too close to the top", () => {
        renderOverlay({
            selectedRect: { ...RECT, top: 10 },
            selectedSectionLabel: "Hero",
        });
        const toolbar = screen.getByTestId("live-preview-overlay-toolbar");
        expect(toolbar.getAttribute("data-flip-below")).toBe("true");
    });

    it("places the toolbar above the section when there's room", () => {
        renderOverlay({
            selectedRect: RECT,
            selectedSectionLabel: "Hero",
        });
        const toolbar = screen.getByTestId("live-preview-overlay-toolbar");
        expect(toolbar.getAttribute("data-flip-below")).toBe("false");
    });
});
