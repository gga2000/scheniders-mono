# Flagship Template Program

**Goal.** Turn `scheniders_signature` from a bespoke perfume storefront into the
platform's flagship store template: world-class on its own merits, and general
enough that a coffee roaster, a fashion label or an electronics shop can adopt it
without a developer.

**Owner.** Ali (merchant + platform owner).
**Started.** 2026-09-09. **Branch.** `feat/flagship-template` (worktree
`.claude/worktrees/flagship`, cut from `origin/main` @ `e1eb320f`).

---

## 1. The reframe

The perfume features Ali asked for are the *test case*, not the *feature*. Each
one ships as a generic primitive that any niche instantiates:

| Asked for (perfume)     | Ships as (platform)             | Coffee          | Electronics     |
| ----------------------- | ------------------------------- | --------------- | --------------- |
| Scent-family filter     | Attribute facet filter          | Roast / origin  | Brand / RAM     |
| Note pyramid            | Grouped-attribute renderer      | Flavour wheel   | —               |
| Longevity / sillage bars | Range-attribute meters         | Body / acidity  | Battery / weight |
| "Similar to X"          | Attribute-similarity relation   | Similar roasts  | Compatible models |
| Scent-finder quiz       | Product-finder quiz engine      | Coffee quiz     | Buying guide    |

One system, five features, every niche. **This is the keystone.** Nothing else
in this program is worth building before it.

## 2. What already exists (verified, do not rebuild)

Research on 2026-09-09 against `origin/main`:

- **Section contract is sound.** Each section is a `SectionDefinition` in
  `packages/sections/src/<type>.tsx` with a Zod `schema` as the single source of
  truth. `apps/platform/lib/sections-manifest.ts` projects the registry into the
  editor, so the auto-form derives from the real schema — zero drift. Keep this.
- **Brand kit already spans more than colour.** `BrandKit` carries `shape`
  (radius, border thickness, shadow style, rotation), `motion`, `typography`
  (incl. Arabic pairings) and `voice`; `buildBrandKitVars()` emits ~38 `--bk-*`
  tokens including `--bk-radius-*`, `--bk-shadow-*`, `--bk-border-thickness`,
  `--bk-duration-*`, `--bk-scale-*`. **P7 is ~90% done** — what remains is
  adoption and making the three decorative surfaces themeable (`--bk-lilac`,
  `--bk-mint`, `--bk-sky` — done in W0.2). `--bk-wedge-multiplier` is NOT a
  leftover: it carries `BrandShape.rotation_intensity` and is consumed by the
  brand-kit live preview.
- **Per-governorate delivery is already built.** `GovernorateShippingConfig`
  supports per-governorate `fee_iqd`, `free_threshold_iqd` and `eta_hours` with a
  `default_rate` fallback. **C2 is a surfacing job, not a build job.** Ali's note
  that Iraqi delivery is usually a flat fee is satisfied by `default_rate` alone.
- **Tables that exist:** `product_variants`, `product_reviews`, `customer_points`,
  `customer_points_ledger`, `store_config_experiment_events`,
  `aggregate_experiment_stats`, `order_status_history`, `industries`.
- **APIs that exist:** `/api/loyalty/balance`, `/api/exp-event`,
  `/api/cart/abandoned`, `/api/reviews`, `/api/orders/lookup`,
  `/api/newsletter`, `/api/checkout/orders`.
- **Config primitives that exist with real implementations:** `AudienceSegment`
  (17 files), `NamedSnapshot` (7), `ScheduledChange` (4), `ExperimentArm`.

**The gap that matters:** `products` has **no generic attributes column**, and
`scheniders-signature.ts` is **685 lines** of hardcoded perfume copy against
~80 lines for every other template.

## 3. Standing constraints (carried from the SOTA engagement)

