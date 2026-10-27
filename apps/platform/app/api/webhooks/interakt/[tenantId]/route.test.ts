import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TENANT = "22222222-2222-4222-8222-222222222222";
const SECRET = "interakt-secret";

const state = vi.hoisted(() => ({
    env: {} as Record<string, string | undefined>,
    credentials: {} as Record<string, unknown>,
    updates: [] as Array<Record<string, unknown>>,
    inserts: [] as Array<Record<string, unknown>>,
}));

/**
 * Minimal stand-in for the service-role client: the integration lookup returns
 * the configured credentials, the order lookup returns one `contacted` order,
 * and updates are recorded so a test can tell whether the order was changed.
 */
function fakeClient() {
    return {
        from(table: string) {
            const builder = {
                select: () => builder,
                eq: () => builder,
                or: () => builder,
                order: () => builder,
                limit: () => builder,
                insert: async (values: Record<string, unknown>) => {
                    state.inserts.push({ table, ...values });
                    return { error: null };
                },
                update: (values: Record<string, unknown>) => {
                    state.updates.push({ table, ...values });
                    return { eq: async () => ({ error: null }) };
                },
                single: async () => {
                    if (table === "tenant_integrations") {
                        return { data: { credentials: state.credentials, is_active: true }, error: null };
                    }
                    return { data: { id: "order-uuid", order_id: "#1001", status: "contacted" }, error: null };
                },
            };
            return builder;
        },
    };
}

vi.mock("@/lib/env", () => ({ env: state.env }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: fakeClient }));
vi.mock("@/lib/whatsapp-delivery-receipts", () => ({
    INTERAKT_DELIVERY_STATUSES: {},
    recordWhatsAppDeliveryReceipt: vi.fn(),
}));

import { POST } from "./route";

const BODY = JSON.stringify({
    type: "message_api_clicked",
    data: {
        customer: { phone_number: "7700000000", country_code: "+964" },
        message: { button_text: "تأكيد ✅", context: { callback_data: "order-uuid" } },
    },
});

function call(opts: { query?: string; headers?: Record<string, string> } = {}) {
    const url = `https://app.example.com/api/webhooks/interakt/${TENANT}${opts.query ? `?${opts.query}` : ""}`;
    return POST(
        new NextRequest(url, { method: "POST", body: BODY, headers: opts.headers }),
        { params: Promise.resolve({ tenantId: TENANT }) },
    );
}

function configure(env: Record<string, string>, credentials: Record<string, unknown>) {
    for (const k of Object.keys(state.env)) delete state.env[k];
    Object.assign(state.env, env);
    state.credentials = credentials;
}

const confirmedOrder = () => state.updates.some(u => u.table === "orders" && u.status === "confirmed");

describe("POST /api/webhooks/interakt/[tenantId] — auth", () => {
    beforeEach(() => {
        state.updates = [];
        state.inserts = [];
        vi.spyOn(console, "info").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    it("default (no mode set, as in production): no webhook_secret configured fails closed with 503 (NEW-P1-06)", async () => {
        configure({}, { api_key: "k" });
        const res = await call();
        expect(res.status).toBe(503);
        expect(confirmedOrder()).toBe(false);
    });

    it("default: secret configured but none presented is refused", async () => {
        configure({}, { webhook_secret: SECRET });
        const res = await call();
        expect(res.status).toBe(401);
        expect(confirmedOrder()).toBe(false);
    });

    it("default: a valid Interakt-Signature is accepted", async () => {
        configure({}, { webhook_secret: SECRET });
        const sig = createHmac("sha256", SECRET).update(BODY).digest("hex");
        const res = await call({ headers: { "Interakt-Signature": `sha256=${sig}` } });
        expect(res.status).toBe(200);
        expect(confirmedOrder()).toBe(true);
    });

    it("explicit monitor opt-out: no webhook_secret configured still confirms and logs an error", async () => {
        configure({ INTERAKT_WEBHOOK_AUTH_MODE: "monitor" }, { api_key: "k" });
        const res = await call();
        expect(res.status).toBe(200);
        expect(confirmedOrder()).toBe(true);
        const logged = vi.mocked(console.error).mock.calls.map(c => String(c[0]));
        expect(logged.some(l => l.includes(`"outcome":"unconfigured"`) && l.includes(`"action":"accepted_unauthenticated"`))).toBe(true);
    });

    it("monitor: a wrong token is refused and the order is untouched", async () => {
        configure({ INTERAKT_WEBHOOK_AUTH_MODE: "monitor" }, { webhook_secret: SECRET });
        const res = await call({ query: "token=wrong" });
        expect(res.status).toBe(401);
        expect(confirmedOrder()).toBe(false);
    });

    it("monitor: a forged Interakt-Signature is refused", async () => {
        configure({ INTERAKT_WEBHOOK_AUTH_MODE: "monitor" }, { webhook_secret: SECRET });
        const res = await call({ headers: { "Interakt-Signature": "sha256=deadbeef" } });
        expect(res.status).toBe(401);
        expect(confirmedOrder()).toBe(false);
    });

    it("enforce: no credential is refused", async () => {
        configure({ INTERAKT_WEBHOOK_AUTH_MODE: "enforce" }, { webhook_secret: SECRET });
        const res = await call();
        expect(res.status).toBe(401);
        expect(confirmedOrder()).toBe(false);
    });

    it("enforce: no webhook_secret configured fails closed", async () => {
        configure({ WEBHOOK_AUTH_MODE: "enforce" }, {});
        const res = await call({ query: "token=anything" });
        expect(res.status).toBe(503);
        expect(confirmedOrder()).toBe(false);
    });

    it("enforce: the correct ?token= is accepted", async () => {
        configure({ WEBHOOK_AUTH_MODE: "enforce" }, { webhook_secret: SECRET });
        const res = await call({ query: `token=${SECRET}` });
        expect(res.status).toBe(200);
        expect(confirmedOrder()).toBe(true);
    });

    it("enforce: a valid Interakt-Signature is accepted", async () => {
        configure({ WEBHOOK_AUTH_MODE: "enforce" }, { webhook_secret: SECRET });
        const sig = createHmac("sha256", SECRET).update(BODY).digest("hex");
        const res = await call({ headers: { "Interakt-Signature": `sha256=${sig}` } });
        expect(res.status).toBe(200);
        expect(confirmedOrder()).toBe(true);
    });

    it("stamps the route's tenant on the history and inbound whatsapp_logs rows (NEW-P1-17)", async () => {
        configure({}, { api_key: "k" });
        await call();
        const history = state.inserts.filter(i => i.table === "order_status_history");
        const logs = state.inserts.filter(i => i.table === "whatsapp_logs");
        expect(history).toHaveLength(1);
        expect(logs).toHaveLength(1);
        for (const row of [...history, ...logs]) expect(row.tenant_id).toBe(TENANT);
    });

    it("enforce: the legacy x-interakt-secret header is accepted", async () => {
        configure({ WEBHOOK_AUTH_MODE: "enforce" }, { webhook_secret: SECRET });
        const res = await call({ headers: { "x-interakt-secret": SECRET } });
        expect(res.status).toBe(200);
    });
});
