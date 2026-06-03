# Store / Website Builder — Architecture & V1↔V2 Audit

**Audit date:** 2026-06-04
**Method:** 8 parallel deep-readers + adversarial verification of every critical claim (multi-agent workflow), grounded in live code.
**Scope:** V1 (`apps/platform/components/store-builder/**`, `/store`), V2 (`apps/platform/components/store-builder-v2/**`, `/store/v2`), `packages/sections`, the storefront render path (`apps/storefront/app/s/[tenant]/**`, `/_preview`), data model (`store_config*`), and the merchant UX journey.

---

## 0. Headline finding (the reframe)

**V2 is a "publish-to-nowhere" editor.** The live public storefront renders **V1's** `tenant.store_config` through hardcoded **V1 React templates** ([apps/storefront/app/s/[tenant]/page.tsx:44](apps/storefront/app/s/[tenant]/page.tsx#L44) → `getTemplate()` → `templates/registry.tsx` → `SchneidersTemplate` etc.). The `packages/sections` `RenderPage`/`RenderSection` pipeline — the entire premise of V2's section/page model — is used **only** by the editor canvas ([live-preview.tsx](apps/platform/components/store-builder-v2/live-preview.tsx)) and the `_preview` route. `store_config_v2` is read by the live storefront for **only two things**: brand-kit CSS variables and `analytics_pixels` ([layout.tsx:165](apps/storefront/app/s/[tenant]/layout.tsx#L165)).

Consequence: everything a merchant builds in V2 — sections, multi-page tree, variants, A/B experiments, audience segments, scheduled changes — **is invisible to real visitors.** Verified CONFIRMED/high.

This single fact reframes the whole "delete V1?" question: V1 *is* the live storefront's data model + renderer. The real work is **wire V2's section model to the public storefront, migrate the data, then retire V1.**

---

## 1. State of the builder

| Dimension | V1 (`store-builder`, `/store`) | V2 (`store-builder-v2`, `/store/v2`) |
|---|---|---|
| LOC | ~8.8k | ~20.7k |
| Entry | Sidebar + mobile nav (the default) | "Try v2" banner only |
| Data model | `tenant.store_config` (single JSONB) + `store_config_draft` | `store_config_v2` / `_draft`, `store_config_versions`, `_schedules`, `_experiment_events` |
| Drives live storefront? | **Yes** (sole source of truth) | **No** (brand-kit + pixels overlay only) |
| Editing | Left form panel + right **mock** preview (hand-rolled, not real renderer) | Live click-to-edit canvas using the **real** `packages/sections` renderer |
| Model | Single-page config | Multi-page tree of sections, schema-driven inspector (AutoForm) |
| Advanced | Domains, store analytics, share-QR | Variants, A/B, segments, scheduling, version history, brand kit, i18n |
| Health | Ad-hoc `completionScore` | Real `packages/shared` health-rules engine |
| Persistence | Direct client writes to `tenants` (RLS only) | Guarded `/api/store-config-v2/patch` |

**Net:** V2 is the better editor by far, but it is not connected to production; V1 is worse but is what customers actually see.

---

## 2. What's broken / incomplete (prioritized)

### P0 — correctness & security
1. **V2 renders nowhere on the live store** (architectural root cause). Storefront must render V2 pages/sections. *[L]* — [page.tsx:44](apps/storefront/app/s/[tenant]/page.tsx#L44)
2. **Stored XSS:** `store_config.custom_css` injected via `dangerouslySetInnerHTML`, writable by any active tenant member, unsanitized. *[S–M]* — [layout.tsx:211](apps/storefront/app/s/[tenant]/layout.tsx#L211)
3. **Anonymous draft exposure:** the anon storefront resolver selects `store_config_v2_draft`, and the `tenants` RLS `public_storefront_read` is row-level only (no column restriction) → unpublished drafts readable by anyone. *[S–M]* — [tenant.ts:12](apps/storefront/lib/tenant.ts#L12), [20260410100000_fix_all_rls_policies.sql:164](packages/supabase/migrations/20260410100000_fix_all_rls_policies.sql#L164)
4. **`generate-copy` API: no auth, no tenant scope, no rate limit, key falls back to `""`.** Anonymous Gemini quota burn. *[S]* — [route.ts:4-48](apps/platform/app/api/store/generate-copy/route.ts#L4-L48)
5. **A/B experiments collect no data:** `store_config_experiment_events` is read-only; **no writer** anywhere. Feature is presented as live but is dead. *[M]* — [use-store-builder-v2.ts:935](apps/platform/hooks/use-store-builder-v2.ts#L935)
6. **Scheduled changes never apply:** stored in `store_config_schedules` but no cron/edge consumer mutates live config. *[M]*
7. **Patch API writes arbitrary unvalidated JSON** (`value: unknown`, no Zod, path not checked against real section schema) **+ read-modify-write race** (no optimistic locking; races the 2s debounced full-config save). *[M]* — [patch/route.ts:109-179](apps/platform/app/api/store-config-v2/patch/route.ts#L109-L179)

### P1 — integrity, parity, dead features
- **Non-atomic publish:** draft→published, then a *separate* version-snapshot insert wrapped in `catch { /* ignore */ }`. *[S]* — [use-store-builder-v2.ts:393-403](apps/platform/hooks/use-store-builder-v2.ts#L393-L403)
- **Two schema sources of truth:** real schemas in `packages/sections/src/*` vs hand-mirrored `apps/platform/lib/sections-manifest.ts` — drifted. `section-field-groups.ts` references **phantom fields**; **~16 rendered sections are missing from the manifest** so they can't be added/edited in V2; 10 sections are dead (registered, not in barrel). *[M]*
- **Branding logo upload overwrites the whole `branding` JSONB** column (masked by `as any`). *[S]* — [branding-editor.tsx:348](apps/platform/components/store-builder/sections/branding-editor.tsx#L348)
- **Untracked schema:** `tenant_domains` (used live, queried) and `store_pages` (zero usage) exist in generated types but have **no migration** in the repo. *[S–M]*
- **No caching/revalidation** on the storefront — every request is full dynamic SSR (cookies-based client). Perf risk at scale. *[M]*

### P2 — UX, workflow, hygiene
- **No store overview/landing** — `/store` drops straight into an editor. *[M]*
- **Confusing dual-version circular entry:** nav→V1, V1 "Try v2"→V2, V2 "Back"→V1. *[S]*
- **Onboarding:** V1 tour is commented-out/dead; V2 = one dismissible line. *[S]*
- **Store health implemented twice** (V1 ad-hoc vs V2 real engine). *[S]*
- **No in-context stats in V2;** 7-day analytics buried in V1, collapsed. *[S]*
- **Mobile editing:** 7 advanced surfaces are desktop-only stubs (brand_kit, experiments, segments, scheduled, versions, health, i18n). Iraqi merchants are mobile-first. *[M]*
- **No post-publish "your store is live" moment.** *[S]*
- **V1 preview renderer diverges from production** (mock products, hardcoded categories, `filter:invert` dark mode). *[S]*
- Hygiene: large files (>1.3k LOC ×7), dead helpers, swallowed catches, `as any`/`as unknown` casts, stale "stubbed" comments, AI-image suggestion stub that discards the API response and builds Unsplash links, missing tests (34/36 section renderers untested; 8 V2 files incl. pure-logic modules untested).

---

## 3. V1 vs V2 decision

**Does V1 have anything V2 lacks?** Yes — and these are the deletion blockers:
1. **Live storefront rendering** — V1's `store_config` + templates ARE the public store. (CRITICAL)
2. **`StoreConfigV2` has no home** for `whatsapp_number`, `enable_whatsapp_order`, `custom_css`, `template`, and the `schneiders` behavioral config the live store/PDP depend on. (CRITICAL) — [store-config-v2.ts:314](packages/shared/src/types/store-config-v2.ts#L314)
3. **Custom domain management** (DomainManager) — V1 only.
4. **Store analytics panel** (7-day) — V1 only.
5. **V2 imports `useStorefrontUrl` from the V1 directory** — mechanical. (move the hook)
6. **Share-QR dialog** — V1 only (minor).
7. **Nav + only-entry** points at V1; must repoint.

**Refuted blocker:** "no `store_config`→`store_config_v2` data migration." A real, tested porter exists: `scripts/migrate-store-config-v2/`.

**Verdict:** Do **not** delete V1 yet — it would dark-ship every existing store. The correct sequence (kill-V1 path):
1. Extend `StoreConfigV2` (or section/globals) to absorb whatsapp / custom_css / template-equivalent / schneiders behavior.
2. Make the public storefront render from `store_config_v2` via `RenderPage` (one renderer for preview + prod). Convert the Schneiders template into a default **section-based page preset** so existing look is preserved but now editable.
3. Run the porter for all tenants; dual-read with fallback during rollout.
4. Port domains + store-analytics + share-QR into V2 (or the new overview).
5. Move `useStorefrontUrl` into V2/shared.
6. Repoint nav → new editor; remove the "Try v2" banner.
7. Delete `components/store-builder/**`, `hooks/use-store-builder.ts`, `lib/section-registry`, `/store/page.tsx` mock preview.

**Confidence:** High on the diagnosis; the lift is dominated by step 2 (storefront render rewire) and step 1 (type/data model unification).

---

## 4. Data & security status

- RLS is broadly present and tenant-scoped, **but**: (a) `tenants` public read is not column-restricted → leaks `store_config_v2_draft` to anon; (b) `tenant_member_update` has **no `WITH CHECK`** and isn't role-gated despite an "Admin" comment; (c) `store_config_experiment_events` has only a SELECT policy and no writer; (d) `custom_css` is a stored-XSS sink.
- Patch API authenticates + checks membership but **does not Zod-validate** the body and writes arbitrary `value` at arbitrary `path`.
- `tenant_domains` / `store_pages` are **untracked** (no migration) — reproducibility/drift risk.

## 5. Render pipeline status

- **Not** one renderer in production: editor/preview use `packages/sections`; the live store uses legacy V1 templates → **preview ≠ production drift by construction.**
- Publish is **non-atomic** and version-snapshot failures are swallowed.
- **No ISR / revalidateTag / generateStaticParams / unstable_cache** — fully dynamic.
- Section schema is duplicated (package vs manifest) and has drifted.

---

## 6. Top 10 highest-leverage fixes (ordered)

1. **Render the storefront from `store_config_v2` sections** via `RenderPage`; convert Schneiders template → section preset. *(L)* — unlocks V1 retirement + ends preview/prod drift.
2. **Unify the data model:** extend `StoreConfigV2` to hold whatsapp/custom_css/template/schneiders; run the porter for all tenants. *(M–L)*
3. **Lock down drafts** (column-restrict anon read; stop selecting `_draft` on anon) + **sanitize/replace `custom_css`.** *(S–M)*
4. **Secure `generate-copy`** (auth, tenant scope, Zod, rate limit, real key) and wire `industry`. *(S)*
5. **Single section schema source of truth** (codegen the manifest from `packages/sections`); register the ~16 missing sections; delete the 10 dead ones; fix `section-field-groups`. *(M)*
6. **Atomic publish + reliable versioning** (one RPC/transaction; stop swallowing); add optimistic locking to the patch route + Zod-validate payloads against real schemas. *(M)*
7. **Store Command Center overview** at `/store` (live thumbnail + status + KPIs + health + pages + Customize CTA); make the editor `/store/edit`. *(M)*
8. **Port domains + store-analytics + share/QR** into V2/overview; move `useStorefrontUrl`. *(S–M)*
9. **Decide & finish-or-hide** experiments / segments / scheduled changes (each needs a real backend writer/consumer). *(M each)*
10. **Storefront caching/revalidation** (ISR/tag-based revalidate on publish) + repoint nav, remove banner, delete V1. *(M)*

---

*Generated by a multi-agent audit workflow; every P0/critical claim was adversarially re-verified against live code. Trust live code over this doc as the repo evolves.*
