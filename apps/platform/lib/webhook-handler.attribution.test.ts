import { describe, it, expect, vi } from "vitest";

// webhook-handler builds its service-role client lazily, but the module graph
// still reaches the server client factory; nothing here talks to a database.
vi.mock("./supabase-server", () => ({ createSupabaseServiceClient: () => ({}) }));

import { parseLightFunnelsPayload, parseCheckoutToWebhook } from "./webhook-handler";

// Shaped after a real LightFunnels order automation payload (node wrapper,
// flat items, utm pairs as `{ k, v }`).
function orderPayload(utm?: Array<{ k: string; v: string }>) {
    return {
        node: {
            id: "order_hnIxTFemTest",
            _id: 118653464,
            name: "7455",
            phone: "07802301677",
            customer: { full_name: "Test Customer" },
            shipping_address: { city: "بغداد", line1: "الكرادة" },
            items: [{ title: "عطر", price: 25000, sku: "SKU-1" }],
            total: 25000,
            ...(utm ? { utm } : {}),
        },
    };
}

function apiCheckout(utm?: Array<{ k: string; v: string }>) {
    return {
        id: "checkout_abc",
        _id: 119148519,
        phone: "07802301677",
        customer: { full_name: "Test Customer" },
        shipping_address: { city: "بغداد", line1: "الكرادة" },
        variants: [{ quantity: 1, variant: { title: "عطر", price: 25000, sku: "SKU-1" } }],
        total: 25000,
        ...(utm ? { utm } : {}),
    };
}

describe("ad attribution capture — LightFunnels order webhook", () => {
    it("derives the channel from the payload's utm pairs", () => {
        const parsed = parseLightFunnelsPayload(orderPayload([
            { k: "source", v: "ig" },
            { k: "medium", v: "Instagram_Reels" },
            { k: "campaign", v: "بيرسيفيرون" },
        ]));
        expect(parsed?.attribution).toEqual({
            channel: "instagram",
            source: "ig",
            medium: "Instagram_Reels",
            campaign: "بيرسيفيرون",
            content: undefined,
            adId: undefined,
            term: undefined,
        });
    });

    it("keeps the LightFunnels node id so a payload without utm can be looked up", () => {
        const parsed = parseLightFunnelsPayload(orderPayload());
        expect(parsed?.attribution).toBeUndefined();
        expect(parsed?.lf_node_id).toBe("order_hnIxTFemTest");
    });

    it("treats an unrendered Meta macro as no attribution", () => {
        const parsed = parseLightFunnelsPayload(orderPayload([{ k: "source", v: "{{site_source_name}}" }]));
        expect(parsed?.attribution).toBeUndefined();
    });
});

describe("ad attribution capture — checkout-sourced orders", () => {
    it("reads the checkout's utm pairs instead of dropping them", () => {
        const parsed = parseCheckoutToWebhook(apiCheckout([
            { k: "source", v: "tiktok" },
            { k: "medium", v: "paid" },
        ]));
        expect(parsed?.is_checkout).toBe(true);
        expect(parsed?.attribution?.channel).toBe("tiktok");
    });

    it("leaves attribution empty when the checkout carried none", () => {
        expect(parseCheckoutToWebhook(apiCheckout())?.attribution).toBeUndefined();
    });
});
