import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CreateOrderInput } from "@/types/order";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ session: null }) }));
vi.mock("@/hooks/use-products-crud", () => ({ useProductsCrud: () => ({ products: [] }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (k: string) => k, locale: "ar" }) }));
vi.mock("@/app/actions/orders", () => ({ checkOrderLimitsAction: vi.fn(async () => ({ success: true })) }));
vi.mock("@/hooks/use-toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useCreateOrderModel } from "./use-create-order-model";

/**
 * Audit R2 N1: a lost response followed by a second press of Create must not
 * make a second order. Both presses send one idempotency key, which
 * create_order_atomic replays; a fresh form gets a fresh key.
 */
describe("create order idempotency key", () => {
    const filled = {
        customer_name: "Ali",
        items: [{ product_id: "p1", name: "Shirt", price: 10000, quantity: 1 }],
    };

    it("sends the same key on a retry and a new key after the form resets", async () => {
        const sent: CreateOrderInput[] = [];
        const onCreate = vi.fn(async (o: CreateOrderInput) => {
            sent.push(o);
            return sent.length === 1 ? { success: false, error: "network" } : { success: true };
        });
        const { result } = renderHook(() =>
            useCreateOrderModel({ open: true, onClose: vi.fn(), onCreate, initialData: filled }),
        );
        act(() => result.current.handleOrderTypeChange("shop"));

        await act(async () => { await result.current.handleCreate(); });
        await act(async () => { await result.current.handleCreate(); });
        expect(sent).toHaveLength(2);
        expect(sent[0].idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
        expect(sent[1].idempotency_key).toBe(sent[0].idempotency_key);

        act(() => result.current.resetForm());
        act(() => {
            result.current.handleOrderTypeChange("shop");
            result.current.setFormData((f) => ({ ...f, ...filled }));
        });
        await act(async () => { await result.current.handleCreate(); });
        expect(sent).toHaveLength(3);
        expect(sent[2].idempotency_key).not.toBe(sent[0].idempotency_key);
    });
});
