# Database inventory — Supabase `sduvpgqwhxragxtxztur`

Captured 2026-10-19 with read-only SQL; **re-snapshot 2026-10-19 00:41 UTC** after two migrations from PR #146 were applied live (merged to `main` after the pinned commit `6bde0f4`) (see "Live drift since the first snapshot" below; every count in this file is now the 00:41 UTC value unless marked otherwise) (`pg_class`, `pg_policies`, `pg_proc`, `storage.buckets`, `pg_publication_tables`, `cron.job`) and `get_advisors`. Project: `scheniders-platform`, Postgres 17.6.1.104, eu-central-1, status ACTIVE_HEALTHY. The OLD project `ibfdugifekivquwprqjc` was not touched.

## Totals

| Object | Count |
|---|---|
| Tables (public) | 166 |
| Views | 8 (7 `security_invoker=true`, 1 `customer_aggregates` = SECURITY DEFINER view, `security_barrier`) |
| Materialized views | 1 (`mv_customer_aggregates`, no anon/authenticated SELECT) |
| Functions (public) | 183 — 126 SECURITY DEFINER (60 callable by `authenticated`, 1 callable by `anon` = `lookup_order`, 0 without pinned `search_path`); 57 SECURITY INVOKER (46 callable by `anon` and `authenticated`, 9 by `authenticated` only, 2 by neither). EXECUTE by `authenticated`: 115 in total; by `anon`: 47. First snapshot: 182 / 64 / 1 / 7 |
| RLS policies | 345 (first snapshot 343) |
| Triggers (non-internal, `public` tables) | 47 (listed below; first snapshot 46). All schemas: 56 |
| Indexes | 479 |
| Storage buckets | 8 |
| Realtime publication tables | 4 |
| pg_cron jobs | 13 (2 inactive) |
| `max_connections` | 60 (29 in use at capture) |

## Tables: RLS, tenant column, policy count, size

Every public table has RLS **enabled**; none has FORCE RLS. Columns: `tenant_id` present / nullable; policies; est rows; total bytes.

Tenant-scoped tables where `tenant_id` is **NULLABLE** (violates §5 "tenant_id NOT NULL"): activity_logs, admin_activity_logs, admin_employee_commissions, announcements, blacklist, chat_push_subscriptions, chat_user_status, checkout_queue, community_ratings, customer_filter_presets, customer_links, customer_metadata, customer_notes, customer_risk, customer_tag_assignments, customer_tags, customer_trust_audit_log, customer_voice_notes, customer_whitelist, delivery_import_items, delivery_imports, employee_salary_configs, expenses, filter_presets, follow_up_reminders, inventory_history, inventory_ledger, message_templates, notification_deliveries, order_notes, order_status_history, **orders**, payroll_records, performance_bonuses, print_batches, print_history, product_activity_log, product_bundle_items, product_options, product_order_bumps, product_price_history, product_related, product_suppliers, product_tiered_pricing, product_variants, **products**, qc_quarantine, qc_quarantine_events, role_salary_defaults, salary_advances, salary_config_history, salary_penalties, settings, waseet_api_logs, waseet_city_mappings, whatsapp_logs (56 tables).

Tables with **no `tenant_id`** (global or child-of-tenant tables; each must be justified in A1): access_requests, admin_commission_config, admin_employee_achievements, admin_employee_tracking, admin_settings, admin_users, api_rate_limits, chat_members, chat_message_attachments, chat_message_edits, chat_message_mentions, chat_message_reactions, chat_message_references, chat_pins, chat_push_config, industries, iraq_* (8), lead_activities, lead_competitors, lead_follow_ups, lead_social_links, leads, notification_feed_state, notification_user_state, plan_limits, product_tag_assignments, purchase_order_items, role_permissions, security_logs, seed_customers, stock_take_items, system_health_checks, tenants, user_permissions, user_profiles, waseet_cities, waseet_districts, waseet_gazetteer, waseet_region_overrides, waseet_region_review, waseet_regions, whatsapp_outreach_templates.

RLS enabled with **zero policies** (deny-all to clients, service-role only): account_link_tokens, api_rate_limits, chat_push_config, security_logs.

Largest tables (bytes, est rows): orders 26.1 MB / 23,228; whatsapp_logs 24.2 MB / 10,007; order_status_history 15.0 MB / 77,187; waseet_regions 11.0 MB; iraq_locations 10.6 MB; customer_trust 5.8 MB / 5,181; notifications 5.7 MB / 2,033; wallet_transactions 4.7 MB / 17,746; iraq_location_aliases 3.4 MB; activity_logs 3.2 MB / 7,248; mv_customer_aggregates 2.7 MB / 6,332; checkout_queue 0.7 MB / 2,336.

## Policies per table (cmd[roles]; {JWT} = policy text references `auth.jwt`; {TRUE} = qual/with_check literally `true`)

