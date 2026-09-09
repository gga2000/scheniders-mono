import { describe, it, expect, beforeEach } from "vitest";
import type { Order } from "@/types/order";
import { useOrderStore } from "./use-order-store";

/**
 * ARCH-6 guard.
 *
 * The order store is module-level, so an open modal, a bulk selection or a
 * half-finished inline edit outlived a visit to the orders page and reappeared
 * on return — with `selectedOrder` still holding the snapshot captured last
 * time, stale by then. `resetTransientState` is called on unmount.
 *
 * The second test is the important one: view preferences and filters are
 * deliberately persistent, so a reset that cleared them would be a regression in
 * the other direction.
 */
const order = { id: "o1", order_id: "1260901001", customer_name: "أحمد" } as Order;

beforeEach(() => {
    useOrderStore.getState().resetTransientState();
});

describe("resetTransientState", () => {
    it("clears open modals and the order snapshots they hold", () => {
        const s = useOrderStore.getState();
        s.setIsModalOpen(true);
        s.setSelectedOrder(order);
        s.setIsCreateModalOpen(true);
        s.setShowDuplicateModal(true);
        s.setDuplicateOrder(order);
        s.setTemplatePanelOpen(true);
        s.setOrderForTemplate(order);
        s.setSplitOrderDialog({ open: true, order });

        useOrderStore.getState().resetTransientState();

        const after = useOrderStore.getState();
        expect(after.isModalOpen).toBe(false);
        expect(after.selectedOrder).toBeNull();
        expect(after.isCreateModalOpen).toBe(false);
        expect(after.showDuplicateModal).toBe(false);
        expect(after.duplicateOrder).toBeNull();
        expect(after.templatePanelOpen).toBe(false);
        expect(after.orderForTemplate).toBeNull();
        expect(after.splitOrderDialog).toEqual({ open: false, order: null });
    });

    it("keeps view preferences and filters, which are meant to persist", () => {
        const s = useOrderStore.getState();
        s.setViewMode("table");
        s.setCompactView(2);
        s.setGroupBy("city");
        s.setLocalSearchQuery("بغداد");

        useOrderStore.getState().resetTransientState();

        const after = useOrderStore.getState();
        expect(after.viewMode).toBe("table");
        expect(after.compactView).toBe(2);
        expect(after.groupBy).toBe("city");
        expect(after.localSearchQuery).toBe("بغداد");
    });

    it("clears a bulk selection and an in-flight inline edit", () => {
        const s = useOrderStore.getState();
        s.setSelectedOrders(new Set(["a", "b", "c"]));
        s.setEditingCell({ orderId: "a", field: "phone" });
        s.setLoadingId("a");

        useOrderStore.getState().resetTransientState();

        const after = useOrderStore.getState();
        expect(after.selectedOrders.size).toBe(0);
        expect(after.editingCell).toBeNull();
        expect(after.loadingId).toBeNull();
    });

    it("is safe to call when nothing is set", () => {
        expect(() => useOrderStore.getState().resetTransientState()).not.toThrow();
        expect(useOrderStore.getState().selectedOrders.size).toBe(0);
    });
});
