# Anonymous-read security sweep — NEW project (`sduvpgqwhxragxtxztur`)

**Date:** 2026-08-11 · **Method:** live probe — for all 125 tables in the generated types, a 1-row `SELECT *` with the **anon** key (no session), against the live NEW project. Read-only. Script: session scratchpad `anon-sweep.mjs`.

## Result

89 tables correctly deny anon (`42501`). ~31 return empty (RLS-filtered or empty). **5 return rows to a logged-out visitor:**

| Table | Rows | Verdict |
|---|---|---|
| `industries` | 13 | ✅ **Intended** — wizard reference data, public. |
| `plan_limits` | 4 | ✅ **Intended** — pricing tiers, public marketing. |
| `categories` | 5 | ✅ **Intended** — storefront nav; `public_storefront_read_categories` RLS scopes to active/trial tenants. |
| `products` | 17 | ⚠️ **LEAK** — see P0 below. Row policy is intended; the *column exposure* is not. |
| `tenants` | 18 | ⚠️ **Observation** — see P2. |

---

## P0 · `products.cost` (and internal fields) readable by any anonymous client

**What:** `public_storefront_read_products` (RLS, from `20260605150444`) exposes visible/non-archived products of active tenants to anon — correct, the storefront needs the catalog. But **Postgres RLS is row-level and column-blind**, and anon holds a table-wide `SELECT` grant, so a raw PostgREST call returns *every* column:

```
GET /rest/v1/products?select=name,price,cost   (anon key)
→ "بستاشيو": price=36750, cost=12070
```

Supplier cost — the merchant's margin — plus `cost_breakdown_json`, `reorder_point`, `low_stock_threshold`, and digital-delivery secrets (`download_url`, `license_key_pattern`) are all readable by anyone on the internet, for every live tenant. The app never selects these (verified: 0 storefront references to any excluded column), so this is purely a raw-API exposure.

**Fix (migration `20260811100000_anon_products_column_lockdown.sql`, drafted):** revoke anon's table-wide `SELECT`, re-grant only the 29 storefront-facing columns via Postgres column privileges (they compose with RLS — a read must pass both). `authenticated` untouched (merchant app needs cost; its tenant-isolation RLS scopes it). New columns default to no anon grant — safe direction.

**⚠️ NOT YET APPLIED** — no DB access this session (Supabase MCP unauthenticated). The leak is live until the migration is applied to the NEW project.

---

## P2 · `tenants` exposes contact/plan fields to anon — app-intended, flagged not fixed

Anon reads `contact_email`, `contact_phone`, `settings`, `plan`, `trial_ends_at` for all tenants. Most of this the **storefront itself reads** under the anon key (`PUBLIC_TENANT_COLS` in `apps/storefront/lib/tenant.ts` — footer contact, WhatsApp CTA phone, branding). So a column lockdown here risks breaking the public store and is **not** applied.

The one genuinely questionable field is `contact_email` (real merchant emails — `fatima.ux.audit@example.com` etc. — a ready-made spam/phish list). If product confirms the storefront doesn't render it, a follow-up column lockdown should drop `contact_email`, `plan`, and `trial_ends_at` from the anon grant. Needs product sign-off first — hence not in this migration.

---

## Follow-ups

1. **Apply `20260811100000` to the NEW project** — closes the P0 cost leak. (Also apply the pending `20260811090000_tenant_slug_history.sql` from the handle-claim work.)
2. Regenerate DB types after applying (`pnpm generate-types`).
3. Product decision on `tenants.contact_email` exposure (P2) → possible second lockdown.
4. Re-run this sweep after any new `public_storefront_read_*` policy ships — each one is a column-exposure surface.
