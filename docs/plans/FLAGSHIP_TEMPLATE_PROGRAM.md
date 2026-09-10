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
- **W0.4** V1 fallback sweep — DONE. Reachable, not dead: 13 live trial
  tenants have no published V2 config, and `templates/registry.tsx` (imported
  by the tenant home) serves the V1 template home. 300 fixed candy utilities
  across `components/schneiders/*`, `templates/*` and the route pages now read
  brand-kit tokens whose defaults ARE the candy hexes, so a default tenant
  renders byte-identically. Mint was split by meaning: WhatsApp, in-stock,
  free delivery, completed steps, the chosen payment method and the green
  "go" CTAs became `bk-success`; rotating tints, panels and hover accents
  became `bk-decor-a`. Two findings the sweep turned up and closed:
  `CANDY_HEX` in the tenant layout pinned each merchant's chosen accent pair
  to a fixed pastel (it now resolves to the matching kit token, with the
  readable foreground from `--bk-on-*`), and `--schn-wedge` was emitted on
  every tenant page with no reader anywhere — deleted, the live scale is
  `--bk-wedge-multiplier`. Also: the V1 product page rendered five fixed
  stars and a hardcoded "(124)" reviews for every product of every store;
  it now shows the product's real approved-review aggregates, and nothing
  when there are none. `v1-theming.test.ts` fails the build if a fixed candy
  utility or hex returns. *(P7)*

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
  `returning`. **W4.2b** builder screen — DONE: Settings → Advanced →
  "Order tracking messages" (`order-status-screen.tsx`), all ten stages,
  live preview through the same `resolveNarrative`. *(C4)*
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
- **W4.5** Open-before-paying promise *(C3)* — DONE (`3f2511ba`):
  `commerce.returns_policy.inspect_before_paying`, shipping-screen checkbox,
  PDP commitment line, delivery_promise callout gated on the switch.
  Authenticity *(C5)* is a fifth `trust_badge_row` entry on the publish
  checklist, pending Ali's confirmation of the wording.
- **W4.6** Honest countdown *(P14)* — DONE (`3f2511ba`): `evergreen_minutes`
  renders no clock (enum kept for parse back-compat); real low-stock urgency
  already ships on the PDP. Bar replacement content is §5 item 1.

### Wave 5 — Identity & retention
- **W5.1** Returning-shopper autofill — DONE. Device memory
  (`helpers/customer-memory.ts`, localStorage per tenant, 180-day TTL) written
  after a successful order and read back by both order forms; "Not you?"
  clears it. **Not** a server lookup by phone: an anon phone→address endpoint
  is a customer-enumeration hole. Server recognition needs OTP (WhatsApp
  channel), tracked under H3. *(P15)*
- **W5.2** Loyalty — DONE. Earn moved from placement (checkout.ts) to
  `trg_loyalty_order_changed` (migration `20260910120000`): credit on entering
  delivered/completed = points owed − net already earned; reversal on leaving
  that state capped at the current balance (ledger `earn_reversal`). Balance
  key = `loyalty_phone_key` (normalizeIraqiMobile shape). PDP gains the
  redeem box; both forms state "earn N points on delivery" (`formatPoints`).
  Verified by a rolled-back DO-block probe on production. *(A3)*
- **W5.3** Referral codes — DONE. `commerce.referral` {enabled,
  friend_discount_pct, friend_max_discount_iqd, referrer_points}; migration
  `20260910130000`: `referral_codes`, `referrals`, `mint_referral_code`,
  `referral_check` (one eligibility rule: known code, not self, buyer's first
  live order — indexed on `loyalty_phone_key(phone)`), `trg_referral_order_changed`
  paying/reversing referrer points on the loyalty ledger. Storefront:
  `/api/referral/code` (mint with order-ownership proof), `/api/referral/validate`
  (preview), `?ref=` capture (`helpers/referral-capture.ts`, 30 days), field on
  both order forms, share block on `order_confirmation`. Checkout applies the
  friend's discount only when no coupon matched and records the attribution.
  Settings on the loyalty screen. Rolled-back probe verified end to end. *(D3)*
- **W5.4** Abandoned-cart capture — DONE for the storefront: `checkout_form`
  already beaconed; `pdp_direct_order` now does too, gated on first form
  interaction so a remembered phone never beacons a product view. *(A6 —
  Interakt is out of scope)*

