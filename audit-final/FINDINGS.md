# FINDINGS

Schema: §9 of the program brief. Severity P0–P3. Status CONFIRMED (evidence in code or live DB) or HYPOTHESIS (reasoning only).

**Basis (Phase 2 Tier A, 2026-10-20):** code `origin/main` @ **0032320** (all `file:line` at that commit); DB `sduvpgqwhxragxtxztur`, SELECT on catalog tables only (`pg_proc`, `pg_policies`, `pg_class`, `pg_constraint`, `information_schema.routine_privileges`, storage); aggregates only, no PII. Lenses: isolation, AuthN/AuthZ, money & order integrity. Skills: `security-review`, `supabase-postgres-best-practices`.

**Tier A (A1–A3) totals after critic round 1:** 1 P0 · 3 P1 · 7 P2 · 10 P3 (F-001 raised to P0, F-003 lowered to P2, F-019..F-021 added). **A4–A10 (F-022..F-039, critic pending):** 0 P0 · 2 P1 · 9 P2 · 7 P3; F-037 HYPOTHESIS. F-014 is HYPOTHESIS, the rest CONFIRMED. Critic round 1: `critic/phase2-tierA-round1.md`.

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
# Tier A, lenses A4–A10 (code @ 0032320; DB SELECT/EXPLAIN 2026-10-20 12:47–13:00 UTC; Vercel MCP down, env names from the 2026-10-19 snapshot)

## F-022 — Supabase org is on the Free plan: DB goes read-only at 500 MB (≈11 days at launch volume), storage fills ≈2026-11-18, no backups
- **Severity:** P1 now; P0 (launch-blocking outage) if launched on this plan · **Tier/Lens:** A8 / A9 · **Status:** CONFIRMED
- **Location:** Supabase org fbeujkhbxtwlfgzwypcp, project sduvpgqwhxragxtxztur.
- **Evidence:** `get_organization` → plan "free". Free limits (Supabase docs): 500 MB DB (then read-only, writes fail "cannot execute INSERT in a read-only transaction"), 1 GB storage, 5 GB egress, 200 peak Realtime connections, 2M Realtime messages, no backups. `pg_database_size` = 167,849,107 B (160 MB). Storage ≈412 MB of 1 GB: vault_backups 321 MB (48 objects, 3/day since 2026-10-05, ≈20 MB/day), product-images 79 MB (122), tenant-assets 10 MB (85), qc-evidence 1.2 MB (1), avatars 0.66 MB (5). Growth at launch volume (≈1,500 orders/day, CONTEXT §5.4): orders ≈1.1 KB × 1,500, order_status_history ≈0.19 KB × ≈5,200, whatsapp_logs ≈2.4 KB × ≈4,350, notifications ≈2.8 KB × ≈6,300 per day ≈ 31 MB/day → remaining 340 MB used in ≈11 days. Notifications are never pruned: pg_cron `prune-order-notifications` failed 7/7 runs in 7 days ("relation public.chat_notifications does not exist", P-0.4). Storage: (1 GB − 412 MB) / 20 MB/day ≈ 29 days ≈ 2026-11-18.
- **Impact:** read-only DB fails every order insert, status change, webhook and cron write for all tenants; full storage fails image uploads and backups; Realtime caps at 200 sockets (≈400 staff devices at 10x); the only backup is the in-bucket JSON dump (DR-1).
- **Repro (read-only):** `select pg_database_size(current_database());` · `select bucket_id, sum((metadata->>'size')::bigint) from storage.objects group by 1;` · get_organization.
- **Fix sketch:** move to Pro (8 GB DB, daily backups, PITR add-on) before launch; fix P-0.4; vault_backups retention (DR-1); disk/connection alerts.
- **Related:** DR-1, P-0.4, NEW-53, DATA-07, REL-C/D/E/F.

