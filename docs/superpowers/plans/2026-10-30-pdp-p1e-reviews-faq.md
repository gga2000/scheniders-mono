# PDP Lower-Page Redesign — Slice 1e (Reviews Highlights + Product FAQ / One Contact Row) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the express product page's reviews into Ali's concept g3 A + B's key-phrase tint (a light summary card that is the `#reviews-summary` target with «4.7», exact stars and «من 6 تقييمات»; word buttons «الثبات 3 · التيستر 2 · فخامة 2 · العلبة والتغليف 2» that HIGHLIGHT and never filter; the strongest 5★ first and Ahmed's 3★ last; a yellow-tinted key phrase in every card; a «رد شنايدر» reply slot that renders only when Ali has written the reply), turn the FAQ into concept g4 A (product-only questions, hidden until ≥2 resolve, and ONE contact row with «اتصل بينا» + «راسلنا واتساب» in place of the «عندك استفسار؟» WhatsApp card), switch the identity row's rating (and with it the scent card's footer rating) to the `#reviews-summary` link, and write scheniders-iraq's 1e draft config (guarded, applied only after the code is live). Every other tenant's markup stays byte-identical.

**Architecture:** All new props are optional and `.catch`-guarded. `product_reviews` gains `layout: "highlights"`, `theme_words`, `visible_count`, `form_entry`, `heading_style` and `review_curation` (per-review rank / tags / key phrase / reply in section props until Phase 2 moves them to `product_reviews` columns). The highlights body is one client island (`product_reviews/highlights-view.tsx`) built from pure, unit-tested modules: `marks.ts` (key phrase + mark runs), `theme-words.ts` (topic counts on folded substring matches via the shared `findTermHits`), `featured-order.ts` (D10), plus `highlights-summary.tsx` (server-safe) and `highlights-card.tsx`. `faq_contact_split` gains `product_faq`, `contact_style` and `heading_style`; the product view (`faq_contact_split.product.tsx`) is server-only, native `<details>`, with its chrome in the new `faq_contact_split.strings.ts`. The draft write is one guarded SQL migration (three `||` patches), replayed on PGlite against a read-only copy of the live row, dry-run live with a SELECT, mirrored by the redesign fixtures, and applied only after merge + deploy.

**Tech Stack:** Next.js 16 / React 19 sections package (`@scheniders/sections`), zod v4, Tailwind v3 (storefront) / v4 (platform), vitest 2 (node + jsdom), Supabase CLI 2.98 (`db query --linked`, `migration repair`), PGlite 0.2.17 (local replay only, outside the repo), pnpm 10.

**Spec:** `docs/superpowers/specs/2026-10-27-pdp-lower-page-redesign-design.md` §1.6, §1.7, §1.2 (`identity_rating`), §1.1 (`heading_style`), §1.9, §1.10; decisions D1, D4, D5, D10, D14, D15; error table rows "No approved reviews", "Fewer than 2 answered product FAQs", "Invalid/missing commerce.contact", "#reviews arrival". Concepts: `/Users/ali/scheniders-mono/.superpowers/brainstorm/concepts-pdp-2026-10-26/c-g3-reviews-a.html` (+ `.notes.md`), `c-g3-reviews-b.html` (+ `.notes.md`, the in-body key phrase), `c-g4-faq-bestsellers-a.html` (+ `.notes.md`). Built on slices 1a (#224), 1b (#225), 1c (#226) and 1d (#227, merged as `7da169c5`; its draft migration `20261029225645` is applied, draft md5 `8d0e6032304d56057abfecbb4487b95b`, rev 38, published md5 `a6f87ba3181b0e94f41ba4a700de257b`): `ChapterHeading` (`helpers/chapter-heading.tsx`), `readsRtl` (`helpers/reading.ts`), `displayRating` / `formatCount` (`helpers/format.ts`), `Stars precision="exact"` (`helpers/primitives.tsx:828`), `findTermHits` (`helpers/arabic-text.ts`), `storeDisplayName` (`helpers/store-name.ts`), `reviewCountLabel` + `displayNameOf` (`pdp_express/identity-label.tsx`), the identity row's `RatingLink` and the scent card footer link (both render only with `identity_rating: "summary_link"`: `pdp_express/express-view.tsx:96-98,221`, `pdp_express/scent-card-block.tsx:243`), `STRING_TABLE_FILES` (`_string-tables.ts`), the redesign fixtures + mirror test (`_pdp-redesign-fixtures.ts` with 1d's `jsonbMerge`, `_pdp-redesign-snapshot.test.tsx` with 1d's `migrationSql` / `migrationJson`).

---

## Scope decisions (read before starting)

1. **Ali's binding 1e decisions.** Reviews = concept A (light summary card: «4.7», a partly filled fifth star via `Stars precision="exact"` + `displayRating`, bars with a ★ per row, «من 6 تقييمات» with correct Arabic plurals; word buttons that HIGHLIGHT matching text and never filter, counted with `findTermHits` substring matching; a threaded «رد شنايدر» reply under the 3★ review) PLUS concept B's yellow in-body key phrase. Screenshots are NOT repeated in reviews (they live in 1d's proof stack). Order: strongest 5★ first, Ahmed's 3★ LAST. FAQ = concept A: product-only questions, hidden until ≥2 product answers exist, one contact row (call + WhatsApp) replacing the «عندك استفسار؟» card; the add-on row is Phase 4a, not 1e.
2. **Curation lives in section props until Phase 2.** Today's `product_reviews` has only `id, tenant_id, product_id, rating, title, body, author_name, photo_urls, status, created_at` (read live 2026-10-30). So the per-review pin, tags, key phrase and reply are one merchant-editable prop, `review_curation: [{ review_id, rank?, tags?, highlight?, reply_i18n? }]`, mirroring Phase 2's `pinned_rank`, `tags`, `highlight_quote`, `reply_body` (spec §Phase 2 migration). Precedent: 1c's `scent_card.quote_picks` keys a review the same way. Phase 2 moves the data to columns and drops the prop.
3. **The reply is Ali's (gate to-do 1).** The «رد {store}» slot renders only when `reply_i18n` resolves to text; the draft writes NO reply, so draft view shows none. A fake or placeholder reply is never drawn. `{store}` is `storeDisplayName` (D15: «شنايدر» from `commerce.contact.name_i18n`).
4. **Order is D10, with no pins in the draft.** Rating desc → topics mentioned desc → body length desc → id (all six imports share one `created_at`, so the id is the only stable tie-break). Wayfarer: احمد الشمري → حازم السيد → مصطفى علي → eng. سيف → ياسين → Ahmed (pinned by a unit test on the six live bodies). `visible_count` 3 shows الشمري, حازم, Ahmed; «شوف كل التقييمات (6)» inserts the rest BEFORE Ahmed. `visible_count` 1 shows only the strongest (a single visible card is never the 3★ alone — the spec's "top N−1 plus the low one" would show ONLY Ahmed at N = 1). Curation tags count as topics in the sort, so tagging later can move cards; the draft carries no tags.
5. **Key phrase: the merchant's pick, else a short clause, else nothing.** `review_curation[].highlight` wins when it is a verbatim part of the body (else ignored). Otherwise the first clause (split on «.» «،» «!» «؟» newline) that names a topic AND has 3–14 words — the scent quote's rule (§1.4). The spec's bare "first clause that contains a theme term" would tint Ahmed's whole 40-word, punctuation-free body. The draft carries one pick per review (concept B's three, three drafted here) for Ali's sign-off (to-do 14).
6. **A pressed topic marks whole words.** `findTermHits` returns the substring («ثبات» inside «بثباته»); the mark is widened to the word, so a `<mark>` never splits an Arabic word's joined letters. Key phrase tint `bg-bk-primary/25`; pressed-topic words `bg-bk-primary/40` (D4: tints, never a fill). A tag-only topic marks the card edge (`ring-bk-primary`). Pressing a topic whose hit is in a hidden card opens the rest; the list is never filtered or reordered; the page scrolls to the first mark; a second tap clears.
7. **Word buttons need ≥2 topics with hits AND ≥2 reviews.** The spec's missing-data line ("One review → no bars, no word buttons below 2 themes") reads as both rules: with one review every button would say 1 and point at the card beneath it. Buttons are pills «الثبات 3» (label + count in `<bdi>`), espresso when pressed (never yellow, D4). A visible caption «أكثر شي ذكروه» (concept A) labels the group.
8. **Counts reuse the identity row's plural forms.** «من 6 تقييمات» = `REVIEW_STRINGS.ofReviews` («من {count}») around `reviewCountLabel` (`pdp_express/identity-label.tsx:31`, 1b: «تقييم واحد» / «تقييمين» / «{count} تقييمات» / «{count} تقييم»), so the chip, the scent card and the summary can never count differently. No second `countForms` table. The quiet layout keeps «{count} تقييم» (byte-identical, on the F12 allowlist).
9. **Clamp + «كمّل».** Featured body 17px/700 clamped to 5 lines, compact 15px clamped to 3 (`line-clamp-*`, so it only ever cuts at the end). «كمّل» renders only after mount when the clamped `<p>` really overflows (`scrollHeight > clientHeight + 1`) — so the server HTML carries no «كمّل», and a short review never shows one. A pressed topic unclamps the cards it marks.
10. **`hash_only` keeps today's #reviews behaviour.** With `form_entry: "hash_only"` neither «اكتب تقييمك» nor the form renders for a cold visitor; the existing mount effect (`window.location.hash === "#reviews"`, product_reviews.client.tsx:210-214) opens the form and focuses the first star exactly as the quiet layout does today. It applies to every layout (historical: the always-visible form becomes hash-only too).
11. **`heading_style`.** `product_reviews`: one `headingEl` for all three layouts (`ChapterHeading` vs today's `CenteredSectionHeader align="start"`, product_reviews.client.tsx:502-506 and 573-577). `faq_contact_split`: the product view and the compact view (via an optional `chapterLocale` prop on `FaqContactCompact`, the same move 1d made for the quiet accordion). The cards/ledger header (eyebrow chip, centred title, sub line) and a page-leading `h1` (on `/faq`, `/contact`) keep theirs: `ChapterHeading` only renders `h2`/`h3`.
12. **FAQ contact row.** `contact_style: "row"` is read only with `product_faq`. Call = `tel:+${whatsappDigits(parseStoreContact(commerce.contact).call_number)}` (the same builder as accordion_richtext.tsx:157); WhatsApp = `resolveTenantWhatsapp(tenant, contact.whatsapp_number)` + `?text=` «عندي سؤال عن {product}» (`displayNameOf`). A missing channel is not drawn; with neither, the row is gone; with no answered questions AND no channel the section renders nothing. Title/sub come from the existing `contact.title_i18n` / `contact.sub_i18n`. The number itself is not printed (concept frame 1 shows it; the spec does not). Without `contact_style: "row"` the product view keeps today's compact WhatsApp row.
13. **«اطلبه وجرّبه» is a plain `#direct-order` link.** The FAQ is a server component and `DIRECT_ORDER_FORM_ID` lives in a `"use client"` module (pdp_direct_order.client.tsx:240; importing a value from it on the server yields an opaque reference). So `ORDER_FORM_HREF = "#direct-order"` sits in the product view and a test pins it to `#${DIRECT_ORDER_FORM_ID}`. Zero client JS.
14. **The FAQ title** comes from `product_faq.title_i18n` («أسئلة قبل لا تطلب»), else the section's `title_i18n`. No new chrome title string.
15. **`contact` is restated whole by the migration.** jsonb `||` is shallow: `{"contact": {…}}` replaces the object. The FAQ patch copies `icon_url`, `cta_label_i18n` and `whatsapp_number` from the live base and changes only `title_i18n` / `sub_i18n`; a fixture test proves the rest is unchanged.
16. **Builder form.** `product_faq.items[].answer` is a discriminated union, which the platform auto-form maps to `kind: "unknown"` (`apps/platform/components/store-builder-v2/auto-form-schema.ts`, `default:` branch). The builder shows no editor for that one field (it keeps the stored value); everything else gets controls (1d's `unwrap()` walks `.catch()`). Phase 2 owns the merchant UI.
17. **No new `dir`.** The draft compact FAQ carries 4 `dir="auto"` answer paragraphs today (faq_contact_split.compact.tsx:84, one per question); the product view uses the storefront's global `unicode-bidi: plaintext` on `p` and adds none (4 → 0 in the ar render). Reviews add none.
18. **Frozen first.** The draft's quiet reviews (over Wayfarer's six live reviews) and its compact FAQ (4 store questions + the «عندك استفسار؟» row) have no frozen snapshot today. Task 1 freezes both from the live draft bases before any code changes; they and every 1a–1d baseline stay byte-identical. The only snapshot that changes is the opted-in redesign snapshot, in its own reviewed commit (Task 10), checked by `snapcheck.mjs`.
19. **Guards, stamp, apply** follow 1b–1d exactly: `STAMP=$(date -u +%Y%m%d%H%M%S)` sorting after `20261029225645`; guards = whole-draft md5 + `store_config_rev` + already-applied no-op; apply with `supabase db query --linked -f`, record with `supabase migration repair --status applied`; never `db push`; nothing applied before the code PR is merged and production serves it. **Task 0 re-reads the guard values; the migration pins whatever they are then.**
20. **Strings.** New review chrome goes into `product_reviews/strings.ts` (`REVIEW_STRINGS`, already on `STRING_TABLE_FILES`); new FAQ chrome into the new `faq_contact_split.strings.ts` (`FAQ_STRINGS`), added to `STRING_TABLE_FILES` in the same commit. Every entry has ar/en/ku; ku and the drafted en go to Ali's copy review (to-dos 8 and 10).

## Conventions for every task

- Work only in the worktree `/Users/ali/scheniders-mono-pdp`. **Do not switch its branch while reviewers or a dev server use it**: Task 0 Step 1 checks that first.
- Every shell starts with:
  ```bash
  export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"
  cd /Users/ali/scheniders-mono-pdp
  ```
- pnpm only. Never npm/yarn.
- Tests: `CI=true pnpm exec vitest run <path>` from the repo root. `CI=true` never writes a snapshot. Only **Task 1 Step 4** (a brand-new snapshot file) and **Task 10 Step 6** (`-u`, one file) run vitest without `CI=true`.
- vitest prints coloured output; the expected lines below are the plain text (`Tests  4 passed (4)`).
- Sections type gate (expected **no output**):
  ```bash
  (cd packages/sections && ./node_modules/.bin/tsc --noEmit --incremental false -p tsconfig.json --rootDir .. 2>&1 | grep "error TS" | grep -v TS6059 | grep -v -E "^src/(RenderSection\.sticky|_chrome-baseline-snapshot|_chrome|_delivery-promise|_pdp-classic-snapshot|image-gallery-order|product_attributes|helpers/whatsapp|pdp_express/checkout-row\.receipt)\.test\.tsx?\(")
  ```
- Before every commit: `git branch --show-current` → `feat/pdp-p1e-reviews-faq`.
- Commit with explicit paths only, as gga2000, with the trailer (lint-staged runs `eslint --fix` on staged files):
  ```bash
  git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```
- Banned in new code: `any`, `@ts-ignore`, `eslint-disable`, a non-null `!` that silences the compiler, swallowed catches, hex/rgb colour literals in source, and any `dir` attribute. Solid yellow (`bg-bk-primary`) is never used by this slice (D4): the key phrase and topic marks are `bg-bk-primary/25` and `/40` tints; amber (`bk-accent`) only for the stars and the bars; green (`bk-success`) only for the WhatsApp glyph.
- **Never run `vitest -u`** except Task 10 Step 6. If a baseline fails, the code changed a default render: fix the code.
- All live database access before Task 12 is **read-only** (`SELECT`, or a `DO` block replayed on PGlite only).
- On a busy machine the full suites can take many minutes and occasionally a worker times out resolving a module (seen once on `html_embed.test.tsx`: `Timeout calling "resolveId"`, 0 tests, unrelated to this slice). Re-run that one file; it must pass on its own.

## File structure

| File | Status | Responsibility |
|---|---|---|
| `packages/sections/src/_pdp-redesign-fixtures.ts` | modify | Task 1: the draft's reviews + FAQ bases; Task 10: the three 1e patches, the 1e inputs, `IRAQ_REDESIGN_PDP_PROPS` with 1e |
| `packages/sections/src/_pdp-reviews-faq-baseline-snapshot.test.tsx` (+ `.snap`) | create | frozen: the draft quiet reviews and the compact FAQ + WhatsApp row |
| `packages/sections/src/product_reviews.tsx` | modify | the 1e props |
| `packages/sections/src/_product-reviews-highlights-props.test.ts` | create | the props parse safely |
| `packages/sections/src/product_reviews/strings.ts` (+ `strings.test.ts`) | modify | six highlights chrome strings |
| `packages/sections/src/product_reviews/marks.ts` (+ `.test.ts`) | create | key phrase, word widening, mark runs |
| `packages/sections/src/product_reviews/theme-words.ts` (+ `.test.ts`) | create | topic membership and counts |
| `packages/sections/src/product_reviews/featured-order.ts` (+ `.test.ts`) | create | D10 order, visible set, expand order |
| `packages/sections/src/product_reviews/highlights-summary.tsx` | create | `#reviews-summary` card (server-safe) |
| `packages/sections/src/product_reviews/highlights-card.tsx` | create | one review card (clamp, marks, reply) |
| `packages/sections/src/product_reviews/highlights-view.tsx` | create | the island: buttons, list, «شوف كل» |
| `packages/sections/src/product_reviews.client.tsx` | modify | `headingEl`, `hash_only`, the highlights branch |
| `packages/sections/src/_product-reviews-highlights.test.tsx` | create | server markup |
| `packages/sections/src/_product-reviews-highlights-dom.test.tsx` | create | jsdom interaction |
| `packages/sections/src/faq_contact_split.strings.ts` (+ `.test.ts`) | create | `FAQ_STRINGS`, `fs` |
| `packages/sections/src/_string-tables.ts` | modify | lists `faq_contact_split.strings.ts` |
| `packages/sections/src/faq_contact_split.tsx` | modify | 1e props, export `Props`, the product branch, compact `chapterLocale` |
| `packages/sections/src/faq_contact_split.product.tsx` | create | `resolveProductFaq`, `ContactRow`, `FaqProductView` |
| `packages/sections/src/faq_contact_split.compact.tsx` | modify | optional `chapterLocale` |
| `packages/sections/src/_faq-product.test.tsx` | create | schema, resolver, render |
| `packages/supabase/migrations/<STAMP>_scheniders_iraq_pdp_redesign_1e_draft.sql` | create | the guarded draft write |
| `packages/sections/src/_pdp-redesign-snapshot.test.tsx` (+ `.snap`) | modify | 1e mirror + pair tests; reviews/FAQ renders; reviewed snapshot update |
| `tmp/pdp-1e/` (`dryrun-1e.sql`, `snapcheck.mjs`, `order-check.mjs`, `bases.json`, `page.html`) | scratch (gitignored) | read-only checks |
| `${TMPDIR:-/tmp}/pdp-1e-pglite/` | scratch (outside the repo) | PGlite replay harness |

---

### Task 0: Branch, baseline, live guard values

- [ ] **Step 1: Branch off main (1d is merged as #227)**

```bash
git branch --show-current
git status --porcelain
git fetch origin
git log --oneline -1 origin/main
git switch -c feat/pdp-p1e-reviews-faq origin/main
git branch --show-current
```
Expected:
- before switching: the 1d branch (or main) and only the untracked `apps/storefront/AGENTS.md` / `apps/storefront/CLAUDE.md` (not ours; never stage them). If reviewers or a dev server are still using the worktree, stop and ask for a free worktree (`git worktree add ../scheniders-mono-pdp-1e origin/main`) instead of switching this one;
- the log shows `7da169c5 Merge pull request #227 from gga2000/feat/pdp-p1d-proof-guarantee` or a later commit;
- the branch is `feat/pdp-p1e-reviews-faq`.

- [ ] **Step 2: Baseline counts on the untouched branch**

```bash
CI=true pnpm exec vitest run packages/sections/src packages/shared/src apps/storefront/lib
CI=true pnpm exec vitest run packages/sections/src
```
Expected (on `7da169c5`): `Test Files  196 passed (196)`, `Tests  2370 passed (2370)`; sections alone `Test Files  126 passed (126)`, `Tests  1385 passed (1385)`. Task 11 compares against these; if main moved, write down the new numbers and add the same deltas.

- [ ] **Step 3: The CLI link, the guard values, and 1d applied**

```bash
cat packages/supabase/.temp/project-ref; echo
cd packages
supabase db query --linked "SELECT store_config_rev, md5(store_config_v2_draft::text) AS draft_md5, md5(store_config_v2::text) AS pub_md5 FROM tenants WHERE slug='scheniders-iraq'" -o csv
supabase db query --linked "SELECT s.sec->>'type' AS type, md5((s.sec->'base')::text) AS base_md5 FROM tenants t, jsonb_array_elements(t.store_config_v2_draft->'pages') p(page), jsonb_array_elements(p.page->'sections') s(sec) WHERE t.slug='scheniders-iraq' AND p.page->>'page_id'='product' AND s.sec->>'id' IN ('1ab3ee76-902a-42c8-8c26-e6d87b3fd6fc','8354d117-ed8d-4a3e-9bea-8ed6fd8b1023','aae22169-cef4-4495-842b-863a7caa71c2') ORDER BY 1" -o csv
supabase db query --linked "SELECT version, name FROM supabase_migrations.schema_migrations WHERE version >= '20261029' ORDER BY 1" -o csv
supabase db query --linked "SELECT r.id, r.rating, r.author_name, md5(coalesce(r.body,'')) AS body_md5 FROM product_reviews r JOIN tenants t ON t.id = r.tenant_id WHERE t.slug='scheniders-iraq' AND r.product_id='5e847790-11a5-439f-bace-c315e0ff1ae8' AND r.status='approved' ORDER BY r.id" -o csv
cd ..
```
Expected:
- `sduvpgqwhxragxtxztur` (never the OLD `ibfdugifekivquwprqjc`; if `.temp` is missing, `cp /Users/ali/scheniders-mono/packages/supabase/.temp/* packages/supabase/.temp/`);
- `38,8d0e6032304d56057abfecbb4487b95b,a6f87ba3181b0e94f41ba4a700de257b` (read 2026-10-30 after the 1d migration was applied);
- `faq_contact_split,6720f23fe9e4b1b1156dc2910d70055e`, `pdp_direct_order,a0c38245019c97ab22d21dd6917e8407`, `product_reviews,bf9602243bac84ce250199f7f692df02`;
- three rows: `20261029210502 …1b_draft`, `20261029220530 …1c_draft`, `20261029225645 …1d_draft`;
- six approved reviews, exactly the ids in `WAYFER_REVIEWS` (`packages/sections/src/_pdp-wayfer-fixtures.ts`): `6881921e…` 5 eng. سيف, `aeb344f2…` 5 ياسين, `b4f6b842…` 5 مصطفى علي, `cd25b071…` 3 Ahmed, `d7c511e8…` 5 احمد الشمري, `fcd04048…` 5 حازم السيد (body md5s `205936d9…`, `b7448b29…`, `06bc9f5e…`, `02413be6…`, `8b6fa85c…`, `a4d4bcba…`). Rejected duplicates with the same bodies exist; they never reach the page.

**If the draft md5 or the rev differs, the migration pins the values read now:** use them in Task 9 Step 2 (`c_expected_draft_md5`, `c_expected_rev`, the header's guard c. and Rollback lines) and in Task 9 Step 6's dry-run literals; Task 9 Steps 5–6 then print new `before`/`after` md5s — record those and use them in Tasks 9 and 12 instead of the ones below. **If the reviews or FAQ base md5 differs,** the merchant edited it: re-read that base (`SELECT s.sec->'base' …`) and update `IRAQ_DRAFT_REVIEWS_BASE` / `IRAQ_DRAFT_FAQ_BASE` in Task 1 Step 1 and the Rollback header. **If the approved reviews differ** (a new review, an edit), stop: the D10 order, the 3/2/2/2 counts and the six key phrases are pinned on these bodies; re-derive them first. **If 1d is not recorded,** stop: 1d's Task 10 has not run.

---

### Task 1: Freeze the draft's reviews and FAQ (before any code changes)

**Files:**
- Modify: `packages/sections/src/_pdp-redesign-fixtures.ts` (imports; append the two draft bases)
- Create: `packages/sections/src/_pdp-reviews-faq-baseline-snapshot.test.tsx`
- Create (written by vitest): `packages/sections/src/__snapshots__/_pdp-reviews-faq-baseline-snapshot.test.tsx.snap`

- [ ] **Step 1: Add the two draft bases to the redesign fixtures**

They are read-only copies of the live draft's `1ab3ee76` (product_reviews) and `8354d117` (faq_contact_split) bases, base md5s `bf960224…` and `6720f23f…` (Task 0 Step 3).

In `packages/sections/src/_pdp-redesign-fixtures.ts`, replace:
```ts
import type { Props as PdpDirectOrderProps } from "./pdp_direct_order";
import type { Tenant } from "./types";
import { EXPRESS_IRAQ_DRAFT_PDP_PROPS, fixtureTenant } from "./_pdp-fixtures";
```
with:
```ts
import type { Props as PdpDirectOrderProps } from "./pdp_direct_order";
import type { Props as ReviewsProps } from "./product_reviews";
import type { Tenant } from "./types";
import { EXPRESS_IRAQ_DRAFT_PDP_PROPS, fixtureTenant } from "./_pdp-fixtures";
import type { FaqProps } from "./_pdp-lower-fixtures";
```

Then append to the end of the file:
```ts

/** scheniders-iraq's draft product_reviews 1ab3ee76 base before slice 1e
 *  (read 2026-10-30, base md5 bf9602243bac84ce250199f7f692df02). */
export const IRAQ_DRAFT_REVIEWS_BASE: ReviewsProps = {
  layout: "quiet",
  show_form: true,
  heading_i18n: { ar: "آراء العملاء", en: "Customer reviews" },
};

/** scheniders-iraq's draft faq_contact_split 8354d117 base before slice 1e
 *  (read 2026-10-30, base md5 6720f23fe9e4b1b1156dc2910d70055e): the
 *  compact list of four store questions and the «عندك استفسار؟» row. */
export const IRAQ_DRAFT_FAQ_BASE: FaqProps = {
  items: [
    {
      a_i18n: {
        ar: "كل عطورنا مختارة يدوياً من أفخم المصادر العالمية ومن أجود الخامات العطرية، ونجرّب كل عطر بأنفسنا قبل ما يوصلك. وما نتعامل بالعطور التركية المصنّعة بالجملة ولا بالعطور الصينية الرديئة.",
        en: "Every perfume is hand-picked from premium global sources and the finest aromatic materials, and we try each one ourselves before it reaches you. We don't deal in bulk-made Turkish perfumes or low-grade Chinese ones.",
      },
      q_i18n: { ar: "العطور أصلية؟", en: "Are your perfumes original?" },
    },
    {
      a_i18n: {
        ar: "تجرّب العطر بالتيستر الزجاجي المجاني اللي يجي ويا طلبك، بحضور المندوب وقبل لا تدفع. وإذا لگيت أي اختلاف بالجودة أو المواصفات أو الفوحان أو الثبات، يحقلك ترفض العطر. وإذا اكتشفت فرق بالمواصفات بعد الاستلام، تگدر ترجّعه خلال أسبوع.",
        en: "You try the perfume with the free glass tester that comes with your order, with the courier there and before you pay. If anything differs (quality, specs, projection or longevity) you can refuse it. If you find a difference in the specs after delivery, you can return it within a week.",
      },
      q_i18n: { ar: "ريحة العطر نفس ريحة التيستر؟", en: "Will the bottle smell like the tester?" },
    },
    {
      a_i18n: {
        ar: "ما تدفع إلا بعد ما تستلم العطر وتجرّبه بالتيستر. وإذا استلمته وما عجبتك التجربة العطرية، يحقلك ترجّعه خلال أسبوع من الاستلام: راسلنا على الواتساب ونرتّب الاسترجاع، وتفاصيل الشروط موجودة بصفحة سياسة الاسترجاع.",
        en: "You only pay after you receive the perfume and try it with the tester. If you keep it and don't like the scent, you can return it within a week of delivery: message us on WhatsApp and we'll arrange the return. The conditions are on the returns policy page.",
      },
      q_i18n: { ar: "إذا ما عجبني العطر وقت الاستلام؟", en: "What if I don't like it when it arrives?" },
    },
    {
      a_i18n: {
        ar: "أغلب الطلبات توصل خلال ٢٤ ساعة من تثبيت الطلب، والمحافظات البعيدة ممكن توصل لحد ٣ أيام عمل. والتوصيل مجاني لكل المحافظات.",
        en: "Most orders arrive within 24 hours of confirmation; far governorates can take up to 3 working days. Delivery is free to every governorate.",
      },
      q_i18n: { ar: "شكد يطول التوصيل؟", en: "How long does delivery take?" },
    },
  ],
  compact: true,
  contact: {
    icon_url:
      "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/66a2314b-371e-4474-ad0d-53a4cad055f9.svg",
    sub_i18n: { ar: "نورونا على الواتساب وسولفوا ويانا", en: "Message us on WhatsApp, we're happy to chat." },
    title_i18n: { ar: "عندك استفسار؟", en: "Any questions?" },
    cta_label_i18n: { ar: "واتساب", en: "WhatsApp" },
    whatsapp_number: "",
  },
  sub_i18n: {
    ar: "هنا تجد أجوبة عن الأسئلة الاكثر شيوعا، إدا مازلت تريد معلومات إضافية، يمكنك دائما الاتصال بنا.",
    en: "Answers to the most common questions — and you can always reach us for more.",
  },
  title_i18n: { ar: "الأسئلة الأكثر شيوعا", en: "Frequently asked questions" },
  eyebrow_i18n: { ar: "أسئلة و أجوبة", en: "Questions & answers" },
  row_icon_url:
    "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/73c12b05-fbb5-4cc7-9a75-f61094855221.svg",
};
```

- [ ] **Step 2: Write the baseline test**

Create `packages/sections/src/_pdp-reviews-faq-baseline-snapshot.test.tsx`:

```tsx
// =====================================================================
// Slice 1e baselines — the draft's reviews and FAQ, frozen BEFORE the
// highlights and product-FAQ code exists
// =====================================================================
// scheniders-iraq's draft product_reviews (quiet layout) over Wayfarer's
// six live reviews, and its faq_contact_split (compact list + the «عندك
// استفسار؟» WhatsApp row), as read on 2026-10-30, as server markup in ar
// and en. Neither config had a frozen snapshot; slice 1e edits both
// files. With none of the 1e props set, this markup must stay
// byte-identical. A diff here is a back-compat break, not a snapshot to
// refresh. Never run this file with -u.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocaleCode } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import faq_contact_split from "./faq_contact_split";
import product_reviews from "./product_reviews";
import { productCtx, productRuntime } from "./_pdp-fixtures";
import { IRAQ_TENANT } from "./_pdp-lower-fixtures";
import { IRAQ_DRAFT_FAQ_BASE, IRAQ_DRAFT_REVIEWS_BASE } from "./_pdp-redesign-fixtures";
import { wayferProduct } from "./_pdp-wayfer-fixtures";

function renderReviews(locale: LocaleCode): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <product_reviews.render
        props={product_reviews.schema.parse(IRAQ_DRAFT_REVIEWS_BASE)}
        ctx={productCtx(wayferProduct, { tenant: IRAQ_TENANT, runtime: { ...productRuntime, locale } })}
      />
    </StoreBaseProvider>,
  );
}

function renderFaq(locale: LocaleCode): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="">
      <faq_contact_split.render
        props={faq_contact_split.schema.parse(IRAQ_DRAFT_FAQ_BASE)}
        ctx={productCtx(wayferProduct, { tenant: IRAQ_TENANT, runtime: { ...productRuntime, locale } })}
      />
    </StoreBaseProvider>,
  );
}

describe("product_reviews — scheniders-iraq draft quiet layout, frozen", () => {
  it.each(["ar", "en"] as const)("%s", (locale) => {
    expect(renderReviews(locale)).toMatchSnapshot();
  });
});

describe("faq_contact_split — scheniders-iraq draft compact + WhatsApp row, frozen", () => {
  it.each(["ar", "en"] as const)("%s", (locale) => {
    expect(renderFaq(locale)).toMatchSnapshot();
  });
});
```

- [ ] **Step 3: Check the fixture bases equal the live ones**

```bash
mkdir -p tmp/pdp-1e
(cd packages && supabase db query --linked "SELECT s.sec->'base' AS base FROM tenants t, jsonb_array_elements(t.store_config_v2_draft->'pages') p(page), jsonb_array_elements(p.page->'sections') s(sec) WHERE t.slug='scheniders-iraq' AND p.page->>'page_id'='product' AND s.sec->>'id' IN ('1ab3ee76-902a-42c8-8c26-e6d87b3fd6fc','8354d117-ed8d-4a3e-9bea-8ed6fd8b1023') ORDER BY s.sec->>'type'" -o json) > tmp/pdp-1e/bases.json
cat > packages/sections/src/zz-bases-check.test.ts <<'TS'
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { IRAQ_DRAFT_FAQ_BASE, IRAQ_DRAFT_REVIEWS_BASE } from "./_pdp-redesign-fixtures";
it("fixture bases equal the live draft", () => {
  const rows = JSON.parse(readFileSync("../../tmp/pdp-1e/bases.json", "utf8")).rows;
  expect(IRAQ_DRAFT_FAQ_BASE).toEqual(rows[0].base);
  expect(IRAQ_DRAFT_REVIEWS_BASE).toEqual(rows[1].base);
});
TS
(cd packages/sections && CI=true pnpm exec vitest run src/zz-bases-check.test.ts)
rm packages/sections/src/zz-bases-check.test.ts
```
Expected: `Tests  1 passed (1)`. The throwaway test is deleted right after (never staged). The CLI prints `{ "boundary": …, "rows": [ … ], "warning": … }`; `rows[0]` is faq_contact_split (sorted by type).

- [ ] **Step 4: Write the frozen snapshots (a new file, so no `-u`)**

```bash
pnpm exec vitest run packages/sections/src/_pdp-reviews-faq-baseline-snapshot.test.tsx
CI=true pnpm exec vitest run packages/sections/src/_pdp-reviews-faq-baseline-snapshot.test.tsx
f=packages/sections/src/__snapshots__/_pdp-reviews-faq-baseline-snapshot.test.tsx.snap
for k in 'data-reviews-summary' 'id="reviews-summary"' 'data-review-entry' 'عندك استفسار؟' 'data-action-row="whatsapp"' 'dir="auto"' '<details' '6 تقييم'; do printf '%s: ' "$k"; grep -o -- "$k" $f | wc -l | tr -d ' '; done
```
Expected:
- first run: `Snapshots  4 written`, `Tests  4 passed (4)`; second run (CI): `Tests  4 passed (4)` with no `written`;
- counts `2 0 2 1 2 8 8 1`: the quiet summary card in each reviews render (no `#reviews-summary` id: the quiet layout never gets one), the «اكتب تقييمك» entry in each, the Arabic «عندك استفسار؟» once, the WhatsApp row in each FAQ render, 4 `dir="auto"` answers and 4 `<details>` per FAQ render, and the quiet «6 تقييم» (singular after a number, the F12 allowlist case) once.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add packages/sections/src/_pdp-redesign-fixtures.ts packages/sections/src/_pdp-reviews-faq-baseline-snapshot.test.tsx packages/sections/src/__snapshots__/_pdp-reviews-faq-baseline-snapshot.test.tsx.snap
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "test(sections): freeze scheniders-iraq's draft quiet reviews and compact FAQ before 1e" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `product_reviews` highlights props

**Files:**
- Modify: `packages/sections/src/product_reviews.tsx` (imports, `schema`)
- Test: `packages/sections/src/_product-reviews-highlights-props.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/_product-reviews-highlights-props.test.ts`:

```ts
// =====================================================================
// PDP redesign 1e — product_reviews' highlights props parse safely
// =====================================================================
// Every new prop is optional and `.catch`-guarded: a bad or rolled-back
// stored value drops only that prop (or that curation field), never the
// section. The widened `layout` enum keeps "quiet" and the historical
// (absent) layout exactly as they were.
// =====================================================================

import { describe, expect, it } from "vitest";
import product_reviews from "./product_reviews";

const schema = product_reviews.schema;

const AHMED = "cd25b071-10d9-4de5-a324-ea6a0793559b";

const CURATION = {
  review_id: AHMED,
  rank: 6,
  tags: ["longevity"],
  highlight: "العطر كلش راقي وثباته يطول يوم كامل على الملابس",
  reply_i18n: { ar: "حقك علينا يا أحمد" },
};

const HIGHLIGHTS = {
  heading_i18n: { ar: "شنو گالوا اللي جرّبوه" },
  show_form: true,
  layout: "highlights",
  theme_words: [
    { key: "longevity", label_i18n: { ar: "الثبات" }, match_terms: ["ثبات"] },
    { key: "reorder", label_i18n: { ar: "طلبوا مرة ثانية" } },
  ],
  visible_count: 3,
  form_entry: "hash_only",
  heading_style: "chapter",
  review_curation: [CURATION],
};

describe("product_reviews slice 1e props", () => {
  it("accepts the highlights config", () => {
    expect(schema.parse(HIGHLIGHTS)).toEqual(HIGHLIGHTS);
  });

  it.each(["quiet", "highlights"] as const)("layout %s parses as itself", (layout) => {
    expect(schema.parse({ ...HIGHLIGHTS, layout }).layout).toBe(layout);
  });

  it.each<[string, unknown]>([
    ["layout", "loud"],
    ["theme_words", [{ key: "Bad Key", label_i18n: { ar: "x" } }]],
    ["theme_words", [{ key: "longevity", label_i18n: { ar: "x" }, match_terms: ["ث"] }]],
    ["visible_count", 0],
    ["visible_count", 7],
    ["form_entry", "never"],
    ["heading_style", "huge"],
    ["review_curation", [{ ...CURATION, review_id: "not-a-uuid" }]],
  ])("a bad %s (%j) falls back to absent", (key, value) => {
    const parsed = schema.parse({ ...HIGHLIGHTS, [key]: value });
    expect(parsed[key as keyof typeof parsed]).toBeUndefined();
    expect(parsed.show_form).toBe(true);
  });

  it.each<[string, unknown]>([
    ["rank", 0],
    ["tags", ["Not Ok"]],
    ["highlight", "ab"],
    ["reply_i18n", "plain"],
  ])("a bad curation %s (%j) drops only that field", (key, value) => {
    const parsed = schema.parse({ ...HIGHLIGHTS, review_curation: [{ ...CURATION, [key]: value }] });
    const item = parsed.review_curation?.[0];
    expect(item?.[key as keyof typeof item]).toBeUndefined();
    expect(item?.review_id).toBe(AHMED);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/_product-reviews-highlights-props.test.ts
```
Expected: `Tests  6 failed | 9 passed (15)`. Today `layout` has no `"highlights"` (the config falls back to absent) and zod strips the unknown keys; the "falls back to absent" cases pass trivially.

- [ ] **Step 3: Add the props**

In `packages/sections/src/product_reviews.tsx`, replace:
```ts
import { i18nStringOptional } from "./_schema";
```
with:
```ts
import { i18nStringOptional, i18nStringSchema } from "./_schema";
```

Replace:
```ts
  /** Opt-in quieter PDP layout: one hairline summary card (big average,
   *  star bars, «N تقييم»), each review as a quiet card, and the form
   *  folded behind a modest «اكتب تقييمك» button. Absent means the
   *  historical layout, byte-identical. */
  layout: z.enum(["quiet"]).optional().catch(undefined),
});
```
with:
```ts
  /** Opt-in quieter PDP layout: one hairline summary card (big average,
   *  star bars, «N تقييم»), each review as a quiet card, and the form
   *  folded behind a modest «اكتب تقييمك» button. "highlights" (opt-in,
   *  spec §1.6): a light summary card (`#reviews-summary`), word buttons
   *  that highlight and never filter, a featured review, compact cards
   *  with a key phrase marked, «رد {store}» replies, and the rest behind
   *  «شوف كل التقييمات (N)». Absent means the historical layout,
   *  byte-identical. */
  layout: z.enum(["quiet", "highlights"]).optional().catch(undefined),
  /** Highlights: the topics buyers mention. A review counts once per
   *  topic when its body contains one of `match_terms` (folded substring
   *  match) or its curation `tags` hold the key. A topic with no hits is
   *  not drawn. */
  theme_words: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z][a-z0-9_]{0,30}$/),
        label_i18n: i18nStringSchema,
        // Optional so a topic can be tag-only, e.g. «طلبوا مرة ثانية».
        match_terms: z.array(z.string().min(2)).min(1).max(8).optional(),
      }),
    )
    .max(6)
    .optional()
    .catch(undefined),
  /** Highlights: cards shown before «شوف كل التقييمات». Default 3. */
  visible_count: z.number().int().min(1).max(6).optional().catch(undefined),
  /** "hash_only": the write-review entry and form render only for a
   *  visitor who arrives on #reviews (the order tracker's link). */
  form_entry: z.enum(["always", "hash_only"]).optional().catch(undefined),
  heading_style: z.enum(["section", "chapter"]).optional().catch(undefined),
  /** Highlights: merchant curation per approved review, until Phase 2
   *  stores it on product_reviews (pinned_rank, tags, highlight_quote,
   *  reply_body). `rank` pins the order (1 first); `highlight` is the
   *  key phrase, used only when it is a verbatim part of the body;
   *  `reply_i18n` is the store's public reply («رد {store}»), drawn only
   *  when it has text. A bad field drops only that field. */
  review_curation: z
    .array(
      z.object({
        review_id: z.string().uuid(),
        rank: z.number().int().min(1).max(20).optional().catch(undefined),
        tags: z
          .array(z.string().regex(/^[a-z][a-z0-9_]{0,30}$/))
          .max(6)
          .optional()
          .catch(undefined),
        highlight: z.string().min(3).max(200).optional().catch(undefined),
        reply_i18n: i18nStringOptional.catch(undefined),
      }),
    )
    .max(40)
    .optional()
    .catch(undefined),
});
```

- [ ] **Step 4: Run the test and every reviews baseline**

```bash
CI=true pnpm exec vitest run packages/sections/src/_product-reviews-highlights-props.test.ts packages/sections/src/_product-reviews-baseline-snapshot.test.tsx packages/sections/src/_product-reviews-quiet.test.tsx packages/sections/src/_pdp-reviews-faq-baseline-snapshot.test.tsx
```
Expected: `Test Files  4 passed (4)`, `Tests  48 passed (48)` (15 + 11 + 18 + 4), no `written`/`updated`.

- [ ] **Step 5: Type gate, then commit**

Run the sections type gate. Expected: no output.
```bash
git branch --show-current
git add packages/sections/src/product_reviews.tsx packages/sections/src/_product-reviews-highlights-props.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): product_reviews highlights props (opt-in): theme words, curation, hash-only form, chapter heading" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The highlights chrome strings

