import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { fakeServiceClient, type FakeCall, type FakeResult } from "@/lib/testing/fake-service-client";
import type { RequestCaller } from "@/lib/auth/require-request-caller";
import type { PrimeLinkResult } from "@/lib/prime/self-link";

const TENANT = "11111111-1111-4111-8111-111111111111";

const state = vi.hoisted(() => ({
    caller: null as RequestCaller | null,
    requirements: [] as string[],
    allowed: true,
    connected: false,
    open: null as Record<string, unknown> | null,
    check: vi.fn(),
    link: vi.fn(),
}));

let fake = fakeServiceClient((call) => respond(call));
function respond(call: FakeCall): FakeResult {
    if (call.table === "prime_link_requests" && call.op === "select") return { data: state.open };
    return {};
}

vi.mock("@/lib/auth/require-request-caller", () => ({
    requireRequestCaller: async (_req: Request, requirement: string) => {
        state.requirements.push(requirement);
        return state.caller;
    },
}));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: () => fake.client }));
vi.mock("@/lib/rate-limit", () => ({
    consumeRateLimit: async () => ({ allowed: state.allowed, remaining: 0, reset: 0 }),
    rateLimitHeaders: () => ({}),
}));
vi.mock("@/lib/prime/client", () => ({ getPrimeClient: () => ({ prime: true }) }));
vi.mock("@/lib/prime/connection", () => ({
    loadPrimeLink: async () => (state.connected ? { client: { prime: true }, connection: { merchantLoginId: "m", shopId: 1, branchName: null } } : null),
}));
vi.mock("@/lib/prime/self-link", () => ({
    checkPrimeLinkRequest: (...args: unknown[]) => state.check(...args),
    linkPrimeRequest: (...args: unknown[]) => state.link(...args),
}));

import { GET, POST } from "./route";

const post = (body: unknown) =>
    POST(
        new NextRequest("http://localhost/api/prime/link", {
            method: "POST",
            headers: { Authorization: "Bearer t", "content-type": "application/json" },
            body: JSON.stringify(body),
        }),
    );
const get = () => GET(new NextRequest("http://localhost/api/prime/link", { headers: { Authorization: "Bearer t" } }));

const openRow = (fields: Record<string, unknown> = {}) => ({
    id: "req-1",
    tenant_id: TENANT,
    prime_phone: "07701234567",
    created_at: "2026-11-16T00:00:00Z",
    checked_at: "2026-11-16T00:01:00Z",
    outcome: "not_linked",
    prime_shops: null,
    ...fields,
});

beforeEach(() => {
    state.caller = { ok: true, userId: "owner-1", tenantId: TENANT, role: "admin", platformAdmin: false };
    state.requirements = [];
    state.allowed = true;
    state.connected = false;
    state.open = null;
    state.check = vi.fn(async (): Promise<PrimeLinkResult> => ({ outcome: "not_linked" }));
    state.link = vi.fn(async () => "connected");
    fake = fakeServiceClient((call) => respond(call));
});

describe("GET /api/prime/link", () => {
    it("is for store admins only", async () => {
        state.caller = { ok: false, response: NextResponse.json({}, { status: 403 }) };
        expect((await get()).status).toBe(403);
        expect(state.requirements).toEqual(["tenant-admin"]);
    });

    it("shows the open request and why it waits, never the Prime account it found", async () => {
        state.open = openRow({ outcome: "shared_account", prime_shops: [{ id: 1, name: "Someone else's shop" }] });
        const body = await (await get()).json();
        expect(body).toEqual({
            success: true,
            connected: false,
            request: { phone: "07701234567", outcome: "shared_account", checkedAt: "2026-11-16T00:01:00Z" },
        });
    });

    it("shows the shops only while the store picks one of its own", async () => {
        state.open = openRow({ outcome: "choose_shop", prime_shops: [{ id: 1, name: "Main" }, { id: 2, name: "Second" }] });
        const body = (await (await get()).json()) as { request: { shops: unknown } };
        expect(body.request.shops).toEqual([{ id: 1, name: "Main" }, { id: 2, name: "Second" }]);
    });
});

describe("POST /api/prime/link", () => {
    it("a number that is not an Iraqi mobile is refused in Arabic and nothing is saved", async () => {
        const res = await post({ phone: "12345" });
        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ code: "bad_phone", error: expect.stringContaining("رقم موبايل عراقي") });
        expect(fake.calls).toEqual([]);
        expect(state.check).not.toHaveBeenCalled();
    });

    it("saves the store's request with the normalized number and checks it with Prime at once", async () => {
        let reads = 0;
        fake = fakeServiceClient((call) => {
            if (call.op === "select") {
                reads += 1;
                return { data: reads === 1 ? null : openRow({ outcome: null, checked_at: null }) };
            }
            return {};
        });
        const res = await post({ phone: "+964 770 123 4567" });
        expect(res.status).toBe(200);
        const insert = fake.calls.find((c) => c.table === "prime_link_requests" && c.op === "insert");
        expect(insert?.payload).toMatchObject({ tenant_id: TENANT, prime_phone: "07701234567", requested_by: "owner-1", outcome: null });
        expect(state.check).toHaveBeenCalledWith(fake.client, { prime: true }, expect.objectContaining({ id: "req-1", prime_phone: "07701234567" }));
    });

    it("a new number replaces the open request's, and forgets what was found for the old one", async () => {
        state.open = openRow({ outcome: "shared_account" });
        await post({ phone: "07801234567" });
        const update = fake.calls.find((c) => c.table === "prime_link_requests" && c.op === "update");
        expect(update?.payload).toMatchObject({ prime_phone: "07801234567", outcome: null, prime_login_id: null, prime_shops: null });
        expect(update?.filters).toContainEqual({ method: "is", args: ["linked_at", null] });
        expect(fake.calls.some((c) => c.op === "insert")).toBe(false);
    });

    it("the store picks a shop only when it was asked to", async () => {
        state.open = openRow({ outcome: "not_linked" });
        expect((await post({ shopId: 2 })).status).toBe(409);
        state.open = openRow({ outcome: "choose_shop", prime_shops: [{ id: 2, name: "Second" }] });
        expect((await post({ shopId: 2 })).status).toBe(200);
        expect(state.link).toHaveBeenCalledWith(fake.client, "req-1", 2);
        state.link = vi.fn(async () => "unknown_shop");
        expect((await post({ shopId: 9 })).status).toBe(400);
    });

    it("look again: checks the open request", async () => {
        state.open = openRow();
        expect((await post({ recheck: true })).status).toBe(200);
        expect(state.check).toHaveBeenCalledTimes(1);
    });

    it("too many checks in a minute are refused before Prime is asked", async () => {
        state.allowed = false;
        state.open = openRow();
        expect((await post({ recheck: true })).status).toBe(429);
        expect(state.check).not.toHaveBeenCalled();
    });

    it("a store already linked changes nothing", async () => {
        state.connected = true;
        const res = await post({ phone: "07701234567" });
        expect(await res.json()).toEqual({ success: true, connected: true, request: null });
        expect(fake.calls).toEqual([]);
        expect(state.check).not.toHaveBeenCalled();
    });
});
