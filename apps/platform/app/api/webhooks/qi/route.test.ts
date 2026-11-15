import { createSign, generateKeyPairSync } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordingSupabase, respond, resetRecording, queriesOn, type RecordedQuery } from "@/lib/__fixtures__/recording-supabase";

/*
 * Qi's payment message is only a hint about which payment changed. Money moves
 * from Qi's status API read with our own credentials, never from the body, and
 * only for a payment that is ours: our row, Qi's id on it, and Qi's own record
 * naming our row as its request.
 */

const captureMessage = vi.hoisted(() => vi.fn());
const env = vi.hoisted(() => ({
    QI_API_BASE_URL: "https://qi.test/api/v1",
    QI_TERMINAL_ID: "237984",
    QI_USERNAME: "u",
    QI_PASSWORD: "p",
    QI_WEBHOOK_PUBLIC_KEY: undefined as string | undefined,
    QI_TOKEN_KEY: undefined as string | undefined,
}));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: () => recordingSupabase }));
vi.mock("@sentry/nextjs", async (importOriginal) => ({ ...(await importOriginal<object>()), captureMessage }));
vi.mock("@/lib/env", () => ({ env }));

const { POST } = await import("./route");
const { qiSignedString } = await import("@/lib/qi/client");

const TENANT = "44444444-4444-4444-8444-444444444444";
const ROW = "66666666-6666-4666-8666-666666666666";
const OTHER_ROW = "77777777-7777-4777-8777-777777777777";
const PAYMENT = "7f79e923-d2ba-417a-9653-d7ec709351dd";
const OTHER_PAYMENT = "1124169e-a469-4aab-8b7f-b3fc47cc3f9e";
const BASE = "https://qi.test/api/v1";

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const qiRecord = (over: Record<string, unknown> = {}) => ({
    requestId: ROW, paymentId: PAYMENT, status: "SUCCESS", canceled: false, amount: 25_000, currency: "IQD", ...over,
});
const message = (over: Record<string, unknown> = {}) => ({
    requestId: ROW, paymentId: PAYMENT, status: "SUCCESS", amount: 25_000, currency: "IQD", creationDate: "2026-11-15T20:00:00", ...over,
});
const row = (over: Record<string, unknown> = {}) => ({
    id: ROW, tenant_id: TENANT, qi_payment_id: PAYMENT, status: "created", amount_iqd: 25_000, save_card: false,
    kind: "topup", card_saved: null, created_at: new Date().toISOString(), ...over,
});
const webhook = (body: unknown, headers: Record<string, string> = {}) =>
    new NextRequest("https://app.test/api/webhooks/qi", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: typeof body === "string" ? body : JSON.stringify(body),
    });

const isOp = (q: RecordedQuery, op: string) => q.ops.some((o) => o.op === op);

let found: unknown;
let fetchMock: ReturnType<typeof vi.fn>;
let qiAnswer: () => Response;