**Files:**
- Modify: `packages/sections/src/product_reviews/strings.ts`
- Test: `packages/sections/src/product_reviews/strings.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/sections/src/product_reviews/strings.test.ts`, replace:
```ts
import { reviewCount, rs } from "./strings";
```
with:
```ts
import { REVIEW_STRINGS, reviewCount, rs } from "./strings";
```

Append to the end of the file:
```ts

describe("REVIEW_STRINGS — highlights", () => {
  it("fills the summary, show-all and reply lines", () => {
    expect(rs("ofReviews", "ar", { count: "6 تقييمات" })).toBe("من 6 تقييمات");
    expect(rs("showAll", "ar", { count: 6 })).toBe("شوف كل التقييمات (6)");
    expect(rs("storeReply", "ar", { store: "شنايدر" })).toBe("رد شنايدر");
    expect(rs("storeReply", "en", { store: "Scheniders" })).toBe("Reply from Scheniders");
  });

  it("every entry has ar, en and ku", () => {
    for (const entry of Object.values(REVIEW_STRINGS)) {
      expect(Object.keys(entry).sort()).toEqual(["ar", "en", "ku"]);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/product_reviews/strings.test.ts
```
Expected: `Tests  1 failed | 4 passed (5)` — "fills the summary, show-all and reply lines" (the keys do not exist yet; `rs` returns "").

- [ ] **Step 3: Add the strings**

In `packages/sections/src/product_reviews/strings.ts`, replace:
```ts
// Chrome strings for the product_reviews quiet layout: generic UI text,
// never merchant claims (the heading comes from props). Every entry
// carries ar, en and ku, guarded by _kurdish-coverage.
```
with:
```ts
// Chrome strings for the product_reviews quiet and highlights layouts:
// generic UI text, never merchant claims (the heading, the topic labels
// and the store's replies come from props). Every entry carries ar, en
// and ku, guarded by _kurdish-coverage. The highlights summary counts
// reviews with the identity row's plural forms (`reviewCountLabel`), so
// both say «6 تقييمات»; the quiet layout keeps «{count} تقييم».
```

