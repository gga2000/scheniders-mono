import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
    inserts: [] as Array<{ table: string; row: Row }>,
    existingProfile: null as Row | null,
    signUp: vi.fn(),
    createUser: vi.fn(),
    deleteUser: vi.fn(),
    consumeRateLimit: vi.fn(),
}));

function fakeServiceClient() {
    return {
        auth: { admin: { createUser: state.createUser, deleteUser: state.deleteUser } },
        from(table: string) {
            let inserted: Row | null = null;
            const builder = {
                insert(row: Row) {
                    inserted = row;
                    state.inserts.push({ table, row });
                    return Object.assign(Promise.resolve({ error: null }), builder);
                },
                upsert(row: Row) {
                    state.inserts.push({ table, row });
                    return Promise.resolve({ error: null });
                },
                update: () => ({ eq: async () => ({ error: null }) }),
                delete: () => ({ eq: async () => ({ error: null }) }),
                select: () => builder,
                eq: () => builder,
                single: async () => ({ data: { id: "tenant-1", slug: "shop", ...inserted }, error: null }),
                maybeSingle: async () => ({ data: state.existingProfile, error: null }),
            };
            return builder;
        },
    };
}

vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_SITE_URL: "https://app.example.com" } }));
vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: fakeServiceClient,
    createSupabaseAnonClient: () => ({ auth: { signUp: state.signUp } }),
}));
vi.mock("@/lib/tenant", () => ({
    generateSlug: () => "shop",
    ensureUniqueSlug: async (s: string) => s,
}));
vi.mock("@/lib/rate-limit", () => ({
    consumeRateLimit: state.consumeRateLimit,
    rateLimitHeaders: () => ({}),
}));

import { POST } from "./route";

const VALID = {
    email: "Owner@Example.com ",
    password: "correct-horse-battery",
    business_name: "My Shop",
};

function post(body: unknown, headers: Record<string, string> = {}) {
    return POST(new NextRequest("https://app.example.com/api/auth/signup", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9", ...headers },
    }));
}

const newUser = { id: "user-1", identities: [{ id: "i1" }], email_confirmed_at: null };
const inserted = (table: string) => state.inserts.filter(i => i.table === table).map(i => i.row);

describe("POST /api/auth/signup", () => {
    beforeEach(() => {
        state.inserts = [];
        state.existingProfile = null;
        state.signUp.mockReset().mockResolvedValue({ data: { user: newUser, session: null }, error: null });
        state.createUser.mockReset().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
        state.deleteUser.mockReset().mockResolvedValue({ error: null });
        state.consumeRateLimit.mockReset().mockResolvedValue({ allowed: true, remaining: 1, resetAt: null, retryAfterSeconds: 0 });
        vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    it("requires email confirmation: signs up through auth.signUp, never admin.createUser({ email_confirm: true })", async () => {
        const res = await post(VALID);
        expect(res.status).toBe(202);
        expect(state.createUser).not.toHaveBeenCalled();
        expect(state.signUp).toHaveBeenCalledWith({
            email: "owner@example.com",
            password: VALID.password,
            options: { emailRedirectTo: "https://app.example.com/login" },
        });
        expect(inserted("tenants")).toHaveLength(1);
        expect(inserted("tenant_members")[0]).toMatchObject({ user_id: "user-1", role: "admin", status: "active" });
    });

    it("the server decides the plan: a client-sent plan is ignored", async () => {
        await post({ ...VALID, plan: "enterprise" });
        expect(inserted("tenants")[0]).toMatchObject({ plan: "growth", status: "trial" });
        expect(inserted("subscriptions")[0]).toMatchObject({ plan: "growth", status: "trialing" });
    });

    it("refuses to create an unverified account when Supabase auto-confirms (Confirm email off)", async () => {
        state.signUp.mockResolvedValue({
            data: { user: { ...newUser, email_confirmed_at: "2026-10-20T00:00:00Z" }, session: { access_token: "t" } },
            error: null,
        });
        const res = await post(VALID);
        expect(res.status).toBe(503);
        expect(state.deleteUser).toHaveBeenCalledWith("user-1");
        expect(inserted("tenants")).toHaveLength(0);
    });

    it("validates input with Zod", async () => {
        for (const body of [
            { ...VALID, email: "not-an-email" },
            { ...VALID, password: "short" },
            { ...VALID, business_name: "   " },
            { ...VALID, business_name: 42 },
        ]) {
            const res = await post(body);
            expect(res.status).toBe(400);
        }
        expect(state.signUp).not.toHaveBeenCalled();
        expect(state.createUser).not.toHaveBeenCalled();
    });

    it("rate limits per IP before doing any work", async () => {
        state.consumeRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: new Date(), retryAfterSeconds: 60 });
        const res = await post(VALID);
        expect(res.status).toBe(429);
        expect(state.consumeRateLimit).toHaveBeenCalledWith("signup:ip:203.0.113.9", 5, 3600);
        expect(state.signUp).not.toHaveBeenCalled();
        expect(state.createUser).not.toHaveBeenCalled();
    });

    it("rate limits per email, keyed by a hash rather than the address", async () => {
        state.consumeRateLimit
            .mockResolvedValueOnce({ allowed: true, remaining: 4, resetAt: null, retryAfterSeconds: 0 })
            .mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: new Date(), retryAfterSeconds: 60 });
        const res = await post(VALID);
        expect(res.status).toBe(429);
        const emailKey = String(state.consumeRateLimit.mock.calls[1]?.[0]);
        expect(emailKey).toMatch(/^signup:email:[0-9a-f]{64}$/);
        expect(emailKey).not.toContain("example.com");
        expect(state.signUp).not.toHaveBeenCalled();
    });

    it("fails closed when the rate limiter is unavailable", async () => {
        state.consumeRateLimit.mockResolvedValueOnce({ allowed: true, remaining: 5, resetAt: null, retryAfterSeconds: 0, error: "db down" });
        const res = await post(VALID);
        expect(res.status).toBe(503);
        expect(state.signUp).not.toHaveBeenCalled();
    });

    it("an existing confirmed address gets the same answer and nothing is created", async () => {
        state.signUp.mockResolvedValue({ data: { user: { ...newUser, identities: [] }, session: null }, error: null });
        const res = await post(VALID);
        expect(res.status).toBe(202);
        expect(inserted("tenants")).toHaveLength(0);
        expect(state.deleteUser).not.toHaveBeenCalled();
    });

    it("an unconfirmed address signing up again gets no second tenant and is never deleted", async () => {
        state.existingProfile = { id: "user-1" };
        const res = await post(VALID);
        expect(res.status).toBe(202);
        expect(inserted("tenants")).toHaveLength(0);
        expect(state.deleteUser).not.toHaveBeenCalled();
    });
});
