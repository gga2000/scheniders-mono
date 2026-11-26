import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeServiceClient } from "@/lib/testing/fake-service-client";
import type { RequestCaller } from "@/lib/auth/require-request-caller";
import { sealPrimePassword } from "@/lib/prime/login-seal";

const TENANT = "11111111-1111-4111-8111-111111111111";
const KEY = randomBytes(32);

const state = vi.hoisted(() => ({
    caller: null as RequestCaller | null,
    row: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/auth/require-request-caller", () => ({ requireRequestCaller: async () => state.caller }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: () => fakeServiceClient(() => ({ data: state.row })).client }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: async () => ({ allowed: true, remaining: 9, reset: 0 }), rateLimitHeaders: () => ({}) }));
vi.mock("@/lib/prime/login-seal", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/prime/login-seal")>()),
    primeLoginKeyFromEnv: () => KEY,
}));

import { GET } from "./route";

const get = (reveal = false) =>
    GET(new NextRequest(`http://localhost/api/prime/saved-login${reveal ? "?reveal=1" : ""}`, { headers: { Authorization: "Bearer t" } }));

beforeEach(() => {
    state.caller = { ok: true, userId: "owner-1", tenantId: TENANT, role: "admin", platformAdmin: false, readOnly: false };
    state.row = { login_id: "sara_shop", password_sealed: sealPrimePassword("pass-1234", TENANT, KEY) };
});

describe("GET /api/prime/saved-login", () => {
    it("shows the login, and the password only when asked", async () => {
        expect(await (await get()).json()).toEqual({ success: true, saved: { loginId: "sara_shop" } });
        const res = await get(true);
        expect(res.headers.get("cache-control")).toBe("no-store");
        expect(await res.json()).toEqual({ success: true, saved: { loginId: "sara_shop", password: "pass-1234" } });
    });

    it("never opens the password for our staff or a look-only support view", async () => {
        state.caller = { ok: true, userId: "staff", tenantId: TENANT, role: "super_admin", platformAdmin: true, readOnly: false };
        expect((await get(true)).status).toBe(403);
        state.caller = { ok: true, userId: "staff", tenantId: TENANT, role: "admin", platformAdmin: true, readOnly: true };
        expect((await get(true)).status).toBe(403);
    });

    it("a store with no saved sign-in gets none", async () => {
        state.row = null;
        expect(await (await get(true)).json()).toEqual({ success: true, saved: null });
    });
});
