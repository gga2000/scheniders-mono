import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { STUCK_TRANSIT_DAYS } from "@/lib/orders/stuck-in-transit";

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

    it("counts what the courier kept in the shop's confirmed payment files once per order, and never on a Prime parcel", () => {
        // the newest confirmed file of the shop names the order's fee
        expect(core).toMatch(/file_rows AS \(\s*SELECT DISTINCT ON \(i\.order_id\) i\.order_id, COALESCE\(i\.pdf_delivery_fee, 0\) AS fee\s+FROM public\.delivery_import_items i\s+JOIN public\.delivery_imports di ON di\.id = i\.import_id\s+WHERE di\.tenant_id = _tenant_id\s+AND di\.status IN \('confirmed', 'completed'\)/);
        expect(core).toMatch(/ORDER BY i\.order_id, di\.created_at DESC, i\.id/);
        // only delivered orders of the period, on their delivery day, and not the ones Prime charges for
        expect(core).toMatch(/file_fee AS \(\s*SELECT s\.day, sum\(fr\.fee\) AS fee, count\(\*\) AS orders\s+FROM sold s\s+JOIN file_rows fr ON fr\.order_id = s\.id\s+WHERE fr\.fee > 0\s+AND NOT EXISTS \(\s*SELECT 1 FROM public\.prime_shipments ps\s+WHERE ps\.order_id = s\.id AND ps\.tenant_id = _tenant_id\)/);
        expect(core).toMatch(/'file_fee', \(SELECT COALESCE\(sum\(fee\), 0\) FROM file_fee\)/);
        // each day carries it beside Prime's fee, so the days still add up to the statement
        expect(core).toMatch(/'courier_file', COALESCE\(ff\.fee, 0\)/);
        expect(core).toMatch(/LEFT JOIN file_fee ff ON ff\.day = d\.day/);
    });

    it("keeps stock purchases out of each day's costs: the goods count when they sell", () => {
        expect(core).toMatch(/exp_day AS \(\s*SELECT day, sum\(amount\) AS amount FROM exp\s+WHERE category IS DISTINCT FROM 'product_cost'/);
    });

    it("counts the shelf from the shop's own physical products that are not archived", () => {
        expect(core).toMatch(/shelf AS \([\s\S]*?pr\.tenant_id = _tenant_id\s+AND COALESCE\(pr\.is_archived, false\) = false\s+AND pr\.product_type = 'physical'/);
        expect(core).toMatch(/LEFT JOIN public\.product_variants v ON v\.product_id = pr\.id AND v\.tenant_id = _tenant_id/);
    });

    it("counts each courier payment once, on its Baghdad day, and leaves out a cancelled file", () => {
        expect(core).toMatch(/payout_files AS \(\s*SELECT DISTINCT ON \(COALESCE\(NULLIF\(btrim\(di\.receipt_number\), ''\), di\.id::text\)\)/);
        expect(core).toMatch(
            /di\.tenant_id = _tenant_id\s+AND di\.status IN \('confirmed', 'completed'\)\s+AND di\.payment_date >= w\.ts_from AND di\.payment_date < w\.ts_to/,
        );
    });

    it("keeps the road to parcels still out for delivery, and names the ones Prime is bringing back", () => {
        expect(core).toMatch(/LEFT JOIN public\.prime_shipments ps\s+ON ps\.order_id = o\.id AND ps\.tenant_id = _tenant_id AND ps\.cancelled_at IS NULL/);
        expect(core).toMatch(/road AS \([\s\S]*?t\.prime_status NOT IN \('FAILED_DELIVER_RETURNED_TO_SENDER', 'DELIVERED', 'PART_DELIVERED', 'DELIVERED_CHANGE_PRICE'\)/);
        expect(core).toMatch(/'in_transit', \(SELECT jsonb_build_object\('count', count\(\*\), 'amount', COALESCE\(sum\(price\), 0\)\) FROM road\)/);
        expect(core).toMatch(/FROM road WHERE since <= now\(\) - interval '15 days'/);
        expect(core).toMatch(/'returning', [\s\S]{0,120}FROM transit WHERE prime_status = 'FAILED_DELIVER_RETURNED_TO_SENDER'/);
    });

    it("counts a parcel refused on Prime once, on the day Prime marked it", () => {
        // the shop's own "refused" leaves out an order whose Prime parcel came back
        expect(core).toMatch(/o\.status = 'rejected'[\s\S]*?AND NOT EXISTS \(\s*SELECT 1 FROM public\.prime_shipments ps\s+WHERE ps\.order_id = o\.id AND ps\.tenant_id = _tenant_id\s+AND ps\.shipment_status = 'FAILED_DELIVER_RETURNED_TO_SENDER'\)/);
        expect(core).toMatch(/UNION ALL[\s\S]*?JOIN public\.orders o ON o\.id = ps\.order_id AND o\.tenant_id = _tenant_id, w\s+WHERE ps\.tenant_id = _tenant_id\s+AND ps\.shipment_status = 'FAILED_DELIVER_RETURNED_TO_SENDER'\s+AND ps\.status_changed_at >= w\.ts_from AND ps\.status_changed_at < w\.ts_to/);
    });

    it("calls a delivered order paid when a confirmed payment file of the shop, or a Prime payment, names it", () => {
        expect(core).toMatch(/paid_ids AS \([\s\S]*?FROM public\.delivery_import_items i\s+JOIN public\.delivery_imports di ON di\.id = i\.import_id\s+WHERE di\.tenant_id = _tenant_id\s+AND di\.status IN \('confirmed', 'completed'\)/);
        expect(core).toMatch(/SELECT ps\.order_id\s+FROM public\.prime_shipments ps\s+WHERE ps\.tenant_id = _tenant_id AND ps\.payment_id IS NOT NULL/);
        expect(core).toMatch(/'paid_orders', \(SELECT count\(\*\) FROM sold s WHERE s\.id IN \(SELECT id FROM paid_ids\)\)/);
    });

    it("names the three products holding the most stock money, only those with a cost and pieces on the shelf", () => {
        expect(core).toMatch(/stock_top AS \([\s\S]*?FROM shelf s\s+WHERE s\.unit_cost IS NOT NULL AND s\.pieces > 0\s+GROUP BY s\.product_id\s+ORDER BY value DESC, s\.product_id\s+LIMIT 3\s+\)/);
        expect(core).toMatch(/'top', COALESCE\(\(SELECT jsonb_agg\([\s\S]*?FROM stock_top t\), '\[\]'::jsonb\)/);
    });

    it("splits the period's delivered sales into what reached the shop, the delivery fee and what is not paid yet", () => {
        // one fee per order: Prime's on a Prime parcel that was not sent back, else the courier's from the payment file
        expect(core).toMatch(/sold_fee AS \([\s\S]*?AND ps\.shipment_status IS DISTINCT FROM 'FAILED_DELIVER_RETURNED_TO_SENDER'\), 0\)\s+\+ CASE WHEN NOT EXISTS \(SELECT 1 FROM public\.prime_shipments ps\s+WHERE ps\.order_id = s\.id AND ps\.tenant_id = _tenant_id\)\s+THEN GREATEST\(COALESCE\(fr\.fee, 0\), 0\) ELSE 0 END AS fee/);
        // the three parts are cut from the same delivered orders, so they add up to the sales
        expect(core).toMatch(/money_split AS \(\s*SELECT COALESCE\(sum\(price - fee\) FILTER \(WHERE paid\), 0\) AS reached,[\s\S]*?COALESCE\(sum\(fee\), 0\) AS fee,\s+COALESCE\(sum\(price - fee\) FILTER \(WHERE NOT paid\), 0\) AS unpaid,[\s\S]*?FROM sold_fee\s+\)/);
    });

    it("splits the paid orders by the date of the courier file that paid them, so the parts add up to what reached the shop", () => {
        expect(core).toMatch(/WHERE i\.order_id = s\.id AND di\.tenant_id = _tenant_id\s+AND di\.status IN \('confirmed', 'completed'\)\s+AND di\.payment_date < \(SELECT ts_from FROM w\)\) AS file_before/);
        expect(core).toMatch(/AND di\.payment_date >= \(SELECT ts_from FROM w\)\s+AND di\.payment_date < \(SELECT ts_to FROM w\)\) AS file_now/);
        expect(core).toMatch(/sum\(price - fee\) FILTER \(WHERE paid AND file_before\), 0\) AS reached_before/);
        expect(core).toMatch(/sum\(price - fee\) FILTER \(WHERE paid AND NOT file_before AND file_now\), 0\) AS reached_now/);
        // Prime's payments are the same courier files, so there is no separate Prime part
        expect(core).not.toMatch(/reached_prime/);
        expect(core).toMatch(/'reached_now', reached_now, 'reached_other', reached_other/);
    });

    it("names the unpaid orders with money owed, oldest first and capped, scoped to the shop", () => {
        expect(core).toMatch(/unpaid_list AS \([\s\S]*?JOIN public\.orders o ON o\.id = sf\.id AND o\.tenant_id = _tenant_id\s+WHERE NOT sf\.paid AND sf\.price - sf\.fee > 0\s+ORDER BY s\.day, o\.id\s+LIMIT 20/);
        expect(core).toMatch(/'unpaid_list', COALESCE\(\(SELECT jsonb_agg\(jsonb_build_object\('id', u\.id, 'code', u\.code, 'customer', u\.customer,\s+'amount', u\.amount, 'day', u\.day, 'prime', u\.prime\) ORDER BY u\.day, u\.id\)/);
    });

    it("counts an order the customer paid up front as paid, apart while no payment file names it", () => {
        expect(core).toMatch(/COALESCE\(o\.payment_status = 'prepaid', false\) AS prepaid/);
        expect(core).toMatch(/\(s\.prepaid OR s\.id IN \(SELECT id FROM paid_ids\)\) AS paid/);
        expect(core).toMatch(/sum\(price - fee\) FILTER \(WHERE prepaid AND NOT settled\), 0\) AS reached_prepaid/);
        expect(core).toMatch(/sum\(price - fee\) FILTER \(WHERE settled AND NOT file_before AND NOT file_now\), 0\) AS reached_other/);
    });

    it("takes the period's courier payments apart from their own rows", () => {
        expect(core).toMatch(/stmt_items AS \(\s*SELECT [\s\S]*?FROM payout_files f\s+JOIN public\.delivery_import_items i ON i\.import_id = f\.import_id/);
        expect(core).toMatch(/sum\(si\.net\) FILTER \(WHERE si\.is_return\), 0\) AS returns/);
        expect(core).toMatch(/sum\(si\.amount - sf\.price\) FILTER \(WHERE sf\.prepaid\), 0\) AS prepaid_gap/);
        expect(core).toMatch(/LEFT JOIN sold_fee sf ON sf\.id = si\.order_id AND NOT si\.is_return AND NOT sf\.file_before AND sf\.file_now/);
        expect(core).toMatch(/'statement', \(SELECT jsonb_build_object\('returns', returns/);
    });

    it("scopes every table it reads to the shop", () => {
        for (const table of ["orders o", "prime_shipments ps", "expenses e", "payroll_records pr", "products pr", "prime_connections pc", "delivery_imports di"]) {
            const alias = table.split(" ")[1];
            expect(core, table).toMatch(new RegExp(`public\\.${table.replace(" ", " ")}[\\s\\S]{0,160}${alias}\\.tenant_id = _tenant_id`));
        }
    });
});

describe("stuck parcels", () => {
    it("draws the same line as the orders page's stuck filter, which the Finances link opens", () => {
        expect(liveFile("finance_summary_core")).toContain(`FROM road WHERE since <= now() - interval '${STUCK_TRANSIT_DAYS} days'`);
    });
});
