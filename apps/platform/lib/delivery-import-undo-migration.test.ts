import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * F3: undoing a delivery import restores the captured fields, and only on orders that
 * still have the status the import set, so a later change is never overwritten.
 * Migrations apply in version order, so the newest file defining the function is live.
 */
const dir = path.resolve(__dirname, "../../../packages/supabase/migrations");

function newest(signature: RegExp): string {
    const files = fs
        .readdirSync(dir)
        .filter((f) => /^\d{14}_.+\.sql$/.test(f))
        .sort()
        .filter((f) => signature.test(fs.readFileSync(path.join(dir, f), "utf8")));
    expect(files.length).toBeGreaterThan(0);
    return fs.readFileSync(path.join(dir, files[files.length - 1]), "utf8").replace(/^\s*--.*$/gm, "");
}

describe("rollback_delivery_import", () => {
    const body = newest(/CREATE OR REPLACE FUNCTION public\.rollback_delivery_import\(/i);

    it("touches an order only while it still has the status the import gave it", () => {
        const guards = body.match(/WHERE id = v_item\.order_id AND tenant_id = p_tenant_id AND status = v_item\.new_status/g) ?? [];
        expect(guards).toHaveLength(2);
    });

    it("restores price and delivery time from the server-side snapshot", () => {
        expect(body).toMatch(/price\s+= CASE WHEN v_prev \? 'price' THEN \(v_prev->>'price'\)::numeric ELSE price END/);
        expect(body).toMatch(/delivered_at\s+= CASE WHEN v_prev \? 'delivered_at'/);
    });

    it("locks the import and only undoes a confirmed one", () => {
        expect(body).toMatch(/FROM public\.delivery_imports\s+WHERE id = p_import_id AND tenant_id = p_tenant_id FOR UPDATE/);
        expect(body).toMatch(/IF v_status <> 'confirmed' THEN/);
    });

    it("runs for the server only", () => {
        expect(body).toMatch(/REVOKE ALL ON FUNCTION public\.rollback_delivery_import\(uuid, uuid\) FROM PUBLIC, anon, authenticated/);
    });
});
