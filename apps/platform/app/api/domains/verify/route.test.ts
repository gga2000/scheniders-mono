import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const state = vi.hoisted(() => ({
    caller: null as unknown,
    row: null as { id: string; domain: string; verified: boolean; verification_token: string } | null,
    eqs: [] as Array<[string, unknown]>,
    updated: false,
    takenBy: 0,
    resolve: vi.fn(),
    resolveTxt: vi.fn(),
    resolve4: vi.fn(),
}));

vi.mock("@/lib/auth/require-request-caller", () => ({
    requireRequestCaller: async () => state.caller,
}));
vi.mock("dns/promises", () => ({ default: { resolveCname: state.resolve, resolveTxt: state.resolveTxt, resolve4: state.resolve4 } }));
vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: () => ({
        from: () => ({
            select: () => {
                const q = {
                    eq: (c: string, v: unknown) => (state.eqs.push([c, v]), q),
                    neq: async () => ({ count: state.takenBy, error: null }),
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

const vercel = vi.hoisted(() => ({ provision: vi.fn() }));
vi.mock("@/lib/vercel-domains", () => {
    class DomainConflictError extends Error {}
    return { DomainConflictError, provisionCustomDomain: vercel.provision };
});

import { DomainConflictError } from "@/lib/vercel-domains";
import { POST } from "./route";

const ID = "6f1c3d2e-8b7a-4c55-9d21-3a4b5c6d7e8f";
const req = (body: unknown) =>
    new Request("http://x/api/domains/verify", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
    state.caller = { ok: true, userId: "u", tenantId: "tenant-a", role: "admin", platformAdmin: false };
    state.row = { id: ID, domain: "shop.example.com", verified: false, verification_token: "tok123" };
    state.eqs = [];
    state.updated = false;
    state.takenBy = 0;
    state.resolve.mockReset();
    state.resolveTxt.mockReset();
    state.resolveTxt.mockResolvedValue([["scheniders-verify=tok123"]]);
    state.resolve4.mockReset();
    state.resolve4.mockRejectedValue(Object.assign(new Error("x"), { code: "ENODATA" }));
    vercel.provision.mockReset();
    vercel.provision.mockResolvedValue("active");
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
        state.resolve.mockResolvedValue(["cname.vercel-dns.com"]);
        const res = await POST(req({ domain_id: ID }));
        expect(await res.json()).toEqual({ verified: true, ssl: "active" });
        expect(state.updated).toBe(true);
        expect(vercel.provision).toHaveBeenCalledWith("shop.example.com");
    });

    it("does not touch Vercel until the CNAME is right", async () => {
        state.resolve.mockResolvedValue(["cname.vercel-dns.com.attacker.net"]);
        await POST(req({ domain_id: ID }));
        expect(vercel.provision).not.toHaveBeenCalled();
    });

    it("verifies without SSL when Vercel is not configured", async () => {
        state.resolve.mockResolvedValue(["cname.vercel-dns.com"]);
        vercel.provision.mockResolvedValue("not_configured");
        expect(await (await POST(req({ domain_id: ID }))).json()).toEqual({ verified: true, ssl: "not_configured" });
        expect(state.updated).toBe(true);
    });

    it("refuses a domain another store has already verified, before touching Vercel", async () => {
        state.resolve.mockResolvedValue(["cname.vercel-dns.com"]);
        state.takenBy = 1;
        const body = await (await POST(req({ domain_id: ID }))).json();
        expect(body).toEqual({ verified: false, error: "This domain is already connected to another store." });
        expect(vercel.provision).not.toHaveBeenCalled();
        expect(state.updated).toBe(false);
    });

    it("refuses a domain another Vercel project already owns", async () => {
        state.resolve.mockResolvedValue(["cname.vercel-dns.com"]);
        vercel.provision.mockRejectedValue(new DomainConflictError("x"));
        const body = await (await POST(req({ domain_id: ID }))).json();
        expect(body.verified).toBe(false);
        expect(state.updated).toBe(false);
    });

    it("stays unverified and answers 502 when Vercel is down, so the merchant can retry", async () => {
        state.resolve.mockResolvedValue(["cname.vercel-dns.com"]);
        vercel.provision.mockRejectedValue(new Error("boom"));
        expect((await POST(req({ domain_id: ID }))).status).toBe(502);
        expect(state.updated).toBe(false);
    });

    it("does not verify a lookalike target", async () => {
        state.resolve.mockResolvedValue(["cname.vercel-dns.com.attacker.net"]);
        const res = await POST(req({ domain_id: ID }));
        expect((await res.json()).verified).toBe(false);
        expect(state.updated).toBe(false);
    });

    it("verifies a project-specific Vercel CNAME target", async () => {
        state.resolve.mockResolvedValue(["497c02790ff6f357.vercel-dns-017.com"]);
        const res = await POST(req({ domain_id: ID }));
        expect(await res.json()).toMatchObject({ verified: true });
        expect(state.updated).toBe(true);
    });

    it("verifies an apex through its A record when it has no CNAME", async () => {
        state.row = { id: ID, domain: "example.com", verified: false, verification_token: "tok123" };
        state.resolve.mockRejectedValue(Object.assign(new Error("x"), { code: "ENODATA" }));
        state.resolve4.mockResolvedValue(["76.76.21.21"]);
        const res = await POST(req({ domain_id: ID }));
        expect(await res.json()).toMatchObject({ verified: true });
        expect(vercel.provision).toHaveBeenCalledWith("example.com");
    });

    it("does not verify an apex whose A record points somewhere else", async () => {
        state.resolve.mockRejectedValue(Object.assign(new Error("x"), { code: "ENODATA" }));
        state.resolve4.mockResolvedValue(["192.64.119.16"]);
        expect((await (await POST(req({ domain_id: ID }))).json()).verified).toBe(false);
        expect(vercel.provision).not.toHaveBeenCalled();
        expect(state.updated).toBe(false);
    });

    it("answers 502 when the A lookup itself fails", async () => {
        state.resolve.mockRejectedValue(Object.assign(new Error("x"), { code: "ENODATA" }));
        state.resolve4.mockRejectedValue(Object.assign(new Error("x"), { code: "ETIMEOUT" }));
        expect((await POST(req({ domain_id: ID }))).status).toBe(502);
        expect(state.updated).toBe(false);
    });

    it("treats ENODATA as not-yet and other DNS errors as 502", async () => {
        state.resolve.mockRejectedValueOnce(Object.assign(new Error("x"), { code: "ENODATA" }));
        expect((await (await POST(req({ domain_id: ID }))).json()).verified).toBe(false);
        state.resolve.mockRejectedValueOnce(Object.assign(new Error("x"), { code: "ESERVFAIL" }));
        expect((await POST(req({ domain_id: ID }))).status).toBe(502);
        expect(state.updated).toBe(false);
    });

    it("refuses a domain whose TXT proof is missing or belongs to another store, before looking at the CNAME", async () => {
        state.resolve.mockResolvedValue(["cname.vercel-dns.com"]);
        state.resolveTxt.mockResolvedValueOnce([["scheniders-verify=someone-else"]]);
        expect(await (await POST(req({ domain_id: ID }))).json()).toMatchObject({ verified: false, reason: "txt_missing" });
        state.resolveTxt.mockRejectedValueOnce(Object.assign(new Error("x"), { code: "ENOTFOUND" }));
        expect(await (await POST(req({ domain_id: ID }))).json()).toMatchObject({ verified: false, reason: "txt_missing" });
        expect(state.resolveTxt).toHaveBeenCalledWith("_scheniders.shop.example.com");
        expect(state.resolve).not.toHaveBeenCalled();
        expect(vercel.provision).not.toHaveBeenCalled();
        expect(state.updated).toBe(false);
    });

    it("answers 502 when the TXT lookup itself fails", async () => {
        state.resolveTxt.mockRejectedValueOnce(Object.assign(new Error("x"), { code: "ESERVFAIL" }));
        expect((await POST(req({ domain_id: ID }))).status).toBe(502);
        expect(state.updated).toBe(false);
    });
});
