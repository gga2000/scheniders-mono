# Store Builder Editor — UX Improvement Plan (2026-07-02)

Companion to [STORE_BUILDER_UX_AUDIT_2026-07-02.md](STORE_BUILDER_UX_AUDIT_2026-07-02.md). Finding IDs (`UX-*`, prior-audit `[X]`) reference that report.

**Owner's north star:** a first-time, non-technical, Arabic-speaking Iraqi merchant opens `/store/edit` and feels *"I can do this"* — via (1) fear/cognitive-load reduction and (2) a Simple ⇄ Advanced mode system where rarely-used controls (per-field EN/KU translations, breakpoint overrides, variants, logic fields) are tucked away until summoned, without removing power.

---

## 1 · North-star UX principles

1. **Simple by default, powerful on demand.** New accounts open in Simple mode. Nothing is removed — only deferred. Advanced is one click away, always.
2. **Never show a scared user a control she doesn't need yet.** Every control must justify its presence in Simple mode by frequency × value for a first-week merchant.
3. **Arabic-first, trilingual chrome, LTR always.** Every visible editor string resolves through `editor-i18n` with ar/en/ku; layout never flips (`<html lang>` only, per project rule). Arabic is what Fatima reads at every decision point.
4. **One language at a time.** Editing happens in the active locale. Other locales are a deliberate, discoverable side-quest ("الترجمات ＋"), not a permanent tax on every field.
5. **The wizard's voice is the editor's voice.** The warm, reassuring, dialect-aware tone of onboarding (`يمكنك تغيير كل شيء لاحقاً`) must continue into banners, empty states, help text, and the publish flow.
6. **Celebrate the wins, soften the warnings.** First edit, first save, first publish are emotional peaks — design them (peak-end rule). Warnings speak plain Arabic about consequences, never jargon, and never contradict themselves (UX-08).
7. **Fix what's visibly broken before adding anything.** An invisible primary button (UX-01) or a crashed-looking Style tab (UX-02) undoes any amount of onboarding polish.
8. **Extend existing machinery; don't invent parallel systems.** Mode = a filter over `getFieldGroup` + existing accordions + the shipped "متقدم" pattern + `use-user-preferences` persistence. No new state library, no schema changes.

---

## 2 · The Simple ⇄ Advanced mode system (centerpiece)

### 2.1 Model

```ts
// packages/shared/src/types/editor-mode.ts (new, ~10 LOC)
export type EditorMode = "simple" | "advanced";
```

- **A view preference, not data.** Zero changes to `StoreConfigV2` / section props / DB schema. Anything authored in Advanced (variants, overrides, EN/KU strings) keeps rendering on the storefront while hidden in Simple — mode only filters *editing affordances*.
- **Persistence:** `PREFERENCE_KEYS.EDITOR_MODE` in `apps/platform/hooks/use-user-preferences.ts:124` (same user-scoped localStorage pattern as `ORDER_PIPELINE`; immediate persist). Per-user, not per-tenant — Karim the agency freelancer stays in Advanced across client stores.
- **Default:** `simple` when no preference exists. First-run tenants (existing `isFirstTimeTenant`, editor-shell.tsx:250–254) are always defaulted to Simple.
- **Distribution:** a `EditorModeContext` (mirror of `lib/editor-locale-context.tsx` — provider in editor-shell, `useEditorMode()` hook). Threading via context, not prop-drilling, so the 2019-LOC shell barely changes.

### 2.2 The toggle

- **Location:** toolbar middle cluster, immediately left of the locale select (editor-shell.tsx:1464–1535) — visible, but not competing with Publish. Mobile shell: inside the More drawer (mobile-editor-shell.tsx:423–502).
- **Form:** a two-segment control reusing the BreakpointToggle visual pattern (toolbar-controls.tsx:25–40):

```
┌────────────────────┐
│ ● بسيط │ متقدّم    │      Simple ▸ label: بسيط / Simple / سادە
└────────────────────┘      Advanced ▸ label: متقدّم / Advanced / پێشکەوتوو
```

