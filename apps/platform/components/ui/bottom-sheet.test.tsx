/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { BottomSheet } from "./bottom-sheet";

// Radix Dialog uses pointer events; polyfill the bare minimum jsdom is
// missing so the open/close paths don't blow up.
beforeEach(() => {
    // jsdom doesn't implement hasPointerCapture / setPointerCapture / etc.
    if (!HTMLElement.prototype.hasPointerCapture) {
        HTMLElement.prototype.hasPointerCapture = () => false;
    }
    if (!HTMLElement.prototype.setPointerCapture) {
        HTMLElement.prototype.setPointerCapture = () => {};
    }
    if (!HTMLElement.prototype.releasePointerCapture) {
        HTMLElement.prototype.releasePointerCapture = () => {};
    }
    if (!HTMLElement.prototype.scrollIntoView) {
        HTMLElement.prototype.scrollIntoView = () => {};
    }
});

afterEach(() => {
    cleanup();
});

describe("BottomSheet", () => {
    it("renders the sheet body and drag handle when open", () => {
        render(
            <BottomSheet open onOpenChange={() => {}} title="Test sheet">
                <div data-testid="sheet-body">hello</div>
            </BottomSheet>,
        );
        expect(screen.getByTestId("bottom-sheet")).toBeTruthy();
        expect(screen.getByTestId("bottom-sheet-handle")).toBeTruthy();
        expect(screen.getByTestId("sheet-body")).toBeTruthy();
    });

    it("does NOT render when closed", () => {
        render(
            <BottomSheet open={false} onOpenChange={() => {}} title="Test sheet">
                <div>hidden</div>
            </BottomSheet>,
        );
        expect(screen.queryByTestId("bottom-sheet")).toBeNull();
    });

    it("renders a tappable backdrop (overlay) when open", () => {
        render(
            <BottomSheet open onOpenChange={() => {}} title="Test sheet">
                <div>body</div>
            </BottomSheet>,
        );
        const backdrop = screen.getByTestId("bottom-sheet-backdrop");
        expect(backdrop).toBeTruthy();
        // The overlay must be a real DOM node and visible so taps can
        // route through it to Radix's close logic.
        expect(backdrop.tagName).toBe("DIV");
    });

    it("closes when the close button is pressed", () => {
        const onOpenChange = vi.fn();
        render(
            <BottomSheet open onOpenChange={onOpenChange} title="Test sheet">
                <div>body</div>
            </BottomSheet>,
        );
        const closeBtn = screen.getByTestId("bottom-sheet-close");
        fireEvent.click(closeBtn);
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });
});
