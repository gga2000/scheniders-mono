// @vitest-environment jsdom
// A search that changes in the URL from outside the box (global search result,
// back/forward) must reach the box; the box's own typing must not be overwritten.

import { describe, expect, it, vi, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";

let currentSearch = "";
let extra: Record<string, string> = {};
const replace = vi.fn((url: string) => {
    const p = new URL(url, "http://x").searchParams;
    currentSearch = p.get("search") ?? "";
    extra = Object.fromEntries([...p.entries()].filter(([k]) => k !== "search"));
});

vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace }),
    usePathname: () => "/customers",
    useSearchParams: () => new URLSearchParams({ ...extra, ...(currentSearch ? { search: currentSearch } : {}) }),
}));

import { useCustomerUrlState } from "./use-customer-url-state";

afterEach(() => {
    cleanup();
    currentSearch = "";
    extra = {};
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

describe("useCustomerUrlState chips", () => {
    it("reads chip filters from the URL and ignores unknown values", () => {
        extra = { value: "vip", risk: "nonsense", lane: "new" };
        const { result } = renderHook(() => useCustomerUrlState());
        expect(result.current.chips).toEqual({ value: "vip", risk: "all", lane: "new" });
    });

    it("writes chips and sort in one URL change", () => {
        const { result } = renderHook(() => useCustomerUrlState());
        act(() => result.current.setChips({ value: "vip", risk: "all", lane: "vipsQuiet" }, { by: "last_order_date", order: "asc" }));
        expect(replace).toHaveBeenCalledTimes(1);
        expect(extra).toEqual({ value: "vip", lane: "vipsQuiet", sortBy: "last_order_date", sortOrder: "asc" });
    });
});
