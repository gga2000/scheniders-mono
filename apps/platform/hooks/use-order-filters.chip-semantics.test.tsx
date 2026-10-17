import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Order, OrderFilters } from "@/types/order";

/**
 * A status chip's number and the list it opens are computed by two different
 * predicates.
 *
 * The chip reads `statusCounts[id]` — on the page that is
 * `get_orders_aggregates`, and the client fallback here reproduces the same
 * semantics (the dev parity guard in use-orders asserts they agree). The list
 * reads `applyFilters`. They disagree for five chips:
 *
 *   completed      chip: status = completed                    list: also drops refunded / refund-pending / replacements
 *   refunds        chip: status in (return_pending, refund_*)   list: is_return = true
 *   refunded       chip: key never computed → 0                 list: refund_status = refunded
 *   refund_pending chip: key never computed → 0                 list: refund_status = pending
 *   replacements   chip: key never computed → 0                 list: is_replacement or RPL- prefix
 *
 * Live, tenant b5c4…, All Orders, 2026-10-18: completed 3104 vs 3019, refunds
 * 87 vs 85, refunded 0 vs 53, refund pending 0 vs 6, replacements 0 vs 32.
 *
 * Chip ids and the `|| 0` fallback are those of components/orders/sticky-filter-bar.tsx.
 */

vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ tenantId: null }) }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/hooks/use-toast", () => ({ toast: { error: vi.fn() } }));

import { useOrderFilters } from "./use-order-filters";

let seq = 0;
function order(overrides: Partial<Order> & Record<string, unknown>): Order {
    seq++;
    return {
        id: `o${seq}`,
        order_id: `LF-${seq}`,
        customer_name: "x",
        phone: "07700000000",
        items: [],
        price: 10000,
        status: "completed",
        priority: "normal",
        payment_status: "cod",
        created_at: "2026-10-12T08:00:00.000Z",
        is_return: false,
        is_archived: false,
        ...overrides,
    } as Order;
}

// A small book with the same shapes the live tenant has.
const BOOK: Order[] = [
    order({}),
    order({}),
    order({}),
    order({ refund_status: "refunded" }),
    order({ refund_status: "refunded" }),
    order({ refund_status: "pending" }),
    order({ is_replacement: true }),
    order({ order_id: "RPL-77" }),
    // refund_delivered rows that are not flagged is_return (2 of the 87 live ones)
    order({ status: "refund_delivered", is_return: true }),
    order({ status: "refund_delivered", is_return: false }),
    order({ status: "delivered" }),
];

const CHIPS = ["all", "delivered", "completed", "refunds", "refunded", "refund_pending", "replacements"] as const;

function view(status: string) {
    const filters = { status } as OrderFilters;
    return renderHook(() =>
        useOrderFilters({ orders: BOOK, searchResults: null, filters, setFilters: vi.fn(), clearFilters: vi.fn() }),
    ).result.current;
}

describe("status chip count equals the length of the list it opens (same filter state)", () => {
    it.each(CHIPS)("chip %s", (chip) => {
        const { statusCounts, filteredOrders } = view(chip);
        const chipCount = statusCounts[chip] || 0; // sticky-filter-bar.tsx renders `statusCounts.x || 0`
        expect({ chip, chipCount }).toEqual({ chip, chipCount: filteredOrders.length });
    });
});
