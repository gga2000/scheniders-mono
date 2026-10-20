# SOTA Performance & Craft Ledger — 2026-09-17

**Audited tree:** `origin/main` @ `3c0f0cb3` (production), in read-only worktree `/Users/ali/scheniders-mono-sotaperf`.
**Environment:** local production builds (`next build` + `next start`) — platform `:3100`, storefront `:3101`.
**Database:** NEW Supabase `sduvpgqwhxragxtxztur`, read-only (advisors, `EXPLAIN`, catalog).
**Profiling tenant:** `scheniders-iraq` = `b5c4f2d4-834f-4af4-822d-9b9826a8f45a` — 4,891 orders, 48 products.
**Raw numbers:** measurement appendix §4, plus `<worktree>/tmp/audit/` (gitignored, durable).

**Round:** 3 of 3 — **FINAL. Phase 1 is terminated below the gate.**

| Round | Ledger | Product | Capping axis |
|---|---:|---:|---|
| 1 (builder self-assessment) | 5 | 3.2 | Completeness |
| 1 (independent critic) | 4 | 2.8 | Completeness |
| 2 (revision) | — | — | — |
| **3 (fresh independent critic)** | **3** | **2.6** | **Completeness** |

Three rounds are spent and the ledger scores **3 against a gate of 8**. Per the engagement's loop
control, **this audit does not proceed to Phase 2.** The stop report — what resisted three rounds and
what would be needed to close it — is §8.

The score went **down** across rounds. That is the correct outcome and not a regression in the work:
each critic found real defects the previous pass had not, including two findings whose evidence was not
read from the audited tree, and one live security defect that two rounds recorded as "None found".
A ledger that scored itself 5 in Round 1 was wrong about itself.

---

> **If you are reading this to decide what to do, read
> [`SOTA_PERF_BRIEF_2026-10-02.md`](SOTA_PERF_BRIEF_2026-10-02.md) instead** — two pages, consolidated,
> with the retractions already applied. This document is the evidence trail: 16 sections, four
> overturned inferences, and every correction left visible rather than edited away. Use it to check a
> specific finding, not to plan from.

## 0. Round 2 revision record

Everything in this section post-dates the Round 1 critic pass. It is separated rather than silently
merged so a reader can see exactly what changed and why.

### 0.1 Artifacts were lost, and are now durable

The session scratchpad holding `MEASUREMENTS.md`, every Lighthouse JSON, every screenshot and the
network capture was **wiped by a session restart**. The critic caught this; I confirmed it. Six
findings (F-D2-01, F-D2-03, F-D2-04, F-D3-03, F-D3-07, F-D10-01) rest on evidence that no longer
exists and are re-marked **UNVERIFIABLE** below. Measurement artifacts now live in
`<worktree>/tmp/audit/` (already gitignored), not in the session scratchpad.

### 0.2 The central finding was correctly measured and wrongly attributed

Round 1 established that the root layout costs **614.9 KB gz across 23 chunks** and asserted that this
is the authenticated app shell. The byte figure re-derives exactly. **The attribution was wrong, and I
never opened a single one of those 23 chunks.** Attributing all 23 (`tmp/audit/chunk-attribution.txt`):

| gzip KB | raw KB | chunk | what it is |
|---:|---:|---|---|
| **167.2** | 538.1 | `a0ed248a023e0f59.js` | **`crypto-browserify` polyfill** — `pbkdf2`×15, `ripemd`×9, `secp256k1`×4, `browserify-aes` (`_cipher`×19, `decryptBlock`×3), `Buffer`×288 |
| 114.4 | 467.1 | `0cbee08c6171f4f9.js` | supabase-js + sentry + zod |
| **69.4** | 277.2 | `1199bea09920980e.js` | **i18n dictionary, both locales, every namespace** |
| 50.7 | 189.3 | `efcb62d84f754432.js` | chat |
| 39.4 | 119.8 | `604d45ba771f22f1.js` | framer-motion |
| 29.4 | 104.1 | `50f3d2a99764a2a3.js` | notifications |
| 22.0 | 73.6 | `b5c3d6716c45d3d4.js` | xlsx export **call-sites** (`book_append_sheet`, `exportOrdersToWaseetXLSX`) |
| 17.3 | — | 2 chunks | radix |
| 9.2 | 30.3 | `1f697b5a9e77a8a6.js` | tanstack-query |
| 8.3 | 28.6 | `3650a71f7f07383d.js` | framer-motion |
| 7.1 | 24.2 | `01a7040b4f876271.js` | orders provider |
| 3.6 | 10.8 | `eb6d4ff9c5e70968.js` | sentry |
| 77.0 | — | 11 chunks | unattributed application code |

**Only ~87 KB of the 614.9 (chat + notifications + orders provider) is the authenticated shell that
F-D3-01's prescribed route-group split would actually remove.** The two largest items — 236.6 KB, 38%
of the total — are not reached through the layout at all and would not move by a single byte. The
Round 1 fix direction was substantially wrong; F-D3-01 is corrected below and two new findings,
**F-D3-08** and **F-D3-09**, are added.

### 0.3 ~~LCP is render-delay bound, not payload bound~~ — **RETRACTED IN ROUND 3**

> **This section's conclusion was wrong and is withdrawn.** It is kept in full below because the error
> is instructive and because two findings were built on it.
>
> The claim was that LCP is render-delay bound and that the Google Fonts stylesheet is the culprit on
> all six routes. The "1,480–3,270 ms of savings" quoted below is Lighthouse's **FCP** saving. Reading
> the field that actually matters, `metricSavings.LCP`, from the same artifacts:
>
> | route | render-blocking **LCP** | unused-JS **LCP** | Lighthouse's #1 LCP opportunity |
> |---|---:|---:|---|
> | home | **0 ms** | 2,650 ms | unused-javascript |
> | PDP | **0 ms** | 2,250 ms | unused-javascript |
> | `/products` | **0 ms** | 2,450 ms | unused-javascript |
> | `/cart` | 1,850 ms | 2,550 ms | unused-javascript |
> | `/checkout` | 1,850 ms | 2,650 ms | unused-javascript |
> | `/about` | 3,250 ms | 1,800 ms | render-blocking |
>
> Render-blocking is credited **zero** LCP on the three routes this section leads with.
> **`unused-javascript` — 438–510 KiB — is the top LCP opportunity on 5 of 6 routes.** The story holds
> only for `/about`, and it was generalised from there.
>
> **Consequences, applied:** **F-D3-02's promotion to Severity 25 is retracted** — it returns to 20, on
> its original FCP-and-invisible-icons grounds, which remain valid. **F-D1-03 is withdrawn** as stated.
> The sentence "shared-payload reduction will not move LCP much" is exactly backwards: payload
> reduction is worth 1.8–2.65 s per route and is the correct Wave 1.
>
> Two further errors inside this section: the phase subparts quoted are **observed trace time** while
> the headline LCP is **Lantern-simulated** (`throttlingMethod: "simulate"`), so summing one against
> the other is the same category error this section convicts the Round 1 critic of. And every figure
> here is **n = 1** — a rerun of `/about` gives 10.8 s and 12.1 s against the 9.6 s quoted, a 2.45 s
> spread on one route, wider than the cross-route spread the re-ranking was built on.
>
> Found by the Round 2 critic, verified independently before acceptance.

---

**Original section, retained for the record:**

Round 1 inferred from static pages costing the same as data pages that "the cost is essentially all
shared payload." The critic challenged this by comparing `/cart` (1,743 KiB → 5.5 s) with `/about`
(1,761 KiB → 12.3 s) — a 6.8 s spread at identical weight.

**That specific comparison does not hold: it mixes a warm-cache cart run with a cold-cache about run.**
Re-run all-cold, `/cart` is **11.7 s**, not 5.5 s, and `/about` is **9.6 s** — about is the *faster* of
the two and the spread is 2.1 s, not 6.8 s.

But the critic's underlying instruction was right, and following it produced the answer both of us were
guessing at. `lcp-breakdown-insight` across six cold runs:

| route | LCP | TTFB | resource load delay | **element render delay** |
|---|---:|---:|---:|---:|
| `/products` | 13.1 s | 29 ms | **1,249 ms** | 28 ms |
| PDP | 12.7 s | 28 ms | 5 ms | **1,514 ms** |
| home | 12.6 s | 42 ms | 6 ms | **1,219 ms** |
| `/checkout` | 11.9 s | 26 ms | — | **1,282 ms** |
| `/cart` | 11.7 s | 12 ms | — | **1,278 ms** |
| `/about` | 9.6 s | 15 ms | — | **1,313 ms** |

TTFB is 12–42 ms and resource load is ~10 ms. **The time is in element render delay** — the browser has
the bytes and cannot paint. And `render-blocking-insight` names the same culprit first on all six
routes:

```
https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wgh…   970–996 ms
http://localhost:3101/_next/static/chunks/021e4c2d307aa4de.css            302–608 ms
Est savings: 1,480 ms (PDP) … 3,270 ms (/about)
```

So neither Round 1's framing nor the critic's counter-example was right. **Generic payload reduction
will not move LCP much; removing the render-blocking third-origin stylesheet will.** This re-ranks the
plan and is why F-D3-02 is promoted to Severity 25 below. `/products` is the one route with a different
mechanism — a late-discovered LCP image, flagged by `lcp-discovery-insight` as needing
`fetchpriority=high` — and is filed as **F-D1-04**.

### 0.4 Corrections against Round 1, each verified

| Item | Round 1 said | Correct | How |
|---|---|---|---|
| F-D9-04 catch count | 21 = 14 legit + 7 swallows | **14 = 6 legit + 8 swallows** | The stated repro returns **15 lines**, one a comment. Four `.catch(() => {})` handlers were folded in that the quoted regex cannot match. **The defect count is higher than reported.** |
| F-D4-07 dismissal | safe — no `CREATE` on any schema | reasoning **wrong**, conclusion holds | Postgres searches `pg_temp` first for relations; `TEMP` needs a database privilege, not schema `CREATE`. Both `authenticated` and `anon` hold it. |
| F-D4-03 | 110 unindexed FKs | **112** | advisor re-read |
| F-D4-05 | 82 unused indexes | **85** | advisor re-read |
| F-D6-01 side-claim | 1,826 raw hex overall | **1,459** | re-counted |
| F-D1-01 storefront FCP | 2.0 s (home) | **6.3–7.8 s cold** | Round 1 ran warm-cache |
| F-D3-01 attribution | "the app shell" | 38% is not shell | §0.2 |

Two corrections **to the critic**, both verified: it reported 5 of 7 mutable-path functions carry
unqualified references — it is **3 of 7** (`increment_order_usage` and `qc_log_status_change` are
properly schema-qualified). And it instructed extracting `audits['largest-contentful-paint-element']`,
which **does not exist in Lighthouse 13**; the data lives in `lcp-breakdown-insight` and
`lcp-discovery-insight`.

One point I contest: the critic marked Benchmark parity down for judging CLS against 0.05 when the
published "good" threshold is 0.10. **0.05 is the engagement brief's stated D1 target**, not a house
standard I invented. The criticism is half fair — I should have flagged that it is stricter than the
published bar, and `/cart` at 0.0605 passes the published one. Noted at both thresholds from here.

### 0.5 Query plans — and a caveat that invalidates part of them

The critic marked Depth down for quoting advisor counts "without a single `EXPLAIN`". Round 2 ran them.
**One methodological caveat governs everything below, and it is not small:** `EXPLAIN` through the
Supabase MCP executes as a privileged role, so **RLS predicates are absent from these plans**. A real
authenticated client gets a different plan, because RLS injects a `tenant_id` predicate the planner can
use. Any claim here about *which index the planner chooses* is therefore not transferable to production
and is excluded. Only RLS-independent structural facts are filed as findings.

**A correction against my own earlier framing.** The `product_opts` CTE in `get_orders_aggregates`
plans at cost **72,753** — 31× the 2,339 of the main scan — because the planner expects to sort
**448,272 rows**. That looks like a smoking gun and I nearly filed it as one. It is not:

```
avg_items_per_order          = 1.0
distinct_product_names       = 19
planner estimate per jsonb_array_elements call = 99 rows   (the SRF default, ~100)
```

Actual expansion is ~4,528 rows, not 448,272 — the planner is out by ~99× because it uses the default
set-returning-function estimate. Real sort volume is ~145 KB against `work_mem = 2184kB`, so **it does
not spill to disk and is not slow today**. F-D4-06 stands on its structural defect — three passes, and
`city_opts`/`product_opts` ignoring the date filter entirely — not on this cost number. The critic's
angle (b) called F-D4-06 "arguably the worst thing in the product" at 50k orders; extrapolated
honestly it is 50,000 rows sorted to yield ~19–50 distinct names, which is wasteful but not
catastrophic. **Both the ledger and the critic over-read this one.**

### 0.6 What Round 2 added

- **D7 now has findings** (F-D7-01…03) — it was empty in Round 1 and was the capping gap. Measured on
  the storefront, which needs no credentials. Full detail in `tmp/audit/ROUND1-D7.md`.
- **Storefront coverage went from 5 routes to 12**, cold-cache.
- **F-D3-08, F-D3-09, F-D1-03, F-D1-04** added.
- Still blocked, unchanged: no authenticated session with real data; D7 on the platform, `/orders` at
  4,877 rows, and any INP figure all depend on credentials for `aa988695@gmail.com`.

---

## 0.7 Master index — 54 active findings, ranked by current severity

Generated from the finding bodies after all Round 3 retractions, promotions and demotions, so
this — not the order of §3 — is the authoritative ranking. §3's own "sorted by SEVERITY" claim
no longer holds, because findings were added and re-scored in place.

| Sev | ID | Finding |
|---:|---|---|
| **25** | `F-D3-08` | **One `node:crypto` import puts ~129 KB (platform) / ~125 KB (storefront) on every route — MEASURED, one-line fix** |
| **25** | `F-D3-01` | Every route ships the entire authenticated app shell, including on the logged-out login page |
| **25** | `F-D1-01` | Every storefront route misses the LCP budget by 2.2×–5.4× |
| **25** | `F-D1-02` | Platform dashboard LCP is 8.3 s at P-mobile and 2.5 s at P-desktop |
| **25** | `F-ARCH-01` | The platform abandoned React Server Components; the storefront did not |

| **20** | `P0-SEC-01` | **Customer phone numbers are transmitted to Meta on the order-tracking page** |
| **20** | `F-D2-01` | One dashboard load issues 227 requests, 58 of them RSC prefetches |
| **20** | `F-D2-03` | The same rows are fetched four to six times per page load |
| **20** | `F-D3-02` | 385 KB icon font with `display=block`; the code comment claims the opposite |
| **20** | `F-D3-03` | Half a megabyte of advertising pixels on every storefront page |
| **20** | `F-D5-01` | 28 of 33 routes have no loading boundary |
| **20** | `F-D8-01` | The same money is formatted ten ways in three locales |
| **20** | `F-D10-01` | The mobile dashboard is a separate component tree, hardcoded in English |
| **19** | `F-D2-02` | Middleware makes a network auth round trip on every request, prefetches included |

| **16** | `F-D4-01` | Every write to `orders` fires twelve triggers |
| **16** | `F-SEC-02` | Every storefront write endpoint is anonymous and unthrottled |
| **15** | `F-D3-09` | The complete bilingual translation dictionary ships to logged-out visitors |
| **15** | `F-D4-02` | 43 RLS policies re-evaluate `auth.<function>()` per row |
| **15** | `F-D6-01` | 903 raw colour literals bypass the token system |
| **15** | `F-D2-04` | Dashboard fetches three tables with no row limit |
| **15** | `F-D3-11` | Sections barrel costs every storefront route 44.9 KB — **measured**, magnitude downgraded from 23.8 |
| **15** | `F-D3-12` | **The audit method itself excluded CSS and four routes** |
| **15** | `F-D9-06` | Storefront has no loading boundaries and one un-branded error page for every tenant |
| **12.8** | `F-D3-07` | The storefront loads five font families |
| **12** | `F-D3-13` | `recharts` emitted four times; the bundle analyzer cannot run |
| **12** | `F-D4-10` | 21 indexes maintained per `orders` write, on top of 12 triggers |
| **12** | `F-D7-01` | Cart's primary CTA is disabled but looks enabled |
| **12** | `F-D7-02` | Empty cart says "keep shopping" and offers no way to |
| **12** | `F-D9-03` | 33 routes share 6 error boundaries and no not-found |
| **12** | `F-D4-03` | 112 foreign keys have no covering index |
| **12** | `F-D4-04` | 57 multiple-permissive-policy combinations |
| **12** | `F-D10-02` | Pinch-zoom disabled for every user on every page |
| **12** | `F-D2-05` | The "all orders" view downloads 13 MB |
| **12** | `F-D8-02` | Eighteen files define their own status colour map |
| **12** | `F-D6-02` | Cart promises free delivery against a real 5,000 IQD fee — **known open since 2026-09-11** |
| **11.4** | `F-D4-06` | `get_orders_aggregates` scans the order book three times |
| **10.8** | `F-D1-04` | `/products` LCP is a late-discovered image |
| **10.8** | `F-D4-11` | Order-list join to customer trust is unindexable by construction |
| **10.8** | `F-D2-06` | 130 queries select every column |
| **10** | `F-D7-03` | Four controls below the 44 px touch target, incl. the only mobile nav |
| **10** | `F-D9-01` | A deactivated user gets a confident dashboard of zeros |
| **10** | `F-D9-05` | A legacy tracking page invents a delivery time |
| **9** | `F-D9-04` | Errors swallowed in eight places, which the repo's own rules forbid |
| **9** | `F-D3-04` | The platform build ignores TypeScript errors |
| **9** | `F-D5-02` | Orders empty state shows a spinner and "no orders" together |
| **9** | `F-D4-07` | Seven SECURITY DEFINER functions with mutable `search_path` |
| **9** | `F-D4-09` | Leaked-password protection disabled |
| **8** | `F-D4-05` | 85 indexes have never been used |
| **8** | `F-D10-03` | Mobile orders chip rail clipped with no scroll affordance |
| **8** | `F-D3-14` | An unidentified third party receives a beacon on every page |
| **6** | `F-D8-03` | A typo'd class name worked around instead of fixed |
| **4.2** | `F-D3-05` | Seven TipTap packages absent from `optimizePackageImports` |
| **4** | `F-D8-04` | Root layout sets `<html dir>`, against the project's own standing rule |
| **3.6** | `F-D4-08` | Four tables have RLS enabled and no policies |

**Withdrawn in Round 3 — do not action:**

| ID | Why |
|---|---|
| `F-D1-03` | Claimed LCP is render-delay bound; Lighthouse credits render-blocking **0 ms LCP** on 3 of 6 routes. Replaced by `F-D3-11`. |
| `F-D3-06` | Claimed `turbo.json` omits two env vars; it declares 15 including both. Read from the stale branch before the audit worktree existed. |

**Reliability caveat, carried from §8:** the ranking is sound on D4 (database) and D8
(consistency) — those findings are catalog reads and greps that reproduced exactly under
independent recomputation. It is **less reliable on D1 and D3**, where the central thesis was
wrong until Round 3, the measurement method excluded CSS and four routes, and every timing is a
single simulated Lighthouse run. Treat the top of this table as a candidate ordering, not a
work plan, until the method fixes in §8 are done.

---

## 1. Executive summary

### Product score by dimension

| Dim | Area | Score | One-line basis |
|---|---|---:|---|
Scores below are the **Round 1 critic's**, which supersede the builder's own where they differ. The
builder's Round 1 figure is shown alongside so the correction is visible.

| Dim | Area | R1 self | **Score** | One-line basis |
|---|---|---:|---:|---|
| D1 | Core Web Vitals & runtime | 2 | **2** | Every storefront route fails LCP cold — home 12.6 s, `/products` 13.1 s, best is `/about` at 9.6 s. Dashboard 8.3 s. Budget 2.5 s. |
| D2 | Data & network | 3 | **3** | 227 requests on one dashboard load; 58 RSC prefetches; same table fetched 4–6×. Wire evidence now unverifiable (§0.1). |
| D3 | Bundle & build | 2 | **1** | **Lowered.** 778 KB gz on every route — and ~30% of it is a Node crypto polyfill and a bilingual dictionary nobody meant to ship. `/products/new` is 996 KB. |
| D4 | Database | 4 | **3** | **Lowered.** No correctness failure, but 112 unindexed FKs, 43 per-row RLS re-evaluations, 12 triggers on `orders` — and nothing is scale-tested beyond a 4,891-order tenant. |
| D5 | Perceived performance | 3 | **3** | 5 of 33 routes have `loading.tsx`. Orders empty state shows a spinner and "no orders" at once. |
| D6 | Visual craft | 5 | **4** | **Lowered.** The evidence measures *inconsistency* (903 raw colours, 18 status maps), never craft; the screenshots backing the 5 no longer exist. |
| D7 | Interaction quality | n/a | **partial** | **No longer empty.** Storefront covered — PDP form error handling is genuinely good (14.9 ms, `aria-invalid`, focus moved); 3 findings. **Platform still uncovered.** |
| D8 | Consistency & drift | 3 | **3** | 10 local `formatIQD` redefinitions, 3 number locales, 18 status colour maps. |
| D9 | States & resilience | 3 | **3** | 6 error boundaries for 33 routes, 0 `not-found.tsx`; a denied user sees a confident dashboard of zeros. |
| D10 | Responsive & mobile | 4 | **3** | **Lowered.** Pinch-zoom disabled for every user; a parallel English-only mobile tree; clipped chip rails. |

**Aggregate product score: ≈ 2.8 / 10** (builder self-assessed 3.2 — too generous; corrections
concentrate in D3 and D4, the two dimensions where independent work was done).

### What is most responsible for that

0. **One import is worth more than anything else in this ledger, and it is one line.**
   `packages/shared/src/preview-token.ts:21` imports `createHmac`/`timingSafeEqual` from `node:crypto`.
   It is re-exported through `@scheniders/shared`'s `export *` barrel, which `lib/utils.ts` re-exports
   `cn` from, which every component imports — so a server-only HMAC module is reachable from every
   client component and Turbopack polyfills it with `crypto-browserify`. **Measured by controlled
   rebuild: removing it takes 129.1 KB off every platform route and 124.6 KB off every storefront
   route.** The storefront floor goes 286.8 → 162.2 KB gz, *inside* the 130–170 KB reference budget.
   Rounds 1 and 2 attributed this chunk to ~20 `xlsx`/`jspdf`/`qrcode` imports and prescribed making
   them dynamic; stubbing all 19 of those sites changed the bundle by **zero bytes**. (F-D3-08, §12)

1. **Every route ships 778 KB gzipped before it renders anything — and most of it is not what anyone
   intended to ship.** `/login`, `/signup` and `/_not-found` all pay it; `/_global-error`, which
   bypasses the root layout, ships 167.5 KB. The **614.9 KB difference across 23 chunks** breaks down
   as: **167.2 KB of `crypto-browserify` polyfill** dragged in by ~20 static `xlsx`/`jspdf`/`qrcode`
   imports (F-D3-08), **69.4 KB of the complete translation dictionary in both languages** (F-D3-09),
   114.4 KB of supabase+sentry+zod, and only **~87 KB of actual authenticated shell** — chat,
   notifications, the orders provider. A logged-out visitor downloads elliptic-curve cryptography and
   the Arabic string for "Import Orders from Excel File" in order to see a password field. (F-D3-01)

2. **The Iraqi shopper's experience is the worst part of the product, and it is the part that earns
   the money — and one file is most of the reason.** Cold cache at P-mobile, **every one of 12
   storefront routes fails the 2.5 s LCP budget**: home 12.6 s, `/products` 13.1 s, PDP 12.7 s, best
   is `/about` at 9.6 s. First contentful paint on the home page is **6.3–7.8 s**. Nothing becomes
   interactive under 11 s. The cause is now measured rather than inferred: LCP is **render-delay
   bound**, not payload bound — TTFB is 12–42 ms while element render delay is 1,219–1,514 ms — and
   Lighthouse names the same render-blocking resource first on all six routes profiled:
   `fonts.googleapis.com/css2?family=Material+Symbols+Outlined`, at **970–996 ms each**, gating a
   385 KB icon font that `display=block` keeps invisible until it arrives. A further 490 KB is Meta
   and TikTok pixel script, with the TikTok SDK fetched twice. These numbers are from localhost; real
   Iraqi mobile networks are worse. (F-D1-03, F-D3-02, F-D3-03, F-D1-01)

3. **The client is doing work the server should have done, and doing it many times over.** One
   dashboard load issues **227 requests**: 58 RSC prefetches (every nav route fetched 4–6 times) and
   76 Supabase calls, with `user_profiles`, `notification_prefs` and `notification_settings` each
   fetched 6 times and `get_dashboard_metrics` called twice with identical arguments. Every one of
   those requests passes through `middleware.ts`, which calls `supabase.auth.getUser()` — a network
   round trip to the auth server — because the matcher excludes API and static assets but not `?_rsc=`
   prefetches. Authenticated TTFB is 380 ms on desktop and 2,890 ms at P-mobile, against 2–4 ms
   unauthenticated. (F-D2-01, F-D2-02, F-D2-03)

---

## 2. P0-SECURITY

### P0-SEC-01 — Customer phone numbers are transmitted to Meta on the order-tracking page

Found in Round 3. Rounds 1 and 2 both recorded "None found" here; that was wrong.

- **Location:** `packages/sections/src/track_order_lookup.client.tsx:81,88` ·
  `apps/storefront/app/s/[tenant]/layout.tsx:232` ·
  `apps/storefront/components/schneiders/analytics-pixels.tsx:98-131` ·
  `packages/sections/src/order_tracker.client.tsx:183-187`