1. **Zero hardcoding.** Everything renders from tenant data, `--bk-*` tokens or props.
2. **Root-cause fixes only.** No workarounds.
3. **Section back-compat.** Other templates share these sections. Default
   branches stay byte-identical; a Zod parse failure silently DROPS a section at
   render, so every schema change is additive-with-default.
4. **LTR only.** Never `<html dir>` / `dir="rtl"`.
5. **Arabic-first**, Iraqi dialect, judged in Arabic first.
6. **Mobile is the business.** Design and audit at 390px first.
7. **Never change the checkout wire contract.** `/api/checkout/orders` and its
   422 `new_price` self-heal are battle-tested. New capabilities get new
   endpoints; the existing contract is frozen.
8. **Publish discipline.** Work on `store_config_v2_draft` + a branch. Never
   publish config before the code that understands it is live on `main`. Respect
   the `store_config_rev` optimistic lock.
9. **Do not touch:** DNS/domains, WhatsApp/Interakt cutover, other tenants' data,
   other sessions' migrations.
10. **Supabase NEW project `sduvpgqwhxragxtxztur` only.** Storage keys must be
    ASCII/hex (Arabic → `InvalidKey`); `tenant-assets` caps at 512KB.

## 4. Architecture decisions

### D1 — Attribute system (P1)

Two tables, both tenant-scoped with RLS from creation.

```
product_attribute_defs           -- the taxonomy, per tenant
  id, tenant_id, key (ascii slug), name_i18n,
  kind: 'enum' | 'range' | 'group_list' | 'text' | 'boolean',
  options        jsonb   -- enum:       [{value, label_i18n, color?}]
  group_keys     jsonb   -- group_list: [{key, label_i18n}]  e.g. top/heart/base
  range_min, range_max, unit_i18n       -- range
  is_filterable, is_comparable, display_order
  unique (tenant_id, key)

product_attribute_values         -- values per product
  product_id, attribute_def_id, tenant_id, value jsonb
  primary key (product_id, attribute_def_id)
```

`value` shape follows `kind`: enum → `"oriental"`; range → `4.5`; group_list →
`{top:[...], heart:[...], base:[...]}`; text → `{en, ar}`; boolean → `true`.

- GIN index on `value`, btree on `(tenant_id, attribute_def_id)`.
- anon `SELECT` only for values of visible products; defs readable per tenant.
- Storefront `Product` type gains `attributes: Record<key, {def, value}>`.

**Why this shape:** one renderer per `kind` covers every niche. A merchant adding
"roast level" gets meters for free; adding "flavour notes" gets the pyramid for
free. No section knows the word "perfume".

### D2 — Layout variants, not section proliferation (P2)

One `product_attributes` section with a `layout` enum
(`pyramid | meters | table | chips | accordion`). Merchant picks in a dropdown.
The alternative — a section per presentation — yields ~40 near-duplicate entries
and an unusable picker. This rule applies program-wide: **new presentation is a
variant prop; new behaviour is a new section.**

### D3 — Auto-form: pickers, not a hints sidecar (P3) — REVISED 2026-09-09

**The original decision here was based on a wrong premise.** It claimed the
editor form is flat and proposed a `SectionUiHints` sidecar to add groups,
labels and conditional visibility. Reading the code first would have shown that
all three already exist, and by a better mechanism:

- `lib/section-field-groups.ts` sorts every field into essential / style / logic
  **by naming convention**, so new sections are covered with no authoring.
  A per-section sidecar would have been strictly worse: it only works for
  sections someone remembered to annotate.
- `lib/section-field-meta.ts` supplies localised labels and help in en/ar/ku,
  with per-section overrides.
- `isFieldEnabledBySiblings` already disables `*_value` / `*_label` when the
  matching `*_kind` is unset.
- `.describe()` already upgrades a string field to an image uploader, a colour
  picker or a textarea.

