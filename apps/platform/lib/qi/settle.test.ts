import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordingSupabase, respond, resetRecording, queriesOn } from "@/lib/__fixtures__/recording-supabase";

/*
 * settleQiPayment is the one way money moves. These tests pin what it sends to
 * settle_qi_payment, and what it does with a saved card after the money is in:
 * keep only an AUTH token, sealed for this store; block every token we will
 * not keep, and the store's previous card when the new one is different.
 */

const KEY = randomBytes(32).toString("base64");
const captureMessage = vi.hoisted(() => vi.fn());
const env = vi.hoisted(() => ({ QI_TOKEN_KEY: undefined as string | undefined }));

vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: () => recordingSupabase }));
vi.mock("@sentry/nextjs", () => ({ captureMessage }));
vi.mock("@/lib/env", () => ({ env }));

const { settleQiPayment } = await import("./settle");
const { openQiToken, sealQiToken } = await import("./token-seal");

const config = { baseUrl: "https://qi.test/api/v1", terminalId: "237984", username: "u", password: "p" };
const TENANT = "44444444-4444-4444-8444-444444444444";
const ROW = "66666666-6666-4666-8666-666666666666";
const PAYMENT = "7f79e923-d2ba-417a-9653-d7ec709351dd";
const TOKEN = "dde6893c-5f1b-4d7d-af78-9916f2a30e7d";
const OLD_TOKEN = "0b6f7a52-77a4-4f0e-9d0f-2f1c3c0e9a10";

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const row = (over: Record<string, unknown> = {}) => ({
    id: ROW, tenant_id: TENANT, qi_payment_id: PAYMENT, status: "created" as const, amount_iqd: 25_000, save_card: true,
    kind: "topup" as const, card_saved: null, created_at: new Date().toISOString(), ...over,
});
const paid = (over: Record<string, unknown> = {}) => ({
    requestId: ROW, paymentId: PAYMENT, status: "SUCCESS", canceled: false, amount: 25_000, currency: "IQD",
    details: { maskedPan: "521372******8582", paymentSystem: "MASTER_CARD" },
    paymentToken: { token: TOKEN, type: "AUTH" as const, validTo: "2032-01-31T21:00:00" },
    ...over,
});

