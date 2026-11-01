/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const ctx = {
    orders: [], filteredOrders: [], bulkUpdateStatus: vi.fn(), bulkReschedule: vi.fn(),
    bulkArchive: vi.fn(), bulkUnarchive: vi.fn(), bulkDelete: vi.fn(), createBatch: vi.fn(),
    ordersAreComplete: true, fetchOrders: vi.fn(),
};
vi.mock("@/components/providers/orders-provider", () => ({ useOrdersContext: () => ctx }));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ tenantId: "t1" }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (k: string) => k }) }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/app/actions/deleted-orders", () => ({ restoreDeletedOrders: vi.fn() }));

const toastError = vi.fn();
const dismissToast = vi.fn();
vi.mock("@/hooks/use-toast", () => {
    const toast = Object.assign(vi.fn(), {
        loading: vi.fn(() => "toast-1"), error: (...a: unknown[]) => toastError(...a),
        success: vi.fn(), warning: vi.fn(),
    });
    return { toast, dismissToast: (...a: unknown[]) => dismissToast(...a), updateToast: vi.fn() };
});

import { useOrderStore } from "@/store/use-order-store";
import { useOrderBulkOperations } from "./use-order-bulk-operations";

beforeEach(() => {
    vi.clearAllMocks();
    toastError.mockReset();
    dismissToast.mockReset();
    useOrderStore.getState().setSelectedOrders(new Set(["o1", "o2"]));
});

describe("bulk operations when the request throws", () => {
    it("archive clears its loading toast, reports the error and frees the bar", async () => {
        ctx.bulkArchive.mockRejectedValueOnce(new Error("offline"));
        const { result } = renderHook(() => useOrderBulkOperations());
        await act(async () => { await result.current.bulkActions.archive(); });
        expect(dismissToast).toHaveBeenCalledWith("toast-1");
        expect(toastError).toHaveBeenCalledWith("toast.archiveFailed", "offline");
        expect(result.current.isBulkProcessing).toBe(false);
    });

    it("delete closes its dialog, clears the toast and reports the error", async () => {
        ctx.bulkDelete.mockRejectedValueOnce(new Error("offline"));
        const { result } = renderHook(() => useOrderBulkOperations());
        await act(async () => { await result.current.executeDelete(); });
        expect(dismissToast).toHaveBeenCalledWith("toast-1");
        expect(toastError).toHaveBeenCalledWith("toast.deleteFailed", "offline");
        expect(result.current.isDeleting).toBe(false);
        expect(result.current.deleteConfirmOpen).toBe(false);
    });
});
