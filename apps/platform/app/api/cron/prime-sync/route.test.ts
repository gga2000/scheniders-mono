import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { queriesOn, recordingSupabase, resetRecording, respond } from "@/lib/__fixtures__/recording-supabase";

/*
 * Handoff B8: the Prime sync works through every linked store each 5
 * minutes. Stores go least recently stamped first, and no new store starts
 * after half of maxDuration; the rest are first next run and the job raises
 * one warning, instead of Vercel cutting the run mid-store.
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

let clock = 0;
/** Each store's push takes this long on the fake clock. */
let storeSeconds = 1;
const pushed: string[] = [];

vi.mock("@/lib/prime/client", () => ({
    getPrimeClient: () => ({ stepNames: async () => new Map<string, string>() }),
    primeConfigFromEnv: () => null,
}));
vi.mock("@/lib/prime/push", () => ({
    pushPrimeChanges: vi.fn(async (_db: unknown, _client: unknown, tenantId: string) => {
        pushed.push(tenantId);
        clock += storeSeconds * 1000;
        return { sent: 0 };
    }),
}));
vi.mock("@/lib/prime/sync", () => ({
    syncPrimeTenant: vi.fn(async () => ({ updated: 0 })),
    announcePrimeDeliveries: vi.fn(async () => 0),
}));
vi.mock("@/lib/prime/webhook", () => ({ ensurePrimeWebhook: vi.fn() }));
vi.mock("@/lib/prime/money-watch", () => ({ sendPrimeDaily: vi.fn(async () => false), watchPrimePayments: vi.fn(async () => ({})) }));
vi.mock("@/lib/prime/failed-notice", () => ({ sendPrimeFailedNotices: vi.fn(async () => ({ sent: 0 })) }));
vi.mock("@/lib/prime/self-link", () => ({ recheckPrimeLinkRequests: vi.fn(async () => ({ checked: 0 })) }));

const { GET } = await import("./route");

const cronRequest = () =>
    new Request("http://platform.test/api/cron/prime-sync", {
        headers: { authorization: "Bearer test-cron-secret" },
    }) as unknown as NextRequest;

/** Linked stores whose 15-minute status read is not due, so a run only pushes edits. */
function stores(): Record<string, unknown>[] {
    return ["a", "b", "c", "d"].map((id, i) => ({
        tenant_id: id,
        merchant_login_id: `m${id}`,
        shop_id: i + 1,
        branch_name: null,
        last_synced_at: new Date(clock - 60_000).toISOString(),
        last_payment_id: null,
        daily_sent_on: null,
    }));
}

beforeEach(() => {
    resetRecording();
    captureMessage.mockReset();
    pushed.length = 0;
    clock = Date.parse("2026-11-16T10:00:00Z");
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const linked = stores();
    respond((q) => (q.target === "prime_connections" ? { data: linked, error: null } : { data: null, error: null }));
});
afterEach(() => vi.restoreAllMocks());

describe("prime-sync cron", () => {
    it("reads the stores least recently stamped first", async () => {
        await GET(cronRequest());
        const [read] = queriesOn("prime_connections");
        expect(read.ops).toContainEqual({ op: "order", args: ["updated_at", { ascending: true, nullsFirst: true }] });
    });

    it("reaches every store when there is time, and warns nobody", async () => {
        const res = await GET(cronRequest());
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ success: true, tenants: 4, deferred: 0 });
        expect(pushed).toEqual(["a", "b", "c", "d"]);
        expect(captureMessage).not.toHaveBeenCalled();
    });

    it("starts no store after half of maxDuration; the rest wait and the job warns once", async () => {
        storeSeconds = 12; // stores start at 0 s, 12 s, 24 s; at 36 s half of 60 is gone
        try {
            const res = await GET(cronRequest());
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body).toMatchObject({ success: true, tenants: 4, deferred: 1 });
            expect(Object.keys(body.results)).toEqual(["a", "b", "c"]);
            expect(pushed).toEqual(["a", "b", "c"]);
            expect(captureMessage).toHaveBeenCalledTimes(1);
            expect(captureMessage.mock.calls[0][0]).toBe("Job prime-sync ran out of time: 1 of 4 stores wait for the next run");
        } finally {
            storeSeconds = 1;
        }
    });
});
