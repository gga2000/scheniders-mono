# PDP order safety net — P2: safe submit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox () syntax for tracking.

**Spec:** docs/superpowers/specs/2026-10-21-pdp-order-safety-net-design.md · **Index:** docs/superpowers/plans/2026-10-21-safety-net-index.md

---

## P2 — Never-lose-the-buyer submit (classic + express PDP, server guard)

**Goal.** No COD order is lost or duplicated at «ثبّت طلبي». Each submit attempt has a deadline. One resend goes out with the same key. A WhatsApp way out appears when the outcome is unknown. The form and the key survive a reload. The server answers transient failures with 503 and records nothing new on a replay. A soft duplicate guard catches "same phone + same products within 10 minutes" across tabs and devices.

**Design decisions this piece commits to (read before Task P2.1):**

1. **Where the duplicate guard lives: a new SECURITY DEFINER wrapper `public.create_storefront_order(_order_data, _tenant_id, _paid_product_ids, _duplicate_window_minutes)`.** It takes the lock that `create_order_atomic` takes itself: the global transaction lock `pg_advisory_xact_lock(hashtext('create_order_lock'))`, verified live with `pg_get_functiondef`. While it holds that lock, it does three things in order:
   - (a) If the idempotency key already exists for the tenant, it delegates to `create_order_atomic`, which returns `idempotent_replay` exactly as today.
   - (b) Otherwise it looks for a live order to treat as a duplicate. The order must be non-test, not `pending_checkout`/`cancelled`/`rejected`, in the same tenant, with the same `loyalty_phone_key(phone)`, created within the window, and it must contain **every** paid product of the new order. If one is found, it returns that row plus `idempotent_replay: true, duplicate_guard: true`.
   - (c) Otherwise it calls `create_order_atomic(_order_data, _tenant_id)`, which is **not modified**.

   **Why it is race-safe.** The transaction lock is held until the RPC's single PostgREST transaction commits, so the insert is inside the lock. Every concurrent storefront submit, and every LF `create_order_atomic` call, queues on that same lock. The function is VOLATILE plpgsql under READ COMMITTED, so the guard's SELECT takes its snapshot after the lock is granted. It therefore sees the order the previous holder committed. When `create_order_atomic` takes the lock again inside the same transaction, the call is re-entrant. There is no second lock, so lock ordering cannot deadlock.

   **Why not a separate pre-check RPC.** A separate call would be its own transaction. Its lock would be released before the insert, so two tabs could both pass the check.

   **Cost.** The guard SELECT uses `idx_orders_tenant_phone_key (tenant_id, loyalty_phone_key(phone)) WHERE deleted_at IS NULL`. This was verified with EXPLAIN ANALYZE on live data: 7 ms in total, dominated by planning.
2. **"Same product" means a subset: every paid product of the new order already appears in the recent order.** Two cases show why:
   - A cart order of A+B, where A was ordered 5 minutes ago, still creates a new order, so B is not lost. That is "a different product is a normal new order".
   - The server-added free gift is excluded from the product list, because only `paidItems` ids are sent.
3. **The duplicate answer carries no order identifiers.** The server returns `{ success: true, replayed: true, duplicate: true }` only. A phone number plus a product is not proof that the caller is that buyer, and an order number together with the phone opens `/track`. The client shows «طلبك واصلنا، لا تطلبه مرة ثانية» in place. It fires no Purchase, writes no stash and does not navigate.
4. **`replayed: true` covers both kinds of replay.** That is a same-key replay or a duplicate-guard answer. The route already skips the funnel insert on a replay and now also skips the experiment insert. Piece 1 queues the WhatsApp confirmation (`queueOrderConfirmation`) *after* both existing replay returns in `submitCheckout`, so it never runs for a replay. This piece's duplicate return (Task P2.3 (o)) is inserted *before* those returns, so a duplicate never queues a confirmation either. Task P2.3's test asserts this.
5. **Transient vs permanent errors.** Every failed DB read or RPC in `submitCheckout` sets `retryable` from its SQLSTATE class:
   - Permanent (`retryable` false): `22`, `23`, `42`, `P0`, and PostgREST codes other than `PGRST00x`.
   - Transient (`retryable` true): everything else, including errors with no code, which never reached Postgres.

   The route answers `retryable` with **503**; everything else stays 422. The `issues` / `new_price` self-heal never sets `retryable`, so it stays a 422. `checkout_form` treats any non-2xx the same way, so a 503 shows the same message there.
6. **Client resend rule.** It lives in `helpers/submit-order.ts`:
   - Each attempt has a 20 s `AbortController` deadline.
   - No answer (a timeout, a network error, or a 5xx) leads to exactly one resend with the **identical body**, so the same key.
   - A second miss gives `unconfirmed`: the button is enabled again, the key is kept, and «ابعث نفس الطلب بالواتساب» is offered. The link uses the tenant number even where the tile is hidden.
7. **Draft.** `sessionStorage` key `schn:order-draft:{tenantId}:{productId}` holds `{form, idempotencyKey, purchaseEventId}`.
   - It is written once the shopper interacts or a draft was restored, and again just before the request leaves.
   - It is restored on mount, before the customer-memory prefill, so the draft wins.
   - It is cleared on a placed order or a duplicate answer.
   - A section test setup clears sessionStorage after each test, because jsdom keeps one window per file.
8. **Known limitation.** If the RPC's response is lost after a commit, the redemption refund at `checkout.ts:663` (664 after P1) has already run, while the client's same-key resend replays an order with the points discount in it. This was already the case before this piece, and the replay lookup now answers it correctly. Points double-benefit stays a separate fix; this plan does not change redemption.
9. **Migration timestamp `20261021142000`.** It comes after the latest file, `20261021120000_publish_store_config_v2_allow_template.sql`. If another piece of this plan has already used `20261021142000`, use the next free minute and change the file name everywhere below. P1's `20261021130000` sorts before it and P3's `20261021160000` sorts after it, so there is no clash.
10. **Prerequisite: Piece 1 has landed, and run this piece before P3.** P1 edits `checkout.ts`: it adds 1 line after `:29` and 11 lines after `:711`, and it creates `checkout-whatsapp-confirmation.test.ts`, which mocks `create_order_atomic`. P1 also adds 3 lines to the `orders` block of `database.types.ts`. Every line number in this plan comes from the working tree *before* P1. After P1, numbers in `checkout.ts` from line 30 on are +1, and the `database.types.ts` Functions entries are +3. Every edit below gives the exact text to replace, so match on that text, not on the number.

Shell prelude for every command below (run from the repo root):

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"
```

---

### Task P2.0: Pre-flight

**Files:** none.

- [ ] **Step 1: Confirm the branch, that no merge is in progress, and that the index is clean.**

```bash
cd /Users/ali/scheniders-mono && git rev-parse --abbrev-ref HEAD && (git rev-parse -q --verify MERGE_HEAD || echo "no merge in progress") && git diff --cached --name-only | wc -l
```

Expected output: `feat/pdp-entry-atelier`, then `no merge in progress`, then `0`. If MERGE_HEAD exists or anything is staged, stop: Piece 0 must be committed first.

- [ ] **Step 1b: Confirm Piece 1 has landed.** Task P2.3 renames the RPC in P1's test, and P2.3's own test mocks P1's queue module.

```bash
cd /Users/ali/scheniders-mono && test -f apps/storefront/lib/order-confirmation-queue.ts && test -f apps/storefront/app/actions/checkout-whatsapp-confirmation.test.ts && grep -q 'queueOrderConfirmation({ id: createdRowId' apps/storefront/app/actions/checkout.ts && git diff --quiet HEAD -- apps/storefront/app/actions/checkout.ts && echo p1-landed
```

Expected: `p1-landed`. If it prints nothing, stop and run P1 first.

- [ ] **Step 2: Baseline. The suites this piece touches are green before any change.**

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run apps/storefront/app/actions apps/storefront/app/api/checkout/orders apps/storefront/lib/draft-view-guards.test.tsx packages/sections/src
```

Expected: all files pass, with 0 failed tests and 0 failed snapshots.

---

### Task P2.1: DB, the `create_storefront_order` duplicate-guard wrapper (+ TS types)

