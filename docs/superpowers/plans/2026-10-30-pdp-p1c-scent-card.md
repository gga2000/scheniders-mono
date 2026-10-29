# PDP Lower-Page Redesign — Slice 1c (Scent Card «بصمة العطر») Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace «عن العطر», «رحلة العطر» and the note cards on the express product page with one opt-in scent card (F07): lead line, the always-open 3-tier pyramid with all 5 note photos, facts only when the product has them, one real customer quote about staying power, the rating, and «قصة العطر» in a bottom sheet. Write scheniders-iraq's 1c draft config (guarded, not applied until the code is live) and the publish-day go-live data file. Every other tenant's markup stays byte-identical.

**Architecture:** Two new optional, `.catch`-guarded `pdp_direct_order` props (`scent_layout`, `scent_card`). A pure builder (`pdp_express/scent-card.ts`) composes the unchanged `buildScentJourney` with photo pairing (`hasWholeWords`), meters from entered range values, the draft-only `product_copy` (D9) and the quote. One client component (`pdp_express/scent-card-block.tsx`) draws it with the 1a blocks (`BottomSheet`, `Stars`, `displayRating`, `readsRtl`). `express-view.tsx` renders it in the description block's own JSX slot, so React's `useId` numbering (and so every 1a baseline) does not move. The draft write is one guarded SQL migration, replayed on PGlite against a read-only copy of the live row and dry-run live with a SELECT, applied only after merge + deploy. The go-live file lives in `packages/supabase/go-live/` and is only replayed locally in this slice.

**Tech Stack:** Next.js 16 / React 19 sections package (`@scheniders/sections`), zod v4, Tailwind v3 (storefront), vitest 2, Supabase CLI 2.98 (`db query --linked`, `migration repair`), PGlite 0.2.17 (local replay only, outside the repo), pnpm 10.

**Spec:** `docs/superpowers/specs/2026-10-27-pdp-lower-page-redesign-design.md` §1.4, §1.9, §1.10; decisions D1, D4, D9, D15. Built on slices 1a (#224) and 1b (#225): `BottomSheet` (`helpers/bottom-sheet.tsx`), `findTermHits`/`hasWholeWords` (`helpers/arabic-text.ts`), `displayRating` (`helpers/format.ts`), `Stars precision` (`helpers/primitives.tsx`), `readsRtl` (`helpers/reading.ts`), `chipRowOf`/`buildScentJourney` (`pdp_express/scent-journey.ts`), `reviewCountLabel`/`Tag`/`GENDER_ICON` (`pdp_express/identity-label.tsx`), the redesign fixtures and mirror test (`_pdp-redesign-fixtures.ts`, `_pdp-redesign-snapshot.test.tsx`).

---

## Scope decisions (read before starting)

1. **Ali's binding 1c decisions.** The scent card comes first after the promise band (it is inside `pdp_direct_order`, and 1b already put that section first, D1). Concept B's always-open pyramid with all 5 note photos, none repeated, paired by whole word. One real customer longevity quote: eng. سيف «بخيت منه الصبح لسه الريحة تفوح» under «الثبات، بكلام زبون». Fact chips and meters render only when product data exists (Ali supplies season, occasions, longevity/sillage labelled «حسب تجربتنا», `longevity_note`; none exists today, so the live card draws no facts block and no empty slot). «قصة العطر» opens a BottomSheet with the rewritten description.
2. **The quote: a merchant pick, verified at render.** The spec's automatic rule (§1.4) cannot reach Ali's quote: in سيف's review «بخيت منه الصبح لسه الريحة تفوح» sits inside a 19-word clause, over the 14-word cap, so the rule picks مصطفى علي «العطر صدمني بثباته اهنيكم ع هيج شغل» (pinned by a test). So `scent_card` gains `quote_picks: [{ product_id, review_id, text }]`. A pick is shown only while that review is in the product's approved list, rated 4★ or more, and its body still contains `text` word for word; otherwise the card falls back to the rule. The card can never print words a customer did not write. `quote_picks` lives outside `product_copy`, so it survives publish day. Phase 2's `highlight_quote` + `longevity` tag replaces it (tell the Phase 2 plan author).
3. **The footer rating is text until the summary exists.** The spec links it to `#reviews-summary`, which only slice 1e creates (today `product_reviews` carries only `id="reviews"`, which opens the review form). As in 1b scope decision 2, no dead link is shipped: the rating renders as a link only when `identity_rating === "summary_link"`, the prop the 1e migration writes together with the summary card. Until then it is plain text.
4. **File names.** The spec lists `pdp_express/scent-card.ts` and `scent-card.tsx`. Two modules with one basename make `import "./scent-card"` ambiguous, so the component is `pdp_express/scent-card-block.tsx` (like `scent-journey-block.tsx`).
5. **No `model.ts` change.** The spec says "model.ts (pass reviews)". The product page already loads the approved reviews into `product.reviews` (`apps/storefront/app/s/[tenant]/products/[slug]/page.tsx:97-104`, `types.ts:108-112`), and the model already carries `product`, so the builder reads `product.reviews`.
6. **One JSX slot for card or description.** React's `useId` path counts sibling slots. A new `{scentCard && …}` slot in `express-view.tsx` renumbers every id below it (`_R_27_` → `_R_2n_`) and fails 11 baseline snapshots, verified. The card therefore shares the description block's slot (a ternary).
7. **The story respects `show_description`.** The sheet falls back to `products.description` only when the section shows the description (`show_description`), the merchant's existing switch. A card with only note cards still renders the sheet (the cards' own text), so the replaced blocks' content stays reachable.
8. **Size stays in the identity row.** Ali's facts list includes size (ml). `size_ml` already renders as the identity row's size tag (`identity-label.tsx`), and concept g1-B moves it out of the card. The card does not repeat it.
9. **The go-live file guards on what it changes, not the whole draft.** §1.9 says draft guards 2 and 3 apply. Guard 2 (whole-draft md5) cannot hold for a file written now and applied after slices 1d–1f change the draft. The go-live file instead guards the md5 of `scent_card.product_copy` itself (as 1c writes it), of each product column it rewrites, the absence of a Wayfarer `scent_lead` value, and guard 3 (published md5 unchanged). It reads the story and the lead from the draft's `product_copy`, so the approved text has one copy.
10. **Snapshot update, explicit.** The 1a baselines stay byte-identical. The 1b redesign snapshot (`__snapshots__/_pdp-redesign-snapshot.test.tsx.snap`) is the opted-in snapshot of the draft; once `IRAQ_REDESIGN_PDP_PROPS` carries the 1c patch, its 4 existing renders change. That update is its own commit (Task 7). Its review is mechanical: `snapcheck.mjs` proves each old render is byte-identical up to and including `</form>` (buy box + promise band) and that everything after `</form>` is now the scent card alone. Two Wayfarer renders are added. Its `dir` test changes from "equal" to "one fewer" (card mode drops the description's `dir="auto"` paragraph, as §1.10 expects).
11. **Guards and timestamps** follow 1b exactly (1b scope decisions 5–8): `STAMP=$(date -u +%Y%m%d%H%M%S)` sorting after `20261029210502`; guards md5 + `store_config_rev` + already-applied no-op; apply with `supabase db query --linked -f`, record with `supabase migration repair --status applied`; never `db push`; nothing applied before the code PR is merged and production serves it.

## Conventions for every task

- Work only in the worktree `/Users/ali/scheniders-mono-pdp`.
- Every shell starts with:
  ```bash
  export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"
  cd /Users/ali/scheniders-mono-pdp
  ```
- pnpm only. Never npm/yarn.
- Tests: `CI=true pnpm exec vitest run <path>` from the repo root. `CI=true` never writes a snapshot. **Only Task 7 Step 5** runs vitest without `CI=true` (with `-u`, on one file) to update the redesign snapshot.
- Sections type gate (expected **no output**):
  ```bash
  (cd packages/sections && ./node_modules/.bin/tsc --noEmit --incremental false -p tsconfig.json --rootDir .. 2>&1 | grep "error TS" | grep -v TS6059 | grep -v -E "^src/(RenderSection\.sticky|_chrome-baseline-snapshot|_chrome|_delivery-promise|_pdp-classic-snapshot|image-gallery-order|product_attributes|helpers/whatsapp|pdp_express/checkout-row\.receipt)\.test\.tsx?\(")
  ```
- Before every commit: `git branch --show-current` → `feat/pdp-p1c-scent-card`.
- Commit with explicit paths only, as gga2000, with the trailer:
  ```bash
  git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```
- Banned in new code: `any`, `@ts-ignore`, `eslint-disable`, a non-null `!` that silences the compiler, swallowed catches, hex/rgb colour literals in source, and any `dir` attribute. Yellow (`bk-primary`) is not used in the card (D4).
- Chrome strings go only into `pdp_express/strings.ts` (on `STRING_TABLE_FILES`), with ar, en and ku.
- **Never run `vitest -u`** except Task 7 Step 5. If a §1.0 baseline fails, the code changed a default render: fix the code.
- All live database access before Task 9 is **read-only** (`SELECT`, or a `DO` block replayed on PGlite only).

## File structure

| File | Status | Responsibility |
|---|---|---|
| `packages/sections/src/pdp_direct_order.tsx` | modify | `scent_layout`, `scent_card` (incl. `quote_picks`, `product_copy`) |
| `packages/sections/src/_pdp-scent-card-props.test.ts` | create | valid values parse; bad values fall back |
| `packages/sections/src/pdp_express/strings.ts` | modify | `scentEyebrow`, `stayInCustomerWords`, `scentStory`, `meterValue`, `closeSheet` |
| `packages/sections/src/pdp_express/scent-journey.ts` | modify | `STAGE_HINT` moves here, exported |
| `packages/sections/src/pdp_express/scent-journey-block.tsx` | modify | imports `STAGE_HINT` (output unchanged) |
| `packages/sections/src/_pdp-wayfer-fixtures.ts` | create | ويفر انتنس as read live: description, cards, notes, six reviews |
| `packages/sections/src/pdp_express/scent-card.ts` | create | `buildScentCard`, `stripLeadingEmoji`, `monogramOf` |
| `packages/sections/src/pdp_express/scent-card.test.ts` | create | pairing 5/5, copy precedence, null, meters, quote |
| `packages/sections/src/pdp_express/scent-card-block.tsx` | create | `ScentCardBlock` |
| `packages/sections/src/pdp_express/scent-card-block.test.tsx` | create | placement, replacement, data-only facts, D4, no `dir`, off = identical |
| `packages/sections/src/pdp_express/express-view.tsx` | modify | card mode |
| `packages/supabase/migrations/<STAMP>_scheniders_iraq_pdp_redesign_1c_draft.sql` | create | the guarded draft write |
| `packages/supabase/go-live/scheniders-iraq-pdp-redesign.sql` | create | publish-day data change (never in `migrations/` before go-live) |
| `packages/sections/src/_pdp-redesign-fixtures.ts` | modify | `SLICE_1C_PDP_PATCH`, lead + story constants; props include 1c |
| `packages/sections/src/_pdp-redesign-snapshot.test.tsx` (+ `.snap`) | modify | 1c mirror, Wayfarer renders, `dir` − 1; reviewed snapshot update |
| `tmp/pdp-1c/` (`dryrun-1c.sql`, `golive-check-1c.sql`, `snapcheck.mjs`) | scratch (gitignored) | read-only checks |
| `${TMPDIR:-/tmp}/pdp-1c-pglite/` | scratch (outside the repo) | PGlite replay harnesses |

---

### Task 0: Branch, baseline, live guard values

- [ ] **Step 1: Branch off main (1b is merged as #225)**

```bash
git fetch origin
git log --oneline -1 origin/main
git status --porcelain
git switch -c feat/pdp-p1c-scent-card origin/main
git branch --show-current
```
Expected:
- the log shows `ab84ac58 Merge pull request #225 from gga2000/feat/pdp-p1b-promise-band` or a later commit;
- `git status --porcelain` lists only the untracked `apps/storefront/AGENTS.md` and `apps/storefront/CLAUDE.md` (not ours; never stage them);
- the branch is `feat/pdp-p1c-scent-card`.

- [ ] **Step 2: Baseline counts on the untouched branch**

```bash
CI=true pnpm exec vitest run packages/sections/src packages/shared/src apps/storefront/lib
```
Expected: `Test Files  186 passed (186)`, `Tests  2218 passed (2218)`. Task 8 compares against these.

- [ ] **Step 3: The CLI link points at the NEW project, and the guard values**

```bash
cat packages/supabase/.temp/project-ref; echo
cd packages
supabase db query --linked "SELECT store_config_rev, md5(store_config_v2_draft::text) AS draft_md5, md5(store_config_v2::text) AS pub_md5 FROM tenants WHERE slug='scheniders-iraq'" -o csv
supabase db query --linked "SELECT md5(description) AS d, md5(short_description) AS s, md5(feature_cards::text) AS c, gender, size_ml FROM products WHERE id='5e847790-11a5-439f-bace-c315e0ff1ae8'" -o csv
cd ..
```
Expected:
- `sduvpgqwhxragxtxztur` (never the OLD `ibfdugifekivquwprqjc`; if `.temp` is missing, `cp /Users/ali/scheniders-mono/packages/supabase/.temp/* packages/supabase/.temp/`);
- `38,9cd2543a6126057d423f66ff9297cf76,a6f87ba3181b0e94f41ba4a700de257b` (read 2026-10-30, after the 1b migration);
- `b413b9c23c5d01b0648e340be1c3230e,c39e46bd0a06c831fad6a608aef973ea,41f819bd74ab6e3a682284bb78cf8825,men,NULL`.

**If any value differs, stop.** The draft or the product was edited. Re-read it, then update the guard literals in Tasks 5 and 6 (and every md5 expected below) before writing those files.

---

### Task 1: The two new `pdp_direct_order` props

**Files:**
- Modify: `packages/sections/src/pdp_direct_order.tsx` (end of `schema`, after `guarantee_anchor_id`)
- Test: `packages/sections/src/_pdp-scent-card-props.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/_pdp-scent-card-props.test.ts`:

```ts
// =====================================================================
// PDP redesign 1c — the scent card props parse safely
// =====================================================================
// `scent_layout` and `scent_card` are optional and `.catch(undefined)`-
// guarded: a bad or rolled-back stored value drops that prop (or, inside
// `scent_card`, only the bad list), never the buy box.
// =====================================================================

import { describe, expect, it } from "vitest";
import pdp_direct_order from "./pdp_direct_order";
import { EXPRESS_IRAQ_DRAFT_PDP_PROPS } from "./_pdp-fixtures";

const schema = pdp_direct_order.schema;

const WAYFER_ID = "5e847790-11a5-439f-bace-c315e0ff1ae8";

const CARD = {
  pyramid_key: "notes",
  chip_keys: ["season", "occasions"],
  note_key: "longevity_note",
  meter_keys: ["longevity", "sillage"],
  lead_key: "scent_lead",
  quote_terms: ["ثبات", "يثبت", "تفوح", "يفوح"],
  facts_source_i18n: { ar: "حسب تجربتنا", en: "Our own estimate" },
  quote_picks: [
    {
      product_id: WAYFER_ID,
      review_id: "6881921e-d263-4780-8878-762e01904146",
      text: "بخيت منه الصبح لسه الريحة تفوح",
    },
  ],
  product_copy: [
    { product_id: WAYFER_ID, lead_i18n: { ar: "سطر" }, story_i18n: { ar: "قصة" } },
  ],
};

describe("pdp_direct_order slice 1c props", () => {
  it("accepts the card config", () => {
    const parsed = schema.parse({
      ...EXPRESS_IRAQ_DRAFT_PDP_PROPS,
      scent_layout: "card",
      scent_card: CARD,
    });
    expect(parsed.scent_layout).toBe("card");
    expect(parsed.scent_card).toEqual(CARD);
  });

  it.each<[string, unknown]>([
    ["scent_layout", "pyramid"],
    ["scent_card", { chip_keys: ["season"] }],
    ["scent_card", "card"],
  ])("a bad %s (%j) falls back to absent and keeps the section", (key, value) => {
    const parsed = schema.safeParse({ ...EXPRESS_IRAQ_DRAFT_PDP_PROPS, [key]: value });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data[key as "scent_layout" | "scent_card"]).toBeUndefined();
      expect(parsed.data.layout).toBe("express");
    }
  });

  it.each<[string, unknown]>([
    ["product_copy", [{ product_id: "not-a-uuid", lead_i18n: { ar: "x" } }]],
    ["quote_picks", [{ product_id: WAYFER_ID, review_id: "", text: "قصير" }]],
    ["quote_picks", [{ product_id: WAYFER_ID, review_id: "r-1", text: "ab" }]],
  ])("a bad %s list drops only that list", (key, value) => {
    const parsed = schema.parse({
      ...EXPRESS_IRAQ_DRAFT_PDP_PROPS,
      scent_layout: "card",
      scent_card: { ...CARD, [key]: value },
    });
    expect(parsed.scent_card?.pyramid_key).toBe("notes");
    expect(parsed.scent_card?.[key as "product_copy" | "quote_picks"]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-scent-card-props.test.ts
```
Expected: `Tests  4 failed | 3 passed (7)`. "accepts the card config" fails with `expected undefined to be 'card'` (zod strips the unknown keys); the three "drops only that list" cases fail with `expected undefined to be 'notes'`. The three bad-value cases pass by construction and pin the fallback once the keys exist.

- [ ] **Step 3: Add the props**

In `packages/sections/src/pdp_direct_order.tsx`, replace:
```ts
  guarantee_anchor_id: z
    .string()
    .regex(/^[a-z][a-z0-9-]{0,40}$/)
    .optional()
    .catch(undefined),
});
```
with:
```ts
  guarantee_anchor_id: z
    .string()
    .regex(/^[a-z][a-z0-9-]{0,40}$/)
    .optional()
    .catch(undefined),
  /** Express: "card" renders the one «بصمة العطر» card (lead line, the
   *  note pyramid with the note photos, facts, a customer's staying-power
   *  quote, the story sheet) in place of «عن العطر», «رحلة العطر» and the
   *  note cards — only together with `scent_card`. Absent/"journey" =
   *  today's blocks. */
  scent_layout: z.enum(["journey", "card"]).optional().catch(undefined),
  /** Express scent card: which product attributes it reads. Nothing is
   *  derived: a meter renders only from a range value the merchant
   *  entered, a chip or note line only from a stored value. */
  scent_card: z
    .object({
      /** group_list attribute whose groups are the pyramid tiers. */
      pyramid_key: z.string().min(1),
      /** enum / group_list attributes shown as chip rows (season, occasions). */
      chip_keys: z.array(z.string().min(1)).max(4).optional(),
      /** text attribute shown as one staying-power line. */
      note_key: z.string().min(1).optional(),
      /** range attributes drawn as segment meters (longevity, sillage). */
      meter_keys: z.array(z.string().min(1)).max(3).optional(),
      /** text attribute holding the one-line lead. */
      lead_key: z.string().min(1).optional(),
      /** Words that make a review clause a staying-power quote (folded
       *  substring match). */
      quote_terms: z.array(z.string().min(2)).max(8).optional(),
      /** The source tag beside the meters (e.g. «حسب تجربتنا»). */
      facts_source_i18n: i18nStringOptional,
      /** The merchant's pick of the quote, per product. Shown only while
       *  the review is approved, rated 4★ or more and still contains the
       *  text word for word; otherwise the card picks one itself. */
      quote_picks: z
        .array(
          z.object({
            product_id: z.uuid(),
            review_id: z.string().min(1).max(64),
            text: z.string().min(3).max(200),
          }),
        )
        .max(40)
        .optional()
        .catch(undefined),
      /** Draft-period copy that must not reach published data (spec D9).
       *  Removed on publish day by packages/supabase/go-live/
       *  scheniders-iraq-pdp-redesign.sql. */
      product_copy: z
        .array(
          z.object({
            product_id: z.uuid(),
            lead_i18n: i18nStringOptional,
            story_i18n: i18nStringOptional,
          }),
        )
        .max(40)
        .optional()
        .catch(undefined),
    })
    .optional()
    .catch(undefined),
});
```

- [ ] **Step 4: Run the test and the express baselines**

```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-scent-card-props.test.ts packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_pdp-redesign-props.test.ts
```
Expected: `Test Files  3 passed (3)`, `Tests  36 passed (36)`.

- [ ] **Step 5: Type gate, then commit**

Run the sections type gate. Expected: no output.
```bash
git branch --show-current
git add packages/sections/src/pdp_direct_order.tsx packages/sections/src/_pdp-scent-card-props.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): scent_layout + scent_card props on pdp_direct_order, opt-in" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Chrome strings and the shared stage hints

**Files:**
- Modify: `packages/sections/src/pdp_express/strings.ts` (end of `EXPRESS_STRINGS`)
- Modify: `packages/sections/src/pdp_express/scent-journey.ts` (top)
- Modify: `packages/sections/src/pdp_express/scent-journey-block.tsx` (imports)

No new test: `_kurdish-coverage.test.ts` already reads `pdp_express/strings.ts` (every new key must carry `ku`), and the scent baseline pins that moving `STAGE_HINT` changes no markup.

- [ ] **Step 1: Add the strings**

In `packages/sections/src/pdp_express/strings.ts`, replace:
```ts
  notesListLabel: { en: "Scent notes", ar: "مكونات العطر", ku: "پێکهاتەکانی بۆنەکە" },
} as const;
```
with:
```ts
  notesListLabel: { en: "Scent notes", ar: "مكونات العطر", ku: "پێکهاتەکانی بۆنەکە" },
  // scent_layout "card" (F07): the «بصمة العطر» card.
  scentEyebrow: { en: "Scent profile", ar: "بصمة العطر", ku: "ناسنامەی بۆن" },
  stayInCustomerWords: {
    en: "Staying power, in a customer’s words",
    ar: "الثبات، بكلام زبون",
    ku: "مانەوەی بۆن، بە قسەی کڕیارێک",
  },
  scentStory: { en: "The scent’s story", ar: "قصة العطر", ku: "چیرۆکی بۆنەکە" },
  meterValue: { en: "{value} of {max}", ar: "{value} من {max}", ku: "{value} لە {max}" },
  closeSheet: { en: "Close", ar: "إغلاق", ku: "داخستن" },
} as const;
```
(The ar/en/ku for the first three are the strings table of concept g1-B, `c-g1-under-button-b.notes.md`; `closeSheet` reuses the existing chrome «إغلاق» / «داخستن»; all ku goes to Ali's Kurdish review, to-do 8.)

- [ ] **Step 2: Move `STAGE_HINT` into `scent-journey.ts`**

In `packages/sections/src/pdp_express/scent-journey.ts`, replace:
```ts
import type { LocaleCode, ResolvedProductAttribute } from "@scheniders/shared";
```
with:
```ts
import type { LocaleCode, ResolvedProductAttribute } from "@scheniders/shared";
import type { ExpressStringKey } from "./strings";