## F-023 — Platform and admin Supabase clients are untyped, and generated types are 34 days stale, so calls to absent tables, columns and RPCs pass type-check
- **Severity:** P2 · **Tier/Lens:** A7 / A4 · **Status:** CONFIRMED
- **Location:** untyped clients `apps/platform/lib/supabase.ts:67`, `apps/platform/lib/supabase-server.ts:17,51,76`, `apps/admin/hooks/use-admin-auth.ts:76,102` (`<any>`); only storefront `lib/supabase/server.ts:20,49,71` passes `<Database>`. `packages/supabase/src/database.types.ts` last changed c2990f0a (2026-09-16).
- **Evidence:** live 166 tables / 1,641 columns vs types 152 / 1,519. Missing tables (14): iraq_district_areas, iraq_districts, iraq_governorates, iraq_location_aliases, iraq_location_carrier_refs, iraq_location_reviews, iraq_locations, iraq_postal_codes, waseet_cities, waseet_districts, waseet_gazetteer, waseet_region_overrides, waseet_region_review, waseet_regions. Missing columns (4): products.brand, display_name, gender, size_ml. 0 columns in the types absent live. Code calls to objects absent live: `activity_log` read `apps/platform/lib/customer-data-export.ts:97-102` (error ignored) and insert `:243` (unchecked; requestDeletion returns "deletion request logged" `:243-262`, so customer deletion requests are silently lost); `customers` `apps/platform/hooks/use-bulk-actions.ts:26`; `order_items` + `orders.total_amount` `apps/platform/hooks/use-store-analytics.ts:20-37` (F-030); `wallets` + RPC `increment_wallet_balance` `apps/admin/app/api/bulk/route.ts:172-197` (F-032); RPC `auto_move_to_no_response` `apps/platform/app/api/cron/auto-no-response/route.ts:46`; RPC `search_orders_v2` `apps/platform/lib/repositories/order-repository.ts:470`; RPCs `merge_categories` / `split_category` `apps/platform/hooks/use-categories-query.ts:263,288` (`as never`, no callers, dead); `exec_sql` (scripts only). `ignoreBuildErrors: true` at `apps/platform/next.config.ts:45-47`.
- **Impact:** silent zeros, lost deletion requests and failing crons that the CI gate cannot catch.
- **Repro:** diff `information_schema.tables` (public) against `Tables:` keys; grep `.from('` / `.rpc('` names.
- **Fix sketch:** `pnpm generate-types`; `<Database>` on every client; CI type-drift step; delete dead category hooks; repoint or remove calls to missing objects.
- **Related:** L-35, L-39, REL-C/D/E/F, F-030, F-032.

## F-024 — Two more live-only migrations applied from the dashboard after Phase 1, with no file in any branch
- **Severity:** P2 · **Tier/Lens:** A4 · **Status:** CONFIRMED
- **Location:** live `supabase_migrations.schema_migrations`.
- **Evidence:** `20261019132424 backfill_followup_attribution_oct` (2,899-char UPDATE on orders, 31.7 s, pg_stat_statements "-- apply sql from post body"); `20261019133102 products_gender` (adds `products.gender text`, CHECK `products_gender_chk` men/women/unisex, `GRANT SELECT (gender) ON public.products TO anon`, `NOTIFY pgrst`). Applied by a dashboard user; `git log --all -S` finds neither. Drift overall: live 349 entries; repo live-history 341 SQL files; migrations/ 328 timestamped + 20 non-standard.
- **Impact:** a rebuild from the repo lacks products.gender and its anon grant; the backfill cannot be audited or reproduced.
- **Repro:** list_migrations; grep both versions under `packages/supabase/`.
- **Fix sketch:** commit both files with the same versions; migrations only via repo/CLI.
- **Related:** NEW-P1-11, REL-B, NEW-P1-21.

## F-025 — No index on `whatsapp_logs.interakt_message_id`: every Interakt delivery receipt seq-scans the largest growing table
- **Severity:** P1 (grows into receipt-path timeouts; P2 today) · **Tier/Lens:** A8 · **Status:** CONFIRMED
- **Location:** `apps/platform/lib/whatsapp-delivery-receipts.ts:89`; whatsapp_logs indexes: pkey, order_uuid, tenant_id only.
- **Evidence:** `EXPLAIN ANALYZE … where interakt_message_id='x'` → Seq Scan 10,235 rows, 293 buffers, 266 ms; pg_stat_statements 652 calls, mean 94 ms. No created_at index.
- **Impact:** ≈3 receipts/message, ≈4,350 messages/day → ≈1.6M rows (≈3.8 GB) at 12 months, ≈16M at 10x; per-receipt scans exceed the 8 s / 3 s role timeouts; message status goes stale.
- **Fix sketch:** `CREATE INDEX CONCURRENTLY` on `(interakt_message_id)` (unique where not null if semantics allow) and `(tenant_id, created_at desc)`.
- **Related:** PERF-05, D-39..41.

