/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { useDocumentOffsetTop } from "./use-document-offset-top";

/**
 * The window virtualizers' scrollMargin. It used to be read once on mount, so
 * when the analytics panel opened above an already-mounted list (the All
 * Orders preview handing over to the full window) the visible-range math was
 * off by the panel's height for the rest of the visit.
 */

const observers: { callback: ResizeObserverCallback; targets: Element[]; disconnected: boolean }[] = [];

class FakeResizeObserver {
    private readonly entry: (typeof observers)[number];
    constructor(callback: ResizeObserverCallback) {
        this.entry = { callback, targets: [], disconnected: false };
        observers.push(this.entry);
    }
    observe(target: Element) { this.entry.targets.push(target); }
    unobserve() {}
    disconnect() { this.entry.disconnected = true; }
}

function fire() {
    for (const o of observers) {
        if (!o.disconnected) o.callback([], o as unknown as ResizeObserver);
    }
}

let listTop = 0;

function Harness({ empty = false }: { empty?: boolean }) {
    const { top, ref } = useDocumentOffsetTop<HTMLDivElement>();
    // Like the virtualized list and table: an early return on an empty list.
    if (empty) return <p data-testid="empty" data-top={top} />;
    return <div ref={ref} data-testid="list" data-top={top} />;
}

const reading = () => Number(screen.getByTestId("list").dataset.top);

beforeEach(() => {
    observers.length = 0;
    listTop = 0;
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    Object.defineProperty(window, "scrollY", { configurable: true, writable: true, value: 0 });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
        () => ({ top: listTop - window.scrollY }) as DOMRect,
    );
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("useDocumentOffsetTop", () => {
    it("watches the document body, so anything above the list moving it is seen", () => {
        render(<Harness />);
        expect(observers).toHaveLength(1);
        expect(observers[0].targets).toEqual([document.body]);
    });

    it("takes its first reading from the observer's initial report", () => {
        listTop = 220;
        render(<Harness />);
        act(fire);
        expect(reading()).toBe(220);
    });

    it("re-measures when content above the list grows after mount", () => {
        listTop = 220;
        render(<Harness />);
        act(fire);
        // The analytics panel finishes opening above the list.
        listTop = 520;
        act(fire);
        expect(reading()).toBe(520);
    });

    it("measures against the document, not the viewport", () => {
        listTop = 300;
        window.scrollY = 120;
        render(<Harness />);
        act(fire);
        expect(reading()).toBe(300);
    });

    it("measures a list that first rendered its empty state", () => {
        listTop = 340;
        const { rerender } = render(<Harness empty />);
        expect(observers).toHaveLength(0);
        rerender(<Harness />);
        act(fire);
        expect(reading()).toBe(340);
    });

    it("stops observing on unmount", () => {
        const { unmount } = render(<Harness />);
        unmount();
        expect(observers[0].disconnected).toBe(true);
    });
});
