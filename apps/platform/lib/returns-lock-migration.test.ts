import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * process_return / undo_return read the order status with a plain SELECT, so two
 * concurrent calls (double click, two staff) both passed the checks: process_return
 * moved stock twice, undo_return restored it twice. Both must lock the order row
 * first, and process_return must refuse an order whose return is already live.
 * Migrations apply in version order, so the newest file defining a function is live.
 */
const dir = path.resolve(__dirname, "../../../packages/supabase/migrations");

function newestBody(signature: RegExp): string {
    const files = fs
        .readdirSync(dir)
        .filter((f) => /^\d{14}_.+\.sql$/.test(f))
        .sort()
        .filter((f) => signature.test(fs.readFileSync(path.join(dir, f), "utf8")));
    expect(files.length).toBeGreaterThan(0);
    return fs.readFileSync(path.join(dir, files[files.length - 1]), "utf8").replace(/^\s*--.*$/gm, "");
}

describe("process_return", () => {
    const body = newestBody(/CREATE OR REPLACE FUNCTION public\.process_return\(/i);

    it("locks the order row before reading its status", () => {
        expect(body).toMatch(/FROM public\.orders WHERE id = _order_id\s+FOR UPDATE/i);
    });

    it("refuses an order whose return is already live, judged by the ledger and undo rows, not status", () => {
        expect(body).toMatch(/reason LIKE 'return:%'/);
        expect(body).toMatch(/reason LIKE 'undo_return:%'/);
        expect(body).toMatch(/already processed/i);
    });
});

describe("undo_return", () => {
    it("locks the order row before checking it is rejected", () => {
        const body = newestBody(/CREATE OR REPLACE FUNCTION public\.undo_return\(/i);
        expect(body).toMatch(/FROM public\.orders WHERE id = _order_id\s+FOR UPDATE/i);
    });
});
