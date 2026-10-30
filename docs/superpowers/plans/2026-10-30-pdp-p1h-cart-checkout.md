# PDP Redesign — Slice 1h (Cart and Checkout Restyle) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make scheniders-iraq's `/cart`, `/checkout` and `/checkout/success` (the thank-you every PDP order also lands on) look and read like the redesigned express PDP at 390px and 360px. That means quiet hairline cards instead of thick ink outlines; prices and totals in ink (D4); one yellow fill per page, the order action, drawn like the 1f soft button; the chapter heading scale; catalogue titles on two lines instead of «عطر ويفر انتنس ا…»; the thank-you naming the product as its page does («ويفر انتنس»); and one name per action along the path: «كمّل طلبك» → «ثبّت طلبي», «اطلب عبر واتساب», «راسلنا واتساب». The PDP's own promises (try before you pay, the return line, free delivery, the 24h claim) are said once per page, in the band's words. Everything is opt-in through section props, so every other tenant's markup stays byte-identical. The draft config is written by one guarded migration, applied only after the code is live.

**Architecture:** Six sections gain `style: z.enum(["chunky", "soft"]).optional().catch(undefined)`, the same knob `sticky_cta_bar` got in 1f: `cart_line_items`, `cart_summary`, `trust_strip`, `checkout_form`, `checkout_order_summary` and `order_confirmation`. `"chunky"` and absent render today's markup, which is frozen first in a new jsdom baseline (22 renders). `checkout_form` also gains `submit_label_i18n` (`.catch`), which names the submit and the reprice message. The soft renders share one small module, `helpers/soft-commerce.tsx` (receipt card, receipt row, the 1f soft primary, the soft WhatsApp row, the express field classes), and one new chrome table, `cart_checkout.strings.ts` (ar/en/ku). They use `ChapterHeading`, which is widened to render an `h1`. `pdp_direct_order` adds an additive `display_name` to the thank-you session stash (the request body is unchanged), and the soft recap prefers it. The draft write is one migration whose `edits` list (eight sections on three pages: merge, remove, enable) runs through one jsonb expression. The dry run reuses that expression as a SELECT. It is replayed on PGlite over a read-only copy of the live row, mirrored by `SLICE_1H_EDITS` in the redesign fixtures, and applied after merge and deploy.

**Tech Stack:** Next.js 16 / React 19.2 sections package (`@scheniders/sections`), zustand 5 (+ `persist`), zod v4, Tailwind v3.4 (storefront) / v4 (platform), vitest 2 (node + jsdom, @testing-library/react 16), Supabase CLI 2.98 (`db query --linked`, `migration repair`), PGlite 0.2.17 (local replay only, outside the repo), pnpm 10, Node 20.

**Spec / context:** `docs/superpowers/specs/2026-10-27-pdp-lower-page-redesign-design.md`: hard constraints, D4 (colour lock), D5 (Latin digits), D8 (return line), D11 (checkout body unchanged), §1.1 (`ChapterHeading`), §1.2 F12 (term sheet, string tables), §1.9 (draft-migration guards), §1.10 (verification). The 1g plan's Task 11 hand-off list (`docs/superpowers/plans/2026-10-30-pdp-p1g-add-to-cart.md`) is this slice's brief. Slices 1a–1g are merged (`origin/main` `76466796`) and every draft migration through `20261030120001_scheniders_iraq_pdp_redesign_1g_draft.sql` is applied live. **Task 0 re-reads every guard value, and the plan pins whatever is live then.**

---

## What the live pages hold today (read-only, 2026-10-30)

Read with `supabase db query --linked` on `sduvpgqwhxragxtxztur`, slug `scheniders-iraq`: `store_config_rev 38`, draft md5 `aa676deb050743aef4cfec1511a73361`, published md5 `a6f87ba3181b0e94f41ba4a700de257b`. Rendered from a throwaway worktree of `origin/main` on :3004 in a draft-view session, with a seeded two-line cart (Wayfarer ×2 under its long catalogue title, «نورث ستاك 2» ×1), at 390×844 and 360×780. The before screenshots are in `.superpowers/brainstorm/pdp-review-inputs/p1h-before/`.

