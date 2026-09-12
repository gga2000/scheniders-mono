/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Order } from "@/types/order";
import { AdChannelFilter, summarizeChannels } from "./ad-channel-filter";

afterEach(cleanup);

function order(overrides: Partial<Order> = {}): Order {
    return {
        id: Math.random().toString(36).slice(2),
        order_id: "1",
        customer_name: "x",
        phone: "07700000000",
        items: [],
        price: 10000,
        status: "delivered",
        priority: "normal",
        payment_status: "cod",
        created_at: "2026-09-12T00:00:00.000Z",
        is_return: false,
        is_replacement: false,
        is_archived: false,
        ...overrides,
    } as Order;
}

describe("summarizeChannels", () => {
    it("counts orders and realized revenue per channel", () => {
        const stats = summarizeChannels([
            order({ ad_channel: "instagram", price: 40000, status: "delivered" }),
            order({ ad_channel: "instagram", price: 30000, status: "completed" }),
            order({ ad_channel: "facebook", price: 50000, status: "delivered" }),
        ]);
        expect(stats.map(s => [s.channel, s.orders, s.revenue])).toEqual([
            ["instagram", 2, 70000],
            ["facebook", 1, 50000],
        ]);
    });

    it("counts an unrealized order but not its money", () => {
        // A confirmed order is not revenue until it is delivered.
        const [stat] = summarizeChannels([
            order({ ad_channel: "tiktok", price: 44750, status: "confirmed" }),
        ]);
        expect(stat.orders).toBe(1);
        expect(stat.revenue).toBe(0);
    });

    it("ignores returns and unattributed orders", () => {
        const stats = summarizeChannels([
            order({ ad_channel: "instagram", is_return: true }),
            order({ ad_channel: null }),
            order({}),
        ]);
        expect(stats).toEqual([]);
    });

    it("ranks by order count", () => {
        const stats = summarizeChannels([
            order({ ad_channel: "facebook" }),
            order({ ad_channel: "instagram" }),
            order({ ad_channel: "instagram" }),
        ]);
        expect(stats[0].channel).toBe("instagram");
    });
});

describe("AdChannelFilter", () => {
    const orders = [
        order({ ad_channel: "instagram" }),
        order({ ad_channel: "instagram" }),
        order({ ad_channel: "facebook" }),
    ];

    it("renders nothing when no order is attributed", () => {
        const { container } = render(
            <AdChannelFilter orders={[order({})]} selected={null} onSelect={() => {}} />,
        );
        expect(container.firstChild).toBeNull();
    });

    it("selects a channel and clears it on a second press", () => {
        const onSelect = vi.fn();
        // Query the button by its data attribute: the badge nested inside it also
        // carries an "Instagram" title.
        const { rerender, container } = render(
            <AdChannelFilter orders={orders} selected={null} onSelect={onSelect} />,
        );

        fireEvent.click(container.querySelector('[data-channel="instagram"]')!);
        expect(onSelect).toHaveBeenCalledWith("instagram");

        rerender(<AdChannelFilter orders={orders} selected="instagram" onSelect={onSelect} />);
        fireEvent.click(container.querySelector('[data-channel="instagram"]')!);
        expect(onSelect).toHaveBeenLastCalledWith(null);
    });

    it("offers an all-channels reset carrying the total", () => {
        const onSelect = vi.fn();
        render(<AdChannelFilter orders={orders} selected="facebook" onSelect={onSelect} />);
        const all = screen.getByText("كل القنوات").closest("button")!;
        expect(all.textContent).toContain("3");
        fireEvent.click(all);
        expect(onSelect).toHaveBeenCalledWith(null);
    });

    it("marks the selected channel", () => {
        const { container } = render(
            <AdChannelFilter orders={orders} selected="facebook" onSelect={() => {}} />,
        );
        expect(container.querySelector('[data-channel="facebook"][data-selected="true"]')).toBeTruthy();
        expect(container.querySelector('[data-channel="instagram"][data-selected="false"]')).toBeTruthy();
    });
});
