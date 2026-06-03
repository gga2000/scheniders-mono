#!/usr/bin/env tsx
/* =====================================================================
 * migrate-old-data — bulk import OLD Scheniders → NEW Scheniders Iraq
 * =====================================================================
 *
 * Reads JSONL dumps from /Users/ali/scheniders-migration-handoff/data/,
 * applies per-table transforms, batched-inserts into the new project
 * via service role.
 *
 * Flags:
 *   --dry-run   Default. Prints the plan + first transformed row per table.
 *   --apply     Actually writes.
 *   --tables=x,y,z   Only import these tables (comma-separated, lowercase).
 *   --no-orders-pass2   Skip the second pass that backfills orders.original_order_id.
 *
 * Prereqs:
 *   - 01-pre-import.sql has been run (wipe + triggers disabled).
 *   - Tenant b5c4f2d4 exists; 5 staff exist in auth + user_profiles + tenant_members.
 *   - apps/platform/.env.local has NEXT_PUBLIC_SUPABASE_URL +
 *     SUPABASE_SERVICE_ROLE_KEY pointing at sduvpgqwhxragxtxztur.
 *
 * Postreqs:
 *   - Run 03-post-import.sql to re-enable triggers + recompute derived state.
 *   - Run 04-reconcile.ts to verify counts.
 * ===================================================================== */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

/* ─────────────────────────────────────────────────────────────────── */
/* Config                                                              */
/* ─────────────────────────────────────────────────────────────────── */

const TENANT_ID = "b5c4f2d4-834f-4af4-822d-9b9826a8f45a";
const DATA_DIR = "/Users/ali/scheniders-migration-handoff/data";
const BATCH_SIZE = 500;
const EXPECTED_NEW_URL_HOST = "sduvpgqwhxragxtxztur"; // safety check

/* ─────────────────────────────────────────────────────────────────── */
/* Env loading                                                         */
/* ─────────────────────────────────────────────────────────────────── */

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

/* ─────────────────────────────────────────────────────────────────── */
/* Per-table import config                                             */
/* ─────────────────────────────────────────────────────────────────── */

type Row = Record<string, unknown>;
type Transform = (row: Row) => Row | null; // null = drop row

interface TableConfig {
    /** JSONL filename (under DATA_DIR). */
    file: string;
    /** Target table in new project. */
    target: string;
    /** insert | upsert | skip */
    mode: "insert" | "upsert" | "skip";
    /** Column for upsert conflict (only when mode='upsert'). */
    onConflict?: string;
    /** Transform applied to each row before insert. Return null to drop. */
    transform?: Transform;
    /** Tables we never inject tenant_id on (global tables like role_permissions). */
    noTenantId?: boolean;
    /** Why we skip, if mode='skip'. Documentation only. */
    skipReason?: string;
}

/** Common tenant-injection transform. */
function injectTenant(row: Row): Row {
    return { ...row, tenant_id: TENANT_ID };
}

/** Drop columns that don't exist in the new schema. */
function dropCols(row: Row, cols: string[]): Row {
    const out = { ...row };
    for (const c of cols) delete out[c];
    return out;
}