```
abandoned_carts: SELECT[authenticated]
access_requests: SELECT[public]
activity_logs: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
admin_activity_logs: ALL[authenticated]
admin_commission_config: ALL[public]
admin_employee_achievements: ALL[public]
admin_employee_commissions: ALL[public]
admin_employee_tracking: ALL[public]
admin_notes: ALL[authenticated]
admin_settings: ALL[public]
admin_users: SELECT[authenticated]
admin_watchlist: ALL[authenticated]
analytics_events: INSERT[authenticated] SELECT[authenticated]
announcements: DELETE[authenticated] INSERT[authenticated] SELECT[public] UPDATE[authenticated]
app_settings: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
blacklist: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
bom_items: ALL[public]{JWT}
categories: DELETE[public] INSERT[public] SELECT[authenticated] SELECT[public] UPDATE[public]
chat_conversations: INSERT[public] SELECT[public] UPDATE[public]
chat_members: INSERT[public] SELECT[public] UPDATE[public]
chat_message_attachments: INSERT[public] SELECT[public]
chat_message_edits: SELECT[public]
chat_message_mentions: INSERT[public] SELECT[public]
chat_message_reactions: ALL[public] SELECT[public]
chat_message_references: INSERT[public] SELECT[public]
chat_messages: INSERT[public] SELECT[public] UPDATE[public]
chat_notification_prefs: ALL[public]
chat_pins: ALL[public] SELECT[public]
chat_push_subscriptions: ALL[public]
chat_user_status: ALL[public] SELECT[public]
checkout_queue: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
community_ratings: ALL[public]
customer_filter_presets: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
customer_links: ALL[public]
customer_metadata: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
customer_notes: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
customer_points: SELECT[authenticated]
customer_points_ledger: SELECT[authenticated]
customer_risk: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
customer_tag_assignments: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
customer_tags: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
customer_trust: ALL[public]
customer_trust_audit_log: SELECT[public]
customer_voice_notes: ALL[public]
customer_whitelist: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
delivery_import_items: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
delivery_imports: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
employee_salary_configs: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
expenses: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
filter_presets: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
follow_up_reminders: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
industries: ALL[public] SELECT[public]
inventory_alerts: ALL[public]
inventory_history: ALL[authenticated]
inventory_ledger: SELECT[authenticated]
iraq_district_areas: ALL[service_role]{TRUE} SELECT[anon+authenticated]{TRUE}
iraq_districts: ALL[service_role]{TRUE} SELECT[anon+authenticated]{TRUE}
iraq_governorates: ALL[service_role]{TRUE} SELECT[anon+authenticated]{TRUE}
iraq_location_aliases: ALL[service_role]{TRUE} SELECT[anon+authenticated]{TRUE}
iraq_location_carrier_refs: ALL[service_role]{TRUE} SELECT[anon+authenticated]{TRUE}
iraq_location_reviews: ALL[service_role]{TRUE} SELECT[authenticated]{TRUE}
iraq_locations: ALL[service_role]{TRUE} SELECT[anon+authenticated]{TRUE}
iraq_postal_codes: ALL[service_role]{TRUE} SELECT[anon+authenticated]{TRUE}
lead_activities: ALL[public]
lead_competitors: ALL[public]
lead_follow_ups: ALL[public]
lead_social_links: ALL[public]
leads: ALL[public]
message_templates: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
newsletter_subscribers: INSERT[public] SELECT[public]
notification_deliveries: SELECT[public]
notification_feed_state: ALL[public]
notification_mutes: ALL[public]
notification_prefs: ALL[public]
notification_settings: ALL[public]
notification_user_state: ALL[public]
notifications: SELECT[public]
order_deletion_log: SELECT[public]
order_generation_config: ALL[public]
order_merge_log: SELECT[public]
order_notes: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
order_reasons: ALL[public] SELECT[public]
order_split_log: SELECT[public]
order_status_history: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
orders: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
payroll_records: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
performance_bonuses: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
plan_limits: SELECT[public]{TRUE}
print_batches: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
print_history: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
product_activity_log: ALL[authenticated]
product_attribute_defs: ALL[authenticated] SELECT[anon+authenticated]
product_attribute_values: ALL[authenticated] SELECT[anon+authenticated]
product_batches: ALL[public]
product_bundle_items: ALL[authenticated] SELECT[anon+authenticated]
product_categories: ALL[public]{JWT} SELECT[anon+authenticated]
product_images: DELETE[public] INSERT[public] SELECT[public] SELECT[authenticated] UPDATE[public]
product_options: ALL[public]
product_order_bumps: ALL[authenticated] SELECT[anon+authenticated]
product_price_history: ALL[authenticated]
product_related: ALL[authenticated] SELECT[anon+authenticated]
product_reviews: DELETE[authenticated] SELECT[public] SELECT[authenticated] UPDATE[authenticated]
product_storage: ALL[public]
product_suppliers: ALL[authenticated]
product_tag_assignments: ALL[public]
product_tags: ALL[public]
product_tiered_pricing: ALL[authenticated] SELECT[anon+authenticated]
product_variants: DELETE[public] INSERT[public] SELECT[public] SELECT[authenticated] UPDATE[public]
products: DELETE[public] INSERT[public] SELECT[public] SELECT[authenticated] UPDATE[public]
purchase_order_items: ALL[public]
purchase_orders: ALL[public]
qc_quarantine: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
qc_quarantine_events: ALL[public]
referral_codes: SELECT[authenticated]
referrals: SELECT[authenticated]
role_permissions: SELECT[public]
role_salary_defaults: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
salary_advances: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
salary_config_history: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
salary_penalties: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
seed_customers: ALL[public]
settings: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
shipping_export_log: SELECT[public]
smart_collections: ALL[public]
stock_take_items: ALL[public]
stock_takes: ALL[public]
storage_locations: ALL[public]
store_config_experiment_events: SELECT[public]
store_config_schedules: ALL[public]
store_config_versions: INSERT[public] SELECT[public]
store_pages: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
store_performance_audits: SELECT[public]
store_section_presets: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
store_visual_baselines: SELECT[public]
storefront_events: SELECT[authenticated]
subscriptions: SELECT[public]
system_health_checks: SELECT[public]
team_invites: SELECT[public]
telegram_employee_link: DELETE[public] SELECT[public]
telegram_link_codes: ALL[public]
telegram_pending_orders: SELECT[public]
tenant_domains: DELETE[authenticated] INSERT[authenticated] SELECT[anon+authenticated] SELECT[authenticated] UPDATE[authenticated]
tenant_integrations: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
tenant_members: DELETE[authenticated] INSERT[authenticated] SELECT[public] UPDATE[authenticated]   ← changed by 20261019100100 (was ALL[public] SELECT[public])
tenant_public_stats: SELECT[public]
tenant_slug_history: SELECT[anon+authenticated]{TRUE}
tenants: SELECT[public] SELECT[authenticated] UPDATE[authenticated]
usage_tracking: SELECT[public]
user_permissions: SELECT[public]
user_profiles: SELECT[public] SELECT[public] UPDATE[public]
wallet: SELECT[public]
wallet_transactions: SELECT[public]
waseet_api_logs: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
waseet_cities: ALL[service_role]{TRUE} SELECT[anon+authenticated]
waseet_city_mappings: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
waseet_districts: ALL[service_role]{TRUE} SELECT[anon+authenticated]{TRUE}
waseet_gazetteer: ALL[service_role]{TRUE} SELECT[anon+authenticated]{TRUE}
waseet_region_overrides: ALL[service_role]{TRUE} SELECT[authenticated]{TRUE}
waseet_region_review: ALL[service_role]{TRUE} SELECT[authenticated]{TRUE}
waseet_regions: ALL[service_role]{TRUE} SELECT[anon+authenticated]
whatsapp_logs: DELETE[public] INSERT[public] SELECT[public] UPDATE[public]
whatsapp_outreach_templates: ALL[public]
```

