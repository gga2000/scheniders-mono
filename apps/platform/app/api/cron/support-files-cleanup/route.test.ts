import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Pictures and voice notes merchants sent support are kept 30 days. The
 * database names the old files; this job removes them through the Storage
 * API, bucket by bucket, and never touches a file it was not given.
 */

type Call = { method: string; args: unknown[] };

const state = vi.hoisted(() => ({
    calls: [] as Call[],
    files: [] as unknown,
    rpcError: null as { message: string } | null,
    removeError: null as { message: string } | null,
}));

vi.mock("@sentry/nextjs", () => ({
    captureCheckIn: vi.fn(),
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    flush: vi.fn(async () => true),
}));
vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "test-cron-secret" } }));
vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: () => ({
        rpc: async (...args: unknown[]) => {
            state.calls.push({ method: "rpc", args });
            return { data: state.rpcError ? null : state.files, error: state.rpcError };
        },
        storage: {
            from: (bucket: string) => ({
                remove: async (names: string[]) => {
                    state.calls.push({ method: "remove", args: [bucket, names] });
                    return state.removeError
                        ? { data: null, error: state.removeError }
                        : { data: names.map((name) => ({ name })), error: null };
                },
            }),
        },
    }),
}));

const { GET } = await import("./route");

const T = "11111111-1111-4111-8111-111111111111";
const cronRequest = (auth = "Bearer test-cron-secret") =>
    new Request("http://platform.test/api/cron/support-files-cleanup", { headers: { authorization: auth } });

beforeEach(() => {
    state.calls.length = 0;
    state.files = [];
    state.rpcError = null;
    state.removeError = null;
    vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("support-files-cleanup cron", () => {
    it("rejects a request without the cron secret", async () => {
        expect((await GET(cronRequest("Bearer nope"))).status).toBe(401);
        expect(state.calls).toEqual([]);
    });

    it("removes nothing when nothing is old", async () => {
        const res = await GET(cronRequest());
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true, removed: { "support-shots": 0, "support-voice": 0 }, hasMore: false });
        expect(state.calls).toEqual([{ method: "rpc", args: ["support_old_files", { p_limit: 500 }] }]);
    });

    it("removes each old file from its own bucket", async () => {
        state.files = [
            { bucket: "support-shots", name: `${T}/a.jpg` },
            { bucket: "support-voice", name: `${T}/b.webm` },
            { bucket: "support-shots", name: `${T}/c.jpg` },
        ];
        const res = await GET(cronRequest());
        expect(await res.json()).toEqual({ success: true, removed: { "support-shots": 2, "support-voice": 1 }, hasMore: false });
        expect(state.calls.filter((c) => c.method === "remove")).toEqual([
            { method: "remove", args: ["support-shots", [`${T}/a.jpg`, `${T}/c.jpg`]] },
            { method: "remove", args: ["support-voice", [`${T}/b.webm`]] },
        ]);
    });

    it("says more remain when the batch is full", async () => {
        state.files = Array.from({ length: 500 }, (_, i) => ({ bucket: "support-shots", name: `${T}/${i}.jpg` }));
        expect(await (await GET(cronRequest())).json()).toMatchObject({ hasMore: true });
    });

    it("refuses a list naming any other bucket, and removes nothing", async () => {
        state.files = [{ bucket: "product-images", name: `${T}/x.jpg` }];
        expect((await GET(cronRequest())).status).toBe(500);
        expect(state.calls.some((c) => c.method === "remove")).toBe(false);
    });

    it("fails loudly when the database or the storage fails", async () => {
        state.rpcError = { message: "db down" };
        expect((await GET(cronRequest())).status).toBe(500);

        state.rpcError = null;
        state.files = [{ bucket: "support-voice", name: `${T}/b.webm` }];
        state.removeError = { message: "storage down" };
        const res = await GET(cronRequest());
        expect(res.status).toBe(500);
        expect((await res.json()).error).toBe("support-voice: storage down");
    });
});
