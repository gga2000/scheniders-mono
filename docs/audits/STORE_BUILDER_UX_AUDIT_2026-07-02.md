# Store Builder Editor — World-Class UX Audit (2026-07-02)

**Focus:** first-run approachability, progressive disclosure, and readiness for a Simple ⇄ Advanced mode system.
**Method:** live click-through of `/store/edit` as the target persona (fresh signup → onboarding wizard → first editor session → first publish) on a disposable test tenant (`audit-test-store`, merchant #100048), plus code-level verification with `file:line` anchors, Nielsen-heuristic scoring (0–4 per the `critique` skill), the 8-item cognitive-load checklist, and the `impeccable` deterministic detector.
**Relationship to the 2026-06-10 audit:** this report does **not** re-litigate the 58/100 general-maturity audit. It absorbs and re-verifies its still-open UX items ([E2], [D1], [D2], [D3], [B2]/[A3]/[C11]/[F3], [BUG18], [C8], [C10], [A1], [A6], [E1]) and adds **new, live-verified findings** (IDs `UX-*`). Several items from that audit have since shipped and are confirmed working live: the viewport-accurate preview iframe (BUG1 fixed — real 390px reflow observed), custom pages, per-page SEO panel (E1 largely addressed), the onboarding wizard (E2 partially addressed), draft recovery, and publish-conflict detection.

**Screenshots** referenced as `ux-NN-*.png` live in the session scratchpad (`…/scratchpad/ux-audit-screens/`). They are session artifacts, not committed; say the word and I'll copy them into the repo.

---

## Verdict

**Not yet safe to put in front of a scared first-timer — but much closer than the codebase's reputation suggests, and the gap is concentrated, not diffuse.** The onboarding wizard → seeded store pipeline is genuinely excellent (Arabic-first, Iraqi-dialect copy, a real store on canvas in under two minutes), and the canvas direct-manipulation loop now works beautifully — but the moment Fatima touches the inspector she falls off a cliff: every field explodes into 6+ controls (breakpoint icons, EN/KU tabs, expanded English secondary inputs), labels flip to English developer vocabulary ("Eyebrow", "CTA Href", "Secondary CTA Kind"), and the single most important button in the panel ("إضافة عنصر") literally renders black-on-black and invisible. **The single biggest lever is a Simple mode that collapses the per-field surface area by ~70% (active-locale-only text inputs, no breakpoint adornments, no visibility/variants blocks) combined with finishing the half-done chrome localization — both are shallow changes architecturally, because the grouping machinery, the editor-i18n dictionary, and the "متقدم" disclosure pattern already exist.**

## Approachability score: **41/100** (new-user friendliness — distinct from the prior 58/100 general maturity)

Why 41: the wizard and seeded first-canvas earn real points (that part is ~80/100), but the inspector — where the owner's fear scenario actually happens — scores ~25/100 on density/language/jargon, and three P0-class visual defects (invisible primary CTA, broken Style tab, English fear-copy at first publish) drag the end-to-end journey below the pass line.

### 15-dimension scorecard (0–10)

| # | Dimension | Score | One-line justification |
|---|---|---|---|
| 1 | First-run fear factor / approachability | 4 | Wizard + seeded store are excellent (ux-02–05); but first guidance banner is English, inspector wall-of-controls hits within 60 seconds, and the #1 CTA is invisible (UX-01). |
| 2 | Simple ⇄ Advanced mode readiness | 6 | No mode exists, but `getFieldGroup` (essential/style/logic), `GroupedFormRenderer` accordions, the page-tree "متقدم" accordion, and `use-user-preferences` persistence are clean extension points — bolting on is feasible without rewrites (auto-form.tsx:250–305, section-field-groups.ts:96–204, page-tree.tsx:166–180). |
| 3 | Progressive disclosure & density | 3 | Essentials-open/Style-Logic-closed accordions are right; everything else is exposed: visibility rules (6 condition chips), variants block, breakpoint adornments on every eligible field, force-expanded EN inputs on every seeded field (ux-07, ux-10). |
| 4 | Translation UX | 3 | Per-field AR/EN/KU tabs + secondary inputs on *every* text field; seeded EN content force-expands a second English input under each Arabic field (i18n-string-input.tsx:77–79); breakpoint override editor still drops ar/ku ([BUG18] confirmed at auto-form.tsx:1563–1584). |
| 5 | Visual hierarchy, polish & cognitive load | 4 | The glass chrome and section-row design are genuinely refined, but 3 invisible black-on-black CTAs (UX-01), a broken Style tab (UX-02), empty token swatch rows (UX-17), and stale selection rings (UX-09) read "unfinished" exactly where trust is built. |
| 6 | Onboarding, empty states & guidance | 5 | Wizard is best-in-class for this market; in-editor guidance is one English banner that lies about which page you're on (UX-03), empty pages are a wordless white void ([A6] live, ux-15), zero per-field help ([C10] open). |
| 7 | Direct manipulation on canvas | 7 | Click-to-select with ring + floating toolbar + rail sync works and feels great (ux-19); mobile breakpoint truly reflows (BUG1 fixed); still no zoom/fit ([A1]), stale ring on breakpoint switch (UX-09), English toolbar labels. |
| 8 | Section library / add flow | 5 | Picker has real SVG thumbnails, search, valid-page greying with Arabic badge — good bones; but English names/descriptions/chips ([B2] open), mixed-language header, invisible selected chip (UX-01), and the entry button itself is invisible (ux-17). |
| 9 | Inspector / AutoForm complexity | 3 | Schema-walker renders raw key-derived English labels with no help text, no conditional fields (WhatsApp label shows when kind=None, UX-13), repeaters say "Item N" ([C8]), `.describe()` has no help channel ([C10]) (auto-form.tsx:767–782). |
| 10 | Style / Brand Kit approachability | 4 | Full-screen brand kit is solid and previews fonts in-picker (D2 partially fixed at brand-kit-editor.tsx:961), but: 100% English chrome, no theme gallery ([D1] open), no Arabic fonts ([D3] open), onboarding color fails AA silently (UX-06), Random palette invites disaster (D9), broken swatch rows (UX-17), and the rail "Style" tab embed is unusable (UX-02). |
| 11 | Save / publish / trust | 5 | Autosave pill + undo/redo + publish sheet exist and publish works; but "Not saved" greets first load, Publish starts disabled on a never-published store (UX-07), the sheet leads with English ad-tech fear copy + a contradictory "يحظر" badge + "نشر على أي حال" framing (UX-08), and there is no visible "your store is live 🎉 + link" peak moment (UX-10). |
| 12 | Localization of chrome | 4 | Two-thirds is properly localized via `editor-i18n` (page tree, section rows, picker chrome, wizard); the highest-visibility third is English: inspector tabs, toolbar right cluster, first-run banner, ALL field labels, section names, Brand Kit, Health, SEO panel headers, publish-sheet checks (inspector-rail.tsx:132–153, editor-shell.tsx:1906, brand-kit-editor.tsx:1403ff, health-checklist-screen.tsx:213ff). |
| 13 | Consistency & reuse | 5 | `packages/ui` used in places, but hand-rolled kebab menus ([B9]), two i18n systems (localized aria-labels on rows whose visible text is English), and the same "primary" token painting three different invisible buttons betray drift. |
| 14 | Architecture health as it blocks UX | 5 | The mode system does NOT require decomposition first — AutoForm exposes clean hook points; but editor-shell (~2019 LOC) makes toolbar/banner changes risky, and brand-kit-editor (~1977 LOC) can't be responsively embedded (UX-02 is a direct symptom). |
| 15 | Benchmark gaps | 4 | vs Shopify/Wix/Framer: no mode system, no theme gallery, no AI/auto-translate, no per-field help, no post-publish celebration; but the seeded-wizard + viewport iframe + health engine already beat low-tier builders. |

### Nielsen heuristics (critique-skill instrument, 0–4)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Save pill + publish ping good; "Not saved" on first load reads as an error; no post-publish confirmation moment observed. |
| 2 | Match system / real world | 1 | "Eyebrow", "CTA Href", "Secondary CTA Kind", "Analytics pixel", "OG image" — developer vocabulary, in English, to an Arabic-speaking shop owner. |
| 3 | User control and freedom | 3 | 50-step labeled undo, delete-with-undo toast, revert-to-published exist; undo labels degrade to generic "Edit config." (UX-12). |
| 4 | Consistency and standards | 2 | Arabic aria-labels on rows with English visible text; localized wizard → English editor; two disclosure patterns (accordion vs full-screen takeover). |
| 5 | Error prevention | 2 | Zod validation never surfaces ([BUG24] still open); onboarding lets you pick an AA-failing brand color with no warning (UX-06). |
| 6 | Recognition rather than recall | 2 | No field help, no examples, repeaters "Item N", raw dot-path URLs ("/products") — user must already know web-builder concepts. |
| 7 | Flexibility and efficiency | 3 | Deep links, drag-reorder, presets, variants for power users; nothing adapts to novices (no mode). |
| 8 | Aesthetic & minimalist design | 2 | The chrome itself is tasteful, but every section panel ships visibility rules + variants + per-field breakpoint adornments + tri-locale tabs whether or not you'll ever use them. |
| 9 | Error recovery | 3 | Draft recovery banner, publish-conflict reload, autosave retry pill exist (editor-shell.tsx:1938–1978). |
| 10 | Help and documentation | 0 | No help text, no tooltips-with-explanations, no "what does this do?", no docs link anywhere in the editor. |
| | **Total** | **21/40** | Mid-band "functional but hostile to novices". |

### Cognitive load checklist (Fatima, hero edit panel open)

Failed 6 of 8 → **critical**: single focus ✗ (banner + canvas + 3-tab rail + expanded panel compete), chunking ✗ (Title field cluster alone = 6 elements), grouping ✓, visual hierarchy ✗ (Essentials accordion looks identical to الإعدادات/visibility/variants), one-thing-at-a-time ✗, minimal choices ✗ (hero panel exposes ~30 interactive controls before scrolling), working memory ✓, progressive disclosure ✗ (variants/visibility/breakpoints all pre-exposed).

---

## The Fatima walkthrough — first 22 minutes, narrated

*Fatima, 31, sells cosmetics via WhatsApp/Instagram from Baghdad. Reads Arabic, some English. 5 minutes of patience.*

**Minute 0–2 · Signup → wizard. She's winning.**
Signup form is English (`ux-00`) — she manages, it's a familiar pattern. Then the wizard (`ux-02–04`) speaks *her* language, literally: **"يلا نسوي متجرك الالكتروني! خطوات قليلة وتصير تاجر من العيار الثقيل 😎"**. Industry cards with icons, a recommended template pre-selected, store name/WhatsApp/brand-color form with sensible defaults and reassurance under every field ("يمكنك تغيير كل شيء لاحقاً في المحرر"). She picks جمال ومستحضرات تجميل and the Rose color. **This is the best 2 minutes of the product.** Two dents: the template step is text-only cards — she's choosing a *look* without seeing one (F-20) — and nothing warns her that Rose will fail contrast (UX-06).

**Minute 2–3 · The editor opens. First 10 seconds: relief, then static.**
The canvas shows a real store *with her shop's name on the hero* (`ux-05`). Huge win — she is not staring at 16 empty pages ([E2] mostly closed). But the first thing addressed to her personally is an English banner: *"This is your homepage. Click any text to edit. Hit Publish when you're ready."* (editor-shell.tsx:1906) — she reads maybe half of it (UX-03). Top-right says **"Not saved"** in English — *"did I already break it?"* (UX-16). The right rail says **Blocks / Style / SEO / Health** — four English words, three of which she doesn't know (inspector-rail.tsx:132–153). The block list shows **"Image hero — HERO", "Brand story — STORY"** — English names for the things she's looking at in Arabic on the canvas (UX-15). And at the bottom right sits a solid black pill with no text: the **invisible "إضافة عنصر" button** (UX-01, `ux-05` bottom-right). She doesn't know it's a button.

**Minute 3–5 · She reads her homepage and finds someone else's story.**
The brand-story section says the brand was *"born in a small studio in Karrada, drawing ideas between cups of cardamom tea"* and asks *"هل سنرتديها نحن؟"* — **will we WEAR it?** She sells lipstick (UX-11). The testimonials are from "Hadeel M. — Baghdad" (Latin script) about same-day delivery of clothes. It's good copy — for a fashion brand called Schneiders, not for متجر فاطمة للتجميل. The hero is also orange-and-mint, not the Rose she chose 90 seconds ago (UX-06). Trust wobbles: *"did my choices even register?"*

**Minute 5–8 · She clicks the hero. Delight — then the cliff.**
Click on the canvas → pink ring, floating toolbar, the matching row lights up in the rail (`ux-19`). This is world-class direct manipulation and she found it by accident (the banner told her, in English). She clicks the pencil → the edit panel opens (`ux-06`, `ux-07`) and this is the moment the owner is afraid of:

- A dead grey box: **"No editable layers detected"** — English, negative, meaningless (UX-10).
- **"Reset to default"** — English (C11-class).
- Then the **Title** field: an English label, THREE device icons above it, **AR/EN/KU** pill tabs beside it, her Arabic headline in one input, a SECOND expanded input underneath in English ("The new collection has arrived") with an ×, and a "+ KU" button (UX-13, [BUG18] adjacent). That's **six UI elements for one sentence**. Repeat for Subtitle, CTA Label, WhatsApp Label, Eyebrow — *"شنو يعني Eyebrow؟"* (UX-14).
- Scrolling further: **"CTA Href"** containing "/products", a **"Secondary CTA Kind"** segmented control (Whatsapp/Call/Category Link/None) (`ux-09`, UX-18), a **الظهور** block offering six conditional-visibility rule chips, and a **النسخ (0)** block talking about A/B tests — next to *another* invisible black button (`ux-10`).

Count: ~30 interactive controls for one hero section, in two languages, before she has changed one word. **This is minute 7. In the real world she opens Instagram here.** In our session she survives because we're auditing.

**Minute 8–10 · She tries the Style tab and it's broken.**
"Style" (English) sounds like colors. The rail renders the Brand Kit crammed into 380px: the heading clips to "Bra Kit", the intro renders **one word per line**, and a sticky Live-preview card covers the controls (`ux-11`, `ux-12`, UX-02). It looks crashed. The actual full-screen Brand Kit (page tree → هوية العلامة) is decent — but its entire chrome is English ("Single source of truth for your storefront's visual identity…") and the canvas vanishes when it opens with no breadcrumb back ([O2]).

**Minute 10–13 · Colors, and a quiet betrayal.**
In Brand Kit → Colors (`ux-14`) she finally sees her Rose as PRIMARY #E11D48 ✓. Next to it: **"Primary on surface 4.42 FAIL"** and **"Primary on ink 3.71 FAIL"** — English, red, unexplained. The onboarding let her pick this color without a word (UX-06). A prominent **"Random palette"** button tempts her to destroy the palette with no undo affordance in sight ([D9]). The "RESOLVED PALETTE · LIVE" row renders as empty colons — visibly broken (UX-17). Typography offers "Bricolage Grotesque" — no Arabic font exists in the catalogue ([D3]) even though her entire store is Arabic.

**Minute 13–16 · Empty page terror.**
She clicks الفئة in the page tree. The canvas becomes a **pure white void** — no message, no +, nothing (`ux-15`, [A6] live). The English banner above it still says *"This is your homepage"* (UX-03b — the banner doesn't know what page it's on). The rail offers templates — with grey placeholder-bar thumbnails, English names ("Sale page", "Product launch"), an English "USE THIS →" pill (`ux-16`), and they're home-page templates that would inject invalid sections into the category page ([BUG29] still live).

**Minute 16–19 · Adding a block — the good bones show.**
The picker itself (`ux-17`) has real thumbnails, Arabic search, Arabic tabs, and correctly greys invalid sections with a proper Arabic badge ("غير متاح لهذه الصفحة"). But its title mixes languages ("إضافة عنصر إلى Category"), the category chips are English (Hero/Trust/Products/…), and the selected "All" chip is — again — black-on-black invisible (UX-01). *(In our session a mis-click here silently added a Trust strip; undo fixed it, but the undo tooltip read "Undo: Edit config." — English and meaningless, UX-12.)*

**Minute 19–22 · Publish — the trust moment, fumbled.**
Publish was **disabled** when she arrived (on a never-published store with a full seeded draft! UX-07); it enabled only after she edited the title. The sheet (`ux-20`) opens with a lovely Arabic header ("جاهز للنشر؟ … يمكنك النشر على أي حال والعودة لاحقاً") — and then two **English** warnings: *"No analytics pixel configured — required for ad campaigns"* and *"No social-share image — ad previews will be ugly"*, each tagged with an Arabic badge reading **"يحظر"** (= "blocks") that directly contradicts the header's "you can publish anyway" (UX-08). Fatima doesn't know what a pixel is; she now believes publishing is either forbidden or dangerous. The confirm button says **"نشر على أي حال"** — *publish ANYWAY* — making her first publish feel like overriding a safety warning. She publishes. **Nothing celebrates.** No "متجرك صار مباشر 🎉", no store link to send to her sister, no confetti — the pill just says "Saved 9s ago" (`ux-21`, UX-19). The single most shareable moment in the product evaporates.

**Score for Fatima's five real minutes (0–5): she survives to minute 5 only because the wizard banked so much goodwill. Minutes 5–8 (inspector) are where she is lost today.**

**Karim's 30 seconds (power merchant):** everything he needs exists — variants, experiments, breakpoint overrides, preview-as, custom pages, redirects — and the "متقدم" accordion (`ux-22`) already groups 13 power screens in Arabic. His frictions: overrides drop ar/ku ([BUG18]), variant chrome is part-English ([F3]), and flagship features hide double-buried with no activity badges ([O3]). Advanced mode must not add clicks for him — and per the design in the plan, it won't.

---

## Findings table

Severity = impact on adoption/activation. `NEW` = not in the 2026-06-10 audit. Prior-audit IDs referenced where absorbed.

| ID | Sev | Dim | Problem (one line) | Evidence | Hurts |
|---|---|---|---|---|---|
| UX-01 | **P0** | 5 | Three primary CTAs render black-on-black & invisible: "إضافة عنصر" (rail footer), add-variant button, selected picker category chip — computed `color` == `backgroundColor` == rgb(30,30,30) | live computed-style check; `ux-05`/`ux-10`/`ux-17`; section-list-panel.tsx:806–817, variant-list header, section-picker.tsx chips | Both |
| UX-02 | **P0** | 10 | Inspector "Style" tab embeds the full-width Brand Kit into the 380px rail → clipped heading, one-word-per-line text, sticky preview covering controls — looks crashed | `ux-11`, `ux-12`; inspector-rail.tsx:188; brand-kit-editor.tsx:1398 (`lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]`) | Fatima |
| UX-03 | **P0** | 1,12 | First-run banner — the only onboarding guidance — is hardcoded English; and (b) claims "This is your homepage" on *every* page including Category | `ux-05`, `ux-15`; editor-shell.tsx:1906 | Fatima |
| UX-04 | **P0** | 12 | Inspector tabs (Blocks/Style/SEO/Health), toolbar right cluster (Preview/Open/Not saved/Publish/Saving…), breakpoint labels — hardcoded English chrome at max visibility | `ux-05`; inspector-rail.tsx:132–153; toolbar-controls.tsx:26–28,175–207,277; editor-shell.tsx:1441,1459 | Fatima |
| UX-05 | **P0** | 3,4 | Per-field control explosion: every i18n field = breakpoint-icon row + English label + AR/EN/KU tabs + primary input + force-expanded EN secondary input + "+KU"; ~30 controls per section panel | `ux-07`, `ux-08`; auto-form.tsx:563–589,1410–1494; i18n-string-input.tsx:77–79,145–226 | Fatima |
| UX-06 | **P1** | 1,10 | Onboarding brand color only sets `primary`, hero stays candy orange/mint (promise: "يُستخدم في الأزرار"); chosen Rose ships failing AA (4.42/3.71 FAIL) with zero warning at pick time | `ux-04` vs `ux-05`; `ux-14`; onboarding-wizard.tsx:60–67; brand-kit contrast rows | Fatima |
| UX-07 | **P1** | 11 | Publish is disabled on a never-published store with a full seeded draft; enables only after making some new edit — first-timer can't ship the wizard result as-is | live: `disabled=true` pre-edit, enabled post-edit; use-store-builder-v2.ts `has_unpublished_changes` init vs published-null | Fatima |
| UX-08 | **P1** | 11,12 | Publish sheet: warnings in English ad-tech jargon (pixel/OG), Arabic badge "يحظر" contradicts "publish anyway" header, confirm reads "نشر على أي حال" — first publish framed as overriding safety | `ux-20`; publish-confirm-sheet + health rule copy (packages/shared health-rules) | Fatima |
| UX-09 | **P1** | 7 | Selection ring + floating toolbar keep stale desktop rect after breakpoint switch — ring overflows the 390px frame | `ux-23`; preview-overlay.tsx:423–441 (rect source not re-requested on breakpoint change) | Both |
| UX-10 | **P1** | 6 | "No editable layers detected" — negative, English, technical — shown by default at the top of every section panel with no layers | `ux-06`; block-layers-panel.tsx:182 | Fatima |
| UX-11 | **P1** | 1 | Seeded content is not industry- or identity-adapted: fashion copy ("هل سنرتديها؟"), "شنايدرز"/Karrada backstory, Latin reviewer names — merchant's industry pick doesn't shape copy | `ux-05`, editor-snapshot-01.md:295–339; starter-templates seed content | Fatima |
| UX-12 | **P2** | 11 | Undo/redo tooltips are English and generic ("Undo: Edit config.") even for adding/deleting sections | live tooltip after section add; use-store-builder-v2.ts DEFAULT_HISTORY_DESCRIPTION; [BUG33]/[BUG42] adjacent | Both |
| UX-13 | **P2** | 4 | Secondary-locale inputs auto-expand whenever the locale has content — for a seeded store this means EVERY field permanently shows two inputs; no way to collapse-all | `ux-07`; i18n-string-input.tsx:77–79,228–305 | Fatima |
| UX-14 | **P1** | 9,12 | All AutoForm field labels are auto-humanized schema keys in English only ("Title", "Eyebrow", "CTA Href", "Secondary CTA Kind") — no label-localization or help channel exists | `ux-07`, `ux-09`; auto-form.tsx:767–782; [C10]/[C11] absorbed | Fatima |
| UX-15 | **P1** | 8,12 | Section names + category labels English in list rows, picker cards, picker chips, floating canvas toolbar — despite ar names existing in the manifest for 52 sections | `ux-05`, `ux-17`, `ux-19`; section-list-panel row (manifest.name.en), section-picker.tsx:616,628; [B2] absorbed | Fatima |
| UX-16 | **P2** | 11,12 | Save pill states English ("Not saved" greets first load; "Saved Xs ago", "Save failed") — the reassurance surface doesn't reassure in her language | `ux-05`; toolbar-controls.tsx:175–207 | Fatima |
| UX-17 | **P2** | 5 | Brand Kit "Resolved palette/tokens" swatch rows render as empty colon marks — visibly broken UI in the trust-critical styling surface | `ux-13`, `ux-14`; brand-kit-editor.tsx:1164–1194 | Both |
| UX-18 | **P2** | 9 | No conditional fields: "WhatsApp label" input shows even when Secondary CTA Kind = None; kind-switch doesn't hide/show dependents | `ux-08`/`ux-09`; auto-form.tsx (no dependency mechanism) | Fatima |
| UX-19 | **P1** | 11 | No post-publish success moment: no live-URL handoff, no celebration, Publish sheet just closes (any toast is transient); "Open" remains an unlabeled-in-Arabic toolbar link | `ux-21`; editor-shell publish flow ~1567–1572 | Fatima |
| UX-20 | **P2** | 6,8 | Wizard template step + rail template cards are text-only/placeholder-bars with English names & "USE THIS →" — choosing a look blind ([E5] absorbed); home templates offered on Category ([BUG29] live) | `ux-03`, `ux-16`; page-template-picker/empty-state | Fatima |
| UX-21 | **P2** | 5 | Editor renders inside full OMS chrome (top search bar + icon rail) → double chrome, ~90px vertical loss, tenant name clipped behind overlay at 1366px | `ux-05` top; app/store/edit layout inheritance | Both |
| UX-22 | **P2** | 2 | Page-tree "متقدم" accordion already hides 13 power screens (good precedent) but mixes commerce settings (shipping, discounts, loyalty) with builder-power screens (versions, redirects) — one bucket, two audiences | `ux-22`; page-tree.tsx:166–180 | Both |
| UX-23 | **P2** | 4 | [BUG18] re-confirmed: breakpoint override editor writes only `en` — Arabic-first merchant cannot set a mobile-specific Arabic headline | auto-form.tsx:1563–1584 (`defaultValue={cur.en}`, `onSet({...cur, en: v})`) | Karim |
| UX-24 | **P3** | 13 | Dual i18n personality: row aria-labels localized (اسحب لإعادة الترتيب) while the visible name on the same row is English — translation effort spent invisibly | editor-snapshot-01.md:407–417 | Fatima |
| UX-25 | **P3** | 5 | Detector: gray-on-color (text-gray-800 on bg-pink-50) in canvas context menu | impeccable scan; live-preview-context-menu.tsx:144 | Both |
| UX-26 | **P3** | 6 | Signup page + plan picker fully English (pre-editor journey, sets language expectation wrong) | `ux-00`; app/(auth)/signup | Fatima |

**Absorbed & still open from 2026-06-10:** [D1] theme gallery (no gallery; only Random palette — `ux-14`), [D3] Arabic fonts (30-font catalogue, zero Arabic), [A1] zoom/fit (absent), [A6] empty canvas (worse than reported: literally blank, `ux-15`), [C8] "Item N" repeaters (auto-form.tsx:1256), [C10] no help text, [B2]/[A3]/[C11]/[F3] English chrome clusters, [BUG18] (=UX-23), [O2] full-screen takeovers with no breadcrumb, [O3] buried advanced screens without badges, [BUG29] home-templates on any page, [BUG24] no inline validation.
**Verified fixed/shipped since 2026-06-10:** BUG1 (iframe viewport preview — real reflow at 390px), E1 (page-seo-panel with SERP preview exists), E2 (onboarding wizard shipped — this audit's first-run rides it), E4 (custom pages group in tree), D2 (font pickers render own typeface via inline fontFamily, brand-kit-editor.tsx:961 — full option-list preview still partial), draft recovery restore (editor-shell.tsx:1938–1978), publish conflict detection (editor-shell.tsx:1585).

---

## Simple vs Advanced control inventory

Classification: **S** = Simple mode (always visible), **A** = Advanced mode only, **A-tuck** = present in Advanced but still behind a per-instance reveal. Rationale = frequency × value × scariness for Fatima.

### Toolbar

| Control | Class | Rationale |
|---|---|---|
| Back, tenant name | S | Orientation. |
| Breakpoint toggle (mobile/desktop) | S | High value; but Simple shows **mobile + desktop only** (tablet → Advanced) — Iraq is mobile-first. |
| Locale select | S | Preview language is core in a trilingual store; relabel "معاينة بالعربية" style. |
| Undo / Redo | S | Safety net — core to fear reduction. |
| Save pill | S | Localize; soften initial state. |
| Publish | S | The goal. |
| Preview / Open | S (merged) | One "معاينة" affordance in Simple. |
| Preview-as (segments/AB/governorate) | A | Simulator of features Simple hides. |
| i18n coverage pill ("ar 100%") | A | Meaningful only once she cares about locales. |
| **Mode toggle (new)** | S | Lives here. |

### Page tree

| Control | Class | Rationale |
|---|---|---|
| Pages groups (المتجر/التسوق/الطلب/الصفحات/السياسات/النظام) | S | Core navigation, already localized. |
| Custom pages group + create | A | Week-2 feature; hides a scary "+ page" decision. |
| Settings: هوية العلامة (Brand Kit) | S | Colors/logo = top-3 first-session job. |
| Settings: الصحة (Health) | S | Publish-readiness guide — reassurance when reframed. |
| Settings: اللغات | A | Locale management is advanced by the owner's definition. |
| متقدم accordion (13 items) | A | Already the right pattern; entire accordion hidden in Simple. |

### Section list (Blocks tab)

| Control | Class | Rationale |
|---|---|---|
| Section rows: name, icon, reorder-drag, expand | S | The core loop. Names must be Arabic. |
| Enable/disable (eye) | S | High-frequency, low-risk, instantly visible on canvas. |
| Duplicate (kebab) | S | Common, safe. |
| Delete (kebab, has undo-toast) | S | Needed; undo net exists. |
| Save as preset (kebab) | A | Power concept ("what's a preset?"). |
| Template button (قالب) | S | Empty-page rescue. |
| Add block (إضافة عنصر) | S | THE growth action — once visible (UX-01). |

### Section edit panel

| Control | Class | Rationale |
|---|---|---|
| Instance label (اسم العنصر) | A | Editor-only metadata; placeholder confuses ("doesn't affect store"). |
| Enabled toggle | S | Duplicate of row-eye but harmless and clear. |
| Block layers strip | A-tuck | Only when layers exist; never show the empty state (UX-10). |
| **Essentials group fields** | S | The point of Simple mode. |
| Style group (الإعدادات) | S (collapsed) | Safe visual choices belong to Fatima too; keep collapsed accordion. |
| Logic group | A | "Manual SKUs", "Analytics tag", hrefs — Karim's. |
| Per-field breakpoint adornments | A-tuck | In Advanced, shown on hover/focus, not permanently ([BUG18] must be fixed first). |
| Per-field EN/KU tabs + secondary inputs | **A-tuck** | THE owner ask: Simple = active-locale input only + one quiet "الترجمات ＋" reveal per field; Advanced = same tuck, default collapsed. |
| Visibility rules (الظهور + 6 chips) | A | Conditional display is a power concept. |
| Variants (النسخ) + add wizard | A | A/B & responsive variants = Karim. |
| Reset to default | S | Safety net — keep, localize. |

### Field controls (AutoForm)

| Control | Class | Rationale |
|---|---|---|
| Text/i18n inputs, image upload, color, enum segments, number, boolean | S | Core editing. Labels must be localized + helped. |
| URL/href fields | A | Logic-group by convention already (`_href` → logic, section-field-groups.ts:47). |
| Repeater add/remove/reorder | S | Editing testimonials/FAQ items is core; labels need summaries ([C8]). |
| Repeater per-item breakpoint/variant machinery | A | Follows parent rules. |

### Inspector tabs & screens

| Control | Class | Rationale |
|---|---|---|
| Blocks tab | S | Home base. |
| Style tab | S → route to full-screen Brand Kit (fixes UX-02 interim) | Colors are a Fatima job; the broken embed isn't. |
| SEO tab | A | Meta titles/noindex = jargon; health check covers the basics for her. |
| Health tab | S | Reframed as "جاهز للإطلاق؟" checklist — her guide. |
| Brand Kit: identity, colors, typography, presets(new) | S | With theme gallery when it lands ([D1]). |
| Brand Kit: shape/motion/voice/scale details | A | Taste-tuning, safe to hide. |
| Versions / Scheduled / Experiments / Segments / Redirects / Pixels / Navigation | A | Already in متقدم. |

---

## Benchmark gap matrix (approachability & progressive disclosure only)

| Pattern | Us (live) | Shopify OS 2.0 | Wix Studio | Framer | Webflow | Verdict |
|---|---|---|---|---|---|---|
| Beginner/expert mode | **None** | No explicit mode, but settings-only inspector = simple by construction | **Yes** (Wix vs Studio split product) | No (pro tool) | No (pro tool) | For a non-technical market we need what Wix achieves via two products — one product, two modes. |
| Translation input per field | 3 locale tabs + stacked secondary inputs, always | Separate "Translate & Adapt" surface; base editor = one language | Separate multilingual manager | Localization panel, separate | Localization panel, separate | **Every benchmark keeps translation OUT of the primary editing loop.** Our per-field tuck-away (reveal on demand) can actually beat them for a trilingual market. |
| Field help | None | `info` text on every setting | Tooltips everywhere | Property tooltips | Property tooltips | Table stakes; we ship bare labels ([C10]). |
| Editor chrome localization | ~2/3 localized, worst surfaces English | 100% (20+ languages) | 100% | English-only (accepted: pro audience) | English-only | Arabic-first market → our gap is disqualifying, not cosmetic. |
| First-run guidance | 1 static English banner | Setup guide checklist w/ progress | Onboarding tours + AI | Starter templates | Video onboarding | Wizard is great; in-editor guidance missing ([E2] residue). |
| Theme/preset gallery | None (Random palette) | Theme presets in editor | Full theme market | Style presets | Style guide starters | [D1] remains the biggest styling gap. |
| Empty page state | Blank white canvas | "Add section" prompt on canvas | On-canvas add + AI | On-canvas prompt | On-canvas prompt | [A6]: we're the only one with a literally empty canvas. |
| Post-publish moment | Silent | "Your store is live" + view + share | Celebration + view site | Publish popover w/ URL + confetti | Publish popover w/ URL | Peak-end rule: we end the emotional arc with nothing (UX-19). |
| Direct manipulation | Ring + toolbar + iframe viewport ✓ | Section outline click | Full DnD | Full DnD | Full DnD | We're genuinely competitive here now. |
| Publish readiness framing | "يحظر" + English pixel/OG warnings | Friendly checklist, non-blocking | Pre-publish checklist | Minimal | Minimal audit panel | Ours actively frightens (UX-08). |

---

## What's already good — preserve these

1. **The onboarding wizard** (`ux-02–04`): Arabic-first, dialect-warm, 3 steps, recommended defaults, constant "everything is changeable" reassurance. This is the approachability blueprint the editor itself should copy.
2. **Seeded first canvas**: landing on a real, populated, Arabic store with your name on the hero kills the 16-empty-pages fear ([E2]'s worst case) dead.
3. **Canvas direct manipulation** (`ux-19`): viewport-accurate iframe (BUG1 fix holds), hover/selected rings, floating toolbar, list-row sync — the core WYSIWYG loop is now real and pleasant.
4. **The editor-i18n system + already-localized surfaces**: page tree, section-row actions, picker chrome, publish-sheet header, save-preset dialog prove the dictionary pattern works — the remaining English is unfinished adoption, not missing infrastructure (editor-i18n.ts:40–69).
5. **The "متقدم" accordion** (page-tree.tsx:166–180): persisted, localized progressive disclosure already shipping — the mode system generalizes an existing, accepted pattern rather than introducing a foreign one.
6. **Essential/Style/Logic grouping** (section-field-groups.ts:96–204 + GroupedFormRenderer accordions): the field-classification backbone the mode system needs already classifies all 45 known section types.
7. **Safety nets**: 50-step undo, delete-undo toast, draft recovery banner, publish-conflict reload, autosave retry — the *machinery* of trust exists; it's the *communication* of trust that's missing.
8. **Picker valid-page greying** with localized "غير متاح لهذه الصفحة" badge — exactly the right kind of guardrail.

---

*Companion plan: [STORE_BUILDER_UX_PLAN_2026-07-02.md](STORE_BUILDER_UX_PLAN_2026-07-02.md). Test tenant `audit-test-store` (merchant #100048, fatima.ux.audit@example.com) was created and published during this audit and can be deleted or kept for smoke-testing.*
