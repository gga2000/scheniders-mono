// @vitest-environment jsdom
// With `fallbackSides`, a tooltip that would be cut off on its side opens on the first
// fallback that fits; without them (the default), the side is never changed.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Tooltip } from "./tooltip";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

/** The anchor sits 10px above the bottom of a 600px viewport; the tooltip is 40px tall. */
function placeNearBottom() {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        if (this.getAttribute("role") === "tooltip") return new DOMRect(100, 598, 200, 40);
        return new DOMRect(100, 560, 80, 30);
    });
}

function openTip(fallbackSides?: ("top" | "bottom" | "left" | "right")[]) {
    vi.useFakeTimers();
    render(<Tooltip side="bottom" fallbackSides={fallbackSides} delay={0} content="note"><button>tag</button></Tooltip>);
    fireEvent.mouseEnter(screen.getByText("tag").parentElement as HTMLElement);
    act(() => { vi.runAllTimers(); });
    return screen.getByRole("tooltip");
}

describe("Tooltip fallback sides", () => {
    it("opens above when there is no room below and room above", () => {
        placeNearBottom();
        const tip = openTip(["top"]);
        expect(tip.className).toContain("bottom-full");
        expect(tip.className).not.toContain("top-full");
    });

    it("takes the first fallback that fits, beside the anchor before above it", () => {
        placeNearBottom();
        const tip = openTip(["right", "top"]);
        expect(tip.className).toContain("left-full");
    });

    it("keeps the chosen side without fallbacks", () => {
        placeNearBottom();
        const tip = openTip();
        expect(tip.className).toContain("top-full");
    });

    it("keeps the chosen side when it fits", () => {
        Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
            if (this.getAttribute("role") === "tooltip") return new DOMRect(100, 238, 200, 40);
            return new DOMRect(100, 200, 80, 30);
        });
        const tip = openTip(["top"]);
        expect(tip.className).toContain("top-full");
    });
});
