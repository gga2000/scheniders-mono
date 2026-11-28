import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CreateOrderInput } from "@/types/order";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ session: null }) }));
vi.mock("@/hooks/use-products-crud", () => ({ useProductsCrud: () => ({ products: [] }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (k: string) => k, locale: "ar" }) }));
vi.mock("@/app/actions/orders", () => ({ checkOrderLimitsAction: vi.fn(async () => ({ success: true })) }));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ toast: toasts }));
const fetched = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/authed-fetch", () => fetched);

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

/**
 * Store walkthrough 2026-11-16: the picker's open-time "now" was sent as the
 * order date, so every order was back-dated to when the form opened and its
 * history showed a date edit. Only a date the merchant picks is sent.
 */
describe("create order date", () => {
    const filled = {
        customer_name: "Ali",
        items: [{ product_id: "p1", name: "Shirt", price: 10000, quantity: 1 }],
    };

    it("sends no date unless the merchant picked one", async () => {
        const sent: CreateOrderInput[] = [];
        const onCreate = vi.fn(async (o: CreateOrderInput) => { sent.push(o); return { success: false, error: "x" }; });
        const { result } = renderHook(() =>
            useCreateOrderModel({ open: true, onClose: vi.fn(), onCreate, initialData: filled }),
        );
        act(() => result.current.handleOrderTypeChange("shop"));
        await act(async () => { await result.current.handleCreate(); });
        expect(sent[0].custom_created_at).toBeUndefined();

        const picked = "2026-11-10T09:00:00.000Z";
        act(() => result.current.setCustomCreatedAt(picked));
        await act(async () => { await result.current.handleCreate(); });
        expect(sent[1].custom_created_at).toBe(picked);
    });
});

/**
 * «احجي الطلب»: what Gemini heard fills the customer fields. A field it did
 * not hear keeps what the merchant typed, and spoken notes go after typed ones.
 */
describe("voice order fill", () => {
    const heard = (data: Record<string, string>, status = 200) =>
        fetched.authedFetch.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data }), { status }));
    const empty = { customer_name: "", phone: "", secondary_phone: "", city: "", address: "", notes: "" };

    function open() {
        return renderHook(() =>
            useCreateOrderModel({ open: true, onClose: vi.fn(), onCreate: vi.fn(), initialData: { customer_name: "", notes: "قطعة وحدة" } }),
        );
    }

    it("fills what it heard and keeps what it did not", async () => {
        const { result } = open();
        act(() => result.current.setFormData((f) => ({ ...f, secondary_phone: "07801112222" })));
        heard({ ...empty, customer_name: "حيدر كاظم", phone: "07701234567", city: "بغداد", address: "الكرادة قرب جامع الأورفلي", notes: "اتصلوا بعد العصر" });
        await act(async () => { await result.current.handleVoiceOrder(new Blob(["x"], { type: "audio/webm" })); });

        const sent = fetched.authedFetch.mock.calls.at(-1);
        expect(sent?.[0]).toBe("/api/orders/analyze-voice");
        expect((sent?.[1]?.body as FormData).get("audio")).toBeInstanceOf(Blob);
        const f = result.current.formData;
        expect(f.customer_name).toBe("حيدر كاظم");
        expect(f.phone).toBe("07701234567");
        expect(f.secondary_phone).toBe("07801112222");
        expect(f.city).toBe("بغداد");
        expect(f.address_details).toBe("الكرادة قرب جامع الأورفلي");
        expect(f.notes).toBe("قطعة وحدة اتصلوا بعد العصر");
        expect(result.current.voiceFilled).toBe(true);
        expect(result.current.isAnalyzingVoice).toBe(false);
        expect(toasts.success).toHaveBeenCalledWith("voice.order.filled");
    });

    it("warns and changes nothing when no order was heard", async () => {
        const { result } = open();
        heard(empty);
        await act(async () => { await result.current.handleVoiceOrder(new Blob(["x"])); });
        expect(toasts.warning).toHaveBeenCalledWith("voice.order.nothing");
        expect(result.current.formData.customer_name).toBe("");
        expect(result.current.voiceFilled).toBe(false);
    });

    it("says the day's tries are used up on 429", async () => {
        const { result } = open();
        fetched.authedFetch.mockResolvedValueOnce(new Response("{}", { status: 429 }));
        await act(async () => { await result.current.handleVoiceOrder(new Blob(["x"])); });
        expect(toasts.error).toHaveBeenCalledWith("voice.order.limit");
        expect(result.current.isAnalyzingVoice).toBe(false);
    });

    it("says it could not read the recording on a server failure", async () => {
        const { result } = open();
        fetched.authedFetch.mockResolvedValueOnce(new Response("{}", { status: 502 }));
        await act(async () => { await result.current.handleVoiceOrder(new Blob(["x"])); });
        expect(toasts.error).toHaveBeenCalledWith("voice.order.failed");
    });
});
