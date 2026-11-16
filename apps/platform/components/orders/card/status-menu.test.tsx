/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Order } from "@/lib/supabase";
import { LanguageProvider } from "@/components/providers/language-provider";
import { CardStatusMenu } from "./status-menu";

afterEach(cleanup);

// Items render in the menu's fixed order; the label language follows the provider.
const ORDER = ["new", "pending_checkout", "contacted", "confirmed", "in_transit", "delivered", "completed", "cancelled"];
const item = (status: string) => screen.getAllByRole("menuitem")[ORDER.indexOf(status)];

const order = { id: "o1", order_id: "7001", status: "new", is_return: false } as unknown as Order;

function open(handlers: Partial<React.ComponentProps<typeof CardStatusMenu>> = {}) {
    const onStatusUpdate = vi.fn();
    render(
        <LanguageProvider>
            <CardStatusMenu order={order} onStatusUpdate={onStatusUpdate} {...handlers}>
                <span>badge</span>
            </CardStatusMenu>
        </LanguageProvider>,
    );
    fireEvent.keyDown(screen.getByText("badge").parentElement as HTMLElement, { key: "Enter" });
    return onStatusUpdate;
}

describe("CardStatusMenu", () => {
    it("sets a plain status directly", () => {
        const onStatusUpdate = open();
        fireEvent.click(item("confirmed"));
        expect(onStatusUpdate).toHaveBeenCalledWith("o1", "confirmed");
    });

    it("sends cancel and reject through their reason dialogs", () => {
        const onCancelWithReason = vi.fn();
        const onRejectWithReason = vi.fn();
        const onStatusUpdate = open({ onCancelWithReason, onRejectWithReason });
        fireEvent.click(item("cancelled"));
        expect(onCancelWithReason).toHaveBeenCalledWith(order);
        expect(onStatusUpdate).not.toHaveBeenCalled();
    });

    it("cancels directly when the card has no reason dialog", () => {
        const onStatusUpdate = open();
        fireEvent.click(item("cancelled"));
        expect(onStatusUpdate).toHaveBeenCalledWith("o1", "cancelled");
    });
});