/** Chrome hints for the three conventional pyramid group keys. A Map, not
 *  an object literal, so a merchant key like "constructor" finds nothing.
 *  Shared by «رحلة العطر» and the scent card. */
export const STAGE_HINT = new Map<string, ExpressStringKey>([
  ["top", "stageHintTop"],
  ["heart", "stageHintHeart"],
  ["base", "stageHintBase"],
]);
```

In `packages/sections/src/pdp_express/scent-journey-block.tsx`, replace:
```ts
import type { ScentJourney } from "./scent-journey";
import type { ExpressStringKey } from "./strings";
import { readsRtl, xs } from "./text";

/** Chrome hints for the three conventional pyramid group keys. A Map, not
 *  an object literal, so a merchant key like "constructor" finds nothing. */
const STAGE_HINT = new Map<string, ExpressStringKey>([
  ["top", "stageHintTop"],
  ["heart", "stageHintHeart"],
  ["base", "stageHintBase"],
]);
```
with:
```ts
import { STAGE_HINT, type ScentJourney } from "./scent-journey";
import { readsRtl, xs } from "./text";
```

- [ ] **Step 3: Coverage and baselines**

```bash
CI=true pnpm exec vitest run packages/sections/src/_kurdish-coverage.test.ts packages/sections/src/_pdp-scent-baseline-snapshot.test.tsx packages/sections/src/pdp_express/scent-journey.test.ts packages/sections/src/_pdp-express-snapshot.test.tsx
```
Expected: `Test Files  4 passed (4)`, `Tests  47 passed (47)`, no `written`/`updated`.

- [ ] **Step 4: Type gate, then commit**

Run the sections type gate. Expected: no output.
```bash
git branch --show-current
git add packages/sections/src/pdp_express/strings.ts packages/sections/src/pdp_express/scent-journey.ts packages/sections/src/pdp_express/scent-journey-block.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): scent card chrome strings; stage hints shared from scent-journey" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The scent card's data (`buildScentCard`)

**Files:**
- Create: `packages/sections/src/_pdp-wayfer-fixtures.ts`
- Create: `packages/sections/src/pdp_express/scent-card.ts`
- Test: `packages/sections/src/pdp_express/scent-card.test.ts`

- [ ] **Step 1: The Wayfarer fixture (live data, read-only copy of 2026-10-30)**

Create `packages/sections/src/_pdp-wayfer-fixtures.ts`. The description is split per line so a reviewer can read it; `WAYFER_DESCRIPTION` must hash to the live md5 (checked in Step 2).

```ts
// =====================================================================
// Wayfarer fixtures — scheniders-iraq's ويفر انتنس as read live
// =====================================================================
// The product the PDP redesign is built around (spec: "Product used for
// every example"), copied read-only on 2026-10-30 from the NEW project:
// the description, the five note cards, the `notes` attribute (its only
// scent attribute today) and the six approved reviews, newest first as
// `listApprovedReviews` returns them. Frozen on purpose: the scent card's
// photo pairing (5 of 5) and its quote rule are pinned on these values.
// Commercial fields (price, stock, images) come from `saleProduct`.
// =====================================================================

import { resolveProductAttributes } from "@scheniders/shared";
import type { Product, ReviewSummaryItem } from "./types";
import { saleProduct } from "./_pdp-fixtures";
import { SCENT_DEF_IDS, SCENT_DEFS } from "./_pdp-scent-fixtures";

export const WAYFER_ID = "5e847790-11a5-439f-bace-c315e0ff1ae8";

/** products.description, verbatim (md5 b413b9c23c5d01b0648e340be1c3230e). */
export const WAYFER_DESCRIPTION = [
  "🔥 ملك العطور الجديد ويفر انتنس",
  "",
  "شايف شعور من شخص يدخل لمناسبة أو يطب للدوام، وتشوف عطره طاغي ومميز؟",
  "",
  "هذا بالضبط اللي راح تحس بيه وية عطر ويفر، اكثر عطر راح تنسأل عليه من ترشه واكثر عطر راح يجيبلك مديح واطراءات",
  "",
  "إحنا ما نبيعلك مجرد \"ريحة حلوة\"، إحنا نبيعلك عطر راح يخليك تسيطر على اي مكان تدخله ويخلي الكل يلتفت من تفوت من يمهم وانت راشه",
  "",
  "انسى العطور اللي تختفي ورة 10 دقايق وتحسسك ذبيت فلوسك بالشارع.",
  "هذا العطر مصمم للرجل اللي يريد يترك \"بصمة\" بالمكان اليدخله بثباته وفوحانه اللي يدخل قبلك للمكان ويظل وراك بعد متطلع",
  "",
  "🧬 شراح تحس من ترشه؟ (النوتات العطرية):",
  "",
  "المرحلةالمكوناتالتأثير النفسي (شلون راح تبين)",
  "",
  "أول رشة (الانفجار)التوت الفاخر + التفاح الأخضرنكهة فاكهية ومنعشة تخطف الانتباه فوراً. مستحيل تمر بمكان وانت راشه بدون ما ينتبه عليه احد",
  "",
  "القلب (الشخصية)الهيل + اللافندررزانة، فخامة، وهدوء مال رجل واثق من نفسه ويعرف شيريد.",
  "",
  "القاعدة (البصمة)الباتشولي الساحرثبات مرعب. الريحة اللي تتشبع بملابسك وتخلي الناس تنتبه على عطرك حتى بعد ما تطلع",
  "",
  "🚨 العرض اللي ما راح يتكرر (لاول 100 زبون فقط):",
  "",
  "خلي المجازفة علينا مو عليك واشتري العطر هسة وحصل وياه الضمان الذهبي مالتنا",
  "! ضمان لمدة اسبوع كامل على ثبات العطر، فوحانه ورائحته",
  "",
  "خلال 7 ايام من لحظة استلامك العطر اذا ما عجبك باي شكل من الاشكال نرجعلك اياه واحنا الممنونين",
  "",
  "- 💰 السعر: العرض شغّال هسة — السعر بعد الخصم وسعره الأصلي مشطوب، كلهم مبينين فوق",
  "",
  "- 🚚 واصل لباب بيتك: التوصيل سريع لكل محافظات العراق",
  "",
  "- 🧪 جرب قبل لا تفتح: وي كل طلب راح توصلك عينة (تيستر 2 مل).",
  "",
  "- الضمان الذهبي: رش التيستر أول شي.. إذا ما حسيت بالفخامة والفوحان اللي نوعدك بيهم رجع العلبة بيد",
  "",
  "- 🛡️المندوب",
  "",
  "- ، أو استغل الضمان واستعمل العطر لمدة اسبوع كامل وتكدر ترجعه باي لحظة خلال 7 أيام، وفلوسك ترجعلك بدون أي سؤال",
  "!لهل درجة واثقين من العطر",
  "",
  "أنت تستاهل تكون مميز. لا ترضى بالعادي.",
  "",
  "[ اطلبه هسة ولحك على الخصم قبل ميخلص ]",
].join("\n");

const CARD_IMG =
  "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/note-cards/d988d98ad981-";

/** products.feature_cards, verbatim, typos included (the go-live file fixes two). */
export const WAYFER_FEATURE_CARDS = [
  {
    body: "منطي العطر نكهة فاكهية اكثر من فخمة. رائحة التوت راح تخلي اي شخص يشم بيك هلعطر يسألك شنو اسمه",
    title: "🫐 التوت البري الفاخر",
    image_url: `${CARD_IMG}0.jpg`,
  },
  {
    body: "اللمسة التوابلية اللي تنطي عطرك رزانة وطيابة مو طبيعية!",
    title: "🍂 الهيل الملكي",
    image_url: `${CARD_IMG}1.jpg`,
  },
  {
    body: "نكهة اللافندراللي ماكو ثنين يختلفون على انو هي وحدة من اطيب الروائح الممكن تشمها بحياتك، يخلي اللي يكعد يمك يحس براحة وانجذاب بدون ما يعرف السبب.",
    title: "🌿 اللافندر المهدئ",
    image_url: `${CARD_IMG}2.jpg`,
  },
  {
    body: 'سر الثبات المرعب! المكون اللي يكلب العطر من "ريحة طيبة" إلى "بصمة" تشبع بملابسك وتخلي عطرك يفوح لساعات طويلة.',
    title: "🪵 الباتشولي الساحر",
    image_url: `${CARD_IMG}3.jpg`,
  },
  {
    body: 'يكسر حدة العطر بانتعاش حامضي ومميز. يخلي ريحتك "نظيفة" وفرش، مثالي لأجواء الدوام الطويل أو الجامعة.',
    title: "🍏 التفاح الأخضر المقرمش",
    image_url: `${CARD_IMG}4.jpg`,
  },
];

/** The six approved reviews, verbatim. */
export const WAYFER_REVIEWS: ReviewSummaryItem[] = [
  {
    id: "cd25b071-10d9-4de5-a324-ea6a0793559b",
    product_id: WAYFER_ID,
    rating: 3,
    title: null,
    body: "تأخر علية المندوب يومين يلا جابه فدوة نبهو ع مندوبين دهوك العطر كلش راقي وثباته يطول يوم كامل على الملابس جان انطيتكم تقييم 5 نجوم العطر يستاهل 10 نجوم مو بس خمسة بس علمود سالفة التوصيل راح انطيه تلث نجوم",
    author_name: "Ahmed",
    photo_urls: [],
    created_at: "2026-02-24T03:00:00Z",
  },
  {
    id: "fcd04048-2a8c-4377-a5c3-2e7f7c20b628",
    product_id: WAYFER_ID,
    rating: 5,
    title: null,
    body: "هذا ثاني عطر اطلبه منهم، الاول هذاك بيسفون مدري شسمه  وهسة جربت الانتنس. ريحته حمضيات ع انتعاش ع سوسن بالبداية وبعدين تصير فخمة. تغليفهم يبيض الوجه اذا تريده تهديه.",
    author_name: "حازم السيد",
    photo_urls: [],
    created_at: "2026-02-24T00:00:00Z",
  },
  {
    id: "aeb344f2-8597-45f7-b639-99973d6f1a6f",
    product_id: WAYFER_ID,
    rating: 5,
    title: null,
    body: "اللي سوة الفيديو اذا الزمه الة اشبعه كتل، ياخي شبليتني من بلوة اشتريته وخليته بالسيارة بنفس اليوم قطوه مني، مرتي شمته بية تعال اريد منه اخوي شمه تعال جيبلي واحد، هذاك واحد طار وهذن ثنين وصيت واحد الية ولمرتي نشارك بيه والثاني لاخوي اذا منطيتوني هدية نزاعل",
    author_name: "ياسين",
    photo_urls: [],
    created_at: "2026-02-24T00:00:00Z",
  },
  {
    id: "6881921e-d263-4780-8878-762e01904146",
    product_id: WAYFER_ID,
    rating: 5,
    title: null,
    body: "بدون مبالغة وكلاوات العيد كريحة العطر جبار الفوحان انطيه 8 ونص من عشرة بس الثبات يا اخي ابدااااااع، كله اشتري عطور بمية ومية وخمسين بس ممحصل منهم بكد ثبات هذا الويفر وبخيت منه الصبح لسه الريحة تفوح. انصح بي وبشدة للشباب.",
    author_name: "eng. سيف",
    photo_urls: [],
    created_at: "2026-02-24T00:00:00Z",
  },
  {
    id: "b4f6b842-2e63-465b-8d11-3dc15039ed68",
    product_id: WAYFER_ID,
    rating: 5,
    title: null,
    body: "عاشت ايدكم العطر يخبل، جربت التيستر اول شي وكلش عجبتنئ ريحته، العطر صدمني بثباته اهنيكم ع هيج شغل",
    author_name: "مصطفى علي",
    photo_urls: [],
    created_at: "2026-02-24T00:00:00Z",
  },
  {
    id: "d7c511e8-f208-4956-b7e2-a9a8f85be05e",
    product_id: WAYFER_ID,
    rating: 5,
    title: null,
    body: "بصراحة جنت خايف اطلب لان الغش ما شاء الله بالبيجات صاير بالجملة، بس وصلتني العلبة مرتبة والتيستر فكرة تخبل. الريحة فخمة مال واحد مدير هههه. شكراً الكم ع المصداقية راح اكرر تجربة الشراء منكم مرة ثانية بس خل ينزل الراتب.",
    author_name: "احمد الشمري",
    photo_urls: [],
    created_at: "2026-02-24T00:00:00Z",
  },
];

/** ويفر انتنس: the live notes, cards, description and reviews; no size,
 *  season, occasions, longevity, sillage or longevity_note (to-do 2). */
export const wayferProduct: Product = {
  ...saleProduct,
  id: WAYFER_ID,
  name: "عطر ويفر انتنس الفاخر من باريس كورنر للرجال",
  display_name: "ويفر انتنس",
  gender: "men",
  description: WAYFER_DESCRIPTION,
  short_description: "خصم 24٪ وتوصيل سريع لأول 100 زبون فقط",
  feature_cards: WAYFER_FEATURE_CARDS,
  review_count: 6,
  avg_rating: 28 / 6,
  reviews: WAYFER_REVIEWS,
  attributes: resolveProductAttributes(SCENT_DEFS, [
    {
      product_id: WAYFER_ID,
      attribute_def_id: SCENT_DEF_IDS.notes,
      value: {
        top: ["التوت الفاخر", "التفاح الأخضر"],
        heart: ["الهيل", "اللافندر"],
        base: ["الباتشولي الساحر"],
      },
    },
  ]),
};
```

- [ ] **Step 2: Check the fixture is byte-identical to the live description**

