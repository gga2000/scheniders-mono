# PDP Redesign — Slice 1g (Add to Cart on the Express PDP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ali's request of 2026-10-30: put an «أضف للسلة» button side by side with «ثبّت طلبي» on scheniders-iraq's express PDP. The WhatsApp tile that 1f restored stays beside them. Adding to the cart uses the chosen variant and quantity, never submits the direct order, says «انضافت للسلة» with a «شوف السلة» link, and makes the cart count pop in the header. The header gets a cart chip on the product page (the overlay header today has none) and the cart pill on every other page, so the existing `/cart` → `/checkout` → order path is reachable for the first time. All of it is opt-in by prop, so every other tenant's markup stays byte-identical. scheniders-iraq's draft config is written by a guarded migration that is applied only after the code is live.

**Architecture:** `pdp_direct_order` gains `add_to_cart` (optional, `.catch`-guarded). When it is on, `CheckoutRow` puts a `CartTile` (`type="button"`) between the WhatsApp tile and the submit, and a `CartAddedStatus` live region as a `basis-full` item that wraps under them. Both sit inside the existing order-buttons row, so no sibling slot moves anywhere else and no `useId` path changes. The tile builds its line with a pure `expressCartLine()` from the express model (`unitPrice` and `focusVariantChoice` are new on the model; the second is extracted from `onSubmit` unchanged), calls `useCart().addItem` and fires `trackPixel("AddToCart")` the way `pdp_add_to_cart` does. In draft view no pixel or funnel sink is installed, so that call records nothing. `site_header` gains `overlay_cart`: the overlay surface renders a glass cart chip beside the menu chip, and `useCartBump()` pops its ink badge on a real add, never when the saved cart loads. The draft write is one guarded SQL migration with three `||` patches (the pdp base, the header base, the header's product variant override). It is replayed on PGlite over a read-only copy of the live row with 1f applied first, dry-run live as a SELECT, mirrored by the redesign fixtures, and applied after merge and deploy.

**Tech Stack:** Next.js 16 / React 19 sections package (`@scheniders/sections`), zustand (+ `persist`), zod v4, Tailwind v3.4 (storefront) / v4 (platform), vitest 2 (node + jsdom, @testing-library/react), Supabase CLI 2.98 (`db query --linked`, `migration repair`), PGlite 0.2.17 (local replay only, outside the repo), pnpm 10, Node 20.

**Spec / context:** `docs/superpowers/specs/2026-10-27-pdp-lower-page-redesign-design.md`: hard constraints, D4 (colour lock), D11 (checkout body unchanged), §1.2 F12 (term sheet / string tables), §1.9 (draft-migration guards), §1.10 (verification). The merchant decision itself: Ali, 2026-10-30, «أضف للسلة» **side by side** with «ثبّت طلبي» (he chose this over "under it" and over "only on other perfumes"), with the WhatsApp tile staying. This plan builds on slices 1a–1e (merged, `origin/main` `71833255`) and **1f (`feat/pdp-p1f-sticky-copy`, head `2e69cbb0`). 1f must be merged and its draft migration applied before Task 0.** From 1f it uses: `_copy-terms.ts` `COPY_ACTIONS`, `_arabic-copy-lint.test.ts`'s "one name per action" test, `SLICE_1F_PDP_PATCH` / `SLICE_1F_STICKY_PATCH` in `_pdp-redesign-fixtures.ts`, the 1f redesign-snapshot keys, the 1f migration `20261030081155_scheniders_iraq_pdp_redesign_1f_draft.sql`, and the post-1f draft md5 `56df97c58591dbc66724198b6b02dae8`. **Task 0 re-reads all of these and the live guard values, and the plan pins whatever they are at that point.**

---

## What the live draft holds today (read-only, 2026-10-30)

Read with `supabase db query --linked` on `sduvpgqwhxragxtxztur`, slug `scheniders-iraq`. At the time of reading the draft is post-1e (`38, 89b6499d…`). 1f, replayed on PGlite over that copy, produces `56df97c5…`, the value the caller gave.

| Area | Finding | Verdict |
|---|---|---|
| Pages | `cart` (cart_line_items, cart_summary, trust_strip, sticky_cta_bar), `checkout` (checkout_form, checkout_order_summary, trust_strip), `checkout_success` (order_confirmation, product_grid). The cart and checkout pages are **identical in draft and published** (page md5 `aeb2219e…` / `a80eb748…` on both sides). | They exist and already work: localhost `/s/scheniders-iraq/cart` and `/checkout` render at 390px with no horizontal scroll (seeded cart, screenshots). |
| Payment | `checkout_form.payment_methods = ["cod"]`. The submit reads «أكّد الطلب — {total}». | COD only ✓ |
| Governorates | The checkout `<select>` lists 18 Arabic names with codes (`BG` بغداد … `SA` صلاح الدين). | ✓ |
| Delivery | `commerce.shipping = {"default_rate":{"fee_iqd":0}}`. Cart and checkout summaries show «التوصيل: مجاني». The trust strip says «توصيل مجاني لكل المحافظات». | Free ✓ |
| Language | Arabic default, `enabled_locales ["ar","en"]`. Every cart/checkout string is Arabic-first. | ✓ |
| Header | `globals.header` 33c6a493: `floating_pill`, **`show_cart: false`**. Product-page variant 4c9e2b71 overrides `{"sticky": false, "surface": "overlay"}`. The overlay header (`site_header.overlay.tsx`) **renders no cart at all**, whatever `show_cart` says. | **No cart icon anywhere**, which is why `/cart` and `/checkout` are URL-only. Fixed by Tasks 6 and 7. |
| Cart sticky bar | Cart page `sticky_cta_bar` aee18fed: chunky, «متابعة» → `/checkout`, WhatsApp «تواصل». | Works; restyle deferred (scope decision 9). |
| Products | No variants, no tiers, no order bumps on any active product. Two products have negative stock (برسيفيرون −84, فيوجن −6), so they render sold out. | The code still handles variants and tiers, which the tests cover. Sold out shows no tile. |
| Look | Cart and checkout are the older Candy Bento sections: thick ink outlines, line prices and totals in **yellow text** (`text-bk-primary`: cart_line_items.client.tsx:156, cart_summary.client.tsx:207, checkout_order_summary.client.tsx:189), and long catalogue titles truncated («عطر ويفر انتنس ا…»). | Works, but is off the redesign. Follow-up slice 1h (scope decision 9). |

---

## Scope decisions (read before starting)

1. **One row of three at 390px and down to 360px.** Ali chose side by side, and the WhatsApp tile stays beside «ثبّت طلبي», so the row is `[WhatsApp 64px] [أضف للسلة 84px] [ثبّت طلبي flex-1]` in DOM order. Like today's row this is not reversed: in Arabic the primary sits at the right, where reading starts, then the cart tile, then WhatsApp at the left edge. The DOM order is also the focus and reading order. Measured with the live fonts (Cairo) on localhost, with these exact sizes injected: at 360px the column is 328px, giving WhatsApp 64 + cart 84 + submit **164** with «ثبّت طلبي» (84.7px at 19px/900) on one line; at 390px the submit is 194. There is no horizontal overflow at either width, and every target is ≥60px tall (the row stretches to the submit's `min-h-[60px]`).
2. **The submit stays the heaviest element.** It keeps yellow (`bg-bk-primary`, D4), its 19px/900 label, the arrow chip and the sheen. In cart mode it only gives up side padding (`px-5`→`px-3`, `gap-3`→`gap-2`) and gains `min-w-0`, appended last in `cn()` so twMerge drops the two old classes. The WhatsApp tile's class string is untouched (width included), so its markup cannot drift.
3. **The cart tile is a secondary outline tile in the WhatsApp tile's grammar**: icon over a label, `w-[84px]`, `border-bk border-bk-ink bg-bk-surface text-bk-ink`, `shopping_bag` 22px over «أضف للسلة» at 12px/700 (60.5px wide; Kurdish «خستنە سەبەتە» 66.1, English 56.6, all inside 70px). There is no yellow fill (D4: only the order actions) and no green (D4: WhatsApp and success). It is `type="button"` inside the order form, so it can never submit and never triggers the form's validation. `onFormFocus` only counts inputs and selects, so focusing the tile fires no InitiateCheckout either.
4. **Feedback is a line, not a label swap.** The tile keeps its label, so a second tap adds again. Under the row, a `role="status"` paragraph (always in the row while cart mode is on, so the first insert is announced) shows ✓ «انضافت للسلة» · «شوف السلة» (a `StoreLink` to `/cart`, `min-h-11`). Its text is keyed by the add count so that a repeat add is announced again. The check is `text-bk-success`, which D4 allows for a success state. The line is a `basis-full` flex item of the same row (`flex-wrap` only in cart mode), so it sits **under the buttons and never moves the receipt or total above them**. It pushes the promise band down 52px only after an add. Empty, it costs the row-gap (8px).
5. **What is added = what the form would order.** That is the express model's chosen variant and the stepper's `qty`, at `unitPrice` (the ladder applied to `price`, which already folds in the variant and any server price correction), with `base_price: price` and the ladder so the cart re-prices exactly like `pdp_add_to_cart` lines. While a variant is owed, the tile adds nothing and calls `focusVariantChoice()`. That is the submit's own variant hand-off, extracted verbatim from `onSubmit` into a model function (behaviour pinned by `_pdp-variants.test.tsx`). Sold out (`m.oos`) shows no tile and no status line. While the order is being placed (`m.submitting`) the tile is disabled.
6. **The line's `name` is `displayNameOf(product)` («ويفر انتنس»), not the long catalogue title.** `name` is display-only: `submitCheckout` snapshots `short_name || products.name` from the catalogue (apps/storefront/app/actions/checkout.ts:650-661), so the order book is unaffected, while cart and checkout stop truncating «عطر ويفر انتنس الفاخر من باريس كورنر…». An accepted order bump is **not** carried into the cart: the cart offers none, and the bump discount is valid only beside its parent in the same direct order. scheniders-iraq has no bumps today.
7. **Pixel parity, draft view silent.** `trackPixel("AddToCart", pixelContentsFromItems([{product_id, price: unitPrice, quantity}]))`, the same call `pdp_add_to_cart` makes. It also forwards `add_to_cart` to the first-party funnel. In draft view the storefront layout skips `SchneidersAnalyticsPixels` (`!tenant.is_draft_view`, layout.tsx:230) and v2-page skips `FunnelBeacon` (`!draftView`), so neither `fbq`/`ttq` nor a funnel sink exists, and the call is a no-op. That is the same mechanism that already silences this form's InitiateCheckout and Purchase. No extra flag is needed.
8. **The smart sticky bar (1f) is unchanged.** Its one job is the direct order: «اطلب الآن» → «كمّل طلبك» → «ثبّت طلبي», never a submit (D6). With `hide_while: "form"` it is already hidden while the button row is on screen. A cart state would add a third action to a 54px bar and blur D6. The cart count lives in the header chip, which is visible on the same screen.
9. **Cart and checkout pages: verified, not restyled here.** The path works today (above). Making those pages look like the redesign means opt-in props on three more sections (`cart_line_items`, `cart_summary`, `checkout_order_summary`: ink prices, soft surfaces) plus one action name across the path: the cart's «متابعة الدفع» / «متابعة» and the checkout submit «أكّد الطلب» (chrome, checkout_form.client.tsx:100, also quoted in the reprice message at :132) against the PDP's «ثبّت طلبي». That is a separate subsystem with its own baselines, so it is proposed as **slice 1h**, in Task 11's hand-offs. 1g ships the path end to end; its only cart-page effect is the header pill (Task 7).
10. **Header: `overlay_cart` is opt-in and also needs `show_cart`.** The overlay has never honoured `show_cart` (its default is `true`), so wiring `show_cart` alone would change the markup of every overlay header. A new `overlay_cart` (`.catch`-guarded) gates the chip, and `_site-header-overlay-baseline-snapshot` (Task 1, written **before** the header code) freezes today's overlay renders for the iraq props and the defaults. The badge is ink on surface (`bg-bk-ink text-bk-surface`, 12px), not yellow (D4). The pop is a 300ms `scale-125` transition (`motion-reduce:transition-none`), not new keyframes: `ExpressMotion`'s CSS ships in baseline markup and must not change.
11. **`useCartBump()` pops on adds only.** A rise in the count is an add only when the store had already hydrated at the count before it. So the persisted cart arriving after mount (`CartHydrator`, `skipHydration: true`) does not pop, and neither does a header remounting on client navigation, because the hook's first value is the live store count. It reads the store directly. The prop count stays the `mounted`-gated one from `SiteHeaderRender`, so SSR markup shows `(0)` and there is no hydration mismatch.
12. **Draft config (merchant content) = three keys.** `pdp_direct_order.add_to_cart: true`. `site_header` base `show_cart: true`: the solid header on every other page shows the cart pill, so a shopper who added on the PDP can get back to the cart from home, category, about and so on. **Ali signs this off** (it is visible on every page once published). `site_header` product variant override `overlay_cart: true`. No copy is written into config. The three new strings are chrome (`EXPRESS_STRINGS`): ar/en/ku, on the string-table list, and covered by `_kurdish-coverage` and the F12 lint. «أضف للسلة» and «شوف السلة» join `COPY_ACTIONS`.
13. **Guards, stamp, apply** follow 1b–1f exactly: `STAMP=$(date -u +%Y%m%d%H%M%S)` sorting after 1f's file and after the remote history's max version (on 2026-10-30 the remote already held `20261030082454`, `…082958` and `…083119`, which are not in main's folder). The guards are the whole-draft md5, `store_config_rev`, an already-applied no-op, and an unchanged published md5. Apply with `supabase db query --linked -f` and record with `supabase migration repair --status applied`. Never `db push`. Nothing is applied before the code PR is merged and production serves it.
14. **Frozen first.** Every existing baseline stays byte-identical (pre-run: 16 baseline files, 167 tests, CI mode, no `written`/`updated`/`obsolete`). The only snapshot that changes is the opted-in redesign snapshot, in one reviewed commit (Task 8: six pdp renders change **only inside the order-buttons row**, plus two new header renders), checked by `snapcheck.mjs`. The one new baseline file (Task 1) is written once, before the code it guards.

## Conventions for every task

- **Worktree.** `/Users/ali/scheniders-mono-pdp` serves reviewers and a dev server on :3001, so **do not switch its branch**. Work in a dedicated worktree:
  ```bash
  export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"
  cd /Users/ali/scheniders-mono-pdp-1g
  ```
  (Task 0 Step 1 creates it.)
- pnpm only. Never npm/yarn. Node 20 (Node 24 crashes `pnpm install`).
- Tests: `CI=true pnpm exec vitest run <path>` from the repo root. `CI=true` never writes a snapshot. Only **Task 1 Step 3** (a new baseline file) and **Task 8 Step 6** (`-u`, one file) run vitest without `CI=true`.
- vitest prints coloured output; the expected lines below are plain text (`Tests  4 passed (4)`).
- Sections type gate (expected **no output**):
  ```bash
  (cd packages/sections && ./node_modules/.bin/tsc --noEmit --incremental false -p tsconfig.json --rootDir .. 2>&1 | grep "error TS" | grep -v TS6059 | grep -v -E "^src/(RenderSection\.sticky|_chrome-baseline-snapshot|_chrome|_delivery-promise|_pdp-classic-snapshot|image-gallery-order|product_attributes|helpers/whatsapp|pdp_express/checkout-row\.receipt)\.test\.tsx?\(")
  ```
- Before every commit: `git branch --show-current` → `feat/pdp-p1g-add-to-cart`.
- Commit with explicit paths only, as gga2000, with the trailer (lint-staged runs `eslint --fix` on staged files):
  ```bash
  git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```
- Banned in new code: `any`, `@ts-ignore`, `eslint-disable`, a non-null `!` that silences the compiler, swallowed catches, hex/rgb colour literals in source, and any `dir` attribute. Solid yellow (`bg-bk-primary`) stays only on the submit. The new tile and the header badge use ink. Green (`bk-success`) appears only on the WhatsApp tile (unchanged) and the success check.
- **Never run `vitest -u`** except at Task 1 Step 3 and Task 8 Step 6. If a baseline fails, the code changed a default render: fix the code.
- All live database access before Task 10 is **read-only** (`SELECT`, or a `DO` block replayed on PGlite).
- Expected counts below were pre-run on `origin/main` `71833255` with `feat/pdp-p1f-sticky-copy` (`2e69cbb0`) merged in, plus the exact code of this plan, in a throwaway worktree, against live read-only data of 2026-10-30. The live draft was then post-1e, so the 1g migration was replayed and dry-run on PGlite with 1f's migration applied first. That produced `56df97c5…` before 1g and `aa676deb…` after.

## File structure

| File | Status | Responsibility |
|---|---|---|
| `packages/sections/src/_site-header-overlay-baseline-snapshot.test.tsx` (+ `.snap`) | create | today's overlay header, frozen before the header code |
| `packages/sections/src/pdp_express/strings.ts` | modify | `addToCart`, `addedToCart`, `viewCart` (ar/en/ku) |
| `packages/sections/src/_copy-terms.ts` | modify | `COPY_ACTIONS.addToCart`, `.viewCart` |
| `packages/sections/src/_arabic-copy-lint.test.ts` | modify | one name per action covers the two new actions |
| `packages/sections/src/pdp_express/model.ts` | modify | `unitPrice`, `focusVariantChoice` |
| `packages/sections/src/pdp_direct_order.client.tsx` | modify | `focusVariantChoice()` extracted from `onSubmit`; both passed to the model |
| `packages/sections/src/pdp_express/cart-line.ts` (+ `.test.ts`) | create | `expressCartLine()`: the cart line the tile adds |
| `packages/sections/src/pdp_direct_order.tsx` | modify | `add_to_cart` prop |
| `packages/sections/src/pdp_express/cart-action.tsx` | create | `CartTile`, `CartAddedStatus` |
| `packages/sections/src/pdp_express/checkout-row.tsx` | modify | the three-target row + status line in cart mode |
| `packages/sections/src/_pdp-express-cart.test.tsx` | create | prop, markup, jsdom behaviour, pixel parity |
| `packages/sections/src/helpers/cart-bump.ts` | create | `useCartBump()`, `CART_BUMP_MS` |
| `packages/sections/src/site_header.tsx` | modify | `overlay_cart` prop |
| `packages/sections/src/site_header.client.tsx` | modify | passes `cart` to the overlay |
| `packages/sections/src/site_header.overlay.tsx` | modify | the cart chip beside the menu chip |
| `packages/sections/src/_site-header-overlay-cart.test.tsx` | create | prop, server markup, live count, pop |
| `packages/supabase/migrations/<STAMP>_scheniders_iraq_pdp_redesign_1g_draft.sql` | create | the guarded draft write |
| `packages/sections/src/_pdp-redesign-fixtures.ts` | modify | `SLICE_1G_*`, header fixtures |
| `packages/sections/src/_pdp-redesign-snapshot.test.tsx` (+ `.snap`) | modify | 1g mirror + parse; header renders; one reviewed snapshot update |
| `tmp/pdp-1g/` (`snapcheck.mjs`, `dryrun-1g.sql`, `header-base.json`, `page.html`) | scratch (gitignored) | read-only checks |
| `${TMPDIR:-/tmp}/pdp-1g-pglite/` | scratch (outside the repo) | PGlite replay harness |

---

### Task 0: Worktree, baseline, live guard values, and 1f as it landed

- [ ] **Step 1: A dedicated worktree off main (1f merged and applied)**

```bash
export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"
cd /Users/ali/scheniders-mono
git fetch origin
git log --oneline -3 origin/main
git worktree add -b feat/pdp-p1g-add-to-cart ../scheniders-mono-pdp-1g origin/main
cd /Users/ali/scheniders-mono-pdp-1g
CI=true pnpm install --frozen-lockfile
mkdir -p packages/supabase/.temp && cp /Users/ali/scheniders-mono/packages/supabase/.temp/* packages/supabase/.temp/
git branch --show-current
```
Expected: the log shows the merge of `feat/pdp-p1f-sticky-copy` (or a later commit); `pnpm install` ends `Done`; the branch is `feat/pdp-p1g-add-to-cart`. (If `git fetch` times out on SSL, re-run it. The 2026-10-30 pre-run hit one timeout.)

- [ ] **Step 2: Baseline counts on the untouched branch**

```bash
CI=true pnpm exec vitest run packages/sections/src packages/shared/src apps/storefront/lib
CI=true pnpm exec vitest run packages/sections/src
CI=true pnpm exec vitest run packages/sections/src/_pdp-redesign-snapshot.test.tsx packages/sections/src/_arabic-copy-lint.test.ts packages/sections/src/_kurdish-coverage.test.ts
```
Expected, if 1f landed as `2e69cbb0`: `Test Files  214 passed (214)`, `Tests  2557 passed (2557)`; sections alone `Test Files  144 passed (144)`, `Tests  1572 passed (1572)`; the last run `Tests  58 passed (58)` (redesign snapshot 39 + copy lint 6 + Kurdish coverage 13). **Write down whatever prints.** Task 9 adds 1g's delta (+4 files, +34 tests).

- [ ] **Step 3: Read 1f's code as it landed**

```bash
grep -n "  guarantee: \"كرت الضمان\",\|^} as const;" packages/sections/src/_copy-terms.ts
grep -n "closeSheet:" packages/sections/src/pdp_express/strings.ts
grep -n "SLICE_1D_ACCORDION_PATCH.heading_i18n.ar" packages/sections/src/_arabic-copy-lint.test.ts
grep -n "^export const SLICE_1F\|^export const IRAQ_REDESIGN_PDP_PROPS\|^  \.\.\.SLICE_1F_PDP_PATCH,\|^import type { Props as ReviewsProps }" packages/sections/src/_pdp-redesign-fixtures.ts
grep -n "^import sticky_cta_bar\|^  SLICE_1F_STICKY_PATCH,\|the patched props satisfy the schema unchanged" packages/sections/src/_pdp-redesign-snapshot.test.tsx
ls packages/supabase/migrations | grep -E '^[0-9]{14}_' | sort | tail -2
```
Expected:
- `_copy-terms.ts`: `guarantee: "كرت الضمان",` directly before the `} as const;` that closes `COPY_ACTIONS`;
- `strings.ts`: `closeSheet: { en: "Close", ar: "إغلاق", ku: "داخستن" },` as the table's last entry;
- the lint test's one-name test ends with `expect(REDESIGN.SLICE_1D_ACCORDION_PATCH.heading_i18n.ar).toBe(COPY_ACTIONS.guarantee);`;
- the fixtures export `SLICE_1F_PDP_PATCH` (`show_whatsapp: true`), `IRAQ_REDESIGN_PDP_PROPS` ending `...SLICE_1F_PDP_PATCH,` then `};`, `SLICE_1F_STICKY_PATCH` and `IRAQ_REDESIGN_STICKY_INPUT`, and import `import type { Props as ReviewsProps } from "./product_reviews";`;
- the snapshot test imports `sticky_cta_bar`, lists `SLICE_1F_STICKY_PATCH,` last before `} from "./_pdp-redesign-fixtures";`, and has the test "the patched props satisfy the schema unchanged";
- the last two migration files are `…_scheniders_iraq_pdp_redesign_1e_draft.sql` and `20261030081155_scheniders_iraq_pdp_redesign_1f_draft.sql`.

**Where 1f landed differently, adapt only these anchors:** the `old_string`s in Task 2 Steps 1 and 3, Task 8 Steps 1 and 3.

- [ ] **Step 4: The CLI link, the guard values, 1f applied, and the header as stored**

```bash
cat packages/supabase/.temp/project-ref; echo
cd packages
supabase db query --linked "SELECT store_config_rev, md5(store_config_v2_draft::text) AS draft_md5, md5(store_config_v2::text) AS pub_md5 FROM tenants WHERE slug='scheniders-iraq'" -o csv
supabase db query --linked "SELECT version, name FROM supabase_migrations.schema_migrations WHERE version >= '20261030' ORDER BY 1" -o csv
supabase db query --linked "SELECT store_config_v2_draft->'globals'->'header'->>'id' AS header_id, md5((store_config_v2_draft->'globals'->'header'->'base')::text) AS header_base_md5, jsonb_array_length(store_config_v2_draft->'globals'->'header'->'variants') AS nvariants, store_config_v2_draft->'globals'->'header'->'variants'->0->>'id' AS variant_id, (store_config_v2_draft->'globals'->'header'->'variants'->0->'override')::text AS override FROM tenants WHERE slug='scheniders-iraq'" -o csv
supabase db query --linked "SELECT s.sec->'base'->>'show_whatsapp' AS show_whatsapp, s.sec->'base'->>'add_to_cart' AS add_to_cart FROM tenants t, jsonb_array_elements(t.store_config_v2_draft->'pages') p(page), jsonb_array_elements(p.page->'sections') s(sec) WHERE t.slug='scheniders-iraq' AND p.page->>'page_id'='product' AND s.sec->>'id'='aae22169-cef4-4495-842b-863a7caa71c2'" -o csv
supabase db query --linked "SELECT p.page->>'page_id' AS page, md5(p.page::text) AS page_md5 FROM tenants t, jsonb_array_elements(t.store_config_v2_draft->'pages') p(page) WHERE t.slug='scheniders-iraq' AND p.page->>'page_id' IN ('cart','checkout','checkout_success')" -o csv
cd ..
```
Expected:
- `sduvpgqwhxragxtxztur` (never the OLD `ibfdugifekivquwprqjc`);
- `38,56df97c58591dbc66724198b6b02dae8,a6f87ba3181b0e94f41ba4a700de257b` (post-1f; pre-run: 1f replayed on PGlite over the live post-1e row gives exactly `56df97c5…`);
- the history lists `20261030081155,scheniders_iraq_pdp_redesign_1f_draft` (and `…082454`, `…082958`, `…083119`, which are not in the folder: scope decision 13);
- `33c6a493-5926-46e1-a45f-929f63fff21f,ee7d30260ead751643e55861b8bcd362,1,4c9e2b71-8d3a-4f6e-a1b2-7e5d9c0f3a42,"{""sticky"": false, ""surface"": ""overlay""}"`;
- `true,NULL` (1f's WhatsApp tile on, no cart yet);
- `cart,aeb2219efbc9ab502731585a7da9dc5d`, `checkout,a80eb7485fdc2cafa1949608b7f2da2f`, `checkout_success,f2f496976cb5bda8689a1e589b21f097` (the pages verified above, untouched by 1g).

**If the draft md5 or the rev differs, the migration pins the values read now.** Put them in Task 7 Step 2 (`c_expected_draft_md5`, `c_expected_rev`, the header's guard c. and Rollback lines) and Step 6's dry-run literals. Task 7 Step 5 then prints new md5s: use those in Tasks 7 and 10. **If the header base md5, the variant id or the override differ,** the merchant edited the header: re-read it, update `IRAQ_DRAFT_HEADER_BASE` / `IRAQ_DRAFT_HEADER_PRODUCT_OVERRIDE` in Task 8 Step 1 and the migration's Rollback. **If 1f is not recorded,** stop: 1f's Task 15 has not run.

---

### Task 1: Freeze today's overlay header (before any header code)

**Files:**
- Create: `packages/sections/src/_site-header-overlay-baseline-snapshot.test.tsx`
- Create (written by vitest, once): `packages/sections/src/__snapshots__/_site-header-overlay-baseline-snapshot.test.tsx.snap`

The overlay surface has no baseline of its own (`_chrome-baseline-snapshot` predates it). Task 6 changes `site_header.overlay.tsx`, so today's renders are frozen first.

- [ ] **Step 1: Write the baseline test**

Create `packages/sections/src/_site-header-overlay-baseline-snapshot.test.tsx`:

```tsx
// =====================================================================
// site_header overlay surface — frozen before slice 1g
// =====================================================================
// Server markup of the overlay header (floating_pill + surface "overlay")
// as it renders on scheniders-iraq's draft product page today, and with
// the section defaults (show_cart true, which the overlay has never
// honoured). Slice 1g adds an opt-in cart chip (`overlay_cart`); without
// it these renders must stay byte-identical. A diff is a back-compat
// break, not a snapshot to refresh.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocaleCode } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import site_header, { type Props } from "./site_header";
import type { Tenant } from "./types";
import { SIGNATURE_HEADER_PROPS, fixtureTenant, productCtx, productRuntime, saleProduct } from "./_pdp-fixtures";

const bilingualTenant: Tenant = {
  ...fixtureTenant,
  store_config_v2: { enabled_locales: ["ar", "en"] },
};

/** The draft's product-page variant: the base with sticky off and the
 *  overlay surface (variant 4c9e2b71, read 2026-10-30). */
const IRAQ_PRODUCT_HEADER: Props = { ...SIGNATURE_HEADER_PROPS, sticky: false, surface: "overlay" };
const DEFAULTS_OVERLAY: Props = { ...site_header.defaultProps, layout: "floating_pill", surface: "overlay" };

function render(props: Props, locale: LocaleCode): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <site_header.render
        props={props}
        ctx={productCtx(saleProduct, { tenant: bilingualTenant, runtime: { ...productRuntime, locale } })}
      />
    </StoreBaseProvider>,
  );
}

describe("site_header overlay baseline", () => {
  it.each(["ar", "en"] as const)("scheniders-iraq product header, %s", (locale) => {
    expect(render(IRAQ_PRODUCT_HEADER, locale)).toMatchSnapshot();
  });

  it.each(["ar", "en"] as const)("defaults with the overlay surface, %s", (locale) => {
    expect(render(DEFAULTS_OVERLAY, locale)).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Confirm no header code has changed yet**

```bash
git status --porcelain packages/sections/src/site_header*
```
Expected: no output.

- [ ] **Step 3: Write the snapshot (new file: the one permitted write)**

```bash
pnpm exec vitest run packages/sections/src/_site-header-overlay-baseline-snapshot.test.tsx
grep -c "shopping_bag" packages/sections/src/__snapshots__/_site-header-overlay-baseline-snapshot.test.tsx.snap
CI=true pnpm exec vitest run packages/sections/src/_site-header-overlay-baseline-snapshot.test.tsx
```
Expected: `Snapshots  4 written`, `Tests  4 passed (4)`; `0` (today's overlay has no cart, even with the default `show_cart: true`); then in CI mode `Tests  4 passed (4)`.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add packages/sections/src/_site-header-overlay-baseline-snapshot.test.tsx packages/sections/src/__snapshots__/_site-header-overlay-baseline-snapshot.test.tsx.snap
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "test(sections): freeze the overlay header before the cart chip" -m "Baseline only: scheniders-iraq's product-page header and the defaults on the overlay surface, ar/en." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The add-to-cart chrome strings, and one name per action

**Files:**
- Modify: `packages/sections/src/pdp_express/strings.ts` (end of `EXPRESS_STRINGS`)
- Modify: `packages/sections/src/_copy-terms.ts` (end of `COPY_ACTIONS`)
- Modify: `packages/sections/src/_arabic-copy-lint.test.ts` (the one-name test)

`pdp_express/strings.ts` is already on `STRING_TABLE_FILES`, so `_kurdish-coverage` (every entry has `ku`) and the F12 chrome lint pick the new entries up automatically.

- [ ] **Step 1: Make the lint test expect the two new actions**

In `packages/sections/src/_arabic-copy-lint.test.ts`, replace:
```ts
    expect(REDESIGN.SLICE_1D_ACCORDION_PATCH.heading_i18n.ar).toBe(COPY_ACTIONS.guarantee);
  });
```
with:
```ts
    expect(REDESIGN.SLICE_1D_ACCORDION_PATCH.heading_i18n.ar).toBe(COPY_ACTIONS.guarantee);
    expect(EXPRESS_STRINGS.addToCart.ar).toBe(COPY_ACTIONS.addToCart);
    expect(EXPRESS_STRINGS.viewCart.ar).toBe(COPY_ACTIONS.viewCart);
  });
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/_arabic-copy-lint.test.ts
```
Expected: `Tests  1 failed | 5 passed (6)`: "each action uses its one name…" with `TypeError: Cannot read properties of undefined (reading 'ar')`.

- [ ] **Step 3: Add the strings and the actions**

In `packages/sections/src/pdp_express/strings.ts`, replace:
```ts
  closeSheet: { en: "Close", ar: "إغلاق", ku: "داخستن" },
} as const;
```
with:
```ts
  closeSheet: { en: "Close", ar: "إغلاق", ku: "داخستن" },
  // add_to_cart (slice 1g): the cart tile beside the submit, and the line
  // under the order buttons once a tap has put the perfume in the cart.
  addToCart: { en: "Add to cart", ar: "أضف للسلة", ku: "خستنە سەبەتە" },
  addedToCart: { en: "Added to your cart", ar: "انضافت للسلة", ku: "خرایە سەبەتەکەوە" },
  viewCart: { en: "View cart", ar: "شوف السلة", ku: "سەبەتەکە ببینە" },
} as const;
```
In `packages/sections/src/_copy-terms.ts`, replace:
```ts
  /** The guarantee terms, by name. */
  guarantee: "كرت الضمان",
} as const;
```
with:
```ts
  /** The guarantee terms, by name. */
  guarantee: "كرت الضمان",
  /** Putting the product in the cart, beside the submit (slice 1g). */
  addToCart: "أضف للسلة",
  /** Going to the cart, after an add (slice 1g). */
  viewCart: "شوف السلة",
} as const;
```

- [ ] **Step 4: Run the lint, the term sheet and Kurdish coverage**

```bash
CI=true pnpm exec vitest run packages/sections/src/_arabic-copy-lint.test.ts packages/sections/src/_copy-terms.test.ts packages/sections/src/_kurdish-coverage.test.ts
```
Expected: all pass. The lint stays at 6 tests: the three new Arabic strings break no rule (hamza on «أضف», no «ال» before واتساب, no counts), so the chrome allowlist is unchanged.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add packages/sections/src/pdp_express/strings.ts packages/sections/src/_copy-terms.ts packages/sections/src/_arabic-copy-lint.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): express add-to-cart chrome strings (ar/en/ku); «أضف للسلة» and «شوف السلة» are one-name actions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The express model carries the unit price and the variant hand-off

**Files:**
- Modify: `packages/sections/src/pdp_express/model.ts`
- Modify: `packages/sections/src/pdp_direct_order.client.tsx` (`onSubmit` ≈ line 927; the express model ≈ line 1270)

This is a pure refactor: no render changes, and `onSubmit` behaves identically. It is pinned by `_pdp-variants.test.tsx` (submit without a choice → message + focus, both with a picker section and with this form's pills) and by every express baseline.

- [ ] **Step 1: Add the two fields to the model type**

In `packages/sections/src/pdp_express/model.ts`, replace:
```ts
  qty: number;
  setQty: (update: (q: number) => number) => void;
