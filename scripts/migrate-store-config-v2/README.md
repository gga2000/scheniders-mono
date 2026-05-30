# migrate-store-config-v2

One-shot migration that maps every tenant's legacy `tenants.store_config` (plus its `schneiders` sub-object) into the new `StoreConfigV2` shape and writes the result to `tenants.store_config_v2`. The legacy column is left untouched and `config_version` is **not** flipped — that's the separate cutover step.

## Usage

```bash
# Preview the diff for one tenant — safe, read-only.
tsx scripts/migrate-store-config-v2 --dry-run --tenant=scheniders-store

# Migrate one tenant for real.
tsx scripts/migrate-store-config-v2 --tenant=scheniders-store

# Migrate every tenant.
tsx scripts/migrate-store-config-v2 --all
```

Env: reads `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from `.env.local` or `.env` (cwd or repo root). For a quick test you can also pass `--supabase-url=...` and `--supabase-key=...` inline.

## Tests

```bash
cd scripts/migrate-store-config-v2 && npm test
```

Fixtures live in `__fixtures__/`. The mapper is pure — given identical legacy input it always produces byte-identical v2 output (ids are derived via FNV-1a hashes of content + slot), so re-running the migration is safe.

## Safety

- Read-only by default unless `--tenant` or `--all` is supplied.
- Never mutates `store_config`. Only writes `store_config_v2`.
- Never touches `config_version`. The cutover/flip is a separate deploy step.
- Per-tenant errors are isolated — one bad tenant doesn't abort the batch.
