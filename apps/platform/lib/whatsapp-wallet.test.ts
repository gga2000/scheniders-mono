import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Order } from "@/types/order";

/**
 * Every WhatsApp message is paid from the shop's wallet, and a trial gets 200
 * free (Ali, 16 Nov). A shop that cannot pay, or a trial past its free
 * messages, is not sent, the order says why, and Interakt is never called.
 */

const WALLET_EMPTY = "Shop wallet cannot pay for WhatsApp";
const TRIAL_CAP = "Store used all free trial WhatsApp messages";
const refusal = vi.fn<(tenantId: string, category: "utility" | "marketing") => Promise<string | null>>();
const daySlot = vi.fn<(tenantId: string) => Promise<boolean>>();

vi.mock("@/lib/whatsapp-wallet", () => ({
    SHOP_WALLET_EMPTY: "Shop wallet cannot pay for WhatsApp",
    SHOP_TRIAL_CAP_REACHED: "Store used all free trial WhatsApp messages",
    SHOP_DAILY_CAP_REACHED: "Store reached today's WhatsApp limit",
    SHOP_WHATSAPP_PAUSED: "Store's automatic WhatsApp is paused",
    SHOP_DEMO_NOT_SENT: "Demo store, not sent",
    whatsappSendRefusal: (tenantId: string, category: "utility" | "marketing") => refusal(tenantId, category),
    takeDailySendSlot: (tenantId: string) => daySlot(tenantId),
}));
vi.mock("@/lib/supabase-server", async () =>
    (await import("@/lib/testing/store-contact-service-client")).storeContactSupabaseServer);

vi.mock("@/lib/env", () => ({
    env: { INTERAKT_API_KEY: "test-key", VERCEL_PROJECT_PRODUCTION_URL: "schenidersapp.xyz", INTERAKT_SENDER_TENANT_IDS: "11111111-1111-4111-8111-111111111111", NEXT_PUBLIC_SUPABASE_URL: "http://localhost", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" },
    providerBaseUrls: { INTERAKT_API_BASE_URL: "https://api.interakt.ai" },
}));

const { sendTemplateMessage, sendNamedTemplate, sendStaffAlertMessage } = await import("./interakt");
const { WHATSAPP_TEMPLATES } = await import("@scheniders/shared/whatsapp-templates");
const { categorizeWhatsAppFailure } = await import("./whatsapp-error-handler");

/** The confirmation a refused send would have gone out as (Fermi's own; the test shop has no custom one). */
const CONFIRM = WHATSAPP_TEMPLATES.confirmation.name;
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
    refusal.mockReset();
    daySlot.mockReset();
    daySlot.mockResolvedValue(true);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ result: true, id: "m1" }),
        text: async () => JSON.stringify({ result: true, id: "m1" }) });
    vi.stubGlobal("fetch", fetchMock);
});