So the sidecar is rejected — not as a design, but as unnecessary. **The real
gap is resource pickers.** Section props include 13 `product_id`, three
multi-id fields (`pinned_product_ids`, `manual_product_ids`,
`manual_category_ids`), `category_slug`, and 24 `*_href` fields. Every one of
them is edited today by typing a raw UUID or a path by hand. That is the part
of the builder a merchant cannot use.

**Chosen:** a convention-based widget resolver (`lib/section-field-widgets.ts`),
matching how field groups already work — key name decides the control, so future
sections are covered automatically and no section file changes:

| Field name           | Control                                        |
| -------------------- | ---------------------------------------------- |
| `product_id`         | product picker, single                         |
| `*_product_ids`      | product picker, multiple + ordered              |
| `*_category_ids`     | category picker, multiple                      |
| `category_slug`      | category picker, single, stores the slug        |
| `*_href`             | link picker: page, category, product, or URL    |

Section schemas are untouched, so no Zod parse behaviour changes anywhere
(constraint 3).

### D4 — Offer engine (P5)

A1 bundles, A2 free-gift, A4 bump/upsell/downsell and A7 quantity ladder are one
thing: merchant-defined rules. Rules live in `store_config_v2.commerce.offers` —
merchant-editable in the builder, versioned, publishable, consistent with the
rest of the config.

```ts
interface OfferRule {
  id: string; enabled: boolean; label: string;
  placement: "pdp" | "cart" | "checkout_bump"
           | "post_purchase_upsell" | "post_purchase_downsell";
  trigger: { kind: "always" }
         | { kind: "product_in_cart";  product_ids: string[] }
         | { kind: "category_in_cart"; category_ids: string[] }
         | { kind: "subtotal_gte";     iqd: number };
  offer:   { kind: "product"; product_id: string; variant_id?: string }
         | { kind: "bundle";  product_ids: string[] }
         | { kind: "free_gift"; product_id: string };
  pricing: { kind: "fixed_iqd" | "percent_off"; value: number } | { kind: "free" };
  copy: { headline_i18n; body_i18n; accept_i18n; decline_i18n };
  on_decline?: { next_offer_id?: string };   // the downsell chain
}
```

**Post-purchase upsell and constraint 7.** Appending to a placed order must not
touch `/api/checkout/orders`. A new endpoint
`POST /api/checkout/orders/[id]/append` handles it, guarded by the order token
already issued at confirmation, and refuses once the order leaves `pending`.

### D5 — Order-status narratives (C4)

Per Ali's spec. `store_config_v2.commerce.order_status_narratives` maps each
order status to merchant-editable customer-facing copy:

```ts
Record<OrderStatus, {
  title_i18n; body_i18n; next_i18n;
  cta?: { kind: "whatsapp" | "phone" | "link" | "review"; label_i18n; value? };
}>
```

Shipped defaults (Iraqi dialect), with the WhatsApp-bot reality baked in:

| Status | Customer sees |
| --- | --- |
| `pending` | طلبك وصلنا. فريقنا راح يتواصل وياك عبر واتساب. — "ما وصلتك رسالة؟ اتصل بينا" → **tenant contact number** |
| awaiting confirm | دزينالك رسالة على واتساب — أكّد الطلب حتى نكمل. |
| `confirmed` | طلبك مؤكد ✅ قيد التحضير. |
| shipped / out for delivery | طلبك بالطريق. المندوب راح يتصل بيك. |
| `delivered` / `completed` | تم التسليم. شكراً! → review CTA (feeds C1) |
| `cancelled` / `returned` | Reason + reorder CTA |
| `no_answer` | حاولنا نتصل بيك وما ردّيت — راجعنا على واتساب |

Every string merchant-editable per status. The contact number comes from tenant
config — **never hardcoded**. `order_tracker` renders a visual timeline plus the
narrative for the current status. Lookup is phone + order number and must not
leak PII beyond the order it matches.

Confirmed statuses in use: `pending`, `confirmed`, `delivered`, `completed`,
`cancelled`, `returned`, `no_answer`. The exact full set is verified at the start
of Wave 4 before the narrative map is frozen.