| Page (draft page md5) | Sections, in order (id) | What is off the redesign |
|---|---|---|
| `cart` `aeb2219e…` (same in published) | `cart_line_items` 2e4337a4; `cart_summary` e5dbfa28; `trust_strip` 78babd62; `sticky_cta_bar` aee18fed | Ink-outlined cards with hard shadows. Line totals and the total in **yellow text** (`text-bk-primary`, cart_line_items.client.tsx:156, cart_summary.client.tsx:207). «عطر ويفر انتنس ا…» truncated. The summary's «متابعة الدفع» and the sticky bar's «متابعة» are two yellow buttons with two names: the bar (≈74px) covers the summary's button, whose top sits at y=699 on 390×844. A solid green «اطلب عبر واتساب» block sits under «أو». The fine print «الدفع عند الاستلام متاح • لا دفع مسبق» repeats the trust strip. The trust strip is 815px wide in a 390px viewport and scrolls sideways («…صيل مجاني لكل المحافظات» is cut off). The rows read left to right: photo left, stepper right. |
| `checkout` `a80eb748…` (same in published) | `checkout_form` 561f48cc; `checkout_order_summary` 10bbe359; `trust_strip` 4d0bc827 | Step chips «السلة › التفاصيل › التأكيد», with the active one an amber fill. The submit says «أكّد الطلب — 128,500 د.ع» (chrome, checkout_form.client.tsx:100; the reprice message quotes «أكّد الطلب»). That is the third name for the order action, against the PDP's «ثبّت طلبي». The COD tile is green-tinted with a green check. The eye icon by the reassurance is yellow. Under the button: «بتأكيدك الطلب…» fine print, «أو», then «أكمل الطلب عبر واتساب». The summary's total is yellow and its names truncated. COD is said five times (payment tile, reassurance, fine print, summary note, trust pill). The submit sits at y=885, below the first screen. 18 governorates ✓, COD only ✓, free delivery ✓. |
| `checkout_success` `f2f49697…` (published differs: `1404d030…`) | `order_confirmation` 59bfb096 (`show_call_card` true); `product_grid` 075d773d «وصل حديثاً» | The call card (head) is fine. The recap total is yellow text, the recap names Wayfarer by its long catalogue title (the express order stashes `product.name`), and the step numbers are yellow-filled discs (D4: yellow fills are order actions only). The ETA is «خلال ٢٤ ساعة من تثبيت الطلب» (Arabic-Indic digits, D5; a stronger claim than the PDP's «أغلب الطلبات توصل خلال 24 ساعة من تثبيت الطلب»). WhatsApp is «تواصل معنا عبر واتساب» (COPY_ACTIONS.whatsapp is «راسلنا واتساب»). The track link has an ink outline and a hard shadow. |
| Data | `commerce.shipping = {default_rate: {fee_iqd: 0}}`; no loyalty, referral, returns policy or discounts; `contact_phone +9647779703832` | So the promo input, the discount rows, the loyalty box and the referral field never render for this tenant. The soft style still draws them (tests cover the promo). |
| Adders | The only section on scheniders-iraq's pages that adds to the cart is 1g's express «أضف للسلة» tile, which names the line `displayNameOf(product)`. `product_grid` / `search_results_grid` use `card_style: "price_pill"`, whose card has no quick-add. | Fresh lines already carry «ويفر انتنس». Only lines persisted before 1g carry the long title, so the soft list wraps names to two lines instead of renaming them. |

Nothing in this slice touches `/api/checkout/orders`, `create_order_atomic`, or the PDP page config.

---

## Scope decisions (read before starting)

1. **One knob, `style: "soft"`, on six sections.** It is the same name and the same `.catch(undefined)` as 1f's `sticky_cta_bar.style`, so a merchant learns one switch. `"chunky"` renders exactly like absent (a test per section). The soft branch returns early in each render, after the hooks, so the default JSX is untouched. In `checkout_form` (1,252 lines of shared form logic) the soft switch is applied **value by value** (class strings, `style` objects, three swapped blocks), and each default value is the exact literal of today. The 22-render baseline written in Task 1 proves it.
2. **Colour lock (D4) on every soft render.** Yellow fills only the page's order action: the cart's «كمّل طلبك» link and the checkout's «ثبّت طلبي» submit, each in the 1f soft grammar (`rounded-bk-input bg-bk-primary shadow-bk-button`, no ink border, 19px/900 label, arrow chip). There is **no yellow text** anywhere: line totals, totals and «مجاني» are ink, the step numbers are ink discs (`bg-bk-ink text-bk-surface`), and the eye icon is ink. Green is the WhatsApp glyph and the soft tile's tint only. The COD tile becomes a quiet ink statement, because a chosen payment method is a fact, not a success state. `expectSoftRules()` checks all of this over every soft render.
3. **One name per action along the path (F12).** Cart → checkout: «كمّل طلبك» (`COPY_ACTIONS.continueOrder`, the sticky bar's own words; config). The order: «ثبّت طلبي» (`COPY_ACTIONS.placeOrder`), through the new `checkout_form.submit_label_i18n` (config), which also names the reprice line: «تحدّثت سلتك. راجعها واضغط «ثبّت طلبي» مرة ثانية.» (new chrome `errReviewAction`; without a merchant label the old line stays). Ordering on WhatsApp: «اطلب عبر واتساب», the express tile's words, now `COPY_ACTIONS.orderOnWhatsapp`. It replaces the checkout's «أكمل الطلب عبر واتساب» in soft. Contacting the store: «راسلنا واتساب» (`COPY_ACTIONS.whatsapp`; the thank-you's label, config). The soft checkout drops the step chips: their «التأكيد» is one more name for the order, and the express path has no steps.
4. **The cart page's sticky bar is switched off (`enabled: false`, config only).** Measured: with two lines the summary's button sits at y=699 on 390×844, and the 74px bar covers it, so there are two yellow buttons, one on top of the other. The soft summary moves the button higher still (one to three lines keep it on the first screen). Re-using 1f's `hide_while` would need new code that only watches a product form. Rejected for now; the risk is noted.
5. **Each promise once per page, in the band's words.** Cart: the trust strip goes soft (tiles two to a row, wrapping, from the reading start; a grid cannot flip without `dir`, a flex row can) with three pills: «الدفع عند الاستلام», «تفتح وتجرّب قبل لا تدفع» (`BAND_TRY_FIRST`, the first clause of 1b's row 1; the tester clause is the product page's own), and 1b's return line (D8). Free delivery is the receipt's «التوصيل مجاني» row, not a pill. The soft summary drops its fine print. Checkout: the trust strip is switched off and `cod_note_i18n` is removed from the summary. The reassurance beside the submit becomes «تفتح وتجرّب قبل لا تدفع — ما عجبك؟ ترفضه قدام المندوب أو ترجّعه خلال أسبوع». COD is the payment tile, free delivery is the receipt row, and the soft form has no fine print. Thank-you: the ETA becomes the PDP's one delivery claim, `delivery_sla_i18n` («أغلب الطلبات توصل خلال 24 ساعة من تثبيت الطلب», Latin digits, D5).
6. **Display names: wrap, don't rename.** The only adder on this tenant's pages already names lines by `displayNameOf` (1g). The cart and checkout pages load no products (`products: []`), so renaming would need a new query on every v2 cart page. Soft lines use `line-clamp-2` instead of `truncate`, so even a pre-1g line reads in full. The thank-you is different: express orders stash `product.name` today, so `pdp_direct_order` writes an **additive** `display_name` into the session stash (`displayNameOf`, the bump's own for a bump line). The soft recap prefers it, and the default recap ignores it (the baseline proves this). The request body is unchanged (D11), and a test pins it.
7. **The heading scale.** The cart's h1 «سلتك», the checkout's h1 «تفاصيل التوصيل», and the summaries', recap's and steps' h2s are all `ChapterHeading` (`text-bk-chapter`, 22px/900). `ChapterHeading.as` is widened to `"h1" | "h2" | "h3"` (type only; existing callers are unchanged).
8. **Soft fields are the express form's** (`rounded-bk-input border-bk border-bk-divider`, 52px, labels at 13px/700, reading-edge alignment). The phone row draws +964 and the number in one outline without `dir` (an LTR document already puts +964 first). The default path keeps its existing `dir="ltr"`, and the per-file count of `dir=` is unchanged.
9. **The checkout's submit shows the total as a second line under «ثبّت طلبي».** The summary sits below the form (the section order is unchanged), so the shopper sees the amount where they tap. On the PDP the receipt sits directly above the button, which is why the PDP's button carries no total.
10. **Out of scope:** the thank-you call card (its own designed card, slice P5); the success page's «وصل حديثاً» grid (green prices; the PDP disabled its grid, D17); an empty-cart "keep shopping" link; refactoring the express receipt's private `Row` onto `ReceiptRow`. The last is the same class strings, and a DRY follow-up that would touch PDP snapshots for no visual change.
11. **Draft config = eight edits on three pages, no PDP keys.** A guarded migration on draft md5 `aa676deb…` and rev 38. The live remote history's max version is `20261030120001`, which is later than the clock on 2026-10-30 10:17 UTC, so the stamp is `max(now, max(file, remote) + 1s)` (Task 10 Step 1). Applied with `supabase db query --linked -f` and recorded with `supabase migration repair --status applied`. Never `db push`. Never before the code is live.
12. **One small button family, ready for the button-row slice.** The order action (`SOFT_PRIMARY` + `SoftPrimaryBody`: label, optional sub-line, arrow chip, busy spinner) and the WhatsApp row (`SoftWhatsappLink`) live only in `helpers/soft-commerce.tsx`, with no section-specific props. Ali's separate redesign of the express PDP's three-button row (WhatsApp · «أضف للسلة» · «ثبّت طلبي») can therefore reuse or restyle them in one place. 1h does not touch the PDP row or `pdp_express/checkout-row.tsx`. If that slice changes the family's look, the cart and checkout follow automatically, and the 1h redesign snapshot is that slice's one reviewed update.
13. **Frozen first.** The 16 existing baseline files and every existing `.snap` stay byte-identical. Two `.snap` files are new: the Task 1 baseline (written before any section code) and the Task 11 redesign renders (written once, then read).

## Conventions for every task

- **Worktree.** `/Users/ali/scheniders-mono-pdp` serves reviewers and a dev server on :3001, so **do not switch its branch**. Work in a dedicated worktree:
  ```bash
  export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"
  cd /Users/ali/scheniders-mono-pdp-1h
  ```
  (Task 0 Step 1 creates it.)
- pnpm only. Never npm/yarn. Node 20 (Node 24 crashes `pnpm install`).
- Tests: `CI=true pnpm exec vitest run <path>` from the repo root. `CI=true` never writes a snapshot. Only **Task 1 Step 4** and **Task 11 Step 4** (two new `.snap` files) run vitest without `CI=true`. **Never `-u`.**
- vitest prints coloured output; the expected lines below are plain text (`Tests  4 passed (4)`). jsdom suites can take 60–120s on a loaded machine. If the shell's 2-minute limit cuts a run off, re-run it in the background, not twice in parallel.
- Sections type gate (expected **no output**):
  ```bash
  (cd packages/sections && ./node_modules/.bin/tsc --noEmit --incremental false -p tsconfig.json --rootDir .. 2>&1 | grep "error TS" | grep -v TS6059 | grep -v -E "^src/(RenderSection\.sticky|_chrome-baseline-snapshot|_chrome|_delivery-promise|_pdp-classic-snapshot|image-gallery-order|product_attributes|helpers/whatsapp|pdp_express/checkout-row\.receipt)\.test\.tsx?\(")
  ```
- Before every commit: `git branch --show-current` → `feat/pdp-p1h-cart-checkout`.
- Commit with explicit paths only, as gga2000, with the trailer (lint-staged runs `eslint --fix` on staged files):
  ```bash
  git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```
- Banned in new code: `any`, `@ts-ignore`, `eslint-disable`, a non-null `!` that silences the compiler, swallowed catches, hex/rgb colour literals, and any new `dir` attribute. Solid yellow (`bg-bk-primary`) appears in soft renders only on the order action. Green (`bk-success`) appears only on the WhatsApp glyph and the soft tile's tint.
- `checkout_form.client.tsx` and `order_confirmation.client.tsx` keep their existing default-path style objects (with today's `var(--bk-…, #hex)` fallbacks), only re-indented inside a `soft ? … :` switch. So a plain `git diff | grep '#[0-9a-f]{6}'` lists those moved lines. Task 12 checks the **per-file count** of colour literals and `dir=` instead: equal before and after.
- All live database access before Task 13 is **read-only** (`SELECT`, or a `DO` block replayed on PGlite).
- Expected counts were pre-run on 2026-10-30 in a throwaway worktree of `origin/main` `76466796` with the exact code of this plan, against live read-only data. The first-failing runs (Step 2 of Tasks 2–9) were not each pre-run. They name which tests fail and why, not exact counts.

## File structure

| File | Status | Responsibility |
|---|---|---|
| `packages/sections/src/_cart-checkout-fixtures.ts` | create | the draft's cart/checkout/thank-you section bases as stored, a two-line cart, the express stash, the checkout tenant, `pageCtx()` |
| `packages/sections/src/_cart-checkout-test-utils.tsx` | create | `html()` (React 19.2 ids normalised), `mountInStore()`, `withCart()`, `expectSoftRules()` |
| `packages/sections/src/_cart-checkout-baseline-snapshot.test.tsx` (+ `.snap`) | create | today's six sections, frozen before any code |
| `packages/sections/src/cart_checkout.strings.ts` (+ `.test.ts`) | create | `CART_STRINGS` / `cs()`: soft receipt and promo chrome, ar/en/ku |
| `packages/sections/src/_string-tables.ts` | modify | the new table is linted and Kurdish-covered |
| `packages/sections/src/_copy-terms.ts` | modify | `COPY_ACTIONS.orderOnWhatsapp`; `continueOrder` covers the cart |
| `packages/sections/src/helpers/soft-commerce.tsx` (+ `.test.tsx`) | create | `SOFT_RECEIPT`, `SOFT_CARD`, `SOFT_FIELD`, `SOFT_LABEL`, `SOFT_PRIMARY`, `SoftPrimaryBody`, `SoftWhatsappLink`, `ReceiptRow` |
| `packages/sections/src/helpers/chapter-heading.tsx` | modify | `as` accepts `"h1"` |
| `packages/sections/src/trust_strip.tsx` (+ `_trust-strip-soft.test.tsx`) | modify | `style: "soft"`: wrapping quiet tiles |
| `packages/sections/src/cart_line_items.tsx`, `.client.tsx` (+ `_cart-lines-soft.test.tsx`) | modify | `style: "soft"`: `SoftCartLines` |
| `packages/sections/src/cart_summary.tsx`, `.client.tsx` (+ `_cart-summary-soft.test.tsx`) | modify | `style: "soft"`: `SoftCartSummary` |
| `packages/sections/src/checkout_order_summary.tsx`, `.client.tsx` (+ `_checkout-summary-soft.test.tsx`) | modify | `style: "soft"`: `SoftOrderSummary` |
| `packages/sections/src/checkout_form.tsx`, `.client.tsx` (+ `_checkout-form-soft.test.tsx`) | modify | `submit_label_i18n`, `style: "soft"`, `errReviewAction` |
| `packages/sections/src/order_confirmation.tsx`, `.client.tsx` (+ `_order-confirmation-soft.test.tsx`) | modify | `style: "soft"`: `SoftRecap`, soft steps/ETA/actions; stash `display_name` |
| `packages/sections/src/pdp_direct_order.client.tsx` | modify | the stash's additive `display_name` |
| `packages/supabase/migrations/<STAMP>_scheniders_iraq_pdp_redesign_1h_draft.sql` | create | the guarded draft write |
| `packages/sections/src/_pdp-redesign-fixtures.ts` | modify | `BAND_TRY_FIRST`, `SLICE_1H_*`, `IRAQ_REDESIGN_*_INPUT` |
| `packages/sections/src/_pdp-redesign-snapshot.test.tsx` | modify | the 1h mirror test (no snapshot change) |
| `packages/sections/src/_cart-checkout-redesign.test.tsx` (+ `.snap`) | create | the draft's three pages after 1h, ar/en |
| `tmp/pdp-1h/` (`dryrun-1h.sql`, `cart-seed.json`) | scratch (gitignored) | read-only checks |
| `${TMPDIR:-/tmp}/pdp-1h-pglite/` | scratch (outside the repo) | PGlite replay harness |

---

### Task 0: Worktree, baseline, and the live guard values

- [ ] **Step 1: A dedicated worktree off main**

```bash
export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"
cd /Users/ali/scheniders-mono
git fetch origin
git log --oneline -3 origin/main
git worktree add -b feat/pdp-p1h-cart-checkout ../scheniders-mono-pdp-1h origin/main
cd /Users/ali/scheniders-mono-pdp-1h
CI=true pnpm install --frozen-lockfile
mkdir -p packages/supabase/.temp && cp /Users/ali/scheniders-mono/packages/supabase/.temp/* packages/supabase/.temp/
git branch --show-current
```
Expected: the log shows `76466796` (or later); `pnpm install` ends `Done`; the branch is `feat/pdp-p1h-cart-checkout`.

- [ ] **Step 2: Baseline counts on the untouched branch**

```bash
CI=true pnpm exec vitest run packages/sections/src packages/shared/src apps/storefront/lib
CI=true pnpm exec vitest run packages/sections/src
CI=true pnpm exec vitest run packages/sections/src/_pdp-redesign-snapshot.test.tsx packages/sections/src/_arabic-copy-lint.test.ts packages/sections/src/_kurdish-coverage.test.ts
```
Expected on `76466796`: `Test Files  219 passed (219)`, `Tests  2616 passed (2616)`; sections alone `Test Files  149 passed (149)`, `Tests  1631 passed (1631)`; the last run `Tests  64 passed (64)`. **Write down whatever prints.** This slice adds 10 files and 86 tests.

- [ ] **Step 3: The anchors this plan edits are as described**

```bash
cd packages/sections/src
grep -n '  /\*\* Finishing a half-filled form, from the sticky bar. \*/\|  viewCart: "شوف السلة",' _copy-terms.ts
grep -n '  "sticky_cta_bar.strings.ts",' _string-tables.ts
grep -n '  as?: "h2" | "h3";' helpers/chapter-heading.tsx
grep -n 'errReview: {\|placeOrder: {\|<div className="flex" dir="ltr">\|{/\* Step indicator \*/}' checkout_form.client.tsx
grep -n 'items: items.map((i) => ({' pdp_direct_order.client.tsx
grep -n '^export const SLICE_1G_PDP_PATCH\|^export const IRAQ_REDESIGN_HEADER_PRODUCT_INPUT' _pdp-redesign-fixtures.ts
grep -n '  SLICE_1G_PDP_PATCH,\|the patched props satisfy the schema unchanged' _pdp-redesign-snapshot.test.tsx
cd ../../..
ls packages/supabase/migrations | grep -E '^[0-9]{14}_' | sort | tail -1
```
Expected: one hit per pattern (`items: items.map((i) => ({` once in `pdp_direct_order.client.tsx`, in the thank-you stash ≈ line 1117), and the last migration file is `20261030120001_scheniders_iraq_pdp_redesign_1g_draft.sql`. **Where main has moved, adapt only the anchors** (the `old_string`s) and keep the code.

- [ ] **Step 4: The CLI link and the guard values**

```bash
cat packages/supabase/.temp/project-ref; echo
cd packages
supabase db query --linked "SELECT store_config_rev, md5(store_config_v2_draft::text) AS draft_md5, md5(store_config_v2::text) AS pub_md5 FROM tenants WHERE slug='scheniders-iraq'" -o csv
supabase db query --linked "SELECT p.page->>'page_id' AS page, md5(p.page::text) AS page_md5, (SELECT string_agg(concat(s.sec->>'type', ':', s.sec->>'id'), ' ' ORDER BY s.ord) FROM jsonb_array_elements(p.page->'sections') WITH ORDINALITY s(sec, ord)) AS sections FROM tenants t, jsonb_array_elements(t.store_config_v2_draft->'pages') p(page) WHERE t.slug='scheniders-iraq' AND p.page->>'page_id' IN ('cart','checkout','checkout_success') ORDER BY 1" -o csv
supabase db query --linked "SELECT max(version) FROM supabase_migrations.schema_migrations" -o csv
cd ..
```
Expected:
- `sduvpgqwhxragxtxztur` (never the OLD `ibfdugifekivquwprqjc`);
- `38,aa676deb050743aef4cfec1511a73361,a6f87ba3181b0e94f41ba4a700de257b`;
- `cart,aeb2219efbc9ab502731585a7da9dc5d,cart_line_items:2e4337a4-87ae-478d-98b6-5f361a404562 cart_summary:e5dbfa28-5c29-4f8b-810a-b5fe2baf1d2c trust_strip:78babd62-1484-48f1-8ed9-90e4fbc198a2 sticky_cta_bar:aee18fed-e7c6-4f3f-8257-9f1a60fb4a3c`, `checkout,a80eb7485fdc2cafa1949608b7f2da2f,checkout_form:561f48cc-7a08-4a8e-bb9f-b76a4ad8c26a checkout_order_summary:10bbe359-3565-43f7-883a-da6607379b87 trust_strip:4d0bc827-8914-4505-b018-10edaef38130`, `checkout_success,f2f496976cb5bda8689a1e589b21f097,order_confirmation:59bfb096-e8ab-4503-b2ab-def24113ec07 product_grid:075d773d-f9d3-436a-9055-648d9eb8aac9`;
- `20261030120001` (or later).

**If the draft md5 or rev differs, the migration pins the values read now** (`c_expected_draft_md5`, `c_expected_rev`, the header comment, `dryrun-1h.sql`'s literals). **If a cart/checkout/success page md5 differs,** the merchant edited one of those pages in the builder: re-read that page's sections (`SELECT p.page FROM …`), update the matching `IRAQ_DRAFT_*_BASE` in Task 1 Step 1 and the Rollback lines in Task 10 Step 2, and re-check that each edit still makes sense.

---

### Task 1: Freeze today's cart, checkout and thank-you renders (before any section code)

**Files:**
- Create: `packages/sections/src/_cart-checkout-fixtures.ts`
- Create: `packages/sections/src/_cart-checkout-test-utils.tsx`
- Create: `packages/sections/src/_cart-checkout-baseline-snapshot.test.tsx`
- Create (written by vitest, once): `packages/sections/src/__snapshots__/_cart-checkout-baseline-snapshot.test.tsx.snap`

None of these six sections has a baseline today. They are client sections (the cart lives in the zustand store, the recap in the session stash), so the baseline renders them in jsdom and normalises React 19.2's render-order ids (`_r_c_`).

- [ ] **Step 1: The fixtures (the draft as stored, read 2026-10-30)**

Create `packages/sections/src/_cart-checkout-fixtures.ts`:

```ts
// =====================================================================
// Cart, checkout and thank-you fixtures (slice 1h)
// =====================================================================
// scheniders-iraq's draft cart, checkout and checkout_success sections as
// stored (read-only, 2026-10-30, draft md5 aa676deb…, rev 38), a two-line
// cart (one line still carrying the long catalogue title, one named as the
// express page names it), and the thank-you stash the two order forms
// write. The baselines freeze these renders before slice 1h's code.
// =====================================================================

import type { CartItem, RuntimeContext } from "@scheniders/shared";
import type { Props as CartLineItemsProps } from "./cart_line_items";
import type { Props as CartSummaryProps } from "./cart_summary";
import type { Props as CheckoutFormProps } from "./checkout_form";
import type { Props as CheckoutOrderSummaryProps } from "./checkout_order_summary";
import type { Props as OrderConfirmationProps } from "./order_confirmation";
import type { Props as StickyProps } from "./sticky_cta_bar";
import type { SectionRenderContext } from "./_types";
import type { Tenant } from "./types";
import { FIXTURE_NOW, fixtureTenant } from "./_pdp-fixtures";

/** The draft's cart_line_items 2e4337a4 base. */
export const IRAQ_DRAFT_CART_LINES_BASE: CartLineItemsProps = {
  show_thumbnails: true,
  empty_state_message_i18n: { ar: "سلتك فارغة — تابع التسوّق.", en: "Your cart is empty — keep shopping." },
};

/** The draft's cart_summary e5dbfa28 base. */
export const IRAQ_DRAFT_CART_SUMMARY_BASE: CartSummaryProps = {
  heading_i18n: { ar: "ملخّص الطلب", en: "Order summary" },
  checkout_label_i18n: { ar: "متابعة الدفع", en: "Continue to checkout" },
  show_promo_input: false,
};

/** The draft's two trust_strip bases (cart 78babd62, checkout 4d0bc827):
 *  the same four pills. */
export const IRAQ_DRAFT_TRUST_BASE = {
  pills: [
    { bg: "mint", icon: "payments", label_i18n: { ar: "الدفع عند الاستلام", en: "Cash on delivery" } },
    {
      bg: "butter",
      icon: "local_shipping",
      label_i18n: { ar: "توصيل مجاني لكل المحافظات", en: "Free delivery, every governorate" },
    },
    { bg: "sky", icon: "verified", label_i18n: { ar: "افحص المنتج قبل الدفع", en: "Inspect before you pay" } },
    { bg: "lilac", icon: "undo", label_i18n: { ar: "استرجاع خلال أسبوع", en: "Returns within a week" } },
  ],
} as const;

/** The draft's cart-page sticky_cta_bar aee18fed base. */
export const IRAQ_DRAFT_CART_STICKY_BASE: StickyProps = {
  primary_href: "/checkout",
  primary_label_i18n: { ar: "متابعة", en: "Continue" },
  secondary_kind: "whatsapp",
  secondary_label_i18n: { ar: "تواصل", en: "Chat" },
  show_total: false,
};

/** The draft's checkout_form 561f48cc base. */
export const IRAQ_DRAFT_CHECKOUT_FORM_BASE: CheckoutFormProps = {
  payment_methods: ["cod"],
  reassurance_text_i18n: {
    ar: "فحص مجاني عند الاستلام — لا تدفع إلا إذا أعجبتك القطعة.",
    en: "Free inspection on delivery — pay only if you're happy.",
  },
  require_email: false,
  require_notes: false,
};

/** The draft's checkout_order_summary 10bbe359 base. */
export const IRAQ_DRAFT_ORDER_SUMMARY_BASE: CheckoutOrderSummaryProps = {
  cod_note_i18n: {
    ar: "الدفع عند الاستلام — لا تدفع إلا بعد فحص الطلب.",
    en: "Cash on delivery — pay only after inspection.",
  },
  heading_i18n: { ar: "ملخّص الطلب", en: "Order summary" },
  show_thumbnails: true,
  sticky: true,
};

/** The draft's order_confirmation 59bfb096 base. */
export const IRAQ_DRAFT_CONFIRMATION_BASE: OrderConfirmationProps = {
  call_promise_i18n: {
    ar: "سنتصل بك لتأكيد الطلب والعنوان قبل الشحن.",
    en: "We'll call you to confirm your order and address before shipping.",
  },
  continue_label_i18n: { ar: "متابعة التسوّق", en: "Continue shopping" },
  copied_label_i18n: { ar: "تم النسخ", en: "Copied" },
  copy_label_i18n: { ar: "نسخ", en: "Copy" },
  eta_i18n: { ar: "خلال ٢٤ ساعة من تثبيت الطلب", en: "Within 24 hours of confirmation" },
  eta_label_i18n: { ar: "موعد التوصيل المتوقع", en: "Estimated delivery" },
  eyebrow_i18n: { ar: "تم استلام طلبك", en: "Order received" },
  heading_i18n: { ar: "شكراً لك على طلبك", en: "Thank you for your order" },
  heading_named_i18n: { ar: "شكراً {name}", en: "Thanks, {name}" },
  order_label_i18n: { ar: "رقم الطلب", en: "Order number" },
  recap_heading_i18n: { ar: "ملخّص طلبك", en: "Your order" },
  show_call_card: true,
  show_order_recap: true,
  steps: [
    {
      body_i18n: { ar: "نراجع معك الطلب والعنوان.", en: "We double-check your order and address with you." },
      title_i18n: { ar: "نتصل بك للتأكيد", en: "We call to confirm" },
    },
    {
      body_i18n: {
        ar: "يُغلّف طلبك بعناية ويُسلّم للمندوب.",
        en: "Your order is packed with care and handed to the courier.",
      },
      title_i18n: { ar: "نجهّز طلبك", en: "We prepare your order" },
    },
    {
      body_i18n: { ar: "افحص طلبك ثم ادفع للمندوب نقداً.", en: "Check your order, then pay the courier in cash." },
      title_i18n: { ar: "تستلم وتدفع عند الباب", en: "You receive and pay at the door" },
    },
  ],
  steps_heading_i18n: { ar: "ماذا يحدث الآن؟", en: "What happens next" },
  total_label_i18n: { ar: "المجموع", en: "Total" },
  track_label_i18n: { ar: "تتبّع طلبك", en: "Track your order" },
  whatsapp_label_i18n: { ar: "تواصل معنا عبر واتساب", en: "Message us on WhatsApp" },
  whatsapp_message_i18n: {
    ar: "مرحباً! عندي استفسار عن طلبي رقم {order}",
    en: "Hi! I have a question about my order {order}",
  },
};

/** A line added before 1g (or by a section that names lines by the
 *  catalogue title): Wayfarer's long name, two units. */
export const LONG_TITLE_LINE: CartItem = {
  product_id: "5e847790-11a5-439f-bace-c315e0ff1ae8",
  variant_id: null,
  name: "عطر ويفر انتنس الفاخر من باريس كورنر للرجال",
  variant_name: null,
  price: 36750,
  quantity: 2,
  image_url: "https://cdn.example.com/fixture/wayfer.jpg",
  base_price: 36750,
};

/** A line added by the express «أضف للسلة» tile (1g): the display name. */
export const DISPLAY_NAME_LINE: CartItem = {
  product_id: "e41ec722-dbb7-47b5-aa00-84f6f1c5a234",
  variant_id: null,
  name: "نورث ستاك 2",
  variant_name: null,
  price: 55000,
  quantity: 1,
  image_url: null,
  base_price: 55000,
};

export const IRAQ_CART: CartItem[] = [LONG_TITLE_LINE, DISPLAY_NAME_LINE];

/** The thank-you stash an express order of one Wayfarer writes. */
export const EXPRESS_STASH = {
  number: "SH-0001",
  order_id: null,
  upsell_token: null,
  customer_name: "علي حسن",
  items: [{ name: LONG_TITLE_LINE.name, variant: null, qty: 1, price: 36750 }],
  subtotal: 36750,
  total: 36750,
  ts: FIXTURE_NOW.getTime(),
};

/** scheniders-iraq's checkout context: free delivery everywhere, COD,
 *  a WhatsApp number, Arabic first. */
export const IRAQ_CHECKOUT_TENANT: Tenant = {
  ...fixtureTenant,
  contact_phone: "+9647779703832",
  store_config: { contact: { whatsapp_number: "07779703832" } },
  store_config_v2: {
    commerce: {
      contact: { call_number: "07779703832", whatsapp_confirm: false },
      shipping: { default_rate: { fee_iqd: 0 } },
    },
    enabled_locales: ["ar", "en"],
  },
};

export function pageCtx(
  page_id: RuntimeContext["page_id"],
  locale: RuntimeContext["locale"],
  tenant: Tenant = IRAQ_CHECKOUT_TENANT,
  order_number?: string,
): SectionRenderContext {
  return {
    tenant,
    runtime: {
      page_id,
      breakpoint: "mobile",
      locale,
      audience_segments: [],
      ab_test_arms: {},
      now: FIXTURE_NOW,
      ...(order_number ? { order_number } : {}),
    },
    products: [],
    categories: [],
  };
}
```

- [ ] **Step 2: The test helpers**

Create `packages/sections/src/_cart-checkout-test-utils.tsx`:

```tsx
// Test helpers for the cart, checkout and thank-you renders (slice 1h):
// mount a section in the browser under the store base, read its markup
// with React's render-order ids normalised, seed the cart, and check the
// redesign's rules over a soft render.

import type { ReactNode } from "react";
import { expect } from "vitest";
import { render } from "@testing-library/react";
import type { CartItem } from "@scheniders/shared";
import { useCart } from "./helpers/cart-store";
import { StoreBaseProvider } from "./helpers/store-context";

/** React's client `useId` values (_r_3_ in React 19.2; «r3» / :r3: before)
 *  depend on how many trees rendered first. */
export function html(container: HTMLElement): string {
  return container.innerHTML.replace(/_r_[0-9a-z]+_|«r[0-9a-z]+»|:r[0-9a-z]+:/g, "«id»");
}

export function mountInStore(node: ReactNode) {
  return render(<StoreBaseProvider base="/s/fixture-store">{node}</StoreBaseProvider>);
}

export function withCart(items: CartItem[]): void {
  useCart.setState({ items, governorate: null, couponCode: null });
}

/** The colour lock (D4) and the LTR rule over one soft render: yellow fills
 *  only the order action (`yellowFills` of them), no yellow text, green only
 *  on the WhatsApp glyph and its tile's tint, no colour literal, no `dir`,
 *  no ink outline, no ellipsis. */
export function expectSoftRules(markup: string, yellowFills: number): void {
  expect(markup.split("bg-bk-primary ").length - 1).toBe(yellowFills);
  expect(markup).not.toContain("text-bk-primary");
  expect(markup).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgba?\(/);
  expect(markup).not.toContain(' dir="');
  expect(markup).not.toContain("--bk-border-thickness");
  expect(markup).not.toContain("truncate");
  expect(markup.replace(/h-6 w-6 text-bk-success|bg-bk-success\/1[05]|border-bk-success\/25/g, "")).not.toContain(
    "bk-success",
  );
}
```

- [ ] **Step 3: The baseline test**

Create `packages/sections/src/_cart-checkout-baseline-snapshot.test.tsx`:

```tsx
// @vitest-environment jsdom
// =====================================================================
// Cart, checkout and thank-you sections — frozen before slice 1h
// =====================================================================
// cart_line_items, cart_summary, trust_strip, checkout_form,
// checkout_order_summary and order_confirmation's item recap, rendered in
// the browser (the cart lives in the client store, the recap in the
// session stash) with the section defaults and with scheniders-iraq's
// draft props as stored. Slice 1h adds an opt-in `style: "soft"` (and the
// checkout's `submit_label_i18n`); without them every render here must
// stay byte-identical. A diff is a back-compat break, not a snapshot to
// refresh. React's client ids are normalised so the snapshots do not
// depend on how many trees rendered before them.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import type { LocaleCode } from "@scheniders/shared";
import cart_line_items from "./cart_line_items";
import cart_summary from "./cart_summary";
import checkout_form from "./checkout_form";
import checkout_order_summary from "./checkout_order_summary";
import order_confirmation from "./order_confirmation";
import trust_strip from "./trust_strip";
import type { SectionRenderContext } from "./_types";
import {
  EXPRESS_STASH,
  IRAQ_CART,
  IRAQ_DRAFT_CART_LINES_BASE,
  IRAQ_DRAFT_CART_SUMMARY_BASE,
  IRAQ_DRAFT_CHECKOUT_FORM_BASE,
  IRAQ_DRAFT_CONFIRMATION_BASE,
  IRAQ_DRAFT_ORDER_SUMMARY_BASE,
  IRAQ_DRAFT_TRUST_BASE,
  pageCtx,
} from "./_cart-checkout-fixtures";
import { html, mountInStore, withCart } from "./_cart-checkout-test-utils";
import { FIXTURE_NOW } from "./_pdp-fixtures";

function mount(node: React.ReactNode): string {
  return html(mountInStore(node).container);
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}"))));
  vi.useFakeTimers({ toFake: ["Date"], now: FIXTURE_NOW });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  withCart([]);
});

const LOCALES = ["ar", "en"] as const;

function cartCtx(locale: LocaleCode): SectionRenderContext {
  return pageCtx("cart", locale);
}

describe("cart page (frozen)", () => {
  it.each(LOCALES)("cart_line_items, defaults, two lines, %s", (locale) => {
    withCart(IRAQ_CART);
    const Lines = cart_line_items.render;
    expect(mount(<Lines props={cart_line_items.defaultProps} ctx={cartCtx(locale)} />)).toMatchSnapshot();
  });

  it("cart_line_items, scheniders-iraq, two lines, ar", () => {
    withCart(IRAQ_CART);
    const Lines = cart_line_items.render;
    expect(mount(<Lines props={IRAQ_DRAFT_CART_LINES_BASE} ctx={cartCtx("ar")} />)).toMatchSnapshot();
  });

  it("cart_line_items, scheniders-iraq, empty, ar", () => {
    const Lines = cart_line_items.render;
    expect(mount(<Lines props={IRAQ_DRAFT_CART_LINES_BASE} ctx={cartCtx("ar")} />)).toMatchSnapshot();
  });

  it.each(LOCALES)("cart_summary, defaults, two lines, %s", (locale) => {
    withCart(IRAQ_CART);
    const Summary = cart_summary.render;
    expect(mount(<Summary props={cart_summary.defaultProps} ctx={cartCtx(locale)} />)).toMatchSnapshot();
  });

  it("cart_summary, scheniders-iraq, two lines, ar", () => {
    withCart(IRAQ_CART);
    const Summary = cart_summary.render;
    expect(mount(<Summary props={IRAQ_DRAFT_CART_SUMMARY_BASE} ctx={cartCtx("ar")} />)).toMatchSnapshot();
  });

  it("cart_summary, scheniders-iraq, empty, ar", () => {
    const Summary = cart_summary.render;
    expect(mount(<Summary props={IRAQ_DRAFT_CART_SUMMARY_BASE} ctx={cartCtx("ar")} />)).toMatchSnapshot();
  });

  it("cart_summary, defaults with the promo input, ar", () => {
    withCart(IRAQ_CART);
    const Summary = cart_summary.render;
    expect(
      mount(<Summary props={{ ...cart_summary.defaultProps, show_promo_input: true }} ctx={cartCtx("ar")} />),
    ).toMatchSnapshot();
  });
});

describe("trust_strip (frozen)", () => {
  it("defaults, ar", () => {
    const Strip = trust_strip.render;
    expect(mount(<Strip props={trust_strip.defaultProps} ctx={cartCtx("ar")} />)).toMatchSnapshot();
  });

  it.each(LOCALES)("scheniders-iraq's four pills, %s", (locale) => {
    const Strip = trust_strip.render;
    const props = trust_strip.schema.parse(IRAQ_DRAFT_TRUST_BASE);
    expect(mount(<Strip props={props} ctx={cartCtx(locale)} />)).toMatchSnapshot();
  });
});

describe("checkout page (frozen)", () => {
  it.each(LOCALES)("checkout_form, defaults, two lines, %s", (locale) => {
    withCart(IRAQ_CART);
    const Form = checkout_form.render;
    expect(
      mount(<Form props={checkout_form.defaultProps} ctx={pageCtx("checkout", locale)} />),
    ).toMatchSnapshot();
  });

  it("checkout_form, scheniders-iraq, two lines, ar", () => {
    withCart(IRAQ_CART);
    const Form = checkout_form.render;
    expect(
      mount(<Form props={IRAQ_DRAFT_CHECKOUT_FORM_BASE} ctx={pageCtx("checkout", "ar")} />),
    ).toMatchSnapshot();
  });

  it("checkout_form, scheniders-iraq, empty, ar", () => {
    const Form = checkout_form.render;
    expect(
      mount(<Form props={IRAQ_DRAFT_CHECKOUT_FORM_BASE} ctx={pageCtx("checkout", "ar")} />),
    ).toMatchSnapshot();
  });

  it.each(LOCALES)("checkout_order_summary, scheniders-iraq, two lines, %s", (locale) => {
    withCart(IRAQ_CART);
    const Summary = checkout_order_summary.render;
    expect(
      mount(<Summary props={IRAQ_DRAFT_ORDER_SUMMARY_BASE} ctx={pageCtx("checkout", locale)} />),
    ).toMatchSnapshot();
  });

  it("checkout_order_summary, defaults, empty, ar", () => {
    const Summary = checkout_order_summary.render;
    expect(
      mount(<Summary props={checkout_order_summary.defaultProps} ctx={pageCtx("checkout", "ar")} />),
    ).toMatchSnapshot();
  });
});

describe("thank-you recap (frozen)", () => {
  it.each(LOCALES)("order_confirmation, defaults, with the express stash, %s", (locale) => {
    window.sessionStorage.setItem("schn:last-order", JSON.stringify(EXPRESS_STASH));
    const Confirmation = order_confirmation.render;
    expect(
      mount(
        <Confirmation
          props={order_confirmation.defaultProps}
          ctx={pageCtx("checkout_success", locale, undefined, "SH-0001")}
        />,
      ),
    ).toMatchSnapshot();
  });

  it("order_confirmation, scheniders-iraq, with the express stash, ar", () => {
    window.sessionStorage.setItem("schn:last-order", JSON.stringify(EXPRESS_STASH));
    const Confirmation = order_confirmation.render;
    expect(
      mount(
        <Confirmation
          props={IRAQ_DRAFT_CONFIRMATION_BASE}
          ctx={pageCtx("checkout_success", "ar", undefined, "SH-0001")}
        />,
      ),
    ).toMatchSnapshot();
  });
});
```

- [ ] **Step 4: Confirm no section code changed yet, then write the snapshot (the one permitted write)**

```bash
git status --porcelain packages/sections/src/cart_* packages/sections/src/checkout_* packages/sections/src/trust_strip.tsx packages/sections/src/order_confirmation* packages/sections/src/helpers
pnpm exec vitest run packages/sections/src/_cart-checkout-baseline-snapshot.test.tsx
f=packages/sections/src/__snapshots__/_cart-checkout-baseline-snapshot.test.tsx.snap
for k in 'عطر ويفر انتنس' '<img' 'متابعة الدفع' 'أكّد الطلب' 'اطلب عبر واتساب' 'خلال ٢٤' '«id»' 'تم يا علي'; do printf '%s: ' "$k"; grep -oF -- "$k" $f | wc -l | tr -d ' '; done
CI=true pnpm exec vitest run packages/sections/src/_cart-checkout-baseline-snapshot.test.tsx
CI=true pnpm exec vitest run packages/sections/src/_cart-checkout-baseline-snapshot.test.tsx -t "recap"
```
Expected: no output from `git status`; `Snapshots  22 written`, `Tests  22 passed (22)`; the counts `8 5 4 3 3 1 6 1` (the long title in the lines, summaries and recap; five thumbnails; «متابعة الدفع» four times; today's submit; today's WhatsApp; the Arabic-Indic ETA; six normalised ids; the call card's heading); then `Tests  22 passed (22)` in CI mode, and `3 passed | 19 skipped` when only the recap runs. That last run shows the ids do not depend on test order.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add packages/sections/src/_cart-checkout-fixtures.ts packages/sections/src/_cart-checkout-test-utils.tsx packages/sections/src/_cart-checkout-baseline-snapshot.test.tsx packages/sections/src/__snapshots__/_cart-checkout-baseline-snapshot.test.tsx.snap
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "test(sections): freeze the cart, checkout and thank-you sections before the soft style" -m "Baseline only, rendered in jsdom with a seeded cart and stash: defaults and scheniders-iraq's draft props, ar/en, 22 renders." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The soft chrome strings, and one name for ordering on WhatsApp

**Files:**
- Create: `packages/sections/src/cart_checkout.strings.ts`
- Test: `packages/sections/src/cart_checkout.strings.test.ts`
- Modify: `packages/sections/src/_string-tables.ts`, `packages/sections/src/_copy-terms.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/cart_checkout.strings.test.ts`:

```ts
// The soft cart/checkout chrome strings: tokens fill, every entry has
// ar, en and ku, and «اطلب عبر واتساب» is the express tile's words.

import { describe, expect, it } from "vitest";
import { CART_STRINGS, cs } from "./cart_checkout.strings";
import { EXPRESS_STRINGS } from "./pdp_express/strings";
import { COPY_ACTIONS } from "./_copy-terms";

describe("cs", () => {
  it("fills the quantity and the delivery tokens", () => {
    expect(cs("lineQuantity", "ar", { count: 2 })).toBe("الكمية 2");
    expect(cs("deliveryVaries", "en", { range: "3,000 – 5,000 IQD" })).toBe("Varies by governorate: 3,000 – 5,000 IQD");
    expect(cs("deliveryWithin", "ar", { hours: "24 ساعة" })).toBe("التوصيل خلال 24 ساعة");
  });

  it("ordering on WhatsApp has one name: the express tile's", () => {
    expect(CART_STRINGS.orderOnWhatsapp.ar).toBe(COPY_ACTIONS.orderOnWhatsapp);
    expect(EXPRESS_STRINGS.whatsapp.ar).toBe(COPY_ACTIONS.orderOnWhatsapp);
    expect(CART_STRINGS.orderOnWhatsapp.en).toBe(EXPRESS_STRINGS.whatsapp.en);
  });

  it("every entry has ar, en and ku", () => {
    for (const entry of Object.values(CART_STRINGS)) {
      expect(Object.keys(entry).sort()).toEqual(["ar", "en", "ku"]);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/cart_checkout.strings.test.ts
```
Expected: `Failed to load url ./cart_checkout.strings`, `Tests  no tests`.

- [ ] **Step 3: The table, the lint list, the action**

Create `packages/sections/src/cart_checkout.strings.ts` (the table must be named `<WORD>_STRINGS`: `_string-tables.ts`'s parser reads `const (?:[A-Z]+_)?STRINGS`):

```ts
// Chrome strings for the soft cart, checkout summary and thank-you recap
// (slice 1h, `style: "soft"`). The default style keeps its own inline text
// byte for byte; only the soft renders read this table. Every entry carries
// ar, en and ku (guarded by _kurdish-coverage via _string-tables.ts), and
// «اطلب عبر واتساب» is the same words as the express page's WhatsApp tile
// (one name per action, F12).

import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";

export const CART_STRINGS = {
  subtotal: { en: "Subtotal", ar: "المجموع الفرعي", ku: "کۆی لاوەکی" },
  delivery: { en: "Delivery", ar: "التوصيل", ku: "گەیاندن" },
  deliveryFree: { en: "Free", ar: "مجاني", ku: "بەخۆڕایی" },
  discount: { en: "Discount", ar: "الخصم", ku: "داشکاندن" },
  total: { en: "Total", ar: "المجموع", ku: "کۆی گشتی" },
  /** The cart's per-governorate fee range, before a governorate is chosen. */
  deliveryVaries: {
    en: "Varies by governorate: {range}",
    ar: "يختلف حسب المحافظة: {range}",
    ku: "بەپێی پارێزگا دەگۆڕێت: {range}",
  },
  /** The merchant's configured delivery window. */
  deliveryWithin: { en: "Delivery in {hours}", ar: "التوصيل خلال {hours}", ku: "گەیاندن لە ماوەی {hours}" },
  /** A checkout summary line's quantity. */
  lineQuantity: { en: "Qty {count}", ar: "الكمية {count}", ku: "بڕ {count}" },
  emptyCart: { en: "Your cart is empty.", ar: "السلة فارغة.", ku: "سەبەتەکە بەتاڵە." },
  orderOnWhatsapp: { en: "Order on WhatsApp", ar: "اطلب عبر واتساب", ku: "لە ڕێگەی واتسئاپەوە داوا بکە" },
  promoLabel: { en: "Promo code", ar: "كود الخصم", ku: "کۆدی داشکاندن" },
  promoPlaceholder: { en: "Enter code", ar: "أدخل الكود", ku: "کۆدەکە بنووسە" },
  promoApply: { en: "Apply", ar: "تطبيق", ku: "جێبەجێکردن" },
  promoInvalid: { en: "Code not valid", ar: "الكود غير صالح", ku: "کۆدەکە دروست نییە" },
  promoApplied: { en: "Code applied", ar: "تم تطبيق الكود", ku: "کۆدەکە جێبەجێکرا" },
} as const;

export type CartStringKey = keyof typeof CART_STRINGS;

/** One chrome string, with `{name}` tokens filled. */
export function cs(
  key: CartStringKey,
  locale: LocaleCode,
  vars?: Record<string, string | number>,
): string {
  let out = resolveI18n(CART_STRINGS[key], locale);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(String(v));
    }
  }
  return out;
}
```
In `packages/sections/src/_string-tables.ts`, replace:
```ts
  "sticky_cta_bar.strings.ts",
];
```
with:
```ts
  "sticky_cta_bar.strings.ts",
  "cart_checkout.strings.ts",
];
```
In `packages/sections/src/_copy-terms.ts`, replace:
```ts
  /** Finishing a half-filled form, from the sticky bar. */
  continueOrder: "كمّل طلبك",
```
with:
```ts
  /** Finishing the order: the sticky bar's half-filled state, and the
   *  cart's way on to the checkout (slice 1h). */
  continueOrder: "كمّل طلبك",
```
and replace:
```ts
  /** Going to the cart, after an add (slice 1g). */
  viewCart: "شوف السلة",
} as const;
```
with:
```ts
  /** Going to the cart, after an add (slice 1g). */
  viewCart: "شوف السلة",
  /** Placing the order on WhatsApp instead: the express tile, the cart and
   *  the checkout (slice 1h). */
  orderOnWhatsapp: "اطلب عبر واتساب",
} as const;
```

- [ ] **Step 4: Run the test, the copy lint and Kurdish coverage**

```bash
CI=true pnpm exec vitest run packages/sections/src/cart_checkout.strings.test.ts packages/sections/src/_arabic-copy-lint.test.ts packages/sections/src/_kurdish-coverage.test.ts packages/sections/src/_copy-terms.test.ts
```
Expected: all pass. The strings test has 3 tests; Kurdish coverage gains one (`cart_checkout.strings.ts: every entry has ku`); the chrome lint stays green with an unchanged allowlist (the new Arabic has hamza on «أدخل», no «ال» before واتساب, and `{count}` follows «الكمية», not a counted noun).

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add packages/sections/src/cart_checkout.strings.ts packages/sections/src/cart_checkout.strings.test.ts packages/sections/src/_string-tables.ts packages/sections/src/_copy-terms.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): soft cart/checkout chrome strings (ar/en/ku); «اطلب عبر واتساب» is one action" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The soft building blocks, and a chapter heading that can be a page's h1

**Files:**
- Create: `packages/sections/src/helpers/soft-commerce.tsx`
- Test: `packages/sections/src/helpers/soft-commerce.test.tsx`
- Modify: `packages/sections/src/helpers/chapter-heading.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/helpers/soft-commerce.test.tsx`:

```tsx
// The soft commerce pieces: the order action's body (label, optional
// line, arrow on the reading end), the WhatsApp row (green glyph, ink
// label), the receipt row (flips in Arabic, ink figures), and the chapter
// heading as a page's h1. No colour literal, no `dir`, no yellow text.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChapterHeading } from "./chapter-heading";
import { ReceiptRow, SOFT_PRIMARY, SoftPrimaryBody, SoftWhatsappLink } from "./soft-commerce";

describe("soft commerce", () => {
  it("the order action: one yellow fill with the token shadow and no ink outline", () => {
    expect(SOFT_PRIMARY).toContain("bg-bk-primary");
    expect(SOFT_PRIMARY).toContain("shadow-bk-button");
    expect(SOFT_PRIMARY).toContain("rounded-bk-input");
    expect(SOFT_PRIMARY).toContain("min-h-[60px]");
    expect(SOFT_PRIMARY).not.toContain("border");
  });

  it("the action's body: label, small line, arrow pointing the reading way", () => {
    const ar = renderToStaticMarkup(<SoftPrimaryBody label="ثبّت طلبي" sub="128,500 د.ع" rtl />);
    expect(ar).toContain("flex-row-reverse");
    expect(ar).toContain(">ثبّت طلبي<");
    expect(ar).toContain(">128,500 د.ع<");
    expect(ar).toContain(">arrow_back<");
    const en = renderToStaticMarkup(<SoftPrimaryBody label="Place my order" rtl={false} busy />);
    expect(en).toContain(">progress_activity<");
    expect(en).not.toContain("flex-row-reverse");
    expect(en).toContain("animate-spin");
  });

  it("the merchant label carries its editor field on the label, not the button", () => {
    const html = renderToStaticMarkup(<SoftPrimaryBody label="كمّل طلبك" labelField="checkout_label_i18n" rtl />);
    expect(html).toContain('<span class="font-bk-display text-[19px] font-black" data-i18n-field="checkout_label_i18n">');
  });

  it("the WhatsApp row: green glyph, ink label, new tab", () => {
    const html = renderToStaticMarkup(<SoftWhatsappLink href="https://wa.me/9647700000000" label="اطلب عبر واتساب" rtl />);
    expect(html).toContain('target="_blank"');
    expect(html).toContain("h-6 w-6 text-bk-success");
    expect(html).toContain("text-bk-ink");
    expect(html).toContain("flex-row-reverse");
  });

  it("a receipt row flips in Arabic; the total row is 22px/900 ink", () => {
    const row = renderToStaticMarkup(<ReceiptRow rtl label="المجموع" value="128,500 د.ع" strong />);
    expect(row).toContain("flex-row-reverse");
    expect(row).toContain("text-[22px] font-black leading-none text-bk-ink");
    expect(renderToStaticMarkup(<ReceiptRow rtl={false} label="Total" value="1" />)).not.toContain("flex-row-reverse");
  });

  it("the chapter heading can be a page's h1", () => {
    const h1 = renderToStaticMarkup(<ChapterHeading as="h1" locale="ar" title="سلتك" />);
    expect(h1).toContain('<h1 class="font-bk-display text-bk-chapter font-black text-bk-ink text-balance">سلتك</h1>');
  });

  it("no colour literal, no dir, no yellow text", () => {
    const all = [
      renderToStaticMarkup(<SoftPrimaryBody label="x" sub="y" rtl />),
      renderToStaticMarkup(<SoftWhatsappLink href="#" label="x" rtl={false} />),
      renderToStaticMarkup(<ReceiptRow rtl label="x" note="× 2" value="y" />),
    ].join("");
    expect(all).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgba?\(/);
    expect(all).not.toContain(' dir="');
    expect(all).not.toContain("text-bk-primary");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/helpers/soft-commerce.test.tsx
```
Expected: `Failed to load url ./soft-commerce`, `Tests  no tests`.

- [ ] **Step 3: The module, and `as="h1"`**

Create `packages/sections/src/helpers/soft-commerce.tsx` (no `"use client"`: it holds no hooks, and only client sections import its components; `trust_strip`, a server section, writes its classes inline):

```tsx
// =====================================================================
// Soft commerce building blocks — the cart, checkout and thank-you pages
// in the redesigned PDP's voice (slice 1h, `style: "soft"`)
// =====================================================================
// The express product page draws money as a quiet receipt (hairline card,
// dashed dividers, ink figures, the total at 22px/900) and its one order
// action as a token-radius yellow button with the token button shadow and
// no ink outline (1f, I14). These are those pieces for the sections that
// opt in, so the path PDP → cart → checkout → thank-you reads as one page.
// Colour lock (D4): yellow fills only the order action; prices, totals and
// "free" are ink; green is the WhatsApp glyph only. Rows flip with
// `flex-row-reverse` from `readsRtl`, never `dir`.
// =====================================================================

import type { ReactNode } from "react";
import { MaterialIcon, WhatsAppIcon } from "./primitives";
import { cn } from "./utils";

/** The receipt card: a hairline on the page surface, no fill, no shadow. */
export const SOFT_RECEIPT = "rounded-bk-card border-bk border-bk-divider bg-bk-surface text-bk-ink";

/** A raised soft card (the form, an empty state): the alt surface, no line. */
export const SOFT_CARD = "rounded-bk-card bg-bk-surface-alt text-bk-ink";

/** A form field, as the express form draws it (min height, so a textarea
 *  can grow). */
export const SOFT_FIELD =
  "min-h-[52px] w-full rounded-bk-input border-bk border-bk-divider bg-bk-surface px-4 py-3 font-bk-body text-base text-bk-ink placeholder:text-bk-ink-faint transition-colors duration-bk-fast focus-visible:border-bk-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus aria-[invalid=true]:border-bk-danger motion-reduce:transition-none";

/** A field label, as the express form draws it. */
export const SOFT_LABEL = "mb-1 block font-bk-body text-[13px] font-bold text-bk-ink-soft";

/** The order action: the express submit's look (token radius + token
 *  shadow, no ink outline), full width, ≥60px. */
export const SOFT_PRIMARY =
  "flex min-h-[60px] w-full items-center justify-center gap-3 rounded-bk-input bg-bk-primary px-5 text-bk-on-primary shadow-bk-button transition-[transform,background-color,box-shadow] duration-bk-fast hover:bg-bk-primary-hover active:scale-[0.97] active:bg-bk-primary-active active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bk-surface disabled:cursor-not-allowed disabled:bg-bk-primary-disabled disabled:shadow-none motion-reduce:transition-none";

/** The order action's content: the label at 19px/900, an optional small
 *  line under it, and the arrow chip on the reading end. */
export function SoftPrimaryBody({
  label,
  labelField,
  sub,
  rtl,
  busy = false,
}: {
  label: string;
  /** `data-i18n-field` for a merchant label (on the label, not the button,
   *  so the storefront's plaintext bidi rule never reaches the row). */
  labelField?: string;
  sub?: ReactNode;
  rtl: boolean;
  busy?: boolean;
}) {
  return (
    <span className={cn("flex w-full items-center justify-center gap-3", rtl && "flex-row-reverse")}>
      <span className="flex min-w-0 flex-col items-center leading-tight">
        <span className="font-bk-display text-[19px] font-black" data-i18n-field={labelField}>
          {label}
        </span>
        {sub ? <span className="font-bk-body text-[13px] font-bold tabular-nums text-bk-on-primary/80">{sub}</span> : null}
      </span>
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-bk-pill bg-bk-on-primary/15"
      >
        <MaterialIcon
          name={busy ? "progress_activity" : rtl ? "arrow_back" : "arrow_forward"}
          className={cn("text-xl", busy && "animate-spin motion-reduce:animate-none")}
        />
      </span>
    </span>
  );
}

/** Ordering on WhatsApp instead: the express page's soft green tile, as a
 *  full-width row. Green is the glyph only; the label is ink. */
export function SoftWhatsappLink({
  href,
  label,
  rtl,
}: {
  href: string;
  label: string;
  rtl: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-soft-whatsapp=""
      className={cn(
        "flex min-h-[52px] w-full items-center justify-center gap-2 rounded-bk-input border-bk border-bk-success/25 bg-bk-success/10 px-4 font-bk-body text-[15px] font-bold text-bk-ink transition-[transform,background-color] duration-bk-fast hover:bg-bk-success/15 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus motion-reduce:transition-none",
        rtl && "flex-row-reverse",
      )}
    >
      <WhatsAppIcon shadow={false} className="h-6 w-6 text-bk-success" />
      {label}
    </a>
  );
}

/** One receipt row: label (+ a quiet note) at the reading start, the value
 *  at the far end; `strong` is the total (15px label, 22px/900 figure). */
export function ReceiptRow({
  rtl,
  label,
  note,
  value,
  strong = false,
}: {
  rtl: boolean;
  label: string;
  note?: string;
  value: ReactNode;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3",
        strong ? "py-3" : "py-2",
        rtl && "flex-row-reverse",
      )}
    >
      <span
        className={cn(
          "flex min-w-0 items-baseline gap-1.5 font-bk-body",
          rtl && "flex-row-reverse",
          strong ? "text-[15px] font-black text-bk-ink" : "text-[13px] text-bk-ink-soft",
        )}
      >
        <span>{label}</span>
        {note ? <bdi className="shrink-0 text-xs text-bk-ink-faint tabular-nums">{note}</bdi> : null}
      </span>
      <span
        className={cn(
          "shrink-0 whitespace-nowrap tabular-nums",
          strong
            ? "font-bk-display text-[22px] font-black leading-none text-bk-ink"
            : "font-bk-body text-[13px] font-bold text-bk-ink",
        )}
      >
        {value}
      </span>
    </div>
  );
}
```
In `packages/sections/src/helpers/chapter-heading.tsx`, replace:
```ts
  as?: "h2" | "h3";
```
with:
```ts
  /** "h1" for a page whose chapter heading is its title (cart, checkout). */
  as?: "h1" | "h2" | "h3";
```

- [ ] **Step 4: Run the test and the type gate**

```bash
CI=true pnpm exec vitest run packages/sections/src/helpers/soft-commerce.test.tsx packages/sections/src/_primitives-baseline-snapshot.test.tsx
```
Expected: `Tests  7 passed (7)` for soft-commerce, and the primitives baseline unchanged. Then run the sections type gate: no output.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add packages/sections/src/helpers/soft-commerce.tsx packages/sections/src/helpers/soft-commerce.test.tsx packages/sections/src/helpers/chapter-heading.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): soft commerce blocks — the express receipt row, the 1f soft order action, the soft WhatsApp row; ChapterHeading as h1" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `trust_strip` soft — every pill on screen at 360px

**Files:**
- Modify: `packages/sections/src/trust_strip.tsx`
- Test: `packages/sections/src/_trust-strip-soft.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/_trust-strip-soft.test.tsx`:

```tsx
// @vitest-environment jsdom
// trust_strip `style: "soft"` (slice 1h): every pill on screen at 360px —
// quiet tiles two a row from the reading start, wrapping instead of
// scrolling sideways, ink only. "chunky" renders exactly like absent.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";
import trust_strip from "./trust_strip";
import { IRAQ_DRAFT_TRUST_BASE, pageCtx } from "./_cart-checkout-fixtures";
import { expectSoftRules, html, mountInStore } from "./_cart-checkout-test-utils";

afterEach(cleanup);

const BASE = trust_strip.schema.parse(IRAQ_DRAFT_TRUST_BASE);
const SOFT = { ...BASE, style: "soft" as const };

function markup(props: typeof BASE, locale: "ar" | "en" = "ar") {
  const Strip = trust_strip.render;
  return mountInStore(<Strip props={props} ctx={pageCtx("cart", locale)} />).container;
}

describe("trust_strip style prop", () => {
  it("parses soft; a bad stored value degrades to absent", () => {
    expect(trust_strip.schema.parse({ ...IRAQ_DRAFT_TRUST_BASE, style: "soft" }).style).toBe("soft");
    const bad = trust_strip.schema.parse({ ...IRAQ_DRAFT_TRUST_BASE, style: "neon" });
    expect(bad.style).toBeUndefined();
    expect(bad.pills).toHaveLength(4);
  });

  it("chunky renders exactly like absent", () => {
    const absent = html(markup(BASE));
    cleanup();
    expect(html(markup({ ...BASE, style: "chunky" }))).toBe(absent);
  });
});

describe("trust_strip soft", () => {
  it("wraps two a row from the right in Arabic; never scrolls sideways", () => {
    const view = markup(SOFT);
    const list = view.querySelector("ul");
    expect(list?.className).toContain("flex-wrap");
    expect(list?.className).toContain("flex-row-reverse");
    expect(list?.className).not.toContain("overflow-x-auto");
    const tiles = [...view.querySelectorAll("li")];
    expect(tiles).toHaveLength(4);
    for (const tile of tiles) {
      expect(tile.className).toContain("grow basis-[calc(50%-0.25rem)]");
      expect(tile.className).toContain("min-h-11");
    }
  });

  it("English reads from the left", () => {
    expect(markup(SOFT, "en").querySelector("ul")?.className).not.toContain("flex-row-reverse");
  });

  it("ink only: no tint, no outline, no yellow, no colour literal, no dir", () => {
    const view = markup(SOFT);
    expectSoftRules(view.innerHTML, 0);
    expect(view.innerHTML).not.toContain("color-mix");
    expect(view.querySelector('[data-i18n-field="pills[1].label_i18n"]')?.textContent).toBe(
      "توصيل مجاني لكل المحافظات",
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/_trust-strip-soft.test.tsx
```
Expected: FAIL. "parses soft" fails (`expected undefined to be 'soft'`: zod strips the unknown key), and so do "wraps two a row" and "ink only" (today's `overflow-x-auto` pills). "chunky renders exactly like absent" and "English reads from the left" already pass.

- [ ] **Step 3: The prop and the soft render**

In `packages/sections/src/trust_strip.tsx`, replace:
```ts
import { Section, MaterialIcon } from "./helpers/primitives";
```
with:
```ts
import { Section, MaterialIcon } from "./helpers/primitives";
import { readsRtl } from "./helpers/reading";
import { cn } from "./helpers/utils";
```
Replace:
```ts
      bg: pillBg.optional(),
    }),
  ),
});
```
with:
```ts
      bg: pillBg.optional(),
    }),
  ),
  /** "chunky" (default): today's sideways-scrolling outlined pills. "soft"
   *  (slice 1h): every pill on screen at 360px — quiet tiles two a row on
   *  the alt surface, ink icon and text, no outline, no tint (D4), labels
   *  wrapping instead of scrolling. A bad stored value falls back. */
  style: z.enum(["chunky", "soft"]).optional().catch(undefined),
});
```
Replace:
```tsx
  const locale = ctx.runtime.locale;
  return (
    <Section density="dense" bleed className="text-bk-ink">
```
with:
```tsx
  const locale = ctx.runtime.locale;
  if (props.style === "soft") {
    const rtl = readsRtl(locale);
    return (
      <Section density="dense" className="text-bk-ink" data-trust-style="soft">
        {/* Two tiles a row, the first at the reading start (a flex row
            flips with a class; a grid cannot without `dir`). A tile that is
            alone on its row grows to the full width. */}
        <ul className={cn("flex flex-wrap gap-2", rtl && "flex-row-reverse")}>
          {props.pills.map((pill, i) => (
            <li
              key={`${i}-${resolveI18n(pill.label_i18n, "en")}`}
              className={cn(
                "flex min-h-11 grow basis-[calc(50%-0.25rem)] items-center gap-2 rounded-bk-input bg-bk-surface-alt px-3 py-2",
                rtl && "flex-row-reverse",
              )}
            >
              {pill.icon ? <MaterialIcon name={pill.icon} className="shrink-0 text-lg text-bk-ink" /> : null}
              <span
                data-i18n-field={`pills[${i}].label_i18n`}
                className={cn(
                  "min-w-0 font-bk-body text-[13px] font-bold leading-snug text-bk-ink",
                  rtl ? "text-right" : "text-left",
                )}
              >
                {resolveI18n(pill.label_i18n, locale)}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    );
  }
  return (
    <Section density="dense" bleed className="text-bk-ink">
```

- [ ] **Step 4: Run it, and the baseline**

```bash
CI=true pnpm exec vitest run packages/sections/src/_trust-strip-soft.test.tsx packages/sections/src/_cart-checkout-baseline-snapshot.test.tsx
```
Expected: `Tests  27 passed (27)` (5 + 22), no snapshot written or updated.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add packages/sections/src/trust_strip.tsx packages/sections/src/_trust-strip-soft.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): trust_strip style soft — quiet tiles two a row from the reading start, wrapping, no sideways scroll" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `cart_line_items` soft — one hairline list, names on two lines, ink totals

**Files:**
- Modify: `packages/sections/src/cart_line_items.tsx`, `packages/sections/src/cart_line_items.client.tsx`
- Test: `packages/sections/src/_cart-lines-soft.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/_cart-lines-soft.test.tsx`:

```tsx
// @vitest-environment jsdom
// cart_line_items `style: "soft"` (slice 1h): one hairline list in the
// express receipt's grammar — names on up to two lines (never an
// ellipsis), ink line totals (D4), rows read from the right in Arabic,
// the chapter heading as the page's h1. "chunky" renders like absent.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent } from "@testing-library/react";
import { useCart } from "./helpers/cart-store";
import cart_line_items, { type Props } from "./cart_line_items";
import { IRAQ_CART, IRAQ_DRAFT_CART_LINES_BASE, LONG_TITLE_LINE, pageCtx } from "./_cart-checkout-fixtures";
import { expectSoftRules, html, mountInStore, withCart } from "./_cart-checkout-test-utils";

afterEach(() => {
  cleanup();
  withCart([]);
});

const SOFT: Props = { ...IRAQ_DRAFT_CART_LINES_BASE, style: "soft" };

function mount(props: Props, locale: "ar" | "en" = "ar") {
  const Lines = cart_line_items.render;
  return mountInStore(<Lines props={props} ctx={pageCtx("cart", locale)} />).container;
}

describe("cart_line_items style prop", () => {
  it("parses soft; a bad stored value degrades to absent", () => {
    expect(cart_line_items.schema.parse(SOFT).style).toBe("soft");
    expect(cart_line_items.schema.parse({ ...SOFT, style: 3 }).style).toBeUndefined();
  });

  it("chunky renders exactly like absent", () => {
    withCart(IRAQ_CART);
    const absent = html(mount(IRAQ_DRAFT_CART_LINES_BASE));
    cleanup();
    expect(html(mount({ ...IRAQ_DRAFT_CART_LINES_BASE, style: "chunky" }))).toBe(absent);
  });
});

describe("cart_line_items soft", () => {
  it("the chapter heading is the page's h1, with the count", () => {
    withCart(IRAQ_CART);
    const view = mount(SOFT);
    const h1 = view.querySelector("h1");
    expect(h1?.textContent).toBe("سلتك");
    expect(h1?.className).toContain("text-bk-chapter");
    expect(view.textContent).toContain("3 عناصر في سلتك");
  });

  it("a long catalogue title wraps to two lines; it is never cut with an ellipsis", () => {
    withCart(IRAQ_CART);
    const names = [...mount(SOFT).querySelectorAll<HTMLElement>("[data-cart-line-name]")];
    expect(names.map((n) => n.textContent)).toEqual([LONG_TITLE_LINE.name, "نورث ستاك 2"]);
    for (const n of names) expect(n.className).toContain("line-clamp-2");
  });

  it("ink totals, no yellow, no outline, no dir; Arabic rows read from the right", () => {
    withCart(IRAQ_CART);
    const view = mount(SOFT);
    expectSoftRules(view.innerHTML, 0);
    expect(view.textContent).toContain("73,500 د.ع");
    expect(view.querySelector("li > div")?.className).toContain("flex-row-reverse");
  });

  it("English rows read from the left", () => {
    withCart(IRAQ_CART);
    expect(mount(SOFT, "en").querySelector("li > div")?.className).not.toContain("flex-row-reverse");
  });

  it("the stepper and remove still change the cart; every control is ≥44px", () => {
    withCart(IRAQ_CART);
    const view = mount(SOFT);
    const plus = view.querySelector<HTMLButtonElement>('button[aria-label="زيادة الكمية"]');
    const remove = [...view.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "إزالة");
    if (!plus || !remove) throw new Error("missing a control");
    for (const b of view.querySelectorAll("button")) expect(b.className).toContain("min-h-11");
    fireEvent.click(plus);
    expect(useCart.getState().items[0]?.quantity).toBe(3);
    fireEvent.click(remove);
    expect(useCart.getState().items.map((i) => i.product_id)).toEqual([IRAQ_CART[1]?.product_id]);
  });

  it("an empty cart: the soft empty state with the merchant's message as h1", () => {
    const view = mount(SOFT);
    expect(view.querySelector("h1")?.textContent).toBe("سلتك فارغة — تابع التسوّق.");
    expectSoftRules(view.innerHTML, 0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/_cart-lines-soft.test.tsx
```
Expected: FAIL. The parse test fails (`expected undefined to be 'soft'`), and so do the soft-markup tests (no `text-bk-chapter`, no `data-cart-line-name`, `truncate` present, outlined empty state). "chunky renders exactly like absent" and "English rows read from the left" already pass.

- [ ] **Step 3: The prop and `SoftCartLines`**

In `packages/sections/src/cart_line_items.tsx`, replace:
```ts
const schema = z.object({
  show_thumbnails: z.boolean(),
  empty_state_message_i18n: i18nStringSchema,
});
```
with:
```ts
const schema = z.object({
  show_thumbnails: z.boolean(),
  empty_state_message_i18n: i18nStringSchema,
  /** "chunky" (default): today's outlined Candy Bento cards. "soft" (slice
   *  1h): the redesigned PDP's voice — one hairline list, ink prices (D4),
   *  names on up to two lines instead of an ellipsis, the chapter heading,
   *  rows read from the right in Arabic. A bad stored value falls back. */
  style: z.enum(["chunky", "soft"]).optional().catch(undefined),
});
```
In `packages/sections/src/cart_line_items.client.tsx`, replace:
```ts
import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { CenteredSectionHeader, MaterialIcon } from "./helpers/primitives";
import { formatCount, formatPrice } from "./helpers/format";
import { useCart } from "./helpers/cart-store";
import type { SectionRenderContext } from "./_types";
```
with:
```ts
import { resolveI18n } from "@scheniders/shared";
import type { CartItem, LocaleCode } from "@scheniders/shared";
import { CenteredSectionHeader, MaterialIcon } from "./helpers/primitives";
import { ChapterHeading } from "./helpers/chapter-heading";
import { formatCount, formatPrice } from "./helpers/format";
import { useCart } from "./helpers/cart-store";
import { readsRtl } from "./helpers/reading";
import { SOFT_CARD, SOFT_RECEIPT } from "./helpers/soft-commerce";
import { cn } from "./helpers/utils";
import type { SectionRenderContext } from "./_types";
```
Replace:
```tsx
  const emptyMessage = resolveI18n(props.empty_state_message_i18n, locale);

  if (items.length === 0) {
```
with:
```tsx
  const emptyMessage = resolveI18n(props.empty_state_message_i18n, locale);

  if (props.style === "soft") {
    return (
      <SoftCartLines
        items={items}
        locale={locale}
        emptyMessage={emptyMessage}
        showThumbnails={props.show_thumbnails}
        onQuantity={(item, qty) => updateQuantity(item.product_id, item.variant_id, qty)}
        onRemove={(item) => removeItem(item.product_id, item.variant_id)}
      />
    );
  }

  if (items.length === 0) {
```
Append to the end of the file:
```tsx
/** style "soft" (slice 1h): one hairline list in the express receipt's
 *  grammar. Each row reads from the right in Arabic (photo, name, then the
 *  stepper at the far end); the name wraps to two lines instead of an
 *  ellipsis; the line total is ink (D4: yellow is only the order action). */
function SoftCartLines({
  items,
  locale,
  emptyMessage,
  showThumbnails,
  onQuantity,
  onRemove,
}: {
  items: CartItem[];
  locale: LocaleCode;
  emptyMessage: string;
  showThumbnails: boolean;
  onQuantity: (item: CartItem, qty: number) => void;
  onRemove: (item: CartItem) => void;
}) {
  const rtl = readsRtl(locale);
  if (items.length === 0) {
    return (
      <section className="px-4 py-bk-section" data-cart-style="soft">
        <div className={cn(SOFT_CARD, "flex flex-col items-center gap-bk-sm p-bk-xl text-center")}>
          <MaterialIcon name="shopping_bag" className="text-5xl text-bk-ink-faint" />
          <h1 className="font-bk-display text-bk-chapter font-black text-bk-ink text-balance">{emptyMessage}</h1>
        </div>
      </section>
    );
  }
  const itemCount = items.reduce((n, i) => n + i.quantity, 0);
  return (
    <section className="px-4 py-bk-section-dense" data-cart-style="soft">
      <ChapterHeading as="h1" locale={locale} title={resolveI18n(STRINGS.heading, locale)} sub={itemCountLine(itemCount, locale)} />
      <ul className={cn(SOFT_RECEIPT, "divide-y divide-bk-divider px-3")}>
        {items.map((item) => (
          <li key={`${item.product_id}-${item.variant_id ?? "default"}`}>
            <div className={cn("flex items-center gap-3 py-3", rtl && "flex-row-reverse")}>
              {showThumbnails && (
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-bk-input bg-bk-surface-alt">
                  {item.image_url ? (
                    <Image src={item.image_url} alt="" fill sizes="64px" className="object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <MaterialIcon name="image" className="text-2xl text-bk-ink-faint" />
                    </div>
                  )}
                </div>
              )}
              <div className={cn("min-w-0 flex-1", rtl ? "text-right" : "text-left")}>
                <p className="line-clamp-2 font-bk-body text-[15px] font-bold leading-snug text-bk-ink" data-cart-line-name="">
                  {item.name}
                </p>
                {item.variant_name && (
                  <p className="font-bk-body text-xs text-bk-ink-soft">{item.variant_name}</p>
                )}
                <p className="mt-1 font-bk-display text-base font-black tabular-nums text-bk-ink">
                  <bdi>{formatPrice(item.price * item.quantity, locale)}</bdi>
                </p>
              </div>
              <div className={cn("flex shrink-0 flex-col gap-1", rtl ? "items-start" : "items-end")}>
                <div
                  role="group"
                  aria-label={resolveI18n(STRINGS.quantity, locale)}
                  className="flex items-center rounded-bk-input border-bk border-bk-divider bg-bk-surface"
                >
                  <button
                    type="button"
                    onClick={() => onQuantity(item, item.quantity - 1)}
                    aria-label={resolveI18n(STRINGS.decrease, locale)}
                    className="flex min-h-11 min-w-11 items-center justify-center text-bk-ink"
                  >
                    <MaterialIcon name="remove" className="text-base" />
                  </button>
                  <span aria-live="polite" className="min-w-7 text-center font-bk-display text-sm font-black tabular-nums text-bk-ink">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => onQuantity(item, item.quantity + 1)}
                    aria-label={resolveI18n(STRINGS.increase, locale)}
                    className="flex min-h-11 min-w-11 items-center justify-center text-bk-ink"
                  >
                    <MaterialIcon name="add" className="text-base" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(item)}
                  className="min-h-11 px-1 font-bk-body text-xs font-semibold text-bk-ink-soft underline-offset-2 hover:text-bk-ink hover:underline"
                >
                  {resolveI18n(STRINGS.remove, locale)}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Run it, the baseline and the type gate**

```bash
CI=true pnpm exec vitest run packages/sections/src/_cart-lines-soft.test.tsx packages/sections/src/_cart-checkout-baseline-snapshot.test.tsx
```
Expected: `Tests  30 passed (30)` (8 + 22), nothing written or updated. Sections type gate: no output.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add packages/sections/src/cart_line_items.tsx packages/sections/src/cart_line_items.client.tsx packages/sections/src/_cart-lines-soft.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): cart_line_items style soft — one hairline list, names on two lines, ink totals, the chapter h1" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `cart_summary` soft — the express receipt and the one order action

**Files:**
- Modify: `packages/sections/src/cart_summary.tsx`, `packages/sections/src/cart_summary.client.tsx`
- Test: `packages/sections/src/_cart-summary-soft.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/_cart-summary-soft.test.tsx`:

```tsx
// @vitest-environment jsdom
// cart_summary `style: "soft"` (slice 1h): the express receipt (ink
// figures, «مجاني» in ink, the total at 22px/900) and its order button
// (token radius + token shadow, the one yellow fill), WhatsApp as the soft
// green row named «اطلب عبر واتساب», no fine print. "chunky" = absent.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent } from "@testing-library/react";
import { useCart } from "./helpers/cart-store";
import cart_summary, { type Props } from "./cart_summary";
import { COPY_ACTIONS } from "./_copy-terms";
import { IRAQ_CART, IRAQ_DRAFT_CART_SUMMARY_BASE, pageCtx } from "./_cart-checkout-fixtures";
import { expectSoftRules, html, mountInStore, withCart } from "./_cart-checkout-test-utils";

afterEach(() => {
  cleanup();
  withCart([]);
});

const SOFT: Props = { ...IRAQ_DRAFT_CART_SUMMARY_BASE, style: "soft" };

function mount(props: Props, locale: "ar" | "en" = "ar") {
  const Summary = cart_summary.render;
  return mountInStore(<Summary props={props} ctx={pageCtx("cart", locale)} />).container;
}

describe("cart_summary style prop", () => {
  it("parses soft; a bad stored value degrades to absent", () => {
    expect(cart_summary.schema.parse(SOFT).style).toBe("soft");
    expect(cart_summary.schema.parse({ ...SOFT, style: "x" }).style).toBeUndefined();
  });

  it("chunky renders exactly like absent", () => {
    withCart(IRAQ_CART);
    const absent = html(mount(IRAQ_DRAFT_CART_SUMMARY_BASE));
    cleanup();
    expect(html(mount({ ...IRAQ_DRAFT_CART_SUMMARY_BASE, style: "chunky" }))).toBe(absent);
  });
});

describe("cart_summary soft", () => {
  it("one yellow fill — the way on — and ink figures", () => {
    withCart(IRAQ_CART);
    const view = mount(SOFT);
    expectSoftRules(view.innerHTML, 1);
    const action = view.querySelector<HTMLAnchorElement>('a[href="/s/fixture-store/checkout"]');
    expect(action?.textContent).toBe("متابعة الدفعarrow_back");
    expect(action?.className).toContain("shadow-bk-button");
    expect(view.textContent).toContain("المجموع الفرعي128,500 د.ع");
    expect(view.textContent).toContain("التوصيلمجاني");
    expect(view.textContent).toContain("المجموع128,500 د.ع");
  });

  it("WhatsApp is the soft green row, named as the express tile; no fine print, no «أو»", () => {
    withCart(IRAQ_CART);
    const view = mount(SOFT);
    const wa = view.querySelector<HTMLAnchorElement>("[data-soft-whatsapp]");
    expect(wa?.textContent).toBe(COPY_ACTIONS.orderOnWhatsapp);
    expect(wa?.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/9647779703832\?text=/);
    expect(view.textContent).not.toContain("لا دفع مسبق");
    expect(view.textContent).not.toContain("أو");
  });

  it("English: the arrow points forward and rows read from the left", () => {
    withCart(IRAQ_CART);
    const view = mount(SOFT, "en");
    expect(view.querySelector('a[href="/s/fixture-store/checkout"]')?.textContent).toBe(
      "Continue to checkoutarrow_forward",
    );
    expect(view.querySelector("[data-receipt-soft] div div")?.className).not.toContain("flex-row-reverse");
  });

  it("an empty cart: the action is a disabled button, never a dead link", () => {
    const view = mount(SOFT);
    expect(view.querySelector('a[href$="/checkout"]')).toBeNull();
    expect(view.querySelector<HTMLButtonElement>("button[disabled]")?.textContent).toBe("متابعة الدفعarrow_back");
  });

  it("the promo input keeps working in the soft receipt", () => {
    withCart(IRAQ_CART);
    const view = mount({ ...SOFT, show_promo_input: true });
    const input = view.querySelector<HTMLInputElement>("#cart-promo-input");
    if (!input) throw new Error("missing the promo input");
    fireEvent.change(input, { target: { value: "NOPE" } });
    const apply = [...view.querySelectorAll("button")].find((b) => b.textContent === "تطبيق");
    if (!apply) throw new Error("missing apply");
    fireEvent.click(apply);
    expect(view.querySelector('[role="alert"]')?.textContent).toBe("الكود غير صالح");
    expect(useCart.getState().couponCode).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/_cart-summary-soft.test.tsx
```
Expected: FAIL. The parse test fails, and so does every soft-markup test (yellow `text-bk-primary` total, no `data-soft-whatsapp`, «أو», fine print). "chunky renders exactly like absent" already passes.

- [ ] **Step 3: The prop and `SoftCartSummary`**

In `packages/sections/src/cart_summary.tsx`, replace:
```ts
  show_promo_input: z.boolean(),
});
```
with:
```ts
  show_promo_input: z.boolean(),
  /** "chunky" (default): today's outlined card and pill button. "soft"
   *  (slice 1h): the express receipt and its order button — hairline card,
   *  ink figures (D4), the token-radius yellow action, WhatsApp as the soft
   *  green row, no fine print (the page's trust strip states the terms). */
  style: z.enum(["chunky", "soft"]).optional().catch(undefined),
});
```
In `packages/sections/src/cart_summary.client.tsx`, replace:
```ts
import { CenteredSectionHeader, ChunkyButton, ChunkyLink, WhatsAppButton } from "./helpers/primitives";
import { useStoreBase } from "./helpers/store-context";
import { formatPrice } from "./helpers/format";
import { useCart } from "./helpers/cart-store";
import { whatsappCartLink } from "./helpers/whatsapp";
import type { SectionRenderContext } from "./_types";
import type { Props } from "./cart_summary";
```
with:
```ts
import type { LocaleCode } from "@scheniders/shared";
import { CenteredSectionHeader, ChunkyButton, ChunkyLink, WhatsAppButton } from "./helpers/primitives";
import { ChapterHeading } from "./helpers/chapter-heading";
import { useStoreBase } from "./helpers/store-context";
import { formatPrice } from "./helpers/format";
import { useCart } from "./helpers/cart-store";
import { readsRtl } from "./helpers/reading";
import {
  ReceiptRow,
  SOFT_FIELD,
  SOFT_PRIMARY,
  SOFT_RECEIPT,
  SoftPrimaryBody,
  SoftWhatsappLink,
} from "./helpers/soft-commerce";
import { cn } from "./helpers/utils";
import { whatsappCartLink } from "./helpers/whatsapp";
import { cs } from "./cart_checkout.strings";
import type { SectionRenderContext } from "./_types";
import type { Props } from "./cart_summary";
```
Replace (the start of the default return):
```tsx
  return (
    <section className="px-4 py-bk-section-dense">
      <div
        className="p-bk-lg sm:p-bk-xl"
        style={{
          backgroundColor: RAISED_CARD_BG,
```
with:
```tsx
  if (props.style === "soft") {
    const fee = deliverySummary.kind === "varies" ? deliverySummary.fee : null;
    const eta = deliverySummary.eta_hours;
    const note = [
      fee ? cs("deliveryVaries", locale, { range: `${formatPrice(fee.min, locale)} – ${formatPrice(fee.max, locale)}` }) : null,
      eta
        ? cs("deliveryWithin", locale, {
            hours:
              eta.min === eta.max
                ? formatHours(eta.min, locale)
                : `${formatHours(eta.min, locale)} – ${formatHours(eta.max, locale)}`,
          })
        : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <SoftCartSummary
        locale={locale}
        heading={heading}
        checkoutLabel={checkoutLabel}
        checkoutHref={empty ? null : `${base}/checkout`}
        subtotal={subtotal}
        delivery={delivery}
        deliveryNote={note}
        discountAmount={discountAmount}
        discountCode={discount?.code ?? null}
        total={total}
        waHref={waHref}
        promo={
          props.show_promo_input
            ? {
                value: promoCode,
                status: promoStatus,
                onChange: (v) => {
                  setPromoCode(v);
                  setPromoStatus("idle");
                },
                onApply: applyPromo,
              }
            : null
        }
      />
    );
  }

  return (
    <section className="px-4 py-bk-section-dense">
      <div
        className="p-bk-lg sm:p-bk-xl"
        style={{
          backgroundColor: RAISED_CARD_BG,
```
Append to the end of the file:
```tsx
/** style "soft" (slice 1h): the express receipt and its order button. */
function SoftCartSummary({
  locale,
  heading,
  checkoutLabel,
  checkoutHref,
  subtotal,
  delivery,
  deliveryNote,
  discountAmount,
  discountCode,
  total,
  waHref,
  promo,
}: {
  locale: LocaleCode;
  heading: string;
  checkoutLabel: string;
  /** Null while the cart is empty: the action is a disabled button. */
  checkoutHref: string | null;
  subtotal: number;
  delivery: number;
  deliveryNote: string;
  discountAmount: number;
  discountCode: string | null;
  total: number;
  waHref: string | null;
  promo: {
    value: string;
    status: "idle" | "applied" | "invalid";
    onChange: (value: string) => void;
    onApply: () => void;
  } | null;
}) {
  const rtl = readsRtl(locale);
  return (
    <section className="px-4 py-bk-section-dense" data-cart-style="soft">
      <ChapterHeading locale={locale} title={heading} titleField="heading_i18n" />
      <div className={cn(SOFT_RECEIPT, "divide-y divide-dashed divide-bk-divider px-4")} data-receipt-soft="">
        <div>
          <ReceiptRow rtl={rtl} label={cs("subtotal", locale)} value={<bdi>{formatPrice(subtotal, locale)}</bdi>} />
          <ReceiptRow
            rtl={rtl}
            label={cs("delivery", locale)}
            value={delivery === 0 ? cs("deliveryFree", locale) : <bdi>{formatPrice(delivery, locale)}</bdi>}
          />
          {deliveryNote && (
            <p
              className={cn("-mt-1 pb-2 font-bk-body text-xs text-bk-ink-soft", rtl ? "text-right" : "text-left")}
              data-delivery-note
            >
              {deliveryNote}
            </p>
          )}
          {discountAmount > 0 && (
            <ReceiptRow
              rtl={rtl}
              label={cs("discount", locale)}
              note={discountCode ?? undefined}
              value={<bdi>−{formatPrice(discountAmount, locale)}</bdi>}
            />
          )}
        </div>
        <ReceiptRow rtl={rtl} strong label={cs("total", locale)} value={<bdi>{formatPrice(total, locale)}</bdi>} />
      </div>
      {promo && (
        <div className="mt-bk-sm space-y-1">
          <label htmlFor="cart-promo-input" className="block font-bk-body text-[13px] font-bold text-bk-ink-soft">
            {cs("promoLabel", locale)}
          </label>
          <div className={cn("flex gap-2", rtl && "flex-row-reverse")}>
            <input
              id="cart-promo-input"
              type="text"
              autoComplete="off"
              value={promo.value}
              onChange={(e) => promo.onChange(e.target.value)}
              aria-invalid={promo.status === "invalid" || undefined}
              aria-describedby={promo.status === "idle" ? undefined : "cart-promo-status"}
              className={cn(SOFT_FIELD, "min-w-0 flex-1")}
              placeholder={cs("promoPlaceholder", locale)}
            />
            <button
              type="button"
              onClick={promo.onApply}
              className="min-h-[52px] shrink-0 rounded-bk-input border-bk border-bk-divider bg-bk-surface px-4 font-bk-body text-sm font-bold text-bk-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus"
            >
              {cs("promoApply", locale)}
            </button>
          </div>
          {promo.status === "invalid" && (
            <p id="cart-promo-status" role="alert" className="font-bk-body text-xs font-bold text-bk-danger">
              {cs("promoInvalid", locale)}
            </p>
          )}
          {promo.status === "applied" && (
            <p id="cart-promo-status" className="font-bk-body text-xs font-bold text-bk-ink">
              {cs("promoApplied", locale)}
            </p>
          )}
        </div>
      )}
      <div className="mt-bk-md space-y-bk-xs">
        {checkoutHref ? (
          <a href={checkoutHref} className={SOFT_PRIMARY}>
            <SoftPrimaryBody label={checkoutLabel} labelField="checkout_label_i18n" rtl={rtl} />
          </a>
        ) : (
          <button type="button" disabled className={SOFT_PRIMARY}>
            <SoftPrimaryBody label={checkoutLabel} rtl={rtl} />
          </button>
        )}
        {waHref && <SoftWhatsappLink href={waHref} label={cs("orderOnWhatsapp", locale)} rtl={rtl} />}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run it, the baseline and the type gate**

```bash
CI=true pnpm exec vitest run packages/sections/src/_cart-summary-soft.test.tsx packages/sections/src/_cart-checkout-baseline-snapshot.test.tsx
```
Expected: `Tests  29 passed (29)` (7 + 22), nothing written or updated. Sections type gate: no output.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add packages/sections/src/cart_summary.tsx packages/sections/src/cart_summary.client.tsx packages/sections/src/_cart-summary-soft.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): cart_summary style soft — the express receipt, one soft yellow action, WhatsApp as the soft row" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `checkout_order_summary` soft — the express receipt with the cart's lines

**Files:**
- Modify: `packages/sections/src/checkout_order_summary.tsx`, `packages/sections/src/checkout_order_summary.client.tsx`
- Test: `packages/sections/src/_checkout-summary-soft.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/_checkout-summary-soft.test.tsx`:

```tsx
// @vitest-environment jsdom
// checkout_order_summary `style: "soft"` (slice 1h): the express receipt
// with the cart's lines — names on up to two lines, «الكمية 2» at the
// 12px floor, ink figures, an ink COD note (D4: no yellow total, no green
// icon). "chunky" renders exactly like absent.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";
import checkout_order_summary, { type Props } from "./checkout_order_summary";
import { IRAQ_CART, IRAQ_DRAFT_ORDER_SUMMARY_BASE, LONG_TITLE_LINE, pageCtx } from "./_cart-checkout-fixtures";
import { expectSoftRules, html, mountInStore, withCart } from "./_cart-checkout-test-utils";

afterEach(() => {
  cleanup();
  withCart([]);
});

const SOFT: Props = { ...IRAQ_DRAFT_ORDER_SUMMARY_BASE, style: "soft" };

function mount(props: Props, locale: "ar" | "en" = "ar") {
  const Summary = checkout_order_summary.render;
  return mountInStore(<Summary props={props} ctx={pageCtx("checkout", locale)} />).container;
}

describe("checkout_order_summary style prop", () => {
  it("parses soft; a bad stored value degrades to absent", () => {
    expect(checkout_order_summary.schema.parse(SOFT).style).toBe("soft");
    expect(checkout_order_summary.schema.parse({ ...SOFT, style: [] }).style).toBeUndefined();
  });

  it("chunky renders exactly like absent", () => {
    withCart(IRAQ_CART);
    const absent = html(mount(IRAQ_DRAFT_ORDER_SUMMARY_BASE));
    cleanup();
    expect(html(mount({ ...IRAQ_DRAFT_ORDER_SUMMARY_BASE, style: "chunky" }))).toBe(absent);
  });
});

describe("checkout_order_summary soft", () => {
  it("lines named in full on up to two lines, the quantity at the floor, ink figures", () => {
    withCart(IRAQ_CART);
    const view = mount(SOFT);
    expectSoftRules(view.innerHTML, 0);
    const first = view.querySelector("li");
    expect(first?.querySelector("p")?.textContent).toBe(LONG_TITLE_LINE.name);
    expect(first?.querySelector("p")?.className).toContain("line-clamp-2");
    expect(first?.textContent).toContain("الكمية 2");
    expect(view.textContent).toContain("المجموع128,500 د.ع");
    expect(view.querySelector("h2")?.className).toContain("text-bk-chapter");
  });

  it("the COD note, when a store keeps it, is ink with an ink icon", () => {
    withCart(IRAQ_CART);
    const note = mount(SOFT).querySelector('[data-i18n-field="cod_note_i18n"]');
    expect(note?.textContent).toBe("الدفع عند الاستلام — لا تدفع إلا بعد فحص الطلب.");
    expect(note?.parentElement?.innerHTML).toContain("text-bk-ink");
  });

  it("without a COD note and with an empty cart: one quiet line, no note", () => {
    const { cod_note_i18n: _omit, ...withoutNote } = SOFT;
    const view = mount(withoutNote);
    expect(view.textContent).toContain("السلة فارغة.");
    expect(view.querySelector('[data-i18n-field="cod_note_i18n"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/_checkout-summary-soft.test.tsx
```
Expected: FAIL: the parse test and the soft-markup tests (yellow total, `truncate`, «الكمية 2» at 11px, green icon). "chunky renders exactly like absent" passes.

- [ ] **Step 3: The prop and `SoftOrderSummary`**

In `packages/sections/src/checkout_order_summary.tsx`, replace:
```ts
  show_thumbnails: z.boolean(),
});
```
with:
```ts
  show_thumbnails: z.boolean(),
  /** "chunky" (default): today's outlined recap. "soft" (slice 1h): the
   *  express receipt — hairline card, names on up to two lines, ink
   *  figures and an ink COD note (D4: no yellow total, no green icon). */
  style: z.enum(["chunky", "soft"]).optional().catch(undefined),
});
```
In `packages/sections/src/checkout_order_summary.client.tsx`, replace:
```ts
import type { StoreConfigV2, GovernorateCode } from "@scheniders/shared";
import { CenteredSectionHeader, MaterialIcon } from "./helpers/primitives";
import { formatPrice } from "./helpers/format";
import { useCart } from "./helpers/cart-store";
```
with:
```ts
import type { CartItem, StoreConfigV2, GovernorateCode, LocaleCode } from "@scheniders/shared";
import { CenteredSectionHeader, MaterialIcon } from "./helpers/primitives";
import { ChapterHeading } from "./helpers/chapter-heading";
import { formatPrice } from "./helpers/format";
import { useCart } from "./helpers/cart-store";
import { readsRtl } from "./helpers/reading";
import { ReceiptRow, SOFT_RECEIPT } from "./helpers/soft-commerce";
import { cn } from "./helpers/utils";
import { cs } from "./cart_checkout.strings";
```
Replace:
```tsx
  const total = subtotal - discountAmount + delivery;

  return (
    <section className="px-4 py-bk-section-dense">
```
with:
```tsx
  const total = subtotal - discountAmount + delivery;

  if (props.style === "soft") {
    return (
      <SoftOrderSummary
        locale={locale}
        heading={heading}
        codNote={codNote}
        sticky={props.sticky}
        showThumbnails={props.show_thumbnails}
        items={items}
        subtotal={subtotal}
        delivery={delivery}
        discountAmount={discountAmount}
        discountCode={discount?.code ?? null}
        total={total}
      />
    );
  }

  return (
    <section className="px-4 py-bk-section-dense">
```
Append to the end of the file:
```tsx
/** style "soft" (slice 1h): the express receipt with the cart's lines. */
function SoftOrderSummary({
  locale,
  heading,
  codNote,
  sticky,
  showThumbnails,
  items,
  subtotal,
  delivery,
  discountAmount,
  discountCode,
  total,
}: {
  locale: LocaleCode;
  heading: string;
  codNote: string;
  sticky: boolean;
  showThumbnails: boolean;
  items: CartItem[];
  subtotal: number;
  delivery: number;
  discountAmount: number;
  discountCode: string | null;
  total: number;
}) {
  const rtl = readsRtl(locale);
  return (
    <section className="px-4 py-bk-section-dense" data-checkout-style="soft">
      <div className={sticky ? "lg:sticky lg:top-24" : undefined}>
        <ChapterHeading locale={locale} title={heading} titleField="heading_i18n" />
        <div className={cn(SOFT_RECEIPT, "divide-y divide-dashed divide-bk-divider px-4")}>
          {items.length === 0 ? (
            <p className={cn("py-3 font-bk-body text-sm text-bk-ink-soft", rtl ? "text-right" : "text-left")}>
              {cs("emptyCart", locale)}
            </p>
          ) : (
            <ul className="divide-y divide-bk-divider">
              {items.map((item) => (
                <li key={`${item.product_id}-${item.variant_id ?? "default"}`}>
                  <div className={cn("flex items-center gap-3 py-3", rtl && "flex-row-reverse")}>
                    {showThumbnails && (
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-bk-input bg-bk-surface-alt">
                        {item.image_url ? (
                          <Image src={item.image_url} alt="" fill sizes="48px" className="object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-bk-ink-faint">
                            <MaterialIcon name="image" className="text-lg" />
                          </div>
                        )}
                      </div>
                    )}
                    <div className={cn("min-w-0 flex-1", rtl ? "text-right" : "text-left")}>
                      <p className="line-clamp-2 font-bk-body text-sm font-bold leading-snug text-bk-ink">{item.name}</p>
                      <p className="font-bk-body text-xs tabular-nums text-bk-ink-soft">
                        {cs("lineQuantity", locale, { count: item.quantity })}
                        {item.variant_name ? ` · ${item.variant_name}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 whitespace-nowrap font-bk-body text-sm font-bold tabular-nums text-bk-ink">
                      <bdi>{formatPrice(item.price * item.quantity, locale)}</bdi>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div>
            <ReceiptRow rtl={rtl} label={cs("subtotal", locale)} value={<bdi>{formatPrice(subtotal, locale)}</bdi>} />
            <ReceiptRow
              rtl={rtl}
              label={cs("delivery", locale)}
              value={delivery === 0 ? cs("deliveryFree", locale) : <bdi>{formatPrice(delivery, locale)}</bdi>}
            />
            {discountAmount > 0 && (
              <ReceiptRow
                rtl={rtl}
                label={cs("discount", locale)}
                note={discountCode ?? undefined}
                value={<bdi>−{formatPrice(discountAmount, locale)}</bdi>}
              />
            )}
          </div>
          <ReceiptRow rtl={rtl} strong label={cs("total", locale)} value={<bdi>{formatPrice(total, locale)}</bdi>} />
        </div>
        {codNote && (
          <p
            className={cn(
              "mt-bk-sm flex items-center gap-2 font-bk-body text-[13px] text-bk-ink-soft",
              rtl && "flex-row-reverse text-right",
            )}
          >
            <MaterialIcon name="verified" className="shrink-0 text-lg text-bk-ink" />
            <span data-i18n-field="cod_note_i18n">{codNote}</span>
          </p>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run it, the baseline and the type gate**

```bash
CI=true pnpm exec vitest run packages/sections/src/_checkout-summary-soft.test.tsx packages/sections/src/_cart-checkout-baseline-snapshot.test.tsx
```
Expected: `Tests  27 passed (27)` (5 + 22), nothing written or updated. Sections type gate: no output.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add packages/sections/src/checkout_order_summary.tsx packages/sections/src/checkout_order_summary.client.tsx packages/sections/src/_checkout-summary-soft.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): checkout_order_summary style soft — the express receipt, names on two lines, ink total and note" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `checkout_form` — «ثبّت طلبي» by prop, and the soft form

**Files:**
- Modify: `packages/sections/src/checkout_form.tsx`, `packages/sections/src/checkout_form.client.tsx`
- Test: `packages/sections/src/_checkout-form-soft.test.tsx`

Every switch below keeps today's value when `style` is not `"soft"`. `submitLabel` equals `s("placeOrder")` when no merchant label is set, so the default markup is unchanged. The request body is built by untouched code; the test compares it key by key.

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/_checkout-form-soft.test.tsx`:

```tsx
// @vitest-environment jsdom
// checkout_form `submit_label_i18n` + `style: "soft"` (slice 1h): the
// order action named as on the product page («ثبّت طلبي»), the express
// form's voice (no step chips, quiet card, express fields, the soft
// yellow submit with the total under its label, WhatsApp as the soft
// green row, no fine print), and a request body that is exactly today's.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import checkout_form, { type Props } from "./checkout_form";
import { COPY_ACTIONS } from "./_copy-terms";
import { IRAQ_CART, IRAQ_DRAFT_CHECKOUT_FORM_BASE, LONG_TITLE_LINE, pageCtx } from "./_cart-checkout-fixtures";
import { expectSoftRules, html, mountInStore, withCart } from "./_cart-checkout-test-utils";

const NAMED: Props = { ...IRAQ_DRAFT_CHECKOUT_FORM_BASE, submit_label_i18n: { ar: "ثبّت طلبي", en: "Place my order" } };
const SOFT: Props = { ...NAMED, style: "soft" };

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}"))));
  vi.stubGlobal("fbq", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  withCart([]);
});

function mount(props: Props, locale: "ar" | "en" = "ar") {
  const Form = checkout_form.render;
  const view = mountInStore(<Form props={props} ctx={pageCtx("checkout", locale)} />);
  const q = <T extends Element>(sel: string): T => {
    const el = view.container.querySelector<T>(sel);
    if (!el) throw new Error(`missing ${sel}`);
    return el;
  };
  return { container: view.container, q };
}

function fill(q: ReturnType<typeof mount>["q"]): void {
  fireEvent.change(q<HTMLInputElement>('input[name="name"]'), { target: { value: "زبون تجريبي" } });
  fireEvent.change(q<HTMLInputElement>('input[name="phone"]'), { target: { value: "07802301677" } });
  fireEvent.change(q<HTMLSelectElement>('select[name="governorate"]'), { target: { value: "BG" } });
  fireEvent.change(q<HTMLInputElement>('input[name="city"]'), { target: { value: "الكرادة" } });
  fireEvent.change(q<HTMLTextAreaElement>('textarea[name="address"]'), { target: { value: "قرب الجسر" } });
}

describe("checkout_form props", () => {
  it("parse; bad stored values degrade to absent, never drop the form", () => {
    expect(checkout_form.schema.parse(SOFT)).toEqual(SOFT);
    const bad = checkout_form.schema.parse({ ...SOFT, style: "x", submit_label_i18n: 5 });
    expect([bad.style, bad.submit_label_i18n, bad.payment_methods]).toEqual([undefined, undefined, ["cod"]]);
  });

  it("chunky renders exactly like absent", () => {
    withCart(IRAQ_CART);
    const absent = html(mount(IRAQ_DRAFT_CHECKOUT_FORM_BASE).container);
    cleanup();
    expect(html(mount({ ...IRAQ_DRAFT_CHECKOUT_FORM_BASE, style: "chunky" }).container)).toBe(absent);
  });

  it("submit_label_i18n names the chunky submit too", () => {
    withCart(IRAQ_CART);
    const { q } = mount(NAMED);
    expect(q('button[type="submit"]').textContent).toBe("ثبّت طلبي — 128,500 د.عarrow_forward");
  });
});

describe("checkout_form soft", () => {
  it("one yellow fill: «ثبّت طلبي» with the total under it; no step chips, no fine print", () => {
    withCart(IRAQ_CART);
    const { container, q } = mount(SOFT);
    expectSoftRules(container.innerHTML, 1);
    expect(q('button[type="submit"]').textContent).toBe("ثبّت طلبي128,500 د.عarrow_back");
    expect(q('button[type="submit"]').className).toContain("shadow-bk-button");
    expect(container.querySelector("ol")).toBeNull();
    expect(container.textContent).not.toContain("أكّد الطلب");
    expect(container.textContent).not.toContain("بتأكيدك الطلب");
    expect(q("h1").className).toContain("text-bk-chapter");
  });

  it("COD only, 18 governorates, the express fields reading from the right", () => {
    withCart(IRAQ_CART);
    const { container, q } = mount(SOFT);
    expect(container.querySelectorAll('select[name="governorate"] option:not([disabled])')).toHaveLength(18);
    expect(container.textContent).toContain("الدفع عند الاستلام");
    expect(q('input[name="name"]').className).toContain("text-right");
    expect(q('input[name="name"]').className).toContain("rounded-bk-input");
  });

  it("WhatsApp is the soft green row, named as the express tile", () => {
    withCart(IRAQ_CART);
    const { q } = mount(SOFT);
    expect(q("[data-soft-whatsapp]").textContent).toBe(COPY_ACTIONS.orderOnWhatsapp);
  });

  it("the request body is exactly today's: soft and the label change nothing the server reads", async () => {
    async function bodyOf(props: Props): Promise<Record<string, unknown>> {
      withCart(IRAQ_CART);
      const fetchFn = vi.fn((_url: string, _init?: RequestInit) =>
        Promise.resolve(new Response(JSON.stringify({ success: true, duplicate: true }), { status: 200 })),
      );
      vi.stubGlobal("fetch", fetchFn);
      const { q } = mount(props);
      fill(q);
      await act(async () => {
        fireEvent.submit(q<HTMLFormElement>("form"));
      });
      const call = fetchFn.mock.calls.find(([url]) => url === "/api/checkout/orders");
      const body = JSON.parse(String(call?.[1]?.body)) as Record<string, unknown>;
      cleanup();
      // The two per-submission random ids are minted fresh each time.
      return { ...body, idempotency_key: "k", event_id: "e" };
    }
    const today = await bodyOf(IRAQ_DRAFT_CHECKOUT_FORM_BASE);
    expect(await bodyOf(SOFT)).toEqual(today);
    expect(Object.keys(today).sort()).toEqual([
      "ab_test_arms",
      "address_details",
      "city",
      "customer_name",
      "event_id",
      "governorate_code",
      "idempotency_key",
      "items",
      "locale",
      "notes",
      "payment_method",
      "phone",
      "subtotal",
      "tenant_id",
    ]);
  });

  it("a reprice names the button the shopper taps again", async () => {
    withCart(IRAQ_CART);
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: "issues",
              issues: [{ product_id: LONG_TITLE_LINE.product_id, variant_id: null, reason: "price_changed", new_price: 38000 }],
            }),
            { status: 409 },
          ),
        ),
      ),
    );
    const { container, q } = mount(SOFT);
    fill(q);
    await act(async () => {
      fireEvent.submit(q<HTMLFormElement>("form"));
    });
    await waitFor(() =>
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        "تحدّثت سلتك. راجعها واضغط «ثبّت طلبي» مرة ثانية.",
      ),
    );
  });

  it("without a merchant label the reprice line is today's", async () => {
    withCart(IRAQ_CART);
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ issues: [{ product_id: LONG_TITLE_LINE.product_id, variant_id: null, reason: "unavailable" }] }),
            { status: 409 },
          ),
        ),
      ),
    );
    const { container, q } = mount(IRAQ_DRAFT_CHECKOUT_FORM_BASE);
    fill(q);
    await act(async () => {
      fireEvent.submit(q<HTMLFormElement>("form"));
    });
    await waitFor(() =>
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        "تم تحديث سلتك. راجعها ثم أكّد الطلب مرة أخرى.",
      ),
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/_checkout-form-soft.test.tsx
```
Expected: FAIL. The parse test fails (both keys stripped), as do "names the chunky submit too" («أكّد الطلب»), every soft-markup test, and the reprice-with-label test. "chunky renders exactly like absent", "the request body is exactly today's" and "without a merchant label the reprice line is today's" already pass.

- [ ] **Step 3: The props**

In `packages/sections/src/checkout_form.tsx`, replace:
```ts
  trust_pills: z
    .array(
      z.object({ label_i18n: i18nStringSchema, icon: z.string().optional() }),
    )
    .optional(),
});
```
with:
```ts
  trust_pills: z
    .array(
      z.object({ label_i18n: i18nStringSchema, icon: z.string().optional() }),
    )
    .optional(),
  /** The submit's label (slice 1h). Unset = the chrome «أكّد الطلب». A
   *  store whose product page says «ثبّت طلبي» sets the same words here, so
   *  the order action has one name along the whole path (F12). The reprice
   *  message then quotes this label. */
  submit_label_i18n: i18nStringOptional.catch(undefined),
  /** "chunky" (default): today's outlined form. "soft" (slice 1h): the
   *  express form's voice — no step chips, a quiet card, the express
   *  fields, the chapter heading, the token-radius yellow submit with the
   *  total under its label, WhatsApp as the soft green row, no fine print.
   *  A bad stored value falls back. */
  style: z.enum(["chunky", "soft"]).optional().catch(undefined),
});
```

- [ ] **Step 4: Imports, the chrome string, the label and the switches**

In `packages/sections/src/checkout_form.client.tsx`, make these replacements in order.

(a) Replace:
```ts
import { CenteredSectionHeader, ChunkyButton, MaterialIcon, WhatsAppButton } from "./helpers/primitives";
```
with:
```ts
import { CenteredSectionHeader, ChunkyButton, MaterialIcon, WhatsAppButton } from "./helpers/primitives";
import { ChapterHeading } from "./helpers/chapter-heading";
import { readsRtl } from "./helpers/reading";
import {
  SOFT_CARD,
  SOFT_FIELD,
  SOFT_LABEL,
  SOFT_PRIMARY,
  SoftPrimaryBody,
  SoftWhatsappLink,
} from "./helpers/soft-commerce";
import { cn } from "./helpers/utils";
import { cs } from "./cart_checkout.strings";
```
(b) Replace:
```ts
  errReview: {
    en: "Your cart was updated. Please review it and confirm again.",
    ar: "تم تحديث سلتك. راجعها ثم أكّد الطلب مرة أخرى.",
    ku: "سەبەتەکەت نوێکرایەوە. تکایە پێداچوونەوەی بۆ بکە و دووبارە پشتڕاستی بکەرەوە.",
  },
} as const;
```
with:
```ts
  errReview: {
    en: "Your cart was updated. Please review it and confirm again.",
    ar: "تم تحديث سلتك. راجعها ثم أكّد الطلب مرة أخرى.",
    ku: "سەبەتەکەت نوێکرایەوە. تکایە پێداچوونەوەی بۆ بکە و دووبارە پشتڕاستی بکەرەوە.",
  },
  /** errReview for a store that names its submit (`submit_label_i18n`):
   *  the message quotes the button the shopper will tap again. */
  errReviewAction: {
    en: "Your cart was updated. Review it and tap “{action}” again.",
    ar: "تحدّثت سلتك. راجعها واضغط «{action}» مرة ثانية.",
    ku: "سەبەتەکەت نوێکرایەوە. پێیدا بچۆرەوە و دووبارە «{action}» دابگرە.",
  },
} as const;
```
(c) Replace:
```ts
  const s = (key: keyof typeof STRINGS) => resolveI18n(STRINGS[key], locale);
