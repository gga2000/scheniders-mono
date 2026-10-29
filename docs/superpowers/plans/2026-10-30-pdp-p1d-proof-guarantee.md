# PDP Lower-Page Redesign — Slice 1d (Proof Stack + «كرت الضمان») Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the express product page's proof and policy areas into Ali's concept A (F10): the TikTok comments become a legible proof stack (doubt, verbatim quote, author, a full-width screenshot cropped to the comment column at its natural height, the rest behind one expand button), and the four policy accordions plus the mid-page call card become ONE always-open espresso «كرت الضمان». Wire the promise band's «الشروط» link to it (`guarantee_anchor_id` ↔ `anchor_id`). Write scheniders-iraq's 1d draft config (guarded, applied only after the code is live). Every other tenant's markup stays byte-identical.

**Architecture:** All new props are optional and `.catch`-guarded. `image_gallery` gains `layout: "stack"` (server-rendered in `image_gallery.tsx`, one small client island `image_gallery.stack.tsx` for expand/collapse, the existing `GalleryViewer` for tap-to-zoom, pure crop maths in `image-gallery-crop.ts`, chrome strings in the new `image_gallery.strings.ts`). `accordion_richtext` gains `layout: "guarantee_card"` (server-only `accordion_richtext.guarantee.tsx`). Both gain `heading_style`. The band's return line and the card's week term are written from ONE wording object in the redesign fixtures by ONE migration, and a test pins the pair. The draft write is one guarded SQL migration, replayed on PGlite against a read-only copy of the live row and dry-run live with a SELECT, applied only after merge + deploy.

**Tech Stack:** Next.js 16 / React 19 sections package (`@scheniders/sections`), zod v4, Tailwind v3 (storefront) / v4 (platform), vitest 2 (node + jsdom), Supabase CLI 2.98 (`db query --linked`, `migration repair`), PGlite 0.2.17 (local replay only, outside the repo), pnpm 10.

