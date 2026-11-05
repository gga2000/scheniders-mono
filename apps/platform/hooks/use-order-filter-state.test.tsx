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
});
