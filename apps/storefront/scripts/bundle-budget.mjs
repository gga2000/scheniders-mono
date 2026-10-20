#!/usr/bin/env node
// =====================================================================
// Shared-runtime budget for the storefront
// =====================================================================
// Budgets the JavaScript EVERY shopper downloads on EVERY page — Next's
// root main files plus polyfills — measured gzipped, which is what actually
// crosses the network.
//
// Deliberately not "total .next/static": that grows whenever a page is
// added, so a budget on it fires on healthy growth and trains people to
// raise the number until it means nothing. The shared runtime only grows
// when the template itself gets heavier, which is the rot worth catching.
//
// Iraqi mobile data is expensive and often slow. A hundred sections should
// not cost a shopper a hundred sections' worth of JavaScript.
import { gzipSync } from "node:zlib";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(appDir, ".next", "build-manifest.json");
const budgetPath = join(appDir, "bundle-budget.json");

// A missing build is a failure, not a pass: silence must never look like success.
if (!existsSync(manifestPath)) {
  console.error(`✗ No build found at ${manifestPath}\n  Run \`pnpm build\` for @scheniders/storefront first.`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const files = [...(manifest.rootMainFiles ?? []), ...(manifest.polyfillFiles ?? [])];
if (files.length === 0) {
  console.error("✗ build-manifest.json lists no root main files — the manifest shape changed; fix this script rather than skipping the budget.");
  process.exit(1);
}

let gzipBytes = 0;
const missing = [];
for (const f of files) {
  const p = join(appDir, ".next", f);
  if (!existsSync(p)) {
    missing.push(f);
    continue;
  }
  gzipBytes += gzipSync(readFileSync(p), { level: 9 }).length;
}
if (missing.length > 0) {
  console.error(`✗ ${missing.length} chunk(s) named by the manifest are missing from .next:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}

const { shared_runtime_gzip_kb: budgetKb } = JSON.parse(readFileSync(budgetPath, "utf8"));
const kb = gzipBytes / 1024;
const pct = ((kb / budgetKb) * 100).toFixed(0);
const line = `shared runtime: ${kb.toFixed(1)} KB gzipped across ${files.length} chunks (budget ${budgetKb} KB, ${pct}%)`;

if (kb > budgetKb) {
  console.error(`✗ ${line}\n\n  Over by ${(kb - budgetKb).toFixed(1)} KB. Either trim what every page loads, or —\n  if the growth is genuinely warranted — raise shared_runtime_gzip_kb in\n  apps/storefront/bundle-budget.json in the same commit, with the reason.`);
  process.exit(1);
}
console.log(`✓ ${line}`);