```
with:
```ts
  qty: number;
  /** The unit price at this quantity (the merchant's ladder applied to
   *  `price`), as the order line posts it. */
  unitPrice: number;
  setQty: (update: (q: number) => number) => void;
```
Replace:
```ts
  setVariantError: (v: boolean) => void;
  variantPillsRef: RefObject<HTMLDivElement | null>;
```
with:
```ts
  setVariantError: (v: boolean) => void;
  variantPillsRef: RefObject<HTMLDivElement | null>;
  /** Ask for the variant: show the choose-an-option message and focus the
   *  picker (this form's pills, or the picker section that owns the
   *  choice). What a submit does while a choice is still owed. */
  focusVariantChoice: () => void;
```

- [ ] **Step 2: Run the type gate to verify it fails**

Run the sections type gate. Expected: one error, `src/pdp_direct_order.client.tsx(…): error TS2739: Type '{ … }' is missing the following properties from type 'ExpressModel': unitPrice, focusVariantChoice`.

- [ ] **Step 3: Extract `focusVariantChoice` and pass both**

In `packages/sections/src/pdp_direct_order.client.tsx`, replace:
```ts
  async function onSubmit(
    e: React.FormEvent<HTMLFormElement>,
```
with:
```ts
  /** The variant is still owed: show the message and focus where it is
   *  chosen — this form's own pills or, when a picker section owns the
   *  choice, that section (the message then shows beside the submit
   *  button, where the shopper tapped). */
  function focusVariantChoice() {
    if (!product) return;
    setVariantError(true);
    if (chosen.pickerMounted) {
      focusVariantPicker(product.id);
    } else {
      variantPillsRef.current?.scrollIntoView?.({ block: "center" });
      variantPillsRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    }
  }

  async function onSubmit(
    e: React.FormEvent<HTMLFormElement>,
```
Replace:
```ts
    setFieldErrors(errors);
    // The option is the first thing to fix. It is either this form's own
    // pills or, when a picker section owns the choice, that section — the
    // message then shows beside the submit button, where the shopper tapped.
    setVariantError(awaitingVariant);
    const firstInvalid = (opts?.focusOrder ?? FIELD_ORDER).find((k) => errors[k]);
    if (awaitingVariant) {
      if (chosen.pickerMounted) {
        focusVariantPicker(product.id);
      } else {
        variantPillsRef.current?.scrollIntoView?.({ block: "center" });
        variantPillsRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
      }
      return;
    }
```
with:
```ts
    setFieldErrors(errors);
    // The option is the first thing to fix (focusVariantChoice).
    setVariantError(awaitingVariant);
    const firstInvalid = (opts?.focusOrder ?? FIELD_ORDER).find((k) => errors[k]);
    if (awaitingVariant) {
      focusVariantChoice();
      return;
    }
```
In the express model literal (`<PdpExpress model={{ … }}`), replace:
```ts
          qty,
          setQty,
          maxQty,
```
with:
```ts
          qty,
          unitPrice,
          setQty,
          maxQty,
```
and replace:
```ts
          setVariantError,
          variantPillsRef,
          reassurance,
```
with:
```ts
          setVariantError,
          variantPillsRef,
          focusVariantChoice,
          reassurance,
```
(`if (!product) return;` is there because the closure is typed before `onSubmit`'s own `!product` guard narrows; the render never reaches the model without a product.)

- [ ] **Step 4: Type gate, then the variant and express suites**

Run the sections type gate. Expected: no output.
```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-variants.test.tsx packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_pdp-classic-snapshot.test.tsx packages/sections/src/pdp_express/checkout-row.receipt.test.tsx
```
Expected: `Test Files  4 passed (4)`, `Tests  47 passed (47)`, no snapshot written or updated.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add packages/sections/src/pdp_express/model.ts packages/sections/src/pdp_direct_order.client.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "refactor(sections): express model carries unitPrice and the submit's variant hand-off (focusVariantChoice)" -m "No render change; onSubmit behaves identically." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The cart line the express tile adds

**Files:**
- Create: `packages/sections/src/pdp_express/cart-line.ts`
- Test: `packages/sections/src/pdp_express/cart-line.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/pdp_express/cart-line.test.ts`:

```ts
// The express cart line: the chosen variant and quantity at the receipt's
// unit price, the base price and ladder for the cart's re-pricing, and the
// name the page shows.

import { describe, expect, it } from "vitest";
import type { PriceTier } from "@scheniders/shared";
import { VARIANT_100, plainProduct, saleProduct } from "../_pdp-fixtures";
import { expressCartLine } from "./cart-line";

const LADDER: PriceTier[] = [{ min_quantity: 2, max_quantity: null, price: 22000 }];

describe("expressCartLine", () => {
  it("a plain product: no variant, the express name, the product image", () => {
    expect(
      expressCartLine({ product: plainProduct, variant: null, qty: 1, price: 18000, unitPrice: 18000 }),
    ).toEqual({
      product_id: plainProduct.id,
      variant_id: null,
      name: "عطر تجريبي",
      variant_name: null,
      price: 18000,
      quantity: 1,
      image_url: plainProduct.image_url,
      base_price: 18000,
    });
  });

  it("the chosen variant and quantity, at the variant's price", () => {
    const line = expressCartLine({ product: saleProduct, variant: VARIANT_100, qty: 3, price: 40000, unitPrice: 40000 });
    expect(line.variant_id).toBe(VARIANT_100.id);
    expect(line.variant_name).toBe("100ml");
    expect(line.quantity).toBe(3);
    expect(line.price).toBe(40000);
    expect(line.base_price).toBe(40000);
  });

  it("a quantity break: the line carries the break price, the base and the ladder", () => {
    const line = expressCartLine({
      product: { ...saleProduct, price_tiers: LADDER },
      variant: null,
      qty: 2,
      price: 25000,
      unitPrice: 22000,
    });
    expect(line.price).toBe(22000);
    expect(line.base_price).toBe(25000);
    expect(line.price_tiers).toEqual(LADDER);
  });

  it("names the line as the page does, not by the long catalogue title", () => {
    const line = expressCartLine({
      product: { ...saleProduct, display_name: "ويفر انتنس" },
      variant: null,
      qty: 1,
      price: 25000,
      unitPrice: 25000,
    });
    expect(line.name).toBe("ويفر انتنس");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/pdp_express/cart-line.test.ts
```
Expected: `Error: Failed to load url ./cart-line`, `Tests  no tests`.

- [ ] **Step 3: Write the builder**

Create `packages/sections/src/pdp_express/cart-line.ts`:

```ts
// The cart line the express «أضف للسلة» tile adds: the chosen variant and
// quantity, priced exactly as the express receipt prices them, carrying the
// base price and ladder so the cart re-prices a quantity change the way
// the checkout server will (helpers/cart-store `repriced`).
//
// The name is the one the express page shows (`displayNameOf`): the cart
// and checkout pages print `name`, while the order itself snapshots the
// catalogue's own name server-side (app/actions/checkout.ts), so the cart's
// copy is display-only. An accepted order bump is not added: the cart
// offers no bumps, and the bump's discount is only valid beside its parent
// in the same direct order.

import type { CartItem } from "@scheniders/shared";
import type { ProductVariant } from "../types";
import { displayNameOf } from "./identity-label";
import type { ExpressModel } from "./model";

export type CartLineInput = Pick<ExpressModel, "product" | "qty" | "price" | "unitPrice"> & {
  /** The variant being bought, or null for a plain product. */
  variant: ProductVariant | null;
};

export function expressCartLine({ product, variant, qty, price, unitPrice }: CartLineInput): CartItem {
  return {
    product_id: product.id,
    variant_id: variant?.id ?? null,
    name: displayNameOf(product),
    variant_name: variant?.name ?? null,
    price: unitPrice,
    quantity: qty,
    image_url: variant?.image_url ?? product.image_url ?? null,
    base_price: price,
    ...(product.price_tiers ? { price_tiers: product.price_tiers } : {}),
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
CI=true pnpm exec vitest run packages/sections/src/pdp_express/cart-line.test.ts
```
Expected: `Tests  4 passed (4)`. Then run the sections type gate: no output.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add packages/sections/src/pdp_express/cart-line.ts packages/sections/src/pdp_express/cart-line.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): expressCartLine — the chosen variant and quantity at the receipt's unit price, named as the page names it" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `add_to_cart` — the tile beside «ثبّت طلبي» and the confirmation line

**Files:**
- Modify: `packages/sections/src/pdp_direct_order.tsx` (end of the schema)
- Create: `packages/sections/src/pdp_express/cart-action.tsx`
- Modify: `packages/sections/src/pdp_express/checkout-row.tsx`
- Test: `packages/sections/src/_pdp-express-cart.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/_pdp-express-cart.test.tsx`:

```tsx
// @vitest-environment jsdom
// =====================================================================
// Express add to cart (slice 1g) — the «أضف للسلة» tile beside «ثبّت طلبي»
// =====================================================================
// The tile adds what the form would order (variant + quantity, at the
// receipt's unit price) to the store's cart, says so under the buttons
// with a «شوف السلة» link, fires AddToCart like pdp_add_to_cart, and never
// submits the order or runs the form's validation. Off (absent), the row
// is exactly today's.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useCart } from "./helpers/cart-store";
import { setFunnelSink, type FunnelEvent } from "./helpers/pixels";
import { StoreBaseProvider } from "./helpers/store-context";
import { useVariantStore } from "./helpers/variant-store";
import pdp_direct_order, { type Props } from "./pdp_direct_order";
import type { Product } from "./types";
import {
  EXPRESS_IRAQ_PDP_PROPS,
  VARIANT_100,
  plainProduct,
  productCtx,
  soldOutProduct,
  variantProduct,
} from "./_pdp-fixtures";

const CART: Props = { ...EXPRESS_IRAQ_PDP_PROPS, add_to_cart: true };

function markup(props: Props, product: Product = plainProduct): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <pdp_direct_order.render props={props} ctx={productCtx(product)} />
    </StoreBaseProvider>,
  );
}

/** The order-buttons row: from its opening tag to the end of the form. */
function buttonRow(html: string): string {
  const at = html.indexOf('data-layer="submit"');
  expect(at).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<div", at), html.indexOf("</form>", at));
}

describe("add_to_cart prop", () => {
  it("parses true, and a bad stored value degrades to absent", () => {
    expect(pdp_direct_order.schema.parse(CART).add_to_cart).toBe(true);
    const bad = pdp_direct_order.schema.parse({ ...EXPRESS_IRAQ_PDP_PROPS, add_to_cart: "yes" });
    expect(bad.add_to_cart).toBeUndefined();
    expect(bad.layout).toBe("express");
  });

  it("false renders exactly like absent", () => {
    expect(markup({ ...EXPRESS_IRAQ_PDP_PROPS, add_to_cart: false })).toBe(markup(EXPRESS_IRAQ_PDP_PROPS));
  });
});

describe("the order-buttons row with add_to_cart", () => {
  it("WhatsApp, then the cart tile, then the submit, then the confirmation line", () => {
    const row = buttonRow(markup(CART));
    const order = ["اطلب عبر واتساب", "data-cart-add", 'type="submit"', 'role="status"'].map((k) => row.indexOf(k));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(row).toContain("flex items-stretch gap-2 flex-wrap");
  });

  it("the tile is a plain button: never a submit, no yellow fill, ≥44px", () => {
    const row = buttonRow(markup(CART));
    const tile = row.slice(row.lastIndexOf("<button", row.indexOf("data-cart-add")), row.indexOf("</button>", row.indexOf("data-cart-add")));
    expect(tile).toContain('type="button"');
    expect(tile).not.toContain("bg-bk-primary");
    expect(tile).toContain("w-[84px]");
    expect(tile).toContain(">أضف للسلة<");
    // Its height is the row's: the submit's min-h-[60px], stretched.
    expect(row).toContain("min-h-[60px]");
  });

  it("the submit gives up side padding, never its label", () => {
    const row = buttonRow(markup(CART));
    const submit = row.slice(row.lastIndexOf("<button", row.indexOf('type="submit"')), row.indexOf(">", row.indexOf('type="submit"')));
    expect(submit).toContain("px-3");
    expect(submit).toContain("min-w-0");
    expect(submit).not.toContain("px-5");
    expect(row).toContain(">ثبّت طلبي<");
  });

  it("the confirmation line starts empty, and the row adds no dir attribute", () => {
    const row = buttonRow(markup(CART));
    expect(row).toMatch(/<p role="status" data-cart-status="" class="[^"]*"><\/p>/);
    expect(row).not.toContain(' dir="');
    const dirs = (html: string) => html.split(' dir="').length - 1;
    expect(dirs(markup(CART))).toBe(dirs(markup(EXPRESS_IRAQ_PDP_PROPS)));
  });

  it("english names the tile «Add to cart»", () => {
    const html = renderToStaticMarkup(
      <StoreBaseProvider base="/s/fixture-store">
        <pdp_direct_order.render
          props={CART}
          ctx={productCtx(plainProduct, { runtime: { ...productCtx(plainProduct).runtime, locale: "en" } })}
        />
      </StoreBaseProvider>,
    );
    expect(buttonRow(html)).toContain(">Add to cart<");
  });

  it("sold out: no tile and no confirmation line", () => {
    const row = buttonRow(markup(CART, soldOutProduct));
    expect(row).not.toContain("data-cart-add");
    expect(row).not.toContain("data-cart-status");
  });
});

const fetchMock = vi.fn(() => Promise.resolve(new Response("{}")));
const fbq = vi.fn();

function mount(product: Product = plainProduct) {
  const Pdp = pdp_direct_order.render;
  const view = render(
    <StoreBaseProvider base="/s/fixture-store">
      <Pdp props={CART} ctx={productCtx(product)} />
    </StoreBaseProvider>,
  );
  const q = <T extends Element>(sel: string): T => {
    const el = view.container.querySelector<T>(sel);
    if (!el) throw new Error(`missing ${sel}`);
    return el;
  };
  return { view, q, tile: () => q<HTMLButtonElement>("[data-cart-add]"), status: () => q<HTMLElement>("[data-cart-status]") };
}

beforeEach(() => {
  fetchMock.mockClear();
  fbq.mockClear();
  useCart.setState({ items: [] });
  useVariantStore.setState({ selected: {} });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
  Element.prototype.scrollIntoView = function scrollIntoView() {};
});
afterEach(() => {
  cleanup();
  setFunnelSink(null);
  vi.unstubAllGlobals();
});

describe("tapping «أضف للسلة»", () => {
  it("adds the product at the stepper's quantity, confirms with a cart link, and sends no order", () => {
    const { q, tile, status, view } = mount();
    fireEvent.click(q('button[aria-controls$="-qty-panel"]'));
    fireEvent.click(q('button[aria-label="زيادة الكمية"]'));
    fireEvent.click(tile());
    expect(useCart.getState().items).toEqual([
      {
        product_id: plainProduct.id,
        variant_id: null,
        name: "عطر تجريبي",
        variant_name: null,
        price: 18000,
        quantity: 2,
        image_url: plainProduct.image_url,
        base_price: 18000,
      },
    ]);
    expect(status().textContent).toBe("check_circleانضافت للسلةشوف السلة");
    expect(status().querySelector("a")?.getAttribute("href")).toBe("/s/fixture-store/cart");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(view.container.querySelector('[role="alert"]')).toBeNull();
  });

  it("a second tap adds again to the same line and is announced again", () => {
    const { tile, status } = mount();
    fireEvent.click(tile());
    const first = status().firstElementChild;
    fireEvent.click(tile());
    expect(useCart.getState().items.map((i) => i.quantity)).toEqual([2]);
    expect(status().firstElementChild).not.toBe(first);
  });

  it("while a variant is owed it adds nothing and asks for the option", () => {
    const { q, tile, view } = mount(variantProduct);
    fireEvent.click(tile());
    expect(useCart.getState().items).toEqual([]);
    expect(view.container.querySelector('[role="alert"]')?.textContent).toBe("اختار الخيار أول.");
    expect(document.activeElement).toBe(q('[data-layer="variants"] button'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("adds the chosen variant at its own price", () => {
    const { view, tile } = mount(variantProduct);
    const pill = [...view.container.querySelectorAll<HTMLButtonElement>('[data-layer="variants"] button')].find(
      (b) => b.textContent?.startsWith("100ml"),
    );
    if (!pill) throw new Error("missing the 100ml pill");
    fireEvent.click(pill);
    fireEvent.click(tile());
    const [line] = useCart.getState().items;
    expect(line?.variant_id).toBe(VARIANT_100.id);
    expect(line?.variant_name).toBe("100ml");
    expect(line?.price).toBe(40000);
  });

  it("fires AddToCart like pdp_add_to_cart, and the funnel's add_to_cart", () => {
    vi.stubGlobal("fbq", fbq);
    const seen: FunnelEvent[] = [];
    setFunnelSink((e) => seen.push(e));
    const { tile } = mount();
    fireEvent.click(tile());
    expect(fbq).toHaveBeenCalledTimes(1);
    expect(fbq.mock.calls[0]?.slice(0, 2)).toEqual(["track", "AddToCart"]);
    expect(fbq.mock.calls[0]?.[2]).toMatchObject({ content_ids: [plainProduct.id], value: 18000, currency: "IQD", num_items: 1 });
    expect(seen).toEqual([{ type: "add_to_cart", product_id: plainProduct.id }]);
  });

  it("draft view (no pixel, no funnel sink): the add still works and records nothing", () => {
    const { tile } = mount();
    fireEvent.click(tile());
    expect(useCart.getState().items).toHaveLength(1);
    expect(fbq).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-express-cart.test.tsx
```
Expected: `Tests  12 failed | 2 passed (14)`. The prop test fails because zod strips the unknown key, so `add_to_cart` is undefined. Every row and tap test fails on the missing `data-cart-add` / `data-cart-status`. "false renders exactly like absent" and "sold out" already pass.

- [ ] **Step 3: Add the prop**

In `packages/sections/src/pdp_direct_order.tsx`, replace the end of the schema:
```ts
    })
    .optional()
    .catch(undefined),
});

export type Props = z.infer<typeof schema>;
```
with:
```ts
    })
    .optional()
    .catch(undefined),

  // ── Add to cart (opt-in, express only) ──────────────────────────────
  /** Express: a «أضف للسلة» tile between the WhatsApp tile and the submit.
   *  It puts the chosen variant and quantity in the store's cart (the
   *  AddToCart pixel fires, as on pdp_add_to_cart), confirms under the
   *  buttons with a «شوف السلة» link, and never submits the order.
   *  Absent = today's row, byte-identical. Classic ignores it. */
  add_to_cart: z.boolean().optional().catch(undefined),
});

export type Props = z.infer<typeof schema>;
```
(The `old_string` above is the end of `scent_card`, the last field since 1c. Check that it is unique with `grep -c "^    .optional()$" packages/sections/src/pdp_direct_order.tsx` before editing. If it is not unique, anchor on `    })\n    .optional()\n    .catch(undefined),\n});`, which occurs once.)

- [ ] **Step 4: Write the tile and the confirmation line**

Create `packages/sections/src/pdp_express/cart-action.tsx`:

```tsx
// Express add to cart (`add_to_cart`, slice 1g): the «أضف للسلة» tile that
// sits between the WhatsApp tile and the submit, and the line under the
// order buttons that confirms an add and links to the cart.
//
// The tile is a `type="button"` inside the order form: it never submits
// the order and never runs the form's validation. It adds what the form
// would order — the chosen variant and the stepper's quantity at the
// receipt's unit price — or, while a variant is still owed, asks for it
// exactly as a submit would. The AddToCart pixel fires as on
// pdp_add_to_cart; in draft view no pixel and no funnel sink is installed
// (storefront layout / v2-page), so the call records nothing there.
//
// Colours (D4): the tile is an ink outline on the surface — yellow fills
// stay on the order actions; the confirmation's check is the success green.

import { cn, pixelContentsFromItems } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { useCart } from "../helpers/cart-store";
import { trackPixel } from "../helpers/pixels";
import { MaterialIcon } from "../helpers/primitives";
import { StoreLink } from "../helpers/store-context";
import { expressCartLine } from "./cart-line";
import type { ExpressModel } from "./model";
import { readsRtl, xs } from "./text";

export function CartTile({
  m,
  locale,
  onAdded,
}: {
  m: ExpressModel;
  locale: LocaleCode;
  /** Called after each add, for the confirmation line. */
  onAdded: () => void;
}) {
  const addItem = useCart((s) => s.addItem);

  function add() {
    if (m.chosen.needsVariant) {
      m.focusVariantChoice();
      return;
    }
    const line = expressCartLine({
      product: m.product,
      variant: m.chosen.variant,
      qty: m.qty,
      price: m.price,
      unitPrice: m.unitPrice,
    });
    addItem(line);
    trackPixel(
      "AddToCart",
      pixelContentsFromItems([{ product_id: line.product_id, price: line.price, quantity: line.quantity }]),
    );
    onAdded();
  }

  return (
    <button
      type="button"
      onClick={add}
      disabled={m.submitting}
      data-cart-add=""
      className="flex w-[84px] shrink-0 flex-col items-center justify-center gap-1 rounded-bk-input border-bk border-bk-ink bg-bk-surface px-1.5 text-bk-ink transition-[transform,background-color] duration-bk-fast hover:bg-bk-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
    >
      <MaterialIcon name="shopping_bag" className="text-[22px] leading-none" />
      <span className="text-center font-bk-body text-xs font-bold leading-tight">{xs("addToCart", locale)}</span>
    </button>
  );
}

/** The confirmation under the order buttons. The live region is always in
 *  the row (a region inserted with its text is often not announced); the
 *  text is keyed by the add count so a second add is announced again. */
export function CartAddedStatus({ adds, locale }: { adds: number; locale: LocaleCode }) {
  const rtl = readsRtl(locale);
  return (
    <p role="status" data-cart-status="" className="basis-full font-bk-body text-[13px] text-bk-ink">
      {adds > 0 && (
        <span key={adds} className={cn("flex items-center justify-center gap-1.5", rtl && "flex-row-reverse")}>
          <MaterialIcon name="check_circle" className="text-base text-bk-success" />
          <span className="font-bold">{xs("addedToCart", locale)}</span>
          <StoreLink
            href="/cart"
            className="inline-flex min-h-11 items-center px-1 font-bold text-bk-ink underline underline-offset-4"
          >
            {xs("viewCart", locale)}
          </StoreLink>
        </span>
      )}
    </p>
  );
}
```

- [ ] **Step 5: Put them in the row**

In `packages/sections/src/pdp_express/checkout-row.tsx`, replace:
```ts
import {
  cn,
```
with:
```ts
import { useState } from "react";
import {
  cn,
```
Replace:
```ts
import { MaterialIcon, WhatsAppIcon } from "../helpers/primitives";
import { displayNameOf } from "./identity-label";
```
with:
```ts
import { MaterialIcon, WhatsAppIcon } from "../helpers/primitives";
import { CartAddedStatus, CartTile } from "./cart-action";
import { displayNameOf } from "./identity-label";
```
Replace:
```ts
  const idle = !m.oos && !m.submitting;
```
with:
```ts
  const idle = !m.oos && !m.submitting;
  // add_to_cart (slice 1g): the «أضف للسلة» tile between the WhatsApp tile
  // and the submit, and its confirmation wrapped onto a line of its own
  // under them. Both live inside this row, so the receipt above and every
  // block below keep their place (and React's useId paths).
  const cart = m.props.add_to_cart === true && !m.oos;
  const [cartAdds, setCartAdds] = useState(0);
```
Replace:
```tsx
      <div className="flex items-stretch gap-2" data-layer="submit" data-layer-label="Order buttons">
```
with:
```tsx
      <div
        className={cn("flex items-stretch gap-2", cart && "flex-wrap")}
        data-layer="submit"
        data-layer-label="Order buttons"
      >
```
Replace (the end of the WhatsApp tile and the start of the submit):
```tsx
          </a>
        )}
        <button
          type="submit"
```
with:
```tsx
          </a>
        )}
        {cart && <CartTile m={m} locale={locale} onAdded={() => setCartAdds((n) => n + 1)} />}
        <button
          type="submit"