```bash
node -e '
const src = require("fs").readFileSync("packages/sections/src/_pdp-wayfer-fixtures.ts", "utf8");
const block = src.slice(src.indexOf("export const WAYFER_DESCRIPTION = ["), src.indexOf("].join"));
const lines = [...block.matchAll(/^  ("(?:[^"\\]|\\.)*"),$/gm)].map((m) => JSON.parse(m[1]));
console.log(lines.length, require("crypto").createHash("md5").update(lines.join("\n")).digest("hex"));'
```
Expected: `44 b413b9c23c5d01b0648e340be1c3230e` (Postgres `md5(text)` hashes the UTF-8 bytes, so it equals Task 0's `d`).

- [ ] **Step 3: Write the failing test**

Create `packages/sections/src/pdp_express/scent-card.test.ts`:

```ts
// The «بصمة العطر» card's data (spec §1.4, §1.10 "scent-card"): photo
// pairing 5/5 on Wayfarer's live note cards, emoji stripping,
// `product_copy` beating the attribute and the description, no data →
// null, meters only from entered values, and the customer clause — the
// rule's own pick and the merchant's pick — on the six live reviews.

import { describe, expect, it } from "vitest";
import { resolveProductAttributes } from "@scheniders/shared";
import { plainProduct, saleProduct } from "../_pdp-fixtures";
import { SCENT_DEF_IDS, SCENT_DEFS, scentProduct } from "../_pdp-scent-fixtures";
import { WAYFER_DESCRIPTION, WAYFER_ID, wayferProduct } from "../_pdp-wayfer-fixtures";
import type { Product } from "../types";
import { buildScentCard, monogramOf, stripLeadingEmoji, type ScentCardConfig } from "./scent-card";

const CONFIG: ScentCardConfig = {
  pyramid_key: "notes",
  chip_keys: ["season", "occasions"],
  note_key: "longevity_note",
  meter_keys: ["longevity", "sillage"],
  lead_key: "scent_lead",
  quote_terms: ["ثبات", "يثبت", "تفوح", "يفوح"],
  facts_source_i18n: { ar: "حسب تجربتنا", en: "Our own estimate" },
};

const IMG =
  "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/note-cards/d988d98ad981-";

function card(product: Product, config: ScentCardConfig = CONFIG, description = product.description ?? null) {
  return buildScentCard({ product, config, locale: "ar", description });
}

describe("stripLeadingEmoji / monogramOf", () => {
  it.each([
    ["🫐 التوت البري الفاخر", "التوت البري الفاخر"],
    ["🛡️المندوب", "المندوب"],
    ["الهيل الملكي", "الهيل الملكي"],
  ])("%s → %s", (title, expected) => {
    expect(stripLeadingEmoji(title)).toBe(expected);
  });

  it.each([
    ["eng. سيف", "س"],
    ["مصطفى علي", "م"],
    ["Ahmed", "A"],
    ["  ", ""],
  ])("monogram of %j → %j", (name, expected) => {
    expect(monogramOf(name)).toBe(expected);
  });
});

describe("note photos", () => {
  it("pairs all 5 Wayfarer notes with 5 different photos", () => {
    const c = card(wayferProduct);
    expect(c?.tiers.map((t) => [t.key, t.label, t.hint])).toEqual([
      ["top", "المقدمة", "أول ما ترشه"],
      ["heart", "القلب", "بعد ما يهدى"],
      ["base", "القاعدة", "اللي يبقى عليك"],
    ]);
    expect(c?.tiers.flatMap((t) => t.notes)).toEqual([
      { name: "التوت الفاخر", image: `${IMG}0.jpg` },
      { name: "التفاح الأخضر", image: `${IMG}4.jpg` },
      { name: "الهيل", image: `${IMG}1.jpg` },
      { name: "اللافندر", image: `${IMG}2.jpg` },
      { name: "الباتشولي الساحر", image: `${IMG}3.jpg` },
    ]);
  });

  it("a note without a photo card stays a text chip", () => {
    const notes = card(scentProduct)?.tiers.flatMap((t) => t.notes);
    expect(notes?.filter((n) => n.image !== null)).toEqual([
      { name: "الليمون", image: "https://cdn.example.com/fixture/lemon.jpg" },
      { name: "جوز الهند", image: "https://cdn.example.com/fixture/coconut.jpg" },
    ]);
    // «الفانيليا» has a card, but the card has no photo.
    expect(notes?.find((n) => n.name === "الفانيليا")?.image).toBeNull();
  });

  it("uses each photo once and pairs whole words only", () => {
    const product: Product = {
      ...wayferProduct,
      attributes: resolveProductAttributes(SCENT_DEFS, [
        {
          product_id: WAYFER_ID,
          attribute_def_id: SCENT_DEF_IDS.notes,
          value: { top: ["التوت", "التوت"], base: ["الباتشولي الساحرة"] },
        },
      ]),
    };
    expect(card(product)?.tiers.flatMap((t) => t.notes)).toEqual([
      { name: "التوت", image: `${IMG}0.jpg` },
      { name: "التوت", image: null },
      { name: "الباتشولي الساحرة", image: null },
    ]);
  });
});

describe("lead and story", () => {
  const copy: ScentCardConfig["product_copy"] = [
    { product_id: WAYFER_ID, lead_i18n: { ar: "سطر من المسودة" }, story_i18n: { ar: "فقرة أولى\n\nفقرة\nثانية" } },
  ];
  const withLead: Product = {
    ...wayferProduct,
    attributes: [
      ...(wayferProduct.attributes ?? []),
      {
        kind: "text",
        def: {
          id: "d0000000-0000-4000-8000-000000000009",
          key: "scent_lead",
          kind: "text",
          name_i18n: { ar: "الريحة بسطر" },
          is_filterable: false,
          is_comparable: false,
          display_order: 7,
        },
        value: { ar: "سطر من الصفة" },
      },
    ],
  };

  it("product_copy beats the attribute and the description", () => {
    const c = card(withLead, { ...CONFIG, product_copy: copy });
    expect(c?.lead).toBe("سطر من المسودة");
    expect(c?.story).toEqual(["فقرة أولى", "فقرة\nثانية"]);
  });

  it("without product_copy: the lead attribute, and the description verbatim", () => {
    const c = card(withLead);
    expect(c?.lead).toBe("سطر من الصفة");
    expect(c?.story.join("\n\n")).toBe(WAYFER_DESCRIPTION.split(/\n\s*\n/).map((p) => p.trim()).join("\n\n"));
  });

  it("another product's copy is not used", () => {
    const c = card(saleProduct, { ...CONFIG, product_copy: copy });
    expect(c?.lead).toBe("");
    expect(c?.story).toEqual(["عطر خشبي دافئ.\nيدوم طول اليوم."]);
  });

  it("the story cards drop the emoji and keep the body", () => {
    expect(card(wayferProduct)?.storyCards[0]).toEqual({
      image: `${IMG}0.jpg`,
      title: "التوت البري الفاخر",
      body: "منطي العطر نكهة فاكهية اكثر من فخمة. رائحة التوت راح تخلي اي شخص يشم بيك هلعطر يسألك شنو اسمه",
    });
  });

  it("no tiers, facts, lead or story → null", () => {
    expect(card(plainProduct)).toBeNull();
    expect(card(saleProduct, CONFIG, null)?.story).toEqual([]);
    expect(card({ ...saleProduct, feature_cards: [] }, CONFIG, null)).toBeNull();
  });
});

describe("facts", () => {
  it("meters only from entered range values, with the source tag", () => {
    const c = card(scentProduct);
    expect(c?.meters).toEqual([
      { key: "longevity", label: "الثبات", value: 4, max: 5, segments: 5, filled: 4 },
    ]);
    expect(c?.factsSource).toBe("حسب تجربتنا");
    expect(c?.chipRows.map((r) => r.key)).toEqual(["season", "occasions"]);
    expect(c?.note?.text).toBe("ثبات ممتاز وفوحان قوي.");
  });

  it("Wayfarer today: no meters, no chips, no note, no source tag", () => {
    const c = card(wayferProduct);
    expect(c?.meters).toEqual([]);
    expect(c?.factsSource).toBe("");
    expect(c?.chipRows).toEqual([]);
    expect(c?.note).toBeNull();
  });
});

describe("customer clause (six live Wayfarer reviews)", () => {
  it("the rule's own pick: مصطفى علي, verbatim", () => {
    expect(card(wayferProduct)?.quote).toEqual({
      reviewId: "b4f6b842-2e63-465b-8d11-3dc15039ed68",
      text: "العطر صدمني بثباته اهنيكم ع هيج شغل",
      author: "مصطفى علي",
      rating: 5,
    });
  });

  it("the merchant's pick wins while it is a verbatim part of a 4★+ review", () => {
    const quote_picks = [
      {
        product_id: WAYFER_ID,
        review_id: "6881921e-d263-4780-8878-762e01904146",
        text: "بخيت منه الصبح لسه الريحة تفوح",
      },
    ];
    expect(card(wayferProduct, { ...CONFIG, quote_picks })?.quote).toEqual({
      reviewId: "6881921e-d263-4780-8878-762e01904146",
      text: "بخيت منه الصبح لسه الريحة تفوح",
      author: "eng. سيف",
      rating: 5,
    });
  });

  it.each([
    ["text not in the review", "6881921e-d263-4780-8878-762e01904146", "يثبت يومين كاملة على الملابس"],
    ["a 3★ review", "cd25b071-10d9-4de5-a324-ea6a0793559b", "ثباته يطول يوم كامل على الملابس"],
    ["an unknown review", "00000000-0000-4000-8000-000000000000", "بخيت منه الصبح لسه الريحة تفوح"],
  ])("a stale pick (%s) falls back to the rule", (_label, review_id, text) => {
    const c = card(wayferProduct, { ...CONFIG, quote_picks: [{ product_id: WAYFER_ID, review_id, text }] });
    expect(c?.quote?.author).toBe("مصطفى علي");
  });

  it("no quote terms and no pick → no quote", () => {
    expect(card(wayferProduct, { ...CONFIG, quote_terms: undefined })?.quote).toBeNull();
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/pdp_express/scent-card.test.ts
```
Expected: `Error: Failed to load url ./scent-card (resolved id: ./scent-card)`, `Test Files  1 failed (1)`, `Tests  no tests`.

- [ ] **Step 5: Write the builder**

Create `packages/sections/src/pdp_express/scent-card.ts`:

```ts
// =====================================================================
// The «بصمة العطر» card's data (F07, spec §1.4) — pure, no React
// =====================================================================
// Composes the unchanged `buildScentJourney` (tiers, chip rows, the
// staying-power line) with what only the card shows:
//   - a photo per note, from the merchant's own note cards. A card pairs
//     with a note when every word of the note is a whole word of the card
//     title (leading emoji dropped); each photo is used once, so none
//     repeats, and a note without one stays a text chip;
//   - segment meters, only from range values the merchant entered (so the
//     journey block still never draws a range);
//   - the lead line and the story: the draft-only `product_copy` entry
//     first (D9), then the `lead_key` attribute / products.description;
//   - one customer clause about staying power, verbatim: the merchant's
//     pick while it still matches its review, else the first clause of
//     the strongest 4★+ reviews that names a quote term in 3–14 words.
// A card with no tiers, facts, lead or story is null: nothing is drawn
// empty.
// =====================================================================

import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode, ResolvedProductAttribute } from "@scheniders/shared";
import { findTermHits, hasWholeWords } from "../helpers/arabic-text";
import type { Props } from "../pdp_direct_order";
import type { Product, ReviewSummaryItem } from "../types";
import { STAGE_HINT, buildScentJourney, type JourneyChipRow } from "./scent-journey";
import { xs } from "./text";

export type ScentCardConfig = NonNullable<Props["scent_card"]>;

export interface ScentNote {
  name: string;
  /** The paired note-card photo, or null (a text chip). */
  image: string | null;
}

export interface ScentTier {
  key: string;
  label: string;
  /** «أول ما ترشه» for top/heart/base; "" for other group keys. */
  hint: string;
  notes: ScentNote[];
}

export interface ScentMeter {
  key: string;
  label: string;
  value: number;
  max: number;
  /** Segments to draw (the integer max, 2–10); 0 = the value line only. */
  segments: number;
  filled: number;
}

export interface ScentQuote {
  reviewId: string;
  text: string;
  author: string;
  rating: number;
}

export interface ScentStoryCard {
  image: string | null;
  title: string;
  body: string;
}

export interface ScentCardData {
  lead: string;
  tiers: ScentTier[];
  meters: ScentMeter[];
  /** The meters' source tag («حسب تجربتنا»); "" without meters. */
  factsSource: string;
  chipRows: JourneyChipRow[];
  note: { label: string; text: string } | null;
  quote: ScentQuote | null;
  /** The story split into paragraphs on blank lines. */
  story: string[];
  storyCards: ScentStoryCard[];
}

const LEADING_EMOJI = /^(?:\p{Extended_Pictographic}|️|‍)+\s*/u;

/** A note-card title without its leading emoji («🫐 التوت البري الفاخر» →
 *  «التوت البري الفاخر»). */
export function stripLeadingEmoji(title: string): string {
  return title.replace(LEADING_EMOJI, "").trim();
}

/** The monogram for a reviewer: the first letter of the first word that is
 *  not an abbreviation («eng. سيف» → «س»). */
export function monogramOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const word = words.find((w) => !w.endsWith(".")) ?? words[0] ?? "";
  return (Array.from(word)[0] ?? "").toLocaleUpperCase();
}

type FeatureCard = { image_url?: string; title: string; body: string };

function featureCardsOf(product: Product): FeatureCard[] {
  return Array.isArray(product.feature_cards)
    ? product.feature_cards.filter(
        (c): c is FeatureCard => !!c && typeof c.title === "string" && typeof c.body === "string",
      )
    : [];
}

function pairPhotos(
  stages: { key: string; label: string; notes: string[] }[],
  cards: FeatureCard[],
  locale: LocaleCode,
): ScentTier[] {
  const usedUrls = new Set<string>();
  return stages.map((s) => {
    const hintKey = STAGE_HINT.get(s.key);
    return {
      key: s.key,
      label: s.label,
      hint: hintKey ? xs(hintKey, locale) : "",
      notes: s.notes.map((name) => {
        const card = cards.find(
          (c) =>
            !!c.image_url &&
            !usedUrls.has(c.image_url) &&
            hasWholeWords(stripLeadingEmoji(c.title), name),
        );
        if (!card?.image_url) return { name, image: null };
        usedUrls.add(card.image_url);
        return { name, image: card.image_url };
      }),
    };
  });
}

function metersOf(
  byKey: Map<string, ResolvedProductAttribute>,
  keys: readonly string[],
  locale: LocaleCode,
): ScentMeter[] {
  return keys.flatMap((k) => {
    const attr = byKey.get(k);
    if (!attr || attr.kind !== "range" || !Number.isFinite(attr.value)) return [];
    const max = attr.def.range_max;
    const segments = Number.isInteger(max) && max >= 2 && max <= 10 ? max : 0;
    return [
      {
        key: k,
        label: resolveI18n(attr.def.name_i18n, locale) || k,
        value: attr.value,
        max,
        segments,
        filled: Math.min(segments, Math.max(0, Math.round(attr.value))),
      },
    ];
  });
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

const CLAUSE_SPLIT = /[.،!؟\n]/;

function quoteOf(
  product: Product,
  config: ScentCardConfig,
): ScentQuote | null {
  const reviews: ReviewSummaryItem[] = (product.reviews ?? []).filter(
    (r) => r.rating >= 4 && !!r.body?.trim() && !!r.author_name?.trim(),
  );
  const asQuote = (r: ReviewSummaryItem, text: string): ScentQuote => ({
    reviewId: r.id,
    text,
    author: (r.author_name ?? "").trim(),
    rating: r.rating,
  });

  const pick = config.quote_picks?.find((p) => p.product_id === product.id);
  if (pick) {
    const r = reviews.find((x) => x.id === pick.review_id);
    if (r?.body?.includes(pick.text)) return asQuote(r, pick.text);
  }

  const terms = config.quote_terms ?? [];
  if (terms.length === 0) return null;
  const ordered = [...reviews].sort(
    (a, b) => b.rating - a.rating || (b.body ?? "").length - (a.body ?? "").length,
  );
  for (const r of ordered) {
    for (const raw of (r.body ?? "").split(CLAUSE_SPLIT)) {
      const clause = raw.trim();
      const n = wordCount(clause);
      if (n >= 3 && n <= 14 && findTermHits(clause, terms).length > 0) return asQuote(r, clause);
    }
  }
  return null;
}

export function buildScentCard(input: {
  product: Product;
  config: ScentCardConfig;
  locale: LocaleCode;
  /** products.description when the section shows it (`show_description`),
   *  else null. */
  description: string | null;
}): ScentCardData | null {
  const { product, config, locale } = input;
  const attributes = product.attributes ?? [];
  const byKey = new Map<string, ResolvedProductAttribute>(attributes.map((a) => [a.def.key, a]));
  const journey = buildScentJourney(
    attributes,
    { pyramid_key: config.pyramid_key, chip_keys: config.chip_keys, note_key: config.note_key },
    locale,
  );
  const cards = featureCardsOf(product);
  const copy = config.product_copy?.find((c) => c.product_id === product.id);

  const leadAttr = config.lead_key ? byKey.get(config.lead_key) : undefined;
  const lead =
    resolveI18n(copy?.lead_i18n, locale).trim() ||
    (leadAttr?.kind === "text" ? resolveI18n(leadAttr.value, locale).trim() : "");

  const storyText = resolveI18n(copy?.story_i18n, locale).trim() || (input.description ?? "").trim();
  const story = storyText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const tiers = pairPhotos(journey?.stages ?? [], cards, locale);
  const meters = metersOf(byKey, config.meter_keys ?? [], locale);
  const chipRows = journey?.chipRows ?? [];
  const note = journey?.note ?? null;
  const storyCards = cards.map((c) => ({
    image: c.image_url ?? null,
    title: stripLeadingEmoji(c.title),
    body: c.body,
  }));

  const hasFacts = meters.length > 0 || chipRows.length > 0 || note !== null;
  if (tiers.length === 0 && !hasFacts && !lead && story.length === 0 && storyCards.length === 0) {
    return null;
  }
  return {
    lead,
    tiers,
    meters,
    factsSource: meters.length > 0 ? resolveI18n(config.facts_source_i18n, locale).trim() : "",
    chipRows,
    note,
    quote: quoteOf(product, config),
    story,
    storyCards,
  };
}
```

- [ ] **Step 6: Run the test**

```bash
CI=true pnpm exec vitest run packages/sections/src/pdp_express/scent-card.test.ts
```
Expected: `Tests  23 passed (23)`. Read the two quote cases: the rule alone picks مصطفى علي's «العطر صدمني بثباته اهنيكم ع هيج شغل» (spec §1.4); Ali's pick shows سيف's «بخيت منه الصبح لسه الريحة تفوح»; a stale pick falls back.

- [ ] **Step 7: Type gate, then commit**

Run the sections type gate. Expected: no output.
```bash
git branch --show-current
git add packages/sections/src/_pdp-wayfer-fixtures.ts packages/sections/src/pdp_express/scent-card.ts packages/sections/src/pdp_express/scent-card.test.ts
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): buildScentCard — note photos by whole word, meters from entered values, verbatim quote" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The card in the page (`ScentCardBlock` + `express-view`)

**Files:**
- Create: `packages/sections/src/pdp_express/scent-card-block.tsx`
- Modify: `packages/sections/src/pdp_express/express-view.tsx`
- Test: `packages/sections/src/pdp_express/scent-card-block.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/pdp_express/scent-card-block.test.tsx`:

```tsx
// Express «بصمة العطر» card in the page (spec §1.4): it replaces the
// description, the journey and the note cards only in card mode, sits
// directly under the promise band, draws every element only with its
// data, keeps yellow out (D4), adds no `dir`, and is byte-identical off.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocaleCode } from "@scheniders/shared";
import { StoreBaseProvider } from "../helpers/store-context";
import pdp_direct_order from "../pdp_direct_order";
import type { Props } from "../pdp_direct_order";
import { EXPRESS_IRAQ_DRAFT_PDP_PROPS, productCtx, productRuntime } from "../_pdp-fixtures";
import { IRAQ_REDESIGN_TENANT, SLICE_1B_PDP_PATCH } from "../_pdp-redesign-fixtures";
import { scentProduct } from "../_pdp-scent-fixtures";
import { WAYFER_ID, wayferProduct } from "../_pdp-wayfer-fixtures";
import type { Product } from "../types";

const SCENT_CARD: NonNullable<Props["scent_card"]> = {
  pyramid_key: "notes",
  chip_keys: ["season", "occasions"],
  note_key: "longevity_note",
  meter_keys: ["longevity", "sillage"],
  lead_key: "scent_lead",
  quote_terms: ["ثبات", "يثبت", "تفوح", "يفوح"],
  facts_source_i18n: { ar: "حسب تجربتنا", en: "Our own estimate" },
  quote_picks: [
    {
      product_id: WAYFER_ID,
      review_id: "6881921e-d263-4780-8878-762e01904146",
      text: "بخيت منه الصبح لسه الريحة تفوح",
    },
  ],
  product_copy: [
    {
      product_id: WAYFER_ID,
      lead_i18n: { ar: "فاكهي بلمسة توابل: يبدي بالتوت والتفاح، ويظل عليك بالباتشولي" },
      story_i18n: { ar: "ملك العطور الجديد: ويفر انتنس\n\nأنت تستاهل تكون مميز. لا ترضى بالعادي." },
    },
  ],
};

/** The draft as slice 1b left it: the promise band on, no scent card. */
const BAND_PROPS: Props = { ...EXPRESS_IRAQ_DRAFT_PDP_PROPS, ...SLICE_1B_PDP_PATCH };
const CARD_PROPS: Props = { ...BAND_PROPS, scent_layout: "card", scent_card: SCENT_CARD };

function render(props: Props, product: Product, locale: LocaleCode = "ar"): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <pdp_direct_order.render
        props={props}
        ctx={productCtx(product, {
          tenant: IRAQ_REDESIGN_TENANT,
          runtime: { ...productRuntime, locale },
        })}
      />
    </StoreBaseProvider>,
  );
}

