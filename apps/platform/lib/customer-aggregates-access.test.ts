import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";

/**
 * SEC-D1 pin. `mv_customer_metrics` (and the retired `mv_customer_aggregates`) holds every tenant's customer book with no
 * tenant policy: it was a materialized view, and since B9 it is a table with RLS on, no policies and no API grants. Its
 * source view `customer_metrics_source` and the recount queue `customer_metrics_dirty` are the same. Any client that
 * queried them directly would read every tenant's customers, or fail. Clients must go through the tenant-scoped view
 * `customer_aggregates` (or a SECURITY DEFINER RPC). This has regressed once already — see
 * packages/supabase/migrations/20260905153132_customer_aggregates_tenant_scoped_view.sql
 */
describe("customer aggregates access path", () => {
    it.each(["mv_customer_metrics", "mv_customer_aggregates", "customer_order_facts", "customer_metrics_source", "customer_metrics_dirty"])("no client module queries %s directly", (relation) => {
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