```
Replace:
```ts
            m.submitting && "cursor-progress",
            rtl && "flex-row-reverse",
          )}
        >
```
with:
```ts
            m.submitting && "cursor-progress",
            rtl && "flex-row-reverse",
            // Three targets in one row: the submit gives up side padding,
            // never its label, down to 360px.
            cart && "min-w-0 gap-2 px-3",
          )}
        >
```
Replace (the end of the submit and of the row):
```tsx
          )}
        </button>
      </div>
```
with:
```tsx
          )}
        </button>
        {cart && <CartAddedStatus adds={cartAdds} locale={locale} />}
      </div>
```

- [ ] **Step 6: Run the new test, the type gate, and every express baseline**

```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-express-cart.test.tsx
```
Expected: `Tests  14 passed (14)`. Run the sections type gate: no output. Then:
```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/pdp_express packages/sections/src/_pdp-variants.test.tsx packages/sections/src/_sticky-cta-form-aware-dom.test.tsx packages/sections/src/_pdp-express-progress.test.tsx
```
Expected: all pass, no snapshot written or updated (`_pdp-express-snapshot` is byte-identical: `cn("flex items-stretch gap-2", false)` is the old string, and the submit's `cn(…, false)` appends nothing).

`_pdp-redesign-snapshot.test.tsx` is not run here: its fixture does not set `add_to_cart` until Task 8, so it still passes unchanged.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add packages/sections/src/pdp_direct_order.tsx packages/sections/src/pdp_express/cart-action.tsx packages/sections/src/pdp_express/checkout-row.tsx packages/sections/src/_pdp-express-cart.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): express add_to_cart — «أضف للسلة» beside «ثبّت طلبي», adds variant + quantity, confirms with «شوف السلة», never submits" -m "Opt-in prop (catch-guarded); AddToCart pixel parity with pdp_add_to_cart (silent in draft view). Default row byte-identical." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The overlay header's cart chip, with a live count that pops on an add

**Files:**
- Create: `packages/sections/src/helpers/cart-bump.ts`
- Modify: `packages/sections/src/site_header.tsx`
- Modify: `packages/sections/src/site_header.client.tsx` (the `<OverlayHeader …/>` call ≈ line 111)
- Modify: `packages/sections/src/site_header.overlay.tsx`
- Test: `packages/sections/src/_site-header-overlay-cart.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/_site-header-overlay-cart.test.tsx`:

```tsx
// @vitest-environment jsdom
// =====================================================================
// site_header overlay — the cart chip (`overlay_cart`, slice 1g)
// =====================================================================
// On the product page the header floats as glass chips; with overlay_cart
// (and show_cart) a cart chip sits beside the menu chip: the bag, the
// live count once mounted, a link to the cart. The count pops when the
// shopper adds — never when the saved cart loads. Without the prop the
// overlay renders exactly as before (_site-header-overlay-baseline).
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { act, cleanup, render } from "@testing-library/react";
import type { CartItem } from "@scheniders/shared";
import { CART_BUMP_MS } from "./helpers/cart-bump";
import { useCart } from "./helpers/cart-store";
import { StoreBaseProvider } from "./helpers/store-context";
import site_header, { type Props } from "./site_header";
import { SIGNATURE_HEADER_PROPS, productCtx, saleProduct } from "./_pdp-fixtures";