**Spec:** `docs/superpowers/specs/2026-10-27-pdp-lower-page-redesign-design.md` §1.5, §1.3 (`guarantee_anchor_id`), §1.1 (`heading_style`), §1.9, §1.10; decisions D1, D3, D4, D5, D8. Concept: `/Users/ali/scheniders-mono/.superpowers/brainstorm/concepts-pdp-2026-10-26/c-g2-policies-call-proof-a.html` + `.notes.md`. Built on slices 1a (#224), 1b (#225), 1c (#226, merged as `d79b0bd4`; its draft migration `20261029220530` is applied, draft md5 `e4800d7bb6f80f656cd848d3dbf469d9`, rev 38): `ChapterHeading` (`helpers/chapter-heading.tsx`), `readsRtl` (`helpers/reading.ts`), `formatCount` (`helpers/format.ts`), `STRING_TABLE_FILES` (`_string-tables.ts`), the band's «الشروط» link (`pdp_express/promise-band.tsx:174-181`, renders only when `guarantee_anchor_id` is set), the redesign fixtures + mirror test (`_pdp-redesign-fixtures.ts`, `_pdp-redesign-snapshot.test.tsx`).

---

## Scope decisions (read before starting)

1. **Ali's binding 1d decisions.** Concept A, "Guarantee ticket + legible TikTok proof stack". Comment order p5 (المحامي زياد «اول مره يوصلني عطر ويطلع كلام الاعلان كله صحيح»), p2, p4, then p3, p6, p7, p9, p8 and «Alpha decorations company» (p1) last. Source pill «تعليقات على إعلاناتنا بتيك توك», store-wide (scope line «3 من أصل 9، على عطورنا بشكل عام»); the platform/source is merchant to-do 4, so the label is the merchant-editable prop `source_label_i18n`. Screenshots stacked full-width at their natural ratio (no 16/5 strip), cropped only horizontally (`crop {left: 12, right: 2}` = x 100→810 of 828) so TikTok's ~32px text lands at ~16px at 390px. The four policy rows become one card that states each term once; the «تحب تحچي ويانا؟» call row is removed. Page order (D1) is already right in the draft since 1b: pdp (band, scent card) → image_gallery → product_reviews → accordion (now the card) → faq_contact_split → …
2. **Return wording: one source.** Sections cannot read each other at render (`_types.ts:22-66`), so the band's row-1 line (`pdp_direct_order.return_promise_i18n`, written by 1b) and the card's week term (`accordion_richtext.items[2].body_i18n`) cannot share a prop. The one source is `RETURN_WORDING` in `_pdp-redesign-fixtures.ts`: two options, each with the band line AND the matching week term. `IRAQ_RETURN_WORDING` picks option ١ (D8, the draft's wording today). The 1d migration writes BOTH from it (the pdp patch restates `return_promise_i18n` — unchanged, so the `||` merge is a no-op for that key), the mirror test proves the migration equals the fixtures, and a test pins band ↔ term. If Ali picks option ٢ (to-do 5): flip `IRAQ_RETURN_WORDING`, then regenerate the migration's two patches (before Task 7) or write a follow-up migration (after Task 10). Note: both options offer refuse-at-the-door OR return-within-a-week; they differ only in the trigger ("didn't like it" vs "differs from the description"), per concept g1-B lines 159–166.
3. **Expanded comments show their author and tag.** The spec says the rest expand "as screenshots only, with a «حساب شركة» tag on business accounts". A tag needs a name beside it (the mockup shows `who` on every expanded item), so each expanded row is author line (+ tag) and screenshot — no doubt, no quote.
4. **The legend's picture is a prop.** The spec says "the brand logo", but `tenants.branding.logo_url` is NULL for scheniders-iraq (read live 2026-10-30) and sections only see `branding.logo_url` (`helpers/section-tenant.ts:50`); the logo the screenshots show lives in the draft's header/footer `logo_image_url`. So `image_gallery` gains `legend_image_url` (optional, `.describe("image")`), falling back to `branding.logo_url`, then to a text-only legend. The heart beside it is ink, not red (D4: red is for errors and strikes).
5. **`policy_link.href` refuses `//host`.** The spec regex `/^\/[^\s]*$/` accepts a protocol-relative URL, and `StoreLink` prefixes nothing when the store base is `""` (custom domains, `helpers/store-context.tsx:39-42`), so `//evil.example` would leave the store. The schema uses `/^\/(?!\/)\S*$/`.
6. **`heading_style`.** `image_gallery`: every layout, `ChapterHeading` in place of `CenteredSectionHeader` (`image_gallery.tsx:460-466`). `accordion_richtext`: the cards heading (`CenteredSectionHeader`, `accordion_richtext.tsx:182-188`) and the quiet island's `h2` (`accordion_richtext.client.tsx:72-82`, via a new optional `chapterLocale` prop). The guarantee card always sets its title at the chapter scale in `text-bk-on-secondary`: `ChapterHeading` hard-codes `text-bk-ink` (`helpers/chapter-heading.tsx:51`), which would be ink-on-espresso. The draft sets `heading_style: "chapter"` on the gallery only (spec §1.5).
7. **No new `dir`.** The quiet rows carry `dir="auto"` on 5 paragraphs today (`accordion_richtext.client.tsx:133`); the card drops them (5 → 0) and uses the storefront's global `unicode-bidi: plaintext` on `p`/`h2`/`h3` (`apps/storefront/app/globals.css:116`). The stack adds none.
8. **Frozen first.** The draft's whole-picture carousel and its quiet accordion + call row have no frozen snapshot today. Task 1 freezes both (from the live draft bases) before any code changes; they and every 1a–1c baseline stay byte-identical. The only snapshot that changes is the opted-in redesign snapshot, in its own reviewed commit (Task 8), checked by `snapcheck.mjs`.
9. **Guards, stamp, apply** follow 1b/1c exactly: `STAMP=$(date -u +%Y%m%d%H%M%S)` sorting after `20261029220530`; guards = whole-draft md5 + `store_config_rev` + already-applied no-op; apply with `supabase db query --linked -f`, record with `supabase migration repair --status applied`; never `db push`; nothing applied before the code PR is merged and production serves it. **Task 0 re-reads the guard values; the migration pins whatever they are then.**
10. **Strings.** New chrome goes in `image_gallery.strings.ts` (`GALLERY_STRINGS`, ar/en/ku), added to `STRING_TABLE_FILES` in the same commit. The viewer's existing ar/en `VIEWER_STRINGS` (`image_gallery.tsx:169-186`) are reused as they are. The guarantee card adds no chrome: every string on it is a merchant prop.

## Conventions for every task

- Work only in the worktree `/Users/ali/scheniders-mono-pdp`. **Do not switch its branch while reviewers or a dev server use it**: Task 0 Step 1 checks that first.
- Every shell starts with:
  ```bash
  export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"
  cd /Users/ali/scheniders-mono-pdp
  ```
- pnpm only. Never npm/yarn.
- Tests: `CI=true pnpm exec vitest run <path>` from the repo root. `CI=true` never writes a snapshot. Only **Task 1 Step 4** (a brand-new snapshot file) and **Task 8 Step 6** (`-u`, one file) run vitest without `CI=true`.
- vitest prints coloured output; the expected lines below are the plain text (`Tests  4 passed (4)`).
- Sections type gate (expected **no output**):
  ```bash
  (cd packages/sections && ./node_modules/.bin/tsc --noEmit --incremental false -p tsconfig.json --rootDir .. 2>&1 | grep "error TS" | grep -v TS6059 | grep -v -E "^src/(RenderSection\.sticky|_chrome-baseline-snapshot|_chrome|_delivery-promise|_pdp-classic-snapshot|image-gallery-order|product_attributes|helpers/whatsapp|pdp_express/checkout-row\.receipt)\.test\.tsx?\(")
  ```
- Before every commit: `git branch --show-current` → `feat/pdp-p1d-proof-guarantee`.
- Commit with explicit paths only, as gga2000, with the trailer (lint-staged runs `eslint --fix` on staged files; it changes nothing in this slice's files):
  ```bash
  git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```
- Banned in new code: `any`, `@ts-ignore`, `eslint-disable`, a non-null `!` that silences the compiler, swallowed catches, hex/rgb colour literals in source (tests may hold the brand-kit fixture), and any `dir` attribute. Solid yellow (`bg-bk-primary`) is never used by this slice (D4); `text-bk-primary` only tints numerals, the eyebrow and the stub arrow on espresso.
- **Never run `vitest -u`** except Task 8 Step 6. If a baseline fails, the code changed a default render: fix the code.
- All live database access before Task 10 is **read-only** (`SELECT`, or a `DO` block replayed on PGlite only).

## File structure

| File | Status | Responsibility |
|---|---|---|
| `packages/sections/src/_pdp-redesign-fixtures.ts` | modify | Task 1: the draft's gallery + accordion bases; Task 8: `RETURN_WORDING`, the three 1d patches, the merged 1d inputs |
| `packages/sections/src/_pdp-proof-guarantee-baseline-snapshot.test.tsx` (+ `.snap`) | create | frozen: the draft carousel and the quiet accordion + call row |
| `packages/sections/src/image_gallery.tsx` | modify | stack props, `heading_style`, `ProofStack` / `StackShot` / `StackAuthor` |
| `packages/sections/src/_image-gallery-stack-props.test.ts` | create | the gallery props parse safely |
| `packages/sections/src/image_gallery.strings.ts` (+ `.test.ts`) | create | `GALLERY_STRINGS`, `gs`, `proofMoreLabel` |
| `packages/sections/src/_string-tables.ts` | modify | lists `image_gallery.strings.ts` |
| `packages/sections/src/image-gallery-crop.ts` (+ `.test.ts`) | create | `stackFrame` crop maths |
| `packages/sections/src/image_gallery.stack.tsx` (+ `.test.tsx`, jsdom) | create | `ProofStackMore` expand/collapse island |
| `packages/sections/src/_image-gallery-stack.test.tsx` | create | the stack's server markup |
| `packages/sections/src/accordion_richtext.tsx` | modify | card props, `heading_style`, the card branch |
| `packages/sections/src/accordion_richtext.client.tsx` | modify | quiet heading → `ChapterHeading` with `chapterLocale` |
| `packages/sections/src/accordion_richtext.guarantee.tsx` (+ `.test.tsx`) | create | `GuaranteeCard` |
| `packages/supabase/migrations/<STAMP>_scheniders_iraq_pdp_redesign_1d_draft.sql` | create | the guarded draft write |
| `packages/sections/src/_pdp-redesign-snapshot.test.tsx` (+ `.snap`) | modify | 1d mirror + pair tests; stack and card renders; reviewed snapshot update |
| `tmp/pdp-1d/` (`shots/`, `dryrun-1d.sql`, `snapcheck.mjs`, `order-check.mjs`) | scratch (gitignored) | read-only checks |
| `${TMPDIR:-/tmp}/pdp-1d-pglite/` | scratch (outside the repo) | PGlite replay harness |

---

### Task 0: Branch, baseline, live guard values, screenshot sizes

- [ ] **Step 1: Branch off main (1c is merged as #226)**

```bash
git branch --show-current
git status --porcelain
git fetch origin
git log --oneline -1 origin/main
git switch -c feat/pdp-p1d-proof-guarantee origin/main
git branch --show-current
```
Expected:
- before switching: the 1c branch and only the untracked `apps/storefront/AGENTS.md` / `apps/storefront/CLAUDE.md` (not ours; never stage them). If reviewers or a dev server are still using the worktree on the 1c branch, stop and ask for a free worktree (`git worktree add ../scheniders-mono-pdp-1d origin/main`) instead of switching this one;
- the log shows `d79b0bd4 Merge pull request #226 from gga2000/feat/pdp-p1c-scent-card` or a later commit;
- the branch is `feat/pdp-p1d-proof-guarantee`.

- [ ] **Step 2: Baseline counts on the untouched branch**

```bash
CI=true pnpm exec vitest run packages/sections/src packages/shared/src apps/storefront/lib
```
Expected: `Test Files  189 passed (189)`, `Tests  2265 passed (2265)` (on `d79b0bd4`). Task 9 compares against these; if main moved, write down the new numbers and add the same deltas.

- [ ] **Step 3: The CLI link, the guard values, and 1c applied**

```bash
cat packages/supabase/.temp/project-ref; echo
cd packages
supabase db query --linked "SELECT store_config_rev, md5(store_config_v2_draft::text) AS draft_md5, md5(store_config_v2::text) AS pub_md5 FROM tenants WHERE slug='scheniders-iraq'" -o csv
supabase db query --linked "SELECT s.sec->>'type' AS type, md5((s.sec->'base')::text) AS base_md5 FROM tenants t, jsonb_array_elements(t.store_config_v2_draft->'pages') p(page), jsonb_array_elements(p.page->'sections') s(sec) WHERE t.slug='scheniders-iraq' AND p.page->>'page_id'='product' AND s.sec->>'id' IN ('e5da8997-d564-4260-88f2-a6d73031b4ce','370f9b04-c300-4dbe-8ea9-b0f9b2d7f78d') ORDER BY 1" -o csv
supabase db query --linked "SELECT version, name FROM supabase_migrations.schema_migrations WHERE version >= '20261029' ORDER BY 1" -o csv
cd ..
```
Expected:
- `sduvpgqwhxragxtxztur` (never the OLD `ibfdugifekivquwprqjc`; if `.temp` is missing, `cp /Users/ali/scheniders-mono/packages/supabase/.temp/* packages/supabase/.temp/`);
- `38,e4800d7bb6f80f656cd848d3dbf469d9,a6f87ba3181b0e94f41ba4a700de257b` (read 2026-10-30 after the 1c migration was applied);
- `accordion_richtext,41e72fa7b03c6e4bbea2c5d49eccb0d3` and `image_gallery,fe7527cbc494626798a82a85e19c6d83`;
- two rows, `20261029210502,scheniders_iraq_pdp_redesign_1b_draft` and `20261029220530,scheniders_iraq_pdp_redesign_1c_draft`.

**If the draft md5 or the rev differs, the migration pins the values read now:** use them in Task 7 Step 2 (`c_expected_draft_md5`, `c_expected_rev`, the header's guard and rollback lines) and in Task 7 Step 6's dry-run literals; Task 7 Steps 5–6 then print new `before`/`after` md5s — record those and use them in Tasks 7 and 10 instead of the ones below. **If a base md5 differs,** the merchant edited the gallery or the accordion: re-read that base (`SELECT s.sec->'base' …`) and update `IRAQ_DRAFT_GALLERY_BASE` / `IRAQ_DRAFT_ACCORDION_BASE` in Task 1 Step 1 and the Rollback header in Task 7 Step 2 to match it. **If 1c is not recorded,** stop: 1c's Task 9 has not run.

- [ ] **Step 4: Measure the nine stored screenshots (spec: "measured from each stored file when the plan writes the config")**

```bash
mkdir -p tmp/pdp-1d/shots
B=https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews
for id in 536e8d88-e55a-49f0-a9b3-305b69cbfbf5 cba26e5e-7ad0-4213-b804-d535b7c0d7e6 6bf95f17-026a-400d-9067-08894b88a4a0 8f742152-1b1a-4d65-a543-331196fc6830 abf3f504-d358-4888-bd0f-eafd1136d248 2f8ae556-1a0c-4cdb-b4e2-b30c2808755e 8e208e9b-b896-430d-839d-44d2a010b588 13ec2385-384c-4d1f-af39-793949cce8df 1ebf499e-fb7d-4325-a2fe-0b98e8530932; do curl -sf -o "tmp/pdp-1d/shots/$id.jpeg" "$B/$id.jpeg" && echo "${id:0:8} $(sips -g pixelWidth -g pixelHeight "tmp/pdp-1d/shots/$id.jpeg" | awk '/pixel/{printf "%s ", $2}')"; done
```
Expected (stack order p5, p2, p4, p3, p6, p7, p9, p8, p1; width then height):
```
536e8d88 828 253
cba26e5e 828 256
6bf95f17 828 202
8f742152 828 208
abf3f504 828 167
2f8ae556 828 173
8e208e9b 828 160
13ec2385 828 184
1ebf499e 828 163
```
These heights are the `height` values in Task 8's `PROOF_SHOTS` and in the migration. If any differs (a file was replaced), use the measured value in both. The files are only read by `sips`; delete `tmp/pdp-1d/shots/` after Task 11.

---

### Task 1: Freeze the draft's proof gallery and policy accordion (before any code changes)

**Files:**
- Modify: `packages/sections/src/_pdp-redesign-fixtures.ts` (imports; append the two draft bases)
- Create: `packages/sections/src/_pdp-proof-guarantee-baseline-snapshot.test.tsx`
- Create (written by vitest): `packages/sections/src/__snapshots__/_pdp-proof-guarantee-baseline-snapshot.test.tsx.snap`

- [ ] **Step 1: Add the two draft bases to the redesign fixtures**

They are read-only copies of the live draft's `e5da8997` (image_gallery) and `370f9b04` (accordion_richtext) bases, base md5s `fe7527cb…` and `41e72fa7…` (Task 0 Step 3).

In `packages/sections/src/_pdp-redesign-fixtures.ts`, replace:
```ts
import type { StoreContactConfig } from "@scheniders/shared";
import type { Props as PdpDirectOrderProps } from "./pdp_direct_order";
import type { Tenant } from "./types";
import { EXPRESS_IRAQ_DRAFT_PDP_PROPS, fixtureTenant } from "./_pdp-fixtures";
```
with:
```ts
import type { StoreContactConfig } from "@scheniders/shared";
import type { Props as AccordionProps } from "./accordion_richtext";
import image_gallery from "./image_gallery";
import type { Props as PdpDirectOrderProps } from "./pdp_direct_order";
import type { Tenant } from "./types";
import { EXPRESS_IRAQ_DRAFT_PDP_PROPS, fixtureTenant } from "./_pdp-fixtures";

export type GalleryProps = typeof image_gallery.defaultProps;
```

Then append to the end of the file:
```ts

const REVIEW_SHOTS =
  "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/";

/** The nine TikTok comment screenshots, in the draft's stored order (p1–p9). */
export const IRAQ_PROOF_SHOT_IDS = [
  "1ebf499e-fb7d-4325-a2fe-0b98e8530932",
  "cba26e5e-7ad0-4213-b804-d535b7c0d7e6",
  "8f742152-1b1a-4d65-a543-331196fc6830",
  "6bf95f17-026a-400d-9067-08894b88a4a0",
  "536e8d88-e55a-49f0-a9b3-305b69cbfbf5",
  "abf3f504-d358-4888-bd0f-eafd1136d248",
  "2f8ae556-1a0c-4cdb-b4e2-b30c2808755e",
  "13ec2385-384c-4d1f-af39-793949cce8df",
  "8e208e9b-b896-430d-839d-44d2a010b588",
] as const;

/** scheniders-iraq's draft image_gallery e5da8997 base before slice 1d
 *  (read 2026-10-30): the whole-picture carousel in 16/5 strips. */
export const IRAQ_DRAFT_GALLERY_BASE: GalleryProps = {
  heading_i18n: { ar: "كلامهم مو كلامنا", en: "Their words, not ours" },
  layout: "carousel",
  display: "whole",
  frame: "strip",
  order: "product_first",
  images: IRAQ_PROOF_SHOT_IDS.map((id, i) => ({
    url: `${REVIEW_SHOTS}${id}.jpeg`,
    alt_i18n: { ar: `رسالة من زبون ${i + 1} من 9`, en: `Customer message ${i + 1} of 9` },
  })),
};

/** scheniders-iraq's draft accordion_richtext 370f9b04 base before slice 1d
 *  (read 2026-10-30): four quiet policy rows and the «تحب تحچي ويانا؟» call row. */
export const IRAQ_DRAFT_ACCORDION_BASE: AccordionProps = {
  allow_multiple: false,
  layout: "quiet",
  items: [
    {
      title_i18n: { ar: "سياسة الدفع عند الاستلام", en: "Cash-on-delivery policy" },
      body_i18n: {
        ar: "يتم الدفع حصراً بعد استلام العطر واختباره من خلال العينة الزجاجية المرفقة مجاناُ مع كل طلب.",
        en: "Payment happens only after receiving the perfume and testing it via the free glass sample included with every order.",
      },
    },
    {
      title_i18n: { ar: "شحن فائق السرعة", en: "Ultra-fast shipping" },
      body_i18n: {
        ar: "أغلب الطلبات توصل خلال ٢٤ ساعة من تثبيت الطلب.",
        en: "Most orders arrive within 24 hours of confirmation.",
      },
    },
    {
      title_i18n: { ar: "كرت الضمان المميز و سياسة الاسترجاع", en: "Premium warranty card & return policy" },
      body_i18n: {
        ar: "عند استلام المنتج يتم التأكد من الجودة والمواصفات والفوحان والثبات بحضور المندوب, اي اختلاف يحق للزبون رفض المنتج ويتم ارجاع قيمته كاملة.\n\nويحق للزبون استعمال العطر والاحتفاظ به لمدة اسبوع كامل من تاريخ استلام الطلب واختباره من راحة منزله. ان لم تعجبه التجربة العطرية او اكتشافه لفرق بالمواصفات المذكورة يحق له ارجاع العطر واستلام قيمته من قبلنا.",
        en: "On delivery, quality, projection and longevity are verified with the courier present — any mismatch entitles you to refuse the product for a full refund.\n\nYou may keep and test the perfume for a full week from delivery; if the experience disappoints or the specs differ, return it for a full refund.",
      },
    },
    {
      title_i18n: { ar: "عطور اصلية", en: "Authentic perfumes" },
      body_i18n: {
        ar: "جميع عطورنا مختارة يدوياً وبعناية من افخم المصادر العالمية, ومن اجود انواع العطور والخامات العطرية. لا نتعامل بالعطور التركية المصنعة بالجملة او العطور الصينية الرديئة",
        en: "Every perfume is hand-picked from premium global sources and the finest aromatic materials. We never deal in bulk-made or low-grade imitations.",
      },
    },
  ],
  call_row: {
    prompt_i18n: { ar: "تحب تحچي ويانا؟", en: "Rather talk to us?" },
    action_i18n: { ar: "اتصل", en: "Call" },
  },
};
```

- [ ] **Step 2: Write the baseline test**

Create `packages/sections/src/_pdp-proof-guarantee-baseline-snapshot.test.tsx`:

```tsx
// =====================================================================
// Slice 1d baselines — the draft's proof gallery and policy accordion,
// frozen BEFORE the stack and guarantee-card code exists
// =====================================================================
// scheniders-iraq's draft image_gallery (whole-picture carousel in 16/5
// strips) and accordion_richtext (quiet rows + the «تحب تحچي ويانا؟» call
// row) as read on 2026-10-30, as server markup in ar and en. Neither path
// had a frozen snapshot; slice 1d edits both files. With none of the 1d
// props set, this markup must stay byte-identical. A diff here is a
// back-compat break, not a snapshot to refresh. Never run this file with -u.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocaleCode } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import accordion_richtext from "./accordion_richtext";
import image_gallery from "./image_gallery";
import { productCtx, productRuntime, saleProduct } from "./_pdp-fixtures";
import { IRAQ_TENANT, lowerCtx } from "./_pdp-lower-fixtures";
import { IRAQ_DRAFT_ACCORDION_BASE, IRAQ_DRAFT_GALLERY_BASE } from "./_pdp-redesign-fixtures";

function renderGallery(locale: LocaleCode): string {
  const Render = image_gallery.render;
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <Render
        props={image_gallery.schema.parse(IRAQ_DRAFT_GALLERY_BASE)}
        ctx={productCtx(saleProduct, { runtime: { ...productRuntime, locale } })}
      />
    </StoreBaseProvider>,
  );
}

function renderAccordion(locale: LocaleCode): string {
  const Render = accordion_richtext.render;
  return renderToStaticMarkup(
    <StoreBaseProvider base="">
      <Render
        props={accordion_richtext.schema.parse(IRAQ_DRAFT_ACCORDION_BASE)}
        ctx={lowerCtx(locale, IRAQ_TENANT)}
      />
    </StoreBaseProvider>,
  );
}

describe("image_gallery — scheniders-iraq draft carousel, frozen", () => {
  it.each(["ar", "en"] as const)("%s", (locale) => {
    expect(renderGallery(locale)).toMatchSnapshot();
  });
});

describe("accordion_richtext — scheniders-iraq draft quiet + call row, frozen", () => {
  it.each(["ar", "en"] as const)("%s", (locale) => {
    expect(renderAccordion(locale)).toMatchSnapshot();
  });
});
```

- [ ] **Step 3: Check the fixture bases equal the live ones**

```bash
(cd packages && supabase db query --linked "SELECT s.sec->'base' AS base FROM tenants t, jsonb_array_elements(t.store_config_v2_draft->'pages') p(page), jsonb_array_elements(p.page->'sections') s(sec) WHERE t.slug='scheniders-iraq' AND p.page->>'page_id'='product' AND s.sec->>'id' IN ('e5da8997-d564-4260-88f2-a6d73031b4ce','370f9b04-c300-4dbe-8ea9-b0f9b2d7f78d') ORDER BY s.sec->>'type'" -o json) > tmp/pdp-1d/bases.json
cat > packages/sections/src/zz-bases-check.test.ts <<'TS'
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { IRAQ_DRAFT_ACCORDION_BASE, IRAQ_DRAFT_GALLERY_BASE } from "./_pdp-redesign-fixtures";
it("fixture bases equal the live draft", () => {
  const rows = JSON.parse(readFileSync("../../tmp/pdp-1d/bases.json", "utf8")).rows;
  expect(IRAQ_DRAFT_ACCORDION_BASE).toEqual(rows[0].base);
  expect(IRAQ_DRAFT_GALLERY_BASE).toEqual(rows[1].base);
});
TS
(cd packages/sections && CI=true pnpm exec vitest run src/zz-bases-check.test.ts)
rm packages/sections/src/zz-bases-check.test.ts
```
Expected: `Tests  1 passed (1)`. The throwaway test is deleted right after (never staged). If the CLI prints the rows under another key than `rows`, adjust the one `JSON.parse(...)` line.

- [ ] **Step 4: Write the frozen snapshots (a new file, so no `-u`)**

```bash
pnpm exec vitest run packages/sections/src/_pdp-proof-guarantee-baseline-snapshot.test.tsx
CI=true pnpm exec vitest run packages/sections/src/_pdp-proof-guarantee-baseline-snapshot.test.tsx
f=packages/sections/src/__snapshots__/_pdp-proof-guarantee-baseline-snapshot.test.tsx.snap
for k in data-gallery-open 'tel:+9647779703832' 'dir="auto"' 'تحب تحچي ويانا؟'; do printf '%s: ' "$k"; grep -o -- "$k" $f | wc -l | tr -d ' '; done
```
Expected:
- first run: `Snapshots  4 written`, `Tests  4 passed (4)`; second run (CI): `Tests  4 passed (4)` with no `written`;
- counts `18 2 10 1`: 9 viewer buttons per gallery render, the call row's `tel:` in each accordion render, 5 `dir="auto"` paragraphs per accordion render, the Arabic call prompt in the ar render.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add packages/sections/src/_pdp-redesign-fixtures.ts packages/sections/src/_pdp-proof-guarantee-baseline-snapshot.test.tsx packages/sections/src/__snapshots__/_pdp-proof-guarantee-baseline-snapshot.test.tsx.snap
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "test(sections): freeze scheniders-iraq's draft proof carousel and policy accordion before 1d" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `image_gallery` stack props

**Files:**
- Modify: `packages/sections/src/image_gallery.tsx` (`schema`, `SIZES`)
- Test: `packages/sections/src/_image-gallery-stack-props.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/_image-gallery-stack-props.test.ts`:

```ts
// =====================================================================
// PDP redesign 1d — image_gallery's stack props parse safely
// =====================================================================
// Every new prop is optional and `.catch`-guarded: a bad or rolled-back
// stored value drops only that prop (or that item field), never the
// section. `layout` now falls back to "grid" instead of dropping the
// section; every valid value parses as before.
// =====================================================================

import { describe, expect, it } from "vitest";
import image_gallery from "./image_gallery";

const schema = image_gallery.schema;

const SHOT = "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/536e8d88-e55a-49f0-a9b3-305b69cbfbf5.jpeg";

const ITEM = {
  url: SHOT,
  alt_i18n: { ar: "تعليق" },
  quote_i18n: { ar: "اول مره يوصلني عطر ويطلع كلام الاعلان كله صحيح" },
  doubt_i18n: { ar: "خايف يطلع مثل كل إعلان؟" },
  author: "المحامي زياد طارق الحديدي",
  is_business: false,
  width: 828,
  height: 253,
  crop: { left: 12, right: 2 },
};

const STACK = {
  heading_i18n: { ar: "كلامهم مو كلامنا" },
  layout: "stack",
  initial_count: 3,
  source_label_i18n: { ar: "تعليقات على إعلاناتنا بتيك توك" },
  scope: "store",
  legend_i18n: { ar: "هاي العلامة يعني سوّينا لايك للتعليق من حسابنا" },
  legend_image_url: "https://cdn.example.com/logo.png",
  heading_style: "chapter",
  images: [ITEM],
};

describe("image_gallery slice 1d props", () => {
  it("accepts the stack config", () => {
    expect(schema.parse(STACK)).toEqual(STACK);
  });

  it("an unknown layout falls back to grid instead of dropping the section", () => {
    const parsed = schema.safeParse({ ...STACK, layout: "mosaic" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.layout).toBe("grid");
  });

  it.each(["masonry", "grid", "carousel", "stack"] as const)("layout %s parses as itself", (layout) => {
    expect(schema.parse({ ...STACK, layout }).layout).toBe(layout);
  });

  it.each<[string, unknown]>([
    ["initial_count", 0],
    ["initial_count", 13],
    ["source_label_i18n", "TikTok"],
    ["scope", "everyone"],
    ["legend_i18n", 7],
    ["legend_image_url", 7],
    ["heading_style", "huge"],
  ])("a bad %s (%j) falls back to absent", (key, value) => {
    const parsed = schema.parse({ ...STACK, [key]: value });
    expect(parsed[key as keyof typeof parsed]).toBeUndefined();
    expect(parsed.layout).toBe("stack");
  });

  it.each<[string, unknown]>([
    ["quote_i18n", "plain"],
    ["doubt_i18n", ["x"]],
    ["author", "x".repeat(81)],
    ["is_business", "yes"],
    ["width", 0],
    ["height", 4001],
    ["crop", { left: 41, right: 2 }],
    ["crop", { left: 12 }],
  ])("a bad item %s (%j) drops only that field", (key, value) => {
    const parsed = schema.parse({ ...STACK, images: [{ ...ITEM, [key]: value }] });
    const img = parsed.images[0];
    expect(img?.[key as keyof typeof img]).toBeUndefined();
    expect(img?.url).toBe(SHOT);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/_image-gallery-stack-props.test.ts
```
Expected: `Tests  18 failed | 3 passed (21)`. Today `layout` has no `"stack"` (the stack config fails to parse) and zod strips the unknown keys; only "layout masonry/grid/carousel parses as itself" passes.

- [ ] **Step 3: Add the props**

In `packages/sections/src/image_gallery.tsx`, replace:
```ts
const schema = z.object({
  heading_i18n: i18nStringOptional,
  layout: z.enum(["masonry", "grid", "carousel"]),
  images: z.array(
    z.object({
      url: z.string().describe("image"),
      caption_i18n: i18nStringOptional,
      /** Screen-reader description (P1-15). Omitted → caption → "". */
      alt_i18n: i18nStringOptional,
      link_href: z.string().optional(),
      /** Opt-in: the products this picture is about (ids). Read only by
       *  `order: "product_first"`. The name gives it the builder's
       *  product picker (section-field-widgets matches `*product_ids`). */
      product_ids: z.array(z.string()).optional().catch(undefined),
    }),
  ),
```
with:
```ts
const schema = z.object({
  heading_i18n: i18nStringOptional,
  /** "stack" (opt-in) = the proof stack: lead comments with their doubt,
   *  quote and author over a full-width screenshot, the rest behind one
   *  expand button. An unknown stored value falls back to "grid" (the
   *  default) instead of dropping the section. */
  layout: z.enum(["masonry", "grid", "carousel", "stack"]).catch("grid"),
  images: z.array(
    z.object({
      url: z.string().describe("image"),
      caption_i18n: i18nStringOptional,
      /** Screen-reader description (P1-15). Omitted → caption → "". */
      alt_i18n: i18nStringOptional,
      link_href: z.string().optional(),
      /** Opt-in: the products this picture is about (ids). Read only by
       *  `order: "product_first"`. The name gives it the builder's
       *  product picker (section-field-widgets matches `*product_ids`). */
      product_ids: z.array(z.string()).optional().catch(undefined),
      /** Stack only: the comment's strongest line, verbatim, shown as live
       *  text in «». Absent → a screenshot-only row. */
      quote_i18n: i18nStringOptional.catch(undefined),
      /** Stack only: the buyer's doubt this comment answers (the eyebrow). */
      doubt_i18n: i18nStringOptional.catch(undefined),
      /** Stack only: the commenter's display name, as written. */
      author: z.string().max(80).optional().catch(undefined),
      /** Stack only: a business account (tagged «حساب شركة»). */
      is_business: z.boolean().optional().catch(undefined),
      /** Stack only: the stored file's pixel size. Both set → the picture
       *  keeps its natural ratio (and `crop` applies); else a 4/1 box. */
      width: z.number().int().min(1).max(4000).optional().catch(undefined),
      height: z.number().int().min(1).max(4000).optional().catch(undefined),
      /** Stack only: percent of the uncropped width cut from each side
       *  (TikTok's avatar column, its scrollbar strip). */
      crop: z
        .object({ left: z.number().min(0).max(40), right: z.number().min(0).max(40) })
        .optional()
        .catch(undefined),
    }),
  ),
```

Replace:
```ts
  order: z.enum(["product_first"]).optional().catch(undefined),
});
```
with:
```ts
  order: z.enum(["product_first"]).optional().catch(undefined),
  /** Stack: how many comments lead (with doubt and quote); the rest
   *  open behind «شوف N تعليقات ثانية». Absent = 3. */
  initial_count: z.number().int().min(1).max(12).optional().catch(undefined),
  /** Stack: the source pill under the heading («تعليقات على إعلاناتنا بتيك توك»). */
  source_label_i18n: i18nStringOptional.catch(undefined),
  /** Stack: "store" adds the scope line «3 من أصل 9، على عطورنا بشكل
   *  عام» (the comments are about the shop, not this product). */
  scope: z.enum(["store", "product"]).optional().catch(undefined),
  /** Stack: one line after the first comment explaining the
   *  "liked by us" mark on the screenshots. */
  legend_i18n: i18nStringOptional.catch(undefined),
  /** Stack: the mark's picture beside the legend (the store logo as it
   *  appears on TikTok). Absent → `branding.logo_url`; neither → text only. */
  legend_image_url: z.string().describe("image").optional().catch(undefined),
  /** "chapter" renders the heading at the redesign's one chapter scale
   *  (ChapterHeading). Absent = today's heading, in every layout. */
  heading_style: z.enum(["section", "chapter"]).optional().catch(undefined),
});
```

Replace:
```ts
const SIZES: Record<Props["layout"], string> = {
  carousel: "280px",
```
with:
```ts
const SIZES: Record<Props["layout"], string> = {
  stack: "(max-width: 640px) calc(100vw - 2rem), 600px",
  carousel: "280px",
```

- [ ] **Step 4: Run the test and every gallery baseline**

```bash
CI=true pnpm exec vitest run packages/sections/src/_image-gallery-stack-props.test.ts packages/sections/src/_image-gallery-baseline-snapshot.test.tsx packages/sections/src/_image-gallery-whole.test.tsx packages/sections/src/_pdp-proof-guarantee-baseline-snapshot.test.tsx packages/sections/src/_image-gallery-product-order.test.tsx
```
Expected: `Test Files  5 passed (5)`, `Tests  64 passed (64)`, no `written`/`updated`. (A `"stack"` layout renders only its heading until Task 5.)

- [ ] **Step 5: Type gate, then commit**

Run the sections type gate. Expected: no output.
```bash
git branch --show-current
git add packages/sections/src/image_gallery.tsx packages/sections/src/_image-gallery-stack-props.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): image_gallery stack props (opt-in); a bad layout falls back to grid" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The proof stack's chrome strings

**Files:**
- Create: `packages/sections/src/image_gallery.strings.ts`
- Modify: `packages/sections/src/_string-tables.ts`
- Test: `packages/sections/src/image_gallery.strings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/image_gallery.strings.test.ts`:

```ts
// The proof stack's chrome strings: the expand label takes the Arabic
// plural forms (1 / 2 / 3–10 / 11+) through formatCount, the scope line
// fills both counts, and every table entry resolves in ar, en and ku.

import { describe, expect, it } from "vitest";
import { GALLERY_STRINGS, gs, proofMoreLabel } from "./image_gallery.strings";

describe("proofMoreLabel", () => {
  it.each([
    [1, "شوف تعليق ثاني"],
    [2, "شوف تعليقين ثانيين"],
    [6, "شوف 6 تعليقات ثانية"],
    [11, "شوف 11 تعليق ثاني"],
  ])("ar %i → %s", (count, expected) => {
    expect(proofMoreLabel(count, "ar")).toBe(expected);
  });

  it.each([
    [1, "See 1 more comment"],
    [6, "See 6 more comments"],
  ])("en %i → %s", (count, expected) => {
    expect(proofMoreLabel(count, "en")).toBe(expected);
  });

  it("ku uses its own table", () => {
    expect(proofMoreLabel(6, "ku")).toBe("6 لێدوانی تر ببینە");
  });
});

describe("gs", () => {
  it("fills the scope line", () => {
    expect(gs("proofScope", "ar", { shown: 3, total: 9 })).toBe("3 من أصل 9، على عطورنا بشكل عام");
    expect(gs("proofScope", "en", { shown: 3, total: 9 })).toBe("3 of 9, about our perfumes in general");
  });

  it("every entry has ar, en and ku", () => {
    for (const entry of Object.values(GALLERY_STRINGS)) {
      expect(Object.keys(entry).sort()).toEqual(["ar", "en", "ku"]);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/image_gallery.strings.test.ts
```
Expected: `Error: Failed to load url ./image_gallery.strings`, `Test Files  1 failed (1)`, `Tests  no tests`.

- [ ] **Step 3: Write the table**

Create `packages/sections/src/image_gallery.strings.ts`:

```ts
// Chrome strings for image_gallery's opt-in stack layout (the proof
// stack, spec §1.5). Generic UI text only: the heading, the source pill,
// the legend, the doubts and the quotes are merchant props. Every entry
// carries ar, en and ku (guarded by _kurdish-coverage via
// _string-tables.ts). The expand label goes through formatCount, so 1, 2,
// 3–10 and 11+ each read correctly in Arabic.

import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { formatCount } from "./helpers/format";

export const GALLERY_STRINGS = {
  proofScope: {
    en: "{shown} of {total}, about our perfumes in general",
    ar: "{shown} من أصل {total}، على عطورنا بشكل عام",
    ku: "{shown} لە {total}، دەربارەی بۆنەکانمان بە گشتی",
  },
  proofMoreOne: { en: "See {count} more comment", ar: "شوف تعليق ثاني", ku: "لێدوانێکی تر ببینە" },
  proofMoreTwo: { en: "See {count} more comments", ar: "شوف تعليقين ثانيين", ku: "{count} لێدوانی تر ببینە" },
  proofMoreFew: { en: "See {count} more comments", ar: "شوف {count} تعليقات ثانية", ku: "{count} لێدوانی تر ببینە" },
  proofMoreMany: { en: "See {count} more comments", ar: "شوف {count} تعليق ثاني", ku: "{count} لێدوانی تر ببینە" },
  proofLess: { en: "Hide the comments", ar: "سدّ التعليقات", ku: "لێدوانەکان دابخە" },
  business: { en: "Business account", ar: "حساب شركة", ku: "هەژماری کۆمپانیا" },
} as const;

export type GalleryStringKey = keyof typeof GALLERY_STRINGS;

/** One chrome string, with `{name}` tokens filled. */
export function gs(
  key: GalleryStringKey,
  locale: LocaleCode,
  vars?: Record<string, string | number>,
): string {
  let out = resolveI18n(GALLERY_STRINGS[key], locale);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(String(v));
    }
  }
  return out;
}

/** «شوف 6 تعليقات ثانية» — the stack's expand label, plural-correct. */
export function proofMoreLabel(count: number, locale: LocaleCode): string {
  return formatCount(count, locale, {
    one: gs("proofMoreOne", locale),
    two: gs("proofMoreTwo", locale),
    few: gs("proofMoreFew", locale),
    many: gs("proofMoreMany", locale),
    other: gs("proofMoreMany", locale),
  });
}
```
(ar/en are spec §1.5's strings; the 1/2/11+ Arabic forms and every ku go to Ali's copy review, to-dos 8 and 10.)

In `packages/sections/src/_string-tables.ts`, replace:
```ts
  "helpers/vcard.ts",
];
```
with:
```ts
  "helpers/vcard.ts",
  "image_gallery.strings.ts",
];
```

- [ ] **Step 4: Run it and the Kurdish coverage**

```bash
CI=true pnpm exec vitest run packages/sections/src/image_gallery.strings.test.ts packages/sections/src/_kurdish-coverage.test.ts
```
Expected: `Test Files  2 passed (2)`, `Tests  20 passed (20)` (strings 9; coverage 11, one more than before for the new file).

- [ ] **Step 5: Type gate, then commit**

Run the sections type gate. Expected: no output.
```bash
git branch --show-current
git add packages/sections/src/image_gallery.strings.ts packages/sections/src/image_gallery.strings.test.ts packages/sections/src/_string-tables.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): proof-stack chrome strings (ar/en/ku), plural-correct expand label" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Crop maths

**Files:**
- Create: `packages/sections/src/image-gallery-crop.ts`
- Test: `packages/sections/src/image-gallery-crop.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/image-gallery-crop.test.ts`:

```ts
// The proof stack's screenshot box (spec §1.5 "Crop maths"): `left` /
// `right` are percents of the uncropped width; the box keeps the cropped
// width over the full height, so nothing is cut at the bottom.

import { describe, expect, it } from "vitest";
import { stackFrame } from "./image-gallery-crop";

describe("stackFrame", () => {
  it("the spec example: { left: 12, right: 2 } on 828×253", () => {
    expect(stackFrame({ width: 828, height: 253, crop: { left: 12, right: 2 } })).toEqual({
      kind: "sized",
      aspectRatio: "712.08 / 253",
      imageWidth: "116.28%",
      imageLeft: "-13.95%",
    });
  });

  it("a symmetric crop keeps 80% of the width", () => {
    expect(stackFrame({ width: 1000, height: 500, crop: { left: 10, right: 10 } })).toEqual({
      kind: "sized",
      aspectRatio: "800 / 500",
      imageWidth: "125%",
      imageLeft: "-12.5%",
    });
  });

  it("no crop: the natural ratio, the image at full width", () => {
    expect(stackFrame({ width: 828, height: 160 })).toEqual({
      kind: "sized",
      aspectRatio: "828 / 160",
      imageWidth: "100%",
      imageLeft: "0%",
    });
  });

  it.each([
    [{ height: 253 }],
    [{ width: 828 }],
    [{ crop: { left: 12, right: 2 } }],
  ])("without both sizes: a 4/1 fill box and no crop (%j)", (input) => {
    expect(stackFrame(input)).toEqual({ kind: "fill" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/image-gallery-crop.test.ts
```
Expected: `Error: Failed to load url ./image-gallery-crop`, `Tests  no tests`.

- [ ] **Step 3: Write the maths**

Create `packages/sections/src/image-gallery-crop.ts`:

```ts
// The proof stack's screenshot box (image_gallery `layout: "stack"`,
// spec §1.5). With the stored file's size known, the box keeps the
// picture's natural height and only the cropped width:
//   k = 1 − left − right (as fractions of the uncropped width)
//   box aspect-ratio = (width × k) / height
//   image width = 100 / k %, offset left −(left / k) %
// so the comment text keeps its size and nothing is cut at the bottom.
// The offset is a physical `left`: the document is always LTR. Without
// both sizes there is nothing to compute from: a 4/1 `fill` box, no crop.

export type StackFrame =
  | { kind: "sized"; aspectRatio: string; imageWidth: string; imageLeft: string }
  | { kind: "fill" };

/** Two decimals, no trailing zeros (116.28, 12.5, 0). */
function num(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export function stackFrame(img: {
  width?: number;
  height?: number;
  crop?: { left: number; right: number };
}): StackFrame {
  if (!img.width || !img.height) return { kind: "fill" };
  const left = img.crop?.left ?? 0;
  const right = img.crop?.right ?? 0;
  // Percent of the width kept: 20–100 (each side is capped at 40 by the schema).
  const kept = 100 - left - right;
  return {
    kind: "sized",
    aspectRatio: `${num((img.width * kept) / 100)} / ${img.height}`,
    imageWidth: `${num(10000 / kept)}%`,
    imageLeft: `${num((-left * 100) / kept)}%`,
  };
}
```

- [ ] **Step 4: Run it**

```bash
CI=true pnpm exec vitest run packages/sections/src/image-gallery-crop.test.ts
```
Expected: `Tests  6 passed (6)`.

- [ ] **Step 5: Type gate, then commit**

Run the sections type gate. Expected: no output.
```bash
git branch --show-current
git add packages/sections/src/image-gallery-crop.ts packages/sections/src/image-gallery-crop.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): proof-stack crop maths (natural height, horizontal crop)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The proof stack (server render + expand island)

**Files:**
- Create: `packages/sections/src/image_gallery.stack.tsx`
- Modify: `packages/sections/src/image_gallery.tsx` (header comment, imports, three new components, the image list, the heading and the stack branch)
- Test: `packages/sections/src/image_gallery.stack.test.tsx` (jsdom), `packages/sections/src/_image-gallery-stack.test.tsx`

- [ ] **Step 1: Write the failing island test**

Create `packages/sections/src/image_gallery.stack.test.tsx`:

```tsx
// @vitest-environment jsdom
// =====================================================================
// image_gallery stack — the expand/collapse island
// =====================================================================
// The rest of the comments start hidden; one tap shows them in place and
// relabels the same button «سدّ التعليقات»; a second tap hides them again.
// The button names the list it controls.
// =====================================================================

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ProofStackMore } from "./image_gallery.stack";

afterEach(cleanup);

function setup() {
  return render(
    <ProofStackMore listId="proof-rest" moreLabel="شوف 6 تعليقات ثانية" lessLabel="سدّ التعليقات" rtl>
      <li>عباس</li>
      <li>Alpha decorations company</li>
    </ProofStackMore>,
  );
}

describe("ProofStackMore", () => {
  it("starts closed: the list hidden, the button says how many are behind it", () => {
    const { getByRole, container } = setup();
    const list = container.querySelector("#proof-rest");
    expect(list?.hasAttribute("hidden")).toBe(true);
    const button = getByRole("button");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-controls")).toBe("proof-rest");
    expect(button.textContent).toContain("شوف 6 تعليقات ثانية");
  });

  it("a tap opens the rest in place; a second tap closes it", () => {
    const { getByRole, container } = setup();
    const button = getByRole("button");
    fireEvent.click(button);
    expect(container.querySelector("#proof-rest")?.hasAttribute("hidden")).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.textContent).toContain("سدّ التعليقات");
    fireEvent.click(button);
    expect(container.querySelector("#proof-rest")?.hasAttribute("hidden")).toBe(true);
    expect(button.textContent).toContain("شوف 6 تعليقات ثانية");
  });

  it("flips its row for Arabic with a class, never dir", () => {
    const { getByRole, container } = setup();
    expect(getByRole("button").className).toContain("flex-row-reverse");
    expect(container.querySelector("[dir]")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/image_gallery.stack.test.tsx
```
Expected: `Error: Failed to load url ./image_gallery.stack`, `Tests  no tests`.

- [ ] **Step 3: Write the island**

Create `packages/sections/src/image_gallery.stack.tsx`:

```tsx
"use client";

// =====================================================================
// image_gallery — the proof stack's expand/collapse island
// =====================================================================
// The comments are server-rendered (lead and rest alike, so every one is
// in the HTML for crawlers and find-in-page). This island only owns the
// open state: the rest list stays `hidden` until «شوف N تعليقات ثانية»
// is tapped, and the same button then reads «سدّ التعليقات». A hidden
// list's lazy screenshots are not fetched until it opens. Labels arrive
// resolved from the server module.
// =====================================================================

import { useState } from "react";
import type { ReactNode } from "react";
import { cn } from "./helpers/utils";
import { MaterialIcon } from "./helpers/primitives";

export function ProofStackMore({
  listId,
  moreLabel,
  lessLabel,
  rtl,
  children,
}: {
  listId: string;
  moreLabel: string;
  lessLabel: string;
  rtl: boolean;
  /** The rest of the comments, as <li> rows. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ol
        id={listId}
        data-proof-rest="true"
        hidden={!open}
        className="mt-bk-lg divide-y divide-bk-divider"
      >
        {children}
      </ol>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "mt-bk-lg flex min-h-[52px] w-full items-center gap-3 rounded-bk-pill border-bk border-bk-divider bg-bk-surface-alt p-1.5 font-bk-body text-[15px] font-extrabold text-bk-ink transition-transform duration-bk-fast active:scale-[0.98] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 ring-bk-focus",
          rtl ? "flex-row-reverse pl-4" : "pr-4",
        )}
      >
        <span
          aria-hidden="true"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-bk-pill bg-bk-secondary text-bk-primary"
        >
          <MaterialIcon name={open ? "remove" : "add"} className="text-xl" />
        </span>
        <span className={cn("flex-1", rtl ? "text-right" : "text-left")}>
          {open ? lessLabel : moreLabel}
        </span>
      </button>
    </>
  );
}
```

- [ ] **Step 4: Run it**

```bash
CI=true pnpm exec vitest run packages/sections/src/image_gallery.stack.test.tsx
```
Expected: `Tests  3 passed (3)`.

- [ ] **Step 5: Write the failing markup test**

Create `packages/sections/src/_image-gallery-stack.test.tsx`:

```tsx
// =====================================================================
// image_gallery `layout: "stack"` — the proof stack (spec §1.5), markup
// =====================================================================
// Server markup only (the expand/collapse island has its own jsdom test):
// heading, source pill and scope line; the lead comments in order with a
// numbered doubt, the quote as live text in «», the author in <bdi> and a
// full-width screenshot whose box follows the crop maths; the legend once,
// after the first comment; the rest hidden behind one plural-correct
// button; a business tag; no dir attribute and no yellow fill.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import image_gallery from "./image_gallery";
import type { SectionRenderContext } from "./_types";
import { fixtureTenant, productCtx, productRuntime, saleProduct } from "./_pdp-fixtures";

const Gallery = image_gallery.render;

function render(input: unknown, overrides: Partial<SectionRenderContext> = {}): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <Gallery props={image_gallery.schema.parse(input)} ctx={productCtx(saleProduct, overrides)} />
    </StoreBaseProvider>,
  );
}

const count = (html: string, needle: string): number => html.split(needle).length - 1;

const SHOTS = "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/";
const LOGO = "https://cdn.example.com/fixture/logo.png";

const LEAD = [
  {
    url: `${SHOTS}p5.jpeg`,
    alt_i18n: { ar: "تعليق زياد: وصلني العطر فعلاً راقي" },
    doubt_i18n: { ar: "خايف يطلع مثل كل إعلان؟", en: "Afraid it's like every ad?" },
    quote_i18n: { ar: "اول مره يوصلني عطر ويطلع كلام الاعلان كله صحيح" },
    author: "المحامي زياد طارق الحديدي",
    width: 828,
    height: 253,
    crop: { left: 12, right: 2 },
  },
  {
    url: `${SHOTS}p2.jpeg`,
    alt_i18n: { ar: "تعليق dy4axauduv7j" },
    doubt_i18n: { ar: "أول رشة ما فاحت؟" },
    quote_i18n: { ar: "لاتقيس من اول مترش انتظر ربع ساعه" },
    author: "dy4axauduv7j",
    width: 828,
    height: 256,
    crop: { left: 12, right: 2 },
  },
  // No quote: a screenshot-only row, and no size: a 4/1 box.
  { url: `${SHOTS}p4.jpeg`, alt_i18n: { ar: "تعليق Nano" }, author: "Nano" },
];
const REST = [
  { url: `${SHOTS}p3.jpeg`, alt_i18n: { ar: "تعليق عباس" }, author: "عباس", width: 828, height: 208, crop: { left: 12, right: 2 } },
  { url: `${SHOTS}p1.jpeg`, alt_i18n: { ar: "تعليق Alpha" }, author: "Alpha decorations company", is_business: true, width: 828, height: 163 },
];

const STACK = {
  heading_i18n: { ar: "كلامهم مو كلامنا", en: "Their words, not ours" },
  layout: "stack",
  scope: "store",
  initial_count: 3,
  heading_style: "chapter",
  source_label_i18n: { ar: "تعليقات على إعلاناتنا بتيك توك", en: "Comments on our TikTok ads" },
  legend_i18n: { ar: "هاي العلامة يعني سوّينا لايك للتعليق من حسابنا", en: "This mark means we liked the comment" },
  legend_image_url: LOGO,
  images: [...LEAD, ...REST],
};

describe("image_gallery stack", () => {
  const ar = render(STACK);
  const en = render(STACK, { runtime: { ...productRuntime, locale: "en" } });

  it("heads with the chapter heading, the source pill and the scope line", () => {
    expect(ar).toContain("text-bk-chapter");
    expect(ar).toMatch(/data-proof-source="true"[^>]*>.*forum.*تعليقات على إعلاناتنا بتيك توك/);
    expect(ar).toContain("3 من أصل 5، على عطورنا بشكل عام");
    expect(en).toContain("3 of 5, about our perfumes in general");
  });

  it("the scope line only for scope store", () => {
    expect(render({ ...STACK, scope: "product" })).not.toContain("من أصل");
    expect(render({ ...STACK, scope: undefined })).not.toContain("من أصل");
  });

  it("leads with the first initial_count comments, in order, numbered", () => {
    const lead = ar.slice(0, ar.indexOf("data-proof-rest"));
    expect(count(lead, "data-proof-item=")).toBe(3);
    expect([...lead.matchAll(/data-proof-doubt="(\d)"/g)].map((m) => m[1])).toEqual(["1", "2"]);
    expect(lead.indexOf("خايف يطلع مثل كل إعلان؟")).toBeLessThan(lead.indexOf("أول رشة ما فاحت؟"));
    expect(lead).toContain("«اول مره يوصلني عطر ويطلع كلام الاعلان كله صحيح»");
    expect(lead).toContain("<bdi>المحامي زياد طارق الحديدي</bdi>");
  });

  it("a comment without a quote is a screenshot-only row", () => {
    const nano = ar.slice(ar.indexOf('data-proof-item="2"'), ar.indexOf("data-proof-rest"));
    expect(nano).not.toContain("data-proof-doubt");
    expect(nano).not.toContain("data-proof-quote");
    expect(nano).toContain("<bdi>Nano</bdi>");
  });

  it("crops a sized screenshot by the maths and keeps the natural height", () => {
    expect(ar).toContain("aspect-ratio:712.08 / 253");
    expect(ar).toMatch(/width:116\.28%;left:-13\.95%/);
    expect(ar).toContain("aspect-ratio:828 / 163");
  });

  it("an unsized screenshot sits in a 4/1 box", () => {
    expect(count(ar, "aspect-[4/1]")).toBe(1);
  });

  it("explains the mark once, after the first comment", () => {
    expect(count(ar, "data-proof-legend")).toBe(1);
    expect(ar.indexOf("data-proof-legend")).toBeGreaterThan(ar.indexOf('data-proof-item="0"'));
    expect(ar.indexOf("data-proof-legend")).toBeLessThan(ar.indexOf('data-proof-item="1"'));
    expect(ar).toContain(`src="${LOGO}"`);
  });

  it("the legend falls back to the store logo, then to text only", () => {
    const branded = render(
      { ...STACK, legend_image_url: undefined },
      { tenant: { ...fixtureTenant, branding: { logo_url: "https://cdn.example.com/fixture/brand.png" } } },
    );
    expect(branded).toContain('src="https://cdn.example.com/fixture/brand.png"');
    const bare = render({ ...STACK, legend_image_url: undefined });
    const legend = bare.slice(bare.indexOf("data-proof-legend"), bare.indexOf('data-proof-item="1"'));
    expect(legend).not.toContain("<img");
    expect(legend).toContain("هاي العلامة يعني سوّينا لايك للتعليق من حسابنا");
  });

  it("hides the rest behind one plural-correct button", () => {
    expect(ar).toMatch(/<ol[^>]*data-proof-rest="true"[^>]*hidden=""/);
    expect(ar).toMatch(/aria-expanded="false"[^>]*>.*شوف تعليقين ثانيين/);
    expect(en).toContain("See 2 more comments");
  });

  it("tags the business account", () => {
    expect(ar).toMatch(/<bdi>Alpha decorations company<\/bdi><span[^>]*data-proof-business="true"[^>]*>حساب شركة</);
    expect(count(ar, "data-proof-business")).toBe(1);
  });

  it("no expand button with initial_count or fewer comments", () => {
    const three = render({ ...STACK, images: LEAD });
    expect(three).not.toContain("data-proof-rest");
    expect(three).not.toContain("aria-expanded");
  });

  it("every screenshot opens the viewer, in stack order", () => {
    expect([...ar.matchAll(/data-gallery-open="(\d)"/g)].map((m) => m[1])).toEqual(["0", "1", "2", "3", "4"]);
    expect(ar).toContain('aria-label="كبّر الصورة: تعليق زياد: وصلني العطر فعلاً راقي"');
  });

  it("ignores display, frame and order", () => {
    const tagged = {
      ...STACK,
      display: "whole",
      frame: "strip",
      order: "product_first",
      images: STACK.images.map((img, i) => (i === 4 ? { ...img, product_ids: [saleProduct.id] } : img)),
    };
    expect(render(tagged)).toBe(ar);
  });

  it("reads right to left with classes, never dir, and no yellow fill", () => {
    expect(ar).not.toMatch(/\sdir="/);
    expect(ar).toContain("flex-row-reverse");
    expect(ar).not.toContain("bg-bk-primary");
    expect(en).not.toMatch(/\sdir="/);
  });

  it("without heading_style the heading is today's section header", () => {
    const plain = render({ ...STACK, heading_style: undefined });
    expect(plain).not.toContain("text-bk-chapter");
    expect(plain).toContain("كلامهم مو كلامنا");
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/_image-gallery-stack.test.tsx
```
Expected: `Tests  11 failed | 4 passed (15)`. The four that pass by construction pin negatives once the stack exists ("the scope line only for scope store", "no expand button with initial_count or fewer comments", "ignores display, frame and order", "without heading_style the heading is today's section header").

- [ ] **Step 7: Render the stack**

In `packages/sections/src/image_gallery.tsx`:

Replace (header comment):
```ts
// Empty state: a freshly added section still carries the untouched
```
with:
```ts
// Opt-in `layout: "stack"` (the PDP proof stack, spec §1.5): a source
// pill and an optional scope line under the heading, then the first
// `initial_count` comments as live text — a numbered doubt, the quote in
// «», the author — each over its full-width screenshot, cropped to the
// comment column by `crop` (image-gallery-crop.ts) at the file's natural
// height. A legend explains the "liked by us" mark once, after the first
// comment. The rest stay in the HTML, hidden behind one expand button
// (image_gallery.stack.tsx). Every screenshot opens the viewer. `display`,
// `frame` and `order` are ignored by the stack.
//
// Opt-in `heading_style: "chapter"` draws the heading with ChapterHeading
// in every layout. Absent, today's CenteredSectionHeader.
//
// Empty state: a freshly added section still carries the untouched
```

Replace:
```ts
import { isOptimizableImageHost } from "./helpers/image";
import { CarouselArrows } from "./helpers/carousel-arrows";
import { cn, PRESSABLE } from "./helpers/utils";
import { chromeString } from "./helpers/chrome-strings";
import { i18nStringOptional } from "./_schema";
import { GalleryViewer } from "./image_gallery.client";
import { orderGalleryImages } from "./image-gallery-order";
```
with:
```ts
import { ChapterHeading } from "./helpers/chapter-heading";
import { isOptimizableImageHost } from "./helpers/image";
import { readsRtl } from "./helpers/reading";
import { CarouselArrows } from "./helpers/carousel-arrows";
import { cn, PRESSABLE } from "./helpers/utils";
import { chromeString } from "./helpers/chrome-strings";
import { i18nStringOptional } from "./_schema";
import { GalleryViewer } from "./image_gallery.client";
import { ProofStackMore } from "./image_gallery.stack";
import { gs, proofMoreLabel } from "./image_gallery.strings";
import { stackFrame } from "./image-gallery-crop";
import { orderGalleryImages } from "./image-gallery-order";
```

Replace:
```ts
/** Module-scope card (not declared inside the render — a per-render
```
with:
```tsx
/** One screenshot of the stack: a full-width box at the file's natural
 *  height, cropped to the comment column when its size is known (else a
 *  4/1 box), as a viewer button (or the merchant's link). */
function StackShot({
  img,
  alt,
  viewer,
}: {
  img: GalleryImage;
  alt: string;
  viewer: { index: number; label: string } | null;
}) {
  const frame = stackFrame(img);
  const picture =
    frame.kind === "sized" && img.width && img.height ? (
      <Image
        src={img.url}
        alt={alt}
        width={img.width}
        height={img.height}
        unoptimized={!isOptimizableImageHost(img.url)}
        sizes={SIZES.stack}
        className="absolute top-0 h-auto max-w-none"
        style={{ width: frame.imageWidth, left: frame.imageLeft }}
      />
    ) : (
      <Image
        src={img.url}
        alt={alt}
        fill
        unoptimized={!isOptimizableImageHost(img.url)}
        sizes={SIZES.stack}
        className="absolute inset-0 h-full w-full object-contain"
      />
    );
  const boxCls = cn(
    "relative block w-full overflow-hidden rounded-bk-card bg-bk-surface-alt",
    frame.kind === "fill" && "aspect-[4/1]",
  );
  const boxStyle = frame.kind === "sized" ? { aspectRatio: frame.aspectRatio } : undefined;
  if (img.link_href) {
    return (
      <StoreLink href={img.link_href} className={cn("block", PRESSABLE)}>
        <span className={boxCls} style={boxStyle}>
          {picture}
        </span>
      </StoreLink>
    );
  }
  if (!viewer) return null;
  return (
    <button
      type="button"
      data-gallery-open={viewer.index}
      aria-haspopup="dialog"
      aria-label={viewer.label}
      className={cn(
        boxCls,
        "cursor-zoom-in text-start focus-visible:outline-none focus-visible:ring-2 ring-bk-focus ring-offset-2",
        PRESSABLE,
      )}
      style={boxStyle}
    >
      {picture}
    </button>
  );
}

/** The author line: the name as written (<bdi>), and the business tag. */
function StackAuthor({
  img,
  locale,
  rtl,
}: {
  img: GalleryImage;
  locale: LocaleCode;
  rtl: boolean;
}) {
  if (!img.author && !img.is_business) return null;
  return (
    <p
      className={cn(
        "mb-bk-xs flex items-center gap-2 font-bk-body text-[13px] font-bold text-bk-ink [overflow-wrap:anywhere]",
        rtl ? "flex-row-reverse text-right" : "text-left",
      )}
    >
      {img.author && <bdi>{img.author}</bdi>}
      {img.is_business && (
        <span
          data-proof-business="true"
          className="shrink-0 rounded-bk-pill border-bk border-bk-divider bg-bk-surface-alt px-2 text-xs font-bold text-bk-ink-soft"
        >
          {gs("business", locale)}
        </span>
      )}
    </p>
  );
}

/** The opt-in `layout: "stack"` proof stack. `images` arrive filtered and
 *  in the merchant's order (never re-ordered). */
function ProofStack({
  props,
  images,
  ctx,
  listId,
  heading,
}: {
  props: Props;
  images: GalleryImage[];
  ctx: SectionRenderContext;
  listId: string;
  heading: string;
}) {
  const locale = ctx.runtime.locale;
  const rtl = readsRtl(locale);
  const strings = locale === "en" ? VIEWER_STRINGS.en : VIEWER_STRINGS.ar;
  const leadCount = Math.min(props.initial_count ?? 3, images.length);
  const source = resolveI18n(props.source_label_i18n, locale);
  const legend = resolveI18n(props.legend_i18n, locale);
  const legendImage = props.legend_image_url || ctx.tenant.branding?.logo_url || "";
  const altOf = (img: GalleryImage) =>
    resolveI18n(img.alt_i18n, locale) || resolveI18n(img.caption_i18n, locale);

  const unlinked = images.filter((img) => !img.link_href);
  const total = unlinked.length;
  const viewerImages: GalleryViewerImage[] = unlinked.map((img, i) => ({
    url: img.url,
    alt: altOf(img),
    counter: fillCount(strings.counter, i + 1, total),
  }));
  let nextSlot = 0;
  const viewerOf = (img: GalleryImage) => {
    if (img.link_href) return null;
    const slot = nextSlot++;
    const alt = viewerImages[slot]?.alt;
    return {
      index: slot,
      label: alt ? fillAlt(strings.openNamed, alt) : fillCount(strings.open, slot + 1, total),
    };
  };
  const side = rtl ? "text-right" : "text-left";

  const lead = images.slice(0, leadCount).map((img, i) => {
    const quote = resolveI18n(img.quote_i18n, locale);
    const doubt = quote ? resolveI18n(img.doubt_i18n, locale) : "";
    return (
      <li key={i} data-proof-item={i} className="flex flex-col">
        {doubt && (
          <p
            data-proof-doubt={i + 1}
            className={cn(
              "mb-1.5 flex items-center gap-2.5 font-bk-body text-sm font-extrabold text-bk-ink-soft",
              rtl ? "flex-row-reverse text-right" : "text-left",
            )}
          >
            <span
              aria-hidden="true"
              className="inline-flex size-[26px] shrink-0 items-center justify-center rounded-bk-pill bg-bk-secondary text-[13px] font-black tabular-nums text-bk-primary"
            >
              {i + 1}
            </span>
            <span>{doubt}</span>
          </p>
        )}
        {quote && (
          <p
            data-proof-quote="true"
            className={cn("mb-1 font-bk-display text-[20px] font-black leading-snug text-bk-ink text-pretty", side)}
          >
            «{quote}»
          </p>
        )}
        <StackAuthor img={img} locale={locale} rtl={rtl} />
        <StackShot img={img} alt={altOf(img)} viewer={viewerOf(img)} />
        {i === 0 && legend && (
          <div
            data-proof-legend="true"
            className={cn(
              "mt-bk-sm flex items-center gap-2.5 rounded-bk-card bg-bk-surface-alt px-3 py-2.5",
              rtl && "flex-row-reverse",
            )}
          >
            {legendImage && (
              <span aria-hidden="true" className="relative size-[26px] shrink-0">
                <Image
                  src={legendImage}
                  alt=""
                  width={26}
                  height={26}
                  unoptimized={!isOptimizableImageHost(legendImage)}
                  className="size-[26px] rounded-bk-pill object-cover"
                />
                <MaterialIcon name="favorite" className="absolute -bottom-1 -right-1 text-[13px] text-bk-ink" />
              </span>
            )}
            <p className={cn("min-w-0 flex-1 font-bk-body text-sm font-bold text-bk-ink", side)}>{legend}</p>
          </div>
        )}
      </li>
    );
  });

  const rest = images.slice(leadCount).map((img, i) => (
    <li key={i} data-proof-item={leadCount + i} className="py-bk-md first:pt-0">
      <StackAuthor img={img} locale={locale} rtl={rtl} />
      <StackShot img={img} alt={altOf(img)} viewer={viewerOf(img)} />
    </li>
  ));

  const body = (
    <div>
      {(source || props.scope === "store") && (
        <div className={cn("mb-bk-lg flex flex-col gap-bk-xs", rtl ? "items-end" : "items-start")}>
          {source && (
            <span
              data-proof-source="true"
              data-i18n-field="source_label_i18n"
              className={cn(
                "inline-flex min-h-7 items-center gap-1.5 rounded-bk-pill border-bk border-bk-divider bg-bk-surface-alt px-2.5 py-0.5 font-bk-body text-[13px] font-bold text-bk-ink",
                rtl && "flex-row-reverse",
              )}
            >
              <MaterialIcon name="forum" className="text-base" />
              {source}
            </span>
          )}
          {props.scope === "store" && (
            <p className={cn("font-bk-body text-[13px] font-semibold text-bk-ink-soft", side)}>
              {gs("proofScope", locale, { shown: leadCount, total: images.length })}
            </p>
          )}
        </div>
      )}
      <ol className="flex flex-col gap-bk-xl">{lead}</ol>
      {rest.length > 0 && (
        <ProofStackMore
          listId={listId}
          moreLabel={proofMoreLabel(rest.length, locale)}
          lessLabel={gs("proofLess", locale)}
          rtl={rtl}
        >
          {rest}
        </ProofStackMore>
      )}
    </div>
  );

  if (!viewerImages.length) return body;
  return (
    <GalleryViewer
      images={viewerImages}
      labels={{
        close: chromeString("close", locale),
        prev: strings.prev,
        next: strings.next,
      }}
      dialogLabel={heading || strings.viewer}
    >
      {body}
    </GalleryViewer>
  );
}

/** Module-scope card (not declared inside the render — a per-render
```

Replace:
```ts
  const images = orderGalleryImages(
    props.images.filter((img) => img.url.trim().length > 0),
    props.order,
    ctx.product?.id,
  );
```
with:
```ts
  const withUrl = props.images.filter((img) => img.url.trim().length > 0);
  // The stack keeps the merchant's order: it is chosen by the doubt each
  // comment answers, not by product.
  const images =
    props.layout === "stack" ? withUrl : orderGalleryImages(withUrl, props.order, ctx.product?.id);
```

Replace:
```tsx
      {heading && (
        <CenteredSectionHeader
          title={heading}
          align="start"
          titleField="heading_i18n"
        />
      )}
      {props.layout === "masonry" && (
```
with:
```tsx
      {heading &&
        (props.heading_style === "chapter" ? (
          <ChapterHeading title={heading} locale={locale} titleField="heading_i18n" />
        ) : (
          <CenteredSectionHeader
            title={heading}
            align="start"
            titleField="heading_i18n"
          />
        ))}
      {props.layout === "stack" && (
        <ProofStack props={props} images={images} ctx={ctx} listId={trackId} heading={heading} />
      )}
      {props.layout === "masonry" && (
```

Notes: the stack reuses `trackId` (the section's one `useId`) as the rest list's id, so no hook is added and no other layout's ids move. `StackShot` narrows `img.width && img.height` instead of a non-null `!`.

- [ ] **Step 8: Run the stack tests and every gallery baseline**

```bash
CI=true pnpm exec vitest run packages/sections/src/_image-gallery-stack.test.tsx packages/sections/src/image_gallery.stack.test.tsx packages/sections/src/_image-gallery-stack-props.test.ts packages/sections/src/_image-gallery-baseline-snapshot.test.tsx packages/sections/src/_image-gallery-whole.test.tsx packages/sections/src/_pdp-proof-guarantee-baseline-snapshot.test.tsx packages/sections/src/_image-gallery-product-order.test.tsx packages/sections/src/image-gallery-viewer.test.tsx packages/sections/src/_no-hardcoded-white.test.tsx
```
Expected: `Test Files  9 passed (9)`, `Tests  112 passed (112)`, no `written`/`updated`/`obsolete` line.

- [ ] **Step 9: Type gate, then commit**

Run the sections type gate. Expected: no output.
```bash
git branch --show-current
git add packages/sections/src/image_gallery.tsx packages/sections/src/image_gallery.stack.tsx packages/sections/src/image_gallery.stack.test.tsx packages/sections/src/_image-gallery-stack.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): «كلامهم مو كلامنا» proof stack — doubt, verbatim quote, author, cropped screenshot; the rest behind one button" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: «كرت الضمان» (`accordion_richtext` guarantee card) and `heading_style`

**Files:**
- Create: `packages/sections/src/accordion_richtext.guarantee.tsx`
- Modify: `packages/sections/src/accordion_richtext.tsx` (header comment, imports, schema, the card branch, the cards heading)
- Modify: `packages/sections/src/accordion_richtext.client.tsx` (quiet heading)
- Test: `packages/sections/src/accordion_richtext.guarantee.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/accordion_richtext.guarantee.test.tsx`:

```tsx
// =====================================================================
// accordion_richtext `layout: "guarantee_card"` — «كرت الضمان» (spec §1.5)
// =====================================================================
// One espresso ticket that states every term once, with nothing to open:
// eyebrow, title, sub; numbered terms (title + body paragraphs); one stub
// link to the full policy; `id={anchor_id}` for the band's «الشروط» link.
// The call row never renders here. Plus the slice's other accordion props:
// they parse safely, and `heading_style: "chapter"` swaps the cards and
// quiet headings for ChapterHeading.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY_BRAND_KIT, buildBrandKitVars } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import accordion_richtext from "./accordion_richtext";
import { IRAQ_TENANT, LIVE_PDP_POLICIES, lowerCtx } from "./_pdp-lower-fixtures";

const { schema } = accordion_richtext;

function render(input: unknown, locale: LocaleCode = "ar"): string {
  const Render = accordion_richtext.render;
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/scheniders-iraq">
      <Render props={schema.parse(input)} ctx={lowerCtx(locale, IRAQ_TENANT)} />
    </StoreBaseProvider>,
  );
}

const count = (html: string, needle: string): number => html.split(needle).length - 1;

const CARD = {
  allow_multiple: false,
  layout: "guarantee_card",
  heading_i18n: { ar: "كرت الضمان", en: "Guarantee card" },
  eyebrow_i18n: { ar: "ويا كل طلب من شنايدر", en: "With every Scheniders order" },
  sub_i18n: { ar: "حقك مكتوب هنا قبل ما تطلب", en: "Your rights, written down before you order" },
  anchor_id: "guarantee",
  policy_link: {
    href: "/policies/returns",
    label_i18n: { ar: "سياسة الإرجاع الكاملة", en: "Full return policy" },
  },
  items: [
    { title_i18n: { ar: "الدفع عند الاستلام" }, body_i18n: { ar: "ما تدفع إلا بعد ما يوصلك العطر." } },
    { title_i18n: { ar: "تفحصه والمندوب يمّك" }, body_i18n: { ar: "فقرة أولى.\n\nفقرة\nثانية." } },
    { title_i18n: { ar: "أسبوع تجربة ببيتك" }, body_i18n: { ar: "ترجّعه ونرجعلك فلوسه." } },
  ],
  // Ignored by the card: the mid-page call card is gone.
  call_row: { prompt_i18n: { ar: "تحب تحچي ويانا؟" }, action_i18n: { ar: "اتصل" } },
};

describe("accordion_richtext slice 1d props", () => {
  it("accepts the card config", () => {
    const parsed = schema.parse(CARD);
    expect(parsed.layout).toBe("guarantee_card");
    expect(parsed.anchor_id).toBe("guarantee");
    expect(parsed.policy_link?.href).toBe("/policies/returns");
  });

  it.each<[string, unknown]>([
    ["eyebrow_i18n", "x"],
    ["sub_i18n", 3],
    ["anchor_id", "Guarantee!"],
    ["anchor_id", "1guarantee"],
    ["policy_link", { href: "https://example.com/returns", label_i18n: { ar: "x" } }],
    ["policy_link", { href: "//example.com/returns", label_i18n: { ar: "x" } }],
    ["policy_link", { href: "/policies/returns" }],
    ["heading_style", "huge"],
  ])("a bad %s (%j) falls back to absent", (key, value) => {
    const parsed = schema.parse({ ...CARD, [key]: value });
    expect(parsed[key as keyof typeof parsed]).toBeUndefined();
    expect(parsed.items).toHaveLength(3);
  });
});

describe("guarantee card", () => {
  const ar = render(CARD);
  const en = render(CARD, "en");

  it("is one espresso card carrying the anchor id", () => {
    expect(count(ar, 'id="guarantee"')).toBe(1);
    expect(ar).toMatch(/<article id="guarantee" data-guarantee-card="true" class="[^"]*bg-bk-secondary[^"]*text-bk-on-secondary/);
  });

  it("eyebrow, title at the chapter scale, sub", () => {
    expect(ar).toMatch(/data-i18n-field="eyebrow_i18n"[^>]*>ويا كل طلب من شنايدر</);
    expect(ar).toMatch(/<h2 data-i18n-field="heading_i18n" class="[^"]*text-bk-chapter[^"]*">كرت الضمان<\/h2>/);
    expect(ar).toContain("حقك مكتوب هنا قبل ما تطلب");
  });

  it("states every term, numbered, always visible: nothing to open", () => {
    expect(count(ar, "data-guarantee-term=")).toBe(3);
    expect([...ar.matchAll(/data-guarantee-num="true"[^>]*>(\d)</g)].map((m) => m[1])).toEqual(["1", "2", "3"]);
    expect(ar).not.toContain("<details");
    expect(ar).not.toContain("<button");
    expect(ar).not.toContain("aria-expanded");
  });

  it("keeps the blank-line paragraph split", () => {
    const term2 = ar.slice(ar.indexOf('data-guarantee-term="1"'), ar.indexOf('data-guarantee-term="2"'));
    expect(count(term2, "<p ")).toBe(2);
    expect(term2).toContain("فقرة\nثانية.");
  });

  it("ends with one stub link to the full policy, under the store base", () => {
    expect(count(ar, "<a ")).toBe(1);
    expect(ar).toMatch(/href="\/s\/scheniders-iraq\/policies\/returns"[^>]*>.*سياسة الإرجاع الكاملة/);
    expect(en).toContain("Full return policy");
  });

  it("never renders the call row", () => {
    expect(ar).not.toContain("تحب تحچي ويانا؟");
    expect(ar).not.toContain("tel:");
  });

  it("yellow only tints numerals and the eyebrow (D4), never fills", () => {
    expect(ar).not.toContain("bg-bk-primary");
    expect(ar).toContain("text-bk-primary");
  });

  it("reads right to left with classes, never dir", () => {
    expect(ar).not.toMatch(/\sdir="/);
    expect(ar).toContain("flex-row-reverse");
    expect(en).not.toContain("flex-row-reverse");
  });

  it("without anchor_id: no id; without policy_link: no stub", () => {
    const bare = render({ ...CARD, anchor_id: undefined, policy_link: undefined });
    expect(bare).not.toContain('id="');
    expect(bare).not.toContain("<a ");
    expect(bare).toContain("data-guarantee-card");
  });

  it("no items: no card", () => {
    expect(render({ ...CARD, items: [] })).toBe("");
  });
});

describe("heading_style chapter in the existing layouts", () => {
  const titled = { ...LIVE_PDP_POLICIES, heading_i18n: { ar: "ضماناتك", en: "Our promise" } };

  it.each([undefined, "quiet"] as const)("layout %s: ChapterHeading in place of today's heading", (layout) => {
    const html = render({ ...titled, layout, heading_style: "chapter" });
    expect(html).toMatch(/<h2 data-i18n-field="heading_i18n" class="[^"]*text-bk-chapter[^"]*">ضماناتك<\/h2>/);
  });

  it.each([undefined, "quiet"] as const)("layout %s: heading_style section is today's markup", (layout) => {
    expect(render({ ...titled, layout, heading_style: "section" })).toBe(render({ ...titled, layout }));
  });
});

describe("guarantee card contrast on the scheniders brand kit", () => {
  // Body `text-bk-on-secondary/90`, sub `/75`, numerals and eyebrow
  // `text-bk-primary`, all on `bg-bk-secondary`.
  const vars = buildBrandKitVars({
    ...EMPTY_BRAND_KIT,
    colors: {
      primary: "#f7db17",
      secondary: "#3e3129",
      accent: "#fbb82e",
      surface: "#fdf8ef",
      surface_alt: "#f8efdf",
      ink: "#483b36",
      success: "#3ecf8e",
      danger: "#e2574c",
    },
  }) as Record<string, string>;
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const lum = (c: number[]) => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c[0] ?? 0) + 0.7152 * f(c[1] ?? 0) + 0.0722 * f(c[2] ?? 0);
  };
  const ratio = (a: number[], b: number[]) => {
    const [hi = 0, lo = 0] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const over = (fg: number[], bg: number[], alpha: number) => fg.map((v, i) => v * alpha + (bg[i] ?? 0) * (1 - alpha));
  const bg = rgb(vars["--bk-secondary"] ?? "");

  it.each([
    ["term bodies at 90%", 0.9],
    ["the sub line at 75%", 0.75],
  ])("%s clear 7:1", (_label, alpha) => {
    expect(ratio(over(rgb(vars["--bk-on-secondary"] ?? ""), bg, alpha), bg)).toBeGreaterThanOrEqual(7);
  });

  it("the yellow numerals clear 7:1", () => {
    expect(ratio(rgb(vars["--bk-primary"] ?? ""), bg)).toBeGreaterThanOrEqual(7);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/accordion_richtext.guarantee.test.tsx
```
Expected: `Tests  11 failed | 15 passed (26)`. The passing ones are the eight bad-value cases (zod strips unknown keys today), "never renders the call row" and "no items: no card" (today's cards layout), the two "heading_style section is today's markup" cases and the three contrast checks.

- [ ] **Step 3: Write the card**

Create `packages/sections/src/accordion_richtext.guarantee.tsx`:

```tsx
// =====================================================================
// accordion_richtext — `layout: "guarantee_card"` («كرت الضمان», spec §1.5)
// =====================================================================
// The four policy rows become one espresso ticket that states each term
// once, with nothing to open: an eyebrow, the title at the chapter scale,
// a sub line, then numbered terms (title + body, split on blank lines as
// every accordion body is). A stub row under a dashed tear line carries
// one link to the full policy page, with a surface-coloured notch on each
// long edge. A faint security-paper rosette sits behind the header. The
// card carries `id={anchor_id}`, the target of the promise band's
// «الشروط» link. Server-rendered, no client JS. Yellow only tints the
// numerals, the eyebrow and the stub arrow (D4); it never fills a shape.
// =====================================================================

import type { LocaleCode } from "@scheniders/shared";
import { MaterialIcon, Section } from "./helpers/primitives";
import { readsRtl } from "./helpers/reading";
import { StoreLink } from "./helpers/store-context";
import { cn } from "./helpers/utils";

export interface GuaranteeCardData {
  anchorId: string | undefined;
  eyebrow: string;
  title: string;
  sub: string;
  terms: { title: string; body: string }[];
  policy: { href: string; label: string } | null;
}

/** Twelve ellipses round a circle: a certificate cue, not a stamp or logo. */
function Rosette() {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.35"
      aria-hidden="true"
      className="pointer-events-none absolute -left-10 -top-10 -z-10 size-44 text-bk-on-secondary/[0.08]"
    >
      <g transform="translate(50 50)">
        {Array.from({ length: 12 }, (_, i) => (
          <ellipse key={i} rx="46" ry="16" transform={`rotate(${i * 15})`} />
        ))}
        <circle r="48" />
        <circle r="12" />
      </g>
    </svg>
  );
}

export function GuaranteeCard({ data, locale }: { data: GuaranteeCardData; locale: LocaleCode }) {
  const rtl = readsRtl(locale);
  const side = rtl ? "text-right" : "text-left";
  return (
    <Section>
      <article
        id={data.anchorId}
        data-guarantee-card="true"
        className="relative isolate scroll-mt-24 overflow-hidden rounded-bk-card bg-bk-secondary text-bk-on-secondary"
      >
        <Rosette />
        <div className="px-5 pb-bk-sm pt-6">
          <div className={cn("flex flex-col gap-bk-xs", rtl ? "items-end text-right" : "items-start text-left")}>
            {data.eyebrow && (
              <span
                data-i18n-field="eyebrow_i18n"
                className="inline-flex rounded-bk-pill bg-bk-on-secondary/10 px-2.5 py-0.5 font-bk-body text-xs font-bold text-bk-primary"
              >
                {data.eyebrow}
              </span>
            )}
            {data.title && (
              <h2
                data-i18n-field="heading_i18n"
                className="font-bk-display text-bk-chapter font-black text-bk-on-secondary text-balance"
              >
                {data.title}
              </h2>
            )}
            {data.sub && (
              <p data-i18n-field="sub_i18n" className="font-bk-body text-sm font-semibold text-bk-on-secondary/75">
                {data.sub}
              </p>
            )}
          </div>
          <ol className="mt-bk-md divide-y divide-bk-on-secondary/15">
            {data.terms.map((term, i) => (
              <li key={`${i}-${term.title}`} data-guarantee-term={i} className="py-3.5 first:pt-1">
                <h3
                  className={cn(
                    "flex items-center gap-2.5 font-bk-display text-base font-extrabold leading-snug text-bk-on-secondary",
                    rtl ? "flex-row-reverse text-right" : "text-left",
                  )}
                >
                  <span
                    data-guarantee-num="true"
                    aria-hidden="true"
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-bk-pill border-[1.5px] border-current text-xs font-black tabular-nums text-bk-primary"
                  >
                    {i + 1}
                  </span>
                  <span data-i18n-field={`items[${i}].title_i18n`}>{term.title}</span>
                </h3>
                <div data-i18n-field={`items[${i}].body_i18n`} className="mt-1 space-y-2">
                  {term.body.split(/\n{2,}/).map((p, j) => (
                    <p
                      key={j}
                      className={cn(
                        "whitespace-pre-line font-bk-body text-sm leading-relaxed text-bk-on-secondary/90 text-pretty",
                        side,
                      )}
                    >
                      {p}
                    </p>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </div>
        {data.policy && (
          <div className="relative border-t-[1.5px] border-dashed border-bk-on-secondary/30">
            <span aria-hidden="true" className="absolute -left-3 -top-3 size-6 rounded-bk-pill bg-bk-surface" />
            <span aria-hidden="true" className="absolute -right-3 -top-3 size-6 rounded-bk-pill bg-bk-surface" />
            <StoreLink
              href={data.policy.href}
              data-i18n-field="policy_link.label_i18n"
              className={cn(
                "flex min-h-12 items-center justify-between gap-2.5 px-6 py-2 font-bk-body text-sm font-bold text-bk-on-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus",
                rtl && "flex-row-reverse",
              )}
            >
              <span className="underline decoration-bk-primary/60 decoration-[1.5px] underline-offset-4">
                {data.policy.label}
              </span>
              <MaterialIcon name={rtl ? "arrow_back" : "arrow_forward"} className="text-lg text-bk-primary" />
            </StoreLink>
          </div>
        )}
      </article>
    </Section>
  );
}
```

- [ ] **Step 4: Wire it into `accordion_richtext`**

In `packages/sections/src/accordion_richtext.tsx`:

Replace:
```ts
// ends the list with a tap-to-call row on the store's call number.
// =====================================================================
```
with:
```ts
// ends the list with a tap-to-call row on the store's call number.
// Opt-in `layout: "guarantee_card"` renders the terms as one always-open
// espresso «كرت الضمان» (`./accordion_richtext.guarantee.tsx`, server
// only) with an optional anchor id and one policy link; it ignores
// `call_row`. Opt-in `heading_style: "chapter"` draws the cards and quiet
// headings with ChapterHeading.
// =====================================================================
```

Replace:
```ts
  Section,
} from "./helpers/primitives";
import { whatsappDigits } from "./helpers/whatsapp";
```
with:
```ts
  Section,
} from "./helpers/primitives";
import { ChapterHeading } from "./helpers/chapter-heading";
import { whatsappDigits } from "./helpers/whatsapp";
```

Replace:
```ts
import type { QuietCallRow } from "./accordion_richtext.client";
```
with:
```ts
import type { QuietCallRow } from "./accordion_richtext.client";
import { GuaranteeCard } from "./accordion_richtext.guarantee";
```

Replace:
```ts
  layout: z.enum(["cards", "quiet"]).optional().catch(undefined),
```
with:
```ts
  layout: z.enum(["cards", "quiet", "guarantee_card"]).optional().catch(undefined),
```

Replace:
```ts
    .optional()
    .catch(undefined),
});

export type Props = z.infer<typeof schema>;
```
with:
```ts
    .optional()
    .catch(undefined),
  /** Guarantee card: the small line above the title («ويا كل طلب من شنايدر»). */
  eyebrow_i18n: i18nStringOptional.catch(undefined),
  /** Guarantee card: the line under the title («حقك مكتوب هنا قبل ما تطلب»). */
  sub_i18n: i18nStringOptional.catch(undefined),
  /** Guarantee card: the card's in-page id, the target of
   *  pdp_direct_order's `guarantee_anchor_id` («الشروط»). */
  anchor_id: z
    .string()
    .regex(/^[a-z][a-z0-9-]{0,40}$/)
    .optional()
    .catch(undefined),
  /** Guarantee card: one link to the full policy page. A store path only
   *  ("/…", never "//…" or a full URL). */
  policy_link: z
    .object({
      href: z.string().regex(/^\/(?!\/)\S*$/),
      label_i18n: i18nStringSchema,
    })
    .optional()
    .catch(undefined),
  /** "chapter" renders the cards / quiet heading with ChapterHeading.
   *  Absent = today's heading. */
  heading_style: z.enum(["section", "chapter"]).optional().catch(undefined),
});

export type Props = z.infer<typeof schema>;
```

Replace:
```tsx
  const heading = resolveI18n(props.heading_i18n, locale);

  if (props.layout === "quiet") {
    return (
      <AccordionRichtextQuiet
        heading={heading}
```
with:
```tsx
  const heading = resolveI18n(props.heading_i18n, locale);

  if (props.layout === "guarantee_card") {
    return (
      <GuaranteeCard
        locale={locale}
        data={{
          anchorId: props.anchor_id,
          eyebrow: resolveI18n(props.eyebrow_i18n, locale),
          title: heading,
          sub: resolveI18n(props.sub_i18n, locale),
          terms: props.items.map((it) => ({
            title: resolveI18n(it.title_i18n, locale),
            body: resolveI18n(it.body_i18n, locale),
          })),
          policy: props.policy_link
            ? { href: props.policy_link.href, label: resolveI18n(props.policy_link.label_i18n, locale) }
            : null,
        }}
      />
    );
  }

  if (props.layout === "quiet") {
    return (
      <AccordionRichtextQuiet
        heading={heading}
        chapterLocale={props.heading_style === "chapter" ? locale : undefined}
```

Replace:
```tsx
    <Section>
      {heading && (
        <CenteredSectionHeader
          title={heading}
          align="start"
          titleField="heading_i18n"
        />
      )}
      <div className="space-y-bk-sm">
```
with:
```tsx
    <Section>
      {heading &&
        (props.heading_style === "chapter" ? (
          <ChapterHeading title={heading} locale={locale} titleField="heading_i18n" />
        ) : (
          <CenteredSectionHeader
            title={heading}
            align="start"
            titleField="heading_i18n"
          />
        ))}
      <div className="space-y-bk-sm">
```

(The empty-items rule above this branch — `if (props.items.length === 0) return null;` — already covers the card.)

In `packages/sections/src/accordion_richtext.client.tsx`:

Replace:
```ts
import { cn } from "@scheniders/shared";
import { MaterialIcon, Section } from "./helpers/primitives";
import { ActionPill, ActionRow } from "./helpers/action-row";
```
with:
```ts
import { cn } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { MaterialIcon, Section } from "./helpers/primitives";
import { ActionPill, ActionRow } from "./helpers/action-row";
import { ChapterHeading } from "./helpers/chapter-heading";
```

Replace:
```ts
  rtl,
  call,
}: {
  heading: string;
  items: readonly QuietItem[];
  exclusive: boolean;
  rtl: boolean;
  /** Null = no row (the default). */
  call: QuietCallRow | null;
}) {
```
with:
```ts
  rtl,
  call,
  chapterLocale,
}: {
  heading: string;
  items: readonly QuietItem[];
  exclusive: boolean;
  rtl: boolean;
  /** Null = no row (the default). */
  call: QuietCallRow | null;
  /** Set (`heading_style: "chapter"`) = the heading is a ChapterHeading in
   *  this locale. Absent = today's h2. */
  chapterLocale?: LocaleCode;
}) {
```

Replace:
```tsx
      {heading && (
        <h2
          data-i18n-field="heading_i18n"
          className={cn(
            "mb-bk-sm font-bk-display text-lg font-black text-bk-ink",
            textSide,
          )}
        >
          {heading}
        </h2>
      )}
```
with:
```tsx
      {heading &&
        (chapterLocale ? (
          <ChapterHeading title={heading} locale={chapterLocale} titleField="heading_i18n" />
        ) : (
          <h2
            data-i18n-field="heading_i18n"
            className={cn(
              "mb-bk-sm font-bk-display text-lg font-black text-bk-ink",
              textSide,
            )}
          >
            {heading}
          </h2>
        ))}
```

- [ ] **Step 5: Run the card test and every accordion baseline**

```bash
CI=true pnpm exec vitest run packages/sections/src/accordion_richtext.guarantee.test.tsx packages/sections/src/accordion_richtext.test.tsx packages/sections/src/accordion_richtext.call-row.test.tsx packages/sections/src/_pdp-lower-baseline-snapshot.test.tsx packages/sections/src/_pdp-proof-guarantee-baseline-snapshot.test.tsx packages/sections/src/_no-hardcoded-white.test.tsx
```
Expected: `Test Files  6 passed (6)`, `Tests  89 passed (89)`, no `written`/`updated`/`obsolete` line.

- [ ] **Step 6: Type gate, then commit**

Run the sections type gate. Expected: no output.
```bash
git branch --show-current
git add packages/sections/src/accordion_richtext.tsx packages/sections/src/accordion_richtext.client.tsx packages/sections/src/accordion_richtext.guarantee.tsx packages/sections/src/accordion_richtext.guarantee.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): «كرت الضمان» guarantee card (opt-in accordion layout) + heading_style" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The 1d draft-config migration (written, replayed locally, dry-run; NOT applied)

**Files:**
- Create: `packages/supabase/migrations/<STAMP>_scheniders_iraq_pdp_redesign_1d_draft.sql`
- Scratch: `tmp/pdp-1d/dryrun-1d.sql` (gitignored), `${TMPDIR:-/tmp}/pdp-1d-pglite/` (outside the repo)

All live access in this task is **read-only**. The JSON in the three `$json$` blocks is exactly what Task 8's fixtures hold (`SLICE_1D_GALLERY_PATCH`, `SLICE_1D_ACCORDION_PATCH`, `SLICE_1D_PDP_PATCH`, `SLICE_1D_ACCORDION_REMOVE`); Task 8's mirror test proves it.

- [ ] **Step 1: Pick the timestamp**

```bash
STAMP=$(date -u +%Y%m%d%H%M%S); echo $STAMP
ls packages/supabase/migrations | grep -E '^[0-9]{14}_' | sort | tail -1
```
Expected: `$STAMP` sorts after the last listed file (today `20261029220530_scheniders_iraq_pdp_redesign_1c_draft.sql`). Keep `$STAMP` in this shell for this task.

- [ ] **Step 2: Write the migration**

Create `packages/supabase/migrations/${STAMP}_scheniders_iraq_pdp_redesign_1d_draft.sql` (if Task 0 Step 3 read other guard values, put those in `c_expected_draft_md5` / `c_expected_rev` and the header's guard c. and Rollback lines):

```sql
-- =====================================================================
-- scheniders-iraq PDP redesign, slice 1d — DRAFT config only
-- =====================================================================
-- Spec: docs/superpowers/specs/2026-10-27-pdp-lower-page-redesign-design.md
-- §1.3 (guarantee_anchor_id), §1.5, §1.9, D1, D3, D4, D8.
--
-- Writes ONLY tenants.store_config_v2_draft (and updated_at) for slug
-- scheniders-iraq. store_config_v2 (published) is never written; its md5
-- is captured before the write and asserted equal after it.
--
-- What it changes in the draft's product page, each base merged with `||`:
--   1. image_gallery e5da8997: layout "stack" (the proof stack), the source
--      pill «تعليقات على إعلاناتنا بتيك توك», scope "store", 3 lead comments
--      (p5, p2, p4 with their doubt + verbatim quote), the legend and its
--      mark picture, heading_style "chapter", and the nine screenshots
--      re-ordered p5, p2, p4, p3, p6, p7, p9, p8, p1 with author, size
--      (measured from the stored files), crop {12, 2} and an alt carrying
--      the full verbatim comment. display / frame / order stay in config
--      (ignored by the stack).
--   2. accordion_richtext 370f9b04: layout "guarantee_card" («كرت الضمان»),
--      eyebrow, title, sub, anchor_id "guarantee", the policy link to
--      /policies/returns, and the four second-person terms (the «شحن فائق
--      السرعة» row is dropped: the promise band states delivery once).
--      call_row is REMOVED (the mid-page «تحب تحچي ويانا؟» card is gone).
--   3. pdp_direct_order aae22169: guarantee_anchor_id "guarantee" (the
--      band's «الشروط» link now has its target) and return_promise_i18n,
--      restated from the same wording as the card's term 3 (unchanged
--      from 1b: option ١, D8).
--
-- Guards, in order, in one transaction:
--   a. no tenant / no product page / one of the three sections missing
--      -> RAISE NOTICE and no write (a fresh database replays this as a no-op);
--   b. the transform applied to the current draft changes nothing
--      -> RAISE NOTICE 'already applied' and no write (a second run is a no-op);
--   c. md5(store_config_v2_draft::text) must be e4800d7bb6f80f656cd848d3dbf469d9
--      and store_config_rev must be 38 (the draft after the 1c migration)
--      -> else RAISE EXCEPTION: someone edited or published since, so
--      re-read and regenerate this file;
--   d. md5(store_config_v2::text) is equal before and after the write.
--
-- Applied ONLY after the code that reads these props is deployed:
--   supabase db query --linked -f <this file>
--   supabase migration repair --status applied <version>
-- Never `supabase db push`.
--
-- Rollback (read at draft md5 e4800d7bb6f80f656cd848d3dbf469d9): restore
--   image_gallery e5da8997 base =
--     {"frame": "strip", "order": "product_first", "layout": "carousel",
--      "display": "whole", "heading_i18n": {"ar": "كلامهم مو كلامنا", "en":
--      "Their words, not ours"}, "images": [the nine screenshots in the order
--      1ebf499e, cba26e5e, 8f742152, 6bf95f17, 536e8d88, abf3f504, 2f8ae556,
--      13ec2385, 8e208e9b, each {"url": ".../reviews/<id>.jpeg", "alt_i18n":
--      {"ar": "رسالة من زبون N من 9", "en": "Customer message N of 9"}}]}
--     (a typed copy: IRAQ_DRAFT_GALLERY_BASE in
--     packages/sections/src/_pdp-redesign-fixtures.ts);
--   accordion_richtext 370f9b04 base = IRAQ_DRAFT_ACCORDION_BASE in the same
--     file (allow_multiple false, layout "quiet", the four policy rows, and
--     call_row {"prompt_i18n": {"ar": "تحب تحچي ويانا؟", "en": "Rather talk
--     to us?"}, "action_i18n": {"ar": "اتصل", "en": "Call"}});
--   pdp_direct_order aae22169: remove guarantee_anchor_id with `-`
--     (return_promise_i18n is unchanged by this file).
-- =====================================================================

DO $mig$
DECLARE
  c_slug constant text := 'scheniders-iraq';
  c_expected_rev constant bigint := 38;
  c_expected_draft_md5 constant text := 'e4800d7bb6f80f656cd848d3dbf469d9';
  c_pdp_id constant text := 'aae22169-cef4-4495-842b-863a7caa71c2';
  c_gallery_id constant text := 'e5da8997-d564-4260-88f2-a6d73031b4ce';
  c_accordion_id constant text := '370f9b04-c300-4dbe-8ea9-b0f9b2d7f78d';
  -- gallery_patch:begin
  c_gallery_patch constant jsonb := $json${
    "layout": "stack",
    "scope": "store",
    "initial_count": 3,
    "heading_style": "chapter",
    "source_label_i18n": {
      "ar": "تعليقات على إعلاناتنا بتيك توك",
      "en": "Comments on our TikTok ads"
    },
    "legend_i18n": {
      "ar": "هاي العلامة يعني سوّينا لايك للتعليق من حسابنا",
      "en": "This mark means we liked the comment from our account"
    },
    "legend_image_url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/da0471e3-4980-4e4d-80ef-4ea9e75bf2da.png",
    "images": [
      {
        "url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/536e8d88-e55a-49f0-a9b3-305b69cbfbf5.jpeg",
        "alt_i18n": {
          "ar": "تعليق المحامي زياد طارق الحديدي: وصلني العطر فعلاً راقي و اول مره يوصلني عطر ويطلع كلام الاعلان كله صحيح عاشت ايدك حبي وان شاءالله بعد منه ورايح عطوري من يمكم",
          "en": "Comment by المحامي زياد طارق الحديدي: وصلني العطر فعلاً راقي و اول مره يوصلني عطر ويطلع كلام الاعلان كله صحيح عاشت ايدك حبي وان شاءالله بعد منه ورايح عطوري من يمكم"
        },
        "doubt_i18n": {
          "ar": "خايف يطلع مثل كل إعلان؟",
          "en": "Afraid it's like every ad?"
        },
        "quote_i18n": {
          "ar": "اول مره يوصلني عطر ويطلع كلام الاعلان كله صحيح"
        },
        "author": "المحامي زياد طارق الحديدي",
        "width": 828,
        "height": 253,
        "crop": {
          "left": 12,
          "right": 2
        }
      },
      {
        "url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/cba26e5e-7ad0-4213-b804-d535b7c0d7e6.jpeg",
        "alt_i18n": {
          "ar": "تعليق dy4axauduv7j: كنت متوقع مثل اي اعلان وكنت ناوي بس اشوفه مو مثل ماتفضلت ارجعه واول مره اعلق الشي بي خير امانة الله لا اعرف الناس ولا الي مصلحه يمهم بس نصيحه لاتقيس من اول مترش انتظر ربع ساعه وشوف الفوحان فد شي خيال",
          "en": "Comment by dy4axauduv7j: كنت متوقع مثل اي اعلان وكنت ناوي بس اشوفه مو مثل ماتفضلت ارجعه واول مره اعلق الشي بي خير امانة الله لا اعرف الناس ولا الي مصلحه يمهم بس نصيحه لاتقيس من اول مترش انتظر ربع ساعه وشوف الفوحان فد شي خيال"
        },
        "doubt_i18n": {
          "ar": "أول رشة ما فاحت؟",
          "en": "The first spray didn't carry?"
        },
        "quote_i18n": {
          "ar": "لاتقيس من اول مترش انتظر ربع ساعه"
        },
        "author": "dy4axauduv7j",
        "width": 828,
        "height": 256,
        "crop": {
          "left": 12,
          "right": 2
        }
      },
      {
        "url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/6bf95f17-026a-400d-9067-08894b88a4a0.jpeg",
        "alt_i18n": {
          "ar": "تعليق Nano: يجنن يجنن صدك ثباتيه وفوحان قوي وما ياذي الجيوب لان اني اعاني من العطور القويه لان جيوبي تتحسس بس هذه ما اذاني",
          "en": "Comment by Nano: يجنن يجنن صدك ثباتيه وفوحان قوي وما ياذي الجيوب لان اني اعاني من العطور القويه لان جيوبي تتحسس بس هذه ما اذاني"
        },
        "doubt_i18n": {
          "ar": "تتحسس من العطور القوية؟",
          "en": "Sensitive to strong perfumes?"
        },
        "quote_i18n": {
          "ar": "ما ياذي الجيوب"
        },
        "author": "Nano",
        "width": 828,
        "height": 202,
        "crop": {
          "left": 12,
          "right": 2
        }
      },
      {
        "url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/8f742152-1b1a-4d65-a543-331196fc6830.jpeg",
        "alt_i18n": {
          "ar": "تعليق عباس: الصراحة وامنه احجيها العطر راقي البارحة وصلني شكراً جزيلاً ولا عندي معرفه بحظرتك بس شهاده ولازم احجيها فد شي العطر",
          "en": "Comment by عباس: الصراحة وامنه احجيها العطر راقي البارحة وصلني شكراً جزيلاً ولا عندي معرفه بحظرتك بس شهاده ولازم احجيها فد شي العطر"
        },
        "author": "عباس",
        "width": 828,
        "height": 208,
        "crop": {
          "left": 12,
          "right": 2
        }
      },
      {
        "url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/abf3f504-d358-4888-bd0f-eafd1136d248.jpeg",
        "alt_i18n": {
          "ar": "تعليق سوران البيرو: وصلني اليوم قسما بالله عطر عالمي",
          "en": "Comment by سوران البيرو: وصلني اليوم قسما بالله عطر عالمي"
        },
        "author": "سوران البيرو",
        "width": 828,
        "height": 167,
        "crop": {
          "left": 12,
          "right": 2
        }
      },
      {
        "url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/2f8ae556-1a0c-4cdb-b4e2-b30c2808755e.jpeg",
        "alt_i18n": {
          "ar": "تعليق Vito93: طبعا وصلي العطر عليه اربعة إرهاب من الفوحان رهيييب العطر",
          "en": "Comment by Vito93: طبعا وصلي العطر عليه اربعة إرهاب من الفوحان رهيييب العطر"
        },
        "author": "Vito93",
        "width": 828,
        "height": 173,
        "crop": {
          "left": 12,
          "right": 2
        }
      },
      {
        "url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/8e208e9b-b896-430d-839d-44d2a010b588.jpeg",
        "alt_i18n": {
          "ar": "تعليق ALI ALSHEMMARI: اليوم وصلني الله شاهد عطر مرتب مثلك",
          "en": "Comment by ALI ALSHEMMARI: اليوم وصلني الله شاهد عطر مرتب مثلك"
        },
        "author": "ALI ALSHEMMARI",
        "width": 828,
        "height": 160,
        "crop": {
          "left": 12,
          "right": 2
        }
      },
      {
        "url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/13ec2385-384c-4d1f-af39-793949cce8df.jpeg",
        "alt_i18n": {
          "ar": "تعليق Sagad: فعلا عن تجربه",
          "en": "Comment by Sagad: فعلا عن تجربه"
        },
        "author": "Sagad",
        "width": 828,
        "height": 184,
        "crop": {
          "left": 12,
          "right": 2
        }
      },
      {
        "url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/1ebf499e-fb7d-4325-a2fe-0b98e8530932.jpeg",
        "alt_i18n": {
          "ar": "تعليق Alpha decorations company: عطر ايخبل والكلام حقيقي اني جربته",
          "en": "Comment by Alpha decorations company: عطر ايخبل والكلام حقيقي اني جربته"
        },
        "author": "Alpha decorations company",
        "is_business": true,
        "width": 828,
        "height": 163,
        "crop": {
          "left": 12,
          "right": 2
        }
      }
    ]
  }$json$;
  -- gallery_patch:end
  -- accordion_patch:begin
  c_accordion_patch constant jsonb := $json${
    "layout": "guarantee_card",
    "heading_i18n": {
      "ar": "كرت الضمان",
      "en": "Guarantee card"
    },
    "eyebrow_i18n": {
      "ar": "ويا كل طلب من شنايدر",
      "en": "With every Scheniders order"
    },
    "sub_i18n": {
      "ar": "حقك مكتوب هنا قبل ما تطلب",
      "en": "Your rights, in writing, before you order"
    },
    "anchor_id": "guarantee",
    "policy_link": {
      "href": "/policies/returns",
      "label_i18n": {
        "ar": "سياسة الإرجاع الكاملة",
        "en": "Full return policy"
      }
    },
    "items": [
      {
        "title_i18n": {
          "ar": "الدفع عند الاستلام",
          "en": "Pay on delivery"
        },
        "body_i18n": {
          "ar": "ما تدفع إلا بعد ما يوصلك العطر وتجرّبه من العيّنة الزجاجية اللي تجيك مجاناً ويا كل طلب.",
          "en": "You pay only after the perfume reaches you and you have tried it from the glass sample that comes free with every order."
        }
      },
      {
        "title_i18n": {
          "ar": "تفحصه والمندوب يمّك",
          "en": "Check it with the courier there"
        },
        "body_i18n": {
          "ar": "تتأكد من الجودة والمواصفات والفوحان والثبات قدّام المندوب. أي اختلاف، ترفضه وترجعلك قيمته كاملة.",
          "en": "Check the quality, the description, the projection and the longevity in front of the courier. Anything different, refuse it and get your money back in full."
        }
      },
      {
        "title_i18n": {
          "ar": "أسبوع تجربة ببيتك",
          "en": "A week's trial at home"
        },
        "body_i18n": {
          "ar": "تستعمل العطر وتخلّيه يمّك أسبوع كامل من يوم الاستلام. إذا ما عجبتك ريحته أو لگيت فرق بالمواصفات، ترجّعه ونرجعلك فلوسه.",
          "en": "Use the perfume and keep it for a full week from delivery. If you don't like the scent or find it differs from the description, return it and we refund you."
        }
      },
      {
        "title_i18n": {
          "ar": "عطور أصلية",
          "en": "Authentic perfumes"
        },
        "body_i18n": {
          "ar": "كل عطورنا مختارة بإيدنا وبعناية من أفخم المصادر العالمية ومن أجود الخامات العطرية. ما نتعامل بالعطور التركية المصنّعة بالجملة ولا الصينية الرديئة.",
          "en": "Every perfume is hand-picked with care from the finest sources in the world and the best aromatic materials. We never deal in bulk-made Turkish or low-grade Chinese perfumes."
        }
      }
    ]
  }$json$;
  -- accordion_patch:end
  -- accordion_remove:begin
  c_accordion_remove constant text[] := ARRAY['call_row'];
  -- accordion_remove:end
  -- pdp_patch:begin
  c_pdp_patch constant jsonb := $json${
    "guarantee_anchor_id": "guarantee",
    "return_promise_i18n": {
      "ar": "ما عجبك؟ ترفضه قدام المندوب أو ترجّعه خلال أسبوع",
      "en": "Don't like it? Refuse it in front of the courier, or return it within a week."
    }
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
    RAISE NOTICE 'pdp redesign 1d: no tenant % with a draft, nothing written', c_slug;
    RETURN;
  END IF;

  SELECT (p.ord - 1)::int INTO v_page_idx
    FROM jsonb_array_elements(v_draft->'pages') WITH ORDINALITY AS p(page, ord)
   WHERE p.page->>'page_id' = 'product';
  IF v_page_idx IS NULL THEN
    RAISE NOTICE 'pdp redesign 1d: % has no product page, nothing written', c_slug;
    RETURN;
  END IF;
  v_sections := v_draft->'pages'->v_page_idx->'sections';

  SELECT array_agg(want) INTO v_missing
    FROM unnest(ARRAY[c_pdp_id, c_gallery_id, c_accordion_id]) AS want
   WHERE NOT EXISTS (
     SELECT 1 FROM jsonb_array_elements(v_sections) AS s(sec) WHERE s.sec->>'id' = want
   );
  IF v_missing IS NOT NULL THEN
    RAISE NOTICE 'pdp redesign 1d: product page lacks sections %, nothing written', v_missing;
    RETURN;
  END IF;

  SELECT jsonb_agg(
           CASE x.sec->>'id'
             WHEN c_gallery_id
               THEN jsonb_set(x.sec, '{base}', coalesce(x.sec->'base', '{}'::jsonb) || c_gallery_patch)
             WHEN c_accordion_id
               THEN jsonb_set(x.sec, '{base}', (coalesce(x.sec->'base', '{}'::jsonb) || c_accordion_patch) - c_accordion_remove)
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
    RAISE NOTICE 'pdp redesign 1d: already applied, nothing written';
    RETURN;
  END IF;

  IF md5(v_draft::text) <> c_expected_draft_md5 THEN
    RAISE EXCEPTION 'pdp redesign 1d: draft md5 is %, expected % (edited since it was read); re-read and regenerate',
      md5(v_draft::text), c_expected_draft_md5;
  END IF;
  IF v_rev <> c_expected_rev THEN
    RAISE EXCEPTION 'pdp redesign 1d: store_config_rev is %, expected % (published since it was read); re-read and regenerate',
      v_rev, c_expected_rev;
  END IF;

  UPDATE public.tenants
     SET store_config_v2_draft = v_target,
         updated_at = now()
   WHERE id = v_tenant_id;

  IF (SELECT md5(store_config_v2::text) FROM public.tenants WHERE id = v_tenant_id) <> v_pub_md5 THEN
    RAISE EXCEPTION 'pdp redesign 1d: the published config changed during the write';
  END IF;

  RAISE NOTICE 'pdp redesign 1d: draft md5 % -> %', c_expected_draft_md5, md5(v_target::text);
END
$mig$;
```

What is in it, for the reviewer:
- gallery images in the order p5 (536e8d88), p2 (cba26e5e), p4 (6bf95f17), p3 (8f742152), p6 (abf3f504), p7 (2f8ae556), p9 (8e208e9b), p8 (13ec2385), p1 (1ebf499e, `is_business`); heights from Task 0 Step 4; `alt_i18n.ar` = «تعليق {author}: {full verbatim comment}» (replacing «رسالة من زبون N من 9»), `en` = "Comment by {author}: {the Arabic comment}";
- the three lead quotes are word-for-word substrings of their comments (p5's is the full clause Ali named in Q5);
- `return_promise_i18n` equals what 1b wrote (`decd2647…` below), so the band's text does not change; it is restated so the one wording is written by one file.

- [ ] **Step 3: Copy the live row read-only and install PGlite outside the repo**

```bash
mkdir -p "${TMPDIR:-/tmp}/pdp-1d-pglite"
(cd packages && supabase db query --linked "SELECT store_config_v2_draft::text AS draft, store_config_v2::text AS pub FROM tenants WHERE slug='scheniders-iraq'" -o json) > "${TMPDIR:-/tmp}/pdp-1d-pglite/live.json"
cd "${TMPDIR:-/tmp}/pdp-1d-pglite"
node -e 'const fs=require("fs");const r=JSON.parse(fs.readFileSync("live.json")).rows[0];fs.writeFileSync("draft.json",r.draft);fs.writeFileSync("pub.json",r.pub);console.log(r.draft.length, r.pub.length)'
echo '{"name":"pdp-1d-pglite","private":true,"type":"module"}' > package.json
pnpm add @electric-sql/pglite@0.2.17
cd /Users/ali/scheniders-mono-pdp
```
Expected: `65330 60860` (on 2026-10-30, after 1c), then `+ @electric-sql/pglite 0.2.17`.

- [ ] **Step 4: Write the replay harness**

Create `${TMPDIR:-/tmp}/pdp-1d-pglite/harness-draft.mjs`:

```js
// Replays the 1d draft-config migration against a local Postgres (PGlite)
// loaded with a read-only copy of the live scheniders-iraq row.
// usage: node harness-draft.mjs <migration.sql> <draft.json> <pub.json>
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const [file, draftPath, pubPath] = process.argv.slice(2);
const sql = readFileSync(file, "utf8");
const draft = readFileSync(draftPath, "utf8");
const pub = readFileSync(pubPath, "utf8");

async function db(withRow, { rev = 38, editDraft = false } = {}) {
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
    g.sec->'base'->>'layout' AS gallery_layout,
    (SELECT string_agg(left(split_part(i->>'url', '/reviews/', 2), 8), ',' ORDER BY o) FROM jsonb_array_elements(g.sec->'base'->'images') WITH ORDINALITY i(i, o)) AS shots,
    a.sec->'base'->>'layout' AS accordion_layout,
    jsonb_array_length(a.sec->'base'->'items') AS terms,
    a.sec->'base' ? 'call_row' AS has_call_row,
    a.sec->'base'->>'anchor_id' AS anchor,
    d.sec->'base'->>'guarantee_anchor_id' AS pdp_anchor,
    md5((d.sec->'base'->'return_promise_i18n')::text) AS return_md5,
    md5((d.sec->'base'->'scent_card'->'product_copy')::text) AS copy_md5
  FROM public.tenants t,
       jsonb_array_elements(t.store_config_v2_draft->'pages') p(page),
       jsonb_array_elements(p.page->'sections') g(sec),
       jsonb_array_elements(p.page->'sections') a(sec),
       jsonb_array_elements(p.page->'sections') d(sec)
  WHERE p.page->>'page_id' = 'product'
    AND g.sec->>'id' = 'e5da8997-d564-4260-88f2-a6d73031b4ce'
    AND a.sec->>'id' = '370f9b04-c300-4dbe-8ea9-b0f9b2d7f78d'
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
  const { pg, notices } = await db(true, { rev: 39 });
  await run("published since", pg, notices);
}
{
  const { pg, notices } = await db(false);
  await run("empty database", pg, notices);
}
```

- [ ] **Step 5: Replay (first run, second run, edited draft, published since, empty database)**

```bash
node "${TMPDIR:-/tmp}/pdp-1d-pglite/harness-draft.mjs" "packages/supabase/migrations/${STAMP}_scheniders_iraq_pdp_redesign_1d_draft.sql" "${TMPDIR:-/tmp}/pdp-1d-pglite/draft.json" "${TMPDIR:-/tmp}/pdp-1d-pglite/pub.json"
```
Expected (pre-run 2026-10-30 on the live post-1c row):
```
before {"d":"e4800d7bb6f80f656cd848d3dbf469d9","p":"a6f87ba3181b0e94f41ba4a700de257b","bumped":false}
draft before {"order_":"pdp_direct_order,image_gallery,product_reviews,accordion_richtext,faq_contact_split,product_grid,trust_badge_row,sticky_cta_bar","gallery_layout":"carousel","shots":"1ebf499e,cba26e5e,8f742152,6bf95f17,536e8d88,abf3f504,2f8ae556,13ec2385,8e208e9b","accordion_layout":"quiet","terms":4,"has_call_row":true,"anchor":null,"pdp_anchor":null,"return_md5":"decd2647ec915a24578d9128faca83df","copy_md5":"523744df04f3acb3e6983ddb422d3266"}
first run: ok ["pdp redesign 1d: draft md5 e4800d7bb6f80f656cd848d3dbf469d9 -> 8d0e6032304d56057abfecbb4487b95b"]
after first {"d":"8d0e6032304d56057abfecbb4487b95b","p":"a6f87ba3181b0e94f41ba4a700de257b","bumped":true}
draft after {"order_":"pdp_direct_order,image_gallery,product_reviews,accordion_richtext,faq_contact_split,product_grid,trust_badge_row,sticky_cta_bar","gallery_layout":"stack","shots":"536e8d88,cba26e5e,6bf95f17,8f742152,abf3f504,2f8ae556,8e208e9b,13ec2385,1ebf499e","accordion_layout":"guarantee_card","terms":4,"has_call_row":false,"anchor":"guarantee","pdp_anchor":"guarantee","return_md5":"decd2647ec915a24578d9128faca83df","copy_md5":"523744df04f3acb3e6983ddb422d3266"}
second run: ok ["pdp redesign 1d: already applied, nothing written"]
after second {"d":"8d0e6032304d56057abfecbb4487b95b","p":"a6f87ba3181b0e94f41ba4a700de257b","bumped":true}
edited draft: ERROR pdp redesign 1d: draft md5 is 489d29a9aae13ede0acc3f660a0870b8, expected e4800d7bb6f80f656cd848d3dbf469d9 (edited since it was read); re-read and regenerate
edited draft state {"d":"489d29a9aae13ede0acc3f660a0870b8","p":"a6f87ba3181b0e94f41ba4a700de257b","bumped":false}
published since: ERROR pdp redesign 1d: store_config_rev is 39, expected 38 (published since it was read); re-read and regenerate
empty database: ok ["pdp redesign 1d: no tenant scheniders-iraq with a draft, nothing written"]
```
This covers §1.10's data checks: the published md5 `p` never moves; `updated_at` is bumped only by a real write; a second run is a no-op; an edited draft or a publish since the read aborts; an empty database is a no-op. The section order is untouched (D1 is already in place from 1b), the shots come out in Ali's order, the call row is gone, both anchors are `guarantee`, the band's return line is unchanged (`decd2647…`), and 1c's `product_copy` (`523744df…`, the go-live file's guard) is untouched.

- [ ] **Step 6: Dry run on the live row (a SELECT, writes nothing)**

Create `tmp/pdp-1d/dryrun-1d.sql`:

```sql
-- Read-only dry run of <STAMP>_scheniders_iraq_pdp_redesign_1d_draft.sql:
-- the same transform as a SELECT. Writes nothing.
WITH c AS (
  SELECT
    'aae22169-cef4-4495-842b-863a7caa71c2'::text AS pdp_id,
    'e5da8997-d564-4260-88f2-a6d73031b4ce'::text AS gallery_id,
    '370f9b04-c300-4dbe-8ea9-b0f9b2d7f78d'::text AS accordion_id,
    ARRAY['call_row'] AS accordion_remove,
    $json${
      "layout": "stack",
      "scope": "store",
      "initial_count": 3,
      "heading_style": "chapter",
      "source_label_i18n": {
        "ar": "تعليقات على إعلاناتنا بتيك توك",
        "en": "Comments on our TikTok ads"
      },
      "legend_i18n": {
        "ar": "هاي العلامة يعني سوّينا لايك للتعليق من حسابنا",
        "en": "This mark means we liked the comment from our account"
      },
      "legend_image_url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/da0471e3-4980-4e4d-80ef-4ea9e75bf2da.png",
      "images": [
        {
          "url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/536e8d88-e55a-49f0-a9b3-305b69cbfbf5.jpeg",
          "alt_i18n": {
            "ar": "تعليق المحامي زياد طارق الحديدي: وصلني العطر فعلاً راقي و اول مره يوصلني عطر ويطلع كلام الاعلان كله صحيح عاشت ايدك حبي وان شاءالله بعد منه ورايح عطوري من يمكم",
            "en": "Comment by المحامي زياد طارق الحديدي: وصلني العطر فعلاً راقي و اول مره يوصلني عطر ويطلع كلام الاعلان كله صحيح عاشت ايدك حبي وان شاءالله بعد منه ورايح عطوري من يمكم"
          },
          "doubt_i18n": {
            "ar": "خايف يطلع مثل كل إعلان؟",
            "en": "Afraid it's like every ad?"
          },
          "quote_i18n": {
            "ar": "اول مره يوصلني عطر ويطلع كلام الاعلان كله صحيح"
          },
          "author": "المحامي زياد طارق الحديدي",
          "width": 828,
          "height": 253,
          "crop": {
            "left": 12,
            "right": 2
          }
        },
        {
          "url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/cba26e5e-7ad0-4213-b804-d535b7c0d7e6.jpeg",
          "alt_i18n": {
            "ar": "تعليق dy4axauduv7j: كنت متوقع مثل اي اعلان وكنت ناوي بس اشوفه مو مثل ماتفضلت ارجعه واول مره اعلق الشي بي خير امانة الله لا اعرف الناس ولا الي مصلحه يمهم بس نصيحه لاتقيس من اول مترش انتظر ربع ساعه وشوف الفوحان فد شي خيال",
            "en": "Comment by dy4axauduv7j: كنت متوقع مثل اي اعلان وكنت ناوي بس اشوفه مو مثل ماتفضلت ارجعه واول مره اعلق الشي بي خير امانة الله لا اعرف الناس ولا الي مصلحه يمهم بس نصيحه لاتقيس من اول مترش انتظر ربع ساعه وشوف الفوحان فد شي خيال"
          },
          "doubt_i18n": {
            "ar": "أول رشة ما فاحت؟",
            "en": "The first spray didn't carry?"
          },
          "quote_i18n": {
            "ar": "لاتقيس من اول مترش انتظر ربع ساعه"
          },
          "author": "dy4axauduv7j",
          "width": 828,
          "height": 256,
          "crop": {
            "left": 12,
            "right": 2
          }
        },
        {
          "url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/6bf95f17-026a-400d-9067-08894b88a4a0.jpeg",
          "alt_i18n": {
            "ar": "تعليق Nano: يجنن يجنن صدك ثباتيه وفوحان قوي وما ياذي الجيوب لان اني اعاني من العطور القويه لان جيوبي تتحسس بس هذه ما اذاني",
            "en": "Comment by Nano: يجنن يجنن صدك ثباتيه وفوحان قوي وما ياذي الجيوب لان اني اعاني من العطور القويه لان جيوبي تتحسس بس هذه ما اذاني"
          },
          "doubt_i18n": {
            "ar": "تتحسس من العطور القوية؟",
            "en": "Sensitive to strong perfumes?"
          },
          "quote_i18n": {
            "ar": "ما ياذي الجيوب"
          },
          "author": "Nano",
          "width": 828,
          "height": 202,
          "crop": {
            "left": 12,
            "right": 2
          }
        },
        {
          "url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/8f742152-1b1a-4d65-a543-331196fc6830.jpeg",
          "alt_i18n": {
            "ar": "تعليق عباس: الصراحة وامنه احجيها العطر راقي البارحة وصلني شكراً جزيلاً ولا عندي معرفه بحظرتك بس شهاده ولازم احجيها فد شي العطر",
            "en": "Comment by عباس: الصراحة وامنه احجيها العطر راقي البارحة وصلني شكراً جزيلاً ولا عندي معرفه بحظرتك بس شهاده ولازم احجيها فد شي العطر"
          },
          "author": "عباس",
          "width": 828,
          "height": 208,
          "crop": {
            "left": 12,
            "right": 2
          }
        },
        {
          "url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/abf3f504-d358-4888-bd0f-eafd1136d248.jpeg",
          "alt_i18n": {
            "ar": "تعليق سوران البيرو: وصلني اليوم قسما بالله عطر عالمي",
            "en": "Comment by سوران البيرو: وصلني اليوم قسما بالله عطر عالمي"
          },
          "author": "سوران البيرو",
          "width": 828,
          "height": 167,
          "crop": {
            "left": 12,
            "right": 2
          }
        },
        {
          "url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/2f8ae556-1a0c-4cdb-b4e2-b30c2808755e.jpeg",
          "alt_i18n": {
            "ar": "تعليق Vito93: طبعا وصلي العطر عليه اربعة إرهاب من الفوحان رهيييب العطر",
            "en": "Comment by Vito93: طبعا وصلي العطر عليه اربعة إرهاب من الفوحان رهيييب العطر"
          },
          "author": "Vito93",
          "width": 828,
          "height": 173,
          "crop": {
            "left": 12,
            "right": 2
          }
        },
        {
          "url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/8e208e9b-b896-430d-839d-44d2a010b588.jpeg",
          "alt_i18n": {
            "ar": "تعليق ALI ALSHEMMARI: اليوم وصلني الله شاهد عطر مرتب مثلك",
            "en": "Comment by ALI ALSHEMMARI: اليوم وصلني الله شاهد عطر مرتب مثلك"
          },
          "author": "ALI ALSHEMMARI",
          "width": 828,
          "height": 160,
          "crop": {
            "left": 12,
            "right": 2
          }
        },
        {
          "url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/13ec2385-384c-4d1f-af39-793949cce8df.jpeg",
          "alt_i18n": {
            "ar": "تعليق Sagad: فعلا عن تجربه",
            "en": "Comment by Sagad: فعلا عن تجربه"
          },
          "author": "Sagad",
          "width": 828,
          "height": 184,
          "crop": {
            "left": 12,
            "right": 2
          }
        },
        {
          "url": "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/1ebf499e-fb7d-4325-a2fe-0b98e8530932.jpeg",
          "alt_i18n": {
            "ar": "تعليق Alpha decorations company: عطر ايخبل والكلام حقيقي اني جربته",
            "en": "Comment by Alpha decorations company: عطر ايخبل والكلام حقيقي اني جربته"
          },
          "author": "Alpha decorations company",
          "is_business": true,
          "width": 828,
          "height": 163,
          "crop": {
            "left": 12,
            "right": 2
          }
        }
      ]
    }$json$::jsonb AS gallery_patch,
    $json${
      "layout": "guarantee_card",
      "heading_i18n": {
        "ar": "كرت الضمان",
        "en": "Guarantee card"
      },
      "eyebrow_i18n": {
        "ar": "ويا كل طلب من شنايدر",
        "en": "With every Scheniders order"
      },
      "sub_i18n": {
        "ar": "حقك مكتوب هنا قبل ما تطلب",
        "en": "Your rights, in writing, before you order"
      },
      "anchor_id": "guarantee",
      "policy_link": {
        "href": "/policies/returns",
        "label_i18n": {
          "ar": "سياسة الإرجاع الكاملة",
          "en": "Full return policy"
        }
      },
      "items": [
        {
          "title_i18n": {
            "ar": "الدفع عند الاستلام",
            "en": "Pay on delivery"
          },
          "body_i18n": {
            "ar": "ما تدفع إلا بعد ما يوصلك العطر وتجرّبه من العيّنة الزجاجية اللي تجيك مجاناً ويا كل طلب.",
            "en": "You pay only after the perfume reaches you and you have tried it from the glass sample that comes free with every order."
          }
        },
        {
          "title_i18n": {
            "ar": "تفحصه والمندوب يمّك",
            "en": "Check it with the courier there"
          },
          "body_i18n": {
            "ar": "تتأكد من الجودة والمواصفات والفوحان والثبات قدّام المندوب. أي اختلاف، ترفضه وترجعلك قيمته كاملة.",
            "en": "Check the quality, the description, the projection and the longevity in front of the courier. Anything different, refuse it and get your money back in full."
          }
        },
        {
          "title_i18n": {
            "ar": "أسبوع تجربة ببيتك",
            "en": "A week's trial at home"
          },
          "body_i18n": {
            "ar": "تستعمل العطر وتخلّيه يمّك أسبوع كامل من يوم الاستلام. إذا ما عجبتك ريحته أو لگيت فرق بالمواصفات، ترجّعه ونرجعلك فلوسه.",
            "en": "Use the perfume and keep it for a full week from delivery. If you don't like the scent or find it differs from the description, return it and we refund you."
          }
        },
        {
          "title_i18n": {
            "ar": "عطور أصلية",
            "en": "Authentic perfumes"
          },
          "body_i18n": {
            "ar": "كل عطورنا مختارة بإيدنا وبعناية من أفخم المصادر العالمية ومن أجود الخامات العطرية. ما نتعامل بالعطور التركية المصنّعة بالجملة ولا الصينية الرديئة.",
            "en": "Every perfume is hand-picked with care from the finest sources in the world and the best aromatic materials. We never deal in bulk-made Turkish or low-grade Chinese perfumes."
          }
        }
      ]
    }$json$::jsonb AS accordion_patch,
    $json${
      "guarantee_anchor_id": "guarantee",
      "return_promise_i18n": {
        "ar": "ما عجبك؟ ترفضه قدام المندوب أو ترجّعه خلال أسبوع",
        "en": "Don't like it? Refuse it in front of the courier, or return it within a week."
      }
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
             WHEN c.gallery_id
               THEN jsonb_set(x.sec, '{base}', coalesce(x.sec->'base', '{}'::jsonb) || c.gallery_patch)
             WHEN c.accordion_id
               THEN jsonb_set(x.sec, '{base}', (coalesce(x.sec->'base', '{}'::jsonb) || c.accordion_patch) - c.accordion_remove)
             WHEN c.pdp_id
               THEN jsonb_set(x.sec, '{base}', coalesce(x.sec->'base', '{}'::jsonb) || c.pdp_patch)
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
  md5(t.draft::text) = 'e4800d7bb6f80f656cd848d3dbf469d9' AS draft_md5_ok,
  md5(target.draft::text) AS target_md5
FROM t, target;
```
```bash
(cd packages && supabase db query --linked -f ../tmp/pdp-1d/dryrun-1d.sql -o csv)
```
Expected:
```
rev_ok,draft_md5_ok,target_md5
true,true,8d0e6032304d56057abfecbb4487b95b
```
`target_md5` equals the replay's `after first`: the SELECT and the migration compute the same draft (pre-run live on 2026-10-30).

- [ ] **Step 7: Commit the migration (not applied)**

```bash
git branch --show-current
git add "packages/supabase/migrations/${STAMP}_scheniders_iraq_pdp_redesign_1d_draft.sql"
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "chore(db): scheniders-iraq PDP redesign 1d draft config (not applied)" -m "Proof stack + guarantee card + the band's guarantee anchor. Applied with supabase db query --linked -f only after the code is live; draft only, guarded on draft md5 e4800d7b… and store_config_rev 38." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Redesign fixtures carry 1d; the pair tests; reviewed snapshot update

**Files:**
- Modify: `packages/sections/src/_pdp-redesign-fixtures.ts`
- Modify: `packages/sections/src/_pdp-redesign-snapshot.test.tsx`
- Modify: `packages/sections/src/__snapshots__/_pdp-redesign-snapshot.test.tsx.snap` (vitest `-u`, this file only)
- Scratch: `tmp/pdp-1d/snapcheck.mjs`

This task is its own commit: the snapshot change is reviewed apart from the code.

- [ ] **Step 1: Add the 1d data to the fixtures**

In `packages/sections/src/_pdp-redesign-fixtures.ts`, delete:
```ts
/** The draft pdp_direct_order after slices 1b and 1c. */
export const IRAQ_REDESIGN_PDP_PROPS: PdpDirectOrderProps = {
  ...EXPRESS_IRAQ_DRAFT_PDP_PROPS,
  ...SLICE_1B_PDP_PATCH,
  ...SLICE_1C_PDP_PATCH,
};

```
(it moves to the end of the file: it now spreads `SLICE_1D_PDP_PATCH`, which is declared below it, and a `const` cannot be read before its declaration).

Then append to the end of the file:
```ts

/** Slice 1d: the two return wordings Ali chooses between (to-do 5, D8).
 *  Each one is the band's row-1 line AND the guarantee card's week term,
 *  so the page states one policy. Option ١ ("any reason") is the draft's
 *  until Ali picks; switching means changing IRAQ_RETURN_WORDING and
 *  regenerating the draft migration that writes both. */
export const RETURN_WORDING = {
  /** Option ١: refuse at the door or return within a week, for any reason. */
  any_reason: {
    band: {
      ar: "ما عجبك؟ ترفضه قدام المندوب أو ترجّعه خلال أسبوع",
      en: "Don't like it? Refuse it in front of the courier, or return it within a week.",
    },
    week_term: {
      ar: "تستعمل العطر وتخلّيه يمّك أسبوع كامل من يوم الاستلام. إذا ما عجبتك ريحته أو لگيت فرق بالمواصفات، ترجّعه ونرجعلك فلوسه.",
      en: "Use the perfume and keep it for a full week from delivery. If you don't like the scent or find it differs from the description, return it and we refund you.",
    },
  },
  /** Option ٢: the same two remedies, only when it differs from the description. */
  spec_difference: {
    band: {
      ar: "لگيت فرق بالمواصفات؟ ترفضه قدام المندوب، أو ترجّعه خلال أسبوع",
      en: "Differs from the description? Refuse it in front of the courier, or return it within a week.",
    },
    week_term: {
      ar: "تستعمل العطر وتخلّيه يمّك أسبوع كامل من يوم الاستلام. إذا لگيت فرق بالمواصفات، ترجّعه ونرجعلك فلوسه.",
      en: "Use the perfume and keep it for a full week from delivery. If you find it differs from the description, return it and we refund you.",
    },
  },
} as const;

/** The wording the draft carries (D8: option ١ until Ali decides). */
export const IRAQ_RETURN_WORDING = RETURN_WORDING.any_reason;

/** Slice 1d: the keys the 1d draft migration merges into pdp_direct_order's
 *  base. The «الشروط» link's target now exists (the guarantee card), and
 *  the return line is restated from the one wording. */
export const SLICE_1D_PDP_PATCH = {
  guarantee_anchor_id: "guarantee",
  return_promise_i18n: { ...IRAQ_RETURN_WORDING.band },
} satisfies Partial<PdpDirectOrderProps>;

const LOGO_URL =
  "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/da0471e3-4980-4e4d-80ef-4ea9e75bf2da.png";

/** One comment screenshot: its stored file, the commenter and the full
 *  comment, verbatim (synthesis.json, area g2; to-do 4 approves them).
 *  828px wide TikTok captures; heights measured from the stored files. */
interface ProofShot {
  id: string;
  height: number;
  author: string;
  text: string;
  business?: true;
  lead?: { doubt: { ar: string; en: string }; quote: string };
}

/** The draft's order (Q5): p5, p2, p4 lead; «Alpha decorations company» last. */
const PROOF_SHOTS: ProofShot[] = [
  {
    // p5
    id: "536e8d88-e55a-49f0-a9b3-305b69cbfbf5",
    height: 253,
    author: "المحامي زياد طارق الحديدي",
    text: "وصلني العطر فعلاً راقي و اول مره يوصلني عطر ويطلع كلام الاعلان كله صحيح عاشت ايدك حبي وان شاءالله بعد منه ورايح عطوري من يمكم",
    lead: {
      doubt: { ar: "خايف يطلع مثل كل إعلان؟", en: "Afraid it's like every ad?" },
      quote: "اول مره يوصلني عطر ويطلع كلام الاعلان كله صحيح",
    },
  },
  {
    // p2
    id: "cba26e5e-7ad0-4213-b804-d535b7c0d7e6",
    height: 256,
    author: "dy4axauduv7j",
    text: "كنت متوقع مثل اي اعلان وكنت ناوي بس اشوفه مو مثل ماتفضلت ارجعه واول مره اعلق الشي بي خير امانة الله لا اعرف الناس ولا الي مصلحه يمهم بس نصيحه لاتقيس من اول مترش انتظر ربع ساعه وشوف الفوحان فد شي خيال",
    lead: {
      doubt: { ar: "أول رشة ما فاحت؟", en: "The first spray didn't carry?" },
      quote: "لاتقيس من اول مترش انتظر ربع ساعه",
    },
  },
  {
    // p4
    id: "6bf95f17-026a-400d-9067-08894b88a4a0",
    height: 202,
    author: "Nano",
    text: "يجنن يجنن صدك ثباتيه وفوحان قوي وما ياذي الجيوب لان اني اعاني من العطور القويه لان جيوبي تتحسس بس هذه ما اذاني",
    lead: {
      doubt: { ar: "تتحسس من العطور القوية؟", en: "Sensitive to strong perfumes?" },
      quote: "ما ياذي الجيوب",
    },
  },
  {
    // p3
    id: "8f742152-1b1a-4d65-a543-331196fc6830",
    height: 208,
    author: "عباس",
    text: "الصراحة وامنه احجيها العطر راقي البارحة وصلني شكراً جزيلاً ولا عندي معرفه بحظرتك بس شهاده ولازم احجيها فد شي العطر",
  },
  {
    // p6
    id: "abf3f504-d358-4888-bd0f-eafd1136d248",
    height: 167,
    author: "سوران البيرو",
    text: "وصلني اليوم قسما بالله عطر عالمي",
  },
  {
    // p7
    id: "2f8ae556-1a0c-4cdb-b4e2-b30c2808755e",
    height: 173,
    author: "Vito93",
    text: "طبعا وصلي العطر عليه اربعة إرهاب من الفوحان رهيييب العطر",
  },
  {
    // p9
    id: "8e208e9b-b896-430d-839d-44d2a010b588",
    height: 160,
    author: "ALI ALSHEMMARI",
    text: "اليوم وصلني الله شاهد عطر مرتب مثلك",
  },
  {
    // p8
    id: "13ec2385-384c-4d1f-af39-793949cce8df",
    height: 184,
    author: "Sagad",
    text: "فعلا عن تجربه",
  },
  {
    // p1
    id: "1ebf499e-fb7d-4325-a2fe-0b98e8530932",
    height: 163,
    author: "Alpha decorations company",
    text: "عطر ايخبل والكلام حقيقي اني جربته",
    business: true,
  },
];

/** Slice 1d: the keys the 1d draft migration merges into image_gallery's base. */
export const SLICE_1D_GALLERY_PATCH = {
  layout: "stack",
  scope: "store",
  initial_count: 3,
  heading_style: "chapter",
  source_label_i18n: { ar: "تعليقات على إعلاناتنا بتيك توك", en: "Comments on our TikTok ads" },
  legend_i18n: {
    ar: "هاي العلامة يعني سوّينا لايك للتعليق من حسابنا",
    en: "This mark means we liked the comment from our account",
  },
  legend_image_url: LOGO_URL,
  images: PROOF_SHOTS.map((shot) => ({
    url: `${REVIEW_SHOTS}${shot.id}.jpeg`,
    alt_i18n: { ar: `تعليق ${shot.author}: ${shot.text}`, en: `Comment by ${shot.author}: ${shot.text}` },
    ...(shot.lead ? { doubt_i18n: shot.lead.doubt, quote_i18n: { ar: shot.lead.quote } } : {}),
    author: shot.author,
    ...(shot.business ? { is_business: true } : {}),
    width: 828,
    height: shot.height,
    crop: { left: 12, right: 2 },
  })),
} satisfies Partial<GalleryProps>;

/** Slice 1d: the keys the 1d draft migration merges into accordion_richtext's
 *  base — the four second-person terms of concept g2-A (to-do 10). */
export const SLICE_1D_ACCORDION_PATCH = {
  layout: "guarantee_card",
  heading_i18n: { ar: "كرت الضمان", en: "Guarantee card" },
  eyebrow_i18n: { ar: "ويا كل طلب من شنايدر", en: "With every Scheniders order" },
  sub_i18n: { ar: "حقك مكتوب هنا قبل ما تطلب", en: "Your rights, in writing, before you order" },
  anchor_id: "guarantee",
  policy_link: {
    href: "/policies/returns",
    label_i18n: { ar: "سياسة الإرجاع الكاملة", en: "Full return policy" },
  },
  items: [
    {
      title_i18n: { ar: "الدفع عند الاستلام", en: "Pay on delivery" },
      body_i18n: {
        ar: "ما تدفع إلا بعد ما يوصلك العطر وتجرّبه من العيّنة الزجاجية اللي تجيك مجاناً ويا كل طلب.",
        en: "You pay only after the perfume reaches you and you have tried it from the glass sample that comes free with every order.",
      },
    },
    {
      title_i18n: { ar: "تفحصه والمندوب يمّك", en: "Check it with the courier there" },
      body_i18n: {
        ar: "تتأكد من الجودة والمواصفات والفوحان والثبات قدّام المندوب. أي اختلاف، ترفضه وترجعلك قيمته كاملة.",
        en: "Check the quality, the description, the projection and the longevity in front of the courier. Anything different, refuse it and get your money back in full.",
      },
    },
    {
      title_i18n: { ar: "أسبوع تجربة ببيتك", en: "A week's trial at home" },
      body_i18n: { ...IRAQ_RETURN_WORDING.week_term },
    },
    {
      title_i18n: { ar: "عطور أصلية", en: "Authentic perfumes" },
      body_i18n: {
        ar: "كل عطورنا مختارة بإيدنا وبعناية من أفخم المصادر العالمية ومن أجود الخامات العطرية. ما نتعامل بالعطور التركية المصنّعة بالجملة ولا الصينية الرديئة.",
        en: "Every perfume is hand-picked with care from the finest sources in the world and the best aromatic materials. We never deal in bulk-made Turkish or low-grade Chinese perfumes.",
      },
    },
  ],
} satisfies Partial<AccordionProps>;

/** Slice 1d: the keys the 1d draft migration removes from accordion_richtext's
 *  base (the mid-page «تحب تحچي ويانا؟» call card). */
export const SLICE_1D_ACCORDION_REMOVE = ["call_row"] as const;

/** `(base || patch) - remove`, the migration's jsonb merge, in TypeScript. */
function jsonbMerge(base: object, patch: object, remove: readonly string[] = []): Record<string, unknown> {
  return Object.fromEntries(Object.entries({ ...base, ...patch }).filter(([key]) => !remove.includes(key)));
}

/** The draft image_gallery after slice 1d (unparsed, as stored). */
export const IRAQ_REDESIGN_GALLERY_INPUT = jsonbMerge(IRAQ_DRAFT_GALLERY_BASE, SLICE_1D_GALLERY_PATCH);

/** The draft accordion_richtext after slice 1d (unparsed, as stored). */
export const IRAQ_REDESIGN_ACCORDION_INPUT = jsonbMerge(
  IRAQ_DRAFT_ACCORDION_BASE,
  SLICE_1D_ACCORDION_PATCH,
  SLICE_1D_ACCORDION_REMOVE,
);

/** The draft pdp_direct_order after slices 1b, 1c and 1d. */
export const IRAQ_REDESIGN_PDP_PROPS: PdpDirectOrderProps = {
  ...EXPRESS_IRAQ_DRAFT_PDP_PROPS,
  ...SLICE_1B_PDP_PATCH,
  ...SLICE_1C_PDP_PATCH,
  ...SLICE_1D_PDP_PATCH,
};
```

`RETURN_WORDING` is the one source of scope decision 2. The ar texts of the four terms, the eyebrow, title and sub are the spec's §1.5 draft content verbatim; every `en`, and option ٢'s week term, are drafted here for Ali's sign-off (to-do 10).

- [ ] **Step 2: Extend the redesign snapshot test**

In `packages/sections/src/_pdp-redesign-snapshot.test.tsx`:

Replace:
```ts
import { StoreBaseProvider } from "./helpers/store-context";
import pdp_direct_order from "./pdp_direct_order";
import type { SectionRenderContext } from "./_types";
```
with:
```ts
import type { LocaleCode } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import accordion_richtext from "./accordion_richtext";
import image_gallery from "./image_gallery";
import pdp_direct_order from "./pdp_direct_order";
import type { SectionRenderContext } from "./_types";
```

Replace:
```ts
import {
  IRAQ_REDESIGN_PDP_PROPS,
  IRAQ_REDESIGN_TENANT,
  SLICE_1B_CONTACT_PATCH,
  SLICE_1B_PDP_PATCH,
  SLICE_1C_PDP_PATCH,
} from "./_pdp-redesign-fixtures";
```
with:
```ts
import {
  IRAQ_DRAFT_ACCORDION_BASE,
  IRAQ_DRAFT_GALLERY_BASE,
  IRAQ_REDESIGN_ACCORDION_INPUT,
  IRAQ_REDESIGN_GALLERY_INPUT,
  IRAQ_REDESIGN_PDP_PROPS,
  IRAQ_REDESIGN_TENANT,
  IRAQ_RETURN_WORDING,
  SLICE_1B_CONTACT_PATCH,
  SLICE_1B_PDP_PATCH,
  SLICE_1C_PDP_PATCH,
  SLICE_1D_ACCORDION_PATCH,
  SLICE_1D_ACCORDION_REMOVE,
  SLICE_1D_GALLERY_PATCH,
  SLICE_1D_PDP_PATCH,
} from "./_pdp-redesign-fixtures";
```

Replace:
```ts
  return JSON.parse(m?.[1] ?? "null");
}
```
with:
```ts
  return JSON.parse(m?.[1] ?? "null");
}

/** The `ARRAY['a', 'b']` literal between `-- <name>:begin` and `-- <name>:end`. */
function migrationTextArray(sql: string, name: string): string[] {
  const block = sql.slice(sql.indexOf(`-- ${name}:begin`), sql.indexOf(`-- ${name}:end`));
  const m = /ARRAY\[([^\]]*)\]/.exec(block);
  expect(m).not.toBeNull();
  return [...(m?.[1] ?? "").matchAll(/'([^']*)'/g)].map((x) => x[1] ?? "");
}
```

Replace:
```ts
  it("the patched props satisfy the schema unchanged", () => {
```
with:
```ts
  it("slice 1d patches: gallery, accordion (+ removed keys), pdp_direct_order", () => {
    const sql1d = migrationSql("scheniders_iraq_pdp_redesign_1d_draft");
    expect(migrationJson(sql1d, "gallery_patch")).toEqual(SLICE_1D_GALLERY_PATCH);
    expect(migrationJson(sql1d, "accordion_patch")).toEqual(SLICE_1D_ACCORDION_PATCH);
    expect(migrationTextArray(sql1d, "accordion_remove")).toEqual([...SLICE_1D_ACCORDION_REMOVE]);
    expect(migrationJson(sql1d, "pdp_patch")).toEqual(SLICE_1D_PDP_PATCH);
  });

  it("the band's «الشروط» link targets the guarantee card", () => {
    expect(IRAQ_REDESIGN_PDP_PROPS.guarantee_anchor_id).toBe("guarantee");
    expect(accordion_richtext.schema.parse(IRAQ_REDESIGN_ACCORDION_INPUT).anchor_id).toBe(
      IRAQ_REDESIGN_PDP_PROPS.guarantee_anchor_id,
    );
  });

  it("the band's return line and the card's week term come from one wording", () => {
    expect(SLICE_1B_PDP_PATCH.return_promise_i18n).toEqual(IRAQ_RETURN_WORDING.band);
    expect(IRAQ_REDESIGN_PDP_PROPS.return_promise_i18n).toEqual(IRAQ_RETURN_WORDING.band);
    const weekTerm = accordion_richtext.schema.parse(IRAQ_REDESIGN_ACCORDION_INPUT).items[2];
    expect(weekTerm?.body_i18n).toEqual(IRAQ_RETURN_WORDING.week_term);
  });

  it("the 1d gallery and accordion parse to exactly what is stored", () => {
    expect(image_gallery.schema.parse(IRAQ_REDESIGN_GALLERY_INPUT)).toEqual(IRAQ_REDESIGN_GALLERY_INPUT);
    expect(accordion_richtext.schema.parse(IRAQ_REDESIGN_ACCORDION_INPUT)).toEqual(IRAQ_REDESIGN_ACCORDION_INPUT);
    expect(IRAQ_REDESIGN_ACCORDION_INPUT).not.toHaveProperty("call_row");
  });

  it("the patched props satisfy the schema unchanged", () => {
```

Append to the end of the file:
```tsx

describe("image_gallery + accordion_richtext — redesign draft (slice 1d)", () => {
  function renderGallery(input: unknown, locale: LocaleCode): string {
    return renderToStaticMarkup(
      <StoreBaseProvider base="/s/fixture-store">
        <image_gallery.render
          props={image_gallery.schema.parse(input)}
          ctx={productCtx(saleProduct, { tenant: IRAQ_REDESIGN_TENANT, runtime: { ...productRuntime, locale } })}
        />
      </StoreBaseProvider>,
    );
  }

  function renderAccordion(input: unknown, locale: LocaleCode): string {
    return renderToStaticMarkup(
      <StoreBaseProvider base="/s/fixture-store">
        <accordion_richtext.render
          props={accordion_richtext.schema.parse(input)}
          ctx={productCtx(saleProduct, { tenant: IRAQ_REDESIGN_TENANT, runtime: { ...productRuntime, locale } })}
        />
      </StoreBaseProvider>,
    );
  }

  it.each(["ar", "en"] as const)("proof stack, %s", (locale) => {
    expect(renderGallery(IRAQ_REDESIGN_GALLERY_INPUT, locale)).toMatchSnapshot();
  });

  it.each(["ar", "en"] as const)("guarantee card, %s", (locale) => {
    expect(renderAccordion(IRAQ_REDESIGN_ACCORDION_INPUT, locale)).toMatchSnapshot();
  });

  it("the stack adds no dir attribute; the card drops the quiet rows' dir=\"auto\"", () => {
    const dirs = (html: string) => html.split('dir="').length - 1;
    expect(dirs(renderGallery(IRAQ_REDESIGN_GALLERY_INPUT, "ar"))).toBe(dirs(renderGallery(IRAQ_DRAFT_GALLERY_BASE, "ar")));
    expect(dirs(renderGallery(IRAQ_REDESIGN_GALLERY_INPUT, "ar"))).toBe(0);
    expect(dirs(renderAccordion(IRAQ_DRAFT_ACCORDION_BASE, "ar"))).toBe(5);
    expect(dirs(renderAccordion(IRAQ_REDESIGN_ACCORDION_INPUT, "ar"))).toBe(0);
  });
});
```

- [ ] **Step 3: Type gate**

Run the sections type gate. Expected: no output.

- [ ] **Step 4: Run it in CI mode to see exactly what changes**

```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-redesign-snapshot.test.tsx
```
Expected: `Snapshots  10 failed`, `Tests  10 failed | 12 passed (22)`. The 10 are the 6 existing pdp_direct_order renders (the band now carries the «الشروط» link) and the 4 missing stack/card renders. The 1d mirror test, the two pair tests, the parse test and the `dir` tests pass.

- [ ] **Step 5: Write the snapshot check (before updating)**

Create `tmp/pdp-1d/snapcheck.mjs`:

```js
// The 1d snapshot update, checked: every pdp_direct_order render that
// existed before is byte-identical once the one new «الشروط» / «Terms»
// link (and the space before it) is taken out, and it gained exactly one
// such link; the only new keys are the proof stack and the guarantee card.
// Run from the repo root.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const f = "packages/sections/src/__snapshots__/_pdp-redesign-snapshot.test.tsx.snap";
const parse = (s) =>
  Object.fromEntries([...s.matchAll(/exports\[`([^`]+)`\] = `\n?"([\s\S]*?)"\n?`;/g)].map((m) => [m[1], m[2]]));
const before = parse(execFileSync("git", ["show", `HEAD:${f}`], { encoding: "utf8" }));
const after = parse(readFileSync(f, "utf8"));
const LINK = / <a href="#guarantee" class="[^"]*">(?:الشروط|Terms)<\/a>/g;
for (const key of Object.keys(before)) {
  const b = after[key] ?? "";
  console.log(
    `${key.split(" > ")[1]}: one link ${(b.match(LINK) ?? []).length === 1}, rest identical ${b.replace(LINK, "") === before[key]}`,
  );
}
console.log(`new: ${Object.keys(after).filter((k) => !(k in before)).map((k) => k.split(" > ")[1]).join(" | ")}`);
```

- [ ] **Step 6: Update this one snapshot file (the only `-u` in the slice)**

```bash
pnpm exec vitest run packages/sections/src/_pdp-redesign-snapshot.test.tsx -u
git diff --stat -- packages/sections/src/__snapshots__
node tmp/pdp-1d/snapcheck.mjs
```
Expected:
- `Snapshots  4 written` and `Tests  22 passed (22)` (vitest 2 counts only the new renders in that line; the 6 rewritten ones show in the diff), then exactly one file, `_pdp-redesign-snapshot.test.tsx.snap | 20 ++++++++++++++------` (`14 insertions(+), 6 deletions(-)`);
- `snapcheck.mjs` prints:
```
ar, Wayfarer, live data 1: one link true, rest identical true
ar, discounted, multi-image, reviewed 1: one link true, rest identical true
ar, scent attributes 1: one link true, rest identical true
en, Wayfarer, live data 1: one link true, rest identical true
en, discounted, multi-image, reviewed 1: one link true, rest identical true
en, scent attributes 1: one link true, rest identical true
new: guarantee card, ar 1 | guarantee card, en 1 | proof stack, ar 1 | proof stack, en 1
```
Any `false` means the update changed more than the link: stop and fix the code, do not commit the snapshot.

- [ ] **Step 7: Read the snapshot for what 1d meant to change**

```bash
f=packages/sections/src/__snapshots__/_pdp-redesign-snapshot.test.tsx.snap
for k in 'href="#guarantee"' 'id="guarantee"' 'data-proof-item=' 'data-proof-doubt=' 'data-proof-quote' 'data-proof-legend' 'data-proof-business' 'data-proof-rest' 'شوف 6 تعليقات ثانية' 'See 6 more comments' '3 من أصل 9، على عطورنا بشكل عام' 'aspect-ratio:712.08 / 253' 'data-guarantee-term=' 'تحب تحچي ويانا' 'شحن فائق السرعة' 'href="/s/fixture-store/policies/returns"'; do printf '%s: ' "$k"; grep -o -- "$k" $f | wc -l | tr -d ' '; done
```
Expected, one count per line in this order: `6 2 18 6 6 2 2 2 1 1 1 2 8 0 0 2`. That is:
- the «الشروط»/«Terms» link in all 6 pdp renders, and its target once per card render;
- 9 comments per stack render, 3 doubts and 3 quotes (p5, p2, p4), the legend once, one business tag (p1), one hidden rest list;
- the plural-correct expand label and the scope line;
- p5's crop box at 828×253 → 712.08 / 253;
- 4 terms per card render; no call row and no «شحن فائق السرعة» row; one policy link per card render, under the store base.

- [ ] **Step 8: Deterministic in CI mode, and the whole sections suite**

```bash
CI=true pnpm exec vitest run packages/sections/src
```
Expected: `Test Files  126 passed (126)`, `Tests  1374 passed (1374)`.

- [ ] **Step 9: Commit (its own, reviewed snapshot commit)**

```bash
git branch --show-current
git add packages/sections/src/_pdp-redesign-fixtures.ts packages/sections/src/_pdp-redesign-snapshot.test.tsx packages/sections/src/__snapshots__/_pdp-redesign-snapshot.test.tsx.snap
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "test(sections): redesign fixtures mirror the 1d draft migration; band «الشروط» now has its target; stack + card renders" -m "Reviewed snapshot update: every 1c render is byte-identical once the one new «الشروط»/«Terms» link is removed. Four renders added (proof stack, guarantee card; ar/en). All baselines unchanged." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Slice verification gate, PR, merge, deploy

No new code. If a step fails, fix the root cause in the task that owns the file, commit that fix, and re-run this whole task.

- [ ] **Step 1: No baseline changed; the only snapshot changes are the new frozen file and the redesign one**

```bash
git diff --stat origin/main HEAD -- packages/sections/src/__snapshots__
git status --porcelain packages/sections/src/__snapshots__
```
Expected: exactly two files — `_pdp-proof-guarantee-baseline-snapshot.test.tsx.snap | 9 +++++++++` (new) and `_pdp-redesign-snapshot.test.tsx.snap | 20 ++++++++++++++------`; the status prints nothing.

- [ ] **Step 2: Every baseline, unchanged, in CI mode**

```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_pdp-classic-snapshot.test.tsx packages/sections/src/_pdp-lower-baseline-snapshot.test.tsx packages/sections/src/_pdp-scent-baseline-snapshot.test.tsx packages/sections/src/_image-gallery-baseline-snapshot.test.tsx packages/sections/src/_product-reviews-baseline-snapshot.test.tsx packages/sections/src/_product-grid-baseline-snapshot.test.tsx packages/sections/src/_chrome-baseline-snapshot.test.tsx packages/sections/src/_order-confirmation-baseline-snapshot.test.tsx packages/sections/src/_site-footer-baseline-snapshot.test.tsx packages/sections/src/_sticky-cta-baseline-snapshot.test.tsx packages/sections/src/_primitives-baseline-snapshot.test.tsx packages/sections/src/_pdp-proof-guarantee-baseline-snapshot.test.tsx packages/sections/src/accordion_richtext.test.tsx
```
Expected: `Test Files  14 passed (14)`, `Tests  159 passed (159)`, with no `written`, `updated` or `obsolete` line.

- [ ] **Step 3: The full suites**

```bash
CI=true pnpm exec vitest run packages/sections/src packages/shared/src apps/storefront/lib
```
Expected: `Test Files  196 passed (196)`, `Tests  2359 passed (2359)`: Task 0's 189 / 2265 plus 7 files and 94 tests (baseline 4, gallery props 21, strings 9, Kurdish coverage +1, crop 6, island 3, stack markup 15, guarantee card 26, redesign snapshot +9).

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
grep -nE ":\s*any\b|<any>|\bas any\b|@ts-ignore|eslint-disable|#[0-9a-fA-F]{3,6}\b|rgba?\(|\sdir=" packages/sections/src/image_gallery.stack.tsx packages/sections/src/image_gallery.strings.ts packages/sections/src/image-gallery-crop.ts packages/sections/src/accordion_richtext.guarantee.tsx packages/sections/src/_pdp-redesign-fixtures.ts
grep -nE "[A-Za-z_)\]]!\.|[A-Za-z_)\]]!;|[A-Za-z_)\]]!\)" packages/sections/src/image_gallery.tsx packages/sections/src/image_gallery.stack.tsx packages/sections/src/image_gallery.strings.ts packages/sections/src/image-gallery-crop.ts packages/sections/src/accordion_richtext.tsx packages/sections/src/accordion_richtext.client.tsx packages/sections/src/accordion_richtext.guarantee.tsx packages/sections/src/_pdp-redesign-fixtures.ts
git diff origin/main HEAD -- packages/sections/src ':!packages/sections/src/__snapshots__' ':!*.test.ts' ':!*.test.tsx' | grep -E '^\+.*(eslint-disable|ts-ignore|:\s*any\b|<any>|\bas any\b|\sdir=|#[0-9a-fA-F]{6})'
grep -nE "bg-bk-primary" packages/sections/src/image_gallery.tsx packages/sections/src/image_gallery.stack.tsx packages/sections/src/accordion_richtext.guarantee.tsx
```
Expected: all four print nothing. (`image_gallery.tsx` and `accordion_richtext.tsx` keep their pre-existing inline `var(--bk-*, #hex)` fallbacks, which is why they are not in the first grep; the third grep proves no new line adds one.)

- [ ] **Step 7: Push and open the PR**

```bash
git branch --show-current
git status --porcelain
git log --oneline origin/main..HEAD
git push -u origin feat/pdp-p1d-proof-guarantee
```
Expected: the branch is `feat/pdp-p1d-proof-guarantee`; only the two untracked storefront notes (and the ignored `tmp/`); 8 commits, from "freeze scheniders-iraq's draft proof carousel" to "redesign fixtures mirror the 1d draft migration".

```bash
gh pr create --base main --head feat/pdp-p1d-proof-guarantee --title "PDP redesign 1d: «كلامهم مو كلامنا» proof stack + «كرت الضمان», draft migration (not applied)" --body "Slice 1d of docs/superpowers/specs/2026-10-27-pdp-lower-page-redesign-design.md (§1.5, §1.3 guarantee anchor, §1.9).

- image_gallery layout \"stack\" (opt-in): lead comments with a numbered doubt, the verbatim quote as live text, the author, and a full-width screenshot cropped to the comment column at its natural height; a legend for the liked-by-us mark; the rest behind one plural-correct expand button; every screenshot opens the existing viewer.
- accordion_richtext layout \"guarantee_card\" (opt-in): one always-open espresso «كرت الضمان», numbered terms, one policy link, id={anchor_id}; the call row never renders. heading_style on both sections.
- Draft migration for scheniders-iraq (draft only, md5 + rev guarded, idempotent): proof order p5, p2, p4 … Alpha last; the four second-person terms; the call row removed; guarantee_anchor_id so the band's «الشروط» link has its target. NOT applied: applied after this PR is deployed.
- The band's return line and the card's week term are written from one wording (RETURN_WORDING); a test pins the pair.
- New frozen baseline for the draft's carousel and quiet accordion (written before any code change); reviewed redesign-snapshot update in its own commit (pdp renders identical except the one «الشروط» link).

Tests: sections + shared + storefront lib 196 files / 2359 tests; type-check and lint green.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 8: Merge once CI is green, then wait for production**

```bash
gh pr checks --watch
gh pr merge --merge
```
Merge as gga2000 (Vercel builds only gga2000 commits). Then confirm the production deployment of the merge commit is READY and that the production domain serves it (a Vercel rollback pins production): Vercel MCP `list_deployments` for the storefront project, or the dashboard.

---

### Task 10: Apply the 1d draft migration (after the code is live)

Only after Task 9 Step 8 shows the merge commit live in production. Until then the draft must not carry `layout: "stack"` / `"guarantee_card"`: old code would fall back (grid for the gallery, cards for the accordion) and a builder save on old code could drop the new keys.

- [ ] **Step 1: Re-check the guards and the timestamp order**

```bash
git switch feat/pdp-p1d-proof-guarantee && git pull --ff-only origin main
(cd packages && supabase db query --linked "SELECT store_config_rev, md5(store_config_v2_draft::text) AS draft_md5, md5(store_config_v2::text) AS pub_md5 FROM tenants WHERE slug='scheniders-iraq'" -o csv)
ls packages/supabase/migrations | grep -E '^[0-9]{14}_' | sort | tail -2
```
Expected:
- `38,e4800d7bb6f80f656cd848d3dbf469d9,a6f87ba3181b0e94f41ba4a700de257b` (or the values Task 0 pinned);
- the last file listed is `<STAMP>_scheniders_iraq_pdp_redesign_1d_draft.sql`.

If the md5 or rev moved, stop and redo Task 7 Steps 2–6 in a follow-up PR (with Task 8's mirror test still green). If a later-stamped migration reached main first, re-stamp with `git mv` to the current UTC time in a follow-up PR; the mirror test finds the file by suffix.

- [ ] **Step 2: Dry run again**

```bash
(cd packages && supabase db query --linked -f ../tmp/pdp-1d/dryrun-1d.sql -o csv)
```
Expected: `true,true,8d0e6032304d56057abfecbb4487b95b`.

- [ ] **Step 3: Apply**

```bash
F=$(ls packages/supabase/migrations/*_scheniders_iraq_pdp_redesign_1d_draft.sql); echo "$F"
(cd packages && supabase db query --linked -f "../$F")
```
Expected: exit 0, no rows. On `draft md5 is …` or `store_config_rev is …`, nothing was written: go back to Step 1.

- [ ] **Step 4: Record it**

```bash
V=$(basename "$F" | cut -c1-14); echo "$V"
(cd packages && supabase migration repair --status applied "$V")
(cd packages && supabase db query --linked "SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '$V'" -o csv)
```
Expected: one row, `<V>,scheniders_iraq_pdp_redesign_1d_draft`.

- [ ] **Step 5: Re-read and diff against the intended result**

```bash
(cd packages && supabase db query --linked "SELECT store_config_rev, md5(store_config_v2_draft::text) AS draft_md5, md5(store_config_v2::text) AS pub_md5, updated_at > now() - interval '1 hour' AS bumped FROM tenants WHERE slug='scheniders-iraq'" -o csv)
(cd packages && supabase db query --linked "SELECT s.sec->>'type' AS type, s.sec->'base'->>'layout' AS layout, s.sec->'base'->>'anchor_id' AS anchor, s.sec->'base'->>'guarantee_anchor_id' AS pdp_anchor, s.sec->'base' ? 'call_row' AS call_row, md5((s.sec->'base'->'scent_card'->'product_copy')::text) AS copy_md5 FROM tenants t, jsonb_array_elements(t.store_config_v2_draft->'pages') p(page), jsonb_array_elements(p.page->'sections') s(sec) WHERE t.slug='scheniders-iraq' AND p.page->>'page_id'='product' AND s.sec->>'id' IN ('aae22169-cef4-4495-842b-863a7caa71c2','e5da8997-d564-4260-88f2-a6d73031b4ce','370f9b04-c300-4dbe-8ea9-b0f9b2d7f78d') ORDER BY 1" -o csv)
```
Expected:
- `38,8d0e6032304d56057abfecbb4487b95b,a6f87ba3181b0e94f41ba4a700de257b,true` (the draft equals the dry run's target; published unchanged);
- ```
  type,layout,anchor,pdp_anchor,call_row,copy_md5
  accordion_richtext,guarantee_card,guarantee,NULL,false,NULL
  image_gallery,stack,NULL,NULL,false,NULL
  pdp_direct_order,express,NULL,guarantee,false,523744df04f3acb3e6983ddb422d3266
  ```
  (1c's `product_copy`, the go-live file's guard, is untouched.)

- [ ] **Step 6: Clean up**

```bash
rm -rf "${TMPDIR:-/tmp}/pdp-1d-pglite"
```
Delete `tmp/pdp-1d/` after Task 11.

---

### Task 11: Draft-view checks at 390px (after Task 10)

- [ ] **Step 1: Open draft view and check the markup**

The storefront dev server runs from this worktree on :3001 (if not: copy `/Users/ali/scheniders-mono/apps/storefront/.env.local` into `apps/storefront/` and `pnpm dev:storefront`; delete the copy afterwards). Draft-view link:
```
http://localhost:3001/api/draft-view?tenant=scheniders-iraq&token=dev-preview-token&to=/s/scheniders-iraq/products/%D9%88%D9%8A%D9%81%D8%B1
```
Create `tmp/pdp-1d/order-check.mjs`:

```js
// Draft-view page order (D1): band → scent card → proof stack → reviews
// → guarantee card → FAQ/contact. Prints each marker's first offset and
// whether they come in that order. usage: node order-check.mjs <page.html>
import { readFileSync } from "node:fs";
const html = readFileSync(process.argv[2], "utf8");
const markers = [
  "data-promise-band",
  "data-scent-card",
  "data-proof-source",
  'id="reviews"',
  "data-guarantee-card",
  'href="#guarantee"',
];
const at = markers.map((m) => [m, html.indexOf(m)]);
for (const [m, i] of at) console.log(`${m}: ${i}`);
const body = at.filter(([m]) => m !== 'href="#guarantee"').map(([, i]) => i);
console.log(`in order: ${body.every((i, k) => i >= 0 && (k === 0 || i > (body[k - 1] ?? -1)))}`);
console.log(`link before its target: ${html.indexOf('href="#guarantee"') < html.indexOf('id="guarantee"')}`);
```
```bash
curl -s -c tmp/pdp-1d/cj -L "http://localhost:3001/api/draft-view?tenant=scheniders-iraq&token=dev-preview-token&to=/s/scheniders-iraq/products/%D9%88%D9%8A%D9%81%D8%B1" -o tmp/pdp-1d/page.html
for k in data-proof-item= data-proof-doubt= data-proof-legend data-proof-business data-proof-rest data-guarantee-card 'id="guarantee"' 'href="#guarantee"' 'تحب تحچي ويانا' 'شحن فائق السرعة' 'رسالة من زبون'; do printf '%s: ' "$k"; grep -o -- "$k" tmp/pdp-1d/page.html | wc -l | tr -d ' '; done
node tmp/pdp-1d/order-check.mjs tmp/pdp-1d/page.html
```
Expected: counts `9 3 1 1 1 1 1 1 0 0 0`; then six offsets and `in order: true`, `link before its target: true` (band → scent card → proof → reviews → guarantee card, D1).

- [ ] **Step 2: Capture at 390×844 and 360×780**

Use the `agent-browser` skill, or the Playwright MCP; if the MCP is wedged, Step 1's curl check is the fallback. Capture and check:
- the proof chapter: «كلامهم مو كلامنا» at 22px right-aligned, the «تعليقات على إعلاناتنا بتيك توك» pill with the `forum` icon, «3 من أصل 9، على عطورنا بشكل عام»;
- items 1–3: numeral discs 1/2/3 (yellow on espresso), the doubt, the quote at 20px/900 in «», the author (`dy4axauduv7j` and «Nano» read correctly), the screenshot full-width with no avatar column, the comment text ~16px, nothing cut at the bottom;
- after item 1 only: the legend with the ☢ logo and the heart;
- «شوف 6 تعليقات ثانية»: tap → the six appear in place (عباس, سوران البيرو, Vito93, ALI ALSHEMMARI, Sagad, Alpha decorations company + «حساب شركة»), the button reads «سدّ التعليقات»; tap again → hidden;
- tap any screenshot (lead or expanded): the viewer opens at that picture with «N من 9»; Escape / backdrop / close return focus to it;
- the band's «الشروط» → jumps to «كرت الضمان», title not hidden under a sticky header;
- the card: espresso, notches on both edges at the tear line, the rosette faint behind the header, eyebrow «ويا كل طلب من شنايدر», sub, 4 numbered terms always visible, the stub «سياسة الإرجاع الكاملة» opening `/policies/returns` (the merchant's custom page);
- no «تحب تحچي ويانا؟» card anywhere.

Check: no horizontal scroll; the expand button, every screenshot button and the stub link are ≥44px tall; `document.querySelectorAll('[data-guarantee-card] [dir], [data-proof-item] [dir], [data-proof-source][dir]').length === 0`.

- [ ] **Step 3: The published page is untouched**

```bash
curl -s "http://localhost:3001/s/scheniders-iraq/products/%D9%88%D9%8A%D9%81%D8%B1" | grep -c "data-guarantee-card\|data-proof-item"
```
Expected: `0`.

- [ ] **Step 4: Hand-offs**

- Ali (to-do 4): approve the nine transcriptions (now the alt texts), the three lead quotes and doubts, the source wording; confirm whether any comment is about Wayfarer (then `scope` becomes `"product"` and the scope line disappears).
- Ali (to-do 5): option ١ or ٢ for the return wording. Option ٢ = set `IRAQ_RETURN_WORDING = RETURN_WORDING.spec_difference` and write one follow-up draft migration that merges both the pdp `return_promise_i18n` and the accordion `items` from it (same guards), plus the policy page text.
- Ali (to-do 10): sign off the four guarantee terms and the drafted English.
- 1e plan author: `product_reviews` sits between the stack and the card; its summary card brings `#reviews-summary` (and `identity_rating`), as 1b and 1c noted.

---

## Self-review

**1. Spec coverage**

| Spec item | Task |
|---|---|
| §1.5 stack layout 1–6 (chapter heading right-aligned; source pill with `forum`; scope line; per lead item doubt + numeral, quote 20px/900 in «», author `<bdi>` 13px/700, screenshot full-width cropped; legend after the first item; «شوف N تعليقات ثانية» via `formatCount` expanding in place, screenshots only + «حساب شركة», then «سدّ التعليقات») | Tasks 3, 5 (author line kept on expanded rows: scope decision 3) |
| §1.5 tap any screenshot → existing `GalleryViewer` | Task 5 (test "every screenshot opens the viewer, in stack order") |
| §1.5 schema (`layout` + "stack" with `.catch("grid")`, `initial_count`, `source_label_i18n`, `scope`, `legend_i18n`, `heading_style`, per-item `quote_i18n`, `doubt_i18n`, `author`, `is_business`, `width`, `height`, `crop`) | Task 2 (+ `legend_image_url`, scope decision 4) |
| §1.5 crop maths (116.28% / −13.95% / 0.86 ratio), `next/image` when sized, 4/1 `fill` box otherwise; scope line only for "store"; `display`/`frame`/`order` ignored; `.catch("grid")` | Tasks 2, 4, 5 |
| §1.5 strings in `image_gallery.strings.ts` (`GALLERY_STRINGS` ar/en/ku) on `STRING_TABLE_FILES` | Task 3 |
| §1.5 files: `image_gallery.tsx`, `image_gallery.stack.tsx` (client island), `image_gallery.client.tsx` (viewer reused, unchanged), `image_gallery.strings.ts` | Tasks 3, 5 (+ `image-gallery-crop.ts`, pure, like `image-gallery-order.ts`) |
| §1.5 draft gallery content (order p5, p2, p4, p3, p6, p7, p9, p8, p1 business; the three doubts/quotes/authors; alt = «تعليق {author}: …» from synthesis.json; sizes measured; crop {12, 2}; stack, store, 3, chapter) | Tasks 0 (Step 4), 7, 8 |
| §1.5 missing data (no quote → screenshot-only row; no images → no section; ≤ `initial_count` → no button) | Task 5 tests (the no-images rule is today's, unchanged) |
| §1.5 ticket (espresso, notches, rosette, eyebrow/title/sub, 4 always-visible numbered terms, 16px/800 title + 14px body, stub link to `policy_link.href`, `id={anchor_id}`, `call_row` ignored, blank-line split, server-only) | Task 6 |
| §1.5 ticket schema (`layout` + "guarantee_card", `eyebrow_i18n`, `sub_i18n`, `anchor_id`, `policy_link`, `heading_style`) | Task 6 (href regex tightened: scope decision 5) |
| §1.5 draft ticket content (the four terms, «شحن فائق السرعة» dropped, `/policies/returns`, `guarantee_card`, `anchor_id: "guarantee"`, call row removed) | Tasks 7, 8 |
| §1.3 `guarantee_anchor_id` written (deferred by 1b) and paired with `anchor_id` | Tasks 7, 8 (pair test) |
| §1.1 `heading_style` for image_gallery and accordion_richtext | Tasks 2, 5, 6 (scope decision 6) |
| D1 page order; D3 three dark surfaces (band, ticket, footer); D4 yellow never fills, amber not used, red not used; D5 Latin digits; D8 return line consistent with the card | Tasks 5, 6, 8, 11; scope decision 2 |
| §1.9 guards a–d, idempotent, rollback header, apply after deploy, re-read after apply | Tasks 7, 10 |
| §1.10 crop maths unit test; `layout` `.catch`; the anchor-pair fixture test; Kurdish coverage; no hardcoded colour (`_no-hardcoded-white` scans every new file); baselines unchanged; opted-in renders in ar and en; contrast on espresso; no new `dir`; 390px checks; published page unchanged | Tasks 1–6, 8, 9, 11 |

**2. Placeholder scan.** `STAMP` (Task 7 Step 1) and `V` (Task 10 Step 4) are produced at run time, as in 1b/1c. Every code step has complete code, pre-run in a throwaway copy of `origin/main` (`d79b0bd4`, whose tree equals 1c's head `2c593814`) with live read-only data of 2026-10-30: every expected output above is from that run (the dry run against the live post-1c row), except the PR/merge/apply/browser steps, which touch shared state.

**3. Type consistency.**
- `stackFrame(img)` → `StackFrame` (Task 4) is read by `StackShot` (Task 5); `gs` / `proofMoreLabel` (Task 3) by `ProofStack` and `StackAuthor`; `ProofStackMore({ listId, moreLabel, lessLabel, rtl, children })` (Task 5 Step 3) is what `ProofStack` passes.
- `GuaranteeCardData` (Task 6 Step 3) is what `accordion_richtext.tsx` builds; `AccordionRichtextQuiet`'s new optional `chapterLocale` is what the quiet branch passes.
- `GalleryProps` (Task 1) types `IRAQ_DRAFT_GALLERY_BASE` and `SLICE_1D_GALLERY_PATCH`; `AccordionProps` types the accordion base and patch. `SLICE_1D_*` and `RETURN_WORDING` / `IRAQ_RETURN_WORDING` (Task 8) equal the migration's `gallery_patch`, `accordion_patch`, `accordion_remove` and `pdp_patch` blocks (Task 7), proved by the mirror test.
