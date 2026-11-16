/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { HOLD_MAX_MS, dropFirstLoadHold, raiseFirstLoadHold, useSideReadsHeld } from "./first-load-hold";

afterEach(() => {
    act(() => dropFirstLoadHold());
    vi.useRealTimers();
});

describe("first-load hold", () => {
    it("holds side reads until the orders list drops it", () => {
        const { result } = renderHook(() => useSideReadsHeld());
        expect(result.current).toBe(false);
        act(() => void raiseFirstLoadHold());
        expect(result.current).toBe(true);
        act(() => dropFirstLoadHold());
        expect(result.current).toBe(false);
    });

    it("lets side reads go after HOLD_MAX_MS even if the list never paints", () => {
        vi.useFakeTimers();
        const { result } = renderHook(() => useSideReadsHeld());
        act(() => void raiseFirstLoadHold());
        act(() => vi.advanceTimersByTime(HOLD_MAX_MS - 1));
        expect(result.current).toBe(true);
        act(() => vi.advanceTimersByTime(1));
        expect(result.current).toBe(false);
    });

    it("drops when the page that raised it goes away", () => {
        const { result } = renderHook(() => useSideReadsHeld());
        let release = () => {};
        act(() => {
            release = raiseFirstLoadHold();
        });
        expect(result.current).toBe(true);
        act(() => release());
        expect(result.current).toBe(false);
    });
});