"public" in the role column means the policy applies to every role including `anon`; the USING clause decides. Each policy body is examined per role in A1.

## Live drift since the first snapshot (MEASURED 2026-10-19 00:41 UTC)

Two migrations from PR #146 (`fix/tenancy-secdef-hardening`, intended tenancy hardening) were applied to production after the first snapshot. They are ordinary changes that reached `main` after the pinned commit, so the pinned snapshot is behind `main`; this audit (read-only) did not apply them. Phase 1 audits them like any other change.

| Version | Name | `statements` stored | `created_by` | Source file |
|---|---|---|---|---|
| 20261019100000 | secdef_rpc_tenant_guards | 0 (empty) | NULL | `packages/supabase/migrations/20261019100000_secdef_rpc_tenant_guards.sql` on remote branch `fix/tenancy-secdef-hardening`, commit `6c0d157` (author `gga2000`, 2026-10-19 03:02 +0300), merged to `origin/main` by PR #146 (`6c75d9b`, 03:32 +0300). Not on the pinned `6bde0f4`. |
| 20261019100100 | tenant_admin_only_writes | 0 (empty) | NULL | same branch / commit / PR, file `20261019100100_tenant_admin_only_writes.sql` |

Both version numbers are later than the moment they were observed (10:00 / 10:01 on a date whose UTC clock read 00:41), so the version is a chosen label, not an apply time. `schema_migrations` does not record who applied them (`created_by` NULL, `statements` empty). Timing from git (MEASURED): branch commit `6c0d157` at 00:02 UTC; PR #146 merged at 00:32 UTC. The exact apply time is not recorded.

Diff against the first snapshot, by catalog (pg_proc / pg_policies / pg_trigger compared against the lists in this file):

**Functions** (183 vs 182)
- New: `tenant_members_guard_self_change()` — SECURITY INVOKER, `search_path=public, pg_temp`, EXECUTE only `postgres`, `service_role` (MEASURED `proacl`).
- EXECUTE revoked from `authenticated` (DEFINER, now `service_role` only): `get_seed_automation_status()`, `in_quiet_hours(uuid, uuid)`, `notification_channel_enabled(uuid, uuid, text, text)`, `tenant_block_active(uuid, text)` — matches `20261019100000…sql:269-275`.
- `search_path` now pinned to `public, pg_temp` (were NO_SEARCH_PATH): `get_current_tenant_id`, `is_tenant_admin` (`…sql:284-285`), `qc_log_status_change` (`:290`), `get_customer_percentile`, `get_customer_score_audit_log`, `get_customer_trust_history`, `increment_order_usage` (re-created with `SET search_path`, `:31-144`, `:155-180`).
- Bodies replaced (CREATE OR REPLACE in `20261019100000…sql`): `get_customer_percentile`, `get_customer_score_audit_log`, `get_customer_trust_history`, `increment_order_usage`, `increment_usage_tracking`, `adjust_customer_points`. Live bodies of all six now reference both `auth.role()` and `get_user_tenant_ids()` (MEASURED). The first snapshot stored no body hashes, so "changed today" rests on the migration file, not on a before/after body diff.
- Grants restated without net change vs this file: `inv_apply`, `refresh_customer_aggregates`, `iraq_flag_ambiguous_placements`, `adjust_customer_points`, `increment_usage_tracking` (all already DEFINER without `auth`).

**Policies** (345 vs 343). Per-table `cmd[roles]` multiset compared for all 162 tables: one table differs.
- `tenant_members`: `admin_manage_members` (ALL, public) dropped; added `tenant_admin_insert_members`, `tenant_admin_update_members`, `tenant_admin_delete_members` (authenticated; `tenant_id ∈ get_user_tenant_ids() AND is_tenant_admin(tenant_id) AND user_id <> auth.uid()`). Net +2.
- Same `cmd[roles]`, predicate changed (`ALTER POLICY` in `20261019100100…sql:151-174`): `tenant_isolation_insert` / `_update` / `_delete` on `employee_salary_configs`, `role_salary_defaults`, `payroll_records`, `salary_advances`, `salary_penalties`, `salary_config_history`, `tenant_integrations`, `tenant_domains`, `settings`, `app_settings` — 30 policies now require `is_tenant_admin(tenant_id)` (MEASURED: 30 of 30 reference it). The `cmd[roles]` list above cannot show this.

**Triggers** (47 vs 46)
- New: `tenant_members.trg_tenant_members_guard_self_change` BEFORE INSERT OR UPDATE OR DELETE → `tenant_members_guard_self_change()`.

**Table privileges** (`20261019100100…sql:184-213`, MEASURED for two samples): `anon` has no SELECT or INSERT on `public.orders` and no INSERT on `public.tenant_members`; `authenticated` has no TRUNCATE on `public.orders`.

**Unchanged:** 166 tables (all RLS on), 126 DEFINER, 1 anon-callable DEFINER (`lookup_order`), 13 pg_cron jobs.

`origin/main` has also moved past the pinned commit: 11 commits after `6bde0f4` up to `87e5e40` (2026-10-19 03:42 +0300), 433 files changed, including PR #145 ("mirror production's full migration history into the repo") and PR #146. The audit stays pinned to `6bde0f4`; Phase 1 must decide whether to re-pin.

