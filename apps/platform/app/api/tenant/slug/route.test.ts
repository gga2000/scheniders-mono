import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

import type { RequestCaller } from "@/lib/auth/require-request-caller";

type CallerResult = RequestCaller;

const state = vi.hoisted(() => ({
    caller: null as CallerResult | null,
    requirements: [] as string[],
    rpc: vi.fn(),
    lookup: { data: null as { id: string } | null, error: null as { message: string } | null },
    history: {
        data: null as { tenant_id: string } | null,
        error: null as { message: string } | null,
    },
    tables: [] as string[],
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
        from: (table: string) => {
            state.tables.push(table);
            const result = table === "tenant_slug_history" ? state.history : state.lookup;
            return {
                select: () => ({
                    eq: () => ({ maybeSingle: async () => result }),
                }),
            };
        },
    }),
}));

import { GET, PATCH } from "./route";

const admin: CallerResult = {
    ok: true,
    userId: "u1",
    tenantId: "tenant-a",
    role: "admin",
    platformAdmin: false,
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
    state.history = { data: null, error: null };
    state.tables = [];
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

    it("answers 409 when the slug is another store's old link", async () => {
        // claim_tenant_slug's tenants trigger raises 23505 for a slug held in a
        // different tenant's tenant_slug_history (20261022090000); the route
        // must report it as taken, not as a success or a 500.
        state.rpc.mockResolvedValue({
            data: null,
            error: { code: "23505", message: "slug tenant-1783087997714 is another tenant's old link" },
        });
        const res = await PATCH(patch({ slug: "tenant-1783087997714" }));
        expect(res.status).toBe(409);
        await expect(res.json()).resolves.toMatchObject({ reason: "taken" });
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

    it("calls another store's old link taken, so its redirect cannot be captured", async () => {
        // Live: tenant-1783087997714 is zahraa-beauty's old handle; no tenant
        // holds it, but every link zahraa-beauty already shared resolves
        // through that history row.
        state.history = { data: { tenant_id: "tenant-b" }, error: null };
        await expect((await get("tenant-1783087997714")).json()).resolves.toEqual({
            available: false,
            reason: "taken",
        });
        expect(state.tables).toContain("tenant_slug_history");
    });

    it("lets a store take back its own old handle", async () => {
        state.history = { data: { tenant_id: "tenant-a" }, error: null };
        await expect((await get("my-old-shop")).json()).resolves.toEqual({ available: true });
    });

    it("surfaces a failed history lookup as 500, not as available", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        state.history = { data: null, error: { message: "timeout" } };
        expect((await get("noor-beauty")).status).toBe(500);
        expect(log).toHaveBeenCalled();
        log.mockRestore();
    });

    it("surfaces a failed lookup as 500", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        state.lookup = { data: null, error: { message: "timeout" } };
        expect((await get("noor-beauty")).status).toBe(500);
        log.mockRestore();
    });
});

/**
 * The route maps 23505 to 409; the DB is what raises it. These pin the
 * migration's guard so it cannot be dropped silently. Its behaviour is
 * exercised by packages/supabase/tests/tenant_slug_claim.sql against the
 * applied migration.
 */
describe("20261022090000_tenant_slug_claim.sql", () => {
    const sql = fs
        .readFileSync(
            path.resolve(
                __dirname,
                "../../../../../../packages/supabase/migrations/20261022090000_tenant_slug_claim.sql",
            ),
            "utf8",
        )
        .replace(/--.*$/gm, "")
        .replace(/\s+/g, " ")
        .toLowerCase();

    it("refuses, on every tenants write, a slug another tenant's history holds", () => {
        expect(sql).toContain(
            "before insert or update of slug on public.tenants for each row execute function public.tenants_slug_not_in_foreign_history()",
        );
        expect(sql).toContain("where h.old_slug = new.slug and h.tenant_id <> new.id");
        expect(sql).toContain("using errcode = '23505'");
    });

    it("only ever deletes the claiming tenant's own history row", () => {
        expect(sql).toContain(
            "delete from public.tenant_slug_history where old_slug = p_slug and tenant_id = p_tenant;",
        );
        expect(sql).not.toMatch(/delete from public\.tenant_slug_history where old_slug = p_slug;/);
        // Never reassigns an existing history row to the claiming tenant.
        expect(sql).not.toContain("on conflict (old_slug) do update");
    });
});
