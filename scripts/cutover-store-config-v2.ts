#!/usr/bin/env tsx
// =====================================================================
// cutover-store-config-v2 — flip tenants from legacy → v2
// =====================================================================
// Reads `tenants.store_config_v2` and flips `config_version` from 1
// to 2 once we're confident the v2 config is good. The storefront
// layout at apps/storefront/app/s/[tenant]/layout.tsx switches its
// render path based on this column.
//
// This script does NOT modify store_config or store_config_v2 — only
// the version pointer.
//
// Flags:
//   --tenant <slug-or-id>   Cutover a single tenant (by slug or uuid).
//   --all                   Cutover every tenant where
//                           store_config_v2 IS NOT NULL AND
//                           config_version = 1.
//   --dry-run               Print plan + validation only (default ON).
//   --apply                 Actually write. Without this flag, no
//                           UPDATE statements are issued — even with
//                           --tenant / --all. (Safety by default.)
//   --rollback --tenant X   Flip the named tenant back to config_version=1.
//                           Requires --apply to actually run.
//
// Env loading — uses the same dotenv-based convention as
// scripts/migrate-store-config-v2/index.ts. Loads SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY from apps/platform/.env.local (and a few
// fallback locations).
// =====================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "node:path";
import * as fs from "node:fs";
import type { StoreConfigV2 } from "@scheniders/shared/types";

/* ─────────────────────────────────────────────────────────────────── */
/* Env loading                                                         */
/* ─────────────────────────────────────────────────────────────────── */

function loadEnv(): void {
    const candidates = [
        path.resolve(process.cwd(), ".env.local"),
        path.resolve(process.cwd(), ".env"),
        path.resolve(process.cwd(), "apps/platform/.env.local"),
        path.resolve(process.cwd(), "apps/storefront/.env.local"),
        path.resolve(__dirname, "../apps/platform/.env.local"),
        path.resolve(__dirname, "../apps/storefront/.env.local"),
        path.resolve(__dirname, "../.env.local"),
        path.resolve(__dirname, "../.env"),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) dotenv.config({ path: p, override: false });
    }
}

/* ─────────────────────────────────────────────────────────────────── */
/* CLI                                                                 */
/* ─────────────────────────────────────────────────────────────────── */

interface CliFlags {
    tenant?: string;
    all: boolean;
    apply: boolean;
    rollback: boolean;
}

function parseFlags(argv: string[]): CliFlags {
    const flags: CliFlags = { all: false, apply: false, rollback: false };
    const args = argv.slice(2);
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--all") flags.all = true;
        else if (arg === "--apply") flags.apply = true;
        else if (arg === "--dry-run") {
            // Default behavior — no-op flag, accepted for clarity.
        } else if (arg === "--rollback") flags.rollback = true;
        else if (arg === "--tenant") {
            flags.tenant = args[i + 1];
            i++;
        } else if (arg.startsWith("--tenant=")) {
            flags.tenant = arg.slice("--tenant=".length);
        }
    }
    return flags;
}

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value,
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Validation                                                          */
/* ─────────────────────────────────────────────────────────────────── */

interface ValidationResult {
    ok: boolean;
    page_count: number;
    has_brand_kit: boolean;
    issues: string[];
}

const EXPECTED_PAGE_COUNT = 16;

function validateV2(config: StoreConfigV2 | null): ValidationResult {
    const issues: string[] = [];
    if (!config) {
        return {
            ok: false,
            page_count: 0,
            has_brand_kit: false,
            issues: ["store_config_v2 is NULL"],
        };
    }
    const page_count = Array.isArray(config.pages) ? config.pages.length : 0;
    if (page_count !== EXPECTED_PAGE_COUNT) {
        issues.push(
            `expected ${EXPECTED_PAGE_COUNT} pages, found ${page_count}`,
        );
    }
    const bk = config.brand_kit;
    const has_brand_kit = !!(bk && bk.colors && bk.typography);
    if (!has_brand_kit) {
        issues.push("brand_kit missing colors/typography");
    }
    return {
        ok: issues.length === 0,
        page_count,
        has_brand_kit,
        issues,
    };
}

/* ─────────────────────────────────────────────────────────────────── */
/* Supabase                                                            */
/* ─────────────────────────────────────────────────────────────────── */

interface TenantRow {
    id: string;
    slug: string;
    business_name: string | null;
    store_config_v2: StoreConfigV2 | null;
    config_version: number | null;
}

const TENANT_COLUMNS = "id, slug, business_name, store_config_v2, config_version";

function getSupabase(): SupabaseClient {
    const url =
        process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        console.error(
            "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Set them in apps/platform/.env.local.",
        );
        process.exit(1);
    }
    return createClient(url, key, { auth: { persistSession: false } });
}

