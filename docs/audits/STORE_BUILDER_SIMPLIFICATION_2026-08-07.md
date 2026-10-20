# Store-builder editor — simplification sweep (third pass)

**Date:** 2026-08-07 · **Method:** live click-through (agent-browser) on seeded tenant #100051, a **true fresh signup → wizard → editor → publish run** (new tenant #100053, `noor.simplify3@example.com`), plus code verification with `file:line` anchors.
**Baselines:** [07-02 audit](STORE_BUILDER_UX_AUDIT_2026-07-02.md) (41/100) · [07-07 audit](STORE_BUILDER_UX_AUDIT_2026-07-07.md) (75/100, all findings marked FIXED).
**Scope discipline:** this pass reports *complexity*, not defects — except where a shipped "fix" turns out not to work live (two cases: S3-01, S3-13).
**Screenshots** `s01–s30` in session scratchpad (`…/scratchpad/`); say the word to copy them into the repo.

---

## 1 · Verdict

The core loop is genuinely simple now: a first-timer goes signup → wizard → seeded Arabic store → **inline-edits the headline on the canvas in 2 clicks** → publishes in 2 more, and gets a celebration with a WhatsApp share button. That spine is competitive with anything in the market and must not be touched.

The remaining complexity is not in the editing loop — it is **around** it, in three places. First, the single most important fact about Fatima's business — **her WhatsApp number — has four homes in the codebase and zero editable homes in the builder**; the launch checklist nags her for a number she already gave the wizard, and its "fix" button is a silent no-op (a regression of a fix marked FIXED on 07-08). Second, the **approach path** taxes her before she arrives: a 4-plan pricing matrix at signup, a silent dump back at the login form after signup, and a first login that lands on an empty order-ops dashboard with no route to the store. Third, the editor still **shows Simple-mode users Advanced-shaped surfaces**: a 48-card section wall with dev-named thumbnails, a 13-row page tree, a 6-dimension health scorecard (rendering as broken slivers), and a publish diff that says `hero_image (hero_image) — 1 field`. The mode system was the right call — but it gates *fields* and forgot to gate *surfaces*.

---

## 2 · Task cost table (measured live, Simple mode)

| # | Task | Clicks | Decisions | Screens | New concepts required | Notes |
|---|---|---|---|---|---|---|
| T1 | Change the headline | **2** + type | 1 (which text) | 0 | none | Click text → click again → caret. Inline, live repaint, autosave. **Best-in-class; leave alone.** (s27–s29) |
| T2 | Swap the hero image | **2** in-app + OS picker | 1 | 0 | none | Expand hero row → «تعيين» → OS file dialog. No media library, but thumbnail preview exists once set (auto-form-fields.tsx:491). Acceptable. |
| T3 | Add a product row | **2** | **1 of 48** | 1 (picker modal) | «عنصر», 8 category chips | The two clicks are right; the 48-card wall between them is not (§S3-04). Auto-opens panel + autosaves after pick — good. |
| T4 | Set the WhatsApp number | **∞ — no path exists** | — | — | — | Wizard collects it (prefilled from signup ✓), checklist still says «أضف رقم الواتساب», «أكملها» does nothing visible on two tenants (s08, s23). The value is editable nowhere in the builder (§S3-01). |
| T5 | Publish | **2** | 2 (ignore 2 ad-tech recommendations) | 1 (sheet) | «تتبع الإعلانات», «صورة المشاركة», raw `hero_image` diff rows | Publish enabled pre-edit ✓, celebration dialog ✓ (s10, s11). The sheet's *content* is the remaining tax (§S3-06). |

Score: three of five tasks are at or near their floor. One is broken outright. One has the right shape with the wrong middle.

---

## 3 · The narrated first-timer run (tenant #100053, in order)

