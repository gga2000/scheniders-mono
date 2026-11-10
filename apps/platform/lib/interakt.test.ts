import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Order } from "@/types/order";

/*
 * Regression test for the Interakt 400:
 *   "Body's variable value should not contain any tabs, newline or more than
 *    2 consecutive spaces"
 *
 * Customer-entered fields (notably the free-form address) can contain runs of
 * spaces / tabs / newlines. Those were passed straight into Interakt template
 * variables, so a single messy order broke its WhatsApp confirmation. Every
 * outgoing template variable must be whitespace-normalized.
 */

// Provide an API key so sendTemplateMessage proceeds to the fetch.
vi.mock("@/lib/whatsapp-wallet", () => ({
    SHOP_WALLET_EMPTY: "Shop wallet cannot pay for WhatsApp",
    shopCanPayForWhatsApp: vi.fn(async () => true),
}));

vi.mock("@/lib/env", () => ({
    env: { INTERAKT_API_KEY: "test-key", VERCEL_PROJECT_PRODUCTION_URL: "schenidersapp.xyz", INTERAKT_SENDER_TENANT_IDS: "11111111-1111-4111-8111-111111111111" },
    providerBaseUrls: { INTERAKT_API_BASE_URL: "https://api.interakt.ai" },
}));

import { sendTemplateMessage, shopperName, shopperText } from "./interakt";

const fetchMock = vi.fn();

beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ result: true, data: { message_id: "m1" } }),
        text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

function makeOrder(overrides: Partial<Order> = {}): Order {
    return {
        id: "uuid-1",
        order_id: "7208",
        tenant_id: "11111111-1111-4111-8111-111111111111",
        customer_name: "عدنان علي",
        phone: "07702770786",
        items: [{ name: "انفوي", quantity: 1, price: 34750 }],
        price: 34750,
        city: "بغداد",
        // 3 consecutive spaces + a stray tab/newline — exactly the shape Interakt rejects
        address_details: "مدينة الحريه/بستان الجلبي   قرب\tص.اريان\nابرا",
        ...overrides,
    } as unknown as Order;
}

describe("Interakt template variable sanitization", () => {
    it("strips tabs/newlines and collapses 3+ spaces in every body variable", async () => {
        const res = await sendTemplateMessage(makeOrder(), "confirmation");

        expect(res.success).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
        const values: string[] = sentBody.template.bodyValues;

        expect(values.length).toBeGreaterThan(0);
        for (const v of values) {
            expect(v).not.toMatch(/[\t\n\r]/);
            expect(v).not.toMatch(/ {3,}/);
        }
        // The address variable is now single-spaced.
        expect(values.some((v) => v.includes("الجلبي قرب"))).toBe(true);
    });

    it("never sends an empty body variable", async () => {
        await sendTemplateMessage(
            makeOrder({ customer_name: "   " as unknown as string }),
            "confirmation",
        );
        const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
        const values: string[] = sentBody.template.bodyValues;
        for (const v of values) {
            expect(v.length).toBeGreaterThan(0);
        }
    });
});

describe("Interakt template header picture", () => {
    it.each([
        ["confirmation", "new_cod_order_confirm", "en", "order-confirm.png"],
        ["reminder", "v2_order_reminder", "ar", "order-reminder.png"],
        ["discount", "v2order_discount_offer", "en", "order-discount.png"],
    ] as const)("sends %s as the approved copy with its picture", async (type, name, language, picture) => {
        await sendTemplateMessage(makeOrder(), type);
        const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
        expect(sent.template.name).toBe(name);
        expect(sent.template.languageCode).toBe(language);
        expect(sent.template.headerValues).toEqual([`https://schenidersapp.xyz/whatsapp/${picture}`]);
    });
});

describe("shopperText: typed name/address cannot carry a link to the recipient", () => {
    it("removes links and bare domains, keeps Arabic text", () => {
        expect(shopperText("طلبك ملغى استرجع فلوسك https://evil.example/x", 60)).toBe("طلبك ملغى استرجع فلوسك");
        expect(shopperText("علي www.bad.io كرادة", 60)).toBe("علي كرادة");
        expect(shopperText("visit evil.example/refund now", 60)).toBe("visit now");
        expect(shopperText("بغداد - الكرادة قرب جامع ١٢", 160)).toBe("بغداد - الكرادة قرب جامع ١٢");
    });

    it("drops every spelling of a dot, so look-alike domains cannot form a link", () => {
        expect(shopperText("evil。com/x", 60)).not.toMatch(/[.。]/);
        expect(shopperText("ﻫ.com", 60)).not.toContain(".");
        expect(shopperText("bit . ly/abc", 60)).not.toContain(".");
        expect(shopperText("evil．com", 60)).not.toMatch(/[.．]/);
        expect(shopperText("محمد علي", 60)).toBe("محمد علي");
        expect(shopperText("O'Neil-Smith", 60)).toBe("O'Neil-Smith");
    });

    it("caps length", () => {
        const out = shopperText("أ".repeat(300), 60);
        expect(out.length).toBe(60);
        expect(out.endsWith("…")).toBe(true);
    });
});

describe("shopperName", () => {
    it("drops digits so a name cannot carry a phone number, in any script", () => {
        expect(shopperName("اتصل 07701234567 علي")).toBe("اتصل علي");
        expect(shopperName("Ali ٠٧٧٠١٢٣٤٥٦٧")).toBe("Ali");
        expect(shopperName("Ali ０７７０")).toBe("Ali");
    });

    it("keeps a normal name", () => {
        expect(shopperName("علي حسن")).toBe("علي حسن");
    });
});
