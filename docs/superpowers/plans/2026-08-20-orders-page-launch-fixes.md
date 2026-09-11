# Orders Page Launch Fixes — Round 1 (SEC-1/2/3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close the three approved P0 tenant-isolation blockers (SEC-1, SEC-2, SEC-3) on the Orders surface — no cross-tenant order create/split/delete/ship, no unauthenticated privilege escalation.

**Architecture:** Authenticate every mutating server action + API route via the existing `verifyAccessToken` bearer-token pattern (platform uses localStorage tokens, not cookies); derive `tenant_id` **server-side** from `user_profiles.current_tenant_id` and ignore any client-supplied tenant; add an in-database membership guard to the `create_order_atomic` RPC as defense-in-depth. Factor the trusted server-to-server create path (telegram webhook) into a non-action helper so it keeps working without a user token.

**Tech Stack:** Next.js server actions + route handlers, Supabase (service-role client after auth), Zod v4, Vitest, a Supabase migration.

**Scope guard:** Round 1 covers ONLY SEC-1, SEC-2, SEC-3. MONEY-1 is DEFERRED — its root cause is a cross-app `orders.price` convention conflict spanning 10 order `source` values and ~20k historical rows; it needs an owner decision (canonical convention + backfill strategy) before code. COR-2/INT-3/SEC-4/5/6 remain PENDING. Deriving tenant server-side in SEC-2 incidentally closes SEC-6's null-tenant vector for `createOrderAction` (noted, not separately claimed).

**Model auth pattern to copy:** `app/api/settings/order-pipeline/route.ts` `resolveCaller()` (verifyAccessToken → profile.current_tenant_id + role) and `lib/permissions.ts` `isAdminRole()`.

---

## Task 1 — SEC-3a: tenant-scope `/api/orders/delete`

**Files:**
- Modify: `apps/platform/app/api/orders/delete/route.ts`
- Test: `apps/platform/app/api/orders/__tests__/delete-validation.test.ts` (Zod schema only)

- [ ] **Step 1 (test first):** create the `ids` Zod schema in the route as `const deleteBodySchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) })` and unit-test it accepts a uuid array, rejects `[]`, rejects non-uuid, rejects >500.
- [ ] **Step 2:** run `pnpm --filter @scheniders/platform exec vitest run app/api/orders/__tests__/delete-validation.test.ts` → FAIL (schema not exported).
- [ ] **Step 3 (implement):** in the route — (a) after `verifyAccessToken`, fetch `profile.current_tenant_id, role`; 400 if no tenant; (b) replace `if (profile?.role === 'viewer')` with a positive allow-list `if (!['admin','super_admin','employee'].includes(profile?.role ?? '')) return 403` (denies no-profile + viewer); (c) parse body with `deleteBodySchema.safeParse`; (d) add `.eq('tenant_id', tenantId)` to the snapshot select, the FK-unlink update (`.in('original_order_id', ids).eq('tenant_id', tenantId)`), and the soft-delete update. Export the schema for the test.
- [ ] **Step 4:** run the vitest → PASS.
- [ ] **Step 5:** `pnpm --filter @scheniders/platform exec tsc --noEmit` → 0 errors.
- [ ] **Step 6 (commit — only when the user asks; otherwise leave staged).**

## Task 2 — SEC-3b: tenant-scope `/api/waseet/submit-orders`

**Files:** Modify `apps/platform/app/api/waseet/submit-orders/route.ts`

- [ ] **Step 1:** add `const submitBodySchema = z.object({ orderIds: z.array(z.string().uuid()).min(1).max(500) })`; replace the manual `Array.isArray` check with `safeParse`.
- [ ] **Step 2:** after auth, fetch `profile.current_tenant_id`; 400 if none.
- [ ] **Step 3:** add `.eq('tenant_id', tenantId)` to the `from("orders").select("*").in("id", orderIds)` fetch.
- [ ] **Step 4:** `tsc --noEmit` → 0 errors.

## Task 3 — SEC-2a: extract trusted create helper

**Files:**
- Create: `apps/platform/lib/order-service.ts`
- Modify: `apps/platform/app/actions/orders.ts`, `apps/platform/app/api/telegram/webhook/route.ts`

- [ ] **Step 1:** create `lib/order-service.ts` (NO `"use server"`) exporting `async function createOrderForTenant(orderData, tenantId: string): Promise<{success;data?;error?;warning?}>` containing the CURRENT body of `createOrderAction` (pause guard, plan-limit check, `create_order_atomic` RPC, `chargeAndTrack`, staff-alert fanout). `tenantId` is now **required** (non-null) — drop every `if (tenantId)` optionality. Move `chargeAndTrack` here too.
- [ ] **Step 2:** `tsc --noEmit` → 0 errors (helper compiles, unused warning ok).
- [ ] **Step 3:** point telegram webhook at it — `route.ts:290` `createOrderForTenant(orderInput, link.tenant_id)` (server-trusted; `link.tenant_id` is verified upstream). Remove the `createOrderAction` import there.