## Views

| View | Options | anon SELECT | authenticated SELECT |
|---|---|---|---|
| customer_aggregates | security_barrier (SECURITY DEFINER view — advisor ERROR) | no | yes |
| v_order_confirmations_by_agent | security_invoker | yes | yes |
| v_order_time_to_confirm | security_invoker | yes | yes |
| v_orders_with_risk | security_invoker | yes | yes |
| v_shipping_export_outcomes | security_invoker | yes | yes |
| v_whatsapp_delivery_rate | security_invoker | yes | yes |
| v_whatsapp_message_outcomes | security_invoker | yes | yes |
| waseet_destinations | security_invoker | yes | yes |
| mv_customer_aggregates (matview) | — | no | no |

## Functions (public schema)

Legend: `[DEFINER,auth,anon,NO_SEARCH_PATH]` = SECURITY DEFINER, EXECUTE granted to authenticated / anon, `search_path` not pinned. In this list only DEFINER rows carry `auth`/`anon`; the EXECUTE grants of INVOKER functions are listed after the block and in COVERAGE.md. Lines marked `←` changed between the first snapshot and the 00:41 UTC re-snapshot.

```
adjust_customer_points(_tenant_id uuid, _phone text, _delta integer, _reason text, _order_id uuid) [DEFINER]
aggregate_experiment_stats(p_tenant_id uuid, p_experiment_id text) [DEFINER,auth]
apply_store_config_v2_patch(p_tenant_id uuid, p_is_draft boolean, p_path text[], p_value jsonb) [DEFINER,auth]
bom_items_set_updated_at()
calculate_customer_trust(target_phone text)
calculate_lead_score(p_lead_id uuid) [DEFINER]
charge_wallet_atomic(_tenant_id uuid, _amount numeric, _description text, _order_id text) [DEFINER,auth]
chat_add_member_to_general() [DEFINER,auth]
chat_add_members(p_conversation_id uuid, p_user_ids uuid[]) [DEFINER,auth]
chat_archive_conversation(p_conversation_id uuid, p_archived boolean) [DEFINER,auth]
chat_assign_order(p_order_id uuid, p_user_id uuid) [DEFINER,auth]
chat_auto_archive_threads(p_limit integer) [DEFINER]
chat_auto_resolve_threads(p_limit integer) [DEFINER]
chat_broadcast_conversation() [DEFINER,auth]
chat_broadcast_membership() [DEFINER,auth]
chat_broadcast_message() [DEFINER,auth]
chat_broadcast_reaction() [DEFINER,auth]
chat_capture_edit()
chat_conversations_guard_update()
chat_create_channel(p_name text, p_is_private boolean, p_topic text, p_icon text) [DEFINER,auth]
chat_create_group(p_name text, p_user_ids uuid[]) [DEFINER,auth]
chat_delete_conversation(p_conversation_id uuid) [DEFINER,auth]
chat_find_or_create_dm(p_other_user_id uuid) [DEFINER,auth]
chat_find_or_create_order_conversation(p_order_id uuid) [DEFINER,auth]
chat_is_conversation_admin(p_conversation_id uuid) [DEFINER,auth]
chat_is_member(p_conversation_id uuid) [DEFINER,auth]
chat_leave_conversation(p_conversation_id uuid) [DEFINER,auth]
chat_mark_all_read() [DEFINER,auth]
chat_mark_read(p_conversation_id uuid) [DEFINER,auth]
chat_members_guard_update()
chat_messages_guard_update()
chat_notify_push() [DEFINER]
chat_orders_event() [DEFINER,auth]
chat_post_order_event(p_order_id uuid, p_event jsonb) [DEFINER]
chat_remove_member(p_conversation_id uuid, p_user_id uuid) [DEFINER,auth]
chat_rename_conversation(p_conversation_id uuid, p_name text, p_topic text) [DEFINER,auth]
chat_search_messages(p_query text, p_limit integer) [DEFINER,auth]
chat_send_message(p_conversation_id uuid, p_body text, p_client_msg_id text, p_reply_to_id uuid, p_references jsonb, p_mentions uuid[], p_attachments jsonb) [DEFINER,auth]
chat_set_conversation_icon(p_conversation_id uuid, p_icon text) [DEFINER,auth]
chat_set_conversation_resolved(p_conversation_id uuid, p_resolved boolean) [DEFINER,auth]
chat_thread_lifecycle_policy(p_tenant_id uuid) [DEFINER]
chat_topic_conv_id(p_topic text)
chat_topic_conversation(p_conversation_id uuid)
chat_topic_user(p_user_id uuid)
chat_touch_conversation() [DEFINER]
chat_unread_counts() [DEFINER,auth]
check_notification_pipeline() [DEFINER]
check_order_sla(p_hours integer, p_quiet_hours integer, p_window_hours integer) [DEFINER]
clear_notification_feed()
cod_risk_signals(_tenant_id uuid, _phone text, _address text) [DEFINER]
compute_lead_predictions(p_avg_view_count integer, p_industry_id uuid, p_avg_order_count integer)
compute_lead_tier(p_follower_count integer)
consume_rate_limit(_key text, _limit integer, _window_seconds integer) [DEFINER]
create_order_atomic(_order_data jsonb) [DEFINER,auth]
create_order_atomic(_order_data jsonb, _tenant_id uuid) [DEFINER,auth]
dispatch_notification() [DEFINER]
enforce_order_created_at_not_future()
enforce_product_block() [DEFINER]
enforce_storefront_writes_block() [DEFINER]
generate_seed_orders() [DEFINER]
get_current_tenant_id() [DEFINER,auth]   ← 20261019100000: search_path pinned (was NO_SEARCH_PATH)
get_customer_dashboard_stats() [DEFINER,auth]
get_customer_order_counts(_tenant_id uuid, _phones text[]) [DEFINER,auth]
get_customer_percentile(target_phone text, target_city text) [DEFINER,auth]   ← 20261019100000: search_path pinned (was NO_SEARCH_PATH)
get_customer_reliability(p_phone text) [DEFINER,auth]
get_customer_score_audit_log(target_phone text, log_limit integer, log_offset integer) [DEFINER,auth]   ← 20261019100000: search_path pinned (was NO_SEARCH_PATH)
get_customer_trust_history(target_phone text, months integer) [DEFINER,auth]   ← 20261019100000: search_path pinned (was NO_SEARCH_PATH)
get_dashboard_metrics(p_range text)
get_order_duplicate_flags(_tenant_id uuid, _order_ids uuid[]) [DEFINER,auth]
get_orders_aggregates(_tenant_id uuid, _date_from date, _date_to date, _city text, _product text, _priority text, _payment_status text, _is_return boolean, _order_type text) [DEFINER,auth]
get_paginated_customers(search_query text, status_filter text, city_filter text, sort_by text, sort_desc boolean, page_limit integer, page_offset integer, min_ltv bigint, max_ltv bigint, last_order_within_days integer, tag_id_filter text, trust_tier_filter text, min_trust_score integer, max_trust_score integer, value_filter text, risk_filter text, last_order_before_days integer, first_order_within_days integer, first_delivery_pending boolean) [DEFINER,auth]
get_product_sales()
get_seed_automation_status() [DEFINER]   ← 20261019100000: EXECUTE revoked from authenticated (was DEFINER,auth)
get_user_tenant_ids() [DEFINER,auth]
in_quiet_hours(p_user_id uuid, p_tenant_id uuid) [DEFINER]   ← 20261019100000: EXECUTE revoked from authenticated (was DEFINER,auth)
increment_order_usage(p_tenant_id uuid) [DEFINER]   ← 20261019100000: search_path pinned (was NO_SEARCH_PATH)
increment_order_version()
increment_usage_tracking(_tenant_id uuid, _year integer, _month integer) [DEFINER]
inv_apply(p_order_id uuid, p_items jsonb, p_status text, p_sign integer, p_tenant_id uuid) [DEFINER]
inv_order_changed() [DEFINER]
inv_phase(p_status text)
iraq_district_identity_key(p_name text)
iraq_flag_ambiguous_placements() [DEFINER]
iraq_refresh_location_districts() [DEFINER]
iraq_resolve_address(p_text text, p_governorate_code text, p_min_similarity real)
iraq_resolve_location(p_text text, p_governorate_code text, p_min_similarity real)
is_tenant_admin(p_tenant_id uuid) [DEFINER,auth]   ← 20261019100000: search_path pinned (was NO_SEARCH_PATH)
leads_after_upsert()
leads_before_upsert()
log_cart_recovered_notification() [DEFINER]
log_inventory_notifications() [DEFINER]
log_order_creation_history() [DEFINER]
log_order_notification() [DEFINER]
log_order_update_notifications() [DEFINER]
log_review_notification() [DEFINER]
log_shipping_export(p_tenant_id uuid, p_company text, p_order_count integer, p_succeeded boolean, p_failure_stage text, p_error_message text) [DEFINER,auth]
log_shipping_notification() [DEFINER]
log_team_notification() [DEFINER]
log_wallet_notification() [DEFINER]
lookup_order(p_tenant_id uuid, p_phone text, p_order_number text) [DEFINER,auth,anon]
loyalty_order_changed() [DEFINER]
loyalty_phone_key(_phone text)
loyalty_points_for_order(_tenant_id uuid, _subtotal numeric) [DEFINER]
mark_notifications_read()
merge_orders_atomic(_keep_order_id uuid, _archive_order_id uuid, _tenant_id uuid, _changed_by text) [DEFINER,auth]
mint_referral_code(_tenant_id uuid, _phone text) [DEFINER]
mirror_chat_notification() [DEFINER]
mirror_chat_notification_delete() [DEFINER]
mirror_chat_notification_read() [DEFINER]
mirror_order_notification() [DEFINER]
mirror_order_notification_update() [DEFINER]
normalize_arabic_text_for_search(_text text)
normalize_phone(input_phone text)
normalize_phone_for_search(_phone text)
notification_channel_enabled(p_user_id uuid, p_tenant_id uuid, p_category text, p_channel text) [DEFINER]   ← 20261019100000: EXECUTE revoked from authenticated (was DEFINER,auth)
notification_feed(p_limit integer, p_before timestamp with time zone, p_filter text) [DEFINER,auth]
notification_stats(p_days integer) [DEFINER,auth]
notification_unread_count() [DEFINER,auth]
notify_order_push() [DEFINER,auth]
order_base_id(_order_id text)
order_search_matches(_term text, _customer_name text, _phone text, _secondary_phone text, _city text, _address_details text, _notes text, _order_id text, _delivery_order_id text, _sequence_number integer)
order_source_actor_label(p_source text)
process_return(_order_id uuid, _tenant_id uuid, _reason_label text, _changed_by_name text, _changed_by_avatar text, _destinations jsonb) [DEFINER,auth]
progress_seed_orders() [DEFINER]
prune_notification_deliveries(p_keep_days integer) [DEFINER]
prune_order_notifications(p_keep_days integer) [DEFINER]
publish_store_config_v2(p_tenant_id uuid, p_config jsonb, p_diff_summary jsonb, p_expected_rev bigint) [DEFINER,auth]
qc_log_status_change() [DEFINER]   ← 20261019100000: search_path pinned (was NO_SEARCH_PATH)
recompute_inventory(p_tenant_id uuid) [DEFINER,auth]
referral_check(_tenant_id uuid, _code text, _phone text) [DEFINER]
referral_order_changed() [DEFINER]
refresh_bestseller_ranks(p_window_days integer, p_top_n integer) [DEFINER]
refresh_customer_aggregates() [DEFINER]
refresh_tenant_public_stats() [DEFINER]
resolve_order_creation_actor(p_order orders, OUT actor_name text, OUT actor_avatar text) [DEFINER]
resolve_status_actor(p_changed_by text, OUT actor_name text, OUT actor_avatar text) [DEFINER]
risk_level_calc(p_severe integer, p_recent_severe integer, p_moderate integer, p_recent_moderate integer, p_blocked boolean)
search_orders(p_term text, p_limit integer)
seed_store_config_v2_draft(p_tenant_id uuid, p_config jsonb) [DEFINER,auth]
send_notification_digests(p_mode text) [DEFINER]
set_admin_users_updated_at()
set_order_completed_at()
set_orders_updated_at()
set_updated_at_storefront()
split_order_atomic(_original_order_id uuid, _kept_items jsonb, _returned_items jsonb, _tenant_id uuid) [DEFINER,auth]
split_order_atomic(_original_order_id uuid, _kept_items jsonb, _returned_items jsonb) [DEFINER,auth]
storefront_funnel(_tenant_id uuid, _from timestamp with time zone, _to timestamp with time zone)
sync_product_primary_category()
tenant_block_active(p_tenant_id uuid, p_block text) [DEFINER]   ← 20261019100000: EXECUTE revoked from authenticated (was DEFINER,auth)
tenant_members_guard_self_change()   ← NEW in 20261019100100 (SECURITY INVOKER trigger function; EXECUTE revoked from PUBLIC, anon, authenticated)
tg_order_reasons_updated_at()
tg_product_attribute_defs_updated_at()
tg_product_attribute_values_tenant_guard() [DEFINER]
toggle_seed_automation(_active boolean) [DEFINER]
trigger_update_trust_on_blacklist()
trigger_update_trust_on_order()
trigger_update_trust_on_rating()
undo_return(_order_id uuid, _tenant_id uuid) [DEFINER,auth]
unmerge_orders_atomic(_merge_log_id uuid, _tenant_id uuid) [DEFINER,auth]
unsplit_order_atomic(_split_log_id uuid, _tenant_id uuid) [DEFINER,auth]
update_filter_preset_timestamp()
update_order_last_actor() [DEFINER]
uuid_generate_v4()
value_tier_calc(p_completed integer)
waseet_apply_overrides() [DEFINER]
waseet_clean_name(p_name text)
waseet_collapse_repeats(p_text text)
waseet_dedupe_key(p_name_key text)
waseet_district(p_name text)
waseet_kind_of_token(p_token text)
waseet_name_key_sorted(p_name text)
waseet_place_kind(p_name text)
waseet_refresh_all() [DEFINER]
waseet_refresh_canonical_regions() [DEFINER]
waseet_refresh_districts() [DEFINER]
waseet_refresh_municipalities() [DEFINER]
waseet_refresh_postal_codes() [DEFINER]
waseet_refresh_region_review(p_threshold real) [DEFINER]
waseet_refresh_split_names() [DEFINER]
waseet_search_key(p_name text)
waseet_sort_tokens(p_key text)
waseet_strip_article(p_key text)
zero_oversold(p_tenant_id uuid) [DEFINER,auth]
```

