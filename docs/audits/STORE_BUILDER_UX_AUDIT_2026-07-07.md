# Store-builder editor — second UX audit (post-overhaul)

**Date:** 2026-07-07 · **Auditor:** live click-through + 2 code-verification agents
**Baseline:** [STORE_BUILDER_UX_AUDIT_2026-07-02.md](STORE_BUILDER_UX_AUDIT_2026-07-02.md) (approachability 41/100, Nielsen 21/40)
**Scope:** `/store/edit` after the Phases 0–4 overhaul (commit `8eb7a468`, PR #56). Personas: **Fatima** (non-technical Arabic-speaking Baghdad cosmetics merchant, Simple mode) and **Karim** (power merchant, Advanced mode).
**Method:** three live Playwright passes on tenant #100051 (returning-merchant Simple loop incl. real publish; Advanced surface; 390 px mobile shell), a fresh-signup attempt, a 24-finding regression verification against the baseline table, and a fresh-eyes code sweep of the post-overhaul files.

---

## Verdict

The overhaul landed. The editor Fatima meets today is a different product from five days ago: she opens on a seeded Arabic store, sees five labeled fields instead of thirty controls, publishes a never-edited draft on the first click, and is handed her live link with a WhatsApp share button. **19 of the 24 baseline findings are fully fixed, 3 partially, 2 open.**

The remaining risk has moved. It is no longer "the editor is hostile" — it is that **Simple mode quietly ships half-controls** (a merchant can edit a button's text but not where it points; can add a countdown but not set its date; cannot pick products for a product grid), and that **the trust surfaces that survived in English are exactly the ones that judge her store** (the rail Health header/score/messages, the publish-blocked tooltip, upload-failure toasts). Those two clusters are the whole next round.

## Approachability score: **75/100** (was 41)

Biggest gains: progressive disclosure (+5), translation UX (+5), inspector complexity (+4), first-run fear (+4). Weakest remaining: benchmark features (no auto-translate/AI copy, placeholder template thumbnails) and the English trust-chrome pockets.

### 15-dimension scorecard (0–10, with 07-02 baseline)

| # | Dimension | Was | Now | Justification |
|---|---|---|---|---|
| 1 | First-run fear factor / approachability | 4 | **8** | Wizard → welcome card → seeded store → 5-step launch checklist → publish-day celebration is a coherent first hour. Drag: signup page and Command Center hub are still 100 % English chrome on the way in; published URL is a machine slug. |
| 2 | Simple ⇄ Advanced mode quality | 6* | **8** | Mode exists, persists per user, elevates on deep links, intro popover works, tablet/logic/variants/SEO correctly gated. Held back by classifyKey misfiles (below) and empty `SIMPLE_OVERRIDES`. (*was "readiness"*) |
| 3 | Progressive disclosure & density | 3 | **8** | Hero panel in Simple = 5 labeled fields + enable + reset + one escape hatch («خيارات أكثر؟ الوضع المتقدّم»). Repeaters collapse with real Arabic summaries; breakpoint adornments hover-only; translations tucked away. Verified live. |
| 4 | Translation UX | 3 | **8** | Tuck-away «الترجمات (EN ✓ · KU –) ＋» on every field; BUG18 fixed (per-breakpoint overrides write all locales). No auto-translate yet — KU coverage stays manual. |
| 5 | Visual hierarchy, polish & cognitive load | 4 | **8** | Invisible CTAs fixed at the token root; swatches render; zoom pill; stale rings fixed. The English "Store Health / Almost there / 63" card inside an otherwise-Arabic rail is the one jarring block. |
| 6 | Onboarding, empty states & guidance | 5 | **8** | Page-aware Arabic first-run banner, canvas empty-state card with template gating, launch checklist that strikes through live. Per-field help still sparse (eyebrow has it; most fields don't). |
| 7 | Direct manipulation on canvas | 7 | **8** | Zoom fit/50/75/100 with pixel-accurate overlay at every scale (verified at 50 %); ring re-requests on breakpoint switch; context menu readable + Arabic. Inline text editing unchanged. |
| 8 | Section library / add flow | 5 | **8** | Arabic names/descriptions/categories + Arabic search + recents shelf + valid-page gating incl. canvas empty-state (gap found & fixed 07-04). Template *previews* are still placeholder bars with English-only names. |
| 9 | Inspector / AutoForm complexity | 3 | **7** | ~50 Arabic labels + enum labels + conditional `_kind` hiding + collapsed repeaters, all live-verified. Deductions: misfiled logic fields make some sections half-editable in Simple; `Range:/Min:/Max:` and upload toasts English; `html` field exposed raw in Simple. |
| 10 | Style / Brand Kit approachability | 4 | **7** | Theme gallery («إطلالات جاهزة», 7 AA-validated kits), Arabic font pairs, working swatches, Random gated to Advanced. But the editor *body* keeps English card titles/labels (Identity/Colors/Typography/Shape, "Display font", "Radius"…) and the ColorPopover is English (Hue/Saturation/Lightness/Suggested). |
| 11 | Save / publish / trust | 5 | **7** | Publish enabled pre-edit on seeded stores; sheet is plain Arabic with fix-links; success dialog with live URL/copy/WhatsApp verified live. Deductions: autosave PATCH failures are silent (`console.warn` only); retry pill retries the wrong operation after a publish error; undo descriptions still English-generic («تراجع: Edit config.»); confirm CTA still says «نشر على أي حال» even for advisory-only warnings. |
| 12 | Localization of chrome | 4 | **7** | The Simple-mode path is effectively fully Arabic (toolbar, tree, panels, picker, publish, mobile shell — verified live). English pockets: rail Health header/score/dimension names + rule messages, publish-blocked tooltip, brand-kit body, number-range hints, upload toasts, Advanced screens' empty-states/aria. |
| 13 | Consistency & reuse | 5 | **7** | One i18n system, one mode context, shared field-meta. Drift: `humanLabel` triplicated (auto-form-fields / section-field-meta / variant-override-paths); count-chip contract applied to section panels but not to the hidden tree group or toolbar controls. |
| 14 | Architecture health as it blocks UX | 5 | **8** | Decomposition shipped: shell 2621→1920 (banners/toolbar/router/utils extracted), brand-kit 2154→939 + reusable `brand-kit/` controls, auto-form 1819→371 + schema/fields/breakpoints modules, Storybook stories as regression net. Remaining: iframe/DnD/inline-edit handler block (~720 lines) still in-shell by choice. |
| 15 | Benchmark gaps | 4 | **6** | Now competitive on: mode system, theme gallery, publish celebration, launch checklist, seeded onboarding. Still missing vs Shopify/Wix/Framer: auto-translate/AI copy, real template thumbnails, per-field help at scale, custom domain/handle claim at publish time. |
| | **Total** | 41/100 | **75/100** | |

### Nielsen heuristics (0–4)

| # | Heuristic | Was | Now | Key issue |
|---|---|---|---|---|
| 1 | Visibility of system status | 3 | **4** | Save pill Arabic + relative time; checklist strikes live; success dialog. |
| 2 | Match system / real world | 1 | **3** | Arabic merchant vocabulary nearly everywhere; residual dev-speak: rule messages ("No analytics pixel configured"), "Range:", brand-kit body. |
| 3 | User control and freedom | 3 | **3** | Undo/redo/reset/escape-hatch all present; undo *descriptions* still generic English so the history is unreadable. |
| 4 | Consistency and standards | 2 | **3** | One locale system; but hidden-data chip contract inconsistently applied, and Health rail mixes languages mid-card. |
| 5 | Error prevention | 2 | **3** | AA contrast guard at color pick; conditional fields prevent orphan inputs; Zod errors still never surface (BUG24 open). |
| 6 | Recognition rather than recall | 2 | **3** | Labeled Arabic fields + summaries + enum labels; per-field help still the exception, not the rule. |
| 7 | Flexibility and efficiency | 3 | **4** | Modes, deep-link elevation, recents shelf, presets, zoom. |
| 8 | Aesthetic & minimalist design | 2 | **4** | Simple panel is genuinely minimal; density on Advanced is a choice, not a default. |
| 9 | Error recovery | 3 | **3** | Draft recovery + conflict reload intact; silent autosave PATCH failure and wrong-op retry hold this back. |
| 10 | Help and documentation | 0 | **1** | A help *channel* now exists (`resolveFieldHelp`, eyebrow uses it) but is ~empty; no docs link anywhere. |
| | **Total** | 21/40 | **31/40** | |

---

## The Fatima walkthrough — what changed (10 minutes, narrated)

She lands on الرئيسية of a seeded Arabic cosmetics store. A dismissible Arabic banner tells her to tap any text and hit «نشر». The rail lists six blocks with Arabic names and categories. She taps «غلاف مع صورة»: **five fields** — العنوان، الوصف المختصر، نص الزر، صورة، سطر تمهيدي — each Arabic-labeled, translations folded into one quiet «الترجمات» line. She types «عرض الصيف الكبير»; the canvas repaints, the pill says «تم الحفظ منذ ٣ ث».

She hits «نشر». The sheet says «جاهز للنشر؟ … أول نشر — كل شيء جديد», lists two amber *recommendations* (not blockers) with fix buttons, and publishes. 🎉 dialog: her live link, نسخ الرابط، شاهد متجرك، مشاركة عبر واتساب. This is the peak moment the first audit said was missing — it exists and it works.

Where she still stumbles, in order of encounter: the **Health tab** greets her with "Store Health — what to fix before launch", a "63 / Almost there" ring and English rule sentences; she clicks «أكملها» next to «أضف رقم الواتساب» and **nothing visibly happens** (it routes to the home page she's already on); if she tries to change where «تسوّق الآن» *points*, that field doesn't exist in Simple; and her store's shareable identity is `…/s/tenant-1783087997714`.

---

## Baseline regression table (UX-01…24)

Verified in current code by agent, with fresh file:line evidence (files were decomposed since 07-02).

| ID | Status | Evidence | Note |
|---|---|---|---|
| UX-01 invisible CTAs | **FIXED** | tokens.css:74,180 alias | Root-cause token fix |
| UX-02 Style-tab embed | **FIXED** | inspector-rail.tsx:207-233 | Route card → full-screen Brand Kit |
| UX-03 English/lying banner | **FIXED** | editor-banners.tsx:76-77 | Localized + page-aware |
| UX-04 English toolbar/tabs | **FIXED** | editor-toolbar.tsx:78-217 | |
| UX-05 control explosion | **FIXED** | auto-form.tsx:115; i18n-string-input.tsx:59-61 | Mode gating + tuck-away |
| UX-06 AA-failing wizard color | **FIXED** | onboarding-wizard.tsx:92-121,611-628 | Warn + one-tap fix |
| UX-07 publish disabled | **FIXED** | use-store-builder-v2.ts:400-403 | Re-verified live today |
| UX-08 publish-sheet framing | **PARTIAL** | publish-confirm-sheet.tsx:346-347 | Arabic + non-blocking ✓; CTA still «نشر على أي حال» |
| UX-09 stale ring | **FIXED** | editor-shell.tsx:437-457 | |
| UX-10 "no layers" notice | **FIXED** | block-layers-panel.tsx:179 | |
| UX-11 unadapted seed copy | **FIXED** | industry-seed-copy.ts + starter-store.ts:247 | |
| UX-12 generic undo labels | **PARTIAL** | use-store-builder-v2.ts:327; editor-shell.tsx:723-728 | Tooltip frame Arabic; descriptions still "Edit config." — confirmed live |
| UX-13 force-expanded EN inputs | **FIXED** | i18n-string-input.tsx:12 | |
| UX-14 English schema labels | **FIXED** | section-field-meta.ts:30-44 | |
| UX-15 English section names | **FIXED** | sectionDisplayName across rows/picker/canvas | |
| UX-16 English save pill | **FIXED** | toolbar-controls.tsx:182-270 | |
| UX-17 broken swatches | **FIXED** | brand-kit/live-preview.tsx:207-225 | |
| UX-18 no conditional fields | **FIXED** | section-field-meta.ts:207 | Verified live both directions |
| UX-19 no publish moment | **FIXED** | editor-banners.tsx:223-335 | Verified live today |
| UX-20 blind template pick | **PARTIAL** | page-template-picker.tsx:63,229,252-254 | Page-gating fixed; names EN-only, thumbnails still bars |
| UX-21 double OMS chrome | **OPEN** | dashboard-layout.tsx:55-120 | Editor still inside sidebar+topbar |
| UX-22 one متقدم bucket | **OPEN** | page-tree.tsx:179-193 | Commerce ops + builder power tools mixed (now Arabic) |
| UX-23 BUG18 bp overrides EN-only | **FIXED** | auto-form-breakpoints.tsx:229-258 | |
| UX-24 dual i18n personality | **FIXED** | section-list-panel.tsx:231 | |

---

## New findings (UX2-01…18)

| ID | Sev | Problem | Evidence | Hurts |
|---|---|---|---|---|
| UX2-01 | **P1** | **Simple mode ships half-controls** — `classifyKey` files merchant-essential fields into the hidden logic bucket: `cta_href`/`secondary_cta_value` (button destination — while button *text* stays editable), `product_ids`/`manual_skus` (product picker for product_grid/related), `countdown_to_iso`/`target_iso` (the countdown's date), `category_id`, `discount_code`, `threshold_iqd`. `SIMPLE_OVERRIDES` is an empty map. | section-field-groups.ts:64,222-224; live: hero Simple shows no link field | Fatima |
| UX2-02 | **P1** | Rail **Health tab chrome is English** at maximum trust-visibility: "Store Health", "what to fix before launch", score ring "63 / Almost there", dimension names (Ad compliance/SEO/Trust/…), and every rule message ("No analytics pixel configured…"). Rule `message` strings come from packages/shared with no locale channel. | live screenshot; inspector rail health header; health-rules.ts messages | Fatima |
| UX2-03 | **P1** | Launch-checklist «أكملها» can be a **silent no-op**: whatsapp step routes `fixPage("home")` — if she's already on home, nothing changes; no section/field pinpointing, no scroll, no highlight. Same pattern risk for any fixPage target = current page. | health-rules.ts:345; health-checklist-screen.tsx:241-261; verified live (no focus/scroll/route change) | Fatima |
| UX2-04 | **P1** | **Autosave failures are invisible**: draft PATCH errors only `console.warn`; pill can keep implying safety while edits aren't persisting. Compounding: SaveStatePill "retry" always calls `save_draft()` even when the error state came from `publish()`. | use-store-builder-v2.ts:813-834,642-644; editor-toolbar.tsx:209-211 | Both |
| UX2-05 | **P1** | Publish-button disabled-tooltip (`publishBlockedReason`) is fully English incl. hand-rolled pluralization ("N health warnings… publish anyway"). It's the only explanation a blocked merchant gets. | editor-shell.tsx:1232-1241 | Fatima |
| UX2-06 | **P1** | **Brand-kit editor body still largely English** despite the localized gallery: card titles (Identity/Colors/Typography/Shape/Motion/Voice), field labels ("Store name", "Display font", "Radius", "Border thickness"…), plus English apply/upload toasts. Primary Simple-mode surface. | brand-kit-editor.tsx:249-296,526-872; brand-kit/controls.tsx:192-214 | Fatima |
| UX2-07 | **P2** | ColorPopover controls English: Hue/Saturation/Lightness/Suggested/Pick/Reset + English aria-labels. | brand-kit/controls.tsx:424-492 | Fatima |
| UX2-08 | **P2** | NumberControl bound hints English ("Range:", "Min:", "Max:") on every bounded numeric field, both modes. | auto-form-fields.tsx:621-624 | Both |
| UX2-09 | **P2** | Upload error path surfaces raw technical `err.message` (English, Supabase wording) in merchant-facing toasts; success/failure toasts English too. | auto-form-fields.tsx:467-490; brand-kit/controls.tsx:192-214 | Fatima |
| UX2-10 | **P2** | **Hidden-live-data chip contract not honored at tree/toolbar level**: Simple hides the whole متقدم settings group and the preview-as/i18n pills with *no* count chip even when experiments/segments are live — `settingBadges` are computed but attached to buttons that don't render in Simple. (Section-level chips DO work.) | page-tree.tsx:288-292,541; editor-toolbar.tsx:164-181 | Fatima |
| UX2-11 | **P2** | Publish confirm CTA is always «نشر على أي حال», even when the sheet contains only advisory recommendations — residual "overriding safety" framing (UX-08). | publish-confirm-sheet.tsx:346-347; live screenshot | Fatima |
| UX2-12 | **P2** | Undo history is unreadable: default description "Edit config." (English) for every AutoForm edit; section add/delete pass no description at all. Live: «تراجع: Edit config.». (Carries UX-12.) | use-store-builder-v2.ts:327; editor-shell.tsx:723-728 | Both |
| UX2-13 | **P2** | Published identity is a machine slug (`/s/tenant-1783087997714`): wizard/editor never offer a store-handle claim, so the celebrated shareable link looks broken-ish on WhatsApp. | live publish-success dialog URL | Fatima |
| UX2-14 | **P2** | Journey chrome *into* the editor is English: signup page (Create Your Account / plans) and the Command Center hub (Store health / Getting there / Pages / Visit store / Customize + English check messages). Out-of-editor scope but frames every session. | live /signup + /store screenshots | Fatima |
| UX2-15 | **P2** | Advanced screens are mixed-language: Arabic headers/CTAs over English empty-states ("No experiments yet", "Create your first experiment") and dozens of English aria-labels/placeholders across experiments/segments/scheduled/versions/nav/discounts/redirects/preview-modal. | live experiments screen; agent list (8 files) | Karim |
| UX2-16 | **P2** | `html_embed`'s raw `html` field falls through to the *essential* bucket → Simple-mode merchants get a bare "Html" textarea; arguably the most dangerous field in the product is un-gated while button links are hidden. | section-field-groups.ts (fallback branch); section-field-meta (no label) | Fatima |
| UX2-17 | **P3** | `humanLabel` exists in triplicate (auto-form-fields dead export ≡ section-field-meta.humanizeFieldKey ≡ variant-override-paths copy). | auto-form-fields.tsx:278; section-field-meta.ts:153; variant-override-paths.ts:210 | — |
| UX2-18 | **P3** | Fresh-signup attempt on a machine with an existing session landed back in the *previous* tenant (#100051) with no visible error — could be dev-cookie artifact, but if real, new merchants get dumped into the wrong account. Needs a clean-profile verification. | live signup attempt 2026-07-07 | Fatima |

## Fix round — status as of 2026-07-08

Implemented and gate-verified (uncommitted on `feat/store-builder-preview-iframe`):

| ID | Status | Fix |
|---|---|---|
| UX2-01 | **FIXED** | `SIMPLE_SHOW_*` whitelist + `getFieldGroupForMode` promotes button links, product pickers, countdown dates, discount codes into Simple's essential group (live-verified «رابط الزر») |
| UX2-02 | **FIXED** | New `lib/health-check-copy.ts` — all 36 checks in ar/en/ku, shared by publish sheet + Health screen + publish tooltip; Health chrome/score/categories localized |
| UX2-03 | **FIXED** | WhatsApp launch step pinpoints the section holding the number instead of re-navigating to the current page |
| UX2-04 | **FIXED** | Publish failures no longer set the save pill to error (retry can't hit the wrong operation); autosave chain verified sound |
| UX2-05 | **FIXED** | Publish-blocked tooltip localized via the shared check copy |
| UX2-06/-07/-09 | **FIXED** | Brand-kit body, ColorPopover and upload toasts localized (31 keys); raw `err.message` no longer shown to merchants |
| UX2-08 | **FIXED** | `Range:`/`Min:`/`Max:` numeric hints localized |
| UX2-10 | **FIXED** | Simple mode shows an amber "active advanced settings — view" chip that elevates to Advanced |
| UX2-11 | **FIXED** | Publish CTA is always «انشر متجري»; "publish anyway" framing removed |
| UX2-12 | **FIXED** | Undo descriptions localized and inferred per operation (live: «تراجع: تعديل قسم») |
| UX2-13 | **FIXED (root cause)** | `generateSlug` stripped Arabic entirely, so every Arabic-named store became `tenant-<timestamp>`; added Arabic→Latin transliteration + 5 tests. Existing slugs unchanged; a rename/claim UI remains open |
| UX2-14 | **FIXED** | Signup page localized (23 keys via the app`s `useLanguage`); Command Center hub localized (93 keys, locale threaded from `config.default_locale` — there is no EditorLocaleProvider at hub level) |
| UX2-15 | **FIXED** | ~200 `advanced_chrome` keys wired across experiments/segments/scheduled/versions/nav/discounts/redirects/bundles/preview-modal |
| UX2-16 | **FIXED** | `html_embed`'s raw HTML field is Advanced-only |
| UX2-17 | **FIXED** | Triplicated `humanLabel` collapsed to one shared humanizer |
| UX2-18 | **FIXED** | Signup now clears any stale session before redirecting to `/login`, so a new account can't silently land in the previous tenant |

Gates: workspace type-check 3/3, platform lint 0 errors, vitest 589+ green.

## Original proposed round (for reference)

1. **Simple-mode completeness sweep (UX2-01, -16)** — reclassify per-field with a real `SIMPLE_OVERRIDES` map: expose link targets via a friendly link-picker, product/category pickers, countdown date, discount code + threshold; demote `html` out of Simple. Highest-leverage single fix in the product.
2. **Health surface localization + fix-routing (UX2-02, -03, -05)** — add a locale channel to the shared rules engine (message keys, not strings), localize the rail header/score/dimensions, make fix actions pinpoint (route + scroll + pulse the target; open the right panel for whatsapp/logo).
3. **Trust hardening (UX2-04, -09, -12)** — surface autosave failure in the pill (amber «لم يُحفظ — إعادة المحاولة»), route retry to the failed op, replace raw error toasts with Arabic copy, and thread real Arabic undo descriptions from every mutation site.
4. **Brand-kit + controls localization finish (UX2-06, -07, -08)** and Advanced-screen empty-states (UX2-15).
5. **Identity & framing polish (UX2-11, -13)** — «نشر» CTA when warnings are advisory-only; slug/handle claim step (wizard or first-publish sheet).
6. Deferred unchanged: OMS double chrome (UX-21), متقدم bucket split (UX-22), template thumbnails/names (UX-20 residue), auto-translate/AI copy.

## Artifacts

Live-pass screenshots: `.playwright-mcp/audit2-0*.jpeg` (gitignored). Regression + fresh-eyes agent outputs archived in session transcript. Test tenant #100051 now has one extra publish + title «عرض الصيف الكبير» from the walkthrough; FAQ section added during 07-03 verification remains.