**Files:**
- Create: `packages/supabase/migrations/20261021142000_create_storefront_order_duplicate_guard.sql`
- Modify: `packages/supabase/src/database.types.ts`, the `create_order_atomic` Functions entry (lines 8426–8428 before P1, 8429–8431 after P1's 3 `orders` lines); insert directly after it

- [ ] **Step 1: Write the "failing test", a probe showing that the function does not exist yet.** Run it with the supabase MCP `execute_sql` (project `sduvpgqwhxragxtxztur`):

```sql
SELECT count(*) AS fn_exists FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'create_storefront_order';
```

Expected: `fn_exists = 0`.

- [ ] **Step 2: Write the migration file** with exactly this content:

```sql
-- =============================================
-- create_storefront_order: create_order_atomic behind a soft duplicate guard
--
-- Spec: docs/superpowers/specs/2026-10-21-pdp-order-safety-net-design.md §2.
-- The storefront checkout (apps/storefront/app/actions/checkout.ts) calls
-- this instead of create_order_atomic. Holding create_order_atomic's own
-- transaction lock, it:
--   1. sends a repeated idempotency key straight to create_order_atomic, which
--      answers with that key's order (`idempotent_replay`) exactly as before;
--   2. otherwise, when this tenant already has a live, non-test order from the
--      same phone (loyalty_phone_key) placed inside the window that contains
--      EVERY paid product of this one, returns that order with
--      `idempotent_replay` and `duplicate_guard` set — nothing is inserted;
--   3. otherwise runs create_order_atomic(_order_data, _tenant_id), unchanged.
--
-- Race safety: pg_advisory_xact_lock(hashtext('create_order_lock')) is the
-- lock create_order_atomic takes. A transaction-scoped lock is held until
-- this RPC's transaction commits — after the insert. Every other storefront
-- submit and every LF create_order_atomic call waits on the same lock, and
-- (VOLATILE plpgsql, READ COMMITTED) the guard's SELECT takes its snapshot
-- after the lock is granted, so it sees the order the previous holder
-- committed. create_order_atomic re-taking the lock in the same transaction
-- is re-entrant; there is no second lock, so no lock-order deadlock.
--
-- create_order_atomic is NOT modified; LF keeps calling it directly.
-- Service role only. No table or RLS change.
-- =============================================

CREATE OR REPLACE FUNCTION public.create_storefront_order(
  _order_data jsonb,
  _tenant_id uuid,
  _paid_product_ids uuid[],
  _duplicate_window_minutes integer
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _idem text := NULLIF(_order_data->>'idempotency_key', '');
  _phone_key text := public.loyalty_phone_key(_order_data->>'phone');
  _existing jsonb;
BEGIN
  IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: storefront checkout only' USING ERRCODE = '42501';
  END IF;
  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'create_storefront_order: _tenant_id is required' USING ERRCODE = '22004';
  END IF;
  IF _duplicate_window_minutes IS NULL OR _duplicate_window_minutes <= 0 THEN
    RAISE EXCEPTION 'create_storefront_order: _duplicate_window_minutes must be positive' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('create_order_lock')::bigint);

  -- A key this tenant has seen is create_order_atomic's to answer: a same-key
  -- resend must get ITS order back as a replay, never a "duplicate".
  IF _idem IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.orders WHERE tenant_id = _tenant_id AND idempotency_key = _idem
  ) THEN
    RETURN public.create_order_atomic(_order_data, _tenant_id);
  END IF;

  -- The array-length check matters: an empty product list would make the
  -- "every product is in that order" test vacuously true.
  IF _phone_key IS NOT NULL AND coalesce(array_length(_paid_product_ids, 1), 0) > 0 THEN
    SELECT to_jsonb(o.*) INTO _existing
      FROM public.orders o
     WHERE o.tenant_id = _tenant_id
       AND public.loyalty_phone_key(o.phone) = _phone_key
       AND o.deleted_at IS NULL
       AND coalesce(o.is_test, false) = false
       AND o.status NOT IN ('pending_checkout', 'cancelled', 'rejected')
       AND o.created_at > now() - make_interval(mins => _duplicate_window_minutes)
       AND NOT EXISTS (
         SELECT 1
           FROM unnest(_paid_product_ids) AS wanted(product_id)
          WHERE NOT EXISTS (
            SELECT 1
              FROM jsonb_array_elements(
                     CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END
                   ) AS line(item)
             WHERE line.item->>'product_id' = wanted.product_id::text
          )
       )
     ORDER BY o.created_at DESC
     LIMIT 1;

    IF _existing IS NOT NULL THEN
      RETURN _existing || jsonb_build_object('idempotent_replay', true, 'duplicate_guard', true);
    END IF;
  END IF;

  RETURN public.create_order_atomic(_order_data, _tenant_id);
END;
$function$;

-- Supabase grants new public functions to anon/authenticated by default
-- privileges, and a PUBLIC grant survives a REVOKE FROM anon — revoke all three.
REVOKE ALL ON FUNCTION public.create_storefront_order(jsonb, uuid, uuid[], integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_storefront_order(jsonb, uuid, uuid[], integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_storefront_order(jsonb, uuid, uuid[], integer) TO service_role;

COMMENT ON FUNCTION public.create_storefront_order(jsonb, uuid, uuid[], integer) IS
  'Storefront checkout: create_order_atomic (unchanged) behind a soft duplicate guard — same tenant + loyalty_phone_key + every paid product within the window returns the existing order with idempotent_replay+duplicate_guard. Takes create_order_atomic''s transaction lock first, so the check and the insert are one critical section.';
```

- [ ] **Step 3: Apply it.** Use the supabase MCP `apply_migration` with name `create_storefront_order_duplicate_guard` and the exact file content above as `query`.

- [ ] **Step 4: Verify the privileges.** Run via `execute_sql`:

```sql
SELECT r.rolname,
       has_function_privilege(r.rolname, 'public.create_storefront_order(jsonb, uuid, uuid[], integer)', 'EXECUTE') AS can_execute
  FROM pg_roles r WHERE r.rolname IN ('anon', 'authenticated', 'service_role') ORDER BY 1;
```

Expected: `anon false`, `authenticated false`, `service_role true`.

- [ ] **Step 5: Verify the behaviour inside a transaction that always rolls back.** The DO block raises at the end, so nothing persists. Run via `execute_sql`:

```sql
DO $$
DECLARE
  t uuid;
  p uuid := gen_random_uuid();
  q uuid := gen_random_uuid();
  base jsonb;
  a jsonb; b jsonb; c jsonb; d jsonb; e jsonb; f jsonb; g jsonb;
BEGIN
  SELECT id INTO t FROM public.tenants WHERE slug = 'scheniders-iraq';
  base := jsonb_build_object(
    'customer_name', 'guard-test', 'phone', '07809990001', 'city', 'guard-test',
    'address_details', 'guard-test', 'governorate_code', 'BG', 'price', 1000,
    'delivery_fee', 0, 'discount_amount', 0, 'status', 'new', 'payment_status', 'pending',
    'source', 'storefront', 'is_shop_order', true);

  a := public.create_storefront_order(base || jsonb_build_object('idempotency_key', 'guard-test-a',
         'items', jsonb_build_array(jsonb_build_object('product_id', p, 'name', 'guard-test', 'price', 1000, 'quantity', 1))),
       t, ARRAY[p], 10);
  b := public.create_storefront_order(base || jsonb_build_object('idempotency_key', 'guard-test-b',
         'items', jsonb_build_array(jsonb_build_object('product_id', p, 'name', 'guard-test', 'price', 1000, 'quantity', 1))),
       t, ARRAY[p], 10);
  c := public.create_storefront_order(base || jsonb_build_object('idempotency_key', 'guard-test-a',
         'items', jsonb_build_array(jsonb_build_object('product_id', p, 'name', 'guard-test', 'price', 1000, 'quantity', 1))),
       t, ARRAY[p], 10);
  d := public.create_storefront_order(base || jsonb_build_object('idempotency_key', 'guard-test-d',
         'items', jsonb_build_array(jsonb_build_object('product_id', q, 'name', 'guard-test', 'price', 1000, 'quantity', 1))),
       t, ARRAY[q], 10);
  e := public.create_storefront_order(base || jsonb_build_object('phone', '+964 780 999 0001', 'idempotency_key', 'guard-test-e',
         'items', jsonb_build_array(jsonb_build_object('product_id', p, 'name', 'guard-test', 'price', 1000, 'quantity', 1))),
       t, ARRAY[p], 10);
  UPDATE public.orders SET created_at = now() - interval '11 minutes' WHERE id = (a->>'id')::uuid;
  f := public.create_storefront_order(base || jsonb_build_object('idempotency_key', 'guard-test-f',
         'items', jsonb_build_array(jsonb_build_object('product_id', p, 'name', 'guard-test', 'price', 1000, 'quantity', 1))),
       t, ARRAY[p], 10);
  g := public.create_storefront_order(base || jsonb_build_object('idempotency_key', 'guard-test-g',
         'items', jsonb_build_array(
           jsonb_build_object('product_id', p, 'name', 'guard-test', 'price', 1000, 'quantity', 1),
           jsonb_build_object('product_id', q, 'name', 'guard-test', 'price', 1000, 'quantity', 1))),
       t, ARRAY[p, q], 10);

  -- Each value is cast to text: RAISE formats a bare boolean with its output
  -- function (`t` / `f`), and the expected line below spells `true`.
  RAISE EXCEPTION 'GUARD_CHECK first_new=% dup_returns_first=% dup_flagged=% key_replay_same=% key_replay_not_dup=% other_product_new=% intl_phone_dup=% after_window_new=% needs_every_product_new=%',
    ((a ? 'id') AND NOT (a ? 'idempotent_replay'))::text,
    (b->>'id' = a->>'id')::text,
    coalesce((b->>'duplicate_guard')::boolean, false)::text,
    (c->>'id' = a->>'id' AND coalesce((c->>'idempotent_replay')::boolean, false))::text,
    (NOT (c ? 'duplicate_guard'))::text,
    (d->>'id' <> a->>'id' AND NOT (d ? 'idempotent_replay'))::text,
    (e->>'id' = a->>'id' AND coalesce((e->>'duplicate_guard')::boolean, false))::text,
    (f->>'id' <> a->>'id' AND NOT (f ? 'idempotent_replay'))::text,
    (g->>'id' NOT IN (a->>'id', d->>'id', f->>'id') AND NOT (g ? 'idempotent_replay'))::text;
END $$;
```

Expected: the call **errors** with exactly
`GUARD_CHECK first_new=true dup_returns_first=true dup_flagged=true key_replay_same=true key_replay_not_dup=true other_product_new=true intl_phone_dup=true after_window_new=true needs_every_product_new=true`.
Any `false` or `<NULL>` means the function body differs from Step 2. Fix the SQL and re-apply. Do not move on.

Then confirm the rollback:

```sql
SELECT count(*) AS leftovers FROM public.orders WHERE customer_name = 'guard-test';
```

Expected: `leftovers = 0`.

- [ ] **Step 6: Add the RPC to the generated types by hand.** Do not regenerate the whole file, because other drift would come along. In `packages/supabase/src/database.types.ts`, directly after these lines (8426–8428 before P1, 8429–8431 after it; match on the text):

```ts
      create_order_atomic:
        | { Args: { _order_data: Json }; Returns: Json }
        | { Args: { _order_data: Json; _tenant_id?: string }; Returns: Json }
```

insert:

```ts
      create_storefront_order: {
        Args: {
          _duplicate_window_minutes: number
          _order_data: Json
          _paid_product_ids: string[]
          _tenant_id: string
        }
        Returns: Json
      }
```

Verify it matches the generator. Call the supabase MCP `generate_typescript_types` and check that its output contains the same `create_storefront_order` block, with the same four args and `Returns: Json`.

- [ ] **Step 7: Commit.**

```bash
cd /Users/ali/scheniders-mono && git rev-parse --abbrev-ref HEAD && git add packages/supabase/migrations/20261021142000_create_storefront_order_duplicate_guard.sql packages/supabase/src/database.types.ts && git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(db): create_storefront_order — soft duplicate guard under the order lock" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git branch --contains HEAD | grep -q 'feat/pdp-entry-atelier' && echo committed-on-branch
```

Expected: `feat/pdp-entry-atelier`, the commit summary, then `committed-on-branch`.

---

### Task P2.2: Storefront, transient vs permanent DB-error classifier

**Files:**
- Create: `apps/storefront/lib/transient-db-error.ts`
- Create: `apps/storefront/lib/transient-db-error.test.ts`

- [ ] **Step 1: Write the failing test** `apps/storefront/lib/transient-db-error.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isTransientDbError } from "./transient-db-error";

describe("isTransientDbError", () => {
  it("is false when there is no error", () => {
    expect(isTransientDbError(null)).toBe(false);
    expect(isTransientDbError(undefined)).toBe(false);
  });

  it("treats an error that never reached Postgres (no code) as transient", () => {
    expect(isTransientDbError({ code: "" })).toBe(true);
    expect(isTransientDbError({})).toBe(true);
  });

  it.each(["08006", "40001", "40P01", "53300", "57014", "PGRST000", "PGRST003"])(
    "treats %s as transient",
    (code) => {
      expect(isTransientDbError({ code })).toBe(true);
    },
  );

  it.each(["22P02", "23505", "23514", "42501", "42883", "P0001", "PGRST116", "PGRST202"])(
    "treats %s as permanent",
    (code) => {
      expect(isTransientDbError({ code })).toBe(false);
    },
  );
});
```

- [ ] **Step 2: Run it.**

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run apps/storefront/lib/transient-db-error.test.ts
```

Expected failure: `Failed to resolve import "./transient-db-error"`.

- [ ] **Step 3: Implement** `apps/storefront/lib/transient-db-error.ts`:

```ts
// =====================================================================
// Was a failed Supabase call the platform's fault, or the request's?
// =====================================================================
// The checkout answers the two differently. A request the database refused
// (bad data, a constraint, a permission, a function's RAISE) fails the same
// way every time: a 422 the shopper must act on. A call that never completed
// (no connection, a timeout, a deadlock, PostgREST unable to reach Postgres)
// may succeed on the next attempt: a 503 the client may resend with the same
// idempotency key — which the server answers with the order if one landed.
//
// Classified by SQLSTATE class: 22 data exception · 23 integrity violation ·
// 42 syntax/permission · P0 raised by a function — permanent; every other
// class — transient. An error with no code never reached Postgres (the fetch
// itself failed). PostgREST's own codes are permanent except PGRST000–009,
// which mean it could not reach the database or get a connection.
// =====================================================================

export interface DbErrorLike {
  code?: string | null;
}

const PERMANENT_SQLSTATE_CLASSES = ["22", "23", "42", "P0"] as const;
const POSTGREST_CONNECTION_ERROR = /^PGRST00\d$/;

export function isTransientDbError(error: DbErrorLike | null | undefined): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  if (code === "") return true;
  if (code.startsWith("PGRST")) return POSTGREST_CONNECTION_ERROR.test(code);
  return !PERMANENT_SQLSTATE_CLASSES.some((cls) => code.startsWith(cls));
}
```

- [ ] **Step 4: Run it again.** Same command as Step 2. Expected: 17 tests pass.

- [ ] **Step 5: Commit.**

```bash
cd /Users/ali/scheniders-mono && git rev-parse --abbrev-ref HEAD && git add apps/storefront/lib/transient-db-error.ts apps/storefront/lib/transient-db-error.test.ts && git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(storefront): classify transient vs permanent database errors" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git branch --contains HEAD | grep -q 'feat/pdp-entry-atelier' && echo committed-on-branch
```

---

### Task P2.3: `submitCheckout` calls the guarded RPC, answers a duplicate, flags retryable failures

**Files:**
- Create: `apps/storefront/lib/order-duplicate-guard.ts`
- Create: `apps/storefront/app/actions/checkout-duplicate-guard.test.ts`
- Modify: `apps/storefront/app/actions/checkout.ts`, lines (pre-P1 numbering; +1 from line 30 on after P1) 29, 94–97, 126–127, 159–162, 187–190, 202–205, 224–228, 235–238, 258–259, 286–287, 439–440, 514–515, 642–645, 660–665, and an insert before 672
- Modify: `apps/storefront/lib/variant-products.ts`, lines 19 and 33 (`VariantReadError` carries the failed read's code)
- Modify: `apps/storefront/lib/testing/fake-supabase.ts`, lines 20–23
- Modify (rename of the mocked RPC): `apps/storefront/app/actions/checkout-cod-risk.test.ts` (lines 9, 71, 94), `checkout-referral.test.ts` (83, 100, 221), `checkout-loyalty.test.ts` (70, 105), `cart-checkout-agreement.test.ts` (74, 184), `checkout-pricing.test.ts` (9, 79, 109, 423, 436, 443, 454), `apps/storefront/lib/draft-view-guards.test.tsx` (163, 225–227), and P1's `apps/storefront/app/actions/checkout-whatsapp-confirmation.test.ts` (its `create_order_atomic:` rpc key and its `c.fn === "create_order_atomic"` check)

- [ ] **Step 1: Widen the fake's error type** so that tests can pass a SQLSTATE. In `apps/storefront/lib/testing/fake-supabase.ts`, replace:

```ts
interface Result {
  data: unknown;
  error: { message: string } | null;
}
```

with:

```ts
interface Result {
  data: unknown;
  /** `code` is the SQLSTATE / PostgREST code a real error carries. */
  error: { message: string; code?: string } | null;
}
```

- [ ] **Step 2: Write the failing test** `apps/storefront/app/actions/checkout-duplicate-guard.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createFakeSupabase,
  type FakeSupabaseOptions,
  type Row,
} from "@/lib/testing/fake-supabase";

// =====================================================================
// Soft duplicate guard + retryable failures (spec 2026-10-21 §2).
// =====================================================================
// submitCheckout hands the order to create_storefront_order with the PAID
// product ids (never the server-added gift) and the window; a duplicate
// answer creates nothing, refunds a redemption, records no side effects and
// names no order. A failure the platform caused is flagged retryable (503);
// one the request caused is not (422).
// =====================================================================

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock("@/lib/capi", () => ({ sendPurchaseCapi: vi.fn() }));
vi.mock("@/lib/draft-view", () => ({
  isDraftViewRequest: vi.fn(async () => false),
}));
// Piece 1's instant WhatsApp confirmation: queued for a new order only.
vi.mock("@/lib/order-confirmation-queue", () => ({ queueOrderConfirmation: vi.fn() }));

import { submitCheckout } from "./checkout";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { queueOrderConfirmation } from "@/lib/order-confirmation-queue";
import { DUPLICATE_ORDER_WINDOW_MINUTES } from "@/lib/order-duplicate-guard";

const TENANT = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const PERFUME = "a1b2c3d4-e5f6-4789-ab12-cd34ef567890";
const GIFT = "c1b2c3d4-e5f6-4789-ab12-cd34ef567890";
const NEW_ORDER = "11111111-1111-4111-8111-111111111111";
const EXISTING = "22222222-2222-4222-8222-222222222222";

function product(id: string, price: number): Row {
  return {
    id,
    tenant_id: TENANT,
    name: `Product ${id.slice(0, 4)}`,
    short_name: null,
    price,
    website_price: null,
    status: "active",
    is_visible: true,
    is_archived: false,
    is_supply: false,
    stock_quantity: 50,
    reserved_quantity: 0,
  };
}

function tables(): Record<string, Row[]> {
  return {
    tenants: [
      {
        id: TENANT,
        status: "active",
        restrictions: null,
        store_config_v2: {
          commerce: {
            shipping: { default_rate: { fee_iqd: 5000 } },
            free_gift: { enabled: true, product_id: GIFT, threshold_iqd: 60000 },
            loyalty: { enabled: true, earn_per_iqd: 0.001, redeem_value_iqd: 1, max_redeem_pct: 100 },
          },
        },
      },
    ],
    products: [product(PERFUME, 35000), product(GIFT, 12000)],
    product_variants: [],
    product_tiered_pricing: [],
    product_order_bumps: [],
    abandoned_carts: [],
    referrals: [],
    orders: [],
    customer_points: [{ tenant_id: TENANT, phone: "07701234567", balance: 2000 }],
  };
}

function install(
  t: Record<string, Row[]>,
  rpc: FakeSupabaseOptions["rpc"],
  failingTables: string[] = [],
) {
  const fake = createFakeSupabase(t, { rpc, failingTables });
  vi.mocked(createSupabaseServiceClient).mockReturnValue(fake.client);
  return fake;
}

const created = () => ({ data: { id: NEW_ORDER, order_id: "SH-0001" }, error: null });

