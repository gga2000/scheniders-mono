import { describe, it, expect, vi, beforeEach } from "vitest";

// restoreVaultExtrasAction writes with the service role, which skips RLS, so
// these tests pin the checks that stand in for it: tenant, role, foreign ids
// and the links that must stay inside the store.

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: vi.fn(),
    verifyAccessToken: vi.fn(),
}));
vi.mock("@/lib/auth/resolve-active-tenant", () => ({ resolveActiveTenant: vi.fn() }));

import { restoreVaultExtrasAction } from "./vault";
import { createSupabaseServiceClient, verifyAccessToken } from "@/lib/supabase-server";
import { resolveActiveTenant } from "@/lib/auth/resolve-active-tenant";
import type { UserRole } from "@/lib/permissions";

const TENANT = "22222222-2222-4222-8222-222222222222";
const OTHER_TENANT = "44444444-4444-4444-8444-444444444444";
const ID_A = "33333333-3333-4333-8333-333333333333";
const ID_B = "55555555-5555-4555-8555-555555555555";
const TAG_OK = "66666666-6666-4666-8666-666666666666";
const TAG_GONE = "77777777-7777-4777-8777-777777777777";
const ORDER_OK = "88888888-8888-4888-8888-888888888888";
const ORDER_GONE = "99999999-9999-4999-8999-999999999999";
const MEMBER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STRANGER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type Row = Record<string, unknown>;

/** A chainable stand-in for the query builder: filters are ignored, each table answers with the rows it was given. */
function serviceClient(tables: Record<string, Row[]>) {
    const upserted: Record<string, Row[]> = {};
    const updated: { table: string; values: Row }[] = [];
    const from = vi.fn((table: string) => {
        const answer = () => Promise.resolve({ data: tables[table] ?? [], error: null });
        const chain: Record<string, unknown> = {};
        for (const name of ["select", "eq", "in"]) chain[name] = () => chain;
        chain.then = (resolve: (value: unknown) => unknown) => answer().then(resolve);
        chain.upsert = async (rows: Row[]) => {
            upserted[table] = rows;
            return { error: null };
        };
        chain.update = (values: Row) => {
            updated.push({ table, values });
            const done: Record<string, unknown> = {};
            done.eq = () => done;
            done.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve);
            return done;
        };
        return chain;
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue({ from } as unknown as ReturnType<typeof createSupabaseServiceClient>);
    return { upserted, updated };
}

function signedInAs(role: UserRole) {
    vi.mocked(verifyAccessToken).mockResolvedValue({ user: { id: "u1" }, error: null } as unknown as Awaited<ReturnType<typeof verifyAccessToken>>);
    vi.mocked(resolveActiveTenant).mockResolvedValue({ ok: true, tenantId: TENANT, role, platformAdmin: false });
}

beforeEach(() => {
    vi.mocked(createSupabaseServiceClient).mockReset();
});

describe("restoreVaultExtrasAction", () => {
    it("refuses anyone but an administrator", async () => {
        signedInAs("employee");
        const { upserted } = serviceClient({});
        const res = await restoreVaultExtrasAction("token", { table: "customer_tags", rows: [{ id: ID_A, name: "VIP" }] });
        expect(res.success).toBe(false);
        expect(upserted).toEqual({});
    });

    it("refuses the whole batch when an id belongs to another store", async () => {
        signedInAs("admin");
        const { upserted } = serviceClient({ categories: [{ id: ID_B, tenant_id: OTHER_TENANT }] });
        const res = await restoreVaultExtrasAction("token", { table: "categories", rows: [{ id: ID_A, name: "Oud" }, { id: ID_B, name: "Musk" }] });
        expect(res).toEqual({ success: false, error: "1 row(s) of categories in this backup belong to another store" });
        expect(upserted.categories).toBeUndefined();
    });

    it("writes the caller's tenant and only the listed columns", async () => {
        signedInAs("admin");
        const { upserted } = serviceClient({ customer_tags: [] });
        const res = await restoreVaultExtrasAction("token", {
            table: "customer_tags",
            rows: [{ id: ID_A, name: "VIP", color: "red", tenant_id: OTHER_TENANT, sneaky: 1 }],
        });
        expect(res).toEqual({ success: true, created: 1, updated: 0, skipped: 0 });
        expect(upserted.customer_tags).toEqual([{ id: ID_A, name: "VIP", color: "red", tenant_id: TENANT }]);
    });

    it("skips an assignment whose tag is not in this store", async () => {
        signedInAs("admin");
        const { upserted } = serviceClient({ customer_tags: [{ id: TAG_OK }], customer_tag_assignments: [] });
        const res = await restoreVaultExtrasAction("token", {
            table: "customer_tag_assignments",
            rows: [
                { id: ID_A, customer_phone: "0770", tag_id: TAG_OK },
                { id: ID_B, customer_phone: "0771", tag_id: TAG_GONE },
            ],
        });
        expect(res).toEqual({ success: true, created: 1, updated: 0, skipped: 1 });
        expect(upserted.customer_tag_assignments?.map((row) => row.id)).toEqual([ID_A]);
    });

    it("drops an expense's order link when the order is not in this store", async () => {
        signedInAs("admin");
        const { upserted } = serviceClient({ orders: [{ id: ORDER_OK }], expenses: [] });
        await restoreVaultExtrasAction("token", {
            table: "expenses",
            rows: [
                { id: ID_A, amount: 5000, order_id: ORDER_OK },
                { id: ID_B, amount: 7000, order_id: ORDER_GONE },
            ],
        });
        expect(upserted.expenses?.map((row) => row.order_id)).toEqual([ORDER_OK, null]);
    });

    it("keeps a note's author only when that person is an active member", async () => {
        signedInAs("admin");
        const { upserted } = serviceClient({ tenant_members: [{ user_id: MEMBER }], customer_notes: [] });
        await restoreVaultExtrasAction("token", {
            table: "customer_notes",
            rows: [
                { id: ID_A, customer_phone: "0770", note: "a", created_by: MEMBER },
                { id: ID_B, customer_phone: "0771", note: "b", created_by: STRANGER },
            ],
        });
        expect(upserted.customer_notes?.map((row) => row.created_by)).toEqual([MEMBER, null]);
    });

    it("links category parents only between categories of this store", async () => {
        signedInAs("admin");
        const { updated } = serviceClient({ categories: [{ id: ID_A }, { id: ID_B }] });
        const res = await restoreVaultExtrasAction("token", {
            table: "category_parents",
            rows: [
                { id: ID_B, parent_id: ID_A },
                { id: ID_A, parent_id: TAG_GONE },
            ],
        });
        expect(res).toEqual({ success: true, created: 0, updated: 1, skipped: 1 });
        expect(updated).toEqual([{ table: "categories", values: { parent_id: ID_A } }]);
    });
});