Replace:
```ts
  reviewPhoto: { en: "Review photo {n}", ar: "صورة التقييم {n}", ku: "وێنەی هەڵسەنگاندن {n}" },
} as const;
```
with:
```ts
  reviewPhoto: { en: "Review photo {n}", ar: "صورة التقييم {n}", ku: "وێنەی هەڵسەنگاندن {n}" },
  // layout "highlights" (spec §1.6). `{count}` in ofReviews is the whole
  // plural-correct count («6 تقييمات»), not a bare number.
  ofReviews: { en: "from {count}", ar: "من {count}", ku: "لە {count}" },
  themesLabel: { en: "Mentioned most", ar: "أكثر شي ذكروه", ku: "زۆرترین شت کە باسیان کرد" },
  showAll: {
    en: "See all reviews ({count})",
    ar: "شوف كل التقييمات ({count})",
    ku: "هەموو هەڵسەنگاندنەکان ببینە ({count})",
  },
  readMoreInline: { en: "More", ar: "كمّل", ku: "زیاتر" },
  storeReply: { en: "Reply from {store}", ar: "رد {store}", ku: "وەڵامی {store}" },
  emptyHighlights: {
    en: "No reviews on this perfume yet",
    ar: "بعد ماكو تقييمات على هذا العطر",
    ku: "هێشتا هیچ هەڵسەنگاندنێک لەسەر ئەم بۆنە نییە",
  },
} as const;
```
(ar are spec §1.6's strings and concept A's «أكثر شي ذكروه»; every en and ku is drafted here for Ali's copy review, to-dos 8 and 10.)

- [ ] **Step 4: Run it and the Kurdish coverage**

```bash
CI=true pnpm exec vitest run packages/sections/src/product_reviews/strings.test.ts packages/sections/src/_kurdish-coverage.test.ts
```
Expected: `Test Files  2 passed (2)`, `Tests  16 passed (16)` (strings 5; coverage 11).

- [ ] **Step 5: Type gate, then commit**

Run the sections type gate. Expected: no output.
```bash
git branch --show-current
git add packages/sections/src/product_reviews/strings.ts packages/sections/src/product_reviews/strings.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): reviews highlights chrome strings (ar/en/ku)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Where the yellow goes — key phrase, words, mark runs

**Files:**
- Create: `packages/sections/src/product_reviews/marks.ts`
- Test: `packages/sections/src/product_reviews/marks.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/product_reviews/marks.test.ts`:

```ts
// Where the yellow lands in a review: the key phrase (merchant pick, else
// the first 3–14-word clause that names a topic) and the pressed topic's
// words, cut into flagged runs.

import { describe, expect, it } from "vitest";
import { WAYFER_REVIEWS } from "../_pdp-wayfer-fixtures";
import { clauseRanges, keyPhraseRange, markSegments, mergeRanges, widenToWords } from "./marks";

const TERMS = ["ثبات", "تيستر", "فخم", "تغليف", "علبه"];

function bodyOf(name: string): string {
  const r = WAYFER_REVIEWS.find((x) => x.author_name === name);
  if (!r?.body) throw new Error(`no review by ${name}`);
  return r.body;
}

function slice(text: string, r: { start: number; end: number } | null): string | null {
  return r ? text.slice(r.start, r.end) : null;
}

describe("keyPhraseRange", () => {
  it("the merchant's pick wins when it is a verbatim part of the body", () => {
    const body = bodyOf("Ahmed");
    const pick = "العطر كلش راقي وثباته يطول يوم كامل على الملابس";
    expect(slice(body, keyPhraseRange(body, pick, TERMS))).toBe(pick);
  });

  it("a pick that is not in the body is ignored (falls back to the rule)", () => {
    const body = bodyOf("مصطفى علي");
    expect(slice(body, keyPhraseRange(body, "ثباته خرافي", TERMS))).toBe(
      "جربت التيستر اول شي وكلش عجبتنئ ريحته",
    );
  });

  it("rule: the first 3–14-word clause that names a topic", () => {
    const body = bodyOf("احمد الشمري");
    expect(slice(body, keyPhraseRange(body, undefined, TERMS))).toBe(
      "بس وصلتني العلبة مرتبة والتيستر فكرة تخبل",
    );
  });

  it("a review with no punctuation is one long clause: no mark", () => {
    // Ahmed's 40-word body has no clause break.
    expect(keyPhraseRange(bodyOf("Ahmed"), undefined, TERMS)).toBeNull();
  });

  it("no topic word and no pick: no mark", () => {
    expect(keyPhraseRange(bodyOf("ياسين"), undefined, TERMS)).toBeNull();
    expect(keyPhraseRange(bodyOf("ياسين"), undefined, [])).toBeNull();
  });
});

describe("clauseRanges", () => {
  it("splits on . ، ! ؟ and newline, trimmed", () => {
    const text = "اول. ثاني، ثالث! رابع؟\nخامس";
    expect(clauseRanges(text).map((r) => text.slice(r.start, r.end))).toEqual([
      "اول",
      "ثاني",
      "ثالث",
      "رابع",
      "خامس",
    ]);
  });
});

describe("widenToWords / mergeRanges", () => {
  it("grows a hit to its word", () => {
    const text = "العطر صدمني بثباته اهنيكم";
    const at = text.indexOf("ثبات");
    expect(slice(text, widenToWords(text, { start: at, end: at + 4 }))).toBe("بثباته");
  });

  it("joins overlapping and touching ranges", () => {
    expect(mergeRanges([{ start: 5, end: 9 }, { start: 0, end: 3 }, { start: 3, end: 4 }, { start: 8, end: 12 }])).toEqual([
      { start: 0, end: 4 },
      { start: 5, end: 12 },
    ]);
  });
});

describe("markSegments", () => {
  it("cuts at every edge and flags each run", () => {
    const text = "aaa bbb ccc ddd";
    expect(markSegments(text, { start: 4, end: 11 }, [{ start: 8, end: 15 }])).toEqual([
      { text: "aaa ", key: false, term: false },
      { text: "bbb ", key: true, term: false },
      { text: "ccc", key: true, term: true },
      { text: " ddd", key: false, term: true },
    ]);
  });

  it("no marks: one plain run", () => {
    expect(markSegments("نص", null, [])).toEqual([{ text: "نص", key: false, term: false }]);
  });

  it("the runs join back to the body, unchanged", () => {
    const body = bodyOf("eng. سيف");
    const runs = markSegments(body, keyPhraseRange(body, undefined, TERMS), [{ start: 10, end: 40 }]);
    expect(runs.map((r) => r.text).join("")).toBe(body);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/product_reviews/marks.test.ts
```
Expected: `Error: Failed to load url ./marks`, `Test Files  1 failed (1)`, `Tests  no tests`.

- [ ] **Step 3: Write the module**

Create `packages/sections/src/product_reviews/marks.ts`:

```ts
// =====================================================================
// product_reviews highlights — where the yellow goes in a review body
// =====================================================================
// Two kinds of mark land on the same text (spec §1.6, concept g3 A + B):
//   - the key phrase: one stretch per review, a low-alpha tint that is
//     always on. The merchant's pick (`review_curation[].highlight`) wins
//     when it is a verbatim part of the body; else the first clause that
//     names a topic, when that clause is 3–14 words (the scent quote's
//     rule: a body with no punctuation is one clause, and marking a whole
//     review is not a key phrase); else nothing;
//   - topic marks: while a word button is pressed, every word that
//     contains one of its terms. A hit is widened to the whole word, so a
//     <mark> never splits an Arabic word (and its joined letters) in two.
// `markSegments` cuts the body into runs that carry either flag, so the
// renderer only maps runs to elements. Offsets are UTF-16 source offsets,
// as `findTermHits` returns them.
// =====================================================================

import { findTermHits } from "../helpers/arabic-text";

export interface TextRange {
  start: number;
  end: number;
}

export interface MarkSegment {
  text: string;
  /** Inside the review's key phrase. */
  key: boolean;
  /** Inside a word the pressed topic matched. */
  term: boolean;
}

/** Characters that end a word: whitespace and the punctuation reviews use. */
const WORD_BREAK = /[\s.,!?؟،؛:«»()"'…]/u;

/** Characters that end a clause. */
const CLAUSE_BREAK = /[.،!؟\n]/u;

/** `range` grown to the whole words it touches. */
export function widenToWords(text: string, range: TextRange): TextRange {
  let start = range.start;
  let end = range.end;
  while (start > 0 && !WORD_BREAK.test(text.charAt(start - 1))) start -= 1;
  while (end < text.length && !WORD_BREAK.test(text.charAt(end))) end += 1;
  return { start, end };
}

/** Sorted, with overlapping or touching ranges joined. */
export function mergeRanges(ranges: readonly TextRange[]): TextRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: TextRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/** The body's clauses (split on «.» «،» «!» «؟» and newline), trimmed,
 *  as source ranges; empty clauses are skipped. */
export function clauseRanges(text: string): TextRange[] {
  const out: TextRange[] = [];
  let from = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i < text.length && !CLAUSE_BREAK.test(text.charAt(i))) continue;
    let start = from;
    let end = i;
    while (start < end && /\s/u.test(text.charAt(start))) start += 1;
    while (end > start && /\s/u.test(text.charAt(end - 1))) end -= 1;
    if (end > start) out.push({ start, end });
    from = i + 1;
  }
  return out;
}

function wordCount(text: string): number {
  return text.split(/\s+/u).filter(Boolean).length;
}

/** The review's key phrase as a source range, or null. */
export function keyPhraseRange(
  body: string,
  curated: string | undefined,
  terms: readonly string[],
): TextRange | null {
  const pick = curated?.trim();
  if (pick) {
    const at = body.indexOf(pick);
    if (at >= 0) return { start: at, end: at + pick.length };
  }
  if (terms.length === 0) return null;
  for (const clause of clauseRanges(body)) {
    const text = body.slice(clause.start, clause.end);
    const words = wordCount(text);
    if (words < 3 || words > 14) continue;
    if (findTermHits(text, terms).length > 0) return clause;
  }
  return null;
}

/** `text` cut into runs at every mark edge, each run flagged. */
export function markSegments(
  text: string,
  key: TextRange | null,
  terms: readonly TextRange[],
): MarkSegment[] {
  const merged = mergeRanges(terms);
  const edges = new Set<number>([0, text.length]);
  if (key) {
    edges.add(key.start);
    edges.add(key.end);
  }
  for (const r of merged) {
    edges.add(r.start);
    edges.add(r.end);
  }
  const cuts = [...edges].filter((n) => n >= 0 && n <= text.length).sort((a, b) => a - b);
  const out: MarkSegment[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const start = cuts[i] ?? 0;
    const end = cuts[i + 1] ?? start;
    if (end <= start) continue;
    const inKey = key !== null && start >= key.start && end <= key.end;
    const inTerm = merged.some((r) => start >= r.start && end <= r.end);
    const prev = out[out.length - 1];
    if (prev && prev.key === inKey && prev.term === inTerm) prev.text += text.slice(start, end);
    else out.push({ text: text.slice(start, end), key: inKey, term: inTerm });
  }
  return out;
}
```

- [ ] **Step 4: Run it**

```bash
CI=true pnpm exec vitest run packages/sections/src/product_reviews/marks.test.ts
```
Expected: `Tests  11 passed (11)`.

- [ ] **Step 5: Type gate, then commit**

Run the sections type gate. Expected: no output.
```bash
git branch --show-current
git add packages/sections/src/product_reviews/marks.ts packages/sections/src/product_reviews/marks.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): review key phrase + whole-word topic marks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Topic counts and D10 order

**Files:**
- Create: `packages/sections/src/product_reviews/theme-words.ts`, `packages/sections/src/product_reviews/featured-order.ts`
- Test: `packages/sections/src/product_reviews/theme-words.test.ts`, `packages/sections/src/product_reviews/featured-order.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/sections/src/product_reviews/theme-words.test.ts`:

```ts
// The word buttons' counts on Wayfarer's six live reviews (spec §1.6:
// 3 / 2 / 2 / 2), a tag-only topic, and the words a pressed topic marks.

import { describe, expect, it } from "vitest";
import { WAYFER_REVIEWS } from "../_pdp-wayfer-fixtures";
import { reviewThemes, themeCounts, themeWordRanges, type ThemeWord } from "./theme-words";

const THEMES: ThemeWord[] = [
  { key: "longevity", label_i18n: { ar: "الثبات" }, match_terms: ["ثبات"] },
  { key: "tester", label_i18n: { ar: "التيستر" }, match_terms: ["تيستر"] },
  { key: "luxury", label_i18n: { ar: "فخامة" }, match_terms: ["فخم"] },
  { key: "packaging", label_i18n: { ar: "العلبة والتغليف" }, match_terms: ["تغليف", "علبه"] },
];

const noTags = () => [];

function byAuthor(name: string) {
  const r = WAYFER_REVIEWS.find((x) => x.author_name === name);
  if (!r) throw new Error(`no review by ${name}`);
  return r;
}

describe("themeCounts", () => {
  it("Wayfarer: الثبات 3 · التيستر 2 · فخامة 2 · العلبة والتغليف 2", () => {
    expect(themeCounts(WAYFER_REVIEWS, THEMES, noTags).map((t) => [t.key, t.count])).toEqual([
      ["longevity", 3],
      ["tester", 2],
      ["luxury", 2],
      ["packaging", 2],
    ]);
  });

  it("counts a review once per topic, however often it says the word", () => {
    // eng. سيف says ثبات twice.
    expect(themeCounts([byAuthor("eng. سيف")], THEMES, noTags)).toEqual([
      { key: "longevity", label_i18n: { ar: "الثبات" }, count: 1 },
    ]);
  });

  it("a topic without match_terms counts only tagged reviews, and hides at 0", () => {
    const reorder: ThemeWord = { key: "reorder", label_i18n: { ar: "طلبوا مرة ثانية" } };
    expect(themeCounts(WAYFER_REVIEWS, [reorder], noTags)).toEqual([]);
    const tagged = new Set([byAuthor("حازم السيد").id, byAuthor("ياسين").id]);
    const tagsOf = (id: string) => (tagged.has(id) ? ["reorder"] : []);
    expect(themeCounts(WAYFER_REVIEWS, [reorder], tagsOf)).toEqual([
      { key: "reorder", label_i18n: { ar: "طلبوا مرة ثانية" }, count: 2 },
    ]);
  });
});

describe("reviewThemes", () => {
  it("folded substring: «بثباته», «والتيستر», «العلبة», «تغليفهم» all count", () => {
    expect([...reviewThemes(byAuthor("مصطفى علي").body, [], THEMES)]).toEqual(["longevity", "tester"]);
    expect([...reviewThemes(byAuthor("احمد الشمري").body, [], THEMES)]).toEqual([
      "tester",
      "luxury",
      "packaging",
    ]);
    expect([...reviewThemes(byAuthor("حازم السيد").body, [], THEMES)]).toEqual(["luxury", "packaging"]);
    expect([...reviewThemes(byAuthor("ياسين").body, [], THEMES)]).toEqual([]);
  });
});

describe("themeWordRanges", () => {
  it("marks whole words, never part of one", () => {
    const body = byAuthor("مصطفى علي").body ?? "";
    const words = themeWordRanges(body, THEMES[0]).map((r) => body.slice(r.start, r.end));
    expect(words).toEqual(["بثباته"]);
  });

  it("every hit of the topic, in reading order", () => {
    const body = byAuthor("eng. سيف").body ?? "";
    const words = themeWordRanges(body, THEMES[0]).map((r) => body.slice(r.start, r.end));
    expect(words).toEqual(["الثبات", "ثبات"]);
  });

  it("a tag-only topic marks no words", () => {
    expect(themeWordRanges("هذا ثاني عطر", { key: "reorder", label_i18n: { ar: "x" } })).toEqual([]);
    expect(themeWordRanges("هذا ثاني عطر", undefined)).toEqual([]);
  });
});
```

Create `packages/sections/src/product_reviews/featured-order.test.ts`:

```ts
// D10 on Wayfarer's six live reviews: احمد الشمري → حازم السيد → مصطفى علي
// → eng. سيف → ياسين → Ahmed (3★), with the 3★ forced into the visible set
// and kept last when the rest expand. Pins (`rank`) come first.

import { describe, expect, it } from "vitest";
import { WAYFER_REVIEWS } from "../_pdp-wayfer-fixtures";
import { featuredOrder } from "./featured-order";
import { reviewThemes, type ThemeWord } from "./theme-words";

const THEMES: ThemeWord[] = [
  { key: "longevity", label_i18n: { ar: "الثبات" }, match_terms: ["ثبات"] },
  { key: "tester", label_i18n: { ar: "التيستر" }, match_terms: ["تيستر"] },
  { key: "luxury", label_i18n: { ar: "فخامة" }, match_terms: ["فخم"] },
  { key: "packaging", label_i18n: { ar: "العلبة والتغليف" }, match_terms: ["تغليف", "علبه"] },
];

const themeCountOf = (r: { body?: string | null }) => reviewThemes(r.body, [], THEMES).size;
const noRank = () => undefined;
const names = (list: readonly { author_name?: string | null }[]) => list.map((r) => r.author_name);

describe("featuredOrder (D10)", () => {
  it("Wayfarer, visible_count 3: two strongest, then Ahmed; expanded keeps Ahmed last", () => {
    const { visible, all } = featuredOrder(WAYFER_REVIEWS, { visibleCount: 3, rankOf: noRank, themeCountOf });
    expect(names(visible)).toEqual(["احمد الشمري", "حازم السيد", "Ahmed"]);
    expect(names(all)).toEqual(["احمد الشمري", "حازم السيد", "مصطفى علي", "eng. سيف", "ياسين", "Ahmed"]);
  });

  it("the visible cards keep their place when the rest expand", () => {
    const { visible, all } = featuredOrder(WAYFER_REVIEWS, { visibleCount: 3, rankOf: noRank, themeCountOf });
    expect(all.slice(0, 2)).toEqual(visible.slice(0, 2));
    expect(all[all.length - 1]).toBe(visible[visible.length - 1]);
  });

  it("visible_count 1: the strongest only, never the low one alone", () => {
    expect(names(featuredOrder(WAYFER_REVIEWS, { visibleCount: 1, rankOf: noRank, themeCountOf }).visible)).toEqual([
      "احمد الشمري",
    ]);
  });

  it("visible_count 6: everything, Ahmed last, nothing hidden", () => {
    const { visible, all } = featuredOrder(WAYFER_REVIEWS, { visibleCount: 6, rankOf: noRank, themeCountOf });
    expect(visible).toEqual(all);
    expect(names(visible).at(-1)).toBe("Ahmed");
  });

  it("defaults to 3 visible", () => {
    expect(featuredOrder(WAYFER_REVIEWS, { rankOf: noRank, themeCountOf }).visible).toHaveLength(3);
  });

  it("all 4★ and up: the top N, no forcing", () => {
    const fives = WAYFER_REVIEWS.filter((r) => r.rating >= 4);
    expect(names(featuredOrder(fives, { visibleCount: 3, rankOf: noRank, themeCountOf }).visible)).toEqual([
      "احمد الشمري",
      "حازم السيد",
      "مصطفى علي",
    ]);
  });

  it("a pin (rank) comes before the D10 order", () => {
    const saif = WAYFER_REVIEWS.find((r) => r.author_name === "eng. سيف")?.id;
    const rankOf = (id: string) => (id === saif ? 1 : undefined);
    expect(names(featuredOrder(WAYFER_REVIEWS, { visibleCount: 3, rankOf, themeCountOf }).visible)).toEqual([
      "eng. سيف",
      "احمد الشمري",
      "Ahmed",
    ]);
  });

  it("equal reviews keep one order, whatever order they arrive in", () => {
    const reversed = [...WAYFER_REVIEWS].reverse();
    expect(featuredOrder(reversed, { visibleCount: 3, rankOf: noRank, themeCountOf: () => 0 }).all).toEqual(
      featuredOrder(WAYFER_REVIEWS, { visibleCount: 3, rankOf: noRank, themeCountOf: () => 0 }).all,
    );
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
CI=true pnpm exec vitest run packages/sections/src/product_reviews/theme-words.test.ts packages/sections/src/product_reviews/featured-order.test.ts
```
Expected: `Error: Failed to load url ./theme-words` (both files import it), `Test Files  2 failed (2)`, `Tests  no tests`.

- [ ] **Step 3: Write the modules**

Create `packages/sections/src/product_reviews/theme-words.ts`:

```ts
// =====================================================================
// product_reviews highlights — the word buttons («الثبات 3 · التيستر 2 …»)
// =====================================================================
// A topic is one of the merchant's `theme_words`. A review mentions it
// when its body contains one of the topic's `match_terms` (folded
// SUBSTRING match through `findTermHits`: «بثباته» counts for «ثبات»,
// «العلبة» for «علبه»), or when the review's curation tags hold the
// topic's key (a tag-only topic such as «طلبوا مرة ثانية»). Each review
// counts once per topic. The counts are honest by construction: computed
// from the rendered reviews at render time, never stored.
// =====================================================================

import type { I18nString } from "@scheniders/shared";
import { findTermHits } from "../helpers/arabic-text";
import { mergeRanges, widenToWords, type TextRange } from "./marks";

export interface ThemeWord {
  key: string;
  label_i18n: I18nString;
  match_terms?: string[];
}

export interface ThemeCount {
  key: string;
  label_i18n: I18nString;
  count: number;
}

/** The topic keys one review mentions. */
export function reviewThemes(
  body: string | null | undefined,
  tags: readonly string[],
  themes: readonly ThemeWord[],
): Set<string> {
  const text = body ?? "";
  const out = new Set<string>();
  for (const theme of themes) {
    const byText = (theme.match_terms ?? []).length > 0 && findTermHits(text, theme.match_terms ?? []).length > 0;
    if (byText || tags.includes(theme.key)) out.add(theme.key);
  }
  return out;
}

/** Per topic, in the merchant's order, how many reviews mention it.
 *  Topics nobody mentions are left out (they never render). */
export function themeCounts(
  reviews: readonly { id: string; body?: string | null }[],
  themes: readonly ThemeWord[],
  tagsOf: (reviewId: string) => readonly string[],
): ThemeCount[] {
  return themes
    .map((theme) => ({
      key: theme.key,
      label_i18n: theme.label_i18n,
      count: reviews.filter((r) => reviewThemes(r.body, tagsOf(r.id), [theme]).has(theme.key)).length,
    }))
    .filter((t) => t.count > 0);
}

/** Every word of `body` that contains one of `theme`'s terms, merged.
 *  A tag-only topic has no words to mark: it marks the card instead. */
export function themeWordRanges(body: string, theme: ThemeWord | undefined): TextRange[] {
  const terms = theme?.match_terms ?? [];
  if (terms.length === 0) return [];
  return mergeRanges(findTermHits(body, terms).map((h) => widenToWords(body, h)));
}
```

Create `packages/sections/src/product_reviews/featured-order.ts`:

```ts
// =====================================================================
// product_reviews highlights — which review goes where (spec D10)
// =====================================================================
// Order: the merchant's pin (`rank`, 1 first; unpinned after) — then
// rating desc, then how many topics the review mentions desc, then body
// length desc, then id (so equal reviews never swap between renders: all
// six imports share one created_at).
//
// The visible set honours the low review instead of hiding it: with
// `visible_count` N ≥ 2 and a review under 4★ that would fall outside the
// first N, the list shows the first N − 1 plus that review (the lowest-
// rated; on a tie the later one), and «شوف كل» inserts the rest BEFORE it,
// so it is last in both states and the visible cards never move. N = 1
// shows only the first review: a single card is never the low one.
// =====================================================================

export interface OrderableReview {
  id: string;
  rating: number;
  body?: string | null;
}

export interface FeaturedOrder<T> {
  /** Cards drawn before «شوف كل». */
  visible: T[];
  /** Every card, in the expanded order. */
  all: T[];
}

export const DEFAULT_VISIBLE_COUNT = 3;

export function featuredOrder<T extends OrderableReview>(
  reviews: readonly T[],
  opts: {
    visibleCount?: number;
    rankOf: (id: string) => number | undefined;
    themeCountOf: (review: T) => number;
  },
): FeaturedOrder<T> {
  const n = opts.visibleCount ?? DEFAULT_VISIBLE_COUNT;
  const sorted = [...reviews].sort((a, b) => {
    const ra = opts.rankOf(a.id) ?? Number.POSITIVE_INFINITY;
    const rb = opts.rankOf(b.id) ?? Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    if (a.rating !== b.rating) return b.rating - a.rating;
    const ta = opts.themeCountOf(a);
    const tb = opts.themeCountOf(b);
    if (ta !== tb) return tb - ta;
    const la = (a.body ?? "").length;
    const lb = (b.body ?? "").length;
    if (la !== lb) return lb - la;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  let low: T | null = null;
  for (const r of sorted) {
    if (r.rating < 4 && (low === null || r.rating <= low.rating)) low = r;
  }
  const lowAt = low === null ? -1 : sorted.indexOf(low);
  if (n < 2 || low === null || lowAt < n) {
    return { visible: sorted.slice(0, n), all: sorted };
  }
  const rest = sorted.filter((r) => r !== low);
  return {
    visible: [...rest.slice(0, n - 1), low],
    all: [...rest, low],
  };
}
```

- [ ] **Step 4: Run them**

```bash
CI=true pnpm exec vitest run packages/sections/src/product_reviews/theme-words.test.ts packages/sections/src/product_reviews/featured-order.test.ts
```
Expected: `Test Files  2 passed (2)`, `Tests  15 passed (15)` (7 + 8). The counts are spec §1.10's «3/2/2/2 on the six live bodies»; the order is D10's احمد الشمري → حازم السيد → مصطفى علي → eng. سيف → ياسين → Ahmed.

- [ ] **Step 5: Type gate, then commit**

Run the sections type gate. Expected: no output.
```bash
git branch --show-current
git add packages/sections/src/product_reviews/theme-words.ts packages/sections/src/product_reviews/theme-words.test.ts packages/sections/src/product_reviews/featured-order.ts packages/sections/src/product_reviews/featured-order.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): review topic counts (folded substring) and D10 featured order" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The highlights layout (summary card, cards, word buttons, «شوف كل») and the client wiring

**Files:**
- Create: `packages/sections/src/product_reviews/highlights-summary.tsx`, `packages/sections/src/product_reviews/highlights-card.tsx`, `packages/sections/src/product_reviews/highlights-view.tsx`
- Modify: `packages/sections/src/product_reviews.client.tsx` (header comment, imports, `hashOnly`, `headingEl` / `entryButton` / `foldedForm`, the highlights branch, the quiet and historical headings and forms)
- Test: `packages/sections/src/_product-reviews-highlights.test.tsx` (server markup), `packages/sections/src/_product-reviews-highlights-dom.test.tsx` (jsdom)

- [ ] **Step 1: Write the failing markup test**

Create `packages/sections/src/_product-reviews-highlights.test.tsx`:

```tsx
// =====================================================================
// product_reviews `layout: "highlights"` — server markup (spec §1.6)
// =====================================================================
// Wayfarer's six live reviews through the real section render: the
// summary card is the #reviews-summary target with «4.7», exact stars and
// «من 6 تقييمات»; the word buttons read 3/2/2/2; the cards come in D10
// order with Ahmed's 3★ last; key phrases are tinted; a reply renders
// only when the merchant wrote one; `hash_only` keeps the form out. The
// opted-out layouts are pinned by the baseline snapshots.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocaleCode } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import product_reviews from "./product_reviews";
import type { Product } from "./types";
import { productCtx, productRuntime } from "./_pdp-fixtures";
import { IRAQ_REDESIGN_TENANT } from "./_pdp-redesign-fixtures";
import { WAYFER_REVIEWS, wayferProduct } from "./_pdp-wayfer-fixtures";

const AHMED = "cd25b071-10d9-4de5-a324-ea6a0793559b";
const AHMED_PHRASE = "العطر كلش راقي وثباته يطول يوم كامل على الملابس";

const HIGHLIGHTS = {
  heading_i18n: { ar: "شنو گالوا اللي جرّبوه", en: "What people who tried it said" },
  show_form: true,
  layout: "highlights",
  form_entry: "hash_only",
  visible_count: 3,
  heading_style: "chapter",
  theme_words: [
    { key: "longevity", label_i18n: { ar: "الثبات", en: "Longevity" }, match_terms: ["ثبات"] },
    { key: "tester", label_i18n: { ar: "التيستر", en: "The tester" }, match_terms: ["تيستر"] },
    { key: "luxury", label_i18n: { ar: "فخامة", en: "Luxury" }, match_terms: ["فخم"] },
    {
      key: "packaging",
      label_i18n: { ar: "العلبة والتغليف", en: "Box and packaging" },
      match_terms: ["تغليف", "علبه"],
    },
  ],
};

function render(input: unknown, product: Product, locale: LocaleCode = "ar"): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <product_reviews.render
        props={product_reviews.schema.parse(input)}
        ctx={productCtx(product, { tenant: IRAQ_REDESIGN_TENANT, runtime: { ...productRuntime, locale } })}
      />
    </StoreBaseProvider>,
  );
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

function cardOrder(html: string): string[] {
  return [...html.matchAll(/data-review-card="([^"]+)"/g)].map((m) => {
    const r = WAYFER_REVIEWS.find((x) => x.id === m[1]);
    return r?.author_name ?? "?";
  });
}

describe("summary card", () => {
  const html = render(HIGHLIGHTS, wayferProduct);

  it("is the #reviews-summary target, inside #reviews", () => {
    expect(count(html, 'id="reviews-summary"')).toBe(1);
    expect(html.indexOf('id="reviews"')).toBeLessThan(html.indexOf('id="reviews-summary"'));
  });

  it("prints «4.7» and draws the same number with exact stars", () => {
    expect(html).toContain("<bdi>4.7</bdi>");
    expect(html).toContain('aria-label="التقييم 4.7 من 5"');
  });

  it("«من 6 تقييمات», plural-correct", () => {
    expect(html).toContain("من 6 تقييمات");
  });

  it("five amber bars from the real counts", () => {
    expect(count(html, "data-star-count=")).toBe(5);
    expect(html).toContain('data-star-count="5">5<');
    expect(html).toContain('data-star-count="3">1<');
    expect(count(html, "bg-bk-accent")).toBe(5);
  });
});

describe("word buttons", () => {
  const html = render(HIGHLIGHTS, wayferProduct);

  it("الثبات 3 · التيستر 2 · فخامة 2 · العلبة والتغليف 2, none pressed", () => {
    const buttons = [...html.matchAll(/data-theme-word="([a-z]+)" aria-pressed="false"[^>]*><span>([^<]+)<\/span><bdi[^>]*>(\d+)<\/bdi>/g)].map(
      (m) => `${m[2]} ${m[3]}`,
    );
    expect(buttons).toEqual(["الثبات 3", "التيستر 2", "فخامة 2", "العلبة والتغليف 2"]);
  });

  it("are hidden when fewer than two topics have a hit", () => {
    const one = { ...HIGHLIGHTS, theme_words: HIGHLIGHTS.theme_words.slice(0, 1) };
    expect(render(one, wayferProduct)).not.toContain("data-theme-word=");
  });
});

describe("cards", () => {
  it("D10: the two strongest, then Ahmed's 3★; the first is featured", () => {
    const html = render(HIGHLIGHTS, wayferProduct);
    expect(cardOrder(html)).toEqual(["احمد الشمري", "حازم السيد", "Ahmed"]);
    expect(count(html, "data-featured")).toBe(1);
    expect(html.indexOf("data-featured")).toBeLessThan(html.indexOf("حازم السيد"));
  });

  it("names sit in <bdi>, so «eng. سيف» keeps its order", () => {
    const html = render({ ...HIGHLIGHTS, visible_count: 6 }, wayferProduct);
    expect(html).toContain("<bdi");
    expect(html).toContain(">eng. سيف</bdi>");
  });

  it("key phrases by rule: the first 3–14-word clause naming a topic; none for Ahmed", () => {
    const html = render(HIGHLIGHTS, wayferProduct);
    const marks = [...html.matchAll(/<mark data-key-phrase=""[^>]*>([^<]+)<\/mark>/g)].map((m) => m[1]);
    expect(marks).toEqual([
      "بس وصلتني العلبة مرتبة والتيستر فكرة تخبل",
      "ريحته حمضيات ع انتعاش ع سوسن بالبداية وبعدين تصير فخمة",
    ]);
  });

  it("the merchant's key phrase wins", () => {
    const curated = { ...HIGHLIGHTS, review_curation: [{ review_id: AHMED, highlight: AHMED_PHRASE }] };
    const html = render(curated, wayferProduct);
    expect(html).toContain(`<mark data-key-phrase="" class="rounded-sm text-bk-ink bg-bk-primary/25">${AHMED_PHRASE}</mark>`);
  });

  it("no reply without the merchant's text; «رد شنايدر» with it", () => {
    expect(render(HIGHLIGHTS, wayferProduct)).not.toContain("data-store-reply");
    const replied = {
      ...HIGHLIGHTS,
      review_curation: [{ review_id: AHMED, reply_i18n: { ar: "حقك علينا يا أحمد." } }],
    };
    const html = render(replied, wayferProduct);
    expect(count(html, "data-store-reply")).toBe(1);
    expect(html).toContain("<span>رد شنايدر</span>");
    expect(html).toContain("حقك علينا يا أحمد.");
  });

  it("«شوف كل التقييمات (6)» when cards are hidden; none when all fit", () => {
    expect(render(HIGHLIGHTS, wayferProduct)).toContain("شوف كل التقييمات (6)");
    expect(render({ ...HIGHLIGHTS, visible_count: 6 }, wayferProduct)).not.toContain("data-reviews-show-all");
  });

  it("no dates and no «verified» badge", () => {
    const html = render(HIGHLIGHTS, wayferProduct);
    expect(html).not.toContain("2026-02-24");
    expect(html).not.toContain("موثّق");
  });
});

describe("heading, form and missing data", () => {
  it("heading_style chapter sets the heading at the chapter scale", () => {
    expect(render(HIGHLIGHTS, wayferProduct)).toContain("text-bk-chapter");
    const { heading_style: _h, ...section } = HIGHLIGHTS;
    expect(render(section, wayferProduct)).not.toContain("text-bk-chapter");
  });

  it("hash_only: no «اكتب تقييمك» and no form for a cold visitor", () => {
    const html = render(HIGHLIGHTS, wayferProduct);
    expect(html).not.toContain("data-review-entry");
    expect(html).not.toContain("<form");
  });

  it("form_entry always: the entry button", () => {
    expect(render({ ...HIGHLIGHTS, form_entry: "always" }, wayferProduct)).toContain("data-review-entry");
  });

  it("0 reviews: the honest line, no summary, no buttons", () => {
    const html = render(HIGHLIGHTS, { ...wayferProduct, review_count: 0, avg_rating: 0, reviews: [] });
    expect(html).toContain("بعد ماكو تقييمات على هذا العطر");
    expect(html).not.toContain("reviews-summary");
    expect(html).not.toContain("data-theme-word");
  });

  it("1 review: no bars, no word buttons, no «شوف كل»", () => {
    const one = WAYFER_REVIEWS.filter((r) => r.author_name === "احمد الشمري");
    const html = render(HIGHLIGHTS, { ...wayferProduct, review_count: 1, avg_rating: 5, reviews: one });
    expect(html).toContain('id="reviews-summary"');
    expect(html).not.toContain("data-star-count");
    expect(html).not.toContain("data-theme-word");
    expect(html).not.toContain("data-reviews-show-all");
  });

  it("adds no dir attribute", () => {
    expect(count(render(HIGHLIGHTS, wayferProduct), 'dir="')).toBe(0);
  });

  it("English chrome", () => {
    const html = render(HIGHLIGHTS, wayferProduct, "en");
    expect(html).toContain("from 6 reviews");
    expect(html).toContain("See all reviews (6)");
    expect(html).toContain("Mentioned most");
  });
});
```

- [ ] **Step 2: Write the failing DOM test**

Create `packages/sections/src/_product-reviews-highlights-dom.test.tsx`:

```tsx
// @vitest-environment jsdom
// =====================================================================
// product_reviews highlights — the word buttons, «شوف كل» and «كمّل», in a DOM
// =====================================================================
// A word button highlights and never filters: no card leaves the list,
// a hidden matching review brings the rest into view, the page scrolls
// to the first mark, a second tap clears. «شوف كل» inserts the rest
// before Ahmed's 3★. «كمّل» shows only on a body that overflows its
// clamp. With `hash_only`, #reviews still opens the form.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { StoreBaseProvider } from "./helpers/store-context";
import product_reviews from "./product_reviews";
import { productCtx } from "./_pdp-fixtures";
import { IRAQ_REDESIGN_TENANT } from "./_pdp-redesign-fixtures";
import { WAYFER_REVIEWS, wayferProduct } from "./_pdp-wayfer-fixtures";

