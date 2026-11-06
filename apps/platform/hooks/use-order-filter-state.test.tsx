// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useOrderStore } from "@/store/use-order-store";

vi.mock("@/hooks/use-user-preferences", () => ({
    PREFERENCE_KEYS: { ORDER_FILTERS: "order_filters" },
    useUserPreferences: () => ({ getPreference: () => null, setPreference: vi.fn(), userId: null }),
}));

import { useOrderFilterState } from "./use-order-filter-state";

describe("useOrderFilterState", () => {
    it("leaves an open Prime queue when any filter is picked", () => {
        useOrderStore.getState().setPrimeQueue("fix");
        const { result } = renderHook(() => useOrderFilterState());
        act(() => result.current.setFilters((prev) => ({ ...prev, adChannel: "meta" })));
        expect(useOrderStore.getState().primeQueue).toBeNull();
    });

    it("keeps a restored Prime queue open when a call changes nothing (the search box syncing on load)", () => {
        useOrderStore.getState().setPrimeQueue("back");
        const { result } = renderHook(() => useOrderFilterState());
        act(() => result.current.setFilters((prev) => (prev.searchQuery === undefined ? prev : { ...prev, searchQuery: undefined })));
        expect(useOrderStore.getState().primeQueue).toBe("back");
        act(() => result.current.setFilters((prev) => ({ ...prev, status: "new" })));
        expect(useOrderStore.getState().primeQueue).toBeNull();
        expect(result.current.filters.status).toBe("new");
    });

    it("chains two changes made in one tick", () => {
        const { result } = renderHook(() => useOrderFilterState());
        act(() => {
            result.current.setFilters((prev) => ({ ...prev, status: "new" }));
            result.current.setFilters((prev) => ({ ...prev, city: "Kut" }));
        });
        expect(result.current.filters).toMatchObject({ status: "new", city: "Kut" });
    });
});
