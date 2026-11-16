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
                is: (col: string, val: null) => {
                    filters.push((r) => r[col] === val);
                    return chain;
                },
                gt: (col: string, val: string) => {
                    filters.push((r) => typeof r[col] === "string" && Date.parse(r[col] as string) > Date.parse(val));
                    return chain;
                },
                limit: () => chain,
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

const LATER = new Date(Date.now() + 20 * 60 * 1000).toISOString();
const EARLIER = new Date(Date.now() - 60 * 1000).toISOString();

const tables: Record<string, Row[]> = {
    support_view_sessions: [
        { viewer_user_id: "viewer-live", tenant_id: "tenant-a", ended_at: null, expires_at: LATER },
        { viewer_user_id: "viewer-ended", tenant_id: "tenant-a", ended_at: EARLIER, expires_at: LATER },
        { viewer_user_id: "viewer-expired", tenant_id: "tenant-a", ended_at: null, expires_at: EARLIER },
        { viewer_user_id: "viewer-elsewhere", tenant_id: "tenant-b", ended_at: null, expires_at: LATER },
    ],
    user_profiles: [
        { id: "member", current_tenant_id: "tenant-a", role: "employee", is_active: true },
        { id: "tamperer", current_tenant_id: "tenant-a", role: "admin", is_active: true },
        { id: "inactive", current_tenant_id: "tenant-a", role: "employee", is_active: false },
        { id: "no-tenant", current_tenant_id: null, role: "admin", is_active: true },
        { id: "platform", current_tenant_id: "tenant-b", role: "super_admin", is_active: true },
        // Global role says employee, but they administer tenant-a.
        { id: "promoted", current_tenant_id: "tenant-a", role: "employee", is_active: true },
        // Global role says admin (every signup), but in tenant-a they are a viewer.
        { id: "signup-viewer", current_tenant_id: "tenant-a", role: "admin", is_active: true },
        { id: "suspended", current_tenant_id: "tenant-a", role: "admin", is_active: true },
        // Support look-only sign-ins: no membership anywhere.
        { id: "viewer-live", current_tenant_id: "tenant-a", role: "viewer", is_active: true },
        { id: "viewer-ended", current_tenant_id: "tenant-a", role: "viewer", is_active: true },
        { id: "viewer-expired", current_tenant_id: "tenant-a", role: "viewer", is_active: true },
        { id: "viewer-elsewhere", current_tenant_id: "tenant-a", role: "viewer", is_active: true },
    ],
    tenant_members: [
        { user_id: "member", tenant_id: "tenant-a", role: "employee", status: "active" },
        { user_id: "promoted", tenant_id: "tenant-a", role: "admin", status: "active" },
        { user_id: "signup-viewer", tenant_id: "tenant-a", role: "viewer", status: "active" },
        { user_id: "signup-viewer", tenant_id: "own-tenant", role: "admin", status: "active" },
        { user_id: "suspended", tenant_id: "tenant-a", role: "admin", status: "suspended" },
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
            platformAdmin: false,
            readOnly: false,
        });
    });

    it("takes the role from the membership, not the global profile role", async () => {
        expect(await resolveActiveTenant("promoted")).toMatchObject({ ok: true, role: "admin" });
        expect(await resolveActiveTenant("signup-viewer")).toMatchObject({ ok: true, role: "viewer" });
    });

    it("rejects a membership that is not active", async () => {
        expect(await resolveActiveTenant("suspended")).toMatchObject({ ok: false, status: 403 });
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
            platformAdmin: true,
            readOnly: false,
        });
    });

    it("reads a live look-only support session as a read-only viewer", async () => {
        expect(await resolveActiveTenant("viewer-live")).toEqual({
            ok: true,
            tenantId: "tenant-a",
            role: "viewer",
            platformAdmin: false,
            readOnly: true,
        });
    });

    it.each(["viewer-ended", "viewer-expired", "viewer-elsewhere"])(
        "rejects a support sign-in whose session is not live on this shop (%s)",
        async (id) => {
            expect(await resolveActiveTenant(id)).toMatchObject({ ok: false, status: 403 });
        },
    );

    it("never marks a member read-only", async () => {
        expect(await resolveActiveTenant("promoted")).toMatchObject({ readOnly: false });
    });
});