### D6 — Niche content packs (P4)

Split the 685-line signature template into:

- **visual direction** — brand kit + section stacks (~120 lines, like its peers)
- **content pack** — `lib/store-templates/content-packs/<niche>.ts`, carrying
  copy, seed attribute taxonomy and starter categories.

`applyStoreTemplate(direction, pack)` composes them. Onboarding becomes: pick
niche → pick look. Packs: perfume, coffee, fashion, beauty, electronics, food,
services.

### D7 — Template versioning (P6)

When the flagship improves, merchants already on it should be able to pull the
improvement without losing customisation. Approach: templates carry a
`version` and a per-version **migration list**; a merchant's config records
`template_id` + `template_version` and which section instances they have edited
(dirty flags). Upgrading replays migrations, skipping dirty instances and
reporting them for manual review. Designed in Wave 6, not before — it needs the
section set to have stopped moving.

## 5. Waves

Sequencing is not cosmetic: **W1 unlocks roughly half the backlog.** Building
Ali's list in the order he gave it would mean rewriting most of it later.

### Wave 0 — Foundations & hygiene
- **W0.1** Worktree off `origin/main`, program plan committed. *(done)*
- **W0.2** Retire the fixed Candy pastels. *(done — `e073d856`)* Replaced
  `--bk-mint` / `--bk-lilac` / `--bk-sky` with `--bk-decor-a/b/c` + `--bk-on-decor`,
  derived from the accent hue at fixed offsets so they track the brand yet can
  never collapse into each other. Semantic uses (PDP in-stock, WhatsApp CTA)
  moved to `--bk-success` instead. Schema enum keys kept — they are Zod values.
- **W0.3** Shape and motion token adoption across the sections package.
  *(done)* 70 hardcoded `candy-*` utilities mapped to brand tokens (the Candy
  palette *is* `EMPTY_BRAND_KIT`, so a default-kit tenant renders unchanged);
  13 radii and 8 border widths moved to `rounded-bk-*` / `border-bk`; 37
  transition durations moved to `duration-bk-fast` / `duration-bk-base`, which
  makes `BrandMotion.speed` take effect for the first time. `--bk-motion`
  (on/off) was already correctly wired via `data-bk-motion` + `globals.css`.
- **W0.4** Sweep the V1 fallback renderers (`apps/storefront/components/schneiders/*`
  and the ~10 route pages that import them). They still hardcode `candy-*`
  utilities, so any tenant falling back to a V1 page gets an unthemeable
  palette. Separate surface from the section package, hence a separate task.

### Wave 1 — Keystones
- **W1.1** Migration: `product_attribute_defs` + `product_attribute_values`, RLS,
  indexes, anon grants. Regenerate `database.types.ts`.
- **W1.2** Shared types + storefront query join; `Product.attributes`.
- **W1.3** Platform: attribute taxonomy manager (define per tenant).
- **W1.4** Platform: per-product attribute editor.
- **W1.5** Widget resolver + product picker (single and multiple). *(revised —
  see D3; the original three tasks assumed a flat form that does not exist)*
- **W1.6** Category picker, and the link picker for every `*_href`.
- **W1.7** Attribute picker, once W2.1 defines what an attribute-driven section
  needs to reference.

### Wave 2 — Attribute-driven storefront
- **W2.1** `product_attributes` section with all five layout variants. *(B4, B5)*
- **W2.2** Facet filtering in `filterable-grid`, category and products pages. *(B2)*
- **W2.3** Attribute-similarity related products. *(B7)*
- **W2.4** Search: Arabic normalisation (ة/ه, ى/ي, hamza forms, diacritics),
  typo tolerance, facets, suggestions. *(E3, P17)*
- **W2.5** Product-finder quiz engine — questions map to attribute filters. *(B3)*

### Wave 3 — Money engine

