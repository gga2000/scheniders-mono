import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Order } from "@/types/order";

/*
 * Regression test for the "NEW app isn't sending" bug.
 *
 * triggerImmediateConfirmation used to fire an internal HTTP fetch to
 * /api/webhooks/interakt/dispatch-event using NEXT_PUBLIC_SITE_URL. When that
 * env var was missing it fell back to the protected VERCEL_URL → 401 → the send
 * failed silently (no message, no log). The dispatch now runs IN-PROCESS, so
 * these tests assert: (1) it sends without any HTTP self-call, and (2) the
 * notFound / auto-send-disabled branches behave correctly.
 */

const H = vi.hoisted(() => ({
    send: vi.fn(),
    state: { order: null as Order | null, autoSend: true },
}));

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: () => ({
        from: (table: string) => ({
            select: () => ({
                eq: () => {
                    const result = async () =>
                        table === "orders"
                            ? { data: H.state.order, error: null }
                            : table === "app_settings"
                                ? { data: { value: { enabled: H.state.autoSend } }, error: null }
                                : { data: null, error: null };
                    const chain = { single: result, eq: () => chain };
                    return chain;
                },
            }),
            insert: async () => ({ error: null }),
            update: () => ({ eq: async () => ({ error: null }) }),
        }),
    }),
}));

vi.mock("@/lib/interakt", () => ({
    sendTemplateMessage: H.send,
    TEMPLATE_NAMES: { confirmation: "cod_order_confirm", reminder: "order_reminder", discount: "order_discount_offer" },
}));

vi.mock("@/lib/whatsapp-error-handler", () => ({
    flagOrderForWhatsAppFailure: vi.fn(async () => {}),
    clearWhatsAppFailureFlags: vi.fn(async () => {}),
}));

import { triggerImmediateConfirmation, dispatchWhatsAppEvent } from "./whatsapp-dispatcher";

const fetchSpy = vi.fn();

beforeEach(() => {
    H.send.mockReset();
    H.send.mockResolvedValue({ success: true, messageId: "m1" });
    H.state.autoSend = true;
    H.state.order = {
        id: "uuid-1",
        order_id: "7209",
        customer_name: "محمد حسن",
        phone: "07728790786",
        items: [{ name: "انفوي", quantity: 1, price: 34750 }],
        price: 34750,
        status: "new",
    } as unknown as Order;
    fetchSpy.mockReset();
    vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => vi.unstubAllGlobals());

describe("whatsapp-dispatcher in-process dispatch", () => {
    it("triggerImmediateConfirmation sends WITHOUT any HTTP self-call", async () => {
        await triggerImmediateConfirmation("uuid-1", "07728790786");
        expect(H.send).toHaveBeenCalledTimes(1);
        expect(fetchSpy).not.toHaveBeenCalled(); // regression guard: no self-fetch
    });

    it("reports notFound for a missing order and does not send", async () => {
        H.state.order = null;
        const r = await dispatchWhatsAppEvent({ orderId: "missing" });
        expect(r.notFound).toBe(true);
        expect(H.send).not.toHaveBeenCalled();
    });

    it("skips (no send) when auto-send is disabled", async () => {
        H.state.autoSend = false;
        const r = await dispatchWhatsAppEvent({ orderId: "uuid-1" });
        expect(r.skipped).toBe(true);
        expect(H.send).not.toHaveBeenCalled();
    });
});
