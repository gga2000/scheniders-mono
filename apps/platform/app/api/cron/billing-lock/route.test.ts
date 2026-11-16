import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recorded, recordingSupabase, respond, resetRecording, queriesOn } from "@/lib/__fixtures__/recording-supabase";

/*
 * Handoff A1: an unpaid shop is locked, never suspended. The lock itself is
 * derived in the database; this job only tries to pay each locked shop the
 * database lists as due, and never writes a tenant's status.
 */

vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: () => recordingSupabase }));
vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "test-cron-secret" } }));

const { GET } = await import("./route");

const PAYS = "11111111-1111-4111-8111-111111111111";
const SHORT = "22222222-2222-4222-8222-222222222222";

const cronRequest = () =>
    new Request("http://platform.test/api/cron/billing-lock", {
        headers: { authorization: "Bearer test-cron-secret" },
    });

let settle: (tenant: unknown) => { data: unknown; error: unknown };

beforeEach(() => {
    resetRecording();
    settle = (tenant) => ({
        data: tenant === PAYS ? { success: true, outcome: "renewed", plan: "starter", charged: 9000 } : { success: true, outcome: "locked", error: "Insufficient balance" },
        error: null,
    });
    respond((q) => {
        if (q.target === "billing_lock_due") return { data: [{ tenant_id: PAYS }, { tenant_id: SHORT }], error: null };
        if (q.target === "settle_billing_lock") return settle(q.rpcArgs?._tenant_id);
        return { data: null, error: null };
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("billing-lock cron", () => {
    it("rejects a request without the cron secret", async () => {
        const res = await GET(new Request("http://platform.test/api/cron/billing-lock"));
        expect(res.status).toBe(401);
        expect(recorded).toEqual([]);
    });

    it("tries to pay every due shop, waiting for its locks, and never writes a tenant", async () => {
        const res = await GET(cronRequest());
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ success: true, due: 2, paid: 1, locked: 1 });
        expect(queriesOn("settle_billing_lock").map((q) => q.rpcArgs)).toEqual([
            { _tenant_id: PAYS, _wait: true },
            { _tenant_id: SHORT, _wait: true },
        ]);
        expect(queriesOn("tenants")).toEqual([]);
    });

    it("reports a failed settle as a failed run, after trying the rest", async () => {
        settle = (tenant) => (tenant === PAYS ? { data: null, error: { message: "db down" } } : { data: { success: true, outcome: "locked" }, error: null });
        const res = await GET(cronRequest());
        expect(res.status).toBe(500);
        expect(await res.json()).toMatchObject({ success: false, error: "db down", locked: 1 });
        expect(queriesOn("settle_billing_lock")).toHaveLength(2);
    });

    it("treats an unknown settle answer as an error, not a success", async () => {
        settle = () => ({ data: { success: true, outcome: "suspended" }, error: null });
        const res = await GET(cronRequest());
        expect(res.status).toBe(500);
    });
});
