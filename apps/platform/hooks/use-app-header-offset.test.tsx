// @vitest-environment jsdom
// The customers band sticks under the shell header while the header is shown and at
// the top while its headroom has slid it away, so the header never pokes out beside it.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useAppHeaderOffset } from "./use-app-header-offset";

const resizeCallbacks: ResizeObserverCallback[] = [];
class FakeResizeObserver {
    constructor(callback: ResizeObserverCallback) { resizeCallbacks.push(callback); }
    observe() {}
    unobserve() {}
    disconnect() {}
}

function mountHeader(height: number): HTMLElement {
    const header = document.createElement("header");
    header.className = "app-header";
    header.dataset.hidden = "false";
    Object.defineProperty(header, "offsetHeight", { configurable: true, get: () => height });
    document.body.appendChild(header);
    return header;
}

afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    resizeCallbacks.length = 0;
    vi.unstubAllGlobals();
});

describe("useAppHeaderOffset", () => {
    it("is the header's height while shown and 0 while hidden", async () => {
        vi.stubGlobal("ResizeObserver", FakeResizeObserver);
        const header = mountHeader(72);
        const { result } = renderHook(() => useAppHeaderOffset());
        expect(result.current).toBe(72);
        await act(async () => { header.dataset.hidden = "true"; });
        expect(result.current).toBe(0);
        await act(async () => { header.dataset.hidden = "false"; });
        expect(result.current).toBe(72);
    });

    it("follows a change in the header's height", () => {
        vi.stubGlobal("ResizeObserver", FakeResizeObserver);
        let height = 72;
        const header = mountHeader(0);
        Object.defineProperty(header, "offsetHeight", { configurable: true, get: () => height });
        const { result } = renderHook(() => useAppHeaderOffset());
        height = 88;
        act(() => { for (const cb of resizeCallbacks) cb([], {} as ResizeObserver); });
        expect(result.current).toBe(88);
    });

    it("is 0 on a page without the shell header", () => {
        vi.stubGlobal("ResizeObserver", FakeResizeObserver);
        const { result } = renderHook(() => useAppHeaderOffset());
        expect(result.current).toBe(0);
    });
});