## F-026 — `v_orders_with_risk` joins the whole tenant book on `normalize_phone()` with no expression index
- **Severity:** P2 · **Tier/Lens:** A8 · **Status:** CONFIRMED
- **Location:** view joins `customer_trust` on `normalize_phone(COALESCE(o.phone,''))=normalize_phone(ct.phone) AND ct.tenant_id=o.tenant_id` with per-row `is_tenant_admin()` CASEs; readers `apps/platform/lib/repositories/order-repository.ts:510-577` (findById, findByOrderId, findByScanRef).
- **Evidence:** EXPLAIN ANALYZE top tenant, `is_archived=false order by created_at desc limit 1000`: 305 ms, joins all 5,175 orders, seq-scans customer_trust (4,395), merge joins on normalize_phone, sorts spill 7.4 MB + 4.4 MB (work_mem 2,184 kB). pg_stat_statements: 5,558 s total, mean ≈0.9–1.03 s, max 7–8 s, 24.1 GB + 11.7 GB temp written. authenticated statement_timeout 8 s.
- **Impact:** linear in tenant size; a 12-month tenant (≈110k orders) pushes mean reads past 8 s, so order detail, scan lookup and lists fail. Largest single DB-time consumer.
- **Fix sketch:** stored normalized phone on orders and customer_trust, index `(tenant_id, phone_norm)`; detail paths read the base table plus one trust row.
- **Related:** ORD-3 (list path, Partially fixed).

## F-027 — Full-table refresh crons are 24.5% of all DB time and O(total orders)
- **Severity:** P2 · **Tier/Lens:** A8 / A6 · **Status:** CONFIRMED
- **Location:** pg_cron `refresh-customer-aggregates` (REFRESH MATERIALIZED VIEW CONCURRENTLY mv_customer_aggregates, every 10 min) and `refresh-tenant-public-stats` (every 30 min).
- **Evidence:** pg_stat_statements over 22.6 days: refresh_customer_aggregates 3,254 calls, mean 1,744 ms, max 8,888 ms, 5,676 s, 33.9 GB temp; refresh_tenant_public_stats 1,085 calls, mean 985 ms, 1,068 s. Together 6,744 of 27,527 s. cron.job_run_details (7 d): 1,008 runs, avg 2.08 s, max 8.93 s, 1 "job startup timeout". 163k pg_attribute churn.
- **Impact:** at 10x × 12 months (≈5.5M orders) each refresh ≈400 s against a 600 s interval: overlap, lock and I/O contention in the evening peak.
- **Fix sketch:** incremental aggregates (trigger-maintained or per-tenant dirty set); per-tenant public stats on change; higher work_mem for the cron role.
- **Related:** CONTEXT §5.6 hypothesis 1, PERF-05.

## F-028 — The realtime heartbeat scans the whole tenant's orders every 30 s per tab
- **Severity:** P3 · **Tier/Lens:** A8 · **Status:** CONFIRMED
- **Location:** `apps/platform/hooks/use-realtime-heartbeat.ts:53-60`.
- **Evidence:** EXPLAIN ANALYZE top tenant: Index Scan idx_orders_tenant_id over 5,225 rows, 4,094 buffers, top-N sort, 44 ms; pg_stat_statements 10,782 calls, mean 191 ms, max 7.4 s. No `(tenant_id, is_archived, updated_at)` index.
- **Impact:** ≈1.3 calls/s base, 13/s at 10x, each linear in tenant size.
- **Fix sketch:** index `(tenant_id, updated_at desc) where is_archived=false`, or derive from channel state. **Related:** PERF-4.

