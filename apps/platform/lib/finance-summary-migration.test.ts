import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * get_finance_summary() hands a shop's whole profit statement to the browser.
 * It is SECURITY DEFINER, so the only thing between one shop's numbers and
 * another shop's member is the gate in the wrapper, and the counting function
 * behind it must not be callable directly. Migrations apply in version order,
 * so the newest file defining each function is the live one.
 */
const dir = path.resolve(__dirname, "../../../packages/supabase/migrations");

function liveFile(fn: string): string {
    const files = fs
        .readdirSync(dir)
        .filter((f) => /^\d{14}_.+\.sql$/.test(f))
        .sort()
        .filter((f) => fs.readFileSync(path.join(dir, f), "utf8").includes(`CREATE OR REPLACE FUNCTION public.${fn}(`));
    expect(files.length).toBeGreaterThan(0);
    return fs.readFileSync(path.join(dir, files[files.length - 1]), "utf8").replace(/^\s*--.*$/gm, "");
}

describe("get_finance_summary gate", () => {
    const gate = liveFile("get_finance_summary");
    const core = liveFile("finance_summary_core");

    it("lets in only a member of the shop who may see its finances", () => {
        expect(gate).toMatch(/_tenant_id IN \(SELECT public\.get_user_tenant_ids\(\)\)/);
        expect(gate).toMatch(/public\.is_tenant_admin\(_tenant_id\)/);
        expect(gate).toMatch(/public\.has_tenant_permission\(_tenant_id, 'system\.financials\.view'\)/);
        expect(gate).toMatch(/ERRCODE = '42501'/);
    });

    it("is closed to signed-out callers and pins its search path", () => {
        expect(gate).toMatch(/REVOKE ALL ON FUNCTION public\.get_finance_summary\(uuid, date, date\) FROM PUBLIC, anon/);
        expect(gate).toMatch(/SET search_path TO 'public', 'pg_temp'/);
    });

    it("keeps the counting function, which checks nobody, away from every app role", () => {
        expect(core).toMatch(/REVOKE ALL ON FUNCTION public\.finance_summary_core\(uuid, date, date\) FROM PUBLIC, anon, authenticated/);
    });

    it("counts a sale like the orders bar: delivered or completed, on its delivery day, no returns, tests or takes", () => {
        expect(core).toMatch(/o\.status IN \('delivered', 'completed'\)/);
        expect(core).toMatch(/COALESCE\(o\.delivered_at, o\.completed_at\) >= w\.ts_from/);
        expect(core).toMatch(/COALESCE\(o\.is_return, false\) = false/);
        expect(core).toMatch(/COALESCE\(o\.is_test, false\) = false/);
        expect(core).toMatch(/o\.take_kind IS NULL/);
    });

    it("counts Prime's fee once per parcel: delivered ones on the delivery day, returned ones on the day they came back", () => {
        expect(core).toMatch(/prime_fee AS \([\s\S]*?ps\.shipment_status IS DISTINCT FROM 'FAILED_DELIVER_RETURNED_TO_SENDER'/);
        expect(core).toMatch(/prime_returned AS \(\s*SELECT \(ps\.status_changed_at AT TIME ZONE 'Asia\/Baghdad'\)::date AS day/);
        expect(core).toMatch(/'courier', COALESCE\(pf\.fee, 0\) \+ COALESCE\(prt\.fee, 0\)/);
    });

    it("keeps stock purchases out of each day's costs: the goods count when they sell", () => {
        expect(core).toMatch(/exp_day AS \(\s*SELECT day, sum\(amount\) AS amount FROM exp\s+WHERE category IS DISTINCT FROM 'product_cost'/);
    });

    it("counts the shelf from the shop's own physical products that are not archived", () => {
        expect(core).toMatch(/stock AS \([\s\S]*?pr\.tenant_id = _tenant_id\s+AND COALESCE\(pr\.is_archived, false\) = false\s+AND pr\.product_type = 'physical'/);
        expect(core).toMatch(/LEFT JOIN public\.product_variants v ON v\.product_id = pr\.id AND v\.tenant_id = _tenant_id/);
    });

    it("scopes every table it reads to the shop", () => {
        for (const table of ["orders o", "prime_shipments ps", "expenses e", "payroll_records pr", "products pr", "prime_connections pc"]) {
            const alias = table.split(" ")[1];
            expect(core, table).toMatch(new RegExp(`public\\.${table.replace(" ", " ")}[\\s\\S]{0,160}${alias}\\.tenant_id = _tenant_id`));
        }
    });
});