const customer = {
  customer_name: "Ali Hassan",
  phone: "07701234567",
  governorate_code: "BG",
  city: "Baghdad",
  address_details: "Street 14",
};

function line(productId: string, price: number, quantity: number) {
  return { product_id: productId, variant_id: null, name: "client name", variant_name: null, price, quantity };
}

const pointsDeltas = (fake: ReturnType<typeof install>) =>
  fake.rpcCalls
    .filter((c) => c.fn === "adjust_customer_points")
    .map((c) => [c.args._reason, c.args._delta]);

beforeEach(() => vi.clearAllMocks());

describe("submitCheckout → create_storefront_order", () => {
  it("hands over the order, its tenant, the PAID product ids (not the gift) and the window", async () => {
    const fake = install(tables(), { create_storefront_order: created });
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(PERFUME, 35000, 2)] });
    expect(res.success).toBe(true);
    const call = fake.rpcCalls.find((c) => c.fn === "create_storefront_order");
    expect(call?.args._tenant_id).toBe(TENANT);
    expect(call?.args._paid_product_ids).toEqual([PERFUME]);
    expect(call?.args._duplicate_window_minutes).toBe(DUPLICATE_ORDER_WINDOW_MINUTES);
    const order = call?.args._order_data as { items: Array<{ product_id: string }> };
    // The gift is on the order, but it is not something the buyer chose.
    expect(order.items.map((i) => i.product_id)).toEqual([PERFUME, GIFT]);
    expect(fake.rpcCalls.some((c) => c.fn === "create_order_atomic")).toBe(false);
    // A new order still gets Piece 1's confirmation through the new RPC.
    expect(queueOrderConfirmation).toHaveBeenCalledWith({ id: NEW_ORDER, tenantId: TENANT });
  });

  it("answers a duplicate with no new order's side effects and no order identifiers", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "proof-root");
    const fake = install(tables(), {
      create_storefront_order: () => ({
        data: {
          id: EXISTING,
          order_id: "SH-0007",
          price: 35000,
          discount_amount: 0,
          delivery_fee: 5000,
          idempotent_replay: true,
          duplicate_guard: true,
        },
        error: null,
      }),
    });
    const res = await submitCheckout({
      tenantId: TENANT,
      customer,
      items: [line(PERFUME, 35000, 1)],
      redeemPoints: 2000,
    });
    expect(res).toEqual({ success: true, replayed: true, duplicate: true });
    // The redemption this call made is given back: no order used it.
    expect(pointsDeltas(fake)).toEqual([
      ["redeem", -2000],
      ["redeem_refund", 2000],
    ]);
    expect(fake.writes.some((w) => w.table === "abandoned_carts")).toBe(false);
    expect(fake.writes.some((w) => w.table === "referrals")).toBe(false);
    // The existing order had its WhatsApp confirmation when it was placed.
    expect(queueOrderConfirmation).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("still answers an idempotency replay as that order, not as a duplicate", async () => {
    install(tables(), {
      create_storefront_order: () => ({
        data: { id: EXISTING, order_id: "SH-0007", price: 35000, discount_amount: 0, delivery_fee: 5000, idempotent_replay: true },
        error: null,
      }),
    });
    const res = await submitCheckout({
      tenantId: TENANT,
      customer,
      idempotencyKey: "k-0000-0001",
      items: [line(PERFUME, 35000, 1)],
    });
    expect(res).toMatchObject({ success: true, orderId: EXISTING, orderNumber: "SH-0007", replayed: true });
    expect(res.duplicate).toBeUndefined();
  });
});

describe("retryable failures", () => {
  it("flags a catalogue read that did not complete", async () => {
    install(tables(), { create_storefront_order: created }, ["products"]);
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(PERFUME, 35000, 1)] });
    expect(res.success).toBe(false);
    expect(res.retryable).toBe(true);
  });

  it("flags a variant read that did not complete", async () => {
    install(tables(), { create_storefront_order: created }, ["product_variants"]);
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(PERFUME, 35000, 1)] });
    expect(res.success).toBe(false);
    expect(res.retryable).toBe(true);
  });

  it("flags an order RPC that timed out", async () => {
    install(tables(), {
      create_storefront_order: () => ({
        data: null,
        error: { message: "canceling statement due to statement timeout", code: "57014" },
      }),
    });
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(PERFUME, 35000, 1)] });
    expect(res.success).toBe(false);
    expect(res.retryable).toBe(true);
  });

  it("does not flag an order the database refused", async () => {
    install(tables(), {
      create_storefront_order: () => ({
        data: null,
        error: { message: "new row violates check constraint", code: "23514" },
      }),
    });
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(PERFUME, 35000, 1)] });
    expect(res.success).toBe(false);
    expect(res.retryable).toBe(false);
  });

  it("does not flag a store that does not exist", async () => {
    const t = tables();
    t.tenants = [];
    install(t, { create_storefront_order: created });
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(PERFUME, 35000, 1)] });
    expect(res.success).toBe(false);
    expect(res.retryable).toBeUndefined();
  });

  it("keeps line issues un-flagged (the 422 new_price self-heal)", async () => {
    install(tables(), { create_storefront_order: created });
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(PERFUME, 1, 1)] });
    expect(res.success).toBe(false);
    expect(res.issues?.[0]).toMatchObject({ reason: "price_changed", new_price: 35000 });
    expect(res.retryable).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run it.**

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run apps/storefront/app/actions/checkout-duplicate-guard.test.ts
```

Expected failure: `Failed to resolve import "@/lib/order-duplicate-guard"`.

- [ ] **Step 4: Create** `apps/storefront/lib/order-duplicate-guard.ts`:

```ts
// =====================================================================
// Storefront soft duplicate guard — the TypeScript half
// =====================================================================
// create_storefront_order (migration 20261021142000) returns an existing
// order instead of inserting when this tenant already has a live order from
// the same phone, placed inside the window, that holds every product this
// one pays for. LF baseline: 68 of 129 same-phone repeats within 48h landed
// inside 10 minutes; 34 orders were cancelled as duplicates.
// =====================================================================

/** Minutes after an order during which the same phone ordering the same
 *  products again is answered with that order (spec 2026-10-21 §2). */
export const DUPLICATE_ORDER_WINDOW_MINUTES = 10;

/** True when create_storefront_order answered with an order its duplicate
 *  guard matched — neither a new insert nor an idempotency replay. */
export function isDuplicateGuardRow(row: Record<string, unknown> | null): boolean {
  return row?.duplicate_guard === true;
}
```

- [ ] **Step 5: Edit `apps/storefront/app/actions/checkout.ts`.** Apply each replacement exactly.

(a) Imports. Replace line 29:

```ts
import { signUpsellProof, upsellProofSecret } from "@/lib/order-upsell-proof";
```

with:

```ts
import { signUpsellProof, upsellProofSecret } from "@/lib/order-upsell-proof";
import { isTransientDbError } from "@/lib/transient-db-error";
import { DUPLICATE_ORDER_WINDOW_MINUTES, isDuplicateGuardRow } from "@/lib/order-duplicate-guard";
```

(b) Result type. Replace lines 94–97:

```ts
  /** EC17: this answers an order the same idempotency key already placed, so
   *  callers must not record its side effects (funnel purchase) again. */
  replayed?: boolean;
}
```

with:

```ts
  /** EC17: this answers an order the same idempotency key already placed, so
   *  callers must not record its side effects (funnel purchase) again. */
  replayed?: boolean;
  /** The failure is the platform's (a read or write that did not complete),
   *  not the order's: the same request — same idempotency key — may succeed
   *  when sent again. The route answers it with 503 instead of 422. */
  retryable?: boolean;
  /** Soft duplicate guard: this phone placed an order holding these products
   *  minutes ago, and no new order was created. Always with `replayed`, and
   *  with no order id or number — a phone and a product are not proof of
   *  being that buyer, and an order number plus the phone opens /track. */
  duplicate?: boolean;
}
```

(c) Doc comment. Replace:

```ts
/**
 * Creates an order in the platform DB via the create_order_atomic RPC.
```

with:

```ts
/**
 * Creates an order in the platform DB via the create_storefront_order RPC —
 * create_order_atomic, unchanged, behind the soft duplicate guard.
```

(d) Tenant lookup. Replace:

```ts
  if (tenantErr || !tenantRaw) {
    console.error("[checkout] tenant not found:", tenantErr);
    return { success: false, error: "المتجر غير متاح" };
  }
```

with:

```ts
  if (tenantErr) {
    console.error("[checkout] tenant lookup failed:", tenantErr);
    return { success: false, error: "المتجر غير متاح", retryable: isTransientDbError(tenantErr) };
  }
  if (!tenantRaw) {
    console.error("[checkout] tenant not found:", payload.tenantId);
    return { success: false, error: "المتجر غير متاح" };
  }
```

(e) Replace:

```ts
      console.error("[checkout] idempotency lookup failed:", existingErr);
      return { success: false, error: "فشل إنشاء الطلب. حاول مرة أخرى." };
```

with:

```ts
      console.error("[checkout] idempotency lookup failed:", existingErr);
      return { success: false, error: "فشل إنشاء الطلب. حاول مرة أخرى.", retryable: isTransientDbError(existingErr) };
```

(f) Replace:

```ts
    console.error("[checkout] product lookup failed:", productsErr);
    return { success: false, error: "تعذّر التحقق من المنتجات. حاول مرة أخرى." };
```

with:

```ts
    console.error("[checkout] product lookup failed:", productsErr);
    return { success: false, error: "تعذّر التحقق من المنتجات. حاول مرة أخرى.", retryable: isTransientDbError(productsErr) };
```

(g) Replace:

```ts
    console.error("[checkout]", e.message);
    return { success: false, error: "تعذّر التحقق من المنتجات. حاول مرة أخرى." };
```

with:

```ts
    console.error("[checkout]", e.message);
    // Classified from the failed read's own code (carried by VariantReadError,
    // see Step 5b) like every other read here — never assumed transient.
    return { success: false, error: "تعذّر التحقق من المنتجات. حاول مرة أخرى.", retryable: isTransientDbError(e) };
```

(h) Replace:

```ts
      console.error("[checkout] variant lookup failed:", variantsErr);
      return { success: false, error: "تعذّر التحقق من المنتجات. حاول مرة أخرى." };
```

with:

```ts
      console.error("[checkout] variant lookup failed:", variantsErr);
      return { success: false, error: "تعذّر التحقق من المنتجات. حاول مرة أخرى.", retryable: isTransientDbError(variantsErr) };
```

(i) Replace:

```ts
      console.error("[checkout] tier lookup failed:", tiersErr);
      return { success: false, error: "تعذّر التحقق من المنتجات. حاول مرة أخرى." };
```

with:

```ts
      console.error("[checkout] tier lookup failed:", tiersErr);
      return { success: false, error: "تعذّر التحقق من المنتجات. حاول مرة أخرى.", retryable: isTransientDbError(tiersErr) };
```

(j) Replace:

```ts
      console.error("[checkout] bump lookup failed:", bumpsErr);
      return { success: false, error: "تعذّر التحقق من المنتجات. حاول مرة أخرى." };
```

with:

```ts
      console.error("[checkout] bump lookup failed:", bumpsErr);
      return { success: false, error: "تعذّر التحقق من المنتجات. حاول مرة أخرى.", retryable: isTransientDbError(bumpsErr) };
```

(k) Replace:

```ts
        console.error("[checkout] free gift lookup failed:", giftErr);
        return { success: false, error: "تعذّر التحقق من المنتجات. حاول مرة أخرى." };
```

with:

```ts
        console.error("[checkout] free gift lookup failed:", giftErr);
        return { success: false, error: "تعذّر التحقق من المنتجات. حاول مرة أخرى.", retryable: isTransientDbError(giftErr) };
```

(l) Replace:

```ts
        console.error("[checkout] referral check failed:", checkErr);
        return { success: false, error: "تعذّر التحقق من رمز الصديق. حاول مرة أخرى." };
```

with:

```ts
        console.error("[checkout] referral check failed:", checkErr);
        return { success: false, error: "تعذّر التحقق من رمز الصديق. حاول مرة أخرى.", retryable: isTransientDbError(checkErr) };
```

(m) The RPC call. Replace lines 642–645:

```ts
  const { data, error } = await supabase.rpc("create_order_atomic", {
    _order_data: orderData,
    _tenant_id: payload.tenantId,
  });
```

with:

```ts
  // create_order_atomic (unchanged, called inside) behind the soft duplicate
  // guard, both under create_order_atomic's own transaction lock — see
  // migration 20261021142000_create_storefront_order_duplicate_guard. Only
  // the products the buyer is PAYING for count: a server-added gift must not
  // make two different orders look alike.
  const { data, error } = await supabase.rpc("create_storefront_order", {
    _order_data: orderData,
    _tenant_id: payload.tenantId,
    _paid_product_ids: Array.from(new Set(paidItems.map((i) => i.product_id))),
    _duplicate_window_minutes: DUPLICATE_ORDER_WINDOW_MINUTES,
  });
```

(n) The RPC error. Replace:

```ts
    console.error("[checkout] create_order_atomic failed:", error);
    // The order didn't go through.
    await refundRedemption();
    return { success: false, error: "فشل إنشاء الطلب. حاول مرة أخرى." };
```

with:

```ts
    console.error("[checkout] create_storefront_order failed:", error);
    // The RPC's transaction rolled back — or, for a transport failure, its
    // outcome is unknown; the client's same-key resend is then answered by
    // the replay lookup above.
    await refundRedemption();
    return { success: false, error: "فشل إنشاء الطلب. حاول مرة أخرى.", retryable: isTransientDbError(error) };
```

(o) The duplicate branch. Insert immediately **before** the line `  // A concurrent submit with the same key placed the order first: this call` (672 before P1, 673 after it). This must stay above P1's `queueOrderConfirmation` block further down, so a duplicate never queues a confirmation:

```ts
  // Soft duplicate guard (create_storefront_order): this phone placed an
  // order holding every product of this one minutes ago, and that order came
  // back instead of a new one. Its redemption was never used — refund it —
  // and none of a new order's side effects apply. The answer names no order
  // (see SubmitCheckoutResult.duplicate).
  if (orderRow && isDuplicateGuardRow(orderRow)) {
    await refundRedemption();
    return { success: true, replayed: true, duplicate: true };
  }

```

- [ ] **Step 5b: `VariantReadError` carries the failed read's code**, so (g) above classifies it like every other read. In `apps/storefront/lib/variant-products.ts`, replace:

```ts
export class VariantReadError extends Error {}
```

with:

```ts
export class VariantReadError extends Error {
  /** The failed read's SQLSTATE / PostgREST code — what tells a transient
   *  failure (resend the same request) from a refused one. */
  readonly code: string | null;
  constructor(message: string, code: string | null = null) {
    super(message);
    this.code = code;
  }
}
```

and replace:

```ts
  if (error) throw new VariantReadError(`variant read failed: ${error.message}`);
