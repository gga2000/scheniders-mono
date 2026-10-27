import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    recorded,
    recordingSupabase,
    respond,
    resetRecording,
    queriesOn,
} from "@/lib/__fixtures__/recording-supabase";

/*
 * Lead 8: the cron charged the wallet (charge_wallet_atomic) and then advanced
 * the period with a separate, unchecked UPDATE. A retry, an overlapping run or
 * a failed UPDATE charged the same period again. Renewal now goes through
 * renew_subscription_atomic, keyed on the exact period end the cron observed;
 * the route must never charge or move the period itself.
 * (The SQL-level proof that a retry charges nothing is
 *  packages/supabase/tests/wallet_topup_subscription_renew.sql.)
 */

// requireCronAuth reads the validated env, which is built once at import;
// read the secret this suite sets per test instead.
vi.mock("@/lib/env", () => ({
    env: {
        get CRON_SECRET() {
            return process.env.CRON_SECRET;
        },
    },
}));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: () => recordingSupabase }));

const { GET } = await import("./route");

const SUB = "33333333-3333-4333-8333-333333333333";
const TENANT = "44444444-4444-4444-8444-444444444444";
const PERIOD_END = "2026-10-19T03:00:00+00:00";

const cronRequest = () =>
    new Request("http://platform.test/api/cron/subscription-renew", {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });

let renewResult: unknown;

beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
    resetRecording();
    renewResult = { success: true, outcome: "renewed", plan: "starter", charged: 10000 };
    respond((q) => {
        if (q.target === "subscriptions") {
            return { data: [{ id: SUB, tenant_id: TENANT, plan: "starter", current_period_end: PERIOD_END }], error: null };
        }
        if (q.target === "tenants") return { data: [{ id: TENANT, business_name: "Test Store" }], error: null };
        if (q.target === "renew_subscription_atomic") return { data: renewResult, error: null };
        return { data: null, error: null };
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("subscription-renew cron", () => {
    it("rejects a request without the cron secret", async () => {
        const res = await GET(new Request("http://platform.test/api/cron/subscription-renew"));
        expect(res.status).toBe(401);
        expect(recorded).toEqual([]);
    });

    it("renews through renew_subscription_atomic keyed on the observed period end", async () => {
        const res = await GET(cronRequest());
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body).toMatchObject({ success: true, renewed: 1, suspended: 0 });
        expect(queriesOn("renew_subscription_atomic")).toHaveLength(1);
        expect(queriesOn("renew_subscription_atomic")[0].rpcArgs).toEqual({
            _subscription_id: SUB,
            _expected_period_end: PERIOD_END,
        });
    });

    it("never charges the wallet or moves the period outside the atomic RPC", async () => {
        await GET(cronRequest());
        expect(queriesOn("charge_wallet_atomic")).toEqual([]);
        const writes = recorded.filter(
            (q) => q.kind === "from" && q.ops.some((o) => ["update", "upsert", "insert"].includes(o.op)),
        );
        expect(writes).toEqual([]);
    });

    it("counts a retry that finds the period already renewed as a no-op, not a renewal", async () => {
        renewResult = { success: true, outcome: "already_processed", plan: "starter" };
        const res = await GET(cronRequest());
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body).toMatchObject({ success: true, renewed: 0, suspended: 0 });
        expect(body.results[0].outcome).toBe("already_processed");
    });

    it("reports an RPC failure as failure", async () => {
        respond((q) => {
            if (q.target === "subscriptions") {
                return { data: [{ id: SUB, tenant_id: TENANT, plan: "starter", current_period_end: PERIOD_END }], error: null };
            }
            if (q.target === "renew_subscription_atomic") return { data: null, error: { message: "boom" } };
            return { data: [], error: null };
        });
        const res = await GET(cronRequest());
        const body = await res.json();
        expect(res.status).toBe(500);
        expect(body).toMatchObject({ success: false, errors: 1 });
    });

    it("excludes internal-plan subscriptions from the due query", async () => {
        await GET(cronRequest());
        const due = queriesOn("subscriptions")[0];
        expect(due.ops).toContainEqual({ op: "not", args: ["plan", "in", "(internal)"] });
    });

    it("never renews, charges or suspends an internal tenant whose subscription row names a paid plan", async () => {
        respond((q) => {
            if (q.target === "subscriptions") {
                return { data: [{ id: SUB, tenant_id: TENANT, plan: "starter", current_period_end: PERIOD_END }], error: null };
            }
            if (q.target === "tenants") return { data: [{ id: TENANT, business_name: "House", plan: "internal" }], error: null };
            return { data: null, error: null };
        });
        const res = await GET(cronRequest());
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body).toMatchObject({ success: true, renewed: 0, suspended: 0 });
        expect(queriesOn("renew_subscription_atomic")).toEqual([]);
        expect(queriesOn("charge_wallet_atomic")).toEqual([]);
        const writes = recorded.filter(
            (q) => q.kind === "from" && q.ops.some((o) => ["update", "upsert", "insert"].includes(o.op)),
        );
        expect(writes).toEqual([]);
    });

    it("treats an RPC exempt outcome as neither a renewal nor a suspension", async () => {
        renewResult = { success: true, outcome: "exempt", plan: "internal" };
        const res = await GET(cronRequest());
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body).toMatchObject({ success: true, renewed: 0, suspended: 0, errors: 0 });
        expect(body.results[0].outcome).toBe("exempt");
    });
});
