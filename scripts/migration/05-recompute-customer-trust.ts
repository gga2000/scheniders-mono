#!/usr/bin/env tsx
/* =====================================================================
 * 05-recompute-customer-trust — call calculate_customer_trust(phone)
 * for every distinct phone in Scheniders Iraq's orders.
 * =====================================================================
 *
 * Why a script and not SQL: the function is heavy (multiple scans of
 * orders per phone) and ~3,000 phones overflow the Supabase MCP query
 * timeout. A long-running script lets us loop without a single-statement
 * timeout. Idempotent: ON CONFLICT (tenant_id, phone) DO UPDATE in the
 * function body.
 *
 * Run from mono root:
 *   npx tsx scripts/migration/05-recompute-customer-trust.ts
 * ===================================================================== */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "node:fs";
import * as path from "node:path";

const TENANT_ID = "b5c4f2d4-834f-4af4-822d-9b9826a8f45a";
const EXPECTED_NEW_URL_HOST = "sduvpgqwhxragxtxztur";

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
        console.error("❌ Missing SUPABASE env");
        process.exit(1);
    }
    if (!url.includes(EXPECTED_NEW_URL_HOST)) {
        console.error(`❌ SUPABASE_URL doesn't contain "${EXPECTED_NEW_URL_HOST}". Bailing.`);
        process.exit(2);
    }

    const sb = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
        db: { schema: "public" },
    });

    console.log(`\n🔄 Recomputing customer_trust for Scheniders Iraq`);
    console.log(`   tenant: ${TENANT_ID}`);
    console.log(`   target: ${url}\n`);

    // Pull distinct phones from orders under our tenant.
    const phonesRes = await sb
        .from("orders")
        .select("phone")
        .eq("tenant_id", TENANT_ID)
        .not("phone", "is", null);

    if (phonesRes.error) {
        console.error("❌ Failed to fetch phones:", phonesRes.error.message);
        process.exit(3);
    }

    const phoneSet = new Set<string>();
    for (const r of phonesRes.data ?? []) {
        const p = (r as { phone: string | null }).phone;
        if (p) phoneSet.add(p);
    }
    const phones = [...phoneSet];
    console.log(`   ${phones.length} distinct phones to process`);

    const start = Date.now();
    let done = 0;
    let errors = 0;

    for (const phone of phones) {
        const res = await sb.rpc("calculate_customer_trust", { target_phone: phone });
        if (res.error) {
            errors++;
            if (errors <= 5) console.error(`     ❌ ${phone}: ${res.error.message}`);
        }
        done++;
        if (done % 50 === 0 || done === phones.length) {
            const elapsedMs = Date.now() - start;
            const rate = done / (elapsedMs / 1000);
            const remaining = Math.round((phones.length - done) / rate);
            process.stdout.write(
                `     ${done}/${phones.length} (${rate.toFixed(1)} phones/sec, ~${remaining}s left)  errs=${errors}\r`,
            );
        }
    }
    process.stdout.write("\n");

    const elapsedS = Math.round((Date.now() - start) / 1000);
    console.log(`\n✅ done in ${elapsedS}s — ${done} phones, ${errors} errors`);

    // Final count
    const ct = await sb
        .from("customer_trust")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", TENANT_ID);
    console.log(`   customer_trust rows under tenant: ${ct.count ?? "?"}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
