import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Realized revenue is delivered + completed, returns excluded (lib/order-revenue.ts). The
 * Orders page's client stats already used it; get_orders_aggregates summed `delivered` only,
 * so every order that had moved on to `completed` dropped out of the server's totalRevenue and
 * todayRevenue. Migrations apply in version order, so the newest file defining the function
 * is live.
 */
const dir = path.resolve(__dirname, "../../../packages/supabase/migrations");

function liveBody(): string {
    const files = fs
        .readdirSync(dir)
        .filter((f) => /^\d{14}_.+\.sql$/.test(f))
        .sort()
        .filter((f) => /CREATE OR REPLACE FUNCTION public\.get_orders_aggregates\(/i.test(fs.readFileSync(path.join(dir, f), "utf8")));
    expect(files.length).toBeGreaterThan(0);
    return fs.readFileSync(path.join(dir, files[files.length - 1]), "utf8").replace(/^\s*--.*$/gm, "");
}

describe("get_orders_aggregates revenue", () => {
    const body = liveBody();
    const stat = (key: string) => {
        const start = body.indexOf(`'${key}'`);
        expect(start).toBeGreaterThan(-1);
        return body.slice(start, start + 260);
    };

    it.each(["totalRevenue", "todayRevenue"])("%s counts delivered and completed, not returns", (key) => {
        const s = stat(key);
        expect(s).toMatch(/status IN \('delivered', 'completed'\)/);
        expect(s).toMatch(/is_return = false/);
    });

    it("keeps totalProcessed as delivered only", () => {
        expect(body).toMatch(/'totalProcessed',\s+count\(\*\) FILTER \(WHERE status = 'delivered'\)/);
    });
});
