import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Order } from "@/types/order";

/**
 * Every WhatsApp message is paid from the shop's wallet (Ali, 9 Nov). A shop
 * that cannot pay is not sent, the order says why, and Interakt is never called.
 */

const canPay = vi.fn<(tenantId: string) => Promise<boolean>>();

vi.mock("@/lib/whatsapp-wallet", () => ({
    SHOP_WALLET_EMPTY: "Shop wallet cannot pay for WhatsApp",
    shopCanPayForWhatsApp: (tenantId: string) => canPay(tenantId),
}));
vi.mock("@/lib/env", () => ({
    env: { INTERAKT_API_KEY: "test-key", VERCEL_PROJECT_PRODUCTION_URL: "schenidersapp.xyz", INTERAKT_SENDER_TENANT_IDS: "11111111-1111-4111-8111-111111111111", NEXT_PUBLIC_SUPABASE_URL: "http://localhost", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" },
    providerBaseUrls: { INTERAKT_API_BASE_URL: "https://api.interakt.ai" },
}));

const { sendTemplateMessage, sendNamedTemplate } = await import("./interakt");
const { categorizeWhatsAppFailure } = await import("./whatsapp-error-handler");

const TENANT = "11111111-1111-4111-8111-111111111111";
const order = {
    id: "uuid-1",
    order_id: "7209",
    tenant_id: TENANT,
    customer_name: "محمد",
    phone: "07701234567",
    price: 25000,
    status: "new",
    created_at: "2026-09-01T00:00:00.000Z",
    items: [{ name: "منتج", quantity: 1, price: 25000 }],
} as unknown as Order;

const fetchMock = vi.fn();

beforeEach(() => {
    canPay.mockReset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ result: true, id: "m1" }),
        text: async () => JSON.stringify({ result: true, id: "m1" }) });
    vi.stubGlobal("fetch", fetchMock);
});

describe("WhatsApp paid from the shop's wallet", () => {
    it("a shop that cannot pay is not sent and Interakt is never called", async () => {
        canPay.mockResolvedValue(false);
        const res = await sendTemplateMessage(order, "confirmation");
        expect(res).toEqual({ success: false, error: "Shop wallet cannot pay for WhatsApp" });
        expect(canPay).toHaveBeenCalledWith(TENANT);
        expect(fetchMock).not.toHaveBeenCalled();

        const named = await sendNamedTemplate({ tenantId: TENANT, phone: "07701234567", name: "x", languageCode: "ar", bodyValues: ["a"], label: "7209" });
        expect(named.success).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a shop that can pay is sent", async () => {
        canPay.mockResolvedValue(true);
        const res = await sendTemplateMessage(order, "confirmation");
        expect(res.success).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("the order says 'not sent, top up' for the shop's wallet, apart from our Interakt wallet", () => {
        const shop = categorizeWhatsAppFailure({ success: false, error: "Shop wallet cannot pay for WhatsApp" }, "7209", "0770");
        expect(shop.attention_reasons).toEqual(["whatsapp_shop_wallet_empty"]);
        const ours = categorizeWhatsAppFailure({ success: false, error: "Your wallet doesn't have sufficient balance." }, "7209", "0770");
        expect(ours.attention_reasons).toEqual(["whatsapp_wallet_empty"]);
    });
});