- **Evidence — the full chain, each link verified:**

  1. The lookup form puts the shopper's phone in a URL query and navigates to it:

     ```ts
     const params = new URLSearchParams();
     params.set("phone", phone);
     params.set("order", trimmedOrder);
     window.location.href = `${target}?${params.toString()}`;
     ```

     producing `…/s/<tenant>/track?phone=07XXXXXXXXX&order=100001`.

  2. `/track` renders under the tenant layout, which mounts the pixels at line 232
     (`<SchneidersAnalyticsPixels …>`). They fire unconditionally on first paint — there is **no
     consent gate anywhere**; the only `consent` strings in the repo are unused method names inside the
     vendored TikTok SDK.

  3. The Meta pixel reports the **full document location** in `dl`, alongside the `fbp` browser
     identifier. Confirmed from this audit's own captured traffic:

     ```
     https://www.facebook.com/tr/?id=1381276402882575&ev=PageView
       &dl=http%3A%2F%2F…%2Fs%2Fscheniders-iraq&…&fbp=fb.0.1789629826…
     ```

  So on `/track`, the customer's phone number leaves for Meta inside `dl`, joined to a persistent
  advertising identifier. TikTok and Snap pixels mount on the same layout.

  4. Independently, the tracker sends the same phone as a **GET** query —
     `fetch("/api/orders/lookup?phone=…&order_number=…&tenant_id=…")` — so it is also written to edge
     access logs.
- **Repro:** open `/s/<tenant>/track`, submit a phone and order number, and inspect outbound requests
  to `facebook.net` / `facebook.com/tr`; read the `dl` parameter.
- **User impact:** A customer checking where their order is hands their phone number — the primary
  identifier for a person in this market, and the same number used for WhatsApp — to an ad network,
  correlated with a tracking cookie. No consent was asked. The merchant is the data controller and
  does not know this is happening; the privacy policy discloses pixels in general and points the
  shopper at their browser settings, which is not a mechanism.
- **Reach:** 4 · **Impact:** 5 · **Confidence:** 1.0 · **Effort:** 2
- **SEVERITY: 5 × 4 × 1.0 = 20** · **PRIORITY: 20 / 2 = 10.0**
- **Fix direction:** Stop putting the phone in the URL — the tracking form should POST, or hold the
  phone in component state and never in `location`. That alone breaks the chain, because `dl` can only
  carry what is in the address bar. Then move the lookup off a GET so it stops reaching access logs.
  A consent gate before any pixel fires is the separate, larger piece of work and should be decided
  with the merchant.
- **Risk if fixed:** A POST-based lookup is not shareable or bookmarkable; anyone who has sent a
  customer a tracking link with a phone in it will find it stops working. That is the correct outcome
  but it should be communicated.
- **Not fixed.** Surfaced within the turn it was found, per the stop-the-line rule.

### Advisor signals checked and correctly not P0

Two advisor signals were investigated and **do not** constitute live defects. Both are recorded here
because a future reader will hit the same advisor output and should not re-open them without new evidence.

**`customer_aggregates` is flagged `security_definer_view` at ERROR level — verified safe.**
The view body filters internally:

```sql
FROM mv_customer_aggregates
WHERE (tenant_id IN ( SELECT get_user_tenant_ids() AS get_user_tenant_ids));
```

and its ACL is `postgres=arwdDxtm/postgres | service_role=arwdDxtm/postgres | authenticated=r/postgres`
— `anon` holds no grant at all. The SECURITY DEFINER property is what lets the view read the
materialized view while still applying the caller's tenant set. Correctly scoped.

**7 SECURITY DEFINER functions have a mutable `search_path` — still not exploitable, but Round 1's
reasoning for saying so was wrong.** Round 1 tested schema `CREATE` and stopped. The relevant privilege
is database `TEMPORARY`, because Postgres resolves relation names through `pg_temp` first — and both
`authenticated` and `anon` hold it. Three of the seven also carry unqualified `FROM` clauses. What
actually prevents exploitation is that PostgREST exposes RPC and not DDL, so no REST caller can create
the shadowing temp table in the session that calls the function. Conclusion unchanged, reasoning
replaced; full working and the corrected counts are in **F-D4-07**, now Severity 9.

**Neither of these is a P0.** Both are recorded at their real severity rather than dismissed, so a
future reader hitting the same advisor output does not have to re-derive them — and, in the second
case, does not inherit the wrong justification.

---

## 3. The ranked ledger

Sorted by **SEVERITY = Impact × Reach × Confidence**. `PRIORITY = Severity / Effort` is printed but
does not reorder.

---

### F-D3-01 — Every route ships the entire authenticated app shell, including on the logged-out login page

- **Dimension:** D3 (with D1 consequences)
- **Location:** `apps/platform/app/layout.tsx:1-19` (imports), `:95-131` (provider tree)
- **Profile:** n/a (code-structural) + P-mobile for the consequence
- **Evidence:** Measured from the prerendered HTML of the production build — every `/_next/static/**.js`
  referenced in `<script src>`/`<link href>`, gzipped from disk and summed:

  | Route | chunks | gzip |
  |---|---:|---:|
  | `/login` | 33 | **782.4 KB** |
  | `/_not-found` | 32 | **778.3 KB** |
  | `/orders` | 40 | **917.9 KB** |
  | `/_global-error` (bypasses root layout) | 10 | **167.5 KB** |
  | **root-layout cost (`/login` − `/_global-error`)** | **23** | **614.9 KB** |

  Probing `/login`'s own chunk set for application markers returns, all present:
  `chat_send_message`/`chat_conversations`/`chat_mark_read` (6 occurrences), `sidebarCollapsed` +
  `لوحة التحكم` + `خزينة البيانات` (5), `v_orders_with_risk` (13), `البحث عن الطلبات` (1),
  `notification_feed`/`notification_unread_count` (5), `chat_user_status` (2).

  The cause is that the root layout statically imports the whole shell and the `(auth)` route group
  does not escape it:

  ```tsx
  import { DashboardLayout } from "@/components/layout/dashboard-layout";
  import { ChatRuntime } from "@/components/chat/chat-runtime";
  // …8 more providers…
  ```

  wrapped ten deep around `{children}` with `<ChatRuntime />` inside `DashboardLayout`.
  714 of 1,132 files under `app/`, `components/`, `hooks/`, `lib/` carry `"use client"` (63%).
- **Repro:** `cd apps/platform && pnpm build`, then compare the `<script src>` sets of
  `.next/server/app/login.html` and `.next/server/app/_global-error.html`.
- **User impact:** A merchant opening the product for the first time, or after being logged out,
  downloads and parses 782 KB of gzipped JavaScript — the team chat client, the order book provider,
  global search, the notification feed — to be shown an email field. On a mid-tier Android over Iraqi
  mobile data this is several seconds of blank screen before the login form is usable.
- **Reach:** 5 · **Impact:** 5 · **Confidence:** 1.0 · **Effort:** 4
- **SEVERITY: 5 × 5 × 1.0 = 25** · **PRIORITY: 25 / 4 = 6.3**
- **Fix direction (CORRECTED in Round 2 — the Round 1 direction was substantially wrong):** Splitting
  the root layout is still correct but recovers **only ~87 KB of the 614.9**, not all of it. Per §0.2,
  38% of this delta is a `crypto-browserify` polyfill and a bilingual i18n dictionary, neither of which
  is reached through the layout; they need **F-D3-08** and **F-D3-09** and are orthogonal to this
  finding. Of what the layout does own: `ChatRuntime` (50.7 KB) is a background surface and belongs
  behind `next/dynamic` with `ssr: false` inside an authenticated route group; notifications (29.4 KB)
  and the orders provider (7.1 KB) likewise. Do not schedule this expecting the whole 614.9 KB to move.
- **Risk if fixed:** Two root layouts means two font/theme setups that can drift. Moving providers can
  break any component reading a context it no longer sits under — the compiler will not catch a
  `useContext` returning the default value.
- **Round 2 note:** the byte measurements re-derive exactly under independent recomputation. The defect
  was that Round 1 measured 23 chunks and opened none of them, so it attributed all 614.9 KB to a cause
  that accounts for about a seventh of it.

---

### F-D3-08 — One `node:crypto` import in a barrel file puts 129 KB of polyfill on every route

> **ROUND 3: PROVEN BY BUILD EXPERIMENT. Magnitude confirmed, attribution and fix direction
> OVERTURNED.** Rounds 1–2 attributed this chunk to ~20 static `xlsx`/`jspdf`/`qrcode` imports and
> prescribed making them dynamic. **That would have recovered nothing.** The experiment below
> falsified it and found the real cause, which is one line.

- **Dimension:** D3
- **Location:** `packages/shared/src/preview-token.ts:21` · re-exported via `packages/shared/src/index.ts:18`
- **Profile:** n/a (code-structural), measured by build diff
- **Evidence — two controlled rebuilds against `3c0f0cb3`, each reverted after:**

  | build | `/login` JS gz | polyfill in `/login`'s chunk set |
  |---|---:|---|
  | baseline | **782.4 KB** | yes — `a0ed248a023e0f59.js`, 167.2 KB |
  | **(A)** all 19 `xlsx`/`jspdf`/`qrcode`/`jsbarcode` import sites stubbed across 14 files | **782.4 KB** — *byte-identical, no change* | **yes, unchanged** |
  | **(B)** one line stubbed: `node:crypto` in `preview-token.ts` | **653.3 KB** | **no — gone** |

  Experiment (A) leaves **zero** runtime imports of those libraries in the app and changes nothing.
  The hypothesis Rounds 1–2 built the finding on is false; `export-utils.ts:36`'s
  `await import('xlsx')` was never the exception, the libraries were already split.

  Experiment (B) removes **129.1 KB gz from every route**, consistently:

  ```
  /login       782.4 → 653.3   (−129.1)
  /_not-found  778.3 → 649.2   (−129.1)
  /orders      917.9 → 788.8   (−129.1)
  ```

  The mechanism:

  ```ts
  // packages/shared/src/preview-token.ts:21
  import { createHmac, timingSafeEqual } from "node:crypto";
  // packages/shared/src/index.ts:18
  export * from "./preview-token";
  ```

  `@scheniders/shared` is a 22-line `export *` barrel with no `"sideEffects"` declaration, and
  `apps/platform/lib/utils.ts:5` re-exports `cn` from it — so **every component that imports `cn`
  pulls the whole barrel**, including a server-only HMAC module, and Turbopack satisfies `node:crypto`
  with `crypto-browserify` in the client bundle.

  The 167.2 KB chunk is **not purely polyfill** — 129.1 KB is, and the remaining ~38 KB is genuine
  `@scheniders/shared` code that stays. (A Round 2 critic estimate put the real shared code at
  ~37 KB gz; measured, it is 38.1 KB.)
- **Repro:** stub the `node:crypto` import in `preview-token.ts`, `rm -rf .next && pnpm build`, and
  diff `/login`'s `<script src>` set. Scripts in `tmp/audit/flj.py`; logs in `tmp/audit/experiment*-build.log`.
- **User impact:** Every visitor to every route — including a logged-out one looking at a password
  field — downloads and parses 129 KB gzipped of elliptic-curve, AES and PBKDF2 code that no browser
  code path uses, because one server-only token module sits behind a barrel export.
- **It costs BOTH apps.** The same polyfill is the largest chunk on a storefront policies page
  (`15c044496c9f26c9.js`, 157.6 KB gz). Stubbing the same line removed **124.6 KB from every storefront
  route** — floor 286.8 → **162.2 KB gz, inside the 130–170 KB reference budget.** Measured totals:

  | | baseline | after one-line fix |
  |---|---:|---:|
  | platform, every route | 782.4 (`/login`) | **653.3** (−129.1) |
  | storefront, every route | 286.8 (floor) | **162.2** (−124.6) |

- **Reach:** 5 · **Impact:** 5 · **Confidence:** **1.0** · **Effort:** **1**
- **SEVERITY: 5 × 5 × 1.0 = 25** · **PRIORITY: 25 / 1 = 25.0** — **highest priority in the ledger,
  and the only finding whose value is measured rather than argued.**
- **Fix direction:** `preview-token` is used by `/store/edit`'s server component and the storefront's
  `_preview` route — both server-side. Take it out of the barrel so client code cannot reach it: either
  a separate entry point (`@scheniders/shared/preview-token`) imported only by server code, or move the
  signing into the app that needs it. Declaring `"sideEffects": false` on the workspace packages, and
  adding `@scheniders/shared` to `optimizePackageImports`, both help and neither is sufficient alone —
  a barrel re-export of a `node:crypto` module will still be reachable.
- **Risk if fixed:** `signPreviewToken` / `verifyPreviewToken` must keep working on both server paths.
  The preview route is how the store builder renders its iframe; breaking it breaks the editor.
  Verify by signing and verifying a token on both paths after the change.
- **Confidence note:** was 0.9 on an inferred cause. Now **1.0** — the cause is isolated by controlled
  build diff, and the saving is measured, not estimated. Effort drops 2 → 1: it is one import.
- **Credit:** the chunk's existence and size were found by the Round 1 critic; the `node:crypto`
  mechanism was proposed by the Round 2 critic's addendum and is confirmed here.


---

### F-D3-09 — The complete bilingual translation dictionary ships to logged-out visitors

- **Dimension:** D3
- **Location:** `.next/static/chunks/1199bea09920980e.js`, in the `/login` chunk set
- **Profile:** n/a (code-structural)
- **Evidence:** 277,163 bytes raw / **69.4 KB gzip**, 8.9% of the baseline. It carries every namespace
  in both English and Arabic. Verified strings present in the chunk served to `/login`:

  ```
  "orders.import.title" : "Import Orders from Excel File"
  "استيراد الطلبات من ملف Excel"
  "products.import.acceptedFormats" : "Accepted: CSV, XLSX, XLS"
  "لوحة التحكم"
  ```

  None of these is reachable by a logged-out user, and no single user needs both locales at once.
- **Repro:** grep `.next/static/chunks/1199bea09920980e.js` for `orders.import.title`.
- **User impact:** 69.4 KB gzip of strings for screens the visitor cannot open, in a language they are
  not using, before the login form renders.
- **Reach:** 5 · **Impact:** 3 · **Confidence:** 1.0 · **Effort:** 2
- **SEVERITY: 3 × 5 × 1.0 = 15** · **PRIORITY: 15 / 2 = 7.5**
- **Fix direction:** Split the dictionary per locale and load only the active one, then split per route
  group so the auth namespace is all a logged-out visitor fetches. The language switcher then loads a
  locale on demand rather than shipping both always.
- **Risk if fixed:** An async dictionary can flash untranslated keys on first paint if the switch is
  not handled at the boundary. Arabic is the default and must never flash English.
- **Credit:** found by the Round 1 critic.

---

### ~~F-D1-03~~ — WITHDRAWN IN ROUND 3

Claimed LCP is render-delay bound across the storefront and that the Google Fonts stylesheet is the
cause. **Lighthouse credits render-blocking with 0 ms of LCP saving on home, PDP and `/products`**; the
figures quoted were FCP savings. `unused-javascript` (438–510 KiB) is the #1 LCP opportunity on 5 of 6
routes. Full working and consequences in §0.3. Replaced by **F-D3-11**.


### F-D1-04 — `/products` has a different LCP mechanism: a late-discovered image

- **Dimension:** D1
- **Location:** `apps/storefront/app/s/[tenant]/products/page.tsx` and the product card image
- **Profile:** P-mobile, cold cache
- **Evidence:** `/products` inverts the pattern in F-D1-03 — **resource load delay 1,249 ms, element
  render delay 28 ms**, against ~10 ms / ~1,300 ms on every other route. `lcp-discovery-insight` flags
  `fetchpriority=high should be applied to the image preload request`. At 13.1 s it is the slowest
  storefront route measured, and 2,272 KiB makes it the heaviest.
- **Repro:** as F-D1-03, on `/s/scheniders-iraq/products`.
- **User impact:** The catalogue — the page an ad click most often lands on after the home page — waits
  1.25 s to even begin fetching its largest image.
- **Reach:** 4 · **Impact:** 3 · **Confidence:** 0.9 · **Effort:** 1
- **SEVERITY: 3 × 4 × 0.9 = 10.8** · **PRIORITY: 10.8 / 1 = 10.8**
- **Fix direction:** Mark the first-viewport product image with `priority` / `fetchpriority="high"` so
  it is discoverable in the initial document rather than after hydration, and confirm it is not
  `loading="lazy"`. Applies to the first row only — lazy loading below the fold is correct.
- **Risk if fixed:** Prioritising too many images competes with the render-blocking CSS and can make
  things worse. One image, verified by re-measuring.
- **Confidence note:** 0.9 — the phase split and the Lighthouse flag are measured; the specific element
  was not identified, because Lighthouse 13 does not emit `largest-contentful-paint-element`.

---

### F-D1-01 — Every storefront route misses the LCP budget by 2.2×–5.4× on the profile that represents the actual customer

- **Dimension:** D1
- **Location:** `apps/storefront/app/s/[tenant]/**`, `apps/storefront/app/layout.tsx`
- **Profile:** **P-mobile** (Lighthouse 13.4.1 mobile preset: 4× CPU, 1,474.56 kbps down, 150 ms RTT, 390×844)
- **Evidence:**

  | Route | Score | FCP | **LCP** | TBT | CLS | SI | TTI | Bytes |
  |---|---:|---:|---:|---:|---:|---:|---:|---:|
  | home | 65 | 2.0 s | **13.6 s** | 280 ms | 0 | 4.4 s | 13.6 s | 2,003 KiB |
  | PDP `north-stag-1` | 68 | 1.9 s | **11.7 s** | 210 ms | 0 | 4.3 s | 12.1 s | 1,857 KiB |
  | `/products` | 69 | 2.1 s | **8.9 s** | 240 ms | 0 | 2.1 s | 12.7 s | 2,075 KiB |
  | `/cart` | 69 | 1.7 s | **5.5 s** | 370 ms | **0.061** | 2.0 s | 11.5 s | 1,743 KiB |
  | `/checkout` | 72 | 1.6 s | **5.5 s** | 320 ms | 0.004 | 1.8 s | 11.4 s | 1,746 KiB |

  Budget: LCP < 2.5 s, CLS < 0.05. Every route fails LCP; `/cart` also fails CLS. No route reaches
  interactive in under 11 s. TBT is low throughout (210–370 ms), so this is **not** main-thread bound —
  it is payload and request-chain bound, which is what F-D3-02, F-D3-03 and F-D3-01 describe.
  Server HTML is fast when warm (7–26 ms TTFB) but the documents are large: home 305,056 bytes,
  `/products` 480,267 bytes uncompressed.
- **Repro:** `cd apps/storefront && pnpm build && PORT=3101 pnpm start`, then
  `lighthouse http://localhost:3101/s/scheniders-iraq --only-categories=performance`.
- **User impact:** A shopper on a mid-tier Android in Baghdad stares at an incomplete store for 13
  seconds. Abandonment on mobile commerce climbs steeply after about 3 s; this is more than four times
  that, on the page every ad click lands on.
- **Reach:** 5 · **Impact:** 5 · **Confidence:** 1.0 · **Effort:** 4
- **SEVERITY: 5 × 5 × 1.0 = 25** · **PRIORITY: 25 / 4 = 6.3**
- **Fix direction:** Attack payload before anything else — the three findings below account for more
  than half the bytes. Then reduce the HTML: a 305 KB home document means a large RSC payload,
  usually because client components are receiving big serialized props they could derive server-side.
  Establish a per-route byte budget and hold the storefront to it in CI.
- **Risk if fixed:** Deferring the pixels changes attribution timing; merchants measure their ad spend
  by it, so any change there needs a before/after event-count comparison, not just a speed number.

---

### F-D1-02 — Platform dashboard LCP is 8.3 s at P-mobile and 2.5 s at P-desktop, both over budget

- **Dimension:** D1
- **Location:** `apps/platform/app/page.tsx`, `apps/platform/app/layout.tsx`, `apps/platform/middleware.ts:42`
- **Profile:** P-mobile and P-desktop
- **Evidence:**

  | Profile | Score | FCP | **LCP** | TBT | CLS | SI | TTI | Root doc |
  |---|---:|---:|---:|---:|---:|---:|---:|---:|
  | P-mobile | 70 | 1.4 s | **8.3 s** | 170 ms | 0 | 5.0 s | 8.3 s | **2,890 ms** |
  | P-desktop | 86 | 0.3 s | **2.5 s** | 20 ms | 0.01 | 1.4 s | 2.5 s | **380 ms** |

  Budgets: P-mobile LCP < 2.5 s (3.3× over), P-desktop LCP < 1.2 s (2.1× over), P-desktop TTFB < 200 ms
  (1.9× over). Unused JavaScript: 732 KiB desktop, 244 KiB mobile.
  **This measurement is a lower bound** — see §5; the session available renders no data at all, so a
  real merchant's dashboard does strictly more work than this.
- **Repro:** `cd apps/platform && pnpm build && PORT=3100 pnpm start`, sign in, then
  `lighthouse http://localhost:3100/ --port=<debug port> --only-categories=performance`.
- **User impact:** The merchant's home screen — the one opened many times a day — takes over 8 seconds
  to settle on a phone, and that measurement was taken against an empty dashboard.
- **Reach:** 5 · **Impact:** 5 · **Confidence:** 1.0 · **Effort:** 4
- **SEVERITY: 5 × 5 × 1.0 = 25** · **PRIORITY: 25 / 4 = 6.3**
- **Fix direction:** The 2,890 ms document response is the first target and is addressed by F-D2-02.
  The rest follows F-D3-01 and F-D2-03. Re-measure after each rather than attempting all three at once —
  they interact, and attributing the gain matters more than the gain.
- **Risk if fixed:** None specific beyond the constituent findings.

---

### F-D2-01 — One dashboard load issues 227 requests, 58 of them RSC prefetches of routes the user did not ask for

- **Dimension:** D2
- **Location:** `apps/platform/components/layout/sidebar.tsx` (nav `<Link>`s), `apps/platform/app/layout.tsx`
- **Profile:** P-desktop, warm, authenticated
- **Evidence:** Captured with `agent-browser network requests` on a single load of `/`:
  **227 total requests**, of which **58** carry `?_rsc=`. Per-route prefetch counts —
  `/store` 6, `/vault` 5, `/` 5, `/orders` 5, `/products` 5, `/settings` 4, `/recovery` 4, `/reviews` 4,
  `/customers` 4, `/finances` 4, `/team` 4, `/printing` 4, `/reports` 4. The same route is fetched
  repeatedly with different `_rsc` hashes (`/settings?_rsc=1pn8p`, `?_rsc=nn07o`, `?_rsc=1j1ph`,
  `?_rsc=tpiaw`), so these are not one prefetch being cached — they are distinct requests.
- **Repro:** Sign in, open `/`, run `agent-browser network requests | grep -c '_rsc='`.
- **User impact:** Opening the dashboard silently downloads most of the rest of the application. On a
  metered Iraqi mobile plan the merchant pays for thirteen pages they did not open, and the prefetches
  compete for bandwidth with the data the visible page is waiting on — which is part of why LCP is 8.3 s.
- **Reach:** 5 · **Impact:** 4 · **Confidence:** 1.0 · **Effort:** 2
- **SEVERITY: 4 × 5 × 1.0 = 20** · **PRIORITY: 20 / 2 = 10.0**
- **Fix direction:** Next prefetches every viewport-visible `<Link>` by default; a permanently visible
  sidebar therefore prefetches the entire application on every page. Set `prefetch={false}` on the nav
  links and prefetch deliberately on hover or focus instead. Separately, the same route being fetched
  4–6 times with different hashes points at the link tree remounting — worth confirming, because if the
  sidebar remounts on every render that is its own defect.
- **Risk if fixed:** Navigation between sections will feel marginally slower on first visit. Hover-intent
  prefetch recovers most of that on desktop; on touch there is no hover, so measure the trade on mobile
  before committing.

---

### F-D2-03 — The same rows are fetched four to six times per page load because each provider queries independently

- **Dimension:** D2
- **Location:** `apps/platform/app/layout.tsx:95-131` (the ten-deep provider stack), and the hooks each provider owns
- **Profile:** P-desktop, warm, authenticated
- **Evidence:** 76 Supabase calls on one dashboard load. Repeat counts by endpoint:
  `rpc` ×26, `user_profiles` ×6, `notification_prefs` ×6, `notification_settings` ×6,
  `role_permissions` ×4, `user_permissions` ×4, `tenants` ×4, `announcements` ×2, `order_reasons` ×2,
  `message_templates` ×2, `blacklist` ×2, `chat_conversations` ×2, `products` ×2, `v_orders_with_risk` ×2,
  `filter_presets` ×2. `get_dashboard_metrics` is called **twice with identical arguments**.
- **Repro:** Sign in, open `/`, run `agent-browser network requests | grep supabase.co`.
- **User impact:** The dashboard waits on six round trips for one user profile. Every duplicate is a
  serial dependency on a 150 ms-RTT link, and each one passes through the middleware auth check in F-D2-02.
- **Reach:** 5 · **Impact:** 4 · **Confidence:** 1.0 · **Effort:** 3
- **SEVERITY: 4 × 5 × 1.0 = 20** · **PRIORITY: 20 / 3 = 6.7**
- **Fix direction:** TanStack Query is already a dependency and already deduplicates by query key —
  these providers are not using it, or are using unstable keys. Give the identity/permission/preference
  reads one shared query key each so the six calls collapse to one. The deeper fix is that this data is
  known at request time and belongs in the server render rather than six client fetches.
- **Risk if fixed:** Shared cache entries mean one provider invalidating affects the others; a stale
  permission read is worse than a slow one, so the invalidation rules need stating explicitly.

---

### F-D3-02 — The storefront loads a 385 KB icon font with `display=block`, and the code comment claims the opposite

