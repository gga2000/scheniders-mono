import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

/**
 * The tenant comes from the user_profiles row alone, so it is published as
 * soon as that row arrives. The order book (and every other tenant-scoped
 * read) starts then, instead of after the tenant_members role and the
 * permission reads, two more round trips. The role it is paired with must
 * never be another tenant's: on a tenant switch the old role and permissions
 * are dropped in the same render.
 */

const USER = "u-1";
const TENANT_A = "t-a";
const TENANT_B = "t-b";

const H = vi.hoisted(() => {
    type Result = { data: unknown; error: null };
    const held = new Map<string, Array<(r: Result) => void>>();
    const profile = { current: { id: "u-1", role: "employee", current_tenant_id: "t-a" } as Record<string, unknown> };
    const roles = { current: { "t-a": "admin", "t-b": "viewer" } as Record<string, string> };
    const overrides = {
        current: [] as Array<{ tenant_id: string; user_id: string; permission: string; is_granted: boolean }>,
    };
    let authCallback: ((event: string, session: unknown) => void) | null = null;
    /** Reads of these tables wait until the test releases them. */
    const holdTables = new Set<string>();

    function answer(table: string, filters: Record<string, unknown>): Result {
        if (table === "user_profiles") return { data: profile.current, error: null };
        if (table === "tenant_members") return { data: { role: roles.current[String(filters.tenant_id)] }, error: null };
        if (table === "role_permissions") return { data: [{ permission: `perm:${String(filters.role)}` }], error: null };
        if (table === "user_permissions") {
            // Overrides are per tenant; a read without a tenant filter sees every tenant's.
            const rows = overrides.current.filter(
                (o) => o.user_id === filters.user_id && (filters.tenant_id === undefined || o.tenant_id === filters.tenant_id),
            );
            return { data: rows.map(({ permission, is_granted }) => ({ permission, is_granted })), error: null };
        }
        return { data: [], error: null };
    }

    function from(table: string) {
        const filters: Record<string, unknown> = {};
        const chain: Record<string, unknown> = {};
        for (const op of ["select", "single", "maybeSingle", "update"]) chain[op] = () => chain;
        chain.eq = (column: string, value: unknown) => {
            filters[column] = value;
            return chain;
        };
        chain.then = (resolve: (r: Result) => unknown) => {
            const result = answer(table, filters);
            if (!holdTables.has(table)) return Promise.resolve(result).then(resolve);
            return new Promise<Result>((r) => {
                const queue = held.get(table) ?? [];
                queue.push(r);
                held.set(table, queue);
            }).then(() => resolve(result));
        };
        return chain;
    }

    return {
        profile,
        roles,
        overrides,
        holdTables,
        release(table: string) {
            for (const r of held.get(table) ?? []) r({ data: null, error: null });
            held.delete(table);
        },
        emit(event: string) {
            authCallback?.(event, { user: { id: "u-1", email: "a@b.c" }, access_token: "tok" });
        },
        supabase: {
            from,
            auth: {
                onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
                    authCallback = cb;
                    return { data: { subscription: { unsubscribe: () => {} } } };
                },
                getSession: async () => ({ data: { session: null }, error: null }),
            },
            realtime: { setAuth: async () => {} },
        },
    };
});

vi.mock("@/lib/supabase", () => ({ supabase: H.supabase }));
vi.mock("@/lib/activity-logger", () => ({ activityLogger: { log: vi.fn() } }));

import { AuthProvider, useAuth } from "./auth-provider";

function Probe() {
    const { tenantId, role, permissions, profileLoaded } = useAuth();
    return (
        <div data-testid="probe">
            {JSON.stringify({ tenantId, role, permissions, profileLoaded })}
        </div>
    );
}

const state = () => JSON.parse(screen.getByTestId("probe").textContent ?? "{}") as {
    tenantId: string | null;
    role: string | null;
    permissions: string[];
    profileLoaded: boolean;
};

beforeEach(() => {
    H.holdTables.clear();
    H.profile.current = { id: USER, role: "employee", current_tenant_id: TENANT_A };
    H.overrides.current = [];
});
afterEach(cleanup);

describe("AuthProvider publishes the tenant from the profile row", () => {
    it("before the role and permission reads have answered", async () => {
        H.holdTables.add("tenant_members");
        H.holdTables.add("role_permissions");
        H.holdTables.add("user_permissions");
        render(<AuthProvider><Probe /></AuthProvider>);
        act(() => H.emit("INITIAL_SESSION"));

        // Tenant known; role, permissions and profileLoaded still pending.
        await waitFor(() => expect(state().tenantId).toBe(TENANT_A));
        expect(state()).toMatchObject({ role: null, permissions: [], profileLoaded: false });

        await act(async () => H.release("tenant_members"));
        await act(async () => {
            H.release("role_permissions");
            H.release("user_permissions");
        });
        await waitFor(() => expect(state().profileLoaded).toBe(true));
        expect(state()).toMatchObject({ tenantId: TENANT_A, role: "admin", permissions: ["perm:admin"] });
    });

    it("never pairs a switched-to tenant with the previous tenant's role", async () => {
        const seen: Array<{ tenantId: string | null; role: string | null; profileLoaded: boolean }> = [];
        function Recorder() {
            const { tenantId, role, profileLoaded } = useAuth();
            seen.push({ tenantId, role, profileLoaded });
            return null;
        }
        render(<AuthProvider><Probe /><Recorder /></AuthProvider>);
        act(() => H.emit("INITIAL_SESSION"));
        await waitFor(() => expect(state()).toMatchObject({ tenantId: TENANT_A, role: "admin", profileLoaded: true }));

        // Switch: the profile now points at tenant B, where this user is a viewer.
        H.profile.current = { id: USER, role: "employee", current_tenant_id: TENANT_B };
        H.holdTables.add("tenant_members");
        seen.length = 0;
        act(() => H.emit("SIGNED_IN"));

        await waitFor(() => expect(state().tenantId).toBe(TENANT_B));
        // Tenant B is shown with no role and the profile marked loading, not with tenant A's admin.
        expect(state()).toMatchObject({ role: null, permissions: [], profileLoaded: false });
        expect(seen.some((s) => s.tenantId === TENANT_B && s.role === "admin")).toBe(false);

        await act(async () => H.release("tenant_members"));
        await waitFor(() => expect(state()).toMatchObject({ tenantId: TENANT_B, role: "viewer", profileLoaded: true }));
        expect(seen.some((s) => s.tenantId === TENANT_B && s.role === "admin")).toBe(false);
    });

    it("does not reset the role when the same tenant's profile is read again", async () => {
        render(<AuthProvider><Probe /></AuthProvider>);
        act(() => H.emit("INITIAL_SESSION"));
        await waitFor(() => expect(state()).toMatchObject({ role: "admin", profileLoaded: true }));

        H.holdTables.add("tenant_members");
        act(() => H.emit("SIGNED_IN"));
        // Same tenant: the loaded role stays while the re-read is in flight.
        await new Promise((r) => setTimeout(r, 20));
        expect(state()).toMatchObject({ tenantId: TENANT_A, role: "admin", profileLoaded: true });
        await act(async () => H.release("tenant_members"));
    });
});

describe("AuthProvider applies only the current tenant's permission overrides", () => {
    it("ignores an override granted in another tenant", async () => {
        // A viewer in tenant B, granted financials by tenant A's admin: that
        // grant means nothing in B (has_tenant_permission agrees).
        H.profile.current = { id: USER, role: "employee", current_tenant_id: TENANT_B };
        H.overrides.current = [
            { tenant_id: TENANT_A, user_id: USER, permission: "system.financials.view", is_granted: true },
            { tenant_id: TENANT_B, user_id: USER, permission: "orders.export", is_granted: true },
        ];
        render(<AuthProvider><Probe /></AuthProvider>);
        act(() => H.emit("INITIAL_SESSION"));

        await waitFor(() => expect(state().profileLoaded).toBe(true));
        expect(state().role).toBe("viewer");
        expect(state().permissions).toEqual(["perm:viewer", "orders.export"]);
    });
});
