import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    recorded,
    recordingSupabase,
    respond,
    resetRecording,
    queriesOn,
} from "@/lib/__fixtures__/recording-supabase";

/*
 * A trial with a `trialing` subscription is ended by subscription-renew, which
 * charges the first month. This job used to suspend every expired trial, so a
 * trial that ended between the 03:00 renewal and the 06:00 suspend run was
 * locked out instead of billed. It now suspends only trials with nothing to renew.
 */

vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: () => recordingSupabase }));
vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "test-cron-secret" } }));

const { GET } = await import("./route");

const RENEWABLE = "11111111-1111-4111-8111-111111111111";
const ORPHAN = "22222222-2222-4222-8222-222222222222";

const cronRequest = () =>
    new Request("http://platform.test/api/cron/trial-suspend", {
        headers: { authorization: "Bearer test-cron-secret" },
    });

let trialingSubs: { tenant_id: string }[];

beforeEach(() => {
    resetRecording();
    trialingSubs = [{ tenant_id: RENEWABLE }];
    respond((q) => {
        const isUpdate = q.ops.some((o) => o.op === "update");
        if (q.target === "tenants" && !isUpdate) {
            return { data: [{ id: RENEWABLE }, { id: ORPHAN }], error: null };
        }
        if (q.target === "subscriptions") return { data: trialingSubs, error: null };
        if (q.target === "tenants" && isUpdate) {
            return { data: [{ id: ORPHAN, business_name: "Orphan", trial_ends_at: "2026-11-01" }], error: null };
        }
        return { data: null, error: null };
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const suspendWrites = () =>
    queriesOn("tenants").filter((q) => q.ops.some((o) => o.op === "update"));

describe("trial-suspend cron", () => {
    it("rejects a request without the cron secret", async () => {
        const res = await GET(new Request("http://platform.test/api/cron/trial-suspend"));
        expect(res.status).toBe(401);
        expect(recorded).toEqual([]);
    });

    it("leaves a trial with a trialing subscription to subscription-renew", async () => {
        const res = await GET(cronRequest());
        expect(res.status).toBe(200);
        const writes = suspendWrites();
        expect(writes).toHaveLength(1);
        const inOp = writes[0].ops.find((o) => o.op === "in");
        expect(inOp?.args).toEqual(["id", [ORPHAN]]);
        expect(writes[0].ops.some((o) => o.op === "eq" && o.args[0] === "status" && o.args[1] === "trial")).toBe(true);
    });

    it("writes nothing when every expired trial has a subscription to renew", async () => {
        trialingSubs = [{ tenant_id: RENEWABLE }, { tenant_id: ORPHAN }];
        const res = await GET(cronRequest());
        expect(await res.json()).toMatchObject({ success: true, suspended_count: 0 });
        expect(suspendWrites()).toEqual([]);
    });
});
