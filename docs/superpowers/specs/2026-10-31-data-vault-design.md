# Data Vault: per-store, server-guarded (round 1)

Chosen by default (Ali asleep, recommended option A).

- Cloud copies: private bucket `vault_backups`, folder `<tenantId>/`. Browsers hold no storage rule; list, upload slot and download URL come from admin-only server actions (`app/actions/vault.ts`) that take the tenant from the caller's membership.
- Encryption stays in the browser (AES-GCM, PBKDF2). The server never sees the key.
- Audit: `security_logs.tenant_id` added, browsers have no write grant, rows written by the server actions and the cron; store admins read their own rows.
- Cron backup: one folder per store, queries filtered by `tenant_id`, one audit row per store.
- Export and restore refuse to run without a confirmed active store; restore always writes the active store's id. Customer upserts conflict on `(customer_phone, tenant_id)`.

Next rounds: server-side restore with schema validation and dry-run diff, retention/pruning, Arabic copy and UI pass, split the 700-line page, per-store backup health view.
Queued for Ali: delete the 27 old all-store CSV folders at the bucket root.