- **Labels (editor-i18n keys `mode.simple` / `mode.advanced`):** ar **بسيط / متقدّم**, en Simple / Advanced, ku سادە / پێشکەوتوو. (Reuses the same word the page tree already uses for its accordion — one vocabulary.)
- **First-timer introduction:** the first time a user *switches* to Advanced, show a one-time dismissible popover (persisted like the first-run banner, editor-shell.tsx:1871 pattern): *"الوضع المتقدّم يعرض كل الخيارات: الترجمات، النسخ، تخصيص لكل جهاز. تكدر ترجع لـ«بسيط» بأي وقت."* No tour, no modal wall.
- **Switching is instant and lossless** — pure re-render; nothing saved/discarded.
- **Escape hatches in Simple:** wherever Simple hides something that has *live data*, show a quiet count chip instead of nothing — e.g. section panel footer: `نسختان مفعّلتان · افتح المتقدّم` (2 active variants · open Advanced). Rule: **hidden ≠ silent when it affects the live store.** This is how Karim's work never gets orphaned and Fatima never gets ambushed by invisible behavior.

### 2.3 What each mode shows

Full inventory in the audit (§ Simple vs Advanced control inventory). Operative summary:

| Surface | Simple | Advanced |
|---|---|---|
| Toolbar | back/name, mode toggle, locale, **mobile+desktop** breakpoints, undo/redo, save pill, one معاينة button, Publish | + tablet breakpoint, preview-as, i18n pill, Open-as-separate |
| Page tree | pages groups, هوية العلامة, الصحة | + اللغات, صفحات مخصّصة, متقدم accordion (13 screens) |
| Inspector tabs | العناصر (Blocks), الهوية (Style→full-screen brand kit), الجاهزية (Health) | + SEO tab |
| Section row | drag, expand, eye, duplicate, delete | + save-as-preset |
| Section panel | Essentials fields (open) + Style fields (collapsed accordion) + reset | + instance label, layers strip (when non-empty), Logic group, visibility rules, variants, breakpoint adornments |
| Every i18n field | **active-locale input only** + "الترجمات ＋" reveal | same tuck, opt-in expand (see 2.4) |
| Brand kit | identity, colors (+future presets), fonts | + shape/motion/voice/scale detail cards |

### 2.4 The translation tuck-away (owner's core ask)

**Current:** `i18n-string-input.tsx` renders locale tabs (145–177) + primary input (180–226) + secondary inputs auto-expanded whenever the locale has content (77–79, 228–305). Seeded stores therefore show AR + EN inputs on *every* field forever (UX-05, UX-13).

**Target behavior (both modes — Advanced is identical, just co-existing with adornments):**

```
SIMPLE MODE — field "العنوان" (title), active locale = ar
┌───────────────────────────────────────────────┐
│ العنوان                                        │   ← localized label (2.6)
│ ┌───────────────────────────────────────────┐ │
│ │ تشكيلة فاطمة الجديدة                       │ │   ← active locale ONLY
│ └───────────────────────────────────────────┘ │
│                         الترجمات (EN ✓ · KU –) ＋│   ← quiet reveal, shows fill state
└───────────────────────────────────────────────┘

after clicking الترجمات ＋ (per-field expand):
┌───────────────────────────────────────────────┐
│ العنوان                                        │
│ │ تشكيلة فاطمة الجديدة                       │ │
│ ├─ EN  The new collection has arrived      ×─┤ │   ← compact secondary rows
│ ├─ KU  (فارغ — يُعرض بالعربية)         نسخ من AR │ │   ← empty state + copy-from action
│                                    إخفاء الترجمات │
└───────────────────────────────────────────────┘
```

