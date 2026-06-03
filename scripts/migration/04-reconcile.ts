#!/usr/bin/env tsx
/* =====================================================================
 * 04-reconcile — verify import counts against schema_verification.json
 * =====================================================================
 * After 02-migrate-old-data and 03-post-import, this script queries the
 * NEW project for COUNT(*) per table scoped to tenant b5c4f2d4 and diffs
 * against the data dump's per-table counts. Prints a table of
 * [target, expected, actual, delta, status].
 * ===================================================================== */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "node:fs";
import * as path from "node:path";

const TENANT_ID = "b5c4f2d4-834f-4af4-822d-9b9826a8f45a";
const DATA_DIR = "/Users/ali/scheniders-migration-handoff/data";
const EXPECTED_NEW_URL_HOST = "sduvpgqwhxragxtxztur";

// Tables we deliberately SKIPPED during import (derived state, recomputed
// post-import). expected = 0 in the count diff; we report actual separately.
const SKIPPED_DURING_IMPORT = new Set(["customer_risk", "inventory_ledger"]);

// Tables whose target name differs from the JSONL filename.
const TARGET_NAME: Record<string, string> = {
    customer_risk: "customer_trust",
};

// Tables with no tenant_id column — count globally.
const GLOBAL_TABLES = new Set(["role_permissions", "product_price_history"]);

function loadEnv(): void {
    const candidates = [
        path.resolve(process.cwd(), "apps/platform/.env.local"),
        path.resolve(process.cwd(), ".env.local"),
        path.resolve(__dirname, "../../apps/platform/.env.local"),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) dotenv.config({ path: p, override: false });
    }
}

async function main(): Promise<void> {
    loadEnv();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
        process.exit(1);
    }
    if (!url.includes(EXPECTED_NEW_URL_HOST)) {
        console.error(`❌ SUPABASE_URL doesn't contain "${EXPECTED_NEW_URL_HOST}". Bailing.`);
        process.exit(2);
    }

    const verifyFile = path.join(DATA_DIR, "schema_verification.json");
    const expected = JSON.parse(fs.readFileSync(verifyFile, "utf8")).counts as Record<string, number>;

    const sb = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
        db: { schema: "public" },
    });

    const rows: { target: string; expected: number; actual: number; delta: number; status: string }[] = [];
    for (const [src, exp] of Object.entries(expected)) {
        const target = TARGET_NAME[src] ?? src;
        const isGlobal = GLOBAL_TABLES.has(target);
        let q = sb.from(target).select("*", { count: "exact", head: true });
        if (!isGlobal) q = q.eq("tenant_id", TENANT_ID);
        const res = await q;
        if (res.error) {
            rows.push({ target, expected: exp, actual: -1, delta: 0, status: `ERR: ${res.error.message.slice(0, 40)}` });
            continue;
        }
        const actual = res.count ?? 0;
        let status: string;
        if (SKIPPED_DURING_IMPORT.has(src)) {
            status = actual > 0 ? `RECOMPUTED (${actual})` : "EMPTY (recompute may have failed)";
        } else if (actual === exp) {
            status = "✅";
        } else if (actual === 0) {
            status = "❌ NOT IMPORTED";
        } else {
            status = "⚠️  MISMATCH";
        }
        rows.push({ target, expected: exp, actual, delta: actual - exp, status });
    }

    rows.sort((a, b) => a.target.localeCompare(b.target));

    console.log("\n══════════════ RECONCILIATION ══════════════");
    console.log(`  tenant: ${TENANT_ID} (Scheniders Iraq)`);
    console.log(`  source: ${verifyFile}\n`);
    console.log(`  ${"target".padEnd(28)} ${"expected".padStart(8)} ${"actual".padStart(8)} ${"delta".padStart(7)}  status`);
    console.log(`  ${"-".repeat(28)} ${"-".repeat(8)} ${"-".repeat(8)} ${"-".repeat(7)}  ${"-".repeat(30)}`);
    let mismatches = 0;
    let totalExpected = 0;
    let totalActual = 0;
    for (const r of rows) {
        const line = `  ${r.target.padEnd(28)} ${String(r.expected).padStart(8)} ${String(r.actual).padStart(8)} ${String(r.delta).padStart(7)}  ${r.status}`;
        console.log(line);
        totalExpected += r.expected;
        totalActual += r.actual > 0 ? r.actual : 0;
        if (r.status.startsWith("❌") || r.status.startsWith("⚠️") || r.status.startsWith("ERR")) mismatches++;
    }
    console.log(`  ${"-".repeat(28)} ${"-".repeat(8)} ${"-".repeat(8)} ${"-".repeat(7)}`);
    console.log(`  ${"TOTAL".padEnd(28)} ${String(totalExpected).padStart(8)} ${String(totalActual).padStart(8)}`);
    console.log(`\n  ${mismatches} mismatches`);
    console.log("════════════════════════════════════════════\n");

    if (mismatches > 0) process.exit(3);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
