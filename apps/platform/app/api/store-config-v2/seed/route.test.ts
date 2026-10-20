import { describe, it, expect, vi, beforeEach } from "vitest";
import { CONTENT_PACKS } from "@/lib/store-templates/content-packs";
import { starterTaxonomy } from "@/lib/starter-store";

/* ─────────────────────────────────────────────────────────────────── */
/* The seed route's starter-taxonomy path: what it accepts, what it      */
/* writes, and what it reports when a write fails.                       */
/* ─────────────────────────────────────────────────────────────────── */

interface Upsert {
    table: string;
    rows: Array<Record<string, unknown>>;
    options: unknown;
}

const state = {
    user: { id: "user-1" } as { id: string } | null,
    seeded: true,
    failTable: null as string | null,
    upserts: [] as Upsert[],
};

function makeFakeSupabase() {
    return {
        auth: { getUser: async () => ({ data: { user: state.user } }) },
        rpc: async () => ({ data: state.seeded, error: null }),
        from(table: string) {
            return {
                upsert(rows: Array<Record<string, unknown>>, options: unknown) {
                    state.upserts.push({ table, rows, options });
                    return {
                        select: async () =>
                            state.failTable === table
                                ? { data: null, error: { message: "boom" } }
                                : { data: rows.map((_, i) => ({ id: `${table}-${i}` })), error: null },
                    };
                },
            };
        },
    };
}

vi.mock("@supabase/ssr", () => ({ createServerClient: () => makeFakeSupabase() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [] }) }));
vi.mock("@/lib/env", () => ({
    env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    },
}));

import { POST } from "./route";

const TENANT = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

function post(body: unknown): Promise<Response> {
    return POST(
        new Request("http://localhost/api/store-config-v2/seed", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }),
    );
}

function bodyFor(packId: string) {
    const taxonomy = starterTaxonomy(packId);
    return {
        tenant_id: TENANT,
        config: { schema_version: 2 },
        categories: taxonomy.categories,
        attribute_defs: taxonomy.attribute_defs,
    };
}

beforeEach(() => {
    state.user = { id: "user-1" };
    state.seeded = true;
    state.failTable = null;
    state.upserts = [];
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /api/store-config-v2/seed — starter taxonomy", () => {
    it.each(CONTENT_PACKS.map((p) => p.id))("accepts the %s pack's categories and attributes", async (id) => {
        const res = await post(bodyFor(id));
        expect(res.status).toBe(200);
    });

    it("writes the taxonomy under the seeded tenant, skipping rows that already exist", async () => {
        const body = bodyFor("coffee");
        const res = await post(body);
        const json = (await res.json()) as { taxonomy: { categories: number; attribute_defs: number; errors: string[] } };

        const cats = state.upserts.find((u) => u.table === "categories");
        const attrs = state.upserts.find((u) => u.table === "product_attribute_defs");
        expect(cats?.rows.every((r) => r.tenant_id === TENANT)).toBe(true);
        expect(attrs?.rows.every((r) => r.tenant_id === TENANT)).toBe(true);
        expect(cats?.options).toEqual({ onConflict: "tenant_id,slug", ignoreDuplicates: true });
        expect(attrs?.options).toEqual({ onConflict: "tenant_id,key", ignoreDuplicates: true });
        expect(json.taxonomy).toEqual({
            categories: body.categories.length,
            attribute_defs: body.attribute_defs.length,
            errors: [],
        });
    });

    it("writes no taxonomy when the store already existed", async () => {
        state.seeded = false;
        const res = await post(bodyFor("coffee"));
        expect(res.status).toBe(200);
        expect(state.upserts).toHaveLength(0);
    });

    it("reports a failed write instead of hiding it, and still seeds the store", async () => {
        state.failTable = "product_attribute_defs";
        const res = await post(bodyFor("coffee"));
        const json = (await res.json()) as { seeded: boolean; taxonomy: { errors: string[] } };
        expect(res.status).toBe(200);
        expect(json.seeded).toBe(true);
        expect(json.taxonomy.errors).toEqual(["attribute_defs"]);
    });

    it("refuses an attribute key the table's CHECK would reject", async () => {
        const body = bodyFor("coffee");
        body.attribute_defs = [{ ...body.attribute_defs[0], key: "1roast" }];
        const res = await post(body);
        expect(res.status).toBe(400);
    });
});
