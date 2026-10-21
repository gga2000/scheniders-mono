import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: vi.fn(),
    verifyAccessToken: vi.fn(),
}));

import {
    requireAdminOverUser,
    requirePlatformAdmin,
    requireTenantAdminFor,
    requireTenantMemberFor,
} from "./require-action-caller";
import { createSupabaseServiceClient, verifyAccessToken } from "@/lib/supabase-server";

type Row = Record<string, unknown>;

/**
 * An in-memory stand-in for the two tables the guards read. Each chain records
 * `eq`/`in` filters and resolves against the rows, so a test states the data
 * and the guard runs its real queries over it.
 */
function fakeClient(tables: Record<string, Row[]>) {
    return {
        from(table: string) {
            const filters: ((row: Row) => boolean)[] = [];
            let cap = Infinity;
            const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r))).slice(0, cap);
            const chain = {
                select: () => chain,
                eq: (col: string, val: unknown) => {
                    filters.push((r) => r[col] === val);
                    return chain;
                },
                in: (col: string, vals: unknown[]) => {
                    filters.push((r) => vals.includes(r[col]));
                    return chain;
                },
                limit: (n: number) => {
                    cap = n;
                    return chain;
                },
                maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
                then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
                    Promise.resolve({ data: rows(), error: null }).then(resolve),
            };
            return chain;
        },
    };
}

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";

/** Self-serve signup gives every new account `user_profiles.role = 'admin'`. */
const tables: Record<string, Row[]> = {
    user_profiles: [
        { id: "signup-admin", role: "admin", current_tenant_id: "own-tenant", is_active: true },
        { id: "owner-a", role: "admin", current_tenant_id: TENANT_A, is_active: true },
        { id: "platform", role: "super_admin", current_tenant_id: TENANT_B, is_active: true },
        { id: "staff-a", role: "employee", current_tenant_id: TENANT_A, is_active: true },
        { id: "staff-b", role: "employee", current_tenant_id: TENANT_B, is_active: true },
        // Admin of A and B, currently acting in A.
        { id: "owner-ab", role: "admin", current_tenant_id: TENANT_A, is_active: true },
        // Pointed their own current_tenant_id at a tenant they do not belong to.
        { id: "tamperer", role: "admin", current_tenant_id: TENANT_A, is_active: true },
    ],
    tenant_members: [
        { user_id: "signup-admin", tenant_id: "own-tenant", role: "admin", status: "active" },
        { user_id: "owner-a", tenant_id: TENANT_A, role: "admin", status: "active" },
        { user_id: "staff-a", tenant_id: TENANT_A, role: "employee", status: "active" },
        { user_id: "staff-b", tenant_id: TENANT_B, role: "employee", status: "active" },
        { user_id: "platform", tenant_id: TENANT_A, role: "admin", status: "active" },
        { user_id: "owner-ab", tenant_id: TENANT_A, role: "admin", status: "active" },
        { user_id: "owner-ab", tenant_id: TENANT_B, role: "admin", status: "active" },
        { user_id: "tamperer", tenant_id: "own-tenant-2", role: "admin", status: "active" },
    ],
};

function callAs(userId: string) {
    vi.mocked(verifyAccessToken).mockResolvedValue({ user: { id: userId }, error: null } as never);
    return "token";
}

beforeEach(() => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(fakeClient(tables) as never);
});

describe("requireTenantAdminFor", () => {
    it("rejects a self-serve admin acting on a tenant they do not belong to", async () => {
        const result = await requireTenantAdminFor(callAs("signup-admin"), TENANT_A);
        expect(result.ok).toBe(false);
    });

    it("allows an admin of the named tenant", async () => {
        const result = await requireTenantAdminFor(callAs("owner-a"), TENANT_A);
        expect(result).toEqual({ ok: true, userId: "owner-a" });
    });

    it("rejects a non-admin member of the named tenant", async () => {
        const result = await requireTenantAdminFor(callAs("staff-a"), TENANT_A);
        expect(result.ok).toBe(false);
    });

    it("allows a super_admin on any tenant", async () => {
        const result = await requireTenantAdminFor(callAs("platform"), TENANT_B);
        expect(result).toEqual({ ok: true, userId: "platform" });
    });
});

describe("requireTenantMemberFor", () => {
    it("rejects a self-serve admin on a tenant they do not belong to", async () => {
        const result = await requireTenantMemberFor(callAs("signup-admin"), TENANT_B);
        expect(result.ok).toBe(false);
    });
});

describe("requirePlatformAdmin", () => {
    it("rejects a tenant admin — admin is not a platform role", async () => {
        const result = await requirePlatformAdmin(callAs("owner-a"));
        expect(result.ok).toBe(false);
    });

    it("allows a super_admin", async () => {
        const result = await requirePlatformAdmin(callAs("platform"));
        expect(result).toEqual({ ok: true, userId: "platform" });
    });

    it("rejects a missing token", async () => {
        const result = await requirePlatformAdmin(undefined);
        expect(result.ok).toBe(false);
    });
});

describe("requireAdminOverUser", () => {
    it("allows an admin over a member of their active tenant, and names that tenant", async () => {
        const result = await requireAdminOverUser(callAs("owner-a"), "staff-a");
        expect(result).toEqual({ ok: true, userId: "owner-a", tenantId: TENANT_A });
    });

    it("rejects an admin over a member of another tenant", async () => {
        const result = await requireAdminOverUser(callAs("owner-a"), "staff-b");
        expect(result.ok).toBe(false);
    });

    it("rejects an admin of two tenants over a member of the one they are not acting in", async () => {
        const result = await requireAdminOverUser(callAs("owner-ab"), "staff-b");
        expect(result.ok).toBe(false);
    });

    it("rejects a self-serve admin over anyone outside their tenant", async () => {
        const result = await requireAdminOverUser(callAs("signup-admin"), "staff-a");
        expect(result.ok).toBe(false);
    });

    it("rejects an admin whose current_tenant_id points at a tenant they do not belong to", async () => {
        const result = await requireAdminOverUser(callAs("tamperer"), "staff-a");
        expect(result.ok).toBe(false);
    });

    it("rejects an employee", async () => {
        const result = await requireAdminOverUser(callAs("staff-a"), "staff-a");
        expect(result.ok).toBe(false);
    });

    it("allows a super_admin over a member of the tenant they are acting in", async () => {
        const result = await requireAdminOverUser(callAs("platform"), "staff-b");
        expect(result).toEqual({ ok: true, userId: "platform", tenantId: TENANT_B });
    });

    it("rejects a super_admin over a user outside the tenant they are acting in", async () => {
        const result = await requireAdminOverUser(callAs("platform"), "staff-a");
        expect(result.ok).toBe(false);
    });
});
