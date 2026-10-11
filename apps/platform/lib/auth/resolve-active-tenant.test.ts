import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: vi.fn(),
}));

import { resolveActiveTenant } from "./resolve-active-tenant";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

type Row = Record<string, unknown>;

function fakeClient(tables: Record<string, Row[]>) {
    return {
        from(table: string) {
            const filters: ((row: Row) => boolean)[] = [];
            const chain = {
                select: () => chain,
                eq: (col: string, val: unknown) => {
                    filters.push((r) => r[col] === val);
                    return chain;
                },
                maybeSingle: () =>
                    Promise.resolve({
                        data: (tables[table] ?? []).find((r) => filters.every((f) => f(r))) ?? null,
                        error: null,
                    }),
            };
            return chain;
        },
    };
}

const tables: Record<string, Row[]> = {
    user_profiles: [
        { id: "member", current_tenant_id: "tenant-a", role: "employee", is_active: true },
        { id: "tamperer", current_tenant_id: "tenant-a", role: "admin", is_active: true },
        { id: "inactive", current_tenant_id: "tenant-a", role: "employee", is_active: false },
        { id: "no-tenant", current_tenant_id: null, role: "admin", is_active: true },
        { id: "platform", current_tenant_id: "tenant-b", role: "super_admin", is_active: true },
    ],
    tenant_members: [
        { user_id: "member", tenant_id: "tenant-a", role: "member", status: "active" },
        // The tamperer is a member of their own signup tenant only, but has
        // pointed current_tenant_id at tenant-a.
        { user_id: "tamperer", tenant_id: "own-tenant", role: "admin", status: "active" },
    ],
};

beforeEach(() => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(fakeClient(tables) as never);
});

describe("resolveActiveTenant", () => {
    it("accepts current_tenant_id when the user is an active member", async () => {
        expect(await resolveActiveTenant("member")).toEqual({
            ok: true,
            tenantId: "tenant-a",
            role: "employee",
            memberRole: "member",
        });
    });

    it("rejects a current_tenant_id the user is not a member of", async () => {
        expect(await resolveActiveTenant("tamperer")).toMatchObject({ ok: false, status: 403 });
    });

    it("rejects a deactivated user", async () => {
        expect(await resolveActiveTenant("inactive")).toMatchObject({ ok: false, status: 403 });
    });

    it("rejects a user with no active tenant", async () => {
        expect(await resolveActiveTenant("no-tenant")).toMatchObject({ ok: false, status: 400 });
    });

    it("lets a platform admin act in any tenant", async () => {
        expect(await resolveActiveTenant("platform")).toEqual({
            ok: true,
            tenantId: "tenant-b",
            role: "super_admin",
            memberRole: null,
        });
    });
});