Rules:
1. Kill the auto-expand-when-content condition (i18n-string-input.tsx:77–79) → replace with explicit per-field `translationsOpen` state, default **collapsed always** (content presence shown by the ✓/– chips instead).
2. The reveal label is localized (`i18n_input.translations`), shows per-locale fill state at a glance, and honors `enabled_locales` when [I2]/[I3] land (only show enabled target locales).
3. "نسخ من AR" copy-from-active action per empty locale row (starts [I1]'s cheapest win).
4. Locale *tabs* on the field disappear entirely in Simple (the top-toolbar locale select already switches the whole editing surface); in Advanced the tabs also go — the stacked reveal replaces tab-switching per field (one interaction model, not two).
5. `multiline` variant identical, textarea rows.

**Result:** one field = label + one input (+one link line). Down from 6 elements to 3 — measured on the hero panel: ~30 visible controls → ~10 in Simple.

### 2.5 Mapping onto existing machinery (extend, don't rewrite)

The mode filter is three small, testable changes:

1. **`getFieldVisibility()` — new thin layer over `getFieldGroup`** in `apps/platform/lib/section-field-groups.ts` (~30 LOC):
```ts
export function isFieldVisible(mode: EditorMode, sectionType: string, fieldPath: string): boolean {
    if (mode === "advanced") return true;
    return getFieldGroup(sectionType, fieldPath) !== "logic";   // simple = essential + style
}
```
   Convention-driven default with an override map (`SIMPLE_OVERRIDES: Record<sectionType, {show?: string[]; hide?: string[]}>`) for the handful of sections where the name-convention misclassifies (audit inventory seeds this list).
2. **AutoForm** (`auto-form.tsx`): accept `mode` from `useEditorMode()`;
   - `GroupedFormRenderer` (250–305): skip fields failing `isFieldVisible`; in Simple, don't render the Logic accordion at all;
   - breakpoint adornment gate (117–128, 563–589): render only when `mode === "advanced"` (and, later, on field hover/focus rather than permanently);
   - the per-agent AutoForm map confirmed these are clean hook points — no walker rewrite needed.
3. **Conditional chrome:** `section-edit-panel.tsx` (visibility block 351–413, variants 418–425, layers 309–317, instance label 254–272), `inspector-rail.tsx` (SEO tab 195), `page-tree.tsx` (اللغات 159–163, custom pages 389–483, متقدم 166–180), `editor-shell.tsx` toolbar cluster (1464–1535) — each wraps in `mode === "advanced"` (+ the live-data count chips from 2.2).

**No refactor prerequisite.** Editor-shell decomposition (Phase 4) makes this *nicer*, not *possible*.

### 2.6 Field labels & help (prerequisite for Simple mode feeling native)

Simple mode with English labels is not Simple. Two-part fix:
- **Label/help channel:** add an optional per-section field-meta map colocated with the grouping conventions: `lib/section-field-meta.ts` → `{ [sectionType]: { [fieldKey]: { label: EditorString; help?: EditorString } } }` + a generic fallback dictionary for the ~40 recurring keys (title, subtitle, cta_label, image_url, eyebrow → «سطر تمهيدي», …). `FieldHeader` (auto-form.tsx:767–782) resolves: meta.label → generic dict → current auto-humanized key. Help renders as muted text under the label ([C10]).
- Renaming only — schema keys/data untouched.

### 2.7 Inspector mockups

```
SIMPLE — hero panel                        ADVANCED — hero panel
┌─ Image hero ──────────── 👁 ⋯ ┐          ┌─ Image hero ─────────────── 👁 ⋯ ┐
│ ▸ الأساسيات (مفتوح)            │          │ اسم العنصر [____________]        │
│   العنوان                      │          │ مفعّل [on]  الطبقات: (عند وجودها) │
│   [تشكيلة فاطمة الجديدة   ]    │          │ ▸ الأساسيات                       │
│   الترجمات (EN ✓ · KU –) ＋    │          │   العنوان        📱💻(hover)      │
│   الوصف                        │          │   [........................]      │
│   [أساسيات بأسلوب جريء…   ]    │          │   الترجمات (EN ✓ · KU –) ＋       │
│   الترجمات (EN ✓ · KU –) ＋    │          │ ▸ التنسيق (Style)                 │
│   زر الشراء                    │          │ ▸ الخيارات المتقدمة (Logic)       │
│   [تسوّق الآن]                 │          │ ▸ الظهور  (٦ أنواع قواعد)         │
│   الصورة  [🖼 رفع صورة]        │          │ ▸ النسخ (0)  [+ نسخة]             │
│ ▸ التنسيق (مطوي)               │          │ ↺ إعادة للوضع الافتراضي           │
│ ↺ إعادة للوضع الافتراضي        │          └──────────────────────────────────┘
│ ⚙ خيارات أكثر؟ الوضع المتقدّم   │  ← quiet upsell w/ live-data chips when present
└───────────────────────────────┘
```

### 2.8 Back-compat & safety

- Mode is presentational; `setConfig`/undo/publish untouched. A doc authored in Advanced round-trips bit-identical through a Simple session (test asserts this).
- Deep links (`?screen=`, `?tab=`) can target Advanced-only surfaces: honor them by **auto-elevating to Advanced for that navigation** with a toast («فتحنا الوضع المتقدّم لهذه الشاشة») rather than 404-ing the intent — deep links come from Health fix-actions and the Command Center.
- E2E: Playwright spec covering default-Simple for a fresh user, toggle persist across reload, hidden-but-live variant chip, translation reveal round-trip.

---

## 3 · Phased roadmap

Ordering = adoption-impact ÷ effort, with hard bugs first (principle 7). Each phase independently shippable & owner-smoke-testable.

### Phase 0 — "Stop the bleeding" quick wins (S–M effort, huge fear reduction)

| # | Item | Findings |
|---|---|---|
| 0.1 | Define the missing `--color-primary-foreground` token (+ audit all `text-primary-foreground` usages render white-on-primary) | UX-01 |
| 0.2 | Route inspector tabs, toolbar cluster, save pill, first-run banner, undo/redo titles through `editor-i18n` (keys exist-pattern; add ~25 keys) | UX-04, UX-16, UX-03(a), UX-12 |
| 0.3 | First-run banner: page-aware copy + Arabic; on empty pages render the on-canvas empty-state card instead of a blank void | UX-03(b), [A6] |
| 0.4 | Localize section names/categories from the manifest's existing `name.ar` in list rows, picker cards/chips, floating toolbar label | UX-15, [B2] |
| 0.5 | Publish sheet copy: Arabic warnings via health-rule i18n, fix "يحظر" mislabel (non-blocking warns → «يُستحسن»), rename CTA to «انشر متجري» when nothing blocks, plain-language pixel/OG explanations | UX-08 |
| 0.6 | Post-publish success moment: dialog with 🎉 + live URL + copy-link + WhatsApp-share + «شاهد متجرك» | UX-19 |
| 0.7 | Fix Publish disabled on never-published seeded store (`has_unpublished_changes` must be true when `published == null && draft != null`) | UX-07 |
| 0.8 | Hide "No editable layers detected" empty state entirely; render layers strip only when layers exist | UX-10 |
| 0.9 | Style tab interim fix: replace rail embed with a card + «افتح هوية العلامة» button routing to the full-screen brand kit | UX-02 |
| 0.10 | Fix stale selection ring/toolbar on breakpoint switch (re-request rects on breakpoint change) | UX-09 |
| 0.11 | Fix brand-kit resolved-palette/token swatch rows rendering empty | UX-17 |
| 0.12 | Onboarding: apply chosen brand color visibly to the seeded hero CTA (map to the section's CTA token or seed accent too) + inline contrast guard on the color step (auto-suggest nearest AA-passing shade) | UX-06 |

### Phase 1 — The mode system + translation tuck-away (the owner's core ask)

1.1 `EditorMode` type + context + `PREFERENCE_KEYS.EDITOR_MODE` persistence + toolbar toggle (+ mobile More entry).
1.2 Translation tuck-away rewrite of `i18n-string-input.tsx` (§2.4) — ships value even before mode gating (default-collapsed in both modes).
1.3 `isFieldVisible` + AutoForm gating + Logic-accordion suppression + breakpoint-adornment gating (§2.5).
1.4 Conditional chrome across panel/rail/tree/toolbar + live-data count chips (§2.2, §2.3).
1.5 Field label/help channel + generic Arabic dictionary for recurring keys (§2.6) — scoped to the ~15 highest-traffic sections first (hero, product grid, testimonials, trust strip, newsletter, footer, header, FAQ, CTA banner, brand story…).
1.6 Fix [BUG18]/UX-23 (breakpoint override editor drops ar/ku) — precondition for hiding overrides behind Advanced with a clear conscience (render `I18nStringInput` inside the override editor, auto-form.tsx:1563–1584).
1.7 First-switch-to-Advanced popover + deep-link auto-elevation.

### Phase 2 — Onboarding continuity & first-run guidance

2.1 Industry-adaptive seed content: per-industry copy packs (cosmetics/fashion/electronics/food…) for brand story, testimonials (Arabic names), FAQ — no more "هل سنرتديها؟" for a lipstick store (UX-11).
2.2 Post-wizard welcome overlay in the editor (one card, 3 bullets in Arabic: click canvas to edit · your changes autosave · publish when ready) replacing the English banner for wizard-arrivals.
2.3 "جاهز للإطلاق" setup checklist: reframe Health tab as an ordered 5-step first-publish guide (logo → colors → products → delivery/WhatsApp → publish) driven by existing health checks + deep links ([E2]/[K4] absorption).
2.4 Wizard template step: real visual thumbnails (render seeded template to static preview images) (UX-20/[E5]).
2.5 Brand-kit theme gallery ([D1]): 6–8 curated full-kit presets (colors+type+shape), Iraq-vertical seeded, contrast-validated, applied via existing `buildBrandKitVars` — surfaced in Brand Kit *and* as wizard color step upgrade. Demote "Random palette" behind Advanced ([D9]).
2.6 Arabic font pairing ([D3]): add display_ar/body_ar (Cairo, Tajawal, Almarai, IBM Plex Sans Arabic, Noto Kufi…), emit `--bk-font-*-ar`, apply via `:lang(ar)`; wizard/theme presets pick sensible pairs automatically.

### Phase 3 — Canvas & inspector polish

3.1 Repeater smart labels + collapsed-by-default items + duplicate-item ([C8]).
3.2 Conditional fields in AutoForm (hide dependents when controlling enum says so — e.g. WhatsApp label only when kind=whatsapp) (UX-18).
3.3 Canvas zoom/fit pill ([A1]) — transform-scale on the frame wrapper, overlay math × zoom.
3.4 Breakpoint adornments on hover/focus only (Advanced) — removes the last permanent per-field chrome.
3.5 Picker: localized names/descriptions/chips (done in 0.4), + recents shelf ([B4]) + fix selected-chip contrast (UX-01 family).
3.6 Empty-state templates: page-type-aware template packs (category/product/about) replacing home-only injection ([BUG29], [E5]).
3.7 Full-screen takeover breadcrumb + active-state for system screens ([O2]); Advanced-accordion activity badges ([O3]).
3.8 Gray-on-color context-menu fix (UX-25) + editor chrome long-tail localization sweep (Brand Kit, Health, SEO panel — the remaining ~60 strings).

### Phase 4 — Architecture decomposition (only where it unblocks the above)

4.1 Extract toolbar, banners, and system-screen router from `editor-shell.tsx` (~2019 LOC → shell <800) — motivated by: mode-conditional toolbar (1.4), post-publish dialog (0.6), banner variants (2.2) all touch the same monolith.
4.2 Split `brand-kit-editor.tsx` (~1977 LOC) into per-card components + a layout-responsive container — unblocks a real (non-broken) rail embed of a *mini* style panel and the theme gallery (2.5).
4.3 Split `auto-form.tsx` field controls into files (walker stays) — makes field-meta/help and conditional-fields maintainable.
4.4 Storybook stories for SectionEditPanel in both modes — regression net for future section authors.

**Explicitly deferred (not in this plan):** collaboration/multiplayer ([N7]), AI copy generation ([N2] — pairs with the tuck-away later as "ترجم تلقائياً"), collections/blog ([N5]), form builder ([N6]), dark mode ([D12]).

---

## 4 · Per-item specs (load-bearing items)

### 0.1 Invisible primary CTAs (UX-01) — root cause fix
- **Why:** the #1 growth action ("إضافة عنصر"), add-variant, and the picker's selected chip are invisible. Fatima cannot add a block *at all* without luck.
- **Where:** `apps/platform/app/globals.css` theme block; usages at section-list-panel.tsx:806–817 & 722, variant-list header button, section-picker chips.
- **How:** buttons already specify `text-primary-foreground`; the Tailwind v4 theme never defines `--color-primary-foreground` (verified: zero grep hits in globals.css), so the var resolves invalid → color inherits ink (#1e1e1e) on `bg-primary` (#1e1e1e). Define `--color-primary-foreground: #ffffff` in the `@theme` block (respecting the Lightning CSS caveat: plain custom property, no bare backdrop-filter rules) and visually re-verify the three sites + grep all other `text-primary-foreground` usages in the app.
- **AC:** computed color ≠ background on all three controls; screenshot diff at 1366px.
- **Risk:** token may be intentionally themed elsewhere (packages/ui consumers) — audit usages before defining globally. **Test:** targeted Playwright computed-style assertion (the exact check that caught it).

### 1.1 Mode toggle & persistence
- **Where:** toolbar cluster editor-shell.tsx:1464–1535; `use-user-preferences.ts:124` (`EDITOR_MODE: "editorMode"`); new `lib/editor-mode-context.tsx` cloned from `lib/editor-locale-context.tsx`.
- **How:** provider wraps the same tree as EditorLocaleProvider; toggle = 2-segment radiogroup, aria-labels localized; mobile → More drawer row.
- **AC:** fresh user lands in Simple; toggle persists across reload and across tenants for the same user; switching causes no config mutation (assert `save_state` stays idle).
- **Risk:** SSR hydration flash (pref read client-side) — render Simple first paint, elevate after hydrate; acceptable because Simple is default anyway.

### 1.2 Translation tuck-away (§2.4)
- **Where:** `i18n-string-input.tsx` (auto-expand 77–79, tabs 145–177, secondary rows 228–305); consumed by AutoForm at auto-form.tsx:676–685; also PageSeoPanel + BrandKit identity fields (they reuse the component — free win).
- **AC:** default collapsed everywhere incl. seeded stores; reveal shows per-locale fill chips; copy-from-active fills and marks dirty via the normal onChange path; round-trip preserves untouched locales byte-identical; `dir="auto"` on value inputs only ([I5] — layout stays LTR).
- **Risk:** merchants who relied on always-visible EN row lose at-a-glance edit — mitigated by fill-state chips; **Test:** unit tests for expand/collapse/copy-from + existing i18n-string-input suite.

### 1.3 Field visibility filter
- **Where:** `lib/section-field-groups.ts:198–204` (+ new `isFieldVisible`, `SIMPLE_OVERRIDES`); `auto-form.tsx:250–305` (GroupedFormRenderer), 117–128/563–589 (adornment gate).
- **AC:** Simple hero panel shows Essentials+Style only (~10 controls, per audit count); unknown/unclassified sections fall back to showing everything (never hide unknown fields silently); Advanced identical to today.
- **Risk:** convention misclassification hides something a merchant needs → override map + "الوضع المتقدّم" footer link as universal escape hatch. **Test:** vitest table over all 45 KNOWN_SECTION_TYPES asserting every section has ≥1 Simple-visible field.

### 1.4 Conditional chrome + live-data chips
- **Where:** section-edit-panel.tsx:254–272 (label), 309–317 (layers), 351–413 (visibility), 418–425 (variants); inspector-rail.tsx:195 (SEO); page-tree.tsx:159–180, 389–483; editor-shell toolbar.
- **AC:** in Simple, a section carrying 2 variants + 1 visibility rule shows one chip line («قواعد مفعّلة: ٣ · الوضع المتقدّم»); clicking elevates mode and scrolls to the block. Deep link `?screen=experiments` auto-elevates with toast.
- **Risk:** hidden-but-active behavior confusing storefront debugging → the chip rule is mandatory, not optional.

### 0.5 + 0.6 Publish flow (UX-08, UX-19)
- **Where:** publish-confirm-sheet component; health rule copy in `packages/shared/src/health-rules.ts`; post-publish handler in editor-shell (~1567–1572 publish button / sheet close path).
- **How:** health `CheckResult` gains localized `message` (EditorString) for the ~8 publish-sheet-surfaced checks; badge maps severity → «يمنع النشر» only for genuinely blocking fails, «يُستحسن» for warns; success dialog = Radix Dialog from `packages/ui` with store URL (`https://…/s/{slug}` prod / localhost storefront in dev), copy + WhatsApp share (`wa.me/?text=`), «شاهد متجرك» primary.
- **AC:** first publish on a warn-only store reads positively end-to-end in Arabic; the live URL is one tap away; a screenshot of the dialog makes the owner smile.
- **Risk:** none material; pure presentation. **Test:** RTL render test for both badge severities; e2e publish on test tenant.

### 2.1 Industry-adaptive seeds (UX-11)
- **Where:** starter-template seed content consumed by `buildStarterStoreConfigV2` (onboarding-wizard.tsx:48,152 path) — content packs keyed by wizard industry id.
- **How:** extract current copy into `default` pack; add per-industry overrides for brand_story paragraphs, testimonial quotes+Arabic names, FAQ items; keep structure identical (no schema change). Cosmetics/fashion/electronics/food first (wizard's top picks).
- **AC:** cosmetics pick yields cosmetics-truthful Arabic story (no wear-test line, no Schneiders backstory); reviewer names Arabic-script.
- **Risk:** copy volume — timebox to 4 industries + neutral default; **Test:** vitest snapshot per pack asserting no leakage of the fashion default.

*(Remaining items follow the same shape; anchors are in the roadmap lines. Every item lands behind `pnpm type-check`/`lint` + relevant vitest, and UI items get a 1366px screenshot for the owner round.)*

---

## 5 · Risks, unknowns, and what NOT to do

- **Don't build a third disclosure system.** We already have accordions (fields) and the متقدم accordion (screens). Mode must *reuse* both — a new "beginner overlay/tour framework" is the over-engineering trap here.
- **Don't hide live behavior silently** (variants/visibility active while invisible in Simple). The count-chip rule is non-negotiable; skipping it converts confusion into distrust.
- **Don't per-tenant the mode.** Per-user preference; a tenant-level lock ("staff must use Simple") is a future owner decision, not now.
- **Don't attempt full chrome localization in one sweep.** Phase 0 hits the ~25 highest-visibility strings; the long tail (Brand Kit/Health/SEO ~60 strings) is 3.8 — sequencing keeps every round smoke-testable.
- **Don't rewrite AutoForm.** The walker is fine; filter + meta channel are additive. Decomposition (4.3) is file-splitting, not redesign.
- **Don't gate Simple mode on the theme gallery or AI.** Tuck-away + labels + chrome fixes deliver the owner's ask without Phase 2/3 scope.
- **Unknowns needing verification during build:** (a) exact reason `has_unpublished_changes` is false pre-edit on seeded tenants (0.7) — confirm against `use-store-builder-v2.ts` init before patching; (b) whether `--color-primary-foreground` is intentionally absent because packages/ui supplies it in other apps (0.1 audit step); (c) transient publish toast existence (0.6 should replace, not double-celebrate).

---

## 6 · Open questions for the owner

1. **Mode toggle visibility:** OK with the toggle living openly in the toolbar (recommended — discoverable power), or do you prefer Simple users don't see any "Advanced" affordance until they hit an escape-hatch chip?
2. **SEO tab in Simple:** plan hides it (health checklist covers basics). Keep hidden, or is per-page SEO a Simple-mode feature for your merchants?
3. **Tablet breakpoint in Simple:** plan hides tablet (mobile+desktop only). Agree?
4. **Publish warnings:** for first-time merchants, should the pixel/OG "ad compliance" warns be *hidden entirely in Simple* (shown only in Advanced/after N publishes), or kept but rewritten in plain Arabic (current plan)?
5. **Theme gallery timing (2.5):** it's the biggest styling lever but real design work — happy for it to ride Phase 2, or pull it forward at the cost of delaying the mode system?
6. **Test tenant:** keep `audit-test-store` (merchant #100048) for your smoke rounds, or delete after Phase 0?
7. **Starting phase:** Phase 0 is designed to be the first smoke-testable round (visible fear-reduction in one sitting). Approve 0 → 1 → 2 → 3 → 4 as sequenced, or reorder?