```
with:
```ts
  const s = (key: keyof typeof STRINGS) => resolveI18n(STRINGS[key], locale);
  // style "soft" (slice 1h): the express form's voice. Every switch below
  // keeps today's value when it is off, so the default markup is unchanged.
  const soft = props.style === "soft";
  const rtl = readsRtl(locale);
  // One name for the order action (F12): the merchant's label when set.
  const namedSubmit = resolveI18n(props.submit_label_i18n, locale);
  const submitLabel = namedSubmit || s("placeOrder");
```
(d) Replace:
```ts
          setErrorLines([s("errReview"), ...lines]);
```
with:
```ts
          setErrorLines([
            namedSubmit ? s("errReviewAction").replace("{action}", namedSubmit) : s("errReview"),
            ...lines,
          ]);
```
(e) Replace:
```ts
  const inputCls =
    "w-full px-3 py-3 font-body text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus";
  const inputStyle: React.CSSProperties = {
    backgroundColor: "var(--bk-surface, #ffffff)",
    border: INK_BORDER,
    borderRadius: "var(--bk-radius-input, 0.75rem)",
    color: "var(--bk-ink, #1a1a1a)",
  };
  const labelCls =
    "block font-label font-bold text-xs bk-caps tracking-[0.2em] text-bk-ink-soft mb-bk-2xs";