const OVERLAY: Props = { ...SIGNATURE_HEADER_PROPS, sticky: false, surface: "overlay" };
const WITH_CART: Props = { ...OVERLAY, show_cart: true, overlay_cart: true };

const LINE: CartItem = {
  product_id: saleProduct.id,
  variant_id: null,
  name: "ويفر انتنس",
  variant_name: null,
  price: 25000,
  quantity: 1,
  image_url: null,
  base_price: 25000,
};

function Header({ props }: { props: Props }) {
  return (
    <StoreBaseProvider base="/s/fixture-store">
      <site_header.render props={props} ctx={productCtx(saleProduct)} />
    </StoreBaseProvider>
  );
}

beforeEach(() => {
  useCart.setState({ items: [] });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("overlay_cart prop", () => {
  it("parses true; a bad stored value degrades to absent", () => {
    expect(site_header.schema.parse(WITH_CART).overlay_cart).toBe(true);
    expect(site_header.schema.parse({ ...WITH_CART, overlay_cart: 1 }).overlay_cart).toBeUndefined();
  });

  it("server markup: a cart chip to /cart named with a zero count, beside the menu", () => {
    const html = renderToStaticMarkup(<Header props={WITH_CART} />);
    expect(html).toContain('href="/s/fixture-store/cart"');
    expect(html).toContain('aria-label="سلة التسوّق (0)"');
    expect(html).toContain("data-header-cart");
    expect(html).not.toContain("data-cart-count");
    expect(html.indexOf("data-header-cart")).toBeLessThan(html.indexOf('aria-label="القائمة"'));
    expect(html).not.toContain(' dir="');
  });

  it("needs show_cart: the overlay stays chip-less without it", () => {
    const html = renderToStaticMarkup(<Header props={{ ...OVERLAY, overlay_cart: true }} />);
    expect(html).not.toContain("data-header-cart");
    expect(html).toBe(renderToStaticMarkup(<Header props={OVERLAY} />));
  });
});

describe("the cart chip in the browser", () => {
  it("shows the live count once mounted", () => {
    useCart.setState({ items: [{ ...LINE, quantity: 2 }] });
    const view = render(<Header props={WITH_CART} />);
    expect(view.container.querySelector("[data-cart-count]")?.textContent).toBe("2");
    expect(view.container.querySelector("[data-header-cart]")?.getAttribute("aria-label")).toBe("سلة التسوّق (2)");
  });

  it("pops on an add, then settles", () => {
    vi.useFakeTimers();
    vi.spyOn(useCart.persist, "hasHydrated").mockReturnValue(true);
    const view = render(<Header props={WITH_CART} />);
    act(() => useCart.getState().addItem(LINE));
    const badge = () => view.container.querySelector("[data-cart-count]");
    expect(badge()?.textContent).toBe("1");
    expect(badge()?.className).toContain("scale-125");
    act(() => vi.advanceTimersByTime(CART_BUMP_MS));
    expect(badge()?.className).not.toContain("scale-125");
  });

  it("does not pop when the saved cart arrives after mount", () => {
    vi.spyOn(useCart.persist, "hasHydrated").mockReturnValue(false);
    const view = render(<Header props={WITH_CART} />);
    act(() => useCart.setState({ items: [{ ...LINE, quantity: 3 }] }));
    const badge = view.container.querySelector("[data-cart-count]");
    expect(badge?.textContent).toBe("3");
    expect(badge?.className).not.toContain("scale-125");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/_site-header-overlay-cart.test.tsx
```
Expected: `Error: Failed to load url ./helpers/cart-bump`, `Tests  no tests`.

- [ ] **Step 3: Write the bump hook**

Create `packages/sections/src/helpers/cart-bump.ts`:

```ts
"use client";

// The header's cart badge pops briefly when the shopper adds something.
// A rise in the count is an add only when the cart had already loaded at
// the count before it: the persisted cart arriving after mount (CartHydrator)
// and a header remounting on navigation are not adds, so neither pops.

import { useEffect, useRef, useState } from "react";
import { useCart } from "./cart-store";

/** How long the badge stays popped. */
export const CART_BUMP_MS = 300;

export function useCartBump(): boolean {
  const count = useCart((s) => s.getItemCount());
  const [bumped, setBumped] = useState(false);
  const prev = useRef({ count, loaded: useCart.persist.hasHydrated() });
  useEffect(() => {
    const was = prev.current;
    prev.current = { count, loaded: useCart.persist.hasHydrated() };
    if (!was.loaded || count <= was.count) return;
    setBumped(true);
    const handle = setTimeout(() => setBumped(false), CART_BUMP_MS);
    return () => clearTimeout(handle);
  }, [count]);
  return bumped;
}
```

- [ ] **Step 4: The prop, the wiring, the chip**

In `packages/sections/src/site_header.tsx`, replace:
```ts
  surface: z.enum(["solid", "overlay"]).optional().catch(undefined),
});
```
with:
```ts
  surface: z.enum(["solid", "overlay"]).optional().catch(undefined),
  /** overlay surface only: a glass cart chip — the bag and the live item
   *  count — beside the menu chip, linking to the cart; the count pops when
   *  the shopper adds something. Needs show_cart too. Absent = no cart chip
   *  (the overlay never had one), byte-identical. */
  overlay_cart: z.boolean().optional().catch(undefined),
});
```
In `packages/sections/src/site_header.client.tsx`, replace:
```tsx
          enabledLocales={enabledLocales}
          menuLabel={menuLabel}
        />
```
with:
```tsx
          enabledLocales={enabledLocales}
          menuLabel={menuLabel}
          cart={props.show_cart && props.overlay_cart === true ? { label: cartLabel, count } : null}
        />
```
(`cartLabel` = `` `${chromeString("cart", locale)} (${count})` `` and `count` (0 until mounted) already exist in `SiteHeaderRender`, line 71 and line 96.)

In `packages/sections/src/site_header.overlay.tsx`, replace:
```ts
import { cn } from "./helpers/utils";
import { MaterialIcon } from "./helpers/primitives";
```
with:
```ts
import { cn } from "./helpers/utils";
import { useCartBump } from "./helpers/cart-bump";
import { MaterialIcon } from "./helpers/primitives";
```
Replace:
```ts
  menuLabel,
}: {
  wordmark: string;
  logo: string | null;
  locale: LocaleCode;
  navLinks: NavLink[];
  enabledLocales: LocaleCode[];
  menuLabel: string;
}) {
```
with:
```ts
  menuLabel,
  cart = null,
}: {
  wordmark: string;
  logo: string | null;
  locale: LocaleCode;
  navLinks: NavLink[];
  enabledLocales: LocaleCode[];
  menuLabel: string;
  /** `overlay_cart`: the cart chip's name («سلة التسوّق (n)») and the
   *  mounted item count. Null = no chip, today's markup. */
  cart?: { label: string; count: number } | null;
}) {
```
Replace:
```ts
  const overHero = useOverHero(barRef);
```
with:
```ts
  const overHero = useOverHero(barRef);
  const bumped = useCartBump();
```
Replace:
```ts
      : "border-transparent bg-transparent",
  );
