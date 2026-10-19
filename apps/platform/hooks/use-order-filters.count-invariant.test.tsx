import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Order, OrderFilters } from "@/types/order";
import { FILTER_FIELDS_READ, filterOrders } from "@/lib/orders/filter-orders";
import { ORDER_CHIP_IDS } from "@/lib/orders/order-chips";

/**
 * Invariant I1: for every chip c and every filter state F,
 *   statusCounts[c] === filterOrders(rows, { ...F, status: c }).length
 * and the same for every other count the page shows (product chips, the
 * "all channels" chip, Needs Attention). Each count is the length of the list
 * its click opens, by construction.
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
        items: [{ name: "Shirt", quantity: 1, price: 1 }],
        price: 10000,
        status: "new",
        priority: "normal",
        payment_status: "cod",
        city: "Baghdad",
        created_at: "2026-10-12T08:00:00.000Z",
        is_return: false,
        is_replacement: false,
        is_archived: false,
        ...overrides,
    } as Order;
}

const STATUSES: Order["status"][] = ["new", "contacted", "confirmed", "in_transit", "delivered", "completed", "rejected", "no_response", "return_pending", "refund_delivered", "suspended", "cancelled"];

const BOOK: Order[] = [];
for (let i = 0; i < 96; i++) {
    BOOK.push(order({
        status: STATUSES[i % STATUSES.length],
        priority: i % 5 === 0 ? "urgent" : "normal",
        payment_status: i % 3 === 0 ? "prepaid" : "cod",
        city: i % 4 === 0 ? "Basra" : "Baghdad",
        ad_channel: i % 3 === 0 ? "instagram" : i % 3 === 1 ? "facebook" : null,
        is_return: i % 7 === 0,
        is_replacement: i % 11 === 0,
        refund_status: i % 6 === 0 ? "refunded" : i % 6 === 1 ? "pending" : "none",
        items: i % 2 === 0 ? [{ name: "Shirt", quantity: 1, price: 1 }] : [{ name: "Shirt XL", quantity: 1, price: 1 }, { name: "Hat", quantity: 1, price: 1 }],
        created_at: i % 2 === 0 ? "2026-10-12T08:00:00.000Z" : "2026-10-14T08:00:00.000Z",
    }));
}

const VARIANTS: [string, OrderFilters][] = [
    ["nothing", {}],
    ["orderType refund", { orderType: "refund" }],
    ["orderType replacement", { orderType: "replacement" }],
    ["dates", { dateFrom: "2026-10-12", dateTo: "2026-10-12" }],
    ["city", { city: "Basra" }],
    ["product", { product: "shirt" }],
    ["priority", { priority: "urgent" }],
    ["payment", { paymentStatus: "prepaid" }],
    ["channel", { adChannel: "instagram" }],
    ["isReturn", { isReturn: true }],
    ["status tab", { status: "delivered" }],
];

function view(filters: OrderFilters) {
    return renderHook(() =>
        useOrderFilters({ orders: BOOK, searchResults: null, filters, setFilters: vi.fn(), clearFilters: vi.fn() }),
    ).result.current;
}

describe("filterOrders reads only FILTER_FIELDS_READ", () => {
    it("never touches another filter field", () => {
        const read = new Set<string>();
        const f = new Proxy({ status: "completed", product: "x", adChannel: "instagram", searchQuery: "q", riskLevel: "flagged" } as OrderFilters, {
            get(target, key) {
                if (typeof key === "string") read.add(key);
                return Reflect.get(target, key);
            },
        });
        filterOrders(BOOK, f);
        expect([...read].filter((k) => !(FILTER_FIELDS_READ as readonly string[]).includes(k))).toEqual([]);
    });
});

describe.each(VARIANTS)("count invariant with %s", (_label, base) => {
    const v = view(base);

    it("every status chip equals the list it opens", () => {
        for (const c of ORDER_CHIP_IDS) {
            expect({ c, n: v.statusCounts[c] }).toEqual({ c, n: filterOrders(BOOK, { ...base, status: c }).length });
        }
    });

    it("every product chip equals the list it opens", () => {
        for (const p of v.availableProductsInView) {
            expect({ p: p.name, n: p.count }).toEqual({ p: p.name, n: filterOrders(BOOK, { ...base, product: p.name }).length });
        }
    });

    it("Needs Attention counts equal the lists their clicks open", () => {
        expect(v.attentionCounts.urgent).toBe(filterOrders(BOOK, { ...base, priority: "urgent" }).length);
        expect(v.attentionCounts.noResponse).toBe(filterOrders(BOOK, { ...base, status: "no_response" }).length);
        expect(v.attentionCounts.returnPending).toBe(filterOrders(BOOK, { ...base, status: "return_pending" }).length);
    });

    it("the all-channels chip equals the list with no channel pinned, and each channel its own list", () => {
        expect(v.adChannelSummary.total).toBe(filterOrders(BOOK, { ...base, adChannel: undefined }).length);
        for (const s of v.adChannelSummary.stats) {
            expect(s.orders).toBe(filterOrders(BOOK, { ...base, adChannel: s.channel }).length);
        }
    });

    it("the list is the filter", () => {
        expect(v.filteredOrders.length).toBe(filterOrders(BOOK, base).length);
    });
});

describe("a chip switch", () => {
    it("does not recompute the status counts", () => {
        const { result, rerender } = renderHook(
            ({ filters }: { filters: OrderFilters }) =>
                useOrderFilters({ orders: BOOK, searchResults: null, filters, setFilters: vi.fn(), clearFilters: vi.fn() }),
            { initialProps: { filters: { status: "all", city: "Baghdad" } as OrderFilters } },
        );
        const before = result.current.statusCounts;
        rerender({ filters: { status: "delivered", city: "Baghdad" } });
        expect(result.current.filteredOrders.every((o) => o.status === "delivered")).toBe(true);
        expect(result.current.statusCounts).toBe(before);
    });
});
