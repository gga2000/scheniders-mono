import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Migrations apply in version order, so the newest file matching a statement is live.
 * F17: receiving a returned item moves stock and needs orders.edit, not bare membership.
 * F18: inv_apply moves stock rows in one fixed order so two orders cannot deadlock.
 * F22: tenant-assets uploads and deletes need a permission of a screen that uploads.
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

describe("stock and asset write guards", () => {
    it("receive_after_sale_item requires orders.edit for signed-in callers", () => {
        const body = newest(/CREATE OR REPLACE FUNCTION public\.receive_after_sale_item\(/i);
        expect(body).toMatch(/NOT public\.has_tenant_permission\(_tenant_id, 'orders\.edit'\)/);
    });

    it("inv_apply walks the items in a fixed order", () => {
        const body = newest(/CREATE OR REPLACE FUNCTION public\.inv_apply\(/i);
        expect(body).toMatch(
            /FROM jsonb_array_elements\(p_items\)\s+ORDER BY coalesce\(nullif\(value->>'variant_id', ''\), value->>'product_id'\)/,
        );
    });

    it.each(["upload", "delete"])("tenant-assets %s needs a permission, not membership", (verb) => {
        const body = newest(new RegExp(`ALTER POLICY "Tenant members can ${verb} assets"`));
        const start = body.indexOf(`"Tenant members can ${verb} assets"`);
        const policy = body.slice(start, body.indexOf(");", start));
        expect(policy).toMatch(/has_tenant_permission\(t\.id, 'products\.edit'\)/);
        expect(policy).toMatch(/has_tenant_permission\(t\.id, 'shops\.manage'\)/);
        expect(policy).toMatch(/has_tenant_permission\(t\.id, 'system\.settings\.access'\)/);
    });
});