```
with:
```tsx
      : "border-transparent bg-transparent",
  );
  // The menu chip (or its spacer): alone at the right, or after the cart chip.
  const menuToggle = hasSheet ? (
    <button
      ref={toggleRef}
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-label={menuLabel}
      aria-expanded={open}
      aria-controls={sheetId}
      className={cn(chip, "w-11 justify-center")}
    >
      <MaterialIcon name={open ? "close" : "menu"} className="text-2xl" />
    </button>
  ) : (
    <span aria-hidden="true" />
  );
```
Replace:
```tsx
          {hasSheet ? (
            <button
              ref={toggleRef}
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-label={menuLabel}
              aria-expanded={open}
              aria-controls={sheetId}
              className={cn(chip, "w-11 justify-center")}
            >
              <MaterialIcon name={open ? "close" : "menu"} className="text-2xl" />
            </button>
          ) : (
            <span aria-hidden="true" />
          )}
```
with:
```tsx
          {cart ? (
            <div className="flex shrink-0 items-center gap-2">
              <StoreLink
                href="/cart"
                onClick={close}
                aria-label={cart.label}
                data-header-cart=""
                className={cn(chip, "relative w-11 justify-center")}
              >
                <MaterialIcon name="shopping_bag" className="text-2xl" />
                {cart.count > 0 && (
                  // Ink, not yellow: yellow fills stay on the order actions (D4).
                  <span
                    data-cart-count=""
                    className={cn(
                      "absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-bk-pill bg-bk-ink px-1 font-bk-body text-xs font-bold tabular-nums text-bk-surface transition-transform duration-bk-fast motion-reduce:transition-none",
                      bumped && "scale-125",
                    )}
                  >
                    {cart.count}
                  </span>
                )}
              </StoreLink>
              {menuToggle}
            </div>
          ) : (
            menuToggle
          )}
```
The bar's flex container keeps two children in both branches (the wordmark, then the menu or the cart+menu group), so the tree around `sheetId` is unchanged.

- [ ] **Step 5: Run the new test, the frozen overlay baseline and every header test**

```bash
CI=true pnpm exec vitest run packages/sections/src/_site-header-overlay-cart.test.tsx packages/sections/src/_site-header-overlay-baseline-snapshot.test.tsx packages/sections/src/_site-header-overlay.test.tsx packages/sections/src/_chrome-baseline-snapshot.test.tsx
```
Expected: `Test Files  4 passed (4)`, `Tests  40 passed (40)` (cart 6 + overlay baseline 4 + overlay sheet 5 + chrome baseline 25), with no snapshot written or updated. The Task 1 baseline is byte-identical. Run the sections type gate: no output.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add packages/sections/src/helpers/cart-bump.ts packages/sections/src/site_header.tsx packages/sections/src/site_header.client.tsx packages/sections/src/site_header.overlay.tsx packages/sections/src/_site-header-overlay-cart.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): overlay header cart chip (overlay_cart) — live count, pops on an add, never on load" -m "Opt-in, needs show_cart; ink badge (D4). Overlay baseline byte-identical." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The 1g draft-config migration (written, replayed locally, dry-run; NOT applied)

**Files:**
- Create: `packages/supabase/migrations/<STAMP>_scheniders_iraq_pdp_redesign_1g_draft.sql`
- Scratch: `tmp/pdp-1g/dryrun-1g.sql` (gitignored), `${TMPDIR:-/tmp}/pdp-1g-pglite/` (outside the repo)

All live access in this task is **read-only**. The three `$json$` blocks are exactly Task 8's `SLICE_1G_PDP_PATCH`, `SLICE_1G_HEADER_PATCH` and `SLICE_1G_HEADER_VARIANT_PATCH`, and Task 8's mirror test proves it.

- [ ] **Step 1: Pick the timestamp**

```bash
STAMP=$(date -u +%Y%m%d%H%M%S); echo $STAMP
ls packages/supabase/migrations | grep -E '^[0-9]{14}_' | sort | tail -1
(cd packages && supabase db query --linked "SELECT max(version) FROM supabase_migrations.schema_migrations" -o csv)
```
Expected: `$STAMP` sorts after the last file (`20261030081155_scheniders_iraq_pdp_redesign_1f_draft.sql`) and after the history's max (on 2026-10-30, `20261030083119`). Keep `$STAMP` in this shell.

- [ ] **Step 2: Write the migration**

Create `packages/supabase/migrations/${STAMP}_scheniders_iraq_pdp_redesign_1g_draft.sql` (if Task 0 Step 4 read other guard values, put them in `c_expected_draft_md5` / `c_expected_rev` and the header's guard c. and Rollback lines):

```sql
-- =====================================================================
-- scheniders-iraq PDP redesign, slice 1g — DRAFT config only
-- =====================================================================
-- Merchant request (Ali, 2026-10-30): an «أضف للسلة» button side by side
-- with «ثبّت طلبي»; the WhatsApp tile beside them stays.
-- Plan: docs/superpowers/plans/2026-10-30-pdp-p1g-add-to-cart.md.
--
-- Writes ONLY tenants.store_config_v2_draft (and updated_at) for slug
-- scheniders-iraq. store_config_v2 (published) is never written; its md5
-- is captured before the write and asserted equal after it.
--
-- What it changes in the draft, each object merged with `||`:
--   1. pages[product] pdp_direct_order aae22169, base: add_to_cart true
--      (the «أضف للسلة» tile between the WhatsApp tile and «ثبّت طلبي»;
--      it adds the chosen variant and quantity to the cart and never
--      submits the order).
--   2. globals.header site_header 33c6a493, base: show_cart true (the
--      solid header on every other page shows the cart with its count,
--      so a shopper who added on the product page can reach the cart).
--   3. the same header's product-page variant 4c9e2b71, override:
--      overlay_cart true (the floating header over the product photo gets
--      a cart chip beside the menu chip). sticky false and surface
--      "overlay" stay.
--
-- Guards, in order, in one transaction:
--   a. no tenant / no product page / the pdp section, the header or its
--      product variant missing -> RAISE NOTICE and no write (a fresh
--      database replays this as a no-op);
--   b. the transform applied to the current draft changes nothing
--      -> RAISE NOTICE 'already applied' and no write (a second run is a no-op);
--   c. md5(store_config_v2_draft::text) must be 56df97c58591dbc66724198b6b02dae8
--      and store_config_rev must be 38 (the draft after the 1f migration)
--      -> else RAISE EXCEPTION: someone edited or published since, so
--      re-read and regenerate this file;
--   d. md5(store_config_v2::text) is equal before and after the write.
--
-- Applied ONLY after the code that reads these props is deployed:
--   supabase db query --linked -f <this file>
--   supabase migration repair --status applied <version>
-- Never `supabase db push`.
--
-- Rollback (read at draft md5 56df97c58591dbc66724198b6b02dae8):
--   pdp_direct_order aae22169: remove add_to_cart from the base with `-`;
--   site_header 33c6a493: set base show_cart back to false, and remove
--   overlay_cart from variant 4c9e2b71's override with `-` (the override
--   before this file: {"sticky": false, "surface": "overlay"}).
-- =====================================================================

DO $mig$
DECLARE
  c_slug constant text := 'scheniders-iraq';
  c_expected_rev constant bigint := 38;
  c_expected_draft_md5 constant text := '56df97c58591dbc66724198b6b02dae8';
  c_pdp_id constant text := 'aae22169-cef4-4495-842b-863a7caa71c2';
  c_header_id constant text := '33c6a493-5926-46e1-a45f-929f63fff21f';
  c_header_variant_id constant text := '4c9e2b71-8d3a-4f6e-a1b2-7e5d9c0f3a42';
  -- pdp_patch:begin
  c_pdp_patch constant jsonb := $json${
    "add_to_cart": true
  }$json$;
  -- pdp_patch:end
  -- header_patch:begin
  c_header_patch constant jsonb := $json${
    "show_cart": true
  }$json$;
  -- header_patch:end
  -- header_variant_patch:begin
  c_header_variant_patch constant jsonb := $json${
    "overlay_cart": true
  }$json$;
  -- header_variant_patch:end
  v_tenant_id uuid;
  v_rev bigint;
  v_draft jsonb;
  v_target jsonb;
  v_pub_md5 text;
  v_page_idx int;
  v_sections jsonb;
  v_new_sections jsonb;
  v_header jsonb;
  v_new_variants jsonb;
BEGIN
  SELECT id, store_config_rev, store_config_v2_draft, md5(store_config_v2::text)
    INTO v_tenant_id, v_rev, v_draft, v_pub_md5
    FROM public.tenants
   WHERE slug = c_slug
     FOR UPDATE;
  IF NOT FOUND OR v_draft IS NULL THEN
    RAISE NOTICE 'pdp redesign 1g: no tenant % with a draft, nothing written', c_slug;
    RETURN;
  END IF;

  SELECT (p.ord - 1)::int INTO v_page_idx
    FROM jsonb_array_elements(v_draft->'pages') WITH ORDINALITY AS p(page, ord)
   WHERE p.page->>'page_id' = 'product';
  IF v_page_idx IS NULL THEN
    RAISE NOTICE 'pdp redesign 1g: % has no product page, nothing written', c_slug;
    RETURN;
  END IF;
  v_sections := v_draft->'pages'->v_page_idx->'sections';

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_sections) AS s(sec) WHERE s.sec->>'id' = c_pdp_id
  ) THEN
    RAISE NOTICE 'pdp redesign 1g: product page lacks section %, nothing written', c_pdp_id;
    RETURN;
  END IF;

  v_header := v_draft->'globals'->'header';
  IF v_header IS NULL OR v_header->>'id' IS DISTINCT FROM c_header_id OR NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(v_header->'variants', '[]'::jsonb)) AS v(variant)
     WHERE v.variant->>'id' = c_header_variant_id
  ) THEN
    RAISE NOTICE 'pdp redesign 1g: header % with variant % not found, nothing written', c_header_id, c_header_variant_id;
    RETURN;
  END IF;

  SELECT jsonb_agg(
           CASE x.sec->>'id'
             WHEN c_pdp_id
               THEN jsonb_set(x.sec, '{base}', coalesce(x.sec->'base', '{}'::jsonb) || c_pdp_patch)
             ELSE x.sec
           END
           ORDER BY x.ord
         )
    INTO v_new_sections
    FROM jsonb_array_elements(v_sections) WITH ORDINALITY AS x(sec, ord);

  SELECT jsonb_agg(
           CASE y.variant->>'id'
             WHEN c_header_variant_id
               THEN jsonb_set(y.variant, '{override}', coalesce(y.variant->'override', '{}'::jsonb) || c_header_variant_patch)
             ELSE y.variant
           END
           ORDER BY y.ord
         )
    INTO v_new_variants
    FROM jsonb_array_elements(v_header->'variants') WITH ORDINALITY AS y(variant, ord);

  v_header := jsonb_set(
    jsonb_set(v_header, '{base}', coalesce(v_header->'base', '{}'::jsonb) || c_header_patch),
    '{variants}',
    v_new_variants
  );

  v_target := jsonb_set(
    jsonb_set(v_draft, ARRAY['pages', v_page_idx::text, 'sections'], v_new_sections),
    '{globals,header}',
    v_header
  );

  IF v_target = v_draft THEN
    RAISE NOTICE 'pdp redesign 1g: already applied, nothing written';
    RETURN;
  END IF;

  IF md5(v_draft::text) <> c_expected_draft_md5 THEN
    RAISE EXCEPTION 'pdp redesign 1g: draft md5 is %, expected % (edited since it was read); re-read and regenerate',
      md5(v_draft::text), c_expected_draft_md5;
  END IF;
  IF v_rev <> c_expected_rev THEN
    RAISE EXCEPTION 'pdp redesign 1g: store_config_rev is %, expected % (published since it was read); re-read and regenerate',
      v_rev, c_expected_rev;
  END IF;

  UPDATE public.tenants
     SET store_config_v2_draft = v_target,
         updated_at = now()
   WHERE id = v_tenant_id;

  IF (SELECT md5(store_config_v2::text) FROM public.tenants WHERE id = v_tenant_id) <> v_pub_md5 THEN
    RAISE EXCEPTION 'pdp redesign 1g: the published config changed during the write';
  END IF;

  RAISE NOTICE 'pdp redesign 1g: draft md5 % -> %', c_expected_draft_md5, md5(v_target::text);
END
$mig$;
```

For the reviewer, what is in it: three keys, no copy. The section order, 1f's sticky bar (`form_aware`), 1f's `show_whatsapp: true`, 1c's `product_copy` and the cart/checkout pages are untouched. The variant override is merged, not replaced, so `sticky: false` and `surface: "overlay"` stay. The resolver deep-merges overrides over the base (`store-config-v2-resolver.ts:131`), so the product page resolves `show_cart: true` from the base and `overlay_cart: true` from the variant.

- [ ] **Step 3: Copy the live row read-only and install PGlite outside the repo**

```bash
mkdir -p "${TMPDIR:-/tmp}/pdp-1g-pglite"
(cd packages && supabase db query --linked "SELECT store_config_v2_draft::text AS draft, store_config_v2::text AS pub FROM tenants WHERE slug='scheniders-iraq'" -o json) > "${TMPDIR:-/tmp}/pdp-1g-pglite/live.json"
cd "${TMPDIR:-/tmp}/pdp-1g-pglite"
node -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync("live.json"));const r=(j.rows||j)[0];fs.writeFileSync("draft.json",r.draft);fs.writeFileSync("pub.json",r.pub);console.log(r.draft.length, r.pub.length)'
echo '{"name":"pdp-1g-pglite","private":true,"type":"module"}' > package.json
pnpm add @electric-sql/pglite@0.2.17
cd /Users/ali/scheniders-mono-pdp-1g
```
Expected: two lengths (on 2026-10-30 the post-1e draft was `70219` and published `60860`; the post-1f draft is a few bytes longer), then `+ @electric-sql/pglite 0.2.17`.

- [ ] **Step 4: Write the replay harness**

Create `${TMPDIR:-/tmp}/pdp-1g-pglite/harness-draft.mjs`:

```js
// Replays the 1g draft-config migration against a local Postgres (PGlite)
// loaded with a read-only copy of the live scheniders-iraq row.
// usage: node harness-draft.mjs <migration.sql> <draft.json> <pub.json> <rev> [<pre-migration.sql> ...]
// Each pre-migration (e.g. 1f's, while it is not yet applied live) runs
// first, so the 1g file sees the draft it will meet.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const [file, draftPath, pubPath, revArg, ...pre] = process.argv.slice(2);
const sql = readFileSync(file, "utf8");
const draft = readFileSync(draftPath, "utf8");
const pub = readFileSync(pubPath, "utf8");
const REV = Number(revArg);

async function db(withRow, { rev = REV, editDraft = false } = {}) {
  const pg = new PGlite();
  await pg.exec(`CREATE TABLE public.tenants (
    id uuid PRIMARY KEY, slug text UNIQUE NOT NULL, store_config_rev bigint NOT NULL DEFAULT 0,
    store_config_v2 jsonb, store_config_v2_draft jsonb, updated_at timestamptz NOT NULL DEFAULT now())`);
  if (withRow) {
    await pg.query(
      `INSERT INTO public.tenants (id, slug, store_config_rev, store_config_v2, store_config_v2_draft, updated_at)
       VALUES ('b5c4f2d4-834f-4af4-822d-9b9826a8f45a', 'scheniders-iraq', $1, $2::jsonb, $3::jsonb, '2026-10-29T21:27:39Z')`,
      [REV, pub, draft],
    );
    for (const p of pre) await pg.exec(readFileSync(p, "utf8"));
    await pg.exec(`UPDATE public.tenants SET store_config_rev = ${rev}, updated_at = '2026-10-29T21:27:39Z'`);
    if (editDraft) {
      await pg.exec(`UPDATE public.tenants SET store_config_v2_draft = jsonb_set(store_config_v2_draft, '{default_locale}', '"en"')`);
    }
  }
  return { pg, notices: [] };
}