```
with:
```ts
  // Soft fields read from the reading edge, as the express form's do.
  const inputCls = soft
    ? cn(SOFT_FIELD, rtl ? "text-right" : "text-left")
    : "w-full px-3 py-3 font-body text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus";
  const inputStyle: React.CSSProperties | undefined = soft
    ? undefined
    : {
        backgroundColor: "var(--bk-surface, #ffffff)",
        border: INK_BORDER,
        borderRadius: "var(--bk-radius-input, 0.75rem)",
        color: "var(--bk-ink, #1a1a1a)",
      };
  const labelCls = soft
    ? cn(SOFT_LABEL, rtl ? "text-right" : "text-left")
    : "block font-label font-bold text-xs bk-caps tracking-[0.2em] text-bk-ink-soft mb-bk-2xs";
```
(f) The step indicator. Replace:
```tsx
        {/* Step indicator */}
        <ol className="flex items-center justify-center gap-bk-xs font-label font-bold text-[11px] bk-caps tracking-[0.15em]">
```
with:
```tsx
        {/* Step indicator — not in soft: the express path has no steps,
            and «التأكيد» would be a third name for the order action. */}
        {!soft && (
        <ol className="flex items-center justify-center gap-bk-xs font-label font-bold text-[11px] bk-caps tracking-[0.15em]">
```
and replace:
```tsx
          })}
        </ol>

        {/* "We'll call to confirm" reassurance callout */}