/** The card's own markup, from its opening tag to the end of the section. */
function cardOf(html: string): string {
  const start = html.indexOf("data-scent-card");
  expect(start).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("</section>", html.lastIndexOf("data-scent-story")));
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("scent_layout card — Wayfarer as the draft has it", () => {
  const html = render(CARD_PROPS, wayferProduct);
  const card = cardOf(html);

  it("replaces «عن العطر», «رحلة العطر» and the note cards", () => {
    expect(html).not.toContain("عن العطر");
    expect(html).not.toContain('data-layer="scent-journey"');
    expect(html).not.toContain('data-layer="note-row"');
  });

  it("sits directly under the promise band, after the order form", () => {
    expect(html.indexOf("data-promise-band")).toBeGreaterThan(-1);
    expect(html.indexOf("</form>")).toBeLessThan(html.indexOf("data-scent-card"));
    expect(html.indexOf("data-promise-band")).toBeLessThan(html.indexOf("data-scent-card"));
  });

  it("header, lead and the pyramid with all 5 photos", () => {
    expect(card).toContain("بصمة العطر");
    expect(card).toContain("رجالي");
    expect(card).toContain("فاكهي بلمسة توابل: يبدي بالتوت والتفاح، ويظل عليك بالباتشولي");
    expect(count(card, "data-note-photo")).toBe(5);
    expect(count(card, "data-note-chip")).toBe(0);
    expect(card).toContain("أول ما ترشه");
  });

  it("no facts block without data: no meter, no source tag, no empty slot", () => {
    expect(card).not.toContain("data-scent-facts");
    expect(card).not.toContain("data-meter");
    expect(card).not.toContain("حسب تجربتنا");
  });

  it("the merchant-picked clause, verbatim, credited", () => {
    expect(card).toContain("الثبات، بكلام زبون");
    expect(card).toContain("«بخيت منه الصبح لسه الريحة تفوح»");
    expect(card).toContain("<bdi>eng. سيف</bdi>");
    expect(card).toMatch(/aria-hidden="true"[^>]*>س<\/span>/);
  });

  it("the rating is text until the reviews summary exists, and a link after", () => {
    expect(card).toContain('data-scent-rating="text"');
    expect(card).toContain("4.7");
    expect(card).toContain("6 تقييمات");
    const linked = cardOf(render({ ...CARD_PROPS, identity_rating: "summary_link" }, wayferProduct));
    expect(linked).toContain('href="#reviews-summary"');
    expect(linked).not.toContain('href="#reviews"');
  });

  it("«قصة العطر» opens the story sheet with the rewrite and the note cards", () => {
    expect(card).toContain('aria-haspopup="dialog"');
    expect(card).toContain("قصة العطر");
    expect(card).toContain("ملك العطور الجديد: ويفر انتنس");
    expect(card).not.toContain("لاول 100 زبون");
    expect(card).toContain(">التوت البري الفاخر<");
    expect(card).not.toContain("🫐");
  });

  it("keeps yellow out and adds no dir attribute", () => {
    expect(card).not.toMatch(/bg-bk-primary|text-bk-primary/);
    expect(card).not.toContain('dir="');
  });
});

describe("scent_layout card — facts when the product has them", () => {
  it("meters, the source tag, chips and the staying-power line", () => {
    const card = cardOf(render(CARD_PROPS, scentProduct));
    expect(card).toContain('data-meter="longevity"');
    expect(card).not.toContain('data-meter="sillage"');
    expect(card).toContain("4 من 5");
    expect(count(card, "h-2 flex-1 rounded-bk-pill bg-bk-ink")).toBe(4);
    expect(count(card, "h-2 flex-1 rounded-bk-pill bg-bk-divider")).toBe(1);
    expect(card).toContain("حسب تجربتنا");
    expect(card).toContain('data-chip-row="season"');
    expect(card).toContain('data-chip-row="occasions"');
    expect(card).toContain("ثبات ممتاز وفوحان قوي.");
    // Two notes have photo cards; the rest are text chips.
    expect(count(card, "data-note-photo")).toBe(2);
    expect(count(card, "data-note-chip")).toBe(6);
  });

  it("english", () => {
    const card = cardOf(render(CARD_PROPS, scentProduct, "en"));
    expect(card).toContain("Scent profile");
    expect(card).toContain("4 of 5");
    expect(card).toContain("Our own estimate");
    expect(card).toContain("The scent’s story");
  });
});

