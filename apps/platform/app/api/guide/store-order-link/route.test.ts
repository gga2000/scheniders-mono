import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { verifyPreviewToken } from "@scheniders/shared/preview-token";
import type { RequestCaller } from "@/lib/auth/require-request-caller";

const SECRET = "test-preview-secret";

const state = vi.hoisted(() => ({
    caller: null as RequestCaller | null,
    requirements: [] as string[],
    tenant: { data: null as { slug: string } | null, error: null as { message: string } | null },
    domains: { data: [] as { domain: string; created_at: string | null }[], error: null as { message: string } | null },
    reads: [] as { table: string; filters: [string, unknown][] }[],
}));

vi.mock("@/lib/auth/require-request-caller", () => ({
    requireRequestCaller: async (_req: Request, requirement: string) => {
        state.requirements.push(requirement);
        if (!state.caller) throw new Error("test did not set a caller");
        return state.caller;
    },
}));

vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN: "scheniders.com" } }));
vi.mock("@/lib/job-monitor", () => ({ withFailureReport: (_job: string, handler: unknown) => handler }));

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: () => ({
        from: (table: string) => {
            const read = { table, filters: [] as [string, unknown][] };
            state.reads.push(read);
            const chain = {
                select: () => chain,
                eq: (column: string, value: unknown) => {
                    read.filters.push([column, value]);
                    return chain;
                },
                maybeSingle: async () => state.tenant,
                then: (resolve: (value: unknown) => void) => resolve(state.domains),
            };
            return chain;
        },
    }),
}));

import { GET } from "./route";

const admin: RequestCaller = { ok: true, userId: "u1", tenantId: "tenant-a", role: "admin", platformAdmin: false, readOnly: false };
const request = () => new NextRequest("https://schenidersapp.xyz/api/guide/store-order-link", { headers: { Authorization: "Bearer t" } });

async function linkFrom(res: Response): Promise<URL> {
    const body = (await res.json()) as { success: boolean; data: { url: string } };
    expect(body.success).toBe(true);
    return new URL(body.data.url);
}

beforeEach(() => {
    vi.stubEnv("PREVIEW_TOKEN_SECRET", SECRET);
    state.caller = admin;
    state.requirements = [];
    state.tenant = { data: { slug: "zahraa" }, error: null };
    state.domains = { data: [], error: null };
    state.reads = [];
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("GET /api/guide/store-order-link (Fermi B11)", () => {
    it("opens the caller's own store in draft view, with a token for that shop that lasts 2 hours", async () => {
        const before = Math.floor(Date.now() / 1000);
        const res = await GET(request());
        expect(res.status).toBe(200);
        expect(state.requirements).toEqual(["tenant-admin"]);
        expect(state.reads.map((r) => r.table)).toEqual(["tenants", "tenant_domains"]);
        expect(state.reads[0].filters).toEqual([["id", "tenant-a"]]);
        expect(state.reads[1].filters).toEqual([
            ["tenant_id", "tenant-a"],
            ["verified", true],
        ]);

        const link = await linkFrom(res);
        expect(link.origin).toBe("https://zahraa.scheniders.com");
        expect(link.pathname).toBe("/api/draft-view");
        expect(link.searchParams.get("tenant")).toBe("zahraa");
        expect(link.searchParams.get("to")).toBe("/");

        const token = verifyPreviewToken(link.searchParams.get("token") ?? "", SECRET);
        if (!token.ok) throw new Error(`token did not verify: ${token.reason}`);
        expect(token.payload.tenant_id).toBe("tenant-a");
        expect(token.payload.exp - before).toBeGreaterThanOrEqual(2 * 3600);
        expect(token.payload.exp - before).toBeLessThanOrEqual(2 * 3600 + 5);
    });

    it("uses the shop's own verified domain before its Vercel host", async () => {
        state.domains = {
            data: [
                { domain: "zahraa-shop.vercel.app", created_at: "2026-01-01T00:00:00Z" },
                { domain: "zahraa.iq", created_at: "2026-02-01T00:00:00Z" },
            ],
            error: null,
        };
        const link = await linkFrom(await GET(request()));
        expect(link.origin).toBe("https://zahraa.iq");
    });

    it("says no_store when the shop has no address yet", async () => {
        state.tenant = { data: null, error: null };
        const res = await GET(request());
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ success: false, error: "no_store" });
    });

    it("turns away anyone who is not the shop's admin", async () => {
        state.caller = { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
        const res = await GET(request());
        expect(res.status).toBe(403);
        expect(state.reads).toEqual([]);
    });

    it("fails loudly rather than handing out a link when no token key is set", async () => {
        vi.stubEnv("PREVIEW_TOKEN_SECRET", "");
        vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
        await expect(GET(request())).rejects.toThrow("no preview token secret");
    });
});
