import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import type { Order } from "@/lib/supabase";

vi.mock("@/components/orders/swipeable-order-card", () => ({
    SwipeableOrderCard: ({ order }: { order: Order }) => <div data-card={order.id} />,
}));

import { VirtualizedOrderList } from "./virtualized-order-list";

type Props = ComponentProps<typeof VirtualizedOrderList>;

const orders = Array.from({ length: 30 }, (_, i) => ({ id: `o${i}`, order_id: `${i}`, phone: `07${i}` })) as Order[];

function props(): Props {
    const noop = () => {};
    return {
        orders,
        loadingId: null,
        selectedOrders: new Set(),
        messageTemplates: [],
        onStatusUpdate: noop,
        onViewDetails: noop,
        onToggleSelection: noop,
        onTogglePin: noop,
        onCloneOrder: noop,
        onScreenshot: noop,
        onCancelWithReason: noop,
        onRejectWithReason: noop,
        onToggleReviewed: noop,
        onOpenTemplatePanel: noop,
        onShowDuplicates: noop,
        onMergeWithPrevious: noop,
        isBlacklisted: () => false,
        getRiskLevel: () => "low",
        getCustomerOrderCount: () => 1,
        getCustomerArchivedCount: () => 0,
        getCustomerHistory: () => [],
        getReturnOrderInfo: () => null,
        getOriginalOrderInfo: () => null,
    };
}

describe("VirtualizedOrderList first paint", () => {
    // jsdom has no ResizeObserver; nothing here needs its callbacks.
    beforeEach(() => {
        vi.stubGlobal("ResizeObserver", class {
            observe() {}
            unobserve() {}
            disconnect() {}
        });
    });
    // Every row lays out at the estimated card height.
    beforeEach(() => {
        vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(180);
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("builds only the on-screen cards first, then the off-screen overscan a frame later", async () => {
        const { container } = render(<VirtualizedOrderList {...props()} />);
        const firstPaint = container.querySelectorAll("[data-card]").length;
        expect(firstPaint).toBeGreaterThan(0);

        await waitFor(() => expect(container.querySelectorAll("[data-card]").length).toBe(firstPaint + 5));
    });
});
