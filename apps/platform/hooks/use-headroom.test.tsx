/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { useHeadroom, type UseHeadroomOptions } from "./use-headroom";

function setScrollY(px: number): void {
    Object.defineProperty(window, "scrollY", { configurable: true, writable: true, value: px });
    window.dispatchEvent(new Event("scroll"));
}

function Harness(props: UseHeadroomOptions): React.ReactElement {
    const { hidden } = useHeadroom(props);
    return <span data-testid="h">{hidden ? "hidden" : "shown"}</span>;
}

const text = () => screen.getByTestId("h").textContent;

beforeEach(() => {
    // Run rAF synchronously so scroll → state flush happens inside act().
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 0; });
    setScrollY(0);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("useHeadroom", () => {
    it("starts shown", () => {
        render(<Harness />);
        expect(text()).toBe("shown");
    });

    it("hides after scrolling down past the threshold", () => {
        render(<Harness threshold={64} />);
        act(() => setScrollY(200));
        expect(text()).toBe("hidden");
    });

    it("reveals on scroll up", () => {
        render(<Harness threshold={64} />);
        act(() => setScrollY(200));
        expect(text()).toBe("hidden");
        act(() => setScrollY(150));
        expect(text()).toBe("shown");
    });

    it("always shows near the top", () => {
        render(<Harness threshold={64} />);
        act(() => setScrollY(200));
        expect(text()).toBe("hidden");
        act(() => setScrollY(4));
        expect(text()).toBe("shown");
    });

    it("ignores deltas inside the deadzone", () => {
        render(<Harness threshold={64} deadzone={4} />);
        act(() => setScrollY(200));
        expect(text()).toBe("hidden");
        act(() => setScrollY(198)); // up by 2 < deadzone → no change
        expect(text()).toBe("hidden");
    });

    it("never hides while locked", () => {
        render(<Harness threshold={64} locked />);
        act(() => setScrollY(300));
        expect(text()).toBe("shown");
    });

    it("does nothing when disabled", () => {
        render(<Harness threshold={64} disabled />);
        act(() => setScrollY(300));
        expect(text()).toBe("shown");
    });
});