async function fetchTenants(
    supabase: SupabaseClient,
    flags: CliFlags,
): Promise<TenantRow[]> {
    if (flags.tenant) {
        const column = isUuid(flags.tenant) ? "id" : "slug";
        const { data, error } = await supabase
            .from("tenants")
            .select(TENANT_COLUMNS)
            .eq(column, flags.tenant);
        if (error) throw new Error(error.message);
        return (data ?? []) as TenantRow[];
    }
    // --all → only tenants that have v2 ready AND haven't been cut over yet.
    const { data, error } = await supabase
        .from("tenants")
        .select(TENANT_COLUMNS)
        .eq("config_version", 1)
        .not("store_config_v2", "is", null);
    if (error) throw new Error(error.message);
    return (data ?? []) as TenantRow[];
}

/* ─────────────────────────────────────────────────────────────────── */
/* Cutover / rollback                                                  */
/* ─────────────────────────────────────────────────────────────────── */

async function applyCutover(
    supabase: SupabaseClient,
    id: string,
    target_version: 1 | 2,
): Promise<void> {
    const { error } = await supabase
        .from("tenants")
        .update({ config_version: target_version })
        .eq("id", id);
    if (error) throw new Error(error.message);
}

/* ─────────────────────────────────────────────────────────────────── */
/* Main                                                                */
/* ─────────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
    loadEnv();
    const flags = parseFlags(process.argv);

    if (!flags.tenant && !flags.all) {
        console.error(
            "Specify either --tenant <slug-or-id> or --all. Default is dry-run; pass --apply to write.",
        );
        process.exit(1);
    }
    if (flags.rollback && !flags.tenant) {
        console.error("--rollback requires --tenant <slug-or-id>.");
        process.exit(1);
    }
    if (flags.rollback && flags.all) {
        console.error("--rollback is not allowed with --all (safety guard).");
        process.exit(1);
    }

    const supabase = getSupabase();
    const tenants = await fetchTenants(supabase, flags);

    if (tenants.length === 0) {
        console.log(
            flags.tenant
                ? `No tenant found for "${flags.tenant}".`
                : "No tenants found with store_config_v2 IS NOT NULL AND config_version = 1.",
        );
        return;
    }

    const mode = flags.rollback ? "rollback" : "cutover";
    const target: 1 | 2 = flags.rollback ? 1 : 2;
    const willApply = flags.apply;

    console.log(
        `\nMode: ${mode}  Target version: ${target}  ${
            willApply ? "APPLY (writes)" : "DRY RUN (no writes)"
        }`,
    );
    console.log(`Tenants to process: ${tenants.length}\n`);

    let valid_count = 0;
    let invalid_count = 0;
    let applied_count = 0;
    let skipped_count = 0;
    let failed_count = 0;

    for (const t of tenants) {
        const v = validateV2(t.store_config_v2);
        const valid_marker = v.ok ? "OK" : "WARN";
        const business = t.business_name ?? "(no business_name)";
        console.log(
            `── ${t.slug}  •  ${business}  •  current=v${t.config_version}  •  v2:${valid_marker}`,
        );
        console.log(
            `   pages=${v.page_count}/${EXPECTED_PAGE_COUNT}  brand_kit=${v.has_brand_kit ? "yes" : "no"}`,
        );
        if (v.issues.length > 0) {
            for (const issue of v.issues) {
                console.log(`   ! ${issue}`);
            }
        }

        if (v.ok) valid_count++;
        else invalid_count++;

        if (flags.rollback) {
            if (t.config_version !== 2) {
                console.log(
                    `   → skip: not on v2 (current=v${t.config_version})`,
                );
                skipped_count++;
                continue;
            }
        } else {
            // cutover path
            if (t.config_version === 2) {
                console.log(`   → skip: already on v2`);
                skipped_count++;
                continue;
            }
            if (!v.ok) {
                console.log(`   → skip: v2 config failed validation`);
                skipped_count++;
                continue;
            }
        }

        if (!willApply) {
            console.log(`   → would set config_version = ${target}`);
            continue;
        }

        try {
            await applyCutover(supabase, t.id, target);
            console.log(`   → config_version = ${target} written`);
            applied_count++;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log(`   x write failed: ${msg}`);
            failed_count++;
        }
    }

    console.log("");
    console.log(
        `Summary: ${valid_count} valid, ${invalid_count} with warnings, ${skipped_count} skipped`,
    );
    if (willApply) {
        console.log(`Applied: ${applied_count}, Failed: ${failed_count}`);
        if (failed_count > 0) process.exitCode = 1;
    } else {
        console.log("Dry run — no writes performed. Pass --apply to commit.");
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
