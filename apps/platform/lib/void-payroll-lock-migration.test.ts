import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * run_payroll serializes per employee with pg_advisory_xact_lock(tenant || employee) before
 * it reads or writes anything. void_payroll only locked the payroll row, so a void racing a
 * new run for the same employee could un-apply advances/bonuses/penalties that the new run
 * had just applied. void_payroll must take the SAME advisory lock, before its row lock.
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

describe("void_payroll", () => {
    const voidBody = newestBody(/CREATE OR REPLACE FUNCTION public\.void_payroll\(/i);
    const runBody = newestBody(/CREATE OR REPLACE FUNCTION public\.run_payroll\(/i);

    it("takes the same advisory lock key as run_payroll", () => {
        const key = "hashtextextended(v_tenant::text || p_employee_id::text, 0)";
        expect(runBody).toContain(`pg_advisory_xact_lock(${key})`);
        expect(voidBody).toContain("pg_advisory_xact_lock(hashtextextended(v_tenant::text || v_employee::text, 0))");
    });

    it("takes the advisory lock before it locks the payroll row", () => {
        const advisory = voidBody.indexOf("pg_advisory_xact_lock");
        const rowLock = voidBody.indexOf("FOR UPDATE");
        expect(advisory).toBeGreaterThan(-1);
        expect(rowLock).toBeGreaterThan(advisory);
    });

    it("keeps the grants: authenticated only", () => {
        expect(voidBody).toMatch(/REVOKE ALL ON FUNCTION public\.void_payroll\(uuid\) FROM PUBLIC, anon/);
        expect(voidBody).toMatch(/GRANT EXECUTE ON FUNCTION public\.void_payroll\(uuid\) TO authenticated/);
    });
});