- **Dimension:** D3
- **Location:** `apps/storefront/app/layout.tsx:77-80`
- **Profile:** P-mobile
- **Evidence:** The largest single resource on the storefront home is **385.1 KB**:
  `https://fonts.gstatic.com/s/materialsymbolsoutlined/v372/…`. The tag:

  ```tsx
  <link
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@400,1&display=block"
  />
  ```

  The comment immediately above it states the axis pinning makes this "far smaller download". The
  measurement disproves it: pinning `wght,FILL@400,1` constrains the *variation axes*, not the
  *glyph set*, so Google Fonts still serves the full icon library. The application uses roughly 40
  distinct icon names across 196 `MaterialIcon` call sites. `display=block` is a deliberate choice
  (documented in the same comment, to avoid painting ligature names as text) but it means those glyphs
  are invisible until 385 KB arrives over a 1.47 Mbps link.
- **Repro:** `lighthouse http://localhost:3101/s/scheniders-iraq --only-categories=performance --output=json`,
  then sort `audits['network-requests'].details.items` by `transferSize`.
- **User impact:** Round 1 called this "roughly 2 s of the shopper's wait." Round 2 measurement makes it
  larger and more central than that. The stylesheet is **render-blocking on all six routes measured, at
  970–996 ms each**, and it gates a 385 KB font that `display=block` makes invisible until it lands.
  Lighthouse estimates 1,480–3,270 ms of savings from unblocking it. Per **F-D1-03**, element render
  delay — not network time — is what holds LCP up on every storefront route, and this is the first
  entry in `render-blocking-insight` on each one. The shopper is looking at a blank page because of
  this file, and at blank icons for a while after.
- **Reach:** 5 · **Impact:** 4 · **Confidence:** 1.0 · **Effort:** 2
- **SEVERITY: 4 × 5 × 1.0 = 20** · **PRIORITY: 20 / 2 = 10.0**
- **Round 3 note — the Round 2 promotion to 25 is RETRACTED.** Round 2 raised this to Impact 5 on the
  claim that this stylesheet is the dominant LCP cost. It is not: Lighthouse credits render-blocking
  with **0 ms of LCP saving** on home, PDP and `/products` (§0.3). The finding returns to its original
  Severity 20 and stands on what is still true and measured — it is render-blocking, it costs
  970–996 ms of **FCP** on every route, and `display=block` leaves every icon invisible until 385 KB
  arrives. It should not lead Wave 1; `unused-javascript` should.
- **Fix direction:** Forty icons do not need a font. Inline them as SVG, which removes the request, the
  render-block and the invisible-glyph window together, and lets `MaterialIcon` keep its call signature.
  If the font must stay, it has to be subsetted to the glyphs actually referenced and self-hosted so it
  is not a third-origin render-blocking stylesheet. Either way the comment needs correcting — it
  currently tells the next reader this is already optimised.
- **Risk if fixed:** `MaterialIcon` takes a free-form `name` string, so any icon referenced from
  merchant-authored store config (`trust_strip`, `pdp_direct_order` and `checkout_form` all take a
  Material Symbols name as data) would break under a fixed subset. That is a merchant-facing decision —
  see the Open Decisions register.

---

### F-D3-03 — Half a megabyte of advertising pixels loads on every storefront page, with the TikTok pixel fetched twice

- **Dimension:** D3
- **Location:** `apps/storefront/components/schneiders/analytics-pixels.tsx:98-131`
- **Profile:** P-mobile
- **Evidence:** On the storefront home:

  | KB | Resource |
  |---:|---|
  | 137.1 | `connect.facebook.net/signals/config/1381276402882575` |
  | 129.0 | `analytics.tiktok.com/i18n/pixel/static/main.MTA0ZjcyZGVhOQ.js` |
  | 115.5 | `analytics.tiktok.com/i18n/pixel/static/main.MTA0ZjcyZGVhMQ.js` |
  | 108.0 | `connect.facebook.net/en_US/fbevents.js` |

  **489.6 KB total**, ≈ 24% of the 2,003 KiB page. Two distinct TikTok bundles load because the field
  accepts a list and this tenant has configured two ids — `${tiktokIds.map((id) => `ttq.load('${escapeJs(id)}');`).join("\n")}`
  — and each `ttq.load` pulls its own SDK build. Both scripts use `strategy="afterInteractive"`, which
  is the right Next.js strategy but still schedules them during hydration, where they compete with the
  work that ends the 11.4–13.6 s TTI window.
- **Repro:** As F-D3-02; filter `network-requests` for `facebook.net` and `analytics.tiktok.com`.
- **User impact:** A quarter of what the shopper downloads is measurement infrastructure that shows
  them nothing.
- **Reach:** 5 · **Impact:** 4 · **Confidence:** 1.0 · **Effort:** 2
- **SEVERITY: 4 × 5 × 1.0 = 20** · **PRIORITY: 20 / 2 = 10.0**
- **Fix direction:** Move both to `strategy="lazyOnload"` so they cannot compete with hydration, and
  gate them on first interaction or an idle callback. The duplicate TikTok SDK is the cheaper win:
  `ttq.instance(id)` exists precisely so several pixel ids can share one loaded SDK. Server-side
  conversion tracking already exists (`apps/storefront/lib/capi.ts`), which is the direction that
  removes this weight permanently.
- **Risk if fixed:** Deferred pixels fire later and some bounced sessions will stop being counted, so
  reported conversion volume can drop without real conversions dropping. Compare event counts before
  and after over a full week, and tell the merchant before changing it.

---

### F-D5-01 — 28 of 33 routes have no loading boundary, so each blocks entirely on its slowest fetch

- **Dimension:** D5
- **Location:** `apps/platform/app/**`
- **Profile:** n/a (code-structural), consequence at P-mobile
- **Evidence:** `find app -name loading.tsx` returns **5** files for **33** `page.tsx` files:
  `/analytics`, `/customers`, `/products`, `/reports`, `/team`.
  Missing on, among others: `/` (dashboard), `/orders`, `/orders/trash`, `/finances`, `/salaries`,
  `/printing`, `/settings`, `/settings/team`, `/vault`, `/store`, `/store/edit`, `/store/reviews`,
  `/store/recovery`, `/returns/scan`, `/admin/data-import`, `/products/new`, `/products/[id]/edit`,
  `/customers/[phone]`.
- **Repro:** `cd apps/platform && find app -name "loading.tsx" | wc -l` → 5; `find app -name page.tsx | wc -l` → 33.
- **User impact:** On the busiest screens in the product — orders, finances, salaries — the merchant
  gets no streamed shell. The page is blank until the slowest query returns, which on the orders page
  is the one described in F-D4-06.
- **Reach:** 5 · **Impact:** 4 · **Confidence:** 1.0 · **Effort:** 2
- **SEVERITY: 4 × 5 × 1.0 = 20** · **PRIORITY: 20 / 2 = 10.0**
- **Fix direction:** Add `loading.tsx` per route, each rendering a skeleton whose geometry matches the
  final layout — row count, row height and column count — so the boundary does not trade a blank screen
  for a layout shift. The five that exist should be checked against their real content for the same reason.
- **Risk if fixed:** A skeleton that does not match its content converts a wait into a visible jump,
  which measures as CLS. Verify each against the rendered page rather than assuming.

---

### F-D8-01 — The same money is formatted ten different ways in three different locales

- **Dimension:** D8
- **Location:** `packages/shared` exports the canonical `formatIQD`; `apps/platform/lib/utils.ts:5` re-exports it. Shadowed by 10 local redefinitions.
- **Profile:** n/a (code-structural)
- **Evidence:** `lib/utils.ts:5` — `export { cn, formatIQD, formatIQDArabic } from "@scheniders/shared";`
  — yet `grep -rn 'function formatIQD' app components lib` returns **10** local definitions:

  ```
  app/products/page.tsx:91                                  function formatIQDCached(amount: number): string {
  app/api/telegram/webhook/route.ts:527                     function formatIQD(n: number): string {
  components/customers/detail/customer-identity-card.tsx:35 function formatIQD(n: number, t: any) {
  components/customers/detail/customer-orders-tab.tsx:40    function formatIQD(n: number, t: any) {
  components/customers/list/customer-stats-strip.tsx:31     function formatIQD(amount: number, t: any): string {
  components/settings/billing-settings.tsx:28               function formatIQD(amount: number): string {
  components/products/editor/product-performance-card.tsx:17 function formatIQD(value: number): string {
  components/products/editor/storefront-preview.tsx:31      function formatIQD(value: number): string {
  components/reports/return-breakdown.tsx:15                function formatIQD(amount: number): string {
  lib/excel-report-generator.ts:97                          function formatIQDNumber(amount: number): string {
  ```

  Three of those signatures take `t: any`, which is also a `CLAUDE.md` violation. Locale usage splits
  **37** `en-US`, **25** `en-IQ`, and **95** bare `toLocaleString()` — the last of which follows the
  viewer's browser locale, so the same amount renders differently on different devices.
- **Repro:** the three `grep -c` commands above.
- **User impact:** The merchant sees the same figure grouped differently on different screens, and one
  screen's grouping changes with their phone's language setting. For a financial surface this reads as
  a data problem rather than a formatting one, and it erodes trust in the numbers.
- **Reach:** 5 · **Impact:** 4 · **Confidence:** 1.0 · **Effort:** 2
- **SEVERITY: 4 × 5 × 1.0 = 20** · **PRIORITY: 20 / 2 = 10.0**
- **Fix direction:** Delete all ten and import the shared one. Where a call site needs a translated
  suffix, that belongs as a parameter on the shared function, not as a reason to fork it. Bare
  `toLocaleString()` on a currency value should be lint-forbidden — an ESLint `no-restricted-syntax`
  rule makes the rule enforceable rather than aspirational.
- **Risk if fixed:** The forks may not agree today. Consolidating will change displayed values
  somewhere, and on a financial screen a changed number looks like a bug — diff the outputs across a
  range of amounts before and after, and say which screens change.

---

### F-D10-01 — The mobile dashboard is a separate component tree, hardcoded in English, in an Arabic product

- **Dimension:** D10 (with D8 and D6 consequences)
- **Location:** `apps/platform/components/mobile/` — 7 files, 1,366 lines. Labels in `components/mobile/dashboard/MobileDashboardCards.tsx:27-70`
- **Profile:** **P-mobile** — screenshot `scratchpad/mob-pf-dashboard.png`, viewport 390×844
- **Evidence:** The desktop dashboard renders Arabic (`الطلبات`, `الإيرادات`, `صباح الخير`). At 390 px
  the app swaps to `MobileDashboardPage`, whose card labels are English string literals:

  ```tsx
  <span className="text-xs font-bold tracking-wider text-blue-900/70 uppercase">Revenue</span>
  …
  <div className="text-[10px] text-blue-800/70 font-medium uppercase tracking-wider mt-0.5">Total Available</div>
  ```

  and likewise `Orders` / `Today`, `Pending` / `Action needed`, `Flagged` / `Needs review`, plus
  `<h2 …>Attention Required</h2>` at `MobileDashboardPage.tsx:93` and `Failed Deliveries (7d)` /
  `Stalled High-Value Orders` in `components/dashboard/widgets/urgency-triad.tsx:49,70`.
  The same file also bypasses the token system entirely, styling with raw Tailwind scales
  (`text-blue-900/70`, `bg-amber-100`, `text-rose-950`) rather than the `--bk-*` tokens the desktop uses.
- **Repro:** Sign in, set viewport to 390×844, open `/`. Compare with the same route at 1440×900.
- **User impact:** An Iraqi merchant on a phone — which is how this product is mostly used — gets an
  English dashboard. The most-used surface in the product is the least localized one, and it does not
  look like the same application as the desktop view.
- **Reach:** 4 · **Impact:** 5 · **Confidence:** 1.0 · **Effort:** 3
- **SEVERITY: 5 × 4 × 1.0 = 20** · **PRIORITY: 20 / 3 = 6.7**
- **Fix direction:** The strings are the urgent half and are a day's work. The structural half is that a
  parallel mobile tree guarantees this recurs: every future dashboard change has to be made twice and
  will be forgotten once. Responsive composition of the same components is the root-cause fix; sizing
  it honestly is part of the plan, not of this finding.
- **Risk if fixed:** Merging the trees will change the mobile layout, which merchants have learned. Ship
  the localization first as an independent, verifiable step.

---

### F-D2-02 — The middleware makes a network auth round trip on every request, including all 58 RSC prefetches

- **Dimension:** D2 (with D1 consequences)
- **Location:** `apps/platform/middleware.ts:42`, matcher at `:48-51`
- **Profile:** P-desktop and P-mobile
- **Evidence:**

  ```ts
  // Touch the user to trigger a refresh + cookie rotation when needed.
  // (Do not gate or branch on the result here — refresh is the only job.)
  await supabase.auth.getUser();
  ```

  `getUser()` validates the token against the Supabase Auth server over the network; `getSession()`
  reads the cookie locally. The matcher is
  `'/((?!api|_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js).*)'` — it excludes API
  routes and static assets but **not** `?_rsc=` prefetches, which are ordinary page-path requests. With
  58 prefetches per dashboard load (F-D2-01), that is 58 additional auth round trips per load.
  Measured TTFB on localhost: **2.0–4.3 ms** unauthenticated over 5 runs (the middleware short-circuits
  with no cookie) against **380 ms** desktop and **2,890 ms** at P-mobile for the authenticated document.
- **Repro:** `for i in 1 2 3 4 5; do curl -s -o /dev/null -w "%{time_starttransfer}\n" http://localhost:3100/login; done`
  signed out, then read `audits['server-response-time']` from an authenticated Lighthouse run.
- **User impact:** Every navigation and every background prefetch waits on a round trip to the auth
  server before the server starts rendering. This is the largest single component of the dashboard's
  2,890 ms document response at P-mobile.
- **Reach:** 5 · **Impact:** 4 · **Confidence:** 0.95 · **Effort:** 2
- **SEVERITY: 4 × 5 × 0.95 = 19** · **PRIORITY: 19 / 2 = 9.5**
- **Fix direction:** Rotation is only needed when the token is near expiry, and that is readable from
  the local cookie without a network call — check expiry first and call `getUser()` only when it is
  actually close. Exclude `?_rsc=` requests from the matcher regardless; a prefetch has no business
  rotating a session cookie. The comment at `:14-16` also records that route protection is client-side
  only, which is why the 778 KB shell ships before any redirect decision — worth revisiting in the same
  change, though as its own finding.
- **Risk if fixed:** This middleware exists to fix a real bug — a token refresh hanging on a stale
  socket after idle. Any change must preserve that: verify by leaving a session idle past token expiry
  and confirming the next navigation still succeeds.
- **Confidence note:** 0.95 rather than 1.0 — the attribution of the 2,890 ms figure specifically to
  `getUser()` is inferred from the authenticated/unauthenticated delta, not from a server-side trace.

---

### F-D4-01 — Every write to `orders` fires twelve triggers

- **Dimension:** D4
- **Location:** `public.orders`
- **Profile:** P-scale
- **Evidence:**

  ```
  tbl     | trigger_count | triggers
  orders  | 12            | increment_orders_version, trg_chat_orders_event, trg_inv_order_changed,
                            trg_log_order_creation_history, trg_log_order_update_notifications,
                            trg_loyalty_order_changed, trg_order_completed_at,
                            trg_orders_created_at_not_future, trg_orders_updated_at,
                            trg_referral_order_changed, trg_update_trust_orders,
                            trigger_log_order_notification
  ```

  For comparison: `products` has 2, `notifications` 1, `order_status_history` 1.
- **Repro:** `select tgname, tgrelid::regclass from pg_trigger where not tgisinternal and tgrelid = 'orders'::regclass;`
- **User impact:** Every status change, every bulk action and every import pays twelve function
  invocations per row. This is the mechanism behind the ~110 ms-per-row cost already recorded for bulk
  order updates: a 500-order bulk status change is measured in minutes, and the merchant sits in front
  of it.
- **Reach:** 4 · **Impact:** 4 · **Confidence:** 1.0 · **Effort:** 4
- **SEVERITY: 4 × 4 × 1.0 = 16** · **PRIORITY: 16 / 4 = 4.0**
- **Fix direction:** Audit the twelve for work that does not need to be synchronous. Notification
  logging, chat events, loyalty and referral updates are all consequences of a committed change, not
  preconditions for it, and belong on an async queue. The guards that must stay synchronous —
  `created_at_not_future`, `increment_version`, `updated_at` — are cheap. Measure each one's cost
  individually before deciding; a flat "twelve is too many" is not a fix.
- **Risk if fixed:** Moving a trigger off the synchronous path changes when its effect becomes visible.
  Anything that reads back immediately after a write will see stale data. `trg_inv_order_changed`
  touches inventory and must stay transactional.
- **Cross-reference:** This table previously broke every order status change because a statement-level
  trigger created a temp table and fired twice per transaction. Any change here must be tested through
  the real caller, not through direct SQL.

---

### F-D4-02 — 43 RLS policies re-evaluate `auth.<function>()` once per row

- **Dimension:** D4
- **Location:** Supabase advisor `auth_rls_initplan`
- **Profile:** P-scale
- **Evidence:** `get_advisors(type: "performance")` returns `auth_rls_initplan` at WARN with **count 43**.
  By table: `store_section_presets` 4, `store_config_versions` 2, `order_reasons` 2, `chat_members` 2,
  `chat_messages` 2, `user_profiles` 2, then one each across `chat_user_status`,
  `chat_notification_prefs`, `chat_push_subscriptions`, `product_categories`, `bom_items`,
  `store_config_schedules`, `store_config_experiment_events`, `store_performance_audits` and others.
  Sample: *"Table `public.chat_user_status` has a row level security policy `chat_user_status_self_write`
  that re-evaluates current_setting() or auth.<function>() for each row."*
- **Repro:** `mcp__supabase__get_advisors(type: "performance")`, filter `name = 'auth_rls_initplan'`.
- **User impact:** Query cost scales with rows scanned rather than rows returned. It is invisible at
  today's volumes and becomes the dominant cost as tenants grow — the merchant with 50,000 orders pays
  for it, the one with 500 does not.
- **Reach:** 5 · **Impact:** 3 · **Confidence:** 1.0 · **Effort:** 3
- **SEVERITY: 3 × 5 × 1.0 = 15** · **PRIORITY: 15 / 3 = 5.0**
- **Fix direction:** Wrapping the call as `(select auth.uid())` makes Postgres hoist it to an InitPlan
  evaluated once per query instead of once per row. It is mechanical, but it is 43 policy rewrites on
  live security rules, so each needs its predicate proven unchanged, not just its syntax updated.
- **Risk if fixed:** These are the rules that keep tenants apart. A rewrite that changes a predicate's
  meaning is a cross-tenant leak. Every policy needs a positive and a negative test — a member sees
  their rows, a non-member sees none — before and after.

---

### F-D6-01 — 903 raw colour literals bypass the token system

- **Dimension:** D6 (with D8 consequences)
- **Location:** `apps/platform/app/**`, `apps/platform/components/**`
- **Profile:** n/a (code-structural)
- **Evidence:** Across 5,962 arbitrary Tailwind values in `bg-[…]`, `text-[…]` and `border-[…]`:

  | count | share | kind | example |
  |---:|---:|---|---|
  | 3,737 | 62.7% | `var(--token)` — **legitimate** | `var(--card-bg)` |
  | 1,320 | 22.1% | raw length | `10px`, `15px` |
  | **782** | **13.1%** | **raw hex** | `#c7f8ef`, `#33605a`, `#FBE38E` |
  | 121 | 2.0% | raw colour function | `rgba(0,255,255,0.4)`, `rgba(239,255,0,0.3)` |

  So **903 raw colour values** and 1,320 raw pixel values, against 3,737 correct token references.
  Worst files: `components/orders/duplicate-comparison-modal.tsx` (239 arbitrary values),
  `components/dashboard/order-card.tsx` (203), `app/vault/page.tsx` (139).
  Separately, 1,826 raw six-digit hex literals appear across `app/` and `components/` overall.
- **Repro:** the classification script in `scratchpad/` (regex over `bg|text|border-[…]`, bucketed by prefix).
- **User impact:** Colours drift between screens because they are typed rather than referenced, and a
  theme change cannot reach the 903 that are hardcoded. `rgba(0,255,255,0.4)` and `rgba(239,255,0,0.3)`
  are pure cyan and pure yellow — not values from any considered palette.
- **Reach:** 5 · **Impact:** 3 · **Confidence:** 1.0 · **Effort:** 4
- **SEVERITY: 3 × 5 × 1.0 = 15** · **PRIORITY: 15 / 4 = 3.8**
- **Fix direction:** Start with the three worst files, which hold about 10% of the total between them.
  Map each raw colour to its nearest existing token and add tokens where none fits — the gaps are the
  useful output. A lint rule forbidding raw hex in `className` prevents regrowth; without it this
  returns.
- **Risk if fixed:** Substituting a near-match token changes the rendered colour. Contrast has to be
  re-measured on the affected surfaces, not assumed to be preserved.
- **Accuracy note:** An initial count of 6,522 was wrong — it treated `var(--token)` references as
  violations when they are the correct pattern. The corrected figure is 903.

---

### F-D2-04 — The dashboard fetches three tables with no row limit, including the full product catalogue

- **Dimension:** D2
- **Location:** dashboard load path; observed on the wire
- **Profile:** P-desktop, authenticated
- **Evidence:** Three requests on `/` carry no `limit` or `range`:

  ```
  GET /rest/v1/products?select=*,variants:product_variants(*)&order=created_at.desc
  GET /rest/v1/blacklist?select=phone,reason,notes,added_by
  GET /rest/v1/chat_conversations?select=*,members:chat_members(user_id,last_read_at,role,muted)
  ```

  The products query selects every column of every product *and* every column of every variant.
  This tenant has 48 products (`pg_total_relation_size('products')` = 472 kB), so it is currently cheap —
  the defect is that the cost is unbounded by construction, not by data.
- **Repro:** Sign in, open `/`, `agent-browser network requests | grep -E 'products|blacklist|chat_conversations'`.
- **User impact:** None today at 48 products. A merchant with 5,000 products and variants downloads the
  entire catalogue to render a dashboard that shows none of it.
- **Reach:** 5 · **Impact:** 3 · **Confidence:** 1.0 · **Effort:** 2
- **SEVERITY: 3 × 5 × 1.0 = 15** · **PRIORITY: 15 / 2 = 7.5**
- **Fix direction:** Name the columns each consumer reads and bound every list query with an explicit
  range. `blacklist` is a membership test and should be a server-side lookup rather than a client-side
  download. `chat_conversations` should page.
- **Risk if fixed:** Something downstream may be relying on the full set being present — a client-side
  filter or search. Bounding the query without finding those turns a slow feature into a wrong one.

---

### F-D3-11 — The storefront bundle was never measured; the sections barrel costs every route 44.9 KB

> **ROUND 3: MECHANISM PROVEN BY BUILD EXPERIMENT, MAGNITUDE OVERSTATED.** This finding implied the
> 61-module sections barrel was why "a policies page costs 286.8 KB". Measured, it accounts for
> **44.9 KB of that — 16%.** The other 242 KB is something else and is still unattributed.

- **Dimension:** D3 / D1
- **Location:** `packages/sections/src/index.ts` (61 static section imports, side-effect barrel);
  `apps/storefront/next.config.ts` (no `optimizePackageImports`);
  `apps/storefront/components/v2-page.tsx:3`, `storefront-globals.tsx:6`
- **Profile:** P-mobile, cold cache; bundle figures from manifest-derived per-route sets
- **Evidence — controlled rebuild, barrel reduced from 61 section imports to 5, reverted after:**

  | route | baseline | 61→5 | delta |
  |---|---:|---:|---:|
  | home | 345.8 | 300.9 | **−44.9** |
  | `/checkout` | 292.3 | 247.4 | −44.9 |
  | `/cart` | 291.9 | 247.0 | −44.9 |
  | PDP | 291.5 | 246.6 | −44.9 |
  | `/categories/[slug]` | 289.1 | 244.3 | −44.8 |
  | `/products`, `/search` | 287.8 | 242.9 | −44.9 |
  | `/track`, `/faq`, `/checkout/success` | 287.0–287.7 | 242.1–242.8 | −44.9 |
  | `/about`, `/contact`, `/policies/*` | 286.8 | 241.9 | −44.9 |

  **Uniform −44.9 KB gz on every route**, which confirms the shared-floor mechanism exactly: removing
  56 sections no page renders changes every page by the same amount, because every page ships all of
  them. The barrel is real and it is unconditional.

  **But the floor only drops from 283 to 242 KB.** Dropping 92% of the section library recovers 16% of
  the route cost. And a *real* fix recovers less than 44.9 KB, because a page must still ship the
  sections it actually renders — a policies page needs a few, the home page needs many.

  **This also weakens the finding's own headline.** Lighthouse attributes 1,800–2,650 ms of LCP and
  438–510 KiB to `unused-javascript`. 44.9 KB gz of sections does not account for that, so **most of
  the unused JavaScript is not the sections barrel either, and remains unattributed.** The honest
  position is that the storefront ships ~242 KB gz of floor that nobody in three rounds has explained.
- **Repro:** comment out 56 of the 61 imports in `packages/sections/src/index.ts` and their registry
  references, `rm -rf .next && pnpm build` in `apps/storefront`, then re-run
  `tmp/audit/route-bundles.py apps/storefront`. Log: `tmp/audit/experiment3b-build.log`.
- **User impact:** Every storefront page carries the hero family, the countdown, the FAQ accordion, the
  order tracker and the checkout form whether it renders them or not — 44.9 KB gz of code that cannot
  execute on that page. Real, worth fixing, and **not** the dominant cost it was described as.
