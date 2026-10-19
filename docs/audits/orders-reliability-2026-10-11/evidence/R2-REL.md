# R2 — RELEASE/ENV root cause (read-only; data in scratchpad/r2-rel/)

## Env matrix
Vercel team hobby, 1 member owner goodguyali (aa988695@gmail.com); GitHub login connection now gga2000.
- platform (14 keys): Supabase URL/ANON/SERVICE_ROLE = ONE record each covering production+preview+development (identical). Same single record for NEXT_PUBLIC_SITE_URL, VAPID, QSTASH_*, INTERAKT_API_KEY, INTERAKT_WEBHOOK_SECRET, LIGHTFUNNELS_*, COREPACK. CRON_SECRET 3 records. Missing prod: NEXT_PUBLIC_SENTRY_DSN, PREVIEW_TOKEN_SECRET, NEXT_PUBLIC_STOREFRONT_ORIGIN etc.
- storefront (5 keys): separate records per target (values not decrypted; same project inferred — org has only 2 projects: scheniders-platform + "Driver" created 10-07).
- admin (6 keys): one record all targets.
- local .env.local (3 apps) + .mcp.json → sduvpgqwhxragxtxztur (PROD DB).
- Secrets stored type "encrypted" not "sensitive" (readable-secret flag). Preview deployments run w/ prod service-role key + LIVE WhatsApp sender (Interakt) + QStash.
Supabase org FREE (tier_free), 2 active projects (cap reached → no staging w/o pausing Driver or paying); list_branches []; branching not on Free (Pro $0.01344/branch-hr); Free no daily backups; PITR Pro+ add-on needs ≥Small; logs 1 day; Nano.
Vercel Hobby: 100 deploys/day; runtime logs 1h; no Skew Protection; rollback only to previous; no private-repo collaboration; "restricted to non-commercial personal use… including any method of requesting or processing payment" → paid SaaS violates ToS.