1. **/signup** — fully Arabic now ✓. She fills name/email/password/phone/city — then hits «اختر الباقة»: **four plans × (orders/month × price)**, «النمو 2,000 طلب/شهر 30K د.ع/شهر» pre-selected (s12). She has never seen the product; the trial is free for 14 days regardless. This is the first decision of her journey and it is the least answerable one.
2. **Submit → dumped at /login, silently.** No «تم إنشاء حسابك». The same form she just filled, now empty; she re-types email and password (signup/page.tsx:80 does `router.push("/login")`, no auto-login, no flash message). First-timer read: *"did that work, or did I do something wrong?"* (s14)
3. **First login → empty OMS dashboard.** «صباح الخير، متجر نور للتجميل» over a wall of zeros: «بانتظار المراجعة 0»، «مشبوه / وهمي 0»، «جاهز للتغليف 0»، a 5-stage pipeline of zeros, «نسبة التوصيل 0%» (s15). Fraud review and packing metrics for a merchant who owns no store yet. Nothing on this screen says "your store isn't built — يلا نبنيه". The wizard exists — behind the 8th icon of the left rail.
4. **/store → wizard.** «يلا نسوي متجرك الالكتروني!» — 3 steps, warm, prefilled. Step 2's five template cards are **visually indistinguishable yellow placeholder-bar thumbnails**; «ليل معدني» promises "رمادي معدني وفضي، هادئ وفخم" above the same yellow candy bars as everyone else (s17). She chooses a look blind — the exact F-20/UX-20 complaint, now with 5 better templates behind the same blindfold.
5. **Step 3** — store name prefilled from signup ✓, WhatsApp prefilled from signup phone ✓ (excellent). Then: «رسوم التوصيل (د.ع)» + «توصيل مجاني فوق» + a brand-color row whose swatches will quietly fight the template's carefully-built palette (§S3-12).
6. **«إنشاء متجري» — clicked twice, nothing happened.** No spinner seen, no error rendered, still on step 3 after 10+ seconds, button re-enabled (s19). Third click worked → `/store/edit?welcome=1`. The handler has a spinner and an inline alert (onboarding-wizard.tsx:198, 227, 330), but whatever failed twice produced neither visibly. If a first-timer's biggest click can fail silently, everything else in this report is secondary polish (§S3-13).
7. **Editor opens** — welcome dialog «متجرك جاهز! 🎉 بنيناه من إجاباتك», 3 plain instructions, «يلا نبدأ» (s20). Seeded حبر متحرك store, Arabic banner, Arabic section names, visible «إضافة عنصر», zoom pills. **This is a strong first minute.** One dent: hero copy is generic-fashion («تشكيلة جديدة… أساسيات بأسلوب جريء») though she picked جمال ومستحضرات تجميل.
8. **She reads the tree**: الرئيسية ٨، الفئة ٤، تفاصيل المنتج ٩، البحث ١، السلة ٥، الدفع ٣، شكراً لك ٢، تتبع الطلب ٢، حول ٣، الأسئلة الشائعة ١، اتصل بنا، الشحن ١، الإرجاع ١… **thirteen-plus pages, in Simple mode, before her first edit** (s21). She needed exactly one of them today.
9. **الجاهزية tab**: «أنجزت 2 من 5» — step 2: «أضف رقم الواتساب». *She already gave it to the wizard.* She clicks «أكملها» → **nothing moves on screen** (s22 vs s23, pixel-identical). Below, the dimension scorecard renders as ~20px vertical slivers of clipped text («متثال علاني…») (§S3-05).
10. **Canvas click → headline**: ring, floating Arabic toolbar, second click gives a caret, she types, the store repaints live (s29). Undo lights up. **The product's best moment.**
11. **نشر** → sheet: Arabic framing ✓, but the change list reads **`hero_image (hero_image)` — "1 field"** and two «تنصح بإصلاحه» ad-tech recommendations (tracking pixel, share image) stand between her and the button (s10). She publishes → 🎉 dialog with link + WhatsApp share ✓ (s11).

