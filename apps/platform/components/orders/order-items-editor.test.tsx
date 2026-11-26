import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { OrderItemsEditor } from "./order-items-editor";
import { formatIQD } from "@/lib/utils";
import type { Order } from "@/types/order";

afterEach(cleanup);

const noop = () => {};

function view(order: Partial<Order>) {
    localStorage.setItem("schneiders_language", "ar");
    const full = { id: "o1", order_id: "4261106014", items: [{ name: "بيرسيفيرون", price: 44_750, quantity: 1 }], discount_amount: 0, ...order } as Order;
    return render(
        <LanguageProvider>
            <OrderItemsEditor
                isEditing={false}
                order={full}
                formData={{}}
                updateFormData={noop}
                handleAddItem={noop}
                handleUpdateItemQuantity={noop}
                handleRemoveItem={noop}
            />
        </LanguageProvider>,
    );
}

describe("OrderItemsEditor totals", () => {
    it("a refund names the pickup fee it keeps and totals what the customer gets, as its banner does (critic r18)", () => {
        // Refund of 44,750 with a 5,000 pickup fee kept: the banner says −39,750.
        const { container } = view({ is_return: true, price: -44_750, delivery_fee: 5_000 });
        const fee = container.querySelector("[data-refund-fee-row]");
        expect(fee?.textContent).toContain("رسوم الاسترجاع");
        expect(fee?.textContent).toContain(formatIQD(5_000));
        expect(container.textContent).toContain(formatIQD(-39_750));
        expect(container.textContent).not.toContain(formatIQD(-44_750));
    });

    it("a refund that keeps no fee shows no fee line", () => {
        const { container } = view({ is_return: true, price: -44_750, delivery_fee: 0 });
        expect(container.querySelector("[data-refund-fee-row]")).toBeNull();
        expect(container.textContent).toContain(formatIQD(-44_750));
    });

    it("a sale is unchanged: no fee line, the total is its price", () => {
        const { container } = view({ is_return: false, price: 44_750, delivery_fee: 5_000 });
        expect(container.querySelector("[data-refund-fee-row]")).toBeNull();
        expect(container.textContent).toContain(formatIQD(44_750));
    });
});