**Revised 2026-09-09 after reading the code.** Much of this wave already
exists and is wired end to end: `commerce.bundles` + `computeBundleDiscounts`
(cart, checkout and the `product_bundles` section), `commerce.discounts`,
`commerce.loyalty` with a builder screen and `/api/loyalty/balance`, and
`commerce.cart_recovery` with a cron route. Building an `OfferRule` engine
over the top would duplicate working code. What is genuinely missing is the
checkout bump, the quantity ladder and the post-purchase upsell.

- **W3.0** *(done)* **Live P0.** `productRepository` read and wrote eight
  relations that did not exist, so every product save reported failure after
  the product had already been written — and `saveOrderBumps` /
  `saveTieredPrices`, the storage behind two approved features, could never
  have worked. Tables created; anon read split from members-only.
- **W3.1** ~~`OfferRule` schema~~ — superseded. Bundles and discounts already
  have a config home and a server-authoritative resolver.
- **W3.0.2** *(done)* **Second live P0**, found probing W3.4. `create_order_atomic`
  picked the next order number with `order_id LIKE prefix% AND created_at >=
  current_date`. `created_at` is editable (the LightFunnels importer stamps its
  own timestamp), so a backdated order carrying today's prefix was invisible to
  the scan — MAX returned 0 and every web checkout collided on `…001`. Fixed by
  scanning on prefix alone; verified live (`4260909002` issued).
- **W3.2** PDP + cart offer surfaces: bundles, free-gift progress bar. *(A1, A2)*
- **W3.3** Checkout order bump. *(A4a)*
- **W3.4** *(done)* Post-purchase upsell → downsell via `…/[id]/upsell` (GET lists,
  POST accepts). Offers are the merchant's existing order bumps. Ownership =
  order id + phone, status `new`, under an hour old. *(A4b)*
- **W3.5** Quantity ladder on PDP. *(A7)*
- **W3.6** Offer builder UI in the store builder.

### Wave 4 — Trust & post-purchase
- **W4.1** *(done)* Verified 13 statuses in production (no CHECK; `no_response`
  not `no_answer`; `return_pending` is the largest bucket). `commerce.
  order_status_narratives` + `resolveNarrative` with dialect defaults. *(C4)*
- **W4.2** *(done)* `lookup_order` gains an ADDITIVE `stage` column (ten
  customer stages; `status` keeps the four buckets so the deployed client cannot
  crash) and `review_product_slug`. Tracker rebuilt around the narratives:
  contact number from the tenant, CTA by kind, off-path stages keep the rungs
  they reached and mark none current. Verified in a browser for `placed` and
  `returning`. Builder screen for editing the narratives is **W4.2b**, still
  open. *(C4)*
- **W4.3** *(done)* `summarizeDelivery` reads the WHOLE shipping config: flat →
  state the fee upfront and count it in the total; varies → state the range and
  mark the total "before delivery"; ETA only when a rate declares one.
  `eta_hours` had never had a consumer. `delivery_promise` now reads ETAs and
  coverage from the config instead of hardcoded 6h/48h and an English list.
  Three copies of an hours formatter, one with the wrong Arabic plural,
  became `formatHours`. *(C2)*
- **W4.4** *(done, much smaller than planned)* Photo reviews were already built
  end to end: multipart `POST /api/reviews` storing `pending`, a submit form
  with photo upload in `product_reviews`, and a moderation page in the
  platform. The missing piece was the entry from a delivered order: the
  tracker's "rate your order" (W4.2) linked to `#reviews`, which did not exist.
  The section now carries the anchor and, on `#reviews`, scrolls to the form
  and focuses the first star. The WhatsApp "delivered" message that would
  carry the link is Interakt — out of scope. *(C1)*
- **W4.5** Authenticity block *(C5)* and open-on-delivery policy surface *(C3)*.
- **W4.6** Real inventory-driven urgency, replacing the evergreen countdown. *(P14)*

