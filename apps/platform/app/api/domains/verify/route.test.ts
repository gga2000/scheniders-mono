import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const state = vi.hoisted(() => ({
    caller: null as unknown,
    row: null as { id: string; domain: string; verified: boolean } | null,
    eqs: [] as Array<[string, unknown]>,
    updated: false,
    resolve: vi.fn(),
}));

vi.mock("@/lib/auth/require-request-caller", () => ({
    requireRequestCaller: async () => state.caller,
}));
vi.mock("dns/promises", () => ({ default: { resolveCname: state.resolve } }));
vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: () => ({
        from: () => ({
            select: () => {
                const q = {
                    eq: (c: string, v: unknown) => (state.eqs.push([c, v]), q),
                    maybeSingle: async () => ({ data: state.row, error: null }),
                };
                return q;
            },
            update: () => {
                const q = {
                    eq: () => q,
                    then: (r: (v: { error: null }) => void) => ((state.updated = true), r({ error: null })),
                };
                return q;
            },
        }),
    }),
}));

import { POST } from "./route";

const ID = "6f1c3d2e-8b7a-4c55-9d21-3a4b5c6d7e8f";
const req = (body: unknown) =>
    new Request("http://x/api/domains/verify", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
    state.caller = { ok: true, userId: "u", tenantId: "tenant-a", role: "admin", platformAdmin: false };
    state.row = { id: ID, domain: "shop.example.com", verified: false };
    state.eqs = [];
    state.updated = false;
    state.resolve.mockReset();
});

describe("POST /api/domains/verify", () => {
    it("returns the auth failure untouched", async () => {
        state.caller = { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
        expect((await POST(req({ domain_id: ID }))).status).toBe(401);
        expect(state.resolve).not.toHaveBeenCalled();
    });

    it("rejects a malformed id", async () => {
        expect((await POST(req({ domain_id: "x" }))).status).toBe(400);
    });

    it("scopes the lookup to the caller's tenant and 404s on a miss", async () => {
        state.row = null;
        expect((await POST(req({ domain_id: ID }))).status).toBe(404);
        expect(state.eqs).toContainEqual(["tenant_id", "tenant-a"]);
    });

    it("verifies when the CNAME points at Scheniders", async () => {
        state.resolve.mockResolvedValue(["cname.scheniders.com"]);
        const res = await POST(req({ domain_id: ID }));
        expect(await res.json()).toEqual({ verified: true });
        expect(state.updated).toBe(true);
    });

    it("does not verify a lookalike target", async () => {
        state.resolve.mockResolvedValue(["cname.scheniders.com.attacker.net"]);
        const res = await POST(req({ domain_id: ID }));
        expect((await res.json()).verified).toBe(false);
        expect(state.updated).toBe(false);
    });

    it("treats ENODATA as not-yet and other DNS errors as 502", async () => {
        state.resolve.mockRejectedValueOnce(Object.assign(new Error("x"), { code: "ENODATA" }));
        expect((await (await POST(req({ domain_id: ID }))).json()).verified).toBe(false);
        state.resolve.mockRejectedValueOnce(Object.assign(new Error("x"), { code: "ESERVFAIL" }));
        expect((await POST(req({ domain_id: ID }))).status).toBe(502);
        expect(state.updated).toBe(false);
    });
});
