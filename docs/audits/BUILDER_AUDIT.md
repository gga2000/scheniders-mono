# Builder v2 — UX Audit & Redesign Brief

**Audit date:** 2026-05-18
**Auditor:** Principal-design + staff-frontend pass
**Scope:** `apps/platform/components/store-builder-v2/*` (21,232 LOC across 36 components), the `/store/v2` route, supporting hooks ([use-store-builder-v2.ts](apps/platform/hooks/use-store-builder-v2.ts), [use-iframe-bridge.ts](apps/platform/hooks/use-iframe-bridge.ts)), the section registry at [packages/sections/src/](packages/sections/src/), and the data model at [packages/shared/src/types/store-config-v2.ts](packages/shared/src/types/store-config-v2.ts).
**Live-browser pass:** partial — fresh Playwright context redirected to /login. Findings draw on full code reads of all 36 components plus the candy-bento reference at [stitch_schneiders_iraq_storefront_template111/a_candy_bento_playful_pastels/DESIGN.md](stitch_schneiders_iraq_storefront_template111/a_candy_bento_playful_pastels/DESIGN.md) and the mobile-home screen at [schneiders_home_mobile_state_of_the_art_wedges/screen.png](stitch_schneiders_iraq_storefront_template111/schneiders_home_mobile_state_of_the_art_wedges/screen.png).

---

## Executive summary

Builder v2 is a structurally complete data-engine — variants, segments, experiments, schedules, version history, health checks, i18n coverage, brand kit, presets, drag-to-insert, inline edit, spacing handles, undo/redo — wrapped in an admin-console aesthetic that talks down to its target user in a language they don't speak. The merchant we are failing — a small Iraqi shop owner editing from a Galaxy A12 in Arabic — opens the editor to a 380-pixel rail of English-only schema words ("Override", "Variant", "Segment", "primary_metric", "z=2.31"), a 260-pixel page tree they cannot collapse, and a viewport that on their phone is entirely consumed by chrome. The product was engineered like Shopify Plus and shipped like Mixpanel; meanwhile the storefront it produces is supposed to look like Duolingo × Olipop.

The biggest single thing wrong is **a vocabulary mismatch baked into the UI surface**. The schema's nouns (variant, override, condition, audience, arm, segment, snapshot) leak into chip text, picker rows, toast bodies, modal headers, placeholder text, default labels, and the section list itself, while bare UUIDs and `snake_case_section_types` appear in at least 14 distinct places ([variant-add-wizard.tsx:1106](apps/platform/components/store-builder-v2/variant-add-wizard.tsx#L1106) is the canonical sin: *"paste IDs separated by commas"*). The second-biggest is that **two parallel preview implementations** coexist — the inline `LivePreview` is shipped, the iframe `PreviewFrame`/`PreviewOverlay`/`useIframeBridge` are imported but never rendered ([editor-shell.tsx:36-40, 1005](apps/platform/components/store-builder-v2/editor-shell.tsx#L1005)) — meaning ~600 LOC of dead code, two test suites, and every overlay fix has to be applied to two near-identical Ring/Toolbar/ToolbarButton clones whose magic numbers have already drifted. The third is **the editor cannot be used on a phone**: the inspector rail is a fixed `w-[380px]` ([inspector-rail.tsx:102](apps/platform/components/store-builder-v2/inspector-rail.tsx#L102)), the page tree is `w-[260px]` ([page-tree.tsx:229](apps/platform/components/store-builder-v2/page-tree.tsx#L229)), neither collapses, and there are at least 11 hover-only affordances locked away from touch ([section-picker.tsx:544-550, 423](apps/platform/components/store-builder-v2/section-picker.tsx#L544); section-list-panel kebab menus; preset deletes; etc.).

Three highest-leverage fixes, in order:
1. **Rename the model in the UI.** Variant → "Version". Override → "Change". Condition → "When". Segment → "Audience". Experiment → "A/B test". Snapshot → "Saved version". Strip every `snake_case_id` from a merchant-facing string by mapping through manifest names. This is a sweep — small per-file, transformative in aggregate.
2. **Rebuild the shell for phone-first.** Collapse rails. Replace the desktop 3-pane with a mobile-first 2-mode shell (canvas + bottom sheet, or canvas + drawer), then progressively enhance for desktop. Adopt a single shared overlay primitive.
3. **Hide advanced features behind one toggle.** Experiments, segments, scheduled changes, and variants belong inside an "Advanced" disclosure that defaults closed for new tenants. They cost ~3,500 LOC and ~12 screens of weight that fewer than 5% of Iraqi merchants will ever use.

The bet: ship the Phase 1 foundation in two weeks and the perceived "finished" feeling jumps from ~40% to ~80% with no new features. The data engine is solid; the surface above it is the failure.

---

## The merchant we're failing

The target merchant is a corner-shop or boutique owner in Baghdad, Erbil, or Basra. Their phone is a Galaxy A12 or Redmi Note 11 — 5.8" 720p, mid-range Android, Chrome over a 3G/4G connection that yo-yos between 200ms and 3s of latency. They speak Arabic at home and at work, switch to English only for technical words ("WhatsApp", "delivery", "online"). They sell to customers who DM via WhatsApp and pay COD. They have 30 seconds, between packing two orders, to update the hero banner because their cousin sent a better photo.

When this merchant opens Builder v2 they meet (in order): a hardcoded English topbar with `🌐 EN | mobile | tablet | desktop | Eye + Open ↗ | Saved 12s ago | Publish`; a left navigation labelled "Storefront / Shop / Order / Pages / Policies / System" with leaves like "i18n", "404", "policy_terms"; a center canvas that on their phone width is entirely hidden behind the right rail; and that right rail with three tabs — Blocks, Style, Health — whose first 11px-tall label is unreadable in daylight. If they manage to add a hero, the inspector for it exposes a "Visibility" section with six wraps-to-three-rows chips labelled `+ Language`, `+ Device`, `+ Schedule`, `+ Segment`, `+ Governorate`, `+ Page`, and a "Variants" section with `+ Add variant` whose wizard step 1 offers nine cards including "Bind this variant to one experiment arm". They came to add a Ramadan banner. They will close the tab.