```
with:
```tsx
          })}
        </ol>
        )}

        {/* "We'll call to confirm" reassurance callout */}
```
(g) The call-promise callout. Replace:
```tsx
          <div
            className="flex items-start gap-3 p-bk-md"
            style={{
              backgroundColor: ACCENT_TINT,
              color: "var(--bk-ink, #1a1a1a)",
              borderRadius: "var(--bk-radius-card, 1rem)",
            }}
          >
            <MaterialIcon name="call" className="text-2xl shrink-0" />
```
with:
```tsx
          <div
            className={soft ? cn(SOFT_CARD, "flex items-start gap-3 p-bk-md", rtl && "flex-row-reverse text-right") : "flex items-start gap-3 p-bk-md"}
            style={
              soft
                ? undefined
                : {
                    backgroundColor: ACCENT_TINT,
                    color: "var(--bk-ink, #1a1a1a)",
                    borderRadius: "var(--bk-radius-card, 1rem)",
                  }
            }
          >
            <MaterialIcon name="call" className="text-2xl shrink-0" />
```
(h) The form card and its heading. Replace:
```tsx
        <div
          className="p-bk-lg sm:p-bk-xl"
          style={{
            backgroundColor: "var(--bk-surface, #ffffff)",
            color: "var(--bk-ink, #1a1a1a)",
            border: INK_BORDER,
            borderRadius: "var(--bk-radius-card, 1rem)",
            boxShadow: "var(--bk-shadow-card, 4px 4px 0px 0px #1a1a1a)",
          }}
        >
          <CenteredSectionHeader
            // The checkout page has no other heading, so this is its h1.
            as="h1"
            align="start"
            title={s("deliveryDetails")}
            className="mb-bk-md"
          />
```
with:
```tsx
        <div
          className={soft ? cn(SOFT_CARD, "px-4 py-5") : "p-bk-lg sm:p-bk-xl"}
          data-checkout-style={soft ? "soft" : undefined}
          style={
            soft
              ? undefined
              : {
                  backgroundColor: "var(--bk-surface, #ffffff)",
                  color: "var(--bk-ink, #1a1a1a)",
                  border: INK_BORDER,
                  borderRadius: "var(--bk-radius-card, 1rem)",
                  boxShadow: "var(--bk-shadow-card, 4px 4px 0px 0px #1a1a1a)",
                }
          }
        >
          {/* The checkout page has no other heading, so this is its h1. */}
          {soft ? (
            <ChapterHeading as="h1" locale={locale} title={s("deliveryDetails")} />
          ) : (
          <CenteredSectionHeader
            as="h1"
            align="start"
            title={s("deliveryDetails")}
            className="mb-bk-md"
          />
          )}
```
(The `// The checkout page…` line comment moves above the switch as a JSX comment. `CenteredSectionHeader`'s props and markup are unchanged, as the baseline shows.)

(i) The phone row. Replace:
```tsx
              <label className="block">
                <span className={labelCls}>{s("phone")}</span>
                <div className="flex" dir="ltr">
```
with:
```tsx
              <label className="block">
                <span className={labelCls}>{s("phone")}</span>
                {soft ? (
                  // The prefix and the number share one field outline; an
                  // LTR document already puts +964 first, so no `dir`.
                  <div
                    className={cn(
                      "flex overflow-hidden rounded-bk-input border-bk bg-bk-surface focus-within:ring-2 focus-within:ring-bk-focus",
                      phoneError ? "border-bk-danger" : "border-bk-divider",
                    )}
                  >
                    <span className="flex shrink-0 items-center bg-bk-surface-alt px-3 font-bk-display text-base font-black text-bk-ink">
                      +964
                    </span>
                    <input
                      type="tel"
                      name="phone"
                      required
                      inputMode="tel"
                      autoComplete="tel-national"
                      placeholder="770 000 0000"
                      value={form.phone}
                      onChange={(e) => {
                        set("phone", e.target.value);
                        if (phoneError) setPhoneError(false);
                      }}
                      onBlur={() => {
                        if (form.phone.trim() !== "") validatePhone();
                      }}
                      aria-invalid={phoneError || undefined}
                      aria-describedby={phoneError ? phoneErrorId : undefined}
                      className="min-h-[52px] w-full min-w-0 bg-transparent px-4 font-bk-body text-base text-bk-ink placeholder:text-bk-ink-faint focus-visible:outline-none"
                    />
                  </div>
                ) : (
                <div className="flex" dir="ltr">
```
and close the switch. Replace:
```tsx
                        ? { borderColor: "var(--bk-danger, #dc2626)" }
                        : {}),
                    }}
                  />
                </div>
              </label>
```
with:
```tsx
                        ? { borderColor: "var(--bk-danger, #dc2626)" }
                        : {}),
                    }}
                  />
                </div>
                )}
              </label>
```
(j) The payment block. Replace:
```tsx
              <legend className="font-display font-black text-base bk-caps mb-bk-xs">
                {s("paymentMethod")}
              </legend>
              <div
                className="flex items-center gap-3 px-4 py-3"
```
with:
```tsx
              <legend
                className={
                  soft
                    ? cn("mb-1 w-full font-bk-body text-[13px] font-bold text-bk-ink-soft", rtl ? "text-right" : "text-left")
                    : "font-display font-black text-base bk-caps mb-bk-xs"
                }
              >
                {s("paymentMethod")}
              </legend>
              {soft ? (
                // D4: the chosen method is a fact, not a success state —
                // ink icon and check on the quiet surface, no green.
                <div
                  className={cn(
                    "flex min-h-[52px] items-center gap-3 rounded-bk-input border-bk border-bk-divider bg-bk-surface-alt px-4",
                    rtl && "flex-row-reverse",
                  )}
                >
                  <MaterialIcon name="payments" className="shrink-0 text-2xl text-bk-ink" />
                  <span className={cn("flex-1 font-bk-body text-[15px] font-bold text-bk-ink", rtl ? "text-right" : "text-left")}>
                    {s("cod")}
                  </span>
                  <MaterialIcon name="check_circle" className="shrink-0 text-2xl text-bk-ink" />
                </div>
              ) : (
              <div
                className="flex items-center gap-3 px-4 py-3"
```
and close it. Replace:
```tsx
                <MaterialIcon
                  name="check_circle"
                  className="text-2xl text-bk-success"
                />
              </div>
            </fieldset>
```
with:
```tsx
                <MaterialIcon
                  name="check_circle"
                  className="text-2xl text-bk-success"
                />
              </div>
              )}
            </fieldset>
```
(k) The trust pills. Replace:
```tsx
                  <li
                    key={pill.label}
                    className="inline-flex items-center gap-2 px-3 py-1.5 font-label font-bold text-xs bk-caps"
                    style={{
                      backgroundColor: "var(--bk-surface-alt, #f7f4ee)",
                      color: "var(--bk-ink, #1a1a1a)",
                      border: INK_BORDER,
                      borderRadius: "var(--bk-radius-pill, 9999px)",
                    }}
                  >
```
with:
```tsx
                  <li
                    key={pill.label}
                    className={
                      soft
                        ? "inline-flex items-center gap-2 rounded-bk-pill bg-bk-surface-alt px-3 py-1.5 font-bk-body text-xs font-bold text-bk-ink"
                        : "inline-flex items-center gap-2 px-3 py-1.5 font-label font-bold text-xs bk-caps"
                    }
                    style={
                      soft
                        ? undefined
                        : {
                            backgroundColor: "var(--bk-surface-alt, #f7f4ee)",
                            color: "var(--bk-ink, #1a1a1a)",
                            border: INK_BORDER,
                            borderRadius: "var(--bk-radius-pill, 9999px)",
                          }
                    }
                  >
```
(l) The reassurance line. Replace:
```tsx
              <p
                className="font-body text-sm text-bk-ink-soft inline-flex items-center gap-2"
                data-i18n-field="reassurance_text_i18n"
              >
                <MaterialIcon
                  name="visibility"
                  className="text-xl text-bk-primary"
                />
                {reassurance}
              </p>
```
with:
```tsx
              soft ? (
                // D4: yellow is the order action only — the eye is ink.
                <p className={cn("flex items-center gap-2 font-bk-body text-[13px] text-bk-ink-soft", rtl && "flex-row-reverse")}>
                  <MaterialIcon name="visibility" className="shrink-0 text-xl text-bk-ink" />
                  <span data-i18n-field="reassurance_text_i18n" className={rtl ? "text-right" : "text-left"}>
                    {reassurance}
                  </span>
                </p>
              ) : (
              <p
                className="font-body text-sm text-bk-ink-soft inline-flex items-center gap-2"
                data-i18n-field="reassurance_text_i18n"
              >
                <MaterialIcon
                  name="visibility"
                  className="text-xl text-bk-primary"
                />
                {reassurance}
              </p>
              )
```
(m) The loyalty box. Replace:
```tsx
              <div
                className="space-y-bk-xs p-bk-sm"
                style={{
                  backgroundColor: ACCENT_TINT,
                  border: INK_BORDER,
                  borderRadius: "var(--bk-radius-input, 0.75rem)",
                }}
              >
```
with:
```tsx
              <div
                className={soft ? cn(SOFT_CARD, "space-y-bk-xs p-bk-sm") : "space-y-bk-xs p-bk-sm"}
                style={
                  soft
                    ? undefined
                    : {
                        backgroundColor: ACCENT_TINT,
                        border: INK_BORDER,
                        borderRadius: "var(--bk-radius-input, 0.75rem)",
                      }
                }
              >
```
(n) The submit. Replace:
```tsx
            {/* Primary CTA with running total. Stays focusable while pending
                (aria-busy/aria-disabled) so focus isn't dropped mid-submit. */}
            <ChunkyButton
```
with:
```tsx
            {/* Primary CTA with running total. Stays focusable while pending
                (aria-busy/aria-disabled) so focus isn't dropped mid-submit. */}
            {soft ? (
              <button
                type="submit"
                className={SOFT_PRIMARY}
                disabled={items.length === 0}
                aria-busy={submitting || undefined}
                aria-disabled={submitting || undefined}
                aria-describedby={
                  status === "error" && errorLines.length > 0
                    ? submitErrorId
                    : undefined
                }
              >
                <SoftPrimaryBody
                  label={submitting ? s("placingOrder") : submitLabel}
                  labelField={namedSubmit ? "submit_label_i18n" : undefined}
                  sub={
                    !submitting && items.length > 0 ? <bdi>{formatPrice(total, locale)}</bdi> : undefined
                  }
                  rtl={rtl}
                  busy={submitting}
                />
              </button>
            ) : (
            <ChunkyButton
```
Replace:
```tsx
                <>
                  {s("placeOrder")}
                  {items.length > 0 && (
```
with:
```tsx
                <>
                  {submitLabel}
                  {items.length > 0 && (
```
(o) Close the submit switch, drop the fine print and the «أو» block in soft. Replace:
```tsx
                  <MaterialIcon name="arrow_forward" />
                </>
              )}
            </ChunkyButton>
            <p className="text-center font-body text-xs text-bk-ink-soft">
              {s("finePrint")}
            </p>

            {/* WhatsApp alternative */}
            {waEnabled && (
```
with:
```tsx
                  <MaterialIcon name="arrow_forward" />
                </>
              )}
            </ChunkyButton>
            )}
            {!soft && (
            <p className="text-center font-body text-xs text-bk-ink-soft">
              {s("finePrint")}
            </p>
            )}

            {/* WhatsApp alternative — soft: the express page's green row,
                named as its tile is («اطلب عبر واتساب»). */}
            {waEnabled && soft && (
              <SoftWhatsappLink href={waHref} label={cs("orderOnWhatsapp", locale)} rtl={rtl} />
            )}
            {waEnabled && !soft && (
```

- [ ] **Step 5: Run it, the baseline, the existing checkout tests, the type gate**

```bash
CI=true pnpm exec vitest run packages/sections/src/_checkout-form-soft.test.tsx packages/sections/src/_cart-checkout-baseline-snapshot.test.tsx packages/sections/src/_checkout-form-duplicate.test.tsx packages/sections/src/_checkout-loyalty.test.tsx packages/sections/src/_kurdish-coverage.test.ts packages/sections/src/_arabic-copy-lint.test.ts
```
Expected: all pass (`_checkout-form-soft` 9 tests), nothing written or updated; the lint passes «تحدّثت سلتك. راجعها واضغط «{action}» مرة ثانية.» with the allowlist unchanged. Sections type gate: no output.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add packages/sections/src/checkout_form.tsx packages/sections/src/checkout_form.client.tsx packages/sections/src/_checkout-form-soft.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): checkout_form submit_label_i18n and style soft — «ثبّت طلبي» by prop, the express form's voice, the body unchanged" -m "The reprice line quotes the merchant's label (errReviewAction, ar/en/ku). Soft: no step chips, express fields, the soft yellow submit with the total under it, WhatsApp as the soft row, no fine print." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: `order_confirmation` soft, and the express stash's display name

**Files:**
- Modify: `packages/sections/src/order_confirmation.tsx`, `packages/sections/src/order_confirmation.client.tsx`, `packages/sections/src/pdp_direct_order.client.tsx`
- Test: `packages/sections/src/_order-confirmation-soft.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/_order-confirmation-soft.test.tsx`:

```tsx
// @vitest-environment jsdom
// order_confirmation `style: "soft"` (slice 1h): the recap as the express
// receipt — the product named as its page names it (the express stash's
// `display_name`), the total in ink — chapter headings, ink step numbers,
// WhatsApp as the soft green row, a quiet track link. The express order
// writes `display_name` into the stash; its request body is unchanged.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { writeOrderDraft } from "./helpers/order-draft";
import order_confirmation, { type Props } from "./order_confirmation";
import pdp_direct_order from "./pdp_direct_order";
import { EXPRESS_STASH, IRAQ_DRAFT_CONFIRMATION_BASE, LONG_TITLE_LINE, pageCtx } from "./_cart-checkout-fixtures";
import { html, mountInStore } from "./_cart-checkout-test-utils";
import { EXPRESS_IRAQ_PDP_PROPS, FIXTURE_NOW, fixtureTenant, plainProduct, productCtx } from "./_pdp-fixtures";

const SOFT: Props = { ...IRAQ_DRAFT_CONFIRMATION_BASE, style: "soft" };
const NAMED_STASH = { ...EXPRESS_STASH, items: [{ ...EXPRESS_STASH.items[0], display_name: "ويفر انتنس" }] };

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}"))));
  vi.stubGlobal("fbq", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mount(props: Props, stash: object) {
  vi.useFakeTimers({ toFake: ["Date"], now: FIXTURE_NOW });
  window.sessionStorage.setItem("schn:last-order", JSON.stringify(stash));
  const Confirmation = order_confirmation.render;
  return mountInStore(
    <Confirmation props={props} ctx={pageCtx("checkout_success", "ar", undefined, "SH-0001")} />,
  ).container;
}

describe("order_confirmation style prop", () => {
  it("parses soft; a bad stored value degrades to absent", () => {
    expect(order_confirmation.schema.parse(SOFT).style).toBe("soft");
    expect(order_confirmation.schema.parse({ ...SOFT, style: "x" }).style).toBeUndefined();
  });

  it("chunky renders exactly like absent, even with a display name in the stash", () => {
    const absent = html(mount(IRAQ_DRAFT_CONFIRMATION_BASE, NAMED_STASH));
    cleanup();
    expect(html(mount({ ...IRAQ_DRAFT_CONFIRMATION_BASE, style: "chunky" }, NAMED_STASH))).toBe(absent);
    expect(absent).toContain(LONG_TITLE_LINE.name);
  });
});

describe("order_confirmation soft", () => {
  it("the recap names the product as its page does, total in ink", () => {
    const recap = mount(SOFT, NAMED_STASH).querySelector("[data-recap-style]");
    expect(recap?.textContent).toBe("ملخّص طلبكويفر انتنس× 136,750 د.عالمجموع36,750 د.ع");
    expect(recap?.innerHTML).not.toContain("--bk-primary");
    expect(recap?.querySelector("h2")?.className).toContain("text-bk-chapter");
  });

  it("a stash without display names (a cart order, an older stash) shows the line's own name", () => {
    const recap = mount(SOFT, EXPRESS_STASH).querySelector("[data-recap-style]");
    expect(recap?.textContent).toContain(LONG_TITLE_LINE.name);
  });

  it("ink step numbers, the ETA card, WhatsApp soft, a quiet track link; no yellow, no dir", () => {
    const view = mount(SOFT, NAMED_STASH);
    const steps = view.querySelector("[data-steps-style]");
    expect(steps?.querySelectorAll(".bg-bk-ink")).toHaveLength(3);
    expect(steps?.innerHTML).not.toContain("--bk-primary");
    expect(view.querySelector("[data-soft-whatsapp]")?.textContent).toBe("تواصل معنا عبر واتساب");
    const track = view.querySelector<HTMLAnchorElement>('a[href="/s/fixture-store/track?order=SH-0001"]');
    expect(track?.className).toContain("rounded-bk-input");
    expect(track?.getAttribute("style")).toBeNull();
    const below = [...view.querySelectorAll("[data-recap-style], [data-steps-style]")].map((n) => n.outerHTML).join("");
    expect(below).not.toContain(' dir="');
  });
});

describe("the express order stashes the page's name for the thank-you", () => {
  it("display_name beside the catalogue name; the request body keeps the catalogue name", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const product = { ...plainProduct, display_name: "تجريبي" };
    writeOrderDraft(fixtureTenant.id, product.id, {
      form: {
        customer_name: "زبون تجريبي",
        phone: "07802301677",
        alt_phone: "",
        governorate_code: "BG",
        address_details: "الكرادة قرب الجسر",
      },
      idempotencyKey: null,
      purchaseEventId: null,
    });
    const fetchFn = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(
        new Response(JSON.stringify({ success: true, orderNumber: "SH-0002", orderId: "order-2", total: 18000 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchFn);
    const Pdp = pdp_direct_order.render;
    const view = mountInStore(<Pdp props={EXPRESS_IRAQ_PDP_PROPS} ctx={productCtx(product)} />);
    const form = view.container.querySelector<HTMLFormElement>("form#direct-order");
    if (!form) throw new Error("missing the order form");
    await act(async () => {
      fireEvent.submit(form);
    });
    await waitFor(() => expect(window.sessionStorage.getItem("schn:last-order")).not.toBeNull());
    const saved = JSON.parse(window.sessionStorage.getItem("schn:last-order") ?? "{}") as {
      items: Array<{ name: string; display_name?: string }>;
    };
    expect(saved.items[0]).toMatchObject({ name: plainProduct.name, display_name: "تجريبي" });
    const call = fetchFn.mock.calls.find(([url]) => url === "/api/checkout/orders");
    const body = JSON.parse(String(call?.[1]?.body)) as { items: Array<Record<string, unknown>> };
    expect(body.items[0]?.name).toBe(plainProduct.name);
    expect(body.items[0]).not.toHaveProperty("display_name");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/_order-confirmation-soft.test.tsx
```
Expected: FAIL: the parse test, every soft test (no `data-recap-style` / `data-steps-style` / `data-soft-whatsapp`), and the stash test (`display_name` missing). "chunky renders exactly like absent…" passes.

- [ ] **Step 3: The prop**

In `packages/sections/src/order_confirmation.tsx`, replace:
```ts
  call_card_whatsapp_sent_i18n: i18nStringOptional.catch(undefined),
});
```
with:
```ts
  call_card_whatsapp_sent_i18n: i18nStringOptional.catch(undefined),
  /** "chunky" (default): today's thank-you below the head card. "soft"
   *  (slice 1h): the redesigned PDP's voice — the recap as the express
   *  receipt (the product named as its page names it, the total in ink,
   *  D4), chapter headings, ink step numbers instead of yellow discs,
   *  WhatsApp as the soft green row and a quiet track link. The call card
   *  above is unchanged. A bad stored value falls back. */
  style: z.enum(["chunky", "soft"]).optional().catch(undefined),
});
```

- [ ] **Step 4: The stash field, `SoftRecap`, and the soft steps, ETA and actions**

