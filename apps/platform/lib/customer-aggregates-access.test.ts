import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";

/**
 * SEC-D1 pin. `mv_customer_aggregates` is a materialized view, so it cannot enforce
 * RLS: any client that queries it directly reads every tenant's customer book.
 * Clients must go through the tenant-scoped view `customer_aggregates` (or a
 * SECURITY DEFINER RPC). This has regressed once already — see
 * packages/supabase/migrations/20260902120000_customer_aggregates_tenant_scoped_view.sql
 */
describe("customer aggregates access path", () => {
    it("no client module queries mv_customer_aggregates directly", () => {
        const appRoot = path.resolve(__dirname, "..");
        // grep exits 1 when there are no matches, which is the passing case.
        const hits = execSync(
            `grep -rn 'from("mv_customer_aggregates")' ${JSON.stringify(appRoot)} ` +
                `--include='*.ts' --include='*.tsx' --exclude='customer-aggregates-access.test.ts' ` +
                `--exclude-dir=node_modules --exclude-dir=.next || true`,
            { encoding: "utf8" },
        ).trim();

        expect(hits).toBe("");
    });
});
