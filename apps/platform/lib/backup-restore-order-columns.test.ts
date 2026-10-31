import { describe, it, expect, vi, beforeEach } from "vitest";
import { queriesOn, resetRecording, respond } from "@/lib/__fixtures__/recording-supabase";

/*
 * Backups taken before migration 20261021090000 were read with select("*"),
 * so their order rows carry the margin keys (product_cost, net_profit,
 * waseet_merchant_price, waseet_company_price). PostgREST sends an upsert as
 * INSERT ... ON CONFLICT (id) DO UPDATE SET col = EXCLUDED.col, and Postgres
 * needs SELECT on every column whose EXCLUDED value it reads. Once
 * `authenticated` loses SELECT on the margin columns, sending those keys back
 * fails the whole restore with 42501, admins included. Every restore path must
 * send only ORDER_READ_COLUMNS keys.
 */

vi.mock("@/lib/supabase", async () => {
    const { recordingSupabase } = await import("@/lib/__fixtures__/recording-supabase");
    return {
        supabase: {
            ...recordingSupabase,
            auth: { getSession: async () => ({ data: { session: { access_token: "token" } } }) },
        },
    };
});
// Browsers cannot insert orders (trg_orders_order_id_server_only): both
// restores hand their order rows to this Server Action.
vi.mock("@/app/actions/orders", () => ({ restoreOrdersAction: vi.fn() }));

import { restoreOrderRows } from "./backup-utils";
import { executeVaultRestore, type VaultData } from "./vault-utils";
import { ORDER_MARGIN_COLUMNS, RESTORE_ORDERS_BATCH_SIZE } from "./repositories/order-columns";
import { restoreOrdersAction } from "@/app/actions/orders";

const TENANT = "11111111-1111-4111-8111-111111111111";

/** An order row as a pre-branch `select("*")` backup stored it. */
function legacyOrderRow(id: string): Record<string, unknown> {
    return {
        id,
        order_id: "1001",
        customer_name: "Ali",
        status: "new",
        price: 25000,
        tenant_id: TENANT,
        product_cost: null,
        net_profit: null,
        waseet_merchant_price: null,
        waseet_company_price: null,
        // Not an orders column (an old client-side field): PostgREST would 400 on it.
        risk_data: { score: 0 },
    };
}

/** The order rows sent to restoreOrdersAction, all batches in order. */
function restoredOrderRows(): Record<string, unknown>[] {
    const calls = vi.mocked(restoreOrdersAction).mock.calls;
    for (const [, token] of calls) expect(token).toBe("token");
    return calls.flatMap(([rows]) => rows as Record<string, unknown>[]);
}

beforeEach(() => {
    resetRecording();
    vi.mocked(restoreOrdersAction).mockReset();
    vi.mocked(restoreOrdersAction).mockImplementation(async (rows) => ({ success: true, restored: (rows as unknown[]).length }));
    respond((q) => (q.kind === "rpc" && q.target === "get_current_tenant_id"
        ? { data: TENANT, error: null }
        : { data: null, error: null }));
});

describe("restoreOrderRows", () => {
    it("sends orders to the server without the margin columns", async () => {
        await restoreOrderRows([legacyOrderRow("o1"), legacyOrderRow("o2")]);

        const rows = restoredOrderRows();
        expect(rows.map((r) => r.id)).toEqual(["o1", "o2"]);
        for (const row of rows) {
            for (const col of ORDER_MARGIN_COLUMNS) expect(row).not.toHaveProperty(col);
            expect(row).not.toHaveProperty("risk_data");
            expect(row).toMatchObject({ order_id: "1001", customer_name: "Ali", status: "new", price: 25000, tenant_id: TENANT });
        }
        expect(queriesOn("orders")).toHaveLength(0);
    });

    it("sends a large book in Server Action sized batches", async () => {
        const total = RESTORE_ORDERS_BATCH_SIZE * 2 + 1;

        await restoreOrderRows(Array.from({ length: total }, (_, i) => legacyOrderRow(`o${i}`)));

        const sizes = vi.mocked(restoreOrdersAction).mock.calls.map(([rows]) => (rows as unknown[]).length);
        expect(sizes).toEqual([RESTORE_ORDERS_BATCH_SIZE, RESTORE_ORDERS_BATCH_SIZE, 1]);
        expect(restoredOrderRows()).toHaveLength(total);
    });

    it("throws the server's refusal", async () => {
        vi.mocked(restoreOrdersAction).mockResolvedValue({ success: false, error: "1 order(s) in this backup belong to another store" });

        await expect(restoreOrderRows([legacyOrderRow("o1")])).rejects.toThrow("1 order(s) in this backup belong to another store");
    });
});

describe("executeVaultRestore", () => {
    it("sends orders to the server without the margin columns", async () => {
        const vault: VaultData = {
            metadata: { version: "1", timestamp: "2026-10-01T00:00:00.000Z", counts: { orders: 1, products: 0, customers: 0, categories: 0, expenses: 0, customer_tags: 0, customer_tag_assignments: 0, customer_notes: 0 } },
            data: { orders: [legacyOrderRow("o1")], products: [], customers: [], categories: [], expenses: [], customer_tags: [], customer_tag_assignments: [], customer_notes: [] },
        };

        await executeVaultRestore(vault);

        const rows = restoredOrderRows();
        expect(rows).toHaveLength(1);
        for (const col of ORDER_MARGIN_COLUMNS) expect(rows[0]).not.toHaveProperty(col);
        expect(rows[0]).not.toHaveProperty("risk_data");
        expect(rows[0]).toMatchObject({ id: "o1", order_id: "1001", tenant_id: TENANT });
    });
});
