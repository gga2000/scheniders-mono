import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * QC quarantine was removed (#407) and public.qc_quarantine is dropped, so the
 * newest definition of storage_object_writable must not select from it: a
 * qc-evidence write check would raise "relation does not exist" instead of
 * returning false. Migrations apply in version order, so the last file that
 * (re)defines the function is the live one.
 */
describe("storage_object_writable definition", () => {
    it("the newest definition does not reference the dropped qc_quarantine table", () => {
        const dir = path.resolve(__dirname, "../../../packages/supabase/migrations");
        const definers = fs
            .readdirSync(dir)
            .filter((f) => /^\d{14}_.+\.sql$/.test(f))
            .sort()
            .filter((f) =>
                /CREATE OR REPLACE FUNCTION public\.storage_object_writable/i.test(
                    fs.readFileSync(path.join(dir, f), "utf8"),
                ),
            );
        const newest = fs.readFileSync(path.join(dir, definers[definers.length - 1]), "utf8");
        const body = newest.replace(/^--.*$/gm, "");
        expect(body).not.toMatch(/qc_quarantine/);
    });
});
