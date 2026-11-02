import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * split_order_atomic builds the return order from to_jsonb(original) minus a list
 * of keys. idempotency_key must be in that list: create_order_atomic looks the key up
 * per tenant, finds the ORIGINAL order and replays it as the "return order", so
 * splitting a storefront order (they carry a key) created no return at all.
 * Migrations apply in version order, so the last file defining the 4-arg function is live.
 */
describe("split_order_atomic definition", () => {
    it("the newest definition strips idempotency_key from the return payload", () => {
        const dir = path.resolve(__dirname, "../../../packages/supabase/migrations");
        const definers = fs
            .readdirSync(dir)
            .filter((f) => /^\d{14}_.+\.sql$/.test(f))
            .sort()
            .filter((f) =>
                /CREATE OR REPLACE FUNCTION public\.split_order_atomic\(\s*_original_order_id uuid,\s*_kept_items jsonb,\s*_returned_items jsonb,\s*_tenant_id uuid/i.test(
                    fs.readFileSync(path.join(dir, f), "utf8"),
                ),
            );
        expect(definers.length).toBeGreaterThan(0);
        const newest = fs.readFileSync(path.join(dir, definers[definers.length - 1]), "utf8");
        const body = newest.replace(/^--.*$/gm, "");
        expect(body).toMatch(/-\s*'idempotency_key'/);
    });
});