const CONFIG: TableConfig[] = [
    // ── Reference / small ──────────────────────────────────────────
    {
        file: "products.jsonl",
        target: "products",
        mode: "insert",
        transform: (r) => injectTenant(r),
    },
    {
        // Old's user_profiles already exist in new (Phase 1a). UPSERT to
        // refresh avatar_url / display_name / last_login_at without
        // disturbing the inserted auth rows.
        file: "user_profiles.jsonl",
        target: "user_profiles",
        mode: "upsert",
        onConflict: "id",
        transform: (r) => ({
            ...r,
            current_tenant_id: TENANT_ID, // make Scheniders Iraq their default tenant
        }),
    },
    {
        file: "message_templates.jsonl",
        target: "message_templates",
        mode: "insert",
        transform: (r) => injectTenant(r),
    },
    {
        // OLD's `rejection_reasons` is the legacy 10-row table; OLD's
        // `order_reasons` superseded it. NEW only has `rejection_reasons`
        // (with no `kind` column). We import OLD.order_reasons → NEW.rejection_reasons
        // (preserving ids so orders.rejection_reason_id FK still resolves) and
        // SKIP OLD.rejection_reasons entirely (legacy duplicate).
        file: "rejection_reasons.jsonl",
        target: "rejection_reasons",
        mode: "skip",
        skipReason: "Legacy in old; orders.reason_id points at order_reasons, not rejection_reasons. We import order_reasons.jsonl into new.rejection_reasons instead.",
    },
    {
        file: "order_reasons.jsonl",
        target: "rejection_reasons",
        mode: "insert",
        transform: (r) => {
            // New rejection_reasons has only: id, label, label_ar, sort_order, is_active, created_at, tenant_id.
            // Old's order_reasons has: aliases, color, emoji, is_system, kind, label_en, requires_note, updated_at — strip all.
            // Map label_en → label.
            const out: Row = {
                id: r.id,
                label: r.label_en ?? r.label_ar ?? "",
                label_ar: r.label_ar,
                sort_order: r.sort_order,
                is_active: r.is_active,
                created_at: r.created_at,
                tenant_id: TENANT_ID,
            };
            return out;
        },
    },
    {
        file: "role_permissions.jsonl",
        target: "role_permissions",
        mode: "upsert",
        onConflict: "role,permission",
        noTenantId: true, // global table, no tenant_id column
    },
    {
        file: "role_salary_defaults.jsonl",
        target: "role_salary_defaults",
        mode: "insert",
        transform: (r) => injectTenant(r),
    },
    {
        file: "waseet_city_mappings.jsonl",
        target: "waseet_city_mappings",
        mode: "insert",
        transform: (r) => injectTenant(r),
    },
    {
        file: "blacklist.jsonl",
        target: "blacklist",
        mode: "insert",
        transform: (r) => injectTenant(r),
    },
    {
        file: "announcements.jsonl",
        target: "announcements",
        mode: "insert",
        transform: (r) => injectTenant(r),
    },
    {
        file: "customer_filter_presets.jsonl",
        target: "customer_filter_presets",
        mode: "insert",
        transform: (r) => injectTenant(r),
    },
    {
        file: "telegram_link_codes.jsonl",
        target: "telegram_link_codes",
        mode: "insert",
        transform: (r) => injectTenant(r),
    },
    {
        file: "telegram_employee_link.jsonl",
        target: "telegram_employee_link",
        mode: "insert",
        transform: (r) => injectTenant(r),
    },
    {
        file: "employee_salary_configs.jsonl",
        target: "employee_salary_configs",
        mode: "insert",
        transform: (r) => injectTenant(r),
    },
    {
        file: "salary_config_history.jsonl",
        target: "salary_config_history",
        mode: "insert",
        transform: (r) => injectTenant(r),
    },
    {
        // product_price_history table doesn't exist in new project. Audit log
        // history is non-critical; skip rather than recreate the table.
        file: "product_price_history.jsonl",
        target: "product_price_history",
        mode: "skip",
        skipReason: "Table does not exist in new project. Old project has 1 row of price-change audit history; not worth porting.",
    },

    // ── KV settings (UPSERT on key per-tenant) ─────────────────────
    {
        file: "app_settings.jsonl",
        target: "app_settings",
        mode: "upsert",
        // Composite (tenant_id, key) is the natural conflict but app_settings
        // PK in new appears to be on `key` alone — confirm at runtime.
        onConflict: "tenant_id,key",
        transform: (r) => {
            // Drop redacted-secret rows so we never overwrite vault entries.
            if (r.value === "__SECRET_REDACTED__") return null;
            return injectTenant(dropCols(r, ["updated_by"])); // updated_by is text in new, uuid in old; drop for safety
        },
    },
    {
        file: "settings.jsonl",
        target: "settings",
        mode: "upsert",
        onConflict: "tenant_id,key",
        transform: (r) => {
            if (r.value === "__SECRET_REDACTED__") return null;
            return injectTenant(r);
        },
    },

    // ── Print / delivery / waseet ──────────────────────────────────
    {
        file: "print_batches.jsonl",
        target: "print_batches",
        mode: "insert",
        transform: (r) => injectTenant(r),
    },
    {
        file: "print_history.jsonl",
        target: "print_history",
        mode: "insert",
        transform: (r) => injectTenant(r),
    },
    {
        file: "delivery_imports.jsonl",
        target: "delivery_imports",
        mode: "insert",
        transform: (r) => injectTenant(r),
    },
    {
        file: "delivery_import_items.jsonl",
        target: "delivery_import_items",
        mode: "insert",
        // Strip 4 rollback fields that don't exist in new.
        transform: (r) =>
            injectTenant(
                dropCols(r, [
                    "previous_delivered_at",
                    "previous_delivered_source",
                    "previous_delivery_order_id",
                    "previous_price",
                ]),
            ),
    },
    {
        file: "waseet_api_logs.jsonl",
        target: "waseet_api_logs",
        mode: "insert",
        transform: (r) => injectTenant(r),
    },
    {
        file: "checkout_queue.jsonl",
        target: "checkout_queue",
        mode: "insert",
        transform: (r) => injectTenant(r),
    },

    // ── Orders pipeline ────────────────────────────────────────────
    {
        // Two-pass orders: pass 1 inserts with original_order_id = NULL.
        // The runner does a second SQL pass after pass 1 completes.
        file: "orders.jsonl",
        target: "orders",
        mode: "insert",
        transform: (r) => {
            const out: Row = { ...r, tenant_id: TENANT_ID };
            // Old: reason_id  →  New: rejection_reason_id
            if ("reason_id" in out) {
                out.rejection_reason_id = out.reason_id;
                delete out.reason_id;
            }
            // Defer self-FK to pass 2.
            if (out.original_order_id != null) {
                out.original_order_id = null;
            }
            return out;
        },
    },
    {
        file: "order_status_history.jsonl",
        target: "order_status_history",
        mode: "insert",
        transform: (r) => injectTenant(r),
    },
    {
        file: "order_notifications.jsonl",
        target: "order_notifications",
        mode: "insert",
        transform: (r) => injectTenant(r),
    },
    {
        file: "whatsapp_logs.jsonl",
        target: "whatsapp_logs",
        mode: "insert",
        transform: (r) => injectTenant(r),
    },
    {
        file: "qc_quarantine.jsonl",
        target: "qc_quarantine",
        mode: "insert",
        transform: (r) => injectTenant(r),
    },

    // ── Audit / activity ───────────────────────────────────────────
    {
        file: "activity_logs.jsonl",
        target: "activity_logs",
        mode: "insert",
        transform: (r) => injectTenant(r),
    },

    // ── Salary / payroll ───────────────────────────────────────────
    {
        file: "payroll_records.jsonl",
        target: "payroll_records",
        mode: "insert",
        transform: (r) => injectTenant(r),
    },
    {
        file: "expenses.jsonl",
        target: "expenses",
        mode: "insert",
        transform: (r) => injectTenant(r),
    },

    // ── Telegram state machine ─────────────────────────────────────
    {
        file: "telegram_pending_orders.jsonl",
        target: "telegram_pending_orders",
        mode: "insert",
        // - Strip address_override + pending_match (not in new schema).
        // - confirmed_order_id: old stores the orders.order_id TEXT shortcode (e.g.
        //   "1260530001"), new expects orders.id UUID. Null it out at import;
        //   a post-import SQL pass joins on orders.order_id to fill it in.
        transform: (r) => {
            const stripped = dropCols(r, ["address_override", "pending_match"]);
            const c = stripped.confirmed_order_id;
            if (typeof c === "string" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c)) {
                stripped.confirmed_order_id = null;
            }
            return injectTenant(stripped);
        },
    },

    // ── SKIP: derived state, recomputed post-import ────────────────
    {
        file: "customer_risk.jsonl",
        target: "customer_trust",
        mode: "skip",
        skipReason: "Derived from orders + blacklist + whitelist. Recomputed in 03-post-import.sql.",
    },
    {
        file: "inventory_ledger.jsonl",
        target: "inventory_ledger",
        mode: "skip",
        skipReason: "Derived from orders. Recomputed in 03-post-import.sql via recompute_inventory().",
    },
];

