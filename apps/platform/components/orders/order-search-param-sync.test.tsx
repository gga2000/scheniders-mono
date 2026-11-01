/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

let params = new URLSearchParams();
const replace = vi.fn((url: string) => { params = new URLSearchParams(url.split("?")[1] ?? ""); });
vi.mock("next/navigation", () => ({
    useSearchParams: () => params,
    usePathname: () => "/orders",
    useRouter: () => ({ replace }),
}));
vi.mock("@/components/providers/orders-provider", () => ({ useOrdersContext: () => ({ setFilters: vi.fn(), filtersSettled: true }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (k: string) => k }) }));
const findById = vi.fn();
vi.mock("@/lib/repositories/order-repository", () => ({ orderRepository: { findById: (id: string) => findById(id) } }));
const toastError = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));
vi.mock("@/lib/order-telemetry", () => ({ reportOrderError: vi.fn() }));

import { useOrderStore } from "@/store/use-order-store";
import { OrderSearchParamSync } from "./order-search-param-sync";

const ID = "3f2a6c1e-8b7d-4e2f-9a10-1c2d3e4f5a6b";

beforeEach(() => {
    vi.clearAllMocks();
    useOrderStore.getState().closeOrderDetails();
});

describe("?order=<id>", () => {
    it("opens that order's details and removes the parameter", async () => {
        params = new URLSearchParams({ order: ID });
        findById.mockResolvedValue({ id: ID, order_id: "9001" });
        render(<OrderSearchParamSync />);
        expect(replace).toHaveBeenCalledWith("/orders", { scroll: false });
        await waitFor(() => expect(useOrderStore.getState().isModalOpen).toBe(true));
        expect(useOrderStore.getState().selectedOrder?.id).toBe(ID);
        expect(findById).toHaveBeenCalledTimes(1);
    });

    it("says so when the order no longer exists", async () => {
        params = new URLSearchParams({ order: ID });
        findById.mockResolvedValue(null);
        render(<OrderSearchParamSync />);
        await waitFor(() => expect(toastError).toHaveBeenCalledWith("orders.toast.notFound", "orders.toast.notFoundDesc"));
        expect(useOrderStore.getState().isModalOpen).toBe(false);
    });

    it("ignores a value that is not an order id", () => {
        params = new URLSearchParams({ order: "1; drop" });
        render(<OrderSearchParamSync />);
        expect(findById).not.toHaveBeenCalled();
    });
});