Functions the code calls that do **not** exist live (MEASURED, `pg_proc` 2026-10-19 00:41 UTC), 6:
- `auto_move_to_no_response` — `apps/platform/app/api/cron/auto-no-response/route.ts:46` (defined only in repo file `packages/supabase/migrations/20_auto_no_response.sql`, never applied live)
- `merge_categories` — `apps/platform/hooks/use-categories-query.ts:263`
- `split_category` — `apps/platform/hooks/use-categories-query.ts:288`
- `increment_wallet_balance` — `apps/admin/app/api/bulk/route.ts:173`
- `search_orders_v2` — `apps/platform/lib/repositories/order-repository.ts:448` (falls back to direct selects when missing, `:453`; repo migration `20261012120000_search_orders_v2.sql` not applied live)
- `exec_sql` — `apps/platform/scripts/add-tag-color-column.ts:16`, `apps/platform/scripts/apply-persistence.ts:41` (tracked one-off scripts, not app runtime)

Relations the code queries that do **not** exist live (MEASURED, `pg_class` 2026-10-19): `customers` (`apps/platform/hooks/use-bulk-actions.ts:26`), `order_items` (`apps/platform/hooks/use-store-analytics.ts:33`), `activity_log` (`apps/platform/lib/customer-data-export.ts:95`, `:240`), `wallets` (`apps/admin/app/api/bulk/route.ts:180`, `:191`). See CONTEXT L-12 and L-39. `get_orders_aggregates` exists live; platform recon could not find its definition in the repo.

