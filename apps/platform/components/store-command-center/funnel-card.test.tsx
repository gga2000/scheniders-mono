/// <reference types="vitest/globals" />
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FunnelCard } from "./funnel-card";
import { parseFunnel } from "@/hooks/use-storefront-funnel";

afterEach(cleanup);

const funnel = parseFunnel({
    visitors: 200, product_viewers: 120, cart_adders: 30, checkout_starters: 40, buyers: 10,
    page_views: 900, purchases: 11, revenue_iqd: 330000,
    series: [{ day: "2026-09-09", visitors: 200, purchases: 11 }],
    top_products: [{ product_id: "p1", name: "عطر", viewers: 80, buyers: 8 }],
});

describe("FunnelCard", () => {
    it("shows each stage as a share of the stage before it, and the overall conversion", () => {
        render(<FunnelCard funnel={funnel} isLoading={false} locale="ar" />);
        expect(screen.getByTestId("funnel-stage-product").textContent).toContain("60%");
        expect(screen.getByTestId("funnel-stage-checkout").textContent).toContain("33%");
        expect(screen.getByTestId("funnel-stage-buyers").textContent).toContain("25%");
        expect(screen.getByTestId("funnel-conversion").textContent).toBe("5%");
        expect(screen.getByText("عطر")).toBeTruthy();
    });

    it("says so when nothing has been recorded yet, and parses garbage to zeros", () => {
        render(<FunnelCard funnel={parseFunnel(null)} isLoading={false} locale="en" />);
        expect(screen.getByTestId("funnel-empty")).toBeTruthy();
        expect(parseFunnel({ visitors: "x", series: "nope" })).toMatchObject({ visitors: 0, series: [], top_products: [] });
    });
});
