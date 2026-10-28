import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    recorded,
    recordingSupabase,
    respond,
    resetRecording,
    hasEq,
    queriesOn,
} from "@/lib/__fixtures__/recording-supabase";

/*
 * createOrderFromWebhook runs on the service-role client, where RLS does not
 * apply, so every lookup must name the tenant. The blacklist and product
 * lookups once matched across tenants (another merchant's blacklist blocked
 * the order; another merchant's product was bound to it).
 */

vi.mock("./supabase-server", () => ({ createSupabaseServiceClient: () => recordingSupabase }));
vi.mock("./fraud-detector", () => ({
    fraudDetector: {
        assessCustomerTrust: async () => ({ historicalData: { rejectedCustomerFaultCount: 0 } }),
    },
}));

import { createOrderFromWebhook, type LightFunnelsWebhook } from "./webhook-handler";

const TENANT = "33333333-3333-4333-8333-333333333333";

const webhook = (over: Partial<LightFunnelsWebhook> = {}): LightFunnelsWebhook => ({
    order_id: "lf-1",
    order_number: "7455",
    is_checkout: false,
    customer: { name: "Test Customer", phone: "07801234567", city: "بغداد", address: "الكرادة" },
    items: [{ name: "عطر برسيفيرون", quantity: 1, price: 25000, sku: "SKU-1" }],
    total: 25000,
    ...over,
});

beforeEach(() => {
    resetRecording();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("createOrderFromWebhook tenant scoping", () => {
    it("refuses to run without a tenant, before touching the database", async () => {
        const result = await createOrderFromWebhook(webhook(), null);
        expect(result.success).toBe(false);
        expect(recorded).toEqual([]);
    });

    it("hands an abandoned checkout to the database, which owns the same-customer rule", async () => {
        respond((q) => {
            if (q.kind === "rpc") return { data: { id: "new-checkout" }, error: null };
            if (q.target === "products" || q.target === "blacklist") return { data: null, error: null };
            return { data: [], error: null };
        });

        const result = await createOrderFromWebhook(webhook({ is_checkout: true }), TENANT);

        expect(result).toMatchObject({ success: true });
        expect(queriesOn("create_order_atomic")[0]?.rpcArgs).toMatchObject({ _tenant_id: TENANT });
        // No app-side phone lookup: exact phone text missed `07…` vs `+964…`.
        expect(queriesOn("orders").some((q) => hasEq(q, "phone", "+9647801234567") || hasEq(q, "phone", "07801234567"))).toBe(false);
    });

    it("scopes the blacklist, product lookups, order creation and checkout cleanup", async () => {
        respond((q) => {
            if (q.kind === "rpc") return { data: { id: "new-order" }, error: null };
            // maybeSingle()/single() answer null when nothing matches.
            if (q.target === "products" || q.target === "blacklist") return { data: null, error: null };
            return { data: [], error: null };
        });

        const result = await createOrderFromWebhook(webhook(), TENANT);

        expect(result).toMatchObject({ success: true });
        for (const q of [...queriesOn("blacklist"), ...queriesOn("products")]) {
            expect(hasEq(q, "tenant_id", TENANT)).toBe(true);
        }
        expect(queriesOn("products").length).toBeGreaterThan(0);
        expect(queriesOn("create_order_atomic")[0]?.rpcArgs).toMatchObject({ _tenant_id: TENANT });

        // order_id is UNIQUE across the whole table, so that one check is
        // deliberately global; every other orders query names the tenant.
        const ordersQueries = queriesOn("orders");
        const unscoped = ordersQueries.filter((q) => !hasEq(q, "tenant_id", TENANT));
        expect(unscoped).toHaveLength(1);
        expect(unscoped[0].ops.some((o) => o.op === "eq" && o.args[0] === "order_id")).toBe(true);
    });
});
