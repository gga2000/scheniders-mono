# FINDINGS

Schema: §9 of the program brief. Severity P0–P3. Status CONFIRMED (evidence in code or live DB) or HYPOTHESIS (reasoning only).

**Basis (Phase 2 Tier A, 2026-10-20):** code `origin/main` @ **0032320** (all `file:line` at that commit); DB `sduvpgqwhxragxtxztur`, SELECT on catalog tables only (`pg_proc`, `pg_policies`, `pg_class`, `pg_constraint`, `information_schema.routine_privileges`, storage); aggregates only, no PII. Lenses: isolation, AuthN/AuthZ, money & order integrity. Skills: `security-review`, `supabase-postgres-best-practices`.

**Tier A (A1–A3) totals after critic round 1:** 1 P0 · 3 P1 · 7 P2 · 10 P3 (F-001 raised to P0, F-003 lowered to P2, F-019..F-021 added). F-014 is HYPOTHESIS, the rest CONFIRMED. Critic round 1: `critic/phase2-tierA-round1.md`.

**Tracked elsewhere, referenced not re-filed** (fix branches in progress for most): NEW-P1-06 / NEW-P1-07 (P0) Interakt `[tenantId]` and LightFunnels webhooks default to `monitor`; the 1 live Interakt integration has no `webhook_secret` (fix PR #167) · NEW-P1-09 deactivate is a silent no-op and users can re-activate themselves (fix PR #168; critic N-1) · NEW-P1-01 `charge_wallet_atomic` negative amount (re-confirmed live) · NEW-P1-02 any member UPDATE on `tenants` · NEW-P1-03 `apply_store_config_v2_patch` membership-only (incl. `custom_css`) · NEW-P1-04 `product-images` / `qc-evidence` buckets · NEW-P1-05 generate-batch-pdf SSRF · NEW-P1-08 Telegram secret (3 `telegram_employee_link` rows live) · NEW-P1-13 delivery-import NULL tenant · NEW-P1-14 waseet-sync header · NEW-P1-16 `performance_bonuses` · NEW-P1-17 `webhooks/interakt/route.ts` ~282/~292 insert `whatsapp_logs` / `order_status_history` without `tenant_id` · NEW-P1-19 process-checkouts-manual · NEW-P1-20 `payroll-pdfs` trusts global `role='admin'` · NEW-P1-24 VIEW_FINANCIALS + orders/products policies · NEW-P1-30 admin billing/topup · NEW-P1-32 domains/verify · B-08/F-24 `tenant-assets` SVG · L-15/B-03 JWT-claim policies on `bom_items`, `product_categories` (claim unforgeable → deny-all in practice).

---

## F-001 — Any tenant member can rewrite another tenant's stock through SECURITY DEFINER inventory functions
- **Severity:** **P0** (raised from P1 by critic round 1: cross-tenant write reachable by anyone, since signup is open) · **Tier/Lens:** A1 / A3 (supabase-postgres-best-practices, security-review) · **Status:** CONFIRMED (live function source + grants)
- **Critic correction:** `process_return` skips `qty <= 0`, so negative quantities do not work there; the negative-quantity path is `inv_apply` (`IF v_qty = 0 THEN CONTINUE`), where a negative `quantity` on FULFILLED adds stock. The `open_box` destination also inflates the victim's `open_box_quantity`. Attacker = anyone: `apps/platform/app/api/auth/signup/route.ts:41-143` is unauthenticated with `email_confirm:true` and no rate limit (fixed in PR #167, which does not fix F-001).
- **Location:** `public.process_return` (DEFINER, `authenticated` EXECUTE); `public.undo_return` (DEFINER, `authenticated` EXECUTE); `public.inv_apply` (DEFINER, called by trigger fn `public.inv_order_changed` on `public.orders` INSERT/UPDATE/DELETE). Reachable via (1) direct PostgREST INSERT/UPDATE on `orders` (policy checks only `tenant_id IN get_user_tenant_ids()`), (2) `create_order_atomic` (both overloads), (3) `apps/platform/app/actions/orders.ts` `createOrderAction` (:52–69) → `apps/platform/lib/order-service.ts` `createOrderForTenant`, which never checks `items[].product_id` belongs to the tenant.
- **Evidence:** `process_return(_tenant_id, _order_id, _destinations jsonb, …)` checks only caller membership of `_tenant_id` and that `_order_id` belongs to it, then runs `UPDATE public.products SET stock_quantity = GREATEST(0, stock_quantity - qty) WHERE id = pid` (same on `product_variants` `WHERE id = vid`, and for `open_box_quantity`); `pid`/`vid`/`qty` come from caller jsonb with no `AND tenant_id = _tenant_id`. `undo_return` reverses ledger rows `WHERE id = r.product_id`, no tenant predicate. `inv_apply` updates `reserved_quantity`, `stock_quantity`, `open_box_quantity` `WHERE id = v_pid` where `v_pid` comes from `orders.items[*].product_id`, never checked against `NEW.tenant_id`. Victim product UUIDs are public via anon policy `public_storefront_read_products`. Contrast: `recompute_inventory`, `zero_oversold` filter on `tenant_id` (clean).
- **Impact:** any self-signup tenant can zero or inflate any other tenant's stock and reservations (negative `quantity` via `inv_apply` adds stock): victim storefront shows sold out, or oversells.
- **Repro (read-only):** `select pg_get_functiondef('public.process_return'::regproc)`; `select grantee from information_schema.routine_privileges where routine_schema='public' and routine_name in ('process_return','undo_return')` → includes `authenticated`; `pg_get_functiondef('public.inv_apply'::regproc)` → `WHERE id = v_pid`. Attack shape (not executed): `rpc('process_return', {_tenant_id: own, _order_id: own_order, _destinations: [{product_id: '<victim>', qty: 9999}]})`, or insert an `orders` row whose `items` reference victim product ids.
- **Fix sketch:** add `AND tenant_id = _tenant_id` to every products/variants UPDATE in `process_return`, `undo_return`; `inv_apply` uses the order's `tenant_id`; reject `qty <= 0`; validate every `items[].product_id` / `variant_id` belongs to the tenant in `create_order_atomic` and `createOrderForTenant`. Longer term composite FKs `(tenant_id, product_id)`.
- **Fix:** PR #173 (draft), migrations 20261020150000 + 150100; live violations 0 of 41,462 order items.
- **Related:** NEW-P1-24, L-13.

## F-002 — Another tenant can plant child rows on a victim's product; they render on the victim's storefront
- **Severity:** P1 · **Tier/Lens:** A / Isolation (supabase-postgres-best-practices) · **Status:** CONFIRMED (live policies, FKs, triggers + storefront code)
- **Location:** tables `product_images`, `product_variants`, `product_bundle_items`, `product_related`, `product_order_bumps`, `product_tiered_pricing`. Storefront reads `apps/storefront/lib/queries.ts:313` (`getProductImages`: `.from("product_images").select("image_url, display_order").eq("product_id", productId)`) and `:328` (`getProductVariants`, by `product_id` only).
- **Evidence:** each table's INSERT WITH CHECK is only `tenant_id IN get_user_tenant_ids()` (row's own tenant); FKs reference `products(id)`, not `(tenant_id, id)`; the only tenant-consistency guard trigger on a product child table is `tg_product_attribute_values_tenant_guard` (covers `product_attribute_values` only). Public read policies `public_storefront_read_product_images` / `public_storefront_read_product_variants` use `EXISTS (select 1 from products p where p.id = product_id)`; the bundle/related/order-bump/tiered-pricing read policies check product visibility only, not tenant match.
- **Impact:** attacker inserts `product_images` with own `tenant_id` and a victim `product_id` → images render on victim's product page (defacement/phishing). Same for variants, bundles, related, order bumps, tiered prices. Checkout rejects foreign variants (`apps/storefront/app/actions/checkout.ts` ~178–182 `.eq("tenant_id", payload.tenantId)`), so display integrity, not price bypass.
- **Repro (read-only):** `select policyname, with_check from pg_policies where tablename='product_images' and cmd='INSERT'`; `select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.product_images'::regclass and contype='f'` → `FOREIGN KEY (product_id) REFERENCES products(id)`; repeat for the other five tables.
- **Fix sketch:** BEFORE INSERT/UPDATE tenant guard trigger on all six (modelled on `tg_product_attribute_values_tenant_guard`) or composite FKs; add `.eq("tenant_id", tenantId)` to storefront child queries.
- **Critic addition:** `public_storefront_read_product_images/_variants` (`EXISTS(products p WHERE p.id=product_id)`) have no visibility or tenant-status filter, so anon can also read images and variants (incl. `cost`, F-009) of hidden, archived and supply products. **Refuted by the fix worker (PR #173):** the EXISTS sub-select is itself filtered by the `products` read policy, and the local before-run confirmed anon could not see hidden products' children.
- **Fix:** PR #173 (draft).
- **Related:** L-15.

## F-003 — A tenant admin can mint a login link for a platform super_admin through link-google
- **Severity:** **P2, latent** (lowered from P1 by critic round 1) · **Tier/Lens:** A2 (security-review) · **Status:** CONFIRMED (code); live precondition corrected
- **Critic correction:** all 6 active `admin_users` sit in one tenant whose only 2 tenant admins are the 2 super_admins themselves (the 4 support_staff are `member`s), so today only a super_admin can target the other. Invites cannot pull an existing user into another tenant (`lib/team-provisioning.ts:29-34` provisions only users without a profile); 0 users belong to more than one tenant. Remaining risk: takeover of members inside the same tenant, and it becomes P1 the moment a non-staff admin joins the staff tenant.
- **Location:** `apps/platform/app/api/team/link-google/start/route.ts:26-35` (caller must be active admin of their `current_tenant_id`), `:40-46` (target only needs to be an active member of the same tenant; neither tenant role nor global `user_profiles.role` checked), `:48-53` (token insert into `account_link_tokens`); `apps/platform/app/link-google/claim/route.ts:24-28` (token, `used_at`, `expires_at` checks), `:41` (`admin.auth.admin.generateLink({type:'magiclink', email: target})`), `:53` (`used_at` set after link generation, separate non-atomic UPDATE).
- **Evidence:** token holder receives a magic-link session as the target. Live: 2 `user_profiles` with `role='super_admin'`, both active members of a tenant with at least one other active admin. `account_link_tokens` has 0 rows (flow not yet exercised).
- **Impact:** tenant admin → takeover of a platform super_admin (every tenant, platform-admin routes, `topUpWalletAction`). Non-atomic consume allows parallel replay.
- **Repro (read-only):** `select count(*) from user_profiles where role='super_admin'` → 2; join `tenant_members` (status='active') counting other admins in the same tenant → ≥1.
- **Fix sketch:** restrict to `targetUserId = caller`, or send the link only to the target's own email; refuse `super_admin` / other-admin targets; consume atomically (`update … set used_at=now() where id=? and used_at is null returning *`).
- **Related:** L-08.

## F-004 — Anonymous callers can inject WhatsApp message content through abandoned carts
- **Severity:** P1, latent · **Tier/Lens:** A2 / A3 (security-review) · **Status:** CONFIRMED (code). Critic: cart recovery is enabled on 0 of 28 tenants (`resolveCartRecovery` defaults off), so nothing is sent today; the sender uses the platform-wide `env.INTERAKT_API_KEY`, so the platform sender's reputation is at risk, not the merchant's. Anon can still fill `abandoned_carts` for any tenant. Fix in progress (NEW-P1-12 / L-14 lead).
- **Location:** `apps/storefront/app/api/cart/abandoned/route.ts:12-64` (anon ingest); `apps/platform/lib/abandoned-cart-sender.ts:45-66` (template build); `apps/platform/app/api/cron/abandoned-cart-recovery/route.ts` (sender).
- **Evidence:** no auth; accepts any `tenant_id`, any phone, client item names (≤200 chars × 50) and prices; upserts on `(tenant_id, phone)` with service role. Sender places client item names into template `bodyValues` `{{2}}`.
- **Impact:** anyone can make any merchant's WhatsApp sender deliver attacker text (phishing links) to arbitrary numbers; merchant pays and loses sender reputation.
- **Repro:** reasoning only. Live `abandoned_carts` = 0 rows; recovery enablement per tenant not checked.
- **Fix sketch:** bind cart to a server-created checkout session; look item names up from `products` server-side; verify phone; rate-limit.
- **Related:** NEW-P1-12, L-14.

## F-005 — Twelve admin-app API routes rely on middleware alone, so support_staff can run super_admin-only actions
- **Severity:** P1 · **Tier/Lens:** A / AuthZ + Money (security-review) · **Status:** CONFIRMED (none call `requireAdmin*`; live role counts)
- **Location (every route with no in-route guard):**
  1. `apps/admin/app/api/billing/topup/route.ts` (fix in progress, NEW-P1-30)
  2. `apps/admin/app/api/merchants/[id]/extend-subscription/route.ts` (sets `current_period_end`, `status='active'`, no charge, no `logAdminActivity`)
  3. `apps/admin/app/api/merchants/[id]/convert-trial/route.ts`
  4. `apps/admin/app/api/merchants/[id]/extend-trial/route.ts`
  5. `apps/admin/app/api/merchants/[id]/pause/route.ts`
  6. `apps/admin/app/api/merchants/[id]/unpause/route.ts`
  7. `apps/admin/app/api/merchants/[id]/tags/route.ts`
  8. `apps/admin/app/api/merchants/[id]/notes/route.ts`
  9. `apps/admin/app/api/merchants/[id]/orders/route.ts` (also selects non-existent columns → fails at runtime)
  10. `apps/admin/app/api/merchants/[id]/audit-log/route.ts`
  11. `apps/admin/app/api/admin/watchlist/[tenantId]/route.ts`
  12. `apps/admin/app/api/dashboard/stats/route.ts`
- **Evidence:** `apps/admin/middleware.ts` admits any active `admin_users` row (`super_admin` or `support_staff`); `apps/admin/lib/admin-permissions.ts` reserves billing/subscription permissions for `super_admin` but these handlers never consult it; every sibling route calls `requireAdmin` / `requireAdminFromRequest` / `requireAdminPermission`. Live: 4 active `support_staff`, 2 `super_admin`. Middleware matcher excludes static-suffix paths; only `watchlist/[tenantId]` ends in a dynamic segment and `x.png` fails the uuid cast, so a bypass variant is at most P3 HYPOTHESIS.
- **Impact:** support staff can grant free subscription periods (revenue loss), convert/extend trials, pause/unpause merchants, with no audit trail; no defence in depth if middleware ever skips a path.
- **Repro (read-only):** `for f in $(find apps/admin/app/api -name route.ts); do grep -q requireAdmin $f || echo $f; done` → exactly these 12 + `apps/admin/app/api/auth/callback/route.ts` (expected unguarded); `select admin_role, count(*) from admin_users where is_active group by 1` (critic: the column is `admin_role`, not `role`).
- **Fix sketch:** `requireAdminPermission(request, '<perm>')` in every handler; super_admin-only perms for extend-subscription, convert-trial, extend-trial, pause, unpause, topup; `logAdminActivity` on every mutation.
- **Critic addition:** `billing/topup` does a non-atomic read-modify-write (lost update under concurrency), and its Zod schema accepts non-integer IQD.
- **Related:** L-12, D-13, NEW-P1-30.

## F-006 — `settings/staff-alert` has no membership or role check
- **Severity:** P2 · **Tier/Lens:** A / AuthZ (security-review) · **Status:** CONFIRMED (code)
- **Location:** `apps/platform/app/api/settings/staff-alert/route.ts:28-31` (tenant from `user_profiles.current_tenant_id`, no `tenant_members` lookup); handlers GET :67, PUT :77, POST :118, DELETE :147, all service-role writes.
- **Evidence:** any authenticated user passes, including viewer, employee, and removed member (`current_tenant_id` survives removal; the `user_profiles` UPDATE policy pins it to own tenants but a stale value remains).
- **Impact:** read and replace the tenant's staff new-order WhatsApp alert numbers → new-order alerts (customer phone, address) redirected to the attacker.
- **Fix sketch:** `requireRequestCaller(request, "tenant-admin")`. **Related:** L-10.

## F-007 — Order and pipeline gates check the global `user_profiles.role` instead of the tenant role
- **Severity:** P2 · **Tier/Lens:** A / AuthZ (security-review) · **Status:** CONFIRMED (code)
- **Evidence:** `apps/platform/lib/auth/resolve-active-tenant.ts:5-10` documents `role` = global `user_profiles.role`, `memberRole` = tenant role; `:39` `const role = profile?.role ?? ""`. Signup gives every new user global `admin`, so a user who owns a tenant and is invited elsewhere as `viewer`/`employee` passes these gates there.
- **Location (every site):**
  1. `apps/platform/app/api/orders/delete/route.ts:57` (`DELETE_ALLOWED_ROLES.includes(active.role)`)
  2. `apps/platform/app/actions/orders.ts:27` `ORDER_WRITE_ROLES`; `resolveCaller` :29-42 returns `active.role`, checked in `createOrderAction` :69, `splitOrderAction` :90, `unsplitOrderAction` :185
  3. `apps/platform/app/api/settings/order-pipeline/route.ts:29-36` (reads `current_tenant_id, role` with no membership check; gate `isAdminRole(r.caller.role)` :67)
  4. `apps/platform/app/api/waseet/submit-orders/route.ts:59-75` (global role :68 + `current_tenant_id` :75, no membership check; unused in prod, L-05)
  - Related site with `current_tenant_id` and no membership check: `apps/platform/app/api/chat/push/subscribe/route.ts:47-51`. (`team/invite` :32-37 and `team/link-google/start` :26-35 re-check membership — fine.)
- **Impact:** tenant viewers/employees can delete, create, split, unsplit orders and change the order-pipeline config; removed members can still act on their former tenant via order-pipeline and submit-orders.
- **Fix sketch:** gate on `active.memberRole`, platform admin as an explicit separate path; `requireRequestCaller(…, "tenant-admin")` for order-pipeline and staff routes. **Related:** L-10.

## F-008 — Removed or deactivated staff keep chat access
- **Severity:** P2 · **Tier/Lens:** A / Isolation (supabase-postgres-best-practices) · **Status:** CONFIRMED (live policies, function source, live count)
- **Location:** `public.chat_is_member(conv)` (DEFINER) checks `chat_members` only. Used by policies: `chat_conversations` read; `chat_messages` `chat_messages_member_read`; `chat_members` `chat_members_read`; policies on `chat_message_attachments`, `chat_message_mentions`, `chat_message_references`, `chat_message_reactions`, `chat_message_edits`, `chat_pins`; `realtime.messages` `chat_realtime_conv_read`, `chat_realtime_conv_write`. RPCs guarded only by it: `chat_search_messages`, `chat_set_conversation_resolved`, `chat_delete_conversation`, `chat_leave_conversation`, `chat_mark_read`.
- **Evidence:** none join `tenant_members` with `status='active'`, and none check `user_profiles.is_active`; removal/suspension does not delete `chat_members` rows. Live (critic-corrected): the 1 deactivated user (`is_active=false`) keeps 2 `chat_members` rows; the repro below now returns 0.
- **Impact:** ex-employees keep reading history (order/customer details), searching, receiving realtime broadcasts.
- **Repro (read-only):** `select count(*) from chat_members cm join chat_conversations c on c.id=cm.conversation_id where not exists (select 1 from tenant_members tm where tm.user_id=cm.user_id and tm.tenant_id=c.tenant_id and tm.status='active')` → 0 (critic round 1); `… join user_profiles up on up.id=cm.user_id where up.is_active=false` → 2.
- **Fix sketch:** `chat_is_member` also requires an active `tenant_members` row for the conversation's tenant; delete `chat_members` on removal/suspension.

## F-009 — anon can read `product_variants.cost`
- **Severity:** P2 · **Tier/Lens:** A / Isolation + Money (supabase-postgres-best-practices) · **Status:** CONFIRMED (column grants + policy); latent — 0 variants have non-null `cost`.
- **Location/Evidence:** `product_variants`, policy `public_storefront_read_product_variants`, column SELECT grant to `anon` includes `cost`, `reserved_quantity`, `stock_quantity`; `products.cost` is deliberately excluded from anon (inconsistent).
- **Impact:** once variant costs are recorded, competitors read unit cost and margin.
- **Repro:** `select column_name from information_schema.column_privileges where table_name='product_variants' and grantee='anon' and privilege_type='SELECT'` includes `cost`.
- **Fix sketch:** `revoke select (cost) on public.product_variants from anon`; review the other exposed columns.

## F-010 — anon can read discount codes from `tenants.store_config_v2`
- **Severity:** P2 · **Tier/Lens:** A / Money (security-review) · **Status:** CONFIRMED (grants + code). Live: 1 tenant, 1 code.
- **Location:** anon SELECT on `tenants.store_config_v2` exposes `commerce.discounts[]`; `apps/storefront/lib/tenant.ts` ~83–98 `redactTenant` strips only pixel tokens; `packages/shared/src/discount.ts:38-70` `computeDiscount` has no usage or per-customer limit.
- **Impact:** private/influencer codes enumerable by anyone, unlimited use.
- **Repro:** `select count(*) from tenants where jsonb_array_length(coalesce(store_config_v2->'commerce'->'discounts','[]'))>0` → 1; column is in the anon grant.
- **Fix sketch:** move discounts to an RLS table; validate codes server-side; usage counters. **Related:** L-40.

## F-011 — Loyalty points earned at order placement and never reversed
- **Severity:** P2 · **Tier/Lens:** A / Money (security-review) · **Status:** CONFIRMED (code + trigger source). Fix in progress (submitCheckout lead). Live: loyalty enabled on 0 tenants.
- **Location:** `apps/storefront/app/actions/checkout.ts` ~391–402 (`earn` row at creation), ~282–310 (redeem by phone only); trigger fn `public.loyalty_order_changed` reverses only delivered → not-delivered.
- **Impact:** points on cancelled/undelivered orders kept; same-key retry earns again; anyone with a customer's phone redeems their points.
- **Fix sketch:** earn on delivered transition, idempotent per order; OTP/verification before redemption. **Related:** L-13.

## F-012 — `store_*` and `order_reasons` policies ignore membership status and role
- **Severity:** P3 · **Tier/Lens:** A / AuthZ (supabase-postgres-best-practices) · **Status:** CONFIRMED (live policies); latent — 23 members, all `active`.
- **Location (every policy):** `store_config_experiment_events`; `store_config_schedules` (ALL); `store_config_versions` (INSERT); `store_performance_audits`; `store_section_presets` (4 policies); `store_visual_baselines`; `order_reasons` (SELECT).
- **Evidence:** all use `tenant_id IN (select tenant_id from tenant_members where user_id = auth.uid())` without `status='active'` (enum `{pending, active, suspended}`); writes to schedules, presets, versions not admin-limited.
- **Impact:** suspended/pending members keep access; any member can schedule store-config publishes, bypassing admin-only `publish_store_config_v2`.
- **Fix sketch:** use `get_user_tenant_ids()`; `is_tenant_admin(tenant_id)` for writes.

## F-013 — Three tables readable by every authenticated user
- **Severity:** P3 · **Tier/Lens:** A / Isolation (supabase-postgres-best-practices) · **Status:** CONFIRMED (live policies)
- **Location/Evidence:** (1) `user_permissions` SELECT policy `auth.role()='authenticated'` → every tenant's overrides visible (0 rows today); (2) `system_health_checks` readable by any authenticated (1 row); (3) `inventory_ledger` policy `inventory_ledger_read` shows `tenant_id IS NULL` rows to everyone (2 rows) and scopes via `get_current_tenant_id()` (profile pointer) instead of `get_user_tenant_ids()`.
- **Fix sketch:** scope `user_permissions` to tenant/self; `system_health_checks` platform-admin only; drop the NULL branch and use `get_user_tenant_ids()`.

## F-014 — Cron routes accept `x-vercel-cron`, or compare against a possibly unset secret
- **Severity:** P3 · **Tier/Lens:** A / AuthN (security-review) · **Status:** HYPOTHESIS — exploitability depends on whether Vercel strips inbound `x-vercel-cron` from external callers (not verified).
- **Location (every site):** (1) `apps/platform/app/api/cron/waseet-sync/route.ts:22-27` header accepted (fix in progress, NEW-P1-14); (2) `apps/platform/app/api/cron/auto-no-response/route.ts:31-38` header accepted (its RPC `auto_move_to_no_response` doesn't exist, so the route is inert); (3) `apps/platform/app/api/cron/waseet-locations/route.ts:21-23` header accepted — **no COVERAGE row existed; added as row 645**; (4) `apps/platform/app/api/cron/subscription-renew/route.ts:30-33` raw compare to `` `Bearer ${process.env.CRON_SECRET}` `` ("Bearer undefined" passes if unset; fix in progress); (5) `apps/platform/app/api/cron/trial-suspend/route.ts:17-20` same raw compare.
- **Fix sketch:** `requireCronAuth` (`apps/platform/lib/cron-auth.ts`, fails closed) in all five. PR #167 does this.

## F-015 — Open redirect in platform `auth/callback`
- **Severity:** P3 · **Tier/Lens:** A / AuthN (security-review) · **Status:** CONFIRMED (code)
- **Location:** `apps/platform/app/api/auth/callback/route.ts:17-20` `` NextResponse.redirect(`${origin}${next}`) `` with `next` from the query.
- **Evidence:** `next=@evil.com` → `https://<host>@evil.com` → browser host `evil.com`; fires only after a successful code exchange.
- **Impact:** phishing redirect off the real login domain right after sign-in.
- **Fix sketch:** require `next` to start with `/` but not `//` or `/\`; build with `new URL(next, origin)` and assert same origin. **Related:** L-09.

## F-016 — 16-character HTML injection into server-side Chromium in payslip-pdf
- **Severity:** P3 · **Tier/Lens:** A / AuthZ (security-review) · **Status:** CONFIRMED (code)
- **Location:** `apps/platform/app/api/payslip-pdf/route.ts` (any authenticated user, client-supplied record); `apps/platform/lib/payslip-html.ts:132` `ref = record.id.slice(0,16)` interpolated unescaped at ~:442 and ~:519.
- **Impact:** `<img src=//x.co>` fits in 16 chars → blind server-side request (SSRF beacon/probe). Other fields are escaped. Route also renders arbitrary payslip content without checking payroll rights.
- **Fix sketch:** escape `ref`, require UUID `record.id`; load the record server-side scoped to tenant + payroll role. **Related:** NEW-P1-05.

## F-017 — Storefront abuse and enumeration paths with no rate limit
- **Severity:** P3 · **Tier/Lens:** A / AuthN (security-review) · **Status:** CONFIRMED (no limiter call in any handler)
- **Location (every site):** (1) `apps/storefront/app/api/loyalty/balance/route.ts` anon balance by phone; (2) `apps/storefront/app/api/orders/lookup/route.ts` → RPC `lookup_order` (DEFINER, anon EXECUTE), number + phone brute-forceable; (3) `apps/storefront/app/api/reviews/route.ts` photos into public `review-photos` before moderation; (4) `apps/storefront/app/api/exp-event/route.ts` event spam skews A/B (`aggregate_experiment_stats`); (5) `apps/platform/app/actions/orders.ts` `checkOrderIdExists` global cross-tenant existence oracle.
- **Fix sketch:** rate limits keyed by IP and phone (reuse the Postgres limiter from PR #167); private holding bucket for review photos; scope `checkOrderIdExists` to the caller's tenant.

## F-018 — `calculate_customer_trust` updates whichever tenant it picks
- **Severity:** P3 · **Tier/Lens:** A / Isolation (supabase-postgres-best-practices) · **Status:** CONFIRMED (live function source)
- **Location:** `public.calculate_customer_trust(phone)` (INVOKER, EXECUTE to anon + authenticated; called by `trigger_update_trust_on_*` triggers).
- **Evidence:** takes `tenant_id` from any order matching the phone (`LIMIT 1`, no ORDER BY, no tenant argument).
- **Impact:** for a phone used across tenants, trust is computed/written under the wrong tenant. INVOKER + RLS limits direct callers, so integrity not confidentiality.
- **Fix sketch:** take `_tenant_id` and filter every query on it.

## F-019 — Open redirect in admin-app `auth/callback`
- **Severity:** P3 · **Tier/Lens:** A2 (security-review) · **Status:** CONFIRMED (code; critic round 1)
- **Location:** `apps/admin/app/api/auth/callback/route.ts` redirects to `${origin}${next}` with `next` from the query, the same shape as F-015.
- **Impact:** phishing redirect off the admin login domain right after sign-in.
- **Fix sketch:** same as F-015 (shared same-origin `next` validator). **Related:** F-015, L-09.

## F-020 — Returns pairing realtime channel is public and its token never rotates
- **Severity:** P3 · **Tier/Lens:** A1 (supabase-postgres-best-practices) · **Status:** CONFIRMED (code; critic round 1)
- **Location:** `apps/platform/hooks/use-returns-session.ts:23-28,42-45,71`; `apps/platform/app/returns/scan/page.tsx:29`. Channel `returns:${token}` is a non-private broadcast + presence channel; the 64-bit token is persisted in localStorage and never rotated.
- **Impact:** anyone who once saw the QR or URL can later read `ack` payloads (customer names) and inject `scan` events into the merchant's returns session.
- **Fix sketch:** `private: true` channel with a `realtime.messages` policy bound to tenant membership; rotate the token per session. COVERAGE rows 597, 598.

## F-021 — Interakt `[tenantId]` webhook writes `whatsapp_logs` without `tenant_id`
- **Severity:** P3 · **Tier/Lens:** A1 / A9 · **Status:** CONFIRMED (code; critic round 1)
- **Location:** `apps/platform/app/api/webhooks/interakt/[tenantId]/route.ts` ~:207 inserts into `whatsapp_logs` without `tenant_id` (column nullable). NEW-P1-17 covers only the non-tenant route.
- **Impact:** those log rows are invisible to the tenant (RLS) and unattributable.
- **Fix sketch:** set `tenant_id` from the resolved integration; make the column NOT NULL after backfill. **Related:** NEW-P1-17.

---
### Supplementary HYPOTHESIS (not filed)
`create_order_atomic(jsonb)` called by the service role with `_tenant_id` NULL would make the idempotency lookup cross-tenant and insert a NULL-tenant order. Not verified whether any caller passes NULL. Routed to the submitCheckout fix.