```

with:

```ts
  if (error) throw new VariantReadError(`variant read failed: ${error.message}`, error.code ?? null);
```

The upsell route (`app/api/checkout/orders/[id]/upsell/route.ts:255, :357`) only does `instanceof VariantReadError`, so it is unaffected.

- [ ] **Step 6: Rename the mocked RPC in the existing tests.** They mock what `submitCheckout` calls. The list is explicit on purpose. A glob over `app/actions/*.test.ts` would also rewrite the new `checkout-duplicate-guard.test.ts`, whose `create_order_atomic` check must stay. Inside the listed files every mention is a mock, a lookup or a comment about the RPC `submitCheckout` calls, so all of them are renamed.

```bash
cd /Users/ali/scheniders-mono/apps/storefront && sed -i '' -e 's/create_order_atomic/create_storefront_order/g' app/actions/checkout-cod-risk.test.ts app/actions/checkout-referral.test.ts app/actions/checkout-loyalty.test.ts app/actions/cart-checkout-agreement.test.ts app/actions/checkout-pricing.test.ts app/actions/checkout-whatsapp-confirmation.test.ts lib/draft-view-guards.test.tsx && grep -n 'create_order_atomic' app/actions/checkout-cod-risk.test.ts app/actions/checkout-referral.test.ts app/actions/checkout-loyalty.test.ts app/actions/cart-checkout-agreement.test.ts app/actions/checkout-pricing.test.ts app/actions/checkout-whatsapp-confirmation.test.ts lib/draft-view-guards.test.tsx; echo "remaining=$?"
```

(The list is written out twice, not kept in a shell variable: the session shell is zsh, which does not word-split an unquoted `$VAR`.)

Expected: no grep lines, then `remaining=1`, because grep found nothing.

- [ ] **Step 7: Run the new and the renamed suites.**

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run apps/storefront/app/actions apps/storefront/lib/draft-view-guards.test.tsx apps/storefront/lib/transient-db-error.test.ts
```

Expected: all pass, including the 9 tests in `checkout-duplicate-guard.test.ts` and P1's 7 tests in the renamed `checkout-whatsapp-confirmation.test.ts`.

- [ ] **Step 8: Type-check.**

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; pnpm --filter @scheniders/storefront type-check
```

Expected: exit 0.

- [ ] **Step 9: Commit.**

```bash
cd /Users/ali/scheniders-mono && git rev-parse --abbrev-ref HEAD && git add apps/storefront/lib/order-duplicate-guard.ts apps/storefront/app/actions/checkout-duplicate-guard.test.ts apps/storefront/app/actions/checkout.ts apps/storefront/lib/variant-products.ts apps/storefront/lib/testing/fake-supabase.ts apps/storefront/app/actions/checkout-cod-risk.test.ts apps/storefront/app/actions/checkout-referral.test.ts apps/storefront/app/actions/checkout-loyalty.test.ts apps/storefront/app/actions/cart-checkout-agreement.test.ts apps/storefront/app/actions/checkout-pricing.test.ts apps/storefront/app/actions/checkout-whatsapp-confirmation.test.ts apps/storefront/lib/draft-view-guards.test.tsx && git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(storefront): soft duplicate guard and retryable checkout failures" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git branch --contains HEAD | grep -q 'feat/pdp-entry-atelier' && echo committed-on-branch
```

---

### Task P2.4: Route, 503 for retryable failures, no experiment event on a replay

**Files:**
- Modify: `apps/storefront/app/api/checkout/orders/route.ts`, lines 128–212
- Modify: `apps/storefront/app/api/checkout/orders/route.test.ts` (append after test `(o)`, which ends at line 410)

- [ ] **Step 1: Write the failing tests.** In `route.test.ts`, replace the file's final lines:

```ts
    const res = await POST(makeRequest(bodyWithArms));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });
});
```

with:

```ts
    const res = await POST(makeRequest(bodyWithArms));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("(p) answers a retryable failure with 503 so the client may resend the same key", async () => {
    vi.mocked(submitCheckout).mockResolvedValue({
      success: false,
      error: "فشل إنشاء الطلب. حاول مرة أخرى.",
      retryable: true,
    });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ success: false, retryable: true });
  });

  it("(q) keeps line issues on 422 — the new_price self-heal is unchanged", async () => {
    vi.mocked(submitCheckout).mockResolvedValue({
      success: false,
      error: "تغيّرت أسعار بعض المنتجات — يرجى مراجعة سلتك وتأكيد الطلب.",
      issues: [{ product_id: VALID_PRODUCT_ID, variant_id: null, reason: "price_changed", new_price: 6000 }],
    });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(422);
    const json = (await res.json()) as { issues: Array<{ new_price: number }> };
    expect(json.issues[0]?.new_price).toBe(6000);
  });

  it("(r) writes no experiment event for a replayed submit", async () => {
    // The default store config carries one running experiment, so the
    // pre-fix route inserts its attribution row even on a replay.
    vi.mocked(submitCheckout).mockResolvedValue({
      success: true,
      orderId: "order-123",
      orderNumber: "ORD-001",
      total: 5000,
      replayed: true,
    });
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "visitor-abc" }),
    } as never);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    expect(mockFrom).not.toHaveBeenCalledWith("store_config_experiment_events");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("(s) passes the duplicate-guard answer through as a 200 replay with no events", async () => {
    vi.mocked(submitCheckout).mockResolvedValue({ success: true, replayed: true, duplicate: true });
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "visitor-abc" }),
    } as never);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, replayed: true, duplicate: true });
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them.**

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run apps/storefront/app/api/checkout/orders/route.test.ts
```

Expected failures:
- `(p)`: expected 503, received 422.
- `(r)`: `mockFrom` was called with `"store_config_experiment_events"`.
- `(s)`: `mockInsert` was called.

`(q)` passes; it guards the self-heal.

- [ ] **Step 3: Implement.** In `route.ts`, replace everything from `    const result = await submitCheckout(payload);` through `    return NextResponse.json(result, { status: 422 });` (lines 128–212) with:

```ts
    const result = await submitCheckout(payload);

    // A replayed submit — the same idempotency key (EC17) or the soft
    // duplicate guard — answers an order whose purchase and experiment rows
    // were written when it was placed; writing them again would count one
    // order twice.
    if (result.success && !result.replayed) {
      try {
        const visitorKey = (await cookies()).get("sb_vid")?.value;
        // A test order placed from draft view is the merchant, not a
        // converted shopper — keep it out of the experiment's revenue.
        if (visitorKey && !(await isDraftViewRequest(data.tenant_id))) {
          const svc = createSupabaseServiceClient();
          // First-party funnel: one purchase row per line product so the
          // merchant's "viewed → bought" per product is exact; the value is
          // the server-computed total on the first row only (revenue sums).
          const { error: funnelErr } = await svc.from("storefront_events").insert(
            payload.items.map((i, idx) => ({
              tenant_id: parsed.data.tenant_id,
              visitor_key: visitorKey,
              event_type: "purchase" as const,
              page_id: "checkout",
              product_id: i.product_id,
              order_id: result.orderId ?? null,
              value_iqd: idx === 0 ? Math.round(result.total ?? 0) : null,
            })),
          );
          if (funnelErr) console.error("[checkout/orders] funnel purchase write failed:", funnelErr);
          // EC19: re-derive the visitor's arm per running experiment from the
          // store config — never trust the client's `ab_test_arms` (which could
          // forge revenue attribution to a chosen arm). Revenue is the
          // server-computed total, not a client value.
          const { data: tenantRow } = await svc
            .from("tenants")
            .select("store_config_v2")
            .eq("id", parsed.data.tenant_id)
            .single();
          const experiments =
            ((tenantRow?.store_config_v2 as { experiments?: Experiment[] } | null)
              ?.experiments) ?? [];
          const rows = experiments
            .map((exp) => ({ exp, arm: assignAbArm(exp, visitorKey) }))
            .filter((x): x is { exp: Experiment; arm: string } => x.arm !== null)
            .map(({ exp, arm }) => ({
              tenant_id: parsed.data.tenant_id,
              experiment_id: exp.id,
              arm_id: arm,
              visitor_key: visitorKey,
              event_type: "order" as const,
              revenue_iqd: result.total ?? null,
            }));
          if (rows.length > 0) {
            const { error: evErr } = await svc
              .from("store_config_experiment_events")
              .insert(rows);
            if (evErr)
              console.error(
                "[checkout/orders] experiment event write failed:",
                evErr,
              );
          }
        }
      } catch (e) {
        console.error("[checkout/orders] funnel/experiment event write threw:", e);
      }
    }

    if (result.success) {
      // Mark this browser as having placed an order — used by audience-segment
      // evaluation (has_ordered_before rule) on subsequent storefront renders.
      const res = NextResponse.json(result, { status: 200 });
      res.cookies.set("sb_ordered", "1", {
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
        sameSite: "lax",
        httpOnly: true,
      });
      res.cookies.set("sb_gov", parsed.data.governorate_code, {
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
        sameSite: "lax",
        httpOnly: true,
      });
      return res;
    }
    // A platform failure (the database did not answer) is not the order's
    // fault: 503 tells the client the same request — same idempotency key —
    // may be sent again. Everything else, including line `issues` and the
    // `new_price` self-heal, is the 422 the shopper acts on.
    return NextResponse.json(result, { status: result.retryable ? 503 : 422 });
```

- [ ] **Step 4: Run them again.** Same command as Step 2. Expected: all route tests pass, including `(l3)`, `(p)`, `(q)`, `(r)` and `(s)`.

- [ ] **Step 5: Type-check.** Run `pnpm --filter @scheniders/storefront type-check`. Expected: exit 0.

- [ ] **Step 6: Commit.**

```bash
cd /Users/ali/scheniders-mono && git rev-parse --abbrev-ref HEAD && git add apps/storefront/app/api/checkout/orders/route.ts apps/storefront/app/api/checkout/orders/route.test.ts && git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "fix(storefront): 503 for retryable checkout failures, no experiment event on replay" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git branch --contains HEAD | grep -q 'feat/pdp-entry-atelier' && echo committed-on-branch
```

---

### Task P2.5: Sections, deadline-plus-single-resend submit helper

**Files:**
- Create: `packages/sections/src/helpers/submit-order.ts`
- Create: `packages/sections/src/helpers/submit-order.test.ts`

- [ ] **Step 1: Write the failing test** `packages/sections/src/helpers/submit-order.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ORDER_SUBMIT_TIMEOUT_MS, postOrderWithResubmit } from "./submit-order";

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

const ENDPOINT = "/api/checkout/orders";
const BODY = JSON.stringify({ idempotency_key: "key-0001-abcdef" });

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A request that never answers — until its signal aborts it. */
function hanging(_url: string, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () =>
      reject(new DOMException("The operation was aborted.", "AbortError")),
    );
  });
}

