// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePersistedToggle } from "./use-persisted-toggle";

describe("usePersistedToggle", () => {
    beforeEach(() => localStorage.clear());

    it("starts off and reads a stored value after mount", () => {
        localStorage.setItem("k", "true");
        const { result } = renderHook(() => usePersistedToggle("k"));
        expect(result.current[0]).toBe(true);
    });

    it("stores every flip", () => {
        const { result } = renderHook(() => usePersistedToggle("k"));
        expect(result.current[0]).toBe(false);
        act(() => result.current[1]());
        expect(result.current[0]).toBe(true);
        expect(localStorage.getItem("k")).toBe("true");
        act(() => result.current[1]());
        expect(localStorage.getItem("k")).toBe("false");
    });
});