### Wave 6 — Platform
- **W6.1** Niche content packs — DONE. `lib/store-templates/content-packs/`:
  semantic `ContentPack` (hero/story/about/founder/pillars/trust/faq/delivery/
  pdp_policies/spotlights/collections/policies/testimonials/categories/
  attributes), eight packs, `resolveContentPack` (id | industry slug | DB
  name | Arabic), `applyContentPack` overlay by section type (covers both the
  generic directions and the signature's section set; empties fabricated
  press/stats/reviews). `scheniders-signature.ts` → `buildSignatureDirection(pack,
  facts?)`: `signatureDirection` (registry, no merchant facts) and
  `schenidersSignatureTemplate` (Scheniders' facts; parity snapshot taken
  before the split, ids normalised). `industry-seed-copy.ts` is a thin door onto
  packs (its invented testimonials removed). `starter-store.ts` stamps
  `config.template = {direction_id, pack_id, version, applied_at}` and exports
  `starterTaxonomy`; the seed route accepts `categories`/`attribute_defs` and
  inserts them under the member's RLS on a fresh seed; wizard copy is
  "what you sell → pick a look". *(P4)*
- **W6.2** Template versioning — DONE, and it retired three §6b steps.
  Directions carry a `version`; the signature is at **2** (it gained
  `product_finder` on home, `product_attributes` on product,
  `post_purchase_offer` on checkout_success — all three render nothing until
  the merchant has the data behind them). `lib/store-templates/upgrade.ts`
  keeps **no archive and replays no migration list**: it compares the store's
  actual sections against the direction's current definition, so it can only
  ever ADD a section the merchant does not have, at the template's own index —
  edited sections are reported and left alone, extra sections are never
  removed, and a store of unknown origin gets no plan rather than a guess.
  Screen: Settings → Advanced → "Template updates" (writes the draft through
  `applyConfig`, so it is undoable and publishes on the merchant's terms).
  *(P6)*
- **W6.3** AI content seeding — DONE. `lib/store-copy.ts` +
  `/api/ai/store-copy` (Anthropic via raw fetch, matching this app's two
  existing AI routes; `claude-opus-5`, `output_config.format` json_schema).
  The wizard's optional "what do you sell?" box turns one sentence into the
  store's voice — hero, story, about, founder line, three pillars, four
  trust labels, three FAQs, the bestsellers heading and the tagline — in
  Iraqi dialect plus English, previewed before the store is created and
  editable afterwards. Skipping it keeps the pack's words.
  **It writes voice, never facts or promises:** policies, the delivery
  promise, the PDP policy accordion, the taxonomy and testimonials all stay
  with the pack, and `containsFabricatedClaim` rejects the whole response if
  any line carries a number attached to money, time or a percentage — a
  hallucinated "توصيل خلال ٢٤ ساعة" can never be seeded as a promise nobody
  made. *(P8)*
- **W6.4** Section-level A/B — ALREADY PRESENT, verified: `assignAbArm` +
  `sb_vid` in `v2-page.tsx`, `ab_test` visibility rule in the variant editor,
  server-derived arm attribution on `store_config_experiment_events` at
  checkout, `aggregate_experiment_stats` in the experiments screen. *(A5, P10)*
- **W6.5** Variants on the PDP — DONE. `helpers/variant-store.ts` (zustand,
  per product id, not persisted; `useSelectedVariant`, `stockLeftFor`,
  picker registration). `pdp_variants` and `pdp_buy_box` write it;
  `pdp_direct_order` and `pdp_add_to_cart` read it. Direct-order: price /
  compare-at / stock per variant, inline pills when no picker section is on
  the page, required choice at submit, `variant_id` + `variant_name` on the
  line and the stash. `getProductVariants` filters `is_enabled`, orders by
  `display_order`, carries `reserved_quantity`/`compare_at_price`/`image_url`;
  a variant without a price sells at the product price. Production has zero
  variant rows today. *(P13)*
- **W6.6** COD risk signals — DONE. Migration `20260910140000`:
  `cod_risk_signals(tenant, phone, address)` (SECURITY DEFINER, revoked from
  anon/authenticated) reuses `risk_level_calc` / `value_tier_calc` and the
  `blacklist` table, adds duplicate-open-order (24 h, linked id), velocity
  (3 in 1 h) and thin-address (< 10 chars). `submitCheckout` stamps
  `risk_metadata` (`source: "storefront"`), `needs_attention`,
  `attention_reasons` via the existing `create_order_atomic` fields
  (`packages/shared/src/cod-risk.ts` shapes it; vocabulary
  clean/caution/high/blocked, newcomer/good/vip). Ops chips in the order card
  and the virtualized table (`COD_RISK_REASON_LABELS`). Rolled-back probe on
  real histories verified all four reasons. *(P16)*
- **W6.7** Storefront funnel — DONE. Migration `20260910150000`:
  `storefront_events` (RLS members-select, no anon) + `storefront_funnel`
  RPC (SECURITY INVOKER, unique visitors per stage, daily series, top viewed→
  bought). Storefront: `/api/events` batch beacon (visitor key from `sb_vid`
  only; `purchase` refused), `<FunnelBeacon>` in `v2-page` (page_view /
  view_product per render, sink for `trackPixel`), checkout route writes
  purchase rows per line with the server total. Platform: `useStorefrontFunnel`,
  `FunnelCard` in the Command Center (`command_center.funnel_*` strings).
  Verified: RPC probe rolled back; route/card/forwarding tests. *(G1)*
- **W6.8** Kurdish locale — DONE for the conversion path: `ku` added to the
  `STRINGS` tables of `cart_line_items`, `checkout_form`, `order_tracker`,
  `pdp_direct_order`, `search_results_grid` (111 entries), Kurdish shapes in
  `formatHours` / `formatPoints` / review counts, inline labels in
  `order_confirmation`, `sticky_cta_bar`, PDP ladder. `_kurdish-coverage.test.ts`
  guards those tables. Out of scope by design: merchant copy (builder Languages
  screen) and non-conversion sections (Arabic fallback via `LOCALE_FALLBACKS`).
  *(P9)*

### Wave 7 — Craft
- **W7.1** View Transitions grid → PDP. *(F1)*
- **W7.2** Image pipeline — DONE, and smaller than the plan assumed. The
  config was already right (AVIF + WebP, a 390 device size, Supabase remote
  pattern) and all 22 `fill` images in `packages/sections` already declared
  `sizes` — the V2 path had no bug. The 6 that did are in the V1/legacy
  components, the same path W0.4 fixed: an 80px cart thumbnail with no
  `sizes` defaults to `100vw`, so a 390px phone fetched a ≥640px file for it.
  Fixed with the real slot widths (80px thumbs, `20vw/10vw` strip,
  `(max-width:768px) 100vw, 50vw` gallery, `100vw` hero) and two
  below-the-fold avatars made `loading="lazy" decoding="async"`.
  `image-sizes.test.ts` walks the source — the bug is a missing attribute, so
  only the source can prove it is gone. *(F2)*
  *(A first pass of this audit reported 14 offenders; the regex only matched
  `sizes="…"` and missed `sizes={…}`. The real count was 6.)*
- **W7.3** Optimistic cart + designed skeletons. *(F3)*
- **W7.4** PWA / add-to-home-screen. *(F4)*
- **W7.5** Rich results — DONE. `lib/seo.ts` gains `shippingDetailsJsonLd`
  (real fee, one value when flat and a min/max when governorates differ,
  transit time only from a published ETA), `returnPolicyJsonLd` (the
  merchant's own window; no claim about who pays the courier),
  `faqPageJsonLd` + `faqItemsFromPage` (the questions the page actually
  renders, from `faq_accordion` / `faq_contact_split`), and `itemListJsonLd`
  for collections. The product offer also carries `sku` and `seller`.
  `itemCondition` and `priceValidUntil` are deliberately NOT emitted — a
  store may sell open-box goods and sets no price expiry; a missing
  recommended field is a warning, a wrong one is a lie in a search result.
  Verified live against the flagship: 5,000 IQD flat shipping, no returns
  policy (unset), no rating (no approved reviews), 5 real FAQ questions,
  collections of 7 and 5 real products. *(E2)*
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

- **The three unplaced sections are now a template update, not manual config
  surgery.** The signature direction is at v2 and places `product_attributes`
  (product), `product_finder` (home) and `post_purchase_offer`
  (checkout_success). Open Settings → Advanced → "Template updates", take all
  three into the draft, then publish. Each renders nothing until its data
  exists (attribute values / an order bump), so publishing them early is safe.
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