describe("WhatsApp paid from the shop's wallet", () => {
    it("a shop that cannot pay is not sent and Interakt is never called", async () => {
        refusal.mockResolvedValue(WALLET_EMPTY);
        const res = await sendTemplateMessage(order, "confirmation");
        expect(res).toEqual({ success: false, error: WALLET_EMPTY, templateName: CONFIRM });
        expect(refusal).toHaveBeenCalledWith(TENANT, "utility");
        expect(fetchMock).not.toHaveBeenCalled();

        const named = await sendNamedTemplate({ tenantId: TENANT, phone: "07701234567", template: WHATSAPP_TEMPLATES.deliveryUpdate, bodyValues: ["a"], label: "7209" });
        expect(named).toEqual({ success: false, error: WALLET_EMPTY });
        const staff = await sendStaffAlertMessage(order, "07801234567");
        expect(staff).toEqual({ success: false, error: WALLET_EMPTY });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("asks at the price of the kind of message: a discount offer is marketing", async () => {
        refusal.mockResolvedValue(null);
        await sendTemplateMessage(order, "discount", undefined, 10);
        await sendTemplateMessage(order, "reminder");
        expect(refusal.mock.calls.map((c) => c[1])).toEqual(["marketing", "utility"]);
    });

    it("a trial past its free messages is not sent, and the order says why", async () => {
        refusal.mockResolvedValue(TRIAL_CAP);
        const res = await sendTemplateMessage(order, "confirmation");
        expect(res).toEqual({ success: false, error: TRIAL_CAP, templateName: CONFIRM });
        expect(fetchMock).not.toHaveBeenCalled();
        const flags = categorizeWhatsAppFailure(res, "7209", "0770");
        expect(flags.attention_reasons).toEqual(["whatsapp_trial_cap"]);
        expect(flags.delivery_note).toContain("خلصت رسائل التجربة");
    });

    it("a shop that can pay is sent", async () => {
        refusal.mockResolvedValue(null);
        const res = await sendTemplateMessage(order, "confirmation");
        expect(res.success).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const staff = await sendStaffAlertMessage(order, "07801234567");
        expect(staff.success).toBe(true);
        expect(JSON.parse(fetchMock.mock.calls[1][1].body).template.name).toBe("new_order_alert_staff");
    });

    it("the order says 'not sent, top up' for the shop's wallet, apart from our Interakt wallet", () => {
        const shop = categorizeWhatsAppFailure({ success: false, error: "Shop wallet cannot pay for WhatsApp" }, "7209", "0770");
        expect(shop.attention_reasons).toEqual(["whatsapp_shop_wallet_empty"]);
        const ours = categorizeWhatsAppFailure({ success: false, error: "Your wallet doesn't have sufficient balance." }, "7209", "0770");
        expect(ours.attention_reasons).toEqual(["whatsapp_wallet_empty"]);
    });
});

describe("a store paused to protect the shared number", () => {
    it("is not sent, Interakt is never called, and the order says to confirm by hand", async () => {
        refusal.mockResolvedValue("Store's automatic WhatsApp is paused");
        const res = await sendTemplateMessage(order, "confirmation");
        expect(res).toEqual({ success: false, error: "Store's automatic WhatsApp is paused", templateName: CONFIRM });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(daySlot).not.toHaveBeenCalled();
        const flags = categorizeWhatsAppFailure(res, "7209", "0770");
        expect(flags.attention_reasons).toEqual(["whatsapp_paused"]);
        expect(flags.delivery_note).toContain("أكّد الطلب يدوياً");
    });
});

describe("each store's daily WhatsApp limit", () => {
    it("a store past today's limit is not sent and Interakt is never called", async () => {
        refusal.mockResolvedValue(null);
        daySlot.mockResolvedValue(false);
        const res = await sendTemplateMessage(order, "confirmation");
        expect(res).toEqual({ success: false, error: "Store reached today's WhatsApp limit", templateName: CONFIRM });
        expect(daySlot).toHaveBeenCalledWith(TENANT);

        const named = await sendNamedTemplate({ tenantId: TENANT, phone: "07701234567", template: WHATSAPP_TEMPLATES.deliveryUpdate, bodyValues: ["a"], label: "7209" });
        expect(named).toEqual({ success: false, error: "Store reached today's WhatsApp limit" });
        const staff = await sendStaffAlertMessage(order, "07801234567");
        expect(staff).toEqual({ success: false, error: "Store reached today's WhatsApp limit" });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a shop that cannot pay does not use up a daily send", async () => {
        refusal.mockResolvedValue(WALLET_EMPTY);
        await sendTemplateMessage(order, "confirmation");
        expect(daySlot).not.toHaveBeenCalled();
    });

    it("the order says the store hit its daily limit", () => {
        const flags = categorizeWhatsAppFailure({ success: false, error: "Store reached today's WhatsApp limit" }, "7209", "0770");
        expect(flags.attention_reasons).toEqual(["whatsapp_rate_limited"]);
    });
});

describe("the demo store (Fermi B13)", () => {
    const DEMO = "Demo store, not sent";
    const demoOrder = { ...order, tenant_id: "22222222-2222-4222-8222-222222222222" } as Order;

    it("is told demo, not sent, before the shared number's list, and nothing goes out", async () => {
        refusal.mockResolvedValue(DEMO);
        expect(await sendTemplateMessage(demoOrder, "confirmation")).toEqual({ success: false, error: DEMO, templateName: CONFIRM });
        expect(await sendNamedTemplate({ tenantId: demoOrder.tenant_id!, phone: "07701234567", template: WHATSAPP_TEMPLATES.deliveryUpdate, bodyValues: ["a"], label: "7209" }))
            .toEqual({ success: false, error: DEMO });
        expect(await sendStaffAlertMessage(demoOrder, "07801234567")).toEqual({ success: false, error: DEMO });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(daySlot).not.toHaveBeenCalled();
    });

    it("a store off the shared number's list is still refused for that", async () => {
        refusal.mockResolvedValue(null);
        const res = await sendTemplateMessage(demoOrder, "confirmation");
        expect(res).toEqual({ success: false, error: "This store is not set up to send WhatsApp from the shared number", templateName: CONFIRM });
    });

    it("its order is not flagged for a message that never went", async () => {
        const { flagOrderForWhatsAppFailure } = await import("./whatsapp-error-handler");
        await flagOrderForWhatsAppFailure("uuid-1", { success: false, error: DEMO }, "7209", "0770");
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
