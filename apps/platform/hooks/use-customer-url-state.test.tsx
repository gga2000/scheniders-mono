// @vitest-environment jsdom
// A search that changes in the URL from outside the box (global search result,
// back/forward) must reach the box; the box's own typing must not be overwritten.

import { describe, expect, it, vi, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";

let currentSearch = "";
const replace = vi.fn((url: string) => {
    currentSearch = new URL(url, "http://x").searchParams.get("search") ?? "";
});

vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace }),
    usePathname: () => "/customers",
    useSearchParams: () => new URLSearchParams(currentSearch ? { search: currentSearch } : {}),
}));

import { useCustomerUrlState } from "./use-customer-url-state";

afterEach(() => {
    cleanup();
    currentSearch = "";
    replace.mockClear();
});

describe("useCustomerUrlState search", () => {
    it("takes a search that arrives from the URL", () => {
        const { result, rerender } = renderHook(() => useCustomerUrlState());
        expect(result.current.rawSearch).toBe("");
        currentSearch = "ali";
        rerender();
        expect(result.current.rawSearch).toBe("ali");
    });

    it("keeps what is typed while the URL still holds the older value", () => {
        const { result } = renderHook(() => useCustomerUrlState());
        act(() => result.current.setSearch("abc"));
        expect(result.current.rawSearch).toBe("abc");
    });
});
