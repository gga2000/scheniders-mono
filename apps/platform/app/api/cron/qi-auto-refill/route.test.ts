import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recorded, recordingSupabase, respond, resetRecording, queriesOn, type RecordedQuery } from "@/lib/__fixtures__/recording-supabase";

/*
 * The auto refill cron charges a saved Qi card. Money moves only from Qi's
 * status API through settle_qi_payment. start_qi_auto_refill opens the refill
 * under a lock (one charge per store, ever). When Qi answers the charge with
 * an error, the row is closed only after Qi's lookup by our request id says
 * no payment exists; an unknown outcome (network, 5xx, code 5 reused id)
 * leaves it open for the reconcile pass, because Qi may have taken the money.
 */

const KEY = randomBytes(32).toString("base64");
const captureMessage = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: () => recordingSupabase }));
vi.mock("@sentry/nextjs", async (importOriginal) => ({ ...(await importOriginal<object>()), captureMessage }));
const env = vi.hoisted(() => ({
    CRON_SECRET: "test-cron-secret",
    QI_API_BASE_URL: "https://qi.test/api/v1",
    QI_TERMINAL_ID: "237984",
    QI_USERNAME: "u",
    QI_PASSWORD: "p",
    QI_TOKEN_KEY: undefined as string | undefined,
}));
vi.mock("@/lib/env", () => ({ env }));

const { GET } = await import("./route");
const { sealQiToken } = await import("@/lib/qi/token-seal");

const TENANT = "44444444-4444-4444-8444-444444444444";
const OTHER_TENANT = "99999999-9999-4999-8999-999999999999";
const ROW = "66666666-6666-4666-8666-666666666666";
const OLD_ROW = "77777777-7777-4777-8777-777777777777";
const PAYMENT = "7f79e923-d2ba-417a-9653-d7ec709351dd";
const PAYMENT_2 = "1124169e-a469-4aab-8b7f-b3fc47cc3f9e";
const TOKEN = "dde6893c-5f1b-4d7d-af78-9916f2a30e7d";
const BASE = "https://qi.test/api/v1";

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const qiError = (status: number, code: number, description = "x") => json(status, { error: { code, description } });
const payment = (requestId: string, over: Record<string, unknown> = {}) => ({
    requestId, paymentId: PAYMENT, status: "SUCCESS", canceled: false, amount: 25_000, currency: "IQD", ...over,
});
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const row = (over: Record<string, unknown> = {}) => ({
    id: ROW, tenant_id: TENANT, qi_payment_id: null, status: "created", amount_iqd: 25_000, save_card: false,
    kind: "auto_refill", card_saved: null, created_at: minutesAgo(0), ...over,
});

const cronRequest = () =>
    new Request("http://platform.test/api/cron/qi-auto-refill", { headers: { authorization: "Bearer test-cron-secret" } });

const isOp = (q: RecordedQuery, op: string) => q.ops.some((o) => o.op === op);

