import { describe, it, expect, vi, beforeEach } from "vitest";
import { queriesOn, resetRecording, respond } from "@/lib/__fixtures__/recording-supabase";

/*
 * Backups taken before migration 20261021090000 were read with select("*"),
 * so their order rows carry the margin keys (product_cost, net_profit,
 * waseet_merchant_price, waseet_company_price). PostgREST sends an upsert as
 * INSERT ... ON CONFLICT (id) DO UPDATE SET col = EXCLUDED.col, and Postgres
 * needs SELECT on every column whose EXCLUDED value it reads. Once
 * `authenticated` loses SELECT on the margin columns, sending those keys back
 * fails the whole restore with 42501, admins included. Both restore paths must
 * send only ORDER_READ_COLUMNS keys.
 */

vi.mock("@/lib/supabase", async () =>
    (await import("@/lib/__fixtures__/recording-supabase")).recordingSupabaseModule());

import { restoreFromSnapshot, type DatabaseSnapshot } from "./backup-utils";
import { executeVaultRestore, type VaultData } from "./vault-utils";
import { ORDER_MARGIN_COLUMNS } from "./repositories/order-columns";

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

function upsertedOrderRows(): Record<string, unknown>[] {
    const upserts = queriesOn("orders").flatMap((q) => q.ops.filter((o) => o.op === "upsert"));
    expect(upserts).toHaveLength(1);
    const rows = upserts[0].args[0];
    if (!Array.isArray(rows)) throw new Error("orders upsert payload is not an array");
    return rows as Record<string, unknown>[];
}

beforeEach(() => {
    resetRecording();
    respond((q) => (q.kind === "rpc" && q.target === "get_current_tenant_id"
        ? { data: TENANT, error: null }
        : { data: null, error: null }));
});

describe("restoreFromSnapshot", () => {
    it("upserts orders without the margin columns", async () => {
        const snapshot: DatabaseSnapshot = {
            version: 1,
            timestamp: "2026-10-01T00:00:00.000Z",
            source: "admin_dashboard",
            data: {
                orders: [legacyOrderRow("o1"), legacyOrderRow("o2")],
                customers: { metadata: [], notes: [], tags: [], assignments: [] },
            },
        };

        await expect(restoreFromSnapshot(snapshot)).resolves.toEqual({ success: true });

        const rows = upsertedOrderRows();
        expect(rows.map((r) => r.id)).toEqual(["o1", "o2"]);
        for (const row of rows) {
            for (const col of ORDER_MARGIN_COLUMNS) expect(row).not.toHaveProperty(col);
            expect(row).not.toHaveProperty("risk_data");
            expect(row).toMatchObject({ order_id: "1001", customer_name: "Ali", status: "new", price: 25000, tenant_id: TENANT });
        }
    });
});

describe("executeVaultRestore", () => {
    it("upserts orders without the margin columns", async () => {
        const vault: VaultData = {
            metadata: { version: "1", timestamp: "2026-10-01T00:00:00.000Z", counts: { orders: 1, products: 0, customers: 0 } },
            data: { orders: [legacyOrderRow("o1")], products: [], customers: [] },
        };

        await executeVaultRestore(vault);

        const rows = upsertedOrderRows();
        expect(rows).toHaveLength(1);
        for (const col of ORDER_MARGIN_COLUMNS) expect(rows[0]).not.toHaveProperty(col);
        expect(rows[0]).not.toHaveProperty("risk_data");
        expect(rows[0]).toMatchObject({ id: "o1", order_id: "1001", tenant_id: TENANT });
    });
});