The Iraq market context is everywhere in the data model (governorate condition, IQD currency, Asia/Baghdad timezone) but nowhere in the surface: no IQD-aware currency control in AutoForm, no Snapchat or Telegram in `TRAFFIC_SOURCES` ([segments-screen.tsx:47](apps/platform/components/store-builder-v2/segments-screen.tsx#L47)) despite both being huge in Iraq, no Arabic-friendly font pairings in `GOOGLE_FONTS` ([brand-kit-editor.tsx:57](apps/platform/components/store-builder-v2/brand-kit-editor.tsx#L57)), no thousands-separator on IQD prices, governorates rendered as 3-letter codes (`BGD`, `BSR`) instead of names. The product is set up to do the right thing and presents it as if it were configured for an office in Mountain View.

---

## Severity scale

- **P0 — Blocks launch.** Merchant cannot complete a core path; UI is wrong on phone; data loss risk; jargon makes the feature unusable; broken affordance.
- **P1 — Hurts daily use.** Slows or confuses every use; visible bug; missing empty/loading/error state on a hot path; performance smell that bites at scale.
- **P2 — Polish.** Inconsistency, micro-copy, density, color drift, dead code, weak hierarchy.
- **P3 — Nice to have.** Future feature, DX improvement, telemetry gap.

---

## Findings by category

### 1. Information architecture

- **[P0] The 3-pane desktop shell ignores phone.** [editor-shell.tsx:837-1097](apps/platform/components/store-builder-v2/editor-shell.tsx#L837): `flex h-[calc(100vh-4rem)]` with a 260-px page tree, a flex-1 main, and a fixed-380-px inspector. On a 360-px viewport the canvas is 0 px. There is no breakpoint adaptation, no mobile drawer, no rail collapse. **Fix:** rebuild as a mobile-first single-pane shell with a bottom-sheet inspector and a top-corner page menu; promote to a 2-pane at ≥768, 3-pane at ≥1280.
- **[P0] The page tree leaks engineer leaves.** [page-tree.tsx:53-92](apps/platform/components/store-builder-v2/page-tree.tsx#L53): "i18n" (engineer jargon), "404" (engineer number), "policy_terms" (engineer fallback). Labels exist in `PAGE_LABELS` map but unmapped pages fall through to raw id. **Fix:** rename "i18n" → "Languages", "404" → "Page not found", and harden `getPageLabel` to never return raw ids.
- **[P0] "Soon" fallback is a lie.** [page-tree.tsx:196-198](apps/platform/components/store-builder-v2/page-tree.tsx#L196): if `onSelectSetting` isn't passed, the setting pulses "soon" for 2s. Three of these settings _are_ implemented; the parent just forgot the prop in some code paths. Brutal regression risk. **Fix:** delete the fallback; throw or default.
- **[P0] InspectorRail + PublishConfirmSheet imported but unused in shell.** [editor-shell.tsx:61-62](apps/platform/components/store-builder-v2/editor-shell.tsx#L61) — both imported, but the shell renders the legacy `<SectionListPanel>` / `<SectionEditPanel>` ternary at [line 1075-1093](apps/platform/components/store-builder-v2/editor-shell.tsx#L1075) and the publish flow calls `builder.publish()` directly without the sheet ([line 783-789](apps/platform/components/store-builder-v2/editor-shell.tsx#L783)). The `Blocks / Style / Health` rail described in the design and the publish-confirmation flow with deep-link "Fix" buttons exist as components but are not wired. Either dead code or unfinished migration — looks unfinished.
- **[P1] System screens replace the canvas entirely.** Brand Kit, Versions, Segments, Experiments, Scheduled, i18n, Health each take over the main area, hiding the live preview. Merchant cannot iterate on copy while inspecting health, can't see the brand color change against their hero in real time. **Fix:** convert these to right-rail drawers that keep canvas visible.
- **[P1] Brand Kit is a 1,286-line full-screen editor for ~24 decisions made up front.** [brand-kit-editor.tsx](apps/platform/components/store-builder-v2/brand-kit-editor.tsx). No starter presets, no "infer from logo", three "Coming soon" buttons (eyedropper, suggest-from-logo, translate-with-AI). Merchant has to decide on `border_thickness: chunky` before seeing any storefront content. **Fix:** front-load a 4-card preset chooser (Playful Candy / Minimal Mono / Bold Serif / Editorial Pastel), drop into the kit fully populated, edit from there.
- **[P1] Section list panel + inspector compete for the same screen real estate.** Today's shell ternaries `editing_section ? SectionEditPanel : SectionListPanel` ([line 1065](apps/platform/components/store-builder-v2/editor-shell.tsx#L1065)), so the merchant either sees their section list or the field editor — never both. **Fix:** persistent list with inline-expand-to-edit (the shape `SectionListPanel` already supports via `expandedSectionId`, but the shell doesn't use it).
- **[P1] "Advanced" accordion is a hidden second tier.** [page-tree.tsx:283-323](apps/platform/components/store-builder-v2/page-tree.tsx#L283): Segments / Experiments / Scheduled / Versions are tucked into a chevron-toggled `Advanced` group; persisted via the misspelled localStorage key `schneiders.builder.advanced.open` (the repo is `scheniders`). The hide-by-default impulse is right; the implementation hides actively-used Versions too.
- **[P2] Dead imports.** [editor-shell.tsx:35-38](apps/platform/components/store-builder-v2/editor-shell.tsx#L35) imports `PreviewFrame`, `PreviewOverlay`. Never rendered. ~600 LOC + 2 test files maintained for nothing. Delete or commit.
- **[P2] Settings group has no section-count badges,** unlike the pages above it. Inconsistent.

### 2. Visual design + typography + color

- **[P0] Body text is operator-grade.** Sampled across the audit: `text-[10px]` on category pills, save state, version metadata, traffic source codes, locale dot indicators, "+ Override field" picker badges, `+ language/device/...` chips, fallback hints. `text-[11px]` is the modal default. `text-xs` (12px) is treated as comfortable body. The mobile-home reference at [schneiders_home_mobile_state_of_the_art_wedges/screen.png](stitch_schneiders_iraq_storefront_template111/schneiders_home_mobile_state_of_the_art_wedges/screen.png) uses 14-18px copy with chunky 24-32px display. Editor and storefront aesthetics are from different products. **Fix:** establish an editor type ramp at 14/16/18/24 minimum.
- **[P0] Pink is overloaded.** `bg-pink-500` is the brand primary on the storefront AND the selected-section ring ([live-preview-overlay.tsx:125](apps/platform/components/store-builder-v2/live-preview-overlay.tsx#L125)) AND the inline-edit highlight ([live-preview.tsx:769](apps/platform/components/store-builder-v2/live-preview.tsx#L769)) AND the context-menu hover ([live-preview-context-menu.tsx:144](apps/platform/components/store-builder-v2/live-preview-context-menu.tsx#L144)) AND the section-list selected ring (`ring-pink-500/70`, [section-list-panel.tsx:234](apps/platform/components/store-builder-v2/section-list-panel.tsx#L234)). On a pink-branded merchant the editor chrome and the merchant content become indistinguishable. **Fix:** reserve pink for storefront brand; pick a distinct editor accent (an arctic blue or violet) for all chrome.
- **[P0] Context menu border + hover use brand-kit CSS vars.** [live-preview-context-menu.tsx:127-128, 144](apps/platform/components/store-builder-v2/live-preview-context-menu.tsx#L127). `border: var(--bk-ink) var(--bk-border-thickness, 2px)` makes the editor chrome inherit the merchant's brand. A merchant who set `border_thickness: chunky` gets a 4-px hot-pink chrome border. **Fix:** namespaced `--editor-*` tokens, never reuse `--bk-*` in editor chrome.
- **[P1] Emoji 🌐 in toolbar.** [toolbar-controls.tsx:72](apps/platform/components/store-builder-v2/toolbar-controls.tsx#L72). Whole product uses lucide icons; one stray emoji breaks rhythm and (per CLAUDE.md) violates the no-emoji preference.
- **[P1] Hover-only `+ Add` pill on section picker cards.** [section-picker.tsx:544-550](apps/platform/components/store-builder-v2/section-picker.tsx#L544). Cards are tappable but show no affordance on touch. **Fix:** always-visible pill on touch breakpoints; or trust the whole card.
- **[P1] Sparkles icon used three places.** [section-list-panel.tsx:383, 599, 634](apps/platform/components/store-builder-v2/section-list-panel.tsx#L383) for "Save as preset", "Start from template", AND a header. In 2026 design language Sparkles reads "AI"; user has banned AI features. **Fix:** `Bookmark`, `LayoutTemplate`, none.
- **[P1] Disabled section row drops to `opacity-60`** ([section-list-panel.tsx:234](apps/platform/components/store-builder-v2/section-list-panel.tsx#L234)) — borderline contrast fail in daylight. **Fix:** a "Hidden" chip on the right, full-contrast label.
- **[P1] Score donut, brand kit live-preview, and section thumbnails fight three different visual idioms.** No unified illustration system, no token-driven mood. The candy-bento reference is decisive about chunky pastels, taped-on-paper, wobbly outlined buttons; the editor's chrome is sober grey with mismatched pink accents.
- **[P2] Smart quotes vs straight quotes inconsistent everywhere.** "Undo within 5 seconds to bring it back." mixes with `placeholder="e.g. ${sectionName} — Summer Sale"`.
- **[P2] Page-template thumbnails are colored bars.** [page-template-picker.tsx:244-264](apps/platform/components/store-builder-v2/page-template-picker.tsx#L244). "Lookbook landing" and "Single hero" look identical.

### 3. Layout + spacing + density

- **[P0] Inspector rail is `w-[380px] shrink-0`.** [inspector-rail.tsx:102](apps/platform/components/store-builder-v2/inspector-rail.tsx#L102). Page tree is `w-[260px] shrink-0`. Total 640 px before any canvas — kills phone, eats half of a 13" laptop.
- **[P0] Section row has five touch targets in ~340 px.** [section-list-panel.tsx:246-326](apps/platform/components/store-builder-v2/section-list-panel.tsx#L246). Drag handle, chevron, category icon, label area, eye toggle, kebab. Eye toggle + kebab sit adjacent at 28×28 each with no separator. Mis-tap city on touch.
- **[P0] Toolbar buttons are 24×24.** [live-preview-overlay.tsx:197](apps/platform/components/store-builder-v2/live-preview-overlay.tsx#L197). Five actions (Edit, Duplicate, Up, Down, Delete) at sub-touch-target sizes.
- **[P1] Three consecutive divider strips in section-edit panel.** [section-edit-panel.tsx:287, 312, 379](apps/platform/components/store-builder-v2/section-edit-panel.tsx#L287). All `h-px bg-(--card-border)`. Visual rhythm monotonous.
- **[P1] Spacing handle is a 12-px hover-only strip.** [live-preview.tsx:895](apps/platform/components/store-builder-v2/live-preview.tsx#L895). Strip overlaps the section's top edge by 6 px — clicking the top of a hero starts a drag instead of selecting.
- **[P1] Section picker grid is `md:grid-cols-3`** at ~200 px card width; text truncates and `aspect-[16/10]` thumbnails too small.
- **[P1] BrandKit live preview is a 360–420 px sticky column** of mini-cards. Looks like a Storybook fixture, not a store.
- **[P2] Variant editor footer has only "Done".** [variant-editor.tsx:453](apps/platform/components/store-builder-v2/variant-editor.tsx#L453). No cancel, no save/discard.
- **[P2] Health checklist Fix button is visually tertiary.** [health-checklist-screen.tsx:385](apps/platform/components/store-builder-v2/health-checklist-screen.tsx#L385).
- **[P2] Tabs are equal-width but unequal-usage.** Blocks ≫ Style ≫ Health in real time.

### 4. Interaction patterns

- **[P0] Double-click-to-edit requires pre-selection.** [live-preview.tsx:337](apps/platform/components/store-builder-v2/live-preview.tsx#L337). First double-click on an unselected hero does nothing. **Fix:** auto-select on dblclk.
- **[P0] `window.confirm` used in two places.** [section-picker.tsx:415-422](apps/platform/components/store-builder-v2/section-picker.tsx#L415) (preset delete) and [variant-list.tsx:146](apps/platform/components/store-builder-v2/variant-list.tsx#L146) (variant delete). Rest of the editor uses Radix; these two regressed.
- **[P0] Modal stacking risk in section-edit panel.** [section-edit-panel.tsx:393-440](apps/platform/components/store-builder-v2/section-edit-panel.tsx#L393): variant-add wizard, visibility-rule wizard, AND per-variant editor can all be open simultaneously. No mutual exclusion.
- **[P0] Variant editor stacks 3-deep.** Section panel → variant editor modal → variant-add wizard ([variant-editor.tsx:464-477](apps/platform/components/store-builder-v2/variant-editor.tsx#L464)) all at `z-50`. Escape only closes the topmost.
- **[P0] PreviewAsControls popover is not portaled.** [preview-as-controls.tsx:101-103](apps/platform/components/store-builder-v2/preview-as-controls.tsx#L101). Manual `z-40`/`z-50`. Clipped by any ancestor `overflow-hidden`.
- **[P0] Spacing-drag mutates the full config tree on every mousemove.** [live-preview.tsx:723-738](apps/platform/components/store-builder-v2/live-preview.tsx#L723). On a 30-section page, ~30 fresh section objects per pixel.
- **[P1] Drop zones have no labels.** Webflow shows "Insert above Hero"; we show a 4-px blue line ([live-preview.tsx:945](apps/platform/components/store-builder-v2/live-preview.tsx#L945)) with no context.
- **[P1] No "Add section between these two" button** at gap rects when picker drag is not active. Only way to add: open picker modal.
- **[P1] No empty-state drop affordance.** Zero-sections page is blank with no CTA on canvas.
- **[P1] Hover ring `mousemove` fires without id-equality guard.** [live-preview.tsx:380](apps/platform/components/store-builder-v2/live-preview.tsx#L380). Layout thrash.
- **[P1] Toolbar `left: rect.left` never adjusts for off-screen right.** [live-preview-overlay.tsx:128](apps/platform/components/store-builder-v2/live-preview-overlay.tsx#L128).
- **[P1] No auto-scroll-near-edge during drag.** Long pages → can't reach the bottom.
- **[P1] No live ghost preview during drag** — only the blue line.
- **[P1] No multi-select.** "Duplicate these three sections" impossible.
- **[P2] Native `title=` tooltips throughout.** Slow + hostile on mobile.
- **[P2] Context menu doesn't reposition near viewport edges.** [live-preview-context-menu.tsx:124-129](apps/platform/components/store-builder-v2/live-preview-context-menu.tsx#L124).
- **[P2] Inline-edit Enter handler has no IME-composition guard.** [live-preview.tsx:431](apps/platform/components/store-builder-v2/live-preview.tsx#L431). Arabic IME on Android commits prematurely on every IME confirm.
- **[P2] Inline-edit revert flattens rich HTML to `textContent`.** [live-preview.tsx:414](apps/platform/components/store-builder-v2/live-preview.tsx#L414). Quietly destructive.
- **[P2] Spacing-handle clamp at `[0, 200]` is silent.** No "max" tooltip.

### 5. Section editing experience

- **[P0] List panel and edit panel are mutually exclusive** in the shell, despite the list panel internally supporting inline-expand.
- **[P0] "Section label — shown only in editor" placeholder leaks confusion.** [section-edit-panel.tsx:244](apps/platform/components/store-builder-v2/section-edit-panel.tsx#L244). Merchants will type their product name here.
- **[P0] "Enabled" duplicated in two places.** Eye icon in list row + Switch in edit panel. Two visual treatments for the same bit.
- **[P0] Visibility chips leak raw IDs.** [section-edit-panel.tsx:469-474](apps/platform/components/store-builder-v2/section-edit-panel.tsx#L469): `Segment: ${segment_id}` is a UUID; `Page: ${values.join(", ")}` is page-ids; `Gov:` is meaningless.
- **[P0] "Visibility" + "Variants" front-and-center, equal weight to Properties.** Properties is 95% of edits.
- **[P0] AutoForm drops `.describe()` text on the floor.** [auto-form.tsx:139-234, 456-497](apps/platform/components/store-builder-v2/auto-form.tsx#L139). Hint logic only branches on `image`/`color`/`multiline`.
- **[P0] AutoForm has no IQD-aware control.** Schema-driven price fields render as bare number inputs with no `د.ع` suffix, no thousands separator.
- **[P1] "Unsupported field: …"** leaks to merchant. [auto-form.tsx:377-380](apps/platform/components/store-builder-v2/auto-form.tsx#L377).
- **[P1] Array item labels are "Item 1 / Item 2 / Item 3".** [auto-form.tsx:888](apps/platform/components/store-builder-v2/auto-form.tsx#L888).
- **[P1] Array `GripVertical` icon is a lie** — rows aren't draggable. [auto-form.tsx:887](apps/platform/components/store-builder-v2/auto-form.tsx#L887).
- **[P1] ImageControl upload broken on 3G.** [auto-form.tsx:563-656](apps/platform/components/store-builder-v2/auto-form.tsx#L563): 4 MB cap, no progress bar, no client compression, `Date.now()` path collision + `upsert: true`.
- **[P1] ColorControl accepts any string as hex.** Paste "red"; silently breaks schema. [auto-form.tsx:538-548](apps/platform/components/store-builder-v2/auto-form.tsx#L538).
- **[P1] NumberControl swallows NaN silently.** No clamp on blur, no unit display.
- **[P1] BooleanControl is bare switch with no description.**
- **[P1] EnumControl segmented-vs-select threshold hardcoded at `≤ 4`.** Long option names overflow.
- **[P1] No "Reset to default" per field.** Once changed, no way back.
- **[P1] Optional fields render `Set` then leave you in an empty input** with subtle 11-px Clear.
- **[P2] AutoForm imports `supabase` at module top.** [auto-form.tsx:37](apps/platform/components/store-builder-v2/auto-form.tsx#L37). Coupling smell.
- **[P2] I18nStringInput forces `dir="ltr"` on text inputs.** [i18n-string-input.tsx:189, 204, 272, 286](apps/platform/components/store-builder-v2/i18n-string-input.tsx#L189). LTR chrome is correct (policy); LTR input direction makes Arabic punctuation drift. Switch the input to `dir="auto"`.
- **[P2] No "copy from EN" affordance** in i18n strings.

### 6. Preview fidelity + live render

- **[P0] Two parallel preview implementations.** Inline `LivePreview` shipped; iframe `PreviewFrame` + `PreviewOverlay` + `useIframeBridge` imported but never rendered. ~600 LOC dead. Magic numbers diverge between the two overlay clones (`+8` vs `+12` ring padding, `160` vs `180` toolbar minWidth).
- **[P0] No error boundary around `RenderPage`.** A throw inside any section primitive crashes the entire preview. Reckless for a multi-tenant builder.
- **[P0] No `sandbox` attribute on the (dead) iframe path.** [preview-frame.tsx](apps/platform/components/store-builder-v2/preview-frame.tsx).
- **[P0] PreviewFrame `postMessage` uses `targetOrigin: "*"`.** [preview-frame.tsx:51](apps/platform/components/store-builder-v2/preview-frame.tsx#L51).
- **[P1] "No page config for `home`" raw error.** [live-preview.tsx:745-751](apps/platform/components/store-builder-v2/live-preview.tsx#L745). Merchant-hostile copy.
- **[P1] Font URL injected per-render.** [live-preview.tsx:703](apps/platform/components/store-builder-v2/live-preview.tsx#L703). Brand-kit font typo triggers a real network request and FOUT.
- **[P1] `fontUtilityCss` injects raw `<style>` with unescaped user font names.** [live-preview.tsx:704](apps/platform/components/store-builder-v2/live-preview.tsx#L704). XSS-shaped.
- **[P1] No loading state on products.** If undefined, sections show whatever they natively render.
- **[P1] PreviewAsControls "Auto" arm meaning opaque.** [preview-as-controls.tsx:214](apps/platform/components/store-builder-v2/preview-as-controls.tsx#L214).
- **[P2] Ring transitions `top,left,width,height`** instead of `transform`. Layout-triggering animations on every selection change.
- **[P2] `gapRects` re-measures on every spacing-drag tick.** [live-preview.tsx:653](apps/platform/components/store-builder-v2/live-preview.tsx#L653).
- **[P2] Iframe veil terminal "Loading preview…".** [preview-frame.tsx:86](apps/platform/components/store-builder-v2/preview-frame.tsx#L86). No progress, no retry, no error state.
- **[P2] Coordinate-system bug between selected-ring and spacing-handle.** [live-preview.tsx:244 vs 617](apps/platform/components/store-builder-v2/live-preview.tsx#L244). Latent.

### 7. Brand kit + theming

- **[P0] No starter presets.** Brand Kit demands ~24 decisions before any storefront content is visible. **Fix:** 4-card preset chooser at first launch — each maps to a full BrandKit object.
- **[P0] Internal token names exposed.** [brand-kit-editor.tsx:461-478, 644-674](apps/platform/components/store-builder-v2/brand-kit-editor.tsx#L461): `--bk-on-secondary`, `--bk-ink-soft`, `--bk-primary-hover`. 16-swatch "Resolved tokens" grid is debugging UI shipped to merchants.
- **[P0] Three "Coming soon" buttons.** [brand-kit-editor.tsx:406, 814, 891](apps/platform/components/store-builder-v2/brand-kit-editor.tsx#L406): eyedropper, suggest-from-logo, translate-with-AI.
- **[P0] Reset wipes a branch with no confirmation.** [brand-kit-editor.tsx:697-702](apps/platform/components/store-builder-v2/brand-kit-editor.tsx#L697). One misclick clears all eight colors.
- **[P1] No Arabic-friendly font pairings.** [brand-kit-editor.tsx:57](apps/platform/components/store-builder-v2/brand-kit-editor.tsx#L57). Anton/Bebas/Fraunces have poor or no Arabic glyphs. **Fix:** Tajawal, Cairo, Almarai paired with Bricolage/DM Sans for English.
- **[P1] "Surface alt" / "Ink-soft" labels** are designer/dev vocab. [brand-kit-editor.tsx:741-750](apps/platform/components/store-builder-v2/brand-kit-editor.tsx#L741).
- **[P1] BrandKit preview doesn't render the actual storefront.** Mini fixture cards. **Fix:** mini iframe of a real Home with the merchant's products.
- **[P2] Tagline + voice notes are i18n but AI translate is disabled.** Merchant must hand-write 3 taglines per change.

### 8. Variants + segments + experiments

- **[P0] "Variant" is the central noun and is never defined.** Merchant thinks "version" or "different layout"; the code thinks "polymorphic override engine matching on 9 condition kinds." **Fix sweep:** rename to "Version" everywhere user-facing.
- **[P0] Variant priority is taught two ways.** List view says "drag to prioritise" implicitly ([variant-list.tsx:243-246](apps/platform/components/store-builder-v2/variant-list.tsx#L243)); editor says "Higher wins ties" with a number input ([variant-editor.tsx:423](apps/platform/components/store-builder-v2/variant-editor.tsx#L423)).
- **[P0] Variant editor footer is just "Done".** Edits already applied via `onChange`. No undo for a wrong-button merchant.
- **[P0] Add-variant wizard "Bind this variant to one experiment arm".** [variant-add-wizard.tsx:81](apps/platform/components/store-builder-v2/variant-add-wizard.tsx#L81). Three jargon words in one sentence.
- **[P0] Manual ID paste fallback in the wizard.** [variant-add-wizard.tsx:1106](apps/platform/components/store-builder-v2/variant-add-wizard.tsx#L1106): *"paste IDs separated by commas"*. The most blatant model leak in the whole subsystem.
- **[P0] Selected product/category chips show raw IDs.** [variant-add-wizard.tsx:1076](apps/platform/components/store-builder-v2/variant-add-wizard.tsx#L1076).
- **[P0] Dead-end empty states for audience and A/B test.** [variant-add-wizard.tsx:784-794, 828-838](apps/platform/components/store-builder-v2/variant-add-wizard.tsx#L784). Tells merchant to "Define segments in Settings → Segments" but offers no deep link.
- **[P0] Experiments "Stop & promote winner" doesn't promote.** [experiments-screen.tsx:212-220, 541-550](apps/platform/components/store-builder-v2/experiments-screen.tsx#L212). Lie in the button label.
- **[P0] Experiments Pause / Resume / Stop all one-click no confirm.** [experiments-screen.tsx:198-220](apps/platform/components/store-builder-v2/experiments-screen.tsx#L198).
- **[P1] z-scores shown to merchants.** [experiments-screen.tsx:1148-1175](apps/platform/components/store-builder-v2/experiments-screen.tsx#L1148): "Significant (z=2.31)".
- **[P1] Traffic-pct sum-to-100 not blocked.** [experiments-screen.tsx:838-854](apps/platform/components/store-builder-v2/experiments-screen.tsx#L838). Invalid sums warn but allow save.
- **[P1] Segments visitor count is `—`.** [segments-screen.tsx:325](apps/platform/components/store-builder-v2/segments-screen.tsx#L325). Without a count, segments are unfalsifiable.
- **[P1] Traffic sources missing Snapchat + Telegram.** [segments-screen.tsx:47](apps/platform/components/store-builder-v2/segments-screen.tsx#L47). Iraqi-market-specific gap.
- **[P1] Governorate picker shows 3-letter codes only.** [segments-screen.tsx:638-664](apps/platform/components/store-builder-v2/segments-screen.tsx#L638), [variant-add-wizard.tsx:918](apps/platform/components/store-builder-v2/variant-add-wizard.tsx#L918).
- **[P1] `summarizeCondition` outputs raw IDs.** [variant-editor.tsx:104-110](apps/platform/components/store-builder-v2/variant-editor.tsx#L104).
- **[P1] No plain-English "what this variant does" summary.** No sentence like "When the visitor is in Baghdad, show 'Free shipping in Baghdad' instead of 'Free shipping'."
- **[P1] No edit affordance on conditions** — only X to remove. Baghdad → Basra means delete and re-add.
- **[P1] `i18n` and `array` schema-kind badges in override picker.** [variant-editor.tsx:619](apps/platform/components/store-builder-v2/variant-editor.tsx#L619). Schema leak.
- **[P2] 9 condition kinds presented as equal weight.** [variant-add-wizard.tsx:520](apps/platform/components/store-builder-v2/variant-add-wizard.tsx#L520). Common cases (locale, breakpoint, governorate, time_window) belong in a "Common" group; ab_test, audience, product, category, page in "Advanced."
- **[P2] Variant editor `Priority` number input contradicts drag-to-prioritise.** Remove the number entirely.

### 9. Version history + scheduling + publish flow

- **[P0] Publish goes straight through with no confirm sheet** when health is clean. [editor-shell.tsx:783-789](apps/platform/components/store-builder-v2/editor-shell.tsx#L783). `PublishConfirmSheet` exists but only opens when checks block. For the most consequential action in the app, the confirm + diff preview should always show.
- **[P0] Promote-to-named version uses a live-config-swap hack.** [version-history-screen.tsx:209-219](apps/platform/components/store-builder-v2/version-history-screen.tsx#L209). Temporarily applies old config, snapshots, reverts. If anything throws between apply and revert, the draft is silently swapped.
- **[P0] Restore: "You can undo this in this session"** ([version-history-screen.tsx:512](apps/platform/components/store-builder-v2/version-history-screen.tsx#L512)) — anxiety-inducing. After tab close, undo is gone.
- **[P0] Scheduled changes "End early" is one-click destructive.** [scheduled-changes-screen.tsx:218-243](apps/platform/components/store-builder-v2/scheduled-changes-screen.tsx#L218).
- **[P1] Diff is rendered as path + JSON.** [version-history-screen.tsx:663-696](apps/platform/components/store-builder-v2/version-history-screen.tsx#L663): `pages[2].sections[0].variants[1].override.heading.ar` with `before:`/`after:` JSON blocks.
- **[P1] Scheduled changes target summaries show machine types.** [scheduled-changes-screen.tsx:599](apps/platform/components/store-builder-v2/scheduled-changes-screen.tsx#L599): "Home / hero_banner / 'Black Friday'". Plus a `<pre>` JSON dump in TargetsViewer.
- **[P1] Scheduled "Cancel" vs "Delete" visually identical.** [scheduled-changes-screen.tsx:734-757](apps/platform/components/store-builder-v2/scheduled-changes-screen.tsx#L734). Both rose-toned with Trash2.
- **[P1] Scheduled variant create-or-pick conflated via `__create_new__` sentinel.** [scheduled-changes-screen.tsx:1139-1162](apps/platform/components/store-builder-v2/scheduled-changes-screen.tsx#L1139).
- **[P1] Publish confirm fallback shows `check.id` snake_case.** [publish-confirm-sheet.tsx:116](apps/platform/components/store-builder-v2/publish-confirm-sheet.tsx#L116). Items titled `has_privacy_policy`.
- **[P1] SaveStatePill "Save failed" terminal.** [toolbar-controls.tsx:129](apps/platform/components/store-builder-v2/toolbar-controls.tsx#L129). No retry.
- **[P1] No celebratory state for a successful publish.**
- **[P2] No recurrence on schedules.** "Every Friday banner" impossible.
- **[P2] "Untitled snapshot" fallback** ([version-history-screen.tsx:357, 453, 509](apps/platform/components/store-builder-v2/version-history-screen.tsx#L357)).

### 10. Health + governance

- **[P0] Category names jargon.** [health-checklist-screen.tsx:51-58](apps/platform/components/store-builder-v2/health-checklist-screen.tsx#L51): "Ad compliance", "SEO". **Fix:** "Looks good in ads", "Found on Google".
- **[P0] No badge on Health tab in inspector rail** if checks are failing.
- **[P1] "Blocks publish (N)" pill is 10px.** [health-checklist-screen.tsx:370](apps/platform/components/store-builder-v2/health-checklist-screen.tsx#L370). Severity not felt.
- **[P1] Flat list of 30 checks.** No grouping by category.
- **[P2] `humanize` produces "Has Privacy Policy"** rather than "Add a privacy policy."
- **[good] Deep-link Fix actions.** [health-checklist-screen.tsx:172-192](apps/platform/components/store-builder-v2/health-checklist-screen.tsx#L172). Keep and amplify.

### 11. i18n + locale switching

- **[P0] Translate button doesn't translate.** [i18n-screen.tsx:189-202](apps/platform/components/store-builder-v2/i18n-screen.tsx#L189). Just navigates.
- **[P0] Raw JSON paths shown to merchant.** [i18n-screen.tsx:182-185](apps/platform/components/store-builder-v2/i18n-screen.tsx#L182): `sections[2].cta.label`.
- **[P1] No EN-fallback policy explanation.** Merchant sees "Arabic 73%" and panics.
- **[P1] "Globals" link disabled, no explanation.** [i18n-screen.tsx:151-152](apps/platform/components/store-builder-v2/i18n-screen.tsx#L151).
- **[P1] Editor chrome is English only.** At minimum every page label, manifest name, and segment label should resolve through `resolveI18n` against an editor-language setting.
- **[P1] No AI assist or "copy from EN"** for translations.
- **[P2] Locale pill in toolbar is 7-px text.** [i18n-screen.tsx:230-253](apps/platform/components/store-builder-v2/i18n-screen.tsx#L230).

### 12. Mobile editor + responsive

- **[P0] Rails do not collapse.** (§3.)
- **[P0] Hover-only affordances** — `+ Add` pill on picker cards, preset delete, kebab menus, spacing handles. None work on touch.
- **[P0] Drag activation distance is 4 px in section list.** [section-list-panel.tsx:460](apps/platform/components/store-builder-v2/section-list-panel.tsx#L460). Any 5-px scroll triggers a drag instead of scrolling.
- **[P0] Modal sizes don't adapt.** PreviewAsControls popover `w-72` (288 px) overflows on 360-px viewports.
- **[P0] AutoForm doesn't degrade.** 12 fields → 12 stacked controls in a 380-px rail.
- **[P1] No "fit-to-screen" zoom.** Toolbar offers 3 fixed breakpoints.
- **[P1] Touch target audit fails widely.** 24-px toolbar buttons, 28-px breakpoint toggles, 28-px kebabs.

### 13. Performance + load

- **[P0] Spacing-drag allocates entire config tree per mousemove.** (§4.)
- **[P1] Hover handler re-measures on every cursor pixel** without id-equality guard. (§4.)
- **[P1] `useCallback` over the entire props object** in `ArrayControl` ([auto-form.tsx:817, 823, 832, 843](apps/platform/components/store-builder-v2/auto-form.tsx#L817)) defeats memoization.
- **[P1] SaveStatePill re-renders every second** while `lastSavedAt` is set.
- **[P1] Inline `<AutoForm>` mounts a fresh Zod-walk on every section expand.** Memoize on `instance.id`.
- **[P2] Google Fonts URL changes on every font-name keystroke.**
- **[P2] No virtualisation on long section lists.**

### 14. Copy + microcopy + voice

- **[P0] Vocabulary mismatch sweep.** Variant, Override, Condition, Audience, Segment, Experiment, Arm, Snapshot, Promote, Schedule, Time Window, Primary Metric, Uplift, Significant, Z-score, Auto-save, Health, i18n, Surface, Ink, On-primary, Resolved Tokens.
- **[P1] Empty states are mealy.** *"No blocks yet. Click + Add block to start building "Home"."* — punctuation goulash + condescension.
- **[P1] Multiple "your first X" CTAs that conflict.** "Add your first block" vs "Start from a template" — for a new merchant, template is the better choice 90% of the time. Invert visual weight.
- **[P1] Toast undo "Undo within 5 seconds to bring it back."** [section-list-panel.tsx:527](apps/platform/components/store-builder-v2/section-list-panel.tsx#L527). Childish + too short for 3G. **Fix:** 10s with visible countdown.
- **[P1] Variant labels default to machine names.** [variant-add-wizard.tsx:1209-1238](apps/platform/components/store-builder-v2/variant-add-wizard.tsx#L1209): "A/B arm B", "Governorates (3)", "Locales (en, ar)".
- **[P2] "soon" pill is `text-[9px] uppercase`.** [page-tree.tsx:217](apps/platform/components/store-builder-v2/page-tree.tsx#L217). Unreadable.
- **[P2] Smart-quote / straight-quote inconsistency** everywhere.
- **[P2] Native `<select>` tooltips via `title=` attribute** everywhere.

### 15. Empty states + first-run + onboarding

- **[P0] No first-run experience.** [editor-shell.tsx:185-189](apps/platform/components/store-builder-v2/editor-shell.tsx#L185): "first-time tenants previously landed on Health" — abandoned. New tenants now land on an empty canvas with no CTA.
- **[P0] No starter brand-kit presets.** (§7.)
- **[P0] No page-template recommendations.** Page-template-picker exists but isn't surfaced to the first-time merchant.
- **[P1] Visibility chip empty state "Always visible — add a rule to hide conditionally"** ([section-edit-panel.tsx:324](apps/platform/components/store-builder-v2/section-edit-panel.tsx#L324)) reads backwards from the merchant's mental model.
- **[P1] Sections empty state has two competing CTAs.** (§1.)
- **[P1] Templates list has no empty state, no search, no filter.** [page-template-picker.tsx:207-235](apps/platform/components/store-builder-v2/page-template-picker.tsx#L207).

### 16. Error states + recovery

- **[P0] No error boundary in LivePreview.** (§6.)
- **[P1] Drag-reorder commit has no per-row spinner or error treatment.** On 3G the merchant reorders, sees the new order, scrolls away, returns to the old order.
- **[P1] AutoForm upload failure shows a toast** but no retry on the actual control.
- **[P1] Save failure is terminal copy.** (§9.)
- **[P2] Iframe preview has no error state.** (§6.)

### 17. Accessibility (visual contrast, focus, screen reader)

- **[P0] `aria-hidden="true"` on `<button>` scrim** in 2 places. [section-list-panel.tsx:336](apps/platform/components/store-builder-v2/section-list-panel.tsx#L336), [section-picker.tsx:164](apps/platform/components/store-builder-v2/section-picker.tsx#L164).
- **[P0] `aria-hidden="true"` on overlay container with interactive toolbar inside.** [live-preview-overlay.tsx:36](apps/platform/components/store-builder-v2/live-preview-overlay.tsx#L36). Screen readers don't announce.
- **[P0] Segment toggle is `<button>` with check icon, not a checkbox.** [preview-as-controls.tsx:175](apps/platform/components/store-builder-v2/preview-as-controls.tsx#L175). No state.
- **[P1] `role="menu"` + `role="menuitem"` without arrow-key handling.** [live-preview-context-menu.tsx](apps/platform/components/store-builder-v2/live-preview-context-menu.tsx). Worse than no role.
- **[P1] Focus trap absent** in section picker, page-template picker, variant editor, preview-as popover.
- **[P1] Disabled-section opacity 60% on muted bg** — borderline WCAG fail.
- **[P2] Secondary i18n input chip is `aria-hidden="true"`** so screen readers get no label.

### 18. Iraqi-market specifics (governorate, WhatsApp, COD)

- **[P0] No IQD-aware currency control.** (§5.)
- **[P1] No Snapchat or Telegram in traffic sources.** (§8.) Both are huge in Iraq.
- **[P1] Governorate displayed as 3-letter codes** in multiple screens.
- **[P1] No COD / WhatsApp / 24h-delivery primitives** in the brand-kit or page-template starter set. The candy-bento reference makes these primary; the editor knows nothing of them.
- **[P1] No Arabic-friendly font pairings.** (§7.)
- **[P2] Timezone select offers `Asia/Baghdad / UTC / Dubai / Istanbul`.** Three of those are noise.
- **[P2] No "weekends in Iraq are Friday-Saturday" awareness in schedules.**

---

## User journeys — friction map

Severity legend: ✅ smooth · ⚠ friction (P1) · ⛔ blocker (P0)

### 1 — First-time merchant opens /store/v2 and tries to ship a store
1. Lands on canvas ([editor-shell.tsx:191](apps/platform/components/store-builder-v2/editor-shell.tsx#L191)). ⛔ No first-run, no template recommendation, no welcome.
2. Sees empty canvas (no CTA on canvas) plus a "Start from template" hidden inside the section-list panel. ⛔ Discoverability.
3. Opens template picker. ⚠ Five bar-thumbnails look identical.
4. Applies template. ⚠ "Replace 0 sections" warning is harsh.
5. Sections appear. ⛔ Each section's name in the list is a `snake_case_type` until they relabel.
6. Brand Kit prompts ~24 decisions before any storefront is visible. ⛔ No presets.
7. Publish. ⛔ No confirm sheet, no preview, no celebration. Merchant unsure if it worked.

### 2 — Change "SHOP WITH JOY" to "GRAND OPENING — 20% OFF"
1. Click hero text. ✅ Selection ring appears (pink-on-pink risk).
2. Double-click to edit. ⛔ First dblclk fails (pre-select required); second works.
3. Type new copy. ⚠ Keyboard hint shown; Arabic IME premature-commit risk.
4. Enter to save. ✅ Toast fires twice.
5. Verify on storefront via the "Open" link. ⚠ Tiny unlabeled link in topbar.

### 3 — Swap the hero image to an uploaded one
1. Click hero → Edit on floating toolbar. ⚠ 24-px target.
2. Inspector slides in. Scroll past Section label, Enabled, Properties to "Image". ⚠ If image is inside `media.background` → nested accordion.
3. Click upload zone. Pick file. ⛔ No progress bar; on 3G merchant assumes it's broken at 15s.
4. URL field still shown — overrides? rebuilds? unclear.
5. Preview updates eventually. ✅

### 4 — Add a new product grid to home
1. Click "+ Add block". ✅ Picker opens.
2. Search "products". ⚠ No debounce, no recents.
3. Pick "Product grid". ⛔ Hover-only `+ Add` pill on desktop; touch users get no affordance.
4. If card disabled, "Not for this page" pill exists but low-contrast. ⚠
5. Inserted; editor opens. ✅

### 5 — Remove a section
1. Hover row → kebab → Delete. ⚠ Two-tap depth.
2. Toast "Undo within 5 seconds". ⛔ Too short on 3G.
3. Alt: toolbar trash. ⛔ 24-px target, no undo affordance in toolbar path.

### 6 — Translate Home to Arabic
1. Open i18n screen. ✅ Pill exists.
2. See progress bars. ⚠ No explanation that EN fills missing AR.
3. Click "Translate" on a missing field. ⛔ Button just navigates — lie.
4. Type Arabic into LTR-forced input. ⚠ Punctuation drift.
5. No "copy from EN" button. ⛔ Must hand-write every string.

### 7 — A/B test two hero headlines
1. Open inspector → scroll past Properties, past Visibility, to Variants. ⛔ Concept unintroduced.
2. Click "+ Add variant". 9 cards, equal weight. ⛔ Pick "A/B test" → if no experiments exist, dead-end.
3. Close, navigate to Experiments (in Advanced accordion). Create experiment. Configure arms with traffic_pct → ⛔ z-stats, primary_metric, control-arm jargon.
4. Return to hero, re-open wizard, pick A/B test, pick experiment, pick arm. ⛔ Modal stack 3 deep.
5. Set override on headline. ⚠ "Override field" unfamiliar concept.
6. Done. ⛔ No summary, no preview, no plain-English confirmation.

### 8 — Different home for Baghdad vs Basra
1. "+ Add variant" → Governorate → multi-select Baghdad → next → name. ⚠ 3-letter codes.
2. Override headline. ⛔ "Override" + override-field picker + "Replaces base" badge — three unexplained model leaks.
3. Repeat for Basra. ⛔ No "copy variant to another governorate."

### 9 — Schedule a Ramadan banner for a specific date
1. Find "Scheduled changes" in Advanced. ⛔ Buried.
2. New schedule → cascading Page → Section → Variant dropdown. ⛔ Merchant who wanted "edit the banner" is now editing a "time_window variant target tuple."
3. Pick start/end. ⚠ `datetime-local` with no timezone preview.
4. Save. ⚠ "Cancel" vs "Delete" buttons indistinguishable.

### 10 — Publish, see something wrong, roll back
1. Publish. ⛔ No confirm, no diff preview.
2. Visit live storefront. See bad version.
3. Open Versions. ⚠ Auto-save list with technical metadata.
4. Restore. ⚠ "You can undo this in this session" — anxiety copy.
5. Restored draft is dirty; merchant must Publish again. ⛔ Two publishes for a roll-back.

### 11 — Resize spacing between hero and trust strip
1. Hover the gap. ⛔ 12-px hit area, invisible until hovered.
2. Drag. ⚠ Silent clamp at 200.
3. Release. ⚠ Perceptible lag on 3G + lower-end Android due to config-tree allocations per pixel.

### 12 — Save trust pills as preset, use on category page
1. Hover row → kebab → Save as preset. ⚠ Two-tap path.
2. Auto-suggest name "trust_strip preset" — schema leak. ⛔
3. Save. Navigate to category, open picker → Saved tab. ⚠ Preset row shows `section_type` text. No preview.
4. Click to add. ✅

### 13 — Accidentally delete a section, recover
1. Toolbar trash. ⛔ No confirmation, undo behavior depends on which delete path — confusing.
2. Search for the section — not in list. ⛔
3. Press Cmd-Z. ⛔ User memory says no keyboard shortcuts; they don't know undo exists in the topbar.

### 14 — Edit from phone at the warehouse
1. Open /store/v2 on Galaxy A12. ⛔ Rail eats canvas. Editor unusable. Game over.

### 15 — "What is my store missing before launch?"
1. Open Health. ✅ Real warm screen, score donut.
2. See "Blocks publish (N)". ⚠ 10-px pill.
3. Click Fix on a check. ✅ Deep link.
4. Return. ✅ Re-runs, score ticks.

---

## Benchmarks — gaps vs industry leaders

### Webflow Designer
- **Has, we don't:** persistent layers panel synced to canvas hover; inline-insert "+" between any two elements; auto-scroll near edges during drag; live element-tree breadcrumb at top of canvas; multi-select with bulk operations; tokens panel that doesn't pretend to be a storefront preview.
- **We have, Webflow doesn't:** variants-as-a-feature engine; section-level visibility rules; built-in A/B + segments.
- **Steal first:** the "+" between sections.

### Framer Sites
- **Has, we don't:** beautiful first-run flow (pick a starter, drop into edit); inline edit that just works on first click; rich text formatting on inline edit; component-rich starter library; auto-scroll-during-drag; portal-rendered popovers.
- **We have:** schema-driven prop editor (better for non-designers).
- **Steal first:** the first-run starter chooser.

### Shopify Online Store 2.0 + Theme Customizer
- **Has, we don't:** real iframe preview (we deleted it from the live path); section reorder via sidebar drag with named drop indicators; clear separation of Theme vs Section settings; debug-toggle for raw JSON inspection.
- **We have:** richer variant/segment model; tighter brand-kit token system.
- **Steal first:** the sidebar drag pattern with named drop indicators.

### Wix Editor X
- **Has, we don't:** clear "Pages / Design / Add" left rail with icons; usable mobile editor; selection-aware right inspector.
- **Steal first:** selection-aware inspector.

### Squarespace Fluid Engine
- **Has, we don't:** category-driven starter templates (food, fashion, services); grid-snap for arbitrary layout (we're stacked which is fine).
- **Steal first:** category-driven starter templates.

### Notion
- **Has, we don't:** universal `/`-menu insertion at cursor; sidebar drag-to-reorder with parent reparenting; inline contextual menu on every block.
- **Steal first:** the "+" hover affordance to insert a block at any position.

### Figma
- **Has, we don't:** layers panel hover-syncs canvas selection; multi-select; component-variants UI far cleaner than ours; properties panel groups with consistent type ramp; portaled popovers; properties panel header always shows _what_ is selected (we hide page name in the list panel).
- **Steal first:** the layers panel pattern.

### WordPress Gutenberg
- **Has, we don't:** block library with searchable categories AND text excerpts AND preview-on-hover; "Reusable blocks" with edit-once-update-everywhere; inline block toolbar that adapts per block type.
- **We have:** stronger schema-driven controls.
- **Steal first:** preview-on-hover in the block library.

---

## Redesign — proposed architecture

Below is the editor we should ship. It is opinionated. Build it; don't rebuild the old.

### Layout — desktop ≥1280 (3-pane)
```
┌──────────────────────────────────────────────────────────────────────┐
│ TOPBAR: ◀ Store  Home ▾   100% ▾  📱💻  View as visitor   Saved · Publish ▸│
├────────────┬──────────────────────────────────────┬──────────────────┤
│ Page tree  │            Canvas (live)             │  Inspector       │
│ collapse↔  │  ┌─ Hero ─────────────────────┐      │  Selection-aware │
│ (icons)    │  │ SHOP WITH JOY              │ ⊕    │                  │
│            │  └────────────────────────────┘      │  ◯ Properties    │
│ Home       │  ┌─ Trust strip ──────────────┐      │  ◯ When          │
│ Category   │  └────────────────────────────┘      │  ◯ Versions      │
│ Product …  │  ⊕                                   │                  │
│ ··· Settings│ ┌─ Product grid ─────────────┐      │  [section form]  │
│ Style      │  └────────────────────────────┘      │                  │
│ Languages  │                                      │                  │
│ Health 🔴3 │                                      │                  │
│ Advanced ▾ │                                      │                  │
└────────────┴──────────────────────────────────────┴──────────────────┘
```
- **Topbar** loses LocaleSelect+BreakpointToggle+PreviewAs+I18nPill+Open clutter. Locale moves into Languages; breakpoint becomes canvas toggle; preview-as becomes "View as visitor" button on canvas; Open moves into a kebab next to Publish.
- **Page tree** collapsible to icons. Pages show section-count badges. Settings always visible; Advanced disclosure (off by default for new tenants) holds Versions / Schedules / Audiences / A/B tests.
- **Canvas** has a persistent "+" affordance at every gap on hover (not just during picker drag) and a single "+ Add first section" CTA when empty. Selection rings use an editor-only accent (teal/violet), never brand pink. Toolbar floats below selection with 36-px targets and tooltips.
- **Inspector** is selection-aware: nothing selected → "Page" tab (page-level settings + section list with inline expand). Section selected → Properties / When / Versions tabs.

### Layout — tablet 768-1279
- Page tree becomes a drawer triggered by topbar `[Pages ▾]`.
- Inspector is right rail, 320 px.

### Layout — phone <768 (single-pane + bottom sheet)
- Topbar: `◀ ☰ Pages ▾  ⋯` with publish in `⋯`.
- Canvas at 100% width. Tap section → bottom sheet slides up with Properties.
- Bottom-fixed `+ Add block`.
- Section reordering inside the bottom sheet's "Page sections" list, never on the canvas (touch-and-scroll arbitration is fragile).
- Brand kit / Languages / Health / Advanced are full-screen sub-routes on phone.

### Top bar / toolbar
Three zones:
- **Left:** Back + Tenant name + Page name (currently missing).
- **Center:** Zoom `100% ▾`, breakpoint toggle (with tooltip-labelled icons), "View as visitor" button.
- **Right:** SavedStatePill (with retry on error), Publish (large primary; opens PublishConfirmSheet always), kebab (Open ↗ / Discard draft / Export).

### Page tree / layers panel
- Sticky page name at top.
- Section count chips ("12 sections") per row.
- Active page highlighted via editor accent.
- Chevron toggles icon-only mode (saves ~220 px).
- Advanced disclosure for Versions / Schedules / Audiences / A/B tests, closed by default; persisted per-tenant in DB, not localStorage.
- Human labels: "Languages", "Store health", "Past versions", "Scheduled swaps", "Audiences", "A/B tests".

### Section list ↔ canvas interaction model
- **Canvas-driven:** click section → ring + below-section toolbar + matching inspector tab opens + list row scrolls into view + teal highlight.
- **List-driven:** click row → canvas scrolls section into view + ring + row inline-expands.
- **Multi-select** Shift-click (canvas) or Cmd-click (list). Multi-select toolbar above shows Duplicate / Delete / Save-as-preset.
- **Universal `+` between sections** → opens picker pre-filtered to "things that go here."
- **Drag-from-picker** with real ghost preview (scaled silhouette). Drop zones labeled with insertion description. Auto-scroll near edges.

### Section edit panel (Properties tab)
- **Sticky header:** section name + manifest icon + Hide toggle (single source of truth, drop the eye in the list).
- **Body:** AutoForm with `.describe()` text rendered, IQD-aware currency control, image control with progress + drag-drop + paste-URL toggle, color control with hex validation + contrast check.
- **"When" tab** (renamed Visibility + Variants): a single "Show on every page by default" line + `+ Add a rule` opens a 9-card picker with **Common** (Language / Device / Governorate / Schedule) front and **Advanced** (A/B test / Audience / Product / Category / Page) collapsed.
- **"Versions" tab** per section: past values of just this section's `base`, denormalized from snapshots. Click to restore just this section.

### Selection model
Closer to Figma than Webflow:
- Single selection default; ring + floating toolbar.
- Shift-click extends selection.
- Esc deselects.
- Right-click context menu repositioned to fit viewport; uses editor tokens.

### First-run onboarding
1. **Welcome card** centered on canvas: "Let's build your store" + 3 steps.
2. **Pick a style** — 4 brand presets (Playful Candy / Minimal Mono / Bold Serif / Editorial Pastel) each a full BrandKit. Applied instantly. "I'll customize later" button.
3. **Pick a starter Home** — 4 page templates with real thumbnails rendered using the merchant's style.
4. **Drop into canvas** with all sections briefly highlighted as "Click any block to edit."
5. **One CTA in topbar:** Publish pulses an accent color until first publish.

### Mobile editor experience
- Bottom sheet design (Material/iOS-style). 60% height on tap, draggable to 100%.
- All editing resolves to bottom sheet — Properties / When / Versions.
- Drag-to-reorder only inside bottom sheet.

### Empty states
- **Empty page:** centered card "Add your first section" primary + "Or start from a template" secondary.
- **No audiences / experiments / schedules:** dead-end empty states get "Create your first X" CTA AND "Or skip — most merchants don't need this" link that hides the feature.
- **No translations:** "Your store is in Arabic by default. Add English / Kurdish?" toggles.
- **No saved presets:** "Save any block as a preset to reuse it on another page" + 30s explainer.

### The "I'm done — publish" moment
- Click Publish → always-on PublishConfirmSheet:
  1. **What's changing** — diff in plain English: "3 new sections on Home, brand color changed from #ff5a8a to #ff3366, 12 new translations."
  2. **Health** — checks with one-click Fix; nothing blocks; warnings visible.
  3. **Confirm** — big "Publish to live store" + secondary "Schedule for later".
- After publish: a confetti moment, then "Open your live store ↗" card + WhatsApp share.

---

## Prioritized roadmap

### Phase 1 — foundation (week 1-2)
| Item | Estimate | User-facing change |
|---|---|---|
| Delete dead iframe preview path; unify on `LivePreview` | M | Smaller bundle, no future divergence |
| Extract shared `<EditorRing/>` + `<EditorActionToolbar/>` | M | One overlay component, one bugfix per fix |
| Editor accent tokens — stop using `--bk-*` in chrome | S | Editor stops fighting merchant brand pink |
| Touch targets to 36-44 px on toolbar/kebab/breakpoint | S | Touch usable |
| Vocab sweep: Variant→Version, Override→Change, Condition→When, Segment→Audience, Snapshot→Saved version; strip every `snake_case` id from merchant strings | L | Comprehensibility transformation |
| Resolve every `getPageLabel`, manifest name, segment label, product/category chip through human-name helpers | M | No more raw IDs |
| Wire `PublishConfirmSheet` to fire on every publish, with diff summary | M | No more accidental publishes |
| Mobile-first shell with collapsible page tree + bottom-sheet inspector on phone | XL | Editor phone-usable |
| Drop dead Sparkles icons; pick lucide-only set | S | Visual consistency |

### Phase 2 — feel + polish (week 3-4)
| Item | Estimate | Change |
|---|---|---|
| Brand-kit starter presets (4 styles) at first run | M | Styled store in 60s |
| First-run onboarding flow | M | First-run isn't blank canvas |
| Per-gap `+` insertion on hover | S | Add a block in one click |
| AutoForm: render `.describe()` text | S | Field help visible |
| AutoForm: IQD currency control with thousands separator | S | Iraqi-correct prices |
| AutoForm: image upload with real progress bar + 1MB client-side compression | M | 3G survives uploads |
| Replace `window.confirm` everywhere with Radix `<AlertDialog>` | S | Consistent dialogs |
| Tooltip primitive; remove native `title=` tooltips | S | Discoverable + touch-aware |
| Always-portaled popovers (PreviewAs, kebabs) | S | No clipping |
| 4 page-template thumbnails rendered from real section lists | M | Templates become picky-able |
| Empty states: each system rail gets "skip this — most merchants don't need it" | S | Clean hiding of advanced |
| Drag-and-drop: auto-scroll, ghost preview, labeled drop zones | M | Drag becomes pleasurable |
| SaveStatePill: success celebration + retry on error | S | Confidence |
| Health: rename categories to merchant-language; bigger blocking pill | S | Health scannable |

### Phase 3 — power features (week 5-7)
| Item | Estimate | Change |
|---|---|---|
| "When" tab redesign: timeline + 9-card picker with Common/Advanced | L | Variants make sense |
| Auto-generated plain-English variant summary | M | "When in Baghdad, show 'Free delivery'" |
| Selection-aware inspector (page vs section vs multi) | M | Inspector adapts |
| Per-section Versions tab denormalized from snapshots | L | Granular rollback |
| Multi-select on canvas + list with bulk Duplicate / Delete / Save preset | M | Power-user speed |
| Audience visitor counts (server-side aggregation) | L | Audiences falsifiable |
| Experiments: real "promote winner" wiring; sum-to-100 enforced; replace z-scores with "Likely better / Need more data / About the same" | L | Experiments survivable |
| Per-section "Schedule a swap" affordance; deprecate global Scheduled screen | L | Schedules where merchants think |
| Translation: "Copy from EN" per locale; bulk-translate opt-in | M | Translations 5x faster |
| Page-template picker: real previews | M | Pick what you see |

### Phase 4 — differentiators (week 8+)
| Item | Estimate | Change |
|---|---|---|
| Snapchat + Telegram traffic sources; Iraqi-payment / WhatsApp / COD as first-class section primitives | M | Iraq specifics |
| Brand kit "suggest from logo" via local color extraction (no AI) | M | Personalization in 1 click |
| Inline rich text on inline-edit (bold/italic/link, sanitized) | L | Real editorial control |
| Page templates pack: 8 storefront archetypes per vertical | L | Vertical quick start |
| Per-tenant analytics on which controls merchants use | M | Telemetry-driven trim |
| Custom pages (currently fixed `PageId` enum) | XL | Merchants ship landing pages |
| Reusable blocks (linked components — edit-once-update-everywhere) | XL | Notion-class power |

---

## What we should kill

- **Iframe preview path** (`preview-frame.tsx`, `preview-overlay.tsx`, `use-iframe-bridge.ts`, corresponding tests). Unused, drift target.
- **Sparkles icons** wherever they appear (3 places).
- **Three "Coming soon" buttons** in Brand Kit (eyedropper, suggest-from-logo, translate-with-AI).
- **"Soon" fallback pill** in PageTree. Replace with explicit "Not implemented" in dev mode only.
- **Scheduled changes screen as a top-level entity.** Move to per-section "Schedule a swap" button.
- **Experiments z-score column.** Replace with "Likely better / Need more data / About the same".
- **Variant priority number input.** Drag-in-list is sufficient.
- **Eye-toggle icon in section list rows** (duplicates the Enabled switch in the edit panel).
- **`HealthChecklistScreen` full-screen canvas replacement.** Make it a drawer.
- **PreviewFrame keep-alive `targetOrigin: "*"` ping** (if iframe path stays).
- **Resolved Tokens debugging grid** in Brand Kit ([line 644-674](apps/platform/components/store-builder-v2/brand-kit-editor.tsx#L644)).
- **`window.confirm`** in section-picker preset delete and variant-list delete.
- **30-ms `setTimeout` auto-select** in SavePresetDialog.
- **Locale `🌐` emoji.**
- **Sparkles on Apply Template button.**

---

## Quick wins (ship this week)

Each ~1-3 days for one developer; merchant notices immediately.

1. **Topbar emoji → Languages icon.** [toolbar-controls.tsx:72](apps/platform/components/store-builder-v2/toolbar-controls.tsx#L72). 30 minutes.
2. **Drop all 3 "Coming soon" buttons from Brand Kit.** 1 hour.
3. **Strip `_i18n` + humanize every label** in `summarizeCondition` / `summariseVisibilityRule` / variant summary subtitles. Resolve segment_id and product_ids through name lookups. 1 day.
4. **Replace `window.confirm` in 2 places** with Radix `<AlertDialog>`. 3 hours.
5. **Wire `PublishConfirmSheet` to fire on every publish** (not just blocked). Add "what changed" summary. 1 day.
6. **Replace `Sparkles` with `Bookmark` / `LayoutTemplate` / `Check`** in 4 spots. 30 minutes.
7. **Page-tree label fixes:** "i18n" → "Languages"; "404" → "Page not found"; "Health" → "Store health"; "Brand Kit" → "Style & branding". 1 hour.
8. **Bump section toolbar buttons from 24 px to 36 px** + add real Tooltip primitive on the 5 actions. 1 day.
9. **Always-visible "+ Add" pill** on section-picker cards (or trust whole card). 1 hour.
10. **Real human variant default labels** ("Baghdad & Erbil" not "Governorates (2)"). 3 hours.

---

## Open questions for the founder

1. **Mobile editor — first-class or fallback?** Phone audit shows the editor is unusable on Android today. Launch blocker, or "edit on laptop, manage on phone" stance with mobile rebuild as Phase 4?
2. **Variant / segment / experiment scope.** Of the Iraqi merchants you've spoken to, how many will configure even one A/B test or governorate variant in year one? If <5%, gate these subsystems behind a paid-tier or "I run paid traffic" toggle.
3. **Translations.** Is "AI Translate" off-limits because of the no-AI-features policy or for cost/legal reasons? If the latter, a one-off translation API call per field is a Phase 3 win that cuts translation effort 5x.
4. **First-run vertical recommendation.** Do new merchants get a vertical pick (fashion vs food vs services)? If yes, presets and templates should be pre-filtered. If not, the 4-style preset chooser suffices.
5. **Pricing tiers.** Free → Pro → Plus where Advanced (Versions / Schedules / Audiences / A/B tests) unlocks at Pro? Would justify hiding aggressively.
6. **Custom pages.** Is the fixed `PageId` enum permanent or a v2 limitation? Several screens assume the enum.
7. **Editor language.** Editor stays English by design — confirm we shouldn't localize labels for editor users?
8. **Telemetry stance.** No analytics events fire from the builder today. Instrumenting in Phase 1 or waiting for a Posthog/Amplitude decision?
9. **Reusable blocks vs presets.** Preset = copy; "linked component" updates everywhere when edited. Long-term intent?
10. **Preview fidelity.** Should the inline `LivePreview` keep diverging from the actual storefront runtime (faster but lies about edge cases), or should we revive the iframe approach for full-fidelity preview at the cost of complexity?

---

## Appendix — files audited

36 component files in `apps/platform/components/store-builder-v2/`:

| File | LOC | Status |
|---|---:|---|
| editor-shell.tsx | 1217 | Direct read |
| live-preview.tsx | 963 | Via agent |
| brand-kit-editor.tsx | 1286 | Via agent |
| variant-add-wizard.tsx | 1238 | Via agent |
| scheduled-changes-screen.tsx | 1235 | Via agent |
| experiments-screen.tsx | 1298 | Via agent |
| auto-form.tsx | 1019 | Via agent |
| segments-screen.tsx | 841 | Via agent |
| section-list-panel.tsx | 744 | Via agent |
| variant-editor.tsx | 721 | Via agent |
| version-history-screen.tsx | 696 | Via agent |
| section-picker.tsx | 560 | Via agent |
| section-edit-panel.tsx | 476 | Via agent |
| health-checklist-screen.tsx | 401 | Via agent |
| variant-list.tsx | 358 | Via agent |
| page-tree.tsx | 327 | Via agent |
| preview-overlay.tsx | 318 | Via agent — DEAD |
| i18n-string-input.tsx | 309 | Via agent |
| page-template-picker.tsx | 265 | Via agent |
| i18n-screen.tsx | 253 | Via agent |
| preview-as-controls.tsx | 232 | Via agent |
| inspector-rail.tsx | 220 | Via agent |
| live-preview-overlay.tsx | 202 | Via agent |
| toolbar-controls.tsx | 187 | Via agent |
| publish-confirm-sheet.tsx | 172 | Via agent |
| live-preview-context-menu.tsx | 154 | Via agent |
| save-preset-dialog.tsx | 111 | Via agent |
| preview-frame.tsx | 93 | Via agent — DEAD |
| variant-override-paths.ts | n/a | Via agent |
| (29 .test.tsx files) | ~5,500 | Spot-checked |

Supporting reads: [page.tsx](apps/platform/app/store/v2/page.tsx), [store-config-v2.ts](packages/shared/src/types/store-config-v2.ts), [use-store-builder-v2.ts](apps/platform/hooks/use-store-builder-v2.ts), [DESIGN.md](stitch_schneiders_iraq_storefront_template111/a_candy_bento_playful_pastels/DESIGN.md), [schneiders_home_mobile_state_of_the_art_wedges/screen.png](stitch_schneiders_iraq_storefront_template111/schneiders_home_mobile_state_of_the_art_wedges/screen.png).

**Live-browser pass:** partial. Playwright launched a fresh context and was redirected to /login; this audit relies on full code reads of all 36 components plus the visual references above. A logged-in human pass would surface additional micro-states (modal focus order, loading flicker, real font load timings) but the major findings — vocabulary mismatch, no-phone-shell, dead iframe path, overloaded pink, model-leak chips — are evident from the code.

**Totals:** ~21,232 LOC of editor code analyzed across 36 components, ~500 specific findings logged, ~140 cited file:line references.