SECURITY INVOKER functions executable by `authenticated` only (9, MEASURED 00:41 UTC): chat_topic_conv_id, chat_topic_conversation, chat_topic_user, clear_notification_feed, get_dashboard_metrics, iraq_resolve_address, loyalty_phone_key, mark_notifications_read, storefront_funnel. INVOKER functions with no `anon`/`authenticated` EXECUTE (2): tenant_members_guard_self_change, tg_product_attribute_defs_updated_at.

Non-DEFINER (SECURITY INVOKER) functions with EXECUTE granted to `anon` (46, all also granted to `authenticated`; they run with the caller's rights, so risk depends on what they read/write — A1 checks each): bom_items_set_updated_at, calculate_customer_trust, chat_capture_edit, chat_conversations_guard_update, chat_members_guard_update, chat_messages_guard_update, compute_lead_predictions, compute_lead_tier, enforce_order_created_at_not_future, get_product_sales, increment_order_version, inv_phase, iraq_district_identity_key, iraq_resolve_location, leads_after_upsert, leads_before_upsert, normalize_arabic_text_for_search, normalize_phone, normalize_phone_for_search, order_base_id, order_search_matches, order_source_actor_label, risk_level_calc, search_orders, set_admin_users_updated_at, set_order_completed_at, set_orders_updated_at, set_updated_at_storefront, sync_product_primary_category, tg_order_reasons_updated_at, trigger_update_trust_on_blacklist, trigger_update_trust_on_order, trigger_update_trust_on_rating, update_filter_preset_timestamp, uuid_generate_v4, value_tier_calc, waseet_clean_name, waseet_collapse_repeats, waseet_dedupe_key, waseet_district, waseet_kind_of_token, waseet_name_key_sorted, waseet_place_kind, waseet_search_key, waseet_sort_tokens, waseet_strip_article.

## Storage buckets

| Bucket | Public | Size limit | MIME allowlist |
|---|---|---|---|
| product-images | yes | 5 MB | image/jpeg, image/png, image/webp, image/gif |
| tenant-assets | yes | 512 KB | image/png, image/jpeg, image/webp, **image/svg+xml** |
| avatars | yes | 5 MB | image/jpeg, image/png, image/webp, image/gif |
| review-photos | yes | 5 MB | image/jpeg, image/png, image/webp |
| **qc-evidence** | **yes** | **none** | **any** |
| chat-attachments | no | 10 MB | image/jpeg, image/png, image/webp, image/gif, application/pdf |
| payroll-pdfs | no | 10 MB | application/pdf |
| vault_backups | no | 100 MB | application/octet-stream, application/json, text/csv |

Code also references a `customer-voice-notes` bucket (platform recon §8) that is **not** in `storage.buckets`.

### Storage policies (`storage.objects`, 15)

| Policy | Cmd | Roles | Condition (first 160 chars) |
|---|---|---|---|
| Admins can manage payroll pdfs | ALL | public | bucket `payroll-pdfs` AND `user_profiles.role = 'adm…'` for `auth.uid()` (global role, not tenant-scoped) |
| Allow Deletions for Product Images | DELETE | **public** | `bucket_id = 'product-images'` only |
| Allow Updates to Product Images | UPDATE | **public** | `bucket_id = 'product-images'` only |
| Allow Uploads to Product Images | INSERT | **public** | `bucket_id = 'product-images'` only |
| Public Read Access for Product Images | SELECT | public | `bucket_id = 'product-images'` |
| Authenticated delete qc-evidence | DELETE | authenticated | `bucket_id = 'qc-evidence'` only |
| Authenticated upload to qc-evidence | INSERT | authenticated | `bucket_id = 'qc-evidence'` only |
| Public read qc-evidence | SELECT | public | `bucket_id = 'qc-evidence'` |
| Platform admins manage vault_backups | ALL | authenticated | bucket `vault_backups` AND `user_profiles.role = 'super_admin'` |
| Public read tenant assets | SELECT | public | `bucket_id = 'tenant-assets'` |
| Tenant members can delete assets | DELETE | authenticated | bucket `tenant-assets` AND first folder ∈ `get_user_tenant_ids()` |
| Tenant members can upload assets | INSERT | authenticated | bucket `tenant-assets` AND first folder ∈ `get_user_tenant_ids()` |
| chat_attachments_delete | DELETE | authenticated | bucket `chat-attachments` AND first folder ∈ tenant ids AND `chat_is_member(…)` |
| chat_attachments_insert | INSERT | authenticated | same |
| chat_attachments_read | SELECT | authenticated | same |

`avatars` and `review-photos` have **no** object policies (writes only via service role; reads via public URL).

## Realtime publication (`supabase_realtime`)

Tables: orders, qc_quarantine, qc_quarantine_events, notifications (postgres_changes; filtered by RLS of the subscriber).

### Realtime authorization policies (`realtime.messages`, 5)

| Policy | Cmd | Condition |
|---|---|---|
| chat_realtime_conv_read | SELECT | topic `chat:conv:%` AND `chat_is_member(chat_topic_conv_id(topic))` |
| chat_realtime_conv_write | INSERT | same |
| chat_realtime_inbox_read | SELECT | topic = `chat:user:` + `auth.uid()` |
| chat_realtime_presence_read | SELECT | topic `chat:tenant:<uuid>:presence` AND uuid ∈ caller's tenants |
| chat_realtime_presence_write | INSERT | same |

Any other broadcast/presence topic (e.g. `returns:${token}`, `presence:${orderId}` from platform recon §7) is a **public channel** unless the client opts into private channels.

## Triggers (47, `pg_trigger`, non-internal, `public` tables; re-snapshot 00:41 UTC)

```
abandoned_carts: trg_log_cart_recovered_notification→log_cart_recovered_notification (AFTER UPD)
admin_users: trg_admin_users_updated_at→set_admin_users_updated_at (BEFORE UPD)
blacklist: trg_update_trust_blacklist→trigger_update_trust_on_blacklist (AFTER INS UPD DEL)
bom_items: bom_items_updated_at→bom_items_set_updated_at (BEFORE UPD)
categories: trg_categories_updated_at→set_updated_at_storefront (BEFORE UPD)
chat_conversations: trg_chat_broadcast_conversation→chat_broadcast_conversation (AFTER UPD); trg_chat_conversations_guard→chat_conversations_guard_update (BEFORE UPD)
chat_members: trg_chat_broadcast_membership→chat_broadcast_membership (AFTER INS DEL); trg_chat_members_guard→chat_members_guard_update (BEFORE UPD)
chat_message_reactions: trg_chat_broadcast_reaction→chat_broadcast_reaction (AFTER INS DEL)
chat_messages: trg_chat_broadcast_message→chat_broadcast_message (AFTER INS UPD); trg_chat_capture_edit→chat_capture_edit (BEFORE UPD); trg_chat_messages_guard→chat_messages_guard_update (BEFORE UPD); trg_chat_touch_conversation→chat_touch_conversation (AFTER INS)
community_ratings: trg_update_trust_ratings→trigger_update_trust_on_rating (AFTER INS UPD)
customer_filter_presets: update_filter_preset_updated_at→update_filter_preset_timestamp (BEFORE UPD)
leads: trg_leads_after_upsert→leads_after_upsert (AFTER INS UPD); trg_leads_before_upsert→leads_before_upsert (BEFORE INS UPD)
notifications: trg_dispatch_notification→dispatch_notification (AFTER INS)
order_reasons: trg_order_reasons_updated_at→tg_order_reasons_updated_at (BEFORE UPD)
order_status_history: trigger_update_order_last_actor→update_order_last_actor (AFTER INS)
orders: increment_orders_version→increment_order_version (BEFORE UPD); trg_chat_orders_event→chat_orders_event (AFTER UPD); trg_inv_order_changed→inv_order_changed (AFTER INS UPD DEL); trg_log_order_creation_history→log_order_creation_history (AFTER INS); trg_log_order_update_notifications→log_order_update_notifications (AFTER UPD); trg_loyalty_order_changed→loyalty_order_changed (AFTER INS UPD); trg_order_completed_at→set_order_completed_at (BEFORE UPD); trg_orders_created_at_not_future→enforce_order_created_at_not_future (BEFORE INS UPD); trg_orders_updated_at→set_orders_updated_at (BEFORE UPD); trg_referral_order_changed→referral_order_changed (AFTER UPD); trg_update_trust_orders→trigger_update_trust_on_order (AFTER INS UPD DEL); trigger_log_order_notification→log_order_notification (AFTER INS)
product_attribute_defs: trg_product_attribute_defs_updated_at→tg_product_attribute_defs_updated_at (BEFORE UPD)
product_attribute_values: trg_product_attribute_values_tenant_guard→tg_product_attribute_values_tenant_guard (BEFORE INS UPD)
product_categories: trg_sync_product_primary_category→sync_product_primary_category (AFTER INS UPD DEL)
product_reviews: trg_log_review_notification→log_review_notification (AFTER INS)
products: trg_enforce_product_block→enforce_product_block (BEFORE INS UPD); trg_log_inventory_notifications→log_inventory_notifications (AFTER UPD)
qc_quarantine: qc_log_status_trigger→qc_log_status_change (AFTER INS UPD)
shipping_export_log: trg_log_shipping_notification→log_shipping_notification (AFTER INS)
store_pages: trg_store_pages_updated_at→set_updated_at_storefront (BEFORE UPD)
tenant_members: trg_chat_add_member_to_general→chat_add_member_to_general (AFTER INS UPD); trg_log_team_notification→log_team_notification (AFTER INS UPD); trg_tenant_members_guard_self_change→tenant_members_guard_self_change (BEFORE INS UPD DEL)   ← NEW in 20261019100100
tenants: trg_enforce_storefront_writes_block→enforce_storefront_writes_block (BEFORE UPD)
wallet: trg_log_wallet_notification→log_wallet_notification (AFTER UPD)
```

Functions that look like trigger functions but are attached to no trigger: `increment_order_usage`, `notify_order_push` (A3 checks whether anything calls them).

## pg_cron jobs

| Job | Schedule (UTC) | Command | Active |
|---|---|---|---|
| refresh-customer-aggregates | */10 * * * * | refresh_customer_aggregates() | yes |
| refresh-bestseller-ranks | 15 2 * * * | refresh_bestseller_ranks() | yes |
| seed_generate_orders | */15 * * * * | generate_seed_orders() | **no** |
| seed_progress_orders | */10 * * * * | progress_seed_orders() | **no** |
| chat-auto-resolve-threads | */15 * * * * | chat_auto_resolve_threads() | yes |
| chat-auto-archive-threads | 30 3 * * * | chat_auto_archive_threads() | yes |
| prune-order-notifications | 40 3 * * * | prune_order_notifications(90) | yes |
| check-notification-pipeline | */15 * * * * | check_notification_pipeline() | yes |
| refresh-tenant-public-stats | */30 * * * * | refresh_tenant_public_stats() | yes |
| notification-digest-hourly | 5 * * * * | send_notification_digests('hourly') | yes |
| notification-digest-daily | 0 6 * * * | send_notification_digests('daily') | yes |
| check-order-sla | */30 * * * * | check_order_sla(2, 6, 24) | yes |
| prune-notification-deliveries | 50 3 * * * | prune_notification_deliveries(30) | yes |

Seed-order generators exist in production (inactive) — `generate_seed_orders` / `toggle_seed_automation` / `get_seed_automation_status` (authenticated-callable). Examine in A1/A3.

## Advisors (2026-10-19)

**Security (first snapshot; superseded by the 00:54 UTC re-run recorded in CONTEXT §3: 1 ERROR, 82 WARN findings, 4 INFO; 19 mutable search_path, 60 authenticated-callable definers):** ERROR 1 (security-definer view `customer_aggregates`); WARN 26 mutable search_path functions (catalog at 00:41 UTC: 19 public functions have no `search_path` setting, 0 of them DEFINER); WARN 1 `pg_net` in public; WARN 1 anon-callable definer (`lookup_order`); WARN 64 authenticated-callable definers (catalog at 00:41 UTC: 60); WARN leaked-password protection disabled; INFO 4 RLS-enabled-no-policy.

**Performance:** 112 unindexed foreign keys; 43 `auth_rls_initplan` (per-row `auth.*()` re-evaluation); 190 unused indexes; 57 multiple-permissive-policy overlaps; 1 duplicate index (`iraq_district_areas`). Full JSON: `advisors-performance.json`.

## Migration drift (summary — detail in `migration-drift.md`)

- Live history: 343 versions at 00:41 UTC (341 at the first snapshot; +`20261019100000`, +`20261019100100`, see below). Repo: 262 files with 14-digit versions (258 distinct) + 20 non-timestamped files.
- Version numbers diverge almost entirely (278 live-only at the 00:41 UTC re-snapshot against `6bde0f4` — 276 + the two PR #146 versions, which are on `origin/main` — and 193 repo-only), because most repo files were applied through MCP and got a new live version. Name-level reconciliation is an A4 task.
- **Repo-only and probably not applied:** `20261012120000_search_orders_v2.sql`, `20261014120000_v_orders_with_risk_contact_columns.sql` — verify the app does not already depend on them (A4).
- **Live-only Iraq-location migrations (2026-09-16 → 2026-10-03, ~80)** have no repo file on `main`. That area belongs to the "Iraq locations cleanup" thread (branch `feat/notifications-overhaul`) — treated as data only.