function stubFetch(...impls: FetchFn[]) {
  const fn = vi.fn<FetchFn>();
  for (const impl of impls) fn.mockImplementationOnce(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("postOrderWithResubmit", () => {
  it("returns the first answer and never resends", async () => {
    const fetchFn = stubFetch(async () => json(200, { success: true, orderNumber: "SH-1" }));
    const onResubmit = vi.fn();
    const out = await postOrderWithResubmit(ENDPOINT, BODY, { onResubmit });
    expect(out).toEqual({ kind: "answered", ok: true, status: 200, data: { success: true, orderNumber: "SH-1" } });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(onResubmit).not.toHaveBeenCalled();
  });

  it("passes a 4xx through as the answer — a refused order is not resent", async () => {
    const fetchFn = stubFetch(async () => json(422, { success: false, error: "x" }));
    const onResubmit = vi.fn();
    const out = await postOrderWithResubmit(ENDPOINT, BODY, { onResubmit });
    expect(out).toMatchObject({ kind: "answered", ok: false, status: 422 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(onResubmit).not.toHaveBeenCalled();
  });

  it("does not give up on an attempt before the deadline", async () => {
    vi.useFakeTimers();
    const fetchFn = stubFetch(hanging);
    const onResubmit = vi.fn();
    void postOrderWithResubmit(ENDPOINT, BODY, { onResubmit });
    await vi.advanceTimersByTimeAsync(ORDER_SUBMIT_TIMEOUT_MS - 1);
    expect(onResubmit).not.toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("after a timeout, resends the identical body once and returns that answer", async () => {
    vi.useFakeTimers();
    const fetchFn = stubFetch(hanging, async () => json(200, { success: true, replayed: true }));
    const onResubmit = vi.fn();
    const pending = postOrderWithResubmit(ENDPOINT, BODY, { onResubmit });
    await vi.advanceTimersByTimeAsync(ORDER_SUBMIT_TIMEOUT_MS);
    const out = await pending;
    expect(out).toMatchObject({ kind: "answered", ok: true, data: { replayed: true } });
    expect(onResubmit).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[0]?.[1]?.body).toBe(BODY);
    expect(fetchFn.mock.calls[1]?.[1]?.body).toBe(BODY);
    expect(fetchFn.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("treats a 5xx as no answer and resends once", async () => {
    const fetchFn = stubFetch(
      async () => json(503, { success: false, retryable: true }),
      async () => json(200, { success: true }),
    );
    const onResubmit = vi.fn();
    const out = await postOrderWithResubmit(ENDPOINT, BODY, { onResubmit });
    expect(out).toMatchObject({ kind: "answered", ok: true, status: 200 });
    expect(onResubmit).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("is unconfirmed when the resend gets no answer either", async () => {
    const fetchFn = stubFetch(
      async () => {
        throw new TypeError("Failed to fetch");
      },
      async () => {
        throw new TypeError("Failed to fetch");
      },
    );
    const out = await postOrderWithResubmit(ENDPOINT, BODY, { onResubmit: vi.fn() });
    expect(out).toEqual({ kind: "unconfirmed" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run it.**

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src/helpers/submit-order.test.ts
```

Expected failure: `Failed to resolve import "./submit-order"`.

- [ ] **Step 3: Implement** `packages/sections/src/helpers/submit-order.ts`:

```ts
// =====================================================================
// submit-order — post a COD order without ever losing the buyer
// =====================================================================
// A bare fetch has no deadline: on a stalled mobile connection the spinner
// ran forever. Here each attempt has one (ORDER_SUBMIT_TIMEOUT_MS). When an
// attempt gets no answer — a timeout, a network failure, or a 5xx (the
// server saying the failure was its own) — the SAME body, so the same
// idempotency key, is sent exactly once more. The server answers a key it
// has already seen with that order (the EC17 replay lookup runs before any
// validation), so the resend is a status check, never a second order. If
// the resend is not answered either the outcome is "unconfirmed": the order
// may or may not exist, and the caller must say so and offer a way out.
// =====================================================================

/** Per-attempt deadline: room for a slow 3G round trip through the
 *  checkout's database reads, short enough not to strand the buyer. */
export const ORDER_SUBMIT_TIMEOUT_MS = 20_000;

export type OrderPostOutcome =
  | { kind: "answered"; ok: boolean; status: number; data: unknown }
  | { kind: "unconfirmed" };

export interface PostOrderOptions {
  /** Called once, right before the resend — the "checking your order" state. */
  onResubmit: () => void;
  /** Per-attempt deadline; defaults to ORDER_SUBMIT_TIMEOUT_MS. */
  timeoutMs?: number;
}

type Answer = { ok: boolean; status: number; data: unknown };

async function attempt(url: string, body: string, timeoutMs: number): Promise<Answer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: controller.signal,
    });
    if (res.status >= 500) {
      console.warn(`[submit-order] attempt answered ${res.status}; resending with the same key`);
      return null;
    }
    let data: unknown = null;
    try {
      data = await res.json();
    } catch (error: unknown) {
      // The status IS the answer (2xx: the order was placed; 4xx: it was
      // refused); an unreadable body only means no order number / message,
      // which every caller already handles.
      console.warn("[submit-order] response body was unreadable", error);
    }
    return { ok: res.ok, status: res.status, data };
  } catch (error: unknown) {
    // Timed out or the network dropped. The request may still have reached
    // the server and placed the order before the answer was lost, so this is
    // "unknown" — not "nothing was submitted".
    console.warn("[submit-order] attempt got no answer", error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** POST `body` to `url`: one attempt, and one same-body resend if the first
 *  is not answered. Never throws. */
export async function postOrderWithResubmit(
  url: string,
  body: string,
  opts: PostOrderOptions,
): Promise<OrderPostOutcome> {
  const timeoutMs = opts.timeoutMs ?? ORDER_SUBMIT_TIMEOUT_MS;
  const first = await attempt(url, body, timeoutMs);
  if (first) return { kind: "answered", ...first };
  opts.onResubmit();
  const second = await attempt(url, body, timeoutMs);
  if (second) return { kind: "answered", ...second };
  return { kind: "unconfirmed" };
}
```

- [ ] **Step 4: Run it again.** Same command as Step 2. Expected: 6 tests pass.

- [ ] **Step 5: Commit.**

```bash
cd /Users/ali/scheniders-mono && git rev-parse --abbrev-ref HEAD && git add packages/sections/src/helpers/submit-order.ts packages/sections/src/helpers/submit-order.test.ts && git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): order submit with a deadline and one same-key resend" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git branch --contains HEAD | grep -q 'feat/pdp-entry-atelier' && echo committed-on-branch
```

---

### Task P2.6: Sections, per-product order draft in sessionStorage, plus per-test storage isolation

**Files:**
- Create: `packages/sections/src/helpers/order-draft.ts`
- Create: `packages/sections/src/helpers/order-draft.test.ts`
- Create: `packages/sections/src/_test-setup.ts`
- Modify: `packages/sections/vitest.config.ts`, lines 13–16 (`test` block)

- [ ] **Step 1: Write the failing test** `packages/sections/src/helpers/order-draft.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearOrderDraft,
  mergeDraftForm,
  orderDraftKey,
  readOrderDraft,
  writeOrderDraft,
} from "./order-draft";
import type { FormState } from "../pdp_direct_order.client";

const TENANT = "77777777-7777-4777-8777-777777777777";
const PRODUCT = "22222222-2222-4222-8222-222222222222";
const OTHER_PRODUCT = "33333333-3333-4333-8333-333333333333";

const EMPTY: FormState = {
  customer_name: "",
  phone: "",
  alt_phone: "",
  governorate_code: "",
  address_details: "",
};
const FILLED: FormState = {
  customer_name: "زبون تجريبي",
  phone: "07802301677",
  alt_phone: "",
  governorate_code: "BG",
  address_details: "الكرادة",
};

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe("order draft", () => {
  it("round-trips the form and the in-flight keys", () => {
    writeOrderDraft(TENANT, PRODUCT, { form: FILLED, idempotencyKey: "key-0001", purchaseEventId: "evt-0001" });
    expect(readOrderDraft(TENANT, PRODUCT)).toEqual({
      form: FILLED,
      idempotencyKey: "key-0001",
      purchaseEventId: "evt-0001",
    });
  });

  it("keeps one draft per product", () => {
    writeOrderDraft(TENANT, PRODUCT, { form: FILLED, idempotencyKey: null, purchaseEventId: null });
    expect(readOrderDraft(TENANT, OTHER_PRODUCT)).toBeNull();
  });

  it("lives in this tab's sessionStorage, never localStorage", () => {
    writeOrderDraft(TENANT, PRODUCT, { form: FILLED, idempotencyKey: null, purchaseEventId: null });
    expect(window.sessionStorage.getItem(orderDraftKey(TENANT, PRODUCT))).not.toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it("is gone once cleared", () => {
    writeOrderDraft(TENANT, PRODUCT, { form: FILLED, idempotencyKey: "key-0001", purchaseEventId: null });
    clearOrderDraft(TENANT, PRODUCT);
    expect(readOrderDraft(TENANT, PRODUCT)).toBeNull();
  });

  it("drops an unknown governorate and anything that is not a string", () => {
    window.sessionStorage.setItem(
      orderDraftKey(TENANT, PRODUCT),
      JSON.stringify({
        form: { customer_name: 5, phone: "0780", governorate_code: "XX" },
        idempotencyKey: 7,
        purchaseEventId: "",
      }),
    );
    expect(readOrderDraft(TENANT, PRODUCT)).toEqual({
      form: { ...EMPTY, phone: "0780" },
      idempotencyKey: null,
      purchaseEventId: null,
    });
  });

  it("reads corrupt JSON as no draft", () => {
    window.sessionStorage.setItem(orderDraftKey(TENANT, PRODUCT), "{not json");
    expect(readOrderDraft(TENANT, PRODUCT)).toBeNull();
  });

  it("survives storage that throws (privacy modes)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() =>
      writeOrderDraft(TENANT, PRODUCT, { form: FILLED, idempotencyKey: null, purchaseEventId: null }),
    ).not.toThrow();
    expect(readOrderDraft(TENANT, PRODUCT)).toBeNull();
    expect(() => clearOrderDraft(TENANT, PRODUCT)).not.toThrow();
  });

  it("mergeDraftForm: a non-empty draft field wins, an empty one keeps the current value", () => {
    expect(
      mergeDraftForm({ ...EMPTY, governorate_code: "BA" }, { ...EMPTY, phone: "07802301677" }),
    ).toEqual({ ...EMPTY, phone: "07802301677", governorate_code: "BA" });
  });
});
```

- [ ] **Step 2: Run it.**

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src/helpers/order-draft.test.ts
```

Expected failure: `Failed to resolve import "./order-draft"`.

- [ ] **Step 3: Implement** `packages/sections/src/helpers/order-draft.ts`:

```ts
// =====================================================================
// order-draft — the direct-order form survives a reload of this tab
// =====================================================================
// A buyer who reloads mid-order (a stalled spinner, an accidental pull to
// refresh) came back to an empty form and a NEW idempotency key — so the
// next tap could place a second order for one already placed. The typed
// fields and the in-flight keys are kept per tenant + product in
// sessionStorage (this tab only; gone when it closes), restored on load and
// cleared once the order is placed. Every storage access is guarded:
// privacy modes and full quotas throw, and the form must still work.
// =====================================================================

import { IRAQ_GOVERNORATES } from "@scheniders/shared";
import type { FormState } from "../pdp_direct_order.client";

export interface OrderDraft {
  form: FormState;
  /** The submission's idempotency key once one was minted — reusing it makes
   *  the next submit a replay of an order that may already exist. */
  idempotencyKey: string | null;
  /** The Purchase event_id paired with that key (pixel/CAPI dedup). */
  purchaseEventId: string | null;
}

const KEY_PREFIX = "schn:order-draft:";

export function orderDraftKey(tenantId: string, productId: string): string {
  return `${KEY_PREFIX}${tenantId}:${productId}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

/** A saved code the store no longer recognises is dropped, not restored. */
function governorate(v: unknown): string {
  const code = str(v);
  return IRAQ_GOVERNORATES.some((g) => g.code === code) ? code : "";
}

export function readOrderDraft(tenantId: string, productId: string): OrderDraft | null {
  try {
    const raw = window.sessionStorage.getItem(orderDraftKey(tenantId, productId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !isRecord(parsed.form)) return null;
    const f = parsed.form;
    return {
      form: {
        customer_name: str(f.customer_name),
        phone: str(f.phone),
        alt_phone: str(f.alt_phone),
        governorate_code: governorate(f.governorate_code),
        address_details: str(f.address_details),
      },
      idempotencyKey: strOrNull(parsed.idempotencyKey),
      purchaseEventId: strOrNull(parsed.purchaseEventId),
    };
  } catch {
    // Storage blocked or the value corrupt: there is no draft to restore,
    // and the form starts as it would on a first visit.
    return null;
  }
}

export function writeOrderDraft(tenantId: string, productId: string, draft: OrderDraft): void {
  try {
    window.sessionStorage.setItem(orderDraftKey(tenantId, productId), JSON.stringify(draft));
  } catch {
    // Storage blocked or full: the order still submits; only a reload of
    // this tab would start over.
  }
}

export function clearOrderDraft(tenantId: string, productId: string): void {
  try {
    window.sessionStorage.removeItem(orderDraftKey(tenantId, productId));
  } catch {
    // Storage blocked: nothing was ever saved to clear.
  }
}

/** The restored form: every non-empty draft field wins over what the first
 *  render had (at mount that is only the sb_gov governorate prefill). */
export function mergeDraftForm(current: FormState, draft: FormState): FormState {
  return {
    customer_name: draft.customer_name || current.customer_name,
    phone: draft.phone || current.phone,
    alt_phone: draft.alt_phone || current.alt_phone,
    governorate_code: draft.governorate_code || current.governorate_code,
    address_details: draft.address_details || current.address_details,
  };
}
```

- [ ] **Step 4: Add the per-test storage isolation.** Once Task P2.7 lands, the PDP form writes drafts. jsdom keeps one window per test FILE, so a draft typed in one test would otherwise be restored into the next. This affects `_pdp-express-form`, `_pdp-loyalty`, `_pdp-variants` and others. Create `packages/sections/src/_test-setup.ts`:

```ts
// Per-test isolation shared by every section suite. The direct-order form
// keeps a per-tab draft in sessionStorage (helpers/order-draft), and jsdom
// keeps one window per test FILE — without this, a draft typed in one test
// would be restored into the next test's form. Node-environment suites have
// no window and are untouched.
import { afterEach } from "vitest";

afterEach(() => {
  if (typeof window !== "undefined") window.sessionStorage.clear();
});
```

In `packages/sections/vitest.config.ts`, replace:

```ts
  test: {
    environment: "node",
    globals: false,
  },
```

with:

```ts
  test: {
    environment: "node",
    globals: false,
    setupFiles: [path.resolve(__dirname, "src/_test-setup.ts")],
  },
```

- [ ] **Step 5: Run it again, and run the whole sections suite** so the setup file is known to break nothing.

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src
```

Expected: everything passes, including 8 tests in `order-draft.test.ts`, with 0 failed snapshots.

- [ ] **Step 6: Commit.**

```bash
cd /Users/ali/scheniders-mono && git rev-parse --abbrev-ref HEAD && git add packages/sections/src/helpers/order-draft.ts packages/sections/src/helpers/order-draft.test.ts packages/sections/src/_test-setup.ts packages/sections/vitest.config.ts && git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): per-product order draft kept for the tab" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git branch --contains HEAD | grep -q 'feat/pdp-entry-atelier' && echo committed-on-branch
```

---

### Task P2.7: PDP (classic), wire the resend, the draft, the disabled button, the WhatsApp fallback and the duplicate message

**Files:**
- Create: `packages/sections/src/_pdp-order-safety.test.tsx`
- Modify: `packages/sections/src/pdp_direct_order.client.tsx`. Imports at lines 62–67. STRINGS at 172–183. The type after 308. Status at 357–359. A restore effect before 471. A persist effect after 498. The WhatsApp block at 775–795. The submit tail at 893–1064. `submitting` at 1119. The express model at 1212. The classic button at 2058–2083. The status messages at 2142–2149.
- Modify: `packages/sections/src/pdp_express/model.ts`: the type import at lines 15–22, `status` at 81, `waHref` at 91 (step (n); keeps the shared model's type in step)

- [ ] **Step 1: Write the failing test** `packages/sections/src/_pdp-order-safety.test.tsx`:

```tsx
// @vitest-environment jsdom
// =====================================================================
// pdp_direct_order — never lose the buyer (spec 2026-10-21 §2)
// =====================================================================
// Both layouts share one submit path, so every case runs on each: a reload
// restores what this tab typed (and the in-flight key); a stalled submit is
// resent once with the SAME key while the button reads «نتأكد من طلبك…» and
// cannot be tapped; when neither attempt is answered the same order is
// offered on WhatsApp and the key is kept; a placed order clears the draft;
// and the server's duplicate answer says «طلبك واصلنا، لا تطلبه مرة ثانية»
// with no second Purchase and no thank-you page.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { StoreBaseProvider } from "./helpers/store-context";
import { orderDraftKey, readOrderDraft, writeOrderDraft } from "./helpers/order-draft";
import { ORDER_SUBMIT_TIMEOUT_MS } from "./helpers/submit-order";
import pdp_direct_order from "./pdp_direct_order";
import type { Props } from "./pdp_direct_order";
import type { FormState } from "./pdp_direct_order.client";
import { fixtureTenant, plainProduct, productCtx } from "./_pdp-fixtures";

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

const TENANT = fixtureTenant.id;
const PRODUCT = plainProduct.id;
const FILLED: FormState = {
  customer_name: "زبون تجريبي",
  phone: "07802301677",
  alt_phone: "",
  governorate_code: "BG",
  address_details: "الكرادة قرب الجسر",
};

const LAYOUTS: Array<[string, Props]> = [["classic", pdp_direct_order.defaultProps]];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A request that never answers — until its signal aborts it. */
function hanging(_url: string, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () =>
      reject(new DOMException("The operation was aborted.", "AbortError")),
    );
  });
}

function stubFetch(impl: FetchFn) {
  const fn = vi.fn<FetchFn>(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** The idempotency key of every order POST, in order. */
function orderKeys(fn: ReturnType<typeof stubFetch>): string[] {
  return fn.mock.calls
    .filter(([url]) => url === "/api/checkout/orders")
    .map(([, init]) => (JSON.parse(String(init?.body)) as { idempotency_key: string }).idempotency_key);
}

/** Lets a rejected/resolved fetch chain run to its state update. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

function fbqMock(): ReturnType<typeof vi.fn> {
  return (globalThis as unknown as { fbq: ReturnType<typeof vi.fn> }).fbq;
}

function mount(props: Props) {
  const Section = pdp_direct_order.render;
  const view = render(
    <StoreBaseProvider base="/s/fixture-store">
      <Section props={props} ctx={productCtx(plainProduct)} />
    </StoreBaseProvider>,
  );
  const q = <T extends Element>(sel: string): T => {
    const el = view.container.querySelector<T>(sel);
    if (!el) throw new Error(`missing ${sel}`);
    return el;
  };
  return {
    view,
    form: () => q<HTMLFormElement>("form#direct-order"),
    submit: () => q<HTMLButtonElement>('button[type="submit"]'),
    phone: () => q<HTMLInputElement>('input[name="phone"]'),
    name: () => q<HTMLInputElement>('input[name="name"]'),
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fbq", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each(LAYOUTS)("pdp_direct_order %s — never lose the buyer", (_layout, props) => {
  it("restores what this tab typed after a reload", () => {
    writeOrderDraft(TENANT, PRODUCT, { form: FILLED, idempotencyKey: null, purchaseEventId: null });
    const v = mount(props);
    expect(v.name().value).toBe(FILLED.customer_name);
    expect(v.phone().value.replace(/\D/g, "")).toBe(FILLED.phone);
  });

  it("resubmits a restored in-flight order with ITS key — a replay, not a second order", async () => {
    writeOrderDraft(TENANT, PRODUCT, {
      form: FILLED,
      idempotencyKey: "restored-key-0001",
      purchaseEventId: "restored-evt-0001",
    });
    const fetchFn = stubFetch(async () => json(200, { success: true, replayed: true, orderNumber: "SH-0001" }));
    const v = mount(props);
    await act(async () => {
      fireEvent.submit(v.form());
    });
    await waitFor(() => expect(orderKeys(fetchFn)).toEqual(["restored-key-0001"]));
  });

  it("resends once with the same key after a timeout, then offers the order on WhatsApp", async () => {
    vi.useFakeTimers();
    writeOrderDraft(TENANT, PRODUCT, { form: FILLED, idempotencyKey: null, purchaseEventId: null });
    const fetchFn = stubFetch(hanging);
    const v = mount(props);
    await act(async () => {
      fireEvent.submit(v.form());
      await settle();
    });
    expect(v.submit().disabled).toBe(true);
    expect(v.submit().getAttribute("aria-busy")).toBe("true");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ORDER_SUBMIT_TIMEOUT_MS);
      await settle();
    });
    expect(v.submit().textContent).toContain("نتأكد من طلبك…");
    expect(v.submit().disabled).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ORDER_SUBMIT_TIMEOUT_MS);
      await settle();
    });
    const keys = orderKeys(fetchFn);
    expect(keys).toHaveLength(2);
    expect(keys[0]?.length).toBeGreaterThanOrEqual(8);
    expect(keys[1]).toBe(keys[0]);
    const fallback = v.view.container.querySelector<HTMLAnchorElement>("[data-wa-fallback]");
    expect(fallback?.getAttribute("href")).toMatch(/^https:\/\/wa\.me\//);
    expect(fallback?.textContent).toContain("ابعث نفس الطلب بالواتساب");
    expect(v.submit().disabled).toBe(false);
    // The key survives in the draft: a reload and a tap replays this order.
    expect(readOrderDraft(TENANT, PRODUCT)?.idempotencyKey).toBe(keys[0]);
  });

  it("clears the draft once the order is placed", async () => {
    writeOrderDraft(TENANT, PRODUCT, { form: FILLED, idempotencyKey: null, purchaseEventId: null });
    stubFetch(async () => json(200, { success: true, orderNumber: "SH-0001", orderId: "order-1", total: 23000 }));
    const v = mount(props);
    await act(async () => {
      fireEvent.submit(v.form());
    });
    await waitFor(() =>
      expect(window.sessionStorage.getItem(orderDraftKey(TENANT, PRODUCT))).toBeNull(),
    );
    const stash = JSON.parse(window.sessionStorage.getItem("schn:last-order") ?? "{}") as { number?: string };
    expect(stash.number).toBe("SH-0001");
  });

  it("says the order is already in on a duplicate — no Purchase, no thank-you page", async () => {
    writeOrderDraft(TENANT, PRODUCT, { form: FILLED, idempotencyKey: null, purchaseEventId: null });
    stubFetch(async () => json(200, { success: true, replayed: true, duplicate: true }));
    const v = mount(props);
    await act(async () => {
      fireEvent.submit(v.form());
    });
    await waitFor(() =>
      expect(v.view.container.textContent).toContain("طلبك واصلنا، لا تطلبه مرة ثانية"),
    );
    expect(fbqMock().mock.calls.some((c) => c[1] === "Purchase")).toBe(false);
    expect(window.sessionStorage.getItem("schn:last-order")).toBeNull();
    expect(window.sessionStorage.getItem(orderDraftKey(TENANT, PRODUCT))).toBeNull();
  });
});
```

- [ ] **Step 2: Run it.**

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src/_pdp-order-safety.test.tsx
```

Expected failures:
- "restores…": the name value is `""`.
- "resubmits…": the key is a fresh UUID, not `restored-key-0001`.
- "resends…": `submit.disabled` is false; there is no resend.
- "clears…": the draft is still present.
- "duplicate…": the message is missing and the Purchase fired.

- [ ] **Step 3: Edit `packages/sections/src/pdp_direct_order.client.tsx`.**

(a) Imports. Replace:

```ts
} from "./helpers/customer-memory";
```

with:

```ts
} from "./helpers/customer-memory";
import {
  clearOrderDraft,
  mergeDraftForm,
  readOrderDraft,
  writeOrderDraft,
} from "./helpers/order-draft";
import { postOrderWithResubmit } from "./helpers/submit-order";
```

(b) STRINGS. Replace:

```ts
  orderReceived: { en: "Order received!", ar: "تم استلام طلبك!", ku: "داواکارییەکەت گەیشت!" },
```

with:

```ts
  orderReceived: { en: "Order received!", ar: "تم استلام طلبك!", ku: "داواکارییەکەت گەیشت!" },
  /** The single same-key resend after an unanswered attempt. */
  checkingOrder: { en: "Checking your order…", ar: "نتأكد من طلبك…", ku: "داواکارییەکەت دەپشکنین…" },
  /** Neither attempt was answered — the order may or may not exist. */
  orderUnconfirmed: {
    en: "We couldn't confirm your order went through. Send the same order on WhatsApp and we'll place it for you.",
    ar: "ما قدرنا نتأكد إذا طلبك وصل. ابعث نفس الطلب بالواتساب ونثبّته إلك.",
    ku: "نەمانتوانی دڵنیا بین داواکارییەکەت گەیشتووە. هەمان داواکاری بە واتسئاپ بنێرە و بۆت تۆماری دەکەین.",
  },
  sendOnWhatsapp: {
    en: "Send the same order on WhatsApp",
    ar: "ابعث نفس الطلب بالواتساب",
    ku: "هەمان داواکاری بە واتسئاپ بنێرە",
  },
  /** The server's soft duplicate guard answered with an existing order. */
  alreadyOrdered: {
    en: "We already have your order — no need to order it again.",
    ar: "طلبك واصلنا، لا تطلبه مرة ثانية",
    ku: "داواکارییەکەت گەیشتووە، دووبارە داوای مەکەرەوە.",
  },
```

(c) Delete the now-dead `errNetwork` entry. Its only reader, the old catch, is removed in (h). Delete these exact lines:

```ts
  errNetwork: {
    en: "We couldn't reach the server — check your connection and try again.",
    ar: "تعذّر الاتصال بالخادم — تحقّق من الإنترنت وحاول مرة أخرى.",
    ku: "نەتوانرا پەیوەندی بە ڕاژەکار بکرێت — ئینتەرنێتەکەت بپشکنە و دووبارە هەوڵ بدەرەوە.",
  },
```

(d) Status type. Replace:

```ts
export type FieldElement = HTMLInputElement | HTMLSelectElement;
```

with:

```ts
export type FieldElement = HTMLInputElement | HTMLSelectElement;

/** Where one submission stands. `checking` is the single same-key resend
 *  after an unanswered attempt; `unconfirmed` means neither attempt was
 *  answered (the order may exist — offer WhatsApp, keep the key);
 *  `duplicate` is the server's soft duplicate guard ("we already have it"). */
export type SubmitStatus =
  | "idle"
  | "submitting"
  | "checking"
  | "ok"
  | "duplicate"
  | "unconfirmed"
  | "error";
```

(e) Replace:

```ts
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">(
    "idle",
  );
```

with:

```ts
  const [status, setStatus] = useState<SubmitStatus>("idle");
```

(f) The restore effect. Insert immediately **before** `  // A returning shopper's details, from THIS browser only — see`:

```ts
  // A reload mid-order brings back what this tab typed and — when a submit
  // had started — its idempotency key, so tapping again replays that order
  // instead of placing a second one (helpers/order-draft). Declared BEFORE
  // the customer-memory prefill below: effects run in order, so the draft
  // wins and memory only fills what the draft left blank.
  const productId = product?.id ?? null;
  const [draftRestored, setDraftRestored] = useState(false);
  useEffect(() => {
    if (!productId) return;
    const draft = readOrderDraft(ctx.tenant.id, productId);
    if (!draft) return;
    idempotencyKeyRef.current = draft.idempotencyKey;
    purchaseEventIdRef.current = draft.purchaseEventId;
    setForm((prev) => mergeDraftForm(prev, draft.form));
    setDraftRestored(true);
  }, [ctx.tenant.id, productId]);

```

(g) The persist effect. Replace:

```ts
  const [interacted, setInteracted] = useState(false);
```

with:

```ts
  const [interacted, setInteracted] = useState(false);

  // Never lose the buyer: once they have touched the form (or it came back
  // from a draft) the typed fields and any in-flight keys are kept for this
  // tab, so a reload restores them. Placing the order clears them.
  useEffect(() => {
    if (!productId || (!interacted && !draftRestored)) return;
    writeOrderDraft(ctx.tenant.id, productId, {
      form,
      idempotencyKey: idempotencyKeyRef.current,
      purchaseEventId: purchaseEventIdRef.current,
    });
  }, [form, interacted, draftRestored, ctx.tenant.id, productId]);
```

(h) The WhatsApp links. Replace the block that starts with `  // WhatsApp order alternative — same canonical tenant number + full-order` and ends with `      : null;` (currently 775–795):

```ts
  // WhatsApp order alternative — same canonical tenant number + full-order
  // message builder the checkout_form WhatsApp CTA uses (product + qty +
  // whatever delivery details the shopper has typed + the total).
  const waNumber = resolveTenantWhatsapp(ctx.tenant);
  const waHref =
    props.show_whatsapp && waNumber
      ? whatsappCartLink(
          waNumber,
          {
            items: [{ name: product.name, quantity: qty }],
            customer: {
              name: form.customer_name || undefined,
              phone: form.phone || undefined,
              governorate: governorateName,
              address: form.address_details || undefined,
            },
            total: formatPrice(total, locale),
          },
          locale,
        )
      : null;
```

with:

```ts
  // WhatsApp order alternative — same canonical tenant number + full-order
  // message builder the checkout_form WhatsApp CTA uses (product + qty +
  // whatever delivery details the shopper has typed + the total).
  const waNumber = resolveTenantWhatsapp(ctx.tenant);
  const waOrder = {
    items: [{ name: product.name, quantity: qty }],
    customer: {
      name: form.customer_name || undefined,
      phone: form.phone || undefined,
      governorate: governorateName,
      address: form.address_details || undefined,
    },
    total: formatPrice(total, locale),
  };
  const waHref =
    props.show_whatsapp && waNumber ? whatsappCartLink(waNumber, waOrder, locale) : null;
  // The way out when a submit ends unconfirmed: the same order, prefilled,
  // to the store's WhatsApp — offered even where the tile is switched off,
  // because the buyer has no other way to finish. Null without a number.
  const waFallbackHref = whatsappCartLink(waNumber, waOrder, locale);
```

(i) The submit tail. Replace everything from `    setStatus("submitting");` (currently line 893) through the end of `onSubmit`, which is the `  }` just before the blank line and `  const inputCls =` (currently line 1064, after the `} catch { // fetch() only throws on network failure — nothing was submitted. … }` block), with:

```ts
    setStatus("submitting");
    setErrorMsg(null);
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = newIdempotencyKey();
    }
    if (!purchaseEventIdRef.current) {
      purchaseEventIdRef.current = newPixelEventId();
    }
    // Saved BEFORE the request leaves: a reload while it is in flight comes
    // back with this key, so the next tap replays this order instead of
    // placing a second one (helpers/order-draft).
    writeOrderDraft(ctx.tenant.id, product.id, {
      form,
      idempotencyKey: idempotencyKeyRef.current,
      purchaseEventId: purchaseEventIdRef.current,
    });
    const suffix = opts?.addressSuffix?.trim();
    const addressDetails = suffix
      ? `${form.address_details.trim()} - ${suffix}`
      : form.address_details.trim();
    const items = [
      {
        product_id: product.id,
        variant_id: chosen.variant?.id ?? null,
        name: product.name,
        variant_name: chosen.variant?.name ?? null,
        // `unitPrice`, not `price`: with a quantity break selected the two
        // differ, and the server re-derives the break and rejects the base.
        price: unitPrice,
        quantity: qty,
      },
    ];
    // An accepted bump is a second line at its discounted price. The server
    // re-derives that discount too, and only honours it because this order
    // also contains the parent product above.
    if (acceptedBump) {
      items.push({
        product_id: acceptedBump.product.id,
        variant_id: null,
        name: acceptedBump.product.name,
        variant_name: null,
        price: acceptedBump.price,
        quantity: 1,
      });
    }
    // Same endpoint + payload contract as the checkout_form section —
    // only `items` differs (a single line from ctx.product) plus the
    // optional structured `alt_phone`. The funnel form has no separate
    // area field, so the governorate label fills the required `city`.
    const body = JSON.stringify({
      tenant_id: ctx.tenant.id,
      customer_name: form.customer_name.trim(),
      phone,
      governorate_code: form.governorate_code,
      city: governorateName ?? form.governorate_code,
      address_details: addressDetails,
      ...(altPhone ? { alt_phone: altPhone } : {}),
      payment_method: "cod",
      items,
      subtotal,
      locale,
      idempotency_key: idempotencyKeyRef.current,
      ...(redeemPoints > 0 ? { redeem_points: redeemPoints } : {}),
      ...(referralState.kind === "valid" && normalizeReferralCode(referralCode)
        ? { referral_code: normalizeReferralCode(referralCode) }
        : {}),
      ...(purchaseEventIdRef.current
        ? { event_id: purchaseEventIdRef.current }
        : {}),
      ab_test_arms: ctx.runtime.ab_test_arms,
    });
    // A deadline per attempt and one resend of this same body — so the same
    // key — when an attempt is not answered (helpers/submit-order). The
    // server answers a key it has seen with that order, so the resend is a
    // status check, never a second order.
    const outcome = await postOrderWithResubmit("/api/checkout/orders", body, {
      onResubmit: () => setStatus("checking"),
    });
    if (outcome.kind === "unconfirmed") {
      // Neither attempt was answered: the order may or may not exist. The key
      // stays (here and in the draft), so another tap — or a reload and a
      // tap — replays it rather than ordering twice; WhatsApp is the way to
      // finish now.
      setErrorMsg(s("orderUnconfirmed"));
      setStatus("unconfirmed");
      return;
    }
    if (outcome.ok) {
      const data = outcome.data as {
        orderNumber?: string;
        /** The order's id — which order the post-purchase offer grows. */
        orderId?: string;
        /** Proof this browser placed it (server-minted, short-lived). */
        upsellToken?: string;
        total?: number;
        /** The soft duplicate guard answered: this phone ordered these
         *  products minutes ago, and no new order was created. */
        duplicate?: boolean;
      } | null;
      if (data?.duplicate === true) {
        // That order was counted (pixel, CAPI, funnel) when it was placed, so
        // nothing fires again, and there is no new order to thank them for —
        // the form says so instead.
        clearOrderDraft(ctx.tenant.id, product.id);
        idempotencyKeyRef.current = null;
        purchaseEventIdRef.current = null;
        setStatus("duplicate");
        return;
      }
      const orderNumber = data?.orderNumber ?? "";
      if (referralState.kind === "valid") clearCapturedReferral(ctx.tenant.id);
      // Remember the shopper for next time — in their browser only.
      writeCustomerMemory(ctx.tenant.id, {
        customer_name: form.customer_name.trim(),
        phone: form.phone.trim(),
        alt_phone: form.alt_phone.trim() || undefined,
        governorate_code: form.governorate_code,
        address_details: form.address_details.trim(),
      });
      // Stash the just-placed order for the thank-you recap — identical
      // privacy-safe path to checkout_form (only the buyer's browser
      // holds it; the success page never fetches by order number).
      try {
        sessionStorage.setItem(
          "schn:last-order",
          JSON.stringify({
            number: orderNumber,
            // The order id and the server's proof let the thank-you page's
            // post-purchase offer act on THIS order and no other. Session
            // storage only, like the rest of the stash; additive, so older
            // readers ignore them.
            order_id: data?.orderId ?? null,
            upsell_token: data?.upsellToken ?? null,
            // Lets the thank-you page greet the buyer by name; optional so
            // older readers of the stash keep working unchanged.
            customer_name: form.customer_name.trim(),
            items: items.map((i) => ({
              name: i.name,
              variant: i.variant_name,
              qty: i.quantity,
              price: i.price,
            })),
            subtotal,
            total: data?.total ?? subtotal,
            ts: Date.now(),
          }),
        );
      } catch {
        /* sessionStorage unavailable — the recap just won't render */
      }
      // Pixel Purchase — same event_id the server sent to CAPI (dedup).
      trackPixel(
        "Purchase",
        pixelContentsFromItems(
          items.map((i) => ({
            product_id: i.product_id,
            price: i.price,
            quantity: i.quantity,
          })),
        ),
        purchaseEventIdRef.current ?? undefined,
      );
      clearOrderDraft(ctx.tenant.id, product.id);
      idempotencyKeyRef.current = null;
      purchaseEventIdRef.current = null;
      setStatus("ok");
      // Navigate to the celebratory thank-you page (full nav keeps the stash).
      window.location.href = `${base}/checkout/success${
        orderNumber ? `?order=${encodeURIComponent(orderNumber)}` : ""
      }`;
      return;
    }
    // EC24: surface the server's actionable message; when it reported line
    // issues the corrected re-submit is a fresh order, so retire the
    // idempotency key — in the draft too (mirrors checkout_form).
    const failure = outcome.data as {
      error?: string;
      issues?: CheckoutIssue[];
    } | null;
    const issues = failure && Array.isArray(failure.issues) ? failure.issues : [];
    if (issues.length > 0) {
      idempotencyKeyRef.current = null;
      writeOrderDraft(ctx.tenant.id, product.id, {
        form,
        idempotencyKey: null,
        purchaseEventId: purchaseEventIdRef.current,
      });
    }
    // Self-heal a price drift: adopt the server's verified price so the
    // shopper's retry submits (and displays) the correct number — and
    // SAY so, with the new price, instead of a generic error.
    const newPrice = issues.find(
      (i) => i.reason === "price_changed" && i.product_id === product.id,
    )?.new_price;
    if (typeof newPrice === "number") {
      setLivePrice({ variantId: chosenVariantId, price: newPrice });
      setPriceFlashAt(Date.now());
      setErrorMsg(
        s("priceChanged").replace("{price}", formatPrice(newPrice, locale)),
      );
    } else {
      // The server's own messages are Arabic; show them to Arabic-script
      // locales and the localised generic line to English readers.
      setErrorMsg((t && failure?.error) || s("errGeneric"));
    }
    setStatus("error");
  }
```

(j) Replace:

```ts
  const submitting = status === "submitting";
```

with:

```ts
  // In flight: the first attempt or the single same-key resend.
  const submitting = status === "submitting" || status === "checking";
```

(k) The express model gets the fallback link; express uses it in Task P2.8. Replace:

```ts
          waHref,
          galleryImages,
```

with:

```ts
          waHref,
          waFallbackHref,
          galleryImages,
```

(l) The classic submit button. Replace:

```tsx
              {/* Stays focusable while pending (aria-busy/aria-disabled) so
                  focus isn't dropped mid-submit; only sold-out disables. */}
              <ChunkyButton
                type="submit"
                bg="pink"
                size="lg"
                fullWidth
                disabled={oos}
                aria-busy={submitting || undefined}
                aria-disabled={submitting || undefined}
                aria-describedby={
                  [
                    showVariantError ? variantErrorId : null,
                    status === "error" ? submitErrorId : null,
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
              >
                {submitting ? (
                  <>
                    <MaterialIcon
                      name="progress_activity"
                      className="animate-spin motion-reduce:animate-none"
                    />
                    {s("placingOrder")}
                  </>
```

with:

```tsx
              {/* Disabled while a submission is in flight (aria-busy says
                  why): a tap during the same-key resend must start nothing
                  new. Sold-out disables it too. */}
              <ChunkyButton
                type="submit"
                bg="pink"
                size="lg"
                fullWidth
                disabled={oos || submitting}
                aria-busy={submitting || undefined}
                aria-describedby={
                  [
                    showVariantError ? variantErrorId : null,
                    status === "error" || status === "unconfirmed" ? submitErrorId : null,
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
              >
                {submitting ? (
                  <>
                    <MaterialIcon
                      name="progress_activity"
                      className="animate-spin motion-reduce:animate-none"
                    />
                    {status === "checking" ? s("checkingOrder") : s("placingOrder")}
                  </>
```

(m) The classic status messages. Replace:

```tsx
              {status === "ok" && (
                <p
                  role="status"
                  className="text-center font-label font-bold text-sm text-bk-success"
                >
                  {s("orderReceived")}
                </p>
              )}
```

with:

```tsx
              {status === "ok" && (
                <p
                  role="status"
                  className="text-center font-label font-bold text-sm text-bk-success"
                >
                  {s("orderReceived")}
                </p>
              )}
              {status === "unconfirmed" && (
                <div id={submitErrorId} role="alert" className="space-y-bk-xs">
                  <p className="text-center font-label font-bold text-sm text-bk-danger">
                    {errorMsg ?? s("orderUnconfirmed")}
                  </p>
                  {waFallbackHref && (
                    <ChunkyLink
                      href={waFallbackHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      bg="success"
                      size="lg"
                      fullWidth
                      data-wa-fallback="true"
                    >
                      <WhatsAppIcon className="h-5 w-5" />
                      {s("sendOnWhatsapp")}
                    </ChunkyLink>
                  )}
                </div>
              )}
              {status === "duplicate" && (
                <p
                  role="status"
                  className="text-center font-label font-bold text-sm text-bk-success"
                >
                  {s("alreadyOrdered")}
                </p>
              )}
```

(n) In `packages/sections/src/pdp_express/model.ts`, keep the type in step with the shared model so the classic file compiles.

Replace:

```ts
import type {
  FieldElement,
  FieldErrors,
  FieldKey,
  FormState,
  STRINGS,
  SubmitOptions,
} from "../pdp_direct_order.client";
```

with:

```ts
import type {
  FieldElement,
  FieldErrors,
  FieldKey,
  FormState,
  STRINGS,
  SubmitOptions,
  SubmitStatus,
} from "../pdp_direct_order.client";
```

Replace:

```ts
  status: "idle" | "submitting" | "ok" | "error";
```

with:

```ts
  status: SubmitStatus;
```

Replace:

```ts
  waHref: string | null;
```

with:

```ts
  waHref: string | null;
  /** The same order, prefilled, to the store's WhatsApp — offered when a
   *  submit ends `unconfirmed`, even where the WhatsApp tile is off. */
  waFallbackHref: string | null;
```

- [ ] **Step 4: Run the new test, the snapshots and the Kurdish guard.**

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src/_pdp-order-safety.test.tsx packages/sections/src/_pdp-classic-snapshot.test.tsx packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_chrome-baseline-snapshot.test.tsx packages/sections/src/_kurdish-coverage.test.ts
```

Expected:
- The 5 classic tests pass.
- Every snapshot passes, with no `-u` and no "obsolete" or "written" lines. The idle markup is byte-identical because `disabled={false}` and the removed `aria-disabled` were both absent when idle.
- The Kurdish test passes.

- [ ] **Step 5: Run the whole sections suite.** This covers the customer-memory, loyalty, variants and express-form flows.

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src
```

Expected: all pass. A jsdom `Not implemented: navigation` console line from the "clears the draft" case is expected noise, not a failure.

- [ ] **Step 6: Type-check both consumers of the sections package.**

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; pnpm --filter @scheniders/storefront type-check && pnpm --filter @scheniders/platform type-check
```

Expected: both exit 0.

- [ ] **Step 7: Commit.**

```bash
cd /Users/ali/scheniders-mono && git rev-parse --abbrev-ref HEAD && git add packages/sections/src/_pdp-order-safety.test.tsx packages/sections/src/pdp_direct_order.client.tsx packages/sections/src/pdp_express/model.ts && git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): PDP submit keeps the buyer — resend, draft, WhatsApp fallback" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git branch --contains HEAD | grep -q 'feat/pdp-entry-atelier' && echo committed-on-branch
```

---

### Task P2.8: PDP (express), the checking label, disabled while in flight, the WhatsApp fallback (with landmark) and the duplicate message

**Files:**
- Modify: `packages/sections/src/_pdp-order-safety.test.tsx` (the `LAYOUTS` line and the fixtures import)
- Modify: `packages/sections/src/pdp_express/checkout-row.tsx`: props at 78–88, label at 96–100, button at 174–179, messages at 243–247
- Modify: `packages/sections/src/pdp_express/express-view.tsx`: lines 42 and 172

- [ ] **Step 1: Extend the failing test to express.** In `_pdp-order-safety.test.tsx`, replace:

```ts
import { fixtureTenant, plainProduct, productCtx } from "./_pdp-fixtures";
```

with:

```ts
import { EXPRESS_IRAQ_PDP_PROPS, fixtureTenant, plainProduct, productCtx } from "./_pdp-fixtures";
```

and replace:

```ts
const LAYOUTS: Array<[string, Props]> = [["classic", pdp_direct_order.defaultProps]];
```

with:

```ts
const LAYOUTS: Array<[string, Props]> = [
  ["classic", pdp_direct_order.defaultProps],
  ["express", EXPRESS_IRAQ_PDP_PROPS],
];
```

- [ ] **Step 2: Run it.**

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src/_pdp-order-safety.test.tsx
```

Expected:
- Classic: 5 pass.
- Express "resends…" fails on `submit.disabled` (false), the missing «نتأكد من طلبك…» and the missing `[data-wa-fallback]`.
- Express "duplicate…" fails on the missing «طلبك واصلنا، لا تطلبه مرة ثانية».
- Express "restores", "resubmits" and "clears" already pass, because the path is shared.

- [ ] **Step 3: Edit `packages/sections/src/pdp_express/checkout-row.tsx`.**

Replace:

```tsx
export function CheckoutRow({
  m,
  locale,
  waHref,
}: {
  m: ExpressModel;
  locale: LocaleCode;
  /** The WhatsApp order link — built by the express view, which owns the
   *  landmark the message must carry. Null = no WhatsApp tile. */
  waHref: string | null;
}) {
```

with:

```tsx
export function CheckoutRow({
  m,
  locale,
  waHref,
  waFallbackHref,
}: {
  m: ExpressModel;
  locale: LocaleCode;
  /** The WhatsApp order link — built by the express view, which owns the
   *  landmark the message must carry. Null = no WhatsApp tile. */
  waHref: string | null;
  /** The same order on WhatsApp, offered when a submit ends `unconfirmed`
   *  (landmark included). Null = the store has no WhatsApp number. */
  waFallbackHref: string | null;
}) {
```

Replace:

```ts
  const submitLabel = m.oos
    ? m.s("outOfStock")
    : m.submitting
      ? m.s("placingOrder")
      : resolveI18n(m.props.submit_label_i18n, locale);
```

with:

```ts
  const submitLabel = m.oos
    ? m.s("outOfStock")
    : m.status === "checking"
      ? m.s("checkingOrder")
      : m.submitting
        ? m.s("placingOrder")
        : resolveI18n(m.props.submit_label_i18n, locale);
```

Replace:

```tsx
          disabled={m.oos}
          aria-busy={m.submitting || undefined}
          aria-disabled={m.submitting || undefined}
          aria-describedby={m.status === "error" ? m.submitErrorId : undefined}
```

with:

```tsx
          disabled={m.oos || m.submitting}
          aria-busy={m.submitting || undefined}
          aria-describedby={
            m.status === "error" || m.status === "unconfirmed" ? m.submitErrorId : undefined
          }
```

Replace:

```tsx
      {m.status === "ok" && (
        <p role="status" className="text-center font-bk-body text-sm font-bold text-bk-success">
          {m.s("orderReceived")}
        </p>
      )}
```

with:

```tsx
      {m.status === "ok" && (
        <p role="status" className="text-center font-bk-body text-sm font-bold text-bk-success">
          {m.s("orderReceived")}
        </p>
      )}
      {m.status === "unconfirmed" && (
        <div id={m.submitErrorId} role="alert" className="space-y-bk-xs">
          <p className="text-center font-bk-body text-sm font-bold text-bk-danger">
            {m.errorMsg ?? m.s("orderUnconfirmed")}
          </p>
          {waFallbackHref && (
            <a
              href={waFallbackHref}
              target="_blank"
              rel="noopener noreferrer"
              data-wa-fallback="true"
              className={cn(
                "flex min-h-[52px] items-center justify-center gap-2 rounded-bk-input border-bk border-bk-success/25 bg-bk-success/10 px-4 font-bk-body text-[15px] font-bold text-bk-success transition-colors duration-bk-fast hover:bg-bk-success/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus motion-reduce:transition-none",
                rtl && "flex-row-reverse",
              )}
            >
              <WhatsAppIcon shadow={false} className="h-6 w-6" />
              {m.s("sendOnWhatsapp")}
            </a>
          )}
        </div>
      )}
      {m.status === "duplicate" && (
        <p role="status" className="text-center font-bk-body text-sm font-bold text-bk-success">
          {m.s("alreadyOrdered")}
        </p>
      )}
```

- [ ] **Step 4: Edit `packages/sections/src/pdp_express/express-view.tsx`.**

Replace:

```ts
  const waHref = expressWhatsappHref(m, landmark);
```

with:

```ts
  const waHref = expressWhatsappHref(m, landmark);
  // The unconfirmed-submit fallback carries the landmark too, so WhatsApp
  // gets the same address the order would have posted.
  const waFallbackHref = expressWhatsappHref({ ...m, waHref: m.waFallbackHref }, landmark);
```

Replace:

```tsx
          <CheckoutRow m={m} locale={locale} waHref={waHref} />
```

with:

```tsx
          <CheckoutRow m={m} locale={locale} waHref={waHref} waFallbackHref={waFallbackHref} />
```

- [ ] **Step 5: Run the express-touching suites.**

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src/_pdp-order-safety.test.tsx packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_pdp-express-cta.test.tsx packages/sections/src/_pdp-express-form.test.tsx packages/sections/src/_pdp-express-trust.test.tsx packages/sections/src/pdp_express
```

Expected: all pass, including 10 in `_pdp-order-safety.test.tsx` (5 per layout) and the express snapshots unchanged.

- [ ] **Step 6: Type-check.** Run `pnpm --filter @scheniders/storefront type-check && pnpm --filter @scheniders/platform type-check`. Expected: both exit 0.

- [ ] **Step 7: Commit.**

```bash
cd /Users/ali/scheniders-mono && git rev-parse --abbrev-ref HEAD && git add packages/sections/src/_pdp-order-safety.test.tsx packages/sections/src/pdp_express/checkout-row.tsx packages/sections/src/pdp_express/express-view.tsx && git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): express submit — checking state, WhatsApp fallback, duplicate notice" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git branch --contains HEAD | grep -q 'feat/pdp-entry-atelier' && echo committed-on-branch
```

---

### Task P2.9: `checkout_form` (cart checkout) honours the duplicate answer

The server guard also answers the cart checkout, because the body contract has no way to tell the two forms apart. Without this task, the cart form would fire a second Purchase and show a thank-you page with no order number.

**Files:**
- Create: `packages/sections/src/_checkout-form-duplicate.test.tsx`
- Modify: `packages/sections/src/checkout_form.client.tsx`: STRINGS at 110, status at 219–221, success parse at 551–560, the network catch at 659–663, render at 1194–1198

- [ ] **Step 1: Write the failing test** `packages/sections/src/_checkout-form-duplicate.test.tsx`:

```tsx
// @vitest-environment jsdom
// =====================================================================
// checkout_form — the soft duplicate guard's answer (spec 2026-10-21 §2)
// =====================================================================
// The server returns an existing order instead of a new one when this phone
// ordered these products minutes ago. The cart form must say so: no second
// Purchase, no thank-you page, and the cart is kept (nothing new was placed).
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { CartItem } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import { useCart } from "./helpers/cart-store";
import checkout_form from "./checkout_form";
import { fixtureTenant, productRuntime } from "./_pdp-fixtures";

const LINE: CartItem = {
  product_id: "22222222-2222-4222-8222-222222222222",
  variant_id: null,
  name: "عطر تجريبي",
  variant_name: null,
  price: 18000,
  quantity: 1,
  image_url: null,
};

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  useCart.setState({ items: [LINE] });
  vi.stubGlobal("fbq", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useCart.setState({ items: [] });
});

describe("checkout_form duplicate answer", () => {
  it("says the order is already in, fires no Purchase, keeps the cart and stays on the page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === "/api/checkout/orders"
          ? new Response(JSON.stringify({ success: true, replayed: true, duplicate: true }), {
              status: 200,
              headers: { "content-type": "application/json" },
            })
          : new Response("{}", { headers: { "content-type": "application/json" } }),
      ),
    );
    const Section = checkout_form.render;
    const view = render(
      <StoreBaseProvider base="/s/fixture-store">
        <Section
          props={checkout_form.defaultProps}
          ctx={{
            tenant: fixtureTenant,
            runtime: { ...productRuntime, page_id: "checkout" },
            products: [],
            categories: [],
          }}
        />
      </StoreBaseProvider>,
    );
    const q = <T extends Element>(sel: string): T => {
      const el = view.container.querySelector<T>(sel);
      if (!el) throw new Error(`missing ${sel}`);
      return el;
    };
    fireEvent.change(q<HTMLInputElement>('input[name="name"]'), { target: { value: "زبون تجريبي" } });
    fireEvent.change(q<HTMLInputElement>('input[name="phone"]'), { target: { value: "07802301677" } });
    fireEvent.change(q<HTMLSelectElement>('select[name="governorate"]'), { target: { value: "BG" } });
    fireEvent.change(q<HTMLInputElement>('input[name="city"]'), { target: { value: "الكرادة" } });
    fireEvent.change(q<HTMLTextAreaElement>('textarea[name="address"]'), { target: { value: "قرب الجسر" } });
    await act(async () => {
      fireEvent.submit(q<HTMLFormElement>("form"));
    });
    await waitFor(() =>
      expect(view.container.textContent).toContain("طلبك واصلنا، لا تطلبه مرة ثانية"),
    );
    const fbq = (globalThis as unknown as { fbq: ReturnType<typeof vi.fn> }).fbq;
    expect(fbq.mock.calls.some((c) => c[1] === "Purchase")).toBe(false);
    expect(useCart.getState().items).toHaveLength(1);
    expect(window.sessionStorage.getItem("schn:last-order")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it.**

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src/_checkout-form-duplicate.test.tsx
```

Expected failure: the text «طلبك واصلنا، لا تطلبه مرة ثانية» is not found. The form took the success path, stashed `schn:last-order` and fired Purchase.

- [ ] **Step 3: Edit `packages/sections/src/checkout_form.client.tsx`.**

Replace:

```ts
  orderReceived: { en: "Order received!", ar: "تم استلام طلبك!", ku: "داواکارییەکەت گەیشت!" },
```

with:

```ts
  orderReceived: { en: "Order received!", ar: "تم استلام طلبك!", ku: "داواکارییەکەت گەیشت!" },
  /** The server's soft duplicate guard answered with an existing order. */
  alreadyOrdered: {
    en: "We already have your order — no need to order it again.",
    ar: "طلبك واصلنا، لا تطلبه مرة ثانية",
    ku: "داواکارییەکەت گەیشتووە، دووبارە داوای مەکەرەوە.",
  },
```

Replace:

```ts
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">(
    "idle",
  );
```

with:

```ts
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "duplicate" | "error">(
    "idle",
  );
```

Replace:

```ts
        const data = (await res.json().catch(() => null)) as {
          orderNumber?: string;
          /** The order's id — which order the post-purchase offer grows. */
          orderId?: string;
          /** Proof this browser placed it (server-minted, short-lived). */
          upsellToken?: string;
          total?: number;
        } | null;
        const orderNumber = data?.orderNumber ?? "";
```

with:

```ts
        const data = (await res.json().catch(() => null)) as {
          orderNumber?: string;
          /** The order's id — which order the post-purchase offer grows. */
          orderId?: string;
          /** Proof this browser placed it (server-minted, short-lived). */
          upsellToken?: string;
          total?: number;
          /** The soft duplicate guard answered: this phone ordered these
           *  products minutes ago, and no new order was created. */
          duplicate?: boolean;
        } | null;
        if (data?.duplicate === true) {
          // That order was counted when it was placed, so no Purchase fires
          // and there is no new order for the thank-you page; the cart stays
          // as it is because nothing new was placed.
          idempotencyKeyRef.current = null;
          purchaseEventIdRef.current = null;
          setStatus("duplicate");
          return;
        }
        const orderNumber = data?.orderNumber ?? "";
```

Replace:

```tsx
            {status === "ok" && (
              <p className="font-label font-bold text-sm text-bk-success">
                {s("orderReceived")}
              </p>
            )}
```

with:

```tsx
            {status === "ok" && (
              <p className="font-label font-bold text-sm text-bk-success">
                {s("orderReceived")}
              </p>
            )}
            {status === "duplicate" && (
              <p role="status" className="font-label font-bold text-sm text-bk-success">
                {s("alreadyOrdered")}
              </p>
            )}
```

Correct the same misleading catch comment the PDP had (spec §2). This changes the comment only, not behaviour. The key is already kept on this path. Replace:

```ts
    } catch {
      // fetch() only throws on network failure — nothing was submitted.
      setErrorLines([s("errNetwork")]);
```

with:

```ts
    } catch {
      // fetch() throws when no answer arrived (the network dropped). The
      // request may still have reached the server and placed the order, so
      // the idempotency key is kept: the shopper's next tap replays that
      // order instead of placing a second one.
      setErrorLines([s("errNetwork")]);
```

- [ ] **Step 4: Run it, plus the Kurdish guard and the render smoke test.**

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src/_checkout-form-duplicate.test.tsx packages/sections/src/_kurdish-coverage.test.ts packages/sections/src/_render-smoke.test.tsx
```

Expected: all pass.

- [ ] **Step 5: Commit.**

```bash
cd /Users/ali/scheniders-mono && git rev-parse --abbrev-ref HEAD && git add packages/sections/src/_checkout-form-duplicate.test.tsx packages/sections/src/checkout_form.client.tsx && git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): cart checkout says a duplicate order is already in" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git branch --contains HEAD | grep -q 'feat/pdp-entry-atelier' && echo committed-on-branch
```

---

### Task P2.10: Piece verification (the CI gate plus the tests CI does not run)

**Files:** none. If something fails, the fix goes back into the task that owns the file.

- [ ] **Step 1: All the suites this piece touched.**

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run apps/storefront/app/actions apps/storefront/app/api/checkout apps/storefront/lib packages/sections/src
```

Expected: 0 failed tests and 0 failed or written snapshots.

- [ ] **Step 2: Type-check and lint (the CI gate).**

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; pnpm --filter @scheniders/storefront type-check && pnpm --filter @scheniders/platform type-check && pnpm lint
```

Expected: exit 0. Lint may show warnings but no new errors. The platform's ~1380 warnings are an accepted baseline.

- [ ] **Step 3: Confirm the DB function is still the version this piece applied, and that `create_order_atomic` is untouched.**

```sql
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       position('duplicate_guard' in pg_get_functiondef(p.oid)) > 0 AS has_guard,
       position('create_order_lock' in pg_get_functiondef(p.oid)) > 0 AS takes_order_lock
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname IN ('create_storefront_order', 'create_order_atomic')
 ORDER BY 1, 2;
```

Expected:

| row | `has_guard` | `takes_order_lock` |
|---|---|---|
| `create_order_atomic(_order_data jsonb)` | false | false (unchanged legacy overload) |
| `create_order_atomic(_order_data jsonb, _tenant_id uuid)` | false | true |
| `create_storefront_order(... 4 args)` | true | true |

- [ ] **Step 4: Confirm a clean tree for this piece and that every commit is on the branch.**

```bash
cd /Users/ali/scheniders-mono && git status --porcelain -- apps/storefront packages/sections packages/supabase && git log --oneline -9 && git rev-parse --abbrev-ref HEAD
```

Expected:
- There are no modified tracked files under those paths. The untracked `apps/storefront/AGENTS.md` and `apps/storefront/CLAUDE.md` were already there and are not part of this piece.
- The 9 P2 commits (one each for Tasks P2.1 to P2.9) are on top.
- The branch is `feat/pdp-entry-atelier`.

Nothing is pushed: the branch stays local until the merchant says to push.