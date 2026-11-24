import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

/**
 * A page load's first session starts from the server's first-load answer
 * (lib/boot) when it is about the same user: no profile, membership or
 * permission reads, and the page's first figures already in the cache. Any
 * other sign-in, or an answer about someone else, reads as before.
 */

const H = vi.hoisted(() => {
    const reads: string[] = [];
    let authCallback: ((event: string, session: unknown) => void) | null = null;
    function from(table: string) {
        const chain: Record<string, unknown> = {};
        for (const op of ["select", "eq", "is", "gt", "order", "limit", "update"]) chain[op] = () => chain;
        const answer = () => {
            reads.push(table);
            if (table === "user_profiles") return { data: { id: "u-1", email: "a@b.c", role: "employee", current_tenant_id: "t-net" }, error: null };
            if (table === "tenant_members") return { data: { role: "viewer" }, error: null };
            if (table === "role_permissions") return { data: [{ role: "viewer", permission: "perm:viewer" }], error: null };
            return { data: [], error: null };
        };
        chain.single = () => Promise.resolve(answer());
        chain.maybeSingle = () => Promise.resolve(answer());
        chain.then = (resolve: (r: unknown) => unknown) => Promise.resolve(answer()).then(resolve);
        return chain;
    }
    return {
        reads,
        emit(event: string, userId = "u-1") {
            authCallback?.(event, { user: { id: userId, email: "a@b.c", app_metadata: {} }, access_token: "tok" });
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

import { QueryClient } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./auth-provider";
import { getQueryClient } from "@/lib/query-client";
import { BOOT_GLOBAL, type BootPayload } from "@/lib/boot/schema";

function Probe() {
    const { tenantId, role, permissions, profileLoaded, profileMissing } = useAuth();
    return <div data-testid="probe">{JSON.stringify({ tenantId, role, permissions, profileLoaded, profileMissing })}</div>;
}
const state = () => JSON.parse(screen.getByTestId("probe").textContent ?? "{}") as Record<string, unknown>;

function figures(tenantId: string) {
    const source = new QueryClient();
    source.setQueryData(["dashboard-metrics", "all", tenantId], { total: 7 }, { updatedAt: 5_000 });
    return { mutations: [], queries: source.getQueryCache().getAll().map((q) => ({ queryKey: q.queryKey, queryHash: q.queryHash, state: q.state })) };
}

function leaveBoot(userId: string, over: Partial<NonNullable<BootPayload["session"]>> = {}) {
    const payload: BootPayload = {
        v: 1,
        serverNow: 5_000,
        session: {
            userId,
            profile: { id: userId, email: "a@b.c", display_name: null, role: "employee", avatar_url: null, current_tenant_id: "t-boot" },
            tenantId: "t-boot",
            role: "admin",
            permissions: ["perm:admin"],
            supportView: null,
            ...over,
        },
        queries: figures("t-boot"),
    };
    window[BOOT_GLOBAL] = Promise.resolve({ status: 200, body: payload, at: 6_000 });
}

beforeEach(() => {
    H.reads.length = 0;
    getQueryClient().clear();
});
afterEach(() => {
    cleanup();
    delete window[BOOT_GLOBAL];
});

describe("AuthProvider and the first-load answer", () => {
    it("starts from it on the first session, with no reads of its own", async () => {
        leaveBoot("u-1");
        render(<AuthProvider><Probe /></AuthProvider>);
        act(() => H.emit("INITIAL_SESSION"));

        await waitFor(() => expect(state()).toMatchObject({ tenantId: "t-boot", role: "admin", permissions: ["perm:admin"], profileLoaded: true }));
        expect(H.reads).toEqual([]);
        expect(getQueryClient().getQueryData(["dashboard-metrics", "all", "t-boot"])).toEqual({ total: 7 });
    });

    it("shows an unprovisioned sign-in as such", async () => {
        leaveBoot("u-1", { profile: null, tenantId: null, role: null, permissions: [] });
        render(<AuthProvider><Probe /></AuthProvider>);
        act(() => H.emit("INITIAL_SESSION"));
        await waitFor(() => expect(state()).toMatchObject({ profileMissing: true, profileLoaded: true, role: null }));
        expect(H.reads).toEqual([]);
    });

    it("ignores an answer about another user, and reads", async () => {
        leaveBoot("someone-else");
        render(<AuthProvider><Probe /></AuthProvider>);
        act(() => H.emit("INITIAL_SESSION"));

        await waitFor(() => expect(state()).toMatchObject({ tenantId: "t-net", role: "viewer", profileLoaded: true }));
        expect(H.reads).toContain("user_profiles");
        expect(getQueryClient().getQueryData(["dashboard-metrics", "all", "t-boot"])).toBeUndefined();
    });

    it("reads afresh on a later sign-in, never reusing an answer", async () => {
        render(<AuthProvider><Probe /></AuthProvider>);
        act(() => H.emit("INITIAL_SESSION"));
        await waitFor(() => expect(state()).toMatchObject({ tenantId: "t-net", profileLoaded: true }));

        // An answer left over (say, from a later page's head) is not this sign-in's.
        leaveBoot("u-1");
        H.reads.length = 0;
        act(() => H.emit("SIGNED_IN"));
        await waitFor(() => expect(H.reads).toContain("user_profiles"));
        await waitFor(() => expect(state()).toMatchObject({ tenantId: "t-net", role: "viewer" }));
    });
});