In `packages/sections/src/order_confirmation.client.tsx`, replace:
```ts
import { EyebrowChip, MaterialIcon, Section, WhatsAppButton } from "./helpers/primitives";
```
with:
```ts
import { EyebrowChip, MaterialIcon, Section, WhatsAppButton } from "./helpers/primitives";
import { ChapterHeading } from "./helpers/chapter-heading";
import { readsRtl } from "./helpers/reading";
import { ReceiptRow, SOFT_RECEIPT, SoftWhatsappLink } from "./helpers/soft-commerce";
import { cn } from "./helpers/utils";
```
Replace:
```ts
interface StashedItem {
  name: string;
  variant: string | null;
  qty: number;
  price: number;
}
```
with:
```ts
interface StashedItem {
  name: string;
  /** The name the product's own page shows (pdp_direct_order writes it,
   *  slice 1h). Read only by the soft recap; absent from older stashes and
   *  from cart orders, whose line names are already the page's. */
  display_name?: string;
  variant: string | null;
  qty: number;
  price: number;
}
```
Replace:
```ts
    items: items.map((i) => ({
      name: i.name,
      variant: typeof i.variant === "string" ? i.variant : null,
      qty: i.qty,
      price: i.price,
    })),
```
with:
```ts
    items: items.map((i) => ({
      name: i.name,
      ...(typeof i.display_name === "string" && i.display_name.trim()
        ? { display_name: i.display_name.trim() }
        : {}),
      variant: typeof i.variant === "string" ? i.variant : null,
      qty: i.qty,
      price: i.price,
    })),
```
Replace:
```tsx
/* ─── Render ────────────────────────────────────────────────────────── */
```
with:
```tsx
/** style "soft" (slice 1h): the recap as the express receipt — each line
 *  named as its product page names it, read from the right in Arabic, the
 *  total in ink at the receipt's 22px/900 (D4). */
function SoftRecap({
  order,
  locale,
  heading,
  totalLabel,
}: {
  order: StashedOrder;
  locale: LocaleCode;
  heading: string;
  totalLabel: string;
}) {
  const rtl = readsRtl(locale);
  return (
    <div className="mt-bk-lg" data-recap-style="soft">
      <ChapterHeading locale={locale} title={heading} titleField="recap_heading_i18n" />
      <div className={cn(SOFT_RECEIPT, "divide-y divide-dashed divide-bk-divider px-4")}>
        <ul>
          {order.items.map((it, i) => (
            <li key={`${i}-${it.name}`}>
              <ReceiptRow
                rtl={rtl}
                label={it.variant ? `${it.display_name ?? it.name} · ${it.variant}` : (it.display_name ?? it.name)}
                note={`× ${it.qty}`}
                value={<bdi>{formatPrice(it.price * it.qty, locale)}</bdi>}
              />
            </li>
          ))}
        </ul>
        <ReceiptRow rtl={rtl} strong label={totalLabel} value={<bdi>{formatPrice(order.total, locale)}</bdi>} />
      </div>
    </div>
  );
}

/* ─── Render ────────────────────────────────────────────────────────── */
```
Replace:
```ts
  const trackHref = orderNumber
    ? `/track?order=${encodeURIComponent(orderNumber)}`
    : "/track";
```
with:
```ts
  const trackHref = orderNumber
    ? `/track?order=${encodeURIComponent(orderNumber)}`
    : "/track";
  const soft = props.style === "soft";
  const rtl = readsRtl(locale);
```
Replace:
```tsx
        {recap && (
          <Recap
            order={recap}
            locale={locale}
            heading={t(props.recap_heading_i18n)}
            totalLabel={t(props.total_label_i18n)}
          />
        )}

        <section aria-labelledby={stepsId} className="mt-bk-md">
          <h2
            id={stepsId}
            data-i18n-field="steps_heading_i18n"
            className="font-display text-bk-h3 font-black"
          >
            {t(props.steps_heading_i18n)}
          </h2>
          <ol className="mt-bk-sm space-y-bk-xs">
```
with:
```tsx
        {recap && soft && (
          <SoftRecap
            order={recap}
            locale={locale}
            heading={t(props.recap_heading_i18n)}
            totalLabel={t(props.total_label_i18n)}
          />
        )}
        {recap && !soft && (
          <Recap
            order={recap}
            locale={locale}
            heading={t(props.recap_heading_i18n)}
            totalLabel={t(props.total_label_i18n)}
          />
        )}

        {soft ? (
          <section aria-labelledby={stepsId} className="mt-bk-lg" data-steps-style="soft">
            <ChapterHeading
              locale={locale}
              id={stepsId}
              title={t(props.steps_heading_i18n)}
              titleField="steps_heading_i18n"
            />
            <ol className="space-y-bk-xs">
              {props.steps.map((step, i) => {
                const body = step.body_i18n ? t(step.body_i18n) : "";
                return (
                  <li key={i}>
                    <div
                      className={cn("flex items-start gap-bk-sm p-bk-sm", rtl && "flex-row-reverse")}
                      style={CARD_STYLE}
                    >
                      {/* D4: a step number is not an order action — ink, not a yellow disc. */}
                      <span
                        aria-hidden="true"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-bk-pill bg-bk-ink font-bk-display text-sm font-black tabular-nums text-bk-surface"
                      >
                        {i + 1}
                      </span>
                      <div className={cn("min-w-0", rtl ? "text-right" : "text-left")}>
                        <p className="font-bk-body text-base font-bold text-bk-ink">{t(step.title_i18n)}</p>
                        {body && <p className="mt-0.5 font-bk-body text-sm text-bk-ink-soft">{body}</p>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : (
        <section aria-labelledby={stepsId} className="mt-bk-md">
          <h2
            id={stepsId}
            data-i18n-field="steps_heading_i18n"
            className="font-display text-bk-h3 font-black"
          >
            {t(props.steps_heading_i18n)}
          </h2>
          <ol className="mt-bk-sm space-y-bk-xs">
```
Replace:
```tsx
              );
            })}
          </ol>
        </section>

        {eta && (
          <div
            className="mt-bk-md flex items-start gap-bk-sm p-bk-md"
            style={CARD_STYLE}
          >
```
with:
```tsx
              );
            })}
          </ol>
        </section>
        )}

        {eta && (
          <div
            className={cn("mt-bk-md flex items-start gap-bk-sm p-bk-md", soft && rtl && "flex-row-reverse text-right")}
            style={CARD_STYLE}
          >
```
(`cn("mt-bk-md flex items-start gap-bk-sm p-bk-md", false)` returns the same class string, so the default ETA card is unchanged.)

Replace:
```tsx
        <div className="mt-bk-lg flex flex-col gap-bk-xs">
          {phone && (
            <WhatsAppButton
```
with:
```tsx
        <div className="mt-bk-lg flex flex-col gap-bk-xs">
          {phone && soft && (
            <SoftWhatsappLink
              href={buildWhatsappHref(phone, t(props.whatsapp_message_i18n), orderNumber)}
              label={t(props.whatsapp_label_i18n)}
              rtl={rtl}
            />
          )}
          {phone && !soft && (
            <WhatsAppButton
```
Replace:
```tsx
          <StoreLink
            href={trackHref}
            data-i18n-field="track_label_i18n"
            className={`inline-flex min-h-12 w-full items-center justify-center gap-2 px-6 py-3 font-display text-base font-bold ${PRESSABLE} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus`}
            style={{
              backgroundColor: "var(--bk-surface, #ffffff)",
              color: "var(--bk-ink, #1a1a1a)",
              border: INK_BORDER,
              borderRadius: "var(--bk-radius-pill, 9999px)",
              boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
              fontFamily: "var(--bk-font-display, inherit)",
            }}
          >
```
with:
```tsx
          <StoreLink
            href={trackHref}
            data-i18n-field="track_label_i18n"
            className={
              soft
                ? cn(
                    "flex min-h-[52px] w-full items-center justify-center gap-2 rounded-bk-input border-bk border-bk-divider bg-bk-surface px-4 font-bk-body text-[15px] font-bold text-bk-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus",
                    PRESSABLE,
                    rtl && "flex-row-reverse",
                  )
                : `inline-flex min-h-12 w-full items-center justify-center gap-2 px-6 py-3 font-display text-base font-bold ${PRESSABLE} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus`
            }
            style={
              soft
                ? undefined
                : {
                    backgroundColor: "var(--bk-surface, #ffffff)",
                    color: "var(--bk-ink, #1a1a1a)",
                    border: INK_BORDER,
                    borderRadius: "var(--bk-radius-pill, 9999px)",
                    boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
                    fontFamily: "var(--bk-font-display, inherit)",
                  }
            }
          >
```

- [ ] **Step 5: The express order stashes the page's name**

In `packages/sections/src/pdp_direct_order.client.tsx`, replace:
```ts
import { PdpExpress } from "./pdp_express/express-view";
```
with:
```ts
import { PdpExpress } from "./pdp_express/express-view";
import { displayNameOf } from "./pdp_express/identity-label";
```
and replace (the thank-you stash, not the request body):
```ts
            items: items.map((i) => ({
              name: i.name,
              variant: i.variant_name,
              qty: i.quantity,
              price: i.price,
            })),
```
with:
```ts
            items: items.map((i) => ({
              name: i.name,
              // The name this page shows (slice 1h's soft recap reads it);
              // the order itself keeps the catalogue's name.
              display_name: displayNameOf(
                acceptedBump && i.product_id === acceptedBump.product.id ? acceptedBump.product : product,
              ),
              variant: i.variant_name,
              qty: i.quantity,
              price: i.price,
            })),
```

- [ ] **Step 6: Run it, every baseline touching these files, the type gate**

```bash
CI=true pnpm exec vitest run packages/sections/src/_order-confirmation-soft.test.tsx packages/sections/src/_cart-checkout-baseline-snapshot.test.tsx packages/sections/src/_order-confirmation-baseline-snapshot.test.tsx packages/sections/src/_order-confirmation.test.tsx packages/sections/src/_order-confirmation-call-card.test.tsx packages/sections/src/_order-confirmation-referral.test.tsx packages/sections/src/_pdp-order-safety.test.tsx packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_pdp-classic-snapshot.test.tsx
```
Expected: all pass (`_order-confirmation-soft` 6 tests), nothing written or updated. Sections type gate: no output.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add packages/sections/src/order_confirmation.tsx packages/sections/src/order_confirmation.client.tsx packages/sections/src/pdp_direct_order.client.tsx packages/sections/src/_order-confirmation-soft.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): order_confirmation style soft — the recap as the express receipt named as the PDP names it, ink steps, soft actions" -m "pdp_direct_order adds display_name to the thank-you session stash (additive; the request body is unchanged). The call card is unchanged." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The 1h draft-config migration (written, replayed locally, dry-run; NOT applied)

**Files:**
- Create: `packages/supabase/migrations/${STAMP}_scheniders_iraq_pdp_redesign_1h_draft.sql`
- Scratch: `tmp/pdp-1h/dryrun-1h.sql` (gitignored), `${TMPDIR:-/tmp}/pdp-1h-pglite/` (outside the repo)

Every live access in this task is **read-only**. The `edits` block is exactly Task 11's `SLICE_1H_EDITS` (Task 11's mirror test proves it).

- [ ] **Step 1: Pick the timestamp (later than the clock may be)**

```bash
LAST_FILE=$(ls packages/supabase/migrations | grep -E '^[0-9]{14}_' | sort | tail -1 | cut -c1-14)
LAST_REMOTE=$(cd packages && supabase db query --linked "SELECT max(version) FROM supabase_migrations.schema_migrations" -o csv | tail -1)
NOW=$(date -u +%Y%m%d%H%M%S)
STAMP=$(node -e 'const [a,b,n]=process.argv.slice(1);const m=[a,b].sort().pop();const d=new Date(Date.UTC(+m.slice(0,4),+m.slice(4,6)-1,+m.slice(6,8),+m.slice(8,10),+m.slice(10,12),+m.slice(12,14))+1000);const next=d.toISOString().replace(/[-:T]/g,"").slice(0,14);console.log(n>next?n:next)' "$LAST_FILE" "$LAST_REMOTE" "$NOW")
echo "$LAST_FILE $LAST_REMOTE $NOW -> $STAMP"
```
Expected on 2026-10-30 before 12:00 UTC: `20261030120001 20261030120001 2026103010xxxx -> 20261030120002`. The 1g file was re-stamped past the clock, so `date -u` alone would sort before it. Keep `$STAMP` in this shell.

- [ ] **Step 2: Write the migration**

Create `packages/supabase/migrations/${STAMP}_scheniders_iraq_pdp_redesign_1h_draft.sql` (if Task 0 Step 4 read other guard values, put them in `c_expected_draft_md5`, `c_expected_rev`, guard c. and the Rollback line):

```sql
-- =====================================================================
-- scheniders-iraq PDP redesign, slice 1h — DRAFT config only
-- =====================================================================
-- The cart, checkout and thank-you pages in the redesigned product page's
-- voice. Plan: docs/superpowers/plans/2026-10-30-pdp-p1h-cart-checkout.md.
--
-- Writes ONLY tenants.store_config_v2_draft (and updated_at) for slug
-- scheniders-iraq. store_config_v2 (published) is never written; its md5
-- is captured before the write and asserted equal after it.
--
-- What it changes in the draft (the `edits` list below: each patch merged
-- into the section's base with `||`, each `remove` key dropped with `-`,
-- `enabled` set when given):
--   cart      cart_line_items 2e4337a4         style "soft"
--   cart      cart_summary e5dbfa28            style "soft"; checkout_label_i18n
--                                              «كمّل طلبك» (was «متابعة الدفع»)
--   cart      trust_strip 78babd62             style "soft"; three pills in the
--                                              promise band's words (free delivery
--                                              is the receipt's row, not a pill)
--   cart      sticky_cta_bar aee18fed          enabled false (a second yellow
--                                              button over the summary's own)
--   checkout  checkout_form 561f48cc           style "soft"; submit_label_i18n
--                                              «ثبّت طلبي» (was the chrome
--                                              «أكّد الطلب»); the band's promise
--   checkout  checkout_order_summary 10bbe359  style "soft"; cod_note_i18n removed
--   checkout  trust_strip 4d0bc827             enabled false (every fact is on
--                                              the form or the receipt)
--   checkout_success order_confirmation 59bfb096  style "soft"; eta_i18n = the
--                                              product page's delivery claim
--                                              (Latin digits); whatsapp_label_i18n
--                                              «راسلنا واتساب»
--
-- Guards, in order, in one transaction:
--   a. no tenant / a listed page or section missing -> RAISE NOTICE and no
--      write (a fresh database replays this as a no-op);
--   b. the transform applied to the current draft changes nothing
--      -> RAISE NOTICE 'already applied' and no write (a second run is a no-op);
--   c. md5(store_config_v2_draft::text) must be aa676deb050743aef4cfec1511a73361
--      and store_config_rev must be 38 (the draft after the 1g migration)
--      -> else RAISE EXCEPTION: someone edited or published since, so
--      re-read and regenerate this file;
--   d. md5(store_config_v2::text) is equal before and after the write.
--
-- Applied ONLY after the code that reads these props is deployed:
--   supabase db query --linked -f <this file>
--   supabase migration repair --status applied <version>
-- Never `supabase db push`.
--
-- Rollback (read at draft md5 aa676deb050743aef4cfec1511a73361): drop
-- `style` from the six patched bases and `submit_label_i18n` from 561f48cc
-- with `-`; set enabled true on aee18fed and 4d0bc827; restore
--   e5dbfa28 checkout_label_i18n {"ar": "متابعة الدفع", "en": "Continue to checkout"};
--   78babd62 pills = 4d0bc827's pills (this file leaves them as they were);
--   561f48cc reassurance_text_i18n {"ar": "فحص مجاني عند الاستلام — لا تدفع إلا إذا أعجبتك القطعة.", "en": "Free inspection on delivery — pay only if you're happy."};
--   10bbe359 cod_note_i18n {"ar": "الدفع عند الاستلام — لا تدفع إلا بعد فحص الطلب.", "en": "Cash on delivery — pay only after inspection."};
--   59bfb096 eta_i18n {"ar": "خلال ٢٤ ساعة من تثبيت الطلب", "en": "Within 24 hours of confirmation"} and
--            whatsapp_label_i18n {"ar": "تواصل معنا عبر واتساب", "en": "Message us on WhatsApp"}.
-- =====================================================================

DO $mig$
DECLARE
  c_slug constant text := 'scheniders-iraq';
  c_expected_rev constant bigint := 38;
  c_expected_draft_md5 constant text := 'aa676deb050743aef4cfec1511a73361';
  -- edits:begin
  c_edits constant jsonb := $json$[
    {"page": "cart", "id": "2e4337a4-87ae-478d-98b6-5f361a404562", "patch": {"style": "soft"}},
    {"page": "cart", "id": "e5dbfa28-5c29-4f8b-810a-b5fe2baf1d2c", "patch": {
      "style": "soft",
      "checkout_label_i18n": {"ar": "كمّل طلبك", "en": "Finish your order"}
    }},
    {"page": "cart", "id": "78babd62-1484-48f1-8ed9-90e4fbc198a2", "patch": {
      "style": "soft",
      "pills": [
        {"bg": "mint", "icon": "payments", "label_i18n": {"ar": "الدفع عند الاستلام", "en": "Cash on delivery"}},
        {"bg": "sky", "icon": "visibility", "label_i18n": {"ar": "تفتح وتجرّب قبل لا تدفع", "en": "Open it and try it before you pay"}},
        {"bg": "lilac", "icon": "undo", "label_i18n": {
          "ar": "ما عجبك؟ ترفضه قدام المندوب أو ترجّعه خلال أسبوع",
          "en": "Don't like it? Refuse it in front of the courier, or return it within a week."
        }}
      ]
    }},
    {"page": "cart", "id": "aee18fed-e7c6-4f3f-8257-9f1a60fb4a3c", "patch": {}, "enabled": false},
    {"page": "checkout", "id": "561f48cc-7a08-4a8e-bb9f-b76a4ad8c26a", "patch": {
      "style": "soft",
      "submit_label_i18n": {"ar": "ثبّت طلبي", "en": "Place my order"},
      "reassurance_text_i18n": {
        "ar": "تفتح وتجرّب قبل لا تدفع — ما عجبك؟ ترفضه قدام المندوب أو ترجّعه خلال أسبوع",
        "en": "Open it and try it before you pay. Don't like it? Refuse it in front of the courier, or return it within a week."
      }
    }},
    {"page": "checkout", "id": "10bbe359-3565-43f7-883a-da6607379b87", "patch": {"style": "soft"}, "remove": ["cod_note_i18n"]},
    {"page": "checkout", "id": "4d0bc827-8914-4505-b018-10edaef38130", "patch": {}, "enabled": false},
    {"page": "checkout_success", "id": "59bfb096-e8ab-4503-b2ab-def24113ec07", "patch": {
      "style": "soft",
      "eta_i18n": {"ar": "أغلب الطلبات توصل خلال 24 ساعة من تثبيت الطلب", "en": "Most orders arrive within 24 hours of confirmation"},
      "whatsapp_label_i18n": {"ar": "راسلنا واتساب", "en": "Message us on WhatsApp"}
    }}
  ]$json$;
  -- edits:end
  v_tenant_id uuid;
  v_rev bigint;
  v_draft jsonb;
  v_target jsonb;
  v_pub_md5 text;
  v_found int;
BEGIN
  SELECT id, store_config_rev, store_config_v2_draft, md5(store_config_v2::text)
    INTO v_tenant_id, v_rev, v_draft, v_pub_md5
    FROM public.tenants
   WHERE slug = c_slug
     FOR UPDATE;
  IF NOT FOUND OR v_draft IS NULL THEN
    RAISE NOTICE 'pdp redesign 1h: no tenant % with a draft, nothing written', c_slug;
    RETURN;
  END IF;

  SELECT count(*) INTO v_found
    FROM jsonb_to_recordset(c_edits) AS e(page text, id text)
   WHERE EXISTS (
     SELECT 1
       FROM jsonb_array_elements(v_draft->'pages') AS pg(page),
            jsonb_array_elements(pg.page->'sections') AS s(sec)
      WHERE pg.page->>'page_id' = e.page AND s.sec->>'id' = e.id
   );
  IF v_found <> jsonb_array_length(c_edits) THEN
    RAISE NOTICE 'pdp redesign 1h: % of % sections found, nothing written', v_found, jsonb_array_length(c_edits);
    RETURN;
  END IF;

  -- The transform. tmp/pdp-1h/dryrun-1h.sql runs this same expression as
  -- a SELECT over the live row.
  SELECT jsonb_set(v_draft, '{pages}', (
           SELECT jsonb_agg(
                    CASE WHEN pg.page->>'page_id' IN (SELECT x.page FROM jsonb_to_recordset(c_edits) AS x(page text))
                      THEN jsonb_set(pg.page, '{sections}', (
                             SELECT jsonb_agg(
                                      CASE WHEN e.id IS NULL THEN s.sec
                                        ELSE jsonb_set(
                                               CASE WHEN e.enabled IS NULL THEN s.sec
                                                 ELSE jsonb_set(s.sec, '{enabled}', to_jsonb(e.enabled)) END,
                                               '{base}',
                                               (coalesce(s.sec->'base', '{}'::jsonb) || e.patch)
                                                 - coalesce(e.remove, '{}'::text[]))
                                      END
                                      ORDER BY s.ord)
                               FROM jsonb_array_elements(pg.page->'sections') WITH ORDINALITY AS s(sec, ord)
                               LEFT JOIN jsonb_to_recordset(c_edits)
                                      AS e(page text, id text, patch jsonb, remove text[], enabled boolean)
                                 ON e.page = pg.page->>'page_id' AND e.id = s.sec->>'id'))
                      ELSE pg.page
                    END
                    ORDER BY pg.ord)
             FROM jsonb_array_elements(v_draft->'pages') WITH ORDINALITY AS pg(page, ord)))
    INTO v_target;

  IF v_target = v_draft THEN
    RAISE NOTICE 'pdp redesign 1h: already applied, nothing written';
    RETURN;
  END IF;

  IF md5(v_draft::text) <> c_expected_draft_md5 THEN
    RAISE EXCEPTION 'pdp redesign 1h: draft md5 is %, expected % (edited since it was read); re-read and regenerate',
      md5(v_draft::text), c_expected_draft_md5;
  END IF;
  IF v_rev <> c_expected_rev THEN
    RAISE EXCEPTION 'pdp redesign 1h: store_config_rev is %, expected % (published since it was read); re-read and regenerate',
      v_rev, c_expected_rev;
  END IF;

  UPDATE public.tenants
     SET store_config_v2_draft = v_target,
         updated_at = now()
   WHERE id = v_tenant_id;

  IF (SELECT md5(store_config_v2::text) FROM public.tenants WHERE id = v_tenant_id) <> v_pub_md5 THEN
    RAISE EXCEPTION 'pdp redesign 1h: the published config changed during the write';
  END IF;

  RAISE NOTICE 'pdp redesign 1h: draft md5 % -> %', c_expected_draft_md5, md5(v_target::text);
END
$mig$;
```

What is in it, for the reviewer: eight edits, no PDP key, no header key. Only the three listed pages are rebuilt; every other page and every non-`pages` key is copied as is (the replay checks both md5s). `enabled` is set only where the edit names it. The `||` merge keeps every other base key (`show_thumbnails`, `payment_methods`, the steps…). The cart trust strip's `pills` array is replaced as a whole, which is what `||` does to an array.

- [ ] **Step 3: Copy the live row read-only and install PGlite outside the repo**

```bash
mkdir -p "${TMPDIR:-/tmp}/pdp-1h-pglite"
(cd packages && supabase db query --linked "SELECT store_config_v2_draft::text AS draft, store_config_v2::text AS pub FROM tenants WHERE slug='scheniders-iraq'" -o json) > "${TMPDIR:-/tmp}/pdp-1h-pglite/live.json"
cd "${TMPDIR:-/tmp}/pdp-1h-pglite"
node -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync("live.json"));const r=(j.rows||j)[0];fs.writeFileSync("draft.json",r.draft);fs.writeFileSync("pub.json",r.pub);console.log(r.draft.length, r.pub.length)'
echo '{"name":"pdp-1h-pglite","private":true,"type":"module"}' > package.json
pnpm add @electric-sql/pglite@0.2.17
cd /Users/ali/scheniders-mono-pdp-1h
```
Expected: `70302 60860` (2026-10-30), then `+ @electric-sql/pglite 0.2.17`.

- [ ] **Step 4: Write the replay harness**

Create `${TMPDIR:-/tmp}/pdp-1h-pglite/harness-draft.mjs`:

```js
// Replays the 1h draft-config migration against a local Postgres (PGlite)
// loaded with a read-only copy of the live scheniders-iraq row.
// usage: node harness-draft.mjs <migration.sql> <draft.json> <pub.json> <rev>
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const [file, draftPath, pubPath, revArg] = process.argv.slice(2);
const sql = readFileSync(file, "utf8");
const draft = readFileSync(draftPath, "utf8");
const pub = readFileSync(pubPath, "utf8");
const REV = Number(revArg);

async function db(withRow, { rev = REV, editDraft = false, dropSection = false } = {}) {
  const pg = new PGlite();
  await pg.exec(`CREATE TABLE public.tenants (
    id uuid PRIMARY KEY, slug text UNIQUE NOT NULL, store_config_rev bigint NOT NULL DEFAULT 0,
    store_config_v2 jsonb, store_config_v2_draft jsonb, updated_at timestamptz NOT NULL DEFAULT now())`);
  if (withRow) {
    await pg.query(
      `INSERT INTO public.tenants (id, slug, store_config_rev, store_config_v2, store_config_v2_draft, updated_at)
       VALUES ('b5c4f2d4-834f-4af4-822d-9b9826a8f45a', 'scheniders-iraq', $1, $2::jsonb, $3::jsonb, '2026-10-29T21:27:39Z')`,
      [rev, pub, draft],
    );
    if (editDraft) {
      await pg.exec(`UPDATE public.tenants SET store_config_v2_draft = jsonb_set(store_config_v2_draft, '{default_locale}', '"en"')`);
    }
    if (dropSection) {
      // The checkout page without its trust strip: one listed section gone.
      await pg.exec(`UPDATE public.tenants SET store_config_v2_draft = jsonb_set(store_config_v2_draft, '{pages}', (
        SELECT jsonb_agg(CASE WHEN p->>'page_id' = 'checkout'
          THEN jsonb_set(p, '{sections}', (SELECT jsonb_agg(s) FROM jsonb_array_elements(p->'sections') s WHERE s->>'id' <> '4d0bc827-8914-4505-b018-10edaef38130'))
          ELSE p END ORDER BY o)
        FROM jsonb_array_elements(store_config_v2_draft->'pages') WITH ORDINALITY AS x(p, o)))`);
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
    await pg.exec(sql, { onNotice: (n) => n.message.startsWith("pdp redesign 1h") && notices.push(n.message) });
    console.log(`${label}: ok`, JSON.stringify(notices.splice(0)));
  } catch (e) {
    console.log(`${label}: ERROR ${e.message}`);
  }
}

/** Per page: the page md5, and per section: type, enabled, base md5. */
const SUMMARY = `
  SELECT p.page->>'page_id' AS page, md5(p.page::text) AS page_md5,
         (SELECT string_agg(concat(s.sec->>'type', ':', coalesce(s.sec->>'enabled', '-'), ':', s.sec->'base'->>'style'), ',' ORDER BY s.ord)
            FROM jsonb_array_elements(p.page->'sections') WITH ORDINALITY s(sec, ord)) AS sections
    FROM public.tenants t, jsonb_array_elements(t.store_config_v2_draft->'pages') p(page)
   WHERE p.page->>'page_id' IN ('product', 'cart', 'checkout', 'checkout_success')
   ORDER BY 1`;
const OTHER = `SELECT md5((SELECT jsonb_agg(p.page ORDER BY o) FROM jsonb_array_elements(store_config_v2_draft->'pages') WITH ORDINALITY x(page, o)
  CROSS JOIN LATERAL (SELECT x.page AS page) p WHERE x.page->>'page_id' NOT IN ('cart', 'checkout', 'checkout_success'))::text) AS other_pages,
  md5((store_config_v2_draft - 'pages')::text) AS rest FROM public.tenants`;

{
  const { pg, notices } = await db(true);
  console.log("before", JSON.stringify(await md5s(pg)));
  console.log("other before", JSON.stringify((await pg.query(OTHER)).rows[0]));
  for (const r of (await pg.query(SUMMARY)).rows) console.log("before", JSON.stringify(r));
  await run("first run", pg, notices);
  console.log("after first", JSON.stringify(await md5s(pg)));
  console.log("other after", JSON.stringify((await pg.query(OTHER)).rows[0]));
  for (const r of (await pg.query(SUMMARY)).rows) console.log("after", JSON.stringify(r));
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
  const { pg, notices } = await db(true, { dropSection: true });
  await run("section missing", pg, notices);
}
{
  const { pg, notices } = await db(false);
  await run("empty database", pg, notices);
}
```

