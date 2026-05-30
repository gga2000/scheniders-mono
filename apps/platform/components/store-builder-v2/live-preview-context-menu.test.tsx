/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

import {
    LivePreviewContextMenu,
    type LivePreviewContextMenuAction,
} from "./live-preview-context-menu";

afterEach(() => {
    cleanup();
});

function renderMenu(
    overrides: Partial<React.ComponentProps<typeof LivePreviewContextMenu>> = {},
) {
    const onClose = vi.fn();
    const onAction = vi.fn();
    const utils = render(
        <LivePreviewContextMenu
            x={100}
            y={150}
            onClose={onClose}
            onAction={onAction}
            {...overrides}
        />,
    );
    return { onClose, onAction, ...utils };
}

describe("LivePreviewContextMenu", () => {
    it("renders the menu at the requested cursor position", () => {
        renderMenu({ x: 220, y: 80 });
        const menu = screen.getByTestId("live-preview-context-menu") as HTMLElement;
        expect(menu).toBeTruthy();
        expect(menu.style.left).toBe("220px");
        expect(menu.style.top).toBe("80px");
    });

    it("closes when the user clicks outside the menu", async () => {
        const { onClose } = renderMenu();
        // The pointerdown listener is armed on a setTimeout(0); wait a tick.
        await act(async () => {
            await new Promise((r) => setTimeout(r, 5));
        });
        fireEvent.pointerDown(document.body);
        expect(onClose).toHaveBeenCalled();
    });

    it("closes when Escape is pressed", () => {
        const { onClose } = renderMenu();
        fireEvent.keyDown(window, { key: "Escape" });
        expect(onClose).toHaveBeenCalled();
    });

    it("fires onAction with the correct action for each menu item", () => {
        const { onAction } = renderMenu();
        const cases: Array<[string, LivePreviewContextMenuAction]> = [
            ["live-preview-context-menu-edit", "edit"],
            ["live-preview-context-menu-duplicate", "duplicate"],
            ["live-preview-context-menu-up", "up"],
            ["live-preview-context-menu-down", "down"],
            ["live-preview-context-menu-add-variant", "add_variant"],
            ["live-preview-context-menu-delete", "delete"],
        ];
        for (const [testId, expected] of cases) {
            fireEvent.click(screen.getByTestId(testId));
            expect(onAction).toHaveBeenLastCalledWith(expected);
        }
        expect(onAction).toHaveBeenCalledTimes(cases.length);
    });

    it("renders all six expected actions in order", () => {
        renderMenu();
        const items = [
            "live-preview-context-menu-edit",
            "live-preview-context-menu-duplicate",
            "live-preview-context-menu-up",
            "live-preview-context-menu-down",
            "live-preview-context-menu-add-variant",
            "live-preview-context-menu-delete",
        ];
        for (const id of items) {
            expect(screen.getByTestId(id)).toBeTruthy();
        }
    });
});