describe("scent_layout off", () => {
  it("scent_card alone changes nothing", () => {
    expect(render({ ...BAND_PROPS, scent_card: SCENT_CARD }, wayferProduct)).toBe(
      render(BAND_PROPS, wayferProduct),
    );
  });

  it('"journey" keeps today\'s blocks', () => {
    const html = render({ ...CARD_PROPS, scent_layout: "journey" }, scentProduct);
    expect(html).not.toContain("data-scent-card");
    expect(html).toContain('data-layer="scent-journey"');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
CI=true pnpm exec vitest run packages/sections/src/pdp_express/scent-card-block.test.tsx
```
Expected: `AssertionError: expected -1 to be greater than -1` (the describe-level `cardOf` finds no card), `Test Files  1 failed (1)`, `Tests  no tests`.

- [ ] **Step 3: Write the component**

Create `packages/sections/src/pdp_express/scent-card-block.tsx`:

```tsx
"use client";

// =====================================================================
// Express «بصمة العطر» card (F07, spec §1.4) — `scent_layout: "card"`
// =====================================================================
// One light card under the promise band, in place of «عن العطر», «رحلة
// العطر» and the note cards:
//   1. eyebrow + who it is for;
//   2. the lead line;
//   3. the always-open pyramid: per tier, the stage and its hint at the
//      reading edge, then the notes as 60px round photos with names (a
//      note without a photo is a text chip);
//   4. facts, only with data: meters with their source tag, the chip rows,
//      the staying-power line;
//   5. «الثبات، بكلام زبون»: one verbatim clause, the reviewer in <bdi>;
//   6. the rating and «قصة العطر», which opens the story in a BottomSheet.
// The data comes from `buildScentCard`; this file only draws it. Rows flip
// with classes, never `dir`. Yellow is not used here (D4): stars are the
// amber accent, meters and the monogram are ink/espresso.
// =====================================================================

import { useId } from "react";
import Image from "next/image";
import { cn } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { BottomSheet } from "../helpers/bottom-sheet";
import { displayRating } from "../helpers/format";
import { isOptimizableImageHost } from "../helpers/image";
import { MaterialIcon, Stars } from "../helpers/primitives";
import type { Product } from "../types";
import { GENDER_ICON, Tag, reviewCountLabel } from "./identity-label";
import { monogramOf, type ScentCardData } from "./scent-card";
import { readsRtl, xs } from "./text";

export function ScentCardBlock({
  card,
  product,
  locale,
  reviewCount,
  avgRating,
  ratingLink,
}: {
  card: ScentCardData;
  product: Product;
  locale: LocaleCode;
  reviewCount: number;
  avgRating: number;
  /** The rating links to `#reviews-summary` — set only where that summary
   *  exists (identity_rating "summary_link", slice 1e); else plain text. */
  ratingLink: boolean;
}) {
  const headingId = useId();
  const rtl = readsRtl(locale);
  const align = rtl ? "text-right" : "text-left";
  const gender = product.gender;
  const hasFacts = card.meters.length > 0 || card.chipRows.length > 0 || card.note !== null;
  const hasStory = card.story.length > 0 || card.storyCards.length > 0;
  const shown = displayRating(avgRating).toFixed(1);
  const rating = reviewCount > 0;

  const ratingInner = (
    <>
      <Stars value={1} max={1} size={14} label={`${shown} / 5`} />
      <bdi className="font-black tabular-nums text-bk-ink">{shown}</bdi>
      <span aria-hidden="true">·</span>
      <span>{reviewCountLabel(reviewCount, locale)}</span>
    </>
  );
  const ratingCls = cn(
    "inline-flex min-h-11 items-center gap-1.5 font-bk-body text-sm font-bold text-bk-ink-soft",
    rtl && "flex-row-reverse",
  );

  return (
    <section
      data-scent-card=""
      aria-labelledby={headingId}
      className="space-y-bk-sm rounded-bk-card bg-bk-surface-alt p-4"
    >
      <div className={cn("flex items-center justify-between gap-2", rtl && "flex-row-reverse")}>
        <h2 id={headingId} className="font-bk-body text-xs font-black text-bk-ink-soft">
          {xs("scentEyebrow", locale)}
        </h2>
        {gender && (
          <Tag className={cn(rtl && "flex-row-reverse")}>
            <MaterialIcon name={GENDER_ICON[gender]} className="text-sm" />
            {xs(gender, locale)}
          </Tag>
        )}
      </div>

      {card.lead && (
        <p
          data-scent-lead=""
          className={cn("font-bk-display text-[17px] font-extrabold leading-snug text-bk-ink text-balance", align)}
        >
          {card.lead}
        </p>
      )}

      {card.tiers.length > 0 && (
        <ol aria-label={xs("notesListLabel", locale)} className="divide-y divide-bk-divider">
          {card.tiers.map((t) => (
            <li
              key={t.key}
              data-stage={t.key}
              className={cn("flex items-center gap-3 py-3", rtl && "flex-row-reverse")}
            >
              <p className={cn("w-20 shrink-0", align)}>
                <span className="block font-bk-display text-sm font-black text-bk-ink">{t.label}</span>
                {t.hint && (
                  <span className="block font-bk-body text-xs font-semibold text-bk-ink-soft">{t.hint}</span>
                )}
              </p>
              <ul className={cn("flex min-w-0 flex-1 flex-wrap items-start gap-3", rtl && "flex-row-reverse")}>
                {t.notes.map((n, i) =>
                  n.image ? (
                    <li
                      key={`${n.name}-${i}`}
                      data-note-photo=""
                      className="flex w-[4.5rem] flex-col items-center gap-1 text-center"
                    >
                      <Image
                        src={n.image}
                        alt=""
                        width={60}
                        height={60}
                        unoptimized={!isOptimizableImageHost(n.image)}
                        className="h-[60px] w-[60px] rounded-bk-pill object-cover"
                      />
                      <span className="font-bk-body text-xs font-bold leading-tight text-bk-ink">{n.name}</span>
                    </li>
                  ) : (
                    <li
                      key={`${n.name}-${i}`}
                      data-note-chip=""
                      className="inline-flex h-7 items-center rounded-bk-pill bg-bk-surface px-2.5 font-bk-body text-xs font-bold text-bk-ink"
                    >
                      <bdi>{n.name}</bdi>
                    </li>
                  ),
                )}
              </ul>
            </li>
          ))}
        </ol>
      )}

      {hasFacts && (
        <div data-scent-facts="" className="space-y-bk-xs rounded-bk-card bg-bk-surface p-3">
          {card.meters.map((m) => (
            <div key={m.key} data-meter={m.key} className={cn("flex items-center gap-2", rtl && "flex-row-reverse")}>
              <span className={cn("w-20 shrink-0 font-bk-body text-xs font-bold text-bk-ink-soft", align)}>
                {m.label}
              </span>
              {m.segments > 0 && (
                <span aria-hidden="true" className={cn("flex flex-1 gap-1", rtl && "flex-row-reverse")}>
                  {Array.from({ length: m.segments }, (_, i) => (
                    <span
                      key={i}
                      className={cn("h-2 flex-1 rounded-bk-pill", i < m.filled ? "bg-bk-ink" : "bg-bk-divider")}
                    />
                  ))}
                </span>
              )}
              <span className="shrink-0 font-bk-body text-xs font-bold tabular-nums text-bk-ink">
                <bdi>{xs("meterValue", locale, { value: m.value, max: m.max })}</bdi>
              </span>
            </div>
          ))}
          {card.factsSource && (
            <p data-facts-source="" className={cn("font-bk-body text-xs font-semibold text-bk-ink-soft", align)}>
              {card.factsSource}
            </p>
          )}
          {card.chipRows.map((r) => (
            <div
              key={r.key}
              data-chip-row={r.key}
              className={cn("flex flex-wrap items-center gap-1.5", rtl && "flex-row-reverse")}
            >
              <span className="font-bk-body text-xs font-bold text-bk-ink-soft">{r.label}</span>
              <ul aria-label={r.label} className={cn("flex flex-wrap gap-1.5", rtl && "flex-row-reverse")}>
                {r.chips.map((c, j) => (
                  <li
                    key={`${c}-${j}`}
                    className="inline-flex h-7 items-center rounded-bk-pill bg-bk-surface-alt px-2.5 font-bk-body text-xs font-bold text-bk-ink"
                  >
                    <bdi>{c}</bdi>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {card.note && (
            <p data-staying-power="" className={cn("font-bk-body text-sm font-bold text-bk-ink", align)}>
              <span className="sr-only">{card.note.label}: </span>
              <bdi>{card.note.text}</bdi>
            </p>
          )}
        </div>
      )}

      {card.quote && (
        <div data-scent-quote="">
          <p className={cn("font-bk-body text-xs font-bold text-bk-ink-soft", align)}>
            {xs("stayInCustomerWords", locale)}
          </p>
          <figure className={cn("mt-1.5 flex items-start gap-2.5", rtl && "flex-row-reverse")}>
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-bk-pill bg-bk-secondary font-bk-display text-[13px] font-black text-bk-on-secondary"
            >
              {monogramOf(card.quote.author)}
            </span>
            <div className={cn("min-w-0 flex-1 rounded-bk-card bg-bk-surface px-3 py-2.5", align)}>
              <blockquote className="font-bk-body text-sm font-bold leading-relaxed text-bk-ink">
                <p>«{card.quote.text}»</p>
              </blockquote>
              <figcaption
                className={cn(
                  "mt-1 flex items-center gap-1.5 font-bk-body text-xs font-bold text-bk-ink-soft",
                  rtl && "flex-row-reverse",
                )}
              >
                <bdi>{card.quote.author}</bdi>
                <Stars value={card.quote.rating} size={12} label={`${card.quote.rating} / 5`} />
              </figcaption>
            </div>
          </figure>
        </div>
      )}

      {(rating || hasStory) && (
        <div
          className={cn(
            "flex items-center justify-between gap-3 border-t border-bk-divider pt-1",
            rtl && "flex-row-reverse",
          )}
        >
          {rating ? (
            ratingLink ? (
              <a href="#reviews-summary" data-scent-rating="link" className={ratingCls}>
                {ratingInner}
              </a>
            ) : (
              <p data-scent-rating="text" className={ratingCls}>
                {ratingInner}
              </p>
            )
          ) : (
            <span />
          )}
          {hasStory && (
            <BottomSheet
              trigger={
                <>
                  <span>{xs("scentStory", locale)}</span>
                  <MaterialIcon name={rtl ? "chevron_left" : "chevron_right"} className="text-lg" />
                </>
              }
              triggerClassName={cn(
                "inline-flex min-h-11 items-center gap-1 font-bk-body text-sm font-black text-bk-ink",
                rtl && "flex-row-reverse",
              )}
              title={xs("scentStory", locale)}
              closeLabel={xs("closeSheet", locale)}
              locale={locale}
            >
              <div data-scent-story="" className="space-y-bk-sm">
                {card.story.map((p, i) => (
                  <p
                    key={i}
                    className={cn(
                      "whitespace-pre-line font-bk-body text-sm leading-relaxed text-bk-ink [unicode-bidi:plaintext]",
                      align,
                    )}
                  >
                    {p}
                  </p>
                ))}
                {card.storyCards.length > 0 && (
                  <ul aria-label={xs("notesListLabel", locale)} className="space-y-bk-sm">
                    {card.storyCards.map((c, i) => (
                      <li key={`${c.title}-${i}`} className={cn("flex items-start gap-3", rtl && "flex-row-reverse")}>
                        {c.image && (
                          <Image
                            src={c.image}
                            alt=""
                            width={56}
                            height={56}
                            unoptimized={!isOptimizableImageHost(c.image)}
                            className="h-14 w-14 shrink-0 rounded-bk-input object-cover"
                          />
                        )}
                        <div className={cn("min-w-0", align)}>
                          <p className="font-bk-body text-sm font-bold text-bk-ink">{c.title}</p>
                          <p className="font-bk-body text-xs leading-relaxed text-bk-ink-soft">{c.body}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </BottomSheet>
          )}
        </div>
      )}
    </section>
  );
}
```

Notes: the note photos use `next/image` with fixed `width`/`height` and no `sizes`, so the srcset is 1x/2x only; `unoptimized` follows `isOptimizableImageHost` like `note-row.tsx`. The rating star is `Stars value={1} max={1}` (amber, D4). The monogram is `bg-bk-secondary text-bk-on-secondary` (not yellow).

- [ ] **Step 4: Wire it into `express-view.tsx`**

In `packages/sections/src/pdp_express/express-view.tsx`:

Replace:
```ts
import { buildScentJourney } from "./scent-journey";
import { ScentJourneyBlock } from "./scent-journey-block";
```
with:
```ts
import { buildScentCard } from "./scent-card";
import { ScentCardBlock } from "./scent-card-block";
import { buildScentJourney } from "./scent-journey";
import { ScentJourneyBlock } from "./scent-journey-block";
```

Replace:
```ts
  // Opt-in: the product's own attributes as the «رحلة العطر» block; null
  // (no block) when the product carries none of the configured keys.
  const journey = props.scent_journey
    ? buildScentJourney(product.attributes, props.scent_journey, locale)
    : null;
```
with:
```ts
  // scent_layout "card" (F07): one «بصمة العطر» card replaces «عن العطر»,
  // «رحلة العطر» and the note cards. Null (nothing drawn) when the product
  // has no tiers, facts, lead or story.
  const cardConfig = props.scent_layout === "card" ? props.scent_card : undefined;
  const scentCard = cardConfig
    ? buildScentCard({
        product,
        config: cardConfig,
        locale,
        description: props.show_description ? (product.description ?? null) : null,
      })
    : null;
  // Opt-in: the product's own attributes as the «رحلة العطر» block; null
  // (no block) when the product carries none of the configured keys.
  const journey =
    !cardConfig && props.scent_journey
      ? buildScentJourney(product.attributes, props.scent_journey, locale)
      : null;
```

Replace:
```tsx
        {props.show_description && product.description && (
          <DescriptionBlock text={product.description} locale={locale} chapter={chapter} />
        )}
```
with:
```tsx
        {/* One child slot for the card or the description: React's useId
            path counts sibling slots, so a new slot here would renumber
            every id below it and change the baselines. */}
        {cardConfig
          ? scentCard && (
              <ScentCardBlock
                card={scentCard}
                product={product}
                locale={locale}
                reviewCount={m.reviewCount}
                avgRating={m.avgRating}
                ratingLink={props.identity_rating === "summary_link"}
              />
            )
          : props.show_description &&
            product.description && (
              <DescriptionBlock text={product.description} locale={locale} chapter={chapter} />
            )}
```

Replace:
```tsx
        {m.featureCards.length > 0 && props.feature_cards_layout === "row" && (
```
with:
```tsx
        {!cardConfig && m.featureCards.length > 0 && props.feature_cards_layout === "row" && (
```

Replace:
```tsx
        {m.featureCards.length > 0 && props.feature_cards_layout !== "row" && (
```
with:
```tsx
        {!cardConfig && m.featureCards.length > 0 && props.feature_cards_layout !== "row" && (
```

- [ ] **Step 5: Run the test, then every baseline and the 1b redesign snapshot**

```bash
CI=true pnpm exec vitest run packages/sections/src/pdp_express/scent-card-block.test.tsx
CI=true pnpm exec vitest run packages/sections/src
```
Expected:
- first: `Tests  12 passed (12)`;
- second: `Test Files  119 passed (119)`, `Tests  1275 passed (1275)`, no `written`/`updated`/`obsolete`. The 1b redesign snapshot is still unchanged here (its fixture has no 1c props yet).

If `_pdp-express-snapshot` fails with ids like `_R_27_` → `_R_2n_`, the card was given its own JSX slot: put it back in the description's slot (Scope decision 6).

- [ ] **Step 6: Type gate, then commit**

Run the sections type gate. Expected: no output.
```bash
git branch --show-current
git add packages/sections/src/pdp_express/scent-card-block.tsx packages/sections/src/pdp_express/scent-card-block.test.tsx packages/sections/src/pdp_express/express-view.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): «بصمة العطر» scent card replaces the description, journey and note cards in card mode" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The 1c draft-config migration (written, replayed locally, dry-run; NOT applied)

**Files:**
- Create: `packages/supabase/migrations/<STAMP>_scheniders_iraq_pdp_redesign_1c_draft.sql`
- Scratch: `tmp/pdp-1c/dryrun-1c.sql` (gitignored), `${TMPDIR:-/tmp}/pdp-1c-pglite/` (outside the repo)

All live access in this task is **read-only**.

- [ ] **Step 1: Pick the timestamp**

```bash
STAMP=$(date -u +%Y%m%d%H%M%S); echo $STAMP
ls packages/supabase/migrations | grep -E '^[0-9]{14}_' | sort | tail -1
```
Expected: `$STAMP` sorts after the last listed file (today `20261029210502_scheniders_iraq_pdp_redesign_1b_draft.sql`). Keep `$STAMP` in this shell for this task and Task 9.

- [ ] **Step 2: Write the migration**

Create `packages/supabase/migrations/${STAMP}_scheniders_iraq_pdp_redesign_1c_draft.sql`:

```sql
-- =====================================================================
-- scheniders-iraq PDP redesign, slice 1c — DRAFT config only
-- =====================================================================
-- Spec: docs/superpowers/specs/2026-10-27-pdp-lower-page-redesign-design.md
-- §1.4, §1.9, D1, D9.
--
-- Writes ONLY tenants.store_config_v2_draft (and updated_at) for slug
-- scheniders-iraq. store_config_v2 (published) is never written; its md5
-- is captured before the write and asserted equal after it. No product,
-- attribute or description row is written: the lead line and the story
-- rewrite live in scent_card.product_copy until publish day (D9), when
-- packages/supabase/go-live/scheniders-iraq-pdp-redesign.sql moves them
-- into product data and removes product_copy.
--
-- What it changes in the draft: pdp_direct_order aae22169 base, merged
-- with `||`: scent_layout "card" and scent_card (the attribute keys, the
-- quote terms, the «حسب تجربتنا» source tag, Ali's quote pick — eng.
-- سيف's «بخيت منه الصبح لسه الريحة تفوح» — and the Wayfarer lead + story).
-- scent_journey and feature_cards_layout stay in config, ignored in card
-- mode.
--
-- Guards, in order, in one transaction:
--   a. no tenant / no product page / no pdp_direct_order aae22169
--      -> RAISE NOTICE and no write (a fresh database replays this as a no-op);
--   b. the transform applied to the current draft changes nothing
--      -> RAISE NOTICE 'already applied' and no write (a second run is a no-op);
--   c. md5(store_config_v2_draft::text) must be 9cd2543a6126057d423f66ff9297cf76
--      and store_config_rev must be 38 (both read 2026-10-30) -> else RAISE
--      EXCEPTION: someone edited or published since, so re-read and
--      regenerate this file;
--   d. md5(store_config_v2::text) is equal before and after the write.
--
-- Applied ONLY after the code that reads these props is deployed:
--   supabase db query --linked -f <this file>
--   supabase migration repair --status applied <version>
-- Never `supabase db push`.
--
-- Rollback (read 2026-10-30 at draft md5 9cd2543a6126057d423f66ff9297cf76):
-- scent_layout and scent_card were absent from the pdp_direct_order base;
-- remove both with `-`.
-- =====================================================================

DO $mig$
DECLARE
  c_slug constant text := 'scheniders-iraq';
  c_expected_rev constant bigint := 38;
  c_expected_draft_md5 constant text := '9cd2543a6126057d423f66ff9297cf76';
  c_pdp_id constant text := 'aae22169-cef4-4495-842b-863a7caa71c2';
  -- pdp_patch:begin
  c_pdp_patch constant jsonb := $json${
    "scent_layout": "card",
    "scent_card": {
      "pyramid_key": "notes",
      "chip_keys": ["season", "occasions"],
      "note_key": "longevity_note",
      "meter_keys": ["longevity", "sillage"],
      "lead_key": "scent_lead",
      "quote_terms": ["ثبات", "يثبت", "تفوح", "يفوح"],
      "facts_source_i18n": { "ar": "حسب تجربتنا", "en": "Our own estimate" },
      "quote_picks": [
        {
          "product_id": "5e847790-11a5-439f-bace-c315e0ff1ae8",
          "review_id": "6881921e-d263-4780-8878-762e01904146",
          "text": "بخيت منه الصبح لسه الريحة تفوح"
        }
      ],
      "product_copy": [
        {
          "product_id": "5e847790-11a5-439f-bace-c315e0ff1ae8",
          "lead_i18n": { "ar": "فاكهي بلمسة توابل: يبدي بالتوت والتفاح، ويظل عليك بالباتشولي" },
          "story_i18n": { "ar": "ملك العطور الجديد: ويفر انتنس\n\nشايف شعور من شخص يدخل لمناسبة أو يطب للدوام، وتشوف عطره طاغي ومميز؟ هذا بالضبط اللي راح تحس بيه ويا ويفر: أكثر عطر راح تنسأل عليه من ترشه، وأكثر عطر راح يجيبلك مديح.\n\nإحنا ما نبيعلك مجرد «ريحة حلوة». هذا العطر مصمم للرجل اللي يريد يترك «بصمة» بالمكان اللي يدخله، بثباته وفوحانه اللي يدخل قبلك للمكان ويظل وراك بعد ما تطلع. انسى العطور اللي تختفي ورا 10 دقايق.\n\nشراح تحس من ترشه؟\nأول رشة: التوت الفاخر والتفاح الأخضر. نكهة فاكهية ومنعشة تخطف الانتباه فوراً.\nالقلب: الهيل واللافندر. رزانة وفخامة وهدوء مال رجل واثق من نفسه ويعرف شيريد.\nالقاعدة: الباتشولي الساحر. الريحة اللي تتشبع بملابسك وتخلي الناس تنتبه على عطرك حتى بعد ما تطلع.\n\nأنت تستاهل تكون مميز. لا ترضى بالعادي." }
        }
      ]
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
BEGIN
  SELECT id, store_config_rev, store_config_v2_draft, md5(store_config_v2::text)
    INTO v_tenant_id, v_rev, v_draft, v_pub_md5
    FROM public.tenants
   WHERE slug = c_slug
     FOR UPDATE;
  IF NOT FOUND OR v_draft IS NULL THEN
    RAISE NOTICE 'pdp redesign 1c: no tenant % with a draft, nothing written', c_slug;
    RETURN;
  END IF;

  SELECT (p.ord - 1)::int INTO v_page_idx
    FROM jsonb_array_elements(v_draft->'pages') WITH ORDINALITY AS p(page, ord)
   WHERE p.page->>'page_id' = 'product';
  IF v_page_idx IS NULL THEN
    RAISE NOTICE 'pdp redesign 1c: % has no product page, nothing written', c_slug;
    RETURN;
  END IF;
  v_sections := v_draft->'pages'->v_page_idx->'sections';

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_sections) AS s(sec) WHERE s.sec->>'id' = c_pdp_id
  ) THEN
    RAISE NOTICE 'pdp redesign 1c: product page lacks pdp_direct_order %, nothing written', c_pdp_id;
    RETURN;
  END IF;

  SELECT jsonb_agg(
           CASE
             WHEN x.sec->>'id' = c_pdp_id
               THEN jsonb_set(x.sec, '{base}', (x.sec->'base') || c_pdp_patch)
             ELSE x.sec
           END
           ORDER BY x.ord
         )
    INTO v_new_sections
    FROM jsonb_array_elements(v_sections) WITH ORDINALITY AS x(sec, ord);

  v_target := jsonb_set(v_draft, ARRAY['pages', v_page_idx::text, 'sections'], v_new_sections);

  IF v_target = v_draft THEN
    RAISE NOTICE 'pdp redesign 1c: already applied, nothing written';
    RETURN;
  END IF;

  IF md5(v_draft::text) <> c_expected_draft_md5 THEN
    RAISE EXCEPTION 'pdp redesign 1c: draft md5 is %, expected % (edited since it was read); re-read and regenerate',
      md5(v_draft::text), c_expected_draft_md5;
  END IF;
  IF v_rev <> c_expected_rev THEN
    RAISE EXCEPTION 'pdp redesign 1c: store_config_rev is %, expected % (published since it was read); re-read and regenerate',
      v_rev, c_expected_rev;
  END IF;

  UPDATE public.tenants
     SET store_config_v2_draft = v_target,
         updated_at = now()
   WHERE id = v_tenant_id;

  IF (SELECT md5(store_config_v2::text) FROM public.tenants WHERE id = v_tenant_id) <> v_pub_md5 THEN
    RAISE EXCEPTION 'pdp redesign 1c: the published config changed during the write';
  END IF;

  RAISE NOTICE 'pdp redesign 1c: draft md5 % -> %', c_expected_draft_md5, md5(v_target::text);
END
$mig$;
```

The `story_i18n.ar` value is the spec §1.4 story verbatim, as one JSON string (`\n` = line break). Task 7's mirror test proves it equals `WAYFER_SCENT_STORY_AR`.

- [ ] **Step 3: Copy the live row read-only and install PGlite outside the repo**

```bash
mkdir -p "${TMPDIR:-/tmp}/pdp-1c-pglite"
(cd packages && supabase db query --linked "SELECT store_config_v2_draft::text AS draft, store_config_v2::text AS pub FROM tenants WHERE slug='scheniders-iraq'" -o json) > "${TMPDIR:-/tmp}/pdp-1c-pglite/live.json"
(cd packages && supabase db query --linked "SELECT id, description, short_description, feature_cards::text AS feature_cards FROM products WHERE id='5e847790-11a5-439f-bace-c315e0ff1ae8'" -o json) > "${TMPDIR:-/tmp}/pdp-1c-pglite/product-live.json"
cd "${TMPDIR:-/tmp}/pdp-1c-pglite"
node -e 'const fs=require("fs");const r=JSON.parse(fs.readFileSync("live.json")).rows[0];fs.writeFileSync("draft.json",r.draft);fs.writeFileSync("pub.json",r.pub);const p=JSON.parse(fs.readFileSync("product-live.json")).rows[0];fs.writeFileSync("product.json",JSON.stringify(p));console.log(r.draft.length, r.pub.length, p.description.length)'
echo '{"name":"pdp-1c-pglite","private":true,"type":"module"}' > package.json
pnpm add @electric-sql/pglite@0.2.17
cd /Users/ali/scheniders-mono-pdp
```
Expected: `63948 60860 1744` (on 2026-10-30), then `+ @electric-sql/pglite 0.2.17`.

- [ ] **Step 4: Write the replay harness**

Create `${TMPDIR:-/tmp}/pdp-1c-pglite/harness-draft.mjs`:

```js
// Replays the 1c draft-config migration against a local Postgres (PGlite)
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
    await pg.exec(sql, { onNotice: (n) => notices.push(n.message) });
    console.log(`${label}: ok`, JSON.stringify(notices.splice(0)));
  } catch (e) {
    console.log(`${label}: ERROR ${e.message}`);
  }
}

{
  const { pg, notices } = await db(true);
  console.log("before", JSON.stringify(await md5s(pg)));
  await run("first run", pg, notices);
  console.log("after first", JSON.stringify(await md5s(pg)));
  await run("second run", pg, notices);
  console.log("after second", JSON.stringify(await md5s(pg)));
  const r = await pg.query(
    `SELECT md5((s.sec->'base'->'scent_card'->'product_copy')::text) AS copy_md5, s.sec->'base'->>'scent_layout' AS layout
       FROM public.tenants t, jsonb_array_elements(t.store_config_v2_draft->'pages') p(page),
            jsonb_array_elements(p.page->'sections') s(sec)
      WHERE p.page->>'page_id' = 'product' AND s.sec->>'id' = 'aae22169-cef4-4495-842b-863a7caa71c2'`,
  );
  console.log("pdp after", JSON.stringify(r.rows[0]));
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
node "${TMPDIR:-/tmp}/pdp-1c-pglite/harness-draft.mjs" "packages/supabase/migrations/${STAMP}_scheniders_iraq_pdp_redesign_1c_draft.sql" "${TMPDIR:-/tmp}/pdp-1c-pglite/draft.json" "${TMPDIR:-/tmp}/pdp-1c-pglite/pub.json"
```
Expected (pre-run 2026-10-30):
```
before {"d":"9cd2543a6126057d423f66ff9297cf76","p":"a6f87ba3181b0e94f41ba4a700de257b","bumped":false}
first run: ok ["pdp redesign 1c: draft md5 9cd2543a6126057d423f66ff9297cf76 -> e4800d7bb6f80f656cd848d3dbf469d9"]
after first {"d":"e4800d7bb6f80f656cd848d3dbf469d9","p":"a6f87ba3181b0e94f41ba4a700de257b","bumped":true}
second run: ok ["pdp redesign 1c: already applied, nothing written"]
after second {"d":"e4800d7bb6f80f656cd848d3dbf469d9","p":"a6f87ba3181b0e94f41ba4a700de257b","bumped":true}
pdp after {"copy_md5":"523744df04f3acb3e6983ddb422d3266","layout":"card"}
edited draft: ERROR pdp redesign 1c: draft md5 is b9bef5a0f92cb0f51fc36ed5efd621bc, expected 9cd2543a6126057d423f66ff9297cf76 (edited since it was read); re-read and regenerate
edited draft state {"d":"b9bef5a0f92cb0f51fc36ed5efd621bc","p":"a6f87ba3181b0e94f41ba4a700de257b","bumped":false}
published since: ERROR pdp redesign 1c: store_config_rev is 39, expected 38 (published since it was read); re-read and regenerate
empty database: ok ["pdp redesign 1c: no tenant scheniders-iraq with a draft, nothing written"]
```
This covers §1.10's data checks: the published md5 `p` never moves, `updated_at` is bumped only by a real write, a second run is a no-op, an edited draft or a publish since the read aborts, an empty database is a no-op. `copy_md5` `523744df…` is the value Task 6's go-live file guards on.

- [ ] **Step 6: Dry run on the live row (a SELECT, writes nothing)**

Create `tmp/pdp-1c/dryrun-1c.sql`:

```sql
-- Read-only dry run of <STAMP>_scheniders_iraq_pdp_redesign_1c_draft.sql:
-- the same transform as a SELECT. Writes nothing.
WITH c AS (
  SELECT
    'aae22169-cef4-4495-842b-863a7caa71c2'::text AS pdp_id,
    $json${
    "scent_layout": "card",
    "scent_card": {
      "pyramid_key": "notes",
      "chip_keys": ["season", "occasions"],
      "note_key": "longevity_note",
      "meter_keys": ["longevity", "sillage"],
      "lead_key": "scent_lead",
      "quote_terms": ["ثبات", "يثبت", "تفوح", "يفوح"],
      "facts_source_i18n": { "ar": "حسب تجربتنا", "en": "Our own estimate" },
      "quote_picks": [
        {
          "product_id": "5e847790-11a5-439f-bace-c315e0ff1ae8",
          "review_id": "6881921e-d263-4780-8878-762e01904146",
          "text": "بخيت منه الصبح لسه الريحة تفوح"
        }
      ],
      "product_copy": [
        {
          "product_id": "5e847790-11a5-439f-bace-c315e0ff1ae8",
          "lead_i18n": { "ar": "فاكهي بلمسة توابل: يبدي بالتوت والتفاح، ويظل عليك بالباتشولي" },
          "story_i18n": { "ar": "ملك العطور الجديد: ويفر انتنس\n\nشايف شعور من شخص يدخل لمناسبة أو يطب للدوام، وتشوف عطره طاغي ومميز؟ هذا بالضبط اللي راح تحس بيه ويا ويفر: أكثر عطر راح تنسأل عليه من ترشه، وأكثر عطر راح يجيبلك مديح.\n\nإحنا ما نبيعلك مجرد «ريحة حلوة». هذا العطر مصمم للرجل اللي يريد يترك «بصمة» بالمكان اللي يدخله، بثباته وفوحانه اللي يدخل قبلك للمكان ويظل وراك بعد ما تطلع. انسى العطور اللي تختفي ورا 10 دقايق.\n\nشراح تحس من ترشه؟\nأول رشة: التوت الفاخر والتفاح الأخضر. نكهة فاكهية ومنعشة تخطف الانتباه فوراً.\nالقلب: الهيل واللافندر. رزانة وفخامة وهدوء مال رجل واثق من نفسه ويعرف شيريد.\nالقاعدة: الباتشولي الساحر. الريحة اللي تتشبع بملابسك وتخلي الناس تنتبه على عطرك حتى بعد ما تطلع.\n\nأنت تستاهل تكون مميز. لا ترضى بالعادي." }
        }
      ]
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
           CASE
             WHEN x.sec->>'id' = c.pdp_id THEN jsonb_set(x.sec, '{base}', (x.sec->'base') || c.pdp_patch)
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
  md5(t.draft::text) = '9cd2543a6126057d423f66ff9297cf76' AS draft_md5_ok,
  md5(target.draft::text) AS target_md5,
  (SELECT md5((e->'base'->'scent_card'->'product_copy')::text)
     FROM jsonb_array_elements(s.sections) AS q(e)
    WHERE e->>'id' = 'aae22169-cef4-4495-842b-863a7caa71c2') AS product_copy_md5
FROM t, p, s, target;
```
```bash
(cd packages && supabase db query --linked -f ../tmp/pdp-1c/dryrun-1c.sql -o csv)
```
Expected:
```
rev_ok,draft_md5_ok,target_md5,product_copy_md5
true,true,e4800d7bb6f80f656cd848d3dbf469d9,523744df04f3acb3e6983ddb422d3266
```
`target_md5` equals the replay's `after first`: the SELECT and the migration compute the same draft.

- [ ] **Step 7: Commit the migration (not applied)**

```bash
git branch --show-current
git add "packages/supabase/migrations/${STAMP}_scheniders_iraq_pdp_redesign_1c_draft.sql"
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "chore(db): scheniders-iraq PDP redesign 1c draft config (not applied)" -m "Applied with supabase db query --linked -f only after the code is live; draft only, guarded on draft md5 9cd2543a… and store_config_rev 38." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The publish-day go-live file (written and replayed locally; never applied in this slice)

**Files:**
- Create: `packages/supabase/go-live/scheniders-iraq-pdp-redesign.sql`
- Scratch: `tmp/pdp-1c/golive-check-1c.sql`, `${TMPDIR:-/tmp}/pdp-1c-pglite/harness-golive.mjs`

The folder `packages/supabase/go-live/` is new and outside `migrations/`: `migration-versions.test.ts` and the publish-allowlist test read only `migrations/`, and `db push` never sees it.

- [ ] **Step 1: Write the go-live file**

Create `packages/supabase/go-live/scheniders-iraq-pdp-redesign.sql`:

```sql
-- =====================================================================
-- scheniders-iraq PDP redesign — PUBLISH-DAY data change (NOT a migration)
-- =====================================================================
-- Spec: docs/superpowers/specs/2026-10-27-pdp-lower-page-redesign-design.md
-- §1.9 "Publish-day data change", D9.
--
-- This file lives in packages/supabase/go-live/, outside migrations/, so no
-- `db push`, migration run or live-history mirror ever sees it. On go-live
-- day, and only then, the operator:
--   1. copies it to packages/supabase/migrations/
--      <YYYYMMDDHHMMSS>_scheniders_iraq_pdp_redesign_golive.sql, stamped
--      with the UTC moment of the copy;
--   2. applies it: supabase db query --linked -f <that file>, then
--      supabase migration repair --status applied <YYYYMMDDHHMMSS>;
--   3. deletes this go-live/ copy in the same commit;
--   4. tells Ali, who publishes right after.
-- Between steps 2 and 4 the classic published page shows the new
-- description; the two run back to back and the text is the approved one.
--
-- What it does, in ONE transaction (a DO block), for ويفر انتنس
-- (products.id 5e847790-11a5-439f-bace-c315e0ff1ae8) only:
--   a. products.description <- the story from the draft's
--      pdp_direct_order.scent_card.product_copy (the approved rewrite);
--   b. products.short_description <- «خصم 24٪ وتوصيل مجاني لكل المحافظات»;
--   c. products.feature_cards: emoji kept, two body typos fixed
--      («هلعطر» -> «هالعطر» in card 1, «اللافندراللي» -> «اللافندر اللي»
--      in card 3);
--   d. the `scent_lead` attribute definition (text, not filterable, not
--      comparable, display_order 7; ON CONFLICT DO NOTHING) and Wayfarer's
--      value from product_copy's lead. /search indexes it from now on, which
--      is intended once the page is live;
--   e. scent_card.product_copy is removed from the DRAFT pdp_direct_order
--      base, so the sheet reads products.description and the lead reads the
--      attribute: each text has one home, and later merchant edits reach
--      the page. store_config_v2 (published) is never written.
--
-- Guards (a merchant edit is never overwritten; any mismatch aborts the
-- whole change and nothing is written):
--   - no tenant / no product / no product page / no pdp section -> NOTICE,
--     no write (a fresh database is a no-op);
--   - everything already in its final state -> NOTICE 'already applied';
--   - md5 of the CURRENT value of each thing it changes must equal the value
--     read on 2026-10-30: description b413b9c23c5d01b0648e340be1c3230e,
--     short_description c39e46bd0a06c831fad6a608aef973ea, feature_cards
--     41f819bd74ab6e3a682284bb78cf8825, scent_card.product_copy
--     523744df04f3acb3e6983ddb422d3266 (as written by the 1c draft
--     migration); Wayfarer has no scent_lead value yet;
--   - md5(store_config_v2::text) is equal before and after.
-- The whole-draft md5 is NOT a guard here: slices 1d-1f change the draft
-- after this file is written, and only product_copy is touched.
--
-- Rollback (values read 2026-10-30): restore description, short_description
-- and feature_cards from the md5s above (copies in
-- packages/sections/src/_pdp-wayfer-fixtures.ts: WAYFER_DESCRIPTION,
-- WAYFER_FEATURE_CARDS, short «خصم 24٪ وتوصيل سريع لأول 100 زبون فقط»),
-- delete the Wayfarer scent_lead value and (if no other product uses it)
-- the def, and re-add product_copy from the 1c draft migration's pdp_patch.
-- =====================================================================

DO $golive$
DECLARE
  c_slug constant text := 'scheniders-iraq';
  c_product_id constant uuid := '5e847790-11a5-439f-bace-c315e0ff1ae8';
  c_pdp_id constant text := 'aae22169-cef4-4495-842b-863a7caa71c2';
  c_old_description_md5 constant text := 'b413b9c23c5d01b0648e340be1c3230e';
  c_new_description_md5 constant text := '44b36c7d7d7b6a4662fb7183c930cd05';
  c_old_short_md5 constant text := 'c39e46bd0a06c831fad6a608aef973ea';
  c_new_short constant text := 'خصم 24٪ وتوصيل مجاني لكل المحافظات';
  c_old_cards_md5 constant text := '41f819bd74ab6e3a682284bb78cf8825';
  c_new_cards_md5 constant text := 'f06534a8d22d8d829f8abd4e9a1ce23e';
  c_product_copy_md5 constant text := '523744df04f3acb3e6983ddb422d3266';
  c_lead_def_name constant jsonb := '{"ar": "الريحة بسطر", "en": "The scent in one line"}';
  v_tenant_id uuid;
  v_pub_md5 text;
  v_draft jsonb;
  v_description text;
  v_short text;
  v_cards jsonb;
  v_new_cards jsonb;
  v_page_idx int;
  v_sec_idx int;
  v_copy jsonb;
  v_entry jsonb;
  v_story text;
  v_lead text;
  v_def_id uuid;
  v_has_lead boolean;
BEGIN
  SELECT id, store_config_v2_draft, md5(store_config_v2::text)
    INTO v_tenant_id, v_draft, v_pub_md5
    FROM public.tenants
   WHERE slug = c_slug
     FOR UPDATE;
  IF NOT FOUND OR v_draft IS NULL THEN
    RAISE NOTICE 'pdp redesign go-live: no tenant % with a draft, nothing written', c_slug;
    RETURN;
  END IF;

  SELECT description, short_description, feature_cards
    INTO v_description, v_short, v_cards
    FROM public.products
   WHERE id = c_product_id AND tenant_id = v_tenant_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE NOTICE 'pdp redesign go-live: no Wayfarer product for %, nothing written', c_slug;
    RETURN;
  END IF;

  SELECT (p.ord - 1)::int INTO v_page_idx
    FROM jsonb_array_elements(v_draft->'pages') WITH ORDINALITY AS p(page, ord)
   WHERE p.page->>'page_id' = 'product';
  IF v_page_idx IS NOT NULL THEN
    SELECT (s.ord - 1)::int INTO v_sec_idx
      FROM jsonb_array_elements(v_draft->'pages'->v_page_idx->'sections') WITH ORDINALITY AS s(sec, ord)
     WHERE s.sec->>'id' = c_pdp_id;
  END IF;
  IF v_page_idx IS NULL OR v_sec_idx IS NULL THEN
    RAISE NOTICE 'pdp redesign go-live: no draft pdp_direct_order %, nothing written', c_pdp_id;
    RETURN;
  END IF;
  v_copy := v_draft->'pages'->v_page_idx->'sections'->v_sec_idx->'base'->'scent_card'->'product_copy';

  SELECT EXISTS (
    SELECT 1
      FROM public.product_attribute_values v
      JOIN public.product_attribute_defs d ON d.id = v.attribute_def_id
     WHERE v.product_id = c_product_id AND d.tenant_id = v_tenant_id AND d.key = 'scent_lead'
  ) INTO v_has_lead;

  IF v_copy IS NULL
     AND md5(v_description) = c_new_description_md5
     AND md5(v_short) = md5(c_new_short)
     AND md5(v_cards::text) = c_new_cards_md5
     AND v_has_lead THEN
    RAISE NOTICE 'pdp redesign go-live: already applied, nothing written';
    RETURN;
  END IF;

  IF md5(v_copy::text) IS DISTINCT FROM c_product_copy_md5 THEN
    RAISE EXCEPTION 'pdp redesign go-live: draft scent_card.product_copy md5 is %, expected % (1c draft not applied, or edited)',
      md5(v_copy::text), c_product_copy_md5;
  END IF;
  IF md5(v_description) IS DISTINCT FROM c_old_description_md5 THEN
    RAISE EXCEPTION 'pdp redesign go-live: Wayfarer description md5 is %, expected % (edited since it was read)',
      md5(v_description), c_old_description_md5;
  END IF;
  IF md5(v_short) IS DISTINCT FROM c_old_short_md5 THEN
    RAISE EXCEPTION 'pdp redesign go-live: Wayfarer short_description md5 is %, expected % (edited since it was read)',
      md5(v_short), c_old_short_md5;
  END IF;
  IF md5(v_cards::text) IS DISTINCT FROM c_old_cards_md5 THEN
    RAISE EXCEPTION 'pdp redesign go-live: Wayfarer feature_cards md5 is %, expected % (edited since it was read)',
      md5(v_cards::text), c_old_cards_md5;
  END IF;
  IF v_has_lead THEN
    RAISE EXCEPTION 'pdp redesign go-live: Wayfarer already has a scent_lead value (set by the merchant?)';
  END IF;

  SELECT e INTO v_entry
    FROM jsonb_array_elements(v_copy) AS x(e)
   WHERE e->>'product_id' = c_product_id::text;
  v_story := v_entry->'story_i18n'->>'ar';
  v_lead := v_entry->'lead_i18n'->>'ar';
  IF md5(v_story) IS DISTINCT FROM c_new_description_md5 OR coalesce(btrim(v_lead), '') = '' THEN
    RAISE EXCEPTION 'pdp redesign go-live: product_copy has no approved story/lead for Wayfarer';
  END IF;

  -- d. the scent_lead definition and Wayfarer's value.
  INSERT INTO public.product_attribute_defs
    (tenant_id, key, name_i18n, kind, is_filterable, is_comparable, display_order)
  VALUES (v_tenant_id, 'scent_lead', c_lead_def_name, 'text', false, false, 7)
  ON CONFLICT (tenant_id, key) DO NOTHING;
  SELECT id INTO v_def_id
    FROM public.product_attribute_defs
   WHERE tenant_id = v_tenant_id AND key = 'scent_lead' AND kind = 'text';
  IF v_def_id IS NULL THEN
    RAISE EXCEPTION 'pdp redesign go-live: scent_lead exists with a kind other than text';
  END IF;
  INSERT INTO public.product_attribute_values (product_id, attribute_def_id, tenant_id, value)
  VALUES (c_product_id, v_def_id, v_tenant_id, jsonb_build_object('ar', v_lead));

  -- a-c. the product row.
  SELECT jsonb_agg(
           CASE x.ord
             WHEN 1 THEN jsonb_set(x.c, '{body}', to_jsonb(replace(x.c->>'body', 'هلعطر', 'هالعطر')))
             WHEN 3 THEN jsonb_set(x.c, '{body}', to_jsonb(replace(x.c->>'body', 'اللافندراللي', 'اللافندر اللي')))
             ELSE x.c
           END
           ORDER BY x.ord
         )
    INTO v_new_cards
    FROM jsonb_array_elements(v_cards) WITH ORDINALITY AS x(c, ord);
  IF md5(v_new_cards::text) <> c_new_cards_md5 THEN
    RAISE EXCEPTION 'pdp redesign go-live: fixed feature_cards md5 is %, expected %',
      md5(v_new_cards::text), c_new_cards_md5;
  END IF;

  UPDATE public.products
     SET description = v_story,
         short_description = c_new_short,
         feature_cards = v_new_cards,
         updated_at = now()
   WHERE id = c_product_id AND tenant_id = v_tenant_id;

  -- e. product_copy out of the draft.
  UPDATE public.tenants
     SET store_config_v2_draft = jsonb_set(
           v_draft,
           ARRAY['pages', v_page_idx::text, 'sections', v_sec_idx::text, 'base', 'scent_card'],
           (v_draft->'pages'->v_page_idx->'sections'->v_sec_idx->'base'->'scent_card') - 'product_copy'
         ),
         updated_at = now()
   WHERE id = v_tenant_id;

  IF (SELECT md5(store_config_v2::text) FROM public.tenants WHERE id = v_tenant_id) <> v_pub_md5 THEN
    RAISE EXCEPTION 'pdp redesign go-live: the published config changed during the write';
  END IF;

  RAISE NOTICE 'pdp redesign go-live: Wayfarer description, short description, note cards and scent_lead written; product_copy removed from the draft';
END
$golive$;
```

`44b36c7d…` is the md5 of the story text (= `WAYFER_SCENT_STORY_AR`); `f06534a8…` is the md5 of the feature cards with the two body fixes, both computed on PGlite (Step 3 proves them).

- [ ] **Step 2: Write the replay harness**

Create `${TMPDIR:-/tmp}/pdp-1c-pglite/harness-golive.mjs`:

```js
// Replays the publish-day go-live file against a local Postgres (PGlite)
// loaded with read-only copies of the live scheniders-iraq row and the
// Wayfarer product, after replaying the 1c draft migration on them.
// usage: node harness-golive.mjs <1c migration> <go-live file> <draft.json> <pub.json> <product.json>
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const [mig1c, goliveFile, draftPath, pubPath, productPath] = process.argv.slice(2);
const sql1c = readFileSync(mig1c, "utf8");
const golive = readFileSync(goliveFile, "utf8");
const draft = readFileSync(draftPath, "utf8");
const pub = readFileSync(pubPath, "utf8");
const product = JSON.parse(readFileSync(productPath, "utf8"));
const TENANT = "b5c4f2d4-834f-4af4-822d-9b9826a8f45a";

async function db({ withRows = true, apply1c = true, editDescription = false, editCopy = false, leadSet = false } = {}) {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE public.tenants (
      id uuid PRIMARY KEY, slug text UNIQUE NOT NULL, store_config_rev bigint NOT NULL DEFAULT 0,
      store_config_v2 jsonb, store_config_v2_draft jsonb, updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.products (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES public.tenants(id),
      description text, short_description text, feature_cards jsonb,
      updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.product_attribute_defs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, key text NOT NULL,
      name_i18n jsonb NOT NULL DEFAULT '{}'::jsonb, kind text NOT NULL, options jsonb, group_keys jsonb,
      range_min numeric, range_max numeric, unit_i18n jsonb,
      is_filterable boolean NOT NULL DEFAULT true, is_comparable boolean NOT NULL DEFAULT false,
      display_order smallint NOT NULL DEFAULT 0,
      CONSTRAINT product_attribute_defs_tenant_key_unique UNIQUE (tenant_id, key));
    CREATE TABLE public.product_attribute_values (
      product_id uuid NOT NULL, attribute_def_id uuid NOT NULL, tenant_id uuid NOT NULL,
      value jsonb NOT NULL, PRIMARY KEY (product_id, attribute_def_id));`);
  if (!withRows) return pg;
  await pg.query(
    `INSERT INTO public.tenants VALUES ($1, 'scheniders-iraq', 38, $2::jsonb, $3::jsonb, '2026-10-29T21:27:39Z')`,
    [TENANT, pub, draft],
  );
  await pg.query(
    `INSERT INTO public.products VALUES ($1, $2, $3, $4, $5::jsonb, '2026-10-01T00:00:00Z')`,
    [product.id, TENANT, editDescription ? product.description + " " : product.description,
     product.short_description, product.feature_cards],
  );
  if (apply1c) await pg.exec(sql1c);
  if (editCopy) {
    await pg.exec(`UPDATE public.tenants SET store_config_v2_draft = replace(store_config_v2_draft::text, 'ويظل عليك بالباتشولي', 'ويظل عليك')::jsonb`);
  }
  if (leadSet) {
    await pg.exec(`INSERT INTO public.product_attribute_defs (id, tenant_id, key, kind, display_order)
                   VALUES ('d0000000-0000-4000-8000-0000000000aa', '${TENANT}', 'scent_lead', 'text', 7);
                   INSERT INTO public.product_attribute_values VALUES
                   ('${product.id}', 'd0000000-0000-4000-8000-0000000000aa', '${TENANT}', '{"ar": "سطر التاجر"}');`);
  }
  return pg;
}

async function state(pg) {
  const r = await pg.query(`
    SELECT md5(p.description) AS desc_md5, p.short_description AS short, md5(p.feature_cards::text) AS cards_md5,
           (SELECT v.value->>'ar' FROM public.product_attribute_values v JOIN public.product_attribute_defs d ON d.id = v.attribute_def_id WHERE d.key = 'scent_lead') AS lead,
           (SELECT count(*) FROM public.product_attribute_defs WHERE key = 'scent_lead')::int AS lead_defs,
           (SELECT s.sec->'base'->'scent_card' ? 'product_copy' FROM jsonb_array_elements(t.store_config_v2_draft->'pages') pg(page), jsonb_array_elements(pg.page->'sections') s(sec)
             WHERE pg.page->>'page_id' = 'product' AND s.sec->>'id' = 'aae22169-cef4-4495-842b-863a7caa71c2') AS has_copy,
           md5(t.store_config_v2_draft::text) AS draft_md5, md5(t.store_config_v2::text) AS pub_md5
      FROM public.products p, public.tenants t`);
  return JSON.stringify(r.rows[0] ?? null);
}

async function run(label, pg) {
  const notices = [];
  try {
    await pg.exec(golive, { onNotice: (n) => n.message.startsWith("pdp redesign") && notices.push(n.message) });
    console.log(`${label}: ok`, JSON.stringify(notices));
  } catch (e) {
    console.log(`${label}: ERROR ${e.message}`);
  }
  console.log(`  state ${await state(pg)}`);
}

{
  const pg = await db();
  console.log(`before ${await state(pg)}`);
  await run("first run", pg);
  await run("second run", pg);
}
await run("merchant edited the description", await db({ editDescription: true }));
await run("product_copy edited in the draft", await db({ editCopy: true }));
await run("1c draft not applied", await db({ apply1c: false }));
await run("merchant already set a scent_lead", await db({ leadSet: true }));
await run("empty database", await db({ withRows: false }));
```

- [ ] **Step 3: Replay (1c applied → first run, second run; merchant edits; 1c missing; lead already set; empty database)**

```bash
node "${TMPDIR:-/tmp}/pdp-1c-pglite/harness-golive.mjs" "packages/supabase/migrations/${STAMP}_scheniders_iraq_pdp_redesign_1c_draft.sql" packages/supabase/go-live/scheniders-iraq-pdp-redesign.sql "${TMPDIR:-/tmp}/pdp-1c-pglite/draft.json" "${TMPDIR:-/tmp}/pdp-1c-pglite/pub.json" "${TMPDIR:-/tmp}/pdp-1c-pglite/product.json"
```
Expected (pre-run 2026-10-30; each `state` line is printed after its run):
```
before {"desc_md5":"b413b9c23c5d01b0648e340be1c3230e","short":"خصم 24٪ وتوصيل سريع لأول 100 زبون فقط","cards_md5":"41f819bd74ab6e3a682284bb78cf8825","lead":null,"lead_defs":0,"has_copy":true,"draft_md5":"e4800d7bb6f80f656cd848d3dbf469d9","pub_md5":"a6f87ba3181b0e94f41ba4a700de257b"}
first run: ok ["pdp redesign go-live: Wayfarer description, short description, note cards and scent_lead written; product_copy removed from the draft"]
  state {"desc_md5":"44b36c7d7d7b6a4662fb7183c930cd05","short":"خصم 24٪ وتوصيل مجاني لكل المحافظات","cards_md5":"f06534a8d22d8d829f8abd4e9a1ce23e","lead":"فاكهي بلمسة توابل: يبدي بالتوت والتفاح، ويظل عليك بالباتشولي","lead_defs":1,"has_copy":false,"draft_md5":"826e7694b9bfbbcad87d376dd9ef1ec8","pub_md5":"a6f87ba3181b0e94f41ba4a700de257b"}
second run: ok ["pdp redesign go-live: already applied, nothing written"]
  state {…same as after the first run…}
merchant edited the description: ERROR pdp redesign go-live: Wayfarer description md5 is 7b31cd3e03f8088fddec6cf44f6fea25, expected b413b9c23c5d01b0648e340be1c3230e (edited since it was read)
  state {"desc_md5":"7b31cd3e…","short":"خصم 24٪ وتوصيل سريع لأول 100 زبون فقط",…,"lead":null,"lead_defs":0,"has_copy":true,…}
product_copy edited in the draft: ERROR pdp redesign go-live: draft scent_card.product_copy md5 is f6dd48220fc13fd48219762ef79cd33a, expected 523744df04f3acb3e6983ddb422d3266 (1c draft not applied, or edited)
1c draft not applied: ERROR pdp redesign go-live: draft scent_card.product_copy md5 is <NULL>, expected 523744df04f3acb3e6983ddb422d3266 (1c draft not applied, or edited)
merchant already set a scent_lead: ERROR pdp redesign go-live: Wayfarer already has a scent_lead value (set by the merchant?)
empty database: ok ["pdp redesign go-live: no tenant scheniders-iraq with a draft, nothing written"]
  state null
```
Every abort leaves the product, the attribute tables and the draft as they were (the DO block is one transaction), and `pub_md5` never moves. This is §1.10's "the go-live file is run against a local copy with a changed description (aborts)". The `draft_md5` after go-live is only meaningful here: on publish day the draft will also carry 1d–1f.

- [ ] **Step 4: Live read-only guard check**

Create `tmp/pdp-1c/golive-check-1c.sql`:

```sql
-- Read-only: the go-live file's guard values on the live rows. Writes nothing.
SELECT
  md5(p.description) = 'b413b9c23c5d01b0648e340be1c3230e' AS description_ok,
  md5(p.short_description) = 'c39e46bd0a06c831fad6a608aef973ea' AS short_ok,
  md5(p.feature_cards::text) = '41f819bd74ab6e3a682284bb78cf8825' AS cards_ok,
  NOT EXISTS (
    SELECT 1 FROM public.product_attribute_values v
      JOIN public.product_attribute_defs d ON d.id = v.attribute_def_id
     WHERE v.product_id = p.id AND d.tenant_id = t.id AND d.key = 'scent_lead'
  ) AS no_lead_yet,
  (SELECT md5((s.sec->'base'->'scent_card'->'product_copy')::text)
     FROM jsonb_array_elements(t.store_config_v2_draft->'pages') pg(page),
          jsonb_array_elements(pg.page->'sections') s(sec)
    WHERE pg.page->>'page_id' = 'product'
      AND s.sec->>'id' = 'aae22169-cef4-4495-842b-863a7caa71c2') AS product_copy_md5
FROM public.tenants t
JOIN public.products p ON p.tenant_id = t.id AND p.id = '5e847790-11a5-439f-bace-c315e0ff1ae8'
WHERE t.slug = 'scheniders-iraq';
```
```bash
(cd packages && supabase db query --linked -f ../tmp/pdp-1c/golive-check-1c.sql -o csv)
```
Expected now (1c not applied yet):
```
description_ok,short_ok,cards_ok,no_lead_yet,product_copy_md5
true,true,true,true,NULL
```
After Task 9 the last column must read `523744df04f3acb3e6983ddb422d3266`.

- [ ] **Step 5: Commit the go-live file (not applied)**

```bash
git branch --show-current
git add packages/supabase/go-live/scheniders-iraq-pdp-redesign.sql
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "chore(db): publish-day go-live file for the PDP redesign (outside migrations/, not applied)" -m "Moves the approved Wayfarer story and lead from the draft's scent_card.product_copy into product data on publish day only (spec §1.9, D9); md5-guarded on every value it changes." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Redesign fixtures carry 1c; reviewed snapshot update

**Files:**
- Modify: `packages/sections/src/_pdp-redesign-fixtures.ts`
- Modify: `packages/sections/src/_pdp-redesign-snapshot.test.tsx`
- Modify: `packages/sections/src/__snapshots__/_pdp-redesign-snapshot.test.tsx.snap` (vitest `-u`, this file only)
- Scratch: `tmp/pdp-1c/snapcheck.mjs`

- [ ] **Step 1: Add the 1c patch to the fixtures**

In `packages/sections/src/_pdp-redesign-fixtures.ts`, replace:
```ts
/** The draft pdp_direct_order after slice 1b. */
export const IRAQ_REDESIGN_PDP_PROPS: PdpDirectOrderProps = {
  ...EXPRESS_IRAQ_DRAFT_PDP_PROPS,
  ...SLICE_1B_PDP_PATCH,
};
```
with:
```ts
/** Slice 1c: Wayfarer's lead line, for Ali's sign-off (to-do 10). */
export const WAYFER_SCENT_LEAD_AR = "فاكهي بلمسة توابل: يبدي بالتوت والتفاح، ويظل عليك بالباتشولي";

/** Slice 1c: the description rewrite (Q8), verbatim from the spec (§1.4). */
export const WAYFER_SCENT_STORY_AR = [
  "ملك العطور الجديد: ويفر انتنس",
  "",
  "شايف شعور من شخص يدخل لمناسبة أو يطب للدوام، وتشوف عطره طاغي ومميز؟ هذا بالضبط اللي راح تحس بيه ويا ويفر: أكثر عطر راح تنسأل عليه من ترشه، وأكثر عطر راح يجيبلك مديح.",
  "",
  "إحنا ما نبيعلك مجرد «ريحة حلوة». هذا العطر مصمم للرجل اللي يريد يترك «بصمة» بالمكان اللي يدخله، بثباته وفوحانه اللي يدخل قبلك للمكان ويظل وراك بعد ما تطلع. انسى العطور اللي تختفي ورا 10 دقايق.",
  "",
  "شراح تحس من ترشه؟",
  "أول رشة: التوت الفاخر والتفاح الأخضر. نكهة فاكهية ومنعشة تخطف الانتباه فوراً.",
  "القلب: الهيل واللافندر. رزانة وفخامة وهدوء مال رجل واثق من نفسه ويعرف شيريد.",
  "القاعدة: الباتشولي الساحر. الريحة اللي تتشبع بملابسك وتخلي الناس تنتبه على عطرك حتى بعد ما تطلع.",
  "",
  "أنت تستاهل تكون مميز. لا ترضى بالعادي.",
].join("\n");

/** Slice 1c: the keys the 1c draft migration merges into pdp_direct_order's base. */
export const SLICE_1C_PDP_PATCH = {
  scent_layout: "card",
  scent_card: {
    pyramid_key: "notes",
    chip_keys: ["season", "occasions"],
    note_key: "longevity_note",
    meter_keys: ["longevity", "sillage"],
    lead_key: "scent_lead",
    quote_terms: ["ثبات", "يثبت", "تفوح", "يفوح"],
    facts_source_i18n: { ar: "حسب تجربتنا", en: "Our own estimate" },
    quote_picks: [
      {
        product_id: "5e847790-11a5-439f-bace-c315e0ff1ae8",
        review_id: "6881921e-d263-4780-8878-762e01904146",
        text: "بخيت منه الصبح لسه الريحة تفوح",
      },
    ],
    product_copy: [
      {
        product_id: "5e847790-11a5-439f-bace-c315e0ff1ae8",
        lead_i18n: { ar: WAYFER_SCENT_LEAD_AR },
        story_i18n: { ar: WAYFER_SCENT_STORY_AR },
      },
    ],
  },
} satisfies Partial<PdpDirectOrderProps>;

/** The draft pdp_direct_order after slices 1b and 1c. */
export const IRAQ_REDESIGN_PDP_PROPS: PdpDirectOrderProps = {
  ...EXPRESS_IRAQ_DRAFT_PDP_PROPS,
  ...SLICE_1B_PDP_PATCH,
  ...SLICE_1C_PDP_PATCH,
};
```

- [ ] **Step 2: Extend the mirror test and the renders**

In `packages/sections/src/_pdp-redesign-snapshot.test.tsx`:

Replace:
```ts
import { scentProduct } from "./_pdp-scent-fixtures";
import {
  IRAQ_REDESIGN_PDP_PROPS,
  IRAQ_REDESIGN_TENANT,
  SLICE_1B_CONTACT_PATCH,
  SLICE_1B_PDP_PATCH,
} from "./_pdp-redesign-fixtures";
```
with:
```ts
import { scentProduct } from "./_pdp-scent-fixtures";
import { wayferProduct } from "./_pdp-wayfer-fixtures";
import {
  IRAQ_REDESIGN_PDP_PROPS,
  IRAQ_REDESIGN_TENANT,
  SLICE_1B_CONTACT_PATCH,
  SLICE_1B_PDP_PATCH,
  SLICE_1C_PDP_PATCH,
} from "./_pdp-redesign-fixtures";
```

Replace:
```ts
  it("slice 1b commerce.contact patch", () => {
    expect(migrationJson(sql, "contact_patch")).toEqual(SLICE_1B_CONTACT_PATCH);
  });
```
with:
```ts
  it("slice 1b commerce.contact patch", () => {
    expect(migrationJson(sql, "contact_patch")).toEqual(SLICE_1B_CONTACT_PATCH);
  });

  it("slice 1c pdp_direct_order patch", () => {
    const sql1c = migrationSql("scheniders_iraq_pdp_redesign_1c_draft");
    expect(migrationJson(sql1c, "pdp_patch")).toEqual(SLICE_1C_PDP_PATCH);
  });
```

Replace:
```ts
    ["scent attributes", scentProduct],
  ];
```
with:
```ts
    ["scent attributes", scentProduct],
    ["Wayfarer, live data", wayferProduct],
  ];
```

Replace:
```ts
    const dirs = (html: string) => html.split('dir="').length - 1;
    expect(dirs(render(product))).toBe(dirs(before));
```
with:
```ts
    const dirs = (html: string) => html.split('dir="').length - 1;
    // Card mode (1c) drops the description block's one dir="auto"
    // paragraph and adds none.
    expect(dirs(render(product))).toBe(dirs(before) - 1);
```

- [ ] **Step 3: Run it in CI mode to see exactly what changes**

```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-redesign-snapshot.test.tsx
```
Expected: `Snapshots  6 failed`, `Tests  6 failed | 7 passed (13)`. The 6 are the snapshot renders: 4 mismatched (the existing ar/en × saleProduct/scentProduct) and 2 missing (Wayfarer ar/en). The 1c mirror test, the schema test and the three `dir` tests pass.

- [ ] **Step 4: Write the snapshot check (before updating)**

Create `tmp/pdp-1c/snapcheck.mjs`:

```js
// The 1c snapshot update, checked: each render that existed before is
// byte-identical up to and including </form> (buy box + promise band), and
// everything after </form> is now the one scent card, which ends the page
// body. Run from the repo root.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const f = "packages/sections/src/__snapshots__/_pdp-redesign-snapshot.test.tsx.snap";
const parse = (s) =>
  Object.fromEntries([...s.matchAll(/exports\[`([^`]+)`\] = `\n"([\s\S]*?)"\n`;/g)].map((m) => [m[1], m[2]]));
const before = parse(execFileSync("git", ["show", `HEAD:${f}`], { encoding: "utf8" }));
const after = parse(readFileSync(f, "utf8"));
for (const key of Object.keys(before)) {
  const a = before[key];
  const b = after[key];
  const cut = a.indexOf("</form>") + "</form>".length;
  const rest = b.slice(cut);
  console.log(
    `${key.split(" > ")[1]}: head ${a.slice(0, cut) === b.slice(0, cut)}, ` +
      `rest is the card ${rest.startsWith("<section data-scent-card") && rest.endsWith("</dialog></div></section></div></section>")}, ` +
      `old blocks gone ${!/data-layer="(scent-journey|note-row)"|عن العطر/.test(b)}`,
  );
}
console.log(`new: ${Object.keys(after).filter((k) => !(k in before)).map((k) => k.split(" > ")[1]).join(" | ")}`);
```

- [ ] **Step 5: Update this one snapshot file (the only `-u` in the slice)**

```bash
pnpm exec vitest run packages/sections/src/_pdp-redesign-snapshot.test.tsx -u
git diff --stat -- packages/sections/src/__snapshots__
node tmp/pdp-1c/snapcheck.mjs
```
Expected:
- `Snapshots  2 written` and `Tests  13 passed (13)` (vitest 2 counts only the new Wayfarer snapshots in that line; the 4 rewritten ones show in the diff), then a diff stat of exactly one file, `_pdp-redesign-snapshot.test.tsx.snap | 100 +++++++++-` (`92 insertions(+), 8 deletions(-)`);
- `snapcheck.mjs` prints:
```
ar, discounted, multi-image, reviewed 1: head true, rest is the card true, old blocks gone true
ar, scent attributes 1: head true, rest is the card true, old blocks gone true
en, discounted, multi-image, reviewed 1: head true, rest is the card true, old blocks gone true
en, scent attributes 1: head true, rest is the card true, old blocks gone true
new: ar, Wayfarer, live data 1 | en, Wayfarer, live data 1
```
Any `false` means the update changed more than the scent area: stop and fix the code, do not commit the snapshot.

- [ ] **Step 6: Read the snapshot for what 1c meant to change**

```bash
f=packages/sections/src/__snapshots__/_pdp-redesign-snapshot.test.tsx.snap
for k in data-scent-card data-promise-band 'data-layer="scent-journey"' 'data-layer="note-row"' 'عن العطر' data-note-photo data-note-chip data-scent-quote 'data-scent-rating="text"' data-scent-facts 'data-meter=' 'بخيت منه الصبح لسه الريحة تفوح' 'لاول 100 زبون'; do printf '%s: ' "$k"; grep -o -- "$k" $f | wc -l | tr -d ' '; done
```
Expected, one count per line in this order: `6 6 0 0 0 14 12 2 6 2 2 2 0`. That is:
- the card and the band in all 6 renders, the old blocks in none;
- 14 note photos (Wayfarer 5 × 2 + the scent fixture's 2 × 2) and 12 text chips (scent fixture 6 × 2);
- the quote only for Wayfarer (ar + en: the fixtures without reviews show none), and it is Ali's pick;
- the rating as text in all 6 (no `#reviews-summary` until 1e);
- the facts block and one meter only for the scent fixture (ar + en); Wayfarer has none;
- «لاول 100 زبون» nowhere: the old description no longer renders in card mode.

- [ ] **Step 7: Deterministic in CI mode, and the whole sections suite**

```bash
CI=true pnpm exec vitest run packages/sections/src
```
Expected: `Test Files  119 passed (119)`, `Tests  1279 passed (1279)`.

- [ ] **Step 8: Commit (its own, reviewed snapshot commit)**

```bash
git branch --show-current
git add packages/sections/src/_pdp-redesign-fixtures.ts packages/sections/src/_pdp-redesign-snapshot.test.tsx packages/sections/src/__snapshots__/_pdp-redesign-snapshot.test.tsx.snap
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "test(sections): redesign fixtures mirror the 1c draft migration; redesign snapshot now renders the scent card" -m "Reviewed snapshot update: every 1b render is byte-identical through </form> (buy box + promise band); after </form> it is the scent card alone. Two Wayfarer renders added. 1a baselines unchanged." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Slice verification gate, PR, merge, deploy

No new code. If a step fails, fix the root cause in the task that owns the file, commit that fix, and re-run this whole task.

- [ ] **Step 1: No §1.0 baseline changed; the only snapshot change is the redesign one**

```bash
git diff --stat origin/main HEAD -- packages/sections/src/__snapshots__
git status --porcelain packages/sections/src/__snapshots__
```
Expected: exactly one file, `_pdp-redesign-snapshot.test.tsx.snap`; the status prints nothing.

- [ ] **Step 2: Every baseline, unchanged, in CI mode**

```bash
CI=true pnpm exec vitest run packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_pdp-classic-snapshot.test.tsx packages/sections/src/_pdp-lower-baseline-snapshot.test.tsx packages/sections/src/_pdp-scent-baseline-snapshot.test.tsx packages/sections/src/_image-gallery-baseline-snapshot.test.tsx packages/sections/src/_product-reviews-baseline-snapshot.test.tsx packages/sections/src/_product-grid-baseline-snapshot.test.tsx packages/sections/src/_chrome-baseline-snapshot.test.tsx packages/sections/src/_order-confirmation-baseline-snapshot.test.tsx packages/sections/src/_site-footer-baseline-snapshot.test.tsx packages/sections/src/_sticky-cta-baseline-snapshot.test.tsx packages/sections/src/_primitives-baseline-snapshot.test.tsx
```
Expected: `Test Files  12 passed (12)`, `Tests  131 passed (131)`, with no `written`, `updated` or `obsolete` line.

- [ ] **Step 3: The full suites**

```bash
CI=true pnpm exec vitest run packages/sections/src packages/shared/src apps/storefront/lib
```
Expected: `Test Files  189 passed (189)`, `Tests  2264 passed (2264)`: Task 0's 186 / 2218 plus 3 files and 46 tests (props 7, scent-card 23, block 12, redesign snapshot +4).

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
Expected: `Tasks:    2 successful, 2 total`. Platform reports `0 errors`.

- [ ] **Step 6: Hygiene greps on this slice's source files**

```bash
grep -nE ":\s*any\b|<any>|\bas any\b|@ts-ignore|eslint-disable|#[0-9a-fA-F]{3,6}\b|rgba?\(|\sdir=" packages/sections/src/pdp_express/scent-card.ts packages/sections/src/pdp_express/scent-card-block.tsx packages/sections/src/_pdp-wayfer-fixtures.ts
grep -nE "[A-Za-z_)\]]!\.|[A-Za-z_)\]]!;|[A-Za-z_)\]]!\)" packages/sections/src/pdp_express/scent-card.ts packages/sections/src/pdp_express/scent-card-block.tsx packages/sections/src/pdp_express/express-view.tsx packages/sections/src/_pdp-wayfer-fixtures.ts packages/sections/src/_pdp-redesign-fixtures.ts
git diff origin/main HEAD -- packages/sections/src ':!packages/sections/src/__snapshots__' ':!*.test.ts' ':!*.test.tsx' | grep -E '^\+.*(eslint-disable|ts-ignore|\bany\b|dir=|#[0-9a-fA-F]{6})'
grep -nE "bg-bk-primary|text-bk-primary" packages/sections/src/pdp_express/scent-card-block.tsx
```
Expected: all four print nothing.

- [ ] **Step 7: Push and open the PR**

```bash
git branch --show-current
git status --porcelain
git log --oneline origin/main..HEAD
git push -u origin feat/pdp-p1c-scent-card
```
Expected: the branch is `feat/pdp-p1c-scent-card`; only the two untracked storefront notes; 7 commits, from "scent_layout + scent_card props" to "redesign fixtures mirror the 1c draft migration".

```bash
gh pr create --base main --head feat/pdp-p1c-scent-card --title "PDP redesign 1c: «بصمة العطر» scent card, draft migration + go-live file (neither applied)" --body "Slice 1c of docs/superpowers/specs/2026-10-27-pdp-lower-page-redesign-design.md (§1.4, §1.9).

- New opt-in pdp_direct_order props scent_layout + scent_card. With them absent every 1a baseline is byte-identical.
- One scent card replaces «عن العطر», «رحلة العطر» and the note cards: lead line, always-open pyramid with the 5 note photos (whole-word pairing, none repeated), facts only from entered data, one verbatim customer quote (merchant pick, verified against the review at render), «قصة العطر» in a BottomSheet.
- Draft migration for scheniders-iraq (draft only, md5 + rev guarded, idempotent). NOT applied: applied after this PR is deployed.
- packages/supabase/go-live/scheniders-iraq-pdp-redesign.sql: the publish-day move of the approved story/lead into product data (D9). Outside migrations/, never applied by this PR.
- Reviewed redesign-snapshot update in its own commit (buy box + band byte-identical; the scent area is now the card).

Tests: sections + shared + storefront lib 189 files / 2264 tests; type-check and lint green.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 8: Merge once CI is green, then wait for production**

```bash
gh pr checks --watch
gh pr merge --merge
```
Merge as gga2000 (Vercel builds only gga2000 commits). Then confirm the production deployment of the merge commit is READY and that the production domain serves it (a Vercel rollback pins production): Vercel MCP `list_deployments` for the storefront project, or the dashboard.

---

### Task 9: Apply the 1c draft migration (after the code is live)

Only after Task 8 Step 8 shows the merge commit live in production. Until then the draft must not carry `scent_layout`: a builder save on old code could drop it.

- [ ] **Step 1: Re-check the guards and the timestamp order**

```bash
git switch feat/pdp-p1c-scent-card && git pull --ff-only origin main
(cd packages && supabase db query --linked "SELECT store_config_rev, md5(store_config_v2_draft::text) AS draft_md5, md5(store_config_v2::text) AS pub_md5 FROM tenants WHERE slug='scheniders-iraq'" -o csv)
ls packages/supabase/migrations | grep -E '^[0-9]{14}_' | sort | tail -2
```
Expected:
- `38,9cd2543a6126057d423f66ff9297cf76,a6f87ba3181b0e94f41ba4a700de257b`;
- the last file listed is `<STAMP>_scheniders_iraq_pdp_redesign_1c_draft.sql`.

If the md5 or rev moved, stop and redo Task 5 Steps 2–6 in a follow-up PR (and Task 6's `product_copy` md5 only if `product_copy` itself changed). If a later-stamped migration reached main first, re-stamp with `git mv` to the current UTC time in a follow-up PR; the mirror test finds the file by suffix.

- [ ] **Step 2: Dry run again**

```bash
(cd packages && supabase db query --linked -f ../tmp/pdp-1c/dryrun-1c.sql -o csv)
```
Expected: `true,true,e4800d7bb6f80f656cd848d3dbf469d9,523744df04f3acb3e6983ddb422d3266`.

- [ ] **Step 3: Apply**

```bash
F=$(ls packages/supabase/migrations/*_scheniders_iraq_pdp_redesign_1c_draft.sql); echo "$F"
(cd packages && supabase db query --linked -f "../$F")
```
Expected: exit 0, no rows. On `draft md5 is …` or `store_config_rev is …`, nothing was written: go back to Step 1.

- [ ] **Step 4: Record it**

```bash
V=$(basename "$F" | cut -c1-14); echo "$V"
(cd packages && supabase migration repair --status applied "$V")
(cd packages && supabase db query --linked "SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '$V'" -o csv)
```
Expected: one row, `<V>,scheniders_iraq_pdp_redesign_1c_draft`.

- [ ] **Step 5: Re-read and diff against the intended result**

```bash
(cd packages && supabase db query --linked "SELECT store_config_rev, md5(store_config_v2_draft::text) AS draft_md5, md5(store_config_v2::text) AS pub_md5, updated_at > now() - interval '1 hour' AS bumped FROM tenants WHERE slug='scheniders-iraq'" -o csv)
(cd packages && supabase db query --linked -f ../tmp/pdp-1c/golive-check-1c.sql -o csv)
(cd packages && supabase db query --linked "SELECT md5(description) FROM products WHERE id='5e847790-11a5-439f-bace-c315e0ff1ae8'" -o csv)
```
Expected:
- `38,e4800d7bb6f80f656cd848d3dbf469d9,a6f87ba3181b0e94f41ba4a700de257b,true` (the draft equals the dry run's target; published unchanged);
- `true,true,true,true,523744df04f3acb3e6983ddb422d3266` (the go-live guards now all hold);
- `b413b9c23c5d01b0648e340be1c3230e` (no product row was written).

- [ ] **Step 6: Clean up**

```bash
rm -rf "${TMPDIR:-/tmp}/pdp-1c-pglite"
```
Keep `tmp/pdp-1c/golive-check-1c.sql` for publish day (it is gitignored; it is reproduced in Task 6 Step 4). Delete `dryrun-1c.sql` and `snapcheck.mjs` after Task 10.

---

### Task 10: Draft-view checks at 390px (after Task 9)

- [ ] **Step 1: Open draft view**

The storefront dev server already runs from this worktree on :3001 (if not: copy `/Users/ali/scheniders-mono/apps/storefront/.env.local` into `apps/storefront/` and `pnpm dev:storefront`; delete the copy afterwards). Draft-view link:
```
http://localhost:3001/api/draft-view?tenant=scheniders-iraq&token=dev-preview-token&to=/s/scheniders-iraq/products/%D9%88%D9%8A%D9%81%D8%B1
```
Quick markup check first:
```bash
curl -s -c /tmp/pdp1c.cj -L "http://localhost:3001/api/draft-view?tenant=scheniders-iraq&token=dev-preview-token&to=/s/scheniders-iraq/products/%D9%88%D9%8A%D9%81%D8%B1" -o /tmp/pdp1c.html
for k in data-scent-card data-promise-band 'data-layer="scent-journey"' 'data-layer="note-row"' 'عن العطر' data-note-photo data-scent-quote data-scent-facts; do printf '%s: ' "$k"; grep -o -- "$k" /tmp/pdp1c.html | wc -l | tr -d ' '; done
```
Expected: `1 1 0 0 0 5 1 0`.

- [ ] **Step 2: Capture at 390×844 and 360×780**

Use the `agent-browser` skill, or the Playwright MCP; if the MCP is wedged, the curl check above is the fallback. Capture:
- the band, then directly the scent card (no other block between them), then the TikTok gallery;
- header: «بصمة العطر» + «رجالي»; the lead line at 17px/800;
- the pyramid: 3 tiers, 5 different round 60px photos, names under them, no text chip;
- no facts block and no empty slot;
- «الثبات، بكلام زبون» with «بخيت منه الصبح لسه الريحة تفوح», «س» monogram, «eng. سيف» reading correctly (not «سيف .eng»), 5 stars;
- footer: ★ 4.7 · «6 تقييمات» as text, and «قصة العطر»;
- tap «قصة العطر»: the sheet rises (no motion with reduced motion), shows the rewrite and the 5 cards without emoji; Escape, the backdrop and the close button each close it and focus returns to «قصة العطر».

Check: no horizontal scroll; the «قصة العطر» trigger and the rating row are ≥44px tall; `document.querySelectorAll('[data-scent-card] [dir]').length === 0`.

- [ ] **Step 3: The published page is untouched**

```bash
curl -s "http://localhost:3001/s/scheniders-iraq/products/%D9%88%D9%8A%D9%81%D8%B1" | grep -c "data-scent-card"
```
Expected: `0`.

- [ ] **Step 4: Hand-offs**

- Tell the 1e plan author: writing `identity_rating: "summary_link"` also turns the scent card's rating into the `#reviews-summary` link.
- Tell the Phase 2 plan author: once سيف's review carries `highlight_quote` + the `longevity` tag, remove `scent_card.quote_picks` from the draft.
- The go-live file stays in `packages/supabase/go-live/` until publish day (gate: Phases 1–2 and to-dos 1, 2, 4, 5, 10, 13). On that day: Task 6 Step 4 check → copy into `migrations/` with a fresh UTC stamp → apply → `migration repair` → delete the go-live copy in the same commit → Ali publishes.

---

## Self-review

**1. Spec coverage**

| Spec item | Task |
|---|---|
| §1.4 replaces «عن العطر», «رحلة العطر», note cards; inside `pdp_direct_order` directly under the band | Task 4 (test: band before card, `</form>` before card, old blocks absent) |
| §1.4 layout 1–6 (header + gender, lead 17/800, always-open pyramid with stage + hint, 60px round photos, text chips, facts with meters «{value} من {max}» + source tag + season/occasion chips + `longevity_note`, «الثبات، بكلام زبون» bubble with monogram + `<bdi>` name + stars, footer rating + «قصة العطر» BottomSheet) | Tasks 3, 4 |
| §1.4 sources: lead (`product_copy` → `lead_key`), pyramid (`notes` via `buildScentJourney`), photos (`hasWholeWords`, emoji stripped, each used once), meters (range only with value), chips (`chipRowOf` via the journey), note line, customer clause (rule + Ali's pick), story (`product_copy` → description) + cards without emoji | Task 3 (Scope decisions 2, 7) |
| §1.4 `buildScentJourney` unchanged; meters drawn only in the card | Task 3 (journey test + scent baseline green in Task 2) |
| §1.4 props `scent_layout`, `scent_card` (+ `product_copy` `.catch`) | Task 1 (+ `quote_picks`, Scope decision 2) |
| §1.4 null only with no stages, facts, lead or story; description-only → minimal header + sheet | Task 3 ("no … → null"), Task 4 (saleProduct render) |
| §1.4 strings `scentEyebrow`, `stayInCustomerWords`, `scentStory`, `meterValue`, `closeSheet` (ar/en/ku) | Task 2 |
| §1.4 draft content (keys, quote terms, «حسب تجربتنا», lead + story verbatim, no product row before publish day) | Task 5 (+ quote pick); Task 9 Step 5 proves no product write |
| §1.9 draft migration guards 1–3, rollback header, re-read after apply | Tasks 5, 9 |
| §1.9 go-live file: location, copy-on-the-day procedure, description, short_description, card typos, `scent_lead` def + value, `product_copy` removed from the draft, md5 guards, published untouched | Task 6 (Scope decision 9), Task 10 Step 4 |
| §1.10 scent-card unit cases (pairing 5/5, emoji, copy precedence, no-data null, meters only with values, quote = مصطفى علي's by rule) | Task 3 |
| §1.10 data migrations: twice, changed md5, empty DB; go-live with changed description aborts | Tasks 5, 6 |
| §1.10 baselines unchanged; `_pdp-redesign-snapshot` from `_pdp-redesign-fixtures.ts` | Tasks 4, 7, 8 |
| §1.10 no hardcoded colour; no `dir`; 390px checks; published page unchanged | `_no-hardcoded-white` scans every new file; Tasks 4, 8, 10 |
| D4 colour lock in the card | Task 4 test + Task 8 Step 6 grep |
| D9 one home per text after publish day | Task 6 |

**2. Placeholder scan.** `STAMP` (Task 5 Step 1) and `V` (Task 9 Step 4) are produced at run time, as in 1b. Every code step has complete code, pre-run in a throwaway copy of `origin/main` (ab84ac58): every expected output above is from that run, except the PR/merge/apply/browser steps, which touch shared state.

**3. Type consistency.**
- `ScentCardConfig = NonNullable<Props["scent_card"]>` (Task 3) is the shape Task 1 defines; `buildScentCard({ product, config, locale, description })` returns `ScentCardData | null`, which `ScentCardBlock({ card, product, locale, reviewCount, avgRating, ratingLink })` draws (Task 4).
- `STAGE_HINT` (Task 2) is imported by `scent-journey-block.tsx` and `scent-card.ts`.
- `monogramOf` / `stripLeadingEmoji` are defined and tested in Task 3 and used in Task 4.
- `SLICE_1C_PDP_PATCH`, `WAYFER_SCENT_LEAD_AR`, `WAYFER_SCENT_STORY_AR` (Task 7) equal the migration's `pdp_patch` block (mirror test); the go-live md5 `44b36c7d…` is the md5 of `WAYFER_SCENT_STORY_AR`, and `523744df…` the md5 of the `product_copy` the migration writes.
