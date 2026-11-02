/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, renderHook, fireEvent, cleanup, act } from "@testing-library/react";
import type { Order } from "@/lib/supabase";

vi.mock("@/components/providers/orders-provider", () => ({
    useOrdersContext: () => ({ updateOrder: async () => ({ success: true }) }),
}));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (k: string) => k, language: "ar" }) }));
vi.mock("@/hooks/use-status-label", () => ({ useStatusLabel: () => () => "" }));

import { useOrderCardModel } from "./use-order-card-model";

const order = { id: "o1", order_id: "7682", customer_name: "Hussein", status: "in_transit", items: [] } as unknown as Order;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
    vi.useRealTimers();
    cleanup();
});

function clickName(opts: { selectable: boolean; opensDetails?: boolean }) {
    const onViewDetails = vi.fn();
    const { result } = renderHook(() =>
        useOrderCardModel({
            order,
            loadingId: null,
            onStatusUpdate: () => {},
            onViewDetails,
            onToggleSelection: opts.selectable ? () => {} : undefined,
        }),
    );
    const { getByText } = render(<>{result.current.editable("customer_name", "Hussein", "Hussein", undefined, opts.opensDetails)}</>);
    fireEvent.click(getByText("Hussein"));
    act(() => { vi.advanceTimersByTime(300); });
    return onViewDetails;
}

describe("editable field click on the order card", () => {
    it("opens the details from a customer name whose wrapper opens them, in a selectable list", () => {
        // The full card's name wrapper opens the details itself; this span stops the click reaching it.
        expect(clickName({ selectable: true, opensDetails: true })).toHaveBeenCalledWith(order);
    });

    it("keeps a selectable list's other fields from opening the details", () => {
        expect(clickName({ selectable: true })).not.toHaveBeenCalled();
    });

    it("still opens the details by default outside a selectable list", () => {
        expect(clickName({ selectable: false })).toHaveBeenCalledWith(order);
    });
});
