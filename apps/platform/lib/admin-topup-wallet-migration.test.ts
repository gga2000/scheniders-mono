import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Wallet top-ups must be one atomic statement with an idempotency check inside the
 * row lock. The old server action read the balance, wrote balance+amount, then logged
 * the transaction in three round trips: concurrent top-ups lost credit, and a failed
 * log insert left money added with no ledger row.
 * Migrations apply in version order, so the newest file defining the function is live.
 */
describe("admin_topup_wallet definition", () => {
    const dir = path.resolve(__dirname, "../../../packages/supabase/migrations");
    const definers = fs
        .readdirSync(dir)
        .filter((f) => /^\d{14}_.+\.sql$/.test(f))
        .sort()
        .filter((f) => /CREATE OR REPLACE FUNCTION public\.admin_topup_wallet\(/i.test(fs.readFileSync(path.join(dir, f), "utf8")));
    const newest = fs.readFileSync(path.join(dir, definers[definers.length - 1]), "utf8").replace(/^--.*$/gm, "");

    it("accepts a reference id and locks the wallet row before the idempotency lookup", () => {
        expect(newest).toMatch(/_reference_id text DEFAULT NULL/i);
        const lock = newest.search(/FOR UPDATE/i);
        const lookup = newest.search(/reference_id\s*=\s*_reference_id/i);
        expect(lock).toBeGreaterThan(-1);
        expect(lookup).toBeGreaterThan(lock);
    });

    it("writes the reference id on the ledger row and stays service-role only", () => {
        expect(newest).toMatch(/INSERT INTO public\.wallet_transactions[\s\S]*reference_id/i);
        expect(newest).toMatch(/REVOKE ALL ON FUNCTION public\.admin_topup_wallet\([^)]*\) FROM anon, authenticated/i);
        expect(newest).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_topup_wallet\([^)]*\) TO service_role/i);
    });

    it("drops the 5-arg overload so an omitted reference id is not ambiguous", () => {
        expect(newest).toMatch(/DROP FUNCTION IF EXISTS public\.admin_topup_wallet\(uuid, numeric, text, uuid, text\)/i);
    });
});