const HIGHLIGHTS = {
  heading_i18n: { ar: "شنو گالوا اللي جرّبوه" },
  show_form: true,
  layout: "highlights",
  form_entry: "hash_only",
  visible_count: 3,
  theme_words: [
    { key: "longevity", label_i18n: { ar: "الثبات" }, match_terms: ["ثبات"] },
    { key: "tester", label_i18n: { ar: "التيستر" }, match_terms: ["تيستر"] },
    { key: "luxury", label_i18n: { ar: "فخامة" }, match_terms: ["فخم"] },
    { key: "packaging", label_i18n: { ar: "العلبة والتغليف" }, match_terms: ["تغليف", "علبه"] },
    { key: "reorder", label_i18n: { ar: "طلبوا مرة ثانية" } },
  ],
  review_curation: [
    { review_id: "fcd04048-2a8c-4377-a5c3-2e7f7c20b628", tags: ["reorder"] },
    { review_id: "aeb344f2-8597-45f7-b639-99973d6f1a6f", tags: ["reorder"] },
  ],
};

/** D10 with the reorder tags: حازم and ياسين each count one topic more. */
const EXPANDED = ["احمد الشمري", "حازم السيد", "مصطفى علي", "ياسين", "eng. سيف", "Ahmed"];

const scrollIntoView = vi.fn();

function mount(input: unknown = HIGHLIGHTS) {
  return render(
    <StoreBaseProvider base="/s/fixture-store">
      <product_reviews.render
        props={product_reviews.schema.parse(input)}
        ctx={productCtx(wayferProduct, { tenant: IRAQ_REDESIGN_TENANT })}
      />
    </StoreBaseProvider>,
  );
}

function names(container: HTMLElement): string[] {
  return [...container.querySelectorAll("[data-review-card]")].map(
    (li) => WAYFER_REVIEWS.find((r) => r.id === li.getAttribute("data-review-card"))?.author_name ?? "?",
  );
}

function button(container: HTMLElement, key: string): HTMLElement {
  const b = container.querySelector<HTMLElement>(`[data-theme-word="${key}"]`);
  if (!b) throw new Error(`no button ${key}`);
  return b;
}