/* ─────────────────────────────────────────────────────────────────── */
/* JSONL streaming                                                     */
/* ─────────────────────────────────────────────────────────────────── */

async function readJsonl(file: string): Promise<Row[]> {
    const full = path.join(DATA_DIR, file);
    if (!fs.existsSync(full)) throw new Error(`missing file: ${full}`);
    const rl = readline.createInterface({
        input: fs.createReadStream(full, "utf8"),
        crlfDelay: Infinity,
    });
    const rows: Row[] = [];
    for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        rows.push(JSON.parse(trimmed));
    }
    return rows;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Runner                                                              */
/* ─────────────────────────────────────────────────────────────────── */

interface RunResult {
    table: string;
    target: string;
    rowsRead: number;
    rowsInserted: number;
    rowsDropped: number;
    errors: string[];
}

async function importOne(
    sb: SupabaseClient,
    cfg: TableConfig,
    apply: boolean,
): Promise<RunResult> {
    const result: RunResult = {
        table: cfg.file,
        target: cfg.target,
        rowsRead: 0,
        rowsInserted: 0,
        rowsDropped: 0,
        errors: [],
    };

    if (cfg.mode === "skip") {
        console.log(`  ⏭️  SKIP ${cfg.file} → ${cfg.target} (${cfg.skipReason})`);
        return result;
    }

    const raw = await readJsonl(cfg.file);
    result.rowsRead = raw.length;

    const transformed: Row[] = [];
    for (const r of raw) {
        const t = cfg.transform ? cfg.transform(r) : (cfg.noTenantId ? r : injectTenant(r));
        if (t === null) {
            result.rowsDropped++;
        } else {
            transformed.push(t);
        }
    }

    console.log(
        `  📦 ${cfg.file} → ${cfg.target}: ${result.rowsRead} read, ${transformed.length} to write, ${result.rowsDropped} dropped`,
    );

    if (transformed.length > 0) {
        const sample = transformed[0];
        const preview = JSON.stringify(sample, null, 0).slice(0, 300);
        console.log(`     first row preview: ${preview}${preview.length >= 300 ? "…" : ""}`);
    }

    if (!apply) return result;

    // Batch insert/upsert.
    for (let i = 0; i < transformed.length; i += BATCH_SIZE) {
        const batch = transformed.slice(i, i + BATCH_SIZE);
        let res;
        if (cfg.mode === "upsert") {
            res = await sb
                .from(cfg.target)
                .upsert(batch, { onConflict: cfg.onConflict, ignoreDuplicates: false });
        } else {
            res = await sb.from(cfg.target).insert(batch);
        }
        if (res.error) {
            const msg = `batch ${i}-${i + batch.length - 1}: ${res.error.message}`;
            result.errors.push(msg);
            console.error(`     ❌ ${msg}`);
            return result; // stop on first error per table
        }
        result.rowsInserted += batch.length;
        process.stdout.write(`     wrote ${result.rowsInserted}/${transformed.length}\r`);
    }
    process.stdout.write("\n");
    return result;
}