async function md5s(pg) {
  const r = await pg.query(
    `SELECT md5(store_config_v2_draft::text) AS d, md5(store_config_v2::text) AS p, updated_at <> '2026-10-29T21:27:39Z' AS bumped FROM public.tenants`,
  );
  return r.rows[0];
}

async function run(label, pg, notices) {
  try {
    await pg.exec(sql, { onNotice: (n) => n.message.startsWith("pdp redesign 1g") && notices.push(n.message) });
    console.log(`${label}: ok`, JSON.stringify(notices.splice(0)));
  } catch (e) {
    console.log(`${label}: ERROR ${e.message}`);
  }
}

const SUMMARY = `
  SELECT
    (SELECT string_agg(s.sec->>'type', ',' ORDER BY s.ord) FROM jsonb_array_elements(p.page->'sections') WITH ORDINALITY s(sec, ord)) AS order_,
    d.sec->'base'->>'add_to_cart' AS add_to_cart,
    d.sec->'base'->>'show_whatsapp' AS show_whatsapp,
    st.sec->'base'->>'primary_kind' AS sticky_kind,
    t.store_config_v2_draft->'globals'->'header'->'base'->>'show_cart' AS show_cart,
    (t.store_config_v2_draft->'globals'->'header'->'variants'->0->'override')::text AS override,
    md5((t.store_config_v2_draft->'globals'->'header'->'base')::text) AS header_base_md5,
    md5((d.sec->'base'->'scent_card'->'product_copy')::text) AS copy_md5
  FROM public.tenants t,
       jsonb_array_elements(t.store_config_v2_draft->'pages') p(page),
       jsonb_array_elements(p.page->'sections') st(sec),
       jsonb_array_elements(p.page->'sections') d(sec)
  WHERE p.page->>'page_id' = 'product'
    AND st.sec->>'id' = 'd874d9d6-dede-40e5-bcf8-aceb51d11036'
    AND d.sec->>'id' = 'aae22169-cef4-4495-842b-863a7caa71c2'`;

{
  const { pg, notices } = await db(true);
  console.log("before", JSON.stringify(await md5s(pg)));
  console.log("draft before", JSON.stringify((await pg.query(SUMMARY)).rows[0]));
  await run("first run", pg, notices);
  console.log("after first", JSON.stringify(await md5s(pg)));
  console.log("draft after", JSON.stringify((await pg.query(SUMMARY)).rows[0]));
  await run("second run", pg, notices);
  console.log("after second", JSON.stringify(await md5s(pg)));
}
{
  const { pg, notices } = await db(true, { editDraft: true });
  await run("edited draft", pg, notices);
  console.log("edited draft state", JSON.stringify(await md5s(pg)));
}
{
  const { pg, notices } = await db(true, { rev: REV + 1 });
  await run("published since", pg, notices);
}
{
  const { pg, notices } = await db(false);
  await run("empty database", pg, notices);
}
```

- [ ] **Step 5: Replay (first run, second run, edited draft, published since, empty database)**

1f is applied live (Task 0 Step 4), so no pre-migration is passed:
```bash
node "${TMPDIR:-/tmp}/pdp-1g-pglite/harness-draft.mjs" "packages/supabase/migrations/${STAMP}_scheniders_iraq_pdp_redesign_1g_draft.sql" "${TMPDIR:-/tmp}/pdp-1g-pglite/draft.json" "${TMPDIR:-/tmp}/pdp-1g-pglite/pub.json" 38
```
Expected (pre-run 2026-10-30 on the live post-1e row with `20261030081155_…1f_draft.sql` passed as a pre-migration, which is the state Task 0 confirms live):
```
before {"d":"56df97c58591dbc66724198b6b02dae8","p":"a6f87ba3181b0e94f41ba4a700de257b","bumped":false}
draft before {"order_":"pdp_direct_order,image_gallery,product_reviews,accordion_richtext,faq_contact_split,product_grid,trust_badge_row,sticky_cta_bar","add_to_cart":null,"show_whatsapp":"true","sticky_kind":"form_aware","show_cart":"false","override":"{\"sticky\": false, \"surface\": \"overlay\"}","header_base_md5":"ee7d30260ead751643e55861b8bcd362","copy_md5":"523744df04f3acb3e6983ddb422d3266"}
first run: ok ["pdp redesign 1g: draft md5 56df97c58591dbc66724198b6b02dae8 -> aa676deb050743aef4cfec1511a73361"]
after first {"d":"aa676deb050743aef4cfec1511a73361","p":"a6f87ba3181b0e94f41ba4a700de257b","bumped":true}
draft after {"order_":"pdp_direct_order,image_gallery,product_reviews,accordion_richtext,faq_contact_split,product_grid,trust_badge_row,sticky_cta_bar","add_to_cart":"true","show_whatsapp":"true","sticky_kind":"form_aware","show_cart":"true","override":"{\"sticky\": false, \"surface\": \"overlay\", \"overlay_cart\": true}","header_base_md5":"fc2d5d00399861487558662501e4c20e","copy_md5":"523744df04f3acb3e6983ddb422d3266"}
second run: ok ["pdp redesign 1g: already applied, nothing written"]
after second {"d":"aa676deb050743aef4cfec1511a73361","p":"a6f87ba3181b0e94f41ba4a700de257b","bumped":true}
edited draft: ERROR pdp redesign 1g: draft md5 is b72de992e3845d7726a5bb7041a02223, expected 56df97c58591dbc66724198b6b02dae8 (edited since it was read); re-read and regenerate
edited draft state {"d":"b72de992e3845d7726a5bb7041a02223","p":"a6f87ba3181b0e94f41ba4a700de257b","bumped":false}
published since: ERROR pdp redesign 1g: store_config_rev is 39, expected 38 (published since it was read); re-read and regenerate
empty database: ok ["pdp redesign 1g: no tenant scheniders-iraq with a draft, nothing written"]
```
This covers §1.10's data checks: the published md5 never moves; `updated_at` is bumped only by a real write; a second run is a no-op; an edited draft or a publish since the read aborts; an empty database is a no-op; and section order, 1f's sticky bar, the WhatsApp tile and 1c's `product_copy` (`523744df…`, the go-live file's guard) are untouched. If Task 0 pinned other values, the md5s differ the same way, but the pattern must not.

- [ ] **Step 6: Dry run on the live row (a SELECT, writes nothing)**

```bash
mkdir -p tmp/pdp-1g
```
Create `tmp/pdp-1g/dryrun-1g.sql`:

```sql
-- Read-only dry run of <STAMP>_scheniders_iraq_pdp_redesign_1g_draft.sql:
-- the same transform as a SELECT. Writes nothing.
WITH c AS (
  SELECT
    'aae22169-cef4-4495-842b-863a7caa71c2'::text AS pdp_id,
    '4c9e2b71-8d3a-4f6e-a1b2-7e5d9c0f3a42'::text AS variant_id,
    $json${"add_to_cart": true}$json$::jsonb AS pdp_patch,
    $json${"show_cart": true}$json$::jsonb AS header_patch,
    $json${"overlay_cart": true}$json$::jsonb AS variant_patch
),
t AS (
  SELECT store_config_rev AS rev, store_config_v2_draft AS draft
    FROM public.tenants WHERE slug = 'scheniders-iraq'
),
p AS (
  SELECT (pg.ord - 1)::int AS idx, pg.page->'sections' AS sections
    FROM t, jsonb_array_elements(t.draft->'pages') WITH ORDINALITY AS pg(page, ord)
   WHERE pg.page->>'page_id' = 'product'
),
s AS (
  SELECT jsonb_agg(
           CASE x.sec->>'id'
             WHEN c.pdp_id THEN jsonb_set(x.sec, '{base}', coalesce(x.sec->'base', '{}'::jsonb) || c.pdp_patch)
             ELSE x.sec
           END
           ORDER BY x.ord
         ) AS sections
    FROM c, p, jsonb_array_elements(p.sections) WITH ORDINALITY AS x(sec, ord)
),
v AS (
  SELECT jsonb_agg(
           CASE y.variant->>'id'
             WHEN c.variant_id THEN jsonb_set(y.variant, '{override}', coalesce(y.variant->'override', '{}'::jsonb) || c.variant_patch)
             ELSE y.variant
           END
           ORDER BY y.ord
         ) AS variants
    FROM c, t, jsonb_array_elements(t.draft->'globals'->'header'->'variants') WITH ORDINALITY AS y(variant, ord)
),
h AS (
  SELECT jsonb_set(
           jsonb_set(t.draft->'globals'->'header', '{base}', coalesce(t.draft->'globals'->'header'->'base', '{}'::jsonb) || c.header_patch),
           '{variants}', v.variants
         ) AS header
    FROM c, t, v
),
target AS (
  SELECT jsonb_set(jsonb_set(t.draft, ARRAY['pages', p.idx::text, 'sections'], s.sections), '{globals,header}', h.header) AS draft
    FROM t, p, s, h
)
SELECT
  t.rev = 38 AS rev_ok,
  md5(t.draft::text) = '56df97c58591dbc66724198b6b02dae8' AS draft_md5_ok,
  md5(target.draft::text) AS target_md5
FROM t, target;
```
```bash
grep -ciE "\b(update|insert|delete|alter|drop|create)\b" tmp/pdp-1g/dryrun-1g.sql
(cd packages && supabase db query --linked -f ../tmp/pdp-1g/dryrun-1g.sql -o csv)
```
Expected: `0` (no write keyword), then:
```
rev_ok,draft_md5_ok,target_md5
true,true,aa676deb050743aef4cfec1511a73361
```
`target_md5` equals the replay's `after first`. (Pre-run: on PGlite over the post-1f copy this exact row printed. Run live on 2026-10-30, before 1f was applied, it printed `true,false,9fd7f9044c20e6092c8d4188ae95177c`: the guard doing its job.)

- [ ] **Step 7: Commit the migration (not applied)**

```bash
git branch --show-current
git add "packages/supabase/migrations/${STAMP}_scheniders_iraq_pdp_redesign_1g_draft.sql"
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "chore(db): scheniders-iraq PDP redesign 1g draft config (not applied)" -m "pdp_direct_order add_to_cart; header show_cart; product-page header variant overlay_cart. Applied with supabase db query --linked -f only after the code is live; draft only, guarded on draft md5 56df97c5… and store_config_rev 38." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Redesign fixtures carry 1g; the mirror; one reviewed snapshot update

**Files:**
- Modify: `packages/sections/src/_pdp-redesign-fixtures.ts`
- Modify: `packages/sections/src/_pdp-redesign-snapshot.test.tsx`
- Modify: `packages/sections/src/__snapshots__/_pdp-redesign-snapshot.test.tsx.snap` (vitest `-u`, this file only)
- Scratch: `tmp/pdp-1g/snapcheck.mjs`, `tmp/pdp-1g/header-base.json`

This task is its own commit, so the snapshot change is reviewed apart from the code.

- [ ] **Step 1: Add the 1g data to the fixtures**

In `packages/sections/src/_pdp-redesign-fixtures.ts`, replace:
```ts
import type { Props as ReviewsProps } from "./product_reviews";
```
with:
```ts
import type { Props as ReviewsProps } from "./product_reviews";
import type { Props as HeaderProps } from "./site_header";
```
Replace:
```ts
/** The draft pdp_direct_order after slices 1b, 1c, 1d, 1e and 1f. */
export const IRAQ_REDESIGN_PDP_PROPS: PdpDirectOrderProps = {
```
with:
```ts
/** Slice 1g (Ali, 2026-10-30): the «أضف للسلة» tile side by side with
 *  «ثبّت طلبي»; the WhatsApp tile stays beside them. */
export const SLICE_1G_PDP_PATCH = {
  add_to_cart: true,
} satisfies Partial<PdpDirectOrderProps>;

/** The draft pdp_direct_order after slices 1b, 1c, 1d, 1e, 1f and 1g. */
export const IRAQ_REDESIGN_PDP_PROPS: PdpDirectOrderProps = {
```
Replace:
```ts
  ...SLICE_1F_PDP_PATCH,
};
```
with:
```ts
  ...SLICE_1F_PDP_PATCH,
  ...SLICE_1G_PDP_PATCH,
};
```
Append to the end of the file (`jsonbMerge` is 1d's helper in this file):
```ts

/** scheniders-iraq's draft globals.header base (site_header 33c6a493) as
 *  read on 2026-10-30, before slice 1g: no cart anywhere (show_cart false). */
export const IRAQ_DRAFT_HEADER_BASE: HeaderProps = {
  layout: "floating_pill",
  sticky: true,
  nav_links: [
    { href: "/", label_i18n: { ar: "الصفحة الرئيسية", en: "Home" } },
    { href: "/products", label_i18n: { ar: "منتجاتنا", en: "Our products" } },
    { href: "/about", label_i18n: { ar: "معلومات عنا", en: "About us" } },
    { href: "/contact", label_i18n: { ar: "تواصل معنا", en: "Contact us" } },
  ],
  show_cart: false,
  show_search: false,
  wordmark_i18n: { ar: "شنايدر", en: "Scheniders" },
  logo_image_url:
    "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/da0471e3-4980-4e4d-80ef-4ea9e75bf2da.png",
  wordmark_style: "pill",
};

/** The header's product-page variant (4c9e2b71) override, before 1g. */
export const IRAQ_DRAFT_HEADER_PRODUCT_OVERRIDE = { sticky: false, surface: "overlay" } satisfies Partial<HeaderProps>;

/** Slice 1g: the solid header on every other page shows the cart. */
export const SLICE_1G_HEADER_PATCH = { show_cart: true } satisfies Partial<HeaderProps>;

/** Slice 1g: the product page's floating header gets the cart chip. */
export const SLICE_1G_HEADER_VARIANT_PATCH = { overlay_cart: true } satisfies Partial<HeaderProps>;

/** The draft header base after slice 1g (unparsed, as stored). */
export const IRAQ_REDESIGN_HEADER_INPUT = jsonbMerge(IRAQ_DRAFT_HEADER_BASE, SLICE_1G_HEADER_PATCH);

/** The header the product page resolves after slice 1g: the base with the
 *  variant's override merged over it (the resolver's deepMerge; every key
 *  here is a scalar). */
export const IRAQ_REDESIGN_HEADER_PRODUCT_INPUT = jsonbMerge(IRAQ_REDESIGN_HEADER_INPUT, {
  ...IRAQ_DRAFT_HEADER_PRODUCT_OVERRIDE,
  ...SLICE_1G_HEADER_VARIANT_PATCH,
});
```
(The F12 lint skips `IRAQ_DRAFT_*` and `IRAQ_REDESIGN_*` by name, and the `SLICE_1G_*` patches hold no Arabic, so the tenant lint is unchanged.)

- [ ] **Step 2: Check the fixture's header equals the live one**

```bash
(cd packages && supabase db query --linked "SELECT store_config_v2_draft->'globals'->'header'->'base' AS base, store_config_v2_draft->'globals'->'header'->'variants'->0->'override' AS override, jsonb_array_length(store_config_v2_draft->'globals'->'header'->'variants') AS nvariants FROM tenants WHERE slug='scheniders-iraq'" -o json) > tmp/pdp-1g/header-base.json
cat > packages/sections/src/zz-header-base-check.test.ts <<'TS'
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { IRAQ_DRAFT_HEADER_BASE, IRAQ_DRAFT_HEADER_PRODUCT_OVERRIDE } from "./_pdp-redesign-fixtures";
it("the fixture header base and product override equal the live draft's", () => {
  const raw = JSON.parse(readFileSync("../../tmp/pdp-1g/header-base.json", "utf8"));
  const rows = raw.rows ?? raw;
  expect(rows).toHaveLength(1);
  expect(IRAQ_DRAFT_HEADER_BASE).toEqual(rows[0].base);
  expect(IRAQ_DRAFT_HEADER_PRODUCT_OVERRIDE).toEqual(rows[0].override);
  expect(rows[0].nvariants).toBe(1);
});
TS
(cd packages/sections && CI=true pnpm exec vitest run src/zz-header-base-check.test.ts)
rm packages/sections/src/zz-header-base-check.test.ts
```
Expected: `Tests  1 passed (1)` (pre-run on the live row, 2026-10-30). The throwaway test is deleted right after and never staged.

- [ ] **Step 3: Extend the redesign snapshot test**

In `packages/sections/src/_pdp-redesign-snapshot.test.tsx` (as 1f left it), replace:
```ts
import product_reviews from "./product_reviews";
import sticky_cta_bar from "./sticky_cta_bar";
```
with:
```ts
import product_reviews from "./product_reviews";
import site_header from "./site_header";
import sticky_cta_bar from "./sticky_cta_bar";
```
Replace:
```ts
  IRAQ_REDESIGN_GALLERY_INPUT,
  IRAQ_REDESIGN_PDP_PROPS,
```
with:
```ts
  IRAQ_DRAFT_HEADER_BASE,
  IRAQ_REDESIGN_GALLERY_INPUT,
  IRAQ_REDESIGN_HEADER_INPUT,
  IRAQ_REDESIGN_HEADER_PRODUCT_INPUT,
  IRAQ_REDESIGN_PDP_PROPS,
```
Replace:
```ts
  SLICE_1F_STICKY_PATCH,
} from "./_pdp-redesign-fixtures";
```
with:
```ts
  SLICE_1F_STICKY_PATCH,
  SLICE_1G_HEADER_PATCH,
  SLICE_1G_HEADER_VARIANT_PATCH,
  SLICE_1G_PDP_PATCH,
} from "./_pdp-redesign-fixtures";
```
Replace:
```ts
  it("the patched props satisfy the schema unchanged", () => {
```
with:
```ts
  it("slice 1g patches: pdp_direct_order, the header base, its product variant", () => {
    const sql1g = migrationSql("scheniders_iraq_pdp_redesign_1g_draft");
    expect(migrationJson(sql1g, "pdp_patch")).toEqual(SLICE_1G_PDP_PATCH);
    expect(migrationJson(sql1g, "header_patch")).toEqual(SLICE_1G_HEADER_PATCH);
    expect(migrationJson(sql1g, "header_variant_patch")).toEqual(SLICE_1G_HEADER_VARIANT_PATCH);
    expect(IRAQ_REDESIGN_PDP_PROPS.add_to_cart).toBe(true);
  });

  it("the 1g header parses to exactly what is stored, on the product page and off it", () => {
    expect(site_header.schema.parse(IRAQ_DRAFT_HEADER_BASE)).toEqual(IRAQ_DRAFT_HEADER_BASE);
    expect(site_header.schema.parse(IRAQ_REDESIGN_HEADER_INPUT)).toEqual(IRAQ_REDESIGN_HEADER_INPUT);
    const product = site_header.schema.parse(IRAQ_REDESIGN_HEADER_PRODUCT_INPUT);
    expect(product).toEqual(IRAQ_REDESIGN_HEADER_PRODUCT_INPUT);
    expect([product.surface, product.sticky, product.show_cart, product.overlay_cart]).toEqual([
      "overlay",
      false,
      true,
      true,
    ]);
  });

  it("the patched props satisfy the schema unchanged", () => {
```
Append to the end of the file:
```tsx

describe("site_header — redesign draft (slice 1g)", () => {
  function renderHeader(input: Record<string, unknown>, locale: LocaleCode): string {
    return renderToStaticMarkup(
      <StoreBaseProvider base="/s/fixture-store">
        <site_header.render
          props={site_header.schema.parse(input)}
          ctx={productCtx(wayferProduct, { tenant: IRAQ_REDESIGN_TENANT, runtime: { ...productRuntime, locale } })}
        />
      </StoreBaseProvider>,
    );
  }

  it.each(["ar", "en"] as const)("product page header with the cart chip, %s", (locale) => {
    expect(renderHeader(IRAQ_REDESIGN_HEADER_PRODUCT_INPUT, locale)).toMatchSnapshot();
  });

  it("the cart chip: to the cart, beside the menu, no yellow, no colour literal, no dir", () => {
    const html = renderHeader(IRAQ_REDESIGN_HEADER_PRODUCT_INPUT, "ar");
    expect(html).toContain('href="/s/fixture-store/cart"');
    expect(html).toContain('aria-label="سلة التسوّق (0)"');
    expect(html).not.toContain("bg-bk-primary");
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgba?\(/);
    expect(html).not.toContain(' dir="');
  });

  it("every other page: the solid header shows the cart", () => {
    const html = renderToStaticMarkup(
      <StoreBaseProvider base="/s/fixture-store">
        <site_header.render
          props={site_header.schema.parse(IRAQ_REDESIGN_HEADER_INPUT)}
          ctx={productCtx(undefined, { tenant: IRAQ_REDESIGN_TENANT, runtime: { ...productRuntime, page_id: "home" } })}
        />
      </StoreBaseProvider>,
    );
    expect(html).toContain('href="/s/fixture-store/cart"');
    expect(html).not.toContain("data-header-cart");
  });
});
```

- [ ] **Step 4: Type gate, then run it in CI mode to see exactly what changes**

Run the sections type gate. Expected: no output.
```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-redesign-snapshot.test.tsx
```
Expected: `Snapshots  8 failed`, `Tests  8 failed | 37 passed (45)`. The failures are the six pdp renders (ar/en × three products: the row changed) and the two missing header renders. The mirror, the header parse, the chip checks, "adds no dir attribute", and every 1d/1e/1f test pass.

- [ ] **Step 5: Write the snapshot check (before updating)**

Create `tmp/pdp-1g/snapcheck.mjs`:

```js
// The 1g snapshot update, checked. Every render that existed before is
// byte-identical outside the order-buttons row; inside it, the only
// differences are the cart tile, the confirmation line, `flex-wrap` on the
// row and the submit's compact padding. New keys: the two header renders.
// Run from the repo root.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const f = "packages/sections/src/__snapshots__/_pdp-redesign-snapshot.test.tsx.snap";
const parse = (s) =>
  Object.fromEntries([...s.matchAll(/exports\[`([^`]+)`\] = `\n?"([\s\S]*?)"\n?`;/g)].map((m) => [m[1], m[2]]));
