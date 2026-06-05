#!/usr/bin/env tsx
// =====================================================================
// migrate-store-config-v2 — one-shot legacy → v2 migration
// =====================================================================
// Reads tenants.store_config, builds StoreConfigV2, writes to
// tenants.store_config_v2. Does NOT touch the legacy column. Does NOT
// flip config_version. That's the cutover step, owned by a separate
// release.
//
// Flags:
//   --dry-run          Print diff; do not write.
//   --tenant=<slug>    Migrate just one tenant.
//   --all              Migrate every tenant.
//   --force            Overwrite tenants that ALREADY have store_config_v2.
//                      Without it, such tenants are SKIPPED (non-destructive
//                      default) so a re-run never clobbers existing V2 work.
//
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local or .env
// (process.cwd() resolution).
// =====================================================================

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "node:path";
import * as fs from "node:fs";
import { mapLegacyToV2 } from "./mapper";
import type { StoreConfig, StoreConfigV2 } from "@scheniders/shared/types";

/* ─────────────────────────────────────────────────────────────────── */
/* Env loading — try .env.local then .env                              */
/* ─────────────────────────────────────────────────────────────────── */

function loadEnv() {
  // Walk up from cwd looking for .env.local / .env; also accept root.
  const candidates = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "apps/storefront/.env.local"),
    path.resolve(process.cwd(), "apps/platform/.env.local"),
    path.resolve(__dirname, "../../.env.local"),
    path.resolve(__dirname, "../../.env"),
    path.resolve(__dirname, "../../apps/storefront/.env.local"),
    path.resolve(__dirname, "../../apps/platform/.env.local"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) dotenv.config({ path: p, override: false });
  }
}

/* ─────────────────────────────────────────────────────────────────── */
/* CLI parsing                                                         */
/* ─────────────────────────────────────────────────────────────────── */

interface CliFlags {
  dryRun: boolean;
  tenant?: string;
  all: boolean;
  force: boolean;
  supabaseUrl?: string;
  supabaseKey?: string;
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = { dryRun: false, all: false, force: false };
  for (const arg of argv.slice(2)) {
    if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--all") flags.all = true;
    else if (arg === "--force") flags.force = true;
    else if (arg.startsWith("--tenant=")) flags.tenant = arg.slice("--tenant=".length);
    else if (arg.startsWith("--supabase-url=")) flags.supabaseUrl = arg.slice("--supabase-url=".length);
    else if (arg.startsWith("--supabase-key=")) flags.supabaseKey = arg.slice("--supabase-key=".length);
  }
  return flags;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Diff renderer — shallow but readable                                */
/* ─────────────────────────────────────────────────────────────────── */

function renderDiff(v2: StoreConfigV2): string {
  const lines: string[] = [];
  lines.push(`  + schema_version: ${v2.schema_version}`);
  lines.push(`  + brand_kit.colors.primary: "${v2.brand_kit.colors.primary}"`);
  lines.push(`  + brand_kit.colors.secondary: "${v2.brand_kit.colors.secondary}"`);
  lines.push(`  + brand_kit.colors.accent: "${v2.brand_kit.colors.accent}"`);
  lines.push(`  + brand_kit.typography.display: "${v2.brand_kit.typography.display}"`);
  lines.push(`  + brand_kit.typography.body: "${v2.brand_kit.typography.body}"`);
  lines.push(`  + brand_kit.shape.radius: "${v2.brand_kit.shape.radius}"`);
  lines.push(`  + brand_kit.shape.rotation_intensity: "${v2.brand_kit.shape.rotation_intensity}"`);
  if (v2.brand_kit.identity.logo_url) {
    lines.push(`  + brand_kit.identity.logo_url: "${v2.brand_kit.identity.logo_url}"`);
  }

  const home = v2.pages.find((p) => p.page_id === "home");
  if (home) {
    lines.push(`  + pages.home.sections[${home.sections.length}]:`);
    home.sections.forEach((s, idx) => {
      lines.push(`      [${idx}] type=${s.type} enabled=${s.enabled} id=${s.id}`);
    });
  }

  const globalSlots = Object.keys(v2.globals);
  if (globalSlots.length) {
    lines.push(`  + globals: ${globalSlots.join(", ")}`);
  }
  lines.push(`  + default_locale: "${v2.default_locale}"`);
  lines.push(`  + enabled_locales: [${v2.enabled_locales.map((l) => `"${l}"`).join(", ")}]`);
  return lines.join("\n");
}

/* ─────────────────────────────────────────────────────────────────── */
/* Per-tenant summary line                                             */
/* ─────────────────────────────────────────────────────────────────── */

function summarizeLegacy(legacy: StoreConfig | null): string {
  if (!legacy) return "empty legacy config";
  const parts: string[] = [];
  parts.push(`${legacy.sections?.length ?? 0} sections`);
  parts.push(legacy.hero ? "hero set" : "no hero");
  parts.push(`about ${legacy.about?.enabled === false ? "disabled" : legacy.about?.title ? "enabled" : "unset"}`);
  parts.push(`${legacy.schneiders?.trust_pills?.length ?? 0} trust pills`);
  parts.push(legacy.schneiders?.testimonial?.quote ? "testimonial set" : "no testimonial");
  return parts.join(", ");
}

function summarizeV2(v2: StoreConfigV2): string {
  const home = v2.pages.find((p) => p.page_id === "home");
  const homeCount = home?.sections.length ?? 0;
  return `${v2.pages.length} pages, ${homeCount} home sections, brand kit derived`;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Main                                                                */
/* ─────────────────────────────────────────────────────────────────── */

interface TenantRow {
  id: string;
  slug: string;
  store_config: StoreConfig | null;
  store_config_v2: StoreConfigV2 | null;
}

async function main() {
  loadEnv();
  const flags = parseFlags(process.argv);

  const supabaseUrl =
    flags.supabaseUrl ?? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    flags.supabaseKey ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.");
    console.error("Set them in .env.local / .env, or pass --supabase-url=... --supabase-key=...");
    process.exit(1);
  }
  if (!flags.dryRun && !flags.tenant && !flags.all) {
    console.error("Refusing to run: pass --dry-run, --tenant=<slug>, or --all.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  // Fetch tenants
  let query = supabase.from("tenants").select("id, slug, store_config, store_config_v2");
  if (flags.tenant) query = query.eq("slug", flags.tenant);
  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch tenants:", error.message);
    process.exit(1);
  }
  const tenants = (data ?? []) as TenantRow[];

  if (tenants.length === 0) {
    console.error(`No tenants found${flags.tenant ? ` for slug="${flags.tenant}"` : ""}.`);
    process.exit(1);
  }

  let okCount = 0;
  let failCount = 0;
  const timings: number[] = [];

  for (const tenant of tenants) {
    const t0 = Date.now();
    try {
      const legacy = tenant.store_config ?? {};
      console.log(`\n── ${tenant.slug} (${tenant.id})`);
      console.log(`✓ Loaded legacy config (${summarizeLegacy(legacy)})`);
      const v2 = mapLegacyToV2(legacy);
      console.log(`✓ Built v2 config (${summarizeV2(v2)})`);

      if (flags.dryRun) {
        console.log("Diff preview:");
        console.log(renderDiff(v2));
      } else if (flags.tenant || flags.all) {
        // Non-destructive default: never clobber a tenant that already has a
        // store_config_v2 (it may contain V2-editor work). Use --force to override.
        if (tenant.store_config_v2 != null && !flags.force) {
          console.log("  ↷ skipped — store_config_v2 already exists (pass --force to overwrite)");
          okCount++;
          timings.push(Date.now() - t0);
          continue;
        }
        const { error: upErr } = await supabase
          .from("tenants")
          .update({ store_config_v2: v2 })
          .eq("id", tenant.id);
        if (upErr) {
          console.error(`  ✗ write failed: ${upErr.message}`);
          failCount++;
          continue;
        }
        console.log(`  ✓ wrote store_config_v2`);
      }
      okCount++;
      timings.push(Date.now() - t0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ mapper failed: ${msg}`);
      failCount++;
    }
  }

  console.log("");
  if (flags.dryRun) {
    console.log(`Dry run — no writes performed. (${okCount}/${tenants.length} OK)`);
  } else {
    const avg = timings.length
      ? Math.round(timings.reduce((s, n) => s + n, 0) / timings.length)
      : 0;
    console.log(`✓ Migrated ${okCount} / ${tenants.length} tenants (avg ${avg}ms each)`);
    if (failCount > 0) {
      console.log(`✗ ${failCount} failures`);
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
