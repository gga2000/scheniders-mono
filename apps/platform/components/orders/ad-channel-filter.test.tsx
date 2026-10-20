/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Order } from "@/types/order";
import { summarizeAdChannels } from "@/lib/ad-channel-filter";
import { AdChannelFilter } from "./ad-channel-filter";

afterEach(cleanup);

let seq = 0;
function order(overrides: Partial<Order> = {}): Order {
    seq += 1;
    return {
        id: `o-${seq}`,
        order_id: String(seq),
        customer_name: "x",
        phone: "07700000000",
        items: [],
        price: 10000,
        status: "new",
        priority: "normal",
        payment_status: "cod",
        created_at: "2026-10-12T00:00:00.000Z",
        is_return: false,
        is_archived: false,
        ...overrides,
    } as Order;
}

const summary = summarizeAdChannels([
    order({ ad_channel: "instagram" }),
    order({ ad_channel: "instagram" }),
    order({ ad_channel: "facebook" }),
    order({ ad_channel: null }),
]);

function chip(container: HTMLElement, channel: string): HTMLElement {
    const el = container.querySelector<HTMLElement>(`[data-channel="${channel}"]`);
    if (!el) throw new Error(`no chip for ${channel}`);
    return el;
}

describe("AdChannelFilter", () => {
    it("renders nothing when no order in view is attributed", () => {
        const { container } = render(
            <AdChannelFilter summary={summarizeAdChannels([order({})])} selected={null} onSelect={() => {}} />,
        );
        expect(container.firstChild).toBeNull();
    });

    it("keeps a way back out when the pinned channel has no orders in this view", () => {
        const onSelect = vi.fn();
        render(<AdChannelFilter summary={summarizeAdChannels([order({})])} selected="tiktok" onSelect={onSelect} />);
        fireEvent.click(screen.getByText("كل القنوات"));
        expect(onSelect).toHaveBeenCalledWith(null);
    });

    it("selects a channel and clears it on a second press", () => {
        const onSelect = vi.fn();
        const { rerender, container } = render(
            <AdChannelFilter summary={summary} selected={null} onSelect={onSelect} />,
        );
        fireEvent.click(chip(container, "instagram"));
        expect(onSelect).toHaveBeenCalledWith("instagram");

        rerender(<AdChannelFilter summary={summary} selected="instagram" onSelect={onSelect} />);
        fireEvent.click(chip(container, "instagram"));
        expect(onSelect).toHaveBeenLastCalledWith(null);
    });

    // Was "an all-channels total of attributed orders" (3): a number that is not
    // the size of the list the chip opens. Every count on /orders is now the
    // length of the list its click opens, so the chip shows the whole view (4)
    // and the attributed share moves to its title.
    it("shows per-channel counts and an all-channels total equal to the list it opens, with the attributed share in its title", () => {
        const { container } = render(<AdChannelFilter summary={summary} selected={null} onSelect={() => {}} />);
        expect(chip(container, "instagram").textContent).toContain("2");
        expect(chip(container, "facebook").textContent).toContain("1");
        const all = screen.getByText("كل القنوات").closest("button");
        expect(all?.textContent).toContain("4");
        expect(all?.textContent).not.toContain("3");
        // The unattributed order is disclosed, not hidden.
        expect(all?.getAttribute("title")).toContain("3 من 4");
    });

    it("hides every number and revenue figure with countsHidden, and the chips stay clickable", () => {
        const revenueSummary = summarizeAdChannels([
            order({ ad_channel: "instagram", status: "delivered", price: 25000 }),
            order({ ad_channel: "facebook" }),
        ]);
        const onSelect = vi.fn();
        const { container } = render(
            <AdChannelFilter summary={revenueSummary} selected={null} onSelect={onSelect} countsHidden />,
        );
        const root = container.querySelector<HTMLElement>('[data-testid="ad-channel-filter"]');
        expect(root?.textContent ?? "").not.toMatch(/\d/);
        for (const el of container.querySelectorAll("button")) {
            expect(el.getAttribute("title") ?? "").not.toMatch(/\d/);
        }
        fireEvent.click(chip(container, "instagram"));
        expect(onSelect).toHaveBeenCalledWith("instagram");
    });

    it("marks the selected channel", () => {
        const { container } = render(<AdChannelFilter summary={summary} selected="facebook" onSelect={() => {}} />);
        expect(chip(container, "facebook").dataset.selected).toBe("true");
        expect(chip(container, "instagram").dataset.selected).toBe("false");
    });
});
