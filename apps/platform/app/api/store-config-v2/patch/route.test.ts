/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach } from "vitest";

// The billing lock (Fermi A1) is read from the database: the store is not
// locked unless a test locks it.
const lockState = vi.hoisted(() => ({ locked: false }));
vi.mock("@/lib/billing/lock-refusal", async () => {
    const { NextResponse } = await import("next/server");
    return {
        billingLockRefusal: async () =>
            lockState.locked ? NextResponse.json({ code: "billing_locked" }, { status: 402 }) : null,
    };
});

/* ─────────────────────────────────────────────────────────────────── */
/* Mock @supabase/ssr + next/headers before importing the route.        */
/* POST handler now calls supabase.rpc() — mocked below.               */
/* ─────────────────────────────────────────────────────────────────── */

interface FakeState {
    user: { id: string } | null;
    rpcError: { code?: string; message?: string } | null;
    rpcCalls: number;
}

const state: FakeState = {
    user: null,
    rpcError: null,
    rpcCalls: 0,
};

function makeFakeSupabase() {
    return {
        auth: {
            getUser: async () => ({ data: { user: state.user } }),
        },
        rpc(_fn: string, _args: unknown) {
            state.rpcCalls += 1;
            return Promise.resolve({ error: state.rpcError });
        },
    };
}

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServerClient: async () => makeFakeSupabase(),
}));

import { POST, setByPath } from "./route";

/** A valid RFC-4122 v4 UUID that passes Zod's strict uuid() validator. */
const TENANT_UUID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

function makeRequest(body: unknown): Request {
    return new Request("http://localhost/api/store-config-v2/patch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    state.user = null;
    state.rpcError = null;
    state.rpcCalls = 0;
    lockState.locked = false;
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
    it("returns 400 on bad payload — empty path", async () => {
        state.user = { id: "u1" };
        const res = await POST(
            makeRequest({ tenant_id: TENANT_UUID, is_draft: true, path: [], value: 1 }),
        );
        expect(res.status).toBe(400);
        const json = (await res.json()) as { error: string };
        expect(json.error).toBe("Bad payload");
    });

    it("returns 400 on bad payload — non-uuid tenant_id", async () => {
        state.user = { id: "u1" };
        const res = await POST(
            makeRequest({ tenant_id: "not-a-uuid", is_draft: true, path: ["x"], value: 1 }),
        );
        expect(res.status).toBe(400);
        const json = (await res.json()) as { error: string };
        expect(json.error).toBe("Bad payload");
    });

    it("returns 401 when no auth", async () => {
        state.user = null;
        const res = await POST(
            makeRequest({
                tenant_id: TENANT_UUID,
                is_draft: true,
                path: ["pages", 0],
                value: "x",
            }),
        );
        expect(res.status).toBe(401);
    });

    it("returns 403 when RPC returns a 42501 permission-denied error", async () => {
        state.user = { id: "u1" };
        state.rpcError = { code: "42501", message: "permission denied" };
        const res = await POST(
            makeRequest({
                tenant_id: TENANT_UUID,
                is_draft: true,
                path: ["pages", 0],
                value: "x",
            }),
        );
        expect(res.status).toBe(403);
        const json = (await res.json()) as { error: string };
        expect(json.error).toBe("Forbidden");
    });

    it("returns 500 when RPC returns a generic error", async () => {
        state.user = { id: "u1" };
        state.rpcError = { code: "23505", message: "some db error" };
        const res = await POST(
            makeRequest({
                tenant_id: TENANT_UUID,
                is_draft: true,
                path: ["pages", 0],
                value: "x",
            }),
        );
        expect(res.status).toBe(500);
        const json = (await res.json()) as { error: string };
        expect(json.error).toBe("Failed to apply patch");
    });

    it("returns 200 and echoes back applied patch on success", async () => {
        state.user = { id: "u1" };
        state.rpcError = null;
        const res = await POST(
            makeRequest({
                tenant_id: TENANT_UUID,
                is_draft: true,
                path: ["pages", 0, "title"],
                value: "new title",
            }),
        );
        expect(res.status).toBe(200);
        const json = (await res.json()) as { ok: boolean; applied: { path: unknown[]; value: unknown } };
        expect(json.ok).toBe(true);
        expect(json.applied.path).toEqual(["pages", 0, "title"]);
        expect(json.applied.value).toBe("new title");
    });

    it("returns 402 for a store locked until its bill is paid, and patches nothing", async () => {
        state.user = { id: "u1" };
        lockState.locked = true;
        const res = await POST(
            makeRequest({ tenant_id: TENANT_UUID, is_draft: true, path: ["pages", 0, "title"], value: "x" }),
        );
        expect(res.status).toBe(402);
        expect(state.rpcCalls).toBe(0);
    });

    /* ── M1: path allowlist + size guards ──────────────────────────── */

    it("returns 400 for a non-editable path root (e.g. schema_version)", async () => {
        state.user = { id: "u1" };
        const res = await POST(
            makeRequest({
                tenant_id: TENANT_UUID,
                is_draft: true,
                path: ["schema_version"],
                value: 99,
            }),
        );
        expect(res.status).toBe(400);
        const json = (await res.json()) as { error: string };
        expect(json.error).toBe("Field not editable");
    });

    it("returns 400 when the first path segment is numeric (no top-level array)", async () => {
        state.user = { id: "u1" };
        const res = await POST(
            makeRequest({
                tenant_id: TENANT_UUID,
                is_draft: true,
                path: [0, "title"],
                value: "x",
            }),
        );
        expect(res.status).toBe(400);
    });

    it("returns 400 when the patch value exceeds the size cap", async () => {
        state.user = { id: "u1" };
        const res = await POST(
            makeRequest({
                tenant_id: TENANT_UUID,
                is_draft: true,
                path: ["custom_css"],
                value: "x".repeat(524_289),
            }),
        );
        expect(res.status).toBe(400);
        const json = (await res.json()) as { error: string };
        expect(json.error).toBe("Value too large");
    });
});