const before = parse(execFileSync("git", ["show", `HEAD:${f}`], { encoding: "utf8" }));
const after = parse(readFileSync(f, "utf8"));

const ROW = '<div class="flex items-stretch gap-2';
/** [start, end) of the order-buttons row div, by div depth. */
function rowSpan(html) {
  const start = html.indexOf(ROW);
  if (start < 0) return null;
  let depth = 0;
  const re = /<div\b|<\/div>/g;
  re.lastIndex = start;
  for (let m; (m = re.exec(html)); ) {
    depth += m[0] === "</div>" ? -1 : 1;
    if (depth === 0) return [start, m.index + 6];
  }
  return null;
}
const submitClass = (row) => /<button type="submit"[^>]*?class="([^"]*)"/.exec(row)?.[1] ?? "";
const set = (c) => new Set(c.split(" "));

for (const key of Object.keys(before)) {
  const label = key.split(" > ").slice(1).join(" > ");
  const a = after[key];
  if (a === before[key]) {
    console.log(`${label}: identical`);
    continue;
  }
  const sb = rowSpan(before[key]);
  const sa = a ? rowSpan(a) : null;
  if (!sb || !sa) {
    console.log(`${label}: CHANGED without an order-buttons row`);
    continue;
  }
  const outside =
    before[key].slice(0, sb[0]) === a.slice(0, sa[0]) && before[key].slice(sb[1]) === a.slice(sa[1]);
  const rowB = before[key].slice(sb[0], sb[1]);
  let rowA = a.slice(sa[0], sa[1]);
  const tiles = rowA.match(/<button type="button" data-cart-add=""[\s\S]*?<\/button>/g) ?? [];
  const statuses = rowA.match(/<p role="status" data-cart-status=""[^>]*><\/p>/g) ?? [];
  const cb = set(submitClass(rowB));
  const ca = set(submitClass(rowA));
  const added = [...ca].filter((c) => !cb.has(c)).sort().join(" ");
  const removed = [...cb].filter((c) => !ca.has(c)).sort().join(" ");
  rowA = rowA
    .replace(tiles[0] ?? "", "")
    .replace(statuses[0] ?? "", "")
    .replace(`${ROW} flex-wrap"`, `${ROW}"`)
    .replace(submitClass(rowA), submitClass(rowB));
  console.log(
    `${label}: outside identical ${outside}, tiles ${tiles.length}, status ${statuses.length}, submit +[${added}] -[${removed}], rest identical ${rowA === rowB}`,
  );
}
console.log(`new: ${Object.keys(after).filter((k) => !(k in before)).map((k) => k.split(" > ").slice(1).join(" > ")).join(" | ")}`);
console.log(`gone: ${Object.keys(before).filter((k) => !(k in after)).length}`);
```

- [ ] **Step 6: Update this one snapshot file**

```bash
pnpm exec vitest run packages/sections/src/_pdp-redesign-snapshot.test.tsx -u
git diff --stat -- packages/sections/src/__snapshots__
node tmp/pdp-1g/snapcheck.mjs
```
Expected:
- `Snapshots  2 written` / `6 updated`, `Tests  45 passed (45)`; exactly one file, `_pdp-redesign-snapshot.test.tsx.snap | 16 ++++++++++------` (`10 insertions(+), 6 deletions(-)`);
- `snapcheck.mjs` prints `identical` for the 11 non-pdp keys (proof stack ×2, guarantee card ×2, FAQ ×3, reviews highlights ×2, sticky bar ×2). For each of the six pdp keys it prints `outside identical true, tiles 1, status 1, submit +[gap-2 min-w-0 px-3] -[gap-3 px-5], rest identical true`. Then `new: product page header with the cart chip, ar 1 | product page header with the cart chip, en 1` and `gone: 0`.
Any `false`, `CHANGED`, or other key means 1g moved more than the row: stop and fix the code, and do not commit the snapshot.

- [ ] **Step 7: Read the snapshot for what 1g meant to draw**

```bash
f=packages/sections/src/__snapshots__/_pdp-redesign-snapshot.test.tsx.snap
for k in 'data-cart-add=""' '>أضف للسلة<' '>Add to cart<' 'data-cart-status=""' 'flex items-stretch gap-2 flex-wrap' 'data-header-cart=""' 'aria-label="سلة التسوّق (0)"' 'aria-label="Cart (0)"' 'data-cart-count' 'href="/s/fixture-store/cart"' 'انضافت للسلة'; do printf '%s: ' "$k"; grep -oF -- "$k" $f | wc -l | tr -d ' '; done
```
Expected, one count per line in this order: `6 3 3 6 6 2 1 1 0 2 0`. That is: six renders with the tile and its empty live region, named in each locale; the wrapped row; the header chip in both locales, named with a zero count (no badge in server markup); two cart links (the two chips); and no confirmation text before a tap.

- [ ] **Step 8: The whole sections suite in CI mode**

```bash
CI=true pnpm exec vitest run packages/sections/src
```
Expected: `Test Files  148 passed (148)`, `Tests  1606 passed (1606)`. That is Task 0's sections count (144 / 1572 if 1f landed as `2e69cbb0`) plus 4 files and 34 tests.

- [ ] **Step 9: Commit (its own, reviewed snapshot commit)**

```bash
git branch --show-current
git add packages/sections/src/_pdp-redesign-fixtures.ts packages/sections/src/_pdp-redesign-snapshot.test.tsx packages/sections/src/__snapshots__/_pdp-redesign-snapshot.test.tsx.snap
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "test(sections): redesign fixtures mirror the 1g draft migration; the cart tile and the header cart chip render" -m "Reviewed snapshot update: the six pdp renders differ only inside the order-buttons row (tile, status line, flex-wrap, submit padding); two header renders added. All baselines unchanged." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Slice verification gate, PR, merge, deploy

No new code. If a step fails, fix the root cause in the task that owns the file, commit that fix, and re-run this whole task.

- [ ] **Step 1: No baseline changed; the only snapshot changes are the redesign one and the new overlay baseline**

```bash
git diff --stat origin/main HEAD -- packages/sections/src/__snapshots__
git status --porcelain packages/sections/src/__snapshots__
```
Expected: exactly two files: `_pdp-redesign-snapshot.test.tsx.snap | 16 ++++++++++------` and the new `_site-header-overlay-baseline-snapshot.test.tsx.snap` (added in Task 1). The status prints nothing.

- [ ] **Step 2: Every baseline, unchanged, in CI mode**

```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_pdp-classic-snapshot.test.tsx packages/sections/src/_pdp-lower-baseline-snapshot.test.tsx packages/sections/src/_pdp-scent-baseline-snapshot.test.tsx packages/sections/src/_image-gallery-baseline-snapshot.test.tsx packages/sections/src/_product-reviews-baseline-snapshot.test.tsx packages/sections/src/_product-grid-baseline-snapshot.test.tsx packages/sections/src/_chrome-baseline-snapshot.test.tsx packages/sections/src/_order-confirmation-baseline-snapshot.test.tsx packages/sections/src/_site-footer-baseline-snapshot.test.tsx packages/sections/src/_sticky-cta-baseline-snapshot.test.tsx packages/sections/src/_primitives-baseline-snapshot.test.tsx packages/sections/src/_pdp-proof-guarantee-baseline-snapshot.test.tsx packages/sections/src/_pdp-reviews-faq-baseline-snapshot.test.tsx packages/sections/src/accordion_richtext.test.tsx packages/sections/src/_site-header-overlay-baseline-snapshot.test.tsx
```
Expected: `Test Files  16 passed (16)`, `Tests  167 passed (167)` (1f's 15 / 163 plus the overlay baseline's 4), with no `written`, `updated` or `obsolete` line.

- [ ] **Step 3: The full suites**

```bash
CI=true pnpm exec vitest run packages/sections/src packages/shared/src apps/storefront/lib
CI=true pnpm exec vitest run apps/platform/lib/section-field-groups.test.ts apps/platform/components/store-builder-v2/auto-form-schema.test.ts
```
Expected: `Test Files  218 passed (218)`, `Tests  2591 passed (2591)`. That is Task 0's 214 / 2557 plus 4 files and 34 tests: overlay baseline 4, cart line 4, express cart 14, overlay cart 6, redesign snapshot +6 (two mirror/parse tests, two header renders, two header checks). The copy lint and Kurdish coverage gain assertions, not tests. Then `Tests  112 passed (112)`: the builder classifies the two new booleans by convention and needs no table entry.

- [ ] **Step 4: Type gates**

Run the sections type gate. Expected: no output. Then:
```bash
pnpm --filter @scheniders/storefront type-check
pnpm --filter @scheniders/platform type-check
```
Expected: both exit 0 (pre-run green).

- [ ] **Step 5: Lint (the CI gate)**

```bash
pnpm turbo lint --filter=@scheniders/storefront --filter=@scheniders/platform
```
Expected: `Tasks:    2 successful, 2 total`; both report `0 errors` (pre-run: storefront 40 warnings, platform 1085 warnings, the existing intentional ones).

- [ ] **Step 6: Hygiene greps on this slice's source files**

```bash
cd packages/sections/src
grep -nE ":\s*any\b|<any>|\bas any\b|@ts-ignore|eslint-disable|#[0-9a-fA-F]{3,6}\b|rgba?\(|\sdir=" pdp_express/cart-line.ts pdp_express/cart-action.tsx helpers/cart-bump.ts site_header.overlay.tsx
grep -nE "[A-Za-z_)\]]!\.|[A-Za-z_)\]]!;|[A-Za-z_)\]]!\)" pdp_express/cart-line.ts pdp_express/cart-action.tsx helpers/cart-bump.ts site_header.overlay.tsx pdp_express/checkout-row.tsx site_header.tsx site_header.client.tsx pdp_direct_order.tsx
grep -c "bg-bk-primary" pdp_express/cart-action.tsx site_header.overlay.tsx
cd ../../..
git diff origin/main HEAD -- packages/sections/src ':!packages/sections/src/__snapshots__' ':!*.test.ts' ':!*.test.tsx' | grep -E '^\+.*(eslint-disable|ts-ignore|:\s*any\b|<any>|\bas any\b|\sdir=|#[0-9a-fA-F]{6}|rgba?\()'
```
Expected: the first two print nothing; the third prints `pdp_express/cart-action.tsx:0` and `site_header.overlay.tsx:0` (no new yellow, D4); the last prints nothing. The file lists are spelled out because zsh does not split `$VAR` into words.

- [ ] **Step 7: Push and open the PR**

```bash
git branch --show-current
git status --porcelain
git log --oneline origin/main..HEAD
git push -u origin feat/pdp-p1g-add-to-cart
```
Expected: the branch is `feat/pdp-p1g-add-to-cart`; nothing but the ignored `tmp/`; 8 commits, from "freeze the overlay header before the cart chip" to "redesign fixtures mirror the 1g draft migration".

