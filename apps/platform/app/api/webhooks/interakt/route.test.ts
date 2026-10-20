import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    recordingSupabase,
    respond,
    resetRecording,
    queriesOn,
} from "@/lib/__fixtures__/recording-supabase";

/*
 * NEW-P1-17: the legacy (tenant-less URL) Interakt webhook confirmed or
 * cancelled the order and then wrote order_status_history and whatsapp_logs
 * WITHOUT tenant_id — 167 inbound log rows and most of the bot's 202 NULL
 * history rows in the last 30 days. Both writes must carry the order's tenant.
 */

const state = vi.hoisted(() => ({ env: { INTERAKT_WEBHOOK_SECRET: "legacy-secret" } as Record<string, string> }));

vi.mock("@/lib/env", () => ({ env: state.env }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: () => recordingSupabase }));
vi.mock("@/lib/whatsapp-delivery-receipts", () => ({
    INTERAKT_DELIVERY_STATUSES: {},
    recordWhatsAppDeliveryReceipt: vi.fn(),
}));

import { POST } from "./route";

const TENANT = "77777777-7777-4777-8777-777777777777";
const ORDER_UUID = "88888888-8888-4888-8888-888888888888";

const insertedRows = (table: string) =>
    queriesOn(table).flatMap((q) => q.ops.filter((o) => o.op === "insert").map((o) => o.args[0])) as Record<string, unknown>[];

beforeEach(() => {
    resetRecording();
    respond((q) => {
        if (q.target === "orders") {
            return { data: { id: ORDER_UUID, order_id: "#1001", status: "contacted", tenant_id: TENANT }, error: null };
        }
        return { data: null, error: null };
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/webhooks/interakt (legacy) tenant stamping", () => {
    it("stamps the order's tenant on the history and inbound-log rows", async () => {
        const res = await POST(
            new NextRequest("https://app.example.com/api/webhooks/interakt", {
                method: "POST",
                headers: { "x-webhook-secret": "legacy-secret" },
                body: JSON.stringify({
                    type: "message_api_clicked",
                    data: {
                        customer: { phone_number: "7700000000", country_code: "+964" },
                        message: { button_text: "تأكيد ✅", context: { callback_data: ORDER_UUID } },
                    },
                }),
            }),
        );

        expect(res.status).toBe(200);
        const history = insertedRows("order_status_history");
        expect(history).toHaveLength(1);
        expect(history[0]).toMatchObject({ order_id: ORDER_UUID, to_status: "confirmed", tenant_id: TENANT });

        const logs = insertedRows("whatsapp_logs");
        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatchObject({ order_uuid: ORDER_UUID, direction: "inbound", tenant_id: TENANT });
    });
});
