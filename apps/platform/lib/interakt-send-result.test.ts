import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Order } from "@/types/order";

/**
 * OBS-3 guard, the send side. `sendTemplateMessage` read the provider's message
 * id as `data.message_id`, a shape Interakt does not send — it returns `id` at
 * the top level. The consequence was silent: every send succeeded, every log row
 * recorded `interakt_message_id: null`, and no send could ever be matched to its
 * delivery receipt. All 8,862 rows in the live table are like this.
 *
 * The response body below is copied verbatim from a live row.
 */

vi.mock("@/lib/env", () => ({
    env: { INTERAKT_API_KEY: "test-key" },
    providerBaseUrls: { INTERAKT_API_BASE_URL: "https://api.interakt.ai" },
}));

import { sendTemplateMessage } from "./interakt";

const LIVE_SUCCESS_RESPONSE = {
    result: true,
    message: "Message queued for sending via Interakt. Check webhook for delivery status",
    id: "04a77cb4-cd8f-4a7a-b787-eea9f5af4caa",
};

const order = {
    id: "uuid-1",
    order_id: "7209",
    customer_name: "محمد حسن",
    phone: "07701234567",
    city: "بغداد",
    address_details: "الكرادة",
    price: 25000,
    status: "new",
    created_at: "2026-09-01T00:00:00.000Z",
    items: [{ name: "منتج", quantity: 1, price: 25000 }],
} as unknown as Order;

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
    fetchSpy = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => LIVE_SUCCESS_RESPONSE,
    }));
    vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("sendTemplateMessage", () => {
    it("captures the message id Interakt actually returns", async () => {
        const result = await sendTemplateMessage(order);

        expect(result.success).toBe(true);
        // The whole point: without this, delivery rate cannot be computed.
        expect(result.messageId).toBe("04a77cb4-cd8f-4a7a-b787-eea9f5af4caa");
    });

    it("does not report a successful send through the error field", async () => {
        const result = await sendTemplateMessage(order);

        // The raw response used to be assigned to `error` on the success path
        // "temporarily, for debugging", so every successful send carried what
        // looked like an error message.
        expect(result.error).toBeUndefined();
        expect(result.raw).toEqual(LIVE_SUCCESS_RESPONSE);
    });

    it("reports a real failure through the error field", async () => {
        fetchSpy.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ result: false, message: "Invalid phone number" }),
        });

        const result = await sendTemplateMessage(order);

        expect(result.success).toBe(false);
        expect(result.error).toBe("Invalid phone number");
        expect(result.messageId).toBeUndefined();
    });
});
