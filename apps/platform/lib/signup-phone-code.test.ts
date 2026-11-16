import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLATFORM_WHATSAPP_TEMPLATES } from "@scheniders/shared/whatsapp-templates";

const send = vi.fn();
vi.mock("@/lib/interakt", () => ({ sendPlatformTemplate: (...args: unknown[]) => send(...args) }));
vi.mock("@/lib/order-telemetry", () => ({ reportOrderError: vi.fn() }));

import {
    checkSignupCode,
    hashSignupCode,
    newSignupCode,
    sendSignupCode,
    sendSignupWelcome,
    spendSignupProof,
} from "./signup-phone-code";

type Call = { table: string; op: string; value?: unknown; filters: [string, string, unknown][] };

/** A Supabase client that records each query and answers from `answers` by table and operation. */
function fakeDb(answers: Record<string, unknown> = {}) {
    const calls: Call[] = [];
    const rpc = vi.fn();
    const from = (table: string) => {
        const call: Call = { table, op: "select", filters: [] };
        calls.push(call);
        const answer = () => answers[`${table}.${call.op}`] ?? { data: null, error: null };
        const chain = {
            insert: (value: unknown) => ((call.op = "insert"), (call.value = value), chain),
            update: (value: unknown) => ((call.op = "update"), (call.value = value), chain),
            delete: () => ((call.op = "delete"), chain),
            select: () => chain,
            eq: (c: string, v: unknown) => (call.filters.push(["eq", c, v]), chain),
            is: (c: string, v: unknown) => (call.filters.push(["is", c, v]), chain),
            gte: (c: string, v: unknown) => (call.filters.push(["gte", c, v]), chain),
            order: () => chain,
            limit: () => chain,
            single: async () => answer(),
            maybeSingle: async () => answer(),
            then: (resolve: (v: unknown) => void) => resolve(answer()),
        };
        return chain;
    };
    return { db: { from, rpc } as never, calls, rpc };
}

beforeEach(() => send.mockReset());

describe("the signup code (Fermi B11)", () => {
    it("is six digits, and only its hash tied to the number is kept", () => {
        for (let i = 0; i < 50; i++) expect(newSignupCode()).toMatch(/^\d{6}$/);
        expect(hashSignupCode("07701234567", "123456")).toMatch(/^[0-9a-f]{64}$/);
        expect(hashSignupCode("07701234567", "123456")).toBe(hashSignupCode("07701234567", "123456"));
        expect(hashSignupCode("07701234567", "123456")).not.toBe(hashSignupCode("07801234567", "123456"));
    });

    it("stores the hash, sends the code in the body and on the copy button, and keeps the message id", async () => {
        const { db, calls } = fakeDb({ "signup_phone_codes.insert": { data: { id: "row-1" }, error: null } });
        send.mockResolvedValue({ success: true, messageId: "msg-1" });
        expect(await sendSignupCode(db, "07701234567", "203.0.113.9")).toEqual({ ok: true });

        const insert = calls.find((c) => c.op === "insert");
        const row = insert?.value as { phone: string; code_hash: string; ip: string; expires_at: string };
        const [{ template, bodyValues, buttonValues, phone }] = send.mock.calls[0] as [{ template: unknown; bodyValues: string[]; buttonValues: Record<string, string[]>; phone: string }];
        const code = bodyValues[0];
        expect(template).toBe(PLATFORM_WHATSAPP_TEMPLATES.signupCode);
        expect(phone).toBe("07701234567");
        expect(buttonValues).toEqual({ "0": [code] });
        expect(row).toMatchObject({ phone: "07701234567", code_hash: hashSignupCode("07701234567", code), ip: "203.0.113.9" });
        expect(JSON.stringify(row)).not.toContain(code);
        const ttl = Date.parse(row.expires_at) - Date.now();
        expect(ttl).toBeGreaterThan(9 * 60_000);
        expect(ttl).toBeLessThanOrEqual(10 * 60_000);
        expect(calls.find((c) => c.op === "update")).toMatchObject({ value: { message_id: "msg-1" }, filters: [["eq", "id", "row-1"]] });
    });

    it("removes a code that WhatsApp did not take, so the owner can ask again at once", async () => {
        const { db, calls } = fakeDb({ "signup_phone_codes.insert": { data: { id: "row-1" }, error: null } });
        send.mockResolvedValue({ success: false, error: "not on WhatsApp" });
        expect(await sendSignupCode(db, "07701234567", "ip")).toEqual({ ok: false, error: "not on WhatsApp" });
        expect(calls.find((c) => c.op === "delete")).toMatchObject({ filters: [["eq", "id", "row-1"]] });
    });

    it("checks the typed code's hash, and passes on what the database says", async () => {
        const { db, rpc } = fakeDb();
        rpc.mockReturnValue({ single: async () => ({ data: { result: "ok", proof: "c0000000-0000-4000-8000-000000000001" }, error: null }) });
        expect(await checkSignupCode(db, "07701234567", "123456")).toEqual({ result: "ok", proof: "c0000000-0000-4000-8000-000000000001" });
        expect(rpc).toHaveBeenCalledWith("signup_phone_code_check", { p_phone: "07701234567", p_code_hash: hashSignupCode("07701234567", "123456") });
        for (const result of ["wrong", "locked", "expired"] as const) {
            rpc.mockReturnValue({ single: async () => ({ data: { result, proof: null }, error: null }) });
            expect(await checkSignupCode(db, "07701234567", "000000")).toEqual({ result });
        }
    });

    it("spends a proof once, only for its number and within half an hour of the check", async () => {
        const { db, calls } = fakeDb({ "signup_phone_codes.update": { data: [{ id: "row-1" }], error: null } });
        expect(await spendSignupProof(db, "row-1", "07701234567")).toBe(true);
        const [update] = calls;
        expect(update.filters.slice(0, 3)).toEqual([
            ["eq", "id", "row-1"],
            ["eq", "phone", "07701234567"],
            ["is", "used_at", null],
        ]);
        const [, column, since] = update.filters[3];
        expect(column).toBe("verified_at");
        expect(Date.now() - Date.parse(String(since))).toBeGreaterThanOrEqual(30 * 60_000 - 1000);

        const spent = fakeDb({ "signup_phone_codes.update": { data: [], error: null } });
        expect(await spendSignupProof(spent.db, "row-1", "07701234567")).toBe(false);
    });

    it("records the welcome on the code's row, sent or not", async () => {
        const welcome = { proof: "row-1", tenantId: "t1", phone: "07701234567", businessName: "Zahraa", storeUrl: "https://zahraa.scheniders.com", videoUrl: "https://youtu.be/abc" };
        const ok = fakeDb();
        send.mockResolvedValue({ success: true, messageId: "msg-2" });
        await sendSignupWelcome(ok.db, welcome);
        expect(send).toHaveBeenCalledWith(expect.objectContaining({
            template: PLATFORM_WHATSAPP_TEMPLATES.welcome,
            bodyValues: ["Zahraa", "https://zahraa.scheniders.com", "https://youtu.be/abc"],
        }));
        expect(ok.calls[0]).toMatchObject({ op: "update", value: { welcome_message_id: "msg-2", welcome_error: null } });

        const failed = fakeDb();
        send.mockResolvedValue({ success: false, error: "template not approved" });
        await sendSignupWelcome(failed.db, welcome);
        expect(failed.calls[0]).toMatchObject({ op: "update", value: { welcome_error: "template not approved" } });
    });
});
