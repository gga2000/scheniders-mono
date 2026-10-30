import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    env: {} as Record<string, string | undefined>,
    createOrderFromWebhook: vi.fn(),
    triggerImmediateConfirmation: vi.fn(),
    sendNewOrderAlertToStaff: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: () => ({}) }));
vi.mock("@/lib/qstash", () => ({ scheduleCheckoutProcessing: vi.fn() }));
vi.mock("@/lib/whatsapp-dispatcher", () => ({ triggerImmediateConfirmation: mocks.triggerImmediateConfirmation }));
vi.mock("@/lib/staff-alerts", () => ({ sendNewOrderAlertToStaff: mocks.sendNewOrderAlertToStaff }));
vi.mock("@/lib/webhook-handler", () => ({
    parseLightFunnelsPayload: (p: { node: { id: string } }) => ({ order_number: p.node.id }),
    createOrderFromWebhook: mocks.createOrderFromWebhook,
    logWebhookRequest: vi.fn(),
}));

import { POST } from "./route";

const SECRET = "lf-shared-secret";
const APP_SECRET = "lf-app-secret";
const TENANT = "11111111-1111-4111-8111-111111111111";
const BODY = JSON.stringify({ node: { id: "order_1" } });

function post(opts: { query?: string; headers?: Record<string, string> } = {}) {
    const url = `https://app.example.com/api/webhooks/lightfunnels${opts.query ? `?${opts.query}` : ""}`;
    return new NextRequest(url, { method: "POST", body: BODY, headers: opts.headers });
}

function setEnv(values: Record<string, string | undefined>) {
    for (const k of Object.keys(mocks.env)) delete mocks.env[k];
    Object.assign(mocks.env, { LIGHTFUNNELS_TENANT_ID: TENANT, ...values });
}

describe("POST /api/webhooks/lightfunnels — auth", () => {
    beforeEach(() => {
        mocks.createOrderFromWebhook.mockResolvedValue({
            success: true,
            order: { id: "uuid-1", order_id: "order_1", phone: "07700000000", tenant_id: TENANT },
        });
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "info").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    it("default (no mode set, as in production): refuses a request with no credential (NEW-P1-07)", async () => {
        setEnv({ LIGHTFUNNELS_WEBHOOK_SECRET: SECRET });
        const out = await POST(post());
        expect(out.status).toBe(401);
        expect(mocks.createOrderFromWebhook).not.toHaveBeenCalled();
        expect(mocks.triggerImmediateConfirmation).not.toHaveBeenCalled();
    });

    it("default: refuses everything with 503 when no secret is configured", async () => {
        setEnv({});
        const out = await POST(post({ query: "token=anything" }));
        expect(out.status).toBe(503);
        expect(mocks.createOrderFromWebhook).not.toHaveBeenCalled();
    });

    it("default: accepts the correct ?token=", async () => {
        setEnv({ LIGHTFUNNELS_WEBHOOK_SECRET: SECRET });
        const out = await POST(post({ query: `token=${SECRET}` }));
        expect(out.status).toBe(201);
        expect(mocks.createOrderFromWebhook).toHaveBeenCalledWith({ order_number: "order_1" }, TENANT);
    });

    it("explicit monitor opt-out: processes a request with no credential and logs an error", async () => {
        setEnv({ LIGHTFUNNELS_WEBHOOK_SECRET: SECRET, LIGHTFUNNELS_WEBHOOK_AUTH_MODE: "monitor" });
        const out = await POST(post());
        expect(out.status).toBe(201);
        expect(mocks.createOrderFromWebhook).toHaveBeenCalledWith({ order_number: "order_1" }, TENANT);
        const logged = vi.mocked(console.error).mock.calls.map(c => String(c[0]));
        expect(logged.some(l => l.includes(`"outcome":"missing"`) && l.includes(`"action":"accepted_unauthenticated"`))).toBe(true);
    });

    it("monitor: refuses a wrong token", async () => {
        setEnv({ LIGHTFUNNELS_WEBHOOK_SECRET: SECRET, WEBHOOK_AUTH_MODE: "monitor" });
        const out = await POST(post({ query: "token=wrong" }));
        expect(out.status).toBe(401);
        expect(mocks.createOrderFromWebhook).not.toHaveBeenCalled();
    });

    it("monitor: refuses a wrong x-webhook-secret header", async () => {
        setEnv({ LIGHTFUNNELS_WEBHOOK_SECRET: SECRET, WEBHOOK_AUTH_MODE: "monitor" });
        const out = await POST(post({ headers: { "x-webhook-secret": "wrong" } }));
        expect(out.status).toBe(401);
        expect(mocks.createOrderFromWebhook).not.toHaveBeenCalled();
    });

    it("enforce: refuses a request with no credential", async () => {
        setEnv({ LIGHTFUNNELS_WEBHOOK_SECRET: SECRET, WEBHOOK_AUTH_MODE: "enforce" });
        const out = await POST(post());
        expect(out.status).toBe(401);
        expect(mocks.createOrderFromWebhook).not.toHaveBeenCalled();
    });

    it("enforce: refuses everything when no secret is configured (fails closed)", async () => {
        setEnv({ LIGHTFUNNELS_WEBHOOK_AUTH_MODE: "enforce" });
        const out = await POST(post({ query: "token=anything" }));
        expect(out.status).toBe(503);
        expect(mocks.createOrderFromWebhook).not.toHaveBeenCalled();
    });

    it("enforce: accepts the correct ?token=", async () => {
        setEnv({ LIGHTFUNNELS_WEBHOOK_SECRET: SECRET, WEBHOOK_AUTH_MODE: "enforce" });
        const out = await POST(post({ query: `token=${SECRET}` }));
        expect(out.status).toBe(201);
        expect(mocks.createOrderFromWebhook).toHaveBeenCalledTimes(1);
    });

    it("enforce: accepts the correct x-webhook-secret header", async () => {
        setEnv({ LIGHTFUNNELS_WEBHOOK_SECRET: SECRET, WEBHOOK_AUTH_MODE: "enforce" });
        const out = await POST(post({ headers: { "x-webhook-secret": SECRET } }));
        expect(out.status).toBe(201);
    });

    it("enforce: accepts a valid lightfunnels-hmac signature", async () => {
        setEnv({ LIGHTFUNNELS_APP_SECRET: APP_SECRET, WEBHOOK_AUTH_MODE: "enforce" });
        const sig = createHmac("sha256", APP_SECRET).update(BODY).digest("base64");
        const out = await POST(post({ headers: { "lightfunnels-hmac": sig } }));
        expect(out.status).toBe(201);
    });

    it("provider override wins: LIGHTFUNNELS_WEBHOOK_AUTH_MODE=monitor under a global enforce", async () => {
        setEnv({
            LIGHTFUNNELS_WEBHOOK_SECRET: SECRET,
            WEBHOOK_AUTH_MODE: "enforce",
            LIGHTFUNNELS_WEBHOOK_AUTH_MODE: "monitor",
        });
        const out = await POST(post());
        expect(out.status).toBe(201);
    });

    it("returns 400, not 500, for a non-JSON body", async () => {
        setEnv({ LIGHTFUNNELS_WEBHOOK_SECRET: SECRET });
        const out = await POST(new NextRequest(
            `https://app.example.com/api/webhooks/lightfunnels?token=${SECRET}`,
            { method: "POST", body: "not json" },
        ));
        expect(out.status).toBe(400);
    });
});
