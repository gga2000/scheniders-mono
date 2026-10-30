/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { AbandonedCartAccent } from "./abandoned-cart-accent";

afterEach(cleanup);

const base = {
    status: "contacted",
    abandoned_cart_at: "2026-10-30T07:00:00.000Z",
    abandoned_cart_outcome: "contacted",
    abandoned_cart_resolved_by_name: "karrar",
} as const;

describe("AbandonedCartAccent", () => {
    it("paints the top half of a vertical stripe for an order that came from a cart", () => {
        const { container } = render(<AbandonedCartAccent order={base} orientation="vertical" />);
        const el = container.querySelector("[data-abandoned-cart-accent]");
        expect(el?.className).toContain("h-1/2");
        expect(el?.className).toContain("top-0");
    });

    it("paints the leading half of a horizontal bar", () => {
        const { container } = render(<AbandonedCartAccent order={base} orientation="horizontal" />);
        expect(container.querySelector("[data-abandoned-cart-accent]")?.className).toContain("w-1/2");
    });

    it("renders nothing for an ordinary order or a cart still open", () => {
        const plain = render(
            <AbandonedCartAccent order={{ ...base, abandoned_cart_at: null, abandoned_cart_outcome: null }} orientation="vertical" />,
        );
        expect(plain.container.innerHTML).toBe("");
        cleanup();
        const open = render(<AbandonedCartAccent order={{ ...base, status: "pending_checkout" }} orientation="vertical" />);
        expect(open.container.innerHTML).toBe("");
    });
});
