import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

type CallerResult =
    | { ok: true; userId: string; tenantId: string; role: string; memberRole: string | null }
    | { ok: false; response: NextResponse };

const state = vi.hoisted(() => ({
    caller: null as CallerResult | null,
    requirements: [] as string[],
    rpc: vi.fn(),
    lookup: { data: null as { id: string } | null, error: null as { message: string } | null },
}));

vi.mock("@/lib/auth/require-request-caller", () => ({
    requireRequestCaller: async (_req: Request, requirement: string) => {
        state.requirements.push(requirement);
        if (!state.caller) throw new Error("test did not set a caller");
        return state.caller;
    },
}));

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: () => ({
        rpc: state.rpc,
        from: () => ({
            select: () => ({
                eq: () => ({ maybeSingle: async () => state.lookup }),
            }),
        }),
    }),
}));

import { GET, PATCH } from "./route";

const admin: CallerResult = {
    ok: true,
    userId: "u1",
    tenantId: "tenant-a",
    role: "user",
    memberRole: "admin",
};

const patch = (body: unknown) =>
    new Request("http://x/api/tenant/slug", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
        body: JSON.stringify(body),
    });

beforeEach(() => {
    state.caller = admin;
    state.requirements = [];
    state.rpc.mockReset();
    state.lookup = { data: null, error: null };
});

describe("PATCH /api/tenant/slug", () => {
    it("requires a tenant admin and renames THAT caller's active tenant", async () => {
        state.rpc.mockResolvedValue({ data: "tenant-1783087997714", error: null });
        const res = await PATCH(patch({ slug: " Zahraa-Beauty " }));
        expect(state.requirements).toEqual(["tenant-admin"]);
        expect(state.rpc).toHaveBeenCalledWith("claim_tenant_slug", {
            p_tenant: "tenant-a",
            p_slug: "zahraa-beauty",
        });
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toEqual({
            ok: true,
            slug: "zahraa-beauty",
            previous: "tenant-1783087997714",
            unchanged: false,
        });
    });

    it("ignores any tenant id in the body", async () => {
        state.rpc.mockResolvedValue({ data: "old", error: null });
        await PATCH(patch({ slug: "noor-beauty", tenant_id: "tenant-b" }));
        expect(state.rpc).toHaveBeenCalledWith("claim_tenant_slug", {
            p_tenant: "tenant-a",
            p_slug: "noor-beauty",
        });
    });

    it("passes through the auth refusal and never touches the DB", async () => {
        state.caller = {
            ok: false,
            response: NextResponse.json({ error: "This action requires an administrator." }, { status: 403 }),
        };
        const res = await PATCH(patch({ slug: "noor-beauty" }));
        expect(res.status).toBe(403);
        expect(state.rpc).not.toHaveBeenCalled();
    });

    it("rejects reserved and malformed handles before the DB", async () => {
        const reserved = await PATCH(patch({ slug: "admin" }));
        expect(reserved.status).toBe(422);
        await expect(reserved.json()).resolves.toMatchObject({ reason: "reserved" });
        const malformed = await PATCH(patch({ slug: "no--pe" }));
        expect(malformed.status).toBe(422);
        expect(state.rpc).not.toHaveBeenCalled();
    });

    it("maps the unique-constraint race to 409", async () => {
        state.rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "dup" } });
        const res = await PATCH(patch({ slug: "noor-beauty" }));
        expect(res.status).toBe(409);
    });

    it("reports any other DB failure as a 500, not a success", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        state.rpc.mockResolvedValue({
            data: null,
            error: { code: "PGRST202", message: "function not found" },
        });
        const res = await PATCH(patch({ slug: "noor-beauty" }));
        expect(res.status).toBe(500);
        expect(log).toHaveBeenCalled();
        log.mockRestore();
    });
});

describe("GET /api/tenant/slug", () => {
    const get = (slug: string) =>
        GET(new Request(`http://x/api/tenant/slug?slug=${encodeURIComponent(slug)}`));

    it("requires a member", async () => {
        state.caller = {
            ok: false,
            response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        };
        const res = await get("noor-beauty");
        expect(res.status).toBe(401);
        expect(state.requirements).toEqual(["member"]);
    });

    it("answers available / taken / reserved", async () => {
        await expect((await get("noor-beauty")).json()).resolves.toEqual({ available: true });

        state.lookup = { data: { id: "tenant-b" }, error: null };
        await expect((await get("noor-beauty")).json()).resolves.toEqual({
            available: false,
            reason: "taken",
        });

        await expect((await get("www")).json()).resolves.toEqual({
            available: false,
            reason: "reserved",
        });
    });

    it("does not call the caller's own slug taken", async () => {
        state.lookup = { data: { id: "tenant-a" }, error: null };
        await expect((await get("my-shop")).json()).resolves.toEqual({ available: true });
    });

    it("surfaces a failed lookup as 500", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        state.lookup = { data: null, error: { message: "timeout" } };
        expect((await get("noor-beauty")).status).toBe(500);
        log.mockRestore();
    });
});