- [ ] **Step 5: Replay (first run, second run, edited draft, published since, a section missing, empty database)**

```bash
node "${TMPDIR:-/tmp}/pdp-1h-pglite/harness-draft.mjs" "packages/supabase/migrations/${STAMP}_scheniders_iraq_pdp_redesign_1h_draft.sql" "${TMPDIR:-/tmp}/pdp-1h-pglite/draft.json" "${TMPDIR:-/tmp}/pdp-1h-pglite/pub.json" 38
```
Expected (pre-run 2026-10-30 on the live row):
```
before {"d":"aa676deb050743aef4cfec1511a73361","p":"a6f87ba3181b0e94f41ba4a700de257b","bumped":false}
other before {"other_pages":"94e7849b71899272f8daa7c69e8313a7","rest":"04d9b9f1779fa072614bfacf57f4fbe6"}
before {"page":"cart","page_md5":"aeb2219efbc9ab502731585a7da9dc5d","sections":"cart_line_items:true:,cart_summary:true:,trust_strip:true:,sticky_cta_bar:true:"}
before {"page":"checkout","page_md5":"a80eb7485fdc2cafa1949608b7f2da2f","sections":"checkout_form:true:,checkout_order_summary:true:,trust_strip:true:"}
before {"page":"checkout_success","page_md5":"f2f496976cb5bda8689a1e589b21f097","sections":"order_confirmation:true:,product_grid:true:"}
before {"page":"product","page_md5":"41e7602aad92a289fd7c68812a70a871","sections":"pdp_direct_order:true:,image_gallery:true:,product_reviews:true:,accordion_richtext:true:,faq_contact_split:true:,product_grid:false:,trust_badge_row:false:,sticky_cta_bar:true:soft"}
first run: ok ["pdp redesign 1h: draft md5 aa676deb050743aef4cfec1511a73361 -> d6cac00b09a850d6f2a365d75e065459"]
after first {"d":"d6cac00b09a850d6f2a365d75e065459","p":"a6f87ba3181b0e94f41ba4a700de257b","bumped":true}
other after {"other_pages":"94e7849b71899272f8daa7c69e8313a7","rest":"04d9b9f1779fa072614bfacf57f4fbe6"}
after {"page":"cart","page_md5":"29440418eeac444487d89dffb72ec07f","sections":"cart_line_items:true:soft,cart_summary:true:soft,trust_strip:true:soft,sticky_cta_bar:false:"}
after {"page":"checkout","page_md5":"c9f73f829496f9ef0c3d15fc09c4f05a","sections":"checkout_form:true:soft,checkout_order_summary:true:soft,trust_strip:false:"}
after {"page":"checkout_success","page_md5":"1c8a67656f4c41012cec7be6fa345308","sections":"order_confirmation:true:soft,product_grid:true:"}
after {"page":"product","page_md5":"41e7602aad92a289fd7c68812a70a871","sections":"pdp_direct_order:true:,image_gallery:true:,product_reviews:true:,accordion_richtext:true:,faq_contact_split:true:,product_grid:false:,trust_badge_row:false:,sticky_cta_bar:true:soft"}
second run: ok ["pdp redesign 1h: already applied, nothing written"]
after second {"d":"d6cac00b09a850d6f2a365d75e065459","p":"a6f87ba3181b0e94f41ba4a700de257b","bumped":true}
edited draft: ERROR pdp redesign 1h: draft md5 is 14157beba17d4373ed588219ba48332d, expected aa676deb050743aef4cfec1511a73361 (edited since it was read); re-read and regenerate
edited draft state {"d":"14157beba17d4373ed588219ba48332d","p":"a6f87ba3181b0e94f41ba4a700de257b","bumped":false}
published since: ERROR pdp redesign 1h: store_config_rev is 39, expected 38 (published since it was read); re-read and regenerate
section missing: ok ["pdp redesign 1h: 7 of 8 sections found, nothing written"]
empty database: ok ["pdp redesign 1h: no tenant scheniders-iraq with a draft, nothing written"]
```
This covers §1.10's data checks: the published md5 never moves; every page other than the three, and every non-`pages` key, is byte-identical (`other_pages`, `rest`, the product page md5); `updated_at` is bumped only by a real write; a second run is a no-op; an edited draft or a publish since the read aborts; a missing section or an empty database is a no-op. If Task 0 pinned other values the md5s differ, but the pattern must not.

- [ ] **Step 6: Dry run on the live row (a SELECT, writes nothing)**

```bash
mkdir -p tmp/pdp-1h
```
Create `tmp/pdp-1h/dryrun-1h.sql`:

```sql
-- Read-only dry run of <STAMP>_scheniders_iraq_pdp_redesign_1h_draft.sql:
-- the migration's transform as a SELECT over the live row. Writes nothing.
WITH c AS (
  SELECT $json$[
    {"page": "cart", "id": "2e4337a4-87ae-478d-98b6-5f361a404562", "patch": {"style": "soft"}},
    {"page": "cart", "id": "e5dbfa28-5c29-4f8b-810a-b5fe2baf1d2c", "patch": {
      "style": "soft",
      "checkout_label_i18n": {"ar": "كمّل طلبك", "en": "Finish your order"}
    }},
    {"page": "cart", "id": "78babd62-1484-48f1-8ed9-90e4fbc198a2", "patch": {
      "style": "soft",
      "pills": [
        {"bg": "mint", "icon": "payments", "label_i18n": {"ar": "الدفع عند الاستلام", "en": "Cash on delivery"}},
        {"bg": "sky", "icon": "visibility", "label_i18n": {"ar": "تفتح وتجرّب قبل لا تدفع", "en": "Open it and try it before you pay"}},
        {"bg": "lilac", "icon": "undo", "label_i18n": {
          "ar": "ما عجبك؟ ترفضه قدام المندوب أو ترجّعه خلال أسبوع",
          "en": "Don't like it? Refuse it in front of the courier, or return it within a week."
        }}
      ]
    }},
    {"page": "cart", "id": "aee18fed-e7c6-4f3f-8257-9f1a60fb4a3c", "patch": {}, "enabled": false},
    {"page": "checkout", "id": "561f48cc-7a08-4a8e-bb9f-b76a4ad8c26a", "patch": {
      "style": "soft",
      "submit_label_i18n": {"ar": "ثبّت طلبي", "en": "Place my order"},
      "reassurance_text_i18n": {
        "ar": "تفتح وتجرّب قبل لا تدفع — ما عجبك؟ ترفضه قدام المندوب أو ترجّعه خلال أسبوع",
        "en": "Open it and try it before you pay. Don't like it? Refuse it in front of the courier, or return it within a week."
      }
    }},
    {"page": "checkout", "id": "10bbe359-3565-43f7-883a-da6607379b87", "patch": {"style": "soft"}, "remove": ["cod_note_i18n"]},
    {"page": "checkout", "id": "4d0bc827-8914-4505-b018-10edaef38130", "patch": {}, "enabled": false},
    {"page": "checkout_success", "id": "59bfb096-e8ab-4503-b2ab-def24113ec07", "patch": {
      "style": "soft",
      "eta_i18n": {"ar": "أغلب الطلبات توصل خلال 24 ساعة من تثبيت الطلب", "en": "Most orders arrive within 24 hours of confirmation"},
      "whatsapp_label_i18n": {"ar": "راسلنا واتساب", "en": "Message us on WhatsApp"}
    }}
  ]$json$::jsonb AS edits
),
t AS (
  SELECT store_config_rev AS rev, store_config_v2_draft AS draft
    FROM public.tenants WHERE slug = 'scheniders-iraq'
),
found AS (
  SELECT count(*) AS n
    FROM c, t, jsonb_to_recordset(c.edits) AS e(page text, id text)
   WHERE EXISTS (
     SELECT 1
       FROM jsonb_array_elements(t.draft->'pages') AS pg(page),
            jsonb_array_elements(pg.page->'sections') AS s(sec)
      WHERE pg.page->>'page_id' = e.page AND s.sec->>'id' = e.id
   )
),
target AS (
  SELECT jsonb_set(t.draft, '{pages}', (
           SELECT jsonb_agg(
                    CASE WHEN pg.page->>'page_id' IN (SELECT x.page FROM jsonb_to_recordset(c.edits) AS x(page text))
                      THEN jsonb_set(pg.page, '{sections}', (
                             SELECT jsonb_agg(
                                      CASE WHEN e.id IS NULL THEN s.sec
                                        ELSE jsonb_set(
                                               CASE WHEN e.enabled IS NULL THEN s.sec
                                                 ELSE jsonb_set(s.sec, '{enabled}', to_jsonb(e.enabled)) END,
                                               '{base}',
                                               (coalesce(s.sec->'base', '{}'::jsonb) || e.patch)
                                                 - coalesce(e.remove, '{}'::text[]))
                                      END
                                      ORDER BY s.ord)
                               FROM jsonb_array_elements(pg.page->'sections') WITH ORDINALITY AS s(sec, ord)
                               LEFT JOIN jsonb_to_recordset(c.edits)
                                      AS e(page text, id text, patch jsonb, remove text[], enabled boolean)
                                 ON e.page = pg.page->>'page_id' AND e.id = s.sec->>'id'))
                      ELSE pg.page
                    END
                    ORDER BY pg.ord)
             FROM jsonb_array_elements(t.draft->'pages') WITH ORDINALITY AS pg(page, ord))) AS draft
    FROM c, t
)
SELECT
  t.rev = 38 AS rev_ok,
  md5(t.draft::text) = 'aa676deb050743aef4cfec1511a73361' AS draft_md5_ok,
  found.n = jsonb_array_length(c.edits) AS sections_found,
  md5(target.draft::text) AS target_md5
FROM c, t, found, target;
```
```bash
grep -ciE "\b(update|insert|delete|alter|drop|create)\b" tmp/pdp-1h/dryrun-1h.sql
(cd packages && supabase db query --linked -f ../tmp/pdp-1h/dryrun-1h.sql -o csv)
```
Expected: `0`, then:
```
rev_ok,draft_md5_ok,sections_found,target_md5
true,true,true,d6cac00b09a850d6f2a365d75e065459
```
`target_md5` equals the replay's `after first` (pre-run live, 2026-10-30).

- [ ] **Step 7: Commit the migration (not applied)**

```bash
git branch --show-current
git add "packages/supabase/migrations/${STAMP}_scheniders_iraq_pdp_redesign_1h_draft.sql"
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "chore(db): scheniders-iraq PDP redesign 1h draft config (not applied)" -m "Cart, checkout and thank-you go soft; «كمّل طلبك» / «ثبّت طلبي» / «راسلنا واتساب»; the band's promise in its words; the cart sticky bar and the checkout trust strip off; the checkout COD note removed; the thank-you ETA = the PDP's delivery claim. Draft only, guarded on draft md5 aa676deb… and store_config_rev 38; applied with supabase db query --linked -f only after the code is live." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Redesign fixtures carry 1h; the mirror; the draft's three pages rendered

**Files:**
- Modify: `packages/sections/src/_pdp-redesign-fixtures.ts`, `packages/sections/src/_pdp-redesign-snapshot.test.tsx`
- Create: `packages/sections/src/_cart-checkout-redesign.test.tsx` (+ `.snap`, written once)

`_pdp-redesign-fixtures.ts` is what the F12 tenant lint reads, so the 1h Arabic goes there and is linted. The `IRAQ_REDESIGN_*` merged inputs are skipped by name, as before.

- [ ] **Step 1: Add the 1h data to the fixtures**

In `packages/sections/src/_pdp-redesign-fixtures.ts`, replace:
```ts
import { EXPRESS_IRAQ_DRAFT_PDP_PROPS, IRAQ_DRAFT_STICKY_PROPS, fixtureTenant } from "./_pdp-fixtures";
```
with:
```ts
import { EXPRESS_IRAQ_DRAFT_PDP_PROPS, IRAQ_DRAFT_STICKY_PROPS, fixtureTenant } from "./_pdp-fixtures";
import {
  IRAQ_DRAFT_CART_LINES_BASE,
  IRAQ_DRAFT_CART_SUMMARY_BASE,
  IRAQ_DRAFT_CHECKOUT_FORM_BASE,
  IRAQ_DRAFT_CONFIRMATION_BASE,
  IRAQ_DRAFT_ORDER_SUMMARY_BASE,
  IRAQ_DRAFT_TRUST_BASE,
} from "./_cart-checkout-fixtures";
```
Append to the end of the file:
```ts
// ── Slice 1h: cart, checkout and thank-you in the redesign's voice ──────

/** The first clause of the band's row 1 (1b `reassurance_i18n`, before
 *  « — والتيستر هدية وياه», which is about the product page's own tester):
 *  the promise the cart and checkout quote. A test pins it to 1b. */
export const BAND_TRY_FIRST = { ar: "تفتح وتجرّب قبل لا تدفع", en: "Open it and try it before you pay" } as const;

/** One draft edit of slice 1h: merge `patch` into the section's base
 *  (`||`), drop the `remove` keys (`-`), and set `enabled` when given. */
export interface DraftSectionEdit {
  page: "cart" | "checkout" | "checkout_success";
  id: string;
  patch: Record<string, unknown>;
  remove?: string[];
  enabled?: boolean;
}

/** Cart lines: the soft list. */
export const SLICE_1H_CART_LINES_PATCH = { style: "soft" } as const;

/** Cart summary: the soft receipt, and the way on named «كمّل طلبك»
 *  (COPY_ACTIONS.continueOrder, the sticky bar's words). */
export const SLICE_1H_CART_SUMMARY_PATCH = {
  style: "soft",
  checkout_label_i18n: { ar: "كمّل طلبك", en: "Finish your order" },
} as const;

/** Cart trust strip: the soft grid with the band's own words. Free
 *  delivery is not a pill: the receipt's «التوصيل: مجاني» row says it. */
export const SLICE_1H_CART_TRUST_PATCH = {
  style: "soft",
  pills: [
    { bg: "mint", icon: "payments", label_i18n: { ar: "الدفع عند الاستلام", en: "Cash on delivery" } },
    { bg: "sky", icon: "visibility", label_i18n: BAND_TRY_FIRST },
    { bg: "lilac", icon: "undo", label_i18n: SLICE_1B_PDP_PATCH.return_promise_i18n },
  ],
} as const;

/** Checkout form: soft, the order action named «ثبّت طلبي» as on the
 *  product page, and the band's promise beside it in the band's words. */
export const SLICE_1H_CHECKOUT_FORM_PATCH = {
  style: "soft",
  submit_label_i18n: EXPRESS_IRAQ_DRAFT_PDP_PROPS.submit_label_i18n,
  reassurance_text_i18n: {
    ar: `${BAND_TRY_FIRST.ar} — ${SLICE_1B_PDP_PATCH.return_promise_i18n.ar}`,
    en: `${BAND_TRY_FIRST.en}. ${SLICE_1B_PDP_PATCH.return_promise_i18n.en}`,
  },
} as const;

/** Checkout summary: soft; its COD note goes (the form's payment row and
 *  promise line already say it). */
export const SLICE_1H_ORDER_SUMMARY_PATCH = { style: "soft" } as const;
export const SLICE_1H_ORDER_SUMMARY_REMOVE = ["cod_note_i18n"] as const;

/** Thank-you: soft; the ETA is the product page's one delivery claim
 *  (Latin digits, D5); WhatsApp is «راسلنا واتساب» (COPY_ACTIONS.whatsapp). */
export const SLICE_1H_CONFIRMATION_PATCH = {
  style: "soft",
  eta_i18n: SLICE_1B_PDP_PATCH.delivery_sla_i18n,
  whatsapp_label_i18n: { ar: "راسلنا واتساب", en: "Message us on WhatsApp" },
} as const;

/** Every edit of the 1h draft migration, in its order. The cart sticky
 *  bar and the checkout trust strip are switched off (enabled false). */
export const SLICE_1H_EDITS: DraftSectionEdit[] = [
  { page: "cart", id: "2e4337a4-87ae-478d-98b6-5f361a404562", patch: SLICE_1H_CART_LINES_PATCH },
  { page: "cart", id: "e5dbfa28-5c29-4f8b-810a-b5fe2baf1d2c", patch: SLICE_1H_CART_SUMMARY_PATCH },
  { page: "cart", id: "78babd62-1484-48f1-8ed9-90e4fbc198a2", patch: SLICE_1H_CART_TRUST_PATCH },
  { page: "cart", id: "aee18fed-e7c6-4f3f-8257-9f1a60fb4a3c", patch: {}, enabled: false },
  { page: "checkout", id: "561f48cc-7a08-4a8e-bb9f-b76a4ad8c26a", patch: SLICE_1H_CHECKOUT_FORM_PATCH },
  {
    page: "checkout",
    id: "10bbe359-3565-43f7-883a-da6607379b87",
    patch: SLICE_1H_ORDER_SUMMARY_PATCH,
    remove: [...SLICE_1H_ORDER_SUMMARY_REMOVE],
  },
  { page: "checkout", id: "4d0bc827-8914-4505-b018-10edaef38130", patch: {}, enabled: false },
  { page: "checkout_success", id: "59bfb096-e8ab-4503-b2ab-def24113ec07", patch: SLICE_1H_CONFIRMATION_PATCH },
];