### Wave 5 — Identity & retention
- **W5.1** Phone-recognition autofill — returning COD customer types a number,
  gets name/governorate/address back. *(P15)*
- **W5.2** Loyalty earn on delivered + redeem at checkout. *(A3)*
- **W5.3** Referral codes. *(D3)*
- **W5.4** Abandoned-cart capture, storefront half only. *(A6 — Interakt is out of scope)*

### Wave 6 — Platform
- **W6.1** Niche content packs; signature refactored to direction + pack. *(P4)*
- **W6.2** Template versioning and upgrade migration. *(P6)*
- **W6.3** AI content seeding at onboarding. *(P8)*
- **W6.4** Section-level A/B in the builder. *(A5, P10)*
- **W6.5** Variants on the PDP. *(P13)*
- **W6.6** COD risk signals at checkout. *(P16)*
- **W6.7** Storefront funnel dashboard. *(G1)*
- **W6.8** Kurdish locale. *(P9)*

### Wave 7 — Craft
- **W7.1** View Transitions grid → PDP. *(F1)*
- **W7.2** Image pipeline audit: AVIF/WebP, correct `sizes`. *(F2)*
- **W7.3** Optimistic cart + designed skeletons. *(F3)*
- **W7.4** PWA / add-to-home-screen. *(F4)*
- **W7.5** schema.org product rich results. *(E2)*
- **W7.6** Arabic blog / guides. *(E1)*
- **W7.7** Video sections wired. *(E4)*
- **W7.8** Motion identity pass. *(H2)*
- **W7.9** Per-section performance + a11y budgets in CI. *(P11)*
- **W7.10** Storybook × variant visual regression. *(P12)*

## 6. Definition of done (every task)

1. `pnpm type-check` and `pnpm lint` pass — the CI gate.
2. Relevant `vitest` run locally. **CI does not run tests.**
3. DB changes: RLS + tenant scoping confirmed.
4. Section changes: default branch proven byte-identical (parity harness).
5. Verified at 390px first, then 1440px. Screenshot before/after for visual work.
6. One PR per task or per coherent group; config published only after the code
   that understands it is live on `main`.

## 6b. Final publish checklist (config, after the code is live on `main`)

Sections shipped in this program that the flagship's published config does not
yet place. Publish discipline: only after the deploy that understands them.

- `product_attributes` → `product` page (after `pdp_direct_order`).
- `product_finder` → `home` (below the hero) — needs per-product attribute
  values first, or it renders nothing.
- `post_purchase_offer` → `checkout_success` (before `product_grid`) — needs
  at least one order bump configured, or it renders nothing.
- `product_grid` on the catalog page: `enable_filters` is set by
  `deriveCatalogPage`, no config change needed.
- **Fix a false claim**: the product page's `trust_badge_row` says
  "Free delivery" in English while the Arabic says "توصيل لكل المحافظات" —
  delivery is 5,000 IQD below 75,000. Change the English label; do not ship a
  claim the checkout contradicts.
- **Replace the promo bar's content**: `globals.promo_bar` is
  `countdown_announcement` in `evergreen_minutes` (150 min). The code now
  renders that mode without a clock, so it degrades to a plain "discount
  offer" bar; the merchant decides what it should say (§5 item 1).
- Verified present already: `product_reviews` on `product`, `order_tracker` on
  `track`, `free_gift_strip` on `cart` (renders nothing until
  `commerce.free_gift` is set in the builder).

## 7. Out of scope

DNS flip to scheniders.com · WhatsApp/Interakt cutover · D1 repurchase reminders
and D2 VIP tiers (deferred by Ali) · H1 logo redesign (brand stays) · H3
editorial photography (revisit later) · other tenants' data.

## 8. Open merchant decisions carried forward

From the SOTA audit §5, still unanswered and still non-blocking: countdown
authenticity (superseded by W4.6), footer legal-name spelling, collection
curation, Instagram handle `@kawkab.brand`, the 18-hour delivery SLA.
