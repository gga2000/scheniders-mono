import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Order } from "@/types/order";

/*
 * {{7}} on cod_order_confirm (and on the staff new-order alert) quotes what
 * the courier will collect.
 *
 * Every source stores `price` net of the discount (lib/order-money). A
 * storefront order also records its delivery_fee at checkout
 * (apps/storefront/app/actions/checkout.ts), so its collectible amount is
 * price + delivery_fee; discount_amount is only a record and is never
 * subtracted again.
 *
 * Every other source keeps quoting `price` byte-for-byte.
 */

vi.mock("@/lib/env", () => ({
    env: { INTERAKT_API_KEY: "test-key" },
    providerBaseUrls: { INTERAKT_API_BASE_URL: "https://api.interakt.ai" },
}));

import { sendTemplateMessage, sendStaffAlertMessage } from "./interakt";

const fetchMock = vi.fn();

beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ result: true, id: "m1" }),
        text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

function order(overrides: Record<string, unknown>): Order {
    return {
        id: "uuid-1",
        order_id: "4261021001",
        customer_name: "علي حسن",
        phone: "07701234567",
        items: [{ name: "عطر", quantity: 1, price: 40000 }],
        price: 40000,
        city: "بغداد",
        address_details: "الكرادة",
        ...overrides,
    } as unknown as Order;
}

function sentTotal(): string {
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
        template: { bodyValues: string[] };
    };
    return body.template.bodyValues[6];
}

describe("{{7}} on storefront orders: price (net) + delivery", () => {
    it("confirmation quotes the net price plus delivery, without taking the discount off again", async () => {
        await sendTemplateMessage(
            order({ source: "storefront", price: 36000, discount_amount: 4000, delivery_fee: 5000 }),
            "confirmation",
        );
        expect(sentTotal()).toBe("IQD 41,000");
    });

    it("confirmation adds delivery when there is no discount", async () => {
        await sendTemplateMessage(
            order({ source: "storefront", price: 35000, discount_amount: 0, delivery_fee: 5000 }),
            "confirmation",
        );
        expect(sentTotal()).toBe("IQD 40,000");
    });

    it("confirmation treats a missing fee as zero", async () => {
        await sendTemplateMessage(
            order({ source: "storefront", price: 35000, discount_amount: null, delivery_fee: null }),
            "confirmation",
        );
        expect(sentTotal()).toBe("IQD 35,000");
    });

    it("the staff alert quotes the same amount", async () => {
        await sendStaffAlertMessage(
            order({ source: "storefront", price: 36000, discount_amount: 4000, delivery_fee: 5000 }),
            "07801234567",
        );
        expect(sentTotal()).toBe("IQD 41,000");
    });
});

describe("{{7}} on every other source: price, exactly as before", () => {
    it("a Lightfunnels order as the webhook creates it", async () => {
        await sendTemplateMessage(
            order({ source: "lightfunnels", price: 34750, discount_amount: 0, delivery_fee: 0 }),
            "confirmation",
        );
        expect(sentTotal()).toBe("IQD 34,750");
    });

    it("a Lightfunnels order staff later gave a discount and a fee (price is already net)", async () => {
        await sendTemplateMessage(
            order({ source: "lightfunnels", price: 30000, discount_amount: 4750, delivery_fee: 5000 }),
            "confirmation",
        );
        expect(sentTotal()).toBe("IQD 30,000");
    });

    it("the staff alert for that Lightfunnels order", async () => {
        await sendStaffAlertMessage(
            order({ source: "lightfunnels", price: 30000, discount_amount: 4750, delivery_fee: 5000 }),
            "07801234567",
        );
        expect(sentTotal()).toBe("IQD 30,000");
    });

    it("a manual WhatsApp-source order", async () => {
        await sendTemplateMessage(
            order({ source: "whatsapp", price: 25000, discount_amount: 2500, delivery_fee: 5000 }),
            "confirmation",
        );
        expect(sentTotal()).toBe("IQD 25,000");
    });
});