Where she'd realistically stall: steps 2 (login dump), 3 (empty dashboard), 6 (silent failure), 9 (the checklist that ignores her answer).

---

## 4 · Findings — sorted by simplicity bought, not effort

Severity here = how much confusion the item removes for Fatima, weighted by how early it hits.

### S3-01 · **P0 — WhatsApp number: one concept, four homes, zero paths** — *merge + default*
**Complexity created:** the checklist tells her to do a task the product has no way to do, about a value she already provided.
**Live evidence:** fresh tenant #100053, WhatsApp `07701234567` entered in wizard → checklist still shows «أضف رقم الواتساب»; «أكملها» = visible no-op on both tenants (s08, s22/s23).
**Root cause (verified):** four disconnected homes —
- wizard writes `cfg.commerce.whatsapp_number` — [starter-store.ts:171-176](apps/platform/lib/starter-store.ts#L171-L176)
- health rule scans **section props only** (`/^wa_number$|whatsapp/` inside sections) — [health-rules.ts:334-338](packages/shared/src/health-rules.ts#L334-L338)
- fix handler `findWhatsappTarget()` scans sections, finds none, falls through to `fixPage("home")` = no-op — [health-checklist-screen.tsx:249-281](apps/platform/components/store-builder-v2/health-checklist-screen.tsx#L249-L281)
- the only editing UI is the OMS [business-settings.tsx](apps/platform/components/settings/business-settings.tsx), outside the builder; nothing in `store-builder-v2` edits `commerce.whatsapp_number`.
**Fix:** make `cfg.commerce.whatsapp_number` the single source of truth. Health rule reads it **first** (sections as fallback). Wizard-provided number ⇒ step born completed. If genuinely missing, «أكملها» opens a one-field inline input *inside the checklist row* — no navigation, no section hunting. Storefront WhatsApp CTAs default to the config number so sections stop needing their own copy (fewer fields in every panel that has `wa_number`).

### S3-02 · **P0 — The approach path taxes her before the product earns it** — *defer + default*
Three compounding walls before first value:
- **(a) Plan matrix at signup** — [signup/page.tsx:280](apps/platform/app/(auth)/signup/page.tsx#L280). Four plans, eight numbers, pre-product. *Defer:* start everyone on the trial silently (it already exists — the red «انتهت فترتك التجريبية / اختر باقة» banner proves plans can be chosen later); drop the block from signup.
- **(b) Signup → /login dump, no auto-login, no message** — [signup/page.tsx:80](apps/platform/app/(auth)/signup/page.tsx#L80). The UX2-18 fix (clear stale session) was right; the leftover is that a *fresh* signup also lands cold. *Remove the step:* auto-login on successful signup → straight to the wizard.
- **(c) First login lands on the empty OMS dashboard** (s15) — the store builder is icon #8 in a rail. *Default:* tenants with no published store land on `/store` (the wizard / Command Center); or the dashboard's hero slot shows one card — «متجرك ننتظر — أكمل بناءه» — until first publish.
Combined, this is the largest remaining "decisions before value" cluster in the product, and none of it is in the editor.

### S3-03 · **P1 — Simple mode inherits Advanced-shaped surfaces** — *the mode-system's unfinished half*
The Simple⇄Advanced primitive is correct (see §5) — but it currently filters *fields* and *tree accordions* only. Three surfaces render identically in both modes:
- **Page tree: 13+ rows, no mode filter** — [page-tree.tsx:387-440](apps/platform/components/store-builder-v2/page-tree.tsx#L387-L440) maps all six groups (المتجر/التسوق/الطلب/الصفحات/السياسات/…) unconditionally. Fatima's week-one world is الرئيسية + maybe حول/اتصل بنا. *Defer:* in Simple, show المتجر + الصفحات groups and collapse التسوق/الطلب/السياسات behind one «كل الصفحات (٩) ▸» reveal. System pages (البحث، تتبع الطلب، الدفع…) are seeded and fine — she doesn't need them *listed* to benefit from them.
- **Health scorecard: 6 dimensions + score ring in Simple** — and the dimension cards are *visibly broken*: `grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3` inside a 380px rail renders ~20px vertical slivers of rotated clipped text — [health-checklist-screen.tsx:418](apps/platform/components/store-builder-v2/health-checklist-screen.tsx#L418) (s22). *Remove from Simple:* the 5-step «جاهز للإطلاق؟» checklist IS Fatima's health UI; dimensions/score belong to Advanced. (Also fixes the layout bug by deletion — in Advanced give the grid a container query or `grid-cols-1`.)
- **Brand kit in Simple exposes** favicon («أيقونة الموقع», 32×32 ICO), OG «صورة المشاركة», and an all-English live-preview card ("Live preview / REAL-TIME / Brand wordmark + body type / CTA Shop now / SURFACE / INK Aa Bb / RESOLVED TOKENS") — [live-preview.tsx:59-201](apps/platform/components/store-builder-v2/brand-kit/live-preview.tsx#L59-L201) (s26). *Defer* favicon/OG to Advanced; *rename/localize* the preview card (or drop its labels entirely — swatches don't need captions).

### S3-04 · **P1 — The 48-card section wall** — *merge + remove*
[BUILTIN_SECTIONS](packages/sections/src/index.ts#L90-L140) = 48 entries; the picker shows **all of them** on every page, greying invalid ones ([section-picker.tsx:693](apps/platform/components/store-builder-v2/section-picker.tsx#L693)) — on the home page that's dozens of unusable cards (عناصر السلة، نموذج الدفع، نتائج البحث…) she must visually skip.
- *Remove (Simple):* hide invalid-for-page sections instead of greying. Grey teaches Karim the taxonomy; for Fatima it's 20 dead cards of reading.
- *Merge:* 4 heroes (`hero_image/split/marquee/video` — index.ts:12-21), 2 tickers (`marquee_strip`/`announcement_bar` — :33-34), 2 CTA bars (`cta_banner`/`sticky_cta_bar` — :41,75) present as 8 separate first-class decisions. One «غلاف» card + one «شريط» card + one «شريط دعوة» card in Simple, with the flavor as a *first field inside the panel* after adding, cuts the wall by ~10 % and — more importantly — removes the "what's the difference?" comparisons that near-duplicates force. (Schema/type unchanged — picker-level grouping only; Advanced keeps the flat list.)
- **Thumbnail assets leak dev vocabulary:** every SVG carries its type name and English placeholder art — verified `hero_image` + "SHOP NOW" inside [hero_image.svg](apps/storefront/public/sections/hero_image.svg); "HEADLINE HERE.", "SUBSCRIBE", "COD SAME-DAY WARRANTY" visible live (s05c). *Remove* the type-name captions from the SVGs; Arabic-ify or de-text the art. These are static assets; no code changes.

### S3-05 · **P1 — Publish sheet still speaks developer in its middle** — *rename + defer*
The frame is Arabic and warm; the content isn't:
- Change list renders `hero_image (hero_image)` + English "1 field": `sectionLabel()` returns `s.label || s.type` — [publish-diff.ts:97](apps/platform/lib/publish-diff.ts#L97) — and the sheet appends the raw type in parens — [publish-confirm-sheet.tsx:502-503](apps/platform/components/store-builder-v2/publish-confirm-sheet.tsx#L502-L503) (s10). *Rename:* route through `sectionDisplayName` + localized counts; drop the parenthesized type entirely in Simple.
- The two standing recommendations for a first-time publish are **tracking pixel** and **OG image** — the two most developer-flavored checks in the catalogue, shown at her peak-anxiety moment. *Defer (Simple):* collapse recommendations behind «توصيات (٢) ▸», expanded by default only in Advanced. She still can read them; they stop standing between her and «انشر متجري».

### S3-06 · **P2 — «رابط الزر» is a raw path textbox** — *merge decisions into a picker*
The UX2-01 fix promoted `_href` into Simple ([SIMPLE_SHOW_SUFFIXES](apps/platform/lib/section-field-groups.ts#L235)) — but it surfaces as a free-text input containing `/products` with help «إلى أين يأخذ الزر الزائر، مثال: ‎/products.» ([auto-form-fields.tsx:385](apps/platform/components/store-builder-v2/auto-form-fields.tsx#L385), live s03). Fatima cannot produce a path from her head; the current control trades "hidden" for "scary". *Fix:* href fields in Simple render as a select of real destinations (المنتجات / فئة… / صفحة… / واتساب / رابط خارجي) — the same enum the hero's «نوع الزر الثاني» radio already proves she can use. Free-text stays in Advanced. This is not a feature-add; it's converting an unanswerable question into a choosable one.

### S3-07 · **P2 — Translations affordance on every field of an Arabic-only store** — *defer*
New stores seed `enabled_locales = ["ar"]` ([starter-store.ts:163-168](apps/platform/lib/starter-store.ts#L163-L168)) — yet every text field in Simple carries «الترجمات (EN ✓ · KU –) ＋» because the reveal isn't gated on enabled locales ([i18n-string-input.tsx:154](apps/platform/components/store-builder-v2/i18n-string-input.tsx#L154); no `enabled_locales` reference in the file). The «EN ✓» is template-seeded content she'll never publish. That's ~4 recurring lines of noise per panel answering a question she hasn't asked. *Defer:* render the reveal only when `enabled_locales.length > 1`; the اللغات screen (Advanced) is where she opts in. The tuck-away design itself is right — it's the *unconditional* rendering that isn't.

### S3-08 · **P2 — "Scribble Color: Butter/Mint/Lilac/Sky/Pink"** — *default, then rename what remains*
Product grid's only Simple style field is an untranslated English label with untranslated whimsy-enum values ([product_grid.tsx:27](packages/sections/src/product_grid.tsx#L27); no entries in ENUM_VALUE_LABELS — [section-field-meta.ts:140-158](apps/platform/lib/section-field-meta.ts#L140-L158); live s-grid). Fatima cannot know what a scribble is or which pastel matches her brand. *Default:* derive the accent from the brand kit and drop the field from Simple entirely; if kept in Advanced, give it an Arabic label + labeled swatch dots instead of words. Also worth a sweep: `resolveEnumValueLabel`'s humanized-English fallback ([section-field-meta.ts:205-209](apps/platform/lib/section-field-meta.ts#L205-L209)) means every future unlabeled enum silently ships English to Simple — consider failing lint/test when a Simple-visible enum lacks labels.

### S3-09 · **P2 — Wizard step 3 asks questions the template already answered** — *remove + defer*
- Brand color row ([onboarding-wizard.tsx:575](apps/platform/components/store-onboarding/onboarding-wizard.tsx#L575)) overwrites `brand_kit.colors.primary` *after* the template applied a designed, AA-validated palette ([starter-store.ts:150-157](apps/platform/lib/starter-store.ts#L150-L157)) — the same "color fights the kit" trap as UX-06, now with 5 professionally-tuned kits to break. *Remove* the question; the template IS the color decision. Offer color in the brand-kit gallery afterwards, where the AA guard lives.
- Delivery fee / free-above ([onboarding-wizard.tsx:546-560](apps/platform/components/store-onboarding/onboarding-wizard.tsx#L546-L560)) are commerce-ops numbers she likely doesn't know on day zero. They're optional placeholders — good — but they still read as questions. *Defer* to a launch-checklist step («حدد رسوم التوصيل») that appears only if unset.
- Keep: name (prefilled), WhatsApp (prefilled), logo (optional). The wizard should trend toward **one real decision: the template.**

### S3-10 · **~~P2~~ RETRACTED — «إنشاء متجري» silent failure was an automation artifact, not a product bug**
Root-caused during the fix round: the two "failed" clicks fired **no** `/api/store-config-v2/seed` POST at all (network log), i.e. the click never reached the handler — the automation harness was clicking an out-of-viewport button (same pattern as the «إضافة عنصر» clicks that also only succeeded via JS `.click()`). The component itself is sound: button disabled when invalid, `Loader2` spinner while submitting, inline `role="alert"` on error ([onboarding-wizard.tsx:198,227,291-294,330](apps/platform/components/store-onboarding/onboarding-wizard.tsx#L198)). No change needed.

### S3-11 · **P3 — A tab that is only a door** — *merge*
Rail's «الهوية» tab renders one card with one button «افتح هوية العلامة» ([inspector-rail.tsx:207-231](apps/platform/components/store-builder-v2/inspector-rail.tsx#L207-L231), s25). Selecting the tab should just open the brand kit; the intermediate card is a click that exists to explain itself.

### S3-12 · **P3 — Panel-level «مفعّل» switch duplicates the row eye** — *remove*
Every section panel opens with a labeled enable switch + explainer («العناصر المعطلة مخفية عن المتجر») duplicating the row's eye toggle one centimeter away (s03). The 07-02 inventory kept it as "harmless and clear"; under a deletion lens it's a control + label + help sentence per panel that no task needs. Remove from the panel; the eye keeps the capability.

### S3-13 · **P3 — Command-Center preview renders raw icon ligatures** — *bug, adjacent*
The hub's live-preview iframe shows literal `search` / `shopping_bag 0` text where the storefront header icons should be (s01); the real storefront at :3001 renders them fine (s30) — Material Symbols ([storefront layout.tsx:43](apps/storefront/app/layout.tsx#L43)) evidently fails to load inside the [preview-card.tsx:148](apps/platform/components/store-command-center/preview-card.tsx#L148) iframe context. Trust-denting on the merchant's most-visited surface; not a complexity item, filed for completeness.

### S3-14 · **P3 — Beauty industry, fashion voice** — *default better*
Fresh beauty-industry store seeds hero «تشكيلة جديدة… أساسيات بأسلوب جريء، توصيل لكل العراق.» — generic-to-fashion, while the story section IS beauty-adapted (s21). Industry adaptation covers some sections and not the one she reads first. Extend `industry-seed-copy` coverage to hero title/subtitle per industry.

---

## 5 · Was Simple⇄Advanced the right primitive? (the requested blunt answer)

**Yes — and it should stay.** The live gap between modes is real and coherent: the hero panel is ~15 controls in Simple vs **72 in Advanced** (measured on #100053); the visibility/variants/breakpoint machinery is fully hidden; the escape hatch («خيارات أكثر؟ الوضع المتقدّم») and the intro popover both behave. Nothing in this sweep supports replacing it with per-task disclosure — that would *add* a mechanism, and the stack (mode + accordions + translation tuck-aways + collapsed repeaters + conditional fields) is currently consistent in direction: everything folds toward "one field, one line".

The honest criticisms are narrower:
1. **Mode gates fields, not surfaces** (S3-03). The tree, the health scorecard, the brand kit's dev fields, and the 48-card wall are identical in both modes. Finish the job at the surface level and the mode system pays for itself twice over.
2. **Two past fixes added complexity where removal was available.** UX2-01's `_href` promotion surfaced a *developer control* instead of a merchant decision (S3-06); and the accordion header «الأساسيات» is now chrome above the only group Simple shows for many sections — when a Simple panel has a single group, render the fields bare, no accordion.
3. One layer is over-eager rather than mis-designed: the translations reveal renders unconditionally (S3-07). Gate it; don't redesign it.

---

## 6 · Explicit "do not simplify" list

1. **Canvas inline editing + selection loop** (s27–s29) — 2 clicks to a live text edit. The product's crown jewel.
2. **The publish celebration dialog** — link / view / WhatsApp-share / keep-editing. Exactly four choices, all hers.
3. **The 5-step «جاهز للإطلاق؟» checklist** as a *form factor* — strike-through progress, plain verbs. It's the right Simple health UI; only its WhatsApp step lies (S3-01).
4. **The escape hatch on every Simple panel** («خيارات أكثر؟ الوضع المتقدّم») — one quiet line; it's how Karim is never orphaned and Fatima is never ambushed. Keep even though it's "one more element".
5. **The wizard's 3-step shape and its prefills** — name/WhatsApp reuse from signup is the best defaults-over-questions work in the product. Trim its questions (S3-09), never its warmth.
6. **Seeded system pages** (checkout, cart, tracking, policies) — 16 pages existing is *why* she doesn't have to build them. Hide them from the Simple tree (S3-03); do not stop seeding them.
7. **Category chips + search in the section picker** — with 48 sections the chips are load-bearing; after the S3-04 merge they still are.
8. **Undo/redo, autosave pill, draft recovery** — trust machinery; invisible until needed, exactly right.
9. **«نوع الزر الثاني» radio (واتساب/اتصال/رابط فئة/بدون)** — looks like extra choice, but it's the well-designed version of the same decision S3-06 wants for `_href`. It's the pattern to copy, not cut.

---

## 7 · Proposed rounds

**Round 1 — "The number and the door" (S3-01, S3-02b/c, S3-10)**
Single-source the WhatsApp number + make the checklist honest; auto-login after signup; land store-less tenants on /store; root-cause the silent wizard failure.
*Payoff:* removes every dead end in the first hour; the checklist stops lying. *Risk:* low — config plumbing + routing; health-rule change needs the shared-package tests updated.

**Round 2 — "Gate the surfaces" (S3-03, S3-05, S3-11, S3-12)**
Simple-mode page-tree collapse; checklist-only health in Simple (fixes the sliver bug by deletion); publish diff through `sectionDisplayName` + recommendations collapsed in Simple; الهوية tab opens brand kit directly; drop panel «مفعّل».
*Payoff:* the biggest visible de-cluttering of the editor shell; mode system becomes complete. *Risk:* medium — tree filtering must not strand deep links (elevate-on-deep-link already exists for mode; reuse it).

**Round 3 — "The wall and the words" (S3-04, S3-08, S3-06)**
Hide-invalid + merge near-duplicate cards in Simple picker; clean thumbnail SVGs (assets only); brand-kit-driven default for scribble color + enum-label guard; href destination picker.
*Payoff:* T3's one big decision shrinks from 48 to ~20-and-relevant; last dev vocabulary leaves Simple. *Risk:* medium — picker grouping needs care not to break drag-add or Karim's flat Advanced list; enum guard may flag existing sections (good).

**Round 4 — "Ask less at the start" (S3-09, S3-02a, S3-14)**
Wizard drops color + delivery questions (deferred to checklist); signup drops the plan matrix (trial by default); industry hero copy.
*Payoff:* first-session decision count drops by ~7 at the most fragile moment. *Risk:* plan-matrix removal touches billing expectations — needs the owner's sign-off, hence last.

Deferred unchanged from prior audits (still real, still not this sweep's highest leverage): OMS double chrome around the editor (UX-21), per-template real thumbnails (needs design assets), auto-translate/AI copy, slug/handle claim UI.

---

## Round 1 — fix status (2026-08-07, same session)

Implemented after owner approval, live-verified on tenants #100051/#100053/#100054:

| ID | Status | Fix |
|---|---|---|
| S3-01 | **FIXED** | `whatsapp_number_set` rule now reads `cfg.commerce.whatsapp_number` first (sections = legacy fallback) — health-rules.ts. Checklist WhatsApp step captures the number **inline in the row** (tel input + «حفظ», validated, saved via `setConfig` with localized undo description) instead of navigating — health-checklist-screen.tsx + inspector-rail/editor-shell wiring. Storefront CTA resolvers (`resolveTenantWhatsapp`/`resolveTenantPhone`) now read the V2 commerce number, so the value set once powers every WhatsApp button. Live: #100053's wizard-given number marks the step done automatically (3/5 → was lying at 2/5); #100051 inline capture strikes the step + autosaves (4/5). Tests: shared 319 ✓, sections 47 ✓ (4 new resolver tests), platform builder 277 ✓ (3 new inline-capture tests). |
| S3-02b | **FIXED** | Signup auto-logs-in (`signInWithPassword` after the API call — account is auto-confirmed server-side) and routes straight to `/store`; stale-session clear (UX2-18) retained; `/login` fallback only if sign-in fails. Localized `signup.success` key added (en/ar). Live: fresh signup #100054 landed directly in the wizard, zero login re-entry. |
| S3-02c | **PARTIAL** | New signups land on the wizard (via S3-02b). Existing store-less tenants logging in still land on the OMS dashboard — the "أكمل متجرك" dashboard card / store-aware login redirect needs an async store-state check and is deferred to Round 2. |
| S3-10 | **RETRACTED** | Automation artifact — see the finding above. No product change. |

Gates: workspace `type-check` 3/3 ✓, `lint` 0 errors ✓, vitest shared/sections/platform-builder all green.

## Round 2 — fix status (2026-08-08, same branch)

"Gate the surfaces" — implemented and live-verified on tenant #100051:

| ID | Status | Fix |
|---|---|---|
| S3-03a | **FIXED** | Simple page tree shows المتجر + الصفحات + الإعدادات only; التسوق/الطلب/السياسات/النظام (12 pages) fold behind one «كل الصفحات (12) ▸» reveal that auto-opens on deep links into a folded page — page-tree.tsx. Live: 13+ rows → 5 + one reveal. |
| S3-03b | **FIXED** | Simple health tab = launch checklist (+ publish blockers, still actionable) + a quiet «خيارات أكثر؟ الوضع المتقدّم» hatch; donut, dimension cards, filters and the 36-check list are Advanced-only. The sliver bug died with it: the dimension grid dropped viewport `lg:grid-cols-3` for container-driven `auto-fit minmax(140px,1fr)` — health-checklist-screen.tsx. |
| S3-05 | **FIXED** | Publish-sheet change rows resolve through `sectionDisplayName` (custom label wins, dev type gone) with localized «حقل واحد / {n} حقول / إخفاء» counts; in Simple the advisory recommendations collapse behind «توصيات ({n})» (expanded by default in Advanced) — publish-confirm-sheet.tsx. Live: `hero_image (hero_image) — 1 field` → «غلاف مع صورة — حقل واحد». |
| S3-11 | **FIXED** | الهوية tab opens the full-screen Brand Kit directly; the door-card panel deleted — inspector-rail.tsx. |
| S3-12 | **FIXED** | Panel «مفعّل» switch (+ explainer) removed; the row eye owns visibility — section-edit-panel.tsx. |
| S3-02c | **FIXED** | Store-less tenants (no V2 config, no draft) see a «متجرك ينتظرك — يلا نبنيه» card at the top of the OMS dashboard routing to /store — components/dashboard/build-store-banner.tsx (presence-only query: selects `schema_version` scalars, never the jsonb blobs). |

Gates: type-check 3/3 ✓, lint 0 errors ✓, builder suite 278 ✓ (new: Simple-health surface test; page-tree fold covered via editor-shell tests).

---

*Test artifacts: tenant #100053 (`noor.simplify3@example.com` / `NoorSimplify3_2026!`) created and left unpublished with hero text «تشكيلة للعيد جديدة»; tenant #100051 gained one publish + a شبكة منتجات section during T3/T5 measurement, and `commerce.whatsapp_number = 07709998877` during the S3-01 verification; tenant #100054 (`reem.simplify3@example.com`) created during the S3-02 verification, wizard not completed.*