- **Reach:** 5 · **Impact:** 3 *(was 5)* · **Confidence:** 1.0 *(was 0.95)* · **Effort:** 3
- **SEVERITY: 3 × 5 × 1.0 = 15** *(was 23.8)* · **PRIORITY: 15 / 3 = 5.0**
- **Fix direction:** A lazy registry keyed on the section types present in a page's config, so a page
  ships only what it renders. The barrel's header warns that registration order is deliberate and must
  be preserved explicitly rather than incidentally. Add `optimizePackageImports` for
  `@scheniders/sections` and `@scheniders/shared` as a cheap partial first.
  **Before scheduling this, attribute the remaining 242 KB floor** — it is 5× larger than the win here
  and nobody has looked at it.
- **Risk if fixed:** Registration order is load-bearing; a lazy registry resolving in a different order
  can change which section wins a name collision.
- **Round 3 note:** downgraded from Severity 23.8 to 15 on measurement. The mechanism was right and the
  magnitude was inferred from a timing argument that did not survive being built.


---

### F-D3-12 — The audit method itself excluded CSS and four routes

- **Dimension:** D3 (method defect in this ledger, and a real finding)
- **Location:** this ledger's First Load JS method; `apps/platform/.next/static/chunks/*.css`
- **Profile:** n/a
- **Evidence:** The method collects every `/_next/static/**.js` from prerendered HTML. Two structural
  gaps follow:

  1. **CSS was excluded by construction.** `/login` also loads
     `ccccc8eab4f8be00.css` at **649,715 bytes / 75.5 KB gz**, render-blocking, on 30 of 31 prerendered
     routes. `/login`'s real first-load cost is **~858 KB gz, not 782.4** — every D3 figure in this
     ledger is roughly 10% low. A 75 KB render-blocking stylesheet was missing from a ledger whose §0.3
     thesis was about render-blocking.
  2. **Four routes have no prerendered HTML and are invisible to the method.** `find app -name page.tsx`
     returns **33**; `find .next/server/app -name '*.html'` returns **31**. `/store/edit`,
     `/products/[id]/edit`, `/customers/[phone]` and `/store/onboarding` are dynamic and were never
     measured. §5 nonetheless claims "per-route First Load JS, all 31 platform routes" as audited, and
     separately calls `/store/edit` "the largest route by the ledger's own description" — a ranking this
     ledger never had and could not obtain by its stated method, asserted in the same table that admits
     not having opened it.
- **Repro:** the two `find` commands above; then parse `href="…css"` out of `.next/server/app/login.html`.
- **User impact:** Indirect but compounding — the budget, the Wave 1 target and the CI gate would all
  have been set against numbers ~10% low and missing the heaviest routes entirely.
- **Reach:** 5 · **Impact:** 3 · **Confidence:** 1.0 · **Effort:** 1
- **SEVERITY: 3 × 5 × 1.0 = 15** · **PRIORITY: 15 / 1 = 15.0**
- **Fix direction:** Include CSS in the measurement, and derive the four dynamic routes from the
  client-reference manifests rather than from prerendered HTML. Re-state every D3 figure afterwards.
- **Credit:** Round 2 critic.

---

### F-D3-13 — `recharts` is emitted four times, and the repo's bundle analyzer cannot run

- **Dimension:** D3
- **Location:** `.next/static/chunks/`; `apps/platform/package.json:11`; `apps/platform/next.config.ts:84-99`
- **Profile:** n/a
- **Evidence:** Four distinct chunks of **exactly 367,549 bytes each**, all containing `recharts`,
  gzipping to 96.2 / 95.3 / 95.2 / 96.7 KB — **383.4 KB gz of the same library across four cache
  entries.** (They are same-size near-duplicates, not byte-identical: md5s differ, so they are the same
  library emitted with different module wrappers.) Two sit in the first-load sets of `/salaries` and
  `/team`, so a merchant who visits both downloads it twice with no cache hit. `@scheniders/sections`
  shows the same pattern in two 324,186-byte chunks.

  And the team has no way to see any of this: `package.json:11` defines
  `"analyze": "ANALYZE=true next build"`, wired at `next.config.ts:84-99` through a `webpack()` hook —
  but Next 16 builds with **Turbopack, which never calls `webpack()`**. The config's own comment at
  `:78-80` concedes the webpack config is "present but not used". `.next/analyze` does not exist;
  `.next/turbopack/` does.
- **Repro:** hash and size every chunk containing `recharts`; then `ls .next/analyze` after `pnpm analyze`.
- **User impact:** Wasted transfer on the reporting screens, and — more consequential — a team that
  cannot inspect its own bundle, which is how 850 KB accumulated without anyone noticing.
- **Reach:** 4 · **Impact:** 3 · **Confidence:** 1.0 · **Effort:** 2
- **SEVERITY: 3 × 4 × 1.0 = 12** · **PRIORITY: 12 / 2 = 6.0**
- **Fix direction:** Fix the instrument first — it is the prerequisite for every other D3 item and for
  any CI budget. Turbopack has its own analysis output; wire the script to that. Then investigate why
  one library lands in four chunks.
- **Credit:** Round 2 critic.

---

### F-D8-04 — The root layout sets `<html dir>`, which the project's own standing rule forbids

- **Dimension:** D8
- **Location:** `apps/platform/app/layout.tsx:81`
- **Profile:** n/a
- **Evidence:** `<html lang="ar" dir="ltr" suppressHydrationWarning>`. `CLAUDE.md` states the rule as
  "Set `<html lang>`, **never** `<html dir>` — the app stays LTR in every locale", and this engagement's
  own scope restates it. The storefront complies: `document.documentElement.getAttribute('dir')` is
  `null` there, verified live.
- **Repro:** `grep -n '<html' apps/platform/app/layout.tsx`
- **User impact:** Effectively none — `ltr` is the intended direction, so the attribute is redundant
  rather than harmful. The finding is that a stated invariant is violated in the most-read file in the
  app, and that a 45-finding consistency audit which counted ten `formatIQD` definitions never checked
  the one rule its brief spells out, in a file it quotes four times.
- **Reach:** 2 · **Impact:** 2 · **Confidence:** 1.0 · **Effort:** 1
- **SEVERITY: 2 × 2 × 1.0 = 4** · **PRIORITY: 4 / 1 = 4.0**
- **Fix direction:** Delete the `dir` attribute. LTR is the default; the rule exists so no locale can
  flip it.
- **Credit:** Round 2 critic.

---

### F-D4-10 — Every write to `orders` maintains 21 indexes on top of 12 triggers

- **Dimension:** D4
- **Location:** `public.orders`
- **Profile:** P-scale
- **Evidence:**

  ```sql
  select count(*), pg_size_pretty(sum(pg_relation_size(indexrelid)))
  from pg_index where indrelid='public.orders'::regclass;
  → 21 indexes, 7,344 kB   (heap: 18 MB)
  ```

  Scan counts since the last stats reset show several earning nothing:

  | index | scans | size |
  |---|---:|---:|
  | `idx_orders_delivery_company` | **0** | 8 KB |
  | `idx_orders_needs_attention` | **0** | 40 KB |
  | `idx_orders_reason_id` | 1 | 232 KB |
  | `idx_orders_refund_status` | 1 | 16 KB |
  | `idx_orders_version` | 2 | 280 KB |
  | `idx_orders_scheduled_date` | 2 | 16 KB |
  | `idx_orders_assigned_to` | 4 | 240 KB |

  This compounds F-D4-01: a single row update pays **12 trigger functions plus up to 21 index
  maintenance operations.** That is the mechanism behind the ~110 ms-per-row cost already recorded for
  bulk order updates.
- **Repro:** the two queries above, plus `select indexrelname, idx_scan from pg_stat_user_indexes where relname='orders'`.
- **User impact:** Every status change, bulk action and import pays this. A 500-order bulk status
  change runs for minutes with the merchant watching.
- **Reach:** 4 · **Impact:** 3 · **Confidence:** 1.0 · **Effort:** 2
- **SEVERITY: 3 × 4 × 1.0 = 12** · **PRIORITY: 12 / 2 = 6.0**
- **Fix direction:** Treat index count on `orders` as a budget, not a free resource. The two
  zero-scan indexes are the safe start; `idx_orders_version` at 280 KB for 2 scans is the next. Do this
  together with F-D4-03's unindexed-FK work so additions and removals are one decision, and re-check
  `pg_stat_reset` timing before dropping anything — a monthly report's index looks unused for 29 days.
- **Risk if fixed:** Dropping an index that serves a rare but important query turns it into a table
  scan, and nobody notices until that report runs.

---

### F-D4-11 — The order list's join to customer trust is unindexable by construction

- **Dimension:** D4
- **Location:** view `public.v_orders_with_risk`; consumed by `apps/platform/lib/repositories/order-repository.ts:88,150,214`
- **Profile:** P-scale
- **Evidence:** `EXPLAIN` on the list query shows the join predicate applies a function to **both**
  sides:

  ```
  ->  Memoize  (cost=0.29..194.27 rows=2 width=26)
        Cache Key: normalize_phone(COALESCE(o.phone, ''::text)), o.tenant_id
        ->  Index Only Scan using customer_trust_pkey on customer_trust ct
              Index Cond: (tenant_id = o.tenant_id)
              Filter: (normalize_phone(COALESCE(o.phone, ''::text)) = normalize_phone(phone))
  ```

  The only index on that table is `customer_trust_pkey (tenant_id, phone)` — on the **raw** column.
  There is no expression index on `normalize_phone(phone)`, so the index can satisfy `tenant_id` only
  and `normalize_phone(phone)` becomes a per-row filter. `orders` does carry two such expression
  indexes (`idx_orders_tenant_normphone`, `idx_orders_tenant_phone_key`), so the pattern is understood
  in this codebase — it just was not applied to the other side of this join. `Memoize` masks the cost
  while the phone set is small and repetitive.
  This is an RLS-independent structural fact and survives the §0.5 caveat.
- **Repro:** `explain select … from public.v_orders_with_risk where is_archived=false order by created_at desc limit 1000;`
  then `select indexdef from pg_indexes where tablename='customer_trust';`
- **User impact:** Order-list latency grows with the number of *distinct customers*, not with the page
  size. Invisible at 4,877 orders; at 50,000 orders with tens of thousands of distinct phones the
  memoize hit rate collapses and every page of the list pays it.
- **Reach:** 4 · **Impact:** 3 · **Confidence:** 0.9 · **Effort:** 2
- **SEVERITY: 3 × 4 × 0.9 = 10.8** · **PRIORITY: 10.8 / 2 = 5.4**
- **Fix direction:** Add an expression index on `customer_trust (tenant_id, normalize_phone(phone))`,
  mirroring what `orders` already has. `normalize_phone` must be `IMMUTABLE` for that to be legal —
  check first; if it is only `STABLE`, the real fix is a stored normalized column maintained by
  trigger, which is the pattern the customers work already used for phone keying.
- **Risk if fixed:** An expression index on a non-`IMMUTABLE` function will be rejected, or worse,
  silently wrong if the function's behaviour changes. Verify volatility before writing the migration.
- **Confidence note:** 0.9 — the plan and the index list are measured; the scale claim is extrapolation.

---

### F-D7-01 — The cart's primary CTA is disabled but renders identically to an enabled one

- **Dimension:** D7
- **Location:** storefront `/s/[tenant]/cart`, order-summary block
- **Profile:** **P-mobile**, screenshot `tmp/audit/d7-cart-empty.png`
- **Evidence:** On an empty cart the "متابعة الدفع" (Proceed to payment) button is genuinely disabled —
  and nothing about its appearance says so:

  ```
  tag: BUTTON   disabled: true   aria-disabled: null
  opacity: "1"  pointerEvents: "auto"
  ```

  In the screenshot it is the largest, highest-contrast element on the page: full brand yellow, full
  opacity, identical to every enabled primary CTA in the storefront.
- **Repro:** Open `/s/scheniders-iraq/cart` empty at 390×844 and tap the yellow button.
- **User impact:** A shopper taps the most prominent control on screen and nothing happens — no
  movement, no message, no reason. That reads as "the site is broken", not "my cart is empty", and it
  is on the conversion path.
- **Reach:** 4 · **Impact:** 3 · **Confidence:** 1.0 · **Effort:** 1
- **SEVERITY: 3 × 4 × 1.0 = 12** · **PRIORITY: 12 / 1 = 12.0**
- **Fix direction:** Give the disabled state a visible treatment and set `aria-disabled` alongside the
  native property. Better on this screen: when the cart is empty the checkout CTA has no reason to
  render at all — the empty state should own the surface.
- **Risk if fixed:** Muting the button changes the visual weight of the order-summary card on a
  populated cart too, if the styling is shared. Check both states.

---

### F-D7-02 — The empty cart tells the shopper to keep shopping and gives them no way to do it

