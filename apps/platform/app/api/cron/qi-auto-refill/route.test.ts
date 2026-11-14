import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recorded, recordingSupabase, respond, resetRecording, queriesOn, type RecordedQuery } from "@/lib/__fixtures__/recording-supabase";

/*
 * The auto refill cron charges a saved Qi card. Money must move only from
 * Qi's status API through settle_qi_payment. A charge Qi refused (no payment
 * opened) is closed with fail_qi_auto_refill; a charge whose outcome is
 * unknown (network, 5xx, our credentials) must stay open, because Qi may have
 * taken the money and its webhook will tell us.
 */

vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: () => recordingSupabase }));
vi.mock("@/lib/env", () => ({
    env: {
        CRON_SECRET: "test-cron-secret",
        QI_API_BASE_URL: "https://qi.test/api/v1",
        QI_TERMINAL_ID: "237984",
        QI_USERNAME: "u",
        QI_PASSWORD: "p",
    },
}));

const { GET } = await import("./route");

const TENANT = "44444444-4444-4444-8444-444444444444";
const USER = "55555555-5555-4555-8555-555555555555";
const ROW = "66666666-6666-4666-8666-666666666666";
const OLD_ROW = "77777777-7777-4777-8777-777777777777";
const PAYMENT = "7f79e923-d2ba-417a-9653-d7ec709351dd";

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const paid = (requestId: string) => ({ requestId, paymentId: PAYMENT, status: "SUCCESS", amount: 25_000, currency: "IQD" });
const row = (over: Record<string, unknown> = {}) => ({
    id: ROW, tenant_id: TENANT, qi_payment_id: null, status: "created", amount_iqd: 25_000, save_card: false, kind: "auto_refill", ...over,
});

const cronRequest = () =>
    new Request("http://platform.test/api/cron/qi-auto-refill", { headers: { authorization: "Bearer test-cron-secret" } });

const isOp = (q: RecordedQuery, op: string) => q.ops.some((o) => o.op === op);

let due: unknown[];
let open: unknown[];

beforeEach(() => {
    resetRecording();
    due = [{ tenant_id: TENANT, token: "tok-1", amount_iqd: 25_000, requested_by: USER }];
    open = [];
    respond((q) => {
        if (q.target === "qi_auto_refill_due") return { data: due, error: null };
        if (q.target === "qi_payments" && isOp(q, "insert")) return { data: row(), error: null };
        if (q.target === "qi_payments" && isOp(q, "lt")) return { data: open, error: null };
        if (q.target === "settle_qi_payment") return { data: { success: true, status: "success" }, error: null };
        if (q.target === "fail_qi_auto_refill") return { data: { success: true, status: "failed" }, error: null };
        return { data: null, error: null };
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("qi-auto-refill cron", () => {
    it("rejects a request without the cron secret", async () => {
        const res = await GET(new Request("http://platform.test/api/cron/qi-auto-refill"));
        expect(res.status).toBe(401);
        expect(recorded).toEqual([]);
    });

    it("charges the saved card and credits only through settle_qi_payment from Qi's status", async () => {
        const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json(200, paid(ROW))));
        vi.stubGlobal("fetch", fetchMock);

        const res = await GET(cronRequest());
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ success: true, due: 1, results: [{ outcome: "success" }] });

        const urls = fetchMock.mock.calls.map(([url]) => url);
        expect(urls).toEqual(["https://qi.test/api/v1/payment", `https://qi.test/api/v1/payment/${PAYMENT}/status`]);
        expect(queriesOn("settle_qi_payment")[0].rpcArgs).toMatchObject({ _id: ROW, _qi_payment_id: PAYMENT, _qi_status: "SUCCESS", _amount: 25_000 });
        expect(queriesOn("fail_qi_auto_refill")).toEqual([]);
    });

    it("closes a refill as failed when Qi refuses the charge", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(400, { error: { code: 10, description: "Declined" } })));

        const res = await GET(cronRequest());
        expect(await res.json()).toMatchObject({ results: [{ outcome: "failed" }] });
        expect(queriesOn("fail_qi_auto_refill").map((q) => q.rpcArgs)).toEqual([{ _id: ROW }]);
        expect(queriesOn("settle_qi_payment")).toEqual([]);
    });

    it.each([
        ["a network error", () => Promise.reject(new TypeError("fetch failed"))],
        ["a Qi server error", () => Promise.resolve(json(502, {}))],
        ["our wrong credentials", () => Promise.resolve(json(403, { error: { code: 27, description: "Bad credentials" } }))],
    ])("leaves the refill open after %s, since Qi may have charged", async (_name, answer) => {
        vi.stubGlobal("fetch", vi.fn().mockImplementation(answer));

        const res = await GET(cronRequest());
        expect(res.status).toBe(500);
        expect(await res.json()).toMatchObject({ results: [{ outcome: "error" }] });
        expect(queriesOn("fail_qi_auto_refill")).toEqual([]);
        expect(queriesOn("settle_qi_payment")).toEqual([]);
    });

    it("re-checks a paid top-up whose webhook and return check were both missed", async () => {
        due = [];
        open = [{ ...row({ kind: "topup", qi_payment_id: PAYMENT }), created_at: new Date(Date.now() - 60 * 60_000).toISOString() }];
        vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(json(200, paid(ROW)))));

        const res = await GET(cronRequest());
        expect(await res.json()).toMatchObject({ success: true, recovered: 1 });
        expect(queriesOn("settle_qi_payment")[0].rpcArgs).toMatchObject({ _id: ROW, _qi_status: "SUCCESS" });
        const recheck = recorded.find((q) => q.target === "qi_payments" && isOp(q, "lt"));
        expect(recheck?.ops.some((o) => o.op === "eq" && o.args[0] === "kind")).toBe(false);
        expect(recheck?.ops.some((o) => o.op === "gt" && o.args[0] === "created_at")).toBe(true);
    });

    it("never fails a top-up the shop simply did not open", async () => {
        due = [];
        open = [{ ...row({ kind: "topup" }), created_at: new Date(Date.now() - 30 * 3_600_000).toISOString() }];
        vi.stubGlobal("fetch", vi.fn());

        const res = await GET(cronRequest());
        expect(await res.json()).toMatchObject({ success: true, recovered: 0 });
        expect(queriesOn("fail_qi_auto_refill")).toEqual([]);
    });

    it("settles a refill a missed webhook left open, and gives up on one Qi never opened after a day", async () => {
        due = [];
        open = [
            { ...row({ qi_payment_id: PAYMENT }), created_at: new Date(Date.now() - 20 * 60_000).toISOString() },
            { ...row({ id: OLD_ROW }), created_at: new Date(Date.now() - 25 * 3_600_000).toISOString() },
            { ...row({ id: "88888888-8888-4888-8888-888888888888" }), created_at: new Date(Date.now() - 3_600_000).toISOString() },
        ];
        vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(json(200, paid(ROW)))));

        const res = await GET(cronRequest());
        expect(await res.json()).toMatchObject({ success: true, recovered: 2 });
        expect(queriesOn("settle_qi_payment").map((q) => q.rpcArgs?._id)).toEqual([ROW]);
        expect(queriesOn("fail_qi_auto_refill").map((q) => q.rpcArgs)).toEqual([{ _id: OLD_ROW }]);
    });
});
