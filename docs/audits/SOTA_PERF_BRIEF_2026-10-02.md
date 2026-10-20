# Performance & craft audit — what to actually do

**Two-page brief.** The full ledger is `SOTA_PERF_CRAFT_LEDGER_2026-09-17.md` (3,215 lines, 54
findings). Read this instead unless you need a specific finding's evidence.

**Status: the audit failed its own quality gate — 3 out of 8, across three rounds and two independent
critics.** That is not false modesty. Read §"How much to trust this" before you plan anything from it.

---

## 1. Fix this first, independently of everything else

**Customer phone numbers are being sent to Meta.** `P0-SEC-01`.

`packages/sections/src/track_order_lookup.client.tsx:81,88` puts the shopper's phone in the URL
(`/track?phone=07XXXXXXXXX&order=100001`). `apps/storefront/app/s/[tenant]/layout.tsx:232` mounts the
ad pixels on that layout. The Meta pixel reports the full document location in its `dl` parameter,
alongside the `fbp` tracking cookie — confirmed in captured traffic. The same phone also goes out as a
GET to `/api/orders/lookup`, so it lands in edge access logs. There is **no consent gate anywhere**.

**Fix:** make the tracking lookup a POST, or keep the phone in component state so it never enters
`location`. That breaks the chain at source. Tracking links already sent to customers with a phone in
them will stop working — that is the correct outcome.

This needs no plan, no sequencing, and none of the rest of this document.

---

## 2. The one change with a measured payoff

**`packages/shared/src/preview-token.ts:21` imports `node:crypto`.** It is re-exported through the
`@scheniders/shared` `export *` barrel; `apps/platform/lib/utils.ts:5` re-exports `cn` from that
barrel; every component imports `cn`. So a server-only HMAC module is reachable from all client code
and Turbopack polyfills it with `crypto-browserify`.

**Measured on disk, deterministic:**

| | before | after |
|---|---:|---:|
| platform, every route | 782.4 KB gz | **629.5 KB** (−152.9) |
| storefront, every route | 286.8 KB gz | **151.8 KB** (−135.0) |

The storefront floor lands inside the 130–170 KB reference budget. The change is **8 files, +15/−11**,
and a working version is sitting at `tmp/audit/barrel-fix.patch` in the audit worktree. Builds,
type-check, lint and 597 tests all pass against it.

**Claim it as payload, not speed.** On this harness it moved LCP by +0.1 to +0.6 s — i.e. nothing. The
removed code was never on the LCP critical path. It is still 135 KB per route that a shopper on metered
Iraqi mobile data pays for, which localhost cannot represent.

Two traps found the hard way: `"sideEffects": false` on `packages/shared/package.json` breaks both
builds with a `next/font` resolution error, and a symbol grep under-counts barrel consumers — the
compiler is the authority on who imports what.

---

## 3. What the audit is confident about

These reproduced exactly under two independent critics. They are catalog reads and greps, not timings.

| | finding |
|---|---|
| **Database** | `orders` fires **12 triggers** and maintains **21 indexes** on every write (~110 ms/row). 112 unindexed foreign keys. 43 RLS policies re-evaluate `auth.<fn>()` per row. 57 duplicate-permissive-policy combinations. |
| **Consistency** | **10** local redefinitions of `formatIQD` shadowing the shared one, across **3** number locales. **18** files with their own order-status colour map. **903** raw colour literals bypassing the token system. |
| **Resilience** | 5 of 33 platform routes have `loading.tsx`; 6 error boundaries for 33 routes; **0** `not-found.tsx`. Storefront: **0** loading boundaries for 20 routes, no `global-error`, one un-branded Arabic-only error page serving every tenant. |
| **Architecture** | **30 of 33** platform routes are client components. The storefront is **0 of 20**. Two architectures in one repo — and `/store/edit` and `/store/onboarding` already demonstrate the right one. |
| **Mobile** | The mobile dashboard is a separate 1,366-line component tree hardcoded in **English**, in an Arabic product. Pinch-zoom is disabled for every user on every page. |
| **Tooling** | `pnpm analyze` cannot run — it is wired through a `webpack()` hook and Next 16 builds with Turbopack. Nobody on the team has been able to see this bundle. |

---

## 4. What the audit got wrong, and how much to trust it

**Four inferences were overturned by actually building and measuring them. Four out of four.**

| claimed | measured |
|---|---|
| A 167 KB chunk came from ~20 `xlsx`/`jspdf` imports | Stubbing all 19 changed **zero bytes**. It was one `node:crypto` import. |
| The sections barrel was the dominant storefront cost | **44.9 KB — 16%** of it. |
| The barrel fix bought −4.9 to −7.0 s of LCP | **Nothing.** That delta was an artifact of comparing n=1 against n=3. |
| Storefront LCP was 9.6–13.6 s | **4.5–7.6 s** at medians. The originals were cold-start single runs. |

**So:** every route still exceeds the 2.5 s LCP budget — by **1.8×–3.0×**, not the 2.2×–5.4× the
ledger says. The product is roughly twice as fast as this audit claimed for three rounds, and still not
fast enough.

**The measurement harness is not trustworthy.** Identical builds return either ~4.8 s or ~7.3 s LCP,
bimodally, half the runs each. CPU contention, server variance, Lighthouse CPU calibration and payload
differences were each tested and ruled out. The cause is unknown. **Do not quote an LCP number from
this audit.** Re-measure on a quiet machine at `-n 10` and report the distribution.

**Trust the database and consistency findings. Treat every timing as provisional.**

---

## 5. Suggested order

1. **P0-SEC-01** — phone numbers to Meta. Today, independently.
2. **The `preview-token` barrel fix** — patch exists, verified, −135 KB/route.
3. **Fix `pnpm analyze`** so Turbopack bundle output is visible, then add a CI budget. Nothing else in
   D3 is enforceable until the instrument works.
4. **Re-measure D1 properly** on a quiet machine before any work is scheduled against a timing target.
5. **Decide the RSC position** (30/33 client routes). A third of the ledger is downstream of it, and
   "we are a client app, close those findings" is a legitimate answer — but it should be chosen, not
   drifted into.

Items 1–3 are small and independent. Items 4–5 are the ones that need a decision rather than an
engineer.

---

## 6. Known gaps

Never measured: all authenticated platform routes under real data — the audit account has
`user_profiles.is_active = false`, so every gated RPC returns 403 and the dashboard renders empty
(which is itself finding `F-D9-01`). No INP figure exists. D7 on the merchant app is untouched.
`/store/edit` — the heaviest route in the product at ~876 KB gz — was never opened.

All of it needs credentials for `aa988695@gmail.com`.