## F-029 — Web push dead since 2026-10-11: zero subscriptions, UI says "subscribed", health check blind
- **Severity:** P2 · **Tier/Lens:** A5 / A9 · **Status:** CONFIRMED (symptom); root cause HYPOTHESIS
- **Location:** `apps/platform/hooks/chat/use-web-push.ts:84-91` (`subscribed` from `pushManager.getSubscription()` only); `supabase/functions/send-order-push/index.ts:364-368` prunes on 404/410.
- **Evidence:** chat_push_subscriptions 0 rows; notification_deliveries (14 d): 85 sent, 1 pruned, last 2026-10-11; net._http_response 17 rows, all 2026-10-11, all 200; notifications still created (109 on 10-12, 438 on 10-17, 8 on 10-19); system_health_checks notification_pipeline "ok" (counts rows, not deliveries).
- **Impact:** staff get no order/chat push, UI shows enabled, monitoring green.
- **Fix sketch:** reconcile browser subscription with server row on load (upsert if missing); delivery freshness in the health check. HYPOTHESIS cause: 410 prune with no resubscribe path, worsened by L-24.
- **Related:** L-24, L-37.

## F-030 — The /store KPI strip always shows 0 orders and 0 IQD revenue
- **Severity:** P2 · **Tier/Lens:** A9 / A3 · **Status:** CONFIRMED
- **Location:** `apps/platform/hooks/use-store-analytics.ts:20-24` (`orders.total_amount`, absent live), `:32-37` (`order_items`, absent), errors ignored; `components/store-command-center/kpi-strip.tsx:49-77`, mounted `app/store/page.tsx:66`.
- **Impact:** every merchant's store dashboard shows no orders and 0 IQD.
- **Repro:** `select count(*) from information_schema.columns where table_name='orders' and column_name='total_amount'` → 0.
- **Fix sketch:** real money column / aggregate RPC; surface errors. **Related:** F-023, L-35.

