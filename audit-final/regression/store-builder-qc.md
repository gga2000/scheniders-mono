# Regression sweep — Store builder, QC quarantine, Categories V2

Checked against deployed commit **87e5e40** (read-only worktree `scratchpad/main-wt`). DB evidence comes from SELECT-only queries on Supabase `sduvpgqwhxragxtxztur`. No files were edited and no tests were run, because the worktree has no `node_modules` and the rules forbid installs. Statuses rest on static code reading plus SQL.

## Sources read (all under `docs/audits/` at 87e5e40)

| Source | Lines | Scope taken |
|---|---|---|
| STORE_BUILDER_SOTA_AUDIT_2026-06-10.md | 1150 | BUG1–BUG26 (P0/P1) and every P0/P1 suggestion (A1–O2, 37 items) |
| STORE_BUILDER_ARCHITECTURE_AUDIT_2026-06.md | 124 | P0 1–7, the 5 P1 bullets, and the 2 CRITICAL deletion blockers (§3) |
| STORE_BUILDER_GRABS_AND_EDGES_2026-06-12.md | 90 | EC1–EC11 (P0) and EC12–EC35 (P1) |
| STORE_BUILDER_UX_AUDIT_2026-07-02.md | 254 | UX-01–05 (P0), plus UX-06, 07, 08, 09, 10, 11, 14, 15 and 19 (P1). The "absorbed" prior IDs (A6, C8, C10, C11, O3, D9, BUG29) are P2/P3 in their source, so they are out of scope. |
| STORE_BUILDER_UX_AUDIT_2026-07-07.md | 161 | UX2-01–06 (P1). All 6 are marked "FIXED" in the doc, so each was re-verified. |
| BUILDER_AUDIT.md | 677 | All 147 `[P0]`/`[P1]` bullets. IDs are assigned as `BA-<section>.<n>` in document order. |
| QC_TEST_MATRIX.md | 356 | Every FAIL/PARTIAL/UX row in the execution log, the 7 findings, and every matrix case left without a result (see QC note) |
| CATEGORIES_V2_TEST_REPORT.md | 285 | F-01–F-05 (all findings; the 3 `[F]` rows are F-03, F-04 and F-05) |
| STORE_BUILDER_OVERHAUL_PLAN.md (721) and STORE_BUILDER_UX_PLAN_2026-07-02.md (284) | — | Context only; no rows taken from them |

**Path shorthands used in evidence:**
- `SB/` = `apps/platform/components/store-builder-v2/`
- `HOOK` = `apps/platform/hooks/use-store-builder-v2.ts`
- `SF/` = `apps/storefront/`
- `SEC/` = `packages/sections/src/`
- `CC/` = `apps/platform/components/store-command-center/`
- `I18N` = `apps/platform/lib/editor-i18n.ts`
- `HR` = `packages/shared/src/health-rules.ts`
- `QC/` = `apps/platform/components/products/qc/`
- `QCT` = `apps/platform/components/products/qc-quarantine-tab.tsx`

**QC matrix note:** none of the matrix cases A1–S5 has its Result cell filled in. A case counts as covered only if a PASS line in the doc's own Playwright execution log covers it. Every other case is listed below as "left open". Cases in the keyboard sections K, L, D8, S2 and S4 are out of scope for this program.

## Findings

