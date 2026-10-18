import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * OBS-3 guard. WhatsApp delivery rate was unanswerable for three reasons, and
 * two of them were a misread of the provider's payload shapes. The fixtures
 * below are the exact shapes taken from live rows, so a future edit that
 * "tidies" the field paths fails here rather than silently zeroing the metric
 * again.
 */

const inserted: Record<string, unknown>[] = [];
const originRow = {
    value: null as Record<string, unknown> | null,
};

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: () => ({
        from: () => ({
            select: () => ({
                eq: () => ({
                    eq: () => ({
                        order: () => ({
                            limit: () => ({
                                maybeSingle: async () => ({ data: originRow.value, error: null }),
                            }),
                        }),
                    }),
                }),
            }),
            insert: async (row: Record<string, unknown>) => {
                inserted.push(row);
                return { error: null };
            },
        }),
    }),
}));

import {
    extractReceiptMessageId,
    recordWhatsAppDeliveryReceipt,
    INTERAKT_DELIVERY_STATUSES,
} from "./whatsapp-delivery-receipts";

// The exact shape of a live `message_api_delivered` webhook, trimmed to the
// fields that are read. The id here is the same value the send response returns.
const DELIVERED_RECEIPT = {
    type: "message_api_delivered",
    data: {
        message: {
            id: "f2b5042e-14a9-463c-b0e1-c63f2d1b3e4d",
            meta_data: { source_data: { callback_data: "staff_alert:ecf63b78-c155-4aa3-89d2-70f01087607e" } },
            message_status: "Delivered",
        },
        customer: { phone_number: "7801234567", country_code: "+964" },
    },
};

beforeEach(() => {
    inserted.length = 0;
    originRow.value = null;
});

describe("interakt delivery receipts", () => {
    it("reads the message id from where Interakt actually puts it", () => {
        expect(extractReceiptMessageId(DELIVERED_RECEIPT)).toBe("f2b5042e-14a9-463c-b0e1-c63f2d1b3e4d");
    });

    it("returns null rather than a placeholder when there is no id", () => {
        expect(extractReceiptMessageId({ data: { message: {} } })).toBeNull();
        expect(extractReceiptMessageId({})).toBeNull();
    });

    it("maps the four delivery webhook types and nothing else", () => {
        expect(INTERAKT_DELIVERY_STATUSES["message_api_delivered"]).toBe("delivered");
        expect(INTERAKT_DELIVERY_STATUSES["message_api_read"]).toBe("read");
        expect(INTERAKT_DELIVERY_STATUSES["message_api_failed"]).toBe("failed");
        expect(INTERAKT_DELIVERY_STATUSES["message_api_sent"]).toBe("sent");
        // A button click is not a delivery status — it has its own handling, and
        // treating it as one would stop the click from ever being processed.
        expect(INTERAKT_DELIVERY_STATUSES["message_api_clicked"]).toBeUndefined();
    });

    it("takes the tenant, order and template from the send it belongs to", async () => {
        originRow.value = {
            tenant_id: "tenant-1",
            order_id: "7209",
            order_uuid: "uuid-1",
            template_name: "new_order_alert_staff",
        };

        await recordWhatsAppDeliveryReceipt(DELIVERED_RECEIPT, "delivered", "tenant-from-url");

        expect(inserted).toHaveLength(1);
        expect(inserted[0]).toMatchObject({
            tenant_id: "tenant-1",
            order_id: "7209",
            order_uuid: "uuid-1",
            // Was hardcoded to "cod_order_confirm" on every receipt, including
            // receipts for staff alerts like this one.
            template_name: "new_order_alert_staff",
            direction: "status_update",
            status: "delivered",
            interakt_message_id: "f2b5042e-14a9-463c-b0e1-c63f2d1b3e4d",
        });
    });

    it("falls back to the endpoint's tenant and the callback when the send is not found", async () => {
        await recordWhatsAppDeliveryReceipt(DELIVERED_RECEIPT, "read", "tenant-from-url");

        expect(inserted[0]).toMatchObject({
            tenant_id: "tenant-from-url",
            order_id: "staff_alert:ecf63b78-c155-4aa3-89d2-70f01087607e",
            template_name: null,
            status: "read",
        });
    });

    it("never throws, so a webhook is not retried over a logging failure", async () => {
        await expect(
            recordWhatsAppDeliveryReceipt(null as unknown as Record<string, never>, "delivered"),
        ).resolves.toBeUndefined();
    });
});
