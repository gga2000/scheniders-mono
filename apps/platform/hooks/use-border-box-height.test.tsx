/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { useBorderBoxHeight } from "./use-border-box-height";

/**
 * The customers table header sticks right under the toolbar at the toolbar's
 * measured height. A fixed number drifted whenever the toolbar's padding or
 * contents changed, leaving a gap the scrolled rows showed through.
 */

const observers: { callback: ResizeObserverCallback; targets: { el: Element; box?: ResizeObserverBoxOptions }[]; disconnected: boolean }[] = [];

class FakeResizeObserver {
    private readonly entry: (typeof observers)[number];
    constructor(callback: ResizeObserverCallback) {
        this.entry = { callback, targets: [], disconnected: false };
        observers.push(this.entry);
    }
    observe(el: Element, options?: ResizeObserverOptions) { this.entry.targets.push({ el, box: options?.box }); }
    unobserve() {}
    disconnect() { this.entry.disconnected = true; }
}

function fire() {
    for (const o of observers) {
        if (!o.disconnected) o.callback([], o as unknown as ResizeObserver);
    }
}

let barHeight = 0;

function Harness({ show = true }: { show?: boolean }) {
    const { height, ref } = useBorderBoxHeight<HTMLDivElement>();
    return (
        <>
            <p data-testid="height">{height}</p>
            {show && <div ref={ref} />}
        </>
    );
}

const reading = () => Number(screen.getByTestId("height").textContent);

beforeEach(() => {
    observers.length = 0;
    barHeight = 0;
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
        () => ({ height: barHeight }) as DOMRect,
    );
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("useBorderBoxHeight", () => {
    it("observes the element's border box, so padding and border changes are seen", () => {
        render(<Harness />);
        expect(observers).toHaveLength(1);
        expect(observers[0].targets).toHaveLength(1);
        expect(observers[0].targets[0].box).toBe("border-box");
    });

    it("reports the rendered height, fractions included, and follows it", () => {
        render(<Harness />);
        expect(reading()).toBe(0);
        barHeight = 70.5;
        act(fire);
        expect(reading()).toBe(70.5);
        barHeight = 82;
        act(fire);
        expect(reading()).toBe(82);
    });

    it("measures an element that mounts after the first render, and stops when it goes", () => {
        const { rerender } = render(<Harness show={false} />);
        expect(observers).toHaveLength(0);
        rerender(<Harness show />);
        expect(observers).toHaveLength(1);
        rerender(<Harness show={false} />);
        expect(observers[0].disconnected).toBe(true);
    });
});