| Src ID | Source doc | Sev (as given) | Title (short) | Status | Evidence @87e5e40 | Notes |
|---|---|---|---|---|---|---|
| ARCH-P0-1 | ARCH | P0 | V2 renders nowhere on the live store | Fixed | `SF/app/s/[tenant]/page.tsx:105-150` always renders `<V2Page>` when `store_config_v2` exists; legacy `getTemplate` only at :155 for un-ported tenants. SQL: 15/28 tenants have published v2; 13 are legacy-only (`store_config_v2 IS NULL`) | 13 tenants still render V1 templates |
| ARCH-P0-2 | ARCH | P0 | Stored XSS via `custom_css` | Fixed | `SF/app/s/[tenant]/layout.tsx:233-235` wraps it in `sanitizeCustomCss`; `packages/shared/src/util/sanitize-css.ts:13` neutralises every `</` (the `<style>` breakout), plus `@import`, `expression(` and remote `url()` | Regex sanitizer. Script execution is closed. CSS-escape tricks such as `u\72l(` are not covered (HYPOTHESIS, data-exfil only) |
| ARCH-P0-3 | ARCH | P0 | Anon can read unpublished drafts | Fixed | `SF/lib/tenant.ts:26-35` public column set excludes the draft. SQL `information_schema.column_privileges`: anon has no SELECT on `tenants.store_config_v2_draft` (only INSERT/UPDATE/REFERENCES). Migration `20260817144129_anon_revoke_tenant_draft.sql` | |
| ARCH-P0-4 | ARCH | P0 | `generate-copy` API unauthenticated | No longer applicable | No `generate-copy` route or `generateCopy` symbol anywhere in `apps/`/`packages/` (grep) | Route deleted with V1 |
| ARCH-P0-5 | ARCH | P0 | A/B experiments have no event writer | Fixed | Writers at `SF/app/api/exp-event/route.ts:81-90` (service role) and `SF/app/api/checkout/orders/route.ts:156`; `SF/components/v2-page.tsx:153` mounts the beacon | SQL: 0 rows in `store_config_experiment_events` (no live experiments) |
| ARCH-P0-6 | ARCH | P0 | Scheduled changes never apply | Fixed | Self-firing `time_window`, evaluated at render by `packages/shared/src/types/store-config-v2-resolver.ts`; schedule actions edit the variant (`SB/scheduled-changes-screen.tsx:268-364`) | Applies only once published (by design). SQL: 0 schedule rows. See BUG6 |
| ARCH-P0-7 | ARCH | P0 | Patch API: unvalidated JSON and read-modify-write race | Partially fixed | Race fixed: RPC `apply_store_config_v2_patch` does `jsonb_set` under `pg_advisory_xact_lock`. Root allowlist, depth and byte caps: `apps/platform/app/api/store-config-v2/patch/route.ts:143-162`. `value` is still `z.unknown()` (:35) and is never checked against the section schema. No optimistic lock on patches. The RPC accepts `p_is_draft=false` and writes **live** `store_config_v2` for any active member (no role check; function body via SQL) | Cross-ref EC3, BUG24, BUG25 |
| ARCH-P1-1 | ARCH | P1 | Non-atomic publish; version insert swallowed | Fixed | `publish_store_config_v2` (SQL def) updates tenants and inserts `store_config_versions` in one function; `HOOK:609-617` single RPC call | |
| ARCH-P1-2 | ARCH | P1 | Two schema sources; manifest drift | Fixed | `apps/platform/lib/sections-manifest.ts:1-20` is derived at runtime from `BUILTIN_SECTIONS` ("DO NOT hand-edit") | |
| ARCH-P1-3 | ARCH | P1 | Branding logo upload overwrites `branding` JSONB | No longer applicable | `apps/platform/components/store-builder/` (V1, incl. branding-editor) no longer exists | |
| ARCH-P1-4 | ARCH | P1 | `tenant_domains` / `store_pages` have no migration | Still open | No `CREATE TABLE` for either table in `packages/supabase/migrations/` (grep). Only policy migrations exist (`20260819074718_tenant_domains_anon_lookup.sql`, `20260819083055_tenant_domains_member_policies_authenticated.sql`). Both tables are live (SQL `pg_policies` lists them) | Reproducibility/drift |
| ARCH-P1-5 | ARCH | P1 | No storefront caching | Fixed | `SF/lib/tenant.ts:107-154` and `SF/lib/queries.ts:25-28` use `unstable_cache` with 60s TTL and tags | No on-demand revalidate on publish |
| ARCH-CRIT-1 | ARCH §3 | CRITICAL | V1 is the live renderer (deletion blocker) | Fixed | Same evidence as ARCH-P0-1; V1 editor directory deleted | |
| ARCH-CRIT-2 | ARCH §3 | CRITICAL | `StoreConfigV2` has no home for `whatsapp_number`, `enable_whatsapp_order`, `custom_css`, `template` and the `schneiders` behavioural config | Fixed | `packages/shared/src/types/store-config-v2.ts:383-386` (`whatsapp_number`, `enable_whatsapp_order`, templates) and :456-462 (`commerce`, `custom_css`, `redirects`, `custom_pages`) | |
| BUG1 | SOTA | P0 | Device switch not viewport-accurate | Fixed | `SB/preview-frame.tsx:71-108` renders a real `<iframe>` at the device width; mounted at `SB/editor-shell.tsx:1714`; inline LivePreview deleted | |
| BUG2 | SOTA | P0 | Hub Health/Pages score the published config | Fixed | `CC/command-center.tsx:45` uses `store_config_v2_draft ?? store_config_v2` | |
| BUG3 | SOTA | P0 | `og_image_set` checks a field the storefront never renders | Fixed | `SF/app/s/[tenant]/layout.tsx:325-334` now renders `v2Identity.favicon_url` and `og_image_url` (with legacy fallback); `HR:375-385` | Health screen still shows a "Blocks publish" chip (`I18N:783`) although publish is never blocked |
| BUG4 | SOTA | P0 | localStorage backup is write-only | Fixed | `HOOK:891` reads the backup back (`getItem(localBackupKey…)`) for the recovery banner | Cross-ref EC33 |
| BUG5 | SOTA | P0 | No error boundary in the editor route | Partially fixed | `apps/platform/app/store/edit/error.tsx` route boundary with Sentry. No pane-level boundaries in `SB/editor-shell.tsx` (no `ErrorBoundary` usage, grep) | Inspector throw still unmounts the whole editor |
| BUG6 | SOTA | P0 | End early / Cancel / Edit start don't touch the live variant | Fixed | `SB/scheduled-changes-screen.tsx:268-282` (end early → `patchTimeWindow end_iso`), :304-315 (cancel), :355-366 (start) via `builder.setConfig` | Takes effect on next publish |
| BUG7 | SOTA | P1 | Picker-to-canvas drag is dead | Still open | `SB/section-picker.tsx:654` uses `useDraggable`, but there is no `useDroppable` anywhere in `SB/` (grep). `SB/editor-shell.tsx:845-848` says drop zones were "moving onto the iframe overlay" and the setter is unused (`const [, set_picker_drag_active]`) | Phantom DnD code |
| BUG8 | SOTA | P1 | Section thumbnails missing → blank tiles | Still open | 27 of 58 declared thumbnails have no file in `SF/public/sections/` or `apps/platform/public`. Missing: about_spotlight, accordion_richtext, category_grid, category_spotlight_pair, checkout_order_summary, collection_trio, cta_banner, exit_intent_offer, faq_contact_split, hero_card_float, html_embed, instagram_grid, logo_strip, numbers_stat_strip, order_confirmation, pdp_buy_box, pdp_direct_order, pdp_info_tabs, pdp_related_products, pillars_grid, product_bundles, product_reviews, site_footer, site_header, sticky_cta_bar, track_order_lookup, trust_badge_row. `SB/section-picker.tsx:704-706` hides the broken img | Worse than reported (16 → 27) |
| BUG9 | SOTA | P1 | `z.union(literal)` columns render "Unsupported field" | Still open | `SB/auto-form-schema.ts` `inferField` has no `union` case (default → `unknown`). `SEC/feature_grid.tsx:30` `columns: z.union([z.literal(2)…])`. `SB/auto-form-fields.tsx:271` renders `unsupported_field` | Merchants still can't set grid columns |
| BUG10 | SOTA | P1 | One-sided significance; "losing" unreachable | Fixed | `HOOK:1412` `Math.abs(z) > Z_THRESHOLD`; `SB/experiments-screen.tsx:112-113` win/lose by sign | |
| BUG11 | SOTA | P1 | "Stop & promote winner" promotes nothing | Still open | `SB/experiments-screen.tsx:248-254` `handleStop` only sets `status:'completed'`; label still "Stop &amp; promote winner" at :586; `canPromoteWinner` (:117) is never called | Cross-ref BA-8.8 |
| BUG12 | SOTA | P1 | ATC / Checkout funnel columns always blank | Still open | Only `event_type:"view"` is posted (`SF/components/experiment-beacon.tsx:33`); nothing emits `add_to_cart` or `checkout_start` (grep). The viewer still renders ATC and Checkout at `SB/experiments-screen.tsx:1097-1118` | Now shows 0% instead of "—" |
| BUG13 | SOTA | P1 | sticky_cta_bar / pdp_add_to_cart read nonexistent tenant fields | Fixed | `SEC/sticky_cta_bar.client.tsx:106-107` and `SEC/pdp_add_to_cart.client.tsx:46` use `resolveTenantWhatsapp`/`resolveTenantPhone` | |
| BUG14 | SOTA | P1 | free_gift_strip progress frozen at 0% | Fixed | `SEC/free_gift_strip.client.tsx:30` `useCart((s)=>s.getTotal())` | |
| BUG15 | SOTA | P1 | Hardcoded 5,000 IQD fee, never submitted | Fixed | `SF/app/actions/checkout.ts:261-264` computes `computeDeliveryFee` server-side, per governorate (`packages/shared/src/delivery.ts:46-67`) | Cross-ref EC2, EC16 |
| BUG16 | SOTA | P1 | List selection doesn't scroll the canvas | Fixed | `SB/editor-shell.tsx:1124-1130` `scrollIntoView` + `bridge.scrollToSection`; handled at `SF/components/schneiders-preview-bridge.tsx:450` | |
| BUG17 | SOTA | P1 | Inline edit on wrapper container corrupts markup on revert | Still open | `SF/components/schneiders-preview-bridge.tsx:154-162` takes the closest `[data-i18n-field]` container; revert at :269 sets `el.textContent = original`. Wrappers remain at `SEC/delivery_promise.tsx:101` and `SEC/about_block.tsx:74` | |
| BUG18 | SOTA | P1 | Breakpoint override editor drops ar/ku | Fixed | `SB/auto-form-breakpoints.tsx:234-258` uses the full `I18nStringInput` per locale | Cross-ref UX-23 |
| BUG19 | SOTA | P1 | New repeater item is `{}` | Still open | `SB/auto-form-fields.tsx:736-738` `handleAdd` → `defaultValueForField` returns `{}` for objects (:290-291) | |
| BUG20 | SOTA | P1 | Variant presets / auto-create A/B dead | Still open | `SB/section-edit-panel.tsx:482-489` renders `<VariantAddWizard>` without `sectionType` or `onCreateExperimentForPreset` | |
| BUG21 | SOTA | P1 | Full-config autosave clobbers atomic patch | Fixed | `HOOK:517-527` `suppressAutoSaveRef` skips the whole-jsonb save after `patchField`; patch failure reconciles (:833-842) | |
| BUG22 | SOTA | P1 | config-diff aligns arrays by index | Fixed | `SB/config-diff.ts:48-85` matches arrays of objects by `id` | |
| BUG23 | SOTA | P1 | Hub mislabels live trial stores as Draft | Fixed | `CC/command-center.tsx:37` `isStorePubliclyLive(tenant.status)` | |
| BUG24 | SOTA | P1 | Zod errors never surfaced; no root schema validation | Still open | No `safeParse` or inline error state in `SB/auto-form*.tsx` (grep). `ColorControl` accepts any string (`SB/auto-form-fields.tsx:418-426`). Publish RPC validates only object type, `schema_version` and top-level keys (SQL def) | Cross-ref BA-5.12 |
| BUG25 | SOTA | P1 | No multi-editor conflict detection | Partially fixed | Publish: `p_expected_rev` checked against `store_config_rev` (`HOOK:612-631`; RPC def). Draft autosave is still a blind `UPDATE` (`HOOK:456-462`), and patches carry no rev | Two editors' drafts still last-write-wins |
| BUG26 | SOTA | P1 | Device switch doesn't drive variant resolution | Fixed | `SB/editor-shell.tsx:565` passes `breakpoint: builder.active_breakpoint` in the iframe runtime | |
| A1 | SOTA | P1 | No canvas zoom / fit | Fixed | `SB/editor-shell.tsx:390-403,1729` fit / 50 / 75 / 100 | Cross-ref BA-12.6 |
| A2 | SOTA | P1 | No drag-to-reorder on canvas | Still open | `SB/preview-overlay.tsx:523-554` toolbar offers only Up/Down buttons; the only drag in the overlay is spacing (:215-265) | |
| A3 | SOTA | P1 | Canvas chrome hardcoded English | Partially fixed | Context menu is localized (`SB/live-preview-context-menu.tsx:44-74,152`). Overlay toolbar aria-labels are still English: "Edit section" (`SB/preview-overlay.tsx:523`), "Duplicate section" (`:530`), "Move section up" (`:537`), "Move section down" (`:544`), "Delete section" (`:551`); plus the `"Section"` label fallback (`:313`) and so is `aria-label="Insert section here"` (:373) | |
| B1 | SOTA | P1 | No copy/paste or move of sections between pages | Still open | No clipboard / move-to-page symbols in `SB/section-list-panel.tsx`, `SB/editor-shell.tsx` or `I18N` (grep) | |
| B2 | SOTA | P1 | Section library English-only | Fixed | `apps/platform/lib/sections-manifest.ts:101-107` `sectionDisplayName(entry, locale)` used in picker cards (`SB/section-picker.tsx:713`) | Cross-ref UX-15 |
| C1 | SOTA | P1 | Repeater drag handle is decorative | Partially fixed | Up/down move buttons exist (`SB/auto-form-fields.tsx:866-871`), but `GripVertical` is still a non-draggable icon inside the toggle button (:848-851) | Cross-ref BA-5.10 |
| C2 | SOTA | P1 | No reset-to-default | Fixed | Section-level reset in `SB/auto-form.tsx:151-160` | Per-field reset absent (BA-5.16) |
| C3 | SOTA | P1 | `.describe('video'/'datetime')` have no control | Still open | 2 `describe("datetime")` and 2 `describe("video")` in `SEC/`; `SB/auto-form-fields.tsx:341-364` branches only on image/color/multiline | Countdown date is a raw text input |
| D1 | SOTA | P1 | No theme / preset gallery | Fixed | `apps/platform/lib/brand-themes.ts`; gallery at `SB/brand-kit-editor.tsx:351` («إطلالات جاهزة») | Cross-ref BA-1.6, BA-7.1, BA-15.2 |
| D2 | SOTA | P1 | Font previews render in fallback | Partially fixed | Inline `fontFamily` set (`SB/brand-kit/controls.tsx:684-691`), but the platform loads no stylesheet for catalogue fonts (grep `fonts.googleapis` in `apps/platform` → only payslip and an unused `lib/font-pairings.ts`) | Previews render in fallback unless the font is installed locally |
| D3 | SOTA | P1 | No Arabic font pairing | Fixed | `SB/brand-kit/controls.tsx:707-713` (Cairo, Tajawal, Almarai, IBM Plex Sans Arabic, Noto Sans Arabic) | Cross-ref BA-7.5, BA-18.5 |
| E1 | SOTA | P1 | No per-page SEO UI | Fixed | `SB/page-seo-panel.tsx:42-186` (`PageSeoPanel`) edits the active page's `PageMeta`: bilingual title (`:110-117`), description (`:120-127`), OG image URL with preview (`:144-155`) and noindex (`:165-169`), each through `patch()` → `onChange` (`:53`). Mounted as the inspector's SEO tab: `SB/inspector-rail.tsx:233-242` passes `meta={pageMeta}` and `onChange={onChangePageMeta}`. The storefront consumes `page.meta` in `SF/lib/storefront-runtime.ts:37-47` (`resolveV2PageMetadata`). Unit test `SB/page-seo-panel.test.tsx`. | Evidence strengthened in Phase 1 round 1. Not run (no node_modules). |
| E2 | SOTA | P1 | No first-run onboarding | Fixed | `apps/platform/app/store/onboarding/page.tsx`; `SB/editor-banners.tsx:40-81` first-run banner | |
| E3 | SOTA | P1 | No nav/menu builder | Fixed | `SB/nav-builder-screen.tsx:41` `NavBuilderScreen` edits `globals.header.base.nav_links` (`:48-72`: add, rename en+ar, re-point, reorder, remove); reachable from the settings tree (`SB/page-tree.tsx:190` `{ id: "nav", … }`) and rendered by `SB/system-screen-router.tsx:120-121` (`screen === "nav"`). | |
| F1 | SOTA | P1 | Two breakpoint systems collide | Still open | Inline overrides create shortcut variants (`apps/platform/lib/responsive-overrides.ts:175-183`) with `priority: 0`, the same default as wizard breakpoint variants. The resolver sorts by priority only (`store-config-v2-resolver.ts:129`) | |
| F2 | SOTA | P1 | No variant overlap/conflict detection | Still open | No conflict/overlap logic in `SB/variant-list.tsx` or `apps/platform/lib` (grep) | |
| F3 | SOTA | P1 | Wizard and VariantEditor chrome English | Still open | `SB/variant-add-wizard.tsx:85-96` ("For an A/B test", "Bind this variant to one experiment arm."), :1505, :1189-1190; `SB/variant-editor.tsx:450` "Done" | |
| G1 | SOTA | P1 | No beforeunload guard | Fixed | `apps/platform/hooks/use-store-builder-v2.ts:564-582`: a `useEffect` registers `onBeforeUnload` (`:566`) on `window` (`:580`, removed at `:581`). When `pendingDraftWriteRef.current` is set (edits not yet in the DB draft, `:425`), it writes a localStorage backup (`localBackupKey(tenantId)`) and calls `e.preventDefault()` plus `e.returnValue = ""`, which raises the browser's leave-site prompt. | Evidence strengthened in Phase 1 round 1. The backup write swallows quota errors in an empty catch. |
| G2 | SOTA | P1 | Autosave failure terminal, no retry | Fixed | `HOOK:478-500` exponential backoff retry; retry pill `SB/toolbar-controls.tsx:284-287` | Cross-ref BA-9.10, BA-16.4 |
| H1 | SOTA | P1 | No COD / governorate-shipping readiness check | Still open | `HR` check list (lines 308-791) has no shipping or delivery-fee rule | |
| H2 | SOTA | P1 | No JSON-LD check | Still open | No structured-data rule in `HR` | |
| H3 | SOTA | P1 | No sitemap/robots/canonical/indexability check | Partially fixed | `important_pages_indexable` exists at `HR:452-467`. No sitemap/canonical check, and the storefront has **no sitemap route at all** (`find SF/app -name 'sitemap*'` → none) | |
| I1 | SOTA | P1 | No machine-translate or copy-from-English | Partially fixed | Copy-from-locale exists (`SB/i18n-string-input.tsx:213-221`); no auto-translate | |
| I2 | SOTA | P1 | `enabled_locales` never writable | Still open | Only `apps/platform/lib/starter-store.ts:167` writes it (onboarding). `SB/i18n-screen.tsx:61,238` only reads it | |
| I3 | SOTA | P1 | Editing surface ignores `enabled_locales` | Still open | `SB/i18n-string-input.tsx` and `SB/editor-toolbar.tsx` never read `enabled_locales` (grep) | |
| I4 | SOTA | P1 | "Jump to untranslated" doesn't set locale or scroll | Still open | `SB/editor-shell.tsx:1685-1690` sets page and section only; no locale and no field focus | |
| J1 | SOTA | P1 | Experiment editor hides arm→variant binding | Still open | `SB/experiments-screen.tsx` uses `findExperimentReferences` only for delete (:265,304) | |
| J2 | SOTA | P1 | No sample-size/MDE planning or peeking guard | Still open | Only a `needs_more_data` gate (:98-111); no MDE/sample planning | |
| J3 | SOTA | P1 | Segments show "—" audience size | Still open | `SB/segments-screen.tsx:327` hardcoded `—` | Cross-ref BA-8.12 |
| K1 | SOTA | P1 | Hub preview loads published, not draft | Still open | `CC/preview-card.tsx:148-153` `src={storefrontUrl}` | |
| K2 | SOTA | P1 | Hub preview renders desktop unscaled | Still open | `CC/preview-card.tsx:124-130` desktop = `w-full`, fixed 480px height, no scale | |
| K3 | SOTA | P1 | No inline Publish on hub | Still open | `CC/header-bar.tsx:28-48` shows the "unpublished changes" pill only; no publish action in `CC/` (grep) | |
| K4 | SOTA | P1 | No first-run guidance on hub | Fixed | `CC/command-center.tsx:53` `isBrandNew`; `CC/health-card.tsx:104` links to `/store/onboarding` | |
| L1 | SOTA | P1 | No real product-reviews section with photos | Fixed | `SEC/product_reviews.client.tsx` (images :134); `SF/app/api/reviews/route.ts` | |
| N1 | SOTA | P1 | No custom-code/pixel injection; no custom_css editor | Partially fixed | `SB/pixels-screen.tsx` exists. No editor UI writes `custom_css` (grep finds it only in the patch route) | |
| O1 | SOTA | P1 | Top bar overcrowds below ~1280px | Unverifiable | `SB/editor-toolbar.tsx:71` is still a single non-wrapping row. Behaviour at 1024–1279px needs a live render | Below 1024px the mobile shell takes over |
| O2 | SOTA | P1 | Power screens replace canvas with no breadcrumb or exit | Fixed | `SB/system-screen-router.tsx:62-72` breadcrumb plus "back to canvas" | Canvas is still replaced (BA-1.5) |
| EC1 | GRABS | P0 | Unlimited oversell | Still open | SQL `inv_phase`: `'confirmed'`→RESERVED, everything else including `'new'`→CLOSED. `create_order_atomic` (both overloads) has no availability check (SQL regex on def). `SF/app/actions/checkout.ts:355` inserts `status:"new"` with no stock check | Doc marked DEFERRED |
| EC2 | GRABS | P0 | Displayed total ≠ recorded total | Fixed | `SF/app/actions/checkout.ts:261-264` server-side `computeDeliveryFee` recorded | |
| EC3 | GRABS | P0 | Publish RPC bypasses allowlist; no role check | Partially fixed | RPC now checks the `owner/admin/super_admin` role, object type, schema_version, 2MB cap and key allowlist (SQL def). Two bypasses remain. (1) `apply_store_config_v2_patch(p_is_draft=false)` writes live config for any active member. (2) Authenticated users hold column UPDATE on `tenants.store_config_v2` (SQL `column_privileges`), and policy `tenant_member_update` lets any active member update their own tenant row | See New observations 1–2 |
| EC4 | GRABS | P0 | Stored XSS via `about.body` | Fixed | `SF/app/s/[tenant]/about/page.tsx:64-70` `htmlToSafeParagraphs` renders text | |
| EC5 | GRABS | P0 | Open redirect | Fixed | `SF/lib/redirects.ts` rejects scheme and `//` targets; `encodeURI` also encodes `\` | |
| EC6 | GRABS | P0 | html_embed XSS on conversion path | Fixed | `SEC/html_embed.client.tsx:56` `sandbox="allow-scripts allow-popups allow-forms"` (no same-origin); `valid_on` excludes cart/checkout (test `SEC/html_embed.test.tsx:39-52`) | |
| EC7 | GRABS | P0 | Malformed config crashes store | Fixed | `SF/lib/storefront-runtime.ts:24,44` `Array.isArray(v2.pages)` guards | No root schema validation (BUG24) |
| EC8 | GRABS | P0 | In-flight PATCH resurrects discarded draft | Fixed | `HOOK:597,675` await `inFlightPatchRef` before publish/revert | |
| EC9 | GRABS | P0 | First edit on never-published store corrupts skeleton | Fixed | `HOOK:432,790-800` routes edits through a full save until `draftSeededRef` | The RPC still does `COALESCE(...,'{}')`; the guard is client-side only |
| EC10 | GRABS | P0 | One throwing section white-screens page | Fixed | `SEC/RenderSection.tsx:36,92-94` `SectionErrorBoundary` | |
| EC11 | GRABS | P0 | Empty home shows legacy template / blank | Partially fixed | `SF/app/s/[tenant]/page.tsx:97-108` never falls back to legacy once v2 exists. No publish gate for an empty or all-hidden home; it renders an empty body | |
| EC12 | GRABS | P1 | Kurdish renders English | Fixed | 0 `locale === "ar" ?` and 26 `locale !== "en" ?` ternaries in `SEC/` (grep) | |
| EC13 | GRABS | P1 | Storefront mono-locale | Fixed | `SF/components/v2-page.tsx:130` `resolveVisitorLocale`; `SF/app/s/[tenant]/layout.tsx:108` | Metadata still uses `default_locale` (per doc) |
| EC14 | GRABS | P1 | No Arabic glyph fonts | Fixed | `SF/app/layout.tsx:6,42` `Noto_Sans_Arabic`; `packages/shared/src/brand-kit-vars.ts:319` fallback stack | |
| EC15 | GRABS | P1 | `<html lang>` hardcoded `ar` | Partially fixed | SSR still `lang="ar"` (`SF/app/layout.tsx:58-59`); corrected client-side by `<HtmlLang>` (`SF/app/s/[tenant]/layout.tsx:238`) | |
| EC16 | GRABS | P1 | Delivery numbers diverge | Fixed | Single `computeDeliveryFee` (`packages/shared/src/delivery.ts:46`) | |
| EC17 | GRABS | P1 | Duplicate COD orders | Fixed | `SF/app/actions/checkout.ts:362` `idempotency_key`; SQL: unique index `uq_orders_tenant_idempotency` | |
| EC18 | GRABS | P1 | Custom pages blank product grids | Fixed | `SF/app/s/[tenant]/p/[slug]/page.tsx:69` `listProducts(tenant.id,{limit:48})` | |
| EC19 | GRABS | P1 | Experiment data forgeable | Fixed | `SF/app/api/exp-event/route.ts:70-76` re-derives the arm via `assignAbArm` | No per-visitor dedup index (per doc) |
| EC20 | GRABS | P1 | Deleting segment/experiment orphans variants | Fixed | `HOOK:16-17` imports and uses `pruneVariantsForDeleted*` (:1279-1288) | |
| EC21 | GRABS | P1 | Scheduled changes mis-fire (TZ / bad end) | Fixed | `SB/scheduled-changes-screen.tsx:108` `zonedWallTimeToUtcISO`; `packages/shared/src/schedule-time.ts` | |
| EC22 | GRABS | P1 | Carts bleed across tenants | Fixed | `SEC/helpers/cart-store.ts:36,67` `cartKeyFor` | |
| EC23 | GRABS | P1 | Loose phone validation | Fixed | `SF/app/actions/checkout.ts:95` `normalizeIraqiMobile` | |
| EC24 | GRABS | P1 | Stale-cart checkout dead-ends | Fixed | `SF/app/actions/checkout.ts:54-62` per-item `unavailable`/`price_changed` issues | |
| EC25 | GRABS | P1 | Preview bridge accepts any origin | Fixed | `SF/components/schneiders-preview-bridge.tsx:446` `isAllowedParentOrigin`; live renderer :32 | |
| EC26 | GRABS | P1 | WhatsApp handoff loses fidelity | Fixed | Shared `whatsappCartLink` (per doc). `pdp_add_to_cart` uses `whatsappOrderLink` (`SEC/pdp_add_to_cart.client.tsx:22`) | WhatsApp orders still create no OMS record (doc) |
| EC27 | GRABS | P1 | Editor jank | Fixed | `HOOK` single `serializedConfig` (used :530); `RenderSection` memo | |
| EC28 | GRABS | P1 | Multi-MB editor payloads | Fixed | `HOOK:1337-1359` uses RPC `aggregate_experiment_stats` (SQL: exists, tenant-guarded); lazy `getVersionConfig` (`SB/version-history-screen.tsx:249-250`) | |
| EC29 | GRABS | P1 | No storefront caching | Fixed | Same evidence as ARCH-P1-5 | Cross-ref ARCH-P1-5 |
| EC30 | GRABS | P1 | Checkout test suite red | Fixed | Fixture uses `"BG"` (`SF/app/api/checkout/orders/route.test.ts:51,84`) | Suite not executed here (no node_modules in worktree) |
| EC31 | GRABS | P1 | Segment/experiment mutations bypass atomic patch | Partially fixed | `HOOK:1194,1271,1279` use `patchField`. Schedule-row ↔ variant atomicity is still non-atomic (doc "REMAINING"; `SB/scheduled-changes-screen.tsx:1029-1038` writes the table and the config separately) | |
| EC32 | GRABS | P1 | Fresh store defaults English-only | Fixed | `packages/shared/src/types/store-config-v2-resolver.ts:377-378` `default_locale:'ar'` | |
| EC33 | GRABS | P1 | Crash backup keyed only by tenant | Fixed | `HOOK:84,266` `initialUpdatedAt` compared before offering restore | |
| EC34 | GRABS | P1 | Foreign-host image crashes page | Partially fixed | `SF/next.config.ts:10-20` remotePatterns unchanged. Content sections pass `unoptimized={!isOptimizableImageHost()}` (`SEC/helpers/image.ts:22`), but product imagery does not: `SEC/helpers/product-card.tsx`, `SEC/product_grid.tsx`, `SEC/category_grid.tsx`, `SEC/cart_line_items.client.tsx` and `SEC/checkout_order_summary.client.tsx` have `next/image` with no `unoptimized`. Section boundary (EC10) contains the blast radius | SQL: 0 of 48 product images are off-allowlist today |
| EC35 | GRABS | P1 | Currency / bidi | Fixed | `SEC/helpers/format.ts:14` locale-aware `formatPrice`; 51 `<bdi>` uses in `SEC/` | |
| UX-01 | UX 07-02 | P0 | Invisible black-on-black CTAs | Fixed | `packages/ui/src/styles/tokens.css:74,180` `--primary-foreground: var(--primary-fg)` | |
| UX-02 | UX 07-02 | P0 | Style tab embeds Brand Kit in 380px rail | Fixed | `SB/inspector-rail.tsx:224-225` route card → `onJumpToSetting("brand_kit")` | |
| UX-03 | UX 07-02 | P0 | English first-run banner claims "homepage" on every page | Fixed | `SB/editor-banners.tsx:76-77` localized, with page-aware message | |
| UX-04 | UX 07-02 | P0 | English toolbar and inspector tabs | Fixed | `SB/inspector-rail.tsx:177` `t(STRINGS.inspector.tab_health, locale)`; toolbar uses `t()` (`SB/editor-toolbar.tsx`) | |
| UX-05 | UX 07-02 | P0 | Per-field control explosion | Fixed | `SB/auto-form.tsx:40,104` mode gating; `SB/section-edit-panel.tsx:363` Simple hides visibility/variants | |
| UX-06 | UX 07-02 | P1 | Wizard colour fails AA silently | Fixed | `apps/platform/components/store-onboarding/onboarding-wizard.tsx:73-107` contrast check and warning | |
| UX-07 | UX 07-02 | P1 | Publish disabled on never-published seeded store | Fixed | `HOOK:402-415` `!everPublishedRef.current \|\| unpublishedDraftRef.current` | |
| UX-08 | UX 07-02 | P1 | Publish sheet: English jargon and "publish anyway" framing | Fixed | `SB/publish-confirm-sheet.tsx:55-60` localized via `health-check-copy`; CTA `publish_cta` «انشر متجري» (:280) | Cross-ref UX2-11 (P2) |
| UX-09 | UX 07-02 | P1 | Stale selection ring after breakpoint switch | Fixed | `SB/editor-shell.tsx:437-457` re-measures on `active_breakpoint` change | |
| UX-10 | UX 07-02 | P1 | "No editable layers detected" shown by default | Fixed | `SB/block-layers-panel.tsx:179` `if (layers.length === 0) return null` | |
| UX-11 | UX 07-02 | P1 | Seed copy not industry-adapted | Fixed | `apps/platform/lib/industry-seed-copy.ts` used by `apps/platform/lib/starter-store.ts` | |
| UX-14 | UX 07-02 | P1 | English schema-key labels | Fixed | `apps/platform/lib/section-field-meta.ts` `resolveFieldLabel` (`SB/auto-form-fields.tsx:95`) | |
| UX-15 | UX 07-02 | P1 | English section names | Fixed | `sectionDisplayName` (`apps/platform/lib/sections-manifest.ts:101`) | Cross-ref B2 |
| UX-19 | UX 07-02 | P1 | No post-publish success moment | Fixed | `SB/editor-banners.tsx:223-335` `PublishSuccessDialog` | Cross-ref BA-9.11 |
| UX2-01 | UX 07-07 | P1 | Simple mode ships half-controls | Fixed | `apps/platform/lib/section-field-groups.ts:235-266` `SIMPLE_SHOW_*` + `getFieldGroupForMode`; `html_embed` html hidden (:225) | |
| UX2-02 | UX 07-07 | P1 | Health tab chrome / rule messages English | Fixed | `apps/platform/lib/health-check-copy.ts` (36 checks, ar/en/ku) used by `SB/publish-confirm-sheet.tsx:47-60` and `SB/editor-shell.tsx:1254` | Category label still jargon (BA-10.1) |
| UX2-03 | UX 07-07 | P1 | Launch-checklist "fix" is a silent no-op | Still open | The fix is defective. `SB/health-checklist-screen.tsx:249-262` does `Object.entries(config.pages ?? {})`, but `pages` is an **array** (`SF/lib/storefront-runtime.ts:24`). The "page id" is therefore an index string ("0"), so `onSelectSection("0", id)` is called. When no section holds a WhatsApp key (exactly the failing case), it falls back to `fixPage("home")` (`HR:345`), still a no-op on home | Doc claims FIXED |
| UX2-04 | UX 07-07 | P1 | Autosave failures invisible; retry hits wrong op | Fixed | `HOOK:625-633,652-656` publish errors no longer set save-pill error; patch failure → reconcile save → error state with retry (`HOOK:478-500`) | |
| UX2-05 | UX 07-07 | P1 | Publish-blocked tooltip English | Fixed | `SB/editor-shell.tsx:1254-1260` `checkCopyMessage` + `tFormat` | |
| UX2-06 | UX 07-07 | P1 | Brand-kit body English | Fixed | `I18N` `brand_kit_body` block (`apps/platform/lib/editor-i18n.ts:853-893`); `SB/brand-kit-editor.tsx:198,231,243` | EN fallback strings remain designer vocab (BA-7.6) |
| BA-1.1 | BUILDER | P0 | 3-pane shell ignores phone | Fixed | `SB/editor-shell.tsx:1270-1271,1430` → `MobileEditorShell` below 1024px (`apps/platform/hooks/use-is-mobile-editor.ts:16`) | |
| BA-1.2 | BUILDER | P0 | Page tree leaks raw ids | Fixed | `SB/page-tree.tsx:71-105` every page has a `labelKey`; `getPageLabel` localizes (:121-130) | |
| BA-1.3 | BUILDER | P0 | "Soon" fallback when `onSelectSetting` missing | Fixed | All call sites pass it (`SB/editor-shell.tsx:1449,1657`; `SB/mobile-editor-shell.tsx:381,555`) | The fallback code is still present at `SB/page-tree.tsx:329-334,370-373` |
| BA-1.4 | BUILDER | P0 | InspectorRail / PublishConfirmSheet unused | Fixed | Rendered at `SB/editor-shell.tsx:1832,1538,1917` | |
| BA-1.5 | BUILDER | P1 | System screens replace canvas | Still open | `SB/editor-shell.tsx:1673-1691` swaps `<main>` content to `SystemScreenRouter` | Breadcrumb added (O2) |
| BA-1.6 | BUILDER | P1 | Brand Kit full-screen, no presets | Fixed | Presets half: `SB/brand-kit-editor.tsx:350-359` theme gallery (`data-testid="brand-theme-gallery"`, `BRAND_THEMES`) sits second, after Identity (`:263`) and before Colors (`:421`), Typography (`:533`), Shape (`:668`), Motion (`:840`) and Voice (`:897`), so one click sets every token instead of ~24 decisions up front; native eyedropper at `SB/brand-kit/controls.tsx:392-395,418`; no "Coming soon" strings in the editor (grep = 0). Full-screen half: still full-screen by design — `SB/system-screen-router.tsx:81-86` renders it as a system screen and `SB/inspector-rail.tsx:69-71` documents that the Style tab routes to the full-screen Brand Kit because its two-pane layout (`SB/brand-kit-editor.tsx:248-249`, `lg:grid-cols-[…_minmax(360px,420px)]` with live preview) does not fit the 380 px rail. | The audit's complaint was the full-screen form forcing every decision up front; the preset gallery removes that. The full-screen container itself was kept on purpose, so if the item is read literally as "must not be full-screen" this half is a won't-do, not a fix. |
| BA-1.7 | BUILDER | P1 | List and edit panels compete | Fixed | `SB/inspector-rail.tsx:10,187-198` inline expand via `expandedSectionId` | |
| BA-1.8 | BUILDER | P1 | Advanced accordion hides Versions; misspelled key | Still open | `SB/page-tree.tsx:195` key `schneiders.builder.advanced.open`; `versions` in `ADVANCED_SETTINGS` (:179-191) | |
| BA-2.1 | BUILDER | P0 | Operator-grade 9–11px text | Still open | 217 occurrences of `text-[9px]`/`text-[10px]`/`text-[11px]` in `SB/*.tsx` and `SB/brand-kit/*.tsx` (grep count) | |
| BA-2.2 | BUILDER | P0 | Pink overloaded (editor chrome = brand) | Still open | `SB/preview-overlay.tsx:378-379,420-427,455,507` `pink-500` ring, toolbar and handles | |
| BA-2.3 | BUILDER | P0 | Context menu uses `--bk-*` vars | Still open | `SB/live-preview-context-menu.tsx:131-132` | |
| BA-2.4 | BUILDER | P1 | Emoji in toolbar | Partially fixed | No emoji in toolbar files; emoji icons remain in `SB/variant-add-wizard.tsx:70,88,94` and `SB/variant-list.tsx:77` | |
| BA-2.5 | BUILDER | P1 | Hover-only "+ Add" pill on picker cards | Still open | `SB/section-picker.tsx:729` `opacity-0 … group-hover:opacity-100` | Cross-ref BA-12.2 |
| BA-2.6 | BUILDER | P1 | Sparkles icon reads "AI" | Partially fixed | Removed from section list; still in `SB/publish-confirm-sheet.tsx:23,307` | |
| BA-2.7 | BUILDER | P1 | Disabled row at reduced opacity | Still open | `SB/section-list-panel.tsx:277` `opacity-55` | Cross-ref BA-17.6 |
| BA-2.8 | BUILDER | P1 | Three clashing visual idioms | Unverifiable | Subjective visual judgement; needs a design review | |
| BA-3.1 | BUILDER | P0 | 380px rail + 260px tree | Partially fixed | Phone fixed (BA-1.1). Desktop still `w-[380px]` (`SB/inspector-rail.tsx:138`) + `w-[264px]` (`SB/page-tree.tsx:384`) | |
| BA-3.2 | BUILDER | P0 | Five touch targets per section row | Still open | `SB/section-list-panel.tsx:291,347,372` 16–28px handle, eye and kebab adjacent | |
| BA-3.3 | BUILDER | P0 | Overlay toolbar buttons 24×24 | Still open | `SB/preview-overlay.tsx:579` `h-6 w-6` | |
| BA-3.4 | BUILDER | P1 | Three consecutive dividers | Still open | 3× `h-px bg-(--card-border)` in `SB/section-edit-panel.tsx` | |
| BA-3.5 | BUILDER | P1 | Spacing handle tiny, hover-only | Partially fixed | `SB/preview-overlay.tsx:410-415` 16px hit-zone at bottom edge, always faintly visible; mouse-only (`onMouseDown`) | |
| BA-3.6 | BUILDER | P1 | Picker grid cramped | Partially fixed | `SB/section-picker.tsx:372,394` `sm:grid-cols-2 lg:grid-cols-3` | |
| BA-3.7 | BUILDER | P1 | Brand Kit preview is a sticky fixture column | Still open | `SB/brand-kit/live-preview.tsx` mini-card `<aside>` | Cross-ref BA-7.7 |
| BA-4.1 | BUILDER | P0 | Double-click edit requires pre-selection | Still open | `SF/components/schneiders-preview-bridge.tsx:383` `if (!sectionId \|\| sectionId !== selectedSectionId) return;` | |
| BA-4.2 | BUILDER | P0 | `window.confirm` in two places | Partially fixed | Picker uses Dialog (`SB/section-picker.tsx:555`); `SB/variant-list.tsx:244` still `window.confirm` | |
| BA-4.3 | BUILDER | P0 | Modal stacking in section-edit panel | Still open | Independent states `wizardOpen`, `editingVariantId`, `visibilityWizardKind` (`SB/section-edit-panel.tsx:153-155`) with no mutual exclusion | |
| BA-4.4 | BUILDER | P0 | Variant editor stacks 3-deep | Still open | `SB/variant-editor.tsx:245` `z-50` modal hosts `VariantAddWizard` (:456) | |
| BA-4.5 | BUILDER | P0 | PreviewAs popover not portaled | Still open | `SB/preview-as-controls.tsx:100-106` manual `z-40/z-50`, absolute | |
| BA-4.6 | BUILDER | P0 | Spacing drag rebuilds whole config per mousemove | Partially fixed | No longer goes through `setConfig`/history. `SB/editor-shell.tsx:820-832` still clones the page's sections and posts to the iframe on every move | Cross-ref BA-13.1 |
| BA-4.7 | BUILDER | P1 | Drop zones unlabeled | No longer applicable | No drop zones exist (BUG7); `useDroppable` absent | Cross-ref BUG7 |
| BA-4.8 | BUILDER | P1 | No "add between sections" button | Fixed | `SB/preview-overlay.tsx:367-383` `InsertGap` | aria-label English |
| BA-4.9 | BUILDER | P1 | No empty-state drop affordance | Fixed | `SB/editor-shell.tsx:1784-1830` canvas empty-state card | |
| BA-4.10 | BUILDER | P1 | Hover handler has no id-equality guard | Partially fixed | Uses `mouseover` (per element, not per pixel) at `SF/components/schneiders-preview-bridge.tsx:410-418`, still with no same-id guard | |
| BA-4.11 | BUILDER | P1 | Toolbar never clamps off-screen right | Still open | `SB/preview-overlay.tsx:507-511` `left: rect.left`, vertical flip only | |
| BA-4.12 | BUILDER | P1 | No auto-scroll during drag | Unverifiable | Canvas drag doesn't exist. The list relies on dnd-kit defaults; needs a live drag test | |
| BA-4.13 | BUILDER | P1 | No ghost preview during drag | Still open | No `DragOverlay` in `SB/*.tsx` (grep) | |
| BA-4.14 | BUILDER | P1 | No multi-select | Still open | No multi-selection state in `SB/section-list-panel.tsx` (grep) | |
| BA-5.1 | BUILDER | P0 | List and edit mutually exclusive | Fixed | Same as BA-1.7 | |
| BA-5.2 | BUILDER | P0 | "Section label" placeholder confuses | Fixed | Instance label is Advanced-only (`SB/section-edit-panel.tsx:263`); placeholder `I18N:179` | |
| BA-5.3 | BUILDER | P0 | Enabled toggle duplicated | Still open | Row eye toggle `SB/section-list-panel.tsx:354` plus panel switch `SB/section-edit-panel.tsx:169,290` | |
| BA-5.4 | BUILDER | P0 | Visibility chips leak raw ids | Fixed | `SB/section-edit-panel.tsx:424` `summarizeVariantConditions`; names resolved at `apps/platform/lib/variant-summary.ts:203-215` | Falls back to the id if the segment was deleted |
| BA-5.5 | BUILDER | P0 | Visibility/Variants equal weight to Properties | Fixed | Simple mode hides both (`SB/section-edit-panel.tsx:363`) | |
| BA-5.6 | BUILDER | P0 | AutoForm drops `.describe()` text | Partially fixed | Help channel `resolveFieldHelp` (`apps/platform/lib/section-field-meta.ts:190-202`) covers only 13 generic keys (:114-127); `.describe()` text is still not shown as help | |
| BA-5.7 | BUILDER | P0 | No IQD-aware currency control | Still open | `NumberControl` (`SB/auto-form-fields.tsx:560-605`) has no `د.ع` suffix or thousands formatting | Cross-ref BA-18.1 |
| BA-5.8 | BUILDER | P1 | "Unsupported field" leaks | Still open | `SB/auto-form-fields.tsx:271` (now localized); reachable via unions (BUG9) | |
| BA-5.9 | BUILDER | P1 | Array items "Item N" | Fixed | `SB/auto-form-fields.tsx:826,949` `summarizeArrayItem`; `item_n` only as fallback | |
| BA-5.10 | BUILDER | P1 | Array grip icon is a lie | Still open | `SB/auto-form-fields.tsx:848-851` decorative `GripVertical` | Cross-ref C1 |
| BA-5.11 | BUILDER | P1 | ImageControl upload fragile on 3G | Still open | `SB/auto-form-fields.tsx:459-470` 4MB cap, no compression or progress, `section-${Date.now()}` path with `upsert:true` | |
| BA-5.12 | BUILDER | P1 | ColorControl accepts any string | Still open | `SB/auto-form-fields.tsx:422-426` free text `onChange(e.target.value)` | |
| BA-5.13 | BUILDER | P1 | NumberControl NaN / no clamp / no unit | Partially fixed | NaN rejected (`Number.isFinite`, :572-573); no clamp on blur, no unit | |
| BA-5.14 | BUILDER | P1 | BooleanControl has no description | Still open | `BooleanControlProps` has only label, value, onChange (`SB/auto-form-fields.tsx:625-640`) | |
| BA-5.15 | BUILDER | P1 | Enum segmented threshold hardcoded ≤4 | Still open | `SB/auto-form-fields.tsx:667` | |
| BA-5.16 | BUILDER | P1 | No per-field reset | Partially fixed | Section reset only (`SB/auto-form.tsx:151`) | |
| BA-5.17 | BUILDER | P1 | Optional fields "Set" then empty input | Still open | `SB/auto-form-fields.tsx:143-160` | |
| BA-6.1 | BUILDER | P0 | Two parallel preview implementations | Fixed | Inline `live-preview.tsx` and `live-preview-overlay.tsx` deleted; only `SB/preview-frame.tsx` and `SB/preview-overlay.tsx` | |
| BA-6.2 | BUILDER | P0 | No error boundary around RenderPage | Fixed | `SEC/RenderSection.tsx:92-94` | Cross-ref EC10, BA-16.1 |
| BA-6.3 | BUILDER | P0 | No `sandbox` on preview iframe | Still open | `SB/preview-frame.tsx:92-108` `<iframe>` has no `sandbox` | Cross-origin to storefront, so impact is limited |
| BA-6.4 | BUILDER | P0 | postMessage `targetOrigin:"*"` | Fixed | `apps/platform/hooks/use-iframe-bridge.ts:233` `STOREFRONT_ORIGIN` | |
| BA-6.5 | BUILDER | P1 | "No page config for home" raw error | No longer applicable | `SB/live-preview.tsx` deleted | |
| BA-6.6 | BUILDER | P1 | Font URL injected per render | No longer applicable | `live-preview.tsx` deleted; storefront loads one fonts link (`SF/app/s/[tenant]/layout.tsx:231`) | |
| BA-6.7 | BUILDER | P1 | `fontUtilityCss` unescaped `<style>` | No longer applicable | No `fontUtilityCss` symbol remains (grep); fonts go via `fontFamilyRef` (`packages/shared/src/brand-kit-vars.ts:319`) | |
| BA-6.8 | BUILDER | P1 | No loading state on products | Fixed | Preview is server-rendered by the storefront with real products (iframe) | |
| BA-6.9 | BUILDER | P1 | PreviewAs "Auto" arm opaque | Unverifiable | No "Auto" string found in `SB/preview-as-controls.tsx` (grep); arm UI needs a live check | |
| BA-7.1 | BUILDER | P0 | No starter presets | Fixed | Same as D1 | |
| BA-7.2 | BUILDER | P0 | Internal token names exposed | Still open | `SB/brand-kit/live-preview.tsx:198-226` "Resolved tokens" grid; the tooltip and `title` show `<name>: <value>` (`:211-223`) for all 16 entries of `ALL_SWATCH_KEYS` (`:15-32`): `primary`, `secondary`, `accent`, `surface`, `surface-alt`, `ink`, `success`, `danger`, `on-primary`, `on-secondary`, `on-accent`, `primary-hover`, `primary-soft`, `ink-soft`, `ink-faint`, `divider`. The heading "Resolved tokens" (`:200`) is hardcoded English | |
| BA-7.3 | BUILDER | P0 | Three "Coming soon" buttons | Fixed | No coming-soon buttons in brand-kit; eyedropper is real (`SB/brand-kit/controls.tsx:487-496`) | |
| BA-7.4 | BUILDER | P0 | Reset wipes branch without confirmation | Still open | `SB/brand-kit-editor.tsx:140-145` `resetBranch`; wired directly at :424 | Editor undo exists |
| BA-7.5 | BUILDER | P1 | No Arabic font pairings | Fixed | Same as D3 | |
| BA-7.6 | BUILDER | P1 | "Surface alt" / "Ink-soft" vocabulary | Partially fixed | Localized AR «الخلفية البديلة»; EN still "Surface alt" (`I18N:861`) | |
| BA-7.7 | BUILDER | P1 | Brand preview isn't the real storefront | Still open | `SB/brand-kit/live-preview.tsx` fixture cards | |
| BA-8.1 | BUILDER | P0 | "Variant" undefined jargon | Partially fixed | AR label «الاختلافات» (`I18N:185`); Simple hides variants; EN still "Variants" | |
| BA-8.2 | BUILDER | P0 | Priority taught two ways | Still open | `SB/variant-editor.tsx:165,395-404` number input | |
| BA-8.3 | BUILDER | P0 | Variant editor footer just "Done" | Still open | `SB/variant-editor.tsx:446-450` English "Done" | |
| BA-8.4 | BUILDER | P0 | "Bind this variant to one experiment arm" | Still open | `SB/variant-add-wizard.tsx:96` | Cross-ref F3 |
| BA-8.5 | BUILDER | P0 | Manual id-paste fallback | Still open | `SB/variant-add-wizard.tsx:1459,1494-1505` | |
| BA-8.6 | BUILDER | P0 | Product/category chips show raw ids | Still open | `SB/variant-add-wizard.tsx:1475` renders `{id}` | |
| BA-8.7 | BUILDER | P0 | Dead-end empty states (audience, A/B) | Still open | `SB/variant-add-wizard.tsx:1189-1190` "Define segments in Settings → Segments" with no link | Cross-ref BUG20 |
| BA-8.8 | BUILDER | P0 | "Stop & promote winner" doesn't promote | Still open | Same as BUG11 | Cross-ref BUG11 |
| BA-8.9 | BUILDER | P0 | Pause/Resume/Stop one-click, no confirm | Still open | `SB/experiments-screen.tsx:241-254,570-597` | |
| BA-8.10 | BUILDER | P1 | z-scores shown to merchants | Fixed | No `z=` rendering in `SB/experiments-screen.tsx` (grep); verdict badges only | |
| BA-8.11 | BUILDER | P1 | Traffic % sum not enforced | Still open | `SB/experiments-screen.tsx:692-693` `sumsTo100` advisory; `handleResume` (:241-244) and adding an arm at 0% (:695-704) are not gated | |
| BA-8.12 | BUILDER | P1 | Segment visitor count "—" | Still open | `SB/segments-screen.tsx:327` | Cross-ref J3 |
| BA-8.13 | BUILDER | P1 | No Snapchat/Telegram traffic sources | Still open | `SB/segments-screen.tsx:49`; `packages/shared/src/types/store-config-v2.ts:299` | Cross-ref BA-18.2 |
| BA-8.14 | BUILDER | P1 | Governorate picker shows codes only | Partially fixed | Wizard shows name + code (`SB/variant-add-wizard.tsx:1317-1318`); segments screen shows code only (`SB/segments-screen.tsx:663`) | Cross-ref BA-18.3 |
| BA-8.15 | BUILDER | P1 | `summarizeCondition` outputs raw ids | Fixed | `SB/variant-editor.tsx:99-106` → `apps/platform/lib/variant-summary.ts:256` | |
| BA-8.16 | BUILDER | P1 | No plain-language variant summary | Fixed | `apps/platform/lib/variant-summary.ts:150-245` sentences per condition | |
| BA-8.17 | BUILDER | P1 | Conditions not editable, only removable | Still open | `SB/variant-editor.tsx:328-336` remove button only | |
| BA-8.18 | BUILDER | P1 | Schema-kind badges in override picker | Still open | `SB/variant-editor.tsx:603-612` renders `{opt.kind}` | |
| BA-9.1 | BUILDER | P0 | Publish bypasses confirm sheet | Fixed | `SB/editor-shell.tsx:1312-1320` always opens the sheet | |
| BA-9.2 | BUILDER | P0 | Promote-to-named uses live-config swap | Still open | `SB/version-history-screen.tsx:249-257` applies the old config, snapshots, then restores | SOTA BUG28 (P2) |
| BA-9.3 | BUILDER | P0 | Restore copy "undo this in this session" | Still open | `SB/version-history-screen.tsx:552`; `I18N:1172` | |
| BA-9.4 | BUILDER | P0 | "End early" one-click destructive | Still open | `SB/scheduled-changes-screen.tsx:792-795` direct `onClick={onEndEarly}` | |
| BA-9.5 | BUILDER | P1 | Diff rendered as path + JSON | Still open | `SB/version-history-screen.tsx:708-717,723-736` `formatPath` + JSON preview | |
| BA-9.6 | BUILDER | P1 | Scheduled summaries show machine types | Partially fixed | Prefers `section_label` (:676,902), falls back to `section_type`; raw `JSON.stringify(variant.override)` `<pre>` at :916-917 | |
| BA-9.7 | BUILDER | P1 | Cancel vs Delete identical | Still open | `SB/scheduled-changes-screen.tsx:815-836` both rose with `Trash2` | |
| BA-9.8 | BUILDER | P1 | `__create_new__` sentinel | Still open | `SB/scheduled-changes-screen.tsx:942` | |
| BA-9.9 | BUILDER | P1 | Publish sheet falls back to `check.id` | Fixed | `SB/publish-confirm-sheet.tsx:55` `checkCopyMessage` over 36 localized checks | Raw id only for unknown checks |
| BA-9.10 | BUILDER | P1 | "Save failed" terminal | Fixed | Same as G2 | |
| BA-9.11 | BUILDER | P1 | No publish celebration | Fixed | Same as UX-19 | |
| BA-10.1 | BUILDER | P0 | Health category jargon | Still open | `I18N:774` `cat_ad_compliance` "Ad compliance" / «الامتثال الإعلاني» | |
| BA-10.2 | BUILDER | P0 | No badge on Health tab when failing | Still open | No badge logic in `SB/inspector-rail.tsx` (grep `badge`) | |
| BA-10.3 | BUILDER | P1 | "Blocks publish" pill 10px | Fixed | `SB/health-checklist-screen.tsx:453-466` sticky `text-sm` banner | |
| BA-10.4 | BUILDER | P1 | Flat list of 30 checks | Partially fixed | Category bars and per-check category chip (:420,563); list is filtered by status, not grouped (:471-506) | |
| BA-11.1 | BUILDER | P0 | Translate button doesn't translate | Still open | `SB/i18n-screen.tsx:193-207` jumps to section; English "Translate" | |
| BA-11.2 | BUILDER | P0 | Raw JSON paths shown | Still open | `SB/i18n-screen.tsx:189-191` `{m.path}`; label falls back to `s.type` (:138) | |
| BA-11.3 | BUILDER | P1 | No fallback-policy explanation | Still open | `SB/i18n-screen.tsx:121-126` only "Showing untranslated fields for …" | |
| BA-11.4 | BUILDER | P1 | "Globals" disabled, unexplained | Still open | `SB/i18n-screen.tsx:131-133,158` | |
| BA-11.5 | BUILDER | P1 | Editor chrome English | Partially fixed | Main path localized (UX-04/14/15); i18n screen (:122-206), variant wizard, experiments row actions (`SB/experiments-screen.tsx:578,586,596`) still English | |
| BA-11.6 | BUILDER | P1 | No AI assist or copy-from-EN | Partially fixed | Same as I1 | |
| BA-12.1 | BUILDER | P0 | Rails don't collapse | Fixed | Same as BA-1.1 | |
| BA-12.2 | BUILDER | P0 | Hover-only affordances | Still open | `SB/section-picker.tsx:551,729` and `SB/preview-overlay.tsx:378-379` are `group-hover` only | |
| BA-12.3 | BUILDER | P0 | Drag activation 4px hijacks scroll | Fixed | `SB/section-list-panel.tsx:526-528` touch sensor `delay:500, tolerance:8`; 4px only for mouse | |
| BA-12.4 | BUILDER | P0 | PreviewAs popover `w-72` overflows 360px | Still open | `SB/preview-as-controls.tsx:106` | |
| BA-12.5 | BUILDER | P0 | AutoForm doesn't degrade | Fixed | Simple mode shows ~5 fields (`SB/auto-form.tsx:104`; `apps/platform/lib/section-field-groups.ts:266`) | |
| BA-12.6 | BUILDER | P1 | No fit-to-screen zoom | Fixed | Same as A1 | |
| BA-12.7 | BUILDER | P1 | Touch targets under 44px | Still open | `SB/preview-overlay.tsx:579` (24px); `SB/section-list-panel.tsx:347,372` (28px) | |
| BA-13.1 | BUILDER | P0 | Spacing drag allocates per move | Partially fixed | Same as BA-4.6 | |
| BA-13.2 | BUILDER | P1 | Hover re-measures per pixel | Partially fixed | Same as BA-4.10 | |
| BA-13.3 | BUILDER | P1 | `useCallback([p])` defeats memo | Still open | `SB/auto-form-fields.tsx:484,738,746,757,766,776,998` | |
| BA-13.4 | BUILDER | P1 | SaveStatePill re-renders every second | Still open | `SB/toolbar-controls.tsx:202-206` 1s `setInterval` | |
| BA-13.5 | BUILDER | P1 | AutoForm re-walks Zod on every expand | Unverifiable | Per-field `useMemo(inferField)` (`SB/auto-form-fields.tsx:90`); needs profiling | |
| BA-14.1 | BUILDER | P0 | Vocabulary mismatch sweep | Partially fixed | Simple path localized to merchant Arabic; Advanced keeps Variant/Segment/Experiment/Arm terms. The two sites checked (a sample, not an exhaustive sweep): `SB/variant-add-wizard.tsx:85-96` ("For a customer segment", "Show different content to a targeted audience.", "For an A/B test", "Bind this variant to one experiment arm.") and `:1612-1626` (labels "Locales (…)", "<locale> variant", "Devices (…)", "<breakpoint> variant", "Scheduled variant", "Segment variant", "A/B arm <n>", "Governorates (<n>)") | |
| BA-14.2 | BUILDER | P1 | Mealy empty-state copy | Still open | `I18N:144` "No blocks yet. Click" | |
| BA-14.3 | BUILDER | P1 | Competing first-X CTAs | Still open | Canvas empty state shows both "add first" and "template" buttons (`SB/editor-shell.tsx:1808-1825`) | Cross-ref BA-15.5 |
| BA-14.4 | BUILDER | P1 | 5s undo toast | Still open | `SB/section-list-panel.tsx:598` `duration: 5000` | |
| BA-14.5 | BUILDER | P1 | Variant labels default to machine names | Still open | `SB/variant-add-wizard.tsx:1612,1623,1626` | |
| BA-15.1 | BUILDER | P0 | No first-run experience | Fixed | Same as E2; `SB/editor-shell.tsx:1697-1711` `FirstRunBanner` | |
| BA-15.2 | BUILDER | P0 | No starter brand-kit presets | Fixed | Same as D1 | |
| BA-15.3 | BUILDER | P0 | Page templates not surfaced | Fixed | Canvas empty state opens the template picker (`SB/editor-shell.tsx:1821-1825`) | |
| BA-15.4 | BUILDER | P1 | Visibility empty-state copy backwards | Still open | `I18N:188` unchanged | |
| BA-15.5 | BUILDER | P1 | Two competing empty-state CTAs | Still open | Same as BA-14.3 | |
| BA-15.6 | BUILDER | P1 | Templates list: no empty state, search or filter | Partially fixed | Filtered to page-valid templates (`SB/page-template-picker.tsx:40`); no search | |
| BA-16.1 | BUILDER | P0 | No error boundary in preview | Fixed | Same as BA-6.2 | |
| BA-16.2 | BUILDER | P1 | Drag-reorder has no per-row error treatment | Still open | Reorder rides autosave; no row-level pending or error state in `SB/section-list-panel.tsx` (grep) | |
| BA-16.3 | BUILDER | P1 | Upload failure has no retry on control | Still open | `SB/auto-form-fields.tsx:477-479` toast only | |
| BA-16.4 | BUILDER | P1 | Save failure terminal | Fixed | Same as G2 | |
| BA-17.1 | BUILDER | P0 | `aria-hidden` on `<button>` scrim | Partially fixed | Now `tabIndex={-1}` (`SB/section-picker.tsx:232-236`, `SB/section-list-panel.tsx:379-383`), still `aria-hidden` buttons | |
| BA-17.2 | BUILDER | P0 | `aria-hidden` overlay containing interactive toolbar | Still open | `SB/preview-overlay.tsx:271-274` wraps the toolbar (:504-554) | |
| BA-17.3 | BUILDER | P0 | Segment toggle not a checkbox | Still open | No `role="checkbox"`, `aria-checked` or `aria-pressed` in `SB/preview-as-controls.tsx` (grep) | |
| BA-17.4 | BUILDER | P1 | `role=menu` without arrow keys | No longer applicable (out of scope per program) | Keyboard a11y | |
| BA-17.5 | BUILDER | P1 | No focus traps | No longer applicable (out of scope per program) | Keyboard a11y | |
| BA-17.6 | BUILDER | P1 | Disabled-row opacity contrast | Still open | `SB/section-list-panel.tsx:277` `opacity-55` | |
| BA-18.1 | BUILDER | P0 | No IQD currency control | Still open | Same as BA-5.7 | |
| BA-18.2 | BUILDER | P1 | No Snapchat/Telegram | Still open | Same as BA-8.13 | |
| BA-18.3 | BUILDER | P1 | Governorate codes only | Partially fixed | Same as BA-8.14 | |
| BA-18.4 | BUILDER | P1 | No COD/WhatsApp primitives in templates | Partially fixed | Templates include `trust_strip` ×2 and `delivery_promise` ×1 (`apps/platform/lib/page-templates`, `apps/platform/lib/store-templates`); no WhatsApp/COD-specific template section | |
| BA-18.5 | BUILDER | P1 | No Arabic font pairings | Fixed | Same as D3 | |
| QC-LOG-1 | QC | FAIL | Detail drawer: Escape doesn't close | No longer applicable (out of scope per program) | Keyboard item. FYI: handler now exists at `QC/qc-detail-drawer.tsx:62-69` | = QC-FIND-1 |
| QC-LOG-2 | QC | FAIL | Reason chip doesn't update | Fixed | `QC/qc-detail-drawer.tsx:49,74-76,152` optimistic `reasonCatOverride` | = QC-FIND-2 |
| QC-LOG-3 | QC | FAIL | No undo toast after bulk resolve | Fixed | `QC/qc-bulk-bar.tsx:44-84` action toast with `qc.bulk.undo` → `bulkRevert` (`QCT:267-268`) | = QC-FIND-3; covers matrix H9–H12 |
| QC-LOG-4 | QC | PARTIAL | `?` suppressed in text input | No longer applicable (out of scope per program) | Keyboard shortcut | = QC-FIND-6 |
| QC-LOG-5 | QC | UX ISSUE | Insight drill-down writes UUID | Fixed | `QCT:473-474` sets search to `productName` | = QC-FIND-4; matrix N6 |
| QC-FIND-1 | QC | BUG (a11y) | Escape doesn't close drawer | No longer applicable (out of scope per program) | See QC-LOG-1 | |
| QC-FIND-2 | QC | BUG | Reason chip state sync | Fixed | `QC/qc-detail-drawer.tsx:49` `reasonCatOverride` state; `:74-76` the chip reads `reasonCatOverride ?? …` so it updates immediately; `:152` keeps the previous value for rollback on failure. | = QC-LOG-2 |
| QC-FIND-3 | QC | REGRESSION | Undo toast missing | Fixed | See QC-LOG-3 | |
| QC-FIND-4 | QC | UX | Drill-down UUID in search | Fixed | See QC-LOG-5 | |
| QC-FIND-5 | QC | UX guardrail | High-value write-off without evidence | Partially fixed | Guard (≥25,000 IQD needs photo/note) only in quick action `QCT:36-39,233-240`. Bulk write-off `QCT:250-265`, keyboard shortcut path (:217) and drawer resolve (`QC/qc-detail-drawer.tsx:120-125`) bypass it | |
| QC-FIND-6 | QC | UX | `?` shortcut suppressed | No longer applicable (out of scope per program) | Keyboard | |
| QC-FIND-7 | QC | DATA | Search ignores reason-category labels | Fixed | `QCT:75-86` adds `cat` and `t('qc.reason.'+cat)` to the haystack | |
| QC-M-A | QC matrix | open (no result) | A3, A4, A6, A7 | Unverifiable | Never executed; behaviour needs a live run (read-only static sweep) | A1, A2, A5, A8 covered by log PASS |
| QC-M-B | QC matrix | open | B2, B3, B4, B5, B6, B8, B9, B10 | Unverifiable | KPI calc/animation code present (`QC/qc-kpi-header.tsx:74-75` whileHover/whileTap); values need data run | |
| QC-M-C | QC matrix | open | C2, C9, C10 | Unverifiable | `QCT:481-483` clears selection on tab change (C9); C2/C10 need live check | |
| QC-M-D | QC matrix | open | D5, D6, D13, D17 | Unverifiable | Search haystack includes `order.order_id` and `rma_number` (`QCT:79-82`); needs live run | D8 is keyboard → out of scope |
| QC-M-E | QC matrix | open | E2, E3, E6, E7, E9, E11 | Unverifiable | Needs live run | |
| QC-M-F | QC matrix | open | F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12, F13, F14 | Unverifiable | Swipe thresholds coded (`QC/qc-card-grid.tsx:67-69,118`); needs touch run | |
| QC-M-G | QC matrix | open | G1, G2, G3, G4, G5, G6, G7, G8, G9 | Unverifiable | Kanban DnD wired (`QC/qc-kanban-view.tsx:24-48`); never executed | |
| QC-M-H | QC matrix | open | H8, H13, H14, H15, H16, H17 | Unverifiable | Export (`QCT:314`), popup-blocked toast (:324), 58×40mm labels (:333) present; never executed | See New observation 5 |
| QC-M-I | QC matrix | open | I1, I3, I5, I9, I11, I13, I14, I15, I16, I17, I19, I20 | Unverifiable | Needs live run | I4 → QC-LOG-1; I8 → QC-LOG-2 |
| QC-M-J | QC matrix | open | J1, J2, J3, J4, J5, J6, J7, J8, J9, J10, J11, J12 | Unverifiable | `QC/qc-photo-uploader.tsx` has lightbox and failure toasts (:23,37,50,70); upload toast passes raw `error.message` (:37); never executed | |
| QC-M-K | QC matrix | open | K1–K20 (each of K1, K2, K3, K4, K5, K6, K7, K8, K9, K10, K11, K12, K13, K14, K15, K16, K17, K18, K19, K20) | No longer applicable (out of scope per program) | Keyboard shortcuts | |
| QC-M-L | QC matrix | open | L1, L2, L3, L4, L5, L6 | No longer applicable (out of scope per program) | Shortcuts-help modal | |
| QC-M-M | QC matrix | open | M5, M6, M7 | Unverifiable | Needs data run | M1–M4, M8 covered by log "Analytics charts render" |
| QC-M-N | QC matrix | open | N1, N2, N3, N4, N7 | Unverifiable | Needs data run | N5 PASS; N6 → QC-LOG-5 |
| QC-M-O | QC matrix | open | O1, O2, O3, O4, O5 | Unverifiable | `QC/qc-empty-state.tsx`, `QC/qc-error-state.tsx:8-22` (retry), `QC/qc-skeletons.tsx` present; never executed | |
| QC-M-P | QC matrix | open | P3, P4, P5, P6, P7, P8, P9 | Unverifiable | Realtime and inventory side-effects need a live two-session run | P1/P2 covered by log |
| QC-M-Q | QC matrix | open | Q4, Q5 | Unverifiable | Needs live run | |
| QC-M-R | QC matrix | open | R2, R3, R4 | Unverifiable | Needs touch run | |
| QC-M-S | QC matrix | open | S1, S3, S5 | Unverifiable | Only 3 `aria-label`s across `QC/*.tsx` (grep), so S5 is at risk | S2, S4 keyboard → out of scope |
| CAT-F-01 | CATEGORIES_V2 | minor (finding) | Main-nav partial index tighter than spec | Still open | SQL: `idx_categories_tenant_main_nav … WHERE show_in_main_nav = true AND status = 'published'` unchanged | Arguably intended |
| CAT-F-02 | CATEGORIES_V2 | minor | Keyboard-shortcuts button never renders | No longer applicable (out of scope per program) | Keyboard | |
| CAT-F-03 | CATEGORIES_V2 | [F] minor | Undo pill never appears after bulk archive | Fixed | `apps/platform/components/categories/v2/categories-tab-v2.tsx:231-240,360-364` orchestrator-hosted undo survives `clearSelection()` | |
| CAT-F-04 | CATEGORIES_V2 | [F] minor | `/` focuses wrong search | No longer applicable (out of scope per program) | Keyboard shortcut | |
| CAT-F-05 | CATEGORIES_V2 | [F] minor | AR doesn't set `dir="rtl"` | No longer applicable | Project convention: LTR only, set `lang` never `dir` (CLAUDE.md); current behaviour is the intended one | |
| NEW-P1-03 | Phase 1 critic round 1 (claim c), REGRESSION.md | P1 | `apply_store_config_v2_patch(p_is_draft => false)` writes the LIVE config for any active member | Still open | Live function body (`pg_get_functiondef`): checks only that `tenant_members` has an active row for the caller (no role check); when `p_is_draft` is false it runs `UPDATE tenants SET store_config_v2 = jsonb_set(...)`; the allowlisted roots are `brand_kit`, `pages`, `globals`, `experiments`, `segments`, `schedules`, `default_locale`, `enabled_locales`, `commerce`, `custom_css` (live body). The UI sends only `is_draft:true` (`HOOK:822`), but `apps/platform/app/api/store-config-v2/patch/route.ts:33` takes `is_draft` from the body. | New row added in Phase 1 round 1. A second path to the same column a member can already write directly (orders-reliability NEW-P1-02), not a separate hole. |

## Counts

Recomputed by script from the table rows in Phase 1 round 1 (`scratchpad/p1fix/count.py`: every table row under the findings heading, Status column, first matching status value).

| Status | Rows |
|---|---|
| Fixed | 132 |
| Partially fixed | 40 |
| Still open | 105 |
| Regressed | 0 |
| No longer applicable | 17 |
| Unverifiable | 22 |
| **Total** | **316** |

Counts are by table row; QC matrix group rows count once each. The previous table (117/45/95/0/23/26 = 306) did not match the rows; the rows parse to the figures above.

Rows by source doc column: ARCH 12, ARCH §3 2, SOTA 63, GRABS 35, UX 07-02 14, UX 07-07 6, BUILDER 147, QC 12, QC matrix 19, CATEGORIES_V2 5, Phase 1 critic round 1 (claim c), REGRESSION.md 1.

## New observations (not recorded by any source audit)

1. **(Confirmed P0 by the Phase 1 critic; table row NEW-P1-02 in orders-reliability.) Any active tenant member can write their own `tenants` row: the live `store_config_v2`, plus `plan` and `status`.**
   - **Evidence:**
     - SQL `information_schema.column_privileges`: `authenticated` has UPDATE on `tenants.store_config_v2`, `store_config_v2_draft`, `plan` and `status`.
     - `pg_policies`: `tenant_member_update` (UPDATE, `authenticated`) has USING and WITH CHECK `id IN (SELECT get_user_tenant_ids())`, with no role test.
     - The only trigger, `enforce_storefront_writes_block`, watches `branding` and `store_config` only.
     - The 2026-10-19 admin-only-writes migration (`20261019100100_tenant_admin_only_writes.sql`) covers `tenant_members` and ten other tables, but not `tenants`.
   - **Impact:**
     - A "member" employee can PATCH `/rest/v1/tenants` and publish arbitrary config. This bypasses the admin gate and validation in `publish_store_config_v2`.
     - They can also change their own plan or status, which is a billing bypass if plan gating reads this column.
   - Confirmed from privileges and policy only; no write was exercised.
2. **(Confirmed P1 by the Phase 1 critic; table row NEW-P1-03.) `apply_store_config_v2_patch(p_is_draft => false)` patches the LIVE config for any active member.**
   - Evidence (SQL function body): it checks membership only, then runs `UPDATE tenants SET store_config_v2 = jsonb_set(...)`. The allowlisted roots are `brand_kit`, `pages`, `globals`, `experiments`, `segments`, `schedules`, `default_locale`, `enabled_locales`, `commerce`, `custom_css`.
   - The UI only sends `is_draft:true` (`HOOK:822`), but the route accepts `is_draft` from the body (`apps/platform/app/api/store-config-v2/patch/route.ts:33`).
3. **The UX2-03 "fix" is defective.** It calls `Object.entries()` over the `pages` array, so it navigates to page id `"0"` (`SB/health-checklist-screen.tsx:249-262`). See the UX2-03 row.
4. **The storefront has no sitemap route.** `find apps/storefront/app -name 'sitemap*'` returns nothing, and `SF/app/robots.ts` declares none. This is an SEO gap for every store.
5. **HYPOTHESIS — stored XSS in the QC "Print labels" popup.**
   - `QCT:345` interpolates `r.product?.sku` raw into `document.write` HTML. Name and reason are `<`-escaped; SKU is not.
   - The popup opened with `window.open("")` shares the platform origin, so a member-controlled SKU containing `<img onerror=…>` would run script with the platform session.
   - Unproven whether SKU input is restricted elsewhere.
6. **Section-thumbnail coverage got worse:** 27 of 58 thumbnails are missing, against 16 of 48 at audit time (BUG8).
7. **A raw Supabase error reaches the merchant in the AutoForm image upload toast.** `SB/auto-form-fields.tsx:477-479` passes `err.message`, and the strings at :456, :461 and :476 are English-only. UX2-09 (P2) is marked FIXED in the 07-07 audit; it is only fixed for brand-kit controls.
