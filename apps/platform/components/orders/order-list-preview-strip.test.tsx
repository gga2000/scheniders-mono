/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (k: string) => k }) }));

import { OrderListPreviewStrip } from "./order-list-preview-strip";

afterEach(cleanup);

/**
 * The strip mounts with the preview and unmounts when the full window lands,
 * 2-3s after first paint, right as the merchant starts reading. In the flow
 * above the list it pushed every row down ~48px and then pulled them back up.
 * It floats instead, so its coming and going moves nothing.
 */
describe("OrderListPreviewStrip", () => {
    it("floats over the page instead of taking space above the list", () => {
        render(<OrderListPreviewStrip />);
        const strip = screen.getByTestId("order-list-preview-strip");
        expect(strip.className.split(/\s+/)).toContain("fixed");
        expect(strip.className).not.toMatch(/\bm[by]-\d/);
    });

    it("sits above the mobile bottom nav when asked", () => {
        render(<OrderListPreviewStrip aboveMobileNav />);
        expect(screen.getByTestId("order-list-preview-strip").className).toContain("var(--mobile-nav-height)");
    });

    it("still announces why the rows are read-only", () => {
        render(<OrderListPreviewStrip />);
        const strip = screen.getByRole("status");
        expect(strip.textContent).toContain("orders.loadingAllOrders");
        expect(strip.textContent).toContain("orders.loadingAllOrdersHint");
    });
});
