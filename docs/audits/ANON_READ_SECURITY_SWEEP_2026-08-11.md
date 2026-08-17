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

**✅ APPLIED 2026-08-17** to the NEW project (`sduvpgqwhxragxtxztur`). Verified as the `anon` role: `SELECT cost FROM products` → `42501 permission denied`; `has_column_privilege('anon',…,'cost')` = false (also cost_breakdown_json, low_stock_threshold, license_key_pattern); safe columns intact (17 products still readable, `price` = true). DB types regenerated.

---

## P2 · `tenants` — internal/CRM columns leaked to anon ✅ RESOLVED 2026-08-17

Re-examined column-by-column against actual storefront usage. Findings:

- **`contact_email` is public by design** — rendered on the storefront contact page (`contact/page.tsx:97`) and footer (`StoreFooter.tsx:38`). Kept anon-readable. (Not a leak; the merchant chose a public store.)
- **Genuine leaks** (anon table-wide SELECT, columns the app never selects): `prospect_lead_id` (CRM link into `leads`), `restrictions`, `metadata`, `trial_ends_at`, `store_config_draft` (V1), `config_version`, `store_config_rev`, `display_id`, timestamps. **`store_config_v2_draft` (unpublished store) also readable** — the worst of them.

**Fix (migration `20260817090000`, applied + verified):** grant anon exactly the columns the storefront + token-gated preview select; revoke the rest. Verified as the anon role: `SELECT prospect_lead_id FROM tenants` → `42501 denied`; storefront's full public select still returns; storefront home/contact/products all 200; contact_email still renders.

**⚠️ Known remaining exposure (P1, tracked separately — NOT closed):** `store_config_v2_draft` stays anon-readable because the **cross-origin editor preview** (`_preview/[tenant]/[page_id]`) reads it as the anon role — the preview is gated by a signed token at the *route*, which PostgREST column grants can't enforce. So any anonymous client can currently fetch every merchant's *unpublished* store config. Closing it needs a **token-gated `SECURITY DEFINER` RPC** that returns the draft only for a valid preview token, after which the anon grant drops `store_config_v2_draft`. Filed as the top follow-up.

---

## Follow-ups

1. ~~Apply `20260811100000`~~ ✅ **APPLIED 2026-08-17** (P0 cost leak closed). `20260811090000_tenant_slug_history.sql` also applied.
2. ~~Regenerate DB types~~ ✅ done (`supabase gen types`, checked in).
3. ~~Product decision on `tenants` exposure (P2)~~ ✅ **RESOLVED 2026-08-17** (migration `20260817090000`). `contact_email` = public by design; internal/CRM columns locked down.
4. **🔴 Top follow-up:** token-gated RPC for `store_config_v2_draft` so anon can't scrape unpublished stores (see P2 note). This is the one real exposure still open.
5. Re-run this sweep after any new `public_storefront_read_*` policy ships — each one is a column-exposure surface.
