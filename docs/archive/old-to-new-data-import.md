# Scheniders OLD → NEW migration

One-shot bulk migration from the OLD Supabase project (`ibfdugifekivquwprqjc`, the
single-tenant `scheniders` Next.js app) into the NEW mono project
(`sduvpgqwhxragxtxztur`, multi-tenant), scoping all imported data to the
**Scheniders Iraq** tenant (`b5c4f2d4-834f-4af4-822d-9b9826a8f45a`).

## Prereqs

- Data dump must be present at `/Users/ali/scheniders-migration-handoff/data/`
  (35 JSONL files + `MANIFEST.md` + `schema_verification.json`).
- New project must already have:
  - The Scheniders Iraq tenant row (already present, renamed 2026-06-01).
  - The 5 staff in `auth.users` + `user_profiles` + `tenant_members`
    (inserted via Phase 1a, 2026-06-01).
  - The customer_trust PK migrated to `(tenant_id, phone)`
    (migration `20260601000000_customer_trust_composite_pk.sql`).

## Run order

```bash
# 1. Wipe operational rows under the Scheniders Iraq tenant (preserves
#    wallet, subscription, tenant_members, infra) + disable triggers on
#    high-volume tables.
psql "$NEW_DATABASE_URL" -f scripts/migration/01-pre-import.sql

# 2. Stream JSONL → INSERT batches via service-role. Dry-run first.
tsx scripts/migration/migrate-old-data.ts --dry-run    # prints plan, no writes
tsx scripts/migration/migrate-old-data.ts --apply      # actually writes

# 3. Re-enable triggers, recompute customer_trust/inventory, refresh MV.
psql "$NEW_DATABASE_URL" -f scripts/migration/03-post-import.sql

# 4. Reconcile against schema_verification.json — flag drift.
tsx scripts/migration/04-reconcile.ts
```

If you'd rather not use psql, the same SQL can be applied via the Supabase MCP
`apply_migration` tool — the `01-` and `03-` files are self-contained.

## What gets skipped on import

- `customer_risk` (3,004 rows) — derived. Post-import we recompute
  `customer_trust` from `orders` + `blacklist` + `customer_whitelist`.
- `inventory_ledger` (563 rows) — derived. Post-import we recompute from `orders`.
- `user_profiles` (5 rows) — already inserted in Phase 1a. We **UPSERT** to refresh
  `display_name`, `avatar_url`, `last_login_at` (without overwriting the
  inserted `created_at` / preserved UUIDs).

## Secrets

`/Users/ali/scheniders-migration-handoff/data/SECRETS_SEPARATE.json` contains
`waseet_token` (app_settings) and `lightfunnels_access_token` (settings).
Restore manually into the new tenant's vault — do NOT pass them through the
importer.