- **Dimension:** D7 (with D9)
- **Location:** storefront cart empty state
- **Profile:** P-mobile, same screenshot
- **Evidence:** The empty state reads `سلتك فارغة — تابع التسوّق.` ("your cart is empty — continue
  shopping"). It is an icon and a sentence, with **no interactive child in the card**. The card's whole
  job is to recover the session and it offers no control to do it. A `متابعة` button does exist — in
  the sticky bottom bar beside `تواصل`, detached from the message that asks for it and styled as
  generic chrome rather than as the answer to the empty state.
- **Repro:** Open `/s/scheniders-iraq/cart` empty; inspect the empty-state card for interactive children.
- **User impact:** The copy names an action and withholds it. On mobile the shopper's only way back to
  the catalogue is the 40×40 hamburger in F-D7-03. It is a dead end on a page reached with intent to buy.
- **Reach:** 4 · **Impact:** 3 · **Confidence:** 1.0 · **Effort:** 1
- **SEVERITY: 3 × 4 × 1.0 = 12** · **PRIORITY: 12 / 1 = 12.0**
- **Fix direction:** Put the primary action inside the empty state, pointing at the catalogue or a
  best-sellers rail. An empty state is a recovery surface, not a notice.
- **Risk if fixed:** None material.

---

### F-D7-03 — Four controls are below the 44 px touch target, including the only mobile nav affordance

- **Dimension:** D7 / D10
- **Location:** storefront header and footer
- **Profile:** P-mobile, 390×844
- **Evidence:** Of 48 rendered interactive elements on the PDP, by `getBoundingClientRect()`:

  | control | size |
  |---|---|
  | `menu` (hamburger) | **40 × 40** |
  | `شنايدر` (logo → home) | **109 × 40** |
  | newsletter email input | **318 × 42** |
  | `اشترك` (newsletter submit) | **318 × 40** |

  Excluded after checking: `من نحن` is exactly 44 × 44 (passes); `أضف صور (حتى 4)` at 1 × 1 is a
  visually-hidden file input, the normal pattern. This is touch-target sizing — mobile usability, not
  the keyboard-a11y work that is out of scope.
- **Repro:** `getBoundingClientRect()` sweep over `button, a[href], input, select, textarea` at 390×844.
- **User impact:** The hamburger is the single entry point to navigation on a phone and is 4 px short
  in both axes. A mis-tap there is a mis-tap on the only way to move around the store.
- **Reach:** 5 · **Impact:** 2 · **Confidence:** 1.0 · **Effort:** 1
- **SEVERITY: 2 × 5 × 1.0 = 10** · **PRIORITY: 10 / 1 = 10.0**
- **Fix direction:** Pad to 44 × 44 without changing the drawn glyph — tap target and icon need not be
  the same size. The newsletter pair is 2–4 px short and is a padding change.
- **Risk if fixed:** Growing header controls can shift header height; check the sticky header and the
  countdown bar above it.

> **What D7 found working, stated because an audit that only lists faults is not a measurement:** the
> PDP direct-order form is genuinely well built. Submitted empty, it responds in **14.9 ms** against a
> 100 ms budget, marks all 4 invalid fields with `aria-invalid="true"`, attaches 4 `role="alert"`
> messages, and moves focus to the first error. That is the correct pattern and needs no work. The
> quantity stepper also carries a correct `disabled` affordance at quantity 1.
>
> Three D7 hypotheses failed verification and were discarded rather than filed: that `shopping_bag`
> rendered as literal text (it is normal ligature-font text content; the glyph draws correctly), that
> the empty cart offered an actionable checkout button (it is disabled — the real defect is smaller and
> is F-D7-01), and a `:focus-visible` coverage gap (real, but keyboard focus styling is explicitly out
> of scope). Full working in `tmp/audit/ROUND1-D7.md`.

---

### F-D9-03 — 33 routes share 6 error boundaries and no not-found boundary

- **Dimension:** D9
- **Location:** `apps/platform/app/**`
- **Profile:** n/a (code-structural)
- **Evidence:** `error.tsx` exists at `/`, `/customers`, `/orders`, `/products`, `/store/edit`, plus a
  root `global-error.tsx` — **6 total for 33 routes**. `find app -name "not-found.tsx"` returns **0**.
  Routes with no boundary of their own include `/finances`, `/salaries`, `/reports`, `/analytics`,
  `/vault`, `/settings`, `/settings/team`, `/printing`, `/team`, `/returns/scan`, `/admin/data-import`.
- **Repro:** `cd apps/platform && find app -name "error.tsx" -o -name "global-error.tsx" | wc -l` → 6.
- **User impact:** A throw inside `/finances` or `/salaries` escapes to the root boundary, so instead of
  a recoverable page-level error the merchant loses the whole application frame. With no
  `not-found.tsx`, a bad URL gets the framework default rather than anything of this product's.
- **Reach:** 4 · **Impact:** 3 · **Confidence:** 1.0 · **Effort:** 2
- **SEVERITY: 3 × 4 × 1.0 = 12** · **PRIORITY: 12 / 2 = 6.0**
- **Fix direction:** A shared error component parameterised per route, plus a `not-found.tsx` at the
  root. The bar is that the merchant can recover — retry and navigate away — without reloading.
- **Risk if fixed:** A page-level boundary catches errors that currently reach Sentry via the root. Make
  sure the new boundaries still report, or errors go quiet.

---

### F-D4-03 — 112 foreign keys have no covering index

- **Dimension:** D4
- **Location:** Supabase advisor `unindexed_foreign_keys`
- **Profile:** P-scale
- **Evidence:** `get_advisors(type: "performance")` returns `unindexed_foreign_keys` with **count 112**.
  Worst tables: `account_link_tokens` 3, `admin_employee_commissions` 3, `performance_bonuses` 3,
  `qc_quarantine` 3, `salary_advances` 3, `salary_penalties` 3, then 2 each on `chat_conversations`,
  `chat_messages`, `chat_pins`, `customer_tag_assignments`, `delivery_import_items`,
  `follow_up_reminders`, `order_notes`, `product_batches`.
  Sample: *"Table `public.access_requests` has a foreign key `access_requests_reviewed_by_fkey` without
  a covering index."*
- **Repro:** `mcp__supabase__get_advisors(type: "performance")`, filter `name = 'unindexed_foreign_keys'`.
- **User impact:** Joins across these keys scan rather than seek, and cascading deletes scan the child
  table. Salary and commission screens are the most exposed — six of the worst tables are payroll.
- **Reach:** 4 · **Impact:** 3 · **Confidence:** 1.0 · **Effort:** 2
- **SEVERITY: 3 × 4 × 1.0 = 12** · **PRIORITY: 12 / 2 = 6.0**
- **Fix direction:** Not all 110 are worth an index — an index has a write cost, and F-D4-05 shows 82
  indexes already earning nothing. Rank by table size and actual join traffic, index the ones that are
  joined or cascaded in practice, and record why the rest were left.
- **Risk if fixed:** Each index slows writes on a table that F-D4-01 shows is already trigger-heavy.

---

### F-D4-04 — 57 table/role/action combinations carry multiple permissive policies, each evaluated per row

- **Dimension:** D4
- **Location:** Supabase advisor `multiple_permissive_policies`
- **Profile:** P-scale
- **Evidence:** WARN, **count 57**. Six apiece on `chat_message_reactions`, `chat_pins`,
  `chat_user_status`, `industries`, `order_reasons`, `tenant_members`, `user_profiles`; 2 on
  `product_categories`; 1 each across `categories`, `product_attribute_defs`,
  `product_attribute_values`, `product_bundle_items`, `product_images`, `product_order_bumps`.
  Sample: *"Table `public.categories` has multiple permissive policies for role `authenticated` for
  action `SELECT`. Policies include `{public_storefront_read_categories,tenant_isolation_select}`."*
- **Repro:** `mcp__supabase__get_advisors(type: "performance")`, filter `name = 'multiple_permissive_policies'`.
- **User impact:** Postgres must evaluate every permissive policy for every row, so these tables pay
  double or worse on each read. `user_profiles` and `tenant_members` are on the critical path of nearly
  every request.
- **Reach:** 4 · **Impact:** 3 · **Confidence:** 1.0 · **Effort:** 3
- **SEVERITY: 3 × 4 × 1.0 = 12** · **PRIORITY: 12 / 3 = 4.0**
- **Fix direction:** Where two policies express one intent — the `categories` pair is storefront-read
  OR tenant-isolation — a single policy with an `OR` predicate is one evaluation instead of two. This
  is security-rule surgery and belongs with F-D4-02 in one carefully tested change.
- **Risk if fixed:** Same as F-D4-02: merging permissive policies can widen access if the `OR` is
  written loosely. Every merge needs a positive and negative test.

---

### F-D10-02 — The platform disables pinch-zoom for every user on every page

- **Dimension:** D10
- **Location:** `apps/platform/app/layout.tsx:70-78`
- **Profile:** P-mobile
- **Evidence:**

  ```tsx
  export const viewport: Viewport = {
    …
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: "cover",
  };
  ```

- **Repro:** Open any platform route on a phone and attempt to pinch-zoom.
- **User impact:** A merchant cannot zoom in on a phone number, an address or a small figure in a dense
  table. On the orders and finances screens — dense tables at 10 px on a 390 px viewport — this is the
  difference between reading a value and not. Users with any degree of low vision lose the browser's
  own remedy. (This is a mobile-usability finding, not the keyboard-a11y work that is out of scope.)
- **Reach:** 4 · **Impact:** 3 · **Confidence:** 1.0 · **Effort:** 1
- **SEVERITY: 3 × 4 × 1.0 = 12** · **PRIORITY: 12 / 1 = 12.0**
- **Fix direction:** Remove `maximumScale` and `userScalable`. These are usually added to stop iOS
  auto-zooming on focused inputs; the actual fix for that is a ≥16 px font size on the inputs, which
  costs nothing and does not take zoom away from everyone.
- **Risk if fixed:** If any input is under 16 px, iOS will auto-zoom on focus and the layout will jump.
  Audit input font sizes in the same change.

---

### F-D4-06 — `get_orders_aggregates` scans the tenant's whole order book three times, once of it through a JSONB lateral

- **Dimension:** D4
- **Location:** `public.get_orders_aggregates`; called from `apps/platform/hooks/use-orders-aggregates.ts:51`
- **Profile:** P-scale
- **Evidence:** The function body contains three independent passes over `public.orders` filtered only
  by tenant: the `scope` CTE, then `city_opts`, then `product_opts` — the last one being

  ```sql
  FROM public.orders o,
       jsonb_array_elements(CASE WHEN jsonb_typeof(o.items)='array' THEN o.items ELSE '[]'::jsonb END) it
  WHERE o.tenant_id = _tenant_id AND o.is_archived = false AND o.deleted_at IS NULL
  ```

  which expands every line item of every order the tenant has ever placed, on every call. For this
  tenant that is 4,877 rows and 1,555 kB of `items` JSONB. `city_opts` and `product_opts` ignore the
  date and filter arguments entirely, so narrowing the filter does not narrow their work. The hook
  calls it on every filter change with `staleTime: 30_000`.
- **Repro:** `EXPLAIN` the `product_opts` CTE against `b5c4f2d4-834f-4af4-822d-9b9826a8f45a`.
- **User impact:** Every change of a filter chip on the orders page triggers a full expansion of the
  tenant's line-item history to rebuild a dropdown list. It is the slowest thing on the page, and the
  page has no `loading.tsx` (F-D5-01) to cover it.
- **Reach:** 4 · **Impact:** 3 · **Confidence:** 0.95 · **Effort:** 3
- **SEVERITY: 3 × 4 × 0.95 = 11.4** · **PRIORITY: 11.4 / 3 = 3.8**
- **Fix direction:** The filter option lists are not aggregates of the current filter — they are the
  tenant's distinct cities and product names, which change rarely. They belong in their own cached
  query, or a small maintained table, not recomputed on every filter change. That alone removes two of
  the three passes.
- **Risk if fixed:** The function's doc comment states it deliberately reproduces prior client-side
  semantics so no number the merchant sees changes. Any restructuring must preserve that; the parity
  helper at `apps/platform/lib/order-aggregate-parity.ts` exists for exactly this and should be the test.
- **Confidence note:** 0.95 — the three passes are read directly from `pg_get_functiondef`; the
  end-to-end user-visible timing was not measured, because the available session returns 403 from this
  RPC (§5).

---

### F-D2-05 — The "all orders" view downloads 13 MB of row data

- **Dimension:** D2
- **Location:** `apps/platform/lib/repositories/order-repository.ts:78-133` (`findAll`)
- **Profile:** P-scale
- **Evidence:** For `b5c4f2d4-834f-4af4-822d-9b9826a8f45a`:

  | metric | value |
  |---|---:|
  | active (non-archived) rows | 4,877 |
  | serialized size of those rows | **13 MB** |
  | default 1-day window | 4 rows / 11 kB |
  | `items` JSONB alone | 1,555 kB |
  | rows across all tenants | 22,943 |

  `LIST_VIEW_COLUMNS` is 38 columns including `items`, `risk_data`, `attention_reasons`, `notes`,
  `internal_notes` and `address_details`. `findAll` pages at `step = 1000` in parallel and merges with
  `allData = [...allData, ...data]` **inside** the loop, reallocating the accumulated array on each page.
- **Repro:** `select pg_size_pretty(sum(pg_column_size(to_jsonb(o)))::bigint) from orders o where tenant_id = '…' and is_archived = false;`
- **User impact:** Selecting "all orders" downloads 13 MB. On Iraqi mobile data that is both a long wait
  and real money.
- **Reach:** 3 · **Impact:** 4 · **Confidence:** 1.0 · **Effort:** 3
- **SEVERITY: 4 × 3 × 1.0 = 12** · **PRIORITY: 12 / 3 = 4.0**
- **Fix direction:** `findWindow` is the default path and is correctly narrow — this finding is only
  about the unwindowed fallback. The comment in `findWindow` explains, correctly, why a bare `.limit()`
  would be wrong: the list would silently disagree with its own server-computed counts. Virtualized
  paging that keeps the counts server-side preserves that guarantee without the download. The
  quadratic array merge should become a single `flat()` regardless.
- **Risk if fixed:** The list and the status chips must not be able to disagree. That invariant is the
  reason the current code downloads everything, and it has to survive.
- **Note:** A previous audit's "the orders page downloads the whole book" finding is **partly obsolete** —
  `findWindow` landed and the default view now costs 11 kB. Re-verified rather than carried forward.

---

### F-D9-01 — A user whose account is deactivated gets a fully rendered dashboard reporting zero revenue

- **Dimension:** D9
- **Location:** `public.get_user_tenant_ids()`; consumed by every gated SECURITY DEFINER RPC. UI at `apps/platform/app/page.tsx` and `apps/platform/components/auth/role-guard.tsx`
- **Profile:** P-desktop — screenshot `scratchpad/shot-dashboard-desktop.png`
- **Evidence:** `get_user_tenant_ids()` filters on `coalesce(up.is_active, true)`:

  ```sql
  SELECT tm.tenant_id FROM tenant_members tm
  JOIN user_profiles up ON up.id = tm.user_id
  WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND coalesce(up.is_active, true);
  ```

  For a user with `user_profiles.is_active = false` it returns nothing, so every RPC gated on it raises
  `42501` and PostgREST answers 403. Observed live on one dashboard load: `rpc/get_orders_aggregates`
  ×3, `notification_settings` upsert ×2, `activity_logs` POST ×1 — 7 requests in the 4xx/5xx range.
  Meanwhile the user remains signed in, `tenant_members.status` is still `'active'`, and the UI renders
  completely: IQD 0 revenue, 0 orders, 0 in every pipeline stage, and a delivery-rate card printing a
  bare `%` with no number. **No error is shown anywhere.**
- **Repro:** Sign in as a user with `user_profiles.is_active = false`; open `/`; observe a full dashboard
  of zeros and 403s in the network log.
- **User impact:** This does not read as "you have been deactivated". It reads as "your business did
  zero today". A merchant would act on that — chase staff, check integrations, doubt the product —
  before suspecting a permission flag. Confidently displaying wrong data is worse than an error screen,
  because an error screen can be argued with.
- **Reach:** 2 · **Impact:** 5 · **Confidence:** 1.0 · **Effort:** 2
- **SEVERITY: 5 × 2 × 1.0 = 10** · **PRIORITY: 10 / 2 = 5.0**
- **Fix direction:** Deactivation must be a first-class state, not an absence of rows. The session
  should end, or the app should render an explicit "account deactivated" screen. Separately, a query
  that 403s must never render as a zero — the dashboard should distinguish "no data" from "not allowed
  to see data", and it currently cannot.
- **Risk if fixed:** Ending sessions on `is_active = false` will log out anyone currently in that state.
  Check who that is before shipping.
- **Reach note:** Reach 2 reflects how rarely an account is deactivated. Impact is 5 because the failure
  mode is silent data falsification on a financial surface.

---

### ~~F-D3-06~~ — WITHDRAWN IN ROUND 3: this finding was wrong

**Deleted, not demoted.** Round 1 claimed `turbo.json` `tasks.build.env` declares 7 variables and omits
`NEXT_PUBLIC_SENTRY_DSN` and `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. On the audited tree it declares **15,
including both** (`turbo.json:22` and `:30`). The omission was fixed in an ancestor of `3c0f0cb3`.

**How it happened, because the mechanism matters more than the error:** `turbo.json` was read from
`/Users/ali/scheniders-mono` — the working branch, 171 commits behind `origin/main` — at the very start
of the session, *before* the audit worktree existed. The finding was then written against the audited
tree without re-reading the file there. The worktree was created specifically to avoid auditing stale
code, and a read that predated it defeated that.

This is the second finding in this ledger whose evidence was not read from the audited tree at the time
of writing (F-D9-04 is the other). Round 2 asserted F-D9-04 was "the one". It was not.

**Lesson for Round 4 and for Phase 2:** every quoted artifact must be re-read from the audited worktree
at the moment the finding is written. Nothing carried from memory, from an earlier tree, or from a
prior audit survives without a fresh read.


### F-D9-04 — Errors are swallowed in seven places, which the repo's own rules forbid

- **Dimension:** D9
- **Location:** listed below
- **Profile:** n/a (code-structural)
- **Evidence (CORRECTED in Round 2 — the Round 1 numbers were wrong in both directions):** The stated
  repro returns **15 lines, not 21**, and one of those (`inline-edit-cell.tsx:52`) is a *comment*
  mentioning `catch {}` — so **14 real matches**. Round 1 reached 21 by folding in four
  `.catch(() => {})` promise handlers in `app/api/chat/unfurl/route.ts:144,149,155,184`, which the
  quoted regex structurally cannot match; that is a different syntax, and there are in fact **6** of
  them, not 4. The corrected split is **6 legitimate + 8 real swallows**, not 14 + 7 — so the
  **exonerated bucket was inflated and the defect count is higher than Round 1 reported.**
  **6 are legitimate** — `localStorage` writes, which throw in private browsing and correctly degrade
  (`components/salary/salaries-tab.tsx:320,329`,
  `components/orders/virtualized-order-table.tsx:690,706`,
  `components/providers/language-provider.tsx:49,62`).
  **8 are real swallows** of operations that can fail meaningfully:

  ```
  app/customers/[phone]/page.tsx:308                  } catch {}
  components/products/supplies-tab.tsx:91,98,106,115  } catch {}
  components/products/supplies/actions-feed.tsx:112,120 } catch {}
  components/orders/virtualized-order-table.tsx:34    } catch {}
  ```

  `CLAUDE.md` lists swallowed `try/catch` first among banned patterns. Precedent exists in the file
  tree: `components/orders/table/inline-edit-cell.tsx:52` carries the comment *"Was a bare `catch {}`:
  the edit failed, the operator saw a generic…"* — the same defect, already found and fixed once.
- **Repro:** `grep -rnE "catch\s*\{\s*\}" app components lib hooks | grep -v '\.test\.'`
- **User impact:** On the supplies tab a failed write leaves the UI showing the operation succeeded.
  The merchant believes stock was recorded when it was not, and nothing anywhere records the failure.
- **Reach:** 3 · **Impact:** 3 · **Confidence:** 1.0 · **Effort:** 2
- **SEVERITY: 3 × 3 × 1.0 = 9** · **PRIORITY: 9 / 2 = 4.5**
- **Fix direction:** Each of the seven needs the treatment `inline-edit-cell.tsx` already received:
  surface it to the user and report it. The 14 storage guards should be a single named helper so the
  legitimate pattern stops resembling the banned one and a lint rule can forbid the rest.
- **Risk if fixed:** Newly surfaced errors may be frequent and benign, turning a silent bug into toast
  noise. Check rates before choosing the surface.
- **Accuracy note (Round 2):** Round 1 reported "21 = 14 legitimate + 7 real" and presented a repro
  command that cannot produce 21. Independently re-run, the truth is **14 = 6 + 8**. This is the one
  finding in the ledger whose evidence was assembled by hand and then back-labelled with a command that
  does not generate it. The conclusion was directionally right; the arithmetic and the repro were not,
  and the error made the product look *better* than it is. Caught by the Round 1 critic.

---

### F-D3-04 — The platform build ignores TypeScript errors

- **Dimension:** D3
- **Location:** `apps/platform/next.config.ts:46-48`
- **Profile:** n/a (code-structural)
- **Evidence:**

  ```ts
  typescript: {
    ignoreBuildErrors: true,
  },
  ```

  **Verified: no errors are currently being hidden.** `pnpm type-check` on `origin/main` exits 0 across
  all 8 packages. CI runs `turbo lint type-check build`, so `type-check` is a separate gate that still
  bites. The defect is the removed safety net, not a present failure — and `apps/storefront`, which does
  not set this, is the demonstration: its build fails outright on a type error.
- **Repro:** `cd /Users/ali/scheniders-mono-sotaperf && pnpm type-check` → exit 0.
- **User impact:** None today. The consequence is future: a type error can reach a production build
  through any path that does not run the separate `type-check` task — a local `next build`, a Vercel
  build configured without it, or a change to the CI command.
- **Reach:** 3 · **Impact:** 3 · **Confidence:** 1.0 · **Effort:** 1
- **SEVERITY: 3 × 3 × 1.0 = 9** · **PRIORITY: 9 / 1 = 9.0**
- **Fix direction:** Delete the block. Since `type-check` already passes, this is a no-op today and
  restores the guarantee permanently.
- **Risk if fixed:** If it was added to work around a generated-type issue that recurs intermittently,
  removing it will surface that. It passes now; watch the next few builds.

---

### F-D5-02 — The orders empty state shows a loading spinner and "no orders found" at the same time

- **Dimension:** D5 (with D9)
- **Location:** orders list empty state — screenshot `scratchpad/mob-pf-orders.png`
- **Profile:** P-mobile (390×844)
- **Evidence:** The rendered page shows a spinner glyph directly above the heading `لا توجد طلبات`
  ("no orders") and the line `لم يتم العثور على طلبات تطابق معايير البحث` ("no orders matching your
  search criteria"). Loading and empty are mutually exclusive states being rendered together.
  At desktop width the same screen reads `No matching orders / Try adjusting your search or filters. /
  Active filters applied` — while the actual cause was three `get_orders_aggregates` 403s (F-D9-01).
- **Repro:** Open `/orders` with no matching rows at 390×844.
- **User impact:** The merchant cannot tell whether the page is still working or has finished and found
  nothing. When the real cause is a permission error, the copy actively misdirects — it blames filters
  the user did not set.
- **Reach:** 3 · **Impact:** 3 · **Confidence:** 1.0 · **Effort:** 2
- **SEVERITY: 3 × 3 × 1.0 = 9** · **PRIORITY: 9 / 2 = 4.5**
- **Fix direction:** Make the state explicit — loading, empty, empty-because-filtered, and error are
  four states, not two booleans. "Active filters applied" must only appear when filters are actually
  applied, and a failed query must render as an error, never as an empty result.
- **Risk if fixed:** Low. Distinguishing error from empty depends on the query layer propagating failure
  rather than returning `[]`, which may need changes at the hook level.

---

### F-D4-05 — 85 indexes have never been used

- **Dimension:** D4
- **Location:** Supabase advisor `unused_index`
- **Profile:** P-scale
- **Evidence:** INFO, **count 85**. By table: `leads` 12, `waseet_regions` 3, `chat_conversations` 3,
  `admin_activity_logs` 2, `chat_messages` 2, `lead_follow_ups` 2, `orders` 2, `customer_filter_presets` 2,
  `print_batches` 2, `waseet_api_logs` 2, `admin_employee_tracking` 2, `admin_employee_commissions` 2,
  `categories` 2, `qc_quarantine` 2, and others.
  Sample: *"Index `idx_admin_notes_tenant_id` on table `public.admin_notes` has not been used."*
- **Repro:** `mcp__supabase__get_advisors(type: "performance")`, filter `name = 'unused_index'`.
- **User impact:** Indirect. Each unused index is maintained on every write — and `orders`, which has
  two of them, is the most written table in the product and already carries 12 triggers (F-D4-01).
- **Reach:** 4 · **Impact:** 2 · **Confidence:** 1.0 · **Effort:** 1
- **SEVERITY: 2 × 4 × 1.0 = 8** · **PRIORITY: 8 / 1 = 8.0**
- **Fix direction:** "Never used" is measured since the last statistics reset, so an index serving a
  monthly report can look unused. Confirm `pg_stat_reset` timing before dropping anything, then start
  with the two on `orders` where the write cost is highest. Pair this with F-D4-03 — the same exercise
  decides what to add and what to drop.
- **Risk if fixed:** Dropping an index that serves a rare but important query turns it into a table scan,
  and nobody notices until the report is run.

---

### F-D8-02 — Eighteen files define their own order-status colour map

- **Dimension:** D8
- **Location:** 18 files, including `components/customers/shared/customer-status-badge.tsx`,
  `components/dashboard/order-card.tsx`, `components/mobile/orders/MobileOrderCard.tsx`,
  `components/orders/order-confirmation-card.tsx`, `components/reports/status-flow-diagram.tsx`,
  `components/reports/batch-analytics.tsx`, `components/products/stock-indicator.tsx`,
  `components/products/purchase-orders/po-list.tsx`, `lib/pdf-report-generator.ts`
- **Profile:** n/a (code-structural)
- **Evidence:** `grep -rln 'statusColors\|STATUS_COLORS\|statusConfig\|STATUS_CONFIG\|getStatusColor\|statusStyles' app components lib`
  returns **18** files. Order status is a closed enum with a fixed set of values; there are 18 opinions
  about what colour each one is, including one inside the PDF generator.
- **Repro:** the `grep -rln` above.
- **User impact:** "confirmed" is not reliably the same colour on the orders list, the dashboard card,
  the mobile card and the exported PDF. Status colour is the fastest signal on these screens, and it is
  only a signal if it is stable.
- **Reach:** 4 · **Impact:** 3 · **Confidence:** 1.0 · **Effort:** 3
- **SEVERITY: 3 × 4 × 1.0 = 12** · **PRIORITY: 12 / 3 = 4.0**
- **Fix direction:** One exported map keyed by the status enum, in `packages/ui` or `packages/shared`,
  consumed everywhere including the PDF generator. Adding a status should then be one edit rather than
  eighteen, which is the deeper win.
- **Risk if fixed:** Consolidating will change colours on some screens. Compare the 18 maps first — the
  differences are the design decision, and some may be deliberate (a report may need print-safe colours).

---

### F-D2-06 — 130 queries select every column

- **Dimension:** D2
- **Location:** 130 sites across `app/`, `components/`, `hooks/`, `lib/`
- **Profile:** n/a (code-structural)
- **Evidence:** `grep -rn "select(['\"]\*['\"]" app components hooks lib | grep -v '\.test\.'` returns
  **130**. Highest-value examples:

  ```
  app/customers/[phone]/page.tsx:44,50,57
  app/api/delivery-import/match/route.ts:70,73,76   supabaseAdmin.from("orders").select("*")…
  app/api/cron/auto-follow-up/route.ts:56
  components/customers/customer-profile-panel.tsx:47,56
  app/settings/team/page.tsx:320
  ```

  The `delivery-import/match` calls select every column of `orders` filtered only by an id list or
  `is_return`, using the service-role client.
- **Repro:** the `grep` above.
- **User impact:** Wasted bytes on every affected screen, and on `orders` those columns include the
  heavy JSONB blobs measured in F-D2-05. The customer detail page makes three `select("*")` calls to
  render one profile.
- **Reach:** 4 · **Impact:** 3 · **Confidence:** 0.9 · **Effort:** 3
- **SEVERITY: 3 × 4 × 0.9 = 10.8** · **PRIORITY: 10.8 / 3 = 3.6**
- **Fix direction:** Name columns at the sites that read wide tables — `orders`, `products`,
  `user_profiles`, `customer_aggregates` — and leave narrow config tables alone. Generated Supabase
  types make the column lists checkable rather than guesswork.
- **Risk if fixed:** An omitted column arrives as `undefined` rather than as an error. This repo has
  been bitten by exactly that: `EXPORT_VIEW_COLUMNS` carries a comment recording that a missing
  `validated_governorate_code` made every export silently fall back to the raw code.
- **Confidence note:** 0.9 — the count is exact; that all 130 are over-fetches is not verified
  site-by-site, and some narrow tables legitimately want every column.

---

### F-D4-07 — Seven SECURITY DEFINER functions have a mutable `search_path`

- **Dimension:** D4
- **Location:** `get_current_tenant_id`, `is_tenant_admin`, `get_customer_percentile`,
  `get_customer_score_audit_log`, `get_customer_trust_history`, `increment_order_usage`, `qc_log_status_change`
- **Profile:** P-scale
- **Evidence (REASONING CORRECTED in Round 2 — Round 1 tested the wrong privilege):** All seven return
  `proconfig IS NULL`. Round 1 declared this safe because neither `authenticated` nor `anon` can
  `CREATE` in `public`, `extensions` or `graphql_public`. **That is the wrong attack surface.**
  PostgreSQL searches **`pg_temp` first** for relation names, and creating a temp table requires the
  database-level `TEMPORARY` privilege, not schema `CREATE`. Tested:

  ```sql
  select has_database_privilege('authenticated', current_database(), 'TEMP'),
         has_database_privilege('anon',          current_database(), 'TEMP');
  → auth_temp = true,  anon_temp = true
  ```

  **Both roles hold it.** Round 1 also checked schema-qualification on only 2 of the 7. Reading all
  seven: **3 carry unqualified relation references** —

  ```sql
  get_customer_trust_history    …  FROM customer_trust_audit_log     -- unqualified
  get_customer_score_audit_log  …  FROM customer_trust_audit_log     -- unqualified
  get_customer_percentile       …  FROM customer_trust ct            -- unqualified
  ```

  each SECURITY DEFINER, mutable path, `EXECUTE` granted to `authenticated`. `increment_order_usage`
  and `qc_log_status_change` **are** properly qualified (`public.usage_tracking`,
  `public.qc_quarantine_events`), as are `get_current_tenant_id` and `is_tenant_admin`.
  **The conclusion "not exploitable today" survives, but for a reason Round 1 never identified:**
  PostgREST exposes RPC calls and not arbitrary DDL, so a REST client cannot issue
  `CREATE TEMP TABLE` in the session that then calls the function. That control, not the schema-CREATE
  check, is what is actually holding.
- **Repro:** the `has_database_privilege(... 'TEMP')` query above, plus `pg_get_functiondef` on all seven.
- **User impact:** None today, and the defence is a property of the API layer rather than of the
  database — which is a thinner guarantee than Round 1 implied. Three of the seven read customer trust
  and audit data; two of the remaining four decide who is an admin and which tenant you are in.
- **Reach:** 3 · **Impact:** 3 · **Confidence:** 1.0 · **Effort:** 1
- **SEVERITY: 3 × 3 × 1.0 = 9** · **PRIORITY: 9 / 1 = 9.0**
- **Fix direction:** Add `SET search_path = public` to all seven — `lookup_order` and
  `get_orders_aggregates` already do it, so this is matching existing practice and is purely additive.
  Schema-qualify the three unqualified `FROM` clauses in the same change; the two fixes are independent
  and either alone closes the vector.
- **Risk if fixed:** If a body relies on resolving something outside `public`, pinning breaks it. All
  seven are short; read each before changing it.
- **Round 2 note:** promoted from Severity 4 to 9. Not because a live hole was found — none was — but
  because the stated defence was wrong, and a defence-in-depth finding whose defence is misidentified
  should not be scored as if it were understood. Caught by the Round 1 critic; its claim of "5 of 7
  unqualified" is corrected to **3 of 7** here.

---

### F-D8-03 — A typo'd class name was worked around with inline utilities instead of fixed

- **Dimension:** D8
- **Location:** `apps/platform/components/mobile/dashboard/MobileDashboardCards.tsx:48`
- **Profile:** n/a (code-structural)
- **Evidence:**

  ```tsx
  <div className="paste-card pastel-card-yellow p-4 flex flex-col justify-between h-32 bg-gradient-to-br border border-amber-200/50 from-amber-50 to-amber-100/50 rounded-3xl hover:scale-[1.02] transition-transform shadow-sm">
  ```

  `paste-card` is a typo for `pastel-card`; the other three cards in the same file use
  `className="pastel-card pastel-card-blue …"` and carry none of the extra utilities. The shared class
  never applied, so its gradient, border and radius were re-declared inline to make the card look right.
- **Repro:** Read the four sibling `<div>`s at `MobileDashboardCards.tsx:26-70`.
- **User impact:** Effectively none visually — the workaround restores the appearance. The cost is that
  the card no longer participates in the shared style, so any future change to `pastel-card` will silently
  skip it.
- **Reach:** 3 · **Impact:** 2 · **Confidence:** 1.0 · **Effort:** 1
- **SEVERITY: 2 × 3 × 1.0 = 6** · **PRIORITY: 6 / 1 = 6.0**
- **Fix direction:** Fix the typo and delete the compensating utilities. Verify the rendered card is
  unchanged afterwards — if it is not, `pastel-card-yellow` and the inline gradient disagree, which is
  its own finding.
- **Risk if fixed:** The card's appearance may shift if the shared class differs from the inline
  patch. Compare screenshots.

---

### F-D4-08 — Four tables have RLS enabled and no policies

- **Dimension:** D4 / D9
- **Location:** `account_link_tokens`, `api_rate_limits`, `chat_push_config`, `security_logs`
- **Profile:** P-scale
- **Evidence:** `get_advisors(type: "security")` → `rls_enabled_no_policy`, INFO, count 4.
- **Repro:** `mcp__supabase__get_advisors(type: "security")`.
- **User impact:** This fails **closed**, which is the safe direction — no client role can read or write
  these. The consequence is that any client-side code path touching them silently receives nothing
  rather than an error. `api_rate_limits` is the notable one: if rate limiting is read from a client
  context it is not functioning, and nothing says so.
- **Reach:** 2 · **Impact:** 2 · **Confidence:** 0.9 · **Effort:** 1
- **SEVERITY: 2 × 2 × 0.9 = 3.6** · **PRIORITY: 3.6 / 1 = 3.6**
- **Fix direction:** Confirm each is service-role-only by design and record that intent in a comment;
  where a client path exists, give it an explicit policy. State the decision so the advisor stops being
  re-triaged every audit.
- **Risk if fixed:** Adding a policy where none was intended opens access that is currently closed.
- **Confidence note:** 0.9 — the advisor output is certain; whether each table has a client-side caller
  was not traced.

---

### F-D4-09 — Leaked-password protection is disabled

- **Dimension:** D4
- **Location:** Supabase Auth settings
- **Profile:** n/a
- **Evidence:** `get_advisors(type: "security")` → `auth_leaked_password_protection`, WARN:
  *"Supabase Auth prevents the use of compromised passwords by checking against HaveIBeenPwned.org.
  Enable this feature to enhance security."*
- **Repro:** `mcp__supabase__get_advisors(type: "security")`.
- **User impact:** Merchant staff can set passwords already present in public breach corpora. These
  accounts reach order data and money-moving actions.
- **Reach:** 3 · **Impact:** 3 · **Confidence:** 1.0 · **Effort:** 1
- **SEVERITY: 3 × 3 × 1.0 = 9** · **PRIORITY: 9 / 1 = 9.0**
- **Fix direction:** Enable it in the Supabase Auth dashboard. One setting.
- **Risk if fixed:** Existing users with breached passwords will be blocked at next change, which needs
  a clear error message. It does not invalidate current sessions.

---

### F-D3-05 — Seven TipTap packages are absent from `optimizePackageImports`

- **Dimension:** D3
- **Location:** `apps/platform/next.config.ts:52-77`, `apps/platform/package.json`
- **Profile:** n/a (code-structural)
- **Evidence:** `optimizePackageImports` lists 24 packages and covers the obvious heavy ones
  (`recharts`, `framer-motion`, `xlsx`, `exceljs`, `jspdf`, `html2canvas`, `lucide-react`, `date-fns`).
  It omits all seven TipTap packages — `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`,
  `@tiptap/extension-link`, `@tiptap/extension-placeholder`, `@tiptap/extension-text-align`,
  `@tiptap/extension-underline` — plus `fuse.js`, `qrcode`, `jsbarcode` and `@sentry/nextjs`.
  **TipTap is not in the 778 KB baseline** — strict fingerprinting of `/_not-found`'s 32 chunks for
  `ProseMirror`, `prosemirror-state` and `EditorState` found nothing, so it is already route-split.
  This is therefore about the routes that do load the editor, not about the shell.
- **Repro:** Compare `dependencies` in `apps/platform/package.json` against the
  `experimental.optimizePackageImports` array in `next.config.ts`.
- **User impact:** Bounded and unmeasured — it affects whichever routes mount the rich-text editor.
- **Reach:** 3 · **Impact:** 2 · **Confidence:** 0.7 · **Effort:** 1
- **SEVERITY: 2 × 3 × 0.7 = 4.2** · **PRIORITY: 4.2 / 1 = 4.2**
- **Fix direction:** Add them and measure the affected routes before and after. The gain is unproven
  until measured, which is why confidence is 0.7.
- **Risk if fixed:** `optimizePackageImports` rewrites import paths; a package with side-effectful
  barrel exports can break. Build and smoke-test the editor.
- **Confidence note:** 0.7 — the omission is certain, the benefit is not. Would be promoted by building
  with and without and diffing the editor route's First Load JS.

---

### F-D3-07 — The storefront loads five font families

- **Dimension:** D3
- **Location:** `apps/storefront/app/layout.tsx:1-54` (four `next/font/google` families), `:77-80` (icon font)
- **Profile:** P-mobile
- **Evidence:** Four families via `next/font/google` — `Bricolage_Grotesque`, `DM_Sans`, `Cairo`,
  `Noto_Sans_Arabic` — plus Material Symbols Outlined from Google Fonts. On the home page, fonts
  account for ≈ **547 KB**: 385.1 KB (Material Symbols) + 162.6 KB (a local `.woff2`).
- **Repro:** As F-D3-02; filter `network-requests` for `resourceType = 'Font'`.
- **User impact:** Fonts are ≈ 27% of the 2,003 KiB page. Two Arabic families (`Cairo` and
  `Noto_Sans_Arabic`) and two Latin families are loaded for one storefront.
- **Reach:** 5 · **Impact:** 3 · **Confidence:** 0.85 · **Effort:** 2
- **SEVERITY: 3 × 5 × 0.85 = 12.8** · **PRIORITY: 12.8 / 2 = 6.4**
- **Fix direction:** Establish which families are actually rendered rather than merely declared —
  `next/font` only fetches what is used, so some may cost nothing. The two Arabic families are the
  question to settle first: one should be enough, and the comment at `:40` notes `Noto_Sans_Arabic` is
  already unicode-range subsetted.
- **Risk if fixed:** Dropping a family changes type rendering across the storefront, and per-tenant
  brand kits may reference a specific family. Merchant-facing — see Open Decisions.
- **Confidence note:** 0.85 — the 547 KB is measured, but the attribution of the 162.6 KB `.woff2` to a
  specific family was not resolved, and whether all four are actually rendered was not verified.

---

### F-D10-03 — The mobile orders chip rail is clipped mid-chip with no scroll affordance

- **Dimension:** D10
- **Location:** orders toolbar and status-chip rail — screenshot `scratchpad/mob-pf-orders.png`
- **Profile:** P-mobile (390×844)
- **Evidence:** At 390 px the status-chip row renders `كل الطلبات 0` and `جديد 0` fully, then
  `تم الاتصال` is cut by the right viewport edge, and a further chip fragment is cut at the left edge —
  a `0` with its label off-screen. The toolbar row above shows the same cut at its left edge. Both are
  horizontally scrollable rails, but neither shows a gradient, a fade or a partial-item cue that reads
  as "there is more this way". Confirmed not a layout bug: `document.documentElement.scrollWidth` equals
  `clientWidth` (384/384) on this route, so the rails scroll internally as designed.
- **Repro:** Open `/orders` at 390×844.
- **User impact:** The merchant sees a chip sliced by the screen edge and cannot tell whether it is a
  rendering fault or content to scroll to. Several order statuses are simply not discoverable on a phone.
- **Reach:** 4 · **Impact:** 2 · **Confidence:** 1.0 · **Effort:** 2
- **SEVERITY: 2 × 4 × 1.0 = 8** · **PRIORITY: 8 / 2 = 4.0**
- **Fix direction:** Give both rails an edge affordance — a mask-image fade that appears only when
  overflow exists — and scroll-snap so chips come to rest whole rather than bisected. Padding the rail
  so the first and last chips clear the gutter fixes the left-edge fragment.
- **Risk if fixed:** Scroll-snap can fight momentum scrolling on iOS; test on a real device.

---

## 4. Measurement appendix

The full appendix — every raw number with its profile tag, the extraction method for each, per-route
First Load JS for all 31 platform routes, the complete storefront resource breakdown, the network
tallies, and the DB size queries — is in `scratchpad/MEASUREMENTS.md` and is reproduced in summary in
the findings above. Screenshots referenced: `scratchpad/shot-dashboard-desktop.png`,
`scratchpad/shot-orders-denied.png`, `scratchpad/mob-pf-{dashboard,orders,products,customers,reports,settings}.png`,
`scratchpad/mob-sf-{home,products,cart,checkout}.png`.

Method note for First Load JS: Next.js 16 with Turbopack prints no per-route size table, so sizes were
computed directly — parse each prerendered `.html`, collect every `/_next/static/**.js` referenced in
`<script src>` or `<link href>`, gzip each from disk at level 6, and sum. This measures what the browser
actually downloads on first load and does not depend on the framework reporting it.

---

## 5. Coverage map

### Audited with direct measurement

| Area | Basis |
|---|---|
| Per-route First Load JS, all 31 platform routes | production build, computed from prerendered HTML |
| Platform dashboard vitals | Lighthouse, P-mobile + P-desktop |
| Storefront home, PDP, products, cart, checkout | Lighthouse, P-mobile |
| Storefront resource composition | Lighthouse `network-requests` |
| Dashboard network behaviour | `agent-browser network requests`, 227 requests classified |
| Middleware TTFB | `curl`, 5 runs, authed vs unauthed |
| DB advisors, both types | Supabase MCP — 292 performance findings, 102 security findings |
| `orders` trigger count, table sizes, payload sizes | catalog + `pg_column_size` |
| Boundary inventory (`loading`/`error`/`not-found`) | filesystem, exhaustive |
| Formatter / status-map / token duplication | `grep` with stated counts |
| Horizontal overflow, 7 routes | `scrollWidth` vs `clientWidth` at 390×844 |
| Mobile screenshots, 6 platform + 4 storefront routes | P-mobile viewport |

### Audited by code reading only (no runtime observation)

`order-repository` fetch paths · `get_orders_aggregates` body · `analytics-pixels` strategy ·
`next.config.ts` · `turbo.json` · swallowed-catch sites · `select('*')` sites.

### NOT audited — named gaps

| Gap | Why | Effect on the ledger |
|---|---|---|
| **D7 — platform only** (storefront now covered) | Round 2 measured D7 on the storefront: per-action latency on the PDP form, interaction-state CSS coverage, touch targets, destructive/disabled affordances on the cart. **The merchant app is still untouched** — no latency budget for order status changes, bulk actions, merge/split or delete; no state matrix. Blocked on credentials. | D7 is **partial**, not empty. The platform half remains a named hole. |
| **Storefront checkout success path** | Submitting the checkout form would write a real order to the production database. | Deliberately not exercised. The only D7 path on the storefront left unmeasured. |
| **Authenticated routes with real data** | The only session available (`aa9886955@gmail.com`) has `user_profiles.is_active = false`; every gated RPC 403s and the dashboard renders empty. See F-D9-01. | Every authed timing is a **lower bound**. `/orders` with 4,877 rows, `/customers`, `/reports`, `/finances`, `/products` were never measured under load. |
| **INP** | Requires sustained real interaction on a populated UI. | No INP figure anywhere. D1 is incomplete against its own stated targets. |
| **Field data** | Vercel Web Analytics is **not enabled** (hobby plan) — `get_web_analytics` returns `404 Web Analytics not found`. | No real-user data, and no traffic ranking, so the "top 10 routes by traffic" coverage requirement could not be met. |
| **Production / preview measurement** | Local measurement chosen deliberately. | Numbers exclude real edge, TLS and Iraqi network latency. Production is **worse**, not better. |
| ~~Storefront routes beyond the 5 measured~~ | **CLOSED in Round 2.** | 12 of 12 customer-path routes now measured, 9 of them cold-cache: home, PDP, `/products`, `/categories/[slug]`, `/cart`, `/checkout`, `/checkout/success`, `/search`, `/track`, `/about`, `/faq`, `/policies/returns`. Remaining: `/contact` and `/policies/{privacy,shipping,terms}`, whose results the `/policies/returns` figure makes predictable. |
| **Platform routes never opened** | Session limits and time. | `/store/edit` (the largest route), `/admin/data-import`, `/printing`, `/salaries`, `/vault`, `/returns/scan`, `/products/[id]/edit`, `/customers/[phone]` — no screenshots, no vitals. |
| **First-run / empty-tenant state** | Requires a fresh tenant. | Onboarding and first-run surfaces unaudited. |
| **`apps/admin`** | Out of the stated scope. | Not audited. |
| **`pg_stat_statements`** | Not checked. | No statement-level timing; D4 rests on advisors, the catalog and function bodies. |
| ~~`EXPLAIN` plans~~ | **PARTIALLY CLOSED in Round 2.** | Plans run for the `scope` and `product_opts` CTEs of `get_orders_aggregates` and for the order-list query, producing F-D4-10, F-D4-11 and a correction to F-D4-06. **But `EXPLAIN` via MCP runs without RLS** (§0.5), so index-choice claims are not transferable to production and were excluded. Getting production-representative plans needs a session running as `authenticated` — blocked on the same credentials. |
| **Sentry signal-to-noise** | Not reviewed. | D9 incomplete. |
| **Offline / service-worker behaviour** | Not exercised. | D9 incomplete. `@serwist/next` warns it does not support Turbopack — unexamined. |

---

## 6. Open Decisions register

**Rewritten at the close of Round 3.** OD-1 to OD-5 were written in Round 1; two of them have since
had their premises changed or debunked, and six new decisions emerged. Each is phrased as a choice
with a recommendation, because every one of them blocks work that cannot otherwise start.

### Decide first — these block the most

**OD-6 — P0-SEC-01: how to stop phone numbers reaching Meta.** *(blocks P0-SEC-01, Sev 20)*
The phone is in the `/track` URL, and the Meta pixel reports the full document location.
Options: **(a)** make the tracking lookup a POST, or hold the phone in component state so it never
enters `location` — breaks the chain at its source, and any tracking link already sent with a phone in
it stops working; **(b)** keep the URL and strip the phone before the pixels initialise — fragile, and
the GET to `/api/orders/lookup` still writes it to edge logs; **(c)** gate all pixels behind consent —
correct but much larger, and changes attribution.
**Recommendation: (a) now, (c) as its own piece of work.** (a) is small, removes the defect entirely,
and does not depend on the consent decision. Tell merchants that old tracking links will break — that
is the correct outcome, not a regression.

**OD-7 — ANSWERED AND CLOSED (Round 3).** The experiment was approved and run; see §12. It overturned
two findings and found a one-line change worth ~129 KB per platform route and ~125 KB per storefront
route. **The open form of this decision is now: does every Phase 2 wave carrying a byte or millisecond
target get built and measured before it is scheduled?** Recommendation: **yes** — two of two inferred
findings were wrong when built, one in its cause and one in its magnitude.

*Original text:* **Does a build experiment get approved before Phase 2?** *(blocks pricing every D3 finding)*
Nothing in this ledger has been built. F-D3-08 (Sev 18) is explicitly "one build experiment short of
proof"; F-D3-05's gain is unmeasured; F-D3-01's recovery estimate is inference.
Options: **(a)** run one experiment — make the ~20 static `xlsx`/`jspdf`/`qrcode` imports dynamic,
rebuild, re-diff `/login` — roughly an hour, and it prices the single largest item; **(b)** write Phase 2
on inference and accept that wave sizing is guesswork; **(c)** do nothing further.
**Recommendation: (a).** A plan that cannot say what any item is worth is an inventory, not a plan.

**OD-8 — Fix the bundle analyzer, or accept no instrumentation?** *(blocks F-D3-13 and any CI budget)*
`pnpm analyze` is wired through a `webpack()` hook and Next 16 builds with Turbopack, so it never runs.
The team has had no way to see this bundle, which is plausibly how 850 KB accumulated.
Options: **(a)** rewire to Turbopack's own analysis output, then add a per-route CI budget; **(b)** fix
the analyzer only; **(c)** leave it.
**Recommendation: (a).** Every D3 finding regresses silently without it, and the budget is
unenforceable until the instrument works. This is the prerequisite for all other D3 work.

### Architectural direction

**OD-9 — What is the RSC position?** *(blocks F-ARCH-01, Sev 25)*
30 of 33 platform routes are client components; the storefront is 0 of 20. Two architectures in one
repo, and `/store/edit` + `/store/onboarding` already demonstrate the right one.
Options: **(a)** declare a direction — new routes start as server components, existing ones convert
heaviest-first, opportunistically, over quarters; **(b)** convert a defined set now; **(c)** accept the
platform as a client app and stop filing findings that are downstream of it.
**Recommendation: (a).** (b) is a multi-quarter programme mis-scheduled as a wave; (c) is defensible
but should be chosen deliberately, because a third of this ledger is downstream of that choice and
would then be closed as "working as intended" rather than left open.

**OD-10 — The `packages/sections` barrel.** *(blocks F-D3-11, Sev 23.8)*
61 sections are statically imported so each can self-register; the file's header says this is
deliberate, for deterministic registration order. It is why a policies page costs 286.8 KB.
Options: **(a)** lazy registry keyed on the section types actually present in a page's config —
preserves order explicitly rather than incidentally; **(b)** keep the barrel, add
`optimizePackageImports` and hope tree-shaking reaches it; **(c)** accept it.
**Recommendation: (a), with (b) immediately as a cheap partial.** The header's warning is real and the
deterministic-order guarantee must be preserved explicitly, not assumed.

### Merchant-facing — these are not engineering calls

**OD-2 — Ad pixel strategy.** *(blocks F-D3-03, F-D3-14, and feeds OD-6)* **Premise changed.**
Round 1 framed this as a speed/attribution trade. Since then: the TikTok SDK loads **twice**, total
pixel weight is larger than first measured, an **unidentified** third party (`…run.app/events`,
F-D3-14) receives a beacon per page, and there is **no consent gate at all**.
Options: **(a)** de-duplicate the TikTok SDK only — ~115 KB at zero attribution risk, do this
regardless; **(b)** also defer to `lazyOnload` — reduces reported conversions on bounced sessions
without reducing real ones; **(c)** move to server-side CAPI, for which `lib/capi.ts` has groundwork.
**Recommendation: (a) immediately; (b) only with a week of before/after event counts; (c) is the real
fix.** The merchant should be told what this costs their shoppers in data — ~2 MB per page view on
metered Iraqi mobile, of which ~490 KB is pixels — because that reframes it from a perf trade into a
cost they are paying unknowingly.

**OD-1 — Material Symbols icon font.** *(blocks F-D3-02)* **Premise narrowed.** Round 2 promoted this
on the belief it dominated LCP; Round 3 retracted that — Lighthouse credits render-blocking **0 ms of
LCP** on most routes. It remains a real **FCP** cost (970–996 ms) and leaves every icon invisible until
385 KB lands. Still worth fixing; **no longer the thing to fix first.**
Original options and recommendation below stand.
Inlining ~40 icons as SVG removes 385 KB and the invisible-glyph window. But `MaterialIcon` takes a
free-form name, and `trust_strip`, `pdp_direct_order` and `checkout_form` all accept a Material Symbols
name *as merchant-editable config* — so a fixed subset breaks any icon a merchant picks outside it.
Options: (a) inline a fixed set and constrain the merchant picker to it; (b) subset and self-host,
regenerating when the picker's list changes; (c) keep as-is.
**Recommendation: (a).** A constrained picker is better merchant UX than a free-text icon name, and it
is the only option that removes the request entirely.

**OD-2 — Ad pixel loading strategy (blocks F-D3-03).**
Deferring to `lazyOnload` will reduce reported conversions on bounced sessions without reducing real
ones. Merchants judge ad spend on these numbers.
Options: (a) defer and accept the attribution shift, with a documented before/after comparison;
(b) keep `afterInteractive` and only de-duplicate the TikTok SDK; (c) move to server-side CAPI, which
`lib/capi.ts` already has groundwork for.
**Recommendation: (b) now, (c) as the real fix.** De-duplication is ~115 KB at no attribution risk;
do it immediately and treat the strategy change as its own measured change.

**OD-3 — Storefront font families (blocks F-D3-07).**
Two Arabic families are loaded. Reducing to one changes type rendering across every storefront, and
per-tenant brand kits may name a specific family.
**Recommendation:** establish which families actually render before deciding. This may be a
non-decision if `next/font` is already eliding the unused ones.

**OD-4 — Mobile dashboard: localize or merge (blocks F-D10-01).**
The English strings are a day's work. Merging the parallel mobile tree into responsive components is
weeks and changes a layout merchants have learned.
**Recommendation: localize now, decide the merge separately.** Do not let the large fix block the
small one — but log that a parallel tree guarantees this recurs.

**OD-11 — The two false "free delivery" claims.** *(blocks F-D6-02, Sev 12)*
The cart summary promises free delivery whenever the figure is zero — always true on an empty cart —
against this tenant's real **5,000 IQD** fee. A second instance, the "Free delivery" trust badge, has
been on record as an open merchant decision since **2026-09-11**.
Options: **(a)** sweep every surface that makes a delivery claim and drive them all from the tenant's
configured threshold; **(b)** fix the cart row only; **(c)** change the merchant's actual policy to
match what the store already says.
**Recommendation: (a).** Two independent surfaces already state the same falsehood; a third will
appear. This is a merchant-facing promise, so whoever owns the 5,000 IQD policy should confirm the
intended wording before the sweep.

**OD-12 — The legacy tracking fallback.** *(blocks F-D9-05, Sev 10)*
`track-form.tsx` never calls an API; any input renders a hardcoded timeline including a fabricated
*"Out for delivery — Estimated 3:30–4:30 PM"*. **10 of 11 live tenants** route to it — but 9 of those
are seed/test fixtures, and the only real merchant is the one tenant that is safe. It is latent, not
active: it fires on the first genuine second merchant who onboards without configuring a track page,
which is the default state of every seeded tenant.
Options: **(a)** delete it and let the page say tracking is not configured; **(b)** make it do a real
lookup; **(c)** leave it.
**Recommendation: (a).** A fallback that invents a delivery commitment is worse than no fallback, and
(b) duplicates the V2 tracker that already exists.

**OD-5 — First Load JS budget.** **Premise debunked — rewrite required.**
Round 1 asserted "~200 KB gzip, roughly what Linear and Stripe Dashboard ship". Round 3 research found
**no published measurement exists** for Stripe or Vercel dashboards, and the one Linear teardown says
it ships ~21 MB across hundreds of route chunks — fast by splitting, not by being small. The citable
figure is Addy Osmani / Alex Russell's **130–170 KB gzipped on mobile**. Independently, this ledger's
own verified floor — the 12 chunks common to every platform route — is **172.0 KB gz**.
**Recommendation: adopt ~170 KB as the target**, cite Osmani/Russell, delete the Linear/Stripe
sentence, and note that the internal floor and the published rule of thumb agree within 2 KB — which
is a far stronger argument than the appeal to named products. Apply it to **both** apps: the storefront
ships 1.8–2.1× it and was never measured against it. Wave-1 gate of 350 KB still needs sign-off.

**Original OD-5 text, retained for the record:**
This ledger judges against **200 KB gzip per route**, which is the commonly cited reference-class
target for an application shell and roughly what Linear and Stripe Dashboard ship. The current baseline
is 778 KB. That gap is large enough that the intermediate target matters more than the final one.
**Recommendation:** adopt 200 KB as the goal and **350 KB as the Wave-1 gate**, enforced in CI. Needs
sign-off before it can gate anything.

---

## 7. Critic history

| Round | Ledger score | Product score | Capping axis | Verdict |
|---|---|---|---|---|
| 1 (builder self-assessment) | 5 | ≈ 3.2 | Completeness | Not independently verified. |
| 1 (independent critic) | **4** | **≈ 2.8** | **Completeness** | Self-assessment too generous. Below the gate of 8. |
| 2 (this revision) | *not yet graded* | ≈ 2.8 | Completeness | Critic verdicts folded in; capping-axis work done. Still blocked on credentials. |

### Round 1 critic — axes and what it found

Completeness **4** · Accuracy **6** · Depth **6** · Benchmark parity **5**. Final = lowest = **4**.

Its central charge was not about the gaps Round 1 admitted (D7 empty, authed routes unmeasured) but
about gaps **inside data Round 1 already held**: 23 chunks measured and none opened; `lcp` insight data
collected in every Lighthouse run and never extracted. Both were free. That produced three findings the
builder pass missed entirely — **F-D3-08** (167.2 KB crypto polyfill, 29/31 routes, now third by
severity), **F-D3-09** (69.4 KB bilingual dictionary), and the LCP attribution behind **F-D1-03** — and
it invalidated F-D3-01's fix direction.

It also caught the one place Round 1 constructed rather than measured: **F-D9-04**, whose stated repro
cannot produce its stated number.

**Verification of the critic.** Every material claim was independently re-derived before being
accepted, not taken on its word:

| Critic claim | Outcome |
|---|---|
| 167.2 KB chunk is `crypto-browserify`, on 29/31 routes | **confirmed** — 550,680 bytes; `pbkdf2`×15, `secp256k1`×4, `Buffer`×288; absent only from `_global-error`, `store/v2` |
| i18n dictionary in the `/login` baseline | **confirmed** — `orders.import.title`, `استيراد الطلبات` present |
| F-D9-04 repro returns 15, not 21 | **confirmed** — 14 real matches, 6 + 8 |
| `authenticated`/`anon` hold database `TEMP` | **confirmed** |
| scratchpad was wiped | **confirmed** — only post-restart files survived |
| advisor counts stale (112, 85) | **confirmed** |
| "5 of 7 functions unqualified" | **corrected → 3 of 7** |
| "extract `audits['largest-contentful-paint-element']`" | **corrected** — absent in Lighthouse 13; data is in `lcp-breakdown-insight` |
| "cart 1,743 KiB → 5.5 s vs about 1,761 KiB → 12.3 s falsifies shared-payload" | **corrected** — mixes a warm cart run with a cold about run. All-cold: cart **11.7 s**, about **9.6 s**. The comparison fails, though the instruction behind it was right and produced F-D1-03. |
| CLS 0.05 is a silent house standard | **contested** — 0.05 is the engagement brief's stated D1 target. Half fair: the divergence from the published 0.10 should have been flagged, and `/cart` at 0.0605 passes the published bar. |

The critic also could not deliver **§5 External research** — its research subagent died on a session
rate limit — so OD-5's "~200 KB gz, roughly what Linear and Stripe ship" **remains uncited**, and an
entire proposed CI gate is derived from it. It offered a better internal anchor instead: the 12 chunks
common to every real route total **172.0 KB gz**, so ~200 KB is demonstrably achievable *here*. That is
a stronger argument than the uncited appeal and should replace it. **Open: the external number still
needs a citation or removal.**

### Round 1 process failure

**The planned parallel sweeps did not happen.** Six read-only
subagents were dispatched for D2, D3, D4, D5/D9 and D8. All six accepted their prompt and then produced
nothing — output files stayed at 131 bytes (the prompt echo alone) for over 40 minutes with no tool
activity. Rather than block, D4, D5, D9 and the D2/D3/D8 code sweeps were re-run in the main thread;
every finding above is from direct main-thread work. The loss is real and is not hidden here: **no
independent agent has verified any finding in this ledger, and no adversarial pass has hunted for what
is missing.**

### Round 1 scoring — builder self-assessment vs the critic

The builder's self-assessment is kept for the record. Where it differs from the critic, **the critic's
score stands.**

| Axis | Builder | **Critic** | Why the critic went lower |
|---|---:|---:|---|
| Completeness | 5 | **4** | The damning gaps were not the admitted ones. 23 chunks measured, none opened. LCP insight data collected in every run, none extracted. Both free; both changed conclusions. |
| Accuracy | 8 | **6** | "An 8 should not contain a finding whose repro does not reproduce." F-D9-04's total, split and command are all wrong; "7 real swallows" lists 8; advisor counts stale; 614.9 KB correctly measured but wrongly attributed, propagating into an unexecutable fix. |
| Depth | 7 | **6** | It reaches mechanism where it counts, then "stops exactly one step short at every point where the next step was decisive" — chunk sizes without contents, Lighthouse without LCP element, advisor counts without a single `EXPLAIN`, 63% `"use client"` named and never analysed. |
| Benchmark parity | 6 | **5** | OD-5's ~200 KB anchor is uncited and its corroboration failed. CLS judged at 0.05 against a published 0.10 (**contested** — 0.05 is the brief's target; the divergence should still have been flagged). |

**Round 1 final = lowest axis = 4.** Below the gate of 8.

**Capping axis: Completeness.** The critic's prescribed one-point change was to *open the artifacts
already produced* — attribute the 23 chunks, and extract the LCP element per route. **Both are done in
Round 2** (§0.2, §0.3) and produced F-D3-08, F-D3-09, F-D1-03 and F-D1-04, plus the correction to
F-D3-01's fix direction. D7 has also moved from empty to partially covered.

**What still caps Completeness, and it is not fixable by effort:** no authenticated session with real
data. `/orders` at 4,877 rows, every other authed route, D7 on the merchant app, and any INP figure all
require credentials for `aa988695@gmail.com`, the active `super_admin` on this tenant. The account
supplied for the audit (`aa9886955@gmail.com`) has `user_profiles.is_active = false` and renders an
empty dashboard — which is itself F-D9-01, but it is not a measurement.

**This ledger does not pass the Phase 1 gate.** Round 3 remains. Round 2 should be graded by a **fresh**
critic — the Round 1 critic must not grade its own corrections.

---

## 8. Phase 1 stop report

Three rounds are spent. **Final: Ledger 3 / Product 2.6, against a gate of 8.** Phase 2 does not begin.

### Final axis scores (Round 3, independent critic)

| Axis | Score | Why |
|---|---:|---|
| **Completeness** | **3** | The storefront bundle — Lighthouse's own #1 LCP cause on 5 of 6 routes — was never measured. Four platform routes are structurally invisible to the method used. CSS was excluded by construction. The RSC boundary (30 of 33 platform routes are client components; the storefront is 0 of 20) is a bare statistic, never analysed. |
| **Accuracy** | **4** | Everything counted from bytes and catalog rows reproduces, often to the digit: 614.9 KB / 23 chunks, 903 raw colours, 14 = 6 + 8, 12 triggers, 21 indexes, 13 MB, advisors 43/57. Against that: one withdrawn fabricated finding (F-D3-06), one retracted central conclusion (§0.3), stale numbers left in finding bodies after being corrected in the changelog, and two findings understating by 50 and 141 KiB. |
| **Depth** | **4** | Genuine depth in two places — §0.5 read a query plan, computed the true cardinality and *refused to file* a plausible smoking gun; F-D4-07 replaced a wrong security rationale with a correct one. Elsewhere the same failure recurs at each level: chunks were opened and then grepped rather than read; the LCP element was in the extracted object and missed; no proposed fix was ever built and diffed, so nothing here is priced. |
| **Benchmark parity** | **3** | OD-5's "~200 KB, roughly what Linear and Stripe ship" is folklore — no published measurement exists for Stripe or Vercel dashboards, and the one Linear teardown says it ships ~21 MB across hundreds of route chunks. The citable figure is Osmani/Russell's **130–170 KB gz on mobile**. The budget was never applied to the storefront, which ships 2.1–2.4× it. Every measurement is **n = 1**; a rerun of one route moved 2.45 s. |

**Final = lowest axis = 3.**

### What the audit did establish, and holds up

Stated plainly, because a stop report that reads as pure failure would misrepresent it. These survived
independent recomputation in Round 3, several to the digit:

- The 778 KB gz platform baseline, the 23-chunk / 614.9 KB root-layout delta, and the per-chunk
  attribution table.
- **P0-SEC-01** — customer phone numbers reaching Meta via the `/track` URL. Found in Round 3, chain
  verified end to end, reported out of band.
- **F-D9-01** — a deactivated user gets a confident dashboard of zeros. Traced to one `is_active` flag
  and named by both critics as the most serious product defect in the document.
- The database picture: 12 triggers and 21 indexes per write on `orders`, 13 MB for the unwindowed
  order view, 112 unindexed FKs, 43 per-row RLS re-evaluations, `normalize_phone` confirmed `IMMUTABLE`
  so F-D4-11's fix is available.
- The consistency counts: 10 `formatIQD` redefinitions, 18 status colour maps, 903 raw colour literals.
- D7 on the storefront, including what is *good* — the PDP order form responds in 14.9 ms with four
  `aria-invalid` fields, four `role="alert"` messages and focus moved to the first error.

### The three things that resisted all three rounds

1. **No authenticated session with real data.** The account supplied has `user_profiles.is_active =
   false`, so every gated RPC returns 403 and the dashboard renders empty. `/orders` at 4,877 rows was
   never measured; neither were `/customers`, `/reports`, `/finances`, `/salaries`, `/vault`,
   `/printing`, `/store/edit`, `/products/[id]/edit`, `/customers/[phone]`. No INP figure exists
   anywhere. D7 on the merchant app is untouched. **This alone caps Completeness.**

2. **The measurement method was wrong in ways three rounds did not catch.** It excluded CSS (a 75.5 KB
   gz render-blocking stylesheet on 30 of 31 routes), it could not see four dynamic routes, it covered
   one of two apps, and every figure is a single simulated Lighthouse run with unacknowledged run-to-run
   variance larger than some of the differences it reasons about.

3. **Nothing was ever built.** Not one proposed fix was implemented and re-measured. F-D3-08 is "one
   build experiment short of proof"; F-D3-05 says "the gain is unproven until measured"; F-D3-01's
   recovery estimate is an inference. A 47-finding performance ledger with zero before/after builds
   cannot tell a planner what any of it is worth — which is the difference between an audit and an
   inventory.

### What would be needed to reach 8

In the order that unblocks the most:

1. **Credentials for `aa988695@gmail.com`** — the active `super_admin` on tenant `scheniders-iraq`.
   Nothing else unblocks D7 on the platform, INP, or any authed route under real data volume.
2. **A working bundle analyzer** (F-D3-13). `pnpm analyze` cannot run under Turbopack, so no
   re-measurement and no CI budget is enforceable until it does.
3. **Re-measure with a corrected method**: include CSS, derive dynamic routes from client-reference
   manifests, cover both apps, and report medians of five runs rather than n = 1.
4. **Build one fix and diff it** — make the ~20 static `xlsx`/`jspdf`/`qrcode` imports dynamic, rebuild,
   re-diff `/login`. That single experiment converts F-D3-08 from 0.9 confidence to proven and prices
   the largest item in the ledger.
5. **Replace OD-5's uncited anchor** with Osmani/Russell's 130–170 KB gz and this ledger's own verified
   172.0 KB internal floor — which land within 2 KB of each other and are a far stronger argument than
   the appeal to Linear.

### Standing recommendation

Do not schedule Wave 1 from this ledger as written. Two of its highest-severity items have been
retracted or re-scoped in the last round, and its central performance thesis was wrong until Round 3.
The ranking is sound on the database and consistency dimensions and unreliable on bundle and vitals
until item 3 above is done.

**P0-SEC-01 should be handled immediately and independently of any of this.** It is not a performance
finding and does not need the rest of the programme.

---

## 9. Round 3 re-measurement — the method defect, corrected

Done after the Phase 1 stop, because it was unblocked (no credentials involved) and it is the change
both critics prescribed as the one that would move the capping axis. It does **not** change the Phase 1
verdict; it makes the numbers a Round 4 or a Phase 2 would build on correct.

### 9.1 Two methods, and they disagree — stated before the numbers

- **HTML method** (Rounds 1–2): parse every `<script src>` / `<link href>` out of a prerendered
  `.html`, gzip each chunk from disk, sum. Measures what the browser actually fetches on first load.
  **Only works for prerendered routes**, and excluded CSS.
- **Manifest method** (new): read `page_client-reference-manifest.js` and sum its client chunks.
  **Works for dynamic routes too**, which is the only way to see the four the HTML method cannot.

They do not agree. `/orders` is **917.9 KB gz** by the HTML method and **757.7 KB gz** by the manifest
method — a 160 KB gap, because the manifest lists client modules and misses shared framework chunks
the HTML also pulls. **Every manifest-derived figure below is therefore a lower bound**, and the four
dynamic routes are likely 100–160 KB higher than shown. Neither number is discarded; the discrepancy
is the finding.

### 9.2 The four routes the ledger could not see

`find app -name page.tsx` → 33. `find .next/server/app -name '*.html'` → 31. These four are dynamic and
were structurally invisible to Rounds 1 and 2:

| route | JS KB gz (lower bound) | note |
|---|---:|---|
| **`/store/edit`** | **876.2** | **the true heaviest route in the platform** |
| `/products/[id]/edit` | 836.3 | |
| `/products/new` | 836.0 | previously believed heaviest at 996.2 by the HTML method |
| `/store/onboarding` | 770.2 | |

§5 called `/store/edit` "the largest route" in the same table that admitted never opening it. That
ranking is now measured rather than asserted — and it was right, by a method the ledger did not have.

### 9.3 CSS, excluded by construction in Rounds 1–2

| app | stylesheet | raw | gzip |
|---|---|---:|---:|
| platform | `ccccc8eab4f8be00.css` | 649,715 B | **75.5 KB** |
| platform | `00b3fa4db14db3bd.css` | 3,653 B | 0.9 KB |
| storefront | `021e4c2d307aa4de.css` | 113,202 B | **16.2 KB** |

Render-blocking, on 30 of 31 prerendered platform routes. **Corrected first-load totals:**

| route | JS | CSS | **real total** |
|---|---:|---:|---:|
| platform `/login` | 782.4 | 76.4 | **858.8 KB gz** |
| platform `/store/edit` | 876.2+ | 76.4 | **952.6 KB gz+** |
| storefront home | 345.8 | 16.2 | **362.0 KB gz** |
| storefront `/policies/returns` | 286.8 | 16.2 | **303.0 KB gz** |

### 9.4 The storefront bundle — measured for the first time

D3 covered one of two apps for three rounds. All 20 customer routes, manifest method:

| route | JS KB gz |
|---|---:|
| `/s/[tenant]` (home) | **345.8** |
| `/s/[tenant]/checkout` | 292.3 |
| `/s/[tenant]/cart` | 291.9 |
| `/s/[tenant]/products/[slug]` (PDP) | 291.5 |
| `/s/[tenant]/categories/[slug]` | 289.1 |
| `/s/[tenant]/products`, `/search` | 287.8 |
| `/s/[tenant]/track` | 287.7 |
| `/s/[tenant]/faq` | 287.1 |
| `/s/[tenant]/checkout/success` | 287.0 |
| `/about`, `/contact`, `/policies/{privacy,terms,shipping,returns}` | **286.8** |
| `/s/[tenant]/[...rest]`, `/p/[slug]` | 283.3 |

**The spread across the entire customer path is 62.5 KB.** A privacy-policy page — static text, no
products, no cart, no tracking form — ships **286.8 KB**, within 17% of the home page's 345.8 KB.

That is the measured proof of **F-D3-11**: the cost is not per-page work, it is
`packages/sections/src/index.ts` statically importing 61 section modules so each can self-register, and
`apps/storefront/next.config.ts` declaring no `optimizePackageImports` to tree-shake it. Every route
ships the hero family, the countdown, the FAQ accordion, the order tracker and the checkout form
whether it renders them or not.

Round 2's §0.3 inferred "the cost is essentially all shared payload" from the *timing* of static pages
and was told by the Round 2 critic that the inference did not hold. **On bytes, the inference was
right** — a 62.5 KB spread across 20 routes is a shared floor. It was the LCP half that was wrong.

### 9.5 Against the corrected benchmark

Using the citable figure (Osmani/Russell, **130–170 KB gz on mobile**) rather than OD-5's uncited
"~200 KB, roughly what Linear and Stripe ship", which Round 3 research found to be folklore:

| surface | measured | vs 170 KB |
|---|---:|---:|
| storefront, lightest route | 303.0 KB | **1.8×** |
| storefront home | 362.0 KB | **2.1×** |
| platform `/login` | 858.8 KB | **5.1×** |
| platform `/store/edit` | 952.6 KB+ | **5.6×+** |

This ledger's own verified internal floor — the 12 chunks common to every platform route — is
**172.0 KB gz**, within 2 KB of the published rule of thumb. The two agreeing from opposite directions
is a far stronger argument for the target than the appeal to Linear, and **OD-5 should be rewritten
around it.**

### 9.6 What this does and does not change

**Does not change:** the Phase 1 verdict. Ledger 3, below the gate, Phase 2 not started.

**Does change:** D3's coverage now spans both apps and all 33 platform routes; the CSS omission is
closed; F-D3-11's mechanism is measured rather than inferred; OD-5 has a defensible anchor; and
`/store/edit` — the heaviest surface in the product and the one merchants spend sustained time in — is
on the board for the first time.

**Still open and still blocked:** everything requiring an authenticated session, and the fact that
no proposed fix in this ledger has been built and diffed.

---

## 10. Round 3 additional findings

Read-only work done after the Phase 1 stop. Three findings, one of them the architectural root cause
both critics named and neither audit had analysed.

### F-ARCH-01 — The platform abandoned React Server Components; the storefront did not. Same repo, same team.

- **Dimension:** D2 / D3 / D5 (root cause under all three)
- **Location:** `apps/platform/app/**/page.tsx` — 30 of 33; contrast `apps/storefront/app/**/page.tsx` — 0 of 20
- **Profile:** n/a (architectural)
- **Evidence:** Counted by reading the first three lines of every `page.tsx`:

  | app | routes | client components | server components |
  |---|---:|---:|---:|
  | `@scheniders/platform` | 33 | **30** | 3 |
  | `@scheniders/storefront` | 20 | **0** | **20** |

  The only three platform routes that are server components are `/store/v2`, `/store/edit` and
  `/store/onboarding`. **Two of them demonstrate the correct pattern inside this very codebase** —
  `app/store/edit/page.tsx` and `app/store/onboarding/page.tsx` both open with

  ```ts
  import { redirect } from "next/navigation";
  import { cookies } from "next/headers";
  import { createServerClient } from "@supabase/ssr";
  ```

  and do a server-side auth check, `redirect()` on failure, and fetch their data server-side to pass as
  props. So the team can do this, has done it, and stopped at three.

  Consequences, measured:

  ```
  distinct from("user_profiles") read sites   : 30
  files using createServerClient              : 8   (only 2 are pages)
  files using next/dynamic in the whole app   : 9
  ```

  Note also that `middleware.ts:14-16` records "route protection stays in the client auth guard" — yet
  `/store/edit` already performs a server-side auth redirect. The pattern for that exists too and is
  used once.
- **Repro:** `for f in $(find apps/platform/app -name page.tsx); do head -3 "$f" | grep -q "use client" && echo CLIENT || echo SERVER; done | sort | uniq -c`
- **User impact:** This is the single fact that generates most of this ledger. Because 30 routes are
  client components: nothing can be rendered or fetched on the server (D2 — the same user profile read
  from 30 places, 227 requests on one dashboard load); nothing can be server-only, so it all ships to
  the browser (D3 — the 858.8 KB `/login`); and there is nothing to stream, so `loading.tsx` has little
  to do (D5 — 5 of 33). The storefront, with the opposite architecture, has none of the platform's
  request-waterfall findings.
- **Reach:** 5 · **Impact:** 5 · **Confidence:** 1.0 · **Effort:** 5
- **SEVERITY: 5 × 5 × 1.0 = 25** · **PRIORITY: 25 / 5 = 5.0**
- **Fix direction:** Not a sweep — a direction. Every new route starts as a server component and opts
  into `"use client"` at the leaf that needs interactivity, not at the page. Existing routes convert
  opportunistically, heaviest first (`/store/edit` is already server; `/orders` and `/products` are the
  valuable conversions). `/store/edit` and `/store/onboarding` are the in-repo reference implementations
  and should be cited as such. This is multi-quarter and should be stated as such rather than scheduled
  as a wave.
- **Risk if fixed:** Converting a page to a server component moves its data fetching and its auth
  check; getting either wrong changes what a user can see. Each conversion needs its own tenant-scoping
  check, which is why this is Effort 5 and not a mechanical refactor.
- **Note:** Both the Round 1 and Round 2 critics named this. Round 1 recorded "714 of 1,132 files carry
  `use client` (63%)" inside F-D3-01 and analysed it nowhere; Round 2 left it. It is the highest-effort
  and highest-reach item in the ledger and it was, until now, not a finding at all.

---

### F-D9-05 — A legacy tracking page invents a delivery time and shows it to the customer

- **Dimension:** D9
- **Location:** `apps/storefront/components/schneiders/track-form.tsx:12-18,25-28`
- **Profile:** n/a (code-structural)
- **Evidence:** The lookup handler never calls anything:

  ```tsx
  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
  }
  ```

  and `submitted` renders a hardcoded constant:

  ```tsx
  const SAMPLE_TIMELINE = [
    { state: "✅", label: "Order placed",  time: "Today 10:42 AM", … },
    { state: "✅", label: "Confirmed",     time: "Today 11:08 AM", … },
    { state: "🚚", label: "Dispatched from warehouse", time: "Today 1:30 PM", … },
    { state: "⏳", label: "Out for delivery", time: "Estimated 3:30–4:30 PM", … },
    { state: "⚪", label: "Delivered — pay cash on arrival", time: "", … },
  ];
  ```

  Any phone and any order number produce the same five steps, including a fabricated
  **"Estimated 3:30–4:30 PM"** delivery window. This is the same class of defect as F-D9-01 —
  confidently presenting false data as fact — and arguably worse, because it invents a commitment the
  merchant never made.
- **Repro:** render `SchneidersTrackForm` and submit anything.
- **User impact:** A customer is told their parcel arrives between 3:30 and 4:30 today. Nothing
  generated that window. When it does not arrive, the merchant absorbs the complaint.
- **Reach:** 2 · **Impact:** 5 · **Confidence:** 1.0 · **Effort:** 1
- **SEVERITY: 5 × 2 × 1.0 = 10.0** · **PRIORITY: 10.0 / 1 = 10.0**
- **Fix direction:** Delete it. `app/s/[tenant]/track/page.tsx:53-68` prefers the V2 track page when the
  tenant has one, and the V2 path (`order_tracker.client.tsx`) does a real lookup. A fallback that
  fabricates data is worse than no fallback — an honest "tracking is not set up for this store" is
  strictly better.
- **Risk if fixed:** A tenant currently relying on this fallback loses its tracking page. That is the
  correct outcome, but it should be checked before removal.
- **Reachability — RESOLVED, `HYPOTHESIS` tag removed.** `pickV2Page` (`storefront-runtime.ts:16-30`)
  returns `null` unless a page with `page_id = 'track'` exists **and** has a non-empty `sections` array;
  `track/page.tsx:53` then falls through to the legacy form. Evaluated against live tenants:

  | | count |
  |---|---:|
  | live tenants (`trial`/`active`) | 11 |
  | **fall through to the legacy fabricated-timeline page** | **10** |
  | have a usable V2 `track` page | 1 — `scheniders-iraq` |

  So the fallback is reachable in production, not dead code. **But the honest reading is narrower than
  that table suggests:** 9 of the 10 are `seed-*` fixtures plus `test-shop-4` and
  `tenant-1783432794067`. The only real merchant on the platform is `scheniders-iraq` — and it is the
  single tenant that is *safe*. **No real customer is being shown a fabricated ETA today.**
  The defect is therefore **latent, not active**: it fires the first time a genuine second merchant
  onboards without configuring a track page, which is the default state of every tenant the seed path
  produces. Scored Reach 2 on that basis — not 1 (it is live code on a live path) and not 5 (nobody is
  hitting it).
- **Method note against myself:** the first attempt at this used
  `store_config_v2 -> 'pages' ? 'track'`, which is meaningless — `pages` is an **array** of objects
  keyed `page_id`, not an object. That query returned "10 of 11" for the wrong reason and happened to
  agree with the right answer. Re-derived against the actual `pickV2Page` predicate.
- **Credit:** Round 2 critic.

---

### F-D6-02 — The cart promises free delivery whenever the delivery figure is zero, including on an empty cart

- **Dimension:** D6 / D9
- **Location:** `packages/sections/src/cart_summary.client.tsx:145-157`
- **Profile:** P-mobile — visible in `tmp/audit/d7-cart-empty.png`
- **Evidence:**

  ```tsx
  {delivery === 0 ? (
    <span …>{t ? "مجاني" : "Free"}</span>
  ) : (
  ```

  The badge is driven purely by `delivery === 0`. On an empty cart the delivery figure is zero, so the
  store displays **"مجاني" (Free)** next to a 0 IQD total — a delivery promise made before the shopper
  has chosen anything, and before any threshold could have been evaluated.
- **Repro:** open `/s/<tenant>/cart` with an empty cart; the summary shows Delivery: مجاني.
- **User impact:** The first thing a shopper sees on an empty cart is a free-delivery promise. If the
  tenant has a real threshold, the promise is false and the shopper discovers it at checkout, which is
  the worst possible moment.
- **Reach:** 3 · **Impact:** 4 · **Confidence:** 1.0 · **Effort:** 1
- **SEVERITY: 4 × 3 × 1.0 = 12.0** · **PRIORITY: 12.0 / 1 = 12.0**
- **Fix direction:** Distinguish "delivery is free" from "delivery has not been computed yet". The
  badge should require a non-empty cart and a genuinely-met threshold; an empty cart should show no
  delivery row at all.
- **Risk if fixed:** A tenant that genuinely offers unconditional free delivery must still show the
  badge on a populated cart. Do not gate it on the threshold alone.
- **NOT A NEW FINDING, and that is the more important point.** A prior engagement on this repo already
  recorded, as an open merchant decision: *"the English 'Free delivery' trust badge, which contradicts
  both the Arabic and the real 5,000 IQD fee."* So:

  1. **The hedge is resolved.** This tenant's real delivery fee is **5,000 IQD**. The promise is false,
     not cosmetic. Confidence 0.85 → **1.0**, Impact 3 → **4**.
  2. **This is a second instance of a known defect, on a different surface.** The prior record concerns
     a *trust badge*; this is the *cart summary delivery row*. Two independent places in the storefront
     assert free delivery against a 5,000 IQD fee, and the first has been known and open since
     2026-09-11.
  3. The fix must therefore sweep for every surface that makes a delivery claim, not patch this one
     line. A codebase that states the same falsehood in two places will state it in a third.
- **Self-criticism, twice over:** two findings (F-D7-01, F-D7-02) were extracted from this exact
  screenshot in Round 2 and this was walked past both times. And it was already on record as open
  before this audit began — three rounds of a performance-and-craft audit did not consult the project's
  own record of known-open craft defects, which would have surfaced it on day one.

---

## 11. Round 3 final pass — storefront resilience and the anonymous write surface

Last of the read-only work. Three findings; this exhausts what is reachable without credentials or a
build.

### F-D9-06 — The storefront has no loading boundaries, no root error boundary, and one un-branded error page for every tenant

- **Dimension:** D9 / D5
- **Location:** `apps/storefront/app/error.tsx`; absence across `apps/storefront/app/**`
- **Profile:** n/a (code-structural)
- **Evidence:**

  | | platform | **storefront** |
  |---|---:|---:|
  | `page.tsx` | 33 | 20 |
  | `loading.tsx` | 5 | **0** |
  | `error.tsx` | 5 | **1** |
  | `global-error.tsx` | 1 | **0** |
  | `not-found.tsx` | 0 | 2 |

  D5 and D9 counted platform routes only for three rounds. The storefront — every route of which is a
  dynamic server component doing real data fetching — has **no streaming boundary anywhere**.

  The single `app/error.tsx` is the boundary for every page of every tenant, and it is not the
  tenant's:

  ```tsx
  <main className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
    <h1 className="text-4xl font-bold text-zinc-900 mb-2">حدث خطأ</h1>
    <p className="text-zinc-600 mb-6">عذراً، حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.</p>
    <button className="… bg-brand-primary text-white …">حاول مرة أخرى</button>
  ```

  Three problems in nine lines. The copy is **hardcoded Arabic**, ignoring the tenant's
  `default_locale`. The palette is `zinc-50`/`zinc-900`/`zinc-600` plus `bg-brand-primary`, which
  resolves to the **static** `--brand-primary: #3b82f6` in `globals.css` — a blue that belongs to no
  tenant — rather than the `--bk-*` brand-kit tokens every other storefront surface uses. And the
  handler only `console.error`s; nothing reaches Sentry.
- **Repro:** the `find` counts above; read `apps/storefront/app/error.tsx`.
- **User impact:** This is a white-label product. When a merchant's store throws, their customer sees a
  grey-and-blue page in a language the store may not use, with none of the store's identity on it. The
  merchant never learns it happened. And with no `loading.tsx` on any route, every storefront page
  blocks entirely on its slowest server fetch rather than streaming a shell.
- **Reach:** 5 · **Impact:** 3 · **Confidence:** 1.0 · **Effort:** 2
- **SEVERITY: 3 × 5 × 1.0 = 15** · **PRIORITY: 15 / 2 = 7.5**
- **Fix direction:** The error boundary must read the tenant's brand kit and locale like every other
  surface, and must report. Add `loading.tsx` per route group with skeletons matching the section
  layout — the storefront is all server components, so it is the app that benefits most from streaming
  and currently does none of it. A `global-error.tsx` is needed for throws in the root layout.
- **Risk if fixed:** An error boundary that itself reads tenant config can throw while handling a
  throw. It needs a hardcoded last-resort path that does not depend on the config being loadable.

---

### F-SEC-02 — Every storefront write endpoint is anonymous and unthrottled, against a table that costs ~110 ms per row

- **Dimension:** D2 / security-adjacent
- **Location:** `apps/storefront/app/api/**/route.ts` (7 routes); no middleware; no limiter anywhere
- **Profile:** P-scale
- **Evidence:** Every storefront API route, with its methods and its count of auth/service-role checks:

  ```
  exp-event/route.ts          POST          authchecks=0
  newsletter/route.ts         POST          authchecks=0
  reviews/route.ts            GET,POST      authchecks=0
  orders/lookup/route.ts      GET           authchecks=0
  loyalty/balance/route.ts    GET           authchecks=0
  checkout/orders/route.ts    POST          authchecks=0
  cart/abandoned/route.ts     POST          authchecks=0
  ```

  `grep -rln "rateLimit|ratelimit|Ratelimit"` over `apps/storefront` returns **nothing**, and there is
  **no `middleware.ts` or `proxy.ts` in the storefront at all**. The `api_rate_limits` table exists in
  the database — with RLS enabled and no policies (F-D4-08) — and nothing in this app reads it.

  **Being anonymous is correct here** — it is a public storefront and shoppers are not logged in. The
  defect is the absence of throttling, and it compounds with the database findings: `POST
  /api/checkout/orders` creates rows in `orders`, which carries **12 triggers and 21 indexes**
  (F-D4-01, F-D4-10) at roughly 110 ms per row. An unthrottled anonymous endpoint in front of the most
  expensive write in the system is both a spam vector and a cost amplifier.

  `GET /api/orders/lookup` deserves separate note, and partly in its favour: the underlying RPC is
  well built — phone-gated, exact order-number match, tenant-status gate, `LIMIT 1`, returning only
  four coarse fields. Payoff per guess is genuinely low. But `tenant_id` is client-supplied
  (`route.ts:35`) and order numbers are short sequential integers per tenant (the live tenant starts at
  `100001`), so with no throttle, anyone holding a phone number — which in this market is the
  WhatsApp contact and is semi-public — can enumerate that person's orders across tenants.
- **Repro:** the route enumeration above; `grep -rln "rateLimit\|ratelimit" apps/storefront`;
  `ls apps/storefront/middleware.*`.
- **User impact:** A merchant can have their order book, review section, newsletter list and
  abandoned-cart table filled with fabricated rows by anyone, at a database cost they pay for. No
  mechanism exists to notice or stop it.
- **Reach:** 4 · **Impact:** 4 · **Confidence:** 1.0 · **Effort:** 3
- **SEVERITY: 4 × 4 × 1.0 = 16** · **PRIORITY: 16 / 3 = 5.3**
- **Fix direction:** Per-IP and per-phone throttling on the write routes, strictest on
  `checkout/orders` and `reviews`. The `api_rate_limits` table already exists and is unused — decide
  whether it is the mechanism or should be dropped (F-D4-08 flags it as RLS-enabled-with-no-policy).
  Upstash is already a dependency elsewhere in the monorepo.
- **Risk if fixed:** Throttling a checkout endpoint can reject real orders — several family members
  ordering from one household connection share an IP. Per-IP limits on `checkout/orders` must be
  generous and must fail open, or the fix costs more than the defect.

---

### F-D3-14 — An unidentified third party receives a beacon on every storefront page

- **Dimension:** D3 / privacy
- **Location:** not in source — injected at runtime by a vendored pixel SDK
- **Profile:** P-mobile
- **Evidence:** `mpc2-prod-24-is5qnl632q-uw.a.run.app/events?cee=no` fires on every storefront page
  load, observed in the network capture. `grep -rn "mpc2-prod\|run\.app"` across `apps/storefront` and
  `packages/sections` returns **nothing**, so it is not referenced in this codebase — it is injected by
  one of the vendored analytics SDKs at runtime.
- **Repro:** load any storefront route and filter network requests for `run.app`.
- **User impact:** A Google Cloud Run endpoint nobody in the codebase named is receiving an event per
  page view. Under GDPR-style reasoning the merchant is the data controller for a recipient they
  cannot identify — and neither could this audit.
- **Reach:** 5 · **Impact:** 2 · **Confidence:** 0.8 · **Effort:** 2
- **SEVERITY: 2 × 5 × 0.8 = 8.0** · **PRIORITY: 8.0 / 2 = 4.0**
- **Fix direction:** Attribute it before deciding anything — block each pixel SDK in turn and observe
  which one stops emitting it. It most likely belongs to the TikTok or Meta SDK. Then decide whether
  it is acceptable; it is a direct input to the consent-gate decision in **OD-2**.
- **Risk if fixed:** Blocking it may disable attribution the merchant depends on.
- **Confidence note:** 0.8 — the request is observed and its absence from source is verified; the
  attribution to a specific SDK is not, and the original capture was destroyed with the scratchpad.
- **Credit:** Round 2 critic.

---

## 12. Build experiments — the first measured results in this engagement

Five controlled rebuilds against `3c0f0cb3` in the audit worktree. Each stubbed one thing, rebuilt from
a clean `.next`, measured, and was **reverted** — the worktree ended clean at `3c0f0cb3`, nothing
pushed, no PR. Logs: `tmp/audit/experiment*-build.log`.

**This was the first time anything in this ledger was built rather than inferred. It overturned two
findings — one upward, one downward — and the headline result is bigger than anything the audit found
by reading.**

### 12.1 The result

**One import — `packages/shared/src/preview-token.ts:21` — costs every route in both apps.**

| | platform `/login` | storefront floor (`/policies/*`) | storefront home |
|---|---:|---:|---:|
| baseline | **782.4** | **286.8** | **345.8** |
| remove `node:crypto` import | **653.3** (−129.1) | **162.2** (−124.6) | **221.3** (−124.5) |
| reduce sections barrel 61→5 | — | 241.9 (−44.9) | 300.9 (−44.9) |
| **both** | — | **117.5** (−169.3) | **176.5** (−169.3) |

All figures KB gzipped. The two fixes are **independent and additive**: −124.6 and −44.9 sum to
−169.5 against −169.3 measured.

### 12.2 What each experiment settled

**(A) F-D3-08's stated cause was wrong.** All 19 `xlsx`/`jspdf`/`qrcode`/`jsbarcode` import sites were
stubbed across 14 files, leaving zero runtime imports of those libraries anywhere in the platform.
`/login` stayed at **782.4 KB — byte-identical** — and the 167.2 KB polyfill chunk stayed in its set.
The fix direction Rounds 1 and 2 would have handed a team **recovers nothing.**

**(B) The real cause is one line in a barrel file.** `preview-token.ts` imports `createHmac` and
`timingSafeEqual` from `node:crypto`; `packages/shared/src/index.ts:18` re-exports it via `export *`;
`apps/platform/lib/utils.ts:5` re-exports `cn` from that barrel; every component imports `cn`. So a
server-only HMAC module is reachable from every client component, and Turbopack satisfies `node:crypto`
with `crypto-browserify`. Stubbing that single import removed **129.1 KB from every platform route**.

**(C) It costs the storefront too, and more than anything else there.** The same polyfill is the
largest chunk on a storefront policies page — `15c044496c9f26c9.js`, 157.6 KB gz, containing
`@scheniders/shared` *and* the polyfill. Stubbing the same line removed **124.6 KB from every
storefront route**, taking the floor from 286.8 to **162.2 KB — inside the 130–170 KB reference
budget.** Neither app had been connected to this cause before.

**(D) F-D3-11's magnitude was overstated.** Reducing the sections barrel from 61 imports to 5 moved
every route by a uniform **−44.9 KB**, which proves the shared-floor mechanism exactly — but recovers
only 16% of the route cost, not the dominant share the finding implied. Downgraded 23.8 → 15.

### 12.3 What this changes

1. **`F-D3-08` is now the highest-priority item in the ledger** — Confidence 1.0, Effort 1, and it is
   the only finding here whose value is measured rather than argued. It is one import, and it is worth
   **~129 KB on every platform route and ~125 KB on every storefront route.**
2. **The storefront is one line from its budget.** 286.8 → 162.2 KB on content routes. With the barrel
   fix as well, 117.5 KB — comfortably inside.
3. **`F-D3-01`'s recovery estimate needs re-deriving.** It claims the root-layout split recovers ~87 KB
   of the 614.9 KB delta. 129.1 KB of that delta is now known to be the polyfill, which the split does
   not touch and this fix removes entirely.
4. **The 242 KB storefront floor is explained.** Round 3 flagged it as unattributed; it is mostly this
   polyfill plus the sections barrel. What remains after both fixes — 117.5 KB — is React, Next and the
   storefront chrome, which is a reasonable floor.
5. **Lighthouse's `unused-javascript` attribution is still unexplained.** It credits 438–510 KiB and
   1,800–2,650 ms of LCP. The two fixes here total ~169 KB gz. The gap is not accounted for, and a
   claim that these fixes will move LCP by a specific amount would be exactly the kind of inference
   this section just falsified twice. **Re-measure Lighthouse after the fix rather than predicting.**

### 12.4 The methodological point, which outranks the numbers

Two findings were built. **Both were wrong** — one in its cause and fix direction, one in its
magnitude. One moved to the top of the ledger and one moved out of the top five. Every other
performance recommendation in this document rests on the same class of inference that failed twice in
a row here.

That is a stronger argument against sequencing Phase 2 from the unbuilt findings than anything either
critic wrote. **Any wave that claims a byte or millisecond target should be built and measured before
it is scheduled, not after.**

---

## 13. The fix, built and verified

Not a stub and not an experiment — a real change, in the audit worktree, fully verified. **Uncommitted,
unpushed, no PR.** The main tree at `/Users/ali/scheniders-mono` is untouched.

### 13.1 Result

| surface | baseline | after | delta |
|---|---:|---:|---:|
| platform `/login`, JS | 782.4 | **629.5** | **−152.9** |
| platform `/login`, JS + CSS | 858.8 | **705.8** | −153.0 |
| storefront home | 345.8 | **217.5** | −128.3 |
| **storefront floor** (`/about`, `/contact`, `/policies/*`) | 286.8 | **151.8** | **−135.0** |

All KB gzipped. **The storefront floor is now inside the 130–170 KB reference budget** (OD-5), from an
8-file change. The platform is still well over and needs F-D3-01 and F-ARCH-01, but it has lost 18% of
its baseline.

### 13.2 The change — 8 files, +15 / −11

```
packages/shared/src/index.ts
  - export * from "./iraq-map-paths";          → // moved to subpath export
  - export * from "./preview-token";           → // moved to subpath export
  - export * from "./health-rules";            → export type * from "./health-rules";
packages/shared/package.json
  + "./preview-token", "./health-rules" subpath exports
apps/platform/app/store/edit/page.tsx                         → import from subpath
apps/storefront/app/_preview/[tenant]/[page_id]/page.tsx      → import from subpath
apps/platform/components/store-builder-v2/editor-shell.tsx                  → "
apps/platform/components/store-builder-v2/health-checklist-screen.tsx       → "
apps/platform/components/store-builder-v2/health-checklist-screen.test.tsx  → "
apps/platform/components/store-command-center/health-card.tsx               → "
```

`export type *` is what makes the health-rules half cheap: the types keep flowing through the barrel so
every `import type` site is untouched, while the **values** must come from the subpath — so the runtime
module is no longer reachable from client code that only wanted `cn`.

### 13.3 Verification

| check | result |
|---|---|
| `pnpm build` — platform | **exit 0** |
| `pnpm build` — storefront | **exit 0** |
| `pnpm type-check` | **exit 0**, 3/3 packages |
| `pnpm lint` | **exit 0**, 3/3 packages |
| `pnpm exec vitest run packages/shared apps/platform/components/store-builder-v2` | **exit 0 — 57 files, 597 tests passed** |

Both `preview-token` consumers are server components (`/store/edit` uses `cookies()`; the storefront
`_preview` route uses `notFound()`), so nothing client-side lost access to anything.

### 13.4 Two things that failed first, recorded so nobody repeats them

**`"sideEffects": false` on `packages/shared/package.json` breaks both builds** with
`Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'` — a next/font
resolution failure under Turbopack, with no obvious connection to the change. Diagnosed by reverting
`package.json` alone and rebuilding clean. **Do not add that key here** without re-testing fonts.

**A symbol grep under-counts barrel consumers.** The first pass found one `health-rules` consumer; the
build found three more, and `type-check` found a fourth in a test file. The build and the type checker
are the authority on who imports what — not grep.

### 13.5 What this does not do

- It does not touch **F-D3-01** (the root-layout split) or **F-ARCH-01** (the RSC position). The
  platform baseline is still 629.5 KB and those remain the two largest items against it.
- It does not predict an LCP improvement. Lighthouse credited 1,800–2,650 ms to `unused-javascript`;
  this removes ~135 KB gz from the storefront. Predicting the millisecond outcome is exactly the
  inference that failed twice in §12. **Re-run Lighthouse against the fix.**
- It is not committed. Branching, PR and merge are release decisions, not audit decisions.

---

## 14. ~~Lighthouse against the fix~~ — **RETRACTED IN §15. The deltas below are an artifact.**

> Everything in this section compares **n=1 cold-start baselines** against **n=3 medians**. At
> like-for-like medians the fix produces **no LCP improvement at all**. See **§15**. Retained in full
> because the error is the most instructive thing in this document.

## 14. Lighthouse against the fix — measured, not forecast

§13 deliberately refused to predict an LCP improvement, because predicting it is the inference that
failed twice in §12. Measured instead, on the fixed build, P-mobile, cold cache, **median of 3 runs**.

| route | LCP before (n=1) | **LCP after (median of 3)** | runs | Δ |
|---|---:|---:|---|---:|
| `/cart` | 11.7 s | **4.7 s** | 4.7 / 4.7 / 4.7 | **−7.0 s** |
| `/about` | 9.6 s | **4.7 s** | 5.2 / 4.7 / 4.7 | **−4.9 s** |
| home | 12.6 s | **6.5 s** | 12.1 / 6.5 / 6.5 | **−6.1 s** |
| PDP | 12.8 s | 11.3 s (n=1) | — | −1.4 s |

FCP, same runs: `/about` 4.5 → 1.7 s · `/cart` 6.6 → 1.8 s · PDP 6.9 → 2.1 s · home 6.3 → 5.0 s.
Performance score: `/about` and `/cart` now **76**, PDP 63, home 59.

### 14.1 Running medians changed the answer

The first home run returned 12.1 s and the next two returned 6.5 s. On n=1 this fix looked worth
**−0.5 s on the home page**; on a median of 3 it is worth **−6.1 s**. The 12.1 s was a cold-start
artefact.

This is the ledger's own n=1 criticism landing on its own measurement, one section after writing it
down. The tight clustering elsewhere (`/cart` at 4.7 / 4.7 / 4.7) says the variance is almost entirely
first-run server warm-up, not measurement noise.

**Caveat, stated rather than buried:** the *before* figures are still **n=1**, taken in §0.3 before this
discipline was adopted, and the baseline builds have been overwritten. They are probably pessimistic
for the same cold-start reason. **The direction and rough magnitude are solid; the exact deltas are
not.** A clean before/after would re-measure both sides at n=3 — that work is one rebuild away and has
not been done.

### 14.2 The remaining problem is now clearly separated

`unused-javascript` LCP opportunity, after the fix:

| route | before | after |
|---|---:|---:|
| `/about`, `/cart` | 1,800–2,550 ms | **450 ms** |
| PDP | 2,250 ms | 1,500 ms |
| home | 2,650 ms | **2,400 ms** |

Content and form routes are largely solved. **Home and the PDP are not** — they keep most of their
unused-JS opportunity and improve least, which is consistent with **F-D1-04**: their LCP element is an
image, discovered late, so removing script weight does not move the thing LCP is waiting on. Those two
routes need the `fetchpriority` work, not more bundle reduction.

That is a genuinely useful split and it did not exist before the fix was built: the storefront's LCP
problem is two different problems on two groups of routes, and one of them is now mostly fixed.

---

## 15. The correction that matters most: the storefront was never as slow as this ledger said

§14 claimed the barrel fix bought −7.0 s, −4.9 s and −6.1 s of LCP. **It buys nothing.** Measured
like-for-like, median of 3 runs on both sides:

| route | §0.3 "before" (n=1) | **baseline, median of 3** | **fixed, median of 3** | real Δ |
|---|---:|---:|---:|---:|
| home | 12.6 s | **5.9 s** | 6.5 s | **+0.6 s** |
| `/about` | 9.6 s | **4.5 s** | 4.7 s | +0.2 s |
| `/cart` | 11.7 s | **4.6 s** | 4.7 s | +0.1 s |
| PDP | 12.8 s | **5.3 s** | — | — |

Baseline runs: home `[8.0, 5.9, 5.9]` · about `[4.5, 4.5, 4.5]` · cart `[4.5, 4.6, 4.6]` ·
PDP `[7.3, 5.2, 5.3]`. The first run of each is a server cold start; runs 2 and 3 agree to 0.1 s.

**Two conclusions, both uncomfortable.**

### 15.1 The ledger's headline storefront numbers were cold-start artifacts

Every storefront LCP figure in this document — 13.6 s, 12.6 s, 12.8 s, 11.7 s, and the "every route
fails by 2.2×–5.4×" that opens the executive summary — came from **single runs against a
just-started server**. The real medians are **4.5–5.9 s**.

That is still over the 2.5 s budget — by **1.8×–2.4×**, not 5.4× — and still bad. But the product is
roughly **twice as fast as this audit has been saying for three rounds**, and the error was in the
measurement, not the product.

**F-D1-01 must be restated at medians.** Its severity may survive on the corrected numbers; its
evidence table does not.

### 15.2 The fix is a real bundle win and not an LCP win

The byte reduction is not in doubt — it is measured on disk, deterministic, reproducible: **−152.9 KB
gz on every platform route, −135.0 KB on every storefront route**, taking the storefront floor inside
the 130–170 KB budget. Builds, type-check, lint and 597 tests all pass.

But on this harness it moves LCP by **+0.1 to +0.6 s — i.e. nothing, within noise.** The reason is
visible in the data already collected: the removed code was never on the LCP critical path. Home and
PDP are image-gated (F-D1-04), and on localhost there is no real bandwidth constraint for the
remaining routes to feel the weight.

**That does not make the fix worthless.** 135 KB gz per route is real bytes a real Iraqi shopper pays
for on metered mobile data, over a link where Lighthouse's localhost simulation cannot represent the
cost. It means the fix should be justified as **payload and data cost, not as LCP**, and that the
honest claim is "135 KB smaller", not "7 seconds faster".

### 15.3 What this says about the whole engagement

This is the **third** inference overturned by building and measuring, and the second overturned
*against my own work*:

| | claimed | measured |
|---|---|---|
| F-D3-08 cause | ~20 `xlsx`/`jspdf` imports | zero effect; it was one `node:crypto` import |
| F-D3-11 magnitude | the dominant storefront cost | 44.9 KB, 16% |
| §14 fix benefit | −4.9 to −7.0 s LCP | **+0.1 to +0.6 s — none** |
| §0.3 storefront LCP | 9.6–13.6 s | **4.5–5.9 s at medians** |

Four for four. **Nothing in this ledger's performance half should be trusted until it has been
measured at n≥3 with a matched baseline.** The database and consistency findings are unaffected —
those are catalog reads and greps, and they reproduced exactly under two independent critics.

**Required before any Phase 2 plan uses a timing number:** re-measure every D1 figure in this document
as a median of at least 3 runs against a warmed server, and re-derive F-D1-01, F-D1-02, F-D1-03's
replacement and F-D1-04 from those. Until then the D1 severities are unreliable in both directions.

---

## 16. D1 re-measured — corrected storefront figures, and the limit of this harness

Production code (fix stashed), server warmed with two full passes over every route before measuring,
**n=3 per route**, P-mobile cold cache. Raw: `tmp/audit/lh-d1-n3/`, summary `tmp/audit/d1-corrected.txt`.

| route | runs (LCP s) | **median** | FCP | CLS | score | ledger n=1 | overstated by |
|---|---|---:|---:|---:|---:|---:|---:|
| home | 7.5 / 7.7 / 7.6 | **7.6** | 5.1 | 0 | 63 | 13.6 | 1.8× |
| `/about` | 4.5 / 7.2 / 7.2 | **7.2** | 4.6 | 0 | 65 | 12.3 | 1.7× |
| `/cart` | 4.5 / 4.5 / 7.5 | **4.5** | 1.8 | **0.060** | 83 | 5.5 | 1.2× |
| `/checkout` | 7.1 / 7.4 / 6.5 | **7.1** | 4.7 | 0 | 64 | 5.5 | 0.8× |
| `/track` | 6.5 / 7.3 / 4.5 | **6.5** | 4.7 | 0 | 64 | 12.3 | 1.9× |
| `/search` | 7.6 / 7.1 / 5.1 | **7.1** | 4.8 | 0 | 64 | 9.8 | 1.4× |
| `/products` | 7.8 / 5.2 / 5.2 | **5.2** | 2.1 | 0 | 79 | 8.9 | 1.7× |
| PDP | 4.9 / 5.0 / 5.0 | **5.0** | 2.1 | 0.036 | 80 | 11.7 | 2.4× |
| `/categories/outings` | 5.1 / 5.1 / 7.7 | **5.1** | 2.0 | 0 | 79 | 13.6 | 2.7× |
| `/policies/returns` | 4.5 / 4.5 / 4.5 | **4.5** | 1.8 | 0 | 83 | 12.3 | 2.7× |

### 16.1 What is robust

**All 10 routes exceed the 2.5 s LCP budget, by 1.8×–3.0×.** The minimum LCP observed across all 30
runs is 4.5 s, so no route is close to passing under any reading of the data. That conclusion is
unaffected by the variance discussed below.

**The ledger's n=1 figures overstated LCP by roughly 2×** on most routes (0.8×–2.7×). The headline
"2.2×–5.4× over budget" becomes **1.8×–3.0×**. Still a product that fails its budget everywhere —
but not the 13.6 s catastrophe this document has described for three rounds.

`/cart` CLS of **0.060** reproduces: over the brief's 0.05 target, under the published 0.10.

### 16.2 The limit of this harness, stated against my own correction

The 30 runs are **bimodal**, not noisy around a mean:

```
cluster A: n=15, mean 4.8s, range 4.5–5.2
cluster B: n=15, mean 7.3s, range 6.5–7.8
gap between clusters: 1.3s
```

Exactly half the runs land in each cluster, and the same route lands in different clusters on
different runs (`/about` 4.5 / 7.2 / 7.2; `/track` 6.5 / 7.3 / 4.5). This is almost certainly CPU
contention on the measuring machine — a Next server and headless Chrome competing — not a property of
the product.

**So n=3 medians are still not stable here.** A route's median can be 4.5 s or 7.2 s depending on which
cluster two of its three runs land in. §15 criticised §14 for n=1; this section has to criticise itself
for n=3. A defensible per-route figure needs n≥10 on a quiet machine, or a CI runner with nothing else
on it.

**What survives regardless:** every route is over budget; the range is 4.5–7.8 s; the ledger's figures
were about 2× too pessimistic. **What does not survive:** any per-route ranking or any claim that one
route is faster than another by less than ~2.5 s.

### 16.3 Required amendments

- **F-D1-01's evidence table is superseded by this one.** Its severity may stand — 10 of 10 routes over
  budget — but every number in it is wrong and the "5.4×" must become "3.0×".
- **F-D1-04** (`/products` late-discovered image) was derived from the same n=1 data and needs
  re-deriving from `lcp-breakdown-insight` at medians before anyone acts on it.
- **F-D1-02** (platform dashboard 8.3 s / 2.5 s) has never been re-measured at all and is still n=1,
  taken against an empty dashboard. It is the least reliable number in the ledger.
- No Phase 2 wave should carry an LCP target derived from this document until the above are redone on
  a quiet machine.

### 16.4 The bimodality — what it is not

Chased to the limit of what the collected data supports. Four hypotheses tested, **all rejected**:

| hypothesis | test | result |
|---|---|---|
| CPU contention on the host | `uptime`, `ps` | load avg **3.0 on 12 cores** — not contended |
| Next server response variance | 20× `curl` TTFB on two routes | **unimodal**, 7–20 ms, tight. Not the server. |
| Lighthouse CPU calibration drift | `environment.benchmarkIndex` across all 30 runs | fast cluster **2639**, slow cluster **2638**, overlapping ranges. Identical. |
| Different payload between runs | `network-requests` on a fast vs slow run of `/about` | **identical** — 30 requests, 1058 KiB, same resources, same order |

What remains: a fast and a slow run of the same route fetch exactly the same bytes, on a server
responding in 10 ms, with the same simulated CPU — and differ by **2.8 s of FCP**. Lighthouse's
per-request timing fields come back zero in these reports, so the cause cannot be isolated from the
data collected.

**Stated as unknown rather than guessed.** An earlier draft of this section attributed it to CPU
contention; that was wrong and is retracted. The practical consequence is unchanged and is what
matters: **this harness cannot produce a trustworthy per-route LCP figure, and the reason is not
understood.** Any future D1 work should run on a dedicated machine with `-n 10` and report the
distribution, not a median — and should treat a sub-2.5 s spread between routes as indistinguishable.

---

## 17. P0-SEC-01 — fixed and verified

Built in the audit worktree. **Uncommitted, unpushed, no PR.** Patch:
`tmp/audit/p0-sec-01-and-barrel.patch` (includes §13's barrel fix).

### 17.1 The chain, and where each link is now broken

| link | before | after |
|---|---|---|
| phone enters the URL | `params.set("phone", phone)` → `window.location.href` | **removed** — handed over in `sessionStorage` (`sch:track:phone`), same-origin, same-tab |
| Meta pixel reports `dl` | full location incl. the phone | nothing to report — the phone is not in `location` |
| lookup hits edge logs | `GET /api/orders/lookup?phone=…` | **POST with a JSON body** |

### 17.2 Changes

`packages/sections/src/track_order_lookup.client.tsx` — writes the phone to `sessionStorage` instead
of the query string, inside `try/catch` because private browsing can refuse it. On refusal the tracking
page simply asks again; **it never falls back to the URL**, which is the whole point.

`packages/sections/src/order_tracker.client.tsx` — reads the phone from `sessionStorage` and clears it
after use. A legacy `?phone=` is still honoured, because links already sent to customers exist in the
wild and should not just break — but it is **stripped from the address bar immediately** via
`history.replaceState` so it is not carried into onward navigation. Also switches the lookup call to
POST.

`apps/storefront/app/api/orders/lookup/route.ts` — `GET` becomes `POST`, reading a validated JSON body.
The same Zod schema, unchanged, now parses the body rather than the query string.

### 17.3 Verification

| check | result |
|---|---|
| `pnpm type-check` | **exit 0** |
| `pnpm lint` | **exit 0** |
| `pnpm build` storefront | **exit 0** |
| `pnpm exec vitest run packages/sections apps/storefront` | **exit 0 — 30 files, 319 tests** |
| `POST /api/orders/lookup` with a JSON body | **404 "Not found"** — route parses, validates, queries, correctly finds nothing for a fake phone |
| `GET /api/orders/lookup?phone=…` | **405 Method Not Allowed** — the leaky path no longer exists |

### 17.4 Full-suite verification — both fixes together

The barrel change touches `@scheniders/shared`, which every app imports, so subset runs were not
enough. Entire monorepo suite, both fixes applied:

| package | result |
|---|---|
| `packages/shared` | **exit 0** — 323 tests |
| `packages/sections` | **exit 0** — 214 tests |
| `apps/storefront` | **exit 0** — 105 tests |
| `apps/admin` | **exit 0** — 28 tests |
| `apps/platform` | **exit 0** — **117 files, 1,003 tests** |
| | **1,673 tests, zero failures** |

Plus `pnpm type-check` and `pnpm lint` green across all packages, and both apps building clean. That is
the full CI gate (`turbo lint type-check build`) **plus** the tests CI does not run.

### 17.5 What this does not cover

- **No consent gate.** The pixels still fire unconditionally on first paint (`analytics-pixels.tsx`).
  This fix stops the *phone* reaching Meta; it does not address **OD-2**, and the unidentified
  third-party beacon (`F-D3-14`) is untouched.
- **Already-sent tracking links** containing a phone still carry it in the recipient's address bar when
  opened. The receiver strips it on arrival, but the pixel race on that first paint is not winnable
  client-side. Those links age out; the sender no longer creates new ones.
- **`/api/orders/lookup` is still unthrottled** (`F-SEC-02`). POST narrows the logging exposure, not the
  enumeration surface.