```bash
gh pr create --base main --head feat/pdp-p1g-add-to-cart --title "PDP redesign 1g: «أضف للسلة» beside «ثبّت طلبي» + header cart chip, draft migration (not applied)" --body "Merchant request (Ali, 2026-10-30): add to cart side by side with «ثبّت طلبي»; the WhatsApp tile stays. Plan: docs/superpowers/plans/2026-10-30-pdp-p1g-add-to-cart.md.

- pdp_direct_order \`add_to_cart\` (opt-in, catch-guarded): one row of three at 390px (and 360px) — WhatsApp 64px, «أضف للسلة» outline tile 84px, «ثبّت طلبي» (yellow, colour-locked, gives up side padding only). The tile is type=button: it adds the chosen variant and quantity at the receipt's unit price (name = the page's display name), never submits, asks for a variant exactly like the submit does, and confirms under the row (role=status) with ✓ «انضافت للسلة» · «شوف السلة». AddToCart pixel parity with pdp_add_to_cart; silent in draft view (no pixels / funnel sink there).
- site_header \`overlay_cart\` (opt-in, needs show_cart): the product page's floating header gets a glass cart chip with the live count (ink badge, D4) that pops on an add, never when the saved cart loads.
- Smart sticky bar (1f) unchanged: it stays on the direct order (D6).
- Draft migration for scheniders-iraq (draft only, md5 + rev guarded, idempotent): add_to_cart, header show_cart, product-variant overlay_cart. NOT applied: applied after this PR is deployed.
- Overlay header frozen in a new baseline before the change; one reviewed redesign-snapshot update (six pdp renders differ only inside the order-buttons row; two header renders added). Every other baseline unchanged.

Tests: sections + shared + storefront lib 218 files / 2591 tests; type-check and lint green.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 8: Merge once CI is green, then wait for production**

```bash
gh pr checks --watch
gh pr merge --merge
```
Merge as gga2000 (Vercel builds only gga2000 commits). If CI fails within 2–4s it is billing, not code: `gh run view` shows the annotation, and `gh run rerun <id>` recovers. Then confirm the production deployment of the merge commit is READY and that the production domain serves it (a Vercel rollback pins production): Vercel MCP `list_deployments` for the storefront project, or the dashboard.

---

### Task 10: Apply the 1g draft migration (after the code is live)

Only after Task 9 Step 8 shows the merge commit live in production. Applying earlier would be harmless to shoppers (draft only; old code strips the unknown keys). But `show_cart: true` would immediately put the old solid cart pill on every draft page while the product page had no tile, which is a confusing draft to review.

- [ ] **Step 1: Re-check the guards and the timestamp order**

```bash
cd /Users/ali/scheniders-mono-pdp-1g
git switch feat/pdp-p1g-add-to-cart && git pull --ff-only origin main
(cd packages && supabase db query --linked "SELECT store_config_rev, md5(store_config_v2_draft::text) AS draft_md5, md5(store_config_v2::text) AS pub_md5 FROM tenants WHERE slug='scheniders-iraq'" -o csv)
ls packages/supabase/migrations | grep -E '^[0-9]{14}_' | sort | tail -2
```
Expected:
- `38,56df97c58591dbc66724198b6b02dae8,a6f87ba3181b0e94f41ba4a700de257b` (or the values Task 0 pinned);
- the last file listed is `<STAMP>_scheniders_iraq_pdp_redesign_1g_draft.sql`.

If the md5 or rev moved, stop and redo Task 7 Steps 2–6 in a follow-up PR (with Task 8's mirror test still green). If a later-stamped migration reached main first, re-stamp with `git mv` to the current UTC time in a follow-up PR; the mirror test finds the file by suffix.

- [ ] **Step 2: Dry run again**

```bash
(cd packages && supabase db query --linked -f ../tmp/pdp-1g/dryrun-1g.sql -o csv)
```
Expected: `true,true,aa676deb050743aef4cfec1511a73361`.

- [ ] **Step 3: Apply**

```bash
F=$(ls packages/supabase/migrations/*_scheniders_iraq_pdp_redesign_1g_draft.sql); echo "$F"
(cd packages && supabase db query --linked -f "../$F")
```
Expected: exit 0, no rows. On `draft md5 is …` or `store_config_rev is …`, nothing was written: go back to Step 1.

- [ ] **Step 4: Record it**

```bash
V=$(basename "$F" | cut -c1-14); echo "$V"
(cd packages && supabase migration repair --status applied "$V")
(cd packages && supabase db query --linked "SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '$V'" -o csv)
```
Expected: one row, `<V>,scheniders_iraq_pdp_redesign_1g_draft`.

- [ ] **Step 5: Re-read and diff against the intended result**

```bash
(cd packages && supabase db query --linked "SELECT store_config_rev, md5(store_config_v2_draft::text) AS draft_md5, md5(store_config_v2::text) AS pub_md5, updated_at > now() - interval '1 hour' AS bumped FROM tenants WHERE slug='scheniders-iraq'" -o csv)
(cd packages && supabase db query --linked "SELECT (SELECT s.sec->'base'->>'add_to_cart' FROM jsonb_array_elements(t.store_config_v2_draft->'pages') p(page), jsonb_array_elements(p.page->'sections') s(sec) WHERE p.page->>'page_id'='product' AND s.sec->>'id'='aae22169-cef4-4495-842b-863a7caa71c2') AS add_to_cart, t.store_config_v2_draft->'globals'->'header'->'base'->>'show_cart' AS show_cart, (t.store_config_v2_draft->'globals'->'header'->'variants'->0->'override')::text AS override FROM tenants t WHERE t.slug='scheniders-iraq'" -o csv)
```
Expected:
- `38,aa676deb050743aef4cfec1511a73361,a6f87ba3181b0e94f41ba4a700de257b,true` (the draft equals the dry run's target; published unchanged);
- `true,true,"{""sticky"": false, ""surface"": ""overlay"", ""overlay_cart"": true}"`.

- [ ] **Step 6: Clean up**

```bash
rm -rf "${TMPDIR:-/tmp}/pdp-1g-pglite"
```
Delete `tmp/pdp-1g/` after Task 11.

---

### Task 11: Draft-view checks of the whole path at 390px and 360px (after Task 10), and hand-offs

- [ ] **Step 1: Run the storefront from this worktree and check the server markup**

The :3001 server belongs to `/Users/ali/scheniders-mono-pdp` (reviewers), so run this worktree on :3002:
```bash
cp /Users/ali/scheniders-mono/apps/storefront/.env.local apps/storefront/.env.local
(cd apps/storefront && pnpm exec next dev --port 3002)   # in its own terminal / background
curl -s -c tmp/pdp-1g/cj -L "http://localhost:3002/api/draft-view?tenant=scheniders-iraq&token=dev-preview-token&to=/s/scheniders-iraq/products/%D9%88%D9%8A%D9%81%D8%B1" -o tmp/pdp-1g/page.html
for k in 'data-cart-add=""' '>أضف للسلة<' 'data-cart-status=""' 'data-header-cart=""' 'aria-label="سلة التسوّق (0)"' 'aria-label="اطلب عبر واتساب"' '>ثبّت طلبي<' 'data-sticky-style="soft"'; do printf '%s: ' "$k"; grep -oF -- "$k" tmp/pdp-1g/page.html | wc -l | tr -d ' '; done
curl -s -b tmp/pdp-1g/cj "http://localhost:3002/s/scheniders-iraq" | grep -c 'href="/s/scheniders-iraq/cart"'
```
Expected: `1 1 1 1 1 1 1 1`: the tile, its live region, the header chip (zero count in SSR), the WhatsApp tile and the submit, and 1f's soft sticky bar still there. Then `1` or more: the home page's solid header carries the cart pill.

- [ ] **Step 2: The path in a browser, 390×844 and 360×780**

Use the `agent-browser` skill or the Playwright MCP (if the MCP is wedged, Step 1's curl check plus `_pdp-express-cart.test.tsx` and `_site-header-overlay-cart.test.tsx` pin the behaviour). With the draft-view cookie:
- **Row**: from the right, ثبّت طلبي (yellow, the widest, label on one line), the outlined «أضف للسلة» tile, the green WhatsApp tile. `document.documentElement.scrollWidth === innerWidth`. Each target is ≥44px (the row is 60px tall). Pre-measured with the live fonts: submit 194px at 390 and 164px at 360, tile 84, WhatsApp 64.
- **Add**: open «الكمية», step to 2, tap «أضف للسلة». Under the row, ✓ «انضافت للسلة» «شوف السلة». The header chip shows «2» with a short pop. The receipt and «المجموع» do not move. **No request to `/api/checkout/orders`** (network panel), and no field turns red.
- **Second add**: «3» pops again; the line is re-announced (`[data-cart-status] > span` is a new node).
- **Sticky bar**: scroll to the reviews and it slides up exactly as in 1f («اطلب الآن», the price, the WhatsApp square). Tap it and it goes to the phone field, never to the cart.
- **Cart**: tap «شوف السلة». `/s/scheniders-iraq/cart` lists «ويفر انتنس» (the display name, not the long title) × 3 at 36,750 each, the summary shows «التوصيل: مجاني» and «المجموع 110,250 د.ع», and the header pill shows 3.
- **Checkout**: «متابعة الدفع» → `/checkout` with the COD card, the 18 governorates and the same total. **Stop before «أكّد الطلب»** unless Ali has agreed to one test order: a draft-view order is flagged `is_test`, but its insert-time staff notifications still fire (app/actions/checkout.ts:749-773). If he agrees, place it, confirm `/checkout/success` shows the recap and the cart is empty, and cancel the test order in the order book.
- **Reload the PDP**: the chip shows the saved count with **no** pop.
- `document.querySelectorAll('[data-layer="submit"] [dir], [data-header-cart] [dir]').length === 0`.

- [ ] **Step 3: The published site is untouched**

```bash
curl -s "http://localhost:3002/s/scheniders-iraq/products/%D9%88%D9%8A%D9%81%D8%B1" | grep -c 'data-cart-add\|data-header-cart'
```
Expected: `0`.

- [ ] **Step 4: Clean up**

Stop the :3002 server, then:
```bash
rm apps/storefront/.env.local
rm -rf tmp/pdp-1g
```

- [ ] **Step 5: Hand-offs**

- **Ali (sign-off):** the cart pill on every page of the draft (`show_cart: true`). It becomes public only when he publishes.
- **Ali (to-do 8, Kurdish):** the drafted Kurdish for `addToCart` «خستنە سەبەتە», `addedToCart` «خرایە سەبەتەکەوە», `viewCart` «سەبەتەکە ببینە», and the drafted English.
- **Ali (wording):** two "add" actions now exist side by side in the plan: «أضف للسلة» (cart, this slice) and Phase 2's add-on pill «+ أضفه لطلبي» (adds to the direct order). Keep them distinct in the term sheet (`COPY_ACTIONS`), or rename one before Phase 2 ships.
- **Slice 1h proposal (cart and checkout in the redesign voice)**, from the 390px screenshots of 2026-10-30:
  1. Line prices and totals are yellow text on cream (`text-bk-primary`; cart_line_items.client.tsx:156, cart_summary.client.tsx:207, checkout_order_summary.client.tsx:189). Move them to ink under an opt-in `color_lock`, per D4.
  2. One name per action along the path: cart «متابعة الدفع» (config) and sticky «متابعة» (config) → «كمّل طلبك»?; the checkout submit «أكّد الطلب» (chrome, :100) and the reprice message quoting it (:132) → an opt-in `submit_label_i18n` = «ثبّت طلبي».
  3. The cart page sticky bar: apply 1f's `style: "soft"` and `secondary_display: "icon"` (config only).
  4. The trust strip pills scroll sideways at 390px («توصيل مجاني لكل المحافظات» is cut off).
  5. Lines added before 1g, or by other sections, still carry the long catalogue title.
  6. Copy: checkout's «فحص مجاني عند الاستلام — لا تدفع إلا إذا أعجبتك القطعة.» and the PDP band's «تفتح وتجرّب قبل لا تدفع» are one promise in two wordings. The thank-you ETA «خلال ٢٤ ساعة» uses Arabic-Indic digits (D5: Latin).
- **Go-live:** publishing stays Ali's. The publish-day data file (`packages/supabase/go-live/scheniders-iraq-pdp-redesign.sql`, slice 1c) still runs right before it.

---

## Self-review

**1. Request coverage**

| Requirement | Task |
|---|---|
| «أضف للسلة» side by side with «ثبّت طلبي» (Ali's choice) | 5 (one row: scope decision 1) |
| The WhatsApp tile stays beside «ثبّت طلبي» | 5 (untouched class string; order test) |
| «ثبّت طلبي» stays primary: yellow, colour-locked, heaviest | 5 (scope decision 2; snapcheck shows only padding changed) |
| «أضف للسلة» a secondary outline of similar height | 5 (ink outline tile, stretched to the row's 60px) |
| Every target ≥44px, no overflow at 360px, receipt/total not pushed | 5 + 11 (pre-measured; status line under the row, scope decision 4) |
| Respects the chosen variant and quantity | 3 (`unitPrice`, `focusVariantChoice`), 4, 5 (jsdom tests) |
| Clear feedback: «انضافت للسلة» + count bump + «شوف السلة» | 2, 5, 6 |
| Never submits the direct order | 5 (`type="button"`, no fetch, no alert) |
| Opt-in via a pdp_direct_order prop; default markup unchanged | 5 (`add_to_cart`; `_pdp-express-snapshot` unchanged; false = absent test) |
| Sticky bar once something is in the cart | scope decision 8 (unchanged, D6), checked in 11 |
| AddToCart parity, skipped in draft view | 5 (fbq + funnel tests; scope decision 7) |
| Cart/checkout exist and are sensible (COD, governorates, free delivery, Arabic) | Findings table; Task 0 Step 4 pins the page md5s; Task 11 walks them |
| Header (overlay on the product page) shows a cart with a live count | 1 (frozen first), 6, 7, 8 |
| Full path PDP → cart → checkout → order works | 7 (header pill on every page), 11 (browser walk; order only with Ali's OK) |
| Consistent with the redesign (`--bk-*`, Arabic-first, LTR, 390px) | 5, 6, 9 (hygiene greps, no `dir`), 11; cart/checkout restyle → 1h (scope decision 9) |
| Chrome strings ar/en/ku | 2 (`EXPRESS_STRINGS`, on the table list → Kurdish coverage + F12 lint) |
| Guarded idempotent draft migration, PGlite replay, live dry run, apply after deploy, repair | 7, 10 |
| Fixtures + snapshot mirror + snapcheck | 8 |

**2. Placeholder scan.** `STAMP` (Task 7 Step 1) and `V` (Task 10 Step 4) are produced at run time, as in 1b–1f. Every code block above is the exact file content that was pre-run on 2026-10-30 in a throwaway worktree of `origin/main` `71833255` with `feat/pdp-p1f-sticky-copy` (`2e69cbb0`) merged in. That run covered the unit, jsdom and markup tests, the four failing-first states quoted, the sections, storefront and platform type gates, storefront + platform lint, the 16-file baseline run, the snapshot update and `snapcheck.mjs`, the PGlite replay (1f applied first over the live post-1e row) and the dry run (PGlite post-1f: `true,true,aa676deb…`; live pre-1f: `true,false,9fd7f904…`). The row widths were measured on localhost with the live fonts by injecting the exact sizes. The PR, merge, apply and draft-view browser steps touch shared state and were not run.

**3. Type consistency.**
- `ExpressModel.unitPrice` / `.focusVariantChoice` (Task 3) are what `expressCartLine` picks (`Pick<ExpressModel, "product" | "qty" | "price" | "unitPrice">`, Task 4) and what `CartTile` calls (Task 5).
- `expressCartLine({ product, variant, qty, price, unitPrice }): CartItem` (Task 4) is called by `CartTile` with `m.chosen.variant` (Task 5).
- `CartTile({ m, locale, onAdded })` and `CartAddedStatus({ adds, locale })` (Task 5) are what `CheckoutRow` renders.
- `xs("addToCart" | "addedToCart" | "viewCart")` keys (Task 2) exist in `EXPRESS_STRINGS`, and `COPY_ACTIONS.addToCart` / `.viewCart` match them (lint test).
- `useCartBump(): boolean` and `CART_BUMP_MS` (Task 6, `helpers/cart-bump.ts`) are what `OverlayHeader` and the test import. `OverlayHeader`'s `cart?: { label: string; count: number } | null` is what `SiteHeaderRender` passes.
- Fixtures `SLICE_1G_PDP_PATCH`, `SLICE_1G_HEADER_PATCH`, `SLICE_1G_HEADER_VARIANT_PATCH` (Task 8) match the migration's `pdp_patch`, `header_patch` and `header_variant_patch` blocks (Task 7). `IRAQ_REDESIGN_HEADER_PRODUCT_INPUT` merges `IRAQ_DRAFT_HEADER_PRODUCT_OVERRIDE` + the variant patch over the patched base, which is the resolver's result for these scalar keys.

**Risks carried forward (for the reviewer):**
- The cart does not cap quantity at stock (true of `pdp_add_to_cart` too). Repeated adds past stock are refused at checkout by the server with its existing message.
- A shopper can add to the cart **and** place the direct order for the same perfume. The direct order's success does not clear the cart, so a later cart checkout would be a second order (the server's soft duplicate guard keys on phone and items within its window). Clearing that product from the cart on direct-order success would be a behaviour change for Ali to decide.
- `show_cart: true` adds the cart pill to every page at publish (Ali's sign-off).
- The first-party funnel's `add_to_cart` and Meta/TikTok AddToCart start counting for this store once it is published. Dashboards comparing before and after should know that.
- An accepted order bump is not carried into the cart (scope decision 6). scheniders-iraq has none today.
