import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    recordingSupabase,
    respond,
    resetRecording,
    queriesOn,
} from "@/lib/__fixtures__/recording-supabase";

/*
 * checkout_queue rows were queued with tenant_id NULL (487 live, 241 in the
 * last 30 days) even though the queue processor imports them under
 * LIGHTFUNNELS_TENANT_ID. The queued row must carry that same tenant.
 */

const TENANT = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({ env: {} as Record<string, string | undefined> }));

vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: () => recordingSupabase }));
vi.mock("@/lib/qstash", () => ({ scheduleCheckoutProcessing: vi.fn(async () => {}) }));
vi.mock("@/lib/whatsapp-dispatcher", () => ({ triggerImmediateConfirmation: vi.fn() }));
vi.mock("@/lib/staff-alerts", () => ({ sendNewOrderAlertToStaff: vi.fn() }));
vi.mock("@/lib/webhook-handler", () => ({
    parseLightFunnelsPayload: (p: { node: { id: string } }) => {
        throw new Error(`fetch_checkout:${p.node.id}`);
    },
    createOrderFromWebhook: vi.fn(),
    logWebhookRequest: vi.fn(),
}));

import { POST } from "./route";

beforeEach(() => {
    resetRecording();
    respond(() => ({ data: null, error: null }));
    for (const k of Object.keys(mocks.env)) delete mocks.env[k];
    Object.assign(mocks.env, { LIGHTFUNNELS_TENANT_ID: TENANT, LIGHTFUNNELS_WEBHOOK_AUTH_MODE: "monitor" });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const post = () =>
    POST(
        new NextRequest("https://app.example.com/api/webhooks/lightfunnels", {
            method: "POST",
            body: JSON.stringify({ node: { id: "checkout_1" } }),
        }),
    );

describe("POST /api/webhooks/lightfunnels — checkout queue", () => {
    it("queues the checkout under the LightFunnels tenant", async () => {
        const res = await post();
        expect(res.status).toBe(200);
        const upserts = queriesOn("checkout_queue").flatMap((q) =>
            q.ops.filter((o) => o.op === "upsert").map((o) => o.args[0]),
        ) as Record<string, unknown>[];
        expect(upserts).toHaveLength(1);
        expect(upserts[0]).toMatchObject({ checkout_id: "checkout_1", tenant_id: TENANT });
    });

    it("refuses to queue a tenant-less row when the receiver has no tenant configured", async () => {
        delete mocks.env.LIGHTFUNNELS_TENANT_ID;
        const res = await post();
        expect(res.status).toBe(503);
        expect(queriesOn("checkout_queue")).toEqual([]);
    });
});