## F-031 — Any tenant member can read salaries, payroll, advances, penalties, expenses and the wallet; /salaries, /finances, /vault have no role gate
- **Severity:** P2 · **Tier/Lens:** A2 / A3 · **Status:** CONFIRMED
- **Location:** SELECT policies on payroll_records, employee_salary_configs, salary_advances, salary_penalties, expenses, performance_bonuses, role_salary_defaults, salary_config_history, wallet, wallet_transactions are `tenant_id IN get_user_tenant_ids()` only; authenticated column grant on base_monthly_salary, per_order_bonus. `apps/platform/components/providers/role-provider.tsx:7-17` ROUTE_PERMISSIONS omits /finances, /salaries, /vault, /store/**, /returns/scan, /sentry-test, /orders/trash. PageGuard `components/auth/role-guard.tsx:60-120` renders children while loading and uses the global role.
- **Evidence:** the one tenant with payroll data: 10 payroll_records, 4 salary configs, 4 expenses, 4 active `member` users (19 admin / 4 member overall); all members pass.
- **Impact:** staff read colleagues' salaries and penalties and the business's expenses and wallet.
- **Fix sketch:** `is_tenant_admin(tenant_id)` (or payroll permission) on SELECT; members read only their own payroll row; add missing routes with tenant roles.
- **Related:** SEC-03, D-19, L-11, F-007.

## F-032 — Admin bulk wallet top-up always fails and reports success
- **Severity:** P2 (latent money bug) · **Tier/Lens:** A3 · **Status:** CONFIRMED
- **Location:** `apps/admin/app/api/bulk/route.ts:172-176` (RPC `increment_wallet_balance`, absent), `:180-197` (fallback table `wallets`, absent; live is `wallet.balance_iqd`; errors → `continue`), `:260-271` (logs `bulk_top_up`, returns `{success:true}`); gated `:21` `requireAdminPermission('bulk_action')`.
- **Evidence:** 0 bulk_top_up logs, 0 top_up wallet_transactions live.
- **Impact:** super admin sees success, no balance changes; merchants hit wallet-empty suspension after "paying".
- **Fix sketch:** atomic DEFINER credit on `wallet` + `wallet_transactions`; per-tenant failures. **Related:** L-12, NEW-P1-30, F-005, F-023. **Fix:** PR #172 (single and bulk top-up via `admin_topup_wallet`).

## F-033 — generate-batch-pdf leaks a Chromium process on any error
- **Severity:** P2 · **Tier/Lens:** A5 · **Status:** CONFIRMED
- **Location:** `apps/platform/app/api/generate-batch-pdf/route.ts:53-92` (`browser.close()` only on success `:92`, no `finally`, catch `:102` does not close; maxDuration 60). Contrast payslip-pdf `route.ts:80-81` (finally).
- **Impact:** a failed render keeps Chromium alive on a warm instance; next batch print can OOM or time out.
- **Fix sketch:** try/finally `await browser?.close()`. **Related:** NEW-P1-05, L-07.

## F-034 — LightFunnels integration is single-tenant and wrote queue rows without a tenant
- **Severity:** P3 (P2 if a second tenant onboards) · **Tier/Lens:** A5 / A4 · **Status:** CONFIRMED
- **Location:** `apps/platform/app/api/webhooks/lightfunnels/route.ts:159` (tenant from `env.LIGHTFUNNELS_TENANT_ID`); `apps/platform/lib/lightfunnels-api.ts:1253-1290` (global token in `settings` key 'lightfunnels_access_token', 1 row tenant NULL, upsert onConflict 'key'); `route.ts:104-109` upserts checkout_queue without tenant_id; `cron/process-checkouts/route.ts:87` passes the env tenant.
- **Evidence:** checkout_queue 487 rows tenant NULL, every row since 2026-06-19 (to 10-14); 1,868 older rows have a tenant; checkout_id globally unique.
- **Impact:** only one merchant can use LightFunnels; a second would collide on checkout_id and the token.
- **Fix sketch:** per-tenant integration row mapping store → tenant; tenant_id NOT NULL; unique `(tenant_id, checkout_id)`; per-tenant tokens. **Related:** SEC-C (e), D-22, L-20. PR #172 stamps tenant_id on new queue rows (not the multi-tenant design).

## F-035 — No sweeper for checkout_queue: a failed QStash publish silently drops the checkout
- **Severity:** P3 · **Tier/Lens:** A6 · **Status:** CONFIRMED (code path; not observed live: 0 pending, 2,349 processed in 1 attempt)
- **Location:** `apps/platform/app/api/webhooks/lightfunnels/route.ts:125-134` (returns 200 when `scheduleCheckoutProcessing` is false); `apps/platform/lib/qstash.ts:71-94`; process-checkouts not in any of the 7 crons in `apps/platform/vercel.json`; processed_at update `:91-94` unchecked.
- **Impact:** a QStash outage loses orders permanently; LightFunnels does not retry after a 200.
- **Fix sketch:** sweep `processed_at is null and process_after < now()`; non-2xx when scheduling fails; check the update. **Related:** F-034.

## F-036 — Customer phone numbers are written to Vercel function logs
- **Severity:** P3 · **Tier/Lens:** A9 · **Status:** CONFIRMED
- **Location:** `apps/platform/lib/interakt.ts:331,496`; `apps/platform/app/api/webhooks/interakt/route.ts:250,423`; `apps/platform/lib/webhook-handler.ts:738`; `apps/platform/lib/staff-alerts.ts:124,128`.
- **Impact:** PII in third-party log retention, readable by anyone with Vercel access.
- **Fix sketch:** mask to last 4 digits via a `packages/shared` helper. **Related:** D-09.

## F-037 — Interakt sends can be duplicated: retries at two layers with no idempotency key
- **Severity:** P3 · **Tier/Lens:** A5 · **Status:** HYPOTHESIS
- **Location:** `apps/platform/lib/interakt.ts:66-67` (MAX_RETRIES=2, 1000 ms), `:336-419` (re-POST after network error even if delivered); `apps/platform/app/api/cron/auto-follow-up/route.ts:128-139` (500 on failure → QStash retries, `lib/qstash.ts:49` retries 2).
- **Impact:** up to ≈9 copies of a follow-up worst case; WhatsApp quality rating risk.
- **Fix sketch:** retry only definite pre-send failures; "sending" whatsapp_logs row keyed by (order, template, window) before sending. **Related:** F-025.

## F-038 — The order presence channel is public and exposes staff names, avatars and roles
- **Severity:** P3 · **Tier/Lens:** A1 · **Status:** CONFIRMED
- **Location:** `apps/platform/hooks/use-presence.ts:52` (`channel('presence:${topic}')` without `private:true`, topic = orderId, tracks display_name/avatar/role); callers `components/orders/presence-avatar-group.tsx:14`, `components/chat/order-thread-card.tsx:87`.
- **Impact:** anyone with the anon key and an order UUID sees which staff view an order.
- **Fix sketch:** `private:true` + realtime.messages policy tying topic to an order in `get_user_tenant_ids()`. **Related:** F-020.

## F-039 — Unused vulnerable direct dependencies, and SheetJS ships in entry chunks
- **Severity:** P3 · **Tier/Lens:** A10 · **Status:** CONFIRMED
- **Location:** platform direct `pdfjs-dist ^5.5.207` (lock 5.6.205, GHSA-hq66-cqwq-w95j, JS execution from malicious PDF), imported nowhere except `apps/platform/next.config.ts:21` serverExternalPackages (pdf-parse uses its own 5.4.296, out of range); `html2pdf.js` never imported (pulls jspdf 4.2.1); direct `jspdf 3.0.4` (criticals GHSA-f8cm-6447-x5h2, GHSA-wfv2-pwc8-crg5). SheetJS chunk `630dd358f962958d.js` (412,678 B / 138,964 B gz) is an entry chunk for /admin/data-import and /vault (build 2026-10-19 @6bde0f4); static importers `components/admin/data-import/export-step.tsx:3`, `components/team/export-report.tsx:15`, `components/products/import-export/import-wizard.tsx:22`, `components/products/import-export/export-builder.tsx:19`, `hooks/use-data-importer.ts:2`, `lib/vault-utils.ts:3`, `lib/excel-importer.ts:8`. jsPDF, html2canvas, ExcelJS, pdfjs load via dynamic chunks only; no puppeteer or Sentry in client chunks.
- **Evidence:** `pnpm audit --prod` @0032320: 2 critical (jspdf), 51 high, 37 moderate, 7 low (replaces SEC-16's 6/79). High: @tiptap/core 1, basic-ftp 5, brace-expansion 13, browserslist 2, extract-zip 2 (no fix), fast-uri 9, ip-address 1, jspdf 6, linkify-it 2, pdfjs-dist 1, prosemirror-view 1, source-map-js 1, tmp 1, ws 1, xlsx 2 (no fix).
- **Fix sketch:** drop pdfjs-dist and html2pdf.js; jspdf to patched 4.x; dynamic-import xlsx or replace with exceljs. **Related:** SEC-16, L-30, L-33.

## A8 load model (measured 22.6 days since 2026-09-27)
- 1,904,197 transactions (0.97/s); row writes 817,678 all schemas (0.42/s), 141,322 public (0.07/s); API statements (authenticated/anon/service_role) 176,534 (0.09/s) ≈ 600 per order, so reads are staff-polling driven. Refresh crons 24.5% of DB time, Realtime WAL polling 17.7% (4,861 s). 95 GB temp, 35,993 temp files, 8 deadlocks since reset. max_connections 60 (19 used), shared_buffers 224 MB, work_mem 2,184 kB.
- Design peak (base → 10x): writes ≈3.5–5/s → 35–50/s; storefront reads 5–15/s → 50–150/s; merchant reads ≈2/s → 20/s; Interakt receipts ≈1.1/s → 11/s (seq scans, F-025); heartbeat ≈1.3/s → 13/s (F-028). Total reads ≈10–20/s → 95–195/s.
- First to break at 10x: (1) Free-plan DB size, read-only in ≈11 days at base, ≈1 day at 10x (F-022); (2) Free-plan 200 Realtime connections (F-022); (3) 1 GB storage ≈2026-11-18 (F-022); then compute: whatsapp_logs receipt scans (F-025), v_orders_with_risk past 8 s at ≈20x tenant size (F-026), refresh crons near their 600 s interval (F-027), orders write amplification from 21 indexes (4 advisor-unused: assigned_to, needs_attention, version, delivery_company).
- Largest at 12 months (base): notifications ≈2.3M / 6.4 GB (unpruned, P-0.4); whatsapp_logs ≈1.6M / 3.8 GB (F-025); order_status_history ≈1.9M / 0.36 GB; orders ≈550k / 0.6 GB (21 indexes, none for F-028). ×10 at 10x.
- Not examined in this pass: COVERAGE rows 57–59, 626, 627, 630, 637–643.

---
### Supplementary HYPOTHESIS (not filed)
`create_order_atomic(jsonb)` called by the service role with `_tenant_id` NULL would make the idempotency lookup cross-tenant and insert a NULL-tenant order. Not verified whether any caller passes NULL. Routed to the submitCheckout fix.
