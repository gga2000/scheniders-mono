import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";

/**
 * SEC-D1 pin. `mv_customer_metrics` (and the retired `mv_customer_aggregates`) is a materialized view, so it cannot enforce
 * RLS: any client that queries it directly reads every tenant's customer book.
 * Clients must go through the tenant-scoped view `customer_aggregates` (or a
 * SECURITY DEFINER RPC). This has regressed once already — see
 * packages/supabase/migrations/20260905153132_customer_aggregates_tenant_scoped_view.sql
 */
describe("customer aggregates access path", () => {
    it.each(["mv_customer_metrics", "mv_customer_aggregates", "customer_order_facts"])("no client module queries %s directly", (relation) => {
        const appRoot = path.resolve(__dirname, "..");
        // grep exits 1 when there are no matches, which is the passing case.
        const hits = execSync(
            `grep -rn 'from("${relation}")' ${JSON.stringify(appRoot)} ` +
                `--include='*.ts' --include='*.tsx' --exclude='customer-aggregates-access.test.ts' ` +
                `--exclude-dir=node_modules --exclude-dir=.next || true`,
            { encoding: "utf8" },
        ).trim();

        expect(hits).toBe("");
    });
});
