# Home: proof ledge + occasion triptych

**Date:** 2026-09-11
**Tenant:** `scheniders-iraq` (`b5c4f2d4-834f-4af4-822d-9b9826a8f45a`)
**Sections:** `trust_badge_row` (home position 2 and 10), `category_spotlight_pair` (home position 3)
**Status:** design approved, not yet implemented

---

## Why

Both sections were styled adequately and saying nothing. Neither is a visual
problem.

**The trust row states table stakes.** "توصيل سريع / ضمان الجودة / متوفر
بالعراق / الدفع عند الاستلام" is what every Iraqi COD store says. It persuades
nobody, it occupies the strip directly under the hero — the second most
valuable space on the page — and it runs **twice** on the home page.

Meanwhile the merchant has earned proof no competitor can copy, sitting unused
in `orders`:

| measure | value |
|---|---|
| completed orders | 2,693 |
| distinct customers | 4,465 |
| governorates delivered to | **18 — every governorate in Iraq** |
| trading since | 2025-01-15 |

**The category pair points at the two weakest doors.** Measured through
`product_categories` (the join table; `products.category_id` alone undercounts):

| category | slug | live products |
|---|---|---|
| جميع العطور | العطور | 38 |
| عطور للطلعات | outings | **19** |
| عطور للدوام | work | **19** |
| عطور للمناسبات | occasions | **17** |
| عطور نسائية | women | 8 |
| الاكثر مبيعاً | topsellers | 7 |
| عطور رجالية | men | 5 |
| عطور مختارة | picked | **5** |

Card 1 (`picked`, 5 products) is the smallest real category. Card 2
(`topsellers`, 7) duplicates the "اكثر العطور مبيعاً" product grid that sits
**directly below it on the same page** — the shopper clicks a door to reach
what they are already looking at.

The three deepest categories are occasion-based, which is how people actually
choose perfume: one for work, one for going out, one for an event. That axis is
already in the merchant's data, with 17–19 products behind each, and is
currently unreachable from the home page.

---

## Section 2 — the proof ledge

Replaces the four generic claims under the hero.

**Intent.** A ledge the hero card rests on. Quiet, factual, numeric. It must not
compete with the hero above it or the triptych below it — but the numbers
themselves must be unmissable.

**Composition.**

- One full-bleed band on `--bk-surface-alt`, so it reads as a single object
  rather than four pairs floating in white.
- Four slots. In each, the **numeral is the hero**: large, display face, full
  ink. The label sits beneath it, small, in `--bk-ink-soft`.
- Hairline dividers (`--bk-divider`) between slots on desktop. 2×2 grid on
  mobile, start-aligned so all four share two column edges.
**Slots.** Four, each answering a *different* shopper question. No two may
restate each other:

| slot | value | source | answers |
|---|---|---|---|
| `+٢٦٠٠ طلب وصل` | 2,693 completed | live | do orders actually arrive? |
| `توصيل خلال ٢٤ ساعة` | merchant-stated | static | how fast? |
| `١٨ محافظة` | 18, exact | live | do you reach me? |
| `الدفع عند الاستلام` | merchant-stated | static | how do I pay? |

Customer count (4,465) is deliberately **not** a slot. Alongside completed
orders it says the same thing twice — *many people bought* — and the weaker of
the two: distinct phones include orders that were cancelled, while a completed
order is proof of delivery, which is the exact anxiety a first-time COD shopper
has.

**Honesty rules — these are requirements, not polish.**

- Counts **round down**, never up, so the claim can only understate and stays
  true between stats refreshes and as the number grows. The rule, stated once
  so it is not reinvented per slot:
  - value ≥ 100 → round **down** to 2 significant figures, prefix `+`
    (2,693 → `+٢٦٠٠ طلب`; 1,940 → `+١٩٠٠`; 2,700 → `+٢٧٠٠`, unchanged when
    already at the step)
  - value < 100 → render exact, **no** `+` prefix
  - The governorate slot is exact and carries no `+`. 18 is not an
    approximation, it is all of Iraq, and a `+` would make a complete fact look
    like a partial one.
- A count that is missing or zero **drops its slot entirely**. It never renders
  a bare unit, a `0`, or a placeholder.
- The governorate count **must exclude empty-string codes.** The raw
  `count(distinct …)` returns 19 because 9 orders carry `''`. The true figure is
  18, which is every governorate in Iraq — a stronger claim than the wrong one.

**The delivery claim is merchant-authorized and static, not derived.** Real
delivery is **within 24 hours** (merchant, 2026-09-11). It is written as a
fixed i18n string in config, never computed.

It must **not** be derived from `completed_at`. Average `created_at` →
`completed_at` is 22.1 days, which measures how fast staff close tickets, not
how fast parcels arrive. Anything computing a delivery figure from that column
would publish a false and much worse number. If a live transit metric is ever
wanted, the courier status (`waseet_status_text` / `waseet_status_id`) is the
signal, not `completed_at`.

---

## Section 3 — the occasion triptych

Replaces the two hardcoded links.

**Intent.** The first real shopping decision on the page. This is where
boldness gets spent after the hero.

**Composition.**

- Three cards from real categories: `work` · `outings` · `occasions`.
- **Portrait 3:4, not landscape 4:3.** Perfume bottles are vertical. The
  current 4:3 crop discards 229px of a 677px-tall source on one card. Portrait
  is the single biggest reason good perfume category tiles read as expensive.