let settleAnswer: Record<string, unknown>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    resetRecording();
    captureMessage.mockReset();
    env.QI_TOKEN_KEY = KEY;
    settleAnswer = { success: true, status: "success", card_saved: true, replaced_token: null };
    respond((q) => (q.target === "settle_qi_payment" ? { data: settleAnswer, error: null } : { data: null, error: null }));
    fetchMock = vi.fn().mockResolvedValue(json(200, { token: "x", blocked: true }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

const settleArgs = () => queriesOn("settle_qi_payment").map((q) => q.rpcArgs ?? {});
const blocked = () => fetchMock.mock.calls.map(([url]) => String(url)).filter((u) => u.endsWith("/block"));
const alarms = () => captureMessage.mock.calls.map(([m]) => m as string);

describe("settleQiPayment", () => {
    it("keeps an AUTH card sealed for this store, with its expiry in UTC and its brand", async () => {
        await settleQiPayment(config, row(), paid({ confirmedAmount: 25_000 }));

        const [args] = settleArgs();
        expect(args).toMatchObject({ _id: ROW, _qi_payment_id: PAYMENT, _qi_status: "SUCCESS", _amount: 25_000, _confirmed_amount: 25_000, _canceled: false, _masked_pan: "521372******8582" });
        const card = args._card as { token: string; valid_to: string; payment_system: string };
        expect(card.token).not.toContain(TOKEN);
        expect(openQiToken(card.token, TENANT, Buffer.from(KEY, "base64"))).toBe(TOKEN);
        expect(card.valid_to).toBe("2032-01-31T21:00:00.000Z");
        expect(card.payment_system).toBe("MASTER_CARD");
        expect(blocked()).toEqual([]);
    });

    it("reads the status from Qi when the caller has none", async () => {
        fetchMock.mockResolvedValueOnce(json(200, paid()));
        await settleQiPayment(config, row({ save_card: false }));
        expect(fetchMock.mock.calls[0][0]).toBe(`https://qi.test/api/v1/payment/${PAYMENT}/status`);
        expect(settleArgs()[0]).toMatchObject({ _qi_status: "SUCCESS", _card: null });
    });

    it.each([
        ["a NON_RECUR token", { paymentToken: { token: TOKEN, type: "NON_RECUR" } }, true],
        ["an UNAUTH token", { paymentToken: { token: TOKEN, type: "UNAUTH" } }, true],
        ["an already blocked token", { paymentToken: { token: TOKEN, type: "AUTH", blocked: true } }, false],
        ["no token", { paymentToken: undefined }, false],
    ])("keeps no card for %s, and blocks it at Qi when it could still be charged", async (_name, over, blocks) => {
        settleAnswer = { success: true, status: "success", card_saved: false, replaced_token: null };
        await settleQiPayment(config, row(), paid(over));
        expect(settleArgs()[0]._card).toBeNull();
        expect(blocked()).toEqual(blocks ? [`https://qi.test/api/v1/token/${TOKEN}/block`] : []);
    });

    it("never keeps a card it cannot seal, and blocks it", async () => {
        env.QI_TOKEN_KEY = undefined;
        settleAnswer = { success: true, status: "success", card_saved: false, replaced_token: null };
        await settleQiPayment(config, row(), paid());
        expect(settleArgs()[0]._card).toBeNull();
        expect(blocked()).toEqual([`https://qi.test/api/v1/token/${TOKEN}/block`]);
    });

    it("keeps no card from a payment that was not paid", async () => {
        settleAnswer = { success: true, status: "failed" };
        await settleQiPayment(config, row(), paid({ status: "FAILED" }));
        await settleQiPayment(config, row(), paid({ canceled: true }));
        expect(settleArgs().map((a) => a._card)).toEqual([null, null]);
        expect(blocked()).toEqual([]);
    });

    it("blocks the store's previous card when a different card replaced it", async () => {
        settleAnswer = { success: true, status: "success", card_saved: true, replaced_token: sealQiToken(OLD_TOKEN, TENANT, Buffer.from(KEY, "base64")) };
        await settleQiPayment(config, row(), paid());
        expect(blocked()).toEqual([`https://qi.test/api/v1/token/${OLD_TOKEN}/block`]);
    });

    it("does not block the new card when Qi gave the same card the same token again", async () => {
        settleAnswer = { success: true, status: "success", card_saved: true, replaced_token: sealQiToken(TOKEN, TENANT, Buffer.from(KEY, "base64")) };
        await settleQiPayment(config, row(), paid());
        expect(blocked()).toEqual([]);
    });

    it("raises, never throws, when a card it must block cannot be blocked: the money is already in", async () => {
        settleAnswer = { success: true, status: "success", card_saved: false, replaced_token: null };
        fetchMock.mockResolvedValue(json(500, {}));
        await expect(settleQiPayment(config, row(), paid({ paymentToken: { token: TOKEN, type: "NON_RECUR" } }))).resolves.toMatchObject({ success: true });
        expect(alarms()).toEqual([expect.stringContaining("could not block")]);
    });

    it("tidies cards only once: a repeat settle changes nothing", async () => {
        settleAnswer = { success: true, status: "success", duplicate: true, card_saved: true };
        await settleQiPayment(config, row(), paid({ paymentToken: { token: TOKEN, type: "NON_RECUR" } }));
        expect(blocked()).toEqual([]);
    });

    it.each([
        ["another payment", { paymentId: "1124169e-a469-4aab-8b7f-b3fc47cc3f9e" }],
        ["another request", { requestId: "99999999-9999-4999-8999-999999999999" }],
        ["another currency", { currency: "USD" }],
    ])("records nothing and raises it when Qi's payment is %s", async (_name, over) => {
        const result = await settleQiPayment(config, row(), paid(over));
        expect(result).toEqual({ success: false, error: "payment_mismatch" });
        expect(settleArgs()).toEqual([]);
        expect(alarms()).toEqual([expect.stringContaining("does not match")]);
    });

    it("raises it when Qi says paid but the database refuses to record it", async () => {
        settleAnswer = { success: false, error: "amount_mismatch" };
        await settleQiPayment(config, row(), paid());
        expect(alarms()).toEqual([expect.stringContaining("amount_mismatch")]);
        expect(blocked()).toEqual([]);
    });

    it("does not ask Qi again about a payment already settled, or one Qi never opened", async () => {
        await expect(settleQiPayment(config, row({ status: "success", card_saved: true }))).resolves.toMatchObject({ duplicate: true, card_saved: true });
        await expect(settleQiPayment(config, row({ qi_payment_id: null }))).resolves.toEqual({ success: false, error: "not_opened" });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(settleArgs()).toEqual([]);
    });
});