## Migration provenance (live schema_migrations vs files in 139 refs; name or ws/comment-stripped md5)
339/340 created_by = medlab.20.198@esraa.edu.iq (MCP/API identity). Only 35/340 live versions equal a file version on main → `supabase db push` from main would see ~194 unapplied.
Aug 17–Oct 3: 191 live migrations: on main 64 (34%) [40 same name+content, 21 same name diff content, 3 renamed]; not on main 127 (66%) [notif branch 88(+3), flagship 8, preview-iframe 4, category-scope 1, NO FILE ANYWHERE 23].
23 no-file incl chat_thread_lifecycle_cron, notification_mirror_triggers, notification_sla_sweep, both 09-13 revoke_*_secdef (main's 20260913100000 differs), orders_followup_type_allow_manual, prune_unified_notifications, etc.
Applied before code reached main: 61/64 (95%), median 1.2d, max 19d; 188/191 (98%) before main or never merged; file first committed AFTER live apply in 138/162.
Weekly applied/not-on-main: 08-17 10/4; 08-24 4/2; 08-31 23/6; 09-07 90/54; 09-14 38/35; 09-21 12/12; 09-28 14/14. 54 files on main match no live migration.
Contract-before-expand (6 + 2 side-effect):
1 orders_schedule_not_created_at (09-07) → C5 (31 rejections).
2 orders_risk_view_repoint_to_customer_trust (09-09 06:52Z) → page 3.1×, count 5.2×, 21 timeouts/day.
3 orders_margin_entitlement (09-09) → NULL margins for non-admins; base grant bypass open.
4 notification_types_wave4 (09-12 07:54Z; file ON main) → TEMP TABLE _crossed in statement trigger → every inventory-moving order update aborted 42P07 ~14h until live-only fix 21:58Z (fix only on notif branch → replaying main reintroduces). Impact inferred: main tenant status changes 1-11/h in window, 61 in hour after fix.
5 retire_chat_notifications_and_chat_push_url (09-15) dropped table still used by cron prune-order-notifications → failed 7/7 days.
6 ~12 dashboard_* (09-06..09-09) → get_dashboard_metrics semantics changed under unchanged prod labels.
Side: loyalty/referrals/cod_risk triggers (PR #80 open) on every prod order write (part of 12 triggers behind 1.5s PATCH); chat lifecycle crons mutate prod threads.
Code ahead of DB: prod calls merge_categories, split_category, auto_move_to_no_response, duplicate_dismissals, customers, order_items, activity_log — defined by NO migration anywhere; hidden by `rpc("merge_categories" as never)` (use-categories-query.ts:263,288) + ignoreBuildErrors.

## Parallel-session collision
notif forked b1a760e6 (09-06 02:45 +03), never rebased; 174 behind/107 ahead (59 platform); 59 platform files changed both sides.
Timeline (+03): 09-09 09:52 view repoint applied live by notif session; PR #67 branch commits on page.tsx 09:55/10:01/10:25; notif 13:38-13:51 (9eb9f171 page.tsx+order-repository; 6027d65a; 2838cd26 page/use-orders-query/use-orders); PR #67 14:53 use-orders-query; 09-10 00:36-03:18 PR #67 page.tsx ×5; 09-10 14:10 PR #67 merged (100 commits); 14:52 PR #81 (page.tsx 3,129→1,928 lines); 09-11 00:05 notif 848afdf6; 02:26 PR #86 (46e2f944).
14 worktrees; 30 local branches w/ unmerged commits since 09-01; 11 never pushed. Concurrent unmerged branches per subsystem: storefront/sections 16, migrations 14, orders data layer 8, products 8, dashboard 8, store-builder 6, notifications 3.
PR merges/week: 08-03 1; 08-10 0; 08-17 2; 08-24 1; 08-31 11; 09-07 25; 09-14 5; 09-21+ 0. 21 open PRs (#27, #35 >90d). Failure checks on 11 PRs (#94-96 Vercel build-rate-limit 09-11; #112-117 Node 20 window; #118 BLOCKED). Key branches (notif, ship, activity-feed) 0 CI runs (no PR).

## BLOCKED deploys — CAUSE PROVEN
dpl_7NBUaBVe (platform) 10-10 20:55Z BLOCKED, source git, fix/footer-mobile-density @9d50dae5, errorLink team-configuration, no build; siblings storefront/admin blocked; preview/all @bfc53937 21:46Z blocked on all 3.
Vercel event deployment-creation-blocked: "The git deployment scheniders-platform with SHA 9d50dae5… is blocked due to insufficient permissions. The github user goodguyali20 who initiated the deployment does not have an account on Vercel."
User events: 2026-10-07 23:47:40Z "You disconnected the goodguyali20 GitHub account"; 23:47:50Z "You connected the gga2000 GitHub account"; 57s later created project driver-customer (gga2000/Driver repo).
Commits 9d50dae5, bfc53937, 16bc2ad6, 4efb6f62, 0cb1b8ca all `gga2000 <aa988695@gmail.com>`; GitHub resolves author+committer to login goodguyali20. Before 10-07 READY; after BLOCKED. Vercel Hobby rule: commit author must be owner via Login Connections. Ruled out co-author trailer, Node, rate limits. READY dpl_2VaaPZ31 (9d50dae5 21:14Z) lacks source git → manual owner redeploy.
VERDICT: a merge/push to main authored as aa988695@gmail.com (→ goodguyali20) WILL BE BLOCKED → prod cannot auto-deploy; only manual redeploy works today. gh active as gga2000 → `gh pr merge` merge commit might deploy (untested; luck not fix).

## CI gaps
ci.yml only on PRs to main + pushes to main; Node 20 (Vercel 24, .nvmrc 20); lint/type-check/build; no tests, no migration/drift/RLS checks, no CI on PR-less branches. next.config.ts:46 ignoreBuildErrors: true; `as never` casts. No branch protection (404; rulesets 403 Pro). Every push builds 3 apps (admin 30 deploys 09-10 11:00→23:06Z) → hit Hobby 100/day.
Minimal gate (1 dev + agents; GitHub Pro ~$4/mo): affected-only builds (turbo-ignore as Ignored Build Step); lint+type-check w/o ignoreBuildErrors; vitest; migration job (local supabase baseline + apply pending + squawk + RLS/grant assertions + types diff failing on unknown rpc/from); read-only drift job vs prod (fail if live version lacks file on main or reverse); Node 24 everywhere; merge only via PR w/ checks; post-deploy prod smoke on 3 flows (order list, change date, search).

## 5-whys
C6: features on PR-less branches + 21 open PRs + BLOCKED since 10-10 ← notif forked 09-06 never rebased; main got #67/#81/#86 rewriting same layer in 36h (59 dual files, 36 conflicts); reconcile stalled ← parallel agent sessions per task in worktrees (14; 8 on orders layer), no subsystem ownership, no rebase rule, no integration owner; merges 25/week → 0 ← "done" not forced to merge because DB half ships instantly via MCP so feature looks working locally/preview; no CI on PR-less branches; no protection ← ONE ENVIRONMENT (prod DB = preview = local = agents; Free no branching, 2-project cap full; rule "Drafted migrations are applied without asking"). → Systemic cause: single shared prod DB + DB-first file-optional migration habit + no integration owner; "done" defined by live-DB state not merged+deployed code. Acute since 10-07: identity sprawl (GitHub goodguyali20 owns repo/commit email; GitHub gga2000 = Vercel login + gh active; Vercel user goodguyali; Supabase applier medlab.20.198@esraa.edu.iq).
DB ahead: 127/191 not on main, 23 no file, 95% applied first ← apply_migration in dev writes no file, stamps apply time, files later under different versions ← MCP wired only to prod, only DB, apply-without-asking policy ← no drift check, no DB deploy job → DB has no deployment pipeline (DB deploy = agent API call; code = PR→CI→Vercel) → asymmetric friction guarantees drift + contract-before-expand.

## Target model + path
Envs: prod Supabase Pro (daily backups; PITR optional ≥Small); staging via branching per PR or persistent staging branch; Vercel prod-only secret records; preview→staging; Interakt/QStash prod-only w/ sandbox sender; local supabase start; agents' MCP READ-ONLY on prod, RW on staging/branches; Vercel Pro (ToS, 6,000 deploys/day, 1-day logs, Skew Protection); one GitHub identity per human matching commit email.
Migrations: files first in PR; CI applies to ephemeral DB; single `supabase db push` job on main = only prod writer; expand/contract (raise/NOT NULL/revoke/drop/view repoint/semantics ship AFTER tolerant code deployed; contract one release later); drift check required.
Flow: trunk-based PRs ≤1 day/~300 lines; feature flags; daily release train owned by Ali (merge queue → prod deploy → smoke).
Stop-the-line for agents: no prod DDL; start from fresh origin/main own worktree; declare subsystem, stop if open branch touches it; no session end w/ unpushed commits or w/o PR; main red or BLOCKED/ERROR deploy freezes shipping; migration PR must carry compatible code; no `as never` on rpc/table names.
Path: Day 0 unblock deploys (restore one identity / re-link Vercel to goodguyali20 & host Driver separately / Pro; verify no-op push READY). Day 0 stop bleeding (MCP read-only; freeze prod DDL; fix failing cron w/ migration FILE). Re-baseline: schema-only dump → _baseline.sql, `supabase migration repair`, archive old files, drift check on; strip migration files from stranded branches before porting. Code catch-up as small PRs ported onto main (not wholesale merge): 1 scheduling (bc5ee8fd/a8eca649/c27ebbbf ported to windowed fetch) C5; 2 848afdf6 list from orders C1/C3; 3 c00e216d margins + column-grant fix; 4 6027d65a server search C4; 5 2838cd26/9eb9f171; 6 dashboard labels; 7 fix/activity-feed 6c4ce8cc+4efb6f62 now, 0cb05812 only w/ filtersSettled gating; 8 rest of notif by subsystem; 9 PR #80 ship UI or contract migration removing triggers; 10 storefront PR backlog one per train; 11 delete ship/*, chore/orders-duplicate-detection, verify/*, preview/all.
Risks: porting onto diverged layer = re-implement w/ tests first; 21+14 files whose content differs from live; contract steps wait a release.

## Findings
REL2-1 P0 prod auto-deploy BLOCKED since 10-07 GitHub re-link (check: canonical-identity push READY; no deployment-creation-blocked events).
REL2-2 P0 single environment (prod=preview=dev=local=agent MCP); preview carries prod service-role/Interakt/QStash; Free no branching/backups, cap full.
REL2-3 P0 DB has no deployment pipeline (66% not on main, 23 no file, 95% applied before merge, 35/340 versions match). Check: CI fails when live version lacks file on main and reverse.
REL2-4 P0 six contract-before-expand breaks reached users.
REL2-5 P1 parallel sessions same subsystem, no integration owner.
REL2-6 P1 release train stalled (0 merges after 09-16; 21 open PRs; key branches 0 CI).
REL2-7 P1 CI gate gaps (no tests, Node 20 vs 24, ignoreBuildErrors, `as never` hiding 7 missing objects, no protection).
REL2-8 P1 Vercel Hobby fragility + ToS.
REL2-9 P1 DB-internal breakage + replay hazard (prune cron 7/7 fails; wave4 fix only on branch).
REL2-10 P2 identity sprawl + no DB change attribution.
REL2-11 P2 code ahead of DB (7 missing objects).
REL2-12 P2 secrets "encrypted" not "sensitive", all targets.
Limitations: storefront preview DB inferred; gh pr merge deploy untested; 09-12 outage impact inferred; 21 name-only matches; 36-conflict figure from R1.