beforeEach(() => {
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("word buttons", () => {
  it("a tap marks the topic's words, keeps every card, and scrolls to the first mark", () => {
    const { container } = mount();
    const before = names(container);
    fireEvent.click(button(container, "longevity"));
    expect(button(container, "longevity").getAttribute("aria-pressed")).toBe("true");
    // Ahmed («وثباته») is visible; مصطفى علي and eng. سيف were hidden, so the
    // rest open. (The reorder tags count as a topic: ياسين now outranks سيف.)
    expect(names(container)).toEqual(EXPANDED);
    expect(before).toEqual(["احمد الشمري", "حازم السيد", "Ahmed"]);
    const marked = [...container.querySelectorAll("mark[data-term]")].map((m) => m.textContent);
    expect(marked).toEqual(["بثباته", "الثبات", "ثبات", "وثباته"]);
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("a second tap clears; the list stays open", () => {
    const { container } = mount();
    fireEvent.click(button(container, "longevity"));
    fireEvent.click(button(container, "longevity"));
    expect(button(container, "longevity").getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelectorAll("mark[data-term]")).toHaveLength(0);
    expect(names(container)).toHaveLength(6);
  });

  it("a topic whose hits are all visible does not open the rest", () => {
    const { container } = mount();
    fireEvent.click(button(container, "luxury"));
    expect(names(container)).toEqual(["احمد الشمري", "حازم السيد", "Ahmed"]);
    expect(container.querySelectorAll("mark[data-term]")).toHaveLength(2);
  });

  it("a tag-only topic marks the card edge, not words", () => {
    const { container } = mount();
    fireEvent.click(button(container, "reorder"));
    expect(container.querySelectorAll("mark[data-term]")).toHaveLength(0);
    const edged = [...container.querySelectorAll("[data-term-card]")].map(
      (li) => WAYFER_REVIEWS.find((r) => r.id === li.getAttribute("data-review-card"))?.author_name,
    );
    expect(edged).toEqual(["حازم السيد", "ياسين"]);
  });
});

describe("«شوف كل التقييمات»", () => {
  it("inserts the rest before Ahmed and goes away", () => {
    const { container, getByText } = mount();
    fireEvent.click(getByText("شوف كل التقييمات (6)"));
    expect(names(container)).toEqual(EXPANDED);
    expect(container.querySelector("[data-reviews-show-all]")).toBeNull();
  });
});

describe("«كمّل»", () => {
  it("shows only on a body taller than its clamp, and opens it", () => {
    const tall = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(200);
    const clamp = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(80);
    const { container } = mount();
    const more = container.querySelectorAll("[data-read-more]");
    expect(more).toHaveLength(3);
    const first = more[0];
    if (!(first instanceof HTMLElement)) throw new Error("no «كمّل»");
    fireEvent.click(first);
    expect(container.querySelectorAll("[data-read-more]")).toHaveLength(2);
    expect(container.querySelector("[data-featured] p")?.className).not.toContain("line-clamp");
    tall.mockRestore();
    clamp.mockRestore();
  });

  it("does not show when the body fits", () => {
    const { container } = mount();
    expect(container.querySelectorAll("[data-read-more]")).toHaveLength(0);
  });
});

describe("hash_only", () => {
  it("#reviews opens the form and focuses the first star", () => {
    window.history.replaceState(null, "", "/#reviews");
    const { container } = mount();
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    expect(document.activeElement).toBe(form?.querySelector('[role="radiogroup"] button'));
    expect(container.querySelector("[data-review-entry]")).toBeNull();
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

```bash
CI=true pnpm exec vitest run packages/sections/src/_product-reviews-highlights.test.tsx packages/sections/src/_product-reviews-highlights-dom.test.tsx
```
Expected: both files fail (`highlights` parses since Task 2, but the client has no highlights branch yet, so it renders the historical layout: no `#reviews-summary`, no `data-theme-word`, no `data-review-card`). Only assertions that hold for the historical render pass (e.g. "no dates").

- [ ] **Step 4: Write the summary card**

Create `packages/sections/src/product_reviews/highlights-summary.tsx`:

```tsx
// Highlights summary card (spec §1.6 item 2): one light card, no hairline,
// carrying `id="reviews-summary"` — the target of the identity row's
// rating link and the scent card's footer link, so neither ever lands on
// `#reviews` (which opens the review form). The big number and the exact
// stars come from one value, `displayRating(avg)`: «4.7» and a 70% fifth
// star. «من 6 تقييمات» takes the identity row's plural forms. Amber is
// used only for the stars and the bars (D4). Bars need the real per-star
// counts and at least two reviews. Server-safe: no hooks.

import type { LocaleCode, RatingSummary } from "@scheniders/shared";
import { displayRating } from "../helpers/format";
import { Stars } from "../helpers/primitives";
import { cn } from "../helpers/utils";
import { readsRtl } from "../helpers/reading";
import { reviewCountLabel } from "../pdp_express/identity-label";
import { rs } from "./strings";

const STAR_ROWS = [5, 4, 3, 2, 1] as const;

export const REVIEWS_SUMMARY_ID = "reviews-summary";

export function HighlightsSummary({
  summary,
  distributionKnown,
  locale,
}: {
  summary: RatingSummary;
  distributionKnown: boolean;
  locale: LocaleCode;
}) {
  const rtl = readsRtl(locale);
  const shown = displayRating(summary.average);
  const avg = shown.toFixed(1);
  const max = Math.max(1, summary.count);
  return (
    <div
      id={REVIEWS_SUMMARY_ID}
      data-reviews-summary="highlights"
      className={cn(
        "flex scroll-mt-24 items-center gap-bk-md rounded-bk-card bg-bk-surface-alt p-bk-md",
        rtl && "flex-row-reverse",
      )}
    >
      <div className="flex shrink-0 flex-col items-center gap-1">
        <span className="font-bk-display text-5xl font-black leading-none text-bk-ink tabular-nums">
          <bdi>{avg}</bdi>
        </span>
        <Stars value={shown} precision="exact" size={16} label={rs("averageLabel", locale, { avg })} />
        <span className="font-bk-body text-xs font-bold text-bk-ink-soft tabular-nums">
          {rs("ofReviews", locale, { count: reviewCountLabel(summary.count, locale) })}
        </span>
      </div>
      {distributionKnown && summary.count >= 2 && (
        <ul aria-label={rs("distributionLabel", locale)} className="min-w-0 flex-1 space-y-1.5">
          {STAR_ROWS.map((star) => {
            const count = summary.distribution[star];
            return (
              <li
                key={star}
                aria-label={rs("starRow", locale, { star, count })}
                className={cn("flex items-center gap-bk-xs", rtl && "flex-row-reverse")}
              >
                <span
                  aria-hidden="true"
                  className="inline-flex w-7 shrink-0 items-center justify-center gap-0.5 font-bk-body text-xs text-bk-ink-soft tabular-nums"
                >
                  {star}
                  <span className="text-bk-accent">★</span>
                </span>
                <span
                  aria-hidden="true"
                  className="flex h-1.5 flex-1 overflow-hidden rounded-bk-pill bg-bk-ink/10"
                >
                  <span
                    className={cn("block h-full rounded-bk-pill bg-bk-accent", rtl && "ml-auto")}
                    style={{ width: `${(count / max) * 100}%` }}
                  />
                </span>
                <span
                  aria-hidden="true"
                  className="w-4 text-center font-bk-body text-xs text-bk-ink-soft tabular-nums"
                  data-star-count={star}
                >
                  {count}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Write the card**

Create `packages/sections/src/product_reviews/highlights-card.tsx`:

```tsx
"use client";

// =====================================================================
// One review in the highlights layout (spec §1.6 items 4–7)
// =====================================================================
// - featured (the first card): an oversized «”», the full body at
//   17px/700 clamped to 5 lines, then «— {name}» and the stars;
// - compact: a 36px monogram, the name in <bdi> (so «eng. سيف» never
//   reads «سيف .eng»), the stars, the body at 15px clamped to 3 lines.
// A clamped body gets «كمّل» only when it really overflows (measured
// after mount), and opens by itself while a pressed topic marks a word in
// it. The key phrase is always tinted (bg-bk-primary/25, a tint, never a
// fill: D4); a pressed topic's words get the stronger /40 tint. A
// tag-only topic marks the card's edge instead. «رد {store}» renders
// under the review only when the merchant wrote a reply. No dates (the
// six imports share one) and no «verified» badge in Phase 1.
// =====================================================================

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { LocaleCode } from "@scheniders/shared";
import { isOptimizableImageHost } from "../helpers/image";
import { MaterialIcon, Stars } from "../helpers/primitives";
import { readsRtl } from "../helpers/reading";
import { cn } from "../helpers/utils";
import type { ReviewSummaryItem } from "../types";
import { markSegments, type TextRange } from "./marks";
import { rs } from "./strings";

export interface StoreReply {
  store: string;
  text: string;
  logoUrl: string | null;
}

/** The first letter of the name, preferring an Arabic one («eng. سيف» →
 *  «س»), upper-cased for Latin names («Ahmed» → «A»). */
export function monogramOf(name: string): string {
  const arabic = /\p{Script=Arabic}/u.exec(name);
  if (arabic) return arabic[0];
  const letter = /\p{L}/u.exec(name);
  return letter ? letter[0].toUpperCase() : "";
}

function ReviewBody({
  body,
  keyPhrase,
  termRanges,
  className,
}: {
  body: string;
  keyPhrase: TextRange | null;
  termRanges: readonly TextRange[];
  className: string;
}) {
  return (
    <p className={className}>
      {markSegments(body, keyPhrase, termRanges).map((seg, i) =>
        seg.key || seg.term ? (
          <mark
            key={i}
            data-key-phrase={seg.key ? "" : undefined}
            data-term={seg.term ? "" : undefined}
            className={cn("rounded-sm text-bk-ink", seg.term ? "bg-bk-primary/40" : "bg-bk-primary/25")}
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </p>
  );
}

export function HighlightsCard({
  review,
  featured,
  locale,
  keyPhrase,
  termRanges,
  tagHit,
  reply,
  onOpenPhoto,
}: {
  review: ReviewSummaryItem;
  featured: boolean;
  locale: LocaleCode;
  keyPhrase: TextRange | null;
  /** The pressed topic's words in this body (empty when none). */
  termRanges: readonly TextRange[];
  /** The pressed topic is tag-only and this review carries the tag. */
  tagHit: boolean;
  reply: StoreReply | null;
  onOpenPhoto: (image: { url: string; alt: string }) => void;
}) {
  const rtl = readsRtl(locale);
  const name = review.author_name?.trim() || rs("anonymous", locale);
  const body = review.body?.trim() ? review.body : "";
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const clamped = !expanded && termRanges.length === 0;

  useEffect(() => {
    const p = bodyRef.current?.querySelector("p");
    if (!clamped || !p) return;
    setOverflows(p.scrollHeight > p.clientHeight + 1);
  }, [clamped, body]);

  const stars = (
    <Stars
      value={review.rating}
      size={14}
      label={rs("ratingLabel", locale, { rating: review.rating })}
      className={cn("shrink-0", rtl && "flex-row-reverse")}
    />
  );
  const textSide = rtl ? "text-right" : "text-left";

  return (
    <li
      data-review-card={review.id}
      data-featured={featured ? "" : undefined}
      data-term-card={tagHit ? "" : undefined}
      className={cn(
        "relative rounded-bk-card bg-bk-surface-alt p-bk-md",
        tagHit && "ring-2 ring-inset ring-bk-primary",
        textSide,
      )}
    >
      {featured ? (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute top-0 font-bk-display text-7xl font-black leading-none text-bk-ink/15",
            rtl ? "right-3" : "left-3",
          )}
        >
          ”
        </span>
      ) : (
        <div className={cn("mb-bk-xs flex items-center gap-bk-sm", rtl && "flex-row-reverse")}>
          <span
            aria-hidden="true"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-bk-pill bg-bk-surface font-bk-display text-sm font-black text-bk-ink"
          >
            {monogramOf(name)}
          </span>
          <bdi className="min-w-0 flex-1 truncate font-bk-body text-sm font-bold text-bk-ink">{name}</bdi>
          {stars}
        </div>
      )}

      {review.title && (
        <h3 className="mb-1 font-bk-display text-sm font-bold text-bk-ink">{review.title}</h3>
      )}

      {body && (
        <div ref={bodyRef} className={cn(featured && "relative pt-bk-sm")}>
          <ReviewBody
            body={body}
            keyPhrase={keyPhrase}
            termRanges={termRanges}
            className={cn(
              "text-pretty text-bk-ink",
              featured
                ? "font-bk-display text-[17px] font-bold leading-relaxed"
                : "font-bk-body text-[15px] leading-relaxed",
              clamped && (featured ? "line-clamp-5" : "line-clamp-3"),
            )}
          />
          {clamped && overflows && (
            <button
              type="button"
              data-read-more=""
              onClick={() => setExpanded(true)}
              className="mt-1 inline-flex min-h-11 items-center font-bk-body text-sm font-black text-bk-ink underline underline-offset-4"
            >
              {rs("readMoreInline", locale)}
            </button>
          )}
        </div>
      )}

      {featured && (
        <div className={cn("mt-bk-sm flex items-center gap-bk-sm", rtl && "flex-row-reverse")}>
          <span className="font-bk-body text-sm font-bold text-bk-ink-soft">
            — <bdi>{name}</bdi>
          </span>
          {stars}
        </div>
      )}

      {review.photo_urls.length > 0 && (
        <div className={cn("mt-bk-sm flex flex-wrap gap-bk-xs", rtl && "flex-row-reverse")}>
          {review.photo_urls.map((url, i) => {
            const alt = rs("reviewPhoto", locale, { n: i + 1 });
            return (
              <button
                key={`${i}-${url}`}
                type="button"
                onClick={() => onOpenPhoto({ url, alt })}
                aria-label={rs("enlargePhoto", locale)}
                className="relative h-16 w-16 overflow-hidden rounded-bk-input focus-visible:outline-none focus-visible:ring-2 ring-bk-focus ring-offset-2"
              >
                <Image
                  src={url}
                  alt={alt}
                  fill
                  unoptimized={!isOptimizableImageHost(url)}
                  sizes="64px"
                  className="object-cover"
                />
              </button>
            );
          })}
        </div>
      )}

      {reply && (
        <div
          data-store-reply=""
          className={cn("mt-bk-sm rounded-bk-card bg-bk-surface px-3 py-2", rtl ? "mr-6" : "ml-6")}
        >
          <p
            className={cn(
              "flex items-center gap-1.5 font-bk-body text-xs font-black text-bk-ink",
              rtl && "flex-row-reverse",
            )}
          >
            {reply.logoUrl ? (
              <Image
                src={reply.logoUrl}
                alt=""
                width={20}
                height={20}
                unoptimized={!isOptimizableImageHost(reply.logoUrl)}
                className="size-5 rounded-bk-pill object-contain"
              />
            ) : (
              <MaterialIcon name="storefront" className="text-base" />
            )}
            <span>{rs("storeReply", locale, { store: reply.store })}</span>
          </p>
          <p className="mt-1 font-bk-body text-[13px] leading-relaxed text-bk-ink-soft text-pretty">
            {reply.text}
          </p>
        </div>
      )}
    </li>
  );
}
```

- [ ] **Step 6: Write the view**

Create `packages/sections/src/product_reviews/highlights-view.tsx`:

```tsx
"use client";

// =====================================================================
// product_reviews `layout: "highlights"` — the body under the heading
// =====================================================================
// Spec §1.6, concept g3 A + B's key-phrase tint. In order: the summary
// card (#reviews-summary), the word buttons, the cards in D10 order, and
// «شوف كل التقييمات (N)». A word button HIGHLIGHTS, never filters: the
// list keeps every card in its place, the matching words get a mark, a
// hidden matching review brings the rest into view, and the page scrolls
// to the first mark. A second tap clears. Topic counts, order, key
// phrases and replies are all computed here from the rendered reviews
// and the merchant's props (`review_curation`, until Phase 2's columns).
// =====================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode, RatingSummary } from "@scheniders/shared";
import { readsRtl } from "../helpers/reading";
import { cn } from "../helpers/utils";
import type { Props } from "../product_reviews";
import type { ReviewSummaryItem } from "../types";
import { featuredOrder } from "./featured-order";
import { HighlightsCard, type StoreReply } from "./highlights-card";
import { HighlightsSummary } from "./highlights-summary";
import { keyPhraseRange } from "./marks";
import { rs } from "./strings";
import { reviewThemes, themeCounts, themeWordRanges } from "./theme-words";

type Curation = NonNullable<Props["review_curation"]>[number];

export function HighlightsView({
  reviews,
  summary,
  distributionKnown,
  props,
  locale,
  storeName,
  logoUrl,
  onOpenPhoto,
}: {
  reviews: readonly ReviewSummaryItem[];
  summary: RatingSummary;
  distributionKnown: boolean;
  props: Pick<Props, "theme_words" | "visible_count" | "review_curation">;
  locale: LocaleCode;
  /** «رد {store}» — `storeDisplayName` (D15). */
  storeName: string;
  logoUrl: string | null;
  onOpenPhoto: (image: { url: string; alt: string }) => void;
}) {
  const rtl = readsRtl(locale);
  const listRef = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const themes = useMemo(() => props.theme_words ?? [], [props.theme_words]);
  const curation = useMemo(
    () => new Map<string, Curation>((props.review_curation ?? []).map((c) => [c.review_id, c])),
    [props.review_curation],
  );
  const tagsOf = (id: string): readonly string[] => curation.get(id)?.tags ?? [];
  const counts = themeCounts(reviews, themes, tagsOf);
  const { visible, all } = featuredOrder(reviews, {
    visibleCount: props.visible_count,
    rankOf: (id) => curation.get(id)?.rank,
    themeCountOf: (r) => reviewThemes(r.body, tagsOf(r.id), themes).size,
  });
  const allTerms = themes.flatMap((t) => t.match_terms ?? []);
  const activeTheme = themes.find((t) => t.key === active);
  const shown = expanded ? all : visible;

  useEffect(() => {
    if (!active) return;
    const first = listRef.current?.querySelector("[data-term], [data-term-card]");
    if (!first) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    first.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [active, expanded]);

  function press(key: string): void {
    if (active === key) {
      setActive(null);
      return;
    }
    setActive(key);
    const hiddenMatch = all.some(
      (r) => !visible.includes(r) && reviewThemes(r.body, tagsOf(r.id), themes).has(key),
    );
    if (hiddenMatch) setExpanded(true);
  }

  if (reviews.length === 0 || summary.count === 0) {
    return (
      <p
        data-reviews-empty=""
        className={cn("font-bk-body text-sm text-bk-ink-soft text-pretty", rtl && "text-right")}
      >
        {rs("emptyHighlights", locale)}
      </p>
    );
  }

  return (
    <>
      <HighlightsSummary summary={summary} distributionKnown={distributionKnown} locale={locale} />

      {/* Two topics and two reviews at least: with one review, every
          button would read 1 and point at the card under it. */}
      {counts.length >= 2 && reviews.length >= 2 && (
        <div className={cn("mt-bk-md flex flex-col gap-bk-xs", rtl ? "items-end" : "items-start")}>
          <p className="font-bk-body text-xs font-bold text-bk-ink-soft">{rs("themesLabel", locale)}</p>
          <div
            role="group"
            aria-label={rs("themesLabel", locale)}
            className={cn("flex flex-wrap gap-bk-xs", rtl && "flex-row-reverse")}
          >
            {counts.map((t) => {
              const pressed = active === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  data-theme-word={t.key}
                  aria-pressed={pressed}
                  onClick={() => press(t.key)}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-bk-pill px-bk-md font-bk-body text-sm font-bold transition-colors duration-bk-fast motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 ring-bk-focus",
                    pressed
                      ? "bg-bk-secondary text-bk-on-secondary"
                      : "border-bk border-bk-divider bg-bk-surface text-bk-ink",
                    rtl && "flex-row-reverse",
                  )}
                >
                  <span>{resolveI18n(t.label_i18n, locale)}</span>
                  <bdi className="font-black tabular-nums">{t.count}</bdi>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <ul ref={listRef} data-review-list="" className="mt-bk-md space-y-bk-sm">
        {shown.map((review, i) => {
          const c = curation.get(review.id);
          const body = review.body ?? "";
          const replyText = resolveI18n(c?.reply_i18n, locale).trim();
          const reply: StoreReply | null =
            replyText && storeName ? { store: storeName, text: replyText, logoUrl } : null;
          const tagOnly = activeTheme !== undefined && (activeTheme.match_terms ?? []).length === 0;
          return (
            <HighlightsCard
              key={review.id}
              review={review}
              featured={i === 0}
              locale={locale}
              keyPhrase={keyPhraseRange(body, c?.highlight, allTerms)}
              termRanges={themeWordRanges(body, activeTheme)}
              tagHit={tagOnly && activeTheme !== undefined && tagsOf(review.id).includes(activeTheme.key)}
              reply={reply}
              onOpenPhoto={onOpenPhoto}
            />
          );
        })}
      </ul>

      {!expanded && all.length > visible.length && (
        <button
          type="button"
          data-reviews-show-all=""
          onClick={() => setExpanded(true)}
          className={cn(
            "mt-bk-md flex min-h-[52px] w-full items-center justify-center rounded-bk-pill border-bk border-bk-divider bg-bk-surface font-bk-body text-[15px] font-extrabold text-bk-ink transition-transform duration-bk-fast active:scale-[0.98] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 ring-bk-focus",
          )}
        >
          {rs("showAll", locale, { count: all.length })}
        </button>
      )}
    </>
  );
}
```

- [ ] **Step 7: Wire it into the section client**

In `packages/sections/src/product_reviews.client.tsx`:

Replace:
```ts
// Opt-in `layout: "quiet"`: one hairline summary card, quiet review cards
// (product_reviews/), and the form folded behind a modest «اكتب تقييمك»
// button that #reviews opens by itself. Absent, the historical layout
// renders byte-identically.
```
with:
```ts
// Opt-in `layout: "quiet"`: one hairline summary card, quiet review cards
// (product_reviews/), and the form folded behind a modest «اكتب تقييمك»
// button that #reviews opens by itself. Opt-in `layout: "highlights"`
// (spec §1.6): product_reviews/highlights-view.tsx. `heading_style:
// "chapter"` sets the heading at the chapter scale in every layout;
// `form_entry: "hash_only"` keeps the entry and the form out of the page
// unless the visitor arrived on #reviews. Absent, the historical layout
// renders byte-identically.
```

Replace:
```ts
import { CenteredSectionHeader, ChunkyButton, MaterialIcon, Section, Stars } from "./helpers/primitives";
```
with:
```ts
import { CenteredSectionHeader, ChunkyButton, MaterialIcon, Section, Stars } from "./helpers/primitives";
import { ChapterHeading } from "./helpers/chapter-heading";
import { storeDisplayName } from "./helpers/store-name";
```

Replace:
```ts
import { QuietReviewCard } from "./product_reviews/quiet-review-card";
```
with:
```ts
import { HighlightsView } from "./product_reviews/highlights-view";
import { QuietReviewCard } from "./product_reviews/quiet-review-card";
```

Replace:
```ts
  const quiet = props.layout === "quiet";
```
with:
```ts
  const quiet = props.layout === "quiet";
  // The tracker's #reviews link is the only way in to the form.
  const hashOnly = props.form_entry === "hash_only";
```

Replace:
```tsx
  const rtl = readsRtl(locale);

  if (quiet) {
    return (
      <Section id="reviews">
        <CenteredSectionHeader
          title={heading}
          align="start"
          titleField="heading_i18n"
        />
```
with:
```tsx
  const rtl = readsRtl(locale);

  const headingEl =
    props.heading_style === "chapter" ? (
      <ChapterHeading title={heading} locale={locale} titleField="heading_i18n" />
    ) : (
      <CenteredSectionHeader
        title={heading}
        align="start"
        titleField="heading_i18n"
      />
    );

  const entryButton = (
    <div className={cn("mt-bk-md flex", rtl && "justify-end")}>
      <button
        type="button"
        data-review-entry=""
        onClick={() => {
          setFormOpen(true);
          setFocusForm(true);
        }}
        className={cn(
          "inline-flex min-h-11 items-center gap-2 rounded-bk-pill border-bk border-bk-divider bg-bk-surface px-bk-md font-bk-body text-sm font-bold text-bk-ink",
          "transition-[opacity,transform] duration-bk-fast motion-reduce:transition-none hover:opacity-90 active:scale-[0.98]",
          "focus-visible:outline-none focus-visible:ring-2 ring-bk-focus ring-offset-2",
          rtl && "flex-row-reverse",
        )}
      >
        <MaterialIcon name="edit" className="text-base" />
        {rs("writeEntry", locale)}
      </button>
    </div>
  );

  // Quiet and highlights fold the form behind the entry button; with
  // `hash_only` there is no button, only the form a #reviews arrival opens.
  const foldedForm =
    props.show_form && (formOpen ? formBlock : hashOnly ? null : entryButton);

  if (props.layout === "highlights") {
    return (
      <Section id="reviews">
        {headingEl}
        <HighlightsView
          reviews={reviews}
          summary={summary}
          distributionKnown={distributionKnown}
          props={props}
          locale={locale}
          storeName={storeDisplayName(ctx.tenant, locale)}
          logoUrl={ctx.tenant.branding?.logo_url ?? null}
          onOpenPhoto={setLightbox}
        />
        <PhotoLightbox
          image={lightbox}
          onClose={() => setLightbox(null)}
          closeLabel={t("Close", "إغلاق")}
        />
        {foldedForm}
      </Section>
    );
  }

  if (quiet) {
    return (
      <Section id="reviews">
        {headingEl}
```

Replace (the quiet layout's folded form):
```tsx
        {props.show_form &&
          (formOpen ? (
            formBlock
          ) : (
            <div className={cn("mt-bk-md flex", rtl && "justify-end")}>
              <button
                type="button"
                data-review-entry=""
                onClick={() => {
                  setFormOpen(true);
                  setFocusForm(true);
                }}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-bk-pill border-bk border-bk-divider bg-bk-surface px-bk-md font-bk-body text-sm font-bold text-bk-ink",
                  "transition-[opacity,transform] duration-bk-fast motion-reduce:transition-none hover:opacity-90 active:scale-[0.98]",
                  "focus-visible:outline-none focus-visible:ring-2 ring-bk-focus ring-offset-2",
                  rtl && "flex-row-reverse",
                )}
              >
                <MaterialIcon name="edit" className="text-base" />
                {rs("writeEntry", locale)}
              </button>
            </div>
          ))}
      </Section>
```
with:
```tsx
        {foldedForm}
      </Section>
```

Replace (the historical layout's heading):
```tsx
    <Section id="reviews">
      <CenteredSectionHeader
        title={heading}
        align="start"
        titleField="heading_i18n"
      />

      {/* Summary
```
with:
```tsx
    <Section id="reviews">
      {headingEl}

      {/* Summary
```

Replace:
```tsx
      {/* Submit form */}
      {formBlock}
```
with:
```tsx
      {/* Submit form */}
      {hashOnly && !formOpen ? null : formBlock}
```

`headingEl`, `entryButton` and `foldedForm` render exactly today's markup when `heading_style` and `form_entry` are absent; the baselines in Step 9 prove it.

- [ ] **Step 8: Run the two new tests**

```bash
CI=true pnpm exec vitest run packages/sections/src/_product-reviews-highlights.test.tsx packages/sections/src/_product-reviews-highlights-dom.test.tsx
```
Expected: `Test Files  2 passed (2)`, `Tests  28 passed (28)` (20 + 8).

- [ ] **Step 9: Every reviews baseline and the quiet tests, unchanged**

```bash
CI=true pnpm exec vitest run packages/sections/src/_product-reviews-baseline-snapshot.test.tsx packages/sections/src/_pdp-reviews-faq-baseline-snapshot.test.tsx packages/sections/src/_product-reviews-quiet.test.tsx packages/sections/src/_product-reviews-quiet-dom.test.tsx packages/sections/src/product_reviews
```
Expected: `Test Files  8 passed (8)`, `Tests  68 passed (68)` (11 + 4 + 18 + 4 + strings 5 + marks 11 + theme-words 7 + featured-order 8), no `written`/`updated`/`obsolete`.

- [ ] **Step 10: Type gate, then commit**

Run the sections type gate. Expected: no output.
```bash
git branch --show-current
git add packages/sections/src/product_reviews/highlights-summary.tsx packages/sections/src/product_reviews/highlights-card.tsx packages/sections/src/product_reviews/highlights-view.tsx packages/sections/src/product_reviews.client.tsx packages/sections/src/_product-reviews-highlights.test.tsx packages/sections/src/_product-reviews-highlights-dom.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): reviews highlights layout — #reviews-summary card, word buttons that highlight, D10 order, key phrases, store reply slot" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The product FAQ's chrome strings

**Files:**
- Create: `packages/sections/src/faq_contact_split.strings.ts`
- Modify: `packages/sections/src/_string-tables.ts`
- Test: `packages/sections/src/faq_contact_split.strings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/faq_contact_split.strings.test.ts`:

```ts
// The product FAQ's chrome strings: tokens fill, and every entry resolves
// in ar, en and ku.

import { describe, expect, it } from "vitest";
import { FAQ_STRINGS, fs } from "./faq_contact_split.strings";

describe("fs", () => {
  it("fills the WhatsApp prefill and the size answer", () => {
    expect(fs("askAbout", "ar", { product: "ويفر انتنس" })).toBe("عندي سؤال عن ويفر انتنس");
    expect(fs("sizeAnswer", "ar", { value: 100 })).toBe("القنينة 100 مل");
    expect(fs("sizeAnswer", "en", { value: 100 })).toBe("The bottle is 100 ml");
  });

  it("Kurdish has its own line", () => {
    expect(fs("call", "ku")).toBe("پەیوەندیمان پێوە بکە");
  });

  it("every entry has ar, en and ku", () => {
    for (const entry of Object.values(FAQ_STRINGS)) {
      expect(Object.keys(entry).sort()).toEqual(["ar", "en", "ku"]);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/faq_contact_split.strings.test.ts
```
Expected: `Error: Failed to load url ./faq_contact_split.strings`, `Tests  no tests`.

- [ ] **Step 3: Write the table**

Create `packages/sections/src/faq_contact_split.strings.ts`:

```ts
// Chrome strings for faq_contact_split's product FAQ and its one contact
// row (spec §1.7, concept g4 A). Generic UI text only: the questions, the
// row's title and sub line, and every merchant answer are props. Every
// entry carries ar, en and ku (guarded by _kurdish-coverage via
// _string-tables.ts).

import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";

export const FAQ_STRINGS = {
  call: { en: "Call us", ar: "اتصل بينا", ku: "پەیوەندیمان پێوە بکە" },
  whatsapp: { en: "WhatsApp us", ar: "راسلنا واتساب", ku: "لە واتسئاپ نامەمان بۆ بنێرە" },
  askAbout: {
    en: "I have a question about {product}",
    ar: "عندي سؤال عن {product}",
    ku: "پرسیارێکم هەیە دەربارەی {product}",
  },
  orderAndTry: { en: "Order it, try it", ar: "اطلبه وجرّبه", ku: "داوای بکە و تاقی بکەرەوە" },
  sizeAnswer: { en: "The bottle is {value} ml", ar: "القنينة {value} مل", ku: "بوتڵەکە {value} مل" },
} as const;

export type FaqStringKey = keyof typeof FAQ_STRINGS;

/** One chrome string, with `{name}` tokens filled. */
export function fs(
  key: FaqStringKey,
  locale: LocaleCode,
  vars?: Record<string, string | number>,
): string {
  let out = resolveI18n(FAQ_STRINGS[key], locale);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(String(v));
    }
  }
  return out;
}
```
(ar are spec §1.7's strings; en and ku are concept g4-A's string table, verbatim, for Ali's copy review, to-dos 8 and 10.)

In `packages/sections/src/_string-tables.ts`, replace:
```ts
  "image_gallery.strings.ts",
];
```
with:
```ts
  "image_gallery.strings.ts",
  "faq_contact_split.strings.ts",
];
```

- [ ] **Step 4: Run it and the Kurdish coverage**

```bash
CI=true pnpm exec vitest run packages/sections/src/faq_contact_split.strings.test.ts packages/sections/src/_kurdish-coverage.test.ts
```
Expected: `Test Files  2 passed (2)`, `Tests  15 passed (15)` (strings 3; coverage 12, one more than before for the new file).

- [ ] **Step 5: Type gate, then commit**

Run the sections type gate. Expected: no output.
```bash
git branch --show-current
git add packages/sections/src/faq_contact_split.strings.ts packages/sections/src/faq_contact_split.strings.test.ts packages/sections/src/_string-tables.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): product FAQ + contact row chrome strings (ar/en/ku)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `faq_contact_split` product FAQ, the one contact row, and `heading_style`

**Files:**
- Create: `packages/sections/src/faq_contact_split.product.tsx`
- Modify: `packages/sections/src/faq_contact_split.tsx` (imports, schema, `export type Props`, the product branch, the compact `chapterLocale`), `packages/sections/src/faq_contact_split.compact.tsx` (optional `chapterLocale`)
- Test: `packages/sections/src/_faq-product.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/_faq-product.test.tsx`:

```tsx
// =====================================================================
// faq_contact_split `product_faq` + `contact_style: "row"` (spec §1.7)
// =====================================================================
// Product questions answered from the product's own data, shown only
// when at least `min_answered` resolve; each answer ends in «اطلبه
// وجرّبه» (a jump to the order form). One contact row with «اتصل بينا»
// and «راسلنا واتساب» replaces the «عندك استفسار؟» card. The default and
// compact markup are pinned by the baseline snapshots.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocaleCode } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import faq_contact_split from "./faq_contact_split";
import { ORDER_FORM_HREF, resolveProductFaq, type ProductFaqConfig } from "./faq_contact_split.product";
import { DIRECT_ORDER_FORM_ID } from "./pdp_direct_order.client";
import type { Product, Tenant } from "./types";
import { productCtx, productRuntime } from "./_pdp-fixtures";
import { BARE_TENANT, IRAQ_TENANT, LIVE_PDP_FAQ } from "./_pdp-lower-fixtures";
import { scentProduct } from "./_pdp-scent-fixtures";
import { wayferProduct } from "./_pdp-wayfer-fixtures";

const PRODUCT_FAQ: ProductFaqConfig = {
  title_i18n: { ar: "أسئلة قبل لا تطلب", en: "Before you order" },
  items: [
    { q_i18n: { ar: "شكد يثبت؟", en: "How long does it last?" }, answer: { kind: "attribute", key: "longevity_note" } },
    { q_i18n: { ar: "شكد حجم القنينة؟", en: "How big is the bottle?" }, answer: { kind: "size_ml" } },
  ],
};

const ROW = {
  ...LIVE_PDP_FAQ,
  product_faq: PRODUCT_FAQ,
  contact_style: "row",
  heading_style: "chapter",
  contact: {
    ...LIVE_PDP_FAQ.contact,
    title_i18n: { ar: "محتار بالريحة؟ نوصفلك ياها", en: "Not sure about the scent? We'll describe it" },
    sub_i18n: { ar: "نفس الرقم للاتصال والواتساب", en: "Same number for calls and WhatsApp" },
  },
};

/** Both questions answered: the scent fixture's longevity_note + a size. */
const answered: Product = { ...scentProduct, size_ml: 100 };

function render(input: unknown, product: Product, locale: LocaleCode = "ar", tenant: Tenant = IRAQ_TENANT): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="">
      <faq_contact_split.render
        props={faq_contact_split.schema.parse(input)}
        ctx={productCtx(product, { tenant, runtime: { ...productRuntime, locale } })}
      />
    </StoreBaseProvider>,
  );
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

describe("schema", () => {
  it("accepts the product FAQ config", () => {
    const parsed = faq_contact_split.schema.parse(ROW);
    expect(parsed.product_faq).toEqual(PRODUCT_FAQ);
    expect(parsed.contact_style).toBe("row");
    expect(parsed.heading_style).toBe("chapter");
  });

  it.each<[string, unknown]>([
    ["product_faq", { items: [] }],
    ["product_faq", { items: [{ q_i18n: { ar: "؟" }, answer: { kind: "photo" } }] }],
    ["contact_style", "banner"],
    ["heading_style", "huge"],
  ])("a bad %s (%j) falls back to absent", (key, value) => {
    const parsed = faq_contact_split.schema.parse({ ...ROW, [key]: value });
    expect(parsed[key as keyof typeof parsed]).toBeUndefined();
    expect(parsed.items).toEqual(LIVE_PDP_FAQ.items);
  });
});

describe("resolveProductFaq", () => {
  it("Wayfarer today: no longevity_note, no size → 0 of 2, hidden", () => {
    expect(resolveProductFaq(PRODUCT_FAQ, wayferProduct, "ar")).toEqual([]);
  });

  it("both answered: the attribute text and «القنينة 100 مل»", () => {
    expect(resolveProductFaq(PRODUCT_FAQ, answered, "ar")).toEqual([
      { question: "شكد يثبت؟", answer: "ثبات ممتاز وفوحان قوي." },
      { question: "شكد حجم القنينة؟", answer: "القنينة 100 مل" },
    ]);
  });

  it("one answered of two: hidden at the default min_answered, shown at 1", () => {
    const sized: Product = { ...wayferProduct, size_ml: 100 };
    expect(resolveProductFaq(PRODUCT_FAQ, sized, "ar")).toEqual([]);
    expect(resolveProductFaq({ ...PRODUCT_FAQ, min_answered: 1 }, sized, "ar")).toEqual([
      { question: "شكد حجم القنينة؟", answer: "القنينة 100 مل" },
    ]);
  });

  it("a merchant text, an enum attribute and a template", () => {
    const config: ProductFaqConfig = {
      min_answered: 1,
      items: [
        { q_i18n: { ar: "يصلح هدية؟" }, answer: { kind: "text", a_i18n: { ar: "إي، نغلّفه هدية." } } },
        { q_i18n: { ar: "يناسب أي موسم؟" }, answer: { kind: "attribute", key: "season", template_i18n: { ar: "يناسب {value}" } } },
        { q_i18n: { ar: "الحجم؟" }, answer: { kind: "size_ml", template_i18n: { ar: "{value} مل بالضبط" } } },
      ],
    };
    expect(resolveProductFaq(config, answered, "ar").map((r) => r.answer)).toEqual([
      "إي، نغلّفه هدية.",
      "يناسب صيفي",
      "100 مل بالضبط",
    ]);
  });
});

describe("render", () => {
  it("Wayfarer today: only the contact row, no questions, no heading", () => {
    const html = render(ROW, wayferProduct);
    expect(html).not.toContain("data-faq-item");
    expect(html).not.toContain("أسئلة قبل لا تطلب");
    expect(count(html, "data-contact-row")).toBe(1);
    expect(html).toContain("محتار بالريحة؟ نوصفلك ياها");
    expect(html).toContain("نفس الرقم للاتصال والواتساب");
    expect(html).not.toContain("عندك استفسار؟");
    expect(html).not.toContain("لديك أسئلة أخرى؟");
  });

  it("two equal buttons: tel: the confirmation number, WhatsApp prefilled with the product", () => {
    const html = render(ROW, wayferProduct);
    expect(html).toContain('href="tel:+9647779703832" data-contact="call"');
    expect(html).toContain(
      `href="https://wa.me/9647779703832?text=${encodeURIComponent("عندي سؤال عن ويفر انتنس")}"`,
    );
    expect(html).toContain(">اتصل بينا<");
    expect(html).toContain(">راسلنا واتساب<");
    expect(count(html, "min-h-[3.25rem] flex-1 basis-0")).toBe(2);
  });

  it("both answered: the chapter heading, the first question open, «اطلبه وجرّبه» to the form", () => {
    const html = render(ROW, answered);
    expect(html).toContain("text-bk-chapter");
    expect(html).toContain(">أسئلة قبل لا تطلب<");
    expect(count(html, "data-faq-item")).toBe(2);
    expect(count(html, ' open=""')).toBe(1);
    expect(count(html, `href="${ORDER_FORM_HREF}" data-faq-order`)).toBe(2);
    expect(html.indexOf("data-faq-item")).toBeLessThan(html.indexOf("data-contact-row"));
  });

  it("the jump target is the express form's id", () => {
    expect(ORDER_FORM_HREF).toBe(`#${DIRECT_ORDER_FORM_ID}`);
  });

  it("only a call number: one button; nothing at all: no section", () => {
    const callOnly: Tenant = {
      ...BARE_TENANT,
      store_config_v2: { enabled_locales: ["ar", "en"], commerce: { contact: { call_number: "07779703832" } } },
    };
    const html = render(ROW, wayferProduct, "ar", callOnly);
    expect(html).toContain('data-contact="call"');
    expect(html).not.toContain('data-contact="whatsapp"');
    expect(render(ROW, wayferProduct, "ar", BARE_TENANT)).toBe("");
  });

  it("without contact_style row: the compact WhatsApp row", () => {
    const { contact_style: _c, ...card } = ROW;
    const html = render(card, wayferProduct);
    expect(html).toContain('data-action-row="whatsapp"');
    expect(html).not.toContain("data-contact-row");
  });

  it("adds no dir attribute", () => {
    expect(count(render(ROW, answered), 'dir="')).toBe(0);
  });

  it("English chrome", () => {
    const html = render(ROW, answered, "en");
    expect(html).toContain(">Call us<");
    expect(html).toContain(">WhatsApp us<");
    expect(html).toContain(">Order it, try it<");
    expect(html).toContain("The bottle is 100 ml");
  });
});

describe("compact + heading_style", () => {
  it("chapter sets the compact heading at the chapter scale", () => {
    const compact = { ...LIVE_PDP_FAQ, compact: true };
    expect(render({ ...compact, heading_style: "chapter" }, wayferProduct)).toContain("text-bk-chapter");
    expect(render(compact, wayferProduct)).not.toContain("text-bk-chapter");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/_faq-product.test.tsx
```
Expected: `Error: Failed to load url ./faq_contact_split.product`, `Tests  no tests`.

- [ ] **Step 3: Write the product view**

Create `packages/sections/src/faq_contact_split.product.tsx`:

```tsx
// =====================================================================
// faq_contact_split — the product FAQ and the one contact row (spec §1.7)
// =====================================================================
// Concept g4 A: only questions about THIS product, each answered from the
// product's own data (a text/enum attribute, `size_ml`) or a merchant
// text, and each answer ending in «اطلبه وجرّبه», a jump back to the
// order form. The list renders only when at least `min_answered` (default
// 2) questions resolve to an answer — one lonely question reads as an
// empty FAQ. Under it, one contact row: «اتصل بينا» (tel: the store's
// confirmation number) and «راسلنا واتساب» (prefilled «عندي سؤال عن
// {product}»), two equal 52px buttons; a channel the store has not set
// is not drawn, and with neither the row is gone. Server-only: native
// <details> (the first one open), no client JS. Arabic flips the visual
// order with classes, never `dir`.
// =====================================================================

import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode, ResolvedProductAttribute } from "@scheniders/shared";
import { ChapterHeading } from "./helpers/chapter-heading";
import { ActionPill, ActionRow } from "./helpers/action-row";
import { MaterialIcon, Section, WhatsAppIcon } from "./helpers/primitives";
import { readsRtl } from "./helpers/reading";
import { cn } from "./helpers/utils";
import type { Product } from "./types";
import type { Props } from "./faq_contact_split";
import { fs } from "./faq_contact_split.strings";

/** The express order form's anchor. It must equal
 *  `DIRECT_ORDER_FORM_ID` (pdp_direct_order.client.tsx), which this
 *  server file cannot import from a "use client" module; a test pins the
 *  pair. */
export const ORDER_FORM_HREF = "#direct-order";

export const DEFAULT_MIN_ANSWERED = 2;

export type ProductFaqConfig = NonNullable<Props["product_faq"]>;
type ProductFaqAnswer = ProductFaqConfig["items"][number]["answer"];

export interface ProductFaqRow {
  question: string;
  answer: string;
}

/** The value in the template's `{value}` slot; no template → the value. */
function fill(template: string, value: string): string {
  return template ? template.split("{value}").join(value) : value;
}

function attributeText(attr: ResolvedProductAttribute, locale: LocaleCode): string {
  if (attr.kind === "text") return resolveI18n(attr.value, locale).trim();
  if (attr.kind === "enum") return (resolveI18n(attr.option.label_i18n, locale) || attr.value).trim();
  return "";
}

function answerOf(answer: ProductFaqAnswer, product: Product | undefined, locale: LocaleCode): string {
  if (answer.kind === "text") return resolveI18n(answer.a_i18n, locale).trim();
  if (answer.kind === "attribute") {
    const attr = product?.attributes?.find((a) => a.def.key === answer.key);
    const value = attr ? attributeText(attr, locale) : "";
    return value ? fill(resolveI18n(answer.template_i18n, locale), value) : "";
  }
  const ml = product?.size_ml;
  if (!ml || ml <= 0) return "";
  return fill(resolveI18n(answer.template_i18n, locale) || fs("sizeAnswer", locale), String(ml));
}

/** The questions that resolve to an answer for this product, in order —
 *  or none when fewer than `min_answered` do. */
export function resolveProductFaq(
  config: ProductFaqConfig,
  product: Product | undefined,
  locale: LocaleCode,
): ProductFaqRow[] {
  const rows = config.items.flatMap((item) => {
    const question = resolveI18n(item.q_i18n, locale).trim();
    const answer = answerOf(item.answer, product, locale);
    return question && answer ? [{ question, answer }] : [];
  });
  return rows.length >= (config.min_answered ?? DEFAULT_MIN_ANSWERED) ? rows : [];
}

export interface ContactRowData {
  title: string;
  sub: string;
  callHref: string | null;
  whatsappHref: string | null;
}

/** The one contact row: title, sub line, call + WhatsApp. */
export function ContactRow({ data, locale }: { data: ContactRowData; locale: LocaleCode }) {
  const rtl = readsRtl(locale);
  const button = cn(
    "inline-flex min-h-[3.25rem] flex-1 basis-0 items-center justify-center gap-1.5 rounded-bk-pill border-bk border-bk-ink bg-bk-surface px-3 font-bk-display text-sm font-black text-bk-ink transition-opacity duration-bk-fast active:opacity-70 motion-reduce:transition-none",
    rtl && "flex-row-reverse",
  );
  return (
    <div data-contact-row="" className="mt-bk-sm rounded-bk-card bg-bk-surface-alt px-4 py-3">
      {(data.title || data.sub) && (
        <div className={rtl ? "text-right" : "text-left"}>
          {data.title && (
            <p
              data-i18n-field="contact.title_i18n"
              className="font-bk-body text-base font-bold leading-snug text-bk-ink text-balance"
            >
              {data.title}
            </p>
          )}
          {data.sub && (
            <p
              data-i18n-field="contact.sub_i18n"
              className="mt-0.5 font-bk-body text-xs leading-relaxed text-bk-ink-soft text-pretty"
            >
              {data.sub}
            </p>
          )}
        </div>
      )}
      <div className={cn("mt-bk-sm flex gap-bk-xs", rtl && "flex-row-reverse")}>
        {data.callHref && (
          <a href={data.callHref} data-contact="call" className={button}>
            <MaterialIcon name="call" className="text-lg" />
            <span>{fs("call", locale)}</span>
          </a>
        )}
        {data.whatsappHref && (
          <a
            href={data.whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            data-contact="whatsapp"
            className={button}
          >
            <WhatsAppIcon shadow={false} className="h-5 w-5 shrink-0 text-bk-success" />
            <span>{fs("whatsapp", locale)}</span>
          </a>
        )}
      </div>
    </div>
  );
}

export function FaqProductView({
  title,
  chapter,
  groupName,
  rows,
  locale,
  contactRow,
  whatsappCard,
}: {
  title: string;
  chapter: boolean;
  groupName: string;
  rows: readonly ProductFaqRow[];
  locale: LocaleCode;
  /** `contact_style: "row"` with at least one channel. */
  contactRow: ContactRowData | null;
  /** Otherwise: today's compact WhatsApp row, when the store has a number. */
  whatsappCard: { title: string; sub: string; ctaLabel: string; href: string } | null;
}) {
  const rtl = readsRtl(locale);
  const textSide = rtl ? "text-right" : "text-left";
  if (rows.length === 0 && !contactRow && !whatsappCard) return null;
  return (
    <Section density="dense" data-faq-product="">
      {rows.length > 0 && (
        <>
          {title &&
            (chapter ? (
              <ChapterHeading title={title} locale={locale} titleField="product_faq.title_i18n" />
            ) : (
              <h2
                data-i18n-field="product_faq.title_i18n"
                className={cn("mb-bk-sm font-bk-display text-lg font-black text-bk-ink text-balance", textSide)}
              >
                {title}
              </h2>
            ))}
          <div className="divide-y divide-bk-divider border-y border-bk-divider">
            {rows.map(({ question, answer }, i) => (
              <details key={`${i}-${question}`} name={groupName} open={i === 0} data-faq-item="" className="group">
                <summary
                  className={cn(
                    "flex min-h-14 w-full cursor-pointer list-none items-center gap-3 py-4 text-bk-ink transition-opacity duration-bk-fast active:opacity-70 motion-reduce:transition-none [&::-webkit-details-marker]:hidden",
                    rtl && "flex-row-reverse",
                  )}
                >
                  <span className={cn("flex-1 font-bk-display text-base font-bold leading-snug text-balance", textSide)}>
                    {question}
                  </span>
                  <MaterialIcon
                    name="expand_more"
                    className="shrink-0 text-xl text-bk-ink transition-transform duration-bk-base ease-out group-open:rotate-180 motion-reduce:transition-none"
                  />
                </summary>
                <div className={cn("pb-4", textSide)}>
                  <p className="whitespace-pre-line font-bk-body text-[15px] leading-loose text-bk-ink-soft text-pretty">
                    {answer}
                  </p>
                  <a
                    href={ORDER_FORM_HREF}
                    data-faq-order=""
                    className={cn(
                      "mt-1 inline-flex min-h-11 items-center gap-1 font-bk-body text-sm font-black text-bk-ink underline underline-offset-4",
                      rtl && "flex-row-reverse",
                    )}
                  >
                    <span>{fs("orderAndTry", locale)}</span>
                    <MaterialIcon name="arrow_upward" className="text-base" />
                  </a>
                </div>
              </details>
            ))}
          </div>
        </>
      )}
      {contactRow ? (
        <ContactRow data={contactRow} locale={locale} />
      ) : (
        whatsappCard && (
          <ActionRow
            kind="whatsapp"
            rtl={rtl}
            action={
              <ActionPill
                href={whatsappCard.href}
                external
                rtl={rtl}
                icon={<WhatsAppIcon shadow={false} className="h-5 w-5 shrink-0 text-bk-success" />}
                label={whatsappCard.ctaLabel}
                labelField="contact.cta_label_i18n"
              />
            }
          >
            {whatsappCard.title && (
              <p
                data-i18n-field="contact.title_i18n"
                className="font-bk-body text-sm font-bold leading-snug text-bk-ink text-balance"
              >
                {whatsappCard.title}
              </p>
            )}
            {whatsappCard.sub && (
              <p
                data-i18n-field="contact.sub_i18n"
                className="font-bk-body text-xs leading-relaxed text-bk-ink-soft text-pretty"
              >
                {whatsappCard.sub}
              </p>
            )}
          </ActionRow>
        )
      )}
    </Section>
  );
}
```

- [ ] **Step 4: Wire it into the section**

In `packages/sections/src/faq_contact_split.tsx`:

Replace:
```ts
import { resolveI18n } from "@scheniders/shared";
```
with:
```ts
import { parseStoreContact, resolveI18n } from "@scheniders/shared";
```

Replace:
```ts
import { readsRtl } from "./pdp_express/text";
import { FaqContactCompact } from "./faq_contact_split.compact";
```
with:
```ts
import { readsRtl } from "./pdp_express/text";
import { displayNameOf } from "./pdp_express/identity-label";
import { FaqContactCompact } from "./faq_contact_split.compact";
import { FaqProductView, resolveProductFaq, type ContactRowData } from "./faq_contact_split.product";
import { fs } from "./faq_contact_split.strings";
```

Replace:
```ts
  compact: z.boolean().optional().catch(undefined),
  items: z
```
with:
```ts
  compact: z.boolean().optional().catch(undefined),
  /**
   * Opt-in product FAQ (spec §1.7): questions about THIS product, each
   * answered from its own data or a merchant text; shown only when at
   * least `min_answered` (default 2) resolve. When set, it replaces
   * `items` (kept in config) and every other layout. An `attribute`
   * answer reads a text/enum attribute; a `size_ml` answer reads
   * products.size_ml into «القنينة {value} مل». Empty = unanswered.
   */
  product_faq: z
    .object({
      title_i18n: i18nStringOptional,
      min_answered: z.number().int().min(1).max(10).optional().catch(undefined),
      items: z
        .array(
          z.object({
            q_i18n: i18nStringSchema,
            answer: z.discriminatedUnion("kind", [
              z.object({ kind: z.literal("text"), a_i18n: i18nStringSchema }),
              z.object({
                kind: z.literal("attribute"),
                key: z.string().min(1),
                template_i18n: i18nStringOptional,
              }),
              z.object({ kind: z.literal("size_ml"), template_i18n: i18nStringOptional }),
            ]),
          }),
        )
        .min(1)
        .max(8),
    })
    .optional()
    .catch(undefined),
  /** With `product_faq`: "row" = one row with «اتصل بينا» + «راسلنا
   *  واتساب» under the questions (title and sub from `contact`); absent
   *  or "card" = the compact WhatsApp row. Other layouts ignore it. */
  contact_style: z.enum(["card", "row"]).optional().catch(undefined),
  /** "chapter": the product FAQ's and the compact layout's heading at the
   *  chapter scale. The cards/ledger header (eyebrow, centred title, sub)
   *  and a page-leading h1 keep theirs. */
  heading_style: z.enum(["section", "chapter"]).optional().catch(undefined),
  items: z
```

Replace:
```ts
type Props = z.infer<typeof schema>;
```
with:
```ts
export type Props = z.infer<typeof schema>;
```

Replace:
```tsx
  if (props.compact) {
    return (
      <FaqContactCompact
```
with:
```tsx
  if (props.product_faq) {
    const product = ctx.product;
    const dial = parseStoreContact(ctx.tenant.store_config_v2?.commerce?.contact)?.call_number;
    const ask = product ? fs("askAbout", locale, { product: displayNameOf(product) }) : "";
    const contactRow: ContactRowData | null =
      props.contact_style === "row" && (dial || waNumber)
        ? {
            title: contactTitle,
            sub: contactSub,
            callHref: dial ? `tel:+${whatsappDigits(dial)}` : null,
            whatsappHref: waNumber
              ? `https://wa.me/${whatsappDigits(waNumber)}${ask ? `?text=${encodeURIComponent(ask)}` : ""}`
              : null,
          }
        : null;
    return (
      <FaqProductView
        title={resolveI18n(props.product_faq.title_i18n, locale) || title}
        chapter={props.heading_style === "chapter"}
        groupName={groupName}
        rows={resolveProductFaq(props.product_faq, product, locale)}
        locale={locale}
        contactRow={contactRow}
        whatsappCard={
          props.contact_style !== "row" && waHref && ctaLabel
            ? { title: contactTitle, sub: contactSub, ctaLabel, href: waHref }
            : null
        }
      />
    );
  }

  if (props.compact) {
    return (
      <FaqContactCompact
```

Replace:
```tsx
        rtl={readsRtl(locale)}
      />
    );
  }
```
with:
```tsx
        rtl={readsRtl(locale)}
        chapterLocale={props.heading_style === "chapter" && headingAs === "h2" ? locale : undefined}
      />
    );
  }
```

In `packages/sections/src/faq_contact_split.compact.tsx`:

Replace:
```ts
import { cn } from "@scheniders/shared";
import { MaterialIcon, Section, WhatsAppIcon } from "./helpers/primitives";
```
with:
```ts
import { cn } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { ChapterHeading } from "./helpers/chapter-heading";
import { MaterialIcon, Section, WhatsAppIcon } from "./helpers/primitives";
```

Replace:
```ts
  contact,
  rtl,
}: {
```
with:
```ts
  contact,
  rtl,
  chapterLocale,
}: {
```

Replace:
```ts
  contact: CompactFaqContact | null;
  rtl: boolean;
}) {
```
with:
```ts
  contact: CompactFaqContact | null;
  rtl: boolean;
  /** `heading_style: "chapter"`: the heading at the chapter scale. */
  chapterLocale?: LocaleCode;
}) {
```

Replace:
```tsx
      {title && (
        <Heading
```
with:
```tsx
      {title && chapterLocale && (
        <ChapterHeading title={title} locale={chapterLocale} titleField="title_i18n" />
      )}
      {title && !chapterLocale && (
        <Heading
```

- [ ] **Step 5: Run the test and every FAQ baseline**

```bash
CI=true pnpm exec vitest run packages/sections/src/_faq-product.test.tsx packages/sections/src/faq_contact_split.compact.test.tsx packages/sections/src/faq-ledger.test.tsx packages/sections/src/_pdp-lower-baseline-snapshot.test.tsx packages/sections/src/_pdp-reviews-faq-baseline-snapshot.test.tsx
```
Expected: `Test Files  5 passed (5)`, `Tests  55 passed (55)` (18 + 16 + 7 + 10 + 4), no `written`/`updated`.

- [ ] **Step 6: Type gate, then commit**

Run the sections type gate. Expected: no output.
```bash
git branch --show-current
git add packages/sections/src/faq_contact_split.product.tsx packages/sections/src/faq_contact_split.tsx packages/sections/src/faq_contact_split.compact.tsx packages/sections/src/_faq-product.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): product-only FAQ (hidden under 2 answers) + one call/WhatsApp contact row; heading_style" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The 1e draft-config migration (written, replayed locally, dry-run; NOT applied)

**Files:**
- Create: `packages/supabase/migrations/<STAMP>_scheniders_iraq_pdp_redesign_1e_draft.sql`
- Scratch: `tmp/pdp-1e/dryrun-1e.sql` (gitignored), `${TMPDIR:-/tmp}/pdp-1e-pglite/` (outside the repo)

All live access in this task is **read-only**. The JSON in the three `$json$` blocks is exactly what Task 10's fixtures hold (`SLICE_1E_REVIEWS_PATCH`, `SLICE_1E_FAQ_PATCH`, `SLICE_1E_PDP_PATCH`); Task 10's mirror test proves it.

- [ ] **Step 1: Pick the timestamp**

```bash
STAMP=$(date -u +%Y%m%d%H%M%S); echo $STAMP
ls packages/supabase/migrations | grep -E '^[0-9]{14}_' | sort | tail -1
```
Expected: `$STAMP` sorts after the last listed file (today `20261029225645_scheniders_iraq_pdp_redesign_1d_draft.sql`). Keep `$STAMP` in this shell for this task.

- [ ] **Step 2: Write the migration**

Create `packages/supabase/migrations/${STAMP}_scheniders_iraq_pdp_redesign_1e_draft.sql` (if Task 0 Step 3 read other guard values, put those in `c_expected_draft_md5` / `c_expected_rev` and the header's guard c. and Rollback lines):

```sql
-- =====================================================================
-- scheniders-iraq PDP redesign, slice 1e — DRAFT config only
-- =====================================================================
-- Spec: docs/superpowers/specs/2026-10-27-pdp-lower-page-redesign-design.md
-- §1.2 (identity_rating), §1.6, §1.7, §1.9, D1, D4, D10, D14, D15.
--
-- Writes ONLY tenants.store_config_v2_draft (and updated_at) for slug
-- scheniders-iraq. store_config_v2 (published) is never written; its md5
-- is captured before the write and asserted equal after it.
--
-- What it changes in the draft's product page, each base merged with `||`:
--   1. product_reviews 1ab3ee76: layout "highlights" (summary card
--      #reviews-summary, word buttons, D10 order), the heading «شنو گالوا
--      اللي جرّبوه», form_entry "hash_only", visible_count 3,
--      heading_style "chapter", four theme_words (الثبات / التيستر / فخامة /
--      العلبة والتغليف) and review_curation: one key phrase per approved
--      Wayfarer review (no rank, no reply: Ali writes the reply, to-do 1).
--   2. faq_contact_split 8354d117: product_faq («شكد يثبت؟» → attribute
--      longevity_note, «شكد حجم القنينة؟» → size_ml; hidden until 2
--      answer), contact_style "row", heading_style "chapter", and
--      `contact` restated whole with the new title/sub (icon, CTA label
--      and number unchanged). items stay in config and no longer render.
--   3. pdp_direct_order aae22169: identity_rating "summary_link" (the
--      identity row's rating and the scent card footer link to
--      #reviews-summary, which exists from this slice on).
--
-- Guards, in order, in one transaction:
--   a. no tenant / no product page / one of the three sections missing
--      -> RAISE NOTICE and no write (a fresh database replays this as a no-op);
--   b. the transform applied to the current draft changes nothing
--      -> RAISE NOTICE 'already applied' and no write (a second run is a no-op);
--   c. md5(store_config_v2_draft::text) must be 8d0e6032304d56057abfecbb4487b95b
--      and store_config_rev must be 38 (the draft after the 1d migration)
--      -> else RAISE EXCEPTION: someone edited or published since, so
--      re-read and regenerate this file;
--   d. md5(store_config_v2::text) is equal before and after the write.
--
-- Applied ONLY after the code that reads these props is deployed:
--   supabase db query --linked -f <this file>
--   supabase migration repair --status applied <version>
-- Never `supabase db push`.
--
-- Rollback (read at draft md5 8d0e6032304d56057abfecbb4487b95b): restore
--   product_reviews 1ab3ee76 base =
--     {"layout": "quiet", "show_form": true, "heading_i18n": {"ar": "آراء
--      العملاء", "en": "Customer reviews"}} (IRAQ_DRAFT_REVIEWS_BASE in
--     packages/sections/src/_pdp-redesign-fixtures.ts);
--   faq_contact_split 8354d117 base = IRAQ_DRAFT_FAQ_BASE in the same file
--     (compact true, the four store questions, contact title «عندك
--     استفسار؟», sub «نورونا على الواتساب وسولفوا ويانا»);
--   pdp_direct_order aae22169: remove identity_rating with `-`.
-- =====================================================================

DO $mig$
DECLARE
  c_slug constant text := 'scheniders-iraq';
  c_expected_rev constant bigint := 38;
  c_expected_draft_md5 constant text := '8d0e6032304d56057abfecbb4487b95b';
  c_pdp_id constant text := 'aae22169-cef4-4495-842b-863a7caa71c2';
  c_reviews_id constant text := '1ab3ee76-902a-42c8-8c26-e6d87b3fd6fc';
  c_faq_id constant text := '8354d117-ed8d-4a3e-9bea-8ed6fd8b1023';
  -- reviews_patch:begin
  c_reviews_patch constant jsonb := $json${
    "layout": "highlights",
    "heading_i18n": {
      "ar": "شنو گالوا اللي جرّبوه",
      "en": "What people who tried it said"
    },
    "form_entry": "hash_only",
    "visible_count": 3,
    "heading_style": "chapter",
    "theme_words": [
      {
        "key": "longevity",
        "label_i18n": {
          "ar": "الثبات",
          "en": "Longevity"
        },
        "match_terms": [
          "ثبات"
        ]
      },
      {
        "key": "tester",
        "label_i18n": {
          "ar": "التيستر",
          "en": "The tester"
        },
        "match_terms": [
          "تيستر"
        ]
      },
      {
        "key": "luxury",
        "label_i18n": {
          "ar": "فخامة",
          "en": "Luxury"
        },
        "match_terms": [
          "فخم"
        ]
      },
      {
        "key": "packaging",
        "label_i18n": {
          "ar": "العلبة والتغليف",
          "en": "Box and packaging"
        },
        "match_terms": [
          "تغليف",
          "علبه"
        ]
      }
    ],
    "review_curation": [
      {
        "review_id": "d7c511e8-f208-4956-b7e2-a9a8f85be05e",
        "highlight": "بس وصلتني العلبة مرتبة والتيستر فكرة تخبل"
      },
      {
        "review_id": "fcd04048-2a8c-4377-a5c3-2e7f7c20b628",
        "highlight": "هذا ثاني عطر اطلبه منهم"
      },
      {
        "review_id": "b4f6b842-2e63-465b-8d11-3dc15039ed68",
        "highlight": "العطر صدمني بثباته"
      },
      {
        "review_id": "6881921e-d263-4780-8878-762e01904146",
        "highlight": "كله اشتري عطور بمية ومية وخمسين بس ممحصل منهم بكد ثبات هذا الويفر"
      },
      {
        "review_id": "aeb344f2-8597-45f7-b639-99973d6f1a6f",
        "highlight": "اشتريته وخليته بالسيارة بنفس اليوم قطوه مني"
      },
      {
        "review_id": "cd25b071-10d9-4de5-a324-ea6a0793559b",
        "highlight": "العطر كلش راقي وثباته يطول يوم كامل على الملابس"
      }
    ]
  }$json$;
  -- reviews_patch:end
  -- faq_patch:begin
  c_faq_patch constant jsonb := $json${
    "product_faq": {
      "title_i18n": {
        "ar": "أسئلة قبل لا تطلب",
        "en": "Before you order"
      },
      "items": [
        {
          "q_i18n": {
            "ar": "شكد يثبت؟",
            "en": "How long does it last?"
          },
          "answer": {
            "kind": "attribute",
            "key": "longevity_note"
          }
        },
        {
          "q_i18n": {
            "ar": "شكد حجم القنينة؟",
            "en": "How big is the bottle?"
          },
          "answer": {
            "kind": "size_ml"
          }
        }
      ]
    },
    "contact_style": "row",
    "heading_style": "chapter",
    "contact": {
      "icon_url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/66a2314b-371e-4474-ad0d-53a4cad055f9.svg",
      "sub_i18n": {
        "ar": "نفس الرقم للاتصال والواتساب",
        "en": "Same number for calls and WhatsApp"
      },
      "title_i18n": {
        "ar": "محتار بالريحة؟ نوصفلك ياها",
        "en": "Not sure about the scent? We'll describe it"
      },
      "cta_label_i18n": {
        "ar": "واتساب",
        "en": "WhatsApp"
      },
      "whatsapp_number": ""
    }
  }$json$;
  -- faq_patch:end
  -- pdp_patch:begin
  c_pdp_patch constant jsonb := $json${
    "identity_rating": "summary_link"
  }$json$;
  -- pdp_patch:end
  v_tenant_id uuid;
  v_rev bigint;
  v_draft jsonb;
  v_target jsonb;
  v_pub_md5 text;
  v_page_idx int;
  v_sections jsonb;
  v_new_sections jsonb;
  v_missing text[];
BEGIN
  SELECT id, store_config_rev, store_config_v2_draft, md5(store_config_v2::text)
    INTO v_tenant_id, v_rev, v_draft, v_pub_md5
    FROM public.tenants
   WHERE slug = c_slug
     FOR UPDATE;
  IF NOT FOUND OR v_draft IS NULL THEN
    RAISE NOTICE 'pdp redesign 1e: no tenant % with a draft, nothing written', c_slug;
    RETURN;
  END IF;

  SELECT (p.ord - 1)::int INTO v_page_idx
    FROM jsonb_array_elements(v_draft->'pages') WITH ORDINALITY AS p(page, ord)
   WHERE p.page->>'page_id' = 'product';
  IF v_page_idx IS NULL THEN
    RAISE NOTICE 'pdp redesign 1e: % has no product page, nothing written', c_slug;
    RETURN;
  END IF;
  v_sections := v_draft->'pages'->v_page_idx->'sections';

  SELECT array_agg(want) INTO v_missing
    FROM unnest(ARRAY[c_pdp_id, c_reviews_id, c_faq_id]) AS want
   WHERE NOT EXISTS (
     SELECT 1 FROM jsonb_array_elements(v_sections) AS s(sec) WHERE s.sec->>'id' = want
   );
  IF v_missing IS NOT NULL THEN
    RAISE NOTICE 'pdp redesign 1e: product page lacks sections %, nothing written', v_missing;
    RETURN;
  END IF;

  SELECT jsonb_agg(
           CASE x.sec->>'id'
             WHEN c_reviews_id
               THEN jsonb_set(x.sec, '{base}', coalesce(x.sec->'base', '{}'::jsonb) || c_reviews_patch)
             WHEN c_faq_id
               THEN jsonb_set(x.sec, '{base}', coalesce(x.sec->'base', '{}'::jsonb) || c_faq_patch)
             WHEN c_pdp_id
               THEN jsonb_set(x.sec, '{base}', coalesce(x.sec->'base', '{}'::jsonb) || c_pdp_patch)
             ELSE x.sec
           END
           ORDER BY x.ord
         )
    INTO v_new_sections
    FROM jsonb_array_elements(v_sections) WITH ORDINALITY AS x(sec, ord);

  v_target := jsonb_set(v_draft, ARRAY['pages', v_page_idx::text, 'sections'], v_new_sections);

  IF v_target = v_draft THEN
    RAISE NOTICE 'pdp redesign 1e: already applied, nothing written';
    RETURN;
  END IF;

  IF md5(v_draft::text) <> c_expected_draft_md5 THEN
    RAISE EXCEPTION 'pdp redesign 1e: draft md5 is %, expected % (edited since it was read); re-read and regenerate',
      md5(v_draft::text), c_expected_draft_md5;
  END IF;
  IF v_rev <> c_expected_rev THEN
    RAISE EXCEPTION 'pdp redesign 1e: store_config_rev is %, expected % (published since it was read); re-read and regenerate',
      v_rev, c_expected_rev;
  END IF;

  UPDATE public.tenants
     SET store_config_v2_draft = v_target,
         updated_at = now()
   WHERE id = v_tenant_id;

  IF (SELECT md5(store_config_v2::text) FROM public.tenants WHERE id = v_tenant_id) <> v_pub_md5 THEN
    RAISE EXCEPTION 'pdp redesign 1e: the published config changed during the write';
  END IF;

  RAISE NOTICE 'pdp redesign 1e: draft md5 % -> %', c_expected_draft_md5, md5(v_target::text);
END
$mig$;
```

What is in it, for the reviewer:
- the reviews patch replaces the heading «آراء العملاء» (عملاء, which the F12 term sheet rejects for this store's voice) with spec §1.6's «شنو گالوا اللي جرّبوه»; `show_form: true` stays from the base (the form still exists, behind `#reviews`);
- the six `review_curation` entries carry only a `highlight` each, every one a verbatim part of its approved body (Task 10's test checks it); no `rank` (D10 already gives Ali's order), no `tags`, no `reply_i18n` (to-do 1);
- the FAQ patch restates `contact` whole: `icon_url`, `cta_label_i18n` («واتساب») and `whatsapp_number` ("") are the base's values (Task 10's test checks it). `compact: true` and the four store questions stay in config and stop rendering;
- `identity_rating: "summary_link"` is the one key 1b deferred to this slice.

- [ ] **Step 3: Copy the live row read-only and install PGlite outside the repo**

```bash
mkdir -p "${TMPDIR:-/tmp}/pdp-1e-pglite"
(cd packages && supabase db query --linked "SELECT store_config_v2_draft::text AS draft, store_config_v2::text AS pub FROM tenants WHERE slug='scheniders-iraq'" -o json) > "${TMPDIR:-/tmp}/pdp-1e-pglite/live.json"
cd "${TMPDIR:-/tmp}/pdp-1e-pglite"
node -e 'const fs=require("fs");const r=JSON.parse(fs.readFileSync("live.json")).rows[0];fs.writeFileSync("draft.json",r.draft);fs.writeFileSync("pub.json",r.pub);console.log(r.draft.length, r.pub.length)'
echo '{"name":"pdp-1e-pglite","private":true,"type":"module"}' > package.json
pnpm add @electric-sql/pglite@0.2.17
cd /Users/ali/scheniders-mono-pdp
```
Expected: `68564 60860` (on 2026-10-30, after 1d), then `+ @electric-sql/pglite 0.2.17`.

- [ ] **Step 4: Write the replay harness**

Create `${TMPDIR:-/tmp}/pdp-1e-pglite/harness-draft.mjs`:

```js
// Replays the 1e draft-config migration against a local Postgres (PGlite)
// loaded with a read-only copy of the live scheniders-iraq row.
// usage: node harness-draft.mjs <migration.sql> <draft.json> <pub.json> <rev>
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const [file, draftPath, pubPath, revArg] = process.argv.slice(2);
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
       VALUES ('b5c4f2d4-834f-4af4-822d-9b9826a8f45a', 'scheniders-iraq', $1, $2::jsonb,
               CASE WHEN $4 THEN jsonb_set($3::jsonb, '{default_locale}', '"en"') ELSE $3::jsonb END,
               '2026-10-29T21:27:39Z')`,
      [rev, pub, draft, editDraft],
    );
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
    await pg.exec(sql, { onNotice: (n) => n.message.startsWith("pdp redesign") && notices.push(n.message) });
    console.log(`${label}: ok`, JSON.stringify(notices.splice(0)));
  } catch (e) {
    console.log(`${label}: ERROR ${e.message}`);
  }
}

const SUMMARY = `
  SELECT
    (SELECT string_agg(s.sec->>'type', ',' ORDER BY s.ord) FROM jsonb_array_elements(p.page->'sections') WITH ORDINALITY s(sec, ord)) AS order_,
    r.sec->'base'->>'layout' AS reviews_layout,
    r.sec->'base'->'heading_i18n'->>'ar' AS reviews_heading,
    jsonb_array_length(coalesce(r.sec->'base'->'theme_words', '[]')) AS themes,
    jsonb_array_length(coalesce(r.sec->'base'->'review_curation', '[]')) AS curated,
    f.sec->'base' ? 'product_faq' AS has_product_faq,
    f.sec->'base'->>'contact_style' AS contact_style,
    f.sec->'base'->'contact'->'title_i18n'->>'ar' AS contact_title,
    jsonb_array_length(f.sec->'base'->'items') AS old_items,
    d.sec->'base'->>'identity_rating' AS identity_rating,
    md5((d.sec->'base'->'scent_card'->'product_copy')::text) AS copy_md5
  FROM public.tenants t,
       jsonb_array_elements(t.store_config_v2_draft->'pages') p(page),
       jsonb_array_elements(p.page->'sections') r(sec),
       jsonb_array_elements(p.page->'sections') f(sec),
       jsonb_array_elements(p.page->'sections') d(sec)
  WHERE p.page->>'page_id' = 'product'
    AND r.sec->>'id' = '1ab3ee76-902a-42c8-8c26-e6d87b3fd6fc'
    AND f.sec->>'id' = '8354d117-ed8d-4a3e-9bea-8ed6fd8b1023'
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

```bash
node "${TMPDIR:-/tmp}/pdp-1e-pglite/harness-draft.mjs" "packages/supabase/migrations/${STAMP}_scheniders_iraq_pdp_redesign_1e_draft.sql" "${TMPDIR:-/tmp}/pdp-1e-pglite/draft.json" "${TMPDIR:-/tmp}/pdp-1e-pglite/pub.json" 38
```
Expected (pre-run 2026-10-30 on the live post-1d row):
```
before {"d":"8d0e6032304d56057abfecbb4487b95b","p":"a6f87ba3181b0e94f41ba4a700de257b","bumped":false}
draft before {"order_":"pdp_direct_order,image_gallery,product_reviews,accordion_richtext,faq_contact_split,product_grid,trust_badge_row,sticky_cta_bar","reviews_layout":"quiet","reviews_heading":"آراء العملاء","themes":0,"curated":0,"has_product_faq":false,"contact_style":null,"contact_title":"عندك استفسار؟","old_items":4,"identity_rating":null,"copy_md5":"523744df04f3acb3e6983ddb422d3266"}
first run: ok ["pdp redesign 1e: draft md5 8d0e6032304d56057abfecbb4487b95b -> 89b6499d703c80771a38ef7195a5bc78"]
after first {"d":"89b6499d703c80771a38ef7195a5bc78","p":"a6f87ba3181b0e94f41ba4a700de257b","bumped":true}
draft after {"order_":"pdp_direct_order,image_gallery,product_reviews,accordion_richtext,faq_contact_split,product_grid,trust_badge_row,sticky_cta_bar","reviews_layout":"highlights","reviews_heading":"شنو گالوا اللي جرّبوه","themes":4,"curated":6,"has_product_faq":true,"contact_style":"row","contact_title":"محتار بالريحة؟ نوصفلك ياها","old_items":4,"identity_rating":"summary_link","copy_md5":"523744df04f3acb3e6983ddb422d3266"}
second run: ok ["pdp redesign 1e: already applied, nothing written"]
after second {"d":"89b6499d703c80771a38ef7195a5bc78","p":"a6f87ba3181b0e94f41ba4a700de257b","bumped":true}
edited draft: ERROR pdp redesign 1e: draft md5 is 1ecb7783f65c6cc44f6eae841218009e, expected 8d0e6032304d56057abfecbb4487b95b (edited since it was read); re-read and regenerate
edited draft state {"d":"1ecb7783f65c6cc44f6eae841218009e","p":"a6f87ba3181b0e94f41ba4a700de257b","bumped":false}
published since: ERROR pdp redesign 1e: store_config_rev is 39, expected 38 (published since it was read); re-read and regenerate
empty database: ok ["pdp redesign 1e: no tenant scheniders-iraq with a draft, nothing written"]
```
This covers §1.10's data checks: the published md5 `p` never moves; `updated_at` is bumped only by a real write; a second run is a no-op; an edited draft or a publish since the read aborts; an empty database is a no-op. The section order is untouched (D1 since 1b), the old FAQ items stay in config, and 1c's `product_copy` (`523744df…`, the go-live file's guard) is untouched.

- [ ] **Step 6: Dry run on the live row (a SELECT, writes nothing)**

Create `tmp/pdp-1e/dryrun-1e.sql`:

```sql
-- Read-only dry run of <STAMP>_scheniders_iraq_pdp_redesign_1e_draft.sql:
-- the same transform as a SELECT. Writes nothing.
WITH c AS (
  SELECT
    'aae22169-cef4-4495-842b-863a7caa71c2'::text AS pdp_id,
    '1ab3ee76-902a-42c8-8c26-e6d87b3fd6fc'::text AS reviews_id,
    '8354d117-ed8d-4a3e-9bea-8ed6fd8b1023'::text AS faq_id,
    $json${
      "layout": "highlights",
      "heading_i18n": {
        "ar": "شنو گالوا اللي جرّبوه",
        "en": "What people who tried it said"
      },
      "form_entry": "hash_only",
      "visible_count": 3,
      "heading_style": "chapter",
      "theme_words": [
        {
          "key": "longevity",
          "label_i18n": {
            "ar": "الثبات",
            "en": "Longevity"
          },
          "match_terms": [
            "ثبات"
          ]
        },
        {
          "key": "tester",
          "label_i18n": {
            "ar": "التيستر",
            "en": "The tester"
          },
          "match_terms": [
            "تيستر"
          ]
        },
        {
          "key": "luxury",
          "label_i18n": {
            "ar": "فخامة",
            "en": "Luxury"
          },
          "match_terms": [
            "فخم"
          ]
        },
        {
          "key": "packaging",
          "label_i18n": {
            "ar": "العلبة والتغليف",
            "en": "Box and packaging"
          },
          "match_terms": [
            "تغليف",
            "علبه"
          ]
        }
      ],
      "review_curation": [
        {
          "review_id": "d7c511e8-f208-4956-b7e2-a9a8f85be05e",
          "highlight": "بس وصلتني العلبة مرتبة والتيستر فكرة تخبل"
        },
        {
          "review_id": "fcd04048-2a8c-4377-a5c3-2e7f7c20b628",
          "highlight": "هذا ثاني عطر اطلبه منهم"
        },
        {
          "review_id": "b4f6b842-2e63-465b-8d11-3dc15039ed68",
          "highlight": "العطر صدمني بثباته"
        },
        {
          "review_id": "6881921e-d263-4780-8878-762e01904146",
          "highlight": "كله اشتري عطور بمية ومية وخمسين بس ممحصل منهم بكد ثبات هذا الويفر"
        },
        {
          "review_id": "aeb344f2-8597-45f7-b639-99973d6f1a6f",
          "highlight": "اشتريته وخليته بالسيارة بنفس اليوم قطوه مني"
        },
        {
          "review_id": "cd25b071-10d9-4de5-a324-ea6a0793559b",
          "highlight": "العطر كلش راقي وثباته يطول يوم كامل على الملابس"
        }
      ]
    }$json$::jsonb AS reviews_patch,
    $json${
      "product_faq": {
        "title_i18n": {
          "ar": "أسئلة قبل لا تطلب",
          "en": "Before you order"
        },
        "items": [
          {
            "q_i18n": {
              "ar": "شكد يثبت؟",
              "en": "How long does it last?"
            },
            "answer": {
              "kind": "attribute",
              "key": "longevity_note"
            }
          },
          {
            "q_i18n": {
              "ar": "شكد حجم القنينة؟",
              "en": "How big is the bottle?"
            },
            "answer": {
              "kind": "size_ml"
            }
          }
        ]
      },
      "contact_style": "row",
      "heading_style": "chapter",
      "contact": {
        "icon_url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/66a2314b-371e-4474-ad0d-53a4cad055f9.svg",
        "sub_i18n": {
          "ar": "نفس الرقم للاتصال والواتساب",
          "en": "Same number for calls and WhatsApp"
        },
        "title_i18n": {
          "ar": "محتار بالريحة؟ نوصفلك ياها",
          "en": "Not sure about the scent? We'll describe it"
        },
        "cta_label_i18n": {
          "ar": "واتساب",
          "en": "WhatsApp"
        },
        "whatsapp_number": ""
      }
    }$json$::jsonb AS faq_patch,
    $json${
      "identity_rating": "summary_link"
    }$json$::jsonb AS pdp_patch
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
             WHEN c.reviews_id THEN jsonb_set(x.sec, '{base}', coalesce(x.sec->'base', '{}'::jsonb) || c.reviews_patch)
             WHEN c.faq_id THEN jsonb_set(x.sec, '{base}', coalesce(x.sec->'base', '{}'::jsonb) || c.faq_patch)
             WHEN c.pdp_id THEN jsonb_set(x.sec, '{base}', coalesce(x.sec->'base', '{}'::jsonb) || c.pdp_patch)
             ELSE x.sec
           END
           ORDER BY x.ord
         ) AS sections
    FROM c, p, jsonb_array_elements(p.sections) WITH ORDINALITY AS x(sec, ord)
),
target AS (
  SELECT jsonb_set(t.draft, ARRAY['pages', p.idx::text, 'sections'], s.sections) AS draft
    FROM t, p, s
)
SELECT
  t.rev = 38 AS rev_ok,
  md5(t.draft::text) = '8d0e6032304d56057abfecbb4487b95b' AS draft_md5_ok,
  md5(target.draft::text) AS target_md5
FROM t, target;
```
```bash
grep -ciE "\b(update|insert|delete|alter|drop|create)\b" tmp/pdp-1e/dryrun-1e.sql
(cd packages && supabase db query --linked -f ../tmp/pdp-1e/dryrun-1e.sql -o csv)
```
Expected: `0` (no write keyword), then:
```
rev_ok,draft_md5_ok,target_md5
true,true,89b6499d703c80771a38ef7195a5bc78
```
`target_md5` equals the replay's `after first`: the SELECT and the migration compute the same draft (pre-run live on 2026-10-30).

- [ ] **Step 7: Commit the migration (not applied)**

```bash
git branch --show-current
git add "packages/supabase/migrations/${STAMP}_scheniders_iraq_pdp_redesign_1e_draft.sql"
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "chore(db): scheniders-iraq PDP redesign 1e draft config (not applied)" -m "Reviews highlights + product FAQ / one contact row + identity_rating summary_link. Applied with supabase db query --linked -f only after the code is live; draft only, guarded on draft md5 8d0e6032… and store_config_rev 38." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Redesign fixtures carry 1e; the pair tests; reviewed snapshot update

**Files:**
- Modify: `packages/sections/src/_pdp-redesign-fixtures.ts`
- Modify: `packages/sections/src/_pdp-redesign-snapshot.test.tsx`
- Modify: `packages/sections/src/__snapshots__/_pdp-redesign-snapshot.test.tsx.snap` (vitest `-u`, this file only)
- Scratch: `tmp/pdp-1e/snapcheck.mjs`

This task is its own commit: the snapshot change is reviewed apart from the code.

- [ ] **Step 1: Add the 1e data to the fixtures**

In `packages/sections/src/_pdp-redesign-fixtures.ts`, delete (1d left it just above Task 1's two bases):
```ts
/** The draft pdp_direct_order after slices 1b, 1c and 1d. */
export const IRAQ_REDESIGN_PDP_PROPS: PdpDirectOrderProps = {
  ...EXPRESS_IRAQ_DRAFT_PDP_PROPS,
  ...SLICE_1B_PDP_PATCH,
  ...SLICE_1C_PDP_PATCH,
  ...SLICE_1D_PDP_PATCH,
};

```
(it moves to the end of the file: it now spreads `SLICE_1E_PDP_PATCH`, declared below it, and a `const` cannot be read before its declaration).

Then append to the end of the file (`jsonbMerge` is 1d's helper in this file; do not declare a second one):
```ts

/** Slice 1e: the identity row's rating becomes the link to the reviews
 *  summary (1b shipped the prop; its target, #reviews-summary, arrives
 *  with the highlights layout). The scent card's footer rating links too. */
export const SLICE_1E_PDP_PATCH = {
  identity_rating: "summary_link",
} satisfies Partial<PdpDirectOrderProps>;

/** Wayfarer's six approved reviews (live ids, read 2026-10-30). */
export const WAYFER_REVIEW_IDS = {
  ahmed: "cd25b071-10d9-4de5-a324-ea6a0793559b",
  hazem: "fcd04048-2a8c-4377-a5c3-2e7f7c20b628",
  yassin: "aeb344f2-8597-45f7-b639-99973d6f1a6f",
  saif: "6881921e-d263-4780-8878-762e01904146",
  mustafa: "b4f6b842-2e63-465b-8d11-3dc15039ed68",
  alshemmari: "d7c511e8-f208-4956-b7e2-a9a8f85be05e",
} as const;

/** Slice 1e: the keys the 1e draft migration merges into product_reviews'
 *  base. The key phrases are verbatim parts of each body (concept g3 B's
 *  three, drafted for the other three); Ali confirms them (to-do 14). No
 *  rank (D10 already puts Ahmed last) and no reply (to-do 1: Ali writes
 *  it; until then nothing renders). */
export const SLICE_1E_REVIEWS_PATCH = {
  layout: "highlights",
  heading_i18n: { ar: "شنو گالوا اللي جرّبوه", en: "What people who tried it said" },
  form_entry: "hash_only",
  visible_count: 3,
  heading_style: "chapter",
  theme_words: [
    { key: "longevity", label_i18n: { ar: "الثبات", en: "Longevity" }, match_terms: ["ثبات"] },
    { key: "tester", label_i18n: { ar: "التيستر", en: "The tester" }, match_terms: ["تيستر"] },
    { key: "luxury", label_i18n: { ar: "فخامة", en: "Luxury" }, match_terms: ["فخم"] },
    {
      key: "packaging",
      label_i18n: { ar: "العلبة والتغليف", en: "Box and packaging" },
      match_terms: ["تغليف", "علبه"],
    },
  ],
  review_curation: [
    { review_id: WAYFER_REVIEW_IDS.alshemmari, highlight: "بس وصلتني العلبة مرتبة والتيستر فكرة تخبل" },
    { review_id: WAYFER_REVIEW_IDS.hazem, highlight: "هذا ثاني عطر اطلبه منهم" },
    { review_id: WAYFER_REVIEW_IDS.mustafa, highlight: "العطر صدمني بثباته" },
    {
      review_id: WAYFER_REVIEW_IDS.saif,
      highlight: "كله اشتري عطور بمية ومية وخمسين بس ممحصل منهم بكد ثبات هذا الويفر",
    },
    { review_id: WAYFER_REVIEW_IDS.yassin, highlight: "اشتريته وخليته بالسيارة بنفس اليوم قطوه مني" },
    { review_id: WAYFER_REVIEW_IDS.ahmed, highlight: "العطر كلش راقي وثباته يطول يوم كامل على الملابس" },
  ],
} satisfies Partial<ReviewsProps>;

/** Slice 1e: the keys the 1e draft migration merges into faq_contact_split's
 *  base. `contact` is restated whole (jsonb `||` replaces the object):
 *  only its title and sub change. The four store questions stay in
 *  `items` and no longer render (their answers live in «كرت الضمان»). */
export const SLICE_1E_FAQ_PATCH = {
  product_faq: {
    title_i18n: { ar: "أسئلة قبل لا تطلب", en: "Before you order" },
    items: [
      {
        q_i18n: { ar: "شكد يثبت؟", en: "How long does it last?" },
        answer: { kind: "attribute", key: "longevity_note" },
      },
      {
        q_i18n: { ar: "شكد حجم القنينة؟", en: "How big is the bottle?" },
        answer: { kind: "size_ml" },
      },
    ],
  },
  contact_style: "row",
  heading_style: "chapter",
  contact: {
    ...IRAQ_DRAFT_FAQ_BASE.contact,
    title_i18n: { ar: "محتار بالريحة؟ نوصفلك ياها", en: "Not sure about the scent? We'll describe it" },
    sub_i18n: { ar: "نفس الرقم للاتصال والواتساب", en: "Same number for calls and WhatsApp" },
  },
} satisfies Partial<FaqProps>;

/** The draft product_reviews after slice 1e (unparsed, as stored). */
export const IRAQ_REDESIGN_REVIEWS_INPUT = jsonbMerge(IRAQ_DRAFT_REVIEWS_BASE, SLICE_1E_REVIEWS_PATCH);

/** The draft faq_contact_split after slice 1e (unparsed, as stored). */
export const IRAQ_REDESIGN_FAQ_INPUT = jsonbMerge(IRAQ_DRAFT_FAQ_BASE, SLICE_1E_FAQ_PATCH);

/** The draft pdp_direct_order after slices 1b, 1c, 1d and 1e. */
export const IRAQ_REDESIGN_PDP_PROPS: PdpDirectOrderProps = {
  ...EXPRESS_IRAQ_DRAFT_PDP_PROPS,
  ...SLICE_1B_PDP_PATCH,
  ...SLICE_1C_PDP_PATCH,
  ...SLICE_1D_PDP_PATCH,
  ...SLICE_1E_PDP_PATCH,
};
```

The English heading, the English topic labels, the six key phrases (concept g3-B's three — الشمري, eng. سيف, Ahmed — and three drafted here — حازم, مصطفى علي, ياسين), the FAQ questions' English and the contact row's English are drafted for Ali's sign-off (to-dos 10 and 14).

- [ ] **Step 2: Extend the redesign snapshot test**

In `packages/sections/src/_pdp-redesign-snapshot.test.tsx`:

Replace:
```ts
import accordion_richtext from "./accordion_richtext";
import image_gallery from "./image_gallery";
import pdp_direct_order from "./pdp_direct_order";
```
with:
```ts
import accordion_richtext from "./accordion_richtext";
import faq_contact_split from "./faq_contact_split";
import image_gallery from "./image_gallery";
import pdp_direct_order from "./pdp_direct_order";
import product_reviews from "./product_reviews";
```

Replace:
```ts
import { wayferProduct } from "./_pdp-wayfer-fixtures";
```
with:
```ts
import { WAYFER_REVIEWS, wayferProduct } from "./_pdp-wayfer-fixtures";
import { IRAQ_TENANT } from "./_pdp-lower-fixtures";
```

Replace:
```ts
  IRAQ_DRAFT_ACCORDION_BASE,
  IRAQ_DRAFT_GALLERY_BASE,
  IRAQ_REDESIGN_ACCORDION_INPUT,
  IRAQ_REDESIGN_GALLERY_INPUT,
  IRAQ_REDESIGN_PDP_PROPS,
```
with:
```ts
  IRAQ_DRAFT_ACCORDION_BASE,
  IRAQ_DRAFT_FAQ_BASE,
  IRAQ_DRAFT_GALLERY_BASE,
  IRAQ_DRAFT_REVIEWS_BASE,
  IRAQ_REDESIGN_ACCORDION_INPUT,
  IRAQ_REDESIGN_FAQ_INPUT,
  IRAQ_REDESIGN_GALLERY_INPUT,
  IRAQ_REDESIGN_PDP_PROPS,
  IRAQ_REDESIGN_REVIEWS_INPUT,
```

Replace:
```ts
  SLICE_1D_PDP_PATCH,
} from "./_pdp-redesign-fixtures";
```
with:
```ts
  SLICE_1D_PDP_PATCH,
  SLICE_1E_FAQ_PATCH,
  SLICE_1E_PDP_PATCH,
  SLICE_1E_REVIEWS_PATCH,
} from "./_pdp-redesign-fixtures";
```

Replace:
```ts
  it("the patched props satisfy the schema unchanged", () => {
```
with:
```ts
  it("slice 1e patches: product_reviews, faq_contact_split, pdp_direct_order", () => {
    const sql1e = migrationSql("scheniders_iraq_pdp_redesign_1e_draft");
    expect(migrationJson(sql1e, "reviews_patch")).toEqual(SLICE_1E_REVIEWS_PATCH);
    expect(migrationJson(sql1e, "faq_patch")).toEqual(SLICE_1E_FAQ_PATCH);
    expect(migrationJson(sql1e, "pdp_patch")).toEqual(SLICE_1E_PDP_PATCH);
  });

  it("the 1e reviews and FAQ parse to exactly what is stored", () => {
    expect(product_reviews.schema.parse(IRAQ_REDESIGN_REVIEWS_INPUT)).toEqual(IRAQ_REDESIGN_REVIEWS_INPUT);
    expect(faq_contact_split.schema.parse(IRAQ_REDESIGN_FAQ_INPUT)).toEqual(IRAQ_REDESIGN_FAQ_INPUT);
  });

  it("every curated key phrase is a verbatim part of its approved review", () => {
    for (const c of SLICE_1E_REVIEWS_PATCH.review_curation) {
      const review = WAYFER_REVIEWS.find((r) => r.id === c.review_id);
      expect(review?.body ?? "").toContain(c.highlight);
    }
    expect(new Set(SLICE_1E_REVIEWS_PATCH.review_curation.map((c) => c.review_id)).size).toBe(WAYFER_REVIEWS.length);
  });

  it("the FAQ patch only retitles the contact: icon, CTA label and number unchanged", () => {
    const { title_i18n: _t, sub_i18n: _s, ...rest } = SLICE_1E_FAQ_PATCH.contact;
    const { title_i18n: _bt, sub_i18n: _bs, ...baseRest } = IRAQ_DRAFT_FAQ_BASE.contact;
    expect(rest).toEqual(baseRest);
  });

  it("the patched props satisfy the schema unchanged", () => {
```

Append to the end of the file:
```tsx

describe("product_reviews + faq_contact_split — redesign draft (slice 1e)", () => {
  function renderReviews(input: unknown, locale: LocaleCode): string {
    return renderToStaticMarkup(
      <StoreBaseProvider base="/s/fixture-store">
        <product_reviews.render
          props={product_reviews.schema.parse(input)}
          ctx={productCtx(wayferProduct, { tenant: IRAQ_REDESIGN_TENANT, runtime: { ...productRuntime, locale } })}
        />
      </StoreBaseProvider>,
    );
  }

  function renderFaq(input: unknown, locale: LocaleCode, product: Product = wayferProduct): string {
    return renderToStaticMarkup(
      <StoreBaseProvider base="/s/fixture-store">
        <faq_contact_split.render
          props={faq_contact_split.schema.parse(input)}
          ctx={productCtx(product, { tenant: IRAQ_TENANT, runtime: { ...productRuntime, locale } })}
        />
      </StoreBaseProvider>,
    );
  }

  it.each(["ar", "en"] as const)("reviews highlights, %s", (locale) => {
    expect(renderReviews(IRAQ_REDESIGN_REVIEWS_INPUT, locale)).toMatchSnapshot();
  });

  it.each(["ar", "en"] as const)("FAQ contact row (Wayfarer today: 0 of 2 answered), %s", (locale) => {
    expect(renderFaq(IRAQ_REDESIGN_FAQ_INPUT, locale)).toMatchSnapshot();
  });

  it("FAQ with both answers (after to-do 2), ar", () => {
    expect(renderFaq(IRAQ_REDESIGN_FAQ_INPUT, "ar", { ...scentProduct, size_ml: 100 })).toMatchSnapshot();
  });

  it("the identity row and the scent card link to the summary card the reviews render", () => {
    const pdp = renderToStaticMarkup(
      <StoreBaseProvider base="/s/fixture-store">
        <pdp_direct_order.render props={IRAQ_REDESIGN_PDP_PROPS} ctx={productCtx(wayferProduct, { tenant: IRAQ_REDESIGN_TENANT })} />
      </StoreBaseProvider>,
    );
    expect(pdp).toContain('data-rating-link="summary"');
    expect(pdp).toContain('data-scent-rating="link"');
    expect(pdp.split('href="#reviews-summary"').length - 1).toBe(2);
    expect(renderReviews(IRAQ_REDESIGN_REVIEWS_INPUT, "ar")).toContain('id="reviews-summary"');
  });

  it("the old «عندك استفسار؟» card is gone; no section adds a dir attribute", () => {
    const dirs = (html: string) => html.split('dir="').length - 1;
    expect(renderFaq(IRAQ_REDESIGN_FAQ_INPUT, "ar")).not.toContain("عندك استفسار؟");
    expect(dirs(renderFaq(IRAQ_DRAFT_FAQ_BASE, "ar"))).toBe(4);
    expect(dirs(renderFaq(IRAQ_REDESIGN_FAQ_INPUT, "ar"))).toBe(0);
    expect(dirs(renderReviews(IRAQ_DRAFT_REVIEWS_BASE, "ar"))).toBe(0);
    expect(dirs(renderReviews(IRAQ_REDESIGN_REVIEWS_INPUT, "ar"))).toBe(0);
  });
});
```

- [ ] **Step 3: Type gate**

Run the sections type gate. Expected: no output.

- [ ] **Step 4: Run it in CI mode to see exactly what changes**

```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-redesign-snapshot.test.tsx
```
Expected: `Snapshots  11 failed`, `Tests  11 failed | 22 passed (33)`. The 11 are the 6 existing pdp_direct_order renders (the identity row now carries the rating link and the scent card's footer rating became a link) and the 5 missing reviews/FAQ renders. The 1e mirror test, the parse test, the key-phrase test, the contact test, the link-pair test, the `dir` test and every 1d test pass.

- [ ] **Step 5: Write the snapshot check (before updating)**

Create `tmp/pdp-1e/snapcheck.mjs`:

```js
// The 1e snapshot update, checked: every render that existed before is
// byte-identical once (a) the identity row's new rating link is taken out
// (with the tag row it opened, on a product with no brand, gender or
// size), and (b) the scent card's footer rating link is turned back into
// the plain <p> it was; each pdp render gained exactly one of each. 1d's
// stack and card renders must be untouched. The only new keys are the
// reviews and FAQ renders. Run from the repo root.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const f = "packages/sections/src/__snapshots__/_pdp-redesign-snapshot.test.tsx.snap";
const parse = (s) =>
  Object.fromEntries([...s.matchAll(/exports\[`([^`]+)`\] = `\n?"([\s\S]*?)"\n?`;/g)].map((m) => [m[1], m[2]]));
const before = parse(execFileSync("git", ["show", `HEAD:${f}`], { encoding: "utf8" }));
const after = parse(readFileSync(f, "utf8"));
const IDENTITY = /<a href="#reviews-summary" data-rating-link="summary"[^>]*>[\s\S]*?<\/a>/g;
const EMPTY_TAG_ROW = /<div class="flex w-full flex-wrap items-center gap-1\.5(?: flex-row-reverse)?"><\/div>/g;
const SCENT = /<a href="#reviews-summary" data-scent-rating="link" (class="[^"]*")>([\s\S]*?)<\/a>/g;
for (const key of Object.keys(before)) {
  const a = after[key] ?? "";
  const ids = (a.match(IDENTITY) ?? []).length;
  const scent = (a.match(SCENT) ?? []).length;
  const back = a.replace(IDENTITY, "").replace(EMPTY_TAG_ROW, "").replace(SCENT, '<p data-scent-rating="text" $1>$2</p>');
  console.log(`${key.split(" > ").slice(1).join(" > ")}: identity link ${ids}, scent link ${scent}, rest identical ${back === before[key]}`);
}
console.log(`new: ${Object.keys(after).filter((k) => !(k in before)).map((k) => k.split(" > ").slice(1).join(" > ")).join(" | ")}`);
```

- [ ] **Step 6: Update this one snapshot file (the only `-u` in the slice)**

```bash
pnpm exec vitest run packages/sections/src/_pdp-redesign-snapshot.test.tsx -u
git diff --stat -- packages/sections/src/__snapshots__
node tmp/pdp-1e/snapcheck.mjs
```
Expected:
- `Snapshots  5 written` and `Tests  33 passed (33)` (vitest 2 counts only the new renders in that line; the 6 rewritten ones show in the diff), then exactly one file, `_pdp-redesign-snapshot.test.tsx.snap | 22 ++++++++++++++++------` (`16 insertions(+), 6 deletions(-)`);
- `snapcheck.mjs` prints:
```
guarantee card, ar 1: identity link 0, scent link 0, rest identical true
guarantee card, en 1: identity link 0, scent link 0, rest identical true
proof stack, ar 1: identity link 0, scent link 0, rest identical true
proof stack, en 1: identity link 0, scent link 0, rest identical true
ar, Wayfarer, live data 1: identity link 1, scent link 1, rest identical true
ar, discounted, multi-image, reviewed 1: identity link 1, scent link 1, rest identical true
ar, scent attributes 1: identity link 1, scent link 1, rest identical true
en, Wayfarer, live data 1: identity link 1, scent link 1, rest identical true
en, discounted, multi-image, reviewed 1: identity link 1, scent link 1, rest identical true
en, scent attributes 1: identity link 1, scent link 1, rest identical true
new: FAQ contact row (Wayfarer today: 0 of 2 answered), ar 1 | FAQ contact row (Wayfarer today: 0 of 2 answered), en 1 | FAQ with both answers (after to-do 2), ar 1 | reviews highlights, ar 1 | reviews highlights, en 1
```
Any `false` means the update changed more than the two links (and the tag row a link opens on a product with no brand/gender/size): stop and fix the code, do not commit the snapshot.

- [ ] **Step 7: Read the snapshot for what 1e meant to change**

```bash
f=packages/sections/src/__snapshots__/_pdp-redesign-snapshot.test.tsx.snap
for k in 'id="reviews-summary"' 'href="#reviews-summary"' 'data-theme-word=' 'data-review-card=' 'data-key-phrase=' 'شوف كل التقييمات (6)' 'See all reviews (6)' 'data-store-reply' 'data-review-entry' 'data-contact-row' 'tel:+9647779703832' 'data-faq-item' 'href="#direct-order" data-faq-order' 'عندك استفسار؟' 'text-bk-chapter'; do printf '%s: ' "$k"; grep -o -- "$k" $f | wc -l | tr -d ' '; done
```
Expected, one count per line in this order: `2 12 8 6 6 1 1 0 0 3 3 2 2 0 7`. That is:
- the summary card once per reviews render; two links to it (identity row + scent footer) in each of the 6 pdp renders;
- 4 word buttons and 3 cards per reviews render, each card with its curated key phrase tinted;
- the plural-correct «شوف كل» in each locale; no reply (none written) and no write-review entry (`hash_only`);
- the contact row in all 3 FAQ renders, each with the `tel:` call button; 2 questions and 2 «اطلبه وجرّبه» jumps only in the "both answers" render; the «عندك استفسار؟» card nowhere;
- `text-bk-chapter`: 2 reviews + 1 FAQ heading, plus 1d's 2 proof-stack and 2 guarantee-card titles.

- [ ] **Step 8: Deterministic in CI mode, and the whole sections suite**

```bash
CI=true pnpm exec vitest run packages/sections/src
```
Expected: `Test Files  135 passed (135)`, `Tests  1493 passed (1493)`.

- [ ] **Step 9: Commit (its own, reviewed snapshot commit)**

```bash
git branch --show-current
git add packages/sections/src/_pdp-redesign-fixtures.ts packages/sections/src/_pdp-redesign-snapshot.test.tsx packages/sections/src/__snapshots__/_pdp-redesign-snapshot.test.tsx.snap
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "test(sections): redesign fixtures mirror the 1e draft migration; rating links reach #reviews-summary; reviews + FAQ renders" -m "Reviewed snapshot update: every 1d render is byte-identical once the identity-row rating link (and the tag row it opens) and the scent footer link are removed. Five renders added (reviews highlights ar/en; FAQ contact row ar/en; FAQ with both answers). All baselines unchanged." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Slice verification gate, PR, merge, deploy

No new code. If a step fails, fix the root cause in the task that owns the file, commit that fix, and re-run this whole task.

- [ ] **Step 1: No baseline changed; the only snapshot changes are the new frozen file and the redesign one**

```bash
git diff --stat origin/main HEAD -- packages/sections/src/__snapshots__
git status --porcelain packages/sections/src/__snapshots__
```
Expected: exactly two files — `_pdp-reviews-faq-baseline-snapshot.test.tsx.snap | 9 +++++++++` (new) and `_pdp-redesign-snapshot.test.tsx.snap | 22 ++++++++++++++++------`; the status prints nothing.

- [ ] **Step 2: Every baseline, unchanged, in CI mode**

```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_pdp-classic-snapshot.test.tsx packages/sections/src/_pdp-lower-baseline-snapshot.test.tsx packages/sections/src/_pdp-scent-baseline-snapshot.test.tsx packages/sections/src/_image-gallery-baseline-snapshot.test.tsx packages/sections/src/_product-reviews-baseline-snapshot.test.tsx packages/sections/src/_product-grid-baseline-snapshot.test.tsx packages/sections/src/_chrome-baseline-snapshot.test.tsx packages/sections/src/_order-confirmation-baseline-snapshot.test.tsx packages/sections/src/_site-footer-baseline-snapshot.test.tsx packages/sections/src/_sticky-cta-baseline-snapshot.test.tsx packages/sections/src/_primitives-baseline-snapshot.test.tsx packages/sections/src/_pdp-proof-guarantee-baseline-snapshot.test.tsx packages/sections/src/_pdp-reviews-faq-baseline-snapshot.test.tsx packages/sections/src/accordion_richtext.test.tsx
```
Expected: `Test Files  15 passed (15)`, `Tests  163 passed (163)`, with no `written`, `updated` or `obsolete` line.

- [ ] **Step 3: The full suites**

```bash
CI=true pnpm exec vitest run packages/sections/src packages/shared/src apps/storefront/lib
```
Expected: `Test Files  205 passed (205)`, `Tests  2478 passed (2478)`: Task 0's 196 / 2370 plus 9 files and 108 tests (baseline 4, reviews props 15, review strings +2, marks 11, theme-words 7, featured-order 8, highlights markup 20, highlights DOM 8, FAQ strings 3, Kurdish coverage +1, product FAQ 18, redesign snapshot +11).

- [ ] **Step 4: Type gates**

Run the sections type gate. Expected: no output. Then:
```bash
pnpm --filter @scheniders/storefront type-check
pnpm --filter @scheniders/platform type-check
```
Expected: both exit 0.

- [ ] **Step 5: Lint (the CI gate)**

```bash
pnpm turbo lint --filter=@scheniders/storefront --filter=@scheniders/platform
```
Expected: `Tasks:    2 successful, 2 total`; both report `0 errors` (warnings are the existing, intentional ones).

- [ ] **Step 6: Hygiene greps on this slice's source files**

```bash
N="packages/sections/src/product_reviews/marks.ts packages/sections/src/product_reviews/theme-words.ts packages/sections/src/product_reviews/featured-order.ts packages/sections/src/product_reviews/highlights-summary.tsx packages/sections/src/product_reviews/highlights-card.tsx packages/sections/src/product_reviews/highlights-view.tsx packages/sections/src/faq_contact_split.product.tsx packages/sections/src/faq_contact_split.strings.ts packages/sections/src/_pdp-redesign-fixtures.ts"
grep -nE ":\s*any\b|<any>|\bas any\b|@ts-ignore|eslint-disable|#[0-9a-fA-F]{3,6}\b|rgba?\(|\sdir=" $N
grep -nE "[A-Za-z_)\]]!\.|[A-Za-z_)\]]!;|[A-Za-z_)\]]!\)" $N packages/sections/src/product_reviews.tsx packages/sections/src/product_reviews.client.tsx packages/sections/src/faq_contact_split.tsx packages/sections/src/faq_contact_split.compact.tsx
git diff origin/main HEAD -- packages/sections/src ':!packages/sections/src/__snapshots__' ':!*.test.ts' ':!*.test.tsx' | grep -E '^\+.*(eslint-disable|ts-ignore|:\s*any\b|<any>|\bas any\b|\sdir=|#[0-9a-fA-F]{6})'
grep -nE "bg-bk-primary\b[^/]" packages/sections/src/product_reviews/*.tsx packages/sections/src/faq_contact_split.product.tsx
```
Expected: all four print nothing (the only yellow is the `/25` and `/40` tints; `faq_contact_split.tsx` and `product_reviews.client.tsx` keep their pre-existing inline `var(--bk-*, #hex)` fallbacks and their pre-existing swallowed network `.catch` (product_reviews.client.tsx:257-259), which is why they are not in the first grep; the third grep proves no new line adds one).

- [ ] **Step 7: Push and open the PR**

```bash
git branch --show-current
git status --porcelain
git log --oneline origin/main..HEAD
git push -u origin feat/pdp-p1e-reviews-faq
```
Expected: the branch is `feat/pdp-p1e-reviews-faq`; only the two untracked storefront notes (and the ignored `tmp/`); 10 commits, from "freeze scheniders-iraq's draft quiet reviews and compact FAQ" to "redesign fixtures mirror the 1e draft migration".

```bash
gh pr create --base main --head feat/pdp-p1e-reviews-faq --title "PDP redesign 1e: reviews highlights (#reviews-summary, word buttons, key phrases) + product FAQ with one contact row, draft migration (not applied)" --body "Slice 1e of docs/superpowers/specs/2026-10-27-pdp-lower-page-redesign-design.md (§1.6, §1.7, §1.2 identity_rating, §1.9).

- product_reviews layout \"highlights\" (opt-in): a light summary card that is the #reviews-summary target («4.7», exact stars, «من 6 تقييمات»); word buttons counted from folded substring matches that highlight whole words and never filter; D10 order (strongest 5★ first, the 3★ forced visible and kept last); a tinted key phrase per card (merchant pick, else a 3–14-word clause); «رد {store}» only when the merchant wrote a reply; «كمّل» only when a body overflows; form_entry hash_only; heading_style.
- faq_contact_split product_faq (opt-in): product questions answered from the product's own data, hidden under min_answered (2); «اطلبه وجرّبه» jumps to the form; contact_style row = «اتصل بينا» + «راسلنا واتساب» (prefilled with the product) replacing the WhatsApp card; heading_style (product + compact views).
- Draft migration for scheniders-iraq (draft only, md5 + rev guarded, idempotent): highlights with 4 topics and 6 key phrases (no reply, no pins), the product FAQ + contact row, identity_rating summary_link. NOT applied: applied after this PR is deployed.
- New frozen baseline for the draft's quiet reviews and compact FAQ (written before any code change); reviewed redesign-snapshot update in its own commit (pdp renders identical except the two rating links).

Tests: sections + shared + storefront lib 205 files / 2478 tests; type-check and lint green.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 8: Merge once CI is green, then wait for production**

```bash
gh pr checks --watch
gh pr merge --merge
```
Merge as gga2000 (Vercel builds only gga2000 commits). Then confirm the production deployment of the merge commit is READY and that the production domain serves it (a Vercel rollback pins production): Vercel MCP `list_deployments` for the storefront project, or the dashboard.

---

### Task 12: Apply the 1e draft migration (after the code is live)

Only after Task 11 Step 8 shows the merge commit live in production. Until then the draft must not carry `layout: "highlights"` / `product_faq`: old code would fall back (the reviews to the historical layout, the FAQ to its compact list) and a builder save on old code could drop the new keys.

- [ ] **Step 1: Re-check the guards and the timestamp order**

```bash
git switch feat/pdp-p1e-reviews-faq && git pull --ff-only origin main
(cd packages && supabase db query --linked "SELECT store_config_rev, md5(store_config_v2_draft::text) AS draft_md5, md5(store_config_v2::text) AS pub_md5 FROM tenants WHERE slug='scheniders-iraq'" -o csv)
ls packages/supabase/migrations | grep -E '^[0-9]{14}_' | sort | tail -2
```
Expected:
- `38,8d0e6032304d56057abfecbb4487b95b,a6f87ba3181b0e94f41ba4a700de257b` (or the values Task 0 pinned);
- the last file listed is `<STAMP>_scheniders_iraq_pdp_redesign_1e_draft.sql`.

If the md5 or rev moved, stop and redo Task 9 Steps 2–6 in a follow-up PR (with Task 10's mirror test still green). If a later-stamped migration reached main first, re-stamp with `git mv` to the current UTC time in a follow-up PR; the mirror test finds the file by suffix.

- [ ] **Step 2: Dry run again**

```bash
(cd packages && supabase db query --linked -f ../tmp/pdp-1e/dryrun-1e.sql -o csv)
```
Expected: `true,true,89b6499d703c80771a38ef7195a5bc78`.

- [ ] **Step 3: Apply**

```bash
F=$(ls packages/supabase/migrations/*_scheniders_iraq_pdp_redesign_1e_draft.sql); echo "$F"
(cd packages && supabase db query --linked -f "../$F")
```
Expected: exit 0, no rows. On `draft md5 is …` or `store_config_rev is …`, nothing was written: go back to Step 1.

- [ ] **Step 4: Record it**

```bash
V=$(basename "$F" | cut -c1-14); echo "$V"
(cd packages && supabase migration repair --status applied "$V")
(cd packages && supabase db query --linked "SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '$V'" -o csv)
```
Expected: one row, `<V>,scheniders_iraq_pdp_redesign_1e_draft`.

- [ ] **Step 5: Re-read and diff against the intended result**

```bash
(cd packages && supabase db query --linked "SELECT store_config_rev, md5(store_config_v2_draft::text) AS draft_md5, md5(store_config_v2::text) AS pub_md5, updated_at > now() - interval '1 hour' AS bumped FROM tenants WHERE slug='scheniders-iraq'" -o csv)
(cd packages && supabase db query --linked "SELECT s.sec->>'type' AS type, s.sec->'base'->>'layout' AS layout, jsonb_array_length(coalesce(s.sec->'base'->'review_curation','[]')) AS curated, s.sec->'base' ? 'product_faq' AS product_faq, s.sec->'base'->>'contact_style' AS contact_style, s.sec->'base'->>'identity_rating' AS identity_rating, md5((s.sec->'base'->'scent_card'->'product_copy')::text) AS copy_md5 FROM tenants t, jsonb_array_elements(t.store_config_v2_draft->'pages') p(page), jsonb_array_elements(p.page->'sections') s(sec) WHERE t.slug='scheniders-iraq' AND p.page->>'page_id'='product' AND s.sec->>'id' IN ('aae22169-cef4-4495-842b-863a7caa71c2','1ab3ee76-902a-42c8-8c26-e6d87b3fd6fc','8354d117-ed8d-4a3e-9bea-8ed6fd8b1023') ORDER BY 1" -o csv)
```
Expected:
- `38,89b6499d703c80771a38ef7195a5bc78,a6f87ba3181b0e94f41ba4a700de257b,true` (the draft equals the dry run's target; published unchanged);
- ```
  type,layout,curated,product_faq,contact_style,identity_rating,copy_md5
  faq_contact_split,NULL,0,true,row,NULL,NULL
  pdp_direct_order,express,0,false,NULL,summary_link,523744df04f3acb3e6983ddb422d3266
  product_reviews,highlights,6,false,NULL,NULL,NULL
  ```
  (1c's `product_copy`, the go-live file's guard, is untouched.)

- [ ] **Step 6: Clean up**

```bash
rm -rf "${TMPDIR:-/tmp}/pdp-1e-pglite"
```
Delete `tmp/pdp-1e/` after Task 13.

---

### Task 13: Draft-view checks at 390px (after Task 12)

- [ ] **Step 1: Open draft view and check the markup**

The storefront dev server runs from this worktree on :3001 (if not: copy `/Users/ali/scheniders-mono/apps/storefront/.env.local` into `apps/storefront/` and `pnpm dev:storefront`; delete the copy afterwards). Draft-view link:
```
http://localhost:3001/api/draft-view?tenant=scheniders-iraq&token=dev-preview-token&to=/s/scheniders-iraq/products/%D9%88%D9%8A%D9%81%D8%B1
```
Create `tmp/pdp-1e/order-check.mjs`:

```js
// Draft-view page order (D1): band → scent card → proof stack → reviews
// summary → guarantee card → FAQ contact row; both rating links point at
// a summary that exists further down. usage: node order-check.mjs <page.html>
import { readFileSync } from "node:fs";
const html = readFileSync(process.argv[2], "utf8");
const markers = [
  "data-promise-band",
  "data-scent-card",
  "data-proof-source",
  'id="reviews-summary"',
  "data-guarantee-card",
  "data-contact-row",
];
const at = markers.map((m) => [m, html.indexOf(m)]);
for (const [m, i] of at) console.log(`${m}: ${i}`);
const body = at.map(([, i]) => i);
console.log(`in order: ${body.every((i, k) => i >= 0 && (k === 0 || i > (body[k - 1] ?? -1)))}`);
console.log(`links before their target: ${html.indexOf('data-rating-link="summary"') < html.indexOf('id="reviews-summary"') && html.indexOf('data-scent-rating="link"') < html.indexOf('id="reviews-summary"')}`);
```
```bash
curl -s -c tmp/pdp-1e/cj -L "http://localhost:3001/api/draft-view?tenant=scheniders-iraq&token=dev-preview-token&to=/s/scheniders-iraq/products/%D9%88%D9%8A%D9%81%D8%B1" -o tmp/pdp-1e/page.html
for k in 'id="reviews-summary"' 'href="#reviews-summary"' 'data-theme-word=' 'data-review-card=' 'data-key-phrase=' 'data-store-reply' 'data-review-entry' 'data-contact-row' 'data-faq-item' 'عندك استفسار؟' 'آراء العملاء'; do printf '%s: ' "$k"; grep -o -- "$k" tmp/pdp-1e/page.html | wc -l | tr -d ' '; done
node tmp/pdp-1e/order-check.mjs tmp/pdp-1e/page.html
```
Expected: counts `1 2 4 3 3 0 0 1 0 0 0`; then six offsets and `in order: true`, `links before their target: true`.

- [ ] **Step 2: Capture at 390×844 and 360×780**

Use the `agent-browser` skill, or the Playwright MCP; if the MCP is wedged, Step 1's curl check is the fallback. Capture and check:
- the identity row: «★★★★☆ 4.7 (6 تقييمات)» with a 70% fifth star; a tap jumps to the summary card (not to a form); same for the scent card's footer «4.7 · 6 تقييمات»;
- the reviews chapter: «شنو گالوا اللي جرّبوه» at 22px right-aligned; the summary card (light, no hairline) with the big «4.7», exact stars, «من 6 تقييمات», five amber bars 5★ 5 / 4★ 0 / 3★ 1 / 2★ 0 / 1★ 0;
- «أكثر شي ذكروه» and four pills «الثبات 3», «التيستر 2», «فخامة 2», «العلبة والتغليف 2» on one or two lines;
- the cards: احمد الشمري featured (big «”», 17px/700, «— احمد الشمري» + 5 stars), then حازم السيد, then Ahmed (3★) — Ahmed last; each with its key phrase tinted pale yellow; «كمّل» only under a body that is cut;
- tap «الثبات»: pressed (espresso), the rest open (6 cards, Ahmed still last), «بثباته», «الثبات», «ثبات», «وثباته» marked in stronger yellow, the page scrolls to the first; tap again: marks gone, list stays open;
- «شوف كل التقييمات (6)» in a fresh load: 6 cards, the first three unmoved, Ahmed last; the button is gone;
- no «اكتب تقييمك» anywhere; then open the same URL with `#reviews`: the form opens and the first star has focus;
- under «كرت الضمان»: no questions (0 of 2 answered today), one tinted row «محتار بالريحة؟ نوصفلك ياها» / «نفس الرقم للاتصال والواتساب» with two equal 52px buttons «اتصل بينا» (`tel:+9647779703832`) and «راسلنا واتساب» (opens WhatsApp with «عندي سؤال عن ويفر انتنس»); no «عندك استفسار؟» card.

Check: no horizontal scroll; every pill, «كمّل», «شوف كل» and both contact buttons are ≥44px tall; `document.querySelectorAll('#reviews [dir], [data-faq-product] [dir], [data-faq-product][dir]').length === 0`.

- [ ] **Step 3: The published page is untouched**

```bash
curl -s "http://localhost:3001/s/scheniders-iraq/products/%D9%88%D9%8A%D9%81%D8%B1" | grep -c "reviews-summary\|data-contact-row\|data-theme-word"
```
Expected: `0`.

- [ ] **Step 4: Hand-offs**

- Ali (gate to-do 1): write the public reply to Ahmed's 3★ review. It goes into `review_curation` as `{ review_id: "cd25b071-10d9-4de5-a324-ea6a0793559b", reply_i18n: { ar: "…" } }` (one follow-up draft migration, same guards) and renders as «رد شنايدر» under his card; Phase 2 moves it to `reply_body`.
- Ali (to-do 14, early part): confirm or change the six key phrases; later the pins and tags (a «طلبوا مرة ثانية» topic is ready to switch on: add `{ key: "reorder", label_i18n: { ar: "طلبوا مرة ثانية" } }` to `theme_words` and `tags: ["reorder"]` to حازم and ياسين's curation entries).
- Ali (gate to-do 2): enter Wayfarer's `longevity_note` and `size_ml`; the FAQ then appears by itself (2 of 2 answered), no deploy needed.
- Ali (to-do 6): the gift question waits for his answer; it is one more `product_faq.items` entry of kind `text`.
- Ali (to-dos 8 and 10): ku for the new chrome; the drafted en.
- 1f plan author: the copy lint (F12) reads `_pdp-redesign-fixtures.ts`, which now carries 1e's Arabic (heading, topics, key phrases quoted verbatim from customers — the key phrases are customer words and must be exempt from the hamza / «،» rules, like the review bodies); the sticky bar's WhatsApp prefill should reuse the FAQ row's «عندي سؤال عن {product}» wording only if Ali wants the two to match (spec §1.8 has its own «هلا، أريد أطلب {product}»).

---

## Self-review

**1. Spec coverage**

| Spec item | Task |
|---|---|
| §1.6 item 1 chapter heading «شنو گالوا اللي جرّبوه», right-aligned | Tasks 6 (`headingEl`), 9 (draft) |
| §1.6 item 2 summary card `id="reviews-summary"`, light `bg-bk-surface-alt`, no hairline, big «4.7», `Stars precision="exact"` at `displayRating`, «من 6 تقييمات» via plural forms, 5 bars in amber, bars only with a known distribution | Task 6 (`highlights-summary.tsx`; bars also need ≥2 reviews, spec missing-data row) |
| §1.6 item 3 word buttons: counts at render by `findTermHits` substring (+ tags), `aria-pressed`, `<mark data-term>`, expand if a hit is hidden, scroll to the first hit, second tap clears, tag-only marks the card edge, never filtered/reordered, 0-hit themes hidden | Tasks 5, 6 (whole-word marks: scope decision 6; ≥2 topics and ≥2 reviews: scope decision 7) |
| §1.6 item 4 featured card (oversized «”» `text-bk-ink/15`, 17px/700, 5-line clamp + «كمّل», «— {name}» `<bdi>` + stars) | Task 6 (`highlights-card.tsx`; «كمّل» only on real overflow: scope decision 9) |
| §1.6 item 5 compact cards (36px monogram, name `<bdi>`, stars, 15px ink, 3-line clamp + «كمّل», no dates, no verified badge) | Task 6 |
| §1.6 item 6 key-phrase tint `bg-bk-primary/25`, Phase 2 `highlight_quote` replaces it, no match → no mark | Tasks 4, 6, 9 (merchant pick via `review_curation.highlight` now: scope decisions 2, 5) |
| §1.6 item 7 «رد {store}» bubble with `storeDisplayName`, indented, `bg-bk-surface`, logo + 13px | Task 6 (renders only with merchant text: scope decision 3; logo = `branding.logo_url`, else a storefront icon) |
| §1.6 item 8 «شوف كل التقييمات (6)», D10 insertion before the forced low card | Tasks 5, 6 |
| §1.6 item 9 `form_entry: "hash_only"` (entry + form only on `#reviews`, today's auto-open + focus) | Task 6 (scope decision 10) |
| §1.6 schema (`layout` + "highlights", `theme_words`, `visible_count`, `form_entry`, `heading_style`) | Task 2 (+ `review_curation`: scope decision 2) |
| §1.6 `featured-order.ts`: `pinned_rank` asc then D10; visible set / expand point per D10 | Task 5 (`rank` in curation stands in for `pinned_rank`; N = 1: scope decision 4) |
| §1.6 strings (`ofReviews`, `showAll`, `readMoreInline`, `storeReply`, count forms) | Task 3 (count forms reused from the identity row: scope decision 8; + `themesLabel`, `emptyHighlights`) |
| §1.6 plural note: quiet/historical keep «{count} تقييم» | Tasks 1, 6 (baselines unchanged) |
| §1.6 missing data (0 reviews → empty line, no summary/buttons; 1 review → no bars/buttons/«شوف كل»; SSR list absent → today's client fetch) | Task 6 tests (the fetch path is today's `useEffect`, untouched) |
| §1.6 draft content (layout, heading, form_entry, visible_count 3, chapter, the 4 themes [ثبات] [تيستر] [فخم] [تغليف, علبه]; counts 3/2/2/2) | Tasks 5 (counts on the live bodies), 9, 10 |
| §1.7 layout 1–4 (chapter heading «أسئلة قبل لا تطلب», first question open, answers end with «اطلبه وجرّبه» → form, one tinted contact row with two equal 52px buttons, `tel:` the call number, WhatsApp `?text=` «عندي سؤال عن {product}», FAQ hidden under `min_answered`, row whenever a channel exists) | Task 8 (scope decisions 12, 13, 14) |
| §1.7 schema (`product_faq` with text / attribute / size_ml answers, `contact_style`, `heading_style`); attribute = text/enum value; size default «القنينة {value} مل»; `items` not rendered but kept | Task 8 |
| §1.7 strings in `faq_contact_split.strings.ts` (`call`, `whatsapp`, `askAbout`, `orderAndTry`, `sizeAnswer`) on `STRING_TABLE_FILES` | Task 7 |
| §1.7 draft content (`شكد يثبت؟` → `longevity_note`, `شكد حجم القنينة؟` → `size_ml`, no gift question yet, contact title/sub, `contact_style: "row"`, chapter) | Tasks 9, 10 (scope decision 15: `contact` restated whole) |
| §1.2 + deferred by 1b/1c: `identity_rating: "summary_link"` in the draft; the scent card footer becomes the link | Tasks 9, 10 (pair test: both links ↔ `id="reviews-summary"`) |
| §1.1 `heading_style` for product_reviews and faq_contact_split | Tasks 2, 6, 8 (scope decision 11) |
| D1 page order; D4 (no yellow fill; tints only; amber stars/bars; green WhatsApp glyph); D5 Latin digits; D10; D14 (contact row is the one contact moment under the FAQ); D15 «رد شنايدر» | Tasks 6, 8, 11 (hygiene grep), 13 |
| §1.9 guards a–d, idempotent, rollback header, apply after deploy, re-read after apply | Tasks 9, 12 |
| §1.10 `theme-words` 3/2/2/2 and tag-only hidden; `featured-order` (D10, forced low, expansion before it, `visible_count` 1/3/6, pins first); `product_faq` `min_answered` gating; Kurdish coverage; no hardcoded colour (`_no-hardcoded-white` scans every new file); baselines unchanged; opted-in renders in ar and en; no new `dir`; 390px checks incl. a pressed word button and `#reviews` arrival; published page unchanged | Tasks 1–10, 11, 13 |

**2. Placeholder scan.** `STAMP` (Task 9 Step 1) and `V` (Task 12 Step 4) are produced at run time, as in 1b–1d. Every code step has complete code, pre-run in a throwaway copy of `origin/main` at `7da169c5` (1d merged) with live read-only data of 2026-10-30: every expected output above is from that run (the PGlite replay and the dry run against the live post-1d row), except the PR/merge/apply/browser steps, which touch shared state, and the per-step "fails before" lines of Tasks 3–8, which follow from the missing module or key.

**3. Type consistency.**
- `TextRange`, `widenToWords`, `mergeRanges`, `keyPhraseRange`, `markSegments` (Task 4) are what `theme-words.ts` (Task 5) and `highlights-card.tsx` / `highlights-view.tsx` (Task 6) import.
- `ThemeWord`, `reviewThemes`, `themeCounts`, `themeWordRanges` (Task 5) take `label_i18n: I18nString`, which the zod `theme_words` items (Task 2) satisfy; `featuredOrder<T extends OrderableReview>` takes `ReviewSummaryItem` (its `body` is optional, so `OrderableReview.body` is `?: string | null`).
- `HighlightsView` reads `Pick<Props, "theme_words" | "visible_count" | "review_curation">` from `product_reviews.tsx`; `StoreReply` is defined in `highlights-card.tsx` and built in the view.
- `ProductFaqConfig = NonNullable<Props["product_faq"]>` comes from the now-exported `Props` of `faq_contact_split.tsx` (a type-only import, so the section ↔ view import cycle is erased at runtime); `ContactRowData` is built in the section and drawn by `ContactRow`.
- `FaqContactCompact`'s new optional `chapterLocale` is what the compact branch passes.
- Fixtures: `IRAQ_DRAFT_REVIEWS_BASE: ReviewsProps`, `IRAQ_DRAFT_FAQ_BASE: FaqProps` (Task 1) feed `jsonbMerge` (1d's helper) with `SLICE_1E_REVIEWS_PATCH` / `SLICE_1E_FAQ_PATCH` (Task 10); `SLICE_1E_FAQ_PATCH.contact` spreads `IRAQ_DRAFT_FAQ_BASE.contact`.