type QiRoute = (url: string, init: RequestInit) => Response | Promise<Response> | undefined;
/** A fake Qi: each call goes to the first route that answers; an unrouted call fails the test. */
function qi(...routes: QiRoute[]) {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
        for (const route of routes) {
            const answer = await route(url, init);
            if (answer) return answer;
        }
        throw new Error(`unexpected Qi call ${init.method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    return {
        fetchMock,
        calls: () => fetchMock.mock.calls.map(([url, init]) => `${init.method} ${url.replace(BASE, "")}`),
        bodyOf: (path: string) => {
            const call = fetchMock.mock.calls.find(([url]) => url === `${BASE}${path}`);
            return call ? (JSON.parse(call[1].body as string) as Record<string, unknown>) : undefined;
        },
    };
}
const on = (method: string, path: string, answer: () => Response): QiRoute => (url, init) =>
    url === `${BASE}${path}` && init.method === method ? answer() : undefined;

let due: unknown[];
let open: unknown[];
let started: unknown;
let settled: unknown[];

beforeEach(() => {
    resetRecording();
    captureMessage.mockReset();
    env.QI_TOKEN_KEY = KEY;
    due = [{ tenant_id: TENANT, token: "ignored", amount_iqd: 25_000, requested_by: null }];
    open = [];
    started = { success: true, row: row(), token: sealQiToken(TOKEN, TENANT, Buffer.from(KEY, "base64")) };
    settled = [];
    respond((q) => {
        if (q.target === "qi_auto_refill_due") return { data: due, error: null };
        if (q.target === "start_qi_auto_refill") return { data: started, error: null };
        if (q.target === "qi_payments" && isOp(q, "lt")) return { data: open, error: null };
        if (q.target === "settle_qi_payment") {
            const answer = settled.shift() ?? { success: true, status: q.rpcArgs?._canceled ? "canceled" : "success" };
            return { data: answer, error: null };
        }
        if (q.target === "close_unopened_qi_payment") return { data: { success: true, status: "failed" }, error: null };
        return { data: null, error: null };
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

const alarms = () => captureMessage.mock.calls.map(([message]) => message as string).filter((m) => m.startsWith("Qi money:"));

describe("qi-auto-refill cron: charging", () => {
    it("rejects a request without the cron secret", async () => {
        const res = await GET(new Request("http://platform.test/api/cron/qi-auto-refill"));
        expect(res.status).toBe(401);
        expect(recorded).toEqual([]);
    });

    it("opens the refill under the store's lock, charges the opened card, and credits only from Qi's status", async () => {
        const server = qi(
            on("POST", "/payment", () => json(200, payment(ROW, { status: "CREATED" }))),
            on("GET", `/payment/${PAYMENT}/status`, () => json(200, payment(ROW))),
        );

        const res = await GET(cronRequest());
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ success: true, due: 1, results: [{ tenant_id: TENANT, outcome: "success" }] });

        expect(queriesOn("start_qi_auto_refill").map((q) => q.rpcArgs)).toEqual([{ _tenant_id: TENANT }]);
        expect(server.calls()).toEqual(["POST /payment", `GET /payment/${PAYMENT}/status`]);
        expect(server.bodyOf("/payment")).toMatchObject({
            requestId: ROW,
            amount: 25_000,
            currency: "IQD",
            recurrent: true,
            withoutAuthenticate: true,
            paymentData: { paymentType: "PAYMENT_TOKEN", paymentToken: TOKEN },
        });
        // Qi's id is attached only to a row that has none yet.
        const attach = queriesOn("qi_payments").find((q) => isOp(q, "update"));
        expect(attach?.ops).toEqual(
            expect.arrayContaining([
                { op: "update", args: [{ qi_payment_id: PAYMENT }] },
                { op: "eq", args: ["id", ROW] },
                { op: "is", args: ["qi_payment_id", null] },
            ]),
        );
        // The charge answer said CREATED; what was recorded is the status read after it.
        expect(queriesOn("settle_qi_payment").map((q) => q.rpcArgs)).toEqual([
            expect.objectContaining({ _id: ROW, _qi_payment_id: PAYMENT, _qi_status: "SUCCESS", _amount: 25_000, _confirmed_amount: null, _card: null }),
        ]);
    });

    it.each([
        ["busy", { success: false, error: "busy" }],
        ["not_due", { success: false, error: "not_due" }],
        ["not_due", { success: false, error: "no_card" }],
    ])("charges nothing when the store is no longer due (%s)", async (outcome, answer) => {
        started = answer;
        const server = qi();

        const res = await GET(cronRequest());
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ success: true, results: [{ outcome }] });
        expect(server.fetchMock).not.toHaveBeenCalled();
    });

    it("counts a declined charge against the card only after Qi confirms no payment exists", async () => {
        const server = qi(
            on("POST", "/payment", () => qiError(400, 7, "Declined")),
            on("GET", `/payment/status/by/request/${ROW}`, () => qiError(403, 12, "Payment with provided requestId not found.")),
        );

        const res = await GET(cronRequest());
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ success: true, results: [{ outcome: "failed" }] });
        expect(server.calls()).toEqual(["POST /payment", `GET /payment/status/by/request/${ROW}`]);
        expect(queriesOn("close_unopened_qi_payment").map((q) => q.rpcArgs)).toEqual([{ _id: ROW, _outcome: "declined" }]);
        expect(queriesOn("settle_qi_payment")).toEqual([]);
    });

    it.each([
        ["unknown token", 31, "Payment token not found."],
        ["blocked token", 5, "Payment token is blocked."],
    ])("removes a dead card (%s) instead of retrying it", async (_name, code, description) => {
        qi(
            on("POST", "/payment", () => qiError(403, code, description)),
            on("GET", `/payment/status/by/request/${ROW}`, () => qiError(403, 12)),
        );

        const res = await GET(cronRequest());
        expect(await res.json()).toMatchObject({ results: [{ outcome: "card_dead" }] });
        expect(queriesOn("close_unopened_qi_payment").map((q) => q.rpcArgs)).toEqual([{ _id: ROW, _outcome: "card_dead" }]);
    });

    it("never counts our own setup error against the store", async () => {
        qi(
            on("POST", "/payment", () => qiError(400, 21, "Bad field")),
            on("GET", `/payment/status/by/request/${ROW}`, () => qiError(403, 12)),
        );

        const res = await GET(cronRequest());
        expect(res.status).toBe(500);
        expect(await res.json()).toMatchObject({ results: [{ outcome: "error" }] });
        expect(queriesOn("close_unopened_qi_payment").map((q) => q.rpcArgs)).toEqual([{ _id: ROW, _outcome: "not_opened" }]);
    });

    it("settles from Qi's record when Qi refused the call but did open the payment", async () => {
        qi(
            on("POST", "/payment", () => qiError(400, 7, "Declined")),
            on("GET", `/payment/status/by/request/${ROW}`, () => json(200, payment(ROW, { status: "FAILED" }))),
        );
        settled = [{ success: true, status: "failed" }];

        const res = await GET(cronRequest());
        expect(await res.json()).toMatchObject({ results: [{ outcome: "failed" }] });
        expect(queriesOn("close_unopened_qi_payment")).toEqual([]);
        expect(queriesOn("settle_qi_payment").map((q) => q.rpcArgs)).toEqual([expect.objectContaining({ _id: ROW, _qi_payment_id: PAYMENT, _qi_status: "FAILED" })]);
    });

    it.each([
        ["a network error", () => Promise.reject(new TypeError("fetch failed"))],
        ["a Qi server error", () => Promise.resolve(json(502, {}))],
        ["Qi's internal error", () => Promise.resolve(qiError(400, 23))],
        ["a reused request id", () => Promise.resolve(qiError(403, 5, "RequestId was already used."))],
        ["a 2xx that is not a payment", () => Promise.resolve(json(200, { ok: true }))],
    ])("leaves the refill open after %s, since Qi may have charged", async (_name, answer) => {
        const server = qi((url, init) => (init.method === "POST" && url === `${BASE}/payment` ? answer() : undefined));

        const res = await GET(cronRequest());
        expect(res.status).toBe(500);
        expect(await res.json()).toMatchObject({ results: [{ outcome: "error" }] });
        expect(server.calls()).toEqual(["POST /payment"]);
        expect(queriesOn("close_unopened_qi_payment")).toEqual([]);
        expect(queriesOn("settle_qi_payment")).toEqual([]);
    });

    it("leaves the refill open when Qi's lookup itself fails after a refusal", async () => {
        qi(
            on("POST", "/payment", () => qiError(401, 27, "Bad credentials")),
            on("GET", `/payment/status/by/request/${ROW}`, () => qiError(401, 27, "Bad credentials")),
        );

        const res = await GET(cronRequest());
        expect(res.status).toBe(500);
        expect(queriesOn("close_unopened_qi_payment")).toEqual([]);
    });

    it("does not charge a sealed card that does not open for this store, and raises it", async () => {
        started = { success: true, row: row(), token: sealQiToken(TOKEN, OTHER_TENANT, Buffer.from(KEY, "base64")) };
        const server = qi();

        const res = await GET(cronRequest());
        expect(res.status).toBe(500);
        expect(server.fetchMock).not.toHaveBeenCalled();
        expect(queriesOn("close_unopened_qi_payment").map((q) => q.rpcArgs)).toEqual([{ _id: ROW, _outcome: "not_opened" }]);
        expect(alarms()).toEqual([expect.stringContaining("saved card token does not open")]);
    });

    it("charges nothing and raises it when stores are due but the card key is missing", async () => {
        env.QI_TOKEN_KEY = undefined;
        const server = qi();

        const res = await GET(cronRequest());
        expect(res.status).toBe(500);
        expect(server.fetchMock).not.toHaveBeenCalled();
        expect(queriesOn("start_qi_auto_refill")).toEqual([]);
        expect(alarms()).toEqual([expect.stringContaining("QI_TOKEN_KEY is missing")]);
    });

    it("stops starting new charges once its time budget is spent", async () => {
        due = [{ tenant_id: TENANT }, { tenant_id: OTHER_TENANT }];
        let clock = Date.now();
        vi.spyOn(Date, "now").mockImplementation(() => clock);
        qi(
            on("POST", "/payment", () => {
                clock += 50_000;
                return json(200, payment(ROW));
            }),
            on("GET", `/payment/${PAYMENT}/status`, () => json(200, payment(ROW))),
        );

        const res = await GET(cronRequest());
        expect(await res.json()).toMatchObject({ due: 2, results: [{ tenant_id: TENANT, outcome: "success" }] });
        expect(queriesOn("start_qi_auto_refill")).toHaveLength(1);
    });
});

describe("qi-auto-refill cron: open payments", () => {
    beforeEach(() => {
        due = [];
    });

    it("settles a paid top-up whose webhook and return check were both missed", async () => {
        open = [row({ kind: "topup", qi_payment_id: PAYMENT, created_at: minutesAgo(60) })];
        qi(on("GET", `/payment/${PAYMENT}/status`, () => json(200, payment(ROW))));

        const res = await GET(cronRequest());
        expect(await res.json()).toMatchObject({ success: true, recovered: 1 });
        expect(queriesOn("settle_qi_payment")[0].rpcArgs).toMatchObject({ _id: ROW, _qi_status: "SUCCESS" });
        const recheck = recorded.find((q) => q.target === "qi_payments" && isOp(q, "lt"));
        expect(recheck?.ops.some((o) => o.op === "eq" && o.args[0] === "kind")).toBe(false);
        expect(recheck?.ops).toEqual(expect.arrayContaining([{ op: "eq", args: ["status", "created"] }, expect.objectContaining({ op: "gt" })]));
    });

    it("closes a row Qi never opened once Qi confirms it has no payment, and waits on a recent one", async () => {
        open = [row({ created_at: minutesAgo(20) }), row({ id: OLD_ROW, created_at: minutesAgo(10) })];
        const server = qi(on("GET", `/payment/status/by/request/${ROW}`, () => qiError(403, 12)));

        const res = await GET(cronRequest());
        expect(await res.json()).toMatchObject({ success: true, recovered: 1 });
        expect(server.calls()).toEqual([`GET /payment/status/by/request/${ROW}`]);
        expect(queriesOn("close_unopened_qi_payment").map((q) => q.rpcArgs)).toEqual([{ _id: ROW, _outcome: "not_opened" }]);
    });

    it("attaches and settles a row Qi did open although we never heard back", async () => {
        open = [row({ created_at: minutesAgo(20) })];
        qi(on("GET", `/payment/status/by/request/${ROW}`, () => json(200, payment(ROW))));

        const res = await GET(cronRequest());
        expect(await res.json()).toMatchObject({ success: true, recovered: 1 });
        expect(queriesOn("close_unopened_qi_payment")).toEqual([]);
        expect(queriesOn("settle_qi_payment")[0].rpcArgs).toMatchObject({ _id: ROW, _qi_payment_id: PAYMENT, _qi_status: "SUCCESS" });
    });

    it("cancels a refill still in progress after 30 minutes, then records what Qi reports", async () => {
        open = [row({ qi_payment_id: PAYMENT, created_at: minutesAgo(40) })];
        let canceled = false;
        const server = qi(
            on("GET", `/payment/${PAYMENT}/status`, () => json(200, payment(ROW, { status: "STARTED", canceled }))),
            on("POST", `/payment/cancel/by/request/${ROW}`, () => {
                canceled = true;
                return json(200, payment(ROW, { status: "STARTED", canceled: true }));
            }),
        );
        settled = [{ success: true, status: "created" }];

        const res = await GET(cronRequest());
        expect(await res.json()).toMatchObject({ success: true, recovered: 1 });
        expect(server.calls()).toEqual([`GET /payment/${PAYMENT}/status`, `POST /payment/cancel/by/request/${ROW}`, `GET /payment/${PAYMENT}/status`]);
        expect(server.bodyOf(`/payment/cancel/by/request/${ROW}`)?.requestId).not.toBe(ROW);
        expect(queriesOn("settle_qi_payment").map((q) => q.rpcArgs?._canceled)).toEqual([false, true]);
    });

    it("keeps waiting on a top-up page the shop may still pay, and on a fresh refill", async () => {
        open = [
            row({ kind: "topup", qi_payment_id: PAYMENT, created_at: minutesAgo(120) }),
            row({ id: OLD_ROW, qi_payment_id: PAYMENT_2, created_at: minutesAgo(10) }),
        ];
        const server = qi(
            on("GET", `/payment/${PAYMENT}/status`, () => json(200, payment(ROW, { status: "FORM_SHOWED" }))),
            on("GET", `/payment/${PAYMENT_2}/status`, () => json(200, payment(OLD_ROW, { paymentId: PAYMENT_2, status: "STARTED" }))),
        );
        settled = [{ success: true, status: "created" }, { success: true, status: "created" }];

        const res = await GET(cronRequest());
        expect(await res.json()).toMatchObject({ success: true, recovered: 0 });
        expect(server.calls()).toEqual([`GET /payment/${PAYMENT}/status`, `GET /payment/${PAYMENT_2}/status`]);
    });

    it("settles from Qi's status when Qi says the payment can no longer be canceled", async () => {
        open = [row({ qi_payment_id: PAYMENT, created_at: minutesAgo(40) })];
        let reads = 0;
        qi(
            on("GET", `/payment/${PAYMENT}/status`, () => json(200, payment(ROW, { status: reads++ === 0 ? "STARTED" : "SUCCESS" }))),
            on("POST", `/payment/cancel/by/request/${ROW}`, () => qiError(403, 15, "Payment can not be canceled.")),
        );
        settled = [{ success: true, status: "created" }];

        const res = await GET(cronRequest());
        expect(await res.json()).toMatchObject({ success: true, recovered: 1 });
        expect(queriesOn("settle_qi_payment").map((q) => q.rpcArgs?._qi_status)).toEqual(["STARTED", "SUCCESS"]);
    });

    it("reports a payment it could not finish, and goes on with the rest", async () => {
        open = [
            row({ qi_payment_id: PAYMENT, created_at: minutesAgo(40) }),
            row({ id: OLD_ROW, kind: "topup", qi_payment_id: PAYMENT_2, created_at: minutesAgo(60) }),
        ];
        qi(
            on("GET", `/payment/${PAYMENT}/status`, () => json(502, {})),
            on("GET", `/payment/${PAYMENT_2}/status`, () => json(200, payment(OLD_ROW, { paymentId: PAYMENT_2 }))),
        );

        const res = await GET(cronRequest());
        expect(res.status).toBe(500);
        expect(await res.json()).toMatchObject({ success: false, recovered: 1 });
        expect(queriesOn("settle_qi_payment").map((q) => q.rpcArgs?._id)).toEqual([OLD_ROW]);
    });
});
