# PLAN — Final Hunt & Fix Program, Phase 3 (revision 2, after critic round 1)

- **Written:** 2026-10-20; **revised:** 2026-10-21 after the two round-1 critics (`critic/phase3-round1-security-data.md`, `critic/phase3-round1-product-ops.md`). Every critic item and what was done with it is in §14. Phase 3 is read-only for source code; this file and `plan/` are the only outputs.
- **Inputs:** FINDINGS.md (F-001..F-086), REGRESSION.md (prior-audit rows and leads NEW-P1-01..38), CONTEXT.md, COVERAGE.md, CRITIC_LOG.md, journeys/*.md, the two round-1 critic reports.
- **Code basis (re-baselined):** `origin/main` @ **3365a7d0** (2026-10-21 00:53 +03:00). That is 63 commits and 292 files after the first basis 056c668b. Every path, line number and package named below was re-checked at 3365a7d0 (script result in §12). What the new commits closed or narrowed is listed in §2.
- **Live DB basis:** `sduvpgqwhxragxtxztur`, SELECT only, 2026-10-20/21 (catalog and counts, no PII): DB 186 MB; storage ≈ 412 MB of the 1 GB Free quota (`vault_backups` 321 MB, `product-images` 79 MB, `tenant-assets` 10 MB, `qc-evidence` 1.2 MB, `avatars` 0.7 MB); org plan still **free**; `prune-order-notifications` failing every run.
  - **Live migrations after 2026-10-19:** `20261020163000 convert_lead_atomic`, `20261020205234 tenants_one_per_lead`, `20261020214159 iraq_locations_resolve_researched_reviews` (now committed by #181) and **`20261020215422 tenant_role_source_of_truth`**, which is applied live and exists in **no branch**.
  - **Committed on `main` but not applied live:** `20261020160500_whatsapp_logs_tenant_from_order.sql` (#177) and `20261021120000_publish_store_config_v2_allow_template.sql` (code that stamps `template` on publish is ahead of the database).
  - **The new role model (215422):** `tenant_members.role` is now `admin | employee | viewer` with a CHECK, NOT NULL and default `employee` (live: 19 admin, 4 employee, 0 viewer; the 4 former `member` rows became `employee`). `team_invites.role` has the same CHECK. `public.has_tenant_permission(tenant, permission)` (DEFINER, authenticated) joins the caller's active membership to `role_permissions` with the `user_permissions` override; admins hold every permission. `role_permissions` today: admin 12 permissions; employee 8 (`orders.create/delete/edit/export/view`, `customers.block/edit/view`); viewer 2 (`orders.view`, `customers.view`). The F-031 SELECT policies on payroll, salary, expenses and wallet tables already use it.
  - None of the migrations in PRs #167/#168/#172/#173/#175 is applied. The PR branches are being merged with current `main` by a separate worker (see §4).

---

## 1. Verdict, top 10 launch risks, decisions only Ali can make

### 1.1 Verdict

**Not ready to launch today. It can be ready once the launch gate in §8.1 is met: Waves 0–4 (all of them), PKG-18 and PKG-21 from Wave 5, and a passed load test with every third party stubbed. That is about 500 hours of work (range 450–540; roughly 12 working weeks at one agent's pace, about 7–8 calendar weeks with two lanes that share no files), plus Ali's decisions.** The round-1 critics estimated ≈400 h; this revision is higher because it also adds the scope the security critic asked for (database-level role checks, a cross-tenant test for every privileged function, a stock reservation, a backup of files as well as data). The two P0s (cross-tenant stock writes, order-number poisoning) and most of the P1 database holes already have fixes built and tested, but none is merged or applied. Production runs on the Supabase Free plan with no backup of either data or files, no second database, no branch protection on `main`, and only unit tests in CI. Every fix after the in-flight PRs is ordinary work: no finding needs a rewrite. The order is: take a backup and re-baseline, land the P0 PRs and the database-security PR together, build the full safety net, add the enablers (one way to ask "who is calling, for which tenant, with which permission"; typed database calls), then fix money, integrity and the launch-facing storefront, then the polish.

### 1.2 Top 10 launch risks, in plain language

1. **One sign-up can wreck every store's stock.** Anyone who signs up can zero or inflate any other shop's stock counts (F-001). Fix built (PR #173), not applied.
2. **One sign-up can stop every store from taking orders.** A single fake order number blocks new order numbers for all shops for the rest of the day (F-040), and all orders queue behind one global lock (F-041). Fix built (PR #175), not applied.
3. **Any staff member can make a shop free forever, and anyone can delete product photos.** Any member can set their own shop's plan to the house plan `internal`, which is never billed and never suspended, or credit the wallet and publish the live store (NEW-P1-01..03). Anonymous visitors can delete any shop's product images, and nothing backs up files (NEW-P1-04). Fix built (PR #168), not applied; now in Wave 1.
4. **The database will fill up and there is no backup.** Production is on the Supabase Free plan: file storage hits 1 GB in about a month at today's rate, the database goes read-only about 11 days into launch volume, and neither the data nor the files can be restored (F-022). Needs the Pro plan and an outside backup.
5. **We cannot test a fix without testing it on customers.** There is no second database, CI runs only unit tests, nothing protects `main`, and every migration goes straight to production. Twice in two days the live database changed without a matching file in the repository (REL-B, D-36). Package 0 fixes this.
6. **Strangers can push orders and status changes in.** LightFunnels and Interakt webhooks accept requests with no credential, and the Telegram bot accepts anything (NEW-P1-06/07/08). Fix built (PR #167). It needs four production settings first; launch requires the strict mode, not the "log only" fallback.
7. **Staff can do owner-only things, straight from the browser.** Viewers and employees can delete and edit orders through the database even where the screens hide the button (F-007). Owners cannot change or remove a staff member's role (F-058).
8. **The shop can sell stock it does not have.** Checkout never re-checks stock and holds nothing until staff confirm, so the last unit of a product can be sold any number of times (F-049, prior EC1).
9. **Money numbers are not trustworthy.** About 9 in 10 orders are never counted or charged (F-043); renewals ignore cancellations and pauses (F-059); the cash the courier collects depends on which label template was printed (F-044); deleted shipped orders put stock back 30 days later (F-055); the same salary period can be paid twice (F-056).
10. **When something breaks at launch, nobody will know in time.** No Sentry DSN is set, Vercel's free plan keeps logs for about an hour, there is no public health check to monitor, and only Ali can be alerted. The push-notification pipeline has been silently dead since 2026-10-11 (F-029), and a brief database error makes a store show "not found" for 60 seconds (F-045). The order screens also slow down as a shop grows (F-026, F-027, F-025).

### 1.3 Decisions only Ali can make

| # | Decision | Why it is yours | Blocks |
|---|---|---|---|
| D-1 | **Merge each in-flight PR to `main`** in the §4 order: #173, #168, #175, #172, #167 | Program rule: every merge to `main` needs your OK | PKG-01, -06, -02, -08, -07 |
| D-2 | **Apply each production migration** (one OK per file): `20261020150000`, `20261020150100` (#173); `20261020140100`..`140800` (#168, after its code deploys) and its follow-up default-privileges migration for tables and sequences; `20261020154000` (#175); `20261020143700` (#172, before its code deploys); **the two committed-but-unapplied files** `20261020160500` (#177) and `20261021120000` (publish allowlist), apply or hold each; **creating the read-only backup and drift role** (D-10 and D-18 need it; it is DDL on production); plus every migration a later package writes. Committing the live-only `20261020215422` file needs no apply | Program rule; production is the only database | All DB packages |
| D-3 | **Upgrade the Supabase org to Pro** (and choose: PITR add-on yes/no; branching yes/no; compute size) | Billing. Free has no backups, no branching, 500 MB DB, 1 GB storage, 5 GB egress, 200 realtime connections (F-022) | PKG-00 tier B, load test (§7), launch |
| D-4 | **PR #167 production settings:** (1) Interakt "Secret Key" into the integration's `webhook_secret`; (2) `?token=<LIGHTFUNNELS_WEBHOOK_SECRET>` on the LightFunnels webhook URL; (3) `TELEGRAM_WEBHOOK_SECRET` set and registered as the bot's `secret_token`; (4) Supabase Auth "Confirm email" on, custom SMTP configured, redirect `<NEXT_PUBLIC_SITE_URL>/login` allowed. `*_WEBHOOK_AUTH_MODE=monitor` is allowed **only as a transition of at most 7 days, never at launch**. Every env change needs a redeploy to take effect | Vercel env values and provider dashboards are yours; ~819 Interakt and ~528 LightFunnels requests/30 days would be rejected if #167 deploys before the settings | PKG-07, launch gate |
| D-5 | **Set the Sentry DSN** (`NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN`, and `SENTRY_AUTH_TOKEN` for source maps) on all three Vercel projects; create the Sentry project(s). **A hard launch gate**, with one test event per app | Secret values | PKG-05, runbook §8 |
| D-6 | **F-043 billing and over-limit behaviour:** (a) is each order billed for paying tenants? If yes, every channel charges and counts in the DB; if no, the per-order charge is removed and plan limits are the only control. (b) What happens to a **shopper's** COD order when the store is over its plan limit or paused: refuse with a localised message, or accept and flag (overage). (c) The merchant alert threshold (suggested 80% of the limit) | Pricing policy and lost-sale trade-off | PKG-15 |
| D-7 | **F-062: will AI customer summaries ship?** If yes, PKG-17's `customer_metadata` key change must merge before `ANTHROPIC_API_KEY` is set; if no, hide the feature and leave the key unset | Product scope; it is a cross-tenant row takeover once enabled | PKG-17 |
| D-8 | **F-067, now a confirmation:** #180 (`0b275cb3`) made the template every merchant can pick fact-free; Scheniders' own logo, licence, phone and socials remain only in the owner-only build, which is not offered. Confirm that build is never offered to other tenants | Brand ownership | PKG-10 |
| D-9 | **Vercel plan.** HYPOTHESIS (CONTEXT §3): the team is on Hobby (non-commercial use, 60 s function cap, daily crons, about 1 h of runtime logs, no log drains, instant rollback only to the immediately previous production deployment, 100 deployments a day). A commercial launch needs Pro | Billing | Load test, PKG-19, runbook |
| D-10 | **Schema and drift access for CI:** a dedicated read-only DB role (created under D-2) whose connection string, through the Supavisor **session** pooler (the Free direct connection is IPv6-only and GitHub runners have no IPv6), is stored as a GitHub Environment secret with required reviewers | Credentials | PKG-00, PKG-04 |
| D-11 | **#172/#177 follow-up, re-scoped:** apply #177's `20261020160500` (backfills `whatsapp_logs` and `order_status_history` from the order and adds fill-or-reject triggers), then backfill and constrain `delivery_import_items.tenant_id`. `checkout_queue` is owned by PKG-17 | Rewrites production rows | PKG-08 |
| D-12 | **#175 checkout limiter fails open** (if the limiter errors, checkout proceeds). Accept, or fail closed | Trade-off between abuse and lost orders | PKG-02 |
| D-13 | **F-082: may printed labels, invoices and payslips stay RTL documents?** CLAUDE.md says never set `dir`; the print HTML sets `dir="rtl"` | House-rule exception | PKG-32 |
| D-14 | **F-084: hide the Al-Waseet API button** (manual Waseet is your decision; the button cannot work) | Confirms L-36 scope | PKG-05 |
| D-15 | **Legacy storefront fallback (F-048, F-071):** 6 of 7 active tenants are served legacy pages. Retire the legacy shells before launch (all tenants render V2 sections) | Visible change for 6 merchants | PKG-27 |
| D-16 | **Accept the deferrals in §9** (F-081 modal migration; the BA-* store-builder UX backlog; NEW-14 shared Waseet account) | Risk acceptance | §9 |
| D-17 | **Protect `main`:** branch protection (or a ruleset) with required checks `ci`, `sql-tests`, `e2e`, no direct pushes, no force-push; optionally Vercel "wait for checks" before production promotion. Today `main` has no protection and no ruleset | Repository admin | PKG-00 "required job" |
| D-18 | **Backup destination and keys:** bucket (for example Cloudflare R2 or Backblaze B2), `age` key custody (who holds the private key), retention (suggested 14 daily + 8 weekly after Pro; weekly + pre-migration on Free), Supabase Storage S3 access keys for the file copy, and the GitHub Environment with required reviewers that holds the secrets. The dump contains customer phones and addresses | Credentials, privacy | PKG-00 00a |
| D-19 | **Copy owners:** who reviews Arabic (MSA) and English UI copy, and who authors Kurdish (Sorani; Badini or not). Or hide `ku` until authored | Quality of customer-facing text | PKG-29, PKG-30 |
| D-20 | **CI and deploy budget:** GitHub plan for Actions minutes (the private repo's Free quota is ≈2,000 min/month; `ci.yml` already notes "the Actions budget on this account is small"), and `turbo-ignore` as each Vercel project's ignore command so unaffected apps do not build | Billing, repo settings | PKG-00 |
| D-21 | **Alerting and on-call:** the alert channel (suggested: a Telegram bot to Ali, which the stack already uses), the uptime tool, a second human contact, response targets per severity, and whether a scheduled Claude session posts the §8.2 checks | Who gets woken up | §8 |
| D-22 | **Launch operating rules:** a platform-wide "orders temporarily paused" switch that you (or the on-call session) can flip, and a 72-hour change freeze after launch (incident fixes only) | Operating policy | PKG-05, §8 |

---

## 2. How this plan is organised

- **Packages are grouped by root cause.** One package closes every finding that shares its cause, even when the symptoms are on different screens.
- **Every F-001..F-086 is in exactly one package or in the Deferred table (§9).** The machine check is in §12. It proves the *mapping*; whether each package's approach really closes its findings was re-checked by hand for every P0 and P1 (§12, "Closure claims").
- **REGRESSION.md items are findings too.** The tracked NEW-P1-xx leads and the 94 open P0-class prior-audit rows are mapped to packages in §11.
- **Waves.** Wave 0 backup, re-baseline and safety net; Wave 1 the P0 PRs and the database-security PR; Wave 2 enablers and the other in-flight PRs; Wave 3 the remaining P1; Wave 4 P2 security, money, integrity and the launch-facing storefront; Wave 5 P2/P3 reliability, performance and UX (PKG-18 and PKG-21 from Wave 5 are inside the launch gate). A package in a later wave can start earlier when it touches no file a running package touches, but **no Wave 3+ production migration is applied before the full PKG-00 is merged and green** (00a alone is enough for Waves 1–2).
- **Changed on `main` since the first basis (056c668b → 3365a7d0) and in production since the hunt:**
  - **Role model (live only, 215422):** see the header. F-031 is closed in production by it (PKG-13 commits and verifies); PKG-03 is rebuilt on `has_tenant_permission`; P-1.6 (CHECK on role vocabularies) is done for `tenant_members` and `team_invites` (`user_profiles.role` already had a CHECK). The app half that the migration header describes (ROUTE_PERMISSIONS adding `/finances`, `/salaries`, `/vault`) is **not** on `main` (`apps/platform/components/providers/role-provider.tsx` has none of them): PKG-03.
  - **Billing exemption (#162):** `apps/platform/lib/billing-exempt.ts` makes `plan='internal'` never billed, never suspended and never limited; both `subscription-renew` and `trial-suspend` filter `.not("plan","in",EXEMPT_PLANS_SQL_LIST)`. Live: 1 tenant is `internal`. This raises NEW-P1-02 (members can write `tenants.plan`) and adds an acceptance check to the #167/#172 rebases (§4) and to PKG-15.
  - **CI now runs unit tests (`9df882df`):** one job runs `turbo lint type-check test build bundle-budget --affected`, and `vitest.workspace.ts` now includes `packages/sections`, `packages/shared` and `scripts/migrate-store-config-v2`. PKG-00 step 1 is done; CLAUDE.md's "CI does not run tests" is stale (PKG-04 updates the wording with Ali's OK).
  - **F-067 narrowed (#180, `0b275cb3`):** the registry entry `signatureDirection` is built from the neutral perfume pack with no merchant facts; Scheniders' facts (`SCHENIDERS_FACTS`, `scheniders-signature.ts:247`) feed only `schenidersSignatureTemplate`, which only `signature-parity.test.ts` imports. Live: only the owner tenant's config contains the third-party phone, licence or template assets (1 row each). The commit title overstates what changed in the file: the strings are still there (`:119,150,158,197,241,252,260-261,282-283`), but only on the owner-only path. PKG-10 keeps a regression guard and F-068.
  - **F-085 narrowed (`4aea0a80`):** Kurdish strings on the conversion path; the track-phone hand-over uses `sessionStorage` in `track_order_lookup.client.tsx:91` and `order_tracker.client.tsx:188`. The thank-you page still does not hand the phone over (PKG-29).
  - **F-073 / NEW-P1-35 narrowed (`ee847028`, `abbc0524`, `46fdb41c`):** `loading.tsx` exists for search, category, catalogue and product routes; `apps/storefront/app/s/[tenant]/sitemap.xml/route.ts` exists; 404/redirect status is decided above the skeletons. A tenant-level `error.tsx` and the cached-error problem (F-045) remain (PKG-26).
  - **Committed since the first basis:** `20261019132424_backfill_followup_attribution_oct.sql` (#163/#174) and `20261020214159` (#181). Three live-only files remain uncommitted (PKG-04), plus 215422 (Wave 0).
  - **Write streams added on `main`:** `storefront_events` inserts from `apps/storefront/app/api/events/route.ts:108` and per purchase from `apps/storefront/app/api/checkout/orders/route.ts:139`; a `cod_risk_signals` RPC call per checkout (`apps/storefront/app/actions/checkout.ts:584`). The load test models them (§7). No cron job prunes `api_rate_limits` (0 jobs reference it).
  - **Carried over from the first basis:** F-064 closed by #179 (PKG-09 verify); F-005 narrowed by #165/#176 (PKG-11); F-059 narrowed by #176 (PKG-15); NEW-P1-31 instrumentation exists (#151), and #161 tags Sentry events with user id, tenant and role, but no DSN is set (D-5); `next` 16.3.8 everywhere (L-33 closed).
  - **Re-checked still present at 3365a7d0** (sample): `onboarding-wizard.tsx:263` `dir`, `storefront-runtime.ts:88` `breakpoint: "mobile"`, `brand-kit-vars.ts:425` 0.5 threshold, `ai-summary/route.ts:144` `onConflict: "customer_phone"`, `lead-import-dialog.tsx:400` plain `fetch`, `orders/layout.tsx:26` mobile swap, `next.config.ts:46` `ignoreBuildErrors: true`, `order-confirmation-card.tsx:141` `direction: "rtl"`, `catalog-grid.tsx:44-55` perfume copy, `vault-utils.ts:304` and `backup-utils.ts:82` browser `upsert` into `orders`, `inv_phase('new')` = `CLOSED` live, `orders.tenant_isolation_update/delete` membership-only live.

---

## 3. Order of work

"Gate" = inside the §8.1 launch gate.

| Wave | Package | Title | Findings | Sev (max) | Effort | Gate |
|---|---|---|---|---|---|---|
| 0 | PKG-00 | Safety net: backup of data and files, re-baseline, tests in CI on the Supabase stack, e2e, RLS role tests, branch protection, Pro plan | 1 | P1 (P0 at launch) | L, ~92 h | yes |
| 1 | PKG-01 | PR #173 cross-tenant stock and planted child rows | 2 | P0 | S, ~4 h | yes |
| 1 | PKG-06 | PR #168 DB security holes (wallet, tenants, storage, reactivation) + default grants on tables and sequences | 0 | P0-class (NEW-P1) | S, ~6 h | yes |
| 1 | PKG-02 | PR #175 order-number counter, lock removal, checkout limit | 2 | P0 | S, ~5 h | yes |
| 2 | PKG-03 | One tenant-caller helper on `has_tenant_permission`; role-aware database writes; safe redirects | 6 | P2 | M, ~30 h | yes |
| 2 | PKG-04 | Schema contract: typed clients, fresh types, drift gates, no dashboard migrations | 3 | P2 | M, ~32 h (2 h spike first) | yes |
| 2 | PKG-05 | Production config and observability: env validation, PII-free logs, capability flags, health endpoints, kill switch | 3 | P2 | M, ~16 h | yes |
| 2 | PKG-07 | PR #167 webhooks, crons, Telegram, signup fail closed | 1 | P0-class (NEW-P1) | S, ~4 h + D-4 | yes |
| 2 | PKG-08 | PR #172 wallet top-up, renewals, tenant stamping, checkout validation | 3 | P2 | S, ~7 h | yes |
| 2 | PKG-09 | Merged to main since the hunt: verify only | 1 | P3 | S, ~1 h | yes |
| 3 | PKG-10 | Template copy that speaks for the wrong business (guard) and perfume vocabulary | 2 | P1 (narrowed) | S, ~6 h | yes |
| 3 | PKG-11 | Admin app: finish guards and audit trail | 2 | P1 | S, ~6 h | yes |
| 3 | PKG-12 | Abandoned-cart recovery bound to a server checkout session | 2 | P1 (latent) | M, ~12 h | yes |
| 4 | PKG-13 | Role-aware and status-aware RLS for sensitive data; DEFINER cross-tenant harness | 5 | P2 | L, ~34 h | yes |
| 4 | PKG-17 | Per-tenant keys for customers and external orders | 5 | P2 (P0 if AI on) | L, ~18 h | yes |
| 4 | PKG-19 | Server-side HTML rendering: no client HTML, escaped fields, closed browsers | 2 | P2 | M, ~10 h | yes |
| 4 | PKG-20 | Secrets out of anon-readable store config | 1 | P2 | M, ~10 h | yes |
| 4 | PKG-23 | Abuse limits on public storefront endpoints; security headers | 1 | P3 | S, ~6 h | yes |
| 4 | PKG-14 | Order and stock write integrity, with a storefront stock reservation | 5 | P2 (EC1 P0-class) | L, ~36 h | yes |
| 4 | PKG-15 | Tenant billing and renewal enforced in the database | 2 | P2 | M, ~20 h | yes |
| 4 | PKG-16 | One COD amount, whole-IQD money columns, a transactional delivery import | 3 | P2 | L, ~24 h | yes |
| 4 | PKG-24 | Browser-orchestrated multi-table writes moved into RPCs (payroll, vault) | 2 | P2 | M, ~14 h | yes |
| 4 | PKG-25 | Vulnerable and unused dependencies | 1 | P3 | M, ~8 h | yes |
| 4 | PKG-26 | Storefront failure handling and page states | 5 | P2 | M, ~16 h | yes |
| 4 | PKG-27 | Retire the legacy storefront fallback; store-base links | 3 | P2 (F-071 P1 at launch) | M, ~14 h | yes |
| 5 | PKG-18 | Hot read paths, refresh jobs and retention | 4 | P2 | M, ~20 h | yes |
| 5 | PKG-21 | Notification delivery ledger (web push, WhatsApp) | 2 | P2 | M, ~12 h | yes |
| 5 | PKG-22 | Private realtime channels and returns-scan status | 3 | P3 | M, ~10 h | no |
| 5 | PKG-28 | Builder settings the live render ignores or gets wrong | 2 | P2 | M, ~14 h | no |
| 5 | PKG-29 | Storefront locales: Kurdish strings, coded errors, track handoff | 2 | P3 | S, ~4 h | no |
| 5 | PKG-30 | Platform: one message catalogue and one formatter | 3 | P2 | L, ~55 h | no |
| 5 | PKG-31 | Platform UI states and shared primitives | 4 | P2 | M, ~14 h | no |
| 5 | PKG-32 | Remove `dir` attributes and inline `direction` | 2 | P3 | S, ~6 h | no |
| — | Load test | §7 | — | — | M, ~36 h | yes |
| — | Deferred | §9 | 1 | P3 | — | — |

33 packages (PKG-00..PKG-32; PKG-06 closes only tracked NEW-P1 items, so 32 packages carry F-ids), 85 findings in packages, 1 deferred.

**Effort totals:** launch gate ≈ **499 h** (27 packages + the load test); after launch ≈ **103 h** (PKG-22, -28, -29, -30, -31, -32); total ≈ **602 h**. The in-flight PR rollouts (PKG-01, -02, -06, -07, -08) are included at their rollout size. Estimates are for one engineer-agent; Ali's turnaround on decisions is excluded. PKG-04 is re-estimated after its 2 h spike, before Wave 2 is scheduled.

**Why #168 (PKG-06) is now in Wave 1:** with #162 on `main`, any member who sets `tenants.plan='internal'` (NEW-P1-02) is permanently free and unsuspendable; NEW-P1-04 is irrecoverable anonymous deletion of product images with no file backup. Neither depends on #173 or #175, and #168 has 0 conflicts with `main`, #173 or #172.

---

## 4. Rollout order for the five in-flight PRs

All five are drafts. None of their migrations is applied (checked 2026-10-21). CI was green on their old bases, so CI must be re-run after each rebase.

**In progress (separate worker, not planned twice here):** merging current `main` into the five fix branches and updating their SQL test fixtures for the new role model (every fixture that inserted `tenant_members.role='member'` — `p1_db_security_holes_local_fixture.sql`, `order_number_counter` fixture, `tenancy_write_guards.sql`, `tenancy_secdef_guards.sql`, `chat_phase2a_authz.sql` — must use `admin|employee|viewer`, or it violates `tenant_members_role_check`), and adding #172's internal-tenant renewal exemption with its SQL test. "Fails before, passes after" is re-proven on the new fixture for each PR before D-1 is asked.

**Conflicts at 3365a7d0** (old-style `git merge-tree` from the security critic's round-1 run against 3365a7d0; the separate worker resolves them):

| PR | vs `main` | vs other PRs | Rebase acceptance check |
|---|---|---|---|
| #173 | 0 | 0 with #168, 0 with #175 | CI re-run on the rebased head |
| #168 | 0 | 0 with #172 (both regenerate `packages/supabase/src/database.types.ts`: auto-merges, regenerate once after both land) | apply-allowlist matches live `apply_store_config_v2_patch` (no `redirects`/`custom_pages` live: no regression) |
| #175 | **3 hunks**: `apps/storefront/app/actions/checkout.ts` (`main` added `cod_risk_signals` and the `replayed` flag) and `apps/platform/vitest.config.mts` | 1 with #172 (`checkout.ts`) | the replay path still skips the risk call; `checkout-cod-risk.test.ts` and the PR's limiter tests both pass |
| #172 | **4 hunks**: `apps/platform/app/api/cron/subscription-renew/route.ts`, `apps/storefront/app/actions/checkout.ts`, `packages/sections/src/checkout_form.client.tsx`, `packages/sections/src/pdp_direct_order.client.tsx` | 1 with #175, 1 with #167 | the renew route keeps `.not("plan","in",EXEMPT_PLANS_SQL_LIST)`; `renew_subscription_atomic` itself skips exempt plans (SQL test "internal tenant with an expired subscription is not charged or suspended") |
| #167 | 0 textual; semantic: `main` changed `subscription-renew` and `trial-suspend` (#162) | 1 with #172 (`subscription-renew/route.ts`) | both crons keep the `EXEMPT_PLANS_SQL_LIST` filter |

**Order:**

| Step | PR | Order inside the step |
|---|---|---|
| 0 | — | PKG-00 00a done (fresh dump of data **and** files, restored and checked) |
| 1 | #173 (PKG-01) | Apply `20261020150000` → `20261020150100`; then merge and deploy code (the code only adds checks; DB first gives protection sooner) |
| 1b | #168 (PKG-06) | **Deploy code first** (the zero-price skip for internal-plan orders), then apply `20261020140100`..`140800` in order (the storage migration `140300` stops anonymous deletes), then the follow-up default-privileges migration for tables and sequences |
| 2 | #175 (PKG-02) | **Apply `20261020154000` first, then deploy** |
| 3 | #172 (PKG-08) | **Apply `20261020143700` first, then deploy**; then D-11 (#177's migration and `delivery_import_items`) |
| 4 | #167 (PKG-07) | **Ali's settings (D-4) first**, then deploy; strict mode, `monitor` only as a ≤7-day transition |

After each step: run the package's verification (below), watch Vercel runtime errors for 30 minutes (Sentry once D-5 is done), then move on.

---

## 5. Packages

Each package lists: findings closed, files touched, approach, migration/rollout risk, rollback path, the exact verification that proves the fix, and effort. Paths are relative to the repo root and were checked at 3365a7d0.

**Rules every database package follows from Wave 1 on:**
- After PKG-06's default-privileges migrations, a new function, table or sequence gets **no** privileges for `anon`/`authenticated` by default. Each migration grants exactly what it needs, and the PKG-00 RLS matrix fails on any table, policy or function that has no row.
- Test fixtures use the live role vocabulary (`admin|employee|viewer`); permissions come from `has_tenant_permission`.
- A package's verification test is committed first and shown failing; expected-red assertions live in the known-failures register (PKG-00) and the package deletes its own entries.

### PKG-00 — Safety net (Wave 0; build before any risky fix)

- **Closes:** F-022
- **Also closes (REGRESSION):** DR-1, REL-B, D-35, D-36 (ML PROC-01/03/04/07/08/10, FR P-G1..P-G12, OR REL-C/D/E/F), L-32, L-42.
- **Root cause:** there is one environment (production) on the Free plan, no restorable backup of data or files, nothing protecting `main`, and only unit tests in CI. Production also changes outside the repository. Every other package depends on this.
- **Hard constraints:** no non-production database exists; the Supabase org is on **Free** (no branching, no managed backups, no PITR, 5 GB egress a month shared by API, Storage and dumps); the Free direct DB connection is IPv6-only; GitHub-hosted runners have no IPv6; the repo is private with a small Actions budget; Vercel builds every app on every push (no `ignoreCommand` in `apps/platform/vercel.json`, `apps/storefront/vercel.json`, `apps/admin/vercel.json`). The safety net therefore has two tiers:
  - **Tier A, works without the upgrade (do now):** the Supabase CLI local stack (`supabase start` / `supabase db start`, i.e. the supabase/postgres 17.x Docker image with `pg_cron`, `pg_net`, `supabase_vault`, the `auth`/`storage`/`realtime` schemas and the `anon`/`authenticated`/`service_role` roles) in CI and for restore drills; weekly and pre-migration logical backups plus a file copy held outside Supabase.
  - **Tier B, needs Pro (D-3):** daily managed backups, PITR, Supabase branches for previews and the load test, nightly dumps (Pro egress allows it).
- **5.0 "00a" — before any production migration (S, ~8 h; needs D-10 and D-18):**
  1. **Data:** `supabase db dump --role-only`, `supabase db dump` (schema) and `supabase db dump --data-only` (or `pg_dump --format=custom` with `postgresql-client-17` from the PGDG apt repo, since the runner's default `pg_dump` is older), through the **session pooler** connection string. Encrypt with `age` to the D-18 key; upload to the D-18 bucket.
  2. **Files:** copy every Storage bucket except `vault_backups` (product-images, tenant-assets, qc-evidence, avatars, payslip PDFs) through Supabase's S3-compatible endpoint with `rclone sync` to the same bucket, keeping a manifest of object keys and checksums. `pg_dump` copies only `storage.objects` metadata, and Supabase Pro backups also exclude the files.
  3. **Restore into a working app, not just rows:** restore roles, schema and data into a local Supabase stack (or a second Free project, deleted afterwards), copy back 3 sampled files and compare checksums, point a locally built platform and storefront at it, and run the e2e smoke: log in as a restored admin, open the order list, place one COD checkout. Record row counts of `orders`, `order_status_history`, `products`, `product_variants`, `wallet_transactions`, `inventory_ledger`, `tenants`, `tenant_members`, `auth.users`, plus the restore time (RTO) and the dump age (RPO), in PROGRESS.md.
  4. **Cadence on Free:** a full data dump is ≈ 186 MB of egress (the wire protocol is not compressed), so nightly dumps would use ≈ 5.6 GB a month, above the 5 GB quota shared with the live API. On Free: **weekly** full dump + file sync, and a fresh dump immediately before each D-2 migration. After Pro: nightly.
- **5.0b "00r" — re-baseline (S, ~6 h; Wave 0):**
  1. Commit the live-only migration as `packages/supabase/migrations/20261020215422_tenant_role_source_of_truth.sql`, byte-for-byte from `supabase_migrations.schema_migrations.statements` (no re-apply).
  2. Take D-2 decisions on the two committed-but-unapplied files (`20261020160500` → D-11; `20261021120000` → apply, or revert the template stamp in code until applied).
  3. Rebuild the CI fixture (below) and re-run every existing and PR SQL test on it (the PR half is the in-progress fixture work in §4).
  4. Record the reverse drift (file without a live row) as well as forward drift; PKG-04's gate fails on both.
- **Files touched:**
  - `.github/workflows/ci.yml` (add jobs `sql-tests` and `e2e`; the existing `ci` job already runs vitest)
  - `.github/workflows/backup.yml` (new: weekly dump + file sync + restore drill; nightly after Pro)
  - `.github/workflows/drift.yml` (new: nightly schema and migration-list diff against the committed fixture; opens an issue on any difference)
  - `packages/supabase/tests/` (new: `run.sh` runner; `fixtures/live_schema.sql` from `supabase db dump`; `fixtures/schema_migrations.sql` data-only dump of `supabase_migrations.schema_migrations`; `rls_role_matrix.sql`)
  - `packages/supabase/tests/fixtures/ci_seed.sql` (new deterministic seed, below)
  - `packages/supabase/tests/fixtures/known_failures.json` (new register, below)
  - `packages/supabase/migrations/20261020215422_tenant_role_source_of_truth.sql` (00r)
  - `packages/supabase/config.toml` (L-42: replace the OLD `project_id` label `ibfdugifekivquwprqjc` with a neutral local name; keep `enable_confirmations = false` for local e2e)
  - `apps/platform/playwright.config.ts` (two `webServer` entries; projects `chromium` and `Mobile Chrome` only), `apps/platform/e2e/` (replace `example.spec.ts` and `orders.spec.ts` with the journeys below)
  - `apps/platform/app/api/generate-batch-pdf/route.ts` (local Chrome path resolves to Playwright's Chromium in CI)
  - `apps/platform/vercel.json`, `apps/storefront/vercel.json`, `apps/admin/vercel.json` (`ignoreCommand: npx turbo-ignore`, D-20)
- **Approach:**
  1. **Unit tests in CI:** done on `main` (`9df882df`): `turbo … test --affected`. Keep it; add nothing.
  2. **SQL tests in CI (`sql-tests` job):** runs only when `packages/supabase/**` changes (path filter) and nightly. It starts `supabase db start` (Docker image cached), loads `fixtures/live_schema.sql` and `fixtures/schema_migrations.sql`, applies the branch's migrations whose versions are not in that table, loads `ci_seed.sql`, then runs every `packages/supabase/tests/*.sql` and fails on any `FAILED` line or any `fixture: need …` line. The fixture is refreshed by a script whenever a migration is applied, and checked for secrets (function bodies, defaults) before committing.
  3. **Deterministic seed (`ci_seed.sql`):** creates `auth.users` rows with known passwords and `email_confirmed_at` set; tenant A with `admin`, `employee`, `viewer`, a removed member (`tenant_members.status='suspended'`), a deactivated user (`user_profiles.is_active=false`); tenant B with an admin; an outsider with no membership; the internal-plan tenant shape; products with variants and stock; orders in every `inv_phase`; a foreign-only phone and an own phone. Every shape that `tenancy_write_guards.sql:62-69` and `tenancy_secdef_guards.sql:100-102` look up exists, so they report PASS, not "fixture: need". It replaces the order generator in `packages/supabase/seed-test-data.sql` for CI (that file stays for manual volume tests).
  4. **RLS tests per role (`rls_role_matrix.sql`):** for every `public` table with a `tenant_id` (124 live) × SELECT/INSERT/UPDATE/DELETE, and every function EXECUTE-able by `anon` or `authenticated`, assert the expected outcome as: `anon`; tenant A `admin`, `employee`, `viewer`; removed member; deactivated user; tenant B admin on tenant A rows; `service_role`. Uses `set local role` + `set local request.jwt.claims`. The expected matrix is a checked-in table, written as policy design, not typed from the current state. Any table, policy or function without a row fails the job. PostgREST-level rows cover the paths the app does not use (for example viewer `UPDATE`/`DELETE` on `orders`), and table-level privileges (`has_table_privilege`, TRUNCATE included).
  5. **Known-failures register:** `known_failures.json` lists each expected-red SQL matrix row as `xfail:<PKG-id>`; Playwright uses `test.fail()` with the PKG id in the title. CI fails when an xfail passes, so a fix cannot go unnoticed. Initial entries: PKG-13 rows (F-008, F-009, F-012, F-013); PKG-03 (viewer cannot delete or edit an order, also through PostgREST; removed member signed out); PKG-06 (deactivated user cannot reactivate; member cannot write `tenants.plan`); PKG-16 (delivery-import parse `DOMMatrix`, L-26; rollback restores the previous status, NEW-05); PKG-14 (double-tap and reload create one order, F-054; last-unit oversell, F-049). Each package's definition of done deletes its entries.
  6. **E2E (Playwright)** against the local stack loaded with the fixture and the seed, with both apps built (`next build && next start`): platform on :3000 and storefront on :3001 in `/s/<slug>` path mode (the storefront host rewrite in `vercel.json` does not run locally), test values for the LightFunnels token and the Interakt secret as CI env, and every outbound provider pointed at a local mock (the same mock server as the load test, §7). Runs on pull requests that touch `apps/**`, `packages/**` or `supabase/**`, and nightly; not on every push to `main`.
     - **Checkout (storefront):** browse → add to cart → COD checkout with a `07XXXXXXXXX` phone → success page shows the order number → track page finds it; double-tap submit creates one order and reload after submit creates no second order (`test.fail` until PKG-14); a sold-out item is refused (`test.fail` until PKG-14).
     - **Order intake (platform):** manual create order; LightFunnels webhook with a valid token creates exactly one order, an unsigned one is rejected (PKG-07); the order appears in the list for tenant A only.
     - **Waseet manual path (Ali's decision L-36):** select orders → print labels (the PDF renders through `generate-batch-pdf` with Playwright's Chromium) → mark in transit → delivery import (parse → match → confirm) marks delivered → rollback restores the previous status (`test.fail` until PKG-16). No Al-Waseet API call is made.
     - **Auth and tenant isolation:** tenant B admin cannot see or open tenant A orders, products, customers, salaries; viewer cannot delete an order in the UI **or** through PostgREST with the anon key (`test.fail` until PKG-03); removed member is signed out of tenant A and loses chat; deactivated user cannot reactivate (`test.fail` until PKG-06).
  7. **Required checks:** after D-17, `ci`, `sql-tests` and `e2e` are required on `main` with no direct pushes. Path-filtered jobs report success when skipped (a no-op job with the same name), so required checks never block unrelated PRs.
  8. **Budget (D-20):** path filters as above; Docker image and Playwright browser caches; two Playwright projects; `turbo-ignore` on all three Vercel projects so a storefront-only change does not build platform and admin previews (Hobby allows 100 deployments a day).
  9. **Backup automation:** `backup.yml` runs 00a's steps on the Free cadence (weekly), using the D-10 read-only role and the D-18 secrets from a GitHub Environment with required reviewers, so a workflow pushed on a branch cannot read them. The restore drill (00a step 3) runs monthly on Free and weekly after Pro, and once within 7 days before launch.
  10. **Plan upgrade (D-3):** Pro removes the 500 MB read-only and 1 GB storage cliffs, gives managed backups, branching, more egress and higher realtime limits. Independently, `vault_backups` grows ≈ 21 MB/day (cross-tenant CSVs, F-061/DR-1); PKG-24 adds a 14-day retention, applied only after this package's outside backup exists.
- **Migration/rollout risk:** none for production schema (CI, fixtures and an outside copy). The read-only role is DDL on production (D-2). The dumps contain customer phones and addresses: encrypted at rest, access per D-18.
- **Rollback path:** revert the CI change; tests are additive. Disable `backup.yml` if a run misbehaves.
- **Verification that proves it:**
  - A deliberately broken commit on a scratch branch (a failing vitest; an RLS policy loosened in a migration; a broken checkout button) makes `ci`, `sql-tests` and `e2e` fail respectively; the clean branch passes.
  - `sql-tests` on the fixture at `main` reports PASS for `tenancy_write_guards.sql` and `tenancy_secdef_guards.sql` with 0 `fixture: need` lines.
  - `rls_role_matrix.sql` passes with the known-failures register applied; removing one register entry makes it fail; a scratch migration that adds a table without a matrix row fails it.
  - A scratch row in `schema_migrations.sql` without a file, and a scratch migration file whose version is missing from it, each fail the drift step.
  - `gh api repos/gga2000/scheniders-mono/branches/main/protection` returns the three required contexts (after D-17).
  - Restore drill log: row counts equal the source, 3 file checksums match, the e2e smoke passes on the restored copy, RTO and RPO recorded.
  - `get_organization` returns plan `pro` (after D-3).
- **Effort:** L, ~92 h (00a 8 h; 00r 6 h; SQL job on the Supabase stack + fixture + migration rows + drift job 12 h; seed 6 h; RLS matrix 26 h; Playwright on two apps 24 h; known-failures register 2 h; budget work 3 h; backup automation and drill 5 h).

### PKG-01 — PR #173: cross-tenant stock writes and planted child rows (Wave 1, P0)

- **Closes:** F-001, F-002
- **Branch:** `fix/p0-cross-tenant-stock` (built; draft; awaiting D-1/D-2). Merge with current `main` and the fixture update for the new role model are in progress (§4).
- **Files touched:** `apps/platform/lib/order-items-tenant.ts` (new), `apps/platform/lib/order-service.ts`, `apps/storefront/app/s/[tenant]/products/[slug]/page.tsx`, `apps/storefront/lib/queries.ts`, `packages/supabase/migrations/20261020150000_inventory_tenant_scoped_stock_writes.sql`, `packages/supabase/migrations/20261020150100_product_child_tables_tenant_guard.sql`, tests `packages/supabase/tests/cross_tenant_stock.sql` (+ `cross_tenant_stock_local_fixture.sql`), `apps/platform/lib/order-items-tenant.test.ts`, `apps/storefront/lib/product-child-tenant-filter.test.ts`.
- **Approach (built):** `inv_apply`, `process_return` and `undo_return` (the only DEFINER functions with authenticated reach that updated `products`/`product_variants` without a tenant predicate) now carry `AND tenant_id = …` and skip `qty <= 0`; the new 5-arg `inv_apply` is `REVOKE … FROM PUBLIC, anon, authenticated`; `trg_orders_items_tenant_guard` rejects foreign item ids and negative quantities on every write path; the function `tg_product_child_tenant_guard` backs six child-table triggers; public read policies require tenant match; storefront child queries filter by `tenant_id`.
- **Migration/rollout risk:** low. Live data measured: 0 of 41,462 order items reference another tenant's product; 0 negative quantities; 0 child or ledger rows disagree. A trigger that rejects could block an unusual legitimate path (supply products shared across tenants: none exist).
- **Rollback path:** the previous function bodies are in `packages/supabase/tests/cross_tenant_stock_local_fixture.sql` (the PR header points there); re-create them and drop the seven triggers. Code revert via Vercel instant rollback.
- **Remaining gaps:** composite FKs `(tenant_id, product_id)` (longer-term); the `inv_apply` path for deleted orders is PKG-14 (F-055).
- **Verification:**
  - `cross_tenant_stock.sql` passes on the CI fixture after the rebase (21 checks fail before, all pass after), with CI re-run on the rebased head.
  - After applying in production: `select count(*) from pg_trigger where tgname = 'trg_orders_items_tenant_guard'` = 1, and `select count(*) from pg_trigger where tgname in ('trg_product_images_tenant_guard','trg_product_variants_tenant_guard','trg_product_bundle_items_tenant_guard','trg_product_related_tenant_guard','trg_product_order_bumps_tenant_guard','trg_product_tiered_pricing_tenant_guard') and not tgisinternal` = 6.
  - `select has_function_privilege('authenticated','public.inv_apply(uuid,jsonb,text,integer,uuid)','EXECUTE')` = false.
  - e2e "tenant isolation" journey green; live stock of a sample of 5 own-tenant orders unchanged across create/fulfil/cancel (compare `inventory_ledger` deltas).
- **Effort:** S, ~4 h (rollout, re-proof on the new fixture, checks).

### PKG-06 — PR #168: DB security holes, plus default grants on tables and sequences (Wave 1, step 1b)

- **Closes:** no finding from FINDINGS.md directly (it closes the tracked items below).
- **Closes (REGRESSION / tracked):** NEW-P1-01, NEW-P1-02, NEW-P1-03, NEW-P1-04, NEW-P1-09, NEW-P1-16, NEW-P1-18, NEW-P1-20, NEW-P1-33 (superseded storage lockdown), B-08 / F-24 (`tenant-assets` SVG), SEC-02, SEC-06, B-07, EC3, MONEY-07 (bonus half), D-04..D-07, D-15..D-17, D-20.
- **Branch:** `fix/p1-db-security-holes` (built; draft). Merge with `main` and fixture update in progress (§4).
- **Why Wave 1:** see §3. With `plan='internal'` exempt from billing and suspension on `main`, NEW-P1-02 lets any member make their shop permanently free; NEW-P1-04 lets anonymous users delete product images, and until 00a's file copy runs nothing can bring them back.
- **Files touched:** `apps/platform/app/settings/team/page.tsx`, `apps/platform/components/settings/business-settings.tsx`, `apps/platform/components/settings/team-settings.tsx`, `apps/platform/components/store-builder-v2/auto-form-fields.tsx`, `apps/platform/components/store-builder-v2/brand-kit/controls.tsx`, `apps/platform/components/store-onboarding/onboarding-wizard.tsx`, `apps/platform/lib/order-service.ts`, migrations `20261020140100`..`20261020140800`, `packages/supabase/src/database.types.ts`, tests `packages/supabase/tests/p1_db_security_holes.sql` (+ fixture); follow-up migration `<ts>_default_privileges_tables_sequences.sql`.
- **Approach (built), plus one gap closed here:**
  - Built: `tenants` column revoke + BEFORE UPDATE trigger + admin gate on live patches (NEW-P1-02/03); `charge_wallet_atomic` rejects `_amount <= 0` and loses authenticated EXECUTE (NEW-P1-01); storage write policies per tenant prefix on `product-images` and `qc-evidence` (NEW-P1-04); SVG out of `tenant-assets`; `is_active` admin-only; bonuses admin-only writes; `20261020140700` revokes the default EXECUTE on new functions.
  - **Gap (NEW-P1-18, second half):** the live default ACL still gives `anon` and `authenticated` `arwdDxtm` on every new **table** (TRUNCATE included) and `rwU` on every new **sequence**, for both the `postgres` and `supabase_admin` grantors. The follow-up migration does `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated` and the same `ON SEQUENCES`, with the same guarded `supabase_admin` block `140700` uses (skipped with a NOTICE when the migration role is not a member). From then on every new table's migration grants what it needs (PostgREST needs table grants even with RLS), and the matrix row proves it.
- **Migration/rollout risk:** medium. **Deploy code first, then migrations** (the code skips the wallet charge for zero-price internal-plan orders, which the new amount check would reject). After the default-privileges migrations, a later migration that forgets its GRANT fails in CI (matrix), not in production.
- **Rollback path:** each migration header has its rollback SQL; the default-privileges follow-up is reversed by `ALTER DEFAULT PRIVILEGES … GRANT`.
- **Remaining gaps:** team role change (F-058) is PKG-03; existing function grants are reviewed in PKG-13's harness.
- **Verification:**
  - `p1_db_security_holes.sql` 75/75 on the CI fixture after the rebase (37 fail before).
  - After apply in production: `select has_function_privilege('authenticated','public.charge_wallet_atomic(uuid,numeric,text,text)','EXECUTE')` = false.
  - `select defaclobjtype, defaclacl from pg_default_acl where defaclnamespace='public'::regnamespace and defaclrole='postgres'::regrole` shows no `anon=` or `authenticated=` entry for types `f`, `r` and `S` (and for the `supabase_admin` rows when the guarded block ran; record the NOTICE otherwise).
  - Storage policies on `product-images` no longer include role `public` for INSERT/UPDATE/DELETE; as `authenticated` member of tenant B, a `storage.objects` DELETE under tenant A's prefix affects 0 rows (SQL test).
  - As an `employee` of a tenant, `update tenants set plan='internal' where id = <own tenant>` raises (SQL test); in production `select count(*) from tenants where plan='internal'` stays 1.
  - e2e isolation journey green.
- **Effort:** S, ~6 h (rollout 4 h; follow-up migration and its tests 2 h).

### PKG-02 — PR #175: order numbers from a counter, no global lock, checkout limit (Wave 1, P0)

- **Closes:** F-040, F-041
- **Branch:** `fix/p0-order-number-counter` (built; draft). Merge with `main` (3 conflict hunks, §4) and fixture update in progress.
- **Files touched:** `apps/platform/app/actions/orders.ts`, `apps/platform/hooks/use-order-crud.ts`, `apps/platform/lib/order-number.ts` (new), `apps/platform/vitest.config.mts`, `apps/storefront/app/actions/checkout.ts`, `apps/storefront/app/api/checkout/orders/route.ts`, `apps/storefront/lib/checkout-rate-limit.ts` (new), `packages/supabase/migrations/20261020154000_order_number_counter.sql`, tests (`packages/supabase/tests/order_number_counter.sql` + fixture, and 9 vitest files).
- **Approach (built):** per-prefix sequences + per-day counter, format `<digit><YYMMDD><nnn>` unchanged; trigger `trg_orders_order_id_server_only` stops anon/authenticated from setting or changing `order_id`; replays answered before any lock; global advisory lock removed; per-tenant lock for `sequence_number` (index `idx_orders_tenant_sequence_number` exists live); checkout limited to 20/IP/10 min and 5/tenant+phone/hour.
- **Added before merge (residual found by the critic):** the service-only 1-arg overload `create_order_atomic(jsonb)` calls the 2-arg version with `_tenant_id = NULL`, which makes the lock key global again and inserts a NULL-tenant row. No app code calls it (all callers pass `_tenant_id`: `order-service.ts:69`, `lightfunnels-api.ts:800,938`, `webhook-handler.ts:897`, storefront checkout). **Drop the 1-arg overload** in the PR's migration (or, if a caller appears, raise on NULL tenant).
- **Consequences recorded:**
  - The trigger refuses every `authenticated` INSERT into `orders`, so the browser restore paths `apps/platform/lib/vault-utils.ts` (line 304) and `apps/platform/lib/backup-utils.ts` (line 82) (`upsert(orders, {onConflict:'id'})`) fail for any missing row. Vault restore is already broken (F-061); PKG-24's `restore_vault_snapshot` RPC becomes the only restore path, and the browser paths are deleted there.
  - The trigger removes the F-042 attack (a tenant can no longer plant an `order_id`). F-042 drops to P3 (accidental cross-tenant collision under the service role) and stays in PKG-17.
- **Migration/rollout risk:** medium. Must apply before deploy (old code would otherwise write `order_id` the trigger refuses for authenticated callers). Seeded from live (max per prefix 46). A snapshot restore can no longer re-create deleted orders under old numbers (by design).
- **Rollback path:** the migration header restores the previous `create_order_atomic` overloads and drops the trigger; sequences can stay (unused). Code via Vercel rollback **after** the DB rollback.
- **Remaining gaps:** limiter fails open (D-12); per-tenant `sequence_number` still scans that tenant's orders (PKG-18 measures it).
- **Verification:**
  - `order_number_counter.sql` passes in CI (fails before, passes after, passes on a second run), including its `set local role authenticated` INSERT and UPDATE-of-`order_id` cases (both raise).
  - In production after apply: `select count(*) from pg_trigger where tgname = 'trg_orders_order_id_server_only'` = 1; `select count(*) from pg_proc where oid::regprocedure::text = 'create_order_atomic(jsonb)'` = 0.
  - `pg_stat_statements` mean for `create_order_atomic` drops from 944 ms (baseline); record the new mean after 48 h.
  - Storefront checkout returns 429 on the 21st request from one IP in 10 minutes (vitest `checkout-rate-limit.test.ts`, and once on a preview); `checkout-cod-risk.test.ts` still passes after the rebase.
- **Effort:** S, ~5 h.

### PKG-03 — One tenant-caller helper on `has_tenant_permission`; role-aware database writes; safe redirects (Wave 2, enabler)

- **Closes:** F-003, F-006, F-007, F-015, F-019, F-058
- **Also closes (REGRESSION):** SEC-04, SEC-05, SEC-30 (app half), P-1.5b / NEW-P1-32 (`domains/verify` unauthenticated), NEW-P1-15 (`waseet/city-mappings` any user), NEW-P1-19 remainder (process-checkouts-manual drains every tenant's queue), P-1.6 (verify: done live for `tenant_members`/`team_invites`; `user_profiles.role` already constrained), B-13 (platform middleware no-op), D-19.
- **Root cause:** authorization decisions read the global `user_profiles.role` and the self-writable `user_profiles.current_tenant_id`, not the caller's active `tenant_members` row and the permissions its role grants; the database lets any member UPDATE and hard-DELETE orders whatever their role; team management writes the wrong table; redirects trust the query string.
- **Builds on (live since 215422):** `tenant_members.role ∈ {admin, employee, viewer}`, `role_permissions`, `user_permissions` overrides, and `public.has_tenant_permission(tenant, permission)`. This package invents no new role names.
- **Files touched:**
  - `apps/platform/lib/auth/resolve-active-tenant.ts` (return `memberRole: 'admin'|'employee'|'viewer'` from the active membership; platform admin as an explicit separate flag), `apps/platform/lib/auth/resolve-active-tenant.test.ts` (fixtures use the live vocabulary, not `member`)
  - `apps/platform/lib/auth/require-request-caller.ts` (becomes `requireTenantCaller(request, { permission })` where `permission` is a `role_permissions` key such as `orders.delete`, or `{ adminOnly: true }`; permission resolved by calling `has_tenant_permission` with the caller's JWT, so the app and RLS use the same rule)
  - `apps/platform/app/api/settings/staff-alert/route.ts` (F-006)
  - `apps/platform/app/api/orders/delete/route.ts`, `apps/platform/app/actions/orders.ts`, `apps/platform/app/api/settings/order-pipeline/route.ts`, `apps/platform/app/api/waseet/submit-orders/route.ts`, `apps/platform/app/api/chat/push/subscribe/route.ts` (F-007)
  - `apps/platform/app/api/team/link-google/start/route.ts`, `apps/platform/app/link-google/claim/route.ts` (F-003)
  - `apps/platform/app/api/auth/callback/route.ts`, `apps/admin/app/api/auth/callback/route.ts`, `packages/shared/src/` (new `safeNextPath()` with tests) (F-015, F-019)
  - `apps/platform/app/settings/team/page.tsx`, `apps/platform/components/settings/team-settings.tsx` (F-058)
  - `apps/platform/app/api/domains/verify/route.ts`, `apps/platform/app/api/waseet/city-mappings/route.ts`, `apps/platform/app/api/cron/process-checkouts-manual/route.ts`
  - `apps/platform/components/providers/role-provider.tsx` (ROUTE_PERMISSIONS keyed by tenant role and permission; add `/finances`, `/salaries`, `/vault`, `/store/**`, `/returns/scan`, `/orders/trash`; remove `/sentry-test` from production) and `apps/platform/components/auth/role-guard.tsx` (render nothing while loading)
  - migration `<ts>_role_aware_writes.sql` (below)
- **Approach:**
  1. One helper resolves `{ userId, tenantId, memberRole, isPlatformAdmin }` from the session and an **active** `tenant_members` row (`status='active'`, `user_profiles.is_active`). The tenant comes from the request (route param or body) and is checked against membership; `current_tenant_id` is only a default.
  2. Every route and action in the F-007 list, F-006, and the three NEW-P1 routes call it with the required permission (`orders.delete`, `orders.edit`, `orders.create`, `system.settings.access`, or admin-only). Viewers lose create/delete/edit/split/unsplit.
  3. **The database half of F-007 (`<ts>_role_aware_writes.sql`):** `orders` UPDATE policy requires `has_tenant_permission(tenant_id,'orders.edit')`; **hard DELETE on `orders` is revoked from `authenticated` entirely** (deletion is the soft delete through the route; a hard DELETE also fires `inv_apply(…,-1)` and skips the trash); INSERT requires `orders.create`. The same pattern for `customers` (`customers.edit`) and for `products` / `product_variants` writes (admin, or a permission Ali adds to `role_permissions`). Policies keep the `tenant_id IN (SELECT get_user_tenant_ids())` conjunct and wrap the helper as `(select has_tenant_permission(...))` to avoid per-row re-evaluation.
  4. F-003: link-google targets only the caller themself, or sends the magic link to the target's own email; refuse `super_admin`/admin targets; consume the token atomically (`update … set used_at=now() where id=$1 and used_at is null returning *`).
  5. F-015/F-019: `safeNextPath(next)` accepts only `/` + non-`/` + non-`\` and asserts `new URL(next, origin).origin === origin`.
  6. F-058: role change and removal update/delete `tenant_members` under the existing admin policies (keep ≥1 admin; the self-change guard trigger exists; roles only from the CHECK vocabulary); drop `role` from `saveProfile`. Deactivate uses #168's `set_team_member_active`.
  7. Page gates: server-side check in each protected layout using the same helper; client `PageGuard` becomes cosmetic.
- **Migration/rollout risk:** medium. Before `<ts>_role_aware_writes.sql`: count members per role (`select role, count(*) from tenant_members group by 1`: today 19 admin, 4 employee, 0 viewer), so no live user loses a permission they use: employees keep `orders.edit/delete/create` per `role_permissions`; only hard DELETE goes away for everyone except the service role. Check `pg_stat_statements` for any authenticated `DELETE FROM orders` call path before applying (the app uses the route).
- **Rollback path:** Vercel rollback; the migration header recreates the previous membership-only policies and re-grants DELETE.
- **Verification:**
  - New vitest per route: viewer → 403 on create/delete/edit; employee → allowed where `role_permissions` grants it; removed member (stale `current_tenant_id`) → 403; tenant admin → 200; another tenant's id in the body → 403. Each test fails on current code.
  - SQL (matrix rows, xfail until this package): as a tenant A `viewer` through `set local role authenticated`, `update orders set notes='x' where tenant_id=A` affects 0 rows and `delete from orders where tenant_id=A` raises permission denied; as `employee`, the update succeeds and the delete raises; `select has_table_privilege('authenticated','public.orders','DELETE')` = false.
  - `safeNextPath` unit tests: `//evil.com`, `/\evil.com`, `@evil.com`, `https://evil.com` rejected; `/orders?x=1` accepted. Plus a route test on both callbacks.
  - link-google: two parallel claims of one token → exactly one session (vitest with a mocked admin client); target = super_admin → 403.
  - Playwright (PKG-00 isolation journey): owner demotes an employee to viewer, the viewer's delete button is gone, `POST /api/orders/delete` returns 403, and a PostgREST `DELETE` with the viewer's JWT is refused; owner removes a member, who is signed out of the tenant; an employee opening `/salaries` is sent away.
- **Effort:** M, ~30 h (helper and routes 14 h; role-aware writes migration and matrix rows 8 h; F-003/F-015/F-019/F-058 8 h).

### PKG-04 — Schema contract: typed clients, fresh types, drift gates, no dashboard migrations (Wave 2, enabler)

- **Closes:** F-023, F-024, F-030
- **Also closes (REGRESSION):** NEW-P1-11, NEW-P1-21, NEW-P1-23 (missing `auto_move_to_no_response`), L-35, L-39, D-25, D-34, P-12A.2 check (live `20261019010921_activity_logs_append_only` file committed).
- **Root cause:** the platform and admin Supabase clients are `<any>`, generated types are stale, migrations are applied from the dashboard (215422 is the latest example, with no file anywhere) and committed files are sometimes never applied (160500, 21120000), and `ignoreBuildErrors: true` hides type errors in the platform build. Calls to tables, columns and RPCs that do not exist pass every gate.
- **Step 0 — spike (2 h, before Wave 2 is scheduled):** on a scratch branch, type the platform and admin clients with `<Database>` from freshly generated types and count `tsc` errors per directory. Re-estimate this package from the count (planning range 25–40 h; 278 `no-explicit-any` warnings today) and record it in PROGRESS.md.
- **Files touched:**
  - `apps/platform/lib/supabase.ts`, `apps/platform/lib/supabase-server.ts`, `apps/admin/hooks/use-admin-auth.ts`, `apps/admin/lib/admin-supabase.ts` (add `<Database>`)
  - `packages/supabase/src/database.types.ts` (regenerate once, after #168 and #172 both land)
  - `apps/platform/next.config.ts` (remove `ignoreBuildErrors`)
  - `apps/platform/hooks/use-store-analytics.ts`, `apps/platform/components/store-command-center/kpi-strip.tsx` (F-030: aggregate RPC on real columns, surface errors)
  - `apps/platform/lib/customer-data-export.ts` (`activity_log` → `activity_logs` or delete dead `requestDeletion`), `apps/platform/hooks/use-bulk-actions.ts` (`customers`), `apps/platform/hooks/use-categories-query.ts` (dead `merge_categories`/`split_category`), `apps/platform/lib/repositories/order-repository.ts` (`search_orders_v2`: apply `20261012120000` or delete the call), `apps/platform/app/api/cron/auto-no-response/route.ts` (create the RPC and schedule, or delete route and browser rule — Ali picks; default: create)
  - `…20261019133102_products_gender.sql`, `…20261019012123_products_brand_size_display_name.sql`, `…20261019010921_activity_logs_append_only.sql` (commit the three remaining live-only statements with their live versions, from `schema_migrations.statements`)
  - `.github/workflows/ci.yml` (type-drift step: regenerate types against the CI fixture and fail on diff; migration-drift step: fail when a `schema_migrations` row has no file **or** a file has no row, using the fixture's data-only `schema_migrations` dump; the nightly `drift.yml` from PKG-00 compares the fixture with live)
  - `CLAUDE.md` (Ali approves the wording: "migrations only from the repo"; CI now runs unit tests, SQL tests and e2e)
- **Approach:** regenerate types; type every client; fix every compile error the typing reveals (each one is a latent runtime bug like F-030); delete dead callers; commit the remaining live-only migrations; add the drift gates; document the rule.
- **Migration/rollout risk:** low. The committed files are already applied (no re-run). Applying `20261012120000_search_orders_v2` (if chosen) is a new production migration (D-2). Removing `ignoreBuildErrors` can fail the build: fix the errors in the same branch.
- **Rollback path:** code revert; RPC drop.
- **Verification:**
  - `pnpm type-check` passes with `<Database>` everywhere and `ignoreBuildErrors` removed; `pnpm build` passes.
  - A scratch commit that calls `.from("order_items")` fails type-check (proves the gate).
  - CI drift step passes on `main`; a scratch row without a file fails it; a scratch file without a row fails it.
  - `select count(*) from supabase_migrations.schema_migrations m where version >= '20261019'` equals the number of files with those versions in `packages/supabase/migrations/` (one-off read-only check after 00r and this package).
  - F-030: vitest for the new KPI hook against a mocked RPC; on production after deploy, the /store KPI strip of the one active tenant shows the same 30-day order count as `select count(*) from orders where tenant_id=$1 and created_at>now()-'30 days' and deleted_at is null` (one-off read-only check, count only).
- **Effort:** M, ~32 h (spike 2 h, then 25–40 h; re-estimated after the spike).

### PKG-05 — Production config, observability, health endpoints and kill switch (Wave 2, enabler)

- **Closes:** F-036, F-046, F-084
- **Also closes (REGRESSION):** OPS-01 / V-6 / D-09 (code side; DSN is D-5), NEW-P1-31 (verify the instrumentation reports), L-23, L-27, B-14 (real Supabase URL + anon JWT in `env.example`), NEW-P1-10 (ungated "Test" fill button with a real secondary phone in `create-order-modal.tsx`), D-10 / NEW-45 (`NEXT_PUBLIC_PLATFORM_ORIGIN` unset → preview `postMessage` to `*`).
- **Root cause:** every server env var is optional, so missing configuration shows up as a broken feature in front of a merchant instead of at deploy; logs carry PII; error reporting is wired but has nowhere to send; there is no unauthenticated health endpoint to monitor and no platform-wide way to pause orders.
- **Files touched:** `apps/platform/lib/env.ts`, `apps/storefront/lib/` env module (replace `process.env.X!`), `apps/platform/app/store/edit/page.tsx` (no `dev-preview-token` fallback), `apps/platform/components/store-builder-v2/editor-shell.tsx`, `apps/platform/lib/gemini-order-extractor.ts`, `apps/platform/app/printing/page.tsx` + `apps/platform/components/printing/waseet-submit-dialog.tsx` (F-084: server-derived capability flag hides the button), `packages/shared/src/` (new `maskPhone()`), `apps/platform/lib/interakt.ts`, `apps/platform/app/api/webhooks/interakt/route.ts`, `apps/platform/lib/webhook-handler.ts`, `apps/platform/lib/staff-alerts.ts` (F-036), `apps/platform/components/orders/create-order-modal.tsx` (NEW-P1-10), `env.example` files, `apps/platform/instrumentation.ts`, `apps/platform/instrumentation-client.ts`, `apps/platform/sentry.server.config.ts`, `apps/platform/sentry.edge.config.ts`, Sentry setup for storefront and admin (none today), `apps/platform/app/api/healthz/route.ts` (new), `apps/storefront/app/api/healthz/route.ts` (new), migration `<ts>_platform_flags.sql` (service-only `platform_flags` table with RLS on and no anon/authenticated grant), `apps/storefront/app/actions/checkout.ts` and `apps/storefront/app/api/checkout/orders/route.ts` (honour the flag).
- **Approach:**
  - Zod schema per app with `required` / `optional-with-capability` per variable; capability flags (`preview`, `imageToOrder`, `waseetApi`, `aiSummary`) computed on the server and passed to the UI, which hides or explains features that are not configured.
  - `maskPhone` keeps the last 4 digits in every log line; Sentry on all three apps with the tenant tag `#161` added (user id only, no email, no phone).
  - **`/api/healthz` on platform and storefront:** unauthenticated, `select 1` through the service client with a 2 s timeout, returns `200 {"ok":true}` or `503`, no data, `Cache-Control: no-store`. The admin `apps/admin/app/api/health/route.ts` stays admin-only (it returns business data).
  - **Kill switch (D-22):** `platform_flags.orders_paused` (service-role read, cached ≤ 30 s). When set, storefront checkout refuses with a coded error and the store shows PKG-26's "temporarily unavailable" state in `ar`/`en`/`ku`; webhooks keep accepting and queue (no order is lost). Ali or the on-call session flips it with one SQL statement written in the runbook.
- **Migration/rollout risk:** a required var missing in Vercel fails the deploy — that is the point, but list the vars to Ali first (names only). Set `PREVIEW_TOKEN_SECRET` (both apps) before deploy. Env changes take effect only after a redeploy.
- **Rollback path:** Vercel rollback; drop `platform_flags` (code treats a missing row as "not paused").
- **Verification:**
  - vitest for env parsing (missing required var throws; missing optional var sets the capability false); vitest for `maskPhone` and a CI grep gate (`rg -n --type ts 'console\.(log|warn|error).*phone' apps` returns 0, allow-list explained).
  - Playwright: printing page with no `WASEET_*` shows no "Al-Waseet API" button; store editor preview renders the iframe without "A valid preview token is required".
  - `curl -s -o /dev/null -w '%{http_code}' https://<platform>/api/healthz` = 200 without a cookie; with the DB unreachable in the local stack = 503; the response body contains no tenant data.
  - With `orders_paused` set in the local stack, a checkout returns the paused code and creates no order; a LightFunnels webhook is still accepted and queued.
  - After D-5: `/sentry-test` (admin only) produces one Sentry event per app with a tenant tag, then the page is removed from production.
- **Effort:** M, ~16 h.

### PKG-07 — PR #167: webhooks, crons, Telegram and signup fail closed (Wave 2)

- **Closes:** F-014
- **Also closes (tracked):** NEW-P1-06, NEW-P1-07, NEW-P1-08, NEW-P1-14, D-01..D-03, D-27 (signup half), SEC-26, NEW-54a/b/c, V-3c, SEC-C (c)(d). NEW-P1-06/07 and SEC-26/NEW-54a count as closed **only in enforce mode** (the launch gate requires it).
- **Branch:** `fix/p2-signup-webhook-auth` (built; draft). Merge with `main` in progress; acceptance check: both crons keep `.not("plan","in",EXEMPT_PLANS_SQL_LIST)` (§4).
- **Files touched:** `apps/platform/app/(auth)/signup/page.tsx`, `apps/platform/app/api/auth/signup/route.ts`, `apps/platform/app/api/cron/auto-no-response/route.ts`, `…/cron/subscription-renew/route.ts`, `…/cron/trial-suspend/route.ts`, `…/cron/waseet-locations/route.ts`, `…/cron/waseet-sync/route.ts`, `apps/platform/app/api/telegram/webhook/route.ts`, `apps/platform/app/api/webhooks/interakt/[tenantId]/route.ts`, `apps/platform/app/api/webhooks/lightfunnels/route.ts`, `apps/platform/lib/client-ip.ts` (new), `apps/platform/lib/env.ts`, `apps/platform/lib/supabase-server.ts`, `apps/platform/lib/webhook-auth.ts`, plus 6 test files.
- **Migration/rollout risk:** high if deployed before D-4: all ~819 Interakt and ~528 LightFunnels requests per 30 days would be rejected (lost orders). No DB migration.
- **Rollback path:** set `*_WEBHOOK_AUTH_MODE=monitor` (explicit opt-out, logs at error level) **and redeploy** (Vercel applies env changes only to new deployments; a redeploy takes minutes and counts against the Hobby 100/day), or Vercel instant rollback to the previous deployment. `monitor` is a transition of at most 7 days, never the launch state.
- **Remaining gaps:** `process-checkouts-manual` still needs only a signed-in user and drains every tenant (NEW-P1-19 → PKG-03); signup still writes `user_profiles.role='admin'` (PKG-03 stops using it for tenant decisions).
- **Verification:**
  - The PR's vitest suites (32 cases fail on old code).
  - After deploy: one unsigned POST to each webhook from outside (expect 401, or 503 when unconfigured); one correctly signed test POST (expect 2xx); `curl -H 'x-vercel-cron: 1'` to each cron (expect 401).
  - **Launch condition:** no `*_WEBHOOK_AUTH_MODE` variable set to `monitor` in the Production environment (`filter_project_envs` names-only check), and 24 h of 0 rejections of real Interakt/LightFunnels/Telegram senders in the logs.
  - One test signup receives a confirmation email and cannot sign in before confirming; the 6th signup from one IP within an hour gets 429.
  - `subscription-renew` and `trial-suspend` on the rebased head still skip the `internal` tenant (vitest).
- **Effort:** S, ~4 h plus Ali's settings.

### PKG-08 — PR #172: atomic wallet top-up, idempotent renewals, tenant stamping, checkout validation (Wave 2)

- **Closes:** F-011, F-021, F-032
- **Also closes (tracked):** NEW-P1-12, NEW-P1-13, NEW-P1-17, NEW-P1-30, L-18, P-1.11 (writers), D-12, D-21 (item tenant), D-22 (writers), D-26 (storefront forms), F-017 sub-item 1 (phone→balance route removed; F-017 stays in PKG-23), F-048 sub-item 1 (legacy forms now send an idempotency key; F-048 stays in PKG-27), F-034 partial (queue rows stamped; F-034 stays in PKG-17).
- **Branch:** `fix/p3-wallet-checkout-leads` (built; draft). Merge with `main` (4 conflict hunks, §4), fixture update and the internal-tenant renewal exemption are **in progress** (separate worker).
- **Files touched:** the §4 conflict files; plus `apps/admin/app/api/billing/topup/route.ts`, `apps/admin/app/api/bulk/route.ts`, `apps/admin/lib/wallet-topup.ts` (new), `apps/platform/app/api/delivery-import/confirm/route.ts`, `apps/platform/app/api/waseet/submit-orders/route.ts`, `apps/platform/app/api/webhooks/interakt/route.ts`, `apps/platform/app/api/webhooks/interakt/send/route.ts`, `apps/platform/lib/whatsapp-dispatcher.ts`, `apps/platform/lib/whatsapp-error-handler.ts`, `apps/storefront/app/api/loyalty/balance/route.ts` (deleted), `apps/storefront/components/schneiders/checkout-form.tsx`, `apps/storefront/components/storefront/CheckoutForm.tsx`, `apps/storefront/lib/checkout-payload.ts` (new), `packages/sections/src/checkout_form.client.tsx`, `packages/sections/src/pdp_direct_order.client.tsx`, migration `20261020143700_wallet_topup_and_subscription_renew_atomic.sql`, test `packages/supabase/tests/wallet_topup_subscription_renew.sql`.
- **Money risk in the merge (must hold before D-1):** `renew_subscription_atomic` suspends the tenant when the charge fails and writes `tenants.plan = pending_plan`. The exemption from #162 lives only in the route. The function itself must skip exempt plans (the same SQL predicate PKG-15 uses, `public.is_billing_exempt(plan)`, or an inline `plan NOT IN ('internal')` with a comment pointing at `apps/platform/lib/billing-exempt.ts`), with the SQL test case "internal tenant with an expired subscription is not charged or suspended" in `wallet_topup_subscription_renew.sql`.
- **D-11 (re-scoped):** apply #177's `20261020160500_whatsapp_logs_tenant_from_order.sql` (on `main`, not applied live: backfills `whatsapp_logs` and `order_status_history` from the order and adds fill-or-reject triggers), then a small migration in this package that backfills `delivery_import_items.tenant_id` from its import and sets NOT NULL. `checkout_queue` is PKG-17's (one owner).
- **Migration/rollout risk:** medium. **Apply `143700` before deploying** admin and cron code. Loyalty redemption by phone is removed until an identity check exists (a visible feature change; loyalty is enabled on 0 tenants).
- **Rollback path:** migration header; Vercel rollback of admin and platform.
- **Remaining gaps:** `extend_trial` bulk action still swallows errors (PKG-11); renewal semantics (F-059) are PKG-15.
- **Verification:**
  - `wallet_topup_subscription_renew.sql` in CI on the new fixture, including the internal-tenant case; vitest suites.
  - After deploy: one admin top-up of 1,000 IQD on the internal tenant creates exactly one `wallet_transactions` row and one `admin_activity_logs` row; a replayed renewal call charges once (`select count(*) from wallet_transactions where reference = $ref` = 1).
  - After the first renewal run: `select status, plan from tenants where plan='internal'` unchanged (counts only: 1 row, `active`).
  - After D-11 and one day: `select count(*) from whatsapp_logs where tenant_id is null` = 0, same for `order_status_history` and `delivery_import_items`; `select count(*) from pg_trigger where tgname like '%tenant_from_order%'` matches #177's trigger count.
- **Effort:** S, ~7 h (rollout 4 h; D-11 3 h).

### PKG-09 — Merged to main since the hunt: verify only (Wave 2)

- **Closes:** F-064
- **What landed:** PR #179 (`apps/admin/app/api/leads/[id]/convert/route.ts` → `convert_lead_atomic`, lead row lock, `tenants_prospect_lead_id_key` partial unique index, `packages/supabase/tests/convert_lead_atomic.sql`); migrations `20261020163000` and `20261020205234` are applied live.
- **Remaining gap:** F-064 also asked for unique `subscriptions(tenant_id)`; the RPC prevents the double insert but other writers (signup, admin) do not. Fold the unique index into PKG-15 (it needs a duplicate count first).
- **Rollback path:** n/a (already live).
- **Verification:** `convert_lead_atomic.sql` runs green in the PKG-00 SQL job; `select indexname from pg_indexes where indexname='tenants_prospect_lead_id_key'` returns 1 row; `select has_function_privilege('authenticated', p.oid, 'EXECUTE') from pg_proc p where proname='convert_lead_atomic'` is false for every overload.
- **Effort:** S, ~1 h.

### PKG-10 — Template copy that speaks for the wrong business: regression guard and perfume vocabulary (Wave 3, P1 narrowed)

- **Closes:** F-067, F-068
- **Also closes (REGRESSION):** NEW-P1-26 (live config drift from the Signature template: re-applying would overwrite merchant edits — an existing tenant never gets a template re-applied without a diff; `apps/platform/lib/store-templates/upgrade.ts` from #180 is the path, and it must keep that rule).
- **Status at 3365a7d0:** F-067's exposure is closed in code by #180 (`0b275cb3`): the registry entry `signatureDirection` (`scheniders-signature.ts:607`) is built from `perfumePack` with no `SignatureFacts`; `SCHENIDERS_FACTS` (`:247`) feeds only `schenidersSignatureTemplate` (`:613`), imported only by `signature-parity.test.ts`. `content-packs.test.ts:145` already rejects `شنايدر`, `Scheniders`, `kawkab`, `زيونة`, `Zayouna` in packs. Live: only the owner tenant's config carries the phone, licence or template assets. **What is left:** a guard strong enough that a later refactor cannot leak the facts again (today's test would miss the spaced phone, the licence number, the logo and social URLs), and F-068 (`packages/sections/src/helpers/catalog-grid.tsx` (line 44-55) still says "perfume").
- **Root cause:** one merchant's real business content lives in the same module as the shared template, and section helpers hard-code one niche's vocabulary.
- **Files touched:** `apps/platform/lib/store-templates/scheniders-signature.ts`, `apps/platform/lib/store-templates/index.ts`, `apps/platform/lib/store-templates/store-templates.test.ts`, `apps/platform/lib/store-templates/content-packs/content-packs.test.ts`, `packages/sections/src/helpers/catalog-grid.tsx`, `packages/sections/src/product_grid.tsx`.
- **Approach:**
  - Move `SCHENIDERS_FACTS`, `SCHENIDERS_POLICIES` and `schenidersSignatureTemplate` into a module that `index.ts` cannot import (an owner-only file next to `scheniders-words.ts`), so the registry's import graph does not contain them. No tenant id is hard-coded anywhere (CLAUDE.md bans hard-coded values): ownership is a property of the template module, not a UUID filter.
  - **Registry guard test** (`store-templates.test.ts`): for every template in `STORE_TEMPLATES`/`STARTER_TEMPLATES`, serialise the applied config and fail on: a phone after stripping spaces, dashes and `+` that matches `0?7\d{9}` or `9647\d{9}`; any `wa.me/`, `tel:` with digits, `tiktok.com/` or `instagram.com/` URL; any non-empty `legal.business_license`; any `tenant-assets/store-templates/scheniders/` image (neutral placeholders are allowed by an explicit list); the words "ضريبة", "customs", "tax"; the brand names in `content-packs.test.ts:145`.
  - Merchant contact details in policy and contact pages are **render-time tokens** (`{{store.phone}}`, `{{store.whatsapp}}`, `{{store.address}}`, `{{store.name}}`) resolved from tenant settings when the page renders, so a later phone change propagates; if unset, the section shows a clearly marked placeholder in the editor and nothing on the live store.
  - F-068: catalogue strings become neutral ("product/منتج") through `formatCount`, with an optional section prop `item_noun_i18n`; Arabic in MSA.
- **Migration/rollout risk:** low; only new template applications are affected. The owner's live store keeps its own config (stored per tenant).
- **Rollback path:** code revert.
- **Verification:**
  - The registry guard test fails when `SCHENIDERS_FACTS` is passed to the registry build (shown on a scratch commit) and passes on the fixed tree; a test asserts `index.ts`'s module graph does not include the owner-only module.
  - Playwright: create a fresh tenant, pick each starter template, publish, open `/policies/shipping`, `/policies/returns`, `/contact`: the page shows the new tenant's phone and name and none of `07779703832` / `0777 970 3832`, `310536983500003`, `kawkab`, "Zayouna", "شنايدر"; the header logo `src` is the new tenant's logo or a neutral placeholder, never a `store-templates/scheniders/` asset.
  - Turn on catalogue controls on a non-perfume store: no "perfume"/"عطر" on the grid.
  - Production read-only check after deploy: `select count(*) from tenants where store_config_v2::text like '%7779703832%' and plan <> 'internal'` = 0.
- **Effort:** S, ~6 h.

### PKG-11 — Admin app: finish guards and audit trail (Wave 3, P1)

- **Closes:** F-005, F-063
- **Also closes (REGRESSION):** NEW-13, V-4, D-13, D-14, the `extend_trial` bulk error swallowing noted in #172.
- **Root cause:** the admin app relied on middleware alone and does not write an audit row for every mutation; one dialog calls the API without the admin bearer.
- **Status after #165/#176:** all F-005 routes are guarded (see §2). Remaining work is below.
- **Files touched:** `apps/admin/app/api/merchants/[id]/extend-subscription/route.ts`, `apps/admin/app/api/merchants/[id]/extend-trial/route.ts`, `apps/admin/app/api/merchants/[id]/tags/route.ts`, `apps/admin/app/api/merchants/[id]/notes/route.ts`, `apps/admin/app/api/merchants/[id]/orders/route.ts`, `apps/admin/app/api/bulk/route.ts`, `apps/admin/lib/activity-logger.ts`, `apps/admin/components/leads/lead-import-dialog.tsx`, `apps/admin/components/leads/lead-competitor-section.tsx` (unmounted: delete), `apps/admin/lib/admin-fetch.ts`, `apps/admin/app/api/route-permissions.test.ts`.
- **Approach:** `logAdminActivity` on every mutating handler (a test enumerates every `route.ts` with POST/PUT/PATCH/DELETE and asserts a call); fix `merchants/[id]/orders` column list against the regenerated types (PKG-04); lead import uses `adminFetch`; bulk `extend_trial` returns per-tenant failures.
- **Migration/rollout risk:** low.
- **Rollback path:** Vercel rollback.
- **Verification:** extended `route-permissions.test.ts` (support_staff → 403 on the five super_admin actions); new test "every mutating admin route writes an activity row" fails before, passes after; Playwright or manual: import a 3-row CSV in the admin leads screen → "3 imported, 0 errors"; after one admin action in production, `select count(*) from admin_activity_logs` > 0 (it is 0 today).
- **Effort:** S, ~6 h.

### PKG-12 — Abandoned-cart recovery bound to a server checkout session (Wave 3, P1 latent)

- **Closes:** F-004, F-051
- **Also closes (REGRESSION):** NEW-12, L-14.
- **Root cause:** abandoned-cart rows are created by an anonymous endpoint that trusts the client's tenant, phone, item names and prices, and are keyed one-per-phone forever.
- **Interim control (Wave 1, one line, not a workaround):** `apps/storefront/app/api/cart/abandoned/route.ts` returns **410 Gone** until this package ships, so no anonymous service-role writes happen for any tenant or phone. Keeping the recovery toggle off alone does not stop those writes. Recovery is enabled on 0 tenants and `abandoned_carts` has 0 rows, so nothing user-visible changes.
- **Files touched:** `apps/storefront/app/api/cart/abandoned/route.ts`, `apps/platform/lib/abandoned-cart-sender.ts`, `apps/platform/app/api/cron/abandoned-cart-recovery/route.ts`, `apps/storefront/app/actions/checkout.ts` (recovered stamp), migration `<ts>_abandoned_carts_session_key.sql` (row per checkout session; drop `abandoned_carts_tenant_id_phone_key`; unique `(tenant_id, session_id)`).
- **Approach:** the storefront server creates the cart row from its own session (tenant from the host, not the body); item names and prices are looked up from `products` at send time; phone normalised and rate-limited (PKG-23 limiter); template body values never contain client text; one row per checkout session, so later carts are recoverable. Add a test that the recovery toggle cannot be enabled while the endpoint returns 410.
- **Migration/rollout risk:** low (`abandoned_carts` has 0 rows live).
- **Rollback path:** migration rollback recreates the old unique key; Vercel rollback.
- **Verification:** vitest: the interim route returns 410 and calls no Supabase client; after the package, a POST with a foreign `tenant_id` or with item name "visit http://x" → the stored row carries the host's tenant and DB product names; sender test asserts template values come from `products`; SQL test: two sessions for one phone produce two rows and both are eligible; `select count(*) from abandoned_carts` remains 0 until a tenant enables recovery.
- **Effort:** M, ~12 h.

### PKG-13 — Role-aware and status-aware RLS for sensitive data; DEFINER cross-tenant harness (Wave 4)

- **Closes:** F-008, F-009, F-012, F-013, F-031
- **Also closes (REGRESSION):** NEW-P1-22 (TRUNCATE/write grants on ledgers), NEW-P1-24 (cost/profit columns, `VIEW_FINANCIALS`), SEC-03, MONEY-07 / V-5 (payroll RLS), B-03 / L-15 (JWT-claim policies on `bom_items`, `product_categories`), L-16 / SEC-10 / D-42 (`customer_aggregates` SECURITY DEFINER view), SEC-21 / D-37 (RLS without policies on `security_logs`), D-18, D-38 (review of every authenticated-callable DEFINER function, by test), P-12A.2 (activity log writable by the audited party: verify the live append-only migration).
- **Root cause:** most policies test only "row's tenant is one of mine". They ignore the member's role and membership status (suspended, pending, deactivated users keep access; chat checks `chat_members` only), some grants are wider than any policy needs, and DEFINER functions can miss an internal tenant predicate while being correctly granted (the F-001 class), which no privilege test catches.
- **F-031 status:** closed in production by `20261020215422` (SELECT on `payroll_records`, `employee_salary_configs`, `salary_advances`, `salary_penalties`, `performance_bonuses`, `salary_config_history` → admin, `system.financials.view` or own rows; `expenses`, `role_salary_defaults` → admin or `system.financials.view`; `wallet`, `wallet_transactions` → `system.financials.view`). This package **verifies** it with matrix rows (the file is committed in PKG-00 00r) and closes the app half in PKG-03 (ROUTE_PERMISSIONS).
- **Files touched:** migrations `<ts>_chat_is_member_active.sql` (`chat_is_member` also requires an active `tenant_members` row and `user_profiles.is_active`; delete `chat_members` on removal), `<ts>_store_policies_membership_status.sql` (F-012 policies → `get_user_tenant_ids()` + `is_tenant_admin` for writes), `<ts>_narrow_reads.sql` (F-013: `user_permissions` to tenant/self, `system_health_checks` platform-admin only, `inventory_ledger` without the NULL branch, on `get_user_tenant_ids()`), `<ts>_column_grants.sql` (revoke anon `product_variants.cost`, review `reserved_quantity`/`stock_quantity`; revoke authenticated SELECT on `orders.product_cost`/`net_profit` for callers without `system.financials.view` via a view or column grant; revoke TRUNCATE and direct writes on `wallet_transactions`, `inventory_ledger`, `order_deletion_log`, `order_status_history` from anon/authenticated); `packages/supabase/tests/secdef_cross_tenant_harness.sql` (new); app callers that read those columns (`apps/platform/hooks/use-salaries.ts`, `apps/platform/hooks/use-payroll.ts`, finance hooks) switch to permission-checked RPCs where a member legitimately needs a total.
- **DEFINER behavioural harness (D-38):** live, 61 `public` SECURITY DEFINER functions are EXECUTE-able by `authenticated` (1 also by `anon`). 7 return `trigger` and cannot be called as RPCs (`chat_add_member_to_general`, `chat_broadcast_conversation`, `chat_broadcast_membership`, `chat_broadcast_message`, `chat_broadcast_reaction`, `chat_orders_event`, `notify_order_push`); the harness revokes their needless EXECUTE and covers the other 54. The callable list at 2026-10-21: `aggregate_experiment_stats`, `apply_store_config_v2_patch`, `charge_wallet_atomic` (loses EXECUTE in PKG-06), `chat_add_members`, `chat_archive_conversation`, `chat_assign_order`, `chat_create_channel`, `chat_create_group`, `chat_delete_conversation`, `chat_find_or_create_dm`, `chat_find_or_create_order_conversation`, `chat_is_conversation_admin`, `chat_is_member`, `chat_leave_conversation`, `chat_mark_all_read`, `chat_mark_read`, `chat_remove_member`, `chat_rename_conversation`, `chat_search_messages`, `chat_send_message`, `chat_set_conversation_icon`, `chat_set_conversation_resolved`, `chat_unread_counts`, `create_order_atomic(jsonb,uuid)`, `create_order_atomic(jsonb)` (dropped in PKG-02), `get_current_tenant_id`, `get_customer_dashboard_stats`, `get_customer_order_counts`, `get_customer_percentile`, `get_customer_reliability`, `get_customer_score_audit_log`, `get_customer_trust_history`, `get_order_duplicate_flags`, `get_orders_aggregates`, `get_paginated_customers`, `get_user_tenant_ids`, `has_tenant_permission`, `is_tenant_admin`, `log_shipping_export`, `lookup_order` (also anon; PKG-23), `merge_orders_atomic`, `notification_feed`, `notification_stats`, `notification_unread_count`, `process_return`, `publish_store_config_v2`, `recompute_inventory`, `seed_store_config_v2_draft`, `split_order_atomic` (2 overloads), `undo_return`, `unmerge_orders_atomic`, `unsplit_order_atomic`, `zero_oversold`. Method, generated from `pg_proc` so a new function is picked up automatically:
  1. As a tenant A admin (`set local role authenticated` + claims), call each function with every `uuid` argument replaced by a tenant B id of the matching kind from the seed (tenant, order, product, conversation, user), and text phone arguments replaced by a tenant-B-only phone.
  2. Assert **either** the call raises `42501`/a guard exception **or** a hash of every tenant B row in the tables the function body references (from `pg_depend` and a body scan) is unchanged, and any returned rows carry no tenant B data.
  3. A function without a seed mapping for one of its arguments fails the harness (no silent skip). Each failure is either fixed in this package or listed in the known-failures register with the package that fixes it.
- **Approach:** write the PKG-00 matrix rows and the harness first (they fail), then the migrations; one migration per concern so each can be rolled back alone. Role decisions use `has_tenant_permission` (no new role names).
- **Migration/rollout risk:** medium: a member who uses these pages today loses access (intended). Before each migration, count rows that would change visibility (for example `select count(*) from chat_members cm join user_profiles up on up.id=cm.user_id where up.is_active=false` = 2 today).
- **Rollback path:** each migration's header recreates the previous policy text (taken from `pg_policies` at write time).
- **Verification:**
  - RLS matrix in CI: employee SELECT on `payroll_records` returns only own rows; viewer SELECT on `expenses` returns 0; employee SELECT on `wallet_transactions` returns 0 unless granted `system.financials.view`; deactivated user SELECT on `chat_messages` returns 0; `has_column_privilege('anon','public.product_variants','cost','SELECT')` = false; `has_table_privilege('authenticated','public.wallet_transactions','TRUNCATE')` = false.
  - Harness: every callable DEFINER function passes; the run lists the function count it covered (54 at today's catalogue, fewer after PKG-02 drops the 1-arg `create_order_atomic` and PKG-06 revokes `charge_wallet_atomic`).
  - Supabase security advisor after apply: no `security_definer_view` ERROR and 0 "RLS enabled no policy" INFO rows.
  - e2e: employee opens `/salaries` → access denied (with PKG-03's route gate).
- **Effort:** L, ~34 h (F-031 verify 2 h; RLS migrations 14 h; harness 14 h; column grants 4 h).

### PKG-14 — Order and stock write integrity, with a storefront stock reservation (Wave 4)

- **Closes:** F-049, F-052, F-054, F-055, F-057
- **Also closes (REGRESSION):** MONEY-01 (platform idempotency), MONEY-02 (retry defeats the version check), EC1 (unlimited oversell, P0-class: launch-gating), DATA-02 / NEW-21 / NEW-22 / D-47 (direct stock writes), DATA-09 / P-12C.5 / D-32 (soft delete not enforced), DATA-04 / P-12C.1 / D-33 (no order state machine: add the minimal DB transition guard used by delete/restore/import).
- **Root cause:** order and stock writes are absolute and unversioned; storefront orders reserve nothing (`inv_phase('new')` = `CLOSED` live), so a "stock minus reserved" check passes for every concurrent and every sequential order of the last unit; a conflict retry drops the version; deletion is not an inventory event; the client forgets its idempotency key on reload.
- **Files touched:** `apps/platform/hooks/use-order-crud.ts` (F-052: on `CONFLICT_DETECTED` re-read and ask; status via `updateStatus` with version; notes appended), `apps/platform/components/orders/workflow/fulfill-tab.tsx`, `apps/platform/components/orders/workflow/delivery-tab.tsx`, `apps/platform/hooks/use-product-editor.ts` + `apps/platform/lib/repositories/product-repository.ts` (F-057: send only changed fields; stock changes as deltas through a ledgered RPC `adjust_stock(product, variant, delta, reason)`; `updated_at` compare), migration `<ts>_products_version.sql` (version column + trigger on `products`, `product_variants`), migration `<ts>_storefront_reservation.sql` (below), `apps/platform/app/api/orders/delete/route.ts`, `apps/platform/app/actions/deleted-orders.ts`, `apps/platform/app/orders/trash/page.tsx`, `apps/platform/app/api/cron/cleanup-deleted-orders/route.ts`, migration `<ts>_inventory_soft_delete_events.sql` (F-055: `inv_order_changed` treats `deleted_at` set/clear as release/re-apply; purge path inventory-neutral; forbid deleting FULFILLED orders or require a return first; store `original_order_id` for restore), `apps/platform/app/api/delivery-import/match/route.ts`, `…/confirm/route.ts`, `…/complete/route.ts` (filter `deleted_at is null`), `apps/storefront/app/actions/checkout.ts` (map the new `OUT_OF_STOCK` code with the line), `packages/sections/src/checkout_form.client.tsx`, `packages/sections/src/pdp_direct_order.client.tsx` (F-054: key in `sessionStorage` per cart hash; fix the "nothing was submitted" comment; show the sold-out line and offer to adjust).
- **Storefront reservation (F-049 / EC1):**
  1. `inv_phase` returns `RESERVED` for `status='new'` **when `source` is the storefront** (other sources keep today's phases), so a storefront order holds stock from the moment it is created; cancel, expiry of an unconfirmed order and deletion release it through the existing ledger.
  2. Inside `create_order_atomic`, before the insert, lock the order's product and variant rows with `SELECT … FOR UPDATE` in a fixed order (by id, to avoid deadlocks) and refuse with `OUT_OF_STOCK` (line id included) when `stock_quantity - reserved_quantity < qty` for any line of a product that tracks stock.
  3. An expiry job releases reservations of storefront orders still `new` after N hours (N from settings, default 48 h), so abandoned COD orders do not lock stock forever.
- **Approach:** DB first (version columns, `adjust_stock`, the reservation, soft-delete inventory events), then the clients. All stock writers go through the ledger.
- **Migration/rollout risk:** high (inventory). Before apply: `select inv_phase(status), count(*) from orders where deleted_at is not null group by 1` (50 trashed: 4 confirmed holding reservations, 46 closed, 0 fulfilled) and `select count(*) from orders where status='new' and source = <storefront source> and deleted_at is null` (the reservations the new phase will create at apply). Record expected stock deltas and compare after. The row lock serialises checkouts of the same product only; the load test measures it.
- **Rollback path:** migration headers restore the previous `inv_phase`/`inv_order_changed`/`inv_apply`/`create_order_atomic`; `adjust_stock` can stay unused; Vercel rollback.
- **Verification:**
  - SQL concurrency test (pgbench or 20 parallel `psql` sessions on the CI stack): **20 concurrent storefront checkouts for a product with 5 units produce exactly 5 orders and 15 `OUT_OF_STOCK` refusals; stock − reserved ends at 0**. Also sequential: the 6th checkout of 5 units is refused. Both fail today.
  - Delete a delivered order → purge → stock unchanged (fails today: the 7 live `trigger:FULFILLED:reverse` rows with NULL `order_id` show it); delete a confirmed order → reservation released; restore → re-applied; two concurrent `adjust_stock` calls sum correctly; an unconfirmed storefront order past the expiry releases its reservation once.
  - Vitest: conflict retry no longer calls `updateOrder` with `expectedVersion=undefined`; editor save without a stock change sends no `stock_quantity`.
  - Playwright: reload after submit on 3G-throttled checkout → one order; a sold-out line at checkout shows a message naming the line with an "adjust quantity" action, in `ar`, `en` and `ku` (the PKG-00 xfail entries for F-054 and F-049 are deleted).
  - Production after apply: `select count(*) from inventory_ledger where reason like '%FULFILLED:reverse' and order_id is null and created_at > <apply time>` stays 0 after the next nightly purge.
- **Effort:** L, ~36 h.

### PKG-15 — Tenant billing and renewal enforced in the database (Wave 4)

- **Closes:** F-043, F-059
- **Also closes (REGRESSION):** NEW-43, F-064 remainder (unique `subscriptions(tenant_id)`), D-11 (wallet floor review).
- **Root cause:** billing, usage counting, plan limits and pause enforcement run in one app code path (manual orders), fire-and-forget; the billing exemption for the house plan exists only in TypeScript (`apps/platform/lib/billing-exempt.ts`); renewal reads only `subscriptions.status` and writes `tenants.status`, so two sources of truth drift.
- **Depends on:** D-6 (billing, and what a shopper sees when the store is over its limit or paused).
- **Files touched:** migration `<ts>_order_billing_in_db.sql` (one SQL predicate `public.is_billing_exempt(plan)` — introduced by PKG-08's renewal fix if it lands first, reused here — used by the order-billing trigger, `renew_subscription_atomic` and the limit check; AFTER INSERT on `orders` or inside `create_order_atomic`: `increment_usage_tracking` always; `charge_wallet_atomic` per D-6 unless exempt; plan limit and pause check per D-6 for every channel unless exempt), `apps/platform/lib/billing-exempt.ts` (documents that SQL is the source of truth; a test asserts both lists match), `apps/platform/lib/order-service.ts` (remove `chargeAndTrack` / `canCreateOrder` duplication), `apps/platform/lib/webhook-handler.ts`, `apps/platform/lib/lightfunnels-api.ts`, `apps/storefront/app/actions/checkout.ts` (no app-side billing; map the limit and pause codes to localised messages), `apps/platform/app/api/cron/subscription-renew/route.ts` (renew only `auto_renew AND cancel_at IS NULL AND tenants.status IN ('active','trial')` and not exempt; never raise tenant status), `apps/admin/lib/trial-extension.ts` + `apps/admin/app/api/trials/extend/route.ts` + `apps/admin/app/api/merchants/[id]/extend-trial/route.ts` (also move the trialing subscription's period end), `apps/platform/lib/tenant.ts` (usage keyed by billing period), migration `<ts>_subscriptions_one_per_tenant.sql` (after a duplicate count).
- **Channel outcomes when the limit or pause applies:**
  - **Storefront (shopper):** per D-6(b). Default proposal: accept the COD order and flag it `over_limit` for the merchant (no lost sale), unless Ali chooses refuse; if refused, the shopper sees a localised message (`ar`/`en`/`ku`), never a raw error.
  - **Webhooks (LightFunnels, Interakt, Telegram):** never 4xx-and-drop. A 4xx makes LightFunnels stop retrying and the order is lost silently. The order is written to `checkout_queue` with status `blocked_limit` and the merchant is alerted; it is created when the limit lifts.
  - **Merchant warning:** a staff alert and an in-app banner at 80% of the plan limit (D-6(c)), and again at 100%.
- **Migration/rollout risk:** high (money). Live: the only ordering tenant is on plan `internal`; 1 tenant is `active` with a `cancelled` subscription. Run the new renewal query read-only against production first and show Ali the tenants it would charge.
- **Rollback path:** drop the trigger / restore the previous `create_order_atomic`; revert the cron.
- **Verification:**
  - SQL tests: an order from each channel (storefront RPC, service-role webhook insert, manual) increments `usage_tracking.orders_count` exactly once and (per D-6) writes exactly one wallet charge; an `internal` tenant's orders are counted and never charged, limited or refused; a paused tenant's webhook order lands in `checkout_queue` as `blocked_limit` and no 4xx is returned; replaying an order with the same idempotency key charges once.
  - Renewal vitest and SQL: cancelled, `auto_renew=false`, paused, admin-suspended and `internal` tenants are skipped; an extended trial is not charged at the original end.
  - Playwright: a store at its limit shows the localised over-limit outcome chosen in D-6 in `ar`, `en` and `ku`; the merchant sees the 80% banner on the seeded tenant at 80% usage.
  - Production after one week: `usage_tracking.orders_count` for the month equals `select count(*) from orders` for the same tenant and month.
- **Effort:** M, ~20 h.

### PKG-16 — One COD amount, whole-IQD money columns, a transactional delivery import (Wave 4)

- **Closes:** F-044, F-053, F-060
- **Also closes (REGRESSION):** NEW-05 (rollback dead / price rewrite), NEW-06 / P-R3.3 / D-45 (`orders.price` conventions; DB CHECK), NEW-07 (no COD cash ledger: received amount defaults to the courier claim — add `cod_expected` vs `cod_received` per import item), L-19, L-26 (`/api/delivery-import/parse` crashes on `pdf-parse` `DOMMatrix`), D-21 (cross-tenant half already fixed).
- **Root cause:** there is no single definition of "what the courier collects", money columns accept fractions although IQD has none in practice, and the delivery import is a multi-request client-orchestrated write that trusts the client's previous status.
- **Files touched:** `packages/shared/src/` (new `codAmount(order)` with tests, returning an integer; documented price convention: `price` = items net of discount, excluding delivery fee — the convention #172 makes the storefront follow), `apps/platform/lib/enhanced-label-generator.ts`, `apps/platform/lib/print-label.ts`, `apps/platform/lib/order-money.ts`, `apps/platform/lib/delivery-import/match-engine.ts`, `apps/platform/app/api/delivery-import/parse/route.ts`, `…/confirm/route.ts`, `…/rollback/route.ts`, migration `<ts>_delivery_import_rpc.sql` (one DEFINER `confirm_delivery_import(import_id, items jsonb)` in one transaction, reading `previous_*` server-side, unique `(tenant_id, receipt_number)` per confirmed import, version/status precondition, row counts; `rollback_delivery_import` reverting only rows still at the import's status; the four missing `previous_*` columns; explicit GRANT to `authenticated` and a harness mapping), migration `<ts>_money_checks.sql` (below).
- **Whole-IQD CHECKs (`<ts>_money_checks.sql`):** on `orders.price`, `orders.delivery_fee`, `orders.discount_amount`, `products.price`, `products.cost`, `products.compare_at_price`, `product_variants.price`, `product_variants.cost`, `product_variants.compare_at_price`: `CHECK (col >= 0 AND col = trunc(col))` (NULL allowed where the column is nullable). Live: all nine are unconstrained `numeric`; 0 order rows hold a fractional price or fee (count query, 2026-10-21); the product columns are counted the same way before apply. Added `NOT VALID` then `VALIDATE CONSTRAINT` so the table is not locked for the scan.
- **Approach:** add `codAmount` and route every template, the import matcher and the printing totals through it; replace the confirm/rollback writes with the two RPCs; fix the `pdf-parse` load (server-external package, or parse on a Node runtime with a `DOMMatrix` polyfill; verify on a preview); add the money CHECKs.
- **Migration/rollout risk:** medium. Before the CHECKs: count violating rows per column (expect 0). Duplicate receipts exist live (4 receipts imported 2–3 times): the unique index must be partial (from the migration date) or the duplicates resolved first — show Ali the 4.
- **Rollback path:** drop RPCs and constraints; code revert.
- **Verification:**
  - vitest `codAmount` table test across all six templates (classic, modern, prime, invoice, shipping label, generic) for an order with a fee and a discount — all print the same number (fails today); `codAmount` throws (or the type refuses) on a fractional input, and its result is `Number.isInteger`.
  - SQL tests: confirm twice with the same receipt → second refused; confirm with an audit insert failure → no order changed; rollback after a later manual status change leaves that order untouched; `insert into orders(… price …) values (… 1000.5 …)` raises the CHECK; `update products set price = 2500.25` raises.
  - e2e Waseet manual journey (PKG-00) green and its xfail entries deleted; Vercel runtime errors show no `DOMMatrix` crash after a real PDF parse on a preview.
  - Production after apply: `select count(*) from pg_constraint where conname like '%whole_iqd%' and convalidated` = 9.
- **Effort:** L, ~24 h.

### PKG-17 — Per-tenant keys for customers and external orders (Wave 4)

- **Closes:** F-018, F-034, F-035, F-042, F-062
- **Also closes (REGRESSION):** NEW-36, SEC-D (ai-summary write), NEW-47 (`calculate_customer_trust` unindexed cross-tenant seq scan on every order write), L-17 (`checkBlacklist` and dedup ignore tenant), D-31 (`order_id` globally unique), SEC-C (e), L-20 (nullable `tenant_id` on the tables touched here), D-22 remainder, `checkout_queue` NULL backfill (single owner).
- **Root cause:** identifiers that belong to a tenant are global: customer phone (`customer_metadata` PK, trust), external order numbers (global `orders_order_id_key`, cross-tenant duplicate check), LightFunnels checkout ids and the access token (one global `settings` row, env tenant).
- **Severity note:** after PKG-02's `trg_orders_order_id_server_only`, a tenant can no longer plant an `order_id`, so F-042 is P3 (accidental collision of external numbers under the service role). F-062 stays a pre-launch blocker only if D-7 says AI summaries ship.
- **Depends on:** D-7 for the order of work: if AI summaries ship, F-062 goes first.
- **Files touched:** migration `<ts>_customer_metadata_tenant_pk.sql` (PK `(tenant_id, customer_phone)`; `customer_metadata` has **0 rows** live, so this is a no-data key change: no backfill, no split — a split would have copied one tenant's notes into another tenant), `apps/platform/app/api/customers/[phone]/ai-summary/route.ts` (`onConflict: "tenant_id,customer_phone"`), `apps/platform/lib/backup-utils.ts` (the metadata upsert key; the browser restore is retired in PKG-24), migration `<ts>_customer_trust_tenant_arg.sql` (`calculate_customer_trust(_tenant_id, phone)`; triggers pass `NEW.tenant_id`; index `(tenant_id, phone_norm)`), migration `<ts>_orders_external_ref.sql` (`external_source`, `external_id`, unique `(tenant_id, external_source, external_id)`; `order_id` stays server-generated after PKG-02), `apps/platform/lib/webhook-handler.ts` (duplicate check per tenant on the external ref), migration `<ts>_lightfunnels_per_tenant.sql` (`tenant_integrations` row per LightFunnels store → tenant, per-tenant token; `checkout_queue.tenant_id` backfilled for the 487 NULL rows, then NOT NULL; unique `(tenant_id, checkout_id)`), `apps/platform/app/api/webhooks/lightfunnels/route.ts`, `apps/platform/lib/lightfunnels-api.ts`, `apps/platform/app/api/cron/process-checkouts/route.ts`, `apps/platform/lib/qstash.ts`, `apps/platform/vercel.json` (F-035: a sweeper cron for `processed_at is null and process_after < now()`; webhook returns non-2xx when scheduling fails; check the `processed_at` update).
- **Migration/rollout risk:** medium for `customer_metadata` (0 rows) and the trust function; high for the LightFunnels mapping (the largest live order source: 287 of 390 October orders). Deploy the per-tenant LightFunnels mapping with the existing env tenant as the single row first, then remove the env fallback.
- **Rollback path:** each migration keeps the old columns until the code no longer reads them; headers hold the reverse DDL.
- **Verification:**
  - SQL tests: tenant B's AI-summary upsert for a phone tenant A has creates a second row and leaves A's row unchanged; two tenants receiving LightFunnels number `1234` both keep their order; `calculate_customer_trust` for a shared phone writes only the given tenant.
  - Vitest: a QStash publish failure returns 5xx to the webhook; the sweeper processes a stuck row once.
  - Production: `select count(*) from checkout_queue where tenant_id is null` = 0; `EXPLAIN` of the trust trigger query shows an index scan.
- **Effort:** L, ~18 h.

### PKG-18 — Hot read paths, refresh jobs and retention (Wave 5, before the load test; in the launch gate)

- **Closes:** F-025, F-026, F-027, F-028
- **Also closes (REGRESSION):** ORD-1, ORD-2, ORD-3 (windowed cache drives dashboards; full-book path through the non-indexable view), NEW-P1-25 (customers-page revenue counts `confirmed`, browser months, no `deleted_at`), PERF-05, D-39 (unindexed FKs on hot tables only), D-40 (`auth_rls_initplan` on hot tables), D-41 (multiple permissive policies on hot tables).
- **Root cause:** hot reads do work proportional to the tenant's (or the platform's) whole history: an unindexed receipt lookup, a view joining every customer through a function no index matches, full materialised-view refreshes every 10 minutes, a heartbeat that sorts all orders; and append-only tables have no retention.
- **Files touched:** migrations `<ts>_whatsapp_logs_indexes.sql` (`CREATE INDEX CONCURRENTLY` on `(interakt_message_id)` and `(tenant_id, created_at desc)`), `<ts>_orders_phone_norm.sql` (stored `phone_norm` on `orders` and `customer_trust`, index `(tenant_id, phone_norm)`; view joins on it), `<ts>_orders_heartbeat_index.sql` (`(tenant_id, updated_at desc) where is_archived = false`), `<ts>_incremental_customer_aggregates.sql` (trigger-maintained per-tenant aggregates or a dirty-tenant set; `refresh-tenant-public-stats` per tenant on change), `<ts>_retention_jobs.sql` (pg_cron: prune `api_rate_limits` rows past their window — no job does today; keep `storefront_events` and `analytics_events` 13 months; keep `whatsapp_logs` bodies 12 months then strip the payload, keeping status rows — Ali confirms the windows); `apps/platform/lib/repositories/order-repository.ts` (detail paths read the base table plus one trust row), `apps/platform/hooks/use-realtime-heartbeat.ts` (restore the `is_archived` filter), `apps/platform/lib/whatsapp-delivery-receipts.ts`, `apps/platform/hooks/use-business-metrics.ts` (server aggregate with Baghdad time zone and `deleted_at is null`).
- **Migration/rollout risk:** medium. `CREATE INDEX CONCURRENTLY` cannot run inside a transaction: these migrations are single-statement files. The `phone_norm` backfill touches ~23k orders: batch it. The first retention run deletes old rows: count first.
- **Rollback path:** `drop index concurrently`; the view's previous definition is in the migration header; cron schedules restored with `cron.schedule`/`cron.unschedule`.
- **Verification (measurements):**
  - `EXPLAIN (ANALYZE, BUFFERS)` before/after recorded in PROGRESS.md: receipt lookup → Index Scan; `v_orders_with_risk` list query for the top tenant from 305–1,398 ms to < 50 ms, no sort spill; detail (`findById`) < 10 ms; heartbeat < 5 ms.
  - `pg_stat_statements` after 7 days: refresh jobs < 5% of total DB time (24.5% today) and each run < 25% of its interval; `create_order_atomic` and the view out of the top 5.
  - User-visible: on the seeded 110k-order tenant, the order list's first content at 360 px is under 1.5 s on a throttled "Fast 3G" Playwright profile.
  - `select count(*) from cron.job where command ilike '%api_rate_limits%'` = 1 and its next run succeeds.
  - Then the load test (§7) proves it at 10x volume.
- **Effort:** M, ~20 h.

### PKG-19 — Server-side HTML rendering (Wave 4)

- **Closes:** F-016, F-033
- **Also closes (REGRESSION):** NEW-P1-05 / SEC-25 / D-23 (generate-batch-pdf SSRF with the response returned), NEW-04 (customer text executes in the merchant's session through the label generator), NEW-P1-36 (QC print popup SKU XSS), D-29 (stored XSS sinks), L-07.
- **Root cause:** HTML is built by string interpolation without one escaping helper, and the server renders HTML that the client sent.
- **Files touched:** `apps/platform/app/api/generate-batch-pdf/route.ts` (server builds the HTML from order ids the caller's tenant owns; request interception blocks every non-`data:` URL; `try/finally browser.close()`), `apps/platform/app/api/payslip-pdf/route.ts` + `apps/platform/lib/payslip-html.ts` (load the record server-side by id, tenant-scoped, `system.financials.view` or own record; escape `ref`; UUID check), `apps/platform/lib/enhanced-label-generator.ts`, `apps/platform/lib/print-label.ts`, `apps/platform/lib/batch-printer.ts`, `apps/platform/components/products/qc-quarantine-tab.tsx`, `packages/shared/src/` (one `escapeHtml` used everywhere; a CI grep bans `${` inside HTML template literals without it in these files).
- **Migration/rollout risk:** low.
- **Rollback path:** Vercel rollback.
- **Verification:** vitest: an order whose customer name is `<img src=x onerror=alert(1)>` renders as text in every label template; payslip with `record.id = '<img src=//x.co>'` → 400; generate-batch-pdf with a body `html` field → ignored/400; a forced render error leaves no Chromium process (mock `puppeteer.launch`, assert `close` called in the error path). Preview: Vercel function logs show no outbound request to a test canary URL placed in an order field.
- **Effort:** M, ~10 h.

### PKG-20 — Secrets out of anon-readable store config (Wave 4)

- **Closes:** F-010
- **Also closes (REGRESSION):** L-40 (Meta CAPI / TikTok tokens in anon-readable `tenants.store_config_v2`), and the newsletter-reward extension of F-010.
- **Root cause:** `tenants.store_config_v2` is readable by `anon` as a whole column, so anything stored in it is public (discount codes, pixel API tokens, newsletter reward codes); redaction only happens in page payloads.
- **Files touched:** migration `<ts>_discounts_table.sql` (`discount_codes` table with RLS and explicit grants: tenant admin writes, no anon read; usage counters; per-customer limit), migration `<ts>_tenant_secrets.sql` (`tenant_secrets` table, service-role only, for CAPI tokens and newsletter reward codes; move existing values; strip them from `store_config_v2`), `packages/shared/src/discount.ts` (server-side validation against the table), `apps/storefront/app/actions/checkout.ts`, `apps/storefront/lib/capi.ts`, `apps/storefront/app/api/newsletter/route.ts`, `apps/storefront/lib/tenant.ts`, builder screens `apps/platform/components/store-builder-v2/discounts-screen.tsx`, `apps/platform/components/store-builder-v2/pixels-screen.tsx`; an `apply_store_config_v2_patch` allowlist change that refuses secret paths in `store_config_v2`.
- **Migration/rollout risk:** medium: 1 tenant has 1 discount code live; move it in the same migration and keep reading both for one release.
- **Rollback path:** the migration keeps a copy; reverse migration restores the JSON paths.
- **Verification:** SQL as anon on the fixture: `select store_config_v2->'commerce'->'discounts' from tenants` returns null for every tenant; `select * from discount_codes` → permission denied or 0 rows for anon; vitest: an unknown or exhausted code is rejected at checkout; production after migrate: `select count(*) from tenants where store_config_v2->'commerce' ? 'discounts'` = 0.
- **Effort:** M, ~10 h.

### PKG-21 — Notification delivery ledger: web push and WhatsApp (Wave 5; in the launch gate)

- **Closes:** F-029, F-037
- **Also closes (REGRESSION):** P-0.4 (`prune-order-notifications` fails every run, live 2026-10-20), L-24 (service worker push handlers), L-37 (eight dead realtime subscriptions on unpublished tables: publish or remove), L-22 (no timeout on outbound calls, Interakt part).
- **Why in the gate:** risk #10 names F-029 (push dead since 2026-10-11) and the load test seeds notification volume that only a working prune keeps realistic (§7).
- **Root cause:** notifications are fire-and-forget: there is no per-message delivery state, so pruned push subscriptions are never re-created, retries at two layers can send the same WhatsApp template up to ≈9 times, and the health check counts rows instead of deliveries.
- **Files touched:** `apps/platform/hooks/chat/use-web-push.ts` (reconcile the browser subscription with the server row on load; upsert if missing), `supabase/functions/send-order-push/index.ts`, `apps/platform/public/sw.js` / `apps/platform/app/sw.ts` (one source of push handlers, built by the build), `apps/platform/lib/interakt.ts` (retry only definite pre-send failures; `AbortSignal.timeout`), `apps/platform/app/api/cron/auto-follow-up/route.ts` (a `sending` `whatsapp_logs` row keyed by `(order, template, window)` inserted before the send; unique index), migration `<ts>_fix_prune_notifications.sql` (the job references the non-existent `public.chat_notifications`), migration `<ts>_health_delivery_freshness.sql` (health check fails when no delivery succeeded in N hours while notifications were created), `apps/platform/components/providers/global-activity-provider.tsx`, `apps/platform/components/team/hooks/use-team-realtime.ts`, `apps/platform/hooks/use-expenses.ts`, `apps/platform/hooks/use-announcements.ts`, `apps/admin/hooks/use-admin-realtime.ts` (L-37).
- **Migration/rollout risk:** low; the prune job will delete old notifications for the first time (count first: rows older than 90 days).
- **Rollback path:** `cron.unschedule`/re-schedule; code revert.
- **Verification:**
  - Production: `select count(*) from chat_push_subscriptions` > 0 within a day of deploy (0 today); `notification_deliveries` shows a `sent` row newer than the deploy; `cron.job_run_details` for `prune-order-notifications` shows `succeeded` on the next run; the health check turns red in a fixture test where deliveries are stopped.
  - User-visible (manual, once, on one real Android phone and one iPhone with the PWA installed): a staff device with notifications enabled receives a push for a new order within 30 s.
  - Vitest: a network error after the request is sent does not re-POST; a QStash retry of auto-follow-up finds the `sending` row and does not send again.
- **Effort:** M, ~12 h.

### PKG-22 — Private realtime channels and returns-scan status (Wave 5)

- **Closes:** F-020, F-038, F-078
- **Root cause:** broadcast and presence channels are public (`private` not set), so the topic string is the only secret; the returns-scan phone shows a static "live" with no acknowledgement state.
- **Files touched:** `apps/platform/hooks/use-returns-session.ts`, `apps/platform/app/returns/scan/page.tsx`, `apps/platform/hooks/use-presence.ts`, `apps/platform/components/orders/presence-avatar-group.tsx`, `apps/platform/components/chat/order-thread-card.tsx`, migration `<ts>_realtime_private_topics.sql` (`realtime.messages` policies: `returns:<token>` bound to a session row of the caller's tenant; `presence:<orderId>` bound to an order in `get_user_tenant_ids()`).
- **Approach:** `private: true` on both channels; a per-session returns token rotated on each pairing; the phone page shows connecting / connected (laptop present) / disconnected, marks each scan pending until `ack` with a timeout and retry; controls ≥ 44 px and inputs 16 px; copy through i18n (PKG-30 keys). The SQL test runs on the Supabase CLI stack (PKG-00), which has the `realtime` schema.
- **Migration/rollout risk:** low; a live pairing breaks at deploy (re-pair).
- **Rollback path:** drop the policies; code revert.
- **Verification:** SQL test on `realtime.messages` policies for anon and another tenant (denied); Playwright with two browser contexts: a second, unauthenticated context cannot join `returns:<token>`; closing the laptop tab turns the phone header to "disconnected" within 10 s and an unacked scan shows "not confirmed".
- **Effort:** M, ~10 h.

### PKG-23 — Abuse limits on public storefront endpoints; security headers (Wave 4; in the launch gate)

- **Closes:** F-017
- **Also closes (REGRESSION):** D-27 remainder (rate limiting), D-28 (security headers / CSP on storefront and platform).
- **Root cause:** public endpoints that reveal or create data have no limiter; `lookup_order` is still EXECUTE to `anon`, so the route's limiter can be bypassed through PostgREST.
- **Files touched:** `apps/storefront/app/api/orders/lookup/route.ts` + migration `<ts>_lookup_order_service_only.sql` (revoke anon EXECUTE; route calls with the service role), `apps/storefront/app/api/reviews/route.ts` (private holding bucket `review-photos-pending`, moved on approval), `apps/storefront/app/api/exp-event/route.ts` and `apps/storefront/app/api/events/route.ts` (limit per IP and session; `events` is new on `main` and writes `storefront_events` with the service role), `apps/platform/app/actions/orders.ts` (`checkOrderIdExists` scoped to the caller's tenant), the shared limiter from PKG-02/PKG-07 (`consume_rate_limit`; limits read from per-environment config so the load-test preview can raise them without a code path, §7), `apps/storefront/next.config.ts`, `apps/platform/next.config.ts` (headers). F-017(1) is already removed by #172.
- **Migration/rollout risk:** low. CSP starts in `Content-Security-Policy-Report-Only` for 48 h on a preview, then enforced.
- **Rollback path:** re-grant; code revert.
- **Verification:** `select has_function_privilege('anon','public.lookup_order(uuid,text,text)','EXECUTE')` = false (live signature `lookup_order(uuid,text,text)`); vitest: 11th lookup per IP in the window → 429; 1,000 `/api/events` posts from one IP in a minute are capped; review photo upload lands in the private bucket; `checkOrderIdExists` for another tenant's id → false; `curl -I` on a store page shows `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`.
- **Effort:** S, ~6 h.

### PKG-24 — Browser-orchestrated multi-table writes moved into RPCs: payroll and vault (Wave 4)

- **Closes:** F-056, F-061
- **Also closes (REGRESSION):** NEW-24, MONEY-08, DATA-07 / D-35 (in-app part), `vault_backups` retention (F-022 storage growth).
- **Root cause:** money and restore operations are sequences of browser writes with no transaction, no uniqueness and unchecked audit inserts.
- **Files touched:** `apps/platform/hooks/use-payroll.ts`, `apps/platform/hooks/use-salaries.ts`, `apps/platform/components/salary/salaries-tab.tsx`, migration `<ts>_run_payroll.sql` (DEFINER `run_payroll(tenant, employee, period)`: `system.financials.view` or admin, row lock, partial unique `(tenant_id, employee_id, period_start, period_end) WHERE status='paid'`, `UPDATE … WHERE is_deducted=false RETURNING`, one transaction), `apps/platform/lib/vault-utils.ts` (delete the browser `upsert` restore at `:286-304`), `apps/platform/lib/backup-utils.ts` (delete the browser restore at `:75-100`), `apps/platform/app/vault/page.tsx`, migration `<ts>_vault_tenant_prefix.sql` (per-tenant prefix policy on `vault_backups`: admin write, members none; DEFINER `restore_vault_snapshot` in one transaction; DEFINER `log_security_event`), `apps/platform/app/api/cron/backup/route.ts` (per-tenant folders; 14-day retention delete).
- **Ordering:**
  - The 14-day retention delete ships **only after PKG-00's outside backup has run at least once successfully and its restore drill passed**: today those CSVs are the only copy of some history.
  - `restore_vault_snapshot` must pass #173's `trg_orders_items_tenant_guard` (items reference only the snapshot tenant's products) and #175's `trg_orders_order_id_server_only` (it runs as DEFINER/service, restores rows with their stored `order_id`, and never inserts through the `authenticated` path). The browser restore paths are deleted because #175's trigger already refuses them.
- **Migration/rollout risk:** medium. Before the unique index: `select tenant_id, employee_id, period_start, period_end, count(*) from payroll_records where status='paid' group by 1,2,3,4 having count(*)>1` (counts only) — resolve duplicates with Ali first.
- **Rollback path:** drop RPCs and index; code revert; the retention delete is a cron line to remove.
- **Verification:** SQL test: two concurrent `run_payroll` for one period → one paid record, advances deducted once; restore of a snapshot whose items reference another tenant's product → refused by the guard, nothing changed; restore with a failing third table → nothing changed; vitest: Pay-all and single confirm both call the RPC; production: `security_logs` gets a `VAULT_RESTORE` row on a test restore of the internal tenant; `vault_backups` total size stops growing after 14 days (`select sum((metadata->>'size')::bigint) from storage.objects where bucket_id='vault_backups'`, 321 MB on 2026-10-21).
- **Effort:** M, ~14 h.

### PKG-25 — Vulnerable and unused dependencies (Wave 4; in the launch gate)

- **Closes:** F-039
- **Also closes (REGRESSION):** SEC-16, L-30, L-33 (closed: `next` 16.3.8), L-41 (delete the decommissioned live edge function `migrate-scheniders-iraq-product-images`), L-29 (customer phones in committed `apps/platform/Prime file.pdf` and `Prime file copy.pdf`; scratch debris).
- **Files touched:** `apps/platform/package.json` (drop `pdfjs-dist`, `html2pdf.js`; `jspdf` to a patched 4.x), `apps/platform/next.config.ts` (`serverExternalPackages`), the seven SheetJS importers (`components/admin/data-import/export-step.tsx`, `components/team/export-report.tsx`, `components/products/import-export/import-wizard.tsx`, `components/products/import-export/export-builder.tsx`, `hooks/use-data-importer.ts`, `lib/vault-utils.ts`, `lib/excel-importer.ts`; dynamic import, or ExcelJS which is already a dependency), `pnpm-lock.yaml`, CI `pnpm audit --prod --audit-level=critical` step.
- **Migration/rollout risk:** medium (jspdf 3→4 API changes in PDF generators: covered by the label/payslip tests of PKG-19).
- **Rollback path:** lockfile revert.
- **Verification:** `pnpm audit --prod` shows 0 critical; the SheetJS chunk is absent from the entry chunks of `/admin/data-import` and `/vault` (build manifest check); `git ls-files | grep -E 'Prime file'` returns nothing (removing from history is a separate decision); PDFs from every template render in the PKG-19 tests.
- **Effort:** M, ~8 h.

### PKG-26 — Storefront failure handling and page states (Wave 4; in the launch gate)

- **Closes:** F-045, F-047, F-050, F-070, F-073
- **Also closes (REGRESSION):** NEW-P1-35 / PROD-08 / D-44 (verify only: `apps/storefront/app/s/[tenant]/sitemap.xml/route.ts` exists on `main`).
- **Status at 3365a7d0:** `loading.tsx` exists for search, category, catalogue and product routes (`ee847028`); 404/redirect status is decided above them (`46fdb41c`, `apps/storefront/app/route-status-boundaries.test.ts`). Still open: cached errors (F-045), suspended stores as 404 (F-047), awaited CAPI (F-050), cart/checkout empty flash (F-070), no tenant-level `error.tsx` and Arabic-only root error pages (F-073 remainder).
- **Root cause:** the storefront has no error model: errors are cached as "not found/empty", there is no tenant-level error UI, third-party calls block the response, and client state renders before it is known.
- **Files touched:** `apps/storefront/lib/tenant.ts`, `apps/storefront/lib/queries.ts` (throw inside cached functions; cache only success), `apps/storefront/app/s/[tenant]/layout.tsx` (suspended/limited/paused page via a narrow DEFINER `storefront_tenant_status(slug)`, which also reads PKG-05's `orders_paused` flag), `apps/storefront/app/s/[tenant]/loading.tsx` (new, home and remaining routes) and `error.tsx` (new), `apps/storefront/app/error.tsx`, `apps/storefront/app/not-found.tsx`, `apps/storefront/app/layout.tsx` (server `lang` from the tenant/visitor locale; never `dir`), `apps/storefront/app/actions/checkout.ts` + `apps/storefront/lib/capi.ts` (`after()` + `AbortSignal.timeout(3000)`), `packages/sections/src/helpers/cart-store.ts`, `apps/storefront/components/cart-hydrator.tsx`, `packages/sections/src/cart_line_items.client.tsx`, `packages/sections/src/cart_summary.client.tsx`, `packages/sections/src/checkout_order_summary.client.tsx`, `packages/sections/src/checkout_form.client.tsx` (hydrated flag + skeleton; empty-checkout branch linking to `/products` via `StoreLink`), `apps/storefront/app/robots.ts`.
- **Migration/rollout risk:** low (one small DEFINER function, anon EXECUTE granted explicitly, returns status only; harness mapping added).
- **Rollback path:** code revert; drop the function.
- **Verification:** vitest: a thrown DB error in `selectTenant` is not cached (second call retries); Playwright: with the tenant query forced to fail once (test hook in the local stack), the next request renders the store; suspended tenant URL and the `orders_paused` state show "temporarily unavailable" in `ar`, `en` and `ku` with HTTP 503, not 404; cart page SSR HTML contains the skeleton, not "Your cart is empty"; `/checkout` with an empty cart shows the empty state; an English store's server HTML has `<html lang="en">`; checkout responds within budget with a mocked 10 s CAPI endpoint; `/s/<slug>/sitemap.xml` lists the tenant's products.
- **Effort:** M, ~16 h.

### PKG-27 — Retire the legacy storefront fallback; store-base links (Wave 4; in the launch gate)

- **Closes:** F-048, F-071, F-072
- **Also closes (REGRESSION):** SEC-34 (stored XSS via legacy templates + `?preview_template`), EC11 (empty home shows the legacy template), P1-25 (base-path links).
- **Why in the gate:** F-071 is P2 only because the 6 legacy-served tenants have 0 orderable products; launch is when they start selling, so it is P1 at launch.
- **Depends on:** D-15.
- **Root cause:** a second, legacy storefront (components under `apps/storefront/components/schneiders/`, `apps/storefront/components/storefront/`, `apps/storefront/templates/`) still serves most pages for 6 of 7 active tenants, with invented copy, a different delivery-fee rule, fake tracking and a fake newsletter; some links bypass the store base path.
- **Files touched:** `apps/storefront/lib/storefront-runtime.ts` (EC11 rule for every page: a tenant never falls back to legacy; an empty V2 page renders a V2 default page), every legacy page under `apps/storefront/app/s/[tenant]/` (`about`, `contact`, `faq`, `search`, `track`, `checkout`, `checkout/success`, `policies/terms`, `policies/privacy`, `policies/returns`, `policies/shipping`) switched to V2 sections, delete `apps/storefront/components/schneiders/checkout-form.tsx`, `track-form.tsx`, `newsletter-popup.tsx`, `order-recap.tsx`, `apps/storefront/components/storefront/CheckoutForm.tsx`, `ProductCard.tsx`, `CartView.tsx`, `ProductDetailClient.tsx` once unused; `apps/storefront/lib/utils.ts` (`formatIQD` → sections `formatPrice`, Latin digits, whole numbers); `packages/sections/src/order_tracker.client.tsx`, `packages/sections/src/exit_intent_offer.client.tsx`, `packages/sections/src/helpers/primitives.tsx` (`ChunkyLink` prefixes `useStoreBase()`; exit-intent CTA as a `ChunkyLink`, no button inside a link); default V2 seed for the 6 tenants (a migration-free per-tenant config write through the existing seed RPC, run by Ali's OK).
- **Migration/rollout risk:** medium (visible change for 6 merchants; they have 0 orderable products today, which makes now the cheapest moment).
- **Rollback path:** code revert (legacy files restored by git).
- **Verification:** Playwright in `/s/<slug>` mode for a legacy tenant: every page renders V2 sections; no text "We started Schneiders", "Avg response", "10,000+", "taxes"; prices show Latin `85,000 د.ع`; the tracker "Order again" link stays under `/s/<slug>/`; `rg -l "components/schneiders|components/storefront" apps/storefront/app` returns nothing; `?preview_template=` has no effect for anon.
- **Effort:** M, ~14 h.

### PKG-28 — Builder settings the live render ignores or gets wrong (Wave 5)

- **Closes:** F-066, F-069
- **Also closes (REGRESSION):** ARCH-P0-7 (patch API: Zod validation and read-modify-write race), BA-6.3 (no `sandbox` on the preview iframe), NEW-P1-34 (health-checklist navigates to page id "0"), NEW-P1-37 (27 missing section thumbnails).
- **Root cause:** the store-config resolver's output is not what the live page needs: breakpoint variants are resolved once with a hard-coded "mobile" (`storefront-runtime.ts:88`), and brand-kit colours pick text colours with a wrong threshold (`brand-kit-vars.ts:425`).
- **Files touched:** `apps/storefront/lib/storefront-runtime.ts`, `apps/storefront/components/v2-page.tsx`, `packages/shared/src/types/store-config-v2-resolver.ts`, `packages/shared/src/types/store-config-v2.ts`, `packages/sections/src/_types.ts` (per-section `breakpointVariants` capability), `apps/platform/components/store-builder-v2/inspector-rail.tsx` (hide breakpoint controls where not allowed), `packages/shared/src/brand-kit-vars.ts` (on-colour by maximum contrast; derived `--bk-danger-text` ≥ 4.5:1 on surface), `packages/sections/src/helpers/primitives.tsx`, `packages/shared/src/health-rules.ts` (kit contrast rule), `apps/platform/app/api/store-config-v2/patch/route.ts` (Zod per root; version compare), `apps/platform/components/store-builder-v2/editor-shell.tsx` (iframe `sandbox`), `apps/platform/components/store-builder-v2/health-checklist-screen.tsx`, thumbnails under `apps/storefront/public/sections/`.
- **Approach — F-066 (Ali picks; 0 live configs use breakpoint rules today):**
  - **Option 1 (recommended now, smallest):** hide the breakpoint controls in the builder until responsive output ships, and make the resolver ignore stored breakpoint overrides (none exist live). Root-cause-correct: the setting stops promising something the render does not do.
  - **Option 2 (responsive output):** render a section **once**. Breakpoint differences are allowed only for leaf content props (text, image) — emitted as sibling elements with responsive visibility classes — and for style props — emitted as CSS custom properties per breakpoint (`--sec-pad-md`, …) consumed by container queries. Interactive client sections (checkout form, cart, PDP direct order, newsletter, product finder) declare `breakpointVariants: false` in the section schema and the builder hides the controls for them, so no state, DOM id, analytics impression or `<h1>` is duplicated.
- **Migration/rollout risk:** low (0 live configs use breakpoint rules).
- **Rollback path:** code revert.
- **Verification:** Option 1: the inspector shows no breakpoint control (vitest) and the resolver output is identical with and without stored overrides. Option 2: vitest on the resolver: a desktop text override renders inside a `md:`-scoped element and the mobile value inside its complement; Playwright at 360 and 1440 px: "hide on mobile" leaves the section visible at 1440 px; a page with desktop and mobile overrides has exactly one `<h1>`, one checkout `<form>` and one analytics impression per section. Both options: contrast unit test over the seven kits: every `--bk-on-primary` and `--bk-danger-text` ≥ 4.5:1 (fails today on four kits with 2.86–3.55); patch API rejects an invalid root with 400 and a stale version with 409.
- **Effort:** M, ~14 h (Option 1 ≈ 8 h of it).

### PKG-29 — Storefront locales: Kurdish strings, coded errors, track handoff (Wave 5)

- **Closes:** F-085, F-086
- **Status at 3365a7d0:** Kurdish strings exist on the conversion path (`4aea0a80`, for example `checkout_form.client.tsx:62-64`); the lookup form already hands the phone over in `sessionStorage` (`track_order_lookup.client.tsx:91`, read at `order_tracker.client.tsx:188`). Still open: the thank-you page does not hand the phone over (F-085 first half), Kurdish in the remaining sections, and Arabic-only server error prose (F-086). Kurdish quality depends on D-19.
- **Root cause:** section strings are incomplete for `ku`; the server returns Arabic prose instead of error codes; the success page does not hand the phone to the tracker.
- **Files touched:** `packages/sections/src/checkout_form.client.tsx`, `packages/sections/src/order_confirmation.client.tsx`, `packages/sections/src/order_tracker.client.tsx`, `packages/sections/src/helpers/catalog-grid.tsx`, `packages/sections/src/helpers/locale-switch.tsx`, `apps/storefront/app/actions/checkout.ts`, `apps/storefront/app/api/checkout/orders/route.ts` (error codes).
- **Approach:** server returns `{ code }`; client maps codes to `STRINGS[locale]`; add the remaining `ku` strings (authored per D-19), or hide `ku` in the switcher until authored; on success, write the normalised phone to the existing `sessionStorage` key `sch:track:phone`, and the tracker removes it after the first successful lookup (it is a customer phone on a possibly shared device).
- **Migration/rollout risk:** low.
- **Rollback path:** code revert.
- **Verification:** vitest: every server error code has an `en`, `ar` (and `ku` if kept) string (a test enumerates codes from the server module); Playwright: complete a checkout, tap "Track order" → the tracker shows the order without asking for the phone, and afterwards `sessionStorage.getItem('sch:track:phone')` is null; a `ku` store shows no Arabic in checkout.
- **Effort:** S, ~4 h.

### PKG-30 — Platform: one message catalogue and one formatter (Wave 5)

- **Closes:** F-074, F-075, F-076
- **Also closes (REGRESSION):** NEW-P1-29 (en-US dates without time zone), NEW-P1-38 (raw Supabase error in the AutoForm upload toast), I18N-D3, SEC-35 / P-12D.2 / D-30 (CSV formula injection: the export helper is rewritten here).
- **Root cause:** there is no enforced single source for UI text, dates, numbers and IQD: `t()` returns the key on a miss, many screens never call `t()`, and formatting is done ad hoc with six locale conventions.
- **Scope (from F-074..F-076):** 332 missing keys; about 400 Arabic literal lines in 21 files; 153 toasts with hard-coded literals; 95 bare `toLocaleString()` calls; 24 `en-GB`/`en-CA` sites; CSV escaping.
- **Files touched:** `apps/platform/components/providers/language-provider.tsx` (miss → fallback in production, logged; locale persisted in a cookie so the server renders it), `apps/platform/lib/i18n.ts` (add every missing key found by the scan), `apps/platform/lib/i18n-parity.test.ts` + a new key-coverage test (scan `t("…")` literals against the dictionary), `apps/platform/lib/utils.ts` (`formatDate`), `packages/shared/src/` (one `formatDate`/`formatNumber`/`formatIQD` with locale and `Asia/Baghdad`, Latin digits `ar-u-nu-latn`, `maximumFractionDigits: 0` for IQD), the order workflow first (`components/orders/workflow/fulfill-tab.tsx`, `delivery-tab.tsx`, `confirm-tab.tsx`, `components/orders/create-order-modal.tsx`, `split-order-dialog.tsx`, `cancellation-reason-dialog.tsx`, `hooks/use-order-crud.ts` toasts), then delivery-import (5 files), returns, settings, salary, products editor, finances, analytics, reports, printing (every file listed in F-075 and F-076), `apps/platform/lib/export-utils.ts` (CSV escaping), ESLint rules in `apps/platform/eslint.config.mjs`.
- **Approach:** in three slices so each PR stays reviewable: (1) provider fix + key-coverage test + missing keys (F-074); (2) formatter + lint ban on bare `toLocale*String()` and literal locale tags (whole platform, error) + call-site migration (F-076); (3) literals to keys, order workflow first (F-075). The "no literal strings in JSX text and `toast.*` arguments" rule is set to **error only in an `overrides` list of migrated directories** that grows slice by slice (the app has thousands of other JSX literals and lint already carries 1,227 warnings, so a platform-wide 0 is not achievable in this package). Dead components in the F-074 unmounted list are deleted, not translated. Copy is reviewed per D-19.
- **Migration/rollout risk:** low; large diff.
- **Rollback path:** code revert per slice.
- **Verification:** the key-coverage test fails today (332 missing keys) and passes after; the scoped ESLint rules report 0 errors in CI for the migrated directories, and the bare-`toLocaleString` rule reports 0 platform-wide; vitest for the formatter (`ar` → never Arabic-Indic digits; `en` → `20 Oct 2026`; IQD → `85,000 IQD`/`85,000 د.ع` by locale; `formatIQD(85000.4)` prints no decimals); Playwright: switch to English and walk create → confirm → fulfil → deliver → no Arabic text in the modal; switch to Arabic → no English toasts; a CSV export of a customer named `=HYPERLINK(...)` opens as text.
- **Effort:** L, ~55 h.

### PKG-31 — Platform UI states and shared primitives (Wave 5)

- **Closes:** F-077, F-079, F-080, F-083
- **Also closes (REGRESSION):** BUG5 (no error boundary in the editor route), NEW-P1-28 (bare `useOrderStore()` re-render), BA-4.2 (`window.confirm` in the builder).
- **Root cause:** pages hand-roll their loading, error and confirm states instead of using `@scheniders/ui`, and route-level layout decisions are made after mount.
- **Files touched:** `apps/platform/app/orders/layout.tsx`, `apps/platform/app/orders/page.tsx`, `apps/platform/hooks/use-viewport.ts`, `apps/platform/app/printing/page.tsx`, `apps/admin/app/(dashboard)/revenue/page.tsx` (`isError` branch), `packages/ui/src/skeletons.tsx` usage, every native `alert`/`confirm`/`prompt` site listed in F-080 → `packages/ui/src/dialog.tsx` / `prompt-dialog.tsx` + sonner with i18n keys (bulk delete gets a typed-count confirm), `packages/ui/src/styles/tokens.css` (`--foreground-subtle` to ≈#767676), `apps/platform/app/store/edit/` (`error.tsx`), `apps/platform/components/layout/notifications-dropdown.tsx`; ESLint `no-alert` in platform and admin, plus a `no-restricted-syntax` rule that flags new `className` strings containing `fixed inset-0` outside `packages/ui` (stops F-081's debt growing).
- **Approach (F-077):** no route swap in the layout. The orders page renders one tree whose mobile and desktop differences are CSS-driven (responsive classes) — or, where a component genuinely differs, a skeleton until mounted. Not "initialise from `matchMedia` synchronously": the server has no viewport, so that causes a hydration mismatch. The trash link is reachable on mobile.
- **Migration/rollout risk:** low.
- **Rollback path:** code revert.
- **Verification:** Playwright at 360 px: `/orders/trash` shows deleted orders, not the live list; no desktop-then-mobile swap (one mount; layout-shift score from the trace < 0.1; no hydration warning in the console); orders page with a failed query shows an error card with "Try again" that refetches; admin revenue with a failing API shows an error, not a spinner; `rg -n --type ts '(^|[^.\w])(alert|confirm|prompt)\(|window\.(alert|confirm|prompt)\(' apps/platform apps/admin` returns nothing (ripgrep's `ts` type already covers `.tsx`), and ESLint `no-alert` is the CI gate; contrast unit test: `--foreground-subtle` ≥ 4.5:1 on `--background` and card.
- **Effort:** M, ~14 h.

### PKG-32 — Remove `dir` attributes and inline `direction` (Wave 5)

- **Closes:** F-065, F-082
- **Also closes (REGRESSION):** NEW-P1-27 / N6 / D-49, L-31 (`apps/platform/app/layout.tsx` `dir`; #164 set `lang` without `dir` on the root documents — verify), the inline `style={{ direction: "rtl" }}` at `apps/platform/components/orders/order-confirmation-card.tsx` (line 141) (not in F-082's list).
- **Depends on:** D-13 (print documents).
- **Root cause:** Arabic text direction is handled with `dir` attributes and inline `direction` styles instead of bidi-isolation utilities, against the LTR-only house rule.
- **Files touched:** every site listed in F-065 and F-082 (platform, admin, storefront, sections, print generators; for example `apps/platform/components/store-onboarding/onboarding-wizard.tsx` (line 263)), `apps/platform/components/orders/order-confirmation-card.tsx`, `apps/platform/app/layout.tsx`, `apps/platform/app/global-error.tsx`, `packages/ui/src/` (a `.bidi-isolate { unicode-bidi: isolate }` utility or `<bdi>`), `CLAUDE.md` (record D-13's answer), ESLint rules banning the `dir` JSX attribute and a `direction` key in `style` objects outside the D-13 print files.
- **Migration/rollout risk:** low; Arabic paragraphs get `text-start` + `unicode-bidi: plaintext`.
- **Rollback path:** code revert.
- **Verification:** `rg -n --type ts 'dir=|direction:\s*["'"'"']?rtl' apps packages` returns only the print files D-13 exempts (or none); both ESLint rules in CI; Playwright screenshot of the onboarding wizard and the order confirmation card in Arabic at 360 px shows right-aligned text with the page still LTR (`document.documentElement.dir === ""`).
- **Effort:** S, ~6 h.

---

## 6. Phase 4 mechanics (restated)

1. **One branch per package:** `fix/<pkg-id>-<slug>`, for example `fix/pkg13-role-aware-rls`. The five in-flight PRs keep their names.
2. **Failing test first:** the package's verification test is committed first and shown failing on `main` (vitest, SQL test or Playwright), then the fix makes it pass. Expected-red assertions that other packages own stay in the known-failures register (PKG-00); a package deletes its own entries.
3. **Gates before asking for review:** `pnpm type-check`, `pnpm lint`, `pnpm build`, full `pnpm exec vitest run`, the SQL tests, and the affected Playwright journeys. Once PKG-00 lands, CI runs all of them and branch protection (D-17) enforces them.
4. **A fresh critic per package:** an independent critic agent reviews each package's diff and verification evidence before Ali is asked; its score and reasons go to CRITIC_LOG.md. The critic re-runs each verification query against the migration text (exact names and signatures).
5. **Ask Ali before every production migration and every merge to `main`.** Each production migration gets its own OK (D-2), with: the pre-migration count query, a fresh backup of data and files (PKG-00 00a), the rollback SQL, and the order relative to the code deploy.
6. **Record each package in PROGRESS.md:** branch, PR, gate results, migration applied (time), verification results, rollback tested or not.
7. **No workarounds.** If a correct fix needs a larger change, stop and propose it (CLAUDE.md).
8. **No dashboard migrations.** Every production change is a committed file applied from the repo; the nightly drift job (PKG-00) reports any other change within a day.

---

## 7. Load-test plan

- **Dependency:** a Supabase branch (Pro plan, D-3) with the same compute size as production, and a Vercel preview of all three apps pointed at it, on the Vercel plan production will use (D-9; Hobby's function limits would distort concurrency). Without the upgrade, the only alternative is a self-hosted Supabase stack on a comparable VM, which does not measure Supabase's own limits (Realtime, pooler, egress); this plan assumes the branch.
- **When:** after PKG-01, -02, -06, -14, -15, -17, -18 and **-21** (the fixes that change the write and read paths, and the notification prune the dataset assumes), and before launch.
- **Safety preconditions (a pre-flight script fails the run if any is not met):**
  1. **Load-test mode on the preview only:** every outbound client — Interakt (`apps/platform/lib/interakt.ts`), QStash (`apps/platform/lib/qstash.ts`), Meta/TikTok CAPI (`apps/storefront/lib/capi.ts`), Telegram, web push (`supabase/functions/send-order-push/index.ts`), LightFunnels API, Gemini/Anthropic — reads its base URL from env, and the preview env points all of them at one local mock server that records calls and answers like the provider.
  2. **No production credential in the preview env:** the pre-flight lists the preview's env names (names only) and fails if any `INTERAKT_*`, `QSTASH_*` production token, CAPI token, `TELEGRAM_*`, VAPID private key or LightFunnels token holds a production value (compared by a hash the operator provides, never printed). The branch database holds no `tenant_integrations` secrets.
  3. **Phones from a range no operator assigns:** synthetic numbers keep the `07XXXXXXXXX` shape the validator requires (`packages/shared/src/phone.ts:29` accepts any `7\d{9}`) but use a prefix block no Iraqi operator assigns (confirmed against the operators' numbering list before the run). The mocks and the pre-flight are the real guarantee; the range is defence in depth.
  4. **No data from production:** the seed is synthetic.
- **Rate limits and protection:** the checkout and lookup limiters read their thresholds from per-environment config (PKG-23). On the load-test preview only, the thresholds are raised (no code path is added or skipped), and the k6 rig runs from several source IPs (k6 cloud or 3+ runners) to keep a realistic IP mix. Vercel Deployment Protection is passed with the "protection bypass for automation" header; the firewall's attack challenge stays at its production setting and its effect is recorded. A separate 15-minute run with production limiter thresholds measures the limiter's own cost and its 429 rate.
- **Crons:** Vercel crons do not run on preview deployments. The k6 scenario calls `/api/cron/*` on their production schedule (compressed proportionally) with `CRON_SECRET`, and `process-checkouts` and `auto-follow-up` through the QStash mock's callbacks to the preview URL. pg_cron jobs run on the branch on their normal schedule.
- **Data:** seed the branch with synthetic data: 5 tenants (base) and 50 tenants (10x); 12 months of history at base volume (≈550k orders, ≈1.9M status rows, ≈1.6M whatsapp_logs, notifications pruned at 90 days by the PKG-21 job, `storefront_events` at 13 months) and one large tenant at 110k orders, so the per-tenant paths (F-026, F-028) are measured at their 12-month size. Seeding uses `COPY` under `session_replication_role = replica` (triggers off), then rebuilds the derived tables once (`inventory_ledger` consistency, `customer_trust`, aggregates, materialised views) and runs `ANALYZE`. Branch disk needed: ≈ 6–7 GB at base 12 months; state the 12-month disk figure for production against the Pro disk.
- **Load model (CONTEXT §5, 1,500 orders/day base, 10x headroom, 30% of daily traffic in the peak hour):**

| Stream | Base peak | 10x peak | Tool / script |
|---|---|---|---|
| Storefront page views | ≈ 5/s (2,250 sessions/h, 8 views each) | ≈ 50/s | k6 HTTP, mix: home 25%, category 20%, PDP 35%, cart 10%, checkout 10%; images fetched as a browser would |
| Storefront funnel events (`/api/events` → `storefront_events`) | ≈ 5/s (one per view) + 1 per purchased line | ≈ 50/s | k6 POST alongside each view |
| Storefront checkouts (COD) | 0.13/s (450/h) | 1.25/s (4,500/h) | k6, reserved-range phones, 5% double-submit replays, 2% last-unit contention on a few products; each calls `consume_rate_limit` and `cod_risk_signals` |
| Staff-created orders (manual, WhatsApp bot, Meta/TikTok entry; ≈ 3.4× storefront at today's mix, CONTEXT §5.2) | ≈ 0.3/s | ≈ 3/s | k6 with staff JWTs through the platform `create_order_atomic` path (the F-041/F-043 path) |
| LightFunnels webhook orders | ≈ 0.07/s | ≈ 0.7/s | k6 POST with valid token |
| Merchant API reads | ≈ 2/s | ≈ 20/s | k6 with staff JWTs: order list, detail, scan lookup, dashboard |
| Order status changes | ≈ 0.43/s | ≈ 4.3/s | k6 staff writes |
| Interakt delivery receipts | ≈ 1.1/s | ≈ 11/s | k6 POST signed receipts |
| Rate-limiter writes (`api_rate_limits`) | ≈ 0.3/s | ≈ 3/s | derived from checkouts, lookups and events |
| Realtime clients | 40 devices, ≈ 240 channels | 400 devices, ≈ 2,400 channels | Node script with supabase-js clients subscribed to `postgres_changes` on `orders` (the app's main use) and to broadcast/presence |
| DB writes total (modelled) | ≈ 13/s | ≈ 125/s | derived from the rows above (events dominate); measured from `pg_stat_database` |

- **Shape:** 10-minute ramp to base peak, hold 30 minutes; ramp to 10x, hold 60 minutes (one evening peak hour); 10-minute spike at 2× the 10x rate; 30-minute soak at base afterwards. The shape alone is ≈ 3 h of wall time; plan one re-run after fixes.
- **Pass criteria:**
  - storefront page p95 < 1.0 s (cached) / < 2.0 s (uncached); checkout p95 < 1.5 s; error rate < 0.5% with the raised limiter thresholds (no 429s expected in the main run);
  - `create_order_atomic` p95 < 300 ms (storefront and staff paths separately); no `57014` statement timeouts; no deadlocks; under last-unit contention, accepted orders never exceed stock;
  - merchant order list p95 < 800 ms, detail p95 < 300 ms at the 110k-order tenant;
  - DB CPU < 70%, connections < 80% of the pooler limit, no temp-file spill on hot queries;
  - each refresh job run < 25% of its interval, refresh jobs together < 5% of DB time;
  - Realtime: all clients stay connected; `postgres_changes` events delivered in < 2 s p95; Realtime's share of DB time (WAL polling and per-subscriber RLS checks, 17.7% today) < 25%; Realtime messages/s and connection count below 80% of the plan quota;
  - egress during the 10x hour extrapolated to a month stays below 80% of the plan's egress quota (product images and API responses), and Storage bandwidth is recorded;
  - zero duplicate orders from replays; order count in the DB equals accepted checkouts plus accepted staff and webhook orders;
  - the provider mock recorded every expected outbound call and the pre-flight log shows no production credential.
- **Measurements recorded:** k6 summaries; `pg_stat_statements` top 20 by total time before/after; Supabase branch metrics (CPU, memory, IO, connections, egress, Realtime messages and connections); Vercel function durations and cold starts (including `generate-batch-pdf` with a 200-label batch, CONTEXT §5.6 hypothesis 5); mock call counts; 12-month disk projection per table (`whatsapp_logs` ≈ 3.8 GB/year at base before PKG-18's retention).
- **Output:** a load-test report in `audit-final/` with the first component to saturate and the compute size needed for launch (a Pro compute upgrade decision for Ali if the smallest tier fails).
- **Effort:** M, ~36 h (mock server and env wiring 8 h; k6 for the streams plus the Realtime Node client 10 h; seeding 6 h; two full runs and the report 12 h). Counted in the launch gate (§3).

---

## 8. Launch-day runbook

### 8.1 Before launch day (gate)

- **Packages:** Waves 0–4 merged and applied (PKG-00..PKG-17, PKG-19, PKG-20, PKG-23..PKG-27; PKG-17 per D-7), plus PKG-18 and PKG-21; every known-failures register entry for these packages deleted; load test passed (§7).
- **Data safety:** Supabase Pro active (D-3); a restore drill that ends in a working app (PKG-00 00a step 3) done within 7 days; the file copy current; PITR on if chosen; `main` protected with required checks (D-17).
- **Observability (hard gates, no fallback):** Sentry DSN set on all three apps and one test event received from each (D-5); `/api/healthz` on platform and storefront returns 200 to the external uptime monitor; the alert channel (D-21) received one test alert from Sentry, one from the uptime monitor and one from the scheduled check session.
- **Webhooks in enforce mode:** no `*_WEBHOOK_AUTH_MODE=monitor` in the Production environment, checked by env names (after the last redeploy), and 24 h of 0 rejections of real Interakt, LightFunnels and Telegram senders (D-4).
- **Kill switch tested:** `orders_paused` set and cleared once on production outside business hours; the storefront showed the localised paused page and webhooks kept queueing (PKG-05, D-22).
- **Platform:** Vercel plan confirmed (D-9) and its limits written next to the rollback table; custom domains and TLS verified; `NEXT_PUBLIC_ROOT_DOMAIN` and origin vars set; previous production deployment ids and their commits noted for each app.

### 8.2 Monitoring (what to watch)

| Signal | Where | Normal | Act when |
|---|---|---|---|
| App errors | Sentry (D-5); Vercel `get_runtime_errors` per project (Hobby keeps ≈ 1 h of runtime logs; log drains need Pro) | few, known | new error group on checkout, order create, webhook, cron |
| Uptime | external monitor on platform `/api/healthz`, storefront `/api/healthz`, one real store page, platform login | 200 | 2 consecutive failures |
| Checkout success | SQL: `select count(*) from orders where created_at > now()-'15 min' and source='shop'` vs storefront request count | tracks traffic | drops to 0 for 15 min during the evening peak |
| Order creation latency | `pg_stat_statements` mean for `create_order_atomic` | < 300 ms | > 1 s |
| DB health | Supabase dashboard: CPU, disk, connections | CPU < 70% | CPU > 85% 10 min; connections > 80% |
| DB, storage and egress | `select pg_database_size(current_database())`; `storage.objects` size by bucket; Supabase usage page for egress | < 70% of plan | > 80% |
| Cron jobs | `select j.jobname, d.status, count(*) from cron.job_run_details d join cron.job j using (jobid) where d.start_time > now()-'1 day' group by 1,2` | all succeeded | any failed |
| Vercel crons | Vercel logs for `/api/cron/*` (and Sentry cron errors) | 2xx | non-2xx |
| Webhooks | Vercel logs/Sentry: 401/503 counts on `/api/webhooks/*`, `/api/telegram/webhook` | 0 for real senders | any for a real sender |
| QStash | QStash dashboard: failed and DLQ messages | 0 | > 0 |
| Notifications | `select max(created_at) from notification_deliveries where status='sent'` | < 1 h old in business hours | > 1 h old while orders arrive (F-029) |
| WhatsApp | `whatsapp_logs` failures in the last hour | low | spike (Interakt quota / quality) |
| Realtime | Supabase Realtime connections and messages | below plan quota | > 80% of quota |
| Drift | nightly `drift.yml` result | no issue opened | any issue |

### 8.3 Alerts to set up (Wave 2–3, PKG-05/PKG-21, D-21)

- **Channel:** one channel Ali chose in D-21 (proposal: a Telegram bot to Ali, which the stack already uses), plus email. A second human contact for when Ali is unreachable, and response targets: P0 (checkout or order intake down, data exposure) 15 minutes; P1 (a merchant blocked, money wrong) 2 hours; P2 next business day.
- Sentry alert rules: new issue in checkout / order create / webhooks / crons → the channel; error-rate spike → the channel.
- Uptime monitor (external, tool chosen in D-21) on the four targets in §8.2, every 1 minute.
- Supabase usage emails (Pro): disk, egress, realtime.
- A pg_cron job that writes a `system_health_checks` row for: cron failures in the last hour, notification delivery freshness, NULL-tenant rows written in the last hour, `create_order_atomic` timeouts; the admin health page shows it.
- **Scheduled check session (if Ali agrees in D-21):** a scheduled Claude session runs the §8.2 SQL (read-only) at 09:00, 16:30, every hour 17:00–22:00 and 22:30 Baghdad time during the first 7 days and posts a short result to the channel. A Claude session cannot receive alerts by itself; this makes "Claude on call" concrete.

### 8.4 Rollback

| What broke | Rollback | Time |
|---|---|---|
| A deployment (any app) | Vercel instant rollback (`request_rollback`/dashboard). **On Hobby, instant rollback goes only to the immediately previous production deployment**; for an older target, redeploy the noted commit (build time + minutes) | minutes |
| A webhook auth change (#167) | set `*_WEBHOOK_AUTH_MODE=monitor` (explicit, logged) **and redeploy** — env changes apply only to new deployments; or instant rollback if the auth change was the last deploy. Return to enforce within 7 days | minutes + build |
| Orders must stop now (fraud wave, money bug) | set `platform_flags.orders_paused` (PKG-05): storefront shows the localised paused page, webhooks queue; tell merchants through the D-21 channel | 1 minute |
| A migration (schema/function) | run the rollback SQL from the migration header (prepared and reviewed before apply) | minutes |
| A migration that changed data | PITR to just before the migration (Pro + PITR) or restore the pre-migration dump into a new project and copy the affected rows back | hours |
| Deleted or overwritten files | restore objects from the outside file copy (PKG-00) by key | hours |
| Abuse wave on checkout | tighten the checkout limiter (config); block at the edge (Vercel firewall rule on IP/ASN); pause the affected tenant | minutes |
| Third-party outage (Interakt, QStash, LightFunnels) | orders keep flowing; the queue sweeper (PKG-17) re-processes; announce delays to merchants | — |

Rule: roll back in the reverse order of the rollout. PKG-02 and PKG-08 applied the migration first and then deployed code, so roll back the code first and then the migration. PKG-06 deployed code first and then the migrations, so roll back the migrations first and then the code. Every later package states its rollout order, and therefore its rollback order, in the PR and in the migration header.

### 8.5 On-call checklist (launch day and the first 7 days)

- [ ] **Change freeze for the first 72 h (D-22):** only incident fixes are deployed, each with the Phase 4 gates and a critic review; this also protects the Hobby budget of 100 deployments a day.
- [ ] On call: Ali (decisions, provider dashboards, env values) and the D-21 second contact; Claude session (diagnosis, SQL reads, prepared rollbacks) reachable through the channel; the scheduled check session posting.
- [ ] Merchant communication: a prepared message template (in Arabic and English) for "orders delayed" and "orders paused", sent through the channel Ali uses with merchants.
- [ ] 09:00 Baghdad: run the §8.2 queries; check overnight crons (renewal, trial-suspend, purge, backup).
- [ ] 16:30 Baghdad (before the 17:00–22:00 peak, 40% of daily orders): check DB CPU headroom, connections, storage, egress; confirm webhooks 0 rejections.
- [ ] Every hour 17:00–22:00: checkout success count, Sentry new issues, QStash failures, notification freshness.
- [ ] 22:30: summary to Ali: orders, errors, any incident, actions taken.
- [ ] Any incident: write it in PROGRESS.md (time, symptom, cause, fix, follow-up package).

---

## 9. Deferred / won't fix

| Item | Reason | Risk if left | Owner |
|---|---|---|---|
| **F-081** — hand-rolled modals and drawers (~100 surfaces) instead of the `@scheniders/ui` Dialog | P3 consistency; the migration is large and touches ~100 files with no security or money effect; the riskiest modals (confirmations) are rebuilt in PKG-31 via F-080, and PKG-31's lint rule stops new `fixed inset-0` overlays now | inconsistent backdrop, scroll lock and dismiss behaviour; possible scroll bleed at 360 px | Ali to accept (D-16); Claude to schedule after launch, one area per PR |
| BA-2.1, BA-2.2, BA-2.3, BA-3.1, BA-3.2, BA-3.3, BA-4.1, BA-4.3, BA-4.4, BA-4.5, BA-4.6, BA-5.3, BA-5.6, BA-5.7, BA-7.2, BA-7.4, BA-8.1, BA-8.2, BA-8.3, BA-8.4, BA-8.5, BA-8.6, BA-8.7, BA-8.8, BA-8.9, BA-9.2, BA-9.3, BA-9.4, BA-10.1, BA-10.2, BA-11.1, BA-11.2, BA-12.2, BA-12.4, BA-13.1, BA-14.1, BA-17.1, BA-17.2, BA-17.3, BA-18.1 (store-builder UX backlog marked "P0" in its own source scale) | builder usability, not security or money; only 1 tenant uses V2 today; BA-6.3 (iframe sandbox) and BA-4.2 (window.confirm) are pulled into PKG-28 / PKG-31 | merchants find the builder hard; destructive actions without confirm (BA-7.4, BA-8.9, BA-9.4) could lose a draft | Ali (D-16); a separate builder UX program after launch |
| NEW-14 / NEW-15 / NEW-16 / NEW-49 / P-R3.4 — one shared Al-Waseet account and global Waseet settings | Ali's decision: manual Waseet handling is deliberate (L-36); the API path is unused (no `WASEET_*` env). F-084 hides the button (PKG-05) | if the API is ever enabled, every tenant would share one courier account | Ali |

---

## 10. Finding → package index (machine-checked in §12)

| F-id | Package | | F-id | Package | | F-id | Package |
|---|---|---|---|---|---|---|---|
| F-001 | PKG-01 | | F-030 | PKG-04 | | F-059 | PKG-15 |
| F-002 | PKG-01 | | F-031 | PKG-13 | | F-060 | PKG-16 |
| F-003 | PKG-03 | | F-032 | PKG-08 | | F-061 | PKG-24 |
| F-004 | PKG-12 | | F-033 | PKG-19 | | F-062 | PKG-17 |
| F-005 | PKG-11 | | F-034 | PKG-17 | | F-063 | PKG-11 |
| F-006 | PKG-03 | | F-035 | PKG-17 | | F-064 | PKG-09 |
| F-007 | PKG-03 | | F-036 | PKG-05 | | F-065 | PKG-32 |
| F-008 | PKG-13 | | F-037 | PKG-21 | | F-066 | PKG-28 |
| F-009 | PKG-13 | | F-038 | PKG-22 | | F-067 | PKG-10 |
| F-010 | PKG-20 | | F-039 | PKG-25 | | F-068 | PKG-10 |
| F-011 | PKG-08 | | F-040 | PKG-02 | | F-069 | PKG-28 |
| F-012 | PKG-13 | | F-041 | PKG-02 | | F-070 | PKG-26 |
| F-013 | PKG-13 | | F-042 | PKG-17 | | F-071 | PKG-27 |
| F-014 | PKG-07 | | F-043 | PKG-15 | | F-072 | PKG-27 |
| F-015 | PKG-03 | | F-044 | PKG-16 | | F-073 | PKG-26 |
| F-016 | PKG-19 | | F-045 | PKG-26 | | F-074 | PKG-30 |
| F-017 | PKG-23 | | F-046 | PKG-05 | | F-075 | PKG-30 |
| F-018 | PKG-17 | | F-047 | PKG-26 | | F-076 | PKG-30 |
| F-019 | PKG-03 | | F-048 | PKG-27 | | F-077 | PKG-31 |
| F-020 | PKG-22 | | F-049 | PKG-14 | | F-078 | PKG-22 |
| F-021 | PKG-08 | | F-050 | PKG-26 | | F-079 | PKG-31 |
| F-022 | PKG-00 | | F-051 | PKG-12 | | F-080 | PKG-31 |
| F-023 | PKG-04 | | F-052 | PKG-14 | | F-081 | Deferred |
| F-024 | PKG-04 | | F-053 | PKG-16 | | F-082 | PKG-32 |
| F-025 | PKG-18 | | F-054 | PKG-14 | | F-083 | PKG-31 |
| F-026 | PKG-18 | | F-055 | PKG-14 | | F-084 | PKG-05 |
| F-027 | PKG-18 | | F-056 | PKG-24 | | F-085 | PKG-29 |
| F-028 | PKG-18 | | F-057 | PKG-14 | | F-086 | PKG-29 |
| F-029 | PKG-21 | | F-058 | PKG-03 | | | |

---

## 11. REGRESSION.md items → packages

### 11.1 Tracked leads NEW-P1-01..38

| Lead | Package | | Lead | Package |
|---|---|---|---|---|
| NEW-P1-01 | PKG-06 | | NEW-P1-20 | PKG-06 |
| NEW-P1-02 | PKG-06 | | NEW-P1-21 | PKG-04 |
| NEW-P1-03 | PKG-06 | | NEW-P1-22 | PKG-13 |
| NEW-P1-04 | PKG-06 (Wave 1; files also copied by PKG-00 00a) | | NEW-P1-23 | PKG-04 |
| NEW-P1-05 | PKG-19 | | NEW-P1-24 | PKG-13 |
| NEW-P1-06 | PKG-07 | | NEW-P1-25 | PKG-18 |
| NEW-P1-07 | PKG-07 | | NEW-P1-26 | PKG-10 |
| NEW-P1-08 | PKG-07 | | NEW-P1-27 | PKG-32 |
| NEW-P1-09 | PKG-06 | | NEW-P1-28 | PKG-31 |
| NEW-P1-10 | PKG-05 | | NEW-P1-29 | PKG-30 |
| NEW-P1-11 | PKG-04 | | NEW-P1-30 | PKG-08 (permission part also on main via #165) |
| NEW-P1-12 | PKG-08 | | NEW-P1-31 | PKG-05 (instrumentation now on main; DSN = D-5) |
| NEW-P1-13 | PKG-08 | | NEW-P1-32 | PKG-03 |
| NEW-P1-14 | PKG-07 | | NEW-P1-33 | PKG-06 (superseded by its storage migration) |
| NEW-P1-15 | PKG-03 | | NEW-P1-34 | PKG-28 |
| NEW-P1-16 | PKG-06 | | NEW-P1-35 | PKG-26 (sitemap now on main; verify) |
| NEW-P1-17 | PKG-08 | | NEW-P1-36 | PKG-19 |
| NEW-P1-18 | PKG-06 (functions in #168; tables and sequences in its follow-up migration) | | NEW-P1-37 | PKG-28 |
| NEW-P1-19 | PKG-03 (signed-in-only part done in #167) | | NEW-P1-38 | PKG-30 |

Also in FINDINGS.md's tracked list: B-08 / F-24 → PKG-06; L-15 / B-03 → PKG-13.

### 11.2 The 94 open P0-class prior-audit rows

| Rows | Package |
|---|---|
| SEC-02, SEC-06, NEW-P1-04 (ML), B-07 / F-07, B-08 / F-08, EC3, NEW-P1-02 (OR), NEW-P1-01 (PR) | PKG-06 |
| SEC-26, NEW-54a, V-3c, SEC-C (c), SEC-C (d) | PKG-07 (closed only in enforce mode) |
| P-1.11 | PKG-08 (writers) + D-11 (#177's migration and `delivery_import_items`); `checkout_queue` in PKG-17 |
| SEC-04, SEC-05, P-1.5b, P-1.6 (done live by 215422; verify), B-13 / F-13 | PKG-03 |
| OPS-01, V-6, B-14 / F-14 | PKG-05 |
| SEC-03, MONEY-07, V-5 (payroll reads closed live by 215422; verify), P-12A.2, B-03 / F-03 | PKG-13 |
| MONEY-01, MONEY-02, EC1 (storefront reservation; launch-gating) | PKG-14 |
| NEW-05, NEW-06, NEW-07 | PKG-16 |
| NEW-47, SEC-D | PKG-17 |
| ORD-1, ORD-2, ORD-3 | PKG-18 |
| SEC-25, NEW-04 | PKG-19 |
| NEW-12 | PKG-12 |
| NEW-13, V-4 | PKG-11 |
| P-0.4 | PKG-21 |
| SEC-16 | PKG-25 |
| SEC-34, EC11 | PKG-27 |
| ARCH-P0-7, BA-6.3 | PKG-28 |
| BUG5, BA-4.2 | PKG-31 |
| DR-1, REL-B | PKG-00 |
| NEW-14 | Deferred (§9) |
| BA-2.1, BA-2.2, BA-2.3, BA-3.1, BA-3.2, BA-3.3, BA-4.1, BA-4.3, BA-4.4, BA-4.5, BA-4.6, BA-5.3, BA-5.6, BA-5.7, BA-7.2, BA-7.4, BA-8.1, BA-8.2, BA-8.3, BA-8.4, BA-8.5, BA-8.6, BA-8.7, BA-8.8, BA-8.9, BA-9.2, BA-9.3, BA-9.4, BA-10.1, BA-10.2, BA-11.1, BA-11.2, BA-12.2, BA-12.4, BA-13.1, BA-14.1, BA-17.1, BA-17.2, BA-17.3, BA-18.1 | Deferred (§9) |

The remaining non-P0 prior-audit rows (290 Still open, 129 Partially fixed across the six regression files) are not re-planned one by one. Each package's "Also closes" names the ones it closes; the rest are covered by the residual-audit item in §13.

---

## 12. Checks run for this plan

**F-id coverage check** — script `audit-final/plan/check_plan.py` (run with `python3 -I`) reads §10, every package's "Closes:" line and the §9 table, and checks that each of F-001..F-086 appears exactly once in the index, exactly once across all "Closes" lines plus the Deferred table, and that the two agree. **It proves the mapping, not the closure.** Result (2026-10-21, revision 2):

```
F-ID COVERAGE CHECK
  findings expected: 86
  in index (§10): 86; duplicates: none; missing: none
  in package Closes lines + Deferred: 86; duplicates: none; missing: none
  index vs Closes mismatches: none
  unknown ids: none
  packages with findings: 32; deferred: 1
  RESULT: PASS
```

**File existence check** — the same script extracts every backticked repo path under `apps/`, `packages/`, `.github/`, `supabase/` in §5 and tests it in the read-only worktree at **3365a7d0**. New files of the in-flight PRs and of this plan are listed with their reason in `audit-final/plan/expected_new_paths.txt`; `<ts>` migration names are placeholders. Short paths written relative to an app (for example `components/orders/...` inside an app's list) are not machine-checked; they were taken from FINDINGS.md and spot-checked at 3365a7d0. Result:

```
FILE EXISTENCE CHECK (worktree <read-only worktree at origin/main 3365a7d0>)
  paths checked: 258; exist: 228; new files of in-flight PRs or of this plan (listed in expected_new_paths.txt): 25; placeholders (<ts>, globs): 5; unexpectedly absent: 0
  RESULT: PASS
```

**Closure claims (P0 and P1, re-checked by hand, not by the script):**

| Finding / lead | Package | Closure claim | Re-checked by |
|---|---|---|---|
| F-001, F-002 (P0, P1) | PKG-01 | every authenticated DEFINER stock writer is tenant-filtered; six child-table triggers plus the items guard | security critic round 1 (live function scan) |
| F-040 (P0), F-041 | PKG-02 | `order_id` server-only trigger; per-tenant lock; replay before lock; 1-arg overload dropped (added in revision 2) | security critic round 1; overload by this revision (no app caller) |
| NEW-P1-01..04, -09, -16, -20 (P0-class) | PKG-06 | column revoke + trigger on `tenants`; wallet amount and grant; storage prefix policies | security critic round 1 |
| NEW-P1-18 | PKG-06 | functions by #168; tables and sequences by the follow-up migration (revision 2) | live `pg_default_acl` read in this revision |
| NEW-P1-06/07/08, F-014 | PKG-07 | closed **only** in enforce mode; launch gate requires it | security critic round 1 |
| F-031 | PKG-13 | closed live by 215422; matrix rows verify | live `schema_migrations.statements` read in this revision |
| F-007 | PKG-03 | route checks **and** role-aware `orders` policies with no hard DELETE for `authenticated` (revision 2) | live `pg_policy` read in this revision (membership-only today) |
| F-049 / EC1 | PKG-14 | storefront reservation at `new` + `FOR UPDATE` + 20-for-5 concurrency test (revision 2) | live `inv_phase('new')` = `CLOSED` read in this revision |
| F-067 | PKG-10 | registry entry fact-free since #180; guard test extended (revision 2) | code read at 3365a7d0 and live count (1 owner tenant) |
| F-022 | PKG-00 | outside backup of data **and** files; restore drill ends in a working app (revision 2) | product-ops critic round 1 |
| F-004, F-005, F-063, F-068 (P1) | PKG-12, PKG-11, PKG-10 | as written; PKG-12 adds the 410 interim | product-ops critic round 1 ("sound") |

---

## 13. What this plan could not cover, and why

- **7,307 of 9,030 COVERAGE cells are still UNCHECKED** (per dimension: Isolation 58, AuthZ 74, Money/Order 119, Data 640, Security 639, Perf 638, Scale 643, Reliab 634, Observ 643, UX 645, i18n 645, A11y 645, CodeHealth 645, Ops 639). Phase 2 checked the high-risk lenses (isolation, auth, money) on most rows; the others were hunted by journey and grep, not row by row. Ali asked for another hunting round while fixing: run it per dimension on `api`, `cron`, `function` and `integration` rows first (Data, Reliab, Observ), in parallel with Wave 2. The 63 commits between 056c668b and 3365a7d0 (storefront funnel events, COD risk signals, content packs, Kurdish strings, product finder, PWA) were spot-checked for this plan, not hunted. New findings get new packages or join an existing root cause.
- **Nothing was run against a live app.** Playwright, RLS-by-role and the UI at 360/1440 px were not exercised (production is the only database, CONTEXT §0). Verification steps that need a running app depend on PKG-00.
- **Vercel env values and the Vercel plan** were not read (rule); F-046, F-084 and D-9 rest on the 2026-10-19 name snapshot. The Hobby limits in D-9 and §8.4 are stated as conditional on D-9.
- **The PR branch merges are in progress elsewhere.** The conflict counts in §4 come from the security critic's run against 3365a7d0; the fixture and renewal-exemption changes will be re-verified when those branches are pushed.
- **The reserved phone prefix** for the load test is to be confirmed against the operators' numbering list; the mocks and the pre-flight are the controls that matter.
- **F-043's manual-path shortfall cause** stays HYPOTHESIS (no Sentry, `track_functions = none`); PKG-15 removes the code path, so the cause no longer matters after it.
- **Effort figures are estimates** for one engineer-agent with Ali's turnaround on decisions excluded; PKG-04 is re-estimated after its spike.

---

## 14. Critic round 1 responses

Sources: **S** = `critic/phase3-round1-security-data.md`, **P** = `critic/phase3-round1-product-ops.md`. One row per critic item. "Accepted" means PLAN.md was changed as described; "Rebutted" or "Partly rebutted" gives the evidence.

### 14.1 Security, data, money and scale (S)

| # | Critic item | Action taken | Where |
|---|---|---|---|
| S-§1 | Coverage check proves mapping, not closure | Accepted: stated in §2 and §12; closure table added | §2, §12 |
| S-§1b | Basis stale (292 files differ at 3365a7d0) | Accepted: re-baselined every path, line and package on 3365a7d0; check re-run there | header, §2, §12 |
| S-PKG-01a | Verification SQL used the function name, not the six trigger names | Accepted: exact names `trg_product_{images,variants,bundle_items,related,order_bumps,tiered_pricing}_tenant_guard`, plus the 5-arg `inv_apply` grant check | PKG-01 |
| S-PKG-01b | Rollback source is `cross_tenant_stock_local_fixture.sql`, not the header | Accepted | PKG-01 |
| S-PKG-01c | CI green measured on old bases; re-run after rebase | Accepted (rebase in progress by the separate worker) | §4, PKG-01 |
| S-PKG-02a | Trigger refuses authenticated INSERT; `vault-utils.ts:304` and `backup-utils.ts:82` restores break | Accepted: recorded; PKG-24's RPC is the only restore path and the browser paths are deleted | PKG-02, PKG-24 |
| S-PKG-02b | Trigger removes the F-042 attack; re-grade | Accepted: F-042 is P3 after #175, stays in PKG-17 | PKG-02, PKG-17 |
| S-PKG-02c | 1-arg `create_order_atomic(jsonb)` passes NULL tenant (global lock, NULL row) | Accepted: drop it (no app caller at 3365a7d0) | PKG-02 |
| S-PKG-02d | "has_column_privilege … path is blocked" is not a query | Accepted: SQL test cases + `pg_trigger` count for `trg_orders_order_id_server_only` + overload count | PKG-02 |
| S-PKG-02e | 3 conflict hunks with `main` not listed | Accepted | §4 |
| S-PKG-06a | Wrong signature `(uuid,integer,text,text)` | Accepted: `(uuid,numeric,text,text)` (live) | PKG-06 |
| S-PKG-06b | NEW-P1-18 only half closed (tables `arwdDxtm`, sequences `rwU`) | Accepted: follow-up default-privileges migration for tables and sequences, same guarded `supabase_admin` block as `140700`; rule that each migration grants explicitly | PKG-06, §5 rules |
| S-PKG-06c | Move #168 to Wave 1 (internal plan + anonymous image delete) | Accepted: Wave 1 step 1b | §3, §4, PKG-06 |
| S-PKG-06d | Allowlist matches live; `20261021120000` touches only publish and is not applied | Noted, no conflict; the unapplied file is a D-2 item in 00r | PKG-00 00r, D-2 |
| S-PKG-07a | "Rollback without redeploying" is false on Vercel | Accepted: redeploy stated in PKG-07, D-4 and §8.4 | PKG-07, D-4, §8.4 |
| S-PKG-07b | Launch gate must require enforce mode | Accepted: no `monitor` in Production for 24 h with 0 real-sender rejections; `monitor` ≤ 7-day transition | D-4, PKG-07, §8.1 |
| S-PKG-07c | Keep `EXEMPT_PLANS_SQL_LIST` in both crons on rebase | Accepted as a rebase acceptance check | §4, PKG-07 |
| S-PKG-08a | 4 conflict hunks with `main` | Accepted | §4 |
| S-PKG-08b | `renew_subscription_atomic` has no billing-exempt predicate: can suspend the house tenant | Accepted: SQL predicate + SQL test required before D-1 (being added by the separate worker); same predicate reused by PKG-15 | PKG-08, PKG-15 |
| S-PKG-08c | D-11 partly built by #177 (unapplied) | Accepted: D-11 = apply `20261020160500` + `delivery_import_items` | D-11, PKG-08 |
| S-PKG-08d | `checkout_queue` backfill has two owners | Accepted: PKG-17 only | PKG-08, PKG-17, §11.2 |
| S-§2 table | Merge table stale against `main` | Accepted: rebuilt with `main` and PR-to-PR overlaps and acceptance checks | §4 |
| S-G1 | Live-only 215422 changes the role model; 2 committed files unapplied; PR fixtures use `member` | Accepted: header and §2 re-baselined; Wave 0 "00r" commits 215422 and takes D-2 on the two files; fixtures in progress (§4); drift gate both directions | header, §2, PKG-00, PKG-04 |
| S-G2 | F-007 / viewer writes open at the database | Accepted, placed in **PKG-03** (not PKG-13) so the package that closes F-007 owns both halves: `<ts>_role_aware_writes.sql` with `has_tenant_permission`, no hard DELETE on `orders` for `authenticated`, PostgREST matrix rows | PKG-03 |
| S-G3 | RLS matrix cannot catch the F-001 class; D-38 has no method | Accepted: generated behavioural harness over every callable DEFINER function (54 of 61 live; 7 are trigger functions), listed in the package | PKG-13 |
| S-G4 | Default grants on tables/sequences | Same as S-PKG-06b | PKG-06 |
| S-G5a | Nightly dump exceeds Free egress | Accepted: weekly + pre-migration on Free (≈ 186 MB per dump); nightly after Pro | PKG-00 |
| S-G5b | No Storage backup while anonymous delete is open | Accepted: `rclone` copy of every bucket except `vault_backups` in 00a and the drill; #168 storage migration in Wave 1 | PKG-00, PKG-06 |
| S-G5c | Read-only role is a production DDL change | Accepted: listed under D-2 and D-10 | D-2, D-10 |
| S-G5d | Plain `postgres:17` cannot load a Supabase dump | Accepted: Supabase CLI stack (supabase/postgres 17.x image) for SQL tests, e2e and drills | PKG-00 |
| S-G6 | PKG-14 does not close EC1/F-049 (no reservation; check-then-act) | Accepted: reservation at `new` for storefront orders, `FOR UPDATE` in `create_order_atomic`, expiry release, 20-checkouts-for-5-units test | PKG-14 |
| S-G7 | PKG-15 needs the exemption in SQL and a webhook outcome that is not 4xx-and-drop | Accepted: `is_billing_exempt(plan)`; webhooks queue as `blocked_limit` | PKG-15 |
| S-G8 | `customer_metadata` has 0 rows: no split | Accepted (re-checked: 0 rows); risk lowered | PKG-17 |
| S-G9 | PKG-24 retention after backup; restore RPC must pass #173/#175 guards | Accepted | PKG-24 |
| S-G10.1 | Load test would message real people | Accepted: mock server for every provider, credential pre-flight, unassigned phone range | §7 |
| S-G10.2 | Limiter vs k6 | Accepted: distributed source IPs plus per-environment limiter thresholds (config, no code bypass), and a separate run with production thresholds | §7, PKG-23 |
| S-G10.3 | Unmodelled writes (`consume_rate_limit`, `storefront_events`, `cod_risk_signals`); `api_rate_limits` not pruned | Accepted: streams added; pruning job in PKG-18 | §7, PKG-18 |
| S-G10.4 | Non-storefront order creation not modelled | Accepted: staff-created stream ≈ 3.4× storefront | §7 |
| S-G10.5 | Egress and Storage bandwidth not a criterion | Accepted | §7 |
| S-G10.6 | Notifications dataset assumes a prune that is broken until PKG-21 | Accepted: PKG-21 runs before the test and is in the gate | §7, §3 |
| S-G10.7 | Realtime messages/s and WAL DB-time criterion | Accepted | §7 |
| S-G10.8 | Numeric refresh-job criterion | Accepted: each run < 25% of interval, all < 5% of DB time | §7, PKG-18 |
| S-G11 | F-067 still present on `main` despite the commit title | **Partly rebutted.** The strings are still in `scheniders-signature.ts` (agreed, and §2 says the title overstates it), but the registry entry `signatureDirection` (`:607`) is built without `SignatureFacts`; the facts feed only `schenidersSignatureTemplate` (`:613`), which only `signature-parity.test.ts` imports; live, only the owner tenant's config contains the phone/licence/assets (1 row each). Exposure is closed; PKG-10 keeps the extended guard test and moves the facts to an owner-only module | §2, PKG-10, D-8 |
| S-G12 | Interim: `/api/cart/abandoned` should return 410 | Accepted (Wave 1, one line) | PKG-12 |
| S-§5 | Sample verdicts (PKG-03 rework, PKG-13 re-baseline, PKG-14 wrong, PKG-15/-17/-24 amend) | Accepted: each addressed in the rows above | PKG-03, -13, -14, -15, -17, -24 |
| S-§6a | F-042 to P3 after #175 | Accepted | PKG-17 |
| S-§6b | F-007 DB half before launch | Accepted: PKG-03 is Wave 2, inside the gate | PKG-03 |
| S-§6c | EC1/F-049 launch-gating | Accepted | PKG-14, §8.1 |
| S-§8.1–18 | The 18 concrete changes | All accepted; each maps to a row above (1 → S-G1; 2 → §4 rows; 3 → S-PKG-06c; 4 → S-PKG-01a/b; 5 → S-PKG-02a–d; 6 → S-PKG-06a/b; 7 → S-PKG-07a/b; 8 → S-PKG-08b–d; 9 → S-G1/PKG-03; 10 → S-G2/S-G3 and F-031 verify; 11 → S-G6; 12 → S-G7; 13 → S-G8; 14 → S-G9; 15 → S-G5; 16 → S-G12; 17 → S-G10; 18 → S-§1) | as listed |

### 14.2 Product, UX, craft, delivery and operations (P)

| # | Critic item | Action taken | Where |
|---|---|---|---|
| P-1.1.1 | SQL job on `postgres:17` cannot load the dump | Accepted: Supabase CLI stack everywhere; `supabase db dump` (+ `--role-only`) | PKG-00 |
| P-1.1.2 | Schema-only fixture breaks data-dependent SQL tests | Accepted: `ci_seed.sql` with every shape the existing tests look up, `auth.users` with passwords; "fixture: need" fails the job | PKG-00 |
| P-1.1.3 | Drift gate needs `schema_migrations` rows; nightly live diff | Accepted: data-only dump of `schema_migrations`; nightly `drift.yml` | PKG-00, PKG-04 |
| P-1.1.4 | "Required job" unenforceable: `main` unprotected | Accepted: D-17 and a `gh api …/protection` verification | D-17, PKG-00 |
| P-1.1.5 | CI minutes and Vercel deploy budget | Accepted: path filters, caches, 2 Playwright projects, `turbo-ignore`; D-20. Note: `main` already runs vitest in one `--affected` job since `9df882df` | PKG-00, D-20, §2 |
| P-1.1.6 | e2e harness covers only the platform | Accepted: two `webServer` entries, path mode, test secrets, mocks | PKG-00 |
| P-1.2 | Assertions red by design until later packages | Accepted: known-failures register (`known_failures.json`, `test.fail`), passing xfail fails CI | PKG-00, §6 |
| P-1.3a | Storage objects not backed up | Accepted | PKG-00 00a |
| P-1.3b | Drill counts rows only | Accepted: restore ends in an app smoke test; RTO/RPO recorded | PKG-00 00a |
| P-1.3c | Destination, key custody, retention, secret exposure | Accepted: D-18; GitHub Environment with required reviewers; dedicated read-only role | D-18, PKG-00 |
| P-1.3d | IPv6-only direct connection; old `pg_dump` | Accepted: session pooler; `postgresql-client-17` | D-10, PKG-00 |
| P-1.4a | `generate-batch-pdf` needs Chromium in CI | Accepted | PKG-00 files |
| P-1.4b | Seeded login needs passwords and confirmations off | Accepted (`enable_confirmations = false` already in `config.toml`; seed sets `email_confirmed_at`) | PKG-00 |
| P-1.5 | PKG-00 is ≈ 75–80 h, not 44 h | Accepted and slightly higher: ≈ 92 h (adds 00r re-baseline and the seed) | §3, PKG-00 |
| P-2.1 | No third-party stubbing (safety) | Accepted (same as S-G10.1) | §7 |
| P-2.2 | Limiter and Deployment Protection block k6 | Accepted: config thresholds, protection-bypass header, separate limiter run. The critic's "bypass header" is implemented as per-environment config, not a code path, to also satisfy S-G10.2 | §7 |
| P-2.3 | Vercel crons do not run on previews | Accepted: k6 triggers them with `CRON_SECRET`; QStash callbacks through the mock | §7 |
| P-2.4 | Staff-created orders ≈ 3.4× storefront | Accepted | §7 |
| P-2.5 | `postgres_changes` fan-out not measured | Accepted | §7 |
| P-2.6 | Seeding through triggers takes hours | Accepted: `COPY` with `session_replication_role = replica`, then derived tables rebuilt once; disk figure stated | §7 |
| P-2.7 | Retention not modelled | Accepted: retention jobs in PKG-18; 12-month disk projection in the report | PKG-18, §7 |
| P-2.8 | Load test ≈ 32–40 h and uncounted | Accepted: 36 h, counted in the gate | §3, §7 |
| P-3.1 | No public health endpoint | Accepted: `/api/healthz` on platform and storefront | PKG-05, §8 |
| P-3.2 | Hobby log retention; Sentry soft gate | Accepted: Sentry hard gate; Hobby limits in D-9 | D-5, D-9, §8.1 |
| P-3.3 | Hobby instant rollback only to the previous deployment | Accepted | D-9, §8.4 |
| P-3.4 | Nobody can be paged except Ali | Accepted: D-21 channel, uptime tool, second contact, response targets, scheduled check session | D-21, §8.3, §8.5 |
| P-3.5 | No kill switch or merchant communication | Accepted: `platform_flags.orders_paused` with a localised page; message templates | PKG-05, PKG-26, D-22, §8 |
| P-3.6 | No change-freeze rule | Accepted: 72 h | D-22, §8.5 |
| P-3.7 | Gate inconsistent with top-10 risks; F-071 outside the gate | Accepted: PKG-21, -23, -24, -25, -26, -27 inside the gate; PKG-26/27 moved to Wave 4 | §3, §8.1 |
| P-4 PKG-10 | Test misses logo, licence, spaced phone, socials; Option A hard-codes a tenant id; render-time tokens | Accepted: extended guard, owner-only module instead of a tenant-id filter, render-time tokens; scope narrowed by #180 (see S-G11) | PKG-10 |
| P-4 PKG-11 | Sound | No change | PKG-11 |
| P-4 PKG-12 | Sound | No change beyond S-G12's 410 | PKG-12 |
| P-4 PKG-15 | Shopper-facing over-limit decision and criterion | Accepted: D-6(b)/(c); localised outcome; 80% alert | D-6, PKG-15 |
| P-5 PKG-31a | Grep command invalid (`--type tsx`) and cannot separate `window.confirm` | Accepted: corrected `rg --type ts` pattern; ESLint `no-alert` is the gate | PKG-31 |
| P-5 PKG-31b | `matchMedia` initialisation causes hydration mismatch | Accepted: CSS-driven branch or skeleton; no route swap | PKG-31 |
| P-5 PKG-28 | Whole-section duplication unsafe for interactive sections | Accepted: Option 1 hide the controls (recommended now) or Option 2 leaf/style-only variants with interactive sections excluded; one-`<h1>` test | PKG-28 |
| P-5 PKG-30a | Effort 50–60 h | Accepted: 55 h | §3, PKG-30 |
| P-5 PKG-30b | Platform-wide literal-string lint gate unachievable | Accepted: scoped `overrides` that grow per slice | PKG-30 |
| P-5 PKG-30c | No translation owner; Kurdish author | Accepted: D-19 | D-19 |
| P-5 PKG-29 | Phone in `localStorage` on shared devices | **Rebutted (already done on `main`):** the key is in `sessionStorage` at 3365a7d0 (`track_order_lookup.client.tsx:91`, `order_tracker.client.tsx:188`). Kept the useful half: clear it after the first successful lookup, with a test | PKG-29 |
| P-5 PKG-32 | Gate misses `style={{ direction: "rtl" }}` | Accepted: grep and lint cover `direction`; `order-confirmation-card.tsx:141` added | PKG-32 |
| P-5 spot | PKG-26 and PKG-22 sound | No change (PKG-22's SQL test now runs on the Supabase stack, which has the `realtime` schema) | PKG-22, PKG-26 |
| P-6 | Whole-IQD not enforced | Accepted: `CHECK (col >= 0 AND col = trunc(col))` on nine money columns (0 fractional order rows live), integer `codAmount`, formatter `maximumFractionDigits: 0` | PKG-16, PKG-30 |
| P-7a | PKG-04 effort unscoped | Accepted: 2 h spike first, 25–40 h range, re-estimate before Wave 2 | PKG-04 |
| P-7b | User-visible criteria missing on PKG-21, PKG-14, PKG-18 | Accepted: push within 30 s on a real phone; localised sold-out line with adjust; order list < 1.5 s at 360 px | PKG-21, PKG-14, PKG-18 |
| P-7c | Verdict hours and §3 disagree | Accepted: one launch number, computed from the §3 table (≈ 499 h), stated in §1.1 and §3. It is above the critic's ≈ 400 h because it also carries the security critic's added scope (role-aware writes, DEFINER harness, reservation, file backup, 00r) | §1.1, §3 |
| P-7d | F-081 lint ban not in any package | Accepted: PKG-31's ESLint changes | PKG-31, §9 |
| P-8 | 34/34 sampled paths exist | No change; re-checked at 3365a7d0 by the script (§12) | §12 |
| P-9a | Full PKG-00 must precede Wave 3+ migrations | Accepted: stated as a rule | §2 |
| P-9b | PKG-26 and PKG-27 to Wave 4 | Accepted | §3 |
| P-9c | Under-estimates (PKG-00, load test, PKG-30, PKG-04) | Accepted: 92 h, 36 h, 55 h, 32 h | §3 |
| P-§10 | "Approach wrong or unsafe": PKG-00, §7, PKG-31, PKG-28 | All four reworked (rows above) | PKG-00, §7, PKG-31, PKG-28 |
