# R2 — SECURITY sweep (read-only; prod 0cb1b8ca; NEW project)

Scope: PostgREST exposes only `public`. 126 SECDEF fns in public, all owned by postgres; they use auth.role()/auth.uid() (current_user bug fixed by 20260518193802). Public signup (/api/auth/signup) creates user_profiles.role='admin' + tenant_members admin active → any signup = authenticated admin of own new tenant. 25 auth users, 28 tenants (11 live); 4 non-admin members (all in b5c4); 2 super_admin.

## SEC-1 P0 LIVE — vault_backups bucket: every tenant's full DB export readable/writable by ANY logged-in user
- Storage lockdown migration 20260518000003_storage_lockdown.sql NEVER applied to NEW project. Live policy on storage.objects: "Allow authenticated full access to vault_backups" cmd ALL roles {authenticated} qual (bucket_id = 'vault_backups') — no tenant scoping. [ORCHESTRATOR RE-VERIFIED 2026-10-11: policy as stated; bucket private; 100 objects 2026-09-10 → 2026-10-10; 34 orders.csv, 34 customers.csv.]
- Contents: auto_csv_<ts>/{orders.csv,customers.csv,products.csv} daily since 2026-09-10 (~20MB each), owner NULL; cron /api/cron/backup 0 0 * * * fetchAllInBatches over orders, mv_customer_aggregates, products with SERVICE-ROLE client → all tenants' rows in one CSV. Plus Vault "Time Machine" sync_<ts>.scheniders at bucket root.
- Exploit: just a signup. Role sim (set local role authenticated + dummy sub, rolled back): brand-new user with NO membership sees 100 objects, 34 orders.csv → can list+download every tenant's customer PII (names, phones, addresses, totals, 12 tenants) and INSERT/UPDATE/DELETE every backup.
- Exploitation evidence: none found (all objects owner NULL = cron; no authenticated uploads in 24h edge logs). Can't prove negative (storage download logs not checked).
- Fix direction: (a) immediately make vault_backups service-role-only (revoke blanket authenticated policy); Vault UI → server route w/ service-role or signed URLs (like payroll-pdfs). (b) stop writing all-tenant CSV into a user-readable bucket (service-role-only, or per-tenant `${tenantId}/` prefixes). Migration as written would break Vault UI (paths lack tenant segment). Callers to move: apps/platform/lib/vault-utils.ts fetchCloudVaults/downloadCloudVault/uploadVaultToCloud (browser authenticated, from app/vault/page.tsx — page has NO role/permission gate).
- Invariant: as non-member authenticated, `select count(*) from storage.objects where bucket_id='vault_backups'` must be 0 (today 100).

## SECDEF sweep highlights (full table in agent report; ~40 trigger-only fns omitted)
Guarded OK: charge_wallet_atomic, create_order_atomic (both), split/merge/unmerge/unsplit, process_return/undo_return, get_orders_aggregates, get_customer_order_counts, get_order_duplicate_flags, get_paginated_customers, get_customer_dashboard_stats, get_customer_reliability, apply/publish/seed store_config_v2, aggregate_experiment_stats, log_shipping_export, notification_*, chat_*, lookup_order (anon by design, no rate limit).
UNGUARDED/WEAK, authenticated EXECUTE:
- adjust_customer_points NONE — writes points to any tenant+phone. Caller storefront checkout.ts:305/374/394 (service-role) → revoke-safe from authenticated.
- recompute_inventory WEAK — p_tenant_id NULL → rewrites reserved_quantity for EVERY tenant. Caller product-repository.ts:33 (browser authenticated) → needs guard.
- zero_oversold WEAK — NULL → zeroes oversold stock all tenants. Caller product-repository.ts:44 (browser) → guard.
- inv_apply NONE — arbitrary stock mutation any product id; trigger-only in prod → REVOKE-safe (trigger runs as owner).
- increment_usage_tracking / increment_order_usage NONE — forge any tenant's billing counters; service-role callers only → revoke-safe.
- refresh_customer_aggregates NONE — DoS lever (1.5s avg, 4.3s max); cron only → revoke-safe.
- get_customer_percentile NONE — aggregates customer_trust across ALL tenants by phone+city (5,114 rows/13 tenants; 161 phones shared) → cross-tenant info leak (arguably "community"). Caller use-customer-trust.ts:82.
- get_customer_score_audit_log, get_customer_trust_history NONE — cross-tenant read of customer_trust_audit_log by phone (0 rows today). Callers use-customer-trust.ts:29,12.
- iraq_flag_ambiguous_placements NONE, ANON executable (PUBLIC grant) — writes shared gazetteer, 2.7s avg → DoS + integrity. Ops-only.
- get_seed_automation_status NONE — leaks cron schedule (low).
- notification_channel_enabled/in_quiet_hours — reads by passed user_id, booleans only (low).
Exploitation evidence: none (inventory_ledger 0 tenant mismatches; 2 zero_oversold/recompute ledger entries 2026-05/06; no cross-tenant products.updated_at clusters; customer_points 0 rows).
Fix: guard (not revoke) for recompute_inventory/zero_oversold/trust reads: `IF coalesce(auth.role(),'service_role') <> 'service_role' THEN IF p_tenant_id IS NULL OR p_tenant_id NOT IN (SELECT get_user_tenant_ids()) THEN RAISE 42501`; REVOKE from anon+authenticated for inv_apply, increment_usage_tracking, increment_order_usage, refresh_customer_aggregates, adjust_customer_points, iraq_flag_ambiguous_placements.

## SEC-2 P1 (latent) — margin columns bypass
orders has column GRANT SELECT on product_cost, net_profit to anon AND authenticated; waseet_merchant_price/company_price table-wide readable → non-admin member queries /rest/v1/orders?select=product_cost,net_profit directly, bypassing view's is_tenant_admin mask. orders in supabase_realtime publication incl those 4 columns → raw payload into client cache (realtime-batcher.ts:154-161; normalizeOrder doesn't strip). LATENT: all 23,214 orders have these NULL; only 4 non-admin members. anon gets 0 orders rows (RLS). Fix: revoke column SELECT; publication column list without margin cols. Finances doesn't read them (recomputes from products.cost) → revoke safe.

## SEC-3 P2 — product_variants.cost anon-readable; public_storefront_read_product_variants/product_images policies only check product exists (not visible/archived/supply/tenant status). product_variants 0 rows today (latent). product_batches/purchase_orders anon column grants but row policy blocks (defense-in-depth gap).

## SEC-6 P2 — advisors/misc
- security_definer_view ERROR: public.customer_aggregates SECDEF view (tenant filtered in body) → set security_invoker. mv_customer_aggregates no anon/auth grants (old incident closed).
- rls_enabled_no_policy on account_link_tokens, api_rate_limits, chat_push_config, security_logs (deny-all; fine).
- 26 mutable search_path; pg_net in public; leaked-password protection disabled.
- anon + authenticated hold table-level INSERT/UPDATE/DELETE/SELECT on public.orders (arwdDxtm), RLS-only gate — brittle.
- bom_items, product_categories RLS use (auth.jwt()->>'tenant_id')::uuid — claim never set → deny-all for authenticated (product_categories 166 rows invisible to app unless service-role) → latent CORRECTNESS bug.
- Storage: qc-evidence still PUBLIC (1 object); product-images write policies PUBLIC → anon can upload/overwrite/delete any product image (integrity P2). payroll-pdfs/chat-attachments private + gated.

Caveats: guards classified statically (no RPC calls); pg_stat reset 09-27; invariants point-in-time.