## Task 4 — SEC-2b: authenticate `createOrderAction` + `splitOrderAction`

**Files:** Modify `apps/platform/app/actions/orders.ts`, `apps/platform/hooks/use-orders-query.ts`, `apps/platform/hooks/use-order-crud.ts`

- [ ] **Step 1:** rewrite `createOrderAction(orderData, accessToken: string)` — `verifyAccessToken` (401 shape on fail) → service-client fetch `profile.current_tenant_id, role` → reject if no tenant → reject if `role==='viewer'` → `createOrderForTenant(orderData, tenantId)`. **The client tenantId argument is removed** (tenant is session-derived; this also closes SEC-6 for create).
- [ ] **Step 2:** rewrite `splitOrderAction(originalOrderId, keptItems, returnedItems, accessToken: string)` — verify → derive tenant → pass the **derived** tenant to `split_order_atomic` (never the client's).
- [ ] **Step 3:** update `useCreateOrderMutation` (`use-orders-query.ts:482`) to pass `accessToken` (from the auth session) instead of `tenantId`; thread the token into the hook (it already has access to the Supabase client via `useAuth`).
- [ ] **Step 4:** update `use-order-crud.ts:575` `splitOrderAction(...)` to pass `session.access_token` (the hook already reads `session` at :940/:950).
- [ ] **Step 5:** `tsc --noEmit` + `lint` → 0 errors.

## Task 5 — SEC-2c: authenticate `permissions.ts` (admin-only)

**Files:** Modify `apps/platform/app/actions/permissions.ts`, `apps/platform/components/settings/team-settings.tsx`

- [ ] **Step 1:** add `accessToken: string` param to `toggleRolePermissionAction` and `toggleUserOverrideAction`; each: `verifyAccessToken` → fetch `profile.role` → `if (!isAdminRole(role)) return { success:false, error:'Forbidden' }` → proceed.
- [ ] **Step 2:** update `team-settings.tsx:324,685` callers to pass `session.access_token` (grab session via `supabase.auth.getSession()` as the file already does at :1076).
- [ ] **Step 3:** `tsc --noEmit` + `lint` → 0 errors.

## Task 6 — SEC-1: `create_order_atomic` tenant guard (migration — APPLY GATED)

**Files:** Create `packages/supabase/migrations/20260820HHMMSS_create_order_atomic_tenant_guard.sql`

- [ ] **Step 1:** write the migration: `CREATE OR REPLACE FUNCTION public.create_order_atomic(_order_data jsonb, _tenant_id uuid DEFAULT NULL)` — identical to the live body **plus**, immediately after `BEGIN`, the guard:
  ```sql
  IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
      IF _tenant_id IS NULL OR _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
          RAISE EXCEPTION 'Unauthorized: tenant membership required' USING ERRCODE = '42501';
      END IF;
  END IF;
  ```
  Include a documented **down-migration** (restore the guardless body) in a comment block.
- [ ] **Step 2:** `tsc`/`lint` unaffected. **STOP — do NOT apply.** Present the exact SQL to the user and request the approval sentence for THIS migration specifically (§0.5 rule 3 / Phase 3 step 8).
- [ ] **Step 3 (only after the migration-specific sentence):** apply via `mcp__supabase__apply_migration`; then verify read-only: as a foreign-tenant role the RPC raises `42501`; service-role path still inserts. Regenerate types if the signature changed (it doesn't).

## Verification (end of round, before declaring done)
- [ ] `pnpm --filter @scheniders/platform exec tsc --noEmit` → paste output (0 errors).
- [ ] `pnpm --filter @scheniders/platform lint` → paste (0 errors).
- [ ] `pnpm --filter @scheniders/platform exec vitest run` on the new schema tests + existing order tests → paste.
- [ ] `verification-before-completion` skill.
- [ ] `/code-review high` on the diff; fix findings.

## Self-review notes
- Spec coverage: SEC-1 (Task 6), SEC-2 (Tasks 3–5), SEC-3 (Tasks 1–2). ✓
- Telegram webhook (trusted server caller) preserved via Task 3 helper. ✓
- No placeholder steps; all code shown inline or referenced to exact lines. ✓
- Naming consistency: `createOrderForTenant` used identically in Tasks 3 & 4. ✓
