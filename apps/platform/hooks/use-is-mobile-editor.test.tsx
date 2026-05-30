/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { useIsMobileEditor } from "./use-is-mobile-editor";

/* ─────────────────────────────────────────────────────────────────── */
/* JSDOM does not implement matchMedia. Polyfill a real-enough           */
/* implementation that listens to window.resize so the tests can flip    */
/* viewport widths and exercise the hook end-to-end.                     */
/* ─────────────────────────────────────────────────────────────────── */

type Listener = (e: MediaQueryListEvent) => void;

function installMatchMediaPolyfill(): void {
    const mqlsByQuery = new Map<string, Set<Listener>>();

    function evaluate(query: string): boolean {
        // We only care about `(max-width: Npx)` queries; this is what
        // the hook uses.
        const m = /\(max-width:\s*(\d+)px\)/.exec(query);
        if (!m) return false;
        const px = Number(m[1]);
        return window.innerWidth <= px;
    }

    function makeMql(query: string): MediaQueryList {
        const listeners = (() => {
            let set = mqlsByQuery.get(query);
            if (!set) {
                set = new Set();
                mqlsByQuery.set(query, set);
            }
            return set;
        })();
        const mql: MediaQueryList = {
            media: query,
            get matches() {
                return evaluate(query);
            },
            onchange: null,
            addEventListener: (event: string, listener: EventListenerOrEventListenerObject) => {
                if (event === "change") listeners.add(listener as Listener);
            },
            removeEventListener: (event: string, listener: EventListenerOrEventListenerObject) => {
                if (event === "change") listeners.delete(listener as Listener);
            },
            addListener: (listener: Listener) => listeners.add(listener),
            removeListener: (listener: Listener) => listeners.delete(listener),
            dispatchEvent: () => true,
        } as unknown as MediaQueryList;
        return mql;
    }

    window.matchMedia = (query: string) => makeMql(query);

    // When resize fires, re-evaluate every registered MQL and notify
    // listeners with the new matches value.
    window.addEventListener("resize", () => {
        for (const [query, listeners] of mqlsByQuery.entries()) {
            const matches = evaluate(query);
            for (const l of listeners) {
                l({ matches, media: query } as MediaQueryListEvent);
            }
        }
    });
}

function setViewportWidth(px: number): void {
    Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: px,
    });
    window.dispatchEvent(new Event("resize"));
}

/* ─────────────────────────────────────────────────────────────────── */
/* Test harness                                                          */
/* ─────────────────────────────────────────────────────────────────── */

function Harness({ breakpoint }: { breakpoint?: number }): React.ReactElement {
    const isMobile = useIsMobileEditor(breakpoint);
    return (
        <span data-testid="harness">{isMobile ? "mobile" : "desktop"}</span>
    );
}

beforeEach(() => {
    installMatchMediaPolyfill();
});

afterEach(() => {
    cleanup();
});

describe("useIsMobileEditor", () => {
    it("returns false at desktop widths (≥1024px)", () => {
        setViewportWidth(1440);
        render(<Harness />);
        expect(screen.getByTestId("harness").textContent).toBe("desktop");
    });

    it("returns true at mobile widths (<1024px)", () => {
        setViewportWidth(390);
        render(<Harness />);
        expect(screen.getByTestId("harness").textContent).toBe("mobile");
    });

    it("reacts to viewport resize", () => {
        setViewportWidth(1440);
        render(<Harness />);
        expect(screen.getByTestId("harness").textContent).toBe("desktop");
        act(() => {
            setViewportWidth(768);
        });
        expect(screen.getByTestId("harness").textContent).toBe("mobile");
        act(() => {
            setViewportWidth(1280);
        });
        expect(screen.getByTestId("harness").textContent).toBe("desktop");
    });
});