beforeEach(() => {
    resetRecording();
    captureMessage.mockReset();
    env.QI_WEBHOOK_PUBLIC_KEY = undefined;
    found = row();
    qiAnswer = () => json(200, qiRecord());
    respond((q) => {
        if (q.target === "qi_payments" && isOp(q, "maybeSingle")) return { data: found, error: null };
        if (q.target === "settle_qi_payment") return { data: { success: true, status: q.rpcArgs?._qi_status === "SUCCESS" ? "success" : "failed" }, error: null };
        return { data: null, error: null };
    });
    fetchMock = vi.fn().mockImplementation(() => Promise.resolve(qiAnswer()));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

const qiCalls = () => fetchMock.mock.calls.map(([url]) => String(url).replace(BASE, ""));
const settles = () => queriesOn("settle_qi_payment").map((q) => q.rpcArgs ?? {});
const alarms = () => captureMessage.mock.calls.map(([m]) => m as string).filter((m) => m.startsWith("Qi money:"));

describe("Qi webhook", () => {
    it("credits from Qi's status read, not from the message", async () => {
        qiAnswer = () => json(200, qiRecord({ status: "FAILED" }));
        const res = await POST(webhook(message({ status: "SUCCESS" })));
        expect(res.status).toBe(200);
        expect(qiCalls()).toEqual([`/payment/${PAYMENT}/status`]);
        expect(settles()).toEqual([expect.objectContaining({ _id: ROW, _qi_payment_id: PAYMENT, _qi_status: "FAILED" })]);
    });

    it("refuses a malformed body", async () => {
        const res = await POST(webhook("not json"));
        expect(res.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("ignores a request id that is not ours without asking Qi or the database", async () => {
        const res = await POST(webhook(message({ requestId: "20250113-212519-073" })));
        expect(await res.json()).toMatchObject({ ignored: "not_ours" });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(queriesOn("qi_payments")).toEqual([]);
    });

    it("ignores a payment we have no row for", async () => {
        found = null;
        const res = await POST(webhook(message()));
        expect(await res.json()).toMatchObject({ ignored: "not_ours" });
        expect(settles()).toEqual([]);
    });

    it("ignores a message whose payment id is not the one on our row", async () => {
        const res = await POST(webhook(message({ paymentId: OTHER_PAYMENT })));
        expect(await res.json()).toMatchObject({ ignored: "not_ours" });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(settles()).toEqual([]);
    });

    it("answers a repeat about a settled payment without moving money again", async () => {
        found = row({ status: "success" });
        const res = await POST(webhook(message()));
        expect(await res.json()).toMatchObject({ ok: true, duplicate: true, status: "success" });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(settles()).toEqual([]);
    });

    it("raises it when Qi took money for a payment we had closed as not paid", async () => {
        found = row({ status: "failed" });
        const res = await POST(webhook(message()));
        expect(res.status).toBe(200);
        expect(settles()).toEqual([]);
        expect(alarms()).toEqual([expect.stringContaining("closed as not paid")]);
    });

    it("stays quiet when a closed payment really was not paid", async () => {
        found = row({ status: "canceled" });
        qiAnswer = () => json(200, qiRecord({ status: "STARTED", canceled: true }));
        await POST(webhook(message()));
        expect(alarms()).toEqual([]);
    });

    describe("a row whose opening answer we never got", () => {
        beforeEach(() => {
            found = row({ qi_payment_id: null });
        });

        it("attaches Qi's id only when Qi's own record names our row, then settles", async () => {
            const res = await POST(webhook(message()));
            expect(res.status).toBe(200);
            const attach = queriesOn("qi_payments").find((q) => isOp(q, "update"));
            expect(attach?.ops).toEqual(
                expect.arrayContaining([
                    { op: "update", args: [{ qi_payment_id: PAYMENT }] },
                    { op: "eq", args: ["id", ROW] },
                    { op: "is", args: ["qi_payment_id", null] },
                ]),
            );
            // The status read for the lookup is reused: one Qi call, one settle.
            expect(qiCalls()).toEqual([`/payment/${PAYMENT}/status`]);
            expect(settles()).toEqual([expect.objectContaining({ _id: ROW, _qi_payment_id: PAYMENT, _qi_status: "SUCCESS" })]);
        });

        it("ignores a message pointing our row at a payment Qi opened for someone else", async () => {
            qiAnswer = () => json(200, qiRecord({ requestId: OTHER_ROW }));
            const res = await POST(webhook(message()));
            expect(await res.json()).toMatchObject({ ignored: "not_ours" });
            expect(queriesOn("qi_payments").some((q) => isOp(q, "update"))).toBe(false);
            expect(settles()).toEqual([]);
        });
    });

    describe("with Qi's signing key set", () => {
        const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
        const sign = (body: ReturnType<typeof message>) => {
            const signer = createSign("sha256");
            signer.update(qiSignedString(body));
            return signer.sign(privateKey).toString("base64");
        };

        beforeEach(() => {
            env.QI_WEBHOOK_PUBLIC_KEY = publicKey.export({ type: "spki", format: "pem" }).toString();
        });

        it("acts on a message Qi signed", async () => {
            const body = message();
            const res = await POST(webhook(body, { "x-signature": sign(body) }));
            expect(res.status).toBe(200);
            expect(settles()).toHaveLength(1);
        });

        it.each([
            ["no signature", {}],
            ["a signature of another message", { "x-signature": sign(message({ amount: 1_000 })) }],
        ])("refuses a message with %s before touching anything", async (_name, headers) => {
            const res = await POST(webhook(message(), headers));
            expect(res.status).toBe(401);
            expect(fetchMock).not.toHaveBeenCalled();
            expect(queriesOn("qi_payments")).toEqual([]);
        });
    });
});