/** Pass 2 for orders: backfill original_order_id from JSONL. */
async function ordersPass2(sb: SupabaseClient, apply: boolean): Promise<number> {
    const raw = await readJsonl("orders.jsonl");
    const links = raw
        .filter((r) => r.original_order_id != null)
        .map((r) => ({ id: r.id, original_order_id: r.original_order_id }));
    console.log(`  🔁 orders pass 2: ${links.length} self-FK links to backfill`);
    if (!apply || links.length === 0) return links.length;

    let updated = 0;
    for (const link of links) {
        const res = await sb
            .from("orders")
            .update({ original_order_id: link.original_order_id })
            .eq("id", link.id)
            .eq("tenant_id", TENANT_ID);
        if (res.error) {
            console.error(`     ❌ ${link.id}: ${res.error.message}`);
            continue;
        }
        updated++;
    }
    console.log(`     backfilled ${updated}/${links.length}`);
    return updated;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Main                                                                */
/* ─────────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
    loadEnv();

    const args = process.argv.slice(2);
    const apply = args.includes("--apply");
    const skipOrdersPass2 = args.includes("--no-orders-pass2");
    const tablesArg = args.find((a) => a.startsWith("--tables="));
    const onlyTables = tablesArg
        ? new Set(tablesArg.slice("--tables=".length).split(",").map((s) => s.trim().toLowerCase()))
        : null;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
        process.exit(1);
    }
    if (!url.includes(EXPECTED_NEW_URL_HOST)) {
        console.error(`❌ Refusing to run: SUPABASE_URL does not contain "${EXPECTED_NEW_URL_HOST}". Got: ${url}`);
        console.error("   This script is hardcoded to target the NEW project only. Bailing.");
        process.exit(2);
    }

    console.log(`\n${apply ? "🚀 APPLY MODE" : "🧪 DRY-RUN MODE — no writes"}`);
    console.log(`   target: ${url}`);
    console.log(`   tenant: ${TENANT_ID} (Scheniders Iraq)`);
    console.log(`   data:   ${DATA_DIR}`);
    if (onlyTables) console.log(`   tables: ${[...onlyTables].join(", ")}\n`);
    else console.log("");

    const sb = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
        db: { schema: "public" },
    });

    const results: RunResult[] = [];
    for (const cfg of CONFIG) {
        if (onlyTables && !onlyTables.has(cfg.file.replace(".jsonl", "").toLowerCase())) continue;
        try {
            const r = await importOne(sb, cfg, apply);
            results.push(r);
        } catch (e) {
            console.error(`❌ ${cfg.file}: ${(e as Error).message}`);
            results.push({
                table: cfg.file,
                target: cfg.target,
                rowsRead: 0,
                rowsInserted: 0,
                rowsDropped: 0,
                errors: [(e as Error).message],
            });
        }
    }

    if (!skipOrdersPass2 && (!onlyTables || onlyTables.has("orders"))) {
        console.log("");
        await ordersPass2(sb, apply);
    }

    // Summary
    console.log("\n══════════════ SUMMARY ══════════════");
    let totalInserted = 0;
    let totalErrors = 0;
    for (const r of results) {
        const status = r.errors.length === 0 ? "✅" : "❌";
        console.log(
            `  ${status} ${r.target.padEnd(28)} ${String(r.rowsInserted).padStart(6)} written (${r.rowsRead} read, ${r.rowsDropped} dropped)`,
        );
        totalInserted += r.rowsInserted;
        totalErrors += r.errors.length;
    }
    console.log("──────────────────────────────────────");
    console.log(`  TOTAL: ${totalInserted} rows written, ${totalErrors} errors`);
    console.log(apply ? "  ✅ APPLY COMPLETE" : "  🧪 DRY-RUN ONLY — no rows actually written");
    console.log("══════════════════════════════════════\n");

    if (totalErrors > 0) process.exit(3);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
