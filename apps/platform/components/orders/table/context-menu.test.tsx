/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Order } from "@/lib/supabase";
import { LanguageProvider } from "@/components/providers/language-provider";
import { OrderContextMenu } from "./context-menu";

afterEach(cleanup);

function setup(status: string) {
    const onDelete = vi.fn();
    const onClose = vi.fn();
    const order = { id: "o1", order_id: "7001", status, phone: "07700000000", customer_name: "A" } as unknown as Order;
    render(
        <LanguageProvider>
            <OrderContextMenu x={0} y={0} order={order} onClose={onClose} onStatusChange={vi.fn()} onOpenDetails={vi.fn()} onDelete={onDelete} />
        </LanguageProvider>,
    );
    const deleteButton = () => screen.getAllByRole("button").at(-1) as HTMLElement;
    return { onDelete, onClose, deleteButton };
}

describe("OrderContextMenu delete", () => {
    it("deletes an open order on the first click", () => {
        const { onDelete, onClose, deleteButton } = setup("new");
        fireEvent.click(deleteButton());
        expect(onDelete).toHaveBeenCalledWith("o1");
        expect(onClose).toHaveBeenCalled();
    });

    it.each(["in_transit", "delivered", "completed"])("offers no delete on a %s order: it is cancelled or returned (board O1)", (status) => {
        setup(status);
        expect(screen.queryByText("حذف")).toBeNull();
    });
});
