# PDP Lower-Page Redesign — Slice 1f (Smart Sticky Bar + Arabic Copy Term Sheet) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Phase 1 of the express PDP redesign: turn scheniders-iraq's sticky bar into Ali's smart bar (one soft yellow «اطلب الآن» that follows the express form — the first empty field, then «كمّل طلبك / باقي {field}», then the form's own «ثبّت طلبي», which scrolls the receipt into view and focuses the submit and NEVER submits — the price on the bar, and a 52px WhatsApp square that opens the chat with «هلا، أريد أطلب ويفر انتنس»), write the F12 Arabic copy term sheet as data plus a lint test over every chrome string table and over the Arabic the redesign writes, fix the promise band's stray full stop («التوصيل مجاني.» → «التوصيل مجاني»), and write scheniders-iraq's 1f draft config (guarded, applied only after the code is live). Every other tenant's markup stays byte-identical.

**Architecture:** The express form and the sticky bar are separate sections, wired only through 1a's `useExpressOrderStore`. The form registers while mounted and reports, after every render, a pure `formProgressReport()` (missing required fields, the first one's DOM id and visible label, the submit's id and label); the store drops a report that changes nothing. A form-aware bar *watches* the product (`watchForm`), and only while watched does `CheckoutRow` give the receipt `data-receipt` and the submit `id="direct-order-submit"` — effects never run on the server, so no baseline moves. The bar's state machine (`sticky_cta_bar.form-aware.ts`: `stickyPrimary`, `handOffToForm`, `stickyWhatsappHref`) is pure and unit-tested; the soft look lives in `sticky_cta_bar.soft.tsx`; chunky renders exactly as today. The term sheet (`_copy-terms.ts`) is data with a reason per rule; `_arabic-copy-lint.test.ts` runs it over `STRING_TABLE_FILES` + `CONTACT_LINE_STRINGS` (frozen allowlist, may only shrink) and over `_pdp-redesign-fixtures.ts` (customers' verbatim words exempt). The draft write is one guarded SQL migration (one `||` patch on `d874d9d6`), replayed on PGlite against a read-only copy of the live row, dry-run live with a SELECT, mirrored by the redesign fixtures, and applied only after merge + deploy.

**Tech Stack:** Next.js 16 / React 19 sections package (`@scheniders/sections`), zustand, zod v4, Tailwind v3 (storefront) / v4 (platform), vitest 2 (node + jsdom, @testing-library/react), Supabase CLI 2.98 (`db query --linked`, `migration repair`), PGlite 0.2.17 (local replay only, outside the repo), pnpm 10.

**Spec:** `docs/superpowers/specs/2026-10-27-pdp-lower-page-redesign-design.md` §1.8, §1.2 (the F12 part), §1.3 (row 2's title), §1.9, §1.10; decisions D4, D5, D6 (confirmed by Ali 2026-10-29, to-do 13), D14; hard constraints. Concept: `/Users/ali/scheniders-mono/.superpowers/brainstorm/concepts-pdp-2026-10-26/c-whole-page-a.html` (sticky states, lines 305–326 and 631–662) + `c-whole-page-a.notes.md` (annotations 11, 21–24, 26). Built on slices 1a (#224: `useExpressOrderStore`, `expressFormStage`, `EXPRESS_REQUIRED_FIELDS`, `STRING_TABLE_FILES`, `_sticky-cta-baseline-snapshot`), 1b (#225: the promise band, `freeDeliveryTitle`), 1c (#226), 1d (#227, merged as `7da169c5`) and **1e (reviews highlights + product FAQ / contact row, branch `feat/pdp-p1e-reviews-faq`, plan `docs/superpowers/plans/2026-10-30-pdp-p1e-reviews-faq.md`), which must be merged AND its draft migration applied before this plan starts.** From 1e this plan uses: `faq_contact_split.strings.ts` (`FAQ_STRINGS.call` «اتصل بينا», `FAQ_STRINGS.whatsapp` «راسلنا واتساب», `fs()`), the `_string-tables.ts` list ending in `"faq_contact_split.strings.ts"`, the 1e blocks of `_pdp-redesign-fixtures.ts` (`SLICE_1E_*`, the file ending in `IRAQ_REDESIGN_PDP_PROPS` with `...SLICE_1E_PDP_PATCH`), the 1e redesign-snapshot keys, and the post-1e draft md5. **Task 0 re-reads every one of these and the live guard values; the plan pins whatever they are then.**

---

## Scope decisions (read before starting)

1. **Ali's binding 1f decisions.** One big yellow «اطلب الآن» + a small WhatsApp icon prefilled with the product name; form-aware states via `useExpressOrderStore`: empty → focus the first empty field; partial → «كمّل طلبك · باقي …» naming the first missing field; complete → «ثبّت طلبي», scroll the receipt into view and focus the submit, **never submit** (D6); hidden while the form is on screen (`hide_while: "form"` stays); the price shows in every state; it must not clash with the soft express buttons (I14: today's bar is thick-outlined with a hard shadow).
2. **The partial and complete labels are two lines, as concept A draws them** (c-whole-page-a.html:644, :653): a big line and a 12px line under it. Partial = «كمّل طلبك» over «باقي {field}» — the spec's «كمّل طلبك · باقي {field}» split at its «·», same words, so «باقي المنطقة والشارع» never squeezes the big line at 390px. Complete = ✓ «ثبّت طلبي» over «معلوماتك جاهزة» with a 2px espresso ring (concept `.bar.ready`). Untouched has no small line: the concept's «توصيل مجاني · الدفع عند الاستلام» is a merchant claim, and chrome never states one.
3. **`{field}` is the field's visible label** (spec §1.8: `phoneLabel`, `nameLabel`, `governorateLabel`, `addressLabel`): «باقي رقم الموبايل», «باقي اسمك», «باقي المحافظة», «باقي المنطقة والشارع». The concept's «باقي العنوان» is not a label on the page.
4. **"Missing" uses the express phone check too.** Spec: a required key is missing when empty or when `fieldError(k)` is not null. The shared `fieldError("phone")` accepts numbers the express submit refuses (express-view.tsx:129 checks the operator ranges), so the phone also counts as missing until `phoneComplete` (11 digits, known operator — the same value that opens the name stage). Otherwise the bar could say «ثبّت طلبي» for a number the submit sends back.
5. **The receipt and submit marks exist only while a form-aware bar watches.** Spec §1.8 says the submit gets `id="direct-order-submit"` and the receipt `data-receipt`; spec §1.0 says every baseline (including `_pdp-express-snapshot`, which renders the express checkout row) stays byte-identical. Unconditional attributes would break the second. So the bar calls `watchForm(productId)` on mount, and `CheckoutRow` renders both marks only while `useFormWatched(productId)` is true. Server markup never carries them (effects do not run there), so every store without a form-aware bar is untouched, in SSR and in the browser.
6. **A tap the page cannot honour falls back to today's scroll.** A field inside a collapsed (inert) stage, a missing id, or a complete state whose marks are not on the page yet → `scrollToForm()` (today's `scroll_to_form`: the form's top, first input focused). Focus is taken with `preventScroll` after a `scrollIntoView({ block: "center" })`; `prefers-reduced-motion` gets `behavior: "auto"`, as today.
7. **Soft style = the express submit's own look.** Primary: `min-h-[54px] rounded-bk-input bg-bk-primary text-bk-on-primary shadow-bk-button` with the same hover/active tokens as checkout-row.tsx:196-200 — no ink border, no `--bk-border-thickness`, no `shadow-[…rgba…]`. Bar: `bg-bk-surface border-t border-bk-divider` (the chunky bar's inline `color-mix`/ink border/hard shadow stay for chunky). Price: struck price 12px with `decoration-bk-danger` (D4), price 17px/900 ink (today's chunky strike is `text-[11px]`, below the 12px floor; chunky is not touched). Rows flip with `flex-row-reverse` from `readsRtl(locale)`: in Arabic the primary sits at the right, the price beside it, the icon at the left (concept order). Yellow fills only the primary (D4); the icon is a green glyph on `bg-bk-surface` (D4: green = WhatsApp).
8. **The icon reuses the FAQ row's names** (one name per action, F12): `aria-label` = `FAQ_STRINGS.whatsapp` «راسلنا واتساب» (call: `FAQ_STRINGS.call` «اتصل بينا»), not a second sticky string. Its `href` is `wa.me/<digits>?text=` + `whatsapp_prefill_i18n` (else `STICKY_STRINGS.waPrefill` «هلا، أريد أطلب {product}») with `{product}` = `displayNameOf(product)`; off a product page, or with the labelled button, the bare link stays (sticky_cta_bar.client.tsx:126). The draft sets no `whatsapp_prefill_i18n` (spec §1.8 draft = three keys), so the chrome default speaks.
9. **New sticky strings go in `sticky_cta_bar.strings.ts`** (`STICKY_STRINGS`, `ss()`), added to `STRING_TABLE_FILES` in the same commit: `continueOrder`, `stillMissing`, `ready`, `waPrefill`, and `region` — today's inline landmark name (sticky_cta_bar.client.tsx:177, «إجراءات سريعة» / "Quick actions" / «کردارە خێراکان») moved verbatim so both styles read one table; the chunky render stays byte-identical. The other inline chunky strings (`${itemCount} عنصر`, the «اتصال»/«واتساب» fallbacks, sticky_cta_bar.client.tsx:183, 213-217) are left: they are other tenants' cart bar and outside the table list.
10. **The term sheet is data** (`_copy-terms.ts`): nine rules, each with the approved word, a reason, its scopes ("chrome", "tenant") and one bad/good example, plus `COPY_ACTIONS` (one name per action). `lintArabicCopy(text, scope)` returns the rules a text breaks. The Arabic letter class includes the Persian letters Iraqi copy uses (گ چ پ) and the harakat, so «لگيت» or «ثبّت» is one word. «عميل/عملاء» is tenant-scope only (spec: other tenants' chrome may say عملاء).
11. **Chrome lint = frozen allowlist, may only shrink.** The test compares the exact set of hits to `CHROME_ALLOWLIST` (each entry's reason: "changing it alters other tenants' markup"), so a new violation fails AND a fixed one fails until its entry is deleted. Pre-run on main + 1e's tables: exactly six — `orderUnconfirmed` and `sendOnWhatsapp` («بالواتساب», pdp_direct_order.client.tsx), `addressPlaceholder` («١٤», pdp_express/strings.ts:54), `reviews` («{count} تقييم», pdp_express/strings.ts:103), `countMany` and `starRow` (product_reviews/strings.ts:10-14, 26-30). A `formatCount` forms set (`<base>One/Two/Few/Many` in one table, e.g. `EXPRESS_STRINGS.reviewCount*`, 1b scope decision 10) is not a violation: its Many form is right for 11+.
12. **Tenant lint = what Phase 1 writes, minus customers' words.** It walks every export of `_pdp-redesign-fixtures.ts` except the "before" copies (`IRAQ_DRAFT_*`) and the merged inputs (`IRAQ_REDESIGN_*`, which include them): 85 Arabic strings on main + 1e. Exempt by path, with a test that each exempt path still exists: 1c's `quote_picks[].text`, 1d's TikTok `alt_i18n.ar` / `quote_i18n.ar` / `author`, 1e's `review_curation[].highlight`. One hit is left and allowlisted for Ali: 1e's contact sub «نفس الرقم للاتصال والواتساب» (spec §1.7's wording) breaks spec §1.2's «واتساب without ال» rule. Rewriting it is Ali's call (to-do 10; proposal «نفس الرقم للاتصال وواتساب») and would mean a second section in 1f's migration, which the spec's slice table does not give 1f.
13. **The full stop is a code fix with its own reviewed snapshot commit.** `EXPRESS_STRINGS.freeDeliveryTitle` (pdp_express/strings.ts:121) drops the stop in ar/en/ku (a row title, like rows 1 and 3). It renders only in band mode (scheniders-iraq's draft), so no baseline moves; the six pdp renders of `_pdp-redesign-snapshot` change by exactly that character, checked by `snapcheck-stop.mjs`.
14. **Guards, stamp, apply** follow 1b–1e exactly: `STAMP=$(date -u +%Y%m%d%H%M%S)` sorting after 1e's stamp and after the live history's last version (the remote already holds `20261030072247_after_sale_link_rpl_2926_3496`, which is not in main's folder); guards = whole-draft md5 + `store_config_rev` + already-applied no-op; apply with `supabase db query --linked -f`, record with `supabase migration repair --status applied`; never `db push`; nothing applied before the code PR is merged and production serves it.
15. **Frozen first, as always.** The sticky bar's baseline (`_sticky-cta-baseline-snapshot`, 1a) already freezes today's draft bar; every 1a–1e baseline stays byte-identical. The only snapshot that changes is the opted-in redesign snapshot, in two reviewed commits (Task 1: the full stop; Task 13: two new sticky renders), each checked by a snapcheck script.

## Conventions for every task

- Work in the worktree `/Users/ali/scheniders-mono-pdp`. **Do not switch its branch while reviewers or a dev server use it**: Task 0 Step 1 checks that first.
- Every shell starts with:
  ```bash
  export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"
  cd /Users/ali/scheniders-mono-pdp
  ```
- pnpm only. Never npm/yarn.
- Tests: `CI=true pnpm exec vitest run <path>` from the repo root. `CI=true` never writes a snapshot. Only **Task 1 Step 6** and **Task 13 Step 6** (`-u`, one file each) run vitest without `CI=true`.
- vitest prints coloured output; the expected lines below are the plain text (`Tests  4 passed (4)`).
- Sections type gate (expected **no output**):
  ```bash
  (cd packages/sections && ./node_modules/.bin/tsc --noEmit --incremental false -p tsconfig.json --rootDir .. 2>&1 | grep "error TS" | grep -v TS6059 | grep -v -E "^src/(RenderSection\.sticky|_chrome-baseline-snapshot|_chrome|_delivery-promise|_pdp-classic-snapshot|image-gallery-order|product_attributes|helpers/whatsapp|pdp_express/checkout-row\.receipt)\.test\.tsx?\(")
  ```
- Before every commit: `git branch --show-current` → `feat/pdp-p1f-sticky-copy`.
- Commit with explicit paths only, as gga2000, with the trailer (lint-staged runs `eslint --fix` on staged files):
  ```bash
  git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```
- Banned in new code: `any`, `@ts-ignore`, `eslint-disable`, a non-null `!` that silences the compiler, swallowed catches, hex/rgb colour literals in source, and any `dir` attribute. Solid yellow (`bg-bk-primary`) only on the sticky primary (D4: the two order actions); green (`bk-success`) only on the WhatsApp glyph/tile; red (`bk-danger`) only on the struck price.
- **Never run `vitest -u`** except Task 1 Step 6 and Task 13 Step 6. If a baseline fails, the code changed a default render: fix the code.
- All live database access before Task 15 is **read-only** (`SELECT`, or a `DO` block replayed on PGlite only).
- On a busy machine the full suites can take many minutes and occasionally a worker times out resolving a module (seen on `html_embed.test.tsx`: `Timeout calling "resolveId"`, 0 tests, unrelated). Re-run that one file; it must pass on its own.
- Expected counts below were pre-run on `origin/main` `1eb08615` (1a–1d merged, plus #223) with 1e's planned `faq_contact_split.strings.ts`, `_string-tables.ts` entry and fixture blocks copied in from 1e's plan, and with live read-only data of 2026-10-30. Where 1e's real code is needed (the redesign snapshot's 1e keys, the post-1e suites), the numbers are 1e's planned ones plus 1f's measured delta, and say so.

## File structure

| File | Status | Responsibility |
|---|---|---|
| `packages/sections/src/pdp_express/strings.ts` | modify | `freeDeliveryTitle` without the full stop |
| `packages/sections/src/pdp_express/promise-band.tsx` | modify | header comment quotes the title |
| `packages/sections/src/pdp_express/promise-band.test.tsx` | modify | asserts the title without the stop |
| `packages/sections/src/_copy-terms.ts` (+ `_copy-terms.test.ts`) | create | the F12 term sheet as data, `lintArabicCopy`, `COPY_ACTIONS` |
| `packages/sections/src/_string-tables.ts` | modify | `stringsBlock` / `stringTableEntries` parser; lists `sticky_cta_bar.strings.ts` |
| `packages/sections/src/_kurdish-coverage.test.ts` | modify | reads the tables through the shared parser |
| `packages/sections/src/helpers/express-order-store.ts` (+ test) | modify | `EXPRESS_SUBMIT_ID`, `submitLabel`, quiet reports, `watchForm` / `useFormWatched` |
| `packages/sections/src/pdp_express/form-progress.ts` (+ test) | create | `formProgressReport()` — what the form tells the bar |
| `packages/sections/src/pdp_express/express-form.tsx` | modify | registers and reports while mounted |
| `packages/sections/src/pdp_express/checkout-row.tsx` | modify | `data-receipt` + submit id while watched |
| `packages/sections/src/_pdp-express-progress.test.tsx` | create | jsdom: the real form reports; marks only while watched |
| `packages/sections/src/sticky_cta_bar.strings.ts` (+ test) | create | `STICKY_STRINGS`, `ss()` |
| `packages/sections/src/sticky_cta_bar.tsx` | modify | `form_aware`, `style`, `secondary_display`, `whatsapp_prefill_i18n` |
| `packages/sections/src/_sticky-cta-props.test.ts` | create | the props parse and fail safe |
| `packages/sections/src/sticky_cta_bar.form-aware.ts` (+ test) | create | `stickyPrimary`, `handOffToForm`, `stickyWhatsappHref` |
| `packages/sections/src/sticky_cta_bar.soft.tsx` | create | `SoftPrimary`, `SoftPrice`, `IconSecondary`, `SoftSecondary` |
| `packages/sections/src/sticky_cta_bar.client.tsx` | modify | watches, picks the state, renders soft / icon / chunky |
| `packages/sections/src/_sticky-cta-soft.test.tsx` | create | server markup of the opted-in bar |
| `packages/sections/src/_sticky-cta-form-aware-dom.test.tsx` | create | jsdom: bar beside a real form, four states, no submit |
| `packages/sections/src/_arabic-copy-lint.test.ts` | create | the lint over chrome tables, tenant copy, action names |
| `packages/supabase/migrations/<STAMP>_scheniders_iraq_pdp_redesign_1f_draft.sql` | create | the guarded draft write |
| `packages/sections/src/_pdp-redesign-fixtures.ts` | modify | `SLICE_1F_STICKY_PATCH`, `IRAQ_REDESIGN_STICKY_INPUT` |
| `packages/sections/src/_pdp-redesign-snapshot.test.tsx` (+ `.snap`) | modify | 1f mirror + parse; sticky renders; two reviewed snapshot updates |
| `tmp/pdp-1f/` (`snapcheck-stop.mjs`, `snapcheck.mjs`, `dryrun-1f.sql`, `sticky-base.json`, `page.html`) | scratch (gitignored) | read-only checks |
| `${TMPDIR:-/tmp}/pdp-1f-pglite/` | scratch (outside the repo) | PGlite replay harness |

---

### Task 0: Branch, baseline, live guard values, and 1e as it landed

- [ ] **Step 1: Branch off main (1e merged and applied)**

```bash
git branch --show-current
git status --porcelain
git fetch origin
git log --oneline -3 origin/main
git switch -c feat/pdp-p1f-sticky-copy origin/main
git branch --show-current
```
Expected:
- before switching: the 1e branch (or main) and only the untracked `apps/storefront/AGENTS.md` / `apps/storefront/CLAUDE.md` (not ours; never stage them). If reviewers or a dev server still use the worktree, stop and ask for a free worktree (`git worktree add ../scheniders-mono-pdp-1f origin/main`) instead of switching this one;
- the log shows the merge of `feat/pdp-p1e-reviews-faq` (or a later commit);
- the branch is `feat/pdp-p1f-sticky-copy`.

- [ ] **Step 2: Baseline counts on the untouched branch**

```bash
CI=true pnpm exec vitest run packages/sections/src packages/shared/src apps/storefront/lib
CI=true pnpm exec vitest run packages/sections/src
CI=true pnpm exec vitest run packages/sections/src/_pdp-redesign-snapshot.test.tsx packages/sections/src/_kurdish-coverage.test.ts
```
Expected, if 1e landed as its plan says: `Test Files  205 passed (205)`, `Tests  2478 passed (2478)`; sections alone `Test Files  135 passed (135)`, `Tests  1493 passed (1493)`; the last run `Tests  45 passed (45)` (redesign snapshot 33 + Kurdish coverage 12). (On `1eb08615` without 1e: 196 / 2370, sections 126 / 1385, redesign 22 + Kurdish 11.) **Write down whatever prints**; Task 14 adds 1f's delta (+9 files, +69 tests) to it.

- [ ] **Step 3: Read 1e's code as it landed**

```bash
grep -n '"faq_contact_split.strings.ts"\|"image_gallery.strings.ts"' packages/sections/src/_string-tables.ts
grep -n "^  call:\|^  whatsapp:\|^export function fs" packages/sections/src/faq_contact_split.strings.ts
grep -n "^import\|^export const SLICE_1E\|^export const WAYFER_REVIEW_IDS\|^export const IRAQ_REDESIGN_PDP_PROPS\|^function jsonbMerge" packages/sections/src/_pdp-redesign-fixtures.ts
grep -c "highlight:" packages/sections/src/_pdp-redesign-fixtures.ts
grep -n "sub_i18n: { ar: \"نفس الرقم" packages/sections/src/_pdp-redesign-fixtures.ts
tail -9 packages/sections/src/_pdp-redesign-fixtures.ts
ls packages/supabase/migrations | grep -E '^[0-9]{14}_' | sort | tail -3
```
Expected (1e's plan, Tasks 1, 7, 10):
- `_string-tables.ts` lists `"image_gallery.strings.ts",` then `"faq_contact_split.strings.ts",` as its last two entries;
- six `highlight:` lines (one per curated review);
- `faq_contact_split.strings.ts` has `call: { en: "Call us", ar: "اتصل بينا", …}`, `whatsapp: { en: "WhatsApp us", ar: "راسلنا واتساب", …}` and `export function fs(`;
- the fixture imports include `import type { Props as ReviewsProps } from "./product_reviews";`, `import type { Tenant } from "./types";`, `import { EXPRESS_IRAQ_DRAFT_PDP_PROPS, fixtureTenant } from "./_pdp-fixtures";` and `import type { FaqProps } from "./_pdp-lower-fixtures";`; exports `SLICE_1E_PDP_PATCH`, `WAYFER_REVIEW_IDS`, `SLICE_1E_REVIEWS_PATCH` (with `review_curation` entries carrying `highlight`), `SLICE_1E_FAQ_PATCH` (with `contact.sub_i18n.ar` «نفس الرقم للاتصال والواتساب»); the file ends with `IRAQ_REDESIGN_PDP_PROPS` spreading `...SLICE_1E_PDP_PATCH,` then `};`;
- the last migration file is `<1e stamp>_scheniders_iraq_pdp_redesign_1e_draft.sql`.

**Where 1e landed differently, adapt these places and nothing else:** a different FAQ string key or wording → Task 10's `fs("call")` / `fs("whatsapp")` and Task 11's action test; a different import block → Task 13 Step 1's anchor (add the two 1f imports beside whatever is there); a different contact sub → Task 11's `TENANT_ALLOWLIST` (delete the entry if 1e already says «واتساب» without ال; the test then expects no tenant hit); a renamed curation key → Task 11's `VERBATIM` path for 1e.

- [ ] **Step 4: The CLI link, the guard values, and 1e applied**

```bash
cat packages/supabase/.temp/project-ref; echo
cd packages
supabase db query --linked "SELECT store_config_rev, md5(store_config_v2_draft::text) AS draft_md5, md5(store_config_v2::text) AS pub_md5 FROM tenants WHERE slug='scheniders-iraq'" -o csv
supabase db query --linked "SELECT s.sec->>'type' AS type, s.sec->>'enabled' AS enabled, md5((s.sec->'base')::text) AS base_md5 FROM tenants t, jsonb_array_elements(t.store_config_v2_draft->'pages') p(page), jsonb_array_elements(p.page->'sections') s(sec) WHERE t.slug='scheniders-iraq' AND p.page->>'page_id'='product' AND s.sec->>'id'='d874d9d6-dede-40e5-bcf8-aceb51d11036'" -o csv
supabase db query --linked "SELECT version, name FROM supabase_migrations.schema_migrations WHERE version >= '20261029' ORDER BY 1" -o csv
supabase db query --linked "SELECT contact_phone, store_config->'contact'->>'whatsapp_number' AS wa, store_config_v2_draft->'commerce'->>'whatsapp_number' AS draft_wa FROM tenants WHERE slug='scheniders-iraq'" -o csv
supabase db query --linked "SELECT display_name FROM products WHERE id='5e847790-11a5-439f-bace-c315e0ff1ae8'" -o csv
cd ..
```
Expected:
- `sduvpgqwhxragxtxztur` (never the OLD `ibfdugifekivquwprqjc`; if `.temp` is missing, `cp /Users/ali/scheniders-mono/packages/supabase/.temp/* packages/supabase/.temp/`);
- `38,89b6499d703c80771a38ef7195a5bc78,a6f87ba3181b0e94f41ba4a700de257b` — 1e's planned post-apply values (pre-run: the 1e migration replayed on PGlite over the live post-1d row gives exactly `89b6499d…`; the live row read 2026-10-30 was `38,8d0e6032304d56057abfecbb4487b95b,a6f87ba3…`, i.e. before 1e);
- `sticky_cta_bar,true,08921c992d5563e08afa97c093735301` (the base 1a froze as `IRAQ_DRAFT_STICKY_PROPS`; 1b–1e never touched it);
- the history lists `…1b_draft`, `…1c_draft`, `…1d_draft`, `20261030072247,after_sale_link_rpl_2926_3496`, and `<1e stamp>,scheniders_iraq_pdp_redesign_1e_draft`;
- `+9647779703832,07779703832,NULL` (the bar's WhatsApp number resolves to `07779703832`) and `ويفر انتنس`.

**If the draft md5 or the rev differs, the migration pins the values read now:** use them in Task 12 Step 2 (`c_expected_draft_md5`, `c_expected_rev`, the header's guard c. and Rollback lines) and in Task 12 Step 6's dry-run literals; Task 12 Step 5 then prints new `before`/`after` md5s — record those and use them in Tasks 12 and 15 instead of the ones below. **If the sticky base md5 differs,** the merchant edited the bar: re-read it (`SELECT s.sec->'base' …`), update `IRAQ_DRAFT_STICKY_PROPS` in `_pdp-fixtures.ts` only if the 1a baseline still passes with it (it pins today's bar), else stop and ask, and update the Rollback header. **If 1e is not recorded,** stop: 1e's Task 12 has not run.

---

### Task 1: The promise band's row-2 title loses its stray full stop

**Files:**
- Modify: `packages/sections/src/pdp_express/strings.ts:121`
- Modify: `packages/sections/src/pdp_express/promise-band.tsx:10`
- Modify: `packages/sections/src/pdp_express/promise-band.test.tsx:66,130,180`
- Modify (written by vitest): `packages/sections/src/__snapshots__/_pdp-redesign-snapshot.test.tsx.snap`
- Scratch: `tmp/pdp-1f/snapcheck-stop.mjs`

Row 2's title is a label like rows 1 and 3, which carry no full stop; «التوصيل مجاني.» is the one that did (spec §1.3 quoted it with the stop). It renders only in `promise_layout: "band"`, which only scheniders-iraq's draft sets, so no baseline moves.

- [ ] **Step 1: Make the band tests expect the title without the stop**

In `packages/sections/src/pdp_express/promise-band.test.tsx`, replace:
```ts
    expect(html).toContain("التوصيل مجاني.");
```
with:
```ts
    expect(html).toContain(">التوصيل مجاني<");
    expect(html).not.toContain("التوصيل مجاني.");
```
Replace:
```ts
    expect(html).toContain("Delivery is free.");
```
with:
```ts
    expect(html).toContain(">Delivery is free<");
```
Replace:
```ts
      title: "التوصيل مجاني.",
```
with:
```ts
      title: "التوصيل مجاني",
```

- [ ] **Step 2: Run them to verify they fail**

```bash
CI=true pnpm exec vitest run packages/sections/src/pdp_express/promise-band.test.tsx
```
Expected: `Tests  3 failed | 18 passed (21)` — "all three rows…", "english" and "free delivery without an SLA…".

- [ ] **Step 3: Drop the stop**

In `packages/sections/src/pdp_express/strings.ts`, replace:
```ts
  freeDeliveryTitle: { en: "Delivery is free.", ar: "التوصيل مجاني.", ku: "گەیاندن بەخۆڕاییە." },
```
with:
```ts
  // A row title, like row 1's and row 3's: no full stop.
  freeDeliveryTitle: { en: "Delivery is free", ar: "التوصيل مجاني", ku: "گەیاندن بەخۆڕاییە" },
```
In `packages/sections/src/pdp_express/promise-band.tsx`, replace:
```ts
//   2. «التوصيل مجاني.» when every governorate is free (else «التوصيل»),
```
with:
```ts
//   2. «التوصيل مجاني» when every governorate is free (else «التوصيل»),
```

- [ ] **Step 4: Run the band tests and the redesign snapshot in CI mode**

```bash
CI=true pnpm exec vitest run packages/sections/src/pdp_express/promise-band.test.tsx
CI=true pnpm exec vitest run packages/sections/src/_pdp-redesign-snapshot.test.tsx
```
Expected: `Tests  21 passed (21)`; then `Snapshots  6 failed`, `Tests  6 failed | 27 passed (33)` — the six pdp_direct_order renders (ar and en × three products), each showing only `-…مجاني.<` / `+…مجاني<` (or `free.` / `free`). (Pre-run without 1e: `6 failed | 16 passed (22)`.)

- [ ] **Step 5: Write the snapshot check (before updating)**

```bash
mkdir -p tmp/pdp-1f
```
Create `tmp/pdp-1f/snapcheck-stop.mjs`:

```js
// The full-stop snapshot update, checked: every render is byte-identical to
// the committed one once the promise band's row-2 title gets its old full
// stop back, and each changed render lost exactly one. Run from the repo root.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const f = "packages/sections/src/__snapshots__/_pdp-redesign-snapshot.test.tsx.snap";
const parse = (s) =>
  Object.fromEntries([...s.matchAll(/exports\[`([^`]+)`\] = `\n?"([\s\S]*?)"\n?`;/g)].map((m) => [m[1], m[2]]));
const before = parse(execFileSync("git", ["show", `HEAD:${f}`], { encoding: "utf8" }));
const after = parse(readFileSync(f, "utf8"));
const TITLES = [">التوصيل مجاني<", ">Delivery is free<"];
for (const key of Object.keys(before)) {
  const a = after[key] ?? "";
  const n = TITLES.reduce((sum, t) => sum + a.split(t).length - 1, 0);
  const back = TITLES.reduce((s, t) => s.split(t).join(t.replace("<", ".<")), a);
  console.log(`${key.split(" > ").slice(1).join(" > ")}: titles ${n}, rest identical ${back === before[key]}`);
}
console.log(`new: ${Object.keys(after).filter((k) => !(k in before)).length}, gone: ${Object.keys(before).filter((k) => !(k in after)).length}`);
```

- [ ] **Step 6: Update this one snapshot file**

```bash
pnpm exec vitest run packages/sections/src/_pdp-redesign-snapshot.test.tsx -u
git diff --stat -- packages/sections/src/__snapshots__
node tmp/pdp-1f/snapcheck-stop.mjs
```
Expected:
- `Snapshots  6 updated`, `Tests  33 passed (33)`; exactly one file, `_pdp-redesign-snapshot.test.tsx.snap | 12 ++++++------` (`6 insertions(+), 6 deletions(-)`);
- `snapcheck-stop.mjs` prints `titles 1, rest identical true` for the six `ar, …` / `en, …` pdp renders, `titles 0, rest identical true` for every other key (1d's proof stack and guarantee card, 1e's reviews and FAQ renders), and `new: 0, gone: 0`.
Any `false` means more than the title changed: stop and fix the code, do not commit the snapshot.

- [ ] **Step 7: Commit (its own, reviewed snapshot commit)**

```bash
git branch --show-current
git add packages/sections/src/pdp_express/strings.ts packages/sections/src/pdp_express/promise-band.tsx packages/sections/src/pdp_express/promise-band.test.tsx packages/sections/src/__snapshots__/_pdp-redesign-snapshot.test.tsx.snap
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "fix(sections): promise band row-2 title without a stray full stop («التوصيل مجاني»)" -m "Band mode only (scheniders-iraq draft). Reviewed snapshot update: the six pdp renders differ by that one character; every baseline unchanged." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The Arabic copy term sheet (F12), as data

**Files:**
- Create: `packages/sections/src/_copy-terms.ts`
- Test: `packages/sections/src/_copy-terms.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/_copy-terms.test.ts`:

```ts
// The term sheet's own rules: each catches its bad example, passes its
// approved rewrite, and leaves the words it must not touch alone.

import { describe, expect, it } from "vitest";
import { COPY_TERMS, lintArabicCopy } from "./_copy-terms";

describe("COPY_TERMS", () => {
  it.each(COPY_TERMS.map((r) => [r.id, r] as const))("%s: catches its example, passes the rewrite", (_id, rule) => {
    expect(rule.pattern.test(rule.example.bad)).toBe(true);
    expect(rule.pattern.test(rule.example.good)).toBe(false);
    expect(rule.reason.length).toBeGreaterThan(20);
  });

  it("ids are unique", () => {
    expect(new Set(COPY_TERMS.map((r) => r.id)).size).toBe(COPY_TERMS.length);
  });
});

describe("lintArabicCopy", () => {
  const ids = (text: string, scope: "chrome" | "tenant" = "tenant") =>
    lintArabicCopy(text, scope).map((h) => h.rule);

  it("عملاء is a tenant rule only", () => {
    expect(ids("آراء العملاء", "tenant")).toEqual(["customer-word"]);
    expect(ids("آراء العملاء", "chrome")).toEqual([]);
    expect(ids("زبائن شنايدر")).toEqual([]);
    expect(ids("شغل وعمل")).toEqual([]);
  });

  it("hamza: the bare spellings, with or without a clitic, and never inside another word", () => {
    expect(ids("الأسئلة الاكثر شيوعا")).toEqual(["hamza"]);
    expect(ids("اذا ما عجبك")).toEqual(["hamza"]);
    expect(ids("إدا مازلت تريد")).toEqual(["hamza"]);
    expect(ids("عطور اصلية")).toEqual(["hamza"]);
    expect(ids("خلال اسبوع")).toEqual(["hamza"]);
    expect(ids("للاسبوع الجاي")).toEqual(["hamza"]);
    expect(ids("أكثر عطر، أصلية، إذا، أسبوع")).toEqual([]);
    expect(ids("الاسبوعية")).toEqual([]);
  });

  it("واتساب without ال", () => {
    expect(ids("نفس الرقم للاتصال والواتساب")).toEqual(["whatsapp-without-al"]);
    expect(ids("ابعث نفس الطلب بالواتساب")).toEqual(["whatsapp-without-al"]);
    expect(ids("راسلنا واتساب")).toEqual([]);
  });

  it("the Arabic comma, only between Arabic words", () => {
    expect(ids("المصادر العالمية, ومن")).toEqual(["arabic-comma"]);
    expect(ids("075, 077")).toEqual([]);
  });

  it("counts: a {count} slot before a singular is chrome-only; 3–10 before a singular anywhere", () => {
    expect(ids("{count} تقييم", "chrome")).toEqual(["count-slot-singular"]);
    expect(ids("{count} تقييم", "tenant")).toEqual([]);
    expect(ids("6 تقييم")).toEqual(["count-3-10-plural"]);
    expect(ids("خلال 24 ساعة")).toEqual([]);
    expect(ids("10 دقايق")).toEqual([]);
    expect(ids("الرقم ناقص: {count} من 11 رقم", "chrome")).toEqual([]);
  });

  it("Latin digits and the guarantee's one name", () => {
    expect(ids("شارع ١٤ رمضان")).toEqual(["latin-digits"]);
    expect(ids("بطاقة الضمان")).toEqual(["guarantee-name"]);
    expect(ids("كرت الضمان")).toEqual([]);
    expect(ids("اتصل بنا")).toEqual(["call-us"]);
    expect(ids("اتصل بينا")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/_copy-terms.test.ts
```
Expected: `Error: Failed to load url ./_copy-terms`, `Tests  no tests`.

- [ ] **Step 3: Write the term sheet**

Create `packages/sections/src/_copy-terms.ts`:

```ts
// =====================================================================
// The Arabic copy term sheet (F12) — one voice, written as data
// =====================================================================
// Every rule names the approved word, what it replaces, and why. The
// rules run over two kinds of text (`_arabic-copy-lint.test.ts`):
//   - "chrome": the `ar` value of every table in STRING_TABLE_FILES and the
//     shared contact-line sentences — code-owned text every tenant sees;
//   - "tenant": the Arabic the PDP redesign writes into scheniders-iraq's
//     draft (`_pdp-redesign-fixtures.ts`, mirrored from the migrations).
// A rule with scope "tenant" never runs over chrome: other tenants' chrome
// may legitimately say what this store's voice does not (عملاء).
//
// The approved action names are data too (COPY_ACTIONS): one name per
// action, everywhere the page offers it.
//
// The Arabic "letter" class includes the Persian letters Iraqi copy uses
// (گ چ پ ڤ) and the harakat, so «ثبّت» or «لگيت» is one word.
// =====================================================================

const AR = "\\u0621-\\u0652\\u0670-\\u06D3";
/** Not preceded by an Arabic letter: the start of a word. */
const START = `(?<![${AR}])`;
/** Not followed by an Arabic letter: the end of a word. */
const END = `(?![${AR}])`;
/** Clitics that may sit in front of a word: و ف ب ل ك, then ال or ل. */
const CLITICS = "(?:[وفبلك])?(?:ال|ل)?";

/** Nouns that follow a number. 3–10 take the plural; a `{count}` slot
 *  cannot know its number, so it needs a `formatCount` forms set. */
const COUNTED_SINGULARS = [
  "تقييم",
  "صورة",
  "قطعة",
  "منتج",
  "عنصر",
  "طلب",
  "نقطة",
  "يوم",
  "ساعة",
  "دقيقة",
  "مرة",
  "زبون",
  "عطر",
  "رقم",
  "أسبوع",
  "شهر",
].join("|");

export type CopyScope = "chrome" | "tenant";

export type CopyRuleId =
  | "customer-word"
  | "guarantee-name"
  | "whatsapp-without-al"
  | "call-us"
  | "hamza"
  | "arabic-comma"
  | "count-slot-singular"
  | "count-3-10-plural"
  | "latin-digits";

export interface CopyRule {
  id: CopyRuleId;
  /** The approved form. */
  use: string;
  /** Why the store writes it this way. */
  reason: string;
  scopes: readonly CopyScope[];
  pattern: RegExp;
  /** One text the rule must catch and its approved rewrite. */
  example: { bad: string; good: string };
}

export const COPY_TERMS: readonly CopyRule[] = [
  {
    id: "customer-word",
    use: "زبون / زبائن",
    reason: "The store's own voice says زبون; عميل/عملاء reads as a bank. Other tenants' chrome may say عملاء, so this runs over the tenant copy only.",
    scopes: ["tenant"],
    pattern: new RegExp(`${START}${CLITICS}(?:عميل|عملاء|عملائ)`, "u"),
    example: { bad: "آراء العملاء", good: "شنو گالوا اللي جرّبوه" },
  },
  {
    id: "guarantee-name",
    use: "كرت الضمان",
    reason: "One name for the guarantee, the one the card's heading and the band's «الشروط» link lead to.",
    scopes: ["chrome", "tenant"],
    pattern: new RegExp(`${START}(?:بطاقة|كارت|كارد) ال?ضمان`, "u"),
    example: { bad: "بطاقة الضمان", good: "كرت الضمان" },
  },
  {
    id: "whatsapp-without-al",
    use: "واتساب",
    reason: "The app's name, written the same way everywhere: «راسلنا واتساب», never «الواتساب».",
    scopes: ["chrome", "tenant"],
    pattern: new RegExp(`${START}[وفبك]?(?:ال|لل)(?:واتساب|واتس)${END}`, "u"),
    example: { bad: "راسلنا على الواتساب", good: "راسلنا واتساب" },
  },
  {
    id: "call-us",
    use: "اتصل بينا",
    reason: "The store's dialect for the call action, the same words as the contact row's button.",
    scopes: ["chrome", "tenant"],
    pattern: new RegExp(`${START}اتصل بنا${END}`, "u"),
    example: { bad: "اتصل بنا", good: "اتصل بينا" },
  },
  {
    id: "hamza",
    use: "أكثر، أصلي/أصلية، إذا، أسبوع",
    reason: "These four are spelled with their hamza in every line the store writes.",
    scopes: ["chrome", "tenant"],
    pattern: new RegExp(`${START}${CLITICS}(?:اكثر|اصلي|اصلية|اصليه|اذا|ادا|إدا|اسبوع|اسبوعين)${END}`, "u"),
    example: { bad: "الاكثر شيوعا", good: "الأكثر شيوعا" },
  },
  {
    id: "arabic-comma",
    use: "،",
    reason: "Between Arabic words the comma is the Arabic «،», never the Latin «,».",
    scopes: ["chrome", "tenant"],
    pattern: new RegExp(`[${AR}]\\s*,\\s*[${AR}]`, "u"),
    example: { bad: "المصادر العالمية, ومن", good: "المصادر العالمية، ومن" },
  },
  {
    id: "count-slot-singular",
    use: "a formatCount forms set (one / two / few / many)",
    reason: "«{count} تقييم» is right only for 11 and up; a slot that can hold 3–10 needs the forms set.",
    scopes: ["chrome"],
    pattern: new RegExp(`\\{count\\}\\s+(?:${COUNTED_SINGULARS})${END}`, "u"),
    example: { bad: "{count} تقييم", good: "{count} تقييمات" },
  },
  {
    id: "count-3-10-plural",
    use: "the plural after 3–10",
    reason: "Counts 3 to 10 take the plural noun («6 تقييمات», «3 أيام»); 11 and up take the singular.",
    scopes: ["chrome", "tenant"],
    pattern: new RegExp(`(?<![0-9])(?:[3-9]|10)\\s+(?:${COUNTED_SINGULARS})${END}`, "u"),
    example: { bad: "6 تقييم", good: "6 تقييمات" },
  },
  {
    id: "latin-digits",
    use: "0–9",
    reason: "Latin digits in every shopper-facing number (D5): prices, counts, hours, sizes.",
    scopes: ["chrome", "tenant"],
    pattern: /[٠-٩۰-۹]/u,
    example: { bad: "خلال ٢٤ ساعة", good: "خلال 24 ساعة" },
  },
];

export interface CopyHit {
  rule: CopyRuleId;
  match: string;
}

/** The term-sheet rules `text` breaks, for text of the given scope. */
export function lintArabicCopy(text: string, scope: CopyScope): CopyHit[] {
  const hits: CopyHit[] = [];
  for (const rule of COPY_TERMS) {
    if (!rule.scopes.includes(scope)) continue;
    const m = rule.pattern.exec(text);
    if (m) hits.push({ rule: rule.id, match: m[0] });
  }
  return hits;
}

/** One name per action: the words the page uses for each thing a shopper
 *  can do, wherever it is offered. */
export const COPY_ACTIONS = {
  /** The sticky bar before the form is complete. */
  startOrder: "اطلب الآن",
  /** The form's submit, and the sticky bar once the form is complete. */
  placeOrder: "ثبّت طلبي",
  /** Finishing a half-filled form, from the sticky bar. */
  continueOrder: "كمّل طلبك",
  /** Every WhatsApp contact button: the FAQ row and the sticky icon. */
  whatsapp: "راسلنا واتساب",
  /** Every call button. */
  call: "اتصل بينا",
  /** The promise band's vCard pill. */
  saveNumber: "احفظ رقمنا",
  /** The guarantee terms, by name. */
  guarantee: "كرت الضمان",
} as const;
```

The rules are spec §1.2's eight (زبون not عميل; «كرت الضمان»; «واتساب» without ال; «اتصل بينا»; hamza on أكثر / أصلي/أصلية / إذا / أسبوع; «،» between Arabic words; counts 3–10 take the plural; Latin digits), with the count rule split in two: a `{count}` slot before a singular (chrome only — tenant text has real numbers) and a literal 3–10 before a singular (both scopes). `COPY_ACTIONS` records the one name per action (spec §1.2 "one name per action"; Task 11 tests it).

- [ ] **Step 4: Run it to verify it passes**

```bash
CI=true pnpm exec vitest run packages/sections/src/_copy-terms.test.ts
```
Expected: `Tests  16 passed (16)`.

- [ ] **Step 5: Type gate, then commit**

Run the sections type gate. Expected: no output.
```bash
git branch --show-current
git add packages/sections/src/_copy-terms.ts packages/sections/src/_copy-terms.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): the Arabic copy term sheet (F12) as data, with lintArabicCopy" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: One parser for the chrome tables

**Files:**
- Modify: `packages/sections/src/_string-tables.ts` (append the parser)
- Modify: `packages/sections/src/_kurdish-coverage.test.ts` (use it)

`_kurdish-coverage.test.ts` holds the only reader of the tables today; the copy lint (Task 11) needs the same reading plus each entry's `ar`. Moving the reader beside `STRING_TABLE_FILES` keeps one parser for every copy guard. No behaviour change: the coverage test keeps its 12 cases (13 after Task 7).

- [ ] **Step 1: Append the parser to `_string-tables.ts`**

Append to the end of `packages/sections/src/_string-tables.ts`:
```ts

/** One entry of a chrome table, read from its source: the key, the entry's
 *  source text, and its `ar` value (null when it has none). */
export interface StringTableEntry {
  key: string;
  source: string;
  ar: string | null;
}

/** The `{ … }` body of the file's `STRINGS` / `<PREFIX>_STRINGS` table, or
 *  "" when the file has none. */
export function stringsBlock(src: string): string {
  const m = /const (?:[A-Z]+_)?STRINGS\s*(?::[^=]*)?=\s*\{/.exec(src);
  if (!m) return "";
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  while (depth && i < src.length) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") depth--;
    i++;
  }
  return src.slice(start, i);
}

/** Every `key: { … }` entry of the file's table. Quoted strings are atoms,
 *  so a `{points}` placeholder cannot end an entry early. */
export function stringTableEntries(src: string): StringTableEntry[] {
  const block = stringsBlock(src);
  return [...block.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*\{(?:[^{}"]|"(?:[^"\\]|\\.)*")*\}/gm)].map(
    (e) => {
      const ar = /\bar:\s*"((?:[^"\\]|\\.)*)"/.exec(e[0]);
      return {
        key: e[1] ?? "",
        source: e[0],
        ar: ar ? String(JSON.parse(`"${ar[1] ?? ""}"`)) : null,
      };
    },
  );
}
```

- [ ] **Step 2: The coverage test reads through it**

Replace the whole of `packages/sections/src/_kurdish-coverage.test.ts` with:
```ts
// W6.8 — every UI string a shopper can meet on the flagship's conversion
// path carries a Kurdish line. Merchant copy (default props) is translated
// in the builder; this guards the code-owned chrome only.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STRING_TABLE_FILES, stringTableEntries } from "./_string-tables";

describe("Kurdish coverage of UI strings", () => {
  it("covers today's eight tables plus the vCard table", () => {
    expect(STRING_TABLE_FILES).toEqual(
      expect.arrayContaining([
        "cart_line_items.client.tsx",
        "checkout_form.client.tsx",
        "order_confirmation_call_card.client.tsx",
        "order_tracker.client.tsx",
        "pdp_direct_order.client.tsx",
        "pdp_express/strings.ts",
        "product_reviews/strings.ts",
        "search_results_grid.client.tsx",
        "helpers/vcard.ts",
      ]),
    );
  });

  for (const f of STRING_TABLE_FILES) {
    it(`${f}: every entry has ku`, () => {
      const entries = stringTableEntries(readFileSync(new URL(`./${f}`, import.meta.url), "utf8"));
      expect(entries.length).toBeGreaterThan(0);
      const missing = entries.filter((e) => !/\bku:\s*"/.test(e.source)).map((e) => e.key);
      expect(missing).toEqual([]);
    });
  }
});
```

- [ ] **Step 3: Run it**

```bash
CI=true pnpm exec vitest run packages/sections/src/_kurdish-coverage.test.ts
```
Expected: `Tests  12 passed (12)` (the same twelve as Task 0: one list check + eleven tables).

- [ ] **Step 4: Type gate, then commit**

Run the sections type gate. Expected: no output.
```bash
git branch --show-current
git add packages/sections/src/_string-tables.ts packages/sections/src/_kurdish-coverage.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "refactor(sections): one chrome-table parser beside STRING_TABLE_FILES" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The order store carries the submit label, drops no-op reports, and counts watching bars

**Files:**
- Modify: `packages/sections/src/helpers/express-order-store.ts`
- Test: `packages/sections/src/helpers/express-order-store.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/sections/src/helpers/express-order-store.test.ts`, replace:
```ts
import {
  EXPRESS_REQUIRED_FIELDS,
  UNREGISTERED,
```
with:
```ts
import {
  EXPRESS_REQUIRED_FIELDS,
  EXPRESS_SUBMIT_ID,
  UNREGISTERED,
```
Replace:
```ts
  useExpressOrderStore,
} from "./express-order-store";
```
with:
```ts
  useExpressOrderStore,
  type ExpressFormReport,
} from "./express-order-store";
```
Replace:
```ts
beforeEach(() => useExpressOrderStore.setState({ forms: {} }));
```
with:
```ts
beforeEach(() => useExpressOrderStore.setState({ forms: {}, watchers: {} }));
```
The three existing `reportForm` calls gain the new field. Replace:
```ts
      firstMissingLabel: "المحافظة",
      submitId: "direct-order-submit",
    });
```
with:
```ts
      firstMissingLabel: "المحافظة",
      submitId: "direct-order-submit",
      submitLabel: "ثبّت طلبي",
    });
```
Replace:
```ts
      firstMissingLabel: null,
      submitId: "direct-order-submit",
    });
```
with:
```ts
      firstMissingLabel: null,
      submitId: "direct-order-submit",
      submitLabel: "ثبّت طلبي",
    });
```
Replace:
```ts
      firstMissingLabel: null,
      submitId: "x",
    });
```
with:
```ts
      firstMissingLabel: null,
      submitId: "x",
      submitLabel: null,
    });
```
Append to the end of the file:
```ts

describe("slice 1f: the submit label, quiet reports, and watching bars", () => {
  const report: ExpressFormReport = {
    missing: ["address_details"],
    firstMissingId: "f-address_details",
    firstMissingLabel: "المنطقة والشارع",
    submitId: EXPRESS_SUBMIT_ID,
    submitLabel: "ثبّت طلبي",
  };

  it("the submit id is the express form's id plus -submit", () => {
    expect(EXPRESS_SUBMIT_ID).toBe("direct-order-submit");
    expect(UNREGISTERED.submitLabel).toBeNull();
  });

  it("carries the submit label", () => {
    store().registerForm(P1, "direct-order");
    store().reportForm(P1, report);
    expect(expressFormOf(store(), P1).submitLabel).toBe("ثبّت طلبي");
  });

  it("an unchanged report does not notify readers", () => {
    store().registerForm(P1, "direct-order");
    store().reportForm(P1, report);
    let calls = 0;
    const unsubscribe = useExpressOrderStore.subscribe(() => {
      calls += 1;
    });
    store().reportForm(P1, report);
    expect(calls).toBe(0);
    store().reportForm(P1, { ...report, missing: [], firstMissingId: null, firstMissingLabel: null });
    expect(calls).toBe(1);
    unsubscribe();
  });

  it("counts watching bars; only the last cleanup unwatches", () => {
    const watched = () => (store().watchers[P1] ?? 0) > 0;
    expect(watched()).toBe(false);
    const a = store().watchForm(P1);
    const b = store().watchForm(P1);
    a();
    expect(watched()).toBe(true);
    b();
    expect(watched()).toBe(false);
    expect(store().watchers).toEqual({});
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
CI=true pnpm exec vitest run packages/sections/src/helpers/express-order-store.test.ts
```
Expected: `Tests  3 failed | 8 passed (11)` — `EXPRESS_SUBMIT_ID` is undefined, a repeat report notifies, `watchForm` is not a function ("carries the submit label" already passes: 1a's `reportForm` spreads whatever it gets; it pins the field from here on).

- [ ] **Step 3: Implement**

Replace the whole of `packages/sections/src/helpers/express-order-store.ts` with:
```ts
// =====================================================================
// express-order-store — how far the shopper is through the express form
// =====================================================================
// The express form (inside pdp_direct_order) and the smart sticky bar are
// separate sections; neither can pass props to the other. This store is
// the wire, like `variant-store`: the form writes its progress while it is
// mounted, the bar reads it to pick its label and its tap target. Keyed by
// product id, not persisted — progress belongs to this page view.
//
// Phase 1 carries only `form`; Phase 4a adds `addons` beside it. It is read
// only by sections that opted in (`primary_kind: "form_aware"`, slice 1f).
// With nothing registered every reader sees `UNREGISTERED` and keeps
// today's behaviour.
//
// The wire runs both ways for one thing: a form-aware bar WATCHES the
// product (`watchForm`), and only while it is watched does the form mark
// its receipt (`data-receipt`) and give its submit the id the bar focuses
// (`EXPRESS_SUBMIT_ID`). Server markup never carries either (effects do not
// run there), so every store without a form-aware bar renders as before.
// =====================================================================

import { create } from "zustand";
import type { FieldKey } from "../pdp_direct_order.client";
import { EXPRESS_FIELD_ORDER } from "../pdp_express/model";

/** The id the express submit carries while a form-aware bar watches. */
export const EXPRESS_SUBMIT_ID = "direct-order-submit";

/** The fields a shopper must fill before the order can go: the express
 *  field order without the optional backup number. */
export const EXPRESS_REQUIRED_FIELDS: readonly FieldKey[] = EXPRESS_FIELD_ORDER.filter(
  (k) => k !== "alt_phone",
);

export interface ExpressFormProgress {
  /** True while an express form for this product is mounted. */
  registered: boolean;
  /** Required fields that are empty or invalid, in express field order. */
  missing: readonly FieldKey[];
  /** DOM id of the first missing field, or null when none is missing. */
  firstMissingId: string | null;
  /** That field's label in the current locale, or null. */
  firstMissingLabel: string | null;
  /** DOM id of the form's submit button, once it has one. */
  submitId: string | null;
  /** The submit's label in the current locale («ثبّت طلبي»), or null. */
  submitLabel: string | null;
  /** DOM id of the form element ("" when nothing is registered). */
  formId: string;
}

/** What the form reports on every change. */
export type ExpressFormReport = Pick<
  ExpressFormProgress,
  "missing" | "firstMissingId" | "firstMissingLabel" | "submitId" | "submitLabel"
>;

/** The one value readers see for a product with no mounted form. A single
 *  frozen object, so a selector returning it never re-renders a reader. */
export const UNREGISTERED: ExpressFormProgress = Object.freeze({
  registered: false,
  missing: EXPRESS_REQUIRED_FIELDS,
  firstMissingId: null,
  firstMissingLabel: null,
  submitId: null,
  submitLabel: null,
  formId: "",
});

/** True when `report` would change nothing in `current`. */
function sameReport(current: ExpressFormProgress, report: ExpressFormReport): boolean {
  return (
    current.missing.join(" ") === report.missing.join(" ") &&
    current.firstMissingId === report.firstMissingId &&
    current.firstMissingLabel === report.firstMissingLabel &&
    current.submitId === report.submitId &&
    current.submitLabel === report.submitLabel
  );
}

interface ExpressOrderState {
  forms: Record<string, ExpressFormProgress>;
  /** How many form-aware bars watch each product's form. */
  watchers: Record<string, number>;
  /** Called by the form on mount; returns the unmount cleanup. */
  registerForm: (productId: string, formId: string) => () => void;
  /** Called by the form after every render. Ignored while not registered,
   *  and a no-op (readers are not notified) when nothing changed. */
  reportForm: (productId: string, report: ExpressFormReport) => void;
  /** Called by a form-aware bar on mount; returns the unmount cleanup. */
  watchForm: (productId: string) => () => void;
}

export const useExpressOrderStore = create<ExpressOrderState>()((set) => ({
  forms: {},
  watchers: {},
  registerForm: (productId, formId) => {
    set((s) => ({
      forms: {
        ...s.forms,
        [productId]: { ...UNREGISTERED, registered: true, formId },
      },
    }));
    return () =>
      set((s) => {
        // A newer form for the same product may have registered since;
        // only this form's own entry is removed.
        if (s.forms[productId]?.formId !== formId) return s;
        return {
          forms: Object.fromEntries(
            Object.entries(s.forms).filter(([id]) => id !== productId),
          ),
        };
      });
  },
  reportForm: (productId, report) =>
    set((s) => {
      const current = s.forms[productId];
      if (!current || sameReport(current, report)) return s;
      return { forms: { ...s.forms, [productId]: { ...current, ...report } } };
    }),
  watchForm: (productId) => {
    set((s) => ({ watchers: { ...s.watchers, [productId]: (s.watchers[productId] ?? 0) + 1 } }));
    return () =>
      set((s) => {
        const left = (s.watchers[productId] ?? 0) - 1;
        if (left > 0) return { watchers: { ...s.watchers, [productId]: left } };
        return {
          watchers: Object.fromEntries(Object.entries(s.watchers).filter(([id]) => id !== productId)),
        };
      });
  },
}));

/** The progress for `productId`, or `UNREGISTERED`. */
export function expressFormOf(
  state: Pick<ExpressOrderState, "forms">,
  productId: string,
): ExpressFormProgress {
  return state.forms[productId] ?? UNREGISTERED;
}

/** Hook form of `expressFormOf`, for the sections that read it. */
export function useExpressFormProgress(productId: string): ExpressFormProgress {
  return useExpressOrderStore((s) => expressFormOf(s, productId));
}

/** True while at least one form-aware bar watches `productId`'s form. */
export function useFormWatched(productId: string): boolean {
  return useExpressOrderStore((s) => (s.watchers[productId] ?? 0) > 0);
}

export type ExpressFormStage = "none" | "untouched" | "partial" | "complete";

/**
 * The four states the smart sticky bar renders (spec §1.8):
 *   none      — no express form is mounted for the product;
 *   untouched — every required field is still missing;
 *   partial   — some, not all, are missing;
 *   complete  — nothing required is missing.
 */
export function expressFormStage(progress: ExpressFormProgress): ExpressFormStage {
  if (!progress.registered) return "none";
  if (progress.missing.length === 0) return "complete";
  const allMissing = EXPRESS_REQUIRED_FIELDS.every((k) => progress.missing.includes(k));
  return allMissing ? "untouched" : "partial";
}
```
What changed against 1a's file: the header's last paragraph (the watch), `EXPRESS_SUBMIT_ID`, `submitLabel` on the progress, the report and `UNREGISTERED`, `sameReport` + the no-op in `reportForm`, `watchers` + `watchForm`, and `useFormWatched`. `expressFormStage` and the registration are untouched.

- [ ] **Step 4: Run them to verify they pass**

```bash
CI=true pnpm exec vitest run packages/sections/src/helpers/express-order-store.test.ts
```
Expected: `Tests  11 passed (11)`.

- [ ] **Step 5: Type gate, then commit**

Run the sections type gate. Expected: no output.
```bash
git branch --show-current
git add packages/sections/src/helpers/express-order-store.ts packages/sections/src/helpers/express-order-store.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): order store carries the submit label, drops no-op reports, counts watching bars" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: What the express form tells the bar

**Files:**
- Create: `packages/sections/src/pdp_express/form-progress.ts`
- Test: `packages/sections/src/pdp_express/form-progress.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/pdp_express/form-progress.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { FieldKey, FormState } from "../pdp_direct_order.client";
import { EXPRESS_SUBMIT_ID, expressFormStage, UNREGISTERED } from "../helpers/express-order-store";
import { formProgressReport } from "./form-progress";

const EMPTY: FormState = {
  customer_name: "",
  phone: "",
  alt_phone: "",
  governorate_code: "",
  address_details: "",
};

/** The shared validator's rules, enough for these cases. */
function fieldError(k: FieldKey, raw: string): string | null {
  const v = raw.trim();
  if (k === "alt_phone") return null;
  if (k === "governorate_code") return v === "BG" ? null : "required";
  if (k === "phone") return /^07\d{9}$/.test(v.replace(/\s/g, "")) ? null : "invalid";
  return v ? null : "required";
}

function report(form: Partial<FormState>, phoneComplete = true, locale: "ar" | "en" = "ar") {
  return formProgressReport({
    form: { ...EMPTY, ...form },
    fieldError,
    phoneComplete,
    fieldId: (k) => `f-${k}`,
    submitLabel: locale === "ar" ? "ثبّت طلبي" : "Place my order",
    locale,
  });
}

const stageOf = (r: ReturnType<typeof report>) =>
  expressFormStage({ ...UNREGISTERED, registered: true, formId: "direct-order", ...r });

describe("formProgressReport", () => {
  it("untouched: every required field missing, the phone first", () => {
    const r = report({}, false);
    expect(r.missing).toEqual(["phone", "customer_name", "governorate_code", "address_details"]);
    expect(r.firstMissingId).toBe("f-phone");
    expect(r.firstMissingLabel).toBe("رقم الموبايل");
    expect(stageOf(r)).toBe("untouched");
  });

  it("partial: names the first missing field in the shopper's locale", () => {
    const r = report({ phone: "0770 123 4567", customer_name: "علي", governorate_code: "BG" });
    expect(r.missing).toEqual(["address_details"]);
    expect(r.firstMissingId).toBe("f-address_details");
    expect(r.firstMissingLabel).toBe("المنطقة والشارع");
    expect(stageOf(r)).toBe("partial");
    expect(report({ phone: "0770 123 4567" }, true, "en").firstMissingLabel).toBe("Your name");
  });

  it("a phone the express check refuses is still missing, even when the shared one passes", () => {
    const r = report({ phone: "0770 123 4567", customer_name: "علي", governorate_code: "BG", address_details: "المنصور" }, false);
    expect(r.missing).toEqual(["phone"]);
    expect(stageOf(r)).toBe("partial");
  });

  it("whitespace is empty; the backup number never counts", () => {
    expect(report({ customer_name: "  " }).missing).toContain("customer_name");
    expect(report({ alt_phone: "" }).missing).not.toContain("alt_phone");
  });

  it("complete: nothing missing, the submit's id and label", () => {
    const r = report({ phone: "0770 123 4567", customer_name: "علي", governorate_code: "BG", address_details: "المنصور" });
    expect(r).toEqual({
      missing: [],
      firstMissingId: null,
      firstMissingLabel: null,
      submitId: EXPRESS_SUBMIT_ID,
      submitLabel: "ثبّت طلبي",
    });
    expect(stageOf(r)).toBe("complete");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/pdp_express/form-progress.test.ts
```
Expected: `Error: Failed to load url ./form-progress`, `Tests  no tests`.

- [ ] **Step 3: Implement**

Create `packages/sections/src/pdp_express/form-progress.ts`:
```ts
// What the express form tells a form-aware sticky bar (spec §1.8): which
// required fields are still missing, where the first one is and what it is
// called, and the submit's id and label. Pure, so the bar's four states are
// tested without a DOM.

import type { LocaleCode } from "@scheniders/shared";
import type { FieldKey, FormState } from "../pdp_direct_order.client";
import {
  EXPRESS_REQUIRED_FIELDS,
  EXPRESS_SUBMIT_ID,
  type ExpressFormReport,
} from "../helpers/express-order-store";
import type { ExpressStringKey } from "./strings";
import { xs } from "./text";

/** Each field's visible label: «باقي {field}» names it the same way. */
const FIELD_LABEL: Record<FieldKey, ExpressStringKey> = {
  phone: "phoneLabel",
  customer_name: "nameLabel",
  governorate_code: "governorateLabel",
  address_details: "addressLabel",
  alt_phone: "altPhoneLabel",
};

export function formProgressReport(input: {
  form: FormState;
  /** The shared validator (`ExpressModel.fieldError`). */
  fieldError: (k: FieldKey, raw: string) => string | null;
  /** The express form's own, stricter phone check: 11 digits on a known
   *  operator. A number the express submit would refuse is still missing. */
  phoneComplete: boolean;
  fieldId: (k: FieldKey) => string;
  submitLabel: string;
  locale: LocaleCode;
}): ExpressFormReport {
  const missing = EXPRESS_REQUIRED_FIELDS.filter((k) => {
    const value = input.form[k];
    if (value.trim() === "" || input.fieldError(k, value) !== null) return true;
    return k === "phone" && !input.phoneComplete;
  });
  const first = missing[0];
  const submitLabel = input.submitLabel.trim();
  return {
    missing,
    firstMissingId: first ? input.fieldId(first) : null,
    firstMissingLabel: first ? xs(FIELD_LABEL[first], input.locale) : null,
    submitId: EXPRESS_SUBMIT_ID,
    submitLabel: submitLabel === "" ? null : submitLabel,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
CI=true pnpm exec vitest run packages/sections/src/pdp_express/form-progress.test.ts
```
Expected: `Tests  5 passed (5)`.

- [ ] **Step 5: Type gate, then commit**

Run the sections type gate. Expected: no output.
```bash
git branch --show-current
git add packages/sections/src/pdp_express/form-progress.ts packages/sections/src/pdp_express/form-progress.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): formProgressReport — missing fields, first one's id and label, submit id and label" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The express form reports; the receipt and submit carry the bar's marks while watched

**Files:**
- Modify: `packages/sections/src/pdp_express/express-form.tsx:22-23` (imports), after `:153` (`phoneComplete`)
- Modify: `packages/sections/src/pdp_express/checkout-row.tsx:15` (import), `:95` (watch), `:118` (receipt), `:188-190` (submit)
- Test: `packages/sections/src/_pdp-express-progress.test.tsx`

Hooks only — no new element in the express tree, so React's `useId` numbering (and every id in the baselines) is unchanged (express-view.tsx:210-212 explains why a new sibling slot would renumber them).

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/_pdp-express-progress.test.tsx`:
```tsx
// @vitest-environment jsdom
// =====================================================================
// pdp_direct_order express — the form reports its progress (slice 1f)
// =====================================================================
// The express form registers in useExpressOrderStore while mounted and
// reports, after every change, what a form-aware sticky bar needs: the
// required fields still missing, the first one's id and label, and the
// submit's id and label. The receipt and the submit carry the bar's marks
// only while a bar watches the product.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { StoreBaseProvider } from "./helpers/store-context";
import {
  EXPRESS_SUBMIT_ID,
  UNREGISTERED,
  expressFormOf,
  expressFormStage,
  useExpressOrderStore,
} from "./helpers/express-order-store";
import pdp_direct_order from "./pdp_direct_order";
import { EXPRESS_IRAQ_PDP_PROPS, plainProduct, productCtx } from "./_pdp-fixtures";

function mount() {
  const Section = pdp_direct_order.render;
  const view = render(
    <StoreBaseProvider base="/s/fixture-store">
      <Section props={EXPRESS_IRAQ_PDP_PROPS} ctx={productCtx(plainProduct)} />
    </StoreBaseProvider>,
  );
  const q = <T extends Element>(sel: string): T => {
    const el = view.container.querySelector<T>(sel);
    if (!el) throw new Error(`missing ${sel}`);
    return el;
  };
  return { view, q };
}

const progress = () => expressFormOf(useExpressOrderStore.getState(), plainProduct.id);

beforeEach(() => {
  useExpressOrderStore.setState({ forms: {}, watchers: {} });
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}"))));
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("express form progress", () => {
  it("registers untouched, names the next field as it fills, and unregisters on unmount", () => {
    const { view, q } = mount();
    expect(expressFormStage(progress())).toBe("untouched");
    expect(progress().formId).toBe("direct-order");
    expect(progress().firstMissingId).toBe(q<HTMLInputElement>('input[name="phone"]').id);
    expect(progress().firstMissingLabel).toBe("رقم الموبايل");
    expect(progress().submitLabel).toBe("ثبّت طلبي");

    fireEvent.change(q('input[name="phone"]'), { target: { value: "0770 123 4567" } });
    expect(expressFormStage(progress())).toBe("partial");
    expect(progress().firstMissingId).toBe(q<HTMLInputElement>('input[name="name"]').id);
    expect(progress().firstMissingLabel).toBe("اسمك");

    fireEvent.change(q('input[name="name"]'), { target: { value: "علي" } });
    fireEvent.change(q('select[name="governorate"]'), { target: { value: "BG" } });
    expect(progress().missing).toEqual(["address_details"]);
    expect(progress().firstMissingLabel).toBe("المنطقة والشارع");

    fireEvent.change(q('input[name="address"]'), { target: { value: "المنصور" } });
    expect(expressFormStage(progress())).toBe("complete");
    expect(progress().submitId).toBe(EXPRESS_SUBMIT_ID);

    view.unmount();
    expect(progress()).toBe(UNREGISTERED);
  });

  it("marks the receipt and the submit only while a bar watches", () => {
    const { view } = mount();
    const marks = () => [
      view.container.querySelectorAll("[data-receipt]").length,
      view.container.querySelectorAll(`#${EXPRESS_SUBMIT_ID}`).length,
    ];
    expect(marks()).toEqual([0, 0]);
    let unwatch = () => {};
    act(() => {
      unwatch = useExpressOrderStore.getState().watchForm(plainProduct.id);
    });
    expect(marks()).toEqual([1, 1]);
    expect(view.container.querySelector(`#${EXPRESS_SUBMIT_ID}`)?.getAttribute("type")).toBe("submit");
    act(() => unwatch());
    expect(marks()).toEqual([0, 0]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-express-progress.test.tsx
```
Expected: `Tests  2 failed (2)` — the stage is `none` (nothing registers) and the marks stay `[0, 0]`.

- [ ] **Step 3: The form registers and reports**

In `packages/sections/src/pdp_express/express-form.tsx`, replace:
```tsx
import { MaterialIcon } from "../helpers/primitives";
import type { FieldElement, FieldKey } from "../pdp_direct_order.client";
import type { ExpressModel } from "./model";
```
with:
```tsx
import { useExpressOrderStore } from "../helpers/express-order-store";
import { MaterialIcon } from "../helpers/primitives";
import { DIRECT_ORDER_FORM_ID, type FieldElement, type FieldKey } from "../pdp_direct_order.client";
import { formProgressReport } from "./form-progress";
import type { ExpressModel } from "./model";
```
(`express-view.tsx:20` already imports `DIRECT_ORDER_FORM_ID` from the same module; the cycle is resolved at render time, as there.)

Replace:
```tsx
  const phoneComplete =
    digits.length === IRAQI_MOBILE_DIGITS && phoneIssue(digits, true) === null;
```
with:
```tsx
  const phoneComplete =
    digits.length === IRAQI_MOBILE_DIGITS && phoneIssue(digits, true) === null;

  // Tell a form-aware sticky bar how far the shopper is (spec §1.8). The
  // report runs after every render; the store drops one that changes
  // nothing, so the bar re-renders only when the progress moves.
  const productId = m.product.id;
  const registerForm = useExpressOrderStore((st) => st.registerForm);
  const reportForm = useExpressOrderStore((st) => st.reportForm);
  useEffect(() => registerForm(productId, DIRECT_ORDER_FORM_ID), [registerForm, productId]);
  const progress = formProgressReport({
    form,
    fieldError: m.fieldError,
    phoneComplete,
    fieldId: (k) => m.fieldA11yCore(k).id,
    submitLabel: resolveI18n(m.props.submit_label_i18n, locale),
    locale,
  });
  useEffect(() => {
    reportForm(productId, progress);
  });
```
(The registration effect is declared first, so on mount it runs before the first report; the report effect has no dependency list on purpose — the store's `sameReport` makes a repeat a no-op.)

- [ ] **Step 4: The receipt and the submit carry the marks while watched**

In `packages/sections/src/pdp_express/checkout-row.tsx`, replace:
```tsx
import { ContactLine } from "../helpers/contact-line";
```
with:
```tsx
import { ContactLine } from "../helpers/contact-line";
import { EXPRESS_SUBMIT_ID, useFormWatched } from "../helpers/express-order-store";
```
Replace:
```tsx
  const rtl = readsRtl(locale);
  const freeEverywhere = isDeliveryFreeEverywhere(m.subtotal, m.qty, m.shipping);
```
with:
```tsx
  const rtl = readsRtl(locale);
  // While a form-aware sticky bar watches this product, the receipt and the
  // submit carry the marks it scrolls to and focuses (spec §1.8). Never in
  // server markup: only the bar's mount effect sets the watch.
  const watched = useFormWatched(m.product.id);
  const freeEverywhere = isDeliveryFreeEverywhere(m.subtotal, m.qty, m.shipping);
```
Replace:
```tsx
      <div className="divide-y divide-dashed divide-bk-divider rounded-bk-card border-bk border-bk-divider px-4">
```
with:
```tsx
      <div
        className="divide-y divide-dashed divide-bk-divider rounded-bk-card border-bk border-bk-divider px-4"
        data-receipt={watched ? "" : undefined}
      >
```
Replace:
```tsx
        <button
          type="submit"
          disabled={m.oos || m.submitting}
```
with:
```tsx
        <button
          type="submit"
          id={watched ? EXPRESS_SUBMIT_ID : undefined}
          disabled={m.oos || m.submitting}
```

- [ ] **Step 5: Run the test and every express baseline**

```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-express-progress.test.tsx
CI=true pnpm exec vitest run packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_pdp-express-form.test.tsx packages/sections/src/_pdp-express-cta.test.tsx packages/sections/src/pdp_express/checkout-row.receipt.test.tsx packages/sections/src/_pdp-redesign-snapshot.test.tsx
```
Expected: `Tests  2 passed (2)`; then every file passes with no `written`/`updated`/`obsolete` line (server markup carries neither mark).

- [ ] **Step 6: Type gate, then commit**

Run the sections type gate. Expected: no output.
```bash
git branch --show-current
git add packages/sections/src/pdp_express/express-form.tsx packages/sections/src/pdp_express/checkout-row.tsx packages/sections/src/_pdp-express-progress.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): express form reports its progress; receipt and submit marked while a bar watches" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The sticky bar's chrome strings

**Files:**
- Create: `packages/sections/src/sticky_cta_bar.strings.ts`
- Modify: `packages/sections/src/_string-tables.ts` (the list)
- Test: `packages/sections/src/sticky_cta_bar.strings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/sticky_cta_bar.strings.test.ts`:
```ts
// The sticky bar's chrome strings: tokens fill, every entry resolves in
// ar, en and ku, and the region name is today's, unchanged.

import { describe, expect, it } from "vitest";
import { STICKY_STRINGS, ss } from "./sticky_cta_bar.strings";

describe("ss", () => {
  it("names the missing field and fills the WhatsApp message", () => {
    expect(ss("stillMissing", "ar", { field: "المنطقة والشارع" })).toBe("باقي المنطقة والشارع");
    expect(ss("waPrefill", "ar", { product: "ويفر انتنس" })).toBe("هلا، أريد أطلب ويفر انتنس");
    expect(ss("waPrefill", "en", { product: "Wayfarer Intense" })).toBe("Hi, I'd like to order Wayfarer Intense");
  });

  it("the region name is the one the bar always had", () => {
    expect([ss("region", "ar"), ss("region", "en"), ss("region", "ku")]).toEqual([
      "إجراءات سريعة",
      "Quick actions",
      "کردارە خێراکان",
    ]);
  });

  it("every entry has ar, en and ku", () => {
    for (const entry of Object.values(STICKY_STRINGS)) {
      expect(Object.keys(entry).sort()).toEqual(["ar", "en", "ku"]);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/sticky_cta_bar.strings.test.ts
```
Expected: `Error: Failed to load url ./sticky_cta_bar.strings`, `Tests  no tests`.

- [ ] **Step 3: Write the table and list it**

Create `packages/sections/src/sticky_cta_bar.strings.ts`:
```ts
// Chrome strings for sticky_cta_bar (spec §1.8). Generic UI text only: the
// start label («اطلب الآن») and the submit label («ثبّت طلبي») are merchant
// props, and the icon's accessible names reuse the FAQ contact row's
// «راسلنا واتساب» / «اتصل بينا» (one name per action, F12). Every entry
// carries ar, en and ku (guarded by _kurdish-coverage via _string-tables.ts).

import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";

export const STICKY_STRINGS = {
  /** The bar's landmark name (moved here unchanged from the component). */
  region: { en: "Quick actions", ar: "إجراءات سريعة", ku: "کردارە خێراکان" },
  /** form_aware, some required fields filled: the big line. */
  continueOrder: { en: "Finish your order", ar: "كمّل طلبك", ku: "داواکارییەکەت تەواو بکە" },
  /** …and the small line under it, naming the first missing field. */
  stillMissing: { en: "{field} still to fill", ar: "باقي {field}", ku: "{field} ماوە" },
  /** form_aware, every required field filled: the small line under «ثبّت طلبي». */
  ready: { en: "Your details are ready", ar: "معلوماتك جاهزة", ku: "زانیارییەکانت ئامادەن" },
  /** The WhatsApp icon's message when the merchant sets none. */
  waPrefill: {
    en: "Hi, I'd like to order {product}",
    ar: "هلا، أريد أطلب {product}",
    ku: "سڵاو، دەمەوێت {product} داوا بکەم",
  },
} as const;

export type StickyStringKey = keyof typeof STICKY_STRINGS;

/** One chrome string, with `{name}` tokens filled. */
export function ss(
  key: StickyStringKey,
  locale: LocaleCode,
  vars?: Record<string, string | number>,
): string {
  let out = resolveI18n(STICKY_STRINGS[key], locale);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(String(v));
    }
  }
  return out;
}
```
(ar: `continueOrder` and `waPrefill` are spec §1.8's words; `stillMissing` is the spec's «باقي {field}» half; `ready` is concept A's complete-state line (c-whole-page-a.html:653); `region` is today's inline landmark name, verbatim. en and ku are drafted here for Ali's copy review, to-dos 8 and 10.)

In `packages/sections/src/_string-tables.ts`, replace:
```ts
  "faq_contact_split.strings.ts",
];
```
with:
```ts
  "faq_contact_split.strings.ts",
  "sticky_cta_bar.strings.ts",
];
```

- [ ] **Step 4: Run it and the Kurdish coverage**

```bash
CI=true pnpm exec vitest run packages/sections/src/sticky_cta_bar.strings.test.ts packages/sections/src/_kurdish-coverage.test.ts
```
Expected: `Test Files  2 passed (2)`, `Tests  16 passed (16)` (strings 3; coverage 13, one more for the new file).

- [ ] **Step 5: Type gate, then commit**

Run the sections type gate. Expected: no output.
```bash
git branch --show-current
git add packages/sections/src/sticky_cta_bar.strings.ts packages/sections/src/sticky_cta_bar.strings.test.ts packages/sections/src/_string-tables.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): sticky bar chrome strings (ar/en/ku) on the string-table list" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `sticky_cta_bar` gains `form_aware`, `style`, `secondary_display`, `whatsapp_prefill_i18n`

**Files:**
- Modify: `packages/sections/src/sticky_cta_bar.tsx:28-32` (`primary_kind`), `:45-46` (after `hide_while`)
- Test: `packages/sections/src/_sticky-cta-props.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/_sticky-cta-props.test.ts`:
```ts
// sticky_cta_bar's slice-1f props are optional and fail safe: a bad or
// rolled-back stored value falls back to today's behaviour instead of
// dropping the bar.

import { describe, expect, it } from "vitest";
import sticky_cta_bar from "./sticky_cta_bar";
import { IRAQ_DRAFT_STICKY_PROPS } from "./_pdp-fixtures";

const parse = (extra: Record<string, unknown>) => sticky_cta_bar.schema.parse({ ...IRAQ_DRAFT_STICKY_PROPS, ...extra });

describe("sticky_cta_bar 1f props", () => {
  it("accepts the new values", () => {
    const p = parse({
      primary_kind: "form_aware",
      style: "soft",
      secondary_display: "icon",
      whatsapp_prefill_i18n: { ar: "هلا، أريد أطلب {product}" },
    });
    expect(p.primary_kind).toBe("form_aware");
    expect(p.style).toBe("soft");
    expect(p.secondary_display).toBe("icon");
    expect(p.whatsapp_prefill_i18n).toEqual({ ar: "هلا، أريد أطلب {product}" });
  });

  it("a bad value falls back to the default, and the bar still parses", () => {
    const p = parse({ primary_kind: "auto_submit", style: "neon", secondary_display: 3, whatsapp_prefill_i18n: "hi" });
    expect(p.primary_kind).toBeUndefined();
    expect(p.style).toBeUndefined();
    expect(p.secondary_display).toBeUndefined();
    expect(p.whatsapp_prefill_i18n).toBeUndefined();
    expect(p.primary_label_i18n).toEqual(IRAQ_DRAFT_STICKY_PROPS.primary_label_i18n);
  });

  it("the old values are unchanged", () => {
    expect(parse({ primary_kind: "scroll_to_form" }).primary_kind).toBe("scroll_to_form");
    expect(parse({ primary_kind: "link" }).primary_kind).toBe("link");
    expect(sticky_cta_bar.schema.parse(IRAQ_DRAFT_STICKY_PROPS)).toEqual(IRAQ_DRAFT_STICKY_PROPS);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/_sticky-cta-props.test.ts
```
Expected: `Tests  2 failed | 1 passed (3)` — `"form_aware"` is not an option, and a bad `primary_kind` throws instead of falling back.

- [ ] **Step 3: The props**

In `packages/sections/src/sticky_cta_bar.tsx`, replace:
```ts
  /** "link" (default) navigates to `primary_href`. "scroll_to_form" scrolls
   *  to the in-page order form instead — the right choice on a funnel PDP
   *  whose only purchase path is the inline COD form (a link to /checkout
   *  there is a dead end into an empty cart). */
  primary_kind: z.enum(["link", "scroll_to_form"]).optional(),
```
with:
```ts
  /** "link" (default) navigates to `primary_href`. "scroll_to_form" scrolls
   *  to the in-page order form instead — the right choice on a funnel PDP
   *  whose only purchase path is the inline COD form (a link to /checkout
   *  there is a dead end into an empty cart). "form_aware" (spec §1.8)
   *  reads the express form's progress: «اطلب الآن» → the first empty field;
   *  «كمّل طلبك · باقي …» → the first missing field; once complete the
   *  form's own «ثبّت طلبي» → the receipt, focusing the submit. It never
   *  submits (D6). A bad stored value falls back to "link". */
  primary_kind: z.enum(["link", "scroll_to_form", "form_aware"]).optional().catch(undefined),
```
Replace:
```ts
  hide_while: z.enum(["submit", "form"]).optional().catch(undefined),
});
```
with:
```ts
  hide_while: z.enum(["submit", "form"]).optional().catch(undefined),
  /** "chunky" (default): today's outlined, hard-shadow buttons. "soft": the
   *  express form's own button look — token radius and shadow, no ink
   *  outline — on a plain surface bar (issue I14). */
  style: z.enum(["chunky", "soft"]).optional().catch(undefined),
  /** "button" (default): the labelled secondary button. "icon": a 52px
   *  square, the WhatsApp glyph (or the call glyph) with an accessible name. */
  secondary_display: z.enum(["button", "icon"]).optional().catch(undefined),
  /** With `secondary_display: "icon"` on a product page: the message the
   *  WhatsApp icon opens with, `{product}` = the product's name. Empty =
   *  «هلا، أريد أطلب {product}». The labelled button keeps its bare link. */
  whatsapp_prefill_i18n: i18nStringOptional.catch(undefined),
});
```

- [ ] **Step 4: Run it, the bar's baseline, and the builder's field tests**

```bash
CI=true pnpm exec vitest run packages/sections/src/_sticky-cta-props.test.ts packages/sections/src/_sticky-cta-baseline-snapshot.test.tsx
CI=true pnpm exec vitest run apps/platform/lib/section-field-groups.test.ts apps/platform/components/store-builder-v2/auto-form-schema.test.ts
```
Expected: `Tests  8 passed (8)` with no `written`/`updated` line (the four frozen renders and the schema round-trip are unchanged); then `Test Files  2 passed (2)`, `Tests  112 passed (112)` (the builder still finds a Simple-visible field and unwraps the `.catch`-wrapped enums, 1d's `2d77245c`).

- [ ] **Step 5: Type gate, then commit**

Run the sections type gate. Expected: no output.
```bash
git branch --show-current
git add packages/sections/src/sticky_cta_bar.tsx packages/sections/src/_sticky-cta-props.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): sticky_cta_bar props form_aware, style, secondary_display, whatsapp_prefill_i18n (catch-guarded)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The form-aware primary — label, target, and the hand-off

**Files:**
- Create: `packages/sections/src/sticky_cta_bar.form-aware.ts`
- Test: `packages/sections/src/sticky_cta_bar.form-aware.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/sticky_cta_bar.form-aware.test.ts`:
```ts
// @vitest-environment jsdom
// The form-aware bar's label and tap target per state (spec §1.8), the
// WhatsApp link, and the hand-off: it scrolls and focuses, never submits.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UNREGISTERED, type ExpressFormProgress } from "./helpers/express-order-store";
import { handOffToForm, stickyPrimary, stickyWhatsappHref } from "./sticky_cta_bar.form-aware";

const registered = (over: Partial<ExpressFormProgress>): ExpressFormProgress => ({
  ...UNREGISTERED,
  registered: true,
  formId: "direct-order",
  ...over,
});

describe("stickyPrimary", () => {
  it("none: the start label and today's scroll to the form", () => {
    expect(stickyPrimary(UNREGISTERED, "اطلب الآن", "ar")).toEqual({
      stage: "none",
      label: "اطلب الآن",
      sub: null,
      target: { kind: "form" },
    });
  });

  it("untouched: the start label, aimed at the first empty field", () => {
    const p = registered({ firstMissingId: "f-phone", firstMissingLabel: "رقم الموبايل" });
    expect(stickyPrimary(p, "اطلب الآن", "ar")).toEqual({
      stage: "untouched",
      label: "اطلب الآن",
      sub: null,
      target: { kind: "field", id: "f-phone" },
    });
  });

  it("partial: «كمّل طلبك» over «باقي {field}», aimed at that field", () => {
    const p = registered({
      missing: ["address_details"],
      firstMissingId: "f-address_details",
      firstMissingLabel: "المنطقة والشارع",
    });
    expect(stickyPrimary(p, "اطلب الآن", "ar")).toEqual({
      stage: "partial",
      label: "كمّل طلبك",
      sub: "باقي المنطقة والشارع",
      target: { kind: "field", id: "f-address_details" },
    });
    expect(stickyPrimary(p, "Order now", "en").label).toBe("Finish your order");
  });

  it("complete: the form's own submit label, aimed at the submit — never a submit", () => {
    const p = registered({ missing: [], submitId: "direct-order-submit", submitLabel: "ثبّت طلبي" });
    expect(stickyPrimary(p, "اطلب الآن", "ar")).toEqual({
      stage: "complete",
      label: "ثبّت طلبي",
      sub: "معلوماتك جاهزة",
      target: { kind: "submit", id: "direct-order-submit" },
    });
    expect(stickyPrimary({ ...p, submitLabel: null }, "اطلب الآن", "ar").label).toBe("اطلب الآن");
  });
});

describe("stickyWhatsappHref", () => {
  it("prefills the message, encoded; no number, no link", () => {
    expect(stickyWhatsappHref("07779703832", "هلا، أريد أطلب ويفر انتنس")).toBe(
      `https://wa.me/9647779703832?text=${encodeURIComponent("هلا، أريد أطلب ويفر انتنس")}`,
    );
    expect(stickyWhatsappHref("07779703832", " ")).toBe("https://wa.me/9647779703832");
    expect(stickyWhatsappHref(null, "x")).toBeNull();
  });
});

describe("handOffToForm", () => {
  const scrolled: Element[] = [];
  beforeEach(() => {
    scrolled.length = 0;
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q }));
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
      scrolled.push(this);
    };
    document.body.innerHTML = `
      <form id="direct-order">
        <input id="f-phone" />
        <div inert><input id="f-name" /></div>
        <div data-receipt>total</div>
        <button type="submit" id="direct-order-submit">ثبّت طلبي</button>
      </form>`;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("a field: scrolled into view and focused", () => {
    const fallback = vi.fn();
    handOffToForm({ kind: "field", id: "f-phone" }, fallback);
    expect(document.activeElement?.id).toBe("f-phone");
    expect(scrolled.map((e) => e.id)).toEqual(["f-phone"]);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("a field in a closed (inert) stage, or a missing one: the fallback", () => {
    const fallback = vi.fn();
    handOffToForm({ kind: "field", id: "f-name" }, fallback);
    handOffToForm({ kind: "field", id: "nope" }, fallback);
    expect(fallback).toHaveBeenCalledTimes(2);
    expect(scrolled).toEqual([]);
  });

  it("complete: the receipt comes into view, the submit gets focus, and nothing is submitted", () => {
    const submitted = vi.fn((e: Event) => e.preventDefault());
    document.getElementById("direct-order")?.addEventListener("submit", submitted);
    handOffToForm({ kind: "submit", id: "direct-order-submit" }, vi.fn());
    expect(scrolled.map((e) => e.hasAttribute("data-receipt"))).toEqual([true]);
    expect(document.activeElement?.id).toBe("direct-order-submit");
    expect(submitted).not.toHaveBeenCalled();
  });

  it("complete without the marks (no bar watching yet): the fallback", () => {
    document.querySelector("[data-receipt]")?.removeAttribute("data-receipt");
    const fallback = vi.fn();
    handOffToForm({ kind: "submit", id: "direct-order-submit" }, fallback);
    expect(fallback).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/sticky_cta_bar.form-aware.test.ts
```
Expected: `Error: Failed to load url ./sticky_cta_bar.form-aware`, `Tests  no tests`.

- [ ] **Step 3: Implement**

Create `packages/sections/src/sticky_cta_bar.form-aware.ts`:
```ts
// =====================================================================
// sticky_cta_bar — the form-aware primary (spec §1.8, F04)
// =====================================================================
// The bar reads the express form's progress (useExpressOrderStore) and
// picks one of four states:
//   none      — no express form for this product: the start label, and
//               today's scroll_to_form tap;
//   untouched — the start label («اطلب الآن»); the tap goes to the first
//               empty field (the phone) and focuses it;
//   partial   — «كمّل طلبك» over «باقي {field}»; the tap goes to that field;
//   complete  — the form's own submit label («ثبّت طلبي») over «معلوماتك
//               جاهزة»; the tap brings the receipt into view and focuses the
//               submit, so the buyer sees the total before one more tap.
// The bar NEVER submits (D6, confirmed by Ali 2026-10-29): a COD order
// sent without seeing the total is the order refused at the door.
// =====================================================================

import type { LocaleCode } from "@scheniders/shared";
import {
  expressFormStage,
  type ExpressFormProgress,
  type ExpressFormStage,
} from "./helpers/express-order-store";
import { whatsappDigits } from "./helpers/whatsapp";
import { ss } from "./sticky_cta_bar.strings";

export type StickyTarget =
  | { kind: "form" }
  | { kind: "field"; id: string }
  | { kind: "submit"; id: string };

export interface StickyPrimary {
  stage: ExpressFormStage;
  label: string;
  /** The small second line, or null. */
  sub: string | null;
  target: StickyTarget;
}

export function stickyPrimary(
  progress: ExpressFormProgress,
  startLabel: string,
  locale: LocaleCode,
): StickyPrimary {
  const stage = expressFormStage(progress);
  const field: StickyTarget = progress.firstMissingId
    ? { kind: "field", id: progress.firstMissingId }
    : { kind: "form" };
  switch (stage) {
    case "none":
      return { stage, label: startLabel, sub: null, target: { kind: "form" } };
    case "untouched":
      return { stage, label: startLabel, sub: null, target: field };
    case "partial":
      return {
        stage,
        label: ss("continueOrder", locale),
        sub: progress.firstMissingLabel
          ? ss("stillMissing", locale, { field: progress.firstMissingLabel })
          : null,
        target: field,
      };
    case "complete":
      return {
        stage,
        label: progress.submitLabel ?? startLabel,
        sub: ss("ready", locale),
        target: progress.submitId ? { kind: "submit", id: progress.submitId } : { kind: "form" },
      };
  }
}

/** `wa.me` for the store's number, with `message` prefilled when non-empty. */
export function stickyWhatsappHref(number: string | null, message: string): string | null {
  if (!number) return null;
  const base = `https://wa.me/${whatsappDigits(number)}`;
  const text = message.trim();
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

/**
 * Carries out the tap. A field is scrolled to the middle of the screen and
 * focused; the complete state centres the receipt and focuses the submit.
 * When the target is gone or sits in a collapsed (inert) stage, `fallback`
 * runs instead — today's scroll to the form.
 */
export function handOffToForm(target: StickyTarget, fallback: () => void): void {
  if (target.kind === "field") {
    const field = document.getElementById(target.id);
    if (!(field instanceof HTMLElement) || field.closest("[inert]")) {
      fallback();
      return;
    }
    field.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
    field.focus({ preventScroll: true });
    return;
  }
  if (target.kind === "submit") {
    const submit = document.getElementById(target.id);
    const receipt = submit?.closest("form")?.querySelector("[data-receipt]");
    if (!(submit instanceof HTMLButtonElement) || !(receipt instanceof HTMLElement)) {
      fallback();
      return;
    }
    receipt.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
    submit.focus({ preventScroll: true });
    return;
  }
  fallback();
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
CI=true pnpm exec vitest run packages/sections/src/sticky_cta_bar.form-aware.test.ts
```
Expected: `Tests  9 passed (9)`.

- [ ] **Step 5: Type gate, then commit**

Run the sections type gate. Expected: no output.
```bash
git branch --show-current
git add packages/sections/src/sticky_cta_bar.form-aware.ts packages/sections/src/sticky_cta_bar.form-aware.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): form-aware sticky primary — four states, scroll-and-focus hand-off, never a submit (D6)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The soft bar, the WhatsApp square, and the form-aware render

**Files:**
- Create: `packages/sections/src/sticky_cta_bar.soft.tsx`
- Modify: `packages/sections/src/sticky_cta_bar.client.tsx` (whole file below)
- Test: `packages/sections/src/_sticky-cta-soft.test.tsx` (server markup)
- Test: `packages/sections/src/_sticky-cta-form-aware-dom.test.tsx` (jsdom, beside a real form)

- [ ] **Step 1: Write the failing tests**

Create `packages/sections/src/_sticky-cta-soft.test.tsx`:
```tsx
// =====================================================================
// sticky_cta_bar — the soft, form-aware bar with the WhatsApp icon (1f)
// =====================================================================
// Server markup of the opted-in bar: no ink outline and no hard shadow
// (I14), the price at the 12px floor with a red strike (D4), the 52px
// WhatsApp square named «راسلنا واتساب» and prefilled with the product,
// yellow only on the primary, no dir attribute and no colour literal. On
// the server the form has not reported yet, so the label is the start
// label; the four states are covered by sticky_cta_bar.form-aware.test.ts
// and _sticky-cta-form-aware-dom.test.tsx.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import sticky_cta_bar from "./sticky_cta_bar";
import type { Props } from "./sticky_cta_bar";
import type { SectionRenderContext } from "./_types";
import type { Product } from "./types";
import { IRAQ_DRAFT_STICKY_PROPS, IRAQ_DRAFT_TENANT, productCtx, productRuntime, saleProduct } from "./_pdp-fixtures";
import { displayNameOf } from "./pdp_express/identity-label";

const SOFT: Props = {
  ...IRAQ_DRAFT_STICKY_PROPS,
  primary_kind: "form_aware",
  style: "soft",
  secondary_display: "icon",
};

/** `product: null` renders the bar off a product page (the cart). */
function render(props: Props, product: Product | null = saleProduct, over: Partial<SectionRenderContext> = {}) {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <sticky_cta_bar.render
        props={props}
        ctx={productCtx(product ?? undefined, { tenant: IRAQ_DRAFT_TENANT, ...over })}
      />
    </StoreBaseProvider>,
  );
}

describe("sticky_cta_bar soft + form_aware + icon", () => {
  const html = render(SOFT);

  it("the soft bar: surface, hairline, no ink outline, no hard shadow, no colour literal", () => {
    expect(html).toContain('data-sticky-style="soft"');
    expect(html).toContain("border-t border-bk-divider bg-bk-surface");
    expect(html).not.toContain("--bk-border-thickness");
    expect(html).not.toContain("shadow-[");
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgba?\(/);
    expect(html).not.toContain(' dir="');
  });

  it("starts hidden while the form shows (hide_while form), as today", () => {
    expect(html).toContain('aria-hidden="true" inert=""');
    expect(html).toContain("translate-y-full");
  });

  it("the primary: yellow, token radius and shadow, the start label, a button that never submits", () => {
    expect(html).toMatch(/<button type="button" class="[^"]*rounded-bk-input bg-bk-primary [^"]*shadow-bk-button[^"]*" data-sticky-primary="none">/);
    expect(html).toContain(">اطلب الآن<");
    expect(html).not.toContain('type="submit"');
    expect(html.split("bg-bk-primary ").length - 1).toBe(1);
  });

  it("the price on the surface: struck price in red at 12px, the price at 17px", () => {
    expect(html).toContain('<s class="font-bk-body text-xs font-semibold text-bk-ink-faint decoration-bk-danger"><bdi>32,000 د.ع</bdi></s>');
    expect(html).toContain("text-[17px] font-black text-bk-ink\"><bdi>25,000 د.ع</bdi>");
    expect(html).not.toMatch(/text-\[(?:10|11)px\]/);
  });

  it("the WhatsApp square: 52px, green glyph, «راسلنا واتساب», prefilled with the product", () => {
    const text = encodeURIComponent(`هلا، أريد أطلب ${displayNameOf(saleProduct)}`);
    expect(html).toContain(
      `<a href="https://wa.me/9647701234567?text=${text}" target="_blank" rel="noopener noreferrer" aria-label="راسلنا واتساب"`,
    );
    expect(html).toContain('data-sticky-secondary="icon"');
    expect(html).toContain("h-[52px] w-[52px]");
    expect(html).toContain("text-bk-success");
  });

  it("the merchant's prefill wins; english names the action in english", () => {
    const own = render({ ...SOFT, whatsapp_prefill_i18n: { ar: "عندي سؤال عن {product}" } });
    expect(own).toContain(`?text=${encodeURIComponent(`عندي سؤال عن ${displayNameOf(saleProduct)}`)}`);
    const en = render(SOFT, saleProduct, { runtime: { ...productRuntime, locale: "en" } });
    expect(en).toContain('aria-label="WhatsApp us"');
    expect(en).toContain(">Order now<");
    expect(en).toContain('aria-label="Quick actions"');
  });

  it("reads right to left in Arabic, left to right in English, with a class", () => {
    expect(html).toMatch(/data-sticky-style="soft"/);
    expect(html).toMatch(/class="fixed [^"]*flex-row-reverse/);
    const en = render(SOFT, saleProduct, { runtime: { ...productRuntime, locale: "en" } });
    expect(en).not.toMatch(/class="fixed [^"]*flex-row-reverse/);
  });
});

describe("sticky_cta_bar 1f pieces on their own", () => {
  it("the icon on the chunky bar keeps the chunky primary", () => {
    const html = render({ ...IRAQ_DRAFT_STICKY_PROPS, secondary_display: "icon" });
    expect(html).toContain('data-sticky-secondary="icon"');
    expect(html).toContain("border:var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)");
  });

  it("soft with the labelled secondary: the soft WhatsApp tile, bare link", () => {
    const html = render({ ...IRAQ_DRAFT_STICKY_PROPS, style: "soft" });
    expect(html).toContain('data-sticky-secondary="button"');
    expect(html).toContain('href="https://wa.me/9647701234567"');
    expect(html).toContain(">واتساب</a>");
    expect(html).toContain('data-sticky-primary="scroll"');
  });

  it("soft link primary on the cart: an anchor, no product, so no prefill", () => {
    const html = render(
      { ...sticky_cta_bar.defaultProps, style: "soft", secondary_display: "icon" },
      null,
    );
    expect(html).toContain('<a href="/s/fixture-store/checkout"');
    expect(html).toContain('data-sticky-primary="link"');
    expect(html).toContain('href="https://wa.me/9647701234567" target="_blank"');
  });

  it("form_aware on the chunky bar renders the start label on the server", () => {
    const html = render({ ...IRAQ_DRAFT_STICKY_PROPS, primary_kind: "form_aware" });
    expect(html).toContain('type="button">اطلب الآن</button>');
  });
});
```

Create `packages/sections/src/_sticky-cta-form-aware-dom.test.tsx`:
```tsx
// @vitest-environment jsdom
// =====================================================================
// The smart sticky bar beside a real express form (spec §1.8, F04)
// =====================================================================
// Two sections that never pass props to each other, wired only through
// useExpressOrderStore: the bar's label and tap follow the form as the
// shopper fills it — «اطلب الآن» → the phone; «كمّل طلبك / باقي …» → that
// field; «ثبّت طلبي / معلوماتك جاهزة» → the receipt and the submit's focus.
// The bar never sends the order (D6): no request leaves on any tap.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { StoreBaseProvider } from "./helpers/store-context";
import { EXPRESS_SUBMIT_ID, useExpressOrderStore } from "./helpers/express-order-store";
import pdp_direct_order from "./pdp_direct_order";
import sticky_cta_bar from "./sticky_cta_bar";
import type { Props as StickyProps } from "./sticky_cta_bar";
import { EXPRESS_IRAQ_PDP_PROPS, IRAQ_DRAFT_STICKY_PROPS, plainProduct, productCtx } from "./_pdp-fixtures";

const STICKY: StickyProps = {
  ...IRAQ_DRAFT_STICKY_PROPS,
  primary_kind: "form_aware",
  style: "soft",
  secondary_display: "icon",
};

/** The bar watches the form through an IntersectionObserver; here the form
 *  is reported off screen, so the bar is on screen. */
class OffScreen {
  constructor(private readonly cb: (entries: { isIntersecting: boolean }[]) => void) {}
  observe() {
    this.cb([{ isIntersecting: false }]);
  }
  disconnect() {}
}

const scrolled: Element[] = [];
const fetchMock = vi.fn(() => Promise.resolve(new Response("{}")));

function mount() {
  const Pdp = pdp_direct_order.render;
  const Bar = sticky_cta_bar.render;
  const ctx = productCtx(plainProduct);
  const view = render(
    <StoreBaseProvider base="/s/fixture-store">
      <Pdp props={EXPRESS_IRAQ_PDP_PROPS} ctx={ctx} />
      <Bar props={STICKY} ctx={ctx} />
    </StoreBaseProvider>,
  );
  const q = <T extends Element>(sel: string): T => {
    const el = view.container.querySelector<T>(sel);
    if (!el) throw new Error(`missing ${sel}`);
    return el;
  };
  const primary = () => q<HTMLButtonElement>("[data-sticky-primary]");
  return { view, q, primary };
}

beforeEach(() => {
  scrolled.length = 0;
  fetchMock.mockClear();
  useExpressOrderStore.setState({ forms: {}, watchers: {} });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("IntersectionObserver", OffScreen);
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
    scrolled.push(this);
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("form-aware sticky bar", () => {
  it("untouched: «اطلب الآن», and a tap focuses the phone", () => {
    const { q, primary } = mount();
    expect(primary().dataset.stickyPrimary).toBe("untouched");
    expect(primary().textContent).toBe("اطلب الآن");
    fireEvent.click(primary());
    expect(document.activeElement).toBe(q('input[name="phone"]'));
    expect(scrolled).toEqual([q('input[name="phone"]')]);
  });

  it("partial: «كمّل طلبك» over «باقي اسمك», and a tap focuses the name", () => {
    const { q, primary } = mount();
    fireEvent.change(q('input[name="phone"]'), { target: { value: "0770 123 4567" } });
    expect(primary().dataset.stickyPrimary).toBe("partial");
    expect(primary().textContent).toBe("كمّل طلبكباقي اسمك");
    fireEvent.click(primary());
    expect(document.activeElement).toBe(q('input[name="name"]'));
  });

  it("complete: «ثبّت طلبي» over «معلوماتك جاهزة»; a tap shows the receipt, focuses the submit, sends nothing", () => {
    const { q, primary } = mount();
    fireEvent.change(q('input[name="phone"]'), { target: { value: "0770 123 4567" } });
    fireEvent.change(q('input[name="name"]'), { target: { value: "علي" } });
    fireEvent.change(q('select[name="governorate"]'), { target: { value: "BG" } });
    fireEvent.change(q('input[name="address"]'), { target: { value: "المنصور" } });
    expect(primary().dataset.stickyPrimary).toBe("complete");
    expect(primary().textContent).toBe("checkثبّت طلبيمعلوماتك جاهزة");
    fetchMock.mockClear();
    fireEvent.click(primary());
    expect(document.activeElement?.id).toBe(EXPRESS_SUBMIT_ID);
    expect(scrolled.map((e) => e.hasAttribute("data-receipt"))).toEqual([true]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("the WhatsApp icon opens the chat with the product named", () => {
    const { q } = mount();
    const href = q<HTMLAnchorElement>('[data-sticky-secondary="icon"]').getAttribute("href") ?? "";
    expect(decodeURIComponent(href.split("?text=")[1] ?? "")).toBe("هلا، أريد أطلب عطر تجريبي");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
CI=true pnpm exec vitest run packages/sections/src/_sticky-cta-soft.test.tsx
CI=true pnpm exec vitest run packages/sections/src/_sticky-cta-form-aware-dom.test.tsx
```
Expected: `Tests  10 failed | 1 passed (11)` (no soft markup, no icon, no prefill); `Tests  4 failed (4)` (no `[data-sticky-primary]`, no icon).

- [ ] **Step 3: The soft pieces**

Create `packages/sections/src/sticky_cta_bar.soft.tsx`:
```tsx
// =====================================================================
// sticky_cta_bar — the soft style and the icon secondary (spec §1.8)
// =====================================================================
// `style: "soft"` draws the bar the way the express form draws «ثبّت طلبي»:
// a token-radius yellow button with the token button shadow and no ink
// outline (issue I14), on a plain surface bar with a hairline. The price
// sits on the bar's surface beside it, struck price in red (D4), nothing
// under 12px. `secondary_display: "icon"` is a 52px square: the WhatsApp
// glyph in green (D4: green is for WhatsApp) or the call glyph in ink.
// Yellow fills only the primary (D4: the two order actions).
// =====================================================================

import type { LocaleCode } from "@scheniders/shared";
import type { ExpressFormStage } from "./helpers/express-order-store";
import { formatPrice } from "./helpers/format";
import { MaterialIcon, WhatsAppIcon } from "./helpers/primitives";
import { cn } from "./helpers/utils";

const PRIMARY_CLS =
  "flex min-h-[54px] flex-1 flex-col items-center justify-center rounded-bk-input bg-bk-primary px-4 py-1.5 text-bk-on-primary shadow-bk-button transition-[transform,background-color] duration-bk-fast hover:bg-bk-primary-hover active:scale-[0.97] active:bg-bk-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bk-surface motion-reduce:transition-none";

/** The yellow primary: one big line and, in the form-aware states that have
 *  one, a small line under it. A link when `href` is set, else a button. */
export function SoftPrimary({
  label,
  sub,
  stage,
  rtl,
  href,
  onClick,
}: {
  label: string;
  sub: string | null;
  /** The form-aware state, or null when the bar is not form-aware. */
  stage: ExpressFormStage | null;
  rtl: boolean;
  href: string | null;
  onClick?: () => void;
}) {
  const complete = stage === "complete";
  const body = (
    <>
      <span
        className={cn(
          "flex items-center gap-1.5 font-bk-display text-[17px] font-black leading-tight",
          rtl && "flex-row-reverse",
        )}
      >
        {complete && <MaterialIcon name="check" className="text-lg" />}
        {label}
      </span>
      {sub && <span className="font-bk-body text-xs font-bold leading-tight text-bk-on-primary/80">{sub}</span>}
    </>
  );
  const className = cn(PRIMARY_CLS, complete && "ring-2 ring-bk-secondary");
  if (href) {
    return (
      <a href={href} className={className} data-sticky-primary="link">
        {body}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} data-sticky-primary={stage ?? "scroll"}>
      {body}
    </button>
  );
}

/** The product price on the bar's surface: struck before-price in red over
 *  the current price, both at or above the 12px floor. */
export function SoftPrice({
  price,
  compareAt,
  locale,
}: {
  price: number;
  compareAt: number | null;
  locale: LocaleCode;
}) {
  const onSale = compareAt != null && compareAt > price;
  return (
    <div className="flex shrink-0 flex-col items-center leading-tight tabular-nums" data-product-price>
      {onSale && (
        <s className="font-bk-body text-xs font-semibold text-bk-ink-faint decoration-bk-danger">
          <bdi>{formatPrice(compareAt, locale)}</bdi>
        </s>
      )}
      <span className="whitespace-nowrap font-bk-display text-[17px] font-black text-bk-ink">
        <bdi>{formatPrice(price, locale)}</bdi>
      </span>
    </div>
  );
}

const SQUARE_CLS =
  "flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-bk-input border border-bk-divider bg-bk-surface transition-transform duration-bk-fast active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus motion-reduce:transition-none";

/** The 52px square: WhatsApp (green glyph) or call (ink glyph). */
export function IconSecondary({
  href,
  kind,
  name,
}: {
  href: string;
  kind: "whatsapp" | "call";
  /** The accessible name: «راسلنا واتساب» / «اتصل بينا». */
  name: string;
}) {
  const whatsapp = kind === "whatsapp";
  return (
    <a
      href={href}
      target={whatsapp ? "_blank" : undefined}
      rel={whatsapp ? "noopener noreferrer" : undefined}
      aria-label={name}
      className={cn(SQUARE_CLS, whatsapp ? "text-bk-success" : "text-bk-ink")}
      data-sticky-secondary="icon"
    >
      {whatsapp ? (
        <WhatsAppIcon shadow={false} className="h-7 w-7" />
      ) : (
        <MaterialIcon name="call" className="text-2xl" />
      )}
    </a>
  );
}

/** The labelled secondary in the soft style: the express form's soft green
 *  tile (WhatsApp) or an outlined ink tile (call). */
export function SoftSecondary({
  href,
  kind,
  label,
  rtl,
}: {
  href: string;
  kind: "whatsapp" | "call";
  label: string;
  rtl: boolean;
}) {
  const whatsapp = kind === "whatsapp";
  return (
    <a
      href={href}
      target={whatsapp ? "_blank" : undefined}
      rel={whatsapp ? "noopener noreferrer" : undefined}
      className={cn(
        "flex min-h-[52px] shrink-0 items-center gap-1.5 rounded-bk-input px-3 font-bk-body text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus",
        whatsapp
          ? "border border-bk-success/25 bg-bk-success/10 text-bk-success"
          : "border border-bk-divider bg-bk-surface text-bk-ink",
        rtl && "flex-row-reverse",
      )}
      data-sticky-secondary="button"
    >
      {whatsapp ? <WhatsAppIcon shadow={false} className="h-6 w-6" /> : <MaterialIcon name="call" className="text-xl" />}
      {label}
    </a>
  );
}
```

- [ ] **Step 4: The render**

Replace the whole of `packages/sections/src/sticky_cta_bar.client.tsx` with:
```tsx
// =====================================================================
// Section — sticky_cta_bar
// =====================================================================
// Sticky bottom CTA bar (mobile only). Renders a primary action button
// plus an optional secondary kind (WhatsApp, call, or none). When
// `show_total` is enabled and the bar is on the cart/checkout page,
// the live cart subtotal is read from `useCart()`. With
// `show_product_price` on a product page, the product's own price sits
// beside the primary button and the bar steps aside while the in-page
// order form's submit button is on screen (no duplicate CTA).
// =====================================================================
// Client half of `sticky_cta_bar` — the component (hooks / browser APIs). The
// schema, defaults and registry entry live in `./sticky_cta_bar.tsx` so the
// definition is server-safe; only this module ships to the browser.
//
// Slice 1f (spec §1.8): `primary_kind: "form_aware"` (label and tap from
// the express form's progress, never a submit), `style: "soft"` (the
// express buttons' look, no ink outline), `secondary_display: "icon"` (a
// 52px WhatsApp square, prefilled with the product). With none of them set
// the markup is today's, byte for byte (_sticky-cta-baseline-snapshot).
// =====================================================================

"use client";

import * as React from "react";
import { resolveI18n } from "@scheniders/shared";
import { ChunkyButton, ChunkyLink, MaterialIcon, WhatsAppIcon } from "./helpers/primitives";
import { useStoreBase } from "./helpers/store-context";
import { formatPrice } from "./helpers/format";
import { useCart } from "./helpers/cart-store";
import { useExpressFormProgress, useExpressOrderStore } from "./helpers/express-order-store";
import { readsRtl } from "./helpers/reading";
import { cn } from "./helpers/utils";
import { resolveTenantWhatsapp, resolveTenantPhone, whatsappDigits } from "./helpers/whatsapp";
import { fs } from "./faq_contact_split.strings";
import { displayNameOf } from "./pdp_express/identity-label";
import type { SectionRenderContext } from "./_types";
import type { Props } from "./sticky_cta_bar";
import { handOffToForm, stickyPrimary, stickyWhatsappHref } from "./sticky_cta_bar.form-aware";
import { SoftPrice, SoftPrimary, SoftSecondary, IconSecondary } from "./sticky_cta_bar.soft";
import { ss } from "./sticky_cta_bar.strings";

const DEFAULT_SCROLL_TARGET_ID = "direct-order";

/** Listens for the in-page order form; `true` while it is on screen.
 *  "submit" watches the form's submit button (SSR + missing target →
 *  `false`, the bar stays visible). "form" watches the whole form and
 *  starts `true` so a first-screen form is never covered on first paint;
 *  a missing target turns it `false` after mount. */
function useFormSubmitVisible(
  targetId: string,
  enabled: boolean,
  mode: "submit" | "form",
): boolean {
  const [visible, setVisible] = React.useState(enabled && mode === "form");
  React.useEffect(() => {
    if (!enabled) return;
    const form = document.getElementById(targetId);
    const target =
      mode === "form"
        ? form
        : document.querySelector<HTMLElement>(
            `#${CSS.escape(targetId)} button[type=submit]`,
          );
    if (!target) {
      if (mode === "form") setVisible(false);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry?.isIntersecting ?? false),
      { threshold: mode === "form" ? 0 : 0.5 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId, enabled, mode]);
  return visible;
}

/** Live product price for the bar: bold current price, compare-at struck
 *  through when the product is on sale. */
function ProductPrice({
  price,
  compareAt,
  locale,
}: {
  price: number;
  compareAt: number | null;
  locale: "ar" | "en" | "ku";
}) {
  const onSale = compareAt != null && compareAt > price;
  return (
    <div
      className="flex flex-col leading-tight pl-1 tabular-nums"
      data-product-price
    >
      {onSale && (
        <s className="font-label text-[11px] text-bk-ink-faint">
          <bdi>{formatPrice(compareAt, locale)}</bdi>
        </s>
      )}
      <span className="font-display font-black text-base whitespace-nowrap">
        <bdi>{formatPrice(price, locale)}</bdi>
      </span>
    </div>
  );
}

export function StickyCtaBarRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const base = useStoreBase();
  const primaryLabel = resolveI18n(props.primary_label_i18n, locale);
  const secondaryLabel = resolveI18n(props.secondary_label_i18n, locale);
  const subtotal = useCart((s) => s.getTotal());
  const itemCount = useCart((s) => s.getItemCount());
  const product = ctx.product;
  const showProductPrice = props.show_product_price === true && !!product;
  const scrollTargetId = props.scroll_target_id || DEFAULT_SCROLL_TARGET_ID;
  const formSubmitVisible = useFormSubmitVisible(
    scrollTargetId,
    showProductPrice,
    props.hide_while ?? "submit",
  );
  const hidden = showProductPrice && formSubmitVisible;
  const soft = props.style === "soft";
  const rtl = readsRtl(locale);

  // form_aware: the express form's progress for this product, and the
  // watch that makes the form mark its receipt and submit for the tap.
  const formAware = props.primary_kind === "form_aware";
  const productId = product?.id ?? "";
  const progress = useExpressFormProgress(productId);
  const watchForm = useExpressOrderStore((s) => s.watchForm);
  React.useEffect(() => {
    if (!formAware || !productId) return;
    return watchForm(productId);
  }, [formAware, productId, watchForm]);

  // Resolve through the canonical store contact so this bar uses the same
  // store-wide WhatsApp number as every other section (with an optional
  // per-bar override).
  const waNumber = resolveTenantWhatsapp(ctx.tenant, props.whatsapp_override);
  const callNumber = resolveTenantPhone(ctx.tenant, props.whatsapp_override);

  const iconSecondary = props.secondary_display === "icon";
  const secondaryHref = (() => {
    if (props.secondary_kind === "whatsapp" && waNumber && iconSecondary && product) {
      // The icon opens the chat with the product named (spec §1.8).
      const message =
        resolveI18n(props.whatsapp_prefill_i18n, locale) || ss("waPrefill", locale);
      return stickyWhatsappHref(waNumber, message.split("{product}").join(displayNameOf(product)));
    }
    if (props.secondary_kind === "whatsapp" && waNumber) {
      return `https://wa.me/${whatsappDigits(waNumber)}`;
    }
    if (props.secondary_kind === "call" && callNumber) {
      return `tel:${callNumber}`;
    }
    return null;
  })();

  const primaryKind = props.primary_kind ?? "link";
  if (!primaryLabel) return null;
  if (primaryKind === "link" && !props.primary_href) return null;
  const primary = formAware ? stickyPrimary(progress, primaryLabel, locale) : null;

  const primaryHref =
    props.primary_href.startsWith("/")
      ? `${base}${props.primary_href}`
      : props.primary_href;

  const scrollToForm = () => {
    const target = document.getElementById(scrollTargetId);
    if (!target) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    target
      .querySelector<HTMLElement>("input, select, textarea")
      ?.focus({ preventScroll: true });
  };

  // The one tap handler for both button kinds: form_aware hands off to the
  // form (never submitting it), scroll_to_form scrolls as it always has.
  const onPrimary = primary ? () => handOffToForm(primary.target, scrollToForm) : scrollToForm;
  const scrolls = primaryKind !== "link";
  const secondaryName =
    props.secondary_kind === "call" ? fs("call", locale) : fs("whatsapp", locale);

  if (soft) {
    return (
      <>
        {/* In-flow spacer so the fixed bar never covers the last section. */}
        <div aria-hidden="true" className="h-20 sm:hidden" />
        <div
          className={cn(
            "fixed inset-x-0 bottom-0 z-40 flex items-center gap-2 border-t border-bk-divider bg-bk-surface px-bk-xs pt-bk-xs sm:hidden",
            rtl && "flex-row-reverse",
            "transition-[transform,opacity] duration-bk-base motion-reduce:transition-none",
            hidden && "pointer-events-none translate-y-full opacity-0",
          )}
          aria-hidden={hidden || undefined}
          inert={hidden || undefined}
          // Clear the iPhone home indicator.
          style={{ paddingBottom: "max(var(--bk-space-xs, 0.5rem), env(safe-area-inset-bottom))" }}
          role="region"
          aria-label={ss("region", locale)}
          data-sticky-style="soft"
        >
          <SoftPrimary
            label={primary?.label ?? primaryLabel}
            sub={primary?.sub ?? null}
            stage={primary?.stage ?? null}
            rtl={rtl}
            href={scrolls ? null : primaryHref}
            onClick={scrolls ? onPrimary : undefined}
          />
          {showProductPrice && product && (
            <SoftPrice
              price={product.price}
              compareAt={product.compare_at_price ?? null}
              locale={locale}
            />
          )}
          {secondaryHref &&
            (iconSecondary ? (
              <IconSecondary
                href={secondaryHref}
                kind={props.secondary_kind === "call" ? "call" : "whatsapp"}
                name={secondaryName}
              />
            ) : (
              <SoftSecondary
                href={secondaryHref}
                kind={props.secondary_kind === "call" ? "call" : "whatsapp"}
                label={secondaryLabel || secondaryName}
                rtl={rtl}
              />
            ))}
        </div>
      </>
    );
  }

  return (
    <>
      {/* In-flow spacer so the fixed bar never covers the last section. */}
      <div aria-hidden="true" className="h-20 sm:hidden" />
    <div
      className={cn(
        "fixed bottom-0 inset-x-0 z-40 sm:hidden backdrop-blur px-bk-xs pt-bk-xs flex items-center gap-bk-xs shadow-[0_-6px_0_0_rgba(26,26,26,0.06)]",
        "transition-[transform,opacity] duration-bk-base motion-reduce:transition-none",
        hidden && "translate-y-full opacity-0 pointer-events-none",
      )}
      aria-hidden={hidden || undefined}
      inert={hidden || undefined}
      style={{
        backgroundColor:
          "color-mix(in srgb, var(--bk-surface, #ffffff) 95%, transparent)",
        borderTop:
          "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
        // Clear the iPhone home indicator.
        paddingBottom:
          "max(var(--bk-space-xs, 0.5rem), env(safe-area-inset-bottom))",
      }}
      role="region"
      aria-label={ss("region", locale)}
    >
      {props.show_total && (
        <div className="flex flex-col leading-tight pl-1">
          <span className="font-label font-bold text-[10px] uppercase tracking-[0.2em] text-bk-ink-faint">
            {locale !== "en"
              ? `${itemCount} عنصر`
              : `${itemCount} item${itemCount === 1 ? "" : "s"}`}
          </span>
          <span className="font-display font-black text-base">
            <bdi>{formatPrice(subtotal, locale)}</bdi>
          </span>
        </div>
      )}
      {showProductPrice && product && (
        <ProductPrice
          price={product.price}
          compareAt={product.compare_at_price ?? null}
          locale={locale}
        />
      )}
      {secondaryHref && iconSecondary && (
        <IconSecondary
          href={secondaryHref}
          kind={props.secondary_kind === "call" ? "call" : "whatsapp"}
          name={secondaryName}
        />
      )}
      {secondaryHref && !iconSecondary && (
        // A styled anchor — not a <button> nested in an <a> (invalid HTML,
        // double tab stop).
        <ChunkyLink
          href={secondaryHref}
          target={props.secondary_kind === "whatsapp" ? "_blank" : undefined}
          rel={
            props.secondary_kind === "whatsapp"
              ? "noopener noreferrer"
              : undefined
          }
          aria-label={
            secondaryLabel ||
            (props.secondary_kind === "call"
              ? locale !== "en"
                ? "اتصال"
                : "Call"
              : locale !== "en"
                ? "واتساب"
                : "WhatsApp")
          }
          bg="success"
          size="md"
        >
          {props.secondary_kind === "whatsapp" ? (
            <WhatsAppIcon className="w-5 h-5" />
          ) : (
            <MaterialIcon name="call" />
          )}
          {secondaryLabel}
        </ChunkyLink>
      )}
      {scrolls ? (
        <ChunkyButton
          type="button"
          bg="pink"
          size="md"
          className="flex-1"
          onClick={onPrimary}
        >
          {primary?.label ?? primaryLabel}
          {primary?.sub && <span className="text-xs">{primary.sub}</span>}
        </ChunkyButton>
      ) : (
        <ChunkyLink href={primaryHref} bg="pink" size="md" className="flex-1">
          {primaryLabel}
        </ChunkyLink>
      )}
    </div>
    </>
  );
}
```
What changed against today's file, for the reviewer: the header's slice-1f paragraph; seven imports; `soft`, `rtl`, the progress read and the `watchForm` effect (hooks, all before the early returns); the icon's prefilled `href`; `primary` from `stickyPrimary`; `onPrimary`, `scrolls`, `secondaryName`; the whole `if (soft) { … }` branch; in the chunky render the landmark name now reads `ss("region", locale)` (the same three strings), the icon branch before the `ChunkyLink`, and the scroll button calls `onPrimary` with `primary?.label ?? primaryLabel` (+ the small line when form-aware). With none of the 1f props set every rendered byte is today's (Step 5's baseline run proves it).

- [ ] **Step 5: Run the new tests, the bar's baseline, the store-wired express tests**

```bash
CI=true pnpm exec vitest run packages/sections/src/_sticky-cta-soft.test.tsx packages/sections/src/_sticky-cta-form-aware-dom.test.tsx
CI=true pnpm exec vitest run packages/sections/src/_sticky-cta-baseline-snapshot.test.tsx packages/sections/src/_chrome-baseline-snapshot.test.tsx packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_pdp-express-progress.test.tsx packages/sections/src/RenderSection.overlay.test.tsx packages/sections/src/_no-hardcoded-white.test.tsx
```
Expected: `Test Files  2 passed (2)`, `Tests  15 passed (15)`; then every file passes with no `written`/`updated`/`obsolete` line.

- [ ] **Step 6: Type gate, then commit**

Run the sections type gate. Expected: no output.
```bash
git branch --show-current
git add packages/sections/src/sticky_cta_bar.soft.tsx packages/sections/src/sticky_cta_bar.client.tsx packages/sections/src/_sticky-cta-soft.test.tsx packages/sections/src/_sticky-cta-form-aware-dom.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): smart sticky bar — soft style, WhatsApp square prefilled with the product, form-aware states (F04)" -m "Untouched → «اطلب الآن» focuses the phone; partial → «كمّل طلبك / باقي {field}» focuses that field; complete → «ثبّت طلبي» shows the receipt and focuses the submit, never submitting (D6). Chunky renders byte-identical." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: The Arabic copy lint over the chrome tables and the redesign's copy

**Files:**
- Test: `packages/sections/src/_arabic-copy-lint.test.ts`

This is the guard itself; it passes on first run because Tasks 1–10 already follow the term sheet and the allowlists freeze what does not. Step 3 proves it bites.

- [ ] **Step 1: Write the lint**

Create `packages/sections/src/_arabic-copy-lint.test.ts`:
```ts
// =====================================================================
// Arabic copy lint (F12) — the term sheet, applied
// =====================================================================
// 1. Chrome: the `ar` value of every table in STRING_TABLE_FILES, plus the
//    shared contact-line sentences. What breaks a rule today is frozen in
//    CHROME_ALLOWLIST, each entry with its reason; the list may only
//    shrink (the test fails on a new hit AND on an entry that no longer
//    hits, so a fix must also delete its entry).
// 2. Tenant: every Arabic string the PDP redesign writes into
//    scheniders-iraq's draft (`_pdp-redesign-fixtures.ts`, which the
//    migrations are checked against). The "before" copies (IRAQ_DRAFT_*)
//    are not ours to lint, and the merged inputs (IRAQ_REDESIGN_*) include
//    them. Customers' own words are quoted verbatim and never linted.
// 3. One name per action (COPY_ACTIONS): every place the page offers an
//    action uses the same words.
// =====================================================================

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTACT_LINE_STRINGS } from "@scheniders/shared";
import { COPY_ACTIONS, lintArabicCopy, type CopyRuleId } from "./_copy-terms";
import { STRING_TABLE_FILES, stringTableEntries } from "./_string-tables";
import * as REDESIGN from "./_pdp-redesign-fixtures";
import { EXPRESS_IRAQ_DRAFT_PDP_PROPS, IRAQ_DRAFT_STICKY_PROPS } from "./_pdp-fixtures";
import { EXPRESS_STRINGS } from "./pdp_express/strings";
import { FAQ_STRINGS } from "./faq_contact_split.strings";
import { STICKY_STRINGS } from "./sticky_cta_bar.strings";

/** "<file> <key>: <rule>" for every hit. */
type HitLine = string;

const CHANGES_OTHER_TENANTS = "changing it alters other tenants' markup";

/** Today's chrome that breaks a rule, frozen. May only shrink. */
const CHROME_ALLOWLIST: Record<HitLine, string> = {
  "pdp_direct_order.client.tsx orderUnconfirmed: whatsapp-without-al": `«بالواتساب»; ${CHANGES_OTHER_TENANTS}`,
  "pdp_direct_order.client.tsx sendOnWhatsapp: whatsapp-without-al": `«بالواتساب»; ${CHANGES_OTHER_TENANTS}`,
  "pdp_express/strings.ts addressPlaceholder: latin-digits": `«شارع ١٤ رمضان»; ${CHANGES_OTHER_TENANTS}`,
  "pdp_express/strings.ts reviews: count-slot-singular": `the rating chip's «{count} تقييم»; ${CHANGES_OTHER_TENANTS}`,
  "product_reviews/strings.ts countMany: count-slot-singular": `the quiet layout's «{count} تقييم»; ${CHANGES_OTHER_TENANTS}`,
  "product_reviews/strings.ts starRow: count-slot-singular": `the bars' «{count} تقييم»; ${CHANGES_OTHER_TENANTS}`,
};

/** A `formatCount` forms set is <base>One / Two / Few / Many in one table:
 *  its Many form is the correct «{count} تقييم» for 11 and up. */
function isManyOfFormsSet(key: string, keys: ReadonlySet<string>): boolean {
  if (!key.endsWith("Many")) return false;
  const base = key.slice(0, -"Many".length);
  return ["One", "Two", "Few"].every((form) => keys.has(`${base}${form}`));
}

function chromeHits(): HitLine[] {
  const hits: HitLine[] = [];
  const add = (where: string, key: string, ar: string, skip: (rule: CopyRuleId) => boolean) => {
    for (const hit of lintArabicCopy(ar, "chrome")) {
      if (!skip(hit.rule)) hits.push(`${where} ${key}: ${hit.rule}`);
    }
  };
  for (const file of STRING_TABLE_FILES) {
    const entries = stringTableEntries(readFileSync(new URL(`./${file}`, import.meta.url), "utf8"));
    const keys = new Set(entries.map((e) => e.key));
    for (const e of entries) {
      if (e.ar === null) continue;
      add(file, e.key, e.ar, (rule) => rule === "count-slot-singular" && isManyOfFormsSet(e.key, keys));
    }
  }
  for (const [key, entry] of Object.entries(CONTACT_LINE_STRINGS)) {
    add("@scheniders/shared contact-line", key, entry.ar, () => false);
  }
  return hits.sort();
}

/** Customers' own words, quoted verbatim (never corrected), by fixture path. */
const VERBATIM: readonly { path: RegExp; why: string }[] = [
  { path: /^SLICE_1C_PDP_PATCH\.scent_card\.quote_picks\.\d+\.text$/, why: "1c: a review clause, verbatim" },
  {
    path: /^SLICE_1D_GALLERY_PATCH\.images\.\d+\.(?:alt_i18n\.ar|quote_i18n\.ar|author)$/,
    why: "1d: TikTok comments and their authors, verbatim (to-do 4)",
  },
  { path: /^SLICE_1E_REVIEWS_PATCH\.review_curation\.\d+\.highlight$/, why: "1e: review key phrases, verbatim" },
];

/** Tenant copy that breaks a rule and is waiting on Ali (to-do 10). */
const TENANT_ALLOWLIST: Record<HitLine, string> = {
  "SLICE_1E_FAQ_PATCH.contact.sub_i18n.ar: whatsapp-without-al":
    "spec §1.7's «نفس الرقم للاتصال والواتساب»; Ali picks it or «نفس الرقم للاتصال وواتساب» (to-do 10)",
};

const ARABIC = /[ء-ي]/;

function walk(value: unknown, path: string, out: { path: string; text: string }[]): void {
  if (typeof value === "string") {
    if (ARABIC.test(value)) out.push({ path, text: value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, `${path}.${i}`, out));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`, out);
  }
}

function tenantHits(): HitLine[] {
  const texts: { path: string; text: string }[] = [];
  for (const [name, value] of Object.entries(REDESIGN)) {
    if (name.startsWith("IRAQ_DRAFT_") || name.startsWith("IRAQ_REDESIGN_")) continue;
    walk(value, name, texts);
  }
  return texts
    .filter((t) => !VERBATIM.some((v) => v.path.test(t.path)))
    .flatMap((t) => lintArabicCopy(t.text, "tenant").map((h) => `${t.path}: ${h.rule}`))
    .sort();
}

describe("Arabic copy lint — chrome", () => {
  it("reads every table on the list", () => {
    for (const file of STRING_TABLE_FILES) {
      const entries = stringTableEntries(readFileSync(new URL(`./${file}`, import.meta.url), "utf8"));
      expect(entries.filter((e) => e.ar !== null).length, file).toBeGreaterThan(0);
    }
  });

  it("only the frozen allowlist breaks the term sheet", () => {
    expect(chromeHits()).toEqual(Object.keys(CHROME_ALLOWLIST).sort());
  });

  it("every allowlist entry says why", () => {
    for (const reason of Object.values(CHROME_ALLOWLIST)) expect(reason).toContain(CHANGES_OTHER_TENANTS);
  });
});

describe("Arabic copy lint — the redesign's tenant copy", () => {
  it("only the copy waiting on Ali breaks the term sheet", () => {
    expect(tenantHits()).toEqual(Object.keys(TENANT_ALLOWLIST).sort());
  });

  it("the verbatim paths still exist (a renamed fixture would silently lint customers' words)", () => {
    const texts: { path: string; text: string }[] = [];
    for (const [name, value] of Object.entries(REDESIGN)) walk(value, name, texts);
    for (const v of VERBATIM) expect(texts.some((t) => v.path.test(t.path)), v.why).toBe(true);
  });
});

describe("one name per action", () => {
  it("each action uses its one name wherever the page offers it", () => {
    expect(IRAQ_DRAFT_STICKY_PROPS.primary_label_i18n.ar).toBe(COPY_ACTIONS.startOrder);
    expect(EXPRESS_IRAQ_DRAFT_PDP_PROPS.submit_label_i18n.ar).toBe(COPY_ACTIONS.placeOrder);
    expect(STICKY_STRINGS.continueOrder.ar).toBe(COPY_ACTIONS.continueOrder);
    expect(FAQ_STRINGS.whatsapp.ar).toBe(COPY_ACTIONS.whatsapp);
    expect(FAQ_STRINGS.call.ar).toBe(COPY_ACTIONS.call);
    expect(EXPRESS_STRINGS.saveNumber.ar).toBe(COPY_ACTIONS.saveNumber);
    expect(REDESIGN.SLICE_1D_ACCORDION_PATCH.heading_i18n.ar).toBe(COPY_ACTIONS.guarantee);
  });
});
```

- [ ] **Step 2: Run it**

```bash
CI=true pnpm exec vitest run packages/sections/src/_arabic-copy-lint.test.ts
```
Expected: `Tests  6 passed (6)`. (Pre-run: chrome hits are exactly the six `CHROME_ALLOWLIST` lines over 13 tables + the contact line; the tenant walk reads 85 Arabic strings from 12 exports and finds only 1e's «والواتساب».)

- [ ] **Step 3: Prove it bites (then undo)**

```bash
sed -i '' 's/  continueOrder: { en: "Finish your order", ar: "كمّل طلبك",/  continueOrder: { en: "Finish your order", ar: "كمّل طلبك بالواتساب",/' packages/sections/src/sticky_cta_bar.strings.ts
sed -i '' 's/  sub_i18n: { ar: "حقك مكتوب هنا قبل ما تطلب"/  sub_i18n: { ar: "حق العملاء مكتوب هنا قبل ما تطلب"/' packages/sections/src/_pdp-redesign-fixtures.ts
CI=true pnpm exec vitest run packages/sections/src/_arabic-copy-lint.test.ts 2>&1 | grep -E "Tests |sticky_cta_bar.strings.ts continueOrder|SLICE_1D_ACCORDION_PATCH.sub_i18n"
git checkout -- packages/sections/src/sticky_cta_bar.strings.ts packages/sections/src/_pdp-redesign-fixtures.ts
git status --porcelain packages/sections/src
```
Expected: `Tests  3 failed | 3 passed (6)` (the chrome allowlist test, the tenant test, and the action-name test — «كمّل طلبك بالواتساب» is no longer the one name), with the new hit lines `sticky_cta_bar.strings.ts continueOrder: whatsapp-without-al` and `SLICE_1D_ACCORDION_PATCH.sub_i18n.ar: customer-word` in the diff; after the checkout, `git status` prints only `?? packages/sections/src/_arabic-copy-lint.test.ts`.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add packages/sections/src/_arabic-copy-lint.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "test(sections): Arabic copy lint (F12) over the chrome tables and the redesign's tenant copy" -m "Frozen allowlists that may only shrink: six chrome strings other tenants render, and 1e's «نفس الرقم للاتصال والواتساب» pending Ali (to-do 10). Customers' quoted words are never linted." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The 1f draft-config migration (written, replayed locally, dry-run; NOT applied)

**Files:**
- Create: `packages/supabase/migrations/<STAMP>_scheniders_iraq_pdp_redesign_1f_draft.sql`
- Scratch: `tmp/pdp-1f/dryrun-1f.sql` (gitignored), `${TMPDIR:-/tmp}/pdp-1f-pglite/` (outside the repo)

All live access in this task is **read-only**. The JSON in the `$json$` block is exactly what Task 13's fixture holds (`SLICE_1F_STICKY_PATCH`); Task 13's mirror test proves it.

- [ ] **Step 1: Pick the timestamp**

```bash
STAMP=$(date -u +%Y%m%d%H%M%S); echo $STAMP
ls packages/supabase/migrations | grep -E '^[0-9]{14}_' | sort | tail -1
(cd packages && supabase db query --linked "SELECT max(version) FROM supabase_migrations.schema_migrations" -o csv)
```
Expected: `$STAMP` sorts after the last listed file (1e's `<1e stamp>_scheniders_iraq_pdp_redesign_1e_draft.sql`) and after the history's max version (1e's stamp, itself after `20261030072247`). Keep `$STAMP` in this shell for this task.

- [ ] **Step 2: Write the migration**

Create `packages/supabase/migrations/${STAMP}_scheniders_iraq_pdp_redesign_1f_draft.sql` (if Task 0 Step 4 read other guard values, put those in `c_expected_draft_md5` / `c_expected_rev` and the header's guard c. and Rollback lines):

```sql
-- =====================================================================
-- scheniders-iraq PDP redesign, slice 1f — DRAFT config only
-- =====================================================================
-- Spec: docs/superpowers/specs/2026-10-27-pdp-lower-page-redesign-design.md
-- §1.8, §1.9, D4, D6, D14.
--
-- Writes ONLY tenants.store_config_v2_draft (and updated_at) for slug
-- scheniders-iraq. store_config_v2 (published) is never written; its md5
-- is captured before the write and asserted equal after it.
--
-- What it changes in the draft's product page, the base merged with `||`:
--   sticky_cta_bar d874d9d6: primary_kind "form_aware" (the bar follows the
--   express form: «اطلب الآن» → the first empty field; «كمّل طلبك / باقي …»
--   → the first missing field; «ثبّت طلبي» → the receipt and the submit's
--   focus, never a submit, D6), style "soft" (the express buttons' look, no
--   ink outline), secondary_display "icon" (a 52px WhatsApp square that
--   opens the chat with «هلا، أريد أطلب {product}»). hide_while "form" and
--   show_product_price stay.
--
-- Guards, in order, in one transaction:
--   a. no tenant / no product page / the sticky section missing
--      -> RAISE NOTICE and no write (a fresh database replays this as a no-op);
--   b. the transform applied to the current draft changes nothing
--      -> RAISE NOTICE 'already applied' and no write (a second run is a no-op);
--   c. md5(store_config_v2_draft::text) must be 89b6499d703c80771a38ef7195a5bc78
--      and store_config_rev must be 38 (the draft after the 1e migration)
--      -> else RAISE EXCEPTION: someone edited or published since, so
--      re-read and regenerate this file;
--   d. md5(store_config_v2::text) is equal before and after the write.
--
-- Applied ONLY after the code that reads these props is deployed:
--   supabase db query --linked -f <this file>
--   supabase migration repair --status applied <version>
-- Never `supabase db push`.
--
-- Rollback (read at draft md5 89b6499d703c80771a38ef7195a5bc78): in the
--   sticky_cta_bar d874d9d6 base set primary_kind back to "scroll_to_form"
--   and remove style and secondary_display with `-`. The base before this
--   file (base md5 08921c992d5563e08afa97c093735301):
--     {"hide_while": "form", "show_total": false, "primary_href":
--      "/checkout", "primary_kind": "scroll_to_form", "secondary_kind":
--      "whatsapp", "show_product_price": true, "primary_label_i18n": {"ar":
--      "اطلب الآن", "en": "Order now"}, "secondary_label_i18n": {"ar":
--      "واتساب", "en": "WhatsApp"}} (IRAQ_DRAFT_STICKY_PROPS in
--     packages/sections/src/_pdp-fixtures.ts).
-- =====================================================================

DO $mig$
DECLARE
  c_slug constant text := 'scheniders-iraq';
  c_expected_rev constant bigint := 38;
  c_expected_draft_md5 constant text := '89b6499d703c80771a38ef7195a5bc78';
  c_sticky_id constant text := 'd874d9d6-dede-40e5-bcf8-aceb51d11036';
  -- sticky_patch:begin
  c_sticky_patch constant jsonb := $json${
    "primary_kind": "form_aware",
    "style": "soft",
    "secondary_display": "icon"
  }$json$;
  -- sticky_patch:end
  v_tenant_id uuid;
  v_rev bigint;
  v_draft jsonb;
  v_target jsonb;
  v_pub_md5 text;
  v_page_idx int;
  v_sections jsonb;
  v_new_sections jsonb;
BEGIN
  SELECT id, store_config_rev, store_config_v2_draft, md5(store_config_v2::text)
    INTO v_tenant_id, v_rev, v_draft, v_pub_md5
    FROM public.tenants
   WHERE slug = c_slug
     FOR UPDATE;
  IF NOT FOUND OR v_draft IS NULL THEN
    RAISE NOTICE 'pdp redesign 1f: no tenant % with a draft, nothing written', c_slug;
    RETURN;
  END IF;

  SELECT (p.ord - 1)::int INTO v_page_idx
    FROM jsonb_array_elements(v_draft->'pages') WITH ORDINALITY AS p(page, ord)
   WHERE p.page->>'page_id' = 'product';
  IF v_page_idx IS NULL THEN
    RAISE NOTICE 'pdp redesign 1f: % has no product page, nothing written', c_slug;
    RETURN;
  END IF;
  v_sections := v_draft->'pages'->v_page_idx->'sections';

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_sections) AS s(sec) WHERE s.sec->>'id' = c_sticky_id
  ) THEN
    RAISE NOTICE 'pdp redesign 1f: product page lacks section %, nothing written', c_sticky_id;
    RETURN;
  END IF;

  SELECT jsonb_agg(
           CASE x.sec->>'id'
             WHEN c_sticky_id
               THEN jsonb_set(x.sec, '{base}', coalesce(x.sec->'base', '{}'::jsonb) || c_sticky_patch)
             ELSE x.sec
           END
           ORDER BY x.ord
         )
    INTO v_new_sections
    FROM jsonb_array_elements(v_sections) WITH ORDINALITY AS x(sec, ord);

  v_target := jsonb_set(v_draft, ARRAY['pages', v_page_idx::text, 'sections'], v_new_sections);

  IF v_target = v_draft THEN
    RAISE NOTICE 'pdp redesign 1f: already applied, nothing written';
    RETURN;
  END IF;

  IF md5(v_draft::text) <> c_expected_draft_md5 THEN
    RAISE EXCEPTION 'pdp redesign 1f: draft md5 is %, expected % (edited since it was read); re-read and regenerate',
      md5(v_draft::text), c_expected_draft_md5;
  END IF;
  IF v_rev <> c_expected_rev THEN
    RAISE EXCEPTION 'pdp redesign 1f: store_config_rev is %, expected % (published since it was read); re-read and regenerate',
      v_rev, c_expected_rev;
  END IF;

  UPDATE public.tenants
     SET store_config_v2_draft = v_target,
         updated_at = now()
   WHERE id = v_tenant_id;

  IF (SELECT md5(store_config_v2::text) FROM public.tenants WHERE id = v_tenant_id) <> v_pub_md5 THEN
    RAISE EXCEPTION 'pdp redesign 1f: the published config changed during the write';
  END IF;

  RAISE NOTICE 'pdp redesign 1f: draft md5 % -> %', c_expected_draft_md5, md5(v_target::text);
END
$mig$;
```

What is in it, for the reviewer: one patch, on the sticky bar only (the spec's slice table gives 1f `d874d9d6` alone); three keys, all spec §1.8's draft; no `whatsapp_prefill_i18n` (the chrome default «هلا، أريد أطلب {product}» speaks until Ali writes his own); `hide_while: "form"`, `show_product_price: true`, the start label «اطلب الآن» and `secondary_kind: "whatsapp"` stay from the base. The pdp_direct_order base is untouched: its `submit_label_i18n` «ثبّت طلبي» is what the complete state shows.

- [ ] **Step 3: Copy the live row read-only and install PGlite outside the repo**

```bash
mkdir -p "${TMPDIR:-/tmp}/pdp-1f-pglite"
(cd packages && supabase db query --linked "SELECT store_config_v2_draft::text AS draft, store_config_v2::text AS pub FROM tenants WHERE slug='scheniders-iraq'" -o json) > "${TMPDIR:-/tmp}/pdp-1f-pglite/live.json"
cd "${TMPDIR:-/tmp}/pdp-1f-pglite"
node -e 'const fs=require("fs");const r=JSON.parse(fs.readFileSync("live.json")).rows[0];fs.writeFileSync("draft.json",r.draft);fs.writeFileSync("pub.json",r.pub);console.log(r.draft.length, r.pub.length)'
echo '{"name":"pdp-1f-pglite","private":true,"type":"module"}' > package.json
pnpm add @electric-sql/pglite@0.2.17
cd /Users/ali/scheniders-mono-pdp
```
Expected: two lengths (the post-1e draft is longer than 1d's 68564; the published one is `60860`), then `+ @electric-sql/pglite 0.2.17`.

- [ ] **Step 4: Write the replay harness**

Create `${TMPDIR:-/tmp}/pdp-1f-pglite/harness-draft.mjs`:

```js
// Replays the 1f draft-config migration against a local Postgres (PGlite)
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
    st.sec->'base'->>'primary_kind' AS primary_kind,
    st.sec->'base'->>'style' AS style,
    st.sec->'base'->>'secondary_display' AS secondary_display,
    st.sec->'base'->>'hide_while' AS hide_while,
    st.sec->'base'->>'show_product_price' AS show_price,
    st.sec->>'enabled' AS enabled,
    r.sec->'base'->>'layout' AS reviews_layout,
    d.sec->'base'->>'identity_rating' AS identity_rating,
    md5((d.sec->'base'->'scent_card'->'product_copy')::text) AS copy_md5
  FROM public.tenants t,
       jsonb_array_elements(t.store_config_v2_draft->'pages') p(page),
       jsonb_array_elements(p.page->'sections') st(sec),
       jsonb_array_elements(p.page->'sections') r(sec),
       jsonb_array_elements(p.page->'sections') d(sec)
  WHERE p.page->>'page_id' = 'product'
    AND st.sec->>'id' = 'd874d9d6-dede-40e5-bcf8-aceb51d11036'
    AND r.sec->>'id' = '1ab3ee76-902a-42c8-8c26-e6d87b3fd6fc'
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
node "${TMPDIR:-/tmp}/pdp-1f-pglite/harness-draft.mjs" "packages/supabase/migrations/${STAMP}_scheniders_iraq_pdp_redesign_1f_draft.sql" "${TMPDIR:-/tmp}/pdp-1f-pglite/draft.json" "${TMPDIR:-/tmp}/pdp-1f-pglite/pub.json" 38
```
Expected (pre-run 2026-10-30 on the live post-1d row with 1e's planned migration applied on PGlite first — the state Task 0 confirms live):
```
before {"d":"89b6499d703c80771a38ef7195a5bc78","p":"a6f87ba3181b0e94f41ba4a700de257b","bumped":false}
draft before {"order_":"pdp_direct_order,image_gallery,product_reviews,accordion_richtext,faq_contact_split,product_grid,trust_badge_row,sticky_cta_bar","primary_kind":"scroll_to_form","style":null,"secondary_display":null,"hide_while":"form","show_price":"true","enabled":"true","reviews_layout":"highlights","identity_rating":"summary_link","copy_md5":"523744df04f3acb3e6983ddb422d3266"}
first run: ok ["pdp redesign 1f: draft md5 89b6499d703c80771a38ef7195a5bc78 -> b8c9098089d3cc524bfe2a1aecbac9e7"]
after first {"d":"b8c9098089d3cc524bfe2a1aecbac9e7","p":"a6f87ba3181b0e94f41ba4a700de257b","bumped":true}
draft after {"order_":"pdp_direct_order,image_gallery,product_reviews,accordion_richtext,faq_contact_split,product_grid,trust_badge_row,sticky_cta_bar","primary_kind":"form_aware","style":"soft","secondary_display":"icon","hide_while":"form","show_price":"true","enabled":"true","reviews_layout":"highlights","identity_rating":"summary_link","copy_md5":"523744df04f3acb3e6983ddb422d3266"}
second run: ok ["pdp redesign 1f: already applied, nothing written"]
after second {"d":"b8c9098089d3cc524bfe2a1aecbac9e7","p":"a6f87ba3181b0e94f41ba4a700de257b","bumped":true}
edited draft: ERROR pdp redesign 1f: draft md5 is ab06b72b92d13761c017cd6574607030, expected 89b6499d703c80771a38ef7195a5bc78 (edited since it was read); re-read and regenerate
edited draft state {"d":"ab06b72b92d13761c017cd6574607030","p":"a6f87ba3181b0e94f41ba4a700de257b","bumped":false}
published since: ERROR pdp redesign 1f: store_config_rev is 39, expected 38 (published since it was read); re-read and regenerate
empty database: ok ["pdp redesign 1f: no tenant scheniders-iraq with a draft, nothing written"]
```
This covers §1.10's data checks: the published md5 `p` never moves; `updated_at` is bumped only by a real write; a second run is a no-op; an edited draft or a publish since the read aborts; an empty database is a no-op. The section order (D1 since 1b), 1e's reviews layout and identity rating, and 1c's `product_copy` (`523744df…`, the go-live file's guard) are untouched. If Task 0 pinned other values, the md5s here differ the same way; the pattern must not.

- [ ] **Step 6: Dry run on the live row (a SELECT, writes nothing)**

Create `tmp/pdp-1f/dryrun-1f.sql`:

```sql
-- Read-only dry run of <STAMP>_scheniders_iraq_pdp_redesign_1f_draft.sql:
-- the same transform as a SELECT. Writes nothing.
WITH c AS (
  SELECT
    'd874d9d6-dede-40e5-bcf8-aceb51d11036'::text AS sticky_id,
    $json${
      "primary_kind": "form_aware",
      "style": "soft",
      "secondary_display": "icon"
    }$json$::jsonb AS sticky_patch
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
             WHEN c.sticky_id THEN jsonb_set(x.sec, '{base}', coalesce(x.sec->'base', '{}'::jsonb) || c.sticky_patch)
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
  md5(t.draft::text) = '89b6499d703c80771a38ef7195a5bc78' AS draft_md5_ok,
  md5(target.draft::text) AS target_md5
FROM t, target;
```
```bash
grep -ciE "\b(update|insert|delete|alter|drop|create)\b" tmp/pdp-1f/dryrun-1f.sql
(cd packages && supabase db query --linked -f ../tmp/pdp-1f/dryrun-1f.sql -o csv)
```
Expected: `0` (no write keyword), then:
```
rev_ok,draft_md5_ok,target_md5
true,true,b8c9098089d3cc524bfe2a1aecbac9e7
```
`target_md5` equals the replay's `after first`: the SELECT and the migration compute the same draft. (Pre-run: the same file run on PGlite over the post-1e copy printed exactly this row; run live on 2026-10-30, before 1e was applied, it printed `true,false,67c319875266552e42ffacb389b7a1b7` — the guard doing its job.)

- [ ] **Step 7: Commit the migration (not applied)**

```bash
git branch --show-current
git add "packages/supabase/migrations/${STAMP}_scheniders_iraq_pdp_redesign_1f_draft.sql"
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "chore(db): scheniders-iraq PDP redesign 1f draft config (not applied)" -m "Smart sticky bar: primary_kind form_aware, style soft, secondary_display icon. Applied with supabase db query --linked -f only after the code is live; draft only, guarded on draft md5 89b6499d… and store_config_rev 38." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Redesign fixtures carry 1f; the mirror; reviewed snapshot update

**Files:**
- Modify: `packages/sections/src/_pdp-redesign-fixtures.ts`
- Modify: `packages/sections/src/_pdp-redesign-snapshot.test.tsx`
- Modify: `packages/sections/src/__snapshots__/_pdp-redesign-snapshot.test.tsx.snap` (vitest `-u`, this file only)
- Scratch: `tmp/pdp-1f/snapcheck.mjs`, `tmp/pdp-1f/sticky-base.json`

This task is its own commit: the snapshot change is reviewed apart from the code.

- [ ] **Step 1: Add the 1f data to the fixtures**

In `packages/sections/src/_pdp-redesign-fixtures.ts`, replace (1e's import block, Task 0 Step 3):
```ts
import type { Tenant } from "./types";
import { EXPRESS_IRAQ_DRAFT_PDP_PROPS, fixtureTenant } from "./_pdp-fixtures";
```
with:
```ts
import type { Props as StickyProps } from "./sticky_cta_bar";
import type { Tenant } from "./types";
import { EXPRESS_IRAQ_DRAFT_PDP_PROPS, IRAQ_DRAFT_STICKY_PROPS, fixtureTenant } from "./_pdp-fixtures";
```
Append to the end of the file (after 1e's `IRAQ_REDESIGN_PDP_PROPS`; `jsonbMerge` is 1d's helper in this file):
```ts

/** Slice 1f: the keys the 1f draft migration merges into sticky_cta_bar's
 *  base: the form-aware primary (never a submit, D6), the express form's
 *  soft button look, and the 52px WhatsApp square. hide_while "form" and
 *  the product price stay from the base. */
export const SLICE_1F_STICKY_PATCH = {
  primary_kind: "form_aware",
  style: "soft",
  secondary_display: "icon",
} satisfies Partial<StickyProps>;

/** The draft sticky_cta_bar after slice 1f (unparsed, as stored). The base
 *  is IRAQ_DRAFT_STICKY_PROPS (read 2026-10-30, base md5
 *  08921c992d5563e08afa97c093735301): 1b–1e never touched it. */
export const IRAQ_REDESIGN_STICKY_INPUT = jsonbMerge(IRAQ_DRAFT_STICKY_PROPS, SLICE_1F_STICKY_PATCH);
```

- [ ] **Step 2: Check the fixture's sticky base equals the live one**

```bash
(cd packages && supabase db query --linked "SELECT s.sec->'base' AS base FROM tenants t, jsonb_array_elements(t.store_config_v2_draft->'pages') p(page), jsonb_array_elements(p.page->'sections') s(sec) WHERE t.slug='scheniders-iraq' AND p.page->>'page_id'='product' AND s.sec->>'id'='d874d9d6-dede-40e5-bcf8-aceb51d11036'" -o json) > tmp/pdp-1f/sticky-base.json
cat > packages/sections/src/zz-sticky-base-check.test.ts <<'TS'
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { IRAQ_DRAFT_STICKY_PROPS } from "./_pdp-fixtures";
it("the fixture sticky base equals the live draft's", () => {
  const rows = JSON.parse(readFileSync("../../tmp/pdp-1f/sticky-base.json", "utf8")).rows;
  expect(rows).toHaveLength(1);
  expect(IRAQ_DRAFT_STICKY_PROPS).toEqual(rows[0].base);
});
TS
(cd packages/sections && CI=true pnpm exec vitest run src/zz-sticky-base-check.test.ts)
rm packages/sections/src/zz-sticky-base-check.test.ts
```
Expected: `Tests  1 passed (1)` (pre-run on the live row, 2026-10-30). The throwaway test is deleted right after (never staged).

- [ ] **Step 3: Extend the redesign snapshot test**

In `packages/sections/src/_pdp-redesign-snapshot.test.tsx` (as 1e left it):

Replace:
```ts
import product_reviews from "./product_reviews";
```
with:
```ts
import product_reviews from "./product_reviews";
import sticky_cta_bar from "./sticky_cta_bar";
```
Replace:
```ts
  IRAQ_REDESIGN_REVIEWS_INPUT,
  IRAQ_REDESIGN_TENANT,
```
with:
```ts
  IRAQ_REDESIGN_REVIEWS_INPUT,
  IRAQ_REDESIGN_STICKY_INPUT,
  IRAQ_REDESIGN_TENANT,
```
Replace:
```ts
  SLICE_1E_REVIEWS_PATCH,
} from "./_pdp-redesign-fixtures";
```
with:
```ts
  SLICE_1E_REVIEWS_PATCH,
  SLICE_1F_STICKY_PATCH,
} from "./_pdp-redesign-fixtures";
```
Replace:
```ts
  it("the patched props satisfy the schema unchanged", () => {
```
with:
```ts
  it("slice 1f sticky_cta_bar patch", () => {
    const sql1f = migrationSql("scheniders_iraq_pdp_redesign_1f_draft");
    expect(migrationJson(sql1f, "sticky_patch")).toEqual(SLICE_1F_STICKY_PATCH);
  });

  it("the 1f sticky bar parses to exactly what is stored, still hidden while the form shows", () => {
    const parsed = sticky_cta_bar.schema.parse(IRAQ_REDESIGN_STICKY_INPUT);
    expect(parsed).toEqual(IRAQ_REDESIGN_STICKY_INPUT);
    expect(parsed.hide_while).toBe("form");
    expect(parsed.show_product_price).toBe(true);
  });

  it("the patched props satisfy the schema unchanged", () => {
```
Append to the end of the file:
```tsx

describe("sticky_cta_bar — redesign draft (slice 1f)", () => {
  function renderBar(locale: LocaleCode): string {
    return renderToStaticMarkup(
      <StoreBaseProvider base="/s/fixture-store">
        <sticky_cta_bar.render
          props={sticky_cta_bar.schema.parse(IRAQ_REDESIGN_STICKY_INPUT)}
          ctx={productCtx(wayferProduct, { tenant: IRAQ_REDESIGN_TENANT, runtime: { ...productRuntime, locale } })}
        />
      </StoreBaseProvider>,
    );
  }

  it.each(["ar", "en"] as const)("sticky bar, %s", (locale) => {
    expect(renderBar(locale)).toMatchSnapshot();
  });

  it("soft: no ink outline, no colour literal, no dir; yellow only on the primary", () => {
    const html = renderBar("ar");
    expect(html).not.toContain("--bk-border-thickness");
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgba?\(/);
    expect(html).not.toContain(' dir="');
    expect(html.split("bg-bk-primary ").length - 1).toBe(1);
  });
});
```

- [ ] **Step 4: Type gate, then run it in CI mode to see exactly what changes**

Run the sections type gate. Expected: no output.
```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-redesign-snapshot.test.tsx
```
Expected: `Snapshots  2 failed`, `Tests  2 failed | 36 passed (38)` — only the two missing sticky renders; the mirror, the parse, the soft check and every 1d/1e test pass. (Pre-run without 1e: `2 failed | 25 passed (27)`.)

- [ ] **Step 5: Write the snapshot check (before updating)**

Create `tmp/pdp-1f/snapcheck.mjs`:

```js
// The 1f snapshot update, checked: every render that existed before is
// byte-identical (1f changes no section but the sticky bar), and the only
// new keys are the sticky bar's. Run from the repo root.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const f = "packages/sections/src/__snapshots__/_pdp-redesign-snapshot.test.tsx.snap";
const parse = (s) =>
  Object.fromEntries([...s.matchAll(/exports\[`([^`]+)`\] = `\n?"([\s\S]*?)"\n?`;/g)].map((m) => [m[1], m[2]]));
const before = parse(execFileSync("git", ["show", `HEAD:${f}`], { encoding: "utf8" }));
const after = parse(readFileSync(f, "utf8"));
const changed = Object.keys(before).filter((k) => after[k] !== before[k]);
console.log(`existing ${Object.keys(before).length}, changed ${changed.length}${changed.length ? `: ${changed.join(" | ")}` : ""}`);
console.log(`new: ${Object.keys(after).filter((k) => !(k in before)).map((k) => k.split(" > ").slice(1).join(" > ")).join(" | ")}`);
```

- [ ] **Step 6: Update this one snapshot file**

```bash
pnpm exec vitest run packages/sections/src/_pdp-redesign-snapshot.test.tsx -u
git diff --stat -- packages/sections/src/__snapshots__
node tmp/pdp-1f/snapcheck.mjs
```
Expected:
- `Snapshots  2 written`, `Tests  38 passed (38)`; exactly one file, `_pdp-redesign-snapshot.test.tsx.snap | 4 ++++`;
- `snapcheck.mjs` prints `existing 15, changed 0` and `new: sticky bar, ar 1 | sticky bar, en 1` (pre-run without 1e: `existing 10, changed 0`).
Anything changed means 1f moved another section's render: stop and fix the code, do not commit the snapshot.

- [ ] **Step 7: Read the snapshot for what 1f meant to draw**

```bash
f=packages/sections/src/__snapshots__/_pdp-redesign-snapshot.test.tsx.snap
for k in 'data-sticky-style="soft"' 'data-sticky-primary="none"' 'data-sticky-secondary="icon"' 'aria-label="راسلنا واتساب"' 'aria-label="WhatsApp us"' 'wa.me/9647701234567?text=' 'decoration-bk-danger' '>اطلب الآن<' '>Order now<' 'data-receipt' 'direct-order-submit' 'التوصيل مجاني.'; do printf '%s: ' "$k"; grep -oF -- "$k" $f | wc -l | tr -d ' '; done
```
Expected, one count per line in this order: `2 2 2 1 1 2 2 1 1 0 0 0`. That is: both renders are the soft bar with the form-aware primary in its server state (no form has reported) and the WhatsApp square, named in each locale and prefilled; the struck price in red; the start label in each locale; no receipt/submit mark in any server render; and no full stop left on the band's title.

- [ ] **Step 8: The whole sections suite in CI mode**

```bash
CI=true pnpm exec vitest run packages/sections/src
```
Expected: `Test Files  144 passed (144)`, `Tests  1562 passed (1562)` — Task 0's sections count (135 / 1493 if 1e landed as planned) plus 9 files and 69 tests.

- [ ] **Step 9: Commit (its own, reviewed snapshot commit)**

```bash
git branch --show-current
git add packages/sections/src/_pdp-redesign-fixtures.ts packages/sections/src/_pdp-redesign-snapshot.test.tsx packages/sections/src/__snapshots__/_pdp-redesign-snapshot.test.tsx.snap
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "test(sections): redesign fixtures mirror the 1f draft migration; the soft form-aware sticky bar renders" -m "Reviewed snapshot update: two sticky renders added (ar/en); every earlier render byte-identical. All baselines unchanged." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Slice verification gate, PR, merge, deploy

No new code. If a step fails, fix the root cause in the task that owns the file, commit that fix, and re-run this whole task.

- [ ] **Step 1: No baseline changed; the only snapshot change is the redesign one**

```bash
git diff --stat origin/main HEAD -- packages/sections/src/__snapshots__
git status --porcelain packages/sections/src/__snapshots__
```
Expected: exactly one file — `_pdp-redesign-snapshot.test.tsx.snap | 16 ++++++++++------` (Task 1's six one-character edits + Task 13's two renders); the status prints nothing.

- [ ] **Step 2: Every baseline, unchanged, in CI mode**

```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_pdp-classic-snapshot.test.tsx packages/sections/src/_pdp-lower-baseline-snapshot.test.tsx packages/sections/src/_pdp-scent-baseline-snapshot.test.tsx packages/sections/src/_image-gallery-baseline-snapshot.test.tsx packages/sections/src/_product-reviews-baseline-snapshot.test.tsx packages/sections/src/_product-grid-baseline-snapshot.test.tsx packages/sections/src/_chrome-baseline-snapshot.test.tsx packages/sections/src/_order-confirmation-baseline-snapshot.test.tsx packages/sections/src/_site-footer-baseline-snapshot.test.tsx packages/sections/src/_sticky-cta-baseline-snapshot.test.tsx packages/sections/src/_primitives-baseline-snapshot.test.tsx packages/sections/src/_pdp-proof-guarantee-baseline-snapshot.test.tsx packages/sections/src/_pdp-reviews-faq-baseline-snapshot.test.tsx packages/sections/src/accordion_richtext.test.tsx
```
Expected: the same `Test Files` / `Tests` totals as 1e's Task 11 Step 2 (planned `15 passed (15)`, `163 passed (163)`), with no `written`, `updated` or `obsolete` line.

- [ ] **Step 3: The full suites**

```bash
CI=true pnpm exec vitest run packages/sections/src packages/shared/src apps/storefront/lib
CI=true pnpm exec vitest run apps/platform/lib/section-field-groups.test.ts apps/platform/components/store-builder-v2/auto-form-schema.test.ts
```
Expected: `Test Files  214 passed (214)`, `Tests  2547 passed (2547)`: Task 0's 205 / 2478 plus 9 files and 69 tests (term sheet 16, form progress 5, express progress 2, sticky strings 3, sticky props 3, form-aware 9, soft markup 11, form-aware DOM 4, copy lint 6, store +4, Kurdish coverage +1, redesign snapshot +5); then `Tests  112 passed (112)`.

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
Expected: `Tasks:    2 successful, 2 total`; both report `0 errors` (warnings are the existing, intentional ones).

- [ ] **Step 6: Hygiene greps on this slice's source files**

```bash
cd packages/sections/src
grep -nE ":\s*any\b|<any>|\bas any\b|@ts-ignore|eslint-disable|#[0-9a-fA-F]{3,6}\b|rgba?\(|\sdir=" _copy-terms.ts pdp_express/form-progress.ts sticky_cta_bar.strings.ts sticky_cta_bar.form-aware.ts sticky_cta_bar.soft.tsx helpers/express-order-store.ts
grep -nE "[A-Za-z_)\]]!\.|[A-Za-z_)\]]!;|[A-Za-z_)\]]!\)" _copy-terms.ts pdp_express/form-progress.ts sticky_cta_bar.strings.ts sticky_cta_bar.form-aware.ts sticky_cta_bar.soft.tsx helpers/express-order-store.ts sticky_cta_bar.client.tsx sticky_cta_bar.tsx pdp_express/express-form.tsx pdp_express/checkout-row.tsx _string-tables.ts
grep -cE "bg-bk-primary( |\")" sticky_cta_bar.soft.tsx sticky_cta_bar.client.tsx
cd ../../..
git diff origin/main HEAD -- packages/sections/src ':!packages/sections/src/__snapshots__' ':!*.test.ts' ':!*.test.tsx' | grep -E '^\+.*(eslint-disable|ts-ignore|:\s*any\b|<any>|\bas any\b|\sdir=|#[0-9a-fA-F]{6}|rgba?\()'
```
Expected: the first two print nothing; the third prints `sticky_cta_bar.soft.tsx:1` and `sticky_cta_bar.client.tsx:0` (the one solid yellow is the sticky primary, D4); the last prints nothing (`sticky_cta_bar.client.tsx` keeps the chunky bar's pre-existing inline `var(--bk-*, #hex)` fallbacks and `shadow-[…rgba…]`, which is why it is not in the first grep; the diff grep proves no added line brings one). The file lists are spelled out because zsh does not split `$VAR` into words.

- [ ] **Step 7: Push and open the PR**

```bash
git branch --show-current
git status --porcelain
git log --oneline origin/main..HEAD
git push -u origin feat/pdp-p1f-sticky-copy
```
Expected: the branch is `feat/pdp-p1f-sticky-copy`; only the two untracked storefront notes (and the ignored `tmp/`); 13 commits, from "promise band row-2 title without a stray full stop" to "redesign fixtures mirror the 1f draft migration".

```bash
gh pr create --base main --head feat/pdp-p1f-sticky-copy --title "PDP redesign 1f: smart sticky bar (form-aware, soft, WhatsApp square) + Arabic copy term sheet and lint (F12), draft migration (not applied)" --body "Slice 1f of docs/superpowers/specs/2026-10-27-pdp-lower-page-redesign-design.md (§1.8, §1.2 F12, §1.9). Closes Phase 1.

- sticky_cta_bar primary_kind \"form_aware\" (opt-in): the express form reports its progress through useExpressOrderStore; the bar reads «اطلب الآن» → focuses the first empty field, «كمّل طلبك / باقي {field}» → that field, «ثبّت طلبي / معلوماتك جاهزة» → scrolls the receipt into view and focuses the submit. It never submits (D6, confirmed by Ali 2026-10-29). The receipt/submit marks render only while a form-aware bar watches, so no server markup changes.
- style \"soft\": the express submit's own look (token radius + shadow, no ink outline, I14), price on the surface with a 12px red-struck before-price. secondary_display \"icon\": a 52px WhatsApp square, «راسلنا واتساب», prefilled «هلا، أريد أطلب {product}» (or whatsapp_prefill_i18n).
- F12: _copy-terms.ts (the term sheet as data, one name per action) + _arabic-copy-lint.test.ts over every chrome string table and the redesign's tenant copy, with frozen allowlists that may only shrink.
- Copy: the promise band's «التوصيل مجاني.» loses its stray full stop.
- Draft migration for scheniders-iraq (draft only, md5 + rev guarded, idempotent): the sticky bar's three keys. NOT applied: applied after this PR is deployed.
- Two reviewed redesign-snapshot updates (the full stop; two sticky renders); every baseline unchanged.

Tests: sections + shared + storefront lib 214 files / 2547 tests; type-check and lint green.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 8: Merge once CI is green, then wait for production**

```bash
gh pr checks --watch
gh pr merge --merge
```
Merge as gga2000 (Vercel builds only gga2000 commits). Then confirm the production deployment of the merge commit is READY and that the production domain serves it (a Vercel rollback pins production): Vercel MCP `list_deployments` for the storefront project, or the dashboard.

---

### Task 15: Apply the 1f draft migration (after the code is live)

Only after Task 14 Step 8 shows the merge commit live in production. Until then the draft must not carry `primary_kind: "form_aware"`: old code would catch it to `"link"` and send the bar's tap to `/checkout`, a dead end for an express product (sticky_cta_bar.tsx:28-31).

- [ ] **Step 1: Re-check the guards and the timestamp order**

```bash
git switch feat/pdp-p1f-sticky-copy && git pull --ff-only origin main
(cd packages && supabase db query --linked "SELECT store_config_rev, md5(store_config_v2_draft::text) AS draft_md5, md5(store_config_v2::text) AS pub_md5 FROM tenants WHERE slug='scheniders-iraq'" -o csv)
ls packages/supabase/migrations | grep -E '^[0-9]{14}_' | sort | tail -2
```
Expected:
- `38,89b6499d703c80771a38ef7195a5bc78,a6f87ba3181b0e94f41ba4a700de257b` (or the values Task 0 pinned);
- the last file listed is `<STAMP>_scheniders_iraq_pdp_redesign_1f_draft.sql`.

If the md5 or rev moved, stop and redo Task 12 Steps 2–6 in a follow-up PR (with Task 13's mirror test still green). If a later-stamped migration reached main first, re-stamp with `git mv` to the current UTC time in a follow-up PR; the mirror test finds the file by suffix.

- [ ] **Step 2: Dry run again**

```bash
(cd packages && supabase db query --linked -f ../tmp/pdp-1f/dryrun-1f.sql -o csv)
```
Expected: `true,true,b8c9098089d3cc524bfe2a1aecbac9e7`.

- [ ] **Step 3: Apply**

```bash
F=$(ls packages/supabase/migrations/*_scheniders_iraq_pdp_redesign_1f_draft.sql); echo "$F"
(cd packages && supabase db query --linked -f "../$F")
```
Expected: exit 0, no rows. On `draft md5 is …` or `store_config_rev is …`, nothing was written: go back to Step 1.

- [ ] **Step 4: Record it**

```bash
V=$(basename "$F" | cut -c1-14); echo "$V"
(cd packages && supabase migration repair --status applied "$V")
(cd packages && supabase db query --linked "SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '$V'" -o csv)
```
Expected: one row, `<V>,scheniders_iraq_pdp_redesign_1f_draft`.

- [ ] **Step 5: Re-read and diff against the intended result**

```bash
(cd packages && supabase db query --linked "SELECT store_config_rev, md5(store_config_v2_draft::text) AS draft_md5, md5(store_config_v2::text) AS pub_md5, updated_at > now() - interval '1 hour' AS bumped FROM tenants WHERE slug='scheniders-iraq'" -o csv)
(cd packages && supabase db query --linked "SELECT s.sec->'base'->>'primary_kind' AS primary_kind, s.sec->'base'->>'style' AS style, s.sec->'base'->>'secondary_display' AS secondary_display, s.sec->'base'->>'hide_while' AS hide_while, s.sec->'base'->>'show_product_price' AS show_price, s.sec->'base'->'primary_label_i18n'->>'ar' AS label FROM tenants t, jsonb_array_elements(t.store_config_v2_draft->'pages') p(page), jsonb_array_elements(p.page->'sections') s(sec) WHERE t.slug='scheniders-iraq' AND p.page->>'page_id'='product' AND s.sec->>'id'='d874d9d6-dede-40e5-bcf8-aceb51d11036'" -o csv)
```
Expected:
- `38,b8c9098089d3cc524bfe2a1aecbac9e7,a6f87ba3181b0e94f41ba4a700de257b,true` (the draft equals the dry run's target; published unchanged);
- `form_aware,soft,icon,form,true,اطلب الآن`.

- [ ] **Step 6: Clean up**

```bash
rm -rf "${TMPDIR:-/tmp}/pdp-1f-pglite"
```
Delete `tmp/pdp-1f/` after Task 16.

---

### Task 16: Draft-view checks at 390px (after Task 15), and Phase 1's hand-offs

- [ ] **Step 1: Open draft view and check the server markup**

The storefront dev server runs from this worktree on :3001 (if not: copy `/Users/ali/scheniders-mono/apps/storefront/.env.local` into `apps/storefront/` and `pnpm dev:storefront`; delete the copy afterwards). Draft-view link:
```
http://localhost:3001/api/draft-view?tenant=scheniders-iraq&token=dev-preview-token&to=/s/scheniders-iraq/products/%D9%88%D9%8A%D9%81%D8%B1
```
```bash
curl -s -c tmp/pdp-1f/cj -L "http://localhost:3001/api/draft-view?tenant=scheniders-iraq&token=dev-preview-token&to=/s/scheniders-iraq/products/%D9%88%D9%8A%D9%81%D8%B1" -o tmp/pdp-1f/page.html
for k in 'data-sticky-style="soft"' 'data-sticky-primary="none"' 'data-sticky-secondary="icon"' 'aria-label="راسلنا واتساب"' 'https://wa.me/9647779703832?text=%D9%87%D9%84%D8%A7%D8%8C%20%D8%A3%D8%B1%D9%8A%D8%AF%20%D8%A3%D8%B7%D9%84%D8%A8%20%D9%88%D9%8A%D9%81%D8%B1%20%D8%A7%D9%86%D8%AA%D9%86%D8%B3' '>اطلب الآن<' 'data-receipt' 'direct-order-submit' '>التوصيل مجاني<' 'التوصيل مجاني.'; do printf '%s: ' "$k"; grep -oF -- "$k" tmp/pdp-1f/page.html | wc -l | tr -d ' '; done
```
Expected: `1 1 1 1 1 1 0 0 1 0` — the soft form-aware bar with the WhatsApp square opening «هلا، أريد أطلب ويفر انتنس» on `07779703832`; no receipt/submit mark in server HTML (they appear only after the bar mounts); the band's title without its stop.

- [ ] **Step 2: The four states at 390×844 and 360×780**

Use the `agent-browser` skill, or the Playwright MCP; if the MCP is wedged, Step 1's curl check is the fallback for the server state and `_sticky-cta-form-aware-dom.test.tsx` already pins the client states. Capture and check:
- **form on screen** (first load, form visible): no bar (`hide_while: "form"`); in the DOM the receipt has `data-receipt` and the submit `id="direct-order-submit"` (the bar mounted and watches);
- **untouched** (scroll to the reviews): the bar slides up — on the right a yellow «اطلب الآن» 54px tall with no dark outline and no hard shadow, the price beside it («48,500» struck in red at 12px over «36,750 د.ع» at 17px), the 52px WhatsApp square at the left with a green glyph; tap «اطلب الآن» → the page scrolls the phone field to mid-screen, it has focus, the keyboard opens, the bar hides;
- **partial** (type a valid number + name, scroll away): «كمّل طلبك» over «باقي المحافظة»; tap → the governorate select is centred and focused;
- **complete** (fill governorate and «المنطقة والشارع», scroll away): ✓ «ثبّت طلبي» over «معلوماتك جاهزة» with a dark ring; tap → the receipt («المجموع» row) is centred, «ثبّت طلبي» in the form has focus, **no order is placed** (no network POST to `/api/checkout/orders`, the button still reads «ثبّت طلبي»);
- tap the WhatsApp square: WhatsApp opens with «هلا، أريد أطلب ويفر انتنس»;
- the promise band's row 2 reads «التوصيل مجاني» with no full stop.

Check: no horizontal scroll; the primary and the square are ≥44px; `document.querySelectorAll('[data-sticky-style] [dir], [data-sticky-style][dir]').length === 0`; the sticky region's accessible name is «إجراءات سريعة».

- [ ] **Step 3: The published page is untouched**

```bash
curl -s "http://localhost:3001/s/scheniders-iraq/products/%D9%88%D9%8A%D9%81%D8%B1" | grep -c 'data-sticky-style\|data-sticky-secondary'
```
Expected: `0`.

- [ ] **Step 4: Hand-offs (Phase 1 is complete)**

- Ali (to-do 10): sign off the bar's new words — «كمّل طلبك» / «باقي {field}» / «معلوماتك جاهزة» / «هلا، أريد أطلب {product}» — and choose the FAQ row's sub: keep «نفس الرقم للاتصال والواتساب» (then the lint's one tenant allowlist entry stays, with his decision as its reason) or take «نفس الرقم للاتصال وواتساب» (one follow-up draft migration restating `contact` whole, same guards; then delete the entry, and the lint enforces it from there).
- Ali (to-do 8): Kurdish for the five `STICKY_STRINGS`, and the drafted English.
- Ali (optional): his own WhatsApp opening line — `whatsapp_prefill_i18n` on the sticky bar in the builder; `{product}` is the product's name.
- The F12 allowlists: each of the six chrome entries is fixed only by a change that alters other tenants' markup (a forms set for «{count} تقييم», Latin digits in the address placeholder, «واتساب» in the two unconfirmed-order lines). Each is its own small PR; the lint then forces the entry's deletion.
- Go-live gate (spec §Sub-projects): Phase 1 is complete with this slice; still open are Phase 2 and merchant to-dos 1, 2, 4, 5 and 10. Publishing stays Ali's; the publish-day data file (`packages/supabase/go-live/scheniders-iraq-pdp-redesign.sql`, slice 1c) runs right before it.

---

## Self-review

**1. Spec coverage**

| Spec item | Task |
|---|---|
| §1.8 `primary_kind` + `"form_aware"` with `.catch` (bad value → link) | Task 8 |
| §1.8 `style: "chunky" \| "soft"`, `secondary_display: "button" \| "icon"`, `whatsapp_prefill_i18n` | Task 8 |
| §1.8 express form registers while mounted; publishes `missing` (required keys minus `alt_phone`, empty or `fieldError`), first missing id (`fieldA11yCore(k).id`) and label (`phoneLabel`/`nameLabel`/`governorateLabel`/`addressLabel`), submit id | Tasks 4, 5, 6 (+ the express phone check: scope decision 4; + the submit label the complete state shows) |
| §1.8 submit `id="direct-order-submit"`, receipt `data-receipt` | Tasks 4, 6 (only while a bar watches: scope decision 5) |
| §1.8 `hide_while: "form"` kept | Tasks 12, 13 (base key kept; parse test), 10 (soft branch honours `hidden`) |
| §1.8 states: untouched → start label, focus phone; partial → «كمّل طلبك · باقي {field}», focus it; complete → submit label, receipt into view + focus submit, never submits (D6); no form → today's `scroll_to_form` | Tasks 9, 10 (two-line labels: scope decisions 2, 3; fallback: scope decision 6) |
| §1.8 soft: `rounded-bk-input bg-bk-primary text-bk-on-primary shadow-bk-button`, no ink outline (I14) | Task 10 (`sticky_cta_bar.soft.tsx`, markup test) |
| §1.8 price block on cream, 12px floor | Task 10 (`SoftPrice`; D4 red strike) |
| §1.8 icon: 52px square, green glyph on `bg-bk-surface`, aria «راسلنا واتساب», `wa.me/<digits>?text=` prefill or «هلا، أريد أطلب {product}»; bare link otherwise | Tasks 7, 9, 10 (name reused from 1e's `FAQ_STRINGS`: scope decision 8) |
| §1.8 files (`sticky_cta_bar.tsx`, `.client.tsx`, `.strings.ts`, `express-form.tsx`, `checkout-row.tsx`, `express-order-store.ts`) | Tasks 4, 6, 7, 8, 10 (+ `form-progress.ts`, `.form-aware.ts`, `.soft.tsx` split out for testing) |
| §1.8 draft: `form_aware`, `soft`, `icon` | Tasks 12, 13, 15 |
| §1.2 F12: `STRING_TABLE_FILES` gains `sticky_cta_bar.strings.ts`; `_kurdish-coverage` reads the list | Tasks 3, 7 |
| §1.2 F12: `_copy-terms.ts` term sheet with a reason per rule (زبون, «كرت الضمان», «واتساب», «اتصل بينا», hamza ×4, «،», counts 3–10, Latin digits) | Task 2 (+ `COPY_ACTIONS`: one name per action) |
| §1.2 F12: `_arabic-copy-lint.test.ts` over the tables + `CONTACT_LINE_STRINGS` and over `_pdp-redesign-fixtures.ts`; عميل on (2) only; frozen allowlist that may only shrink, e.g. `REVIEW_STRINGS.countMany`, `addressPlaceholder` «١٤» | Task 11 (forms sets exempt: scope decision 11; verbatim customer words exempt + 1e's «والواتساب» pending Ali: scope decision 12) |
| §1.3 row 2 title (the merchant's "stray full stop" fix) | Task 1 |
| §1.9 guards a–d, idempotent, rollback header, apply after deploy, re-read after apply | Tasks 12, 15 |
| §1.10 sticky label and target per state; `express-order-store` progress states; Kurdish coverage; `_arabic-copy-lint`; no hardcoded colour; baselines unchanged; opted-in renders ar/en; 390px checks of the four states; published page unchanged | Tasks 4–11, 13, 14, 16 |
| D4 (yellow only on the order action; green = WhatsApp; red = strike), D5 (Latin digits), D6, D14 (the sticky icon as persistent chrome) | Tasks 10, 11, 14 (hygiene greps), 16 |

**2. Placeholder scan.** `STAMP` (Task 12 Step 1) and `V` (Task 15 Step 4) are produced at run time, as in 1b–1e. Every code block above is the exact file content that was pre-run in a throwaway worktree of `origin/main` `1eb08615` with 1e's planned strings table and fixture blocks copied in from 1e's plan, and with live read-only data of 2026-10-30: the unit, DOM and markup tests, the type gates (sections, storefront, platform), the storefront + platform lint, the PGlite replay (over the live post-1d row with 1e's planned migration applied first) and the dry run (on PGlite over that copy; live, before 1e, it correctly reported `draft_md5_ok = false`). The counts that need 1e's real code (the redesign snapshot's 33 → 38, the 205 → 214 suites) are 1e's planned numbers plus 1f's measured delta; the PR/merge/apply/browser steps touch shared state and were not run.

**3. Type consistency.**
- `EXPRESS_SUBMIT_ID`, `ExpressFormReport` (with `submitLabel`), `watchForm`, `useFormWatched` (Task 4) are what `form-progress.ts` (Task 5), `checkout-row.tsx` (Task 6) and the bar (Task 10) import.
- `formProgressReport({ form, fieldError, phoneComplete, fieldId, submitLabel, locale })` (Task 5) is called with `m.fieldError` (`(k, raw) => string | null`, model.ts:72) and `m.fieldA11yCore(k).id` (Task 6).
- `StickyTarget`, `StickyPrimary`, `stickyPrimary(progress, startLabel, locale)`, `handOffToForm(target, fallback)`, `stickyWhatsappHref(number, message)` (Task 9) are what the client (Task 10) calls; `SoftPrimary` takes `stage: ExpressFormStage | null` (1a's type).
- `ss()` / `STICKY_STRINGS` keys (`region`, `continueOrder`, `stillMissing`, `ready`, `waPrefill`, Task 7) match every call in Tasks 9 and 10 and Task 11's action test; `fs("call")` / `fs("whatsapp")` are 1e's.
- `stringTableEntries` / `StringTableEntry` (Task 3) feed both `_kurdish-coverage` and the lint; `lintArabicCopy(text, scope)` / `CopyRuleId` / `COPY_ACTIONS` (Task 2) are what the lint imports.
- Fixtures: `SLICE_1F_STICKY_PATCH` and `IRAQ_REDESIGN_STICKY_INPUT = jsonbMerge(IRAQ_DRAFT_STICKY_PROPS, SLICE_1F_STICKY_PATCH)` (Task 13) match the migration's `sticky_patch` block (Task 12), and the lint skips `IRAQ_REDESIGN_*` by name.
