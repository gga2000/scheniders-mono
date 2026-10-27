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
vi.mock("@/lib/env", () => ({
    env: { INTERAKT_API_KEY: "test-key" },
    providerBaseUrls: { INTERAKT_API_BASE_URL: "https://api.interakt.ai" },
}));

import { sendTemplateMessage } from "./interakt";

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