- Each card carries: category photo, name, and the **live product count**
  (`١٩ عطر`). A door labelled with its depth feels substantial; a bare label
  does not.
- Label in a bar anchored to the card's bottom-start edge — same element, same
  position, same inner padding on every card. Never floated at centre, where it
  covered the product it was selling.
- Scrim mixed from `--bk-ink`, never literal black.
- Desktop: three equal columns on the shared `max-w-6xl` measure, matching the
  proof ledge above it.
- Mobile: horizontal scroll-snap with a ~1.15-card peek, so the third door is
  discoverable without three screens of stack. Nothing is hidden that is not
  visibly reachable — the peek is the affordance.

**Images.** All three occasion categories already have `categories.image_url`
set. Config may override per item; the category's own image is the fallback.

---

## Data plumbing

### Category product counts

Not currently available. `ctx.categories` carries
`id, tenant_id, name, slug, description, image_url, parent_id, display_order`
and no count.

Add `listCategoryProductCounts(tenantId)` to `apps/storefront/lib/queries.ts`,
returning `Record<categoryId, number>`, aggregated over `product_categories`
joined to `products` with the **same visibility filter
`listProductsInCategory` already uses** (`is_visible`, `not is_archived`,
`not is_supply`). One place must decide what "live product" means, or the
card's count and the page it opens will disagree.

Surface it on `SectionRenderContext` as a new **optional** field
(`category_product_counts?`). Optional because every other section and every
test constructs this context; a required field breaks all of them.

### Public tenant stats

**This is the part with teeth.** `orders` is tenant-private and an anonymous
shopper must never read it. The storefront renders for `anon`.

- New table `tenant_public_stats`, one row per tenant, holding only aggregates:
  `completed_orders`, `customers`, `governorates_served`, `first_order_at`,
  `refreshed_at`. No order rows, no phones, no addresses, no revenue.
  `customers` is stored but **not rendered** by this design (see the slot
  table) — it costs nothing to aggregate and keeps the option open without a
  second migration.
- **RLS enabled from creation.** Anon `SELECT` is granted **only** for tenants
  that are already publicly visible, matching the existing
  `public_storefront_read` predicate on `tenants` (trial/active). Anon gets no
  `INSERT`/`UPDATE`/`DELETE`.
- Refreshed on a schedule by a `SECURITY DEFINER` function (`pg_cron` is
  already in use in this project), not counted on every page render. A public
  page must not run an aggregate over 4,840 rows per request.
- The refresh function must set `search_path` and must **not** gate on
  `current_user <> 'service_role'` — that predicate is always true because
  `current_user` is the owner. Use `auth.role()`. This exact bug has already
  been fixed four times in this codebase; do not reintroduce it.
- Storefront reads it through a cached query alongside `listCategories`.

---

## Schema and back-compat

`packages/sections/*` is shared. Both sections are used only by the
`scheniders-signature` template and only by this tenant, but the rules still
hold:

- Every new schema field is `.optional()` and **absent from `defaultProps`**. A
  required field fails the Zod parse, and a parse failure silently **drops the
  section at render** for every store that predates it.
- `trust_badge_row` gains an optional per-item `metric` discriminator
  (`completed_orders | customers | governorates | none`). Unset means the item
  renders exactly as today — a static icon + label. This keeps the section
  usable as a plain badge row on the cart, product and contact pages, where it
  also appears.
- `category_spotlight_pair` gains optional `source: "config" | "categories"`
  and `show_counts`. Unset means today's behaviour, byte-identical.
- Tests pin the byte-identity of the untouched default path, and each new
  behaviour gets a guard proven to fail when the fix is reverted.

---

## Testing

Run from the repo root; **CI does not run tests.**

- `pnpm exec vitest run` — full suite, currently 166 files / 1603 tests.
- Section guards in `packages/sections/src/_signature-sections.test.tsx`.
- Specifically: rounding never overstates; a zero/missing metric drops its slot
  and renders no bare unit; blank governorate codes are excluded; the card
  count matches what the category page lists; `defaultProps` carries none of
  the new fields and still parses.
- RLS verified against the live schema by querying as `anon`, not by reading
  the migration. Confirm anon can read `tenant_public_stats` for an active
  tenant and **cannot** read `orders` at all.
- Rendered and measured in a browser at 390px and 1512px.

## Rollout

1. Merge the code to `main` and let it deploy. **Config must not be published
   first** — a published config naming metrics the deployed code does not
   understand renders wrong to shoppers.
2. Apply the migration; verify RLS as `anon`.
3. Publish the draft config (owner/admin action in the store builder; the
   publish RPC requires `auth.uid()` and cannot be called with the service
   role).
4. Remove the duplicate `trust_badge_row` at home position 10 in the same
   publish.

## Resolved

**Delivery is within 24 hours** (merchant, 2026-09-11). The 22.1-day
`created_at` → `completed_at` average is a bookkeeping artefact: orders arrive
next day and get marked completed weeks later. The ledge states the 24-hour
fact as static merchant copy and derives nothing from `completed_at`.

Noted for elsewhere, outside this work: any internal metric keyed on
`completed_at` is measuring ticket-closing lag, not fulfilment.