/** The draft sections after slice 1h (unparsed, as stored). */
export const IRAQ_REDESIGN_CART_LINES_INPUT = jsonbMerge(IRAQ_DRAFT_CART_LINES_BASE, SLICE_1H_CART_LINES_PATCH);
export const IRAQ_REDESIGN_CART_SUMMARY_INPUT = jsonbMerge(IRAQ_DRAFT_CART_SUMMARY_BASE, SLICE_1H_CART_SUMMARY_PATCH);
export const IRAQ_REDESIGN_CART_TRUST_INPUT = jsonbMerge(IRAQ_DRAFT_TRUST_BASE, SLICE_1H_CART_TRUST_PATCH);
export const IRAQ_REDESIGN_CHECKOUT_FORM_INPUT = jsonbMerge(IRAQ_DRAFT_CHECKOUT_FORM_BASE, SLICE_1H_CHECKOUT_FORM_PATCH);
export const IRAQ_REDESIGN_ORDER_SUMMARY_INPUT = jsonbMerge(
  IRAQ_DRAFT_ORDER_SUMMARY_BASE,
  SLICE_1H_ORDER_SUMMARY_PATCH,
  SLICE_1H_ORDER_SUMMARY_REMOVE,
);
export const IRAQ_REDESIGN_CONFIRMATION_INPUT = jsonbMerge(IRAQ_DRAFT_CONFIRMATION_BASE, SLICE_1H_CONFIRMATION_PATCH);
```

- [ ] **Step 2: The mirror test (node environment, reads the migration)**

In `packages/sections/src/_pdp-redesign-snapshot.test.tsx`, replace:
```ts
  SLICE_1G_PDP_PATCH,
} from "./_pdp-redesign-fixtures";
```
with:
```ts
  SLICE_1G_PDP_PATCH,
  SLICE_1H_EDITS,
} from "./_pdp-redesign-fixtures";
```
and replace:
```ts
  it("the patched props satisfy the schema unchanged", () => {
```
with:
```ts
  it("slice 1h edits: cart, checkout and thank-you sections", () => {
    const sql1h = migrationSql("scheniders_iraq_pdp_redesign_1h_draft");
    expect(migrationJson(sql1h, "edits")).toEqual(SLICE_1H_EDITS);
  });

  it("the patched props satisfy the schema unchanged", () => {
```
```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-redesign-snapshot.test.tsx packages/sections/src/_arabic-copy-lint.test.ts
```
Expected: `Tests  46 passed (46)` for the redesign snapshot (45 + the mirror; no snapshot written or updated), and the lint green: the 1h Arabic («كمّل طلبك», «ثبّت طلبي», «راسلنا واتساب», the band clauses, «الدفع عند الاستلام») breaks no tenant rule.

- [ ] **Step 3: The redesign renders**

Create `packages/sections/src/_cart-checkout-redesign.test.tsx`:

```tsx
// @vitest-environment jsdom
// =====================================================================
// Cart, checkout and thank-you — redesign draft (slice 1h)
// =====================================================================
// scheniders-iraq's draft after the 1h migration (the fixtures; the
// migration's own `edits` list is checked against them in
// _pdp-redesign-snapshot.test.tsx, where the file is read), rendered in
// the browser page by page, ar and en: the soft cart list, receipt and
// trust tiles; the soft checkout form and summary; the soft thank-you.
// The renders hold the colour lock and one name per action along the
// path.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import cart_line_items from "./cart_line_items";
import cart_summary from "./cart_summary";
import checkout_form from "./checkout_form";
import checkout_order_summary from "./checkout_order_summary";
import order_confirmation from "./order_confirmation";
import trust_strip from "./trust_strip";
import { COPY_ACTIONS } from "./_copy-terms";
import { EXPRESS_STASH, IRAQ_CART, pageCtx } from "./_cart-checkout-fixtures";
import { expectSoftRules, html, mountInStore, withCart } from "./_cart-checkout-test-utils";
import { FIXTURE_NOW } from "./_pdp-fixtures";
import {
  BAND_TRY_FIRST,
  IRAQ_REDESIGN_CART_LINES_INPUT,
  IRAQ_REDESIGN_CART_SUMMARY_INPUT,
  IRAQ_REDESIGN_CART_TRUST_INPUT,
  IRAQ_REDESIGN_CHECKOUT_FORM_INPUT,
  IRAQ_REDESIGN_CONFIRMATION_INPUT,
  IRAQ_REDESIGN_ORDER_SUMMARY_INPUT,
  SLICE_1B_PDP_PATCH,
  SLICE_1H_CART_SUMMARY_PATCH,
  SLICE_1H_CHECKOUT_FORM_PATCH,
  SLICE_1H_CONFIRMATION_PATCH,
} from "./_pdp-redesign-fixtures";

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}"))));
  vi.stubGlobal("fbq", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  withCart([]);
});

const LOCALES = ["ar", "en"] as const;

describe("1h fixtures", () => {
  it("every 1h section parses to exactly what is stored", () => {
    expect(cart_line_items.schema.parse(IRAQ_REDESIGN_CART_LINES_INPUT)).toEqual(IRAQ_REDESIGN_CART_LINES_INPUT);
    expect(cart_summary.schema.parse(IRAQ_REDESIGN_CART_SUMMARY_INPUT)).toEqual(IRAQ_REDESIGN_CART_SUMMARY_INPUT);
    expect(trust_strip.schema.parse(IRAQ_REDESIGN_CART_TRUST_INPUT)).toEqual(IRAQ_REDESIGN_CART_TRUST_INPUT);
    expect(checkout_form.schema.parse(IRAQ_REDESIGN_CHECKOUT_FORM_INPUT)).toEqual(IRAQ_REDESIGN_CHECKOUT_FORM_INPUT);
    expect(checkout_order_summary.schema.parse(IRAQ_REDESIGN_ORDER_SUMMARY_INPUT)).toEqual(
      IRAQ_REDESIGN_ORDER_SUMMARY_INPUT,
    );
    expect(order_confirmation.schema.parse(IRAQ_REDESIGN_CONFIRMATION_INPUT)).toEqual(IRAQ_REDESIGN_CONFIRMATION_INPUT);
  });

  it("the cart and checkout quote the product page's promise in its words; one delivery claim", () => {
    expect(SLICE_1B_PDP_PATCH.reassurance_i18n.ar.startsWith(`${BAND_TRY_FIRST.ar} — `)).toBe(true);
    expect(SLICE_1H_CHECKOUT_FORM_PATCH.reassurance_text_i18n.ar).toBe(
      `${BAND_TRY_FIRST.ar} — ${SLICE_1B_PDP_PATCH.return_promise_i18n.ar}`,
    );
    expect(SLICE_1H_CONFIRMATION_PATCH.eta_i18n).toEqual(SLICE_1B_PDP_PATCH.delivery_sla_i18n);
    expect(IRAQ_REDESIGN_ORDER_SUMMARY_INPUT).not.toHaveProperty("cod_note_i18n");
  });

  it("one name per action along the path", () => {
    expect(SLICE_1H_CART_SUMMARY_PATCH.checkout_label_i18n.ar).toBe(COPY_ACTIONS.continueOrder);
    expect(SLICE_1H_CHECKOUT_FORM_PATCH.submit_label_i18n.ar).toBe(COPY_ACTIONS.placeOrder);
    expect(SLICE_1H_CONFIRMATION_PATCH.whatsapp_label_i18n.ar).toBe(COPY_ACTIONS.whatsapp);
  });
});

function cartPage(locale: (typeof LOCALES)[number]): HTMLElement {
  withCart(IRAQ_CART);
  const Lines = cart_line_items.render;
  const Summary = cart_summary.render;
  const Strip = trust_strip.render;
  const ctx = pageCtx("cart", locale);
  return mountInStore(
    <>
      <Lines props={cart_line_items.schema.parse(IRAQ_REDESIGN_CART_LINES_INPUT)} ctx={ctx} />
      <Summary props={cart_summary.schema.parse(IRAQ_REDESIGN_CART_SUMMARY_INPUT)} ctx={ctx} />
      <Strip props={trust_strip.schema.parse(IRAQ_REDESIGN_CART_TRUST_INPUT)} ctx={ctx} />
    </>,
  ).container;
}

function checkoutPage(locale: (typeof LOCALES)[number]): HTMLElement {
  withCart(IRAQ_CART);
  const Form = checkout_form.render;
  const Summary = checkout_order_summary.render;
  const ctx = pageCtx("checkout", locale);
  return mountInStore(
    <>
      <Form props={checkout_form.schema.parse(IRAQ_REDESIGN_CHECKOUT_FORM_INPUT)} ctx={ctx} />
      <Summary props={checkout_order_summary.schema.parse(IRAQ_REDESIGN_ORDER_SUMMARY_INPUT)} ctx={ctx} />
    </>,
  ).container;
}

function thankYouPage(locale: (typeof LOCALES)[number]): HTMLElement {
  vi.useFakeTimers({ toFake: ["Date"], now: FIXTURE_NOW });
  window.sessionStorage.setItem(
    "schn:last-order",
    JSON.stringify({ ...EXPRESS_STASH, items: [{ ...EXPRESS_STASH.items[0], display_name: "ويفر انتنس" }] }),
  );
  const Confirmation = order_confirmation.render;
  return mountInStore(
    <Confirmation
      props={order_confirmation.schema.parse(IRAQ_REDESIGN_CONFIRMATION_INPUT)}
      ctx={pageCtx("checkout_success", locale, undefined, "SH-0001")}
    />,
  ).container;
}

describe("cart page — redesign draft", () => {
  it.each(LOCALES)("cart lines, summary and trust tiles, %s", (locale) => {
    expect(html(cartPage(locale))).toMatchSnapshot();
  });

  it("«كمّل طلبك» is the page's one yellow fill; «اطلب عبر واتساب»; three trust tiles", () => {
    const page = cartPage("ar");
    expectSoftRules(page.innerHTML, 1);
    expect(page.querySelector('a[href="/s/fixture-store/checkout"]')?.textContent).toBe("كمّل طلبكarrow_back");
    expect(page.querySelector("[data-soft-whatsapp]")?.textContent).toBe(COPY_ACTIONS.orderOnWhatsapp);
    expect([...page.querySelectorAll("[data-trust-style] li")].map((li) => li.textContent)).toEqual([
      "paymentsالدفع عند الاستلام",
      "visibilityتفتح وتجرّب قبل لا تدفع",
      "undoما عجبك؟ ترفضه قدام المندوب أو ترجّعه خلال أسبوع",
    ]);
  });
});

describe("checkout page — redesign draft", () => {
  it.each(LOCALES)("form and summary, %s", (locale) => {
    expect(html(checkoutPage(locale))).toMatchSnapshot();
  });

  it("«ثبّت طلبي» is the page's one yellow fill; the band's promise beside it; no COD note", () => {
    const page = checkoutPage("ar");
    expectSoftRules(page.innerHTML, 1);
    expect(page.querySelector('button[type="submit"]')?.textContent).toBe("ثبّت طلبي128,500 د.عarrow_back");
    expect(page.textContent).toContain(SLICE_1H_CHECKOUT_FORM_PATCH.reassurance_text_i18n.ar);
    expect(page.textContent).not.toContain("لا تدفع إلا بعد فحص الطلب");
  });
});

describe("thank-you — redesign draft", () => {
  it.each(LOCALES)("recap, steps, ETA and actions, %s", (locale) => {
    expect(html(thankYouPage(locale))).toMatchSnapshot();
  });

  it("the product page's name and delivery claim; «راسلنا واتساب»; Latin digits", () => {
    const page = thankYouPage("ar");
    expect(page.querySelector("[data-recap-style]")?.textContent).toContain("ويفر انتنس");
    expect(page.textContent).toContain("أغلب الطلبات توصل خلال 24 ساعة من تثبيت الطلب");
    expect(page.textContent).not.toMatch(/[٠-٩]/);
    expect(page.querySelector("[data-soft-whatsapp]")?.textContent).toBe(COPY_ACTIONS.whatsapp);
  });
});
```

- [ ] **Step 4: Write its snapshot (new file: the one permitted write), then read it**

```bash
git status --porcelain packages/sections/src/__snapshots__
pnpm exec vitest run packages/sections/src/_cart-checkout-redesign.test.tsx
CI=true pnpm exec vitest run packages/sections/src/_cart-checkout-redesign.test.tsx
f=packages/sections/src/__snapshots__/_cart-checkout-redesign.test.tsx.snap
for k in 'data-cart-style="soft"' 'data-trust-style="soft"' 'data-checkout-style="soft"' 'data-recap-style="soft"' 'data-steps-style="soft"' 'كمّل طلبك' 'ثبّت طلبي' 'اطلب عبر واتساب' 'راسلنا واتساب' 'ويفر انتنس' 'text-bk-primary' 'focus-visible:border-bk-ink' 'dir="' 'أكّد الطلب' 'متابعة الدفع' '٢٤'; do printf '%s: ' "$k"; grep -oF -- "$k" $f | wc -l | tr -d ' '; done
```
Expected: `git status` prints nothing; `Snapshots  6 written`, `Tests  12 passed (12)`; then `Tests  12 passed (12)` in CI mode. The counts, in order: `4 2 4 2 2 1 1 2 1 6 0 8 2 0 0 0`. That is: two soft cart sections per render; the soft trust tiles; the soft checkout form and summary; the soft recap and steps; «كمّل طلبك» and «ثبّت طلبي» once (ar); «اطلب عبر واتساب» on the cart and checkout (ar); «راسلنا واتساب» once (ar); «ويفر انتنس» six times (inside the long title on the cart lines and the checkout summary, plus the recap's display name, in both locales); no yellow text; ink only as the express fields' focus border (four fields × two renders); two `dir` attributes, both in the unchanged thank-you call card (one per render; the soft parts carry none, per the test's `below` check); and no «أكّد الطلب», no «متابعة الدفع», no Arabic-Indic digits.

- [ ] **Step 5: The whole sections suite, and the frozen baseline**

```bash
CI=true pnpm exec vitest run packages/sections/src
git diff --stat origin/main -- packages/sections/src/__snapshots__
```
Expected: `Test Files  159 passed (159)`, `Tests  1717 passed (1717)` (Task 0's 149 / 1631 plus 10 files and 86 tests). The diff lists exactly two **new** files, `_cart-checkout-baseline-snapshot.test.tsx.snap` and `_cart-checkout-redesign.test.tsx.snap`, and no change to any existing `.snap`. The Task 1 baseline is unchanged since its own commit: `git log --oneline -- packages/sections/src/__snapshots__/_cart-checkout-baseline-snapshot.test.tsx.snap` shows one commit.

- [ ] **Step 6: Commit (its own, reviewed snapshot commit)**

```bash
git branch --show-current
git add packages/sections/src/_pdp-redesign-fixtures.ts packages/sections/src/_pdp-redesign-snapshot.test.tsx packages/sections/src/_cart-checkout-redesign.test.tsx packages/sections/src/__snapshots__/_cart-checkout-redesign.test.tsx.snap
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "test(sections): redesign fixtures mirror the 1h draft migration; the draft cart, checkout and thank-you render soft" -m "New snapshot file only (6 renders, ar/en); every existing snapshot unchanged." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Slice verification gate, PR, merge, deploy

No new code. If a step fails, fix the root cause in the task that owns the file, commit that fix, and re-run this whole task.

- [ ] **Step 1: Every baseline, unchanged, in CI mode**

```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_pdp-classic-snapshot.test.tsx packages/sections/src/_pdp-lower-baseline-snapshot.test.tsx packages/sections/src/_pdp-scent-baseline-snapshot.test.tsx packages/sections/src/_image-gallery-baseline-snapshot.test.tsx packages/sections/src/_product-reviews-baseline-snapshot.test.tsx packages/sections/src/_product-grid-baseline-snapshot.test.tsx packages/sections/src/_chrome-baseline-snapshot.test.tsx packages/sections/src/_order-confirmation-baseline-snapshot.test.tsx packages/sections/src/_site-footer-baseline-snapshot.test.tsx packages/sections/src/_sticky-cta-baseline-snapshot.test.tsx packages/sections/src/_primitives-baseline-snapshot.test.tsx packages/sections/src/_pdp-proof-guarantee-baseline-snapshot.test.tsx packages/sections/src/_pdp-reviews-faq-baseline-snapshot.test.tsx packages/sections/src/accordion_richtext.test.tsx packages/sections/src/_site-header-overlay-baseline-snapshot.test.tsx packages/sections/src/_cart-checkout-baseline-snapshot.test.tsx
```
Expected: `Test Files  17 passed (17)`, with no `written`, `updated` or `obsolete` line (1g's 16 files plus this slice's baseline).

- [ ] **Step 2: The full suites**

```bash
CI=true pnpm exec vitest run packages/sections/src packages/shared/src apps/storefront/lib
CI=true pnpm exec vitest run apps/platform/lib/section-field-groups.test.ts apps/platform/components/store-builder-v2/auto-form-schema.test.ts
```
Expected: `Test Files  229 passed (229)`, `Tests  2702 passed (2702)` (Task 0's 219 / 2616 plus 10 / 86). Then the builder tests pass unchanged: the new enum and i18n props are classified by convention.

- [ ] **Step 3: Type gates**

Run the sections type gate: no output. Then:
```bash
pnpm --filter @scheniders/storefront type-check
pnpm --filter @scheniders/platform type-check
```
Expected: both exit 0 (pre-run green).

- [ ] **Step 4: Lint (the CI gate)**

```bash
pnpm turbo lint --filter=@scheniders/storefront --filter=@scheniders/platform
```
Expected: `Tasks:    2 successful, 2 total`; storefront `0 errors, 40 warnings`, platform `0 errors, 1083 warnings` (pre-run; the existing intentional ones).

- [ ] **Step 5: Hygiene**

```bash
cd packages/sections/src
grep -nE ":\s*any\b|<any>|\bas any\b|@ts-ignore|eslint-disable|#[0-9a-fA-F]{3,6}\b|rgba?\(|\sdir=" cart_checkout.strings.ts helpers/soft-commerce.tsx _cart-checkout-fixtures.ts _cart-checkout-test-utils.tsx
for f in cart_line_items.client.tsx cart_summary.client.tsx checkout_form.client.tsx checkout_order_summary.client.tsx order_confirmation.client.tsx trust_strip.tsx pdp_direct_order.client.tsx; do a=$(git show origin/main:packages/sections/src/$f | grep -oE '#[0-9a-fA-F]{3,6}\b|rgba?\(' | wc -l | tr -d ' '); b=$(grep -oE '#[0-9a-fA-F]{3,6}\b|rgba?\(' $f | wc -l | tr -d ' '); c=$(git show origin/main:packages/sections/src/$f | grep -c ' dir='); d=$(grep -c ' dir=' $f); echo "$f colour $a $b dir $c $d"; done
cd ../../..
git diff origin/main HEAD -- packages/sections/src ':!packages/sections/src/__snapshots__' | grep -E '^\+.*(eslint-disable|ts-ignore|:\s*any\b|<any>|\bas any\b)'
git diff origin/main HEAD -- packages/sections/src ':!packages/sections/src/__snapshots__' | grep -E '^\+' | grep -E "[A-Za-z_)\]]!\.|[A-Za-z_)\]]!;|[A-Za-z_)\]]!\)"
```
Expected: the first grep prints nothing. The loop prints equal pairs: `cart_line_items.client.tsx colour 6 6 dir 0 0`, `cart_summary.client.tsx colour 11 11 dir 0 0`, `checkout_form.client.tsx colour 20 20 dir 4 4`, `checkout_order_summary.client.tsx colour 5 5 dir 0 0`, `order_confirmation.client.tsx colour 11 11 dir 1 1`, `trust_strip.tsx colour 9 9 dir 0 0`, `pdp_direct_order.client.tsx colour 54 54 dir 7 7`. No new literal and no new `dir`: the moved default style objects keep their counts. The last two print nothing.

- [ ] **Step 6: Push and open the PR**

```bash
git branch --show-current
git status --porcelain
git log --oneline origin/main..HEAD
git push -u origin feat/pdp-p1h-cart-checkout
```
Expected: the branch is right; nothing but the ignored `tmp/`; 11 commits, from "freeze the cart, checkout and thank-you sections" to "redesign fixtures mirror the 1h draft migration".

```bash
gh pr create --base main --head feat/pdp-p1h-cart-checkout --title "PDP redesign 1h: cart, checkout and thank-you in the redesign's voice, draft migration (not applied)" --body "Plan: docs/superpowers/plans/2026-10-30-pdp-p1h-cart-checkout.md (the 1g plan's Task 11 hand-off).

- \`style: \"soft\"\` (opt-in, catch-guarded) on cart_line_items, cart_summary, trust_strip, checkout_form, checkout_order_summary, order_confirmation: hairline receipts, ink prices and totals (D4), one soft yellow order action per page (the 1f button), chapter headings, names on two lines instead of an ellipsis, Arabic rows from the right, no dir. \`chunky\`/absent = today's markup, frozen first in a new 22-render baseline.
- checkout_form \`submit_label_i18n\`: «ثبّت طلبي» names the submit and the reprice line; the request body is unchanged (test pins every key).
- The thank-you recap names the product as its page does: pdp_direct_order adds an additive display_name to the session stash.
- One name per action: «كمّل طلبك» → «ثبّت طلبي», «اطلب عبر واتساب» (COPY_ACTIONS.orderOnWhatsapp), «راسلنا واتساب».
- Draft migration for scheniders-iraq (draft only, md5 + rev guarded, idempotent): the six sections soft, the labels, the band's promise in its words, the cart sticky bar and the checkout trust strip off, the checkout COD note removed, the thank-you ETA = the PDP's delivery claim. NOT applied: applied after deploy.

Tests: sections + shared + storefront lib 229 files / 2702 tests; every existing snapshot unchanged; type-check and lint green.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 7: Merge once CI is green, then wait for production**

```bash
gh pr checks --watch
gh pr merge --merge
```
Merge as gga2000 (Vercel builds only gga2000 commits). If CI fails within 2–4s it is billing, not code: `gh run view` shows the annotation, and `gh run rerun <id>` recovers. Then confirm the production deployment of the merge commit is READY and that the production domain serves it (a Vercel rollback pins production): Vercel MCP `list_deployments` for the storefront project, or the dashboard.

---

### Task 13: Apply the 1h draft migration (after the code is live)

Only after Task 12 Step 7 shows the merge commit live in production. Applying earlier would be harmless to shoppers (draft only; old code strips the unknown keys). But the draft would lose its cart sticky bar, checkout trust strip and COD note while still drawing the chunky sections, which is a confusing draft to review.

- [ ] **Step 1: Re-check the guards and the timestamp order**

```bash
cd /Users/ali/scheniders-mono-pdp-1h
git switch feat/pdp-p1h-cart-checkout && git pull --ff-only origin main
(cd packages && supabase db query --linked "SELECT store_config_rev, md5(store_config_v2_draft::text) AS draft_md5, md5(store_config_v2::text) AS pub_md5 FROM tenants WHERE slug='scheniders-iraq'" -o csv)
(cd packages && supabase db query --linked "SELECT max(version) FROM supabase_migrations.schema_migrations" -o csv)
ls packages/supabase/migrations | grep -E '^[0-9]{14}_' | sort | tail -2
```
Expected:
- `38,aa676deb050743aef4cfec1511a73361,a6f87ba3181b0e94f41ba4a700de257b` (or the values Task 0 pinned);
- a remote max lower than this file's version;
- the last file listed is `<STAMP>_scheniders_iraq_pdp_redesign_1h_draft.sql`.

If the md5 or rev moved, stop and redo Task 10 Steps 2–6 in a follow-up PR (with Task 11's mirror test still green). If a later-stamped migration reached main or the remote history first, re-stamp with `git mv` to Task 10 Step 1's rule in a follow-up PR; the mirror test finds the file by suffix.

- [ ] **Step 2: Dry run again**

```bash
(cd packages && supabase db query --linked -f ../tmp/pdp-1h/dryrun-1h.sql -o csv)
```
Expected: `true,true,true,d6cac00b09a850d6f2a365d75e065459`.

- [ ] **Step 3: Apply**

```bash
F=$(ls packages/supabase/migrations/*_scheniders_iraq_pdp_redesign_1h_draft.sql); echo "$F"
(cd packages && supabase db query --linked -f "../$F")
```
Expected: exit 0, no rows. On `draft md5 is …` or `store_config_rev is …` nothing was written: go back to Step 1.

- [ ] **Step 4: Record it**

```bash
V=$(basename "$F" | cut -c1-14); echo "$V"
(cd packages && supabase migration repair --status applied "$V")
(cd packages && supabase db query --linked "SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '$V'" -o csv)
```
Expected: one row, `<V>,scheniders_iraq_pdp_redesign_1h_draft`.

- [ ] **Step 5: Re-read and diff against the intended result**

```bash
(cd packages && supabase db query --linked "SELECT store_config_rev, md5(store_config_v2_draft::text) AS draft_md5, md5(store_config_v2::text) AS pub_md5, updated_at > now() - interval '1 hour' AS bumped FROM tenants WHERE slug='scheniders-iraq'" -o csv)
(cd packages && supabase db query --linked "SELECT p.page->>'page_id' AS page, md5(p.page::text) AS page_md5 FROM tenants t, jsonb_array_elements(t.store_config_v2_draft->'pages') p(page) WHERE t.slug='scheniders-iraq' AND p.page->>'page_id' IN ('product','cart','checkout','checkout_success') ORDER BY 1" -o csv)
```
Expected:
- `38,d6cac00b09a850d6f2a365d75e065459,a6f87ba3181b0e94f41ba4a700de257b,true` (the draft equals the dry run's target; published unchanged);
- `cart,29440418eeac444487d89dffb72ec07f`, `checkout,c9f73f829496f9ef0c3d15fc09c4f05a`, `checkout_success,1c8a67656f4c41012cec7be6fa345308`, `product,41e7602aad92a289fd7c68812a70a871` (the PDP untouched).

- [ ] **Step 6: Clean up**

```bash
rm -rf "${TMPDIR:-/tmp}/pdp-1h-pglite"
```
Delete `tmp/pdp-1h/` after Task 14.

---

### Task 14: Draft-view checks at 390px and 360px (after Task 13), and hand-offs

- [ ] **Step 1: Run the storefront from this worktree**

The :3001 server belongs to `/Users/ali/scheniders-mono-pdp` (reviewers), so run this worktree on :3002:
```bash
cp /Users/ali/scheniders-mono/apps/storefront/.env.local apps/storefront/.env.local
(cd apps/storefront && pnpm exec next dev --port 3002)   # in its own terminal / background
```

- [ ] **Step 2: The path in a browser, 390×844 and 360×780**

Use the `agent-browser` skill or the Playwright MCP. If the MCP is wedged, the Task 5–11 jsdom tests pin the behaviour; note it and move on. Open `http://localhost:3002/api/draft-view?tenant=scheniders-iraq&token=dev-preview-token&to=/s/scheniders-iraq/products/%D9%88%D9%8A%D9%81%D8%B1`, then:
- **Add from the PDP**: step «الكمية» to 2 and tap «أضف للسلة» (1g), then «شوف السلة».
- **Cart** (`/cart`): the h1 «سلتك» at the chapter scale and «عنصران في سلتك» (`itemCountLine`'s two form). One hairline list: the photo on the right, «ويفر انتنس» (the display name), «73,500 د.ع» in ink, the stepper at the left edge. The receipt shows «المجموع الفرعي», «التوصيل مجاني» and «المجموع» in ink. **The only yellow on the page is «كمّل طلبك»** with the arrow chip, then the soft green «اطلب عبر واتساب» row, then three quiet tiles («الدفع عند الاستلام» · «تفتح وتجرّب قبل لا تدفع» on one row, the return line full width). There is no sticky bar and no sideways scroll: `document.documentElement.scrollWidth === innerWidth`. Every target is ≥44px (`[...document.querySelectorAll('main a, main button')].filter(e => e.getBoundingClientRect().height < 44)` is empty). `document.querySelectorAll('main [dir]').length === 0`. Pre-measured with the in-memory preview: «كمّل طلبك» 358×60 at 390 and 328×60 at 360.
- **Checkout** (`/checkout`): no step chips; «تفاصيل التوصيل» as h1; the express fields reading from the right; +964 and the number in one outline; the 18 governorates; the quiet COD tile with an ink check; the band's promise in ink-soft beside the eye icon. **The only yellow is «ثبّت طلبي»** with «128,500 د.ع»-style total under it (pre-measured 326×60 at 390, 296×60 at 360). Then the soft «اطلب عبر واتساب», no fine print, the soft summary with ink figures, no COD note, and no trust strip.
- **Reprice copy**: not forced live. The jsdom test pins «تحدّثت سلتك. راجعها واضغط «ثبّت طلبي» مرة ثانية.».
- **Thank-you**: **stop before «ثبّت طلبي»** unless Ali has agreed to one test order. A draft-view order is flagged `is_test`, but its insert-time staff notifications still fire (app/actions/checkout.ts:749-773). Without an order, seed the stash in the console (`sessionStorage.setItem('schn:last-order', JSON.stringify({number:'SCH-1h-0001', customer_name:'علي حسن', items:[{name:'عطر ويفر انتنس الفاخر من باريس كورنر للرجال', display_name:'ويفر انتنس', variant:null, qty:1, price:36750}], subtotal:36750, total:36750, ts:Date.now()}))`) and open `/checkout/success?order=SCH-1h-0001`. Check: the call card unchanged; «ملخّص طلبك» chapter, «ويفر انتنس × 1», the total in ink; «ماذا يحدث الآن؟» with ink step numbers; the ETA «أغلب الطلبات توصل خلال 24 ساعة من تثبيت الطلب»; the soft «راسلنا واتساب»; the quiet «تتبّع طلبك». If Ali agrees to a real order, place it from the PDP, confirm the recap names «ويفر انتنس» and the cart empties, then cancel the test order in the order book.
- Compare against the pre-run previews in `.superpowers/brainstorm/pdp-review-inputs/p1h-preview/` (rendered from this exact code with the 1h edits applied in memory).

- [ ] **Step 3: The published site is untouched**

```bash
for p in cart checkout; do curl -s "http://localhost:3002/s/scheniders-iraq/$p" | grep -c 'data-cart-style\|data-checkout-style\|data-trust-style'; done
```
Expected: `0` and `0` (no draft cookie: the published config, no soft markers; the soft sections are client components, so this checks the server shell only).

- [ ] **Step 4: Clean up**

Stop the :3002 server, then:
```bash
rm apps/storefront/.env.local
rm -rf tmp/pdp-1h
```

- [ ] **Step 5: Hand-offs**

- **Ali (sign-off, visible at publish):** the cart page without its sticky bar (scope decision 4); the checkout without its trust strip or the summary's COD note; the cart's three pills in the band's words; «كمّل طلبك» on the cart and «ثبّت طلبي» on the checkout; the thank-you's ETA now the PDP's «أغلب الطلبات توصل خلال 24 ساعة من تثبيت الطلب» (it said «خلال ٢٤ ساعة من تثبيت الطلب»; the 18h-vs-24h question from the free-delivery memo is still open); «راسلنا واتساب».
- **Ali (to-do 8, Kurdish):** the drafted Sorani of `CART_STRINGS` (`subtotal` «کۆی لاوەکی», `discount` «داشکاندن», `deliveryVaries` «بەپێی پارێزگا دەگۆڕێت: {range}», `deliveryWithin` «گەیاندن لە ماوەی {hours}», `lineQuantity` «بڕ {count}», `emptyCart` «سەبەتەکە بەتاڵە.», the five promo strings) and `errReviewAction` «سەبەتەکەت نوێکرایەوە. پێیدا بچۆرەوە و دووبارە «{action}» دابگرە.»; the merchant `ku` for the eight edited labels (none written: they fall back to Arabic).
- **Button-row slice (merchant request, separate):** the express PDP's WhatsApp · «أضف للسلة» · «ثبّت طلبي» row. Build its buttons on `helpers/soft-commerce.tsx` (`SOFT_PRIMARY`, `SoftPrimaryBody`, `SoftWhatsappLink`), adding a secondary-tile variant there, so the PDP, cart and checkout share one button family.
- **Follow-ups (not in this slice):** the thank-you call card in the soft voice (its pills are ink-outlined; its «save» button is yellow); the success page's «وصل حديثاً» grid (green prices, D4); a "keep shopping" link in the empty cart; `ExpressModel`'s private receipt `Row` onto `ReceiptRow` (DRY, needs a PDP snapshot review); a cart sticky bar that hides while the summary's action is on screen, if Ali wants the bar back for long carts.
- **Go-live:** publishing stays Ali's. The publish-day data file (`packages/supabase/go-live/scheniders-iraq-pdp-redesign.sql`, slice 1c) still runs right before it.

---

## Self-review

**1. Request coverage**

| Requirement | Task |
|---|---|
| /cart and /checkout (and the thank-you, which shares the issues) look like the redesigned PDP at 390/360 | 4–9 (soft sections), 10 (draft), 14 (walk); previews pre-rendered |
| Arabic-first, LTR document, no `dir` | `readsRtl` flips in every soft row; Task 12 Step 5 per-file `dir=` counts unchanged; `expectSoftRules` |
| `--bk-*` tokens only, no colour literal | soft code uses `bk-*` utilities only; per-file literal counts unchanged |
| Heading scale (ChapterHeading / text-bk-chapter) | 3 (`as="h1"`), 5, 6, 7, 8, 9 |
| Colour lock: yellow only on the order action; ink prices/totals | 2–9, `expectSoftRules(markup, 1 or 0)` |
| One name per action, consistent with F12 (`_copy-terms.ts`, `COPY_ACTIONS`, lint) | 2 (`orderOnWhatsapp`, `continueOrder`), 8 (`submit_label_i18n`, `errReviewAction`), 10–11 (labels), lint + one-name tests |
| Soft button style from 1f (`rounded-bk-input`, `shadow-bk-button`, no ink border) | 3 (`SOFT_PRIMARY`), 6, 8 |
| Display names for line items | 1g's tile + `line-clamp-2` (5, 7); thank-you `display_name` stash (9) |
| Promise-band facts where useful, without duplicating | scope decision 5; 10 (edits), 11 (`BAND_TRY_FIRST` pinned to 1b) |
| Opt-in via section props with `.catch`; other tenants byte-identical | `style`/`submit_label_i18n` on six sections; Task 1 baseline (22 renders) before code; "chunky = absent" test per section |
| Draft written by a guarded migration | 10 (md5 + rev + section presence + idempotent + published md5) |
| Never change the checkout body or `create_order_atomic` | 8 (body equality test), 9 (stash only, body test) |
| COD only, 18 governorates, free delivery | 8 (tests), 14 (walk) |
| Chrome strings ar/en/ku | 2 (`CART_STRINGS` on `STRING_TABLE_FILES`), 8 (`errReviewAction`) |
| UTC-stamped migration sorting after every file and live version | 10 Step 1 (`max(now, max(file, remote)+1s)`) |
| PGlite replay, live dry run, apply after deploy, migration repair | 10, 13 |
| Fixtures/snapshot mirror + snapcheck | 11 (mirror, new snap read by counts, baseline unchanged by `git diff --stat`) |

**2. Placeholder scan.** `STAMP` (Task 10 Step 1) and `V` (Task 13 Step 4) are produced at run time, as in 1b–1g. Every code block above is the exact file content pre-run on 2026-10-30 in a throwaway worktree of `origin/main` `76466796`. That run covered: the unit, jsdom and markup tests; the baseline written before the code and byte-identical after it; the sections, storefront and platform type gates; storefront + platform lint; the full suites (229 / 2702, sections 159 / 1717); the PGlite replay and the live dry run (`true,true,true,d6cac00b…`). The page look was checked by running the storefront on :3004 with the 1h edits applied in memory (a throwaway loader patch, never committed), at 390 and 360: no overflow, no `dir`, no target under 44px, one yellow action per page. The step-2 "fails first" runs were not each pre-run, and the PR, merge, apply and live draft-view steps touch shared state and were not run.

**3. Type consistency.**
- `CART_STRINGS` / `cs(key, locale, vars)` (Task 2) are what Tasks 6, 7 and 8 import; `CartStringKey` covers `subtotal, delivery, deliveryFree, discount, total, deliveryVaries, deliveryWithin, lineQuantity, emptyCart, orderOnWhatsapp, promoLabel, promoPlaceholder, promoApply, promoInvalid, promoApplied`.
- `SOFT_RECEIPT`, `SOFT_CARD`, `SOFT_FIELD`, `SOFT_LABEL`, `SOFT_PRIMARY`, `SoftPrimaryBody({label, labelField?, sub?, rtl, busy?})`, `SoftWhatsappLink({href, label, rtl})` and `ReceiptRow({rtl, label, note?, value, strong?})` (Task 3) are what Tasks 5–9 import.
- `style: "chunky" | "soft" | undefined` is the same enum on all six schemas; `submit_label_i18n` is `i18nStringOptional.catch(undefined)`.
- `StashedItem.display_name?: string` (Task 9) is what `SoftRecap` reads and what `pdp_direct_order` writes.
- `SLICE_1H_EDITS: DraftSectionEdit[]` (Task 11) equals the migration's `edits` block (Task 10), and `IRAQ_REDESIGN_*_INPUT = jsonbMerge(IRAQ_DRAFT_*_BASE, patch, remove)` mirrors its `(base || patch) - remove`.

**Risks carried forward (for the reviewer):**
- **No sticky bar on the cart.** A cart of four or more lines needs a scroll to reach «كمّل طلبك». Today's carts here hold 1–3 lines. Restoring the bar needs a summary-aware hide (follow-up).
- **The soft checkout keeps the section order** (form, then summary): the line items show only below the form. The submit carries the total, so the amount is seen where it is tapped.
- **Pre-1g carts** keep the long catalogue title, now on two lines. Lines are not renamed (no product data on the cart page).
- **`display_name` in the stash ships for every tenant's express orders** (sessionStorage only; read only by the soft recap). The default recap and the request body are pinned unchanged by tests.
- **Untried live paths for this tenant:** the promo input, discount rows, loyalty box and referral field in soft (scheniders-iraq has none). The promo is covered by a jsdom test; the rest reuse the soft field classes.
- **New Tailwind utilities** (`line-clamp-2`, `basis-[calc(50%-0.25rem)]`, `bg-bk-on-primary/15`, `focus-within:ring-bk-focus`) are generated by the storefront's JIT from the sections source; verified on :3004. The platform does not render these sections.
- **Merchant decisions** (scope decisions 4 and 5, the ETA wording, the Kurdish) are Ali's to confirm before publish; the draft can be rolled back with the migration header's Rollback lines.
- **The thank-you call card** and the «وصل حديثاً» grid still carry chunky/green styling; they are the next hand-offs.
