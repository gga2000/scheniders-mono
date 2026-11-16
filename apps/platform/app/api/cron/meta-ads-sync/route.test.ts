import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queriesOn, recordingSupabase, resetRecording, respond } from "@/lib/__fixtures__/recording-supabase";

/*
 * Handoff B8: the Meta ads sync timed out. Stores go least recently tried
 * first, and no new store starts after half of maxDuration; the rest are
 * first next run and the job raises one warning.
 */

const captureMessage = vi.fn();
vi.mock("@sentry/nextjs", () => ({
    captureMessage,
    captureException: vi.fn(),
    captureCheckIn: vi.fn(),
    flush: vi.fn(async () => true),
}));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: () => recordingSupabase }));
vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "test-cron-secret" } }));

/** Each store's sync takes this long on the fake clock. */
let storeSeconds = 1;
let clock = 0;
const synced: string[] = [];
vi.mock("@/lib/meta-ads-sync", () => ({
    syncMetaAdsForTenant: vi.fn(async (_db: unknown, conn: { tenant_id: string }) => {
        synced.push(conn.tenant_id);
        clock += storeSeconds * 1000;
        return { ok: true, rows: 1 };
    }),
}));

const { GET } = await import("./route");

const stores = ["a", "b", "c", "d"].map((id) => ({ tenant_id: id, ad_account_id: `act_${id}`, access_token: "t", usd_to_iqd: 1500 }));
const cronRequest = () =>
    new Request("http://platform.test/api/cron/meta-ads-sync", { headers: { authorization: "Bearer test-cron-secret" } });

beforeEach(() => {
    resetRecording();
    captureMessage.mockReset();
    synced.length = 0;
    clock = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    respond((q) => (q.target === "meta_ads_connections" ? { data: stores, error: null } : { data: null, error: null }));
});
afterEach(() => vi.restoreAllMocks());

describe("meta-ads-sync cron", () => {
    it("reads the stores least recently tried first", async () => {
        await GET(cronRequest());
        const [read] = queriesOn("meta_ads_connections");
        expect(read.ops).toContainEqual({ op: "order", args: ["updated_at", { ascending: true, nullsFirst: true }] });
    });

    it("syncs every store when there is time, and warns nobody", async () => {
        const res = await GET(cronRequest());
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true, synced: 4, failed: 0, deferred: 0 });
        expect(synced).toEqual(["a", "b", "c", "d"]);
        expect(captureMessage).not.toHaveBeenCalled();
    });

    it("starts no store after half of maxDuration; the rest wait and the job warns once", async () => {
        storeSeconds = 12; // stores start at 0 s, 12 s, 24 s; at 36 s half of 60 is gone
        try {
            const res = await GET(cronRequest());
            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({ success: true, synced: 3, failed: 0, deferred: 1 });
            expect(synced).toEqual(["a", "b", "c"]);
            expect(captureMessage).toHaveBeenCalledTimes(1);
            expect(captureMessage.mock.calls[0][0]).toBe("Job meta-ads-sync ran out of time: 1 of 4 stores wait for the next run");
        } finally {
            storeSeconds = 1;
        }
    });
});
