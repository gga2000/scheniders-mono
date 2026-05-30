/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach } from "vitest";

/* ─────────────────────────────────────────────────────────────────── */
/* Mock @supabase/ssr + next/headers before importing the route.        */
/* ─────────────────────────────────────────────────────────────────── */

interface Tenant {
    id: string;
    store_config_v2: Record<string, unknown> | null;
    store_config_v2_draft: Record<string, unknown> | null;
}

interface FakeState {
    user: { id: string } | null;
    members: Array<{ tenant_id: string; user_id: string }>;
    tenants: Tenant[];
}

const state: FakeState = {
    user: null,
    members: [],
    tenants: [],
};

function makeFakeSupabase() {
    return {
        auth: {
            getUser: async () => ({ data: { user: state.user } }),
        },
        from(table: string) {
            if (table === "tenant_members") {
                const filters: Record<string, string> = {};
                const chain = {
                    select(_cols: string) {
                        return chain;
                    },
                    eq(col: string, val: string) {
                        filters[col] = val;
                        return chain;
                    },
                    maybeSingle() {
                        const row = state.members.find(
                            (m) =>
                                m.tenant_id === filters.tenant_id &&
                                m.user_id === filters.user_id,
                        );
                        return Promise.resolve({
                            data: row ?? null,
                            error: null,
                        });
                    },
                };
                return chain;
            }
            if (table === "tenants") {
                const filters: Record<string, string> = {};
                let updateValues: Record<string, unknown> | null = null;
                const chain = {
                    select(_cols: string) {
                        return chain;
                    },
                    update(values: Record<string, unknown>) {
                        updateValues = values;
                        return chain;
                    },
                    eq(col: string, val: string) {
                        filters[col] = val;
                        if (updateValues) {
                            // Apply update on terminal eq for update path.
                            const t = state.tenants.find(
                                (x) => x.id === filters.id,
                            );
                            if (t && updateValues) {
                                Object.assign(t, updateValues);
                            }
                            return Promise.resolve({ data: null, error: null });
                        }
                        return chain;
                    },
                    maybeSingle() {
                        const row = state.tenants.find((x) => x.id === filters.id);
                        return Promise.resolve({
                            data: row ?? null,
                            error: null,
                        });
                    },
                };
                return chain;
            }
            throw new Error(`Unexpected table: ${table}`);
        },
    };
}

vi.mock("@supabase/ssr", () => ({
    createServerClient: () => makeFakeSupabase(),
}));

vi.mock("next/headers", () => ({
    cookies: async () => ({
        getAll: () => [],
    }),
}));

vi.mock("@/lib/env", () => ({
    env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    },
}));

import { POST, setByPath } from "./route";

function makeRequest(body: unknown): Request {
    return new Request("http://localhost/api/store-config-v2/patch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    state.user = null;
    state.members = [];
    state.tenants = [];
});

describe("setByPath", () => {
    it("is an immutable clone-and-set, not a mutator", () => {
        const root = { a: { b: { c: 1 } }, sibling: { keep: true } };
        const next = setByPath(root, ["a", "b", "c"], 99) as typeof root;
        expect(next.a.b.c).toBe(99);
        // Original untouched.
        expect(root.a.b.c).toBe(1);
        // Sibling reference preserved.
        expect(next.sibling).toBe(root.sibling);
        // Write path is fresh.
        expect(next.a).not.toBe(root.a);
        expect(next.a.b).not.toBe(root.a.b);
    });

    it("creates intermediate arrays when next key is numeric", () => {
        const out = setByPath({}, ["pages", 0, "title"], "Home") as Record<
            string,
            unknown
        >;
        expect(Array.isArray((out as { pages: unknown }).pages)).toBe(true);
        expect(
            ((out as { pages: Array<{ title: string }> }).pages)[0].title,
        ).toBe("Home");
    });

    it("creates intermediate objects when next key is a string", () => {
        const out = setByPath({}, ["a", "b", "c"], 7) as Record<string, unknown>;
        expect(out).toEqual({ a: { b: { c: 7 } } });
    });
});

describe("POST /api/store-config-v2/patch", () => {
    it("returns 401 when no auth", async () => {
        state.user = null;
        const res = await POST(
            makeRequest({
                tenant_id: "t1",
                is_draft: true,
                path: ["pages", 0],
                value: "x",
            }),
        );
        expect(res.status).toBe(401);
    });

    it("returns 403 when user is not a member of the tenant", async () => {
        state.user = { id: "u1" };
        state.tenants = [
            { id: "t1", store_config_v2: null, store_config_v2_draft: {} },
        ];
        // No matching membership row.
        state.members = [{ tenant_id: "t2", user_id: "u1" }];
        const res = await POST(
            makeRequest({
                tenant_id: "t1",
                is_draft: true,
                path: ["pages", 0],
                value: "x",
            }),
        );
        expect(res.status).toBe(403);
    });

    it("returns 200 and applies patch to draft when is_draft=true", async () => {
        state.user = { id: "u1" };
        state.members = [{ tenant_id: "t1", user_id: "u1" }];
        state.tenants = [
            {
                id: "t1",
                store_config_v2: null,
                store_config_v2_draft: {
                    pages: [{ title: "old" }],
                },
            },
        ];
        const res = await POST(
            makeRequest({
                tenant_id: "t1",
                is_draft: true,
                path: ["pages", 0, "title"],
                value: "new",
            }),
        );
        expect(res.status).toBe(200);
        const json = (await res.json()) as { ok: boolean; applied: unknown };
        expect(json.ok).toBe(true);
        const t = state.tenants[0];
        expect(
            (t.store_config_v2_draft as { pages: Array<{ title: string }> })
                .pages[0].title,
        ).toBe("new");
    });

    it("returns 422 when tenant is not found", async () => {
        state.user = { id: "u1" };
        state.members = [{ tenant_id: "t-missing", user_id: "u1" }];
        state.tenants = [];
        const res = await POST(
            makeRequest({
                tenant_id: "t-missing",
                is_draft: true,
                path: ["pages", 0],
                value: "x",
            }),
        );
        expect(res.status).toBe(422);
    });

    it("returns 400 on bad payload", async () => {
        const res = await POST(
            makeRequest({ tenant_id: "", is_draft: true, path: [], value: 1 }),
        );
        expect(res.status).toBe(400);
    });
});
