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
        { id: "signup-admin", role: "admin" },
        { id: "owner-a", role: "admin" },
        { id: "platform", role: "super_admin" },
        { id: "staff-a", role: "employee" },
        { id: "staff-b", role: "employee" },
    ],
    tenant_members: [
        { user_id: "signup-admin", tenant_id: "own-tenant", role: "admin", status: "active" },
        { user_id: "owner-a", tenant_id: TENANT_A, role: "admin", status: "active" },
        { user_id: "staff-a", tenant_id: TENANT_A, role: "member", status: "active" },
        { user_id: "staff-b", tenant_id: TENANT_B, role: "member", status: "active" },
        { user_id: "platform", tenant_id: TENANT_A, role: "admin", status: "active" },
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
    it("allows an admin over a member of their own tenant", async () => {
        const result = await requireAdminOverUser(callAs("owner-a"), "staff-a");
        expect(result).toEqual({ ok: true, userId: "owner-a" });
    });

    it("rejects an admin over a member of another tenant", async () => {
        const result = await requireAdminOverUser(callAs("owner-a"), "staff-b");
        expect(result.ok).toBe(false);
    });

    it("rejects a self-serve admin over anyone outside their tenant", async () => {
        const result = await requireAdminOverUser(callAs("signup-admin"), "staff-a");
        expect(result.ok).toBe(false);
    });

    it("rejects an employee", async () => {
        const result = await requireAdminOverUser(callAs("staff-a"), "staff-a");
        expect(result.ok).toBe(false);
    });

    it("allows a super_admin over anyone", async () => {
        const result = await requireAdminOverUser(callAs("platform"), "staff-b");
        expect(result).toEqual({ ok: true, userId: "platform" });
    });
});
