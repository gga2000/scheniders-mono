import { beforeEach, describe, expect, it, vi } from "vitest";

const createUser = vi.fn();
const tableInserts: { table: string; row: Record<string, unknown> }[] = [];
const consumeRateLimit = vi.fn();
const verifyTurnstile = vi.fn();
/** Results for the tenants insert, in call order; empty means success. */
const tenantResults: { data: unknown; error: unknown }[] = [];
const slugs = vi.fn();

function table(name: string) {
    const chain: Record<string, unknown> = {};
    chain.insert = (row: Record<string, unknown>) => {
        tableInserts.push({ table: name, row });
        return chain;
    };
    chain.upsert = () => Promise.resolve({ error: null });
    chain.select = () => chain;
    chain.single = () =>
        Promise.resolve(
            (name === "tenants" && tenantResults.shift()) || { data: { id: "tenant-1", slug: "shop" }, error: null },
        );
    chain.then = (resolve: (v: { error: null }) => unknown) => resolve({ error: null });
    return chain;
}

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: () => ({
        auth: { admin: { createUser, deleteUser: vi.fn() } },
        from: (name: string) => table(name),
    }),
}));
vi.mock("@/lib/tenant", () => ({
    generateSlug: () => "shop",
    ensureUniqueSlug: (...args: unknown[]) => slugs(...args),
}));
vi.mock("@/lib/rate-limit", () => ({
    consumeRateLimit: (...args: unknown[]) => consumeRateLimit(...args),
    rateLimitHeaders: () => ({ "Retry-After": "60" }),
}));
vi.mock("@/lib/order-telemetry", () => ({ reportOrderError: vi.fn() }));
vi.mock("@/lib/turnstile", () => ({
    verifyTurnstile: (...args: unknown[]) => verifyTurnstile(...args),
}));

import { NextRequest } from "next/server";
import { POST } from "./route";

function request(body: Record<string, unknown>, headers: Record<string, string> = { "x-forwarded-for": "203.0.113.9" }) {
    return new NextRequest("https://app.test/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
    });
}

const base = { email: "a@b.co", password: "password1", business_name: "Shop" };

describe("POST /api/auth/signup", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        tableInserts.length = 0;
        tenantResults.length = 0;
        slugs.mockResolvedValueOnce("shop").mockResolvedValueOnce("shop-1").mockResolvedValue("shop-2");
        consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 9, resetAt: null, retryAfterSeconds: 0 });
        createUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
        verifyTurnstile.mockResolvedValue({ ok: true, skipped: false });
    });

    it("ignores a plan sent in the body: the server picks the trial plan", async () => {
        const res = await POST(request({ ...base, plan: "enterprise" }));
        expect(res.status).toBe(201);
        const tenant = tableInserts.find((i) => i.table === "tenants");
        const sub = tableInserts.find((i) => i.table === "subscriptions");
        expect(tenant?.row.plan).toBe("starter");
        expect(sub?.row.plan).toBe("starter");
    });

    it("rate limits per client IP before creating any account", async () => {
        consumeRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date(), retryAfterSeconds: 60 });
        const res = await POST(request(base));
        expect(res.status).toBe(429);
        expect(createUser).not.toHaveBeenCalled();
        expect(consumeRateLimit.mock.calls[0][0]).toBe("signup:203.0.113.9");
    });

    it("checks the captcha token with the client IP before creating any account", async () => {
        const res = await POST(request({ ...base, captcha_token: "tok-1" }));
        expect(res.status).toBe(201);
        expect(verifyTurnstile).toHaveBeenCalledWith("tok-1", "203.0.113.9");
    });

    it("refuses a missing or rejected captcha token and creates nothing", async () => {
        verifyTurnstile.mockResolvedValue({ ok: false, reason: "rejected" });
        const res = await POST(request(base));
        expect(res.status).toBe(403);
        expect(await res.json()).toMatchObject({ code: "captcha_failed" });
        expect(createUser).not.toHaveBeenCalled();
        expect(tableInserts).toHaveLength(0);
    });

    it("fails closed when Cloudflare cannot be reached", async () => {
        verifyTurnstile.mockResolvedValue({ ok: false, reason: "unavailable" });
        const res = await POST(request({ ...base, captcha_token: "tok-1" }));
        expect(res.status).toBe(503);
        expect(createUser).not.toHaveBeenCalled();
    });

    it("creates the account unconfirmed, so the owner must open the emailed link", async () => {
        const res = await POST(request(base));
        expect(res.status).toBe(201);
        expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: "a@b.co", email_confirm: false }));
        expect(await res.json()).toMatchObject({ confirm_email: true });
    });

    it("refuses a malformed body with 400 and creates nothing", async () => {
        for (const body of [{ ...base, email: 42 }, { ...base, email: "not-an-email" }, { ...base, password: "short" }, { ...base, business_name: "  " }]) {
            const res = await POST(request(body));
            expect(res.status).toBe(400);
        }
        expect(createUser).not.toHaveBeenCalled();
    });

    it("normalises the email before creating the account", async () => {
        await POST(request({ ...base, email: "  A@B.Co " }));
        expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: "a@b.co" }));
    });

    it("picks the next slug when a concurrent sign-up took the same one", async () => {
        tenantResults.push({ data: null, error: { code: "23505", message: "duplicate key" } });
        const res = await POST(request(base));
        expect(res.status).toBe(201);
        const slugsTried = tableInserts.filter((i) => i.table === "tenants").map((i) => i.row.slug);
        expect(slugsTried).toEqual(["shop", "shop-1"]);
    });
});
