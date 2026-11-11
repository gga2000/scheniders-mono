import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    recordingSupabase,
    respond,
    resetRecording,
    queriesOn,
    hasEq,
} from "@/lib/__fixtures__/recording-supabase";

/*
 * NEW-P1-17: the legacy (tenant-less URL) Interakt webhook confirmed or
 * cancelled the order and then wrote order_status_history and whatsapp_logs
 * WITHOUT tenant_id — 167 inbound log rows and most of the bot's 202 NULL
 * history rows in the last 30 days. Both writes must carry the order's tenant.
 */

const state = vi.hoisted(() => ({
    env: { INTERAKT_WEBHOOK_SECRET: "legacy-secret" } as Record<string, string>,
    allowed: true,
    /** Whether the conditional update still finds the order `contacted`. */
    stillContacted: true,
}));

vi.mock("@/lib/env", () => ({ env: state.env }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: () => recordingSupabase }));
vi.mock("@/lib/whatsapp-delivery-receipts", () => ({
    INTERAKT_DELIVERY_STATUSES: {},
    recordWhatsAppDeliveryReceipt: vi.fn(),
}));

vi.mock("@/lib/interakt", () => ({ sharedSenderAllows: () => state.allowed }));

import { POST } from "./route";

const TENANT = "77777777-7777-4777-8777-777777777777";
const ORDER_UUID = "88888888-8888-4888-8888-888888888888";

const insertedRows = (table: string) =>
    queriesOn(table).flatMap((q) => q.ops.filter((o) => o.op === "insert").map((o) => o.args[0])) as Record<string, unknown>[];

beforeEach(() => {
    state.allowed = true;
    state.stillContacted = true;
    resetRecording();
    respond((q) => {
        if (q.target === "orders") {
            const row = { id: ORDER_UUID, order_id: "#1001", status: "contacted", tenant_id: TENANT };
            if (q.ops.some((o) => o.op === "update")) return { data: state.stillContacted ? [{ id: ORDER_UUID }] : [], error: null };
            // .single() answers one row; the phone fallback (.limit) answers a list.
            return { data: q.ops.some((o) => o.op === "limit") ? [row] : row, error: null };
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

    it("leaves an order alone when its store is not allowed on the shared number", async () => {
        state.allowed = false;
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

        expect(res.status).toBe(404);
        expect(insertedRows("order_status_history")).toHaveLength(0);
        expect(queriesOn("orders").some((q) => q.ops.some((o) => o.op === "update"))).toBe(false);
    });

    it("updates only while the order is still contacted, and skips the rest when it moved on", async () => {
        state.stillContacted = false;
        const res = await POST(
            new NextRequest("https://app.example.com/api/webhooks/interakt", {
                method: "POST",
                headers: { "x-webhook-secret": "legacy-secret" },
                body: JSON.stringify({
                    type: "message_api_clicked",
                    data: {
                        customer: { phone_number: "7700000000", country_code: "+964" },
                        message: { button_text: "إلغاء", context: { callback_data: ORDER_UUID } },
                    },
                }),
            }),
        );

        expect(res.status).toBe(200);
        const update = queriesOn("orders").find((q) => q.ops.some((o) => o.op === "update"));
        expect(update && hasEq(update, "status", "contacted") && hasEq(update, "tenant_id", TENANT)).toBe(true);
        expect(insertedRows("order_status_history")).toHaveLength(0);
        expect(insertedRows("whatsapp_logs")).toHaveLength(0);
    });

    it("refuses a wrong secret", async () => {
        const res = await POST(
            new NextRequest("https://app.example.com/api/webhooks/interakt", {
                method: "POST",
                headers: { "x-webhook-secret": "legacy-secreT" },
                body: "{}",
            }),
        );
        expect(res.status).toBe(401);
    });
});
