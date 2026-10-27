# PDP lower sections: compact FAQ + call row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the product page's FAQ and policy accordion the express buy box's quiet look. That means an opt-in compact `faq_contact_split` and an opt-in tap-to-call row under the quiet `accordion_richtext`. Then fill scheniders-iraq's draft FAQ with the four COD worries, answered only from facts the store already states.

**Architecture:** Both changes are opt-in schema fields with `.catch(undefined)`: `compact: boolean` on `faq_contact_split` and `call_row: {prompt_i18n, action_i18n}` on `accordion_richtext`. Default markup stays byte-identical, and Task 1 pins it before any edit. A new shared `helpers/action-row.tsx` (`ActionRow` + `ActionPill`) draws the one tinted "row ending in one action" both sections close on. It has no hooks, so the server FAQ and the client accordion island can both use it. The call number comes from `commerce.contact.call_number` through the existing `parseStoreContact` resolver, the same one behind the PDP contact line and the thank-you call card.

**Tech Stack:** React 19 server/client components, Zod v4, Tailwind v4 `bk` token utilities, Vitest 2 (`renderToStaticMarkup`), Supabase CLI for the draft-config write.

---

## Ground rules (read once)

- Repo `/Users/ali/scheniders-mono`, branch `feat/pdp-lower-sections`. Run `git branch --show-current` before every edit batch and before every commit. If it prints anything else, STOP: BLOCKED.
- Shell prefix for every command: `export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"`. Use pnpm only. Never `pnpm install`, never stop the dev servers on :3000/:3001, never delete `.next`.
- Commit locally with explicit paths only:
  `git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "<msg>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
  Never push, stash, reset, or `checkout <ref> -- <path>`. Never stage the untracked `apps/storefront/AGENTS.md`, `apps/storefront/CLAUDE.md`, `apps/admin/next-env.d.ts` or `*.png`.
- Tests run from the repo root: `CI=true pnpm exec vitest run <path>`. `CI=true` never writes a new snapshot. A brand-new snapshot is written exactly once, by a run without `CI=true` (Task 1 only).
- `packages/sections` has no `type-check` script. It is type-checked through `pnpm --filter @scheniders/storefront type-check` and `pnpm --filter @scheniders/platform type-check` (both import it).
- This plan was prototyped end to end in a scratch copy of `packages/sections`. All code below ran there:
  - all 76 tests in the six touched or new test files passed;
  - `tsc --noEmit` was clean on every touched file;
  - the full sections suite passed except `helpers/image.test.ts`, which reads `apps/storefront/next.config.ts` by relative path and so cannot run outside the repo;
  - the new markup rendered at 390px with the storefront's compiled CSS and the tenant's tokens: 44px pills, 56px rows, no horizontal overflow;
  - the SQL in Task 6 was dry-run read-only against the live draft, and the write followed by the revert round-trips to an identical draft.

## Design

### What it looks like at 390px (scheniders-iraq, Arabic)

**Policy accordion (`accordion_richtext`, already `layout: "quiet"`), with `call_row`:**

```
──────────────────────────────────────────
 سياسة الدفع عند الاستلام                ⌄
──────────────────────────────────────────
 شحن فائق السرعة                         ⌄
──────────────────────────────────────────
 كرت الضمان المميز و سياسة الاسترجاع      ⌄
──────────────────────────────────────────
 عطور اصلية                              ⌄
──────────────────────────────────────────
╭────────────────────────────────────────╮   bg-bk-surface-alt, rounded-bk-card
│ ( 📞 اتصل )            تحب تحچي ويانا؟ │   prompt: text-sm bold ink
│                          0777 970 3832 │   number: text-xs ink-soft, <bdi>
╰────────────────────────────────────────╯   pill: min-h-11, ink hairline, rounded-bk-pill
```

The list is unchanged apart from the removed item (Task 6). The row comes after the list: the text block on the reading-start side and the pill on the end side. In Arabic the visual order flips with `flex-row-reverse`/`text-right`. The document stays LTR, and there is no `dir="rtl"` anywhere. The pill is a plain `tel:+9647779703832` link in the same tab.

**FAQ (`faq_contact_split`) with `compact: true`:**

```
                     الأسئلة الأكثر شيوعا   h2, font-bk-display text-lg font-black, start-aligned
──────────────────────────────────────────
 العطور أصلية؟                           ⌄  closed native <details>, min-h-14
──────────────────────────────────────────
 ريحة العطر نفس ريحة التيستر؟             ⌄
──────────────────────────────────────────
 إذا ما عجبني العطر وقت الاستلام؟          ⌄
──────────────────────────────────────────
 شكد يطول التوصيل؟                       ⌄
──────────────────────────────────────────
╭────────────────────────────────────────╮
│ ( 🟢 واتساب )              عندك استفسار؟ │   same ActionRow as the call row
│         نورونا على الواتساب وسولفوا ويانا │
╰────────────────────────────────────────╯
```

- Compact drops the centred eyebrow chip, the sparkle glyph, the sub line, all three icon images, the raised plates and the overhanging pin.
- All rows start closed. A buyer scanning four worries reads the questions, not the first answer. This matches the quiet accordion above it.
- Rows stay native `<details name>`: zero JS, answers in the DOM, one open at a time. The chevron rotates via `group-open:` and `motion-reduce:transition-none`.
- The answer paragraph sits under the question with an 8-unit inset on the chevron side, the same as the quiet accordion.
- On `/faq` and `/contact`, compact keeps the existing rule: the title is the page's `h1`.

### Data and props

| Section | New prop | Shape | Default | Read from |
|---|---|---|---|---|
| `faq_contact_split` | `compact` | `z.boolean().optional().catch(undefined)` | absent → cards/ledger exactly as today | — |
| `accordion_richtext` | `call_row` | `z.object({ prompt_i18n, action_i18n }).optional().catch(undefined)` | absent → quiet list exactly as today | number: `ctx.tenant.store_config_v2.commerce.contact` → `parseStoreContact` → `call_number` → `formatIraqiPhoneDisplay` / `tel:+${whatsappDigits()}` |

- **`compact`** overrides `layout`.
  - The WhatsApp row renders only when the existing resolver (`resolveTenantWhatsapp`) finds a number *and* `cta_label_i18n` resolves.
  - A boolean is used instead of a third `layout` value. `layout` is a strict enum, and `faq-ledger.test.tsx` pins that an unknown layout is rejected. A `"compact"` value published before the code deploys would drop the section. An unknown `compact` key is stripped by old code instead, which then renders cards.
- **`call_row`** applies to the quiet layout only. The cards layout ignores it.
  - It renders nothing when there is no valid Iraqi mobile in `commerce.contact.call_number`, or when the prompt or the action is empty for the locale.
  - The prompt and action are merchant copy (i18n props), so there are no chrome strings, no `STRINGS` entries and no Kurdish-coverage change.
- **Shared row:** `helpers/action-row.tsx` → `ActionRow({ kind, rtl, children, action })` + `ActionPill({ href, external, rtl, icon, label, labelField })`.

### Files

- Create `packages/sections/src/_pdp-lower-fixtures.ts`: frozen draft props for both sections, plus the tenants and the context builder.
- Create `packages/sections/src/_pdp-lower-baseline-snapshot.test.tsx` and its `__snapshots__/…snap`: the default-markup pin.
- Create `packages/sections/src/helpers/action-row.tsx` and `helpers/action-row.test.tsx`.
- Create `packages/sections/src/faq_contact_split.compact.tsx` (layout only) and `faq_contact_split.compact.test.tsx`.
- Modify `packages/sections/src/faq_contact_split.tsx`: schema field, `headingAs` const, early return.
- Create `packages/sections/src/accordion_richtext.call-row.test.tsx`.
- Modify `packages/sections/src/accordion_richtext.tsx`: schema field and `resolveCallRow`.
- Modify `packages/sections/src/accordion_richtext.client.tsx`: the `call` prop and the row.
- Leave `accordion_richtext.test.tsx` and `faq-ledger.test.tsx` untouched. Both must stay green.

---

### Task 1: Pin the default markup (before any edit)

**Files:**
- Create: `packages/sections/src/_pdp-lower-fixtures.ts`
- Create: `packages/sections/src/_pdp-lower-baseline-snapshot.test.tsx`
- Create (generated): `packages/sections/src/__snapshots__/_pdp-lower-baseline-snapshot.test.tsx.snap`

- [ ] **Step 1: Check the branch and that the two section files are untouched**

Run: `git branch --show-current && git status --porcelain packages/sections/src`
Expected: `feat/pdp-lower-sections` and no output for `packages/sections/src`. If either section file shows as modified, STOP: the baseline would freeze an edited render.

- [ ] **Step 2: Write the fixtures file**

`packages/sections/src/_pdp-lower-fixtures.ts`:

```ts
// =====================================================================
// Fixtures for the PDP's lower sections (accordion_richtext quiet,
// faq_contact_split) — scheniders-iraq's draft product page as it stood at
// store_config_rev 38 (tenants.store_config_v2_draft pages[2], sections 1
// and 5), frozen verbatim, merchant typos included. The baseline snapshot
// file renders these BEFORE any opt-in field exists; later tests reuse them.
// =====================================================================

import type { LocaleCode, PageId } from "@scheniders/shared";
import accordion_richtext from "./accordion_richtext";
import faq_contact_split from "./faq_contact_split";
import type { SectionRenderContext } from "./_types";
import type { Tenant } from "./types";

export type AccordionProps = typeof accordion_richtext.defaultProps;
export type FaqProps = typeof faq_contact_split.defaultProps;

/** scheniders-iraq's contact data: the store's one number, as the draft
 *  stores it (`commerce.contact`) and as the V1 contact block stores it. */
export const IRAQ_TENANT: Tenant = {
  id: "b5c4f2d4-834f-4af4-822d-9b9826a8f45a",
  business_name: "شنايدر",
  slug: "scheniders-iraq",
  plan: "pro",
  status: "active",
  branding: {},
  settings: {},
  store_config: { contact: { whatsapp_number: "07779703832", phone_number: null } },
  store_config_v2: {
    enabled_locales: ["ar", "en"],
    commerce: { contact: { call_number: "07779703832", whatsapp_confirm: true } },
  },
};

/** A tenant with no contact data anywhere: every contact row must vanish. */
export const BARE_TENANT: Tenant = {
  id: "t-bare",
  business_name: "bare",
  slug: "bare",
  plan: "pro",
  status: "active",
  branding: {},
  settings: {},
  store_config: {},
};

export function lowerCtx(
  locale: LocaleCode,
  tenant: Tenant = IRAQ_TENANT,
  page_id: PageId = "product",
): SectionRenderContext {
  return {
    tenant,
    runtime: {
      page_id,
      breakpoint: "mobile",
      locale,
      audience_segments: [],
      ab_test_arms: {},
      now: new Date("2026-10-22T09:00:00Z"),
    },
    products: [],
    categories: [],
  };
}

/** Draft pages[2].sections[1].base — the PDP policy accordion. */
export const LIVE_PDP_POLICIES: AccordionProps = {
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
      title_i18n: {
        ar: "كرت الضمان المميز و سياسة الاسترجاع",
        en: "Premium warranty card & return policy",
      },
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
    {
      title_i18n: { ar: "خدمة العملاء", en: "Customer care" },
      body_i18n: {
        ar: "سولف ويانا ! احنا موجودين بأي وقت وبكل وقت حتى نجاوب بكل حب ع اسئلتكم واستفساراتكم من خلال الواتساب",
        en: "Talk to us! We are available around the clock to answer your questions with love, over WhatsApp.",
      },
    },
  ],
};

/** Draft pages[2].sections[5].base — the PDP FAQ. */
export const LIVE_PDP_FAQ: FaqProps = {
  eyebrow_i18n: { ar: "أسئلة و أجوبة", en: "Questions & answers" },
  title_i18n: { ar: "الأسئلة الأكثر شيوعا", en: "Frequently asked questions" },
  sub_i18n: {
    ar: "هنا تجد أجوبة عن الأسئلة الاكثر شيوعا، إدا مازلت تريد معلومات إضافية، يمكنك دائما الاتصال بنا.",
    en: "Answers to the most common questions — and you can always reach us for more.",
  },
  row_icon_url:
    "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/73c12b05-fbb5-4cc7-9a75-f61094855221.svg",
  items: [
    {
      q_i18n: { ar: "الدفع عند الاستلام", en: "Cash on delivery" },
      a_i18n: {
        ar: "يتم الدفع حصراً بعد استلام العطر واختباره من خلال زجاجة الاختبار المرفقة مجاناً مع كل عطر",
        en: "Payment happens only after you receive the perfume and try it via the free tester bottle included with every order.",
      },
    },
    {
      q_i18n: { ar: "شكد يطول الشحن؟", en: "How long does delivery take?" },
      a_i18n: {
        ar: "أغلب الطلبات توصل خلال ٢٤ ساعة من تثبيت الطلب",
        en: "Most orders arrive within 24 hours of confirmation.",
      },
    },
  ],
  contact: {
    icon_url:
      "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/66a2314b-371e-4474-ad0d-53a4cad055f9.svg",
    title_i18n: { ar: "لديك أسئلة أخرى؟", en: "More questions?" },
    sub_i18n: {
      ar: "إدا مازلت تريد معلومات إضافية، يمكنك دائما الاتصال بنا.",
      en: "If you still need more information, you can always reach us.",
    },
    cta_label_i18n: { ar: "تواصل معنا", en: "Contact us" },
    whatsapp_number: "",
  },
};
```

- [ ] **Step 3: Write the baseline test**

`packages/sections/src/_pdp-lower-baseline-snapshot.test.tsx`:

```tsx
// =====================================================================
// T0 — the PDP's lower sections, frozen BEFORE the opt-in fields
// =====================================================================
// faq_contact_split (cards, ledger, scheniders-iraq's live PDP FAQ) and
// accordion_richtext's quiet layout (scheniders-iraq's live PDP policies)
// as server markup. Written before `compact` (faq_contact_split) and
// `call_row` (accordion_richtext) existed; with neither set, the markup
// must stay byte-identical. A diff here is a back-compat break, not a
// snapshot to refresh. Never run this file with -u.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocaleCode } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import accordion_richtext from "./accordion_richtext";
import faq_contact_split from "./faq_contact_split";
import {
  BARE_TENANT,
  IRAQ_TENANT,
  LIVE_PDP_FAQ,
  LIVE_PDP_POLICIES,
  lowerCtx,
  type AccordionProps,
  type FaqProps,
} from "./_pdp-lower-fixtures";
import type { Tenant } from "./types";

function renderFaq(props: FaqProps, locale: LocaleCode, tenant: Tenant = IRAQ_TENANT): string {
  const Render = faq_contact_split.render;
  return renderToStaticMarkup(
    <StoreBaseProvider base="">
      <Render props={props} ctx={lowerCtx(locale, tenant)} />
    </StoreBaseProvider>,
  );
}

function renderAccordion(props: AccordionProps, locale: LocaleCode, tenant: Tenant = IRAQ_TENANT): string {
  const Render = accordion_richtext.render;
  return renderToStaticMarkup(
    <StoreBaseProvider base="">
      <Render props={props} ctx={lowerCtx(locale, tenant)} />
    </StoreBaseProvider>,
  );
}

describe("faq_contact_split — frozen", () => {
  const cards = faq_contact_split.defaultProps;

  it("defaultProps ar", () => {
    expect(renderFaq(cards, "ar")).toMatchSnapshot();
  });

  it("defaultProps en", () => {
    expect(renderFaq(cards, "en")).toMatchSnapshot();
  });

  it("defaultProps ledger ar", () => {
    expect(renderFaq({ ...cards, layout: "ledger" }, "ar")).toMatchSnapshot();
  });

  it("LIVE_PDP_FAQ ar", () => {
    expect(renderFaq(LIVE_PDP_FAQ, "ar")).toMatchSnapshot();
  });

  it("LIVE_PDP_FAQ en", () => {
    expect(renderFaq(LIVE_PDP_FAQ, "en")).toMatchSnapshot();
  });

  it("LIVE_PDP_FAQ ar, no contact number anywhere", () => {
    expect(renderFaq(LIVE_PDP_FAQ, "ar", BARE_TENANT)).toMatchSnapshot();
  });
});

describe("accordion_richtext quiet — frozen", () => {
  it("LIVE_PDP_POLICIES ar", () => {
    expect(renderAccordion(LIVE_PDP_POLICIES, "ar")).toMatchSnapshot();
  });

  it("LIVE_PDP_POLICIES en", () => {
    expect(renderAccordion(LIVE_PDP_POLICIES, "en")).toMatchSnapshot();
  });

  it("LIVE_PDP_POLICIES ar with a heading", () => {
    expect(
      renderAccordion(
        { ...LIVE_PDP_POLICIES, heading_i18n: { ar: "ضماناتك", en: "Our promise" } },
        "ar",
      ),
    ).toMatchSnapshot();
  });

  it("LIVE_PDP_POLICIES ar, no contact number anywhere", () => {
    expect(renderAccordion(LIVE_PDP_POLICIES, "ar", BARE_TENANT)).toMatchSnapshot();
  });
});
```

- [ ] **Step 4: Confirm CI mode refuses to invent the baseline**

Run: `CI=true pnpm exec vitest run packages/sections/src/_pdp-lower-baseline-snapshot.test.tsx`
Expected: FAIL, `Snapshots 10 failed` (no snapshot file exists yet).

- [ ] **Step 5: Write the baseline once (the only non-CI run in this plan)**

Run: `pnpm exec vitest run packages/sections/src/_pdp-lower-baseline-snapshot.test.tsx`
Expected: PASS, `Snapshots 10 written`.

- [ ] **Step 6: Re-run in CI mode**

Run: `CI=true pnpm exec vitest run packages/sections/src/_pdp-lower-baseline-snapshot.test.tsx`
Expected: PASS, 10 tests.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add packages/sections/src/_pdp-lower-fixtures.ts packages/sections/src/_pdp-lower-baseline-snapshot.test.tsx packages/sections/src/__snapshots__/_pdp-lower-baseline-snapshot.test.tsx.snap
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "test(sections): freeze the PDP FAQ and quiet policy accordion before opt-in fields" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `ActionRow` / `ActionPill`

**Files:**
- Create: `packages/sections/src/helpers/action-row.test.tsx`
- Create: `packages/sections/src/helpers/action-row.tsx`

- [ ] **Step 1: Write the failing test**

`packages/sections/src/helpers/action-row.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ActionPill, ActionRow } from "./action-row";

function row(rtl: boolean, external: boolean): string {
  return renderToStaticMarkup(
    <ActionRow
      kind={external ? "whatsapp" : "call"}
      rtl={rtl}
      action={
        <ActionPill
          href={external ? "https://wa.me/9647779703832" : "tel:+9647779703832"}
          external={external}
          rtl={rtl}
          icon={<span aria-hidden="true">i</span>}
          label="اتصل"
          labelField="call_row.action_i18n"
        />
      }
    >
      <p>تحب تحچي ويانا؟</p>
    </ActionRow>,
  );
}

describe("ActionRow / ActionPill", () => {
  it("is one tinted card row with the text block first and the pill last", () => {
    const html = row(false, false);
    expect(html).toMatch(/^<div data-action-row="call" class="[^"]*rounded-bk-card bg-bk-surface-alt/);
    expect(html.indexOf("تحب تحچي ويانا؟")).toBeLessThan(html.indexOf("<a "));
  });

  it("meets the 44px touch target and the reduced-motion contract", () => {
    const html = row(false, false);
    expect(html).toContain("min-h-11");
    expect(html).toContain("motion-reduce:transition-none");
  });

  it("keeps a tel: link in place and opens WhatsApp in a new tab", () => {
    const call = row(false, false);
    expect(call).toContain('href="tel:+9647779703832"');
    expect(call).not.toContain("target=");
    const wa = row(false, true);
    expect(wa).toContain('data-action-row="whatsapp"');
    expect(wa).toContain('target="_blank"');
    expect(wa).toContain('rel="noopener noreferrer"');
  });

  it("tags the label for the editor", () => {
    expect(row(false, false)).toContain('<span data-i18n-field="call_row.action_i18n">اتصل</span>');
  });

  it("flips visual order for Arabic with classes, never dir", () => {
    const ar = row(true, false);
    const en = row(false, false);
    expect(ar.split("flex-row-reverse").length - 1).toBe(2);
    expect(ar).toContain("text-right");
    expect(ar).not.toContain("text-left");
    expect(en).not.toContain("flex-row-reverse");
    expect(en).toContain("text-left");
    for (const html of [ar, en]) expect(html).not.toContain("dir=");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `CI=true pnpm exec vitest run packages/sections/src/helpers/action-row.test.tsx`
Expected: FAIL. `./action-row` cannot be resolved.

- [ ] **Step 3: Implement**

`packages/sections/src/helpers/action-row.tsx`:

```tsx
// =====================================================================
// <ActionRow> / <ActionPill> — one quiet tinted row ending in one action
// =====================================================================
// The product page's lower sections close on a way to reach a person: the
// quiet policy accordion's call row (tap to call) and the compact FAQ's
// WhatsApp row. Both are this row, so they read as one family with the
// express buy box (rounded-bk-card, bg-bk-surface-alt, ink pill). No hooks
// and no "use client": the server FAQ and the client accordion island both
// render it. Arabic flips the visual order with classes — never `dir`.
// =====================================================================

import type { ReactNode } from "react";
import { cn } from "@scheniders/shared";

export function ActionRow({
  kind,
  rtl,
  children,
  action,
}: {
  /** Marks the row for tests and the editor overlay. */
  kind: "call" | "whatsapp";
  rtl: boolean;
  /** The row's text block (one or two short lines). */
  children: ReactNode;
  /** The row's single action, an `<ActionPill>`. */
  action: ReactNode;
}) {
  return (
    <div
      data-action-row={kind}
      className={cn(
        "mt-bk-sm flex items-center gap-3 rounded-bk-card bg-bk-surface-alt px-4 py-3",
        rtl && "flex-row-reverse",
      )}
    >
      <div className={cn("min-w-0 flex-1", rtl ? "text-right" : "text-left")}>{children}</div>
      {action}
    </div>
  );
}

export function ActionPill({
  href,
  external,
  rtl,
  icon,
  label,
  labelField,
}: {
  href: string;
  /** Opens in a new tab (WhatsApp). A `tel:` link stays in place. */
  external: boolean;
  rtl: boolean;
  icon: ReactNode;
  label: string;
  /** The merchant field the label comes from, for the editor overlay. */
  labelField: string;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-bk-pill border-bk border-bk-ink bg-bk-surface px-4 font-bk-display text-sm font-black text-bk-ink transition-opacity duration-bk-fast active:opacity-70 motion-reduce:transition-none",
        rtl && "flex-row-reverse",
      )}
    >
      {icon}
      <span data-i18n-field={labelField}>{label}</span>
    </a>
  );
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `CI=true pnpm exec vitest run packages/sections/src/helpers/action-row.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add packages/sections/src/helpers/action-row.tsx packages/sections/src/helpers/action-row.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): ActionRow, one tinted row ending in one action" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Opt-in `compact` on `faq_contact_split`

**Files:**
- Create: `packages/sections/src/faq_contact_split.compact.test.tsx`
- Create: `packages/sections/src/faq_contact_split.compact.tsx`
- Modify: `packages/sections/src/faq_contact_split.tsx` (imports after line 27; schema after line 43; the render between `const rows` (line 160) and `const ledger` (line 164); the header's `as=` at lines 187-192)

- [ ] **Step 1: Write the failing test**

`packages/sections/src/faq_contact_split.compact.test.tsx`:

```tsx
// faq_contact_split — the opt-in `compact: true` presentation (the product
// page's FAQ in the express buy box's visual language). Static markup only.
// The default markup is pinned in _pdp-lower-baseline-snapshot.test.tsx.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocaleCode, PageId } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import faq_contact_split from "./faq_contact_split";
import {
  BARE_TENANT,
  IRAQ_TENANT,
  LIVE_PDP_FAQ,
  lowerCtx,
  type FaqProps,
} from "./_pdp-lower-fixtures";
import type { Tenant } from "./types";

function render(
  props: FaqProps,
  locale: LocaleCode = "ar",
  tenant: Tenant = IRAQ_TENANT,
  page: PageId = "product",
): string {
  const Render = faq_contact_split.render;
  return renderToStaticMarkup(
    <StoreBaseProvider base="">
      <Render props={props} ctx={lowerCtx(locale, tenant, page)} />
    </StoreBaseProvider>,
  );
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

const COMPACT: FaqProps = { ...LIVE_PDP_FAQ, compact: true };
const n = COMPACT.items.length;

describe("schema", () => {
  const { schema, defaultProps } = faq_contact_split;

  it("keeps `compact` out of defaultProps", () => {
    expect(defaultProps).not.toHaveProperty("compact");
    expect(schema.safeParse(defaultProps).success).toBe(true);
  });

  it("the live config parses with compact undefined", () => {
    const r = schema.safeParse(LIVE_PDP_FAQ);
    expect(r.success).toBe(true);
    expect(r.data?.compact).toBeUndefined();
  });

  it("accepts true", () => {
    expect(schema.safeParse(COMPACT).data?.compact).toBe(true);
  });

  it("a malformed value parses to undefined and renders the default", () => {
    const base = render(LIVE_PDP_FAQ);
    for (const bad of ["yes", 1, { on: true }]) {
      const r = schema.safeParse({ ...LIVE_PDP_FAQ, compact: bad });
      expect(r.success).toBe(true);
      if (!r.success) continue;
      expect(r.data.compact).toBeUndefined();
      expect(render(r.data)).toBe(base);
    }
  });

  it("compact: false renders the default byte for byte", () => {
    for (const locale of ["ar", "en"] as const) {
      expect(render({ ...LIVE_PDP_FAQ, compact: false }, locale)).toBe(render(LIVE_PDP_FAQ, locale));
    }
  });
});

describe("compact", () => {
  const ar = render(COMPACT, "ar");
  const en = render(COMPACT, "en");

  it("draws none of the cards / ledger surfaces or decoration", () => {
    for (const html of [ar, en]) {
      expect(html).not.toContain("--bk-shadow-card");
      expect(html).not.toContain("-top-4 left-1/2");
      expect(html).not.toContain("lg:col-span-3");
      expect(html).not.toContain("<img");
      expect(html).not.toContain('data-i18n-field="eyebrow_i18n"');
      expect(html).not.toContain('data-i18n-field="sub_i18n"');
      expect(html).not.toContain("color-mix(");
    }
  });

  it("titles the block with one start-aligned display heading", () => {
    expect(count(ar, "<h2")).toBe(1);
    expect(ar).toMatch(
      /<h2 data-i18n-field="title_i18n" class="[^"]*font-bk-display[^"]*text-right[^"]*">الأسئلة الأكثر شيوعا<\/h2>/,
    );
    expect(en).toMatch(/<h2 data-i18n-field="title_i18n" class="[^"]*text-left[^"]*">Frequently asked questions<\/h2>/);
  });

  it("owns the page's h1 on /faq and /contact, as the default does", () => {
    for (const page of ["faq", "contact"] as const) {
      const html = render(COMPACT, "ar", IRAQ_TENANT, page);
      expect(count(html, "<h1")).toBe(1);
      expect(html).not.toContain("<h2");
    }
  });

  it("is one hairline list of closed native rows in one exclusive group", () => {
    expect(ar).toContain("divide-y divide-bk-divider border-y border-bk-divider");
    const details = ar.match(/<details\b[^>]*>/g) ?? [];
    expect(details).toHaveLength(n);
    expect(details.filter((d) => /\bopen(=""|\s|>)/.test(d))).toHaveLength(0);
    expect(new Set(details.map((d) => d.match(/name="([^"]+)"/)?.[1] ?? "")).size).toBe(1);
    expect(ar).not.toContain("<button");
  });

  it("keeps every answer in the HTML while closed", () => {
    for (const item of COMPACT.items) {
      expect(ar).toContain(item.a_i18n.ar ?? "");
      expect(en).toContain(item.a_i18n.en ?? "");
    }
  });

  it("uses one ink chevron per row, and 56px rows", () => {
    const chevrons = [...ar.matchAll(/<span class="([^"]*)"[^>]*>expand_more<\/span>/g)];
    expect(chevrons).toHaveLength(n);
    for (const [, cls] of chevrons) {
      expect(cls).toContain("text-bk-ink");
      expect(cls).toContain("group-open:rotate-180");
      expect(cls).toContain("motion-reduce:transition-none");
    }
    expect(count(ar, "min-h-14")).toBe(n);
  });

  it("folds the contact card into one WhatsApp row on the store number", () => {
    expect(count(ar, 'data-action-row="whatsapp"')).toBe(1);
    expect(ar).toContain('href="https://wa.me/9647779703832"');
    expect(ar).toContain('target="_blank"');
    expect(ar).toContain('<span data-i18n-field="contact.cta_label_i18n">تواصل معنا</span>');
    expect(ar).toContain('data-i18n-field="contact.title_i18n"');
    expect(ar).toContain('data-i18n-field="contact.sub_i18n"');
    expect(ar).toContain("min-h-11");
    // The row comes after the list.
    expect(ar.indexOf('data-action-row="whatsapp"')).toBeGreaterThan(ar.lastIndexOf("</details>"));
  });

  it("drops the WhatsApp row when the store has no usable number", () => {
    const html = render(COMPACT, "ar", BARE_TENANT);
    expect(html).not.toContain("data-action-row");
    expect(html).not.toContain("wa.me");
    expect(html.match(/<details\b/g) ?? []).toHaveLength(n);
  });

  it("overrides the ledger layout", () => {
    expect(render({ ...COMPACT, layout: "ledger" }, "ar")).toBe(ar);
  });

  it("flips visual order for Arabic with classes, never dir=rtl", () => {
    // n summaries + the contact row + its pill.
    expect(count(ar, "flex-row-reverse")).toBe(n + 2);
    expect(count(ar, "pl-8")).toBe(n);
    expect(ar).not.toContain("text-left");
    expect(en).not.toContain("flex-row-reverse");
    expect(en).not.toContain("text-right");
    expect(count(en, "pr-8")).toBe(n);
    for (const html of [ar, en]) {
      expect(html).not.toContain('dir="rtl"');
      const dirTags = [...html.matchAll(/<(\w+)[^>]*\sdir="auto"/g)].map((m) => m[1]);
      expect(dirTags).toHaveLength(n);
      expect(new Set(dirTags)).toEqual(new Set(["p"]));
    }
  });

  it("tags the merchant fields for the editor", () => {
    expect(ar).toContain('data-i18n-field="items[0].q_i18n"');
    expect(ar).toContain('data-i18n-field="items[0].a_i18n"');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `CI=true pnpm exec vitest run packages/sections/src/faq_contact_split.compact.test.tsx`
Expected: FAIL. Zod strips the unknown `compact` key, so `accepts true` gets `undefined`, and every `compact` case still sees the cards markup (`--bk-shadow-card` present).

- [ ] **Step 3: Write the compact layout**

`packages/sections/src/faq_contact_split.compact.tsx`:

```tsx
// =====================================================================
// faq_contact_split — the opt-in `compact: true` presentation
// =====================================================================
// The product page's FAQ in the express buy box's visual language: one
// start-aligned display heading, one hairline-ruled list of closed native
// <details> rows (zero JS; answers stay in the DOM for find-in-page and
// crawlers; the shared `name` keeps one row open at a time), and the
// contact card folded into one tinted row ending in the WhatsApp pill.
// The section file resolves every string; this file only lays them out.
// Arabic flips the visual order with classes — the document stays LTR.
// =====================================================================

import { cn } from "@scheniders/shared";
import { MaterialIcon, Section, WhatsAppIcon } from "./helpers/primitives";
import { ActionPill, ActionRow } from "./helpers/action-row";

export interface CompactFaqRow {
  question: string;
  answer: string;
}

export interface CompactFaqContact {
  title: string;
  sub: string;
  ctaLabel: string;
  href: string;
}

export function FaqContactCompact({
  title,
  headingAs: Heading,
  groupName,
  rows,
  contact,
  rtl,
}: {
  title: string;
  headingAs: "h1" | "h2";
  groupName: string;
  rows: readonly CompactFaqRow[];
  /** Null when the store has no usable WhatsApp number or no CTA label. */
  contact: CompactFaqContact | null;
  rtl: boolean;
}) {
  const textSide = rtl ? "text-right" : "text-left";
  return (
    <Section density="dense">
      {title && (
        <Heading
          data-i18n-field="title_i18n"
          className={cn(
            "mb-bk-sm font-bk-display text-lg font-black text-bk-ink text-balance",
            textSide,
          )}
        >
          {title}
        </Heading>
      )}
      <div className="divide-y divide-bk-divider border-y border-bk-divider">
        {rows.map(({ question, answer }, i) => (
          <details key={`${i}-${question}`} name={groupName} className="group">
            <summary
              className={cn(
                "flex min-h-14 w-full cursor-pointer list-none items-center gap-3 py-4 text-bk-ink transition-opacity duration-bk-fast active:opacity-70 motion-reduce:transition-none [&::-webkit-details-marker]:hidden",
                rtl && "flex-row-reverse",
              )}
            >
              <span
                data-i18n-field={`items[${i}].q_i18n`}
                className={cn(
                  "flex-1 font-bk-display text-base font-bold leading-snug text-balance",
                  textSide,
                )}
              >
                {question}
              </span>
              <MaterialIcon
                name="expand_more"
                className="shrink-0 text-xl text-bk-ink transition-transform duration-bk-base ease-out group-open:rotate-180 motion-reduce:transition-none"
              />
            </summary>
            <p
              data-i18n-field={`items[${i}].a_i18n`}
              dir="auto"
              className={cn(
                "whitespace-pre-line pb-5 font-bk-body text-[15px] leading-loose text-bk-ink-soft text-pretty",
                rtl ? "pl-8" : "pr-8",
                textSide,
              )}
            >
              {answer}
            </p>
          </details>
        ))}
      </div>
      {contact && (
        <ActionRow
          kind="whatsapp"
          rtl={rtl}
          action={
            <ActionPill
              href={contact.href}
              external
              rtl={rtl}
              icon={<WhatsAppIcon shadow={false} className="h-5 w-5 shrink-0 text-bk-success" />}
              label={contact.ctaLabel}
              labelField="contact.cta_label_i18n"
            />
          }
        >
          {contact.title && (
            <p
              data-i18n-field="contact.title_i18n"
              className="font-bk-body text-sm font-bold leading-snug text-bk-ink text-balance"
            >
              {contact.title}
            </p>
          )}
          {contact.sub && (
            <p
              data-i18n-field="contact.sub_i18n"
              className="font-bk-body text-xs leading-relaxed text-bk-ink-soft text-pretty"
            >
              {contact.sub}
            </p>
          )}
        </ActionRow>
      )}
    </Section>
  );
}
```

- [ ] **Step 4: Wire it into the section**

In `packages/sections/src/faq_contact_split.tsx`, apply exactly this diff. Nothing else in the file changes; the `headingAs` const only lifts the existing inline expression.

```diff
--- a/packages/sections/src/faq_contact_split.tsx
+++ b/packages/sections/src/faq_contact_split.tsx
@@ -25,6 +25,8 @@
 import { i18nStringSchema, i18nStringOptional } from "./_schema";
 import { registerSection } from "./_registry";
 import type { SectionDefinition, SectionRenderContext } from "./_types";
+import { readsRtl } from "./pdp_express/text";
+import { FaqContactCompact } from "./faq_contact_split.compact";
 
 const schema = z.object({
   eyebrow_i18n: i18nStringSchema,
@@ -41,6 +43,16 @@
    * and a row that opens should feel like it belongs to a document.
    */
   layout: z.enum(["cards", "ledger"]).optional(),
+  /**
+   * Opt-in compact presentation for the product page: a start-aligned
+   * heading, one hairline-ruled list of closed native rows, and the contact
+   * card folded into one tinted row ending in the WhatsApp pill (see
+   * `./faq_contact_split.compact.tsx`). It overrides `layout`; the eyebrow,
+   * the sub line and the three icon images are not drawn. Unset (every
+   * existing config) renders exactly as before; a malformed value parses to
+   * undefined instead of dropping the section.
+   */
+  compact: z.boolean().optional().catch(undefined),
   items: z
     .array(
       z.object({
@@ -161,6 +173,29 @@
     question: resolveI18n(item.q_i18n, locale),
     answer: resolveI18n(item.a_i18n, locale),
   }));
+  // On /faq and /contact this section leads the page and owns its h1.
+  const headingAs =
+    ctx.runtime.page_id === "faq" || ctx.runtime.page_id === "contact"
+      ? "h1"
+      : "h2";
+
+  if (props.compact) {
+    return (
+      <FaqContactCompact
+        title={title}
+        headingAs={headingAs}
+        groupName={groupName}
+        rows={rows}
+        contact={
+          waHref && ctaLabel
+            ? { title: contactTitle, sub: contactSub, ctaLabel, href: waHref }
+            : null
+        }
+        rtl={readsRtl(locale)}
+      />
+    );
+  }
+
   const ledger = props.layout === "ledger";
 
   return (
@@ -184,12 +219,7 @@
           ) : undefined
         }
         glyph={props.eyebrow_icon_url ? "none" : "sparkle"}
-        // On /faq and /contact this section leads the page and owns its h1.
-        as={
-          ctx.runtime.page_id === "faq" || ctx.runtime.page_id === "contact"
-            ? "h1"
-            : "h2"
-        }
+        as={headingAs}
         title={title}
         subtitle={sub}
         eyebrowField="eyebrow_i18n"
```

- [ ] **Step 5: Run the new test, the frozen baseline and the ledger test**

Run: `CI=true pnpm exec vitest run packages/sections/src/faq_contact_split.compact.test.tsx packages/sections/src/_pdp-lower-baseline-snapshot.test.tsx packages/sections/src/faq-ledger.test.tsx`
Expected: PASS: 16 + 10 + 7 tests. A failing baseline snapshot means the default markup moved. Fix the code. Never run `-u`.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add packages/sections/src/faq_contact_split.tsx packages/sections/src/faq_contact_split.compact.tsx packages/sections/src/faq_contact_split.compact.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): opt-in compact faq_contact_split for the product page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Opt-in `call_row` under the quiet `accordion_richtext`

**Files:**
- Create: `packages/sections/src/accordion_richtext.call-row.test.tsx`
- Modify: `packages/sections/src/accordion_richtext.tsx` (header comment, imports, schema, new `resolveCallRow` before `renderParagraphs`, the quiet render's props)
- Modify: `packages/sections/src/accordion_richtext.client.tsx` (header comment, import, `QuietCallRow`, the `call` prop, the row after the list)

- [ ] **Step 1: Write the failing test**

`packages/sections/src/accordion_richtext.call-row.test.tsx`:

```tsx
// accordion_richtext — the opt-in `call_row` under the quiet layout: the
// merchant's prompt, the store's call number, and a tap-to-call pill. The
// number is `commerce.contact.call_number` through `parseStoreContact`.
// Static markup only. The quiet markup without `call_row` is pinned in
// _pdp-lower-baseline-snapshot.test.tsx; the cards markup in
// accordion_richtext.test.tsx.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocaleCode } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import accordion_richtext, { resolveCallRow } from "./accordion_richtext";
import {
  BARE_TENANT,
  IRAQ_TENANT,
  LIVE_PDP_POLICIES,
  lowerCtx,
  type AccordionProps,
} from "./_pdp-lower-fixtures";
import type { Tenant } from "./types";

function render(props: AccordionProps, locale: LocaleCode = "ar", tenant: Tenant = IRAQ_TENANT): string {
  const Render = accordion_richtext.render;
  return renderToStaticMarkup(
    <StoreBaseProvider base="">
      <Render props={props} ctx={lowerCtx(locale, tenant)} />
    </StoreBaseProvider>,
  );
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function withContact(contact: unknown): Tenant {
  return {
    ...IRAQ_TENANT,
    store_config_v2: {
      enabled_locales: ["ar", "en"],
      commerce: { contact: contact as { call_number: string } },
    },
  };
}

const CALL_ROW = {
  prompt_i18n: { ar: "تحب تحچي ويانا؟", en: "Rather talk to us?" },
  action_i18n: { ar: "اتصل", en: "Call" },
};
const WITH_CALL: AccordionProps = { ...LIVE_PDP_POLICIES, call_row: CALL_ROW };

describe("schema", () => {
  const { schema, defaultProps } = accordion_richtext;

  it("keeps `call_row` out of defaultProps", () => {
    expect(defaultProps).not.toHaveProperty("call_row");
  });

  it("the live config parses with call_row undefined", () => {
    const r = schema.safeParse(LIVE_PDP_POLICIES);
    expect(r.success).toBe(true);
    expect(r.data?.call_row).toBeUndefined();
  });

  it("accepts a prompt and an action", () => {
    expect(schema.safeParse(WITH_CALL).data?.call_row).toEqual(CALL_ROW);
  });

  it("a malformed call_row parses to undefined and renders no row", () => {
    const quiet = render(LIVE_PDP_POLICIES);
    for (const bad of ["call", 42, { prompt_i18n: 5, action_i18n: {} }, { prompt_i18n: {} }]) {
      const r = schema.safeParse({ ...LIVE_PDP_POLICIES, call_row: bad });
      expect(r.success).toBe(true);
      if (!r.success) continue;
      expect(r.data.call_row).toBeUndefined();
      expect(render(r.data)).toBe(quiet);
    }
  });
});

describe("resolveCallRow", () => {
  const contact = { call_number: "07779703832" };

  it("formats the number for reading and dials it in international form", () => {
    expect(resolveCallRow(CALL_ROW, contact, "ar")).toEqual({
      prompt: "تحب تحچي ويانا؟",
      action: "اتصل",
      number: "0777 970 3832",
      href: "tel:+9647779703832",
    });
  });

  it("normalises a stored +964 number to the same row", () => {
    expect(resolveCallRow(CALL_ROW, { call_number: "+964 777 970 3832" }, "en")).toEqual({
      prompt: "Rather talk to us?",
      action: "Call",
      number: "0777 970 3832",
      href: "tel:+9647779703832",
    });
  });

  it("is null without the opt-in, without a valid Iraqi mobile, or with an empty string", () => {
    expect(resolveCallRow(undefined, contact, "ar")).toBeNull();
    expect(resolveCallRow(CALL_ROW, undefined, "ar")).toBeNull();
    expect(resolveCallRow(CALL_ROW, { call_number: "12345" }, "ar")).toBeNull();
    expect(resolveCallRow(CALL_ROW, { call_number: "" }, "ar")).toBeNull();
    expect(resolveCallRow({ ...CALL_ROW, prompt_i18n: { ar: " ", en: "" } }, contact, "ar")).toBeNull();
    expect(resolveCallRow({ ...CALL_ROW, action_i18n: {} }, contact, "ar")).toBeNull();
  });
});

describe("quiet layout with call_row", () => {
  const ar = render(WITH_CALL, "ar");
  const en = render(WITH_CALL, "en");
  const quietAr = render(LIVE_PDP_POLICIES, "ar");

  it("appends exactly one call row after the list and changes nothing before it", () => {
    expect(count(ar, 'data-action-row="call"')).toBe(1);
    const at = ar.indexOf('<div data-action-row="call"');
    expect(at).toBeGreaterThan(0);
    // Everything up to the row is the frozen quiet markup minus its closing tag.
    expect(ar.slice(0, at)).toBe(quietAr.slice(0, quietAr.lastIndexOf("</section>")));
    expect(ar.endsWith("</div></section>")).toBe(true);
  });

  it("dials the store's call number and shows it", () => {
    expect(ar).toContain('href="tel:+9647779703832"');
    expect(ar).toContain("<bdi>0777 970 3832</bdi>");
    expect(ar).not.toContain("target=");
  });

  it("speaks the merchant's words, tagged for the editor", () => {
    expect(ar).toContain('<p data-i18n-field="call_row.prompt_i18n"');
    expect(ar).toContain(">تحب تحچي ويانا؟</p>");
    expect(ar).toContain('<span data-i18n-field="call_row.action_i18n">اتصل</span>');
    expect(en).toContain(">Rather talk to us?</p>");
    expect(en).toContain('<span data-i18n-field="call_row.action_i18n">Call</span>');
  });

  it("carries a call glyph and a 44px pill", () => {
    expect(ar).toMatch(/<span class="material-symbols-outlined[^"]*" aria-hidden="true">call<\/span>/);
    expect(count(ar, "min-h-11")).toBe(1);
  });

  it("flips visual order for Arabic with classes, never dir=rtl", () => {
    const row = ar.slice(ar.indexOf('<div data-action-row="call"'));
    expect(count(row, "flex-row-reverse")).toBe(2);
    expect(row).toContain("text-right");
    const enRow = en.slice(en.indexOf('<div data-action-row="call"'));
    expect(enRow).not.toContain("flex-row-reverse");
    expect(enRow).toContain("text-left");
    for (const html of [ar, en]) expect(html).not.toContain('dir="rtl"');
  });

  it("draws no row when the store has no usable call number", () => {
    expect(render(WITH_CALL, "ar", BARE_TENANT)).toBe(render(LIVE_PDP_POLICIES, "ar", BARE_TENANT));
    expect(render(WITH_CALL, "ar", withContact({ call_number: "12345" }))).toBe(quietAr);
  });

  it("is ignored by the cards layout", () => {
    for (const locale of ["ar", "en"] as const) {
      const cards = { ...LIVE_PDP_POLICIES, layout: "cards" as const };
      expect(render({ ...cards, call_row: CALL_ROW }, locale)).toBe(render(cards, locale));
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `CI=true pnpm exec vitest run packages/sections/src/accordion_richtext.call-row.test.tsx`
Expected: FAIL. `resolveCallRow` is not exported (`resolveCallRow is not a function`), and the schema strips `call_row`.

- [ ] **Step 3: Server file**

In `packages/sections/src/accordion_richtext.tsx`, apply exactly:

```diff
--- a/packages/sections/src/accordion_richtext.tsx
+++ b/packages/sections/src/accordion_richtext.tsx
@@ -11,23 +11,31 @@
 // Opt-in `layout: "quiet"` swaps the cards for a hairline list with
 // height-animated panels — a small client island in
 // `./accordion_richtext.client.tsx`. Unset (every existing config) keeps
-// the zero-JS cards render byte-identical.
+// the zero-JS cards render byte-identical. Opt-in `call_row` (quiet only)
+// ends the list with a tap-to-call row on the store's call number.
 // =====================================================================
 
 import { useId } from "react";
 import { z } from "zod";
-import { resolveI18n } from "@scheniders/shared";
 import {
+  formatIraqiPhoneDisplay,
+  parseStoreContact,
+  resolveI18n,
+} from "@scheniders/shared";
+import type { LocaleCode } from "@scheniders/shared";
+import {
   BentoCard,
   CenteredSectionHeader,
   MaterialIcon,
   Section,
 } from "./helpers/primitives";
+import { whatsappDigits } from "./helpers/whatsapp";
 import { i18nStringSchema, i18nStringOptional } from "./_schema";
 import { registerSection } from "./_registry";
 import type { SectionDefinition, SectionRenderContext } from "./_types";
 import { readsRtl } from "./pdp_express/text";
 import { AccordionRichtextQuiet } from "./accordion_richtext.client";
+import type { QuietCallRow } from "./accordion_richtext.client";
 
 const schema = z.object({
   heading_i18n: i18nStringOptional,
@@ -43,6 +51,23 @@
    * "quiet" = one hairline-ruled list with a single ink chevron and height-animated panels (client island). It is opt-in so the shared default stays byte-identical.
    */
   layout: z.enum(["cards", "quiet"]).optional().catch(undefined),
+  /**
+   * Quiet layout only: one tinted row after the list — the merchant's prompt
+   * over the store's call number, and a tap-to-call pill. The number is
+   * `commerce.contact.call_number`, read through `parseStoreContact` (the
+   * resolver behind the PDP "who contacts you" line and the thank-you call
+   * card), so the three can never disagree. No valid Iraqi mobile there, or
+   * an empty prompt or action → no row. Ignored by the cards layout. Unset
+   * (every existing config) renders exactly as before; a malformed value
+   * parses to undefined.
+   */
+  call_row: z
+    .object({
+      prompt_i18n: i18nStringSchema,
+      action_i18n: i18nStringSchema,
+    })
+    .optional()
+    .catch(undefined),
 });
 
 export type Props = z.infer<typeof schema>;
@@ -82,6 +107,26 @@
   "var(--bk-surface-alt, #fff7ed)",
 ] as const;
 
+/** The quiet layout's call row, resolved — or null when any part is
+ *  missing (no opt-in, no valid call number, an empty string). */
+export function resolveCallRow(
+  callRow: Props["call_row"],
+  contact: unknown,
+  locale: LocaleCode,
+): QuietCallRow | null {
+  if (!callRow) return null;
+  const prompt = resolveI18n(callRow.prompt_i18n, locale);
+  const action = resolveI18n(callRow.action_i18n, locale);
+  const dial = parseStoreContact(contact)?.call_number;
+  if (!prompt || !action || !dial) return null;
+  return {
+    prompt,
+    action,
+    number: formatIraqiPhoneDisplay(dial),
+    href: `tel:+${whatsappDigits(dial)}`,
+  };
+}
+
 function renderParagraphs(text: string): React.ReactNode {
   return text.split(/\n{2,}/).map((p, i) => (
     <p
@@ -123,6 +168,11 @@
         }))}
         exclusive={!props.allow_multiple}
         rtl={readsRtl(locale)}
+        call={resolveCallRow(
+          props.call_row,
+          ctx.tenant.store_config_v2?.commerce?.contact,
+          locale,
+        )}
       />
     );
   }
```

- [ ] **Step 4: Client island**

In `packages/sections/src/accordion_richtext.client.tsx`, apply exactly:

```diff
--- a/packages/sections/src/accordion_richtext.client.tsx
+++ b/packages/sections/src/accordion_richtext.client.tsx
@@ -7,18 +7,30 @@
 // that animate their height (grid rows 0fr → 1fr — native <details>
 // cannot). The server file resolves every i18n string, so this island
 // receives plain strings and booleans only and imports nothing from it.
-// The cards default stays server-only <details> with zero JS.
+// The cards default stays server-only <details> with zero JS. An optional
+// call row (resolved server-side) closes the list.
 // =====================================================================
 
 import { useId, useState } from "react";
 import { cn } from "@scheniders/shared";
 import { MaterialIcon, Section } from "./helpers/primitives";
+import { ActionPill, ActionRow } from "./helpers/action-row";
 
 export interface QuietItem {
   title: string;
   body: string;
 }
 
+/** The call row, resolved by the server file (`resolveCallRow`). */
+export interface QuietCallRow {
+  prompt: string;
+  action: string;
+  /** Display form, `0777 970 3832`. */
+  number: string;
+  /** `tel:+964…`. */
+  href: string;
+}
+
 /** Next open-set after tapping row `i`. Tapping an open row closes it;
  *  otherwise exclusive mode replaces the set, multi mode appends. Pure —
  *  never mutates `open`. */
@@ -42,11 +54,14 @@
   items,
   exclusive,
   rtl,
+  call,
 }: {
   heading: string;
   items: readonly QuietItem[];
   exclusive: boolean;
   rtl: boolean;
+  /** Null = no row (the default). */
+  call: QuietCallRow | null;
 }) {
   const [open, setOpen] = useState<readonly number[]>([]);
   const baseId = useId();
@@ -131,6 +146,32 @@
           );
         })}
       </div>
+      {call && (
+        <ActionRow
+          kind="call"
+          rtl={rtl}
+          action={
+            <ActionPill
+              href={call.href}
+              external={false}
+              rtl={rtl}
+              icon={<MaterialIcon name="call" className="shrink-0 text-lg" />}
+              label={call.action}
+              labelField="call_row.action_i18n"
+            />
+          }
+        >
+          <p
+            data-i18n-field="call_row.prompt_i18n"
+            className="font-bk-body text-sm font-bold leading-snug text-bk-ink text-balance"
+          >
+            {call.prompt}
+          </p>
+          <p className="font-bk-body text-xs tabular-nums text-bk-ink-soft">
+            <bdi>{call.number}</bdi>
+          </p>
+        </ActionRow>
+      )}
     </Section>
   );
 }
```

- [ ] **Step 5: Run the new test and every test that pins this section**

Run: `CI=true pnpm exec vitest run packages/sections/src/accordion_richtext.call-row.test.tsx packages/sections/src/accordion_richtext.test.tsx packages/sections/src/_pdp-lower-baseline-snapshot.test.tsx`
Expected: PASS: 14 + 24 + 10 tests. `accordion_richtext.test.tsx` is the frozen cards baseline. Never run it with `-u`.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add packages/sections/src/accordion_richtext.tsx packages/sections/src/accordion_richtext.client.tsx packages/sections/src/accordion_richtext.call-row.test.tsx
git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): opt-in call row under the quiet policy accordion" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Full verification gate (code)

**Files:** none changed.

- [ ] **Step 1: Whole sections suite**

Run: `CI=true pnpm exec vitest run packages/sections`
Expected: every file passes. That includes `_registry.test.ts`, `_render-smoke.test.tsx`, `_kurdish-coverage.test.ts` (unchanged: no chrome strings were added), `_no-hardcoded-white.test.tsx`, `accordion_richtext.test.tsx`, `faq-ledger.test.tsx` and the three new files.

- [ ] **Step 2: Type-check both consumers**

Run: `pnpm --filter @scheniders/storefront type-check && pnpm --filter @scheniders/platform type-check`
Expected: exit 0 for both.

- [ ] **Step 3: Lint**

Run: `pnpm lint` (the CI gate, through turbo).
Expected: 0 errors. Platform's ~1380 warnings are the known baseline. No new `eslint-disable`, `any`, `@ts-ignore` or non-null `!` in the touched files:
`git diff db80cfe8 -- packages/sections | grep -nE '^\+.*(eslint-disable|: any\b|as any|@ts-ignore|[A-Za-z_)\]]!\.)'` → no output.

- [ ] **Step 4: Hard-rule scan of the new markup code**

Run: `git diff <plan-commit> -- packages/sections/src ':!*.snap' | grep -nE '^\+.*(dir="rtl"|#[0-9a-fA-F]{3,6}\b|rgb\()'`
Expected: only the tests' own `not.toContain('dir="rtl"')` assertions. (Diffing from `db80cfe8` with snapshots included also catches the earlier PDP plans' frozen snapshots, whose default markup legitimately carries `var(--bk-…, #hex)` fallbacks.) No `dir="rtl"`, no hex or rgb literals: colours come only from `bk` utilities.

No commit in this task.

---

### Task 6: scheniders-iraq draft config (draft only; never published here)

There are no repo files and no migration: the change is a jsonb write to `tenants.store_config_v2_draft`, so the schema does not change.
- Run every statement with `supabase db query --linked` from `/Users/ali/scheniders-mono/packages`; the MCP is unreliable.
- If the CLI prints `failed SASL auth … cli_login_postgres (28P01)` retries, another session is logging in at the same moment. Re-run the same command once the other session's query finishes.
- Never touch `store_config_v2` (published) and never call the publish RPC.
- Every statement is guarded on `store_config_rev = 38`, as read on 2026-10-22. Draft writes never bump the rev; only publish does.

**Before Step 3, make sure no store-builder tab is open for scheniders-iraq.** Its autosave writes its whole in-memory config over the draft. Writing `updated_at = now()` also makes any older local crash backup stale.

**What gets written, and where each FAQ fact comes from.** All target sections are on draft `pages[2]` (`page_id: "product"`). The SQL looks them up by id and type, not by index.

1. Accordion `370f9b04-c300-4dbe-8ea9-b0f9b2d7f78d` (`accordion_richtext`, `layout: "quiet"`):
   - **Remove `items[4]` «خدمة العملاء».** It is the one item that only restates a trust-strip promise. Its title is the under-CTA chip «خدمة عملاء» word for word, plus the article (and exactly the label of the draft's `trust_badge_row`, which is disabled on the draft PDP). Its body («سولف ويانا ! احنا موجودين بأي وقت…من خلال الواتساب») states no policy fact, only "talk to us". The new call row and the FAQ's WhatsApp row now do that as actions. Its unconfirmed «بأي وقت وبكل وقت» (around the clock) claim goes with it.
   - **Kept:**
     - `items[0]` «سياسة الدفع عند الاستلام» shares the chip «الدفع عند الاستلام» but adds the try-before-you-pay and free-sample facts.
     - `items[3]` «عطور اصلية» echoes the chip «منتجات أصلية» but carries the sourcing facts.
     - `items[1]` and `items[2]` are not in the strip.
   - **Add `call_row`:** `{"prompt_i18n":{"ar":"تحب تحچي ويانا؟","en":"Rather talk to us?"},"action_i18n":{"ar":"اتصل","en":"Call"}}`. The number comes from the existing `commerce.contact.call_number` = `07779703832`.
2. FAQ `8354d117-ed8d-4a3e-9bea-8ed6fd8b1023` (`faq_contact_split`):
   - `compact: true`.
   - `items` replaced by the four COD worries (Arabic is Iraqi dialect; `enabled_locales` is `["ar","en"]`, so no `ku`):

| Q | Answer built only from | Not claimed (merchant gaps) |
|---|---|---|
| «العطور أصلية؟» | PDP accordion «عطور اصلية» (hand-picked from the finest global sources and materials; no bulk Turkish or low-grade Chinese perfumes); home `about_spotlight` («نجرّب كل عطر بأنفسنا قبل ما يوصلكم») | that bottles are the brand's sealed originals |
| «ريحة العطر نفس ريحة التيستر؟» | PDP accordion item 1 (test via the free glass sample before paying); item 3 (quality/specs/projection/longevity checked with the courier, any difference → may refuse; spec difference within a week → may return); home pillars («تشمّه بحضور المندوب قبل لا تدفع») | that the tester is filled from the same batch as the bottle |
| «إذا ما عجبني العطر وقت الاستلام؟» | item 1 (pay only after receiving and testing); item 3 (dislike the scent → return within a week); returns policy §3 (contact on WhatsApp within a week); home FAQ precedent («تفاصيل الشروط موجودة بصفحة سياسة الاسترجاع») | that refusing at the door for dislike alone is allowed and costs nothing; "full refund" (the returns page deducts the courier fee) |
| «شكد يطول التوصيل؟» | PDP accordion item 2 / FAQ («أغلب الطلبات توصل خلال ٢٤ ساعة من تثبيت الطلب»); shipping policy (far governorates up to 3 working days; free delivery to all governorates); `commerce.shipping.default_rate.fee_iqd = 0` | — |

   - `contact` title, sub and CTA replaced with the merchant's own words from the home, faq and contact FAQ cards: «عندك استفسار؟» / «نورونا على الواتساب وسولفوا ويانا». The CTA becomes «واتساب», short enough for the pill at 390px. This also drops the MSA copy with its «إدا» typo. `icon_url` and `whatsapp_number` are kept.
   - `eyebrow_i18n`, `sub_i18n`, `row_icon_url` and `title_i18n` are untouched. Compact does not draw the first three.

- [ ] **Step 1: Save the pre-image (gitignored `tmp/`)**

```bash
cd /Users/ali/scheniders-mono/packages && mkdir -p ../tmp && supabase db query --linked -o json "select store_config_rev, updated_at, store_config_v2_draft -> 'pages' -> 2 as product_page from public.tenants where slug = 'scheniders-iraq'" > ../tmp/pdp-lower-faq-preimage.json
grep -c '"store_config_rev": 38' ../tmp/pdp-lower-faq-preimage.json
```
Expected: `1`. If the rev is not 38, STOP. Re-read the two sections and re-derive this task, because someone published or the draft moved.

- [ ] **Step 2: Dry run (read-only)**

Save as `tmp/pdp-lower-faq-dry.sql` and run `supabase db query --linked -f ../tmp/pdp-lower-faq-dry.sql`:

```sql
with x as (
  select t.id,
         (p.ordinality - 1)::text as pg,
         max(case when s.value ->> 'id' = '370f9b04-c300-4dbe-8ea9-b0f9b2d7f78d'
                   and s.value ->> 'type' = 'accordion_richtext'
                  then (s.ordinality - 1)::text end) as acc,
         max(case when s.value ->> 'id' = '8354d117-ed8d-4a3e-9bea-8ed6fd8b1023'
                   and s.value ->> 'type' = 'faq_contact_split'
                  then (s.ordinality - 1)::text end) as faq
  from public.tenants t,
       jsonb_array_elements(t.store_config_v2_draft -> 'pages') with ordinality p,
       jsonb_array_elements(p.value -> 'sections') with ordinality s
  where t.slug = 'scheniders-iraq'
    and p.value ->> 'page_id' = 'product'
  group by t.id, p.ordinality
),
n as (
  select x.*, t.store_config_v2_draft as old, jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(
         t.store_config_v2_draft,
         array['pages', x.pg, 'sections', x.acc, 'base', 'items'],
         (t.store_config_v2_draft #> array['pages', x.pg, 'sections', x.acc, 'base', 'items']) - 4),
       array['pages', x.pg, 'sections', x.acc, 'base', 'call_row'],
       '{"prompt_i18n": {"ar": "تحب تحچي ويانا؟", "en": "Rather talk to us?"}, "action_i18n": {"ar": "اتصل", "en": "Call"}}'::jsonb, true),
     array['pages', x.pg, 'sections', x.faq, 'base', 'items'],
     '[{"q_i18n": {"ar": "العطور أصلية؟", "en": "Are your perfumes original?"}, "a_i18n": {"ar": "كل عطورنا مختارة يدوياً من أفخم المصادر العالمية ومن أجود الخامات العطرية، ونجرّب كل عطر بأنفسنا قبل ما يوصلك. وما نتعامل بالعطور التركية المصنّعة بالجملة ولا بالعطور الصينية الرديئة.", "en": "Every perfume is hand-picked from premium global sources and the finest aromatic materials, and we try each one ourselves before it reaches you. We don''t deal in bulk-made Turkish perfumes or low-grade Chinese ones."}}, {"q_i18n": {"ar": "ريحة العطر نفس ريحة التيستر؟", "en": "Will the bottle smell like the tester?"}, "a_i18n": {"ar": "تجرّب العطر بالتيستر الزجاجي المجاني اللي يجي ويا طلبك، بحضور المندوب وقبل لا تدفع. وإذا لگيت أي اختلاف بالجودة أو المواصفات أو الفوحان أو الثبات، يحقلك ترفض العطر. وإذا اكتشفت فرق بالمواصفات بعد الاستلام، تگدر ترجّعه خلال أسبوع.", "en": "You try the perfume with the free glass tester that comes with your order, with the courier there and before you pay. If anything differs (quality, specs, projection or longevity) you can refuse it. If you find a difference in the specs after delivery, you can return it within a week."}}, {"q_i18n": {"ar": "إذا ما عجبني العطر وقت الاستلام؟", "en": "What if I don''t like it when it arrives?"}, "a_i18n": {"ar": "ما تدفع إلا بعد ما تستلم العطر وتجرّبه بالتيستر. وإذا استلمته وما عجبتك التجربة العطرية، يحقلك ترجّعه خلال أسبوع من الاستلام: راسلنا على الواتساب ونرتّب الاسترجاع، وتفاصيل الشروط موجودة بصفحة سياسة الاسترجاع.", "en": "You only pay after you receive the perfume and try it with the tester. If you keep it and don''t like the scent, you can return it within a week of delivery: message us on WhatsApp and we''ll arrange the return. The conditions are on the returns policy page."}}, {"q_i18n": {"ar": "شكد يطول التوصيل؟", "en": "How long does delivery take?"}, "a_i18n": {"ar": "أغلب الطلبات توصل خلال ٢٤ ساعة من تثبيت الطلب، والمحافظات البعيدة ممكن توصل لحد ٣ أيام عمل. والتوصيل مجاني لكل المحافظات.", "en": "Most orders arrive within 24 hours of confirmation; far governorates can take up to 3 working days. Delivery is free to every governorate."}}]'::jsonb),
   array['pages', x.pg, 'sections', x.faq, 'base', 'contact'],
   (t.store_config_v2_draft #> array['pages', x.pg, 'sections', x.faq, 'base', 'contact'])
     || '{"title_i18n": {"ar": "عندك استفسار؟", "en": "Any questions?"}, "sub_i18n": {"ar": "نورونا على الواتساب وسولفوا ويانا", "en": "Message us on WhatsApp, we''re happy to chat."}, "cta_label_i18n": {"ar": "واتساب", "en": "WhatsApp"}}'::jsonb),
 array['pages', x.pg, 'sections', x.faq, 'base', 'compact'],
 'true'::jsonb, true) as new
  from public.tenants t join x on x.id = t.id
  where t.store_config_rev = 38
  and x.acc is not null and x.faq is not null
  and jsonb_array_length(t.store_config_v2_draft #> array['pages', x.pg, 'sections', x.acc, 'base', 'items']) = 5
  and t.store_config_v2_draft #>> array['pages', x.pg, 'sections', x.acc, 'base', 'items', '4', 'title_i18n', 'ar'] = 'خدمة العملاء'
  and not (t.store_config_v2_draft #> array['pages', x.pg, 'sections', x.faq, 'base'] ? 'compact')
  and not (t.store_config_v2_draft #> array['pages', x.pg, 'sections', x.acc, 'base'] ? 'call_row')
)
select count(*) as matched,
       min(pg) as pg, min(acc) as acc, min(faq) as faq,
       bool_and(old - 'pages' = new - 'pages') as rest_unchanged,
       bool_and((old -> 'pages') - pg::int = (new -> 'pages') - pg::int) as other_pages_unchanged,
       -- drop the higher index first so the lower one does not shift
       bool_and(((old #> array['pages', pg, 'sections']) - greatest(acc::int, faq::int)) - least(acc::int, faq::int)
              = ((new #> array['pages', pg, 'sections']) - greatest(acc::int, faq::int)) - least(acc::int, faq::int)) as other_sections_unchanged,
       bool_and((old #> array['pages', pg, 'sections', acc, 'base']) - 'items'
              = (new #> array['pages', pg, 'sections', acc, 'base']) - 'items' - 'call_row') as acc_rest_unchanged,
       bool_and((old #> array['pages', pg, 'sections', acc, 'base', 'items']) - 4
              = (new #> array['pages', pg, 'sections', acc, 'base', 'items'])) as acc_items_only_lost_index_4,
       bool_and((old #> array['pages', pg, 'sections', faq, 'base']) - 'items' - 'contact'
              = (new #> array['pages', pg, 'sections', faq, 'base']) - 'items' - 'contact' - 'compact') as faq_rest_unchanged,
       bool_and((old #> array['pages', pg, 'sections', faq, 'base', 'contact']) - 'title_i18n' - 'sub_i18n' - 'cta_label_i18n'
              = (new #> array['pages', pg, 'sections', faq, 'base', 'contact']) - 'title_i18n' - 'sub_i18n' - 'cta_label_i18n') as faq_contact_rest_unchanged,
       min(jsonb_array_length(new #> array['pages', pg, 'sections', faq, 'base', 'items'])) as faq_items,
       min(jsonb_array_length(new #> array['pages', pg, 'sections', acc, 'base', 'items'])) as acc_items
from n;
```

Expected (verified 2026-10-22): one row with `matched = 1`, `pg = "2"`, `acc = "1"`, `faq = "5"`, `acc_items = 4`, `faq_items = 4`, and every boolean `true`: `rest_unchanged`, `other_pages_unchanged`, `other_sections_unchanged`, `acc_rest_unchanged`, `acc_items_only_lost_index_4`, `faq_rest_unchanged`, `faq_contact_rest_unchanged`. Any `false` or `matched = 0` → STOP.

- [ ] **Step 3: Write the draft (one guarded statement)**

A single `UPDATE` is atomic on its own. Do not wrap it in `begin`/`commit`: the CLI would then print the result of `commit` instead of the `returning` row. The other PDP-lower plans (`-related`, `-reviews`, `-scent`) write other sections of the same draft. Each `jsonb_set` here reads the row as it is at write time and touches only these two sections, so the order between plans does not matter.

Save as `tmp/pdp-lower-faq-write.sql` and run `supabase db query --linked -f ../tmp/pdp-lower-faq-write.sql`:

```sql
with x as (
  select t.id,
         (p.ordinality - 1)::text as pg,
         max(case when s.value ->> 'id' = '370f9b04-c300-4dbe-8ea9-b0f9b2d7f78d'
                   and s.value ->> 'type' = 'accordion_richtext'
                  then (s.ordinality - 1)::text end) as acc,
         max(case when s.value ->> 'id' = '8354d117-ed8d-4a3e-9bea-8ed6fd8b1023'
                   and s.value ->> 'type' = 'faq_contact_split'
                  then (s.ordinality - 1)::text end) as faq
  from public.tenants t,
       jsonb_array_elements(t.store_config_v2_draft -> 'pages') with ordinality p,
       jsonb_array_elements(p.value -> 'sections') with ordinality s
  where t.slug = 'scheniders-iraq'
    and p.value ->> 'page_id' = 'product'
  group by t.id, p.ordinality
)
update public.tenants t
set store_config_v2_draft = jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(
         t.store_config_v2_draft,
         array['pages', x.pg, 'sections', x.acc, 'base', 'items'],
         (t.store_config_v2_draft #> array['pages', x.pg, 'sections', x.acc, 'base', 'items']) - 4),
       array['pages', x.pg, 'sections', x.acc, 'base', 'call_row'],
       '{"prompt_i18n": {"ar": "تحب تحچي ويانا؟", "en": "Rather talk to us?"}, "action_i18n": {"ar": "اتصل", "en": "Call"}}'::jsonb, true),
     array['pages', x.pg, 'sections', x.faq, 'base', 'items'],
     '[{"q_i18n": {"ar": "العطور أصلية؟", "en": "Are your perfumes original?"}, "a_i18n": {"ar": "كل عطورنا مختارة يدوياً من أفخم المصادر العالمية ومن أجود الخامات العطرية، ونجرّب كل عطر بأنفسنا قبل ما يوصلك. وما نتعامل بالعطور التركية المصنّعة بالجملة ولا بالعطور الصينية الرديئة.", "en": "Every perfume is hand-picked from premium global sources and the finest aromatic materials, and we try each one ourselves before it reaches you. We don''t deal in bulk-made Turkish perfumes or low-grade Chinese ones."}}, {"q_i18n": {"ar": "ريحة العطر نفس ريحة التيستر؟", "en": "Will the bottle smell like the tester?"}, "a_i18n": {"ar": "تجرّب العطر بالتيستر الزجاجي المجاني اللي يجي ويا طلبك، بحضور المندوب وقبل لا تدفع. وإذا لگيت أي اختلاف بالجودة أو المواصفات أو الفوحان أو الثبات، يحقلك ترفض العطر. وإذا اكتشفت فرق بالمواصفات بعد الاستلام، تگدر ترجّعه خلال أسبوع.", "en": "You try the perfume with the free glass tester that comes with your order, with the courier there and before you pay. If anything differs (quality, specs, projection or longevity) you can refuse it. If you find a difference in the specs after delivery, you can return it within a week."}}, {"q_i18n": {"ar": "إذا ما عجبني العطر وقت الاستلام؟", "en": "What if I don''t like it when it arrives?"}, "a_i18n": {"ar": "ما تدفع إلا بعد ما تستلم العطر وتجرّبه بالتيستر. وإذا استلمته وما عجبتك التجربة العطرية، يحقلك ترجّعه خلال أسبوع من الاستلام: راسلنا على الواتساب ونرتّب الاسترجاع، وتفاصيل الشروط موجودة بصفحة سياسة الاسترجاع.", "en": "You only pay after you receive the perfume and try it with the tester. If you keep it and don''t like the scent, you can return it within a week of delivery: message us on WhatsApp and we''ll arrange the return. The conditions are on the returns policy page."}}, {"q_i18n": {"ar": "شكد يطول التوصيل؟", "en": "How long does delivery take?"}, "a_i18n": {"ar": "أغلب الطلبات توصل خلال ٢٤ ساعة من تثبيت الطلب، والمحافظات البعيدة ممكن توصل لحد ٣ أيام عمل. والتوصيل مجاني لكل المحافظات.", "en": "Most orders arrive within 24 hours of confirmation; far governorates can take up to 3 working days. Delivery is free to every governorate."}}]'::jsonb),
   array['pages', x.pg, 'sections', x.faq, 'base', 'contact'],
   (t.store_config_v2_draft #> array['pages', x.pg, 'sections', x.faq, 'base', 'contact'])
     || '{"title_i18n": {"ar": "عندك استفسار؟", "en": "Any questions?"}, "sub_i18n": {"ar": "نورونا على الواتساب وسولفوا ويانا", "en": "Message us on WhatsApp, we''re happy to chat."}, "cta_label_i18n": {"ar": "واتساب", "en": "WhatsApp"}}'::jsonb),
 array['pages', x.pg, 'sections', x.faq, 'base', 'compact'],
 'true'::jsonb, true),
    updated_at = now()
from x
where t.id = x.id
  and t.store_config_rev = 38
  and x.acc is not null and x.faq is not null
  and jsonb_array_length(t.store_config_v2_draft #> array['pages', x.pg, 'sections', x.acc, 'base', 'items']) = 5
  and t.store_config_v2_draft #>> array['pages', x.pg, 'sections', x.acc, 'base', 'items', '4', 'title_i18n', 'ar'] = 'خدمة العملاء'
  and not (t.store_config_v2_draft #> array['pages', x.pg, 'sections', x.faq, 'base'] ? 'compact')
  and not (t.store_config_v2_draft #> array['pages', x.pg, 'sections', x.acc, 'base'] ? 'call_row')
returning t.id, t.store_config_rev, t.updated_at,
          jsonb_array_length(t.store_config_v2_draft #> array['pages', x.pg, 'sections', x.acc, 'base', 'items']) as acc_items,
          t.store_config_v2_draft #> array['pages', x.pg, 'sections', x.acc, 'base', 'call_row'] as call_row,
          jsonb_array_length(t.store_config_v2_draft #> array['pages', x.pg, 'sections', x.faq, 'base', 'items']) as faq_items,
          t.store_config_v2_draft #> array['pages', x.pg, 'sections', x.faq, 'base', 'compact'] as compact;
```

Expected: one returned row: `store_config_rev = 38`, `acc_items = 4`, `call_row` = the object above, `faq_items = 4`, `compact = true`. Zero rows means a guard failed and nothing was written. The guards are: rev, item count, item 4's title, and `compact`/`call_row` not already present. Re-run Step 2 to see which.

- [ ] **Step 4: Verify that the published config is untouched**

```sql
select t.store_config_rev,
       (select count(*) from jsonb_array_elements(t.store_config_v2 -> 'pages') p,
               jsonb_array_elements(p.value -> 'sections') s
         where s.value -> 'base' ? 'compact' or s.value -> 'base' ? 'call_row') as published_with_new_keys,
       (select jsonb_array_length(s.value -> 'base' -> 'items')
          from jsonb_array_elements(t.store_config_v2 -> 'pages') p,
               jsonb_array_elements(p.value -> 'sections') s
         where s.value ->> 'id' = '370f9b04-c300-4dbe-8ea9-b0f9b2d7f78d') as published_acc_items
from public.tenants t where t.slug = 'scheniders-iraq';
```
Expected: `store_config_rev = 38`, `published_with_new_keys = 0`, and `published_acc_items` the same as before this task: whatever the published config held, untouched.

- [ ] **Step 5: Revert recipe (keep; run only if the merchant rejects the change; same single-statement rule)**

This restores the exact pre-image of the touched paths. It was verified on 2026-10-22 as a write-then-revert round trip that reproduces the current draft (`round_trip_identical = true`).

```sql
with x as (
  select t.id,
         (p.ordinality - 1)::text as pg,
         max(case when s.value ->> 'id' = '370f9b04-c300-4dbe-8ea9-b0f9b2d7f78d'
                   and s.value ->> 'type' = 'accordion_richtext'
                  then (s.ordinality - 1)::text end) as acc,
         max(case when s.value ->> 'id' = '8354d117-ed8d-4a3e-9bea-8ed6fd8b1023'
                   and s.value ->> 'type' = 'faq_contact_split'
                  then (s.ordinality - 1)::text end) as faq
  from public.tenants t,
       jsonb_array_elements(t.store_config_v2_draft -> 'pages') with ordinality p,
       jsonb_array_elements(p.value -> 'sections') with ordinality s
  where t.slug = 'scheniders-iraq'
    and p.value ->> 'page_id' = 'product'
  group by t.id, p.ordinality
)
update public.tenants t
set store_config_v2_draft =
  jsonb_set(jsonb_set(jsonb_set(jsonb_set(
         t.store_config_v2_draft,
         array['pages', x.pg, 'sections', x.acc, 'base'],
         ((t.store_config_v2_draft #> array['pages', x.pg, 'sections', x.acc, 'base']) - 'call_row')
           || jsonb_build_object('items',
                (t.store_config_v2_draft #> array['pages', x.pg, 'sections', x.acc, 'base', 'items'])
                || '[{"body_i18n": {"ar": "سولف ويانا ! احنا موجودين بأي وقت وبكل وقت حتى نجاوب بكل حب ع اسئلتكم واستفساراتكم من خلال الواتساب", "en": "Talk to us! We are available around the clock to answer your questions with love, over WhatsApp."}, "title_i18n": {"ar": "خدمة العملاء", "en": "Customer care"}}]'::jsonb)),
       array['pages', x.pg, 'sections', x.faq, 'base'],
       (t.store_config_v2_draft #> array['pages', x.pg, 'sections', x.faq, 'base']) - 'compact'),
     array['pages', x.pg, 'sections', x.faq, 'base', 'items'],
     '[{"a_i18n": {"ar": "يتم الدفع حصراً بعد استلام العطر واختباره من خلال زجاجة الاختبار المرفقة مجاناً مع كل عطر", "en": "Payment happens only after you receive the perfume and try it via the free tester bottle included with every order."}, "q_i18n": {"ar": "الدفع عند الاستلام", "en": "Cash on delivery"}}, {"a_i18n": {"ar": "أغلب الطلبات توصل خلال ٢٤ ساعة من تثبيت الطلب", "en": "Most orders arrive within 24 hours of confirmation."}, "q_i18n": {"ar": "شكد يطول الشحن؟", "en": "How long does delivery take?"}}]'::jsonb),
   array['pages', x.pg, 'sections', x.faq, 'base', 'contact'],
   (t.store_config_v2_draft #> array['pages', x.pg, 'sections', x.faq, 'base', 'contact'])
     || '{"title_i18n": {"ar": "لديك أسئلة أخرى؟", "en": "More questions?"}, "sub_i18n": {"ar": "إدا مازلت تريد معلومات إضافية، يمكنك دائما الاتصال بنا.", "en": "If you still need more information, you can always reach us."}, "cta_label_i18n": {"ar": "تواصل معنا", "en": "Contact us"}}'::jsonb),
    updated_at = now()
from x
where t.id = x.id
  and x.acc is not null and x.faq is not null
  and jsonb_array_length(t.store_config_v2_draft #> array['pages', x.pg, 'sections', x.acc, 'base', 'items']) = 4
  and (t.store_config_v2_draft #> array['pages', x.pg, 'sections', x.acc, 'base']) ? 'call_row'
returning t.id,
          jsonb_array_length(t.store_config_v2_draft #> array['pages', x.pg, 'sections', x.acc, 'base', 'items']) as acc_items,
          jsonb_array_length(t.store_config_v2_draft #> array['pages', x.pg, 'sections', x.faq, 'base', 'items']) as faq_items;
```

No commit in this task. Delete `tmp/pdp-lower-faq-*.sql` when done, and keep `tmp/pdp-lower-faq-preimage.json` until the merchant signs off.

---

### Task 7: See it at 390px on the draft

**Files:** none changed.

- [ ] **Step 1: Open the draft view**

The storefront dev server on :3001 runs from this tree. Do not restart it.

Open `http://localhost:3001/api/draft-view?tenant=scheniders-iraq&token=dev-preview-token&to=/s/scheniders-iraq/products/north-stag-1` at a 390×844 viewport. The route sets the `sb_draft_view` cookie, and the page then renders `store_config_v2_draft`.

- [ ] **Step 2: Check**

- Under «عن العطر» there is the 4-row hairline policy list. The last row is gone, and the call row follows: «تحب تحچي ويانا؟» over «0777 970 3832», with a «اتصل» pill. The pill is 44px tall and its `href` is `tel:+9647779703832`.
- Further down, the FAQ shows «الأسئلة الأكثر شيوعا» start-aligned, then the four closed questions (56px rows). Tapping one opens it and closes any other. Then the «عندك استفسار؟ / واتساب» row, linking to `https://wa.me/9647779703832`.
- `document.documentElement.scrollWidth === 390`: no horizontal scroll.
- With `prefers-reduced-motion: reduce`, the chevrons snap instead of rotating.
- The published page (a private window with no cookie) still shows the old cards FAQ and 5 policy items.
- If the Playwright MCP is wedged, check the server markup instead: `curl -s -b 'sb_draft_view=…' … | grep -o 'data-action-row="[a-z]*"'` should print `call` and `whatsapp` once each.

- [ ] **Step 3: Handoff**

Publishing waits for merchant sign-off on the gaps below. List them for the merchant together with the draft link.

---

## Merchant gaps (facts the FAQ needed but the store never states)

1. **Refusing at the door.** Can a buyer refuse at the door just because they don't like the scent, and does that cost anything? The store only says "any *difference* in quality, specs, projection or longevity" allows refusal. The answer therefore says only "you pay after trying" and "return within a week".
2. **"Full refund" contradicts itself.** The PDP accordion and the about page say the full value is returned. The returns policy deducts the courier fee and says the customer bears return shipping. The FAQ avoids «كاملة» until the merchant settles this.
3. **What "original" means.** No page says whether bottles are the named brand's sealed originals (e.g. Paris Corner, North Stag). The answer uses only the sourcing claims.
4. **The tester is the same perfume.** No page says the free tester is filled from the same perfume and batch as the bottle. The answer says you *try the perfume with* the tester, which is the store's wording.
5. **Processing time against the 24h claim.** The shipping page says orders are processed within two working days after confirmation, while every other surface says most orders arrive within 24 hours. The FAQ keeps the 24h claim used everywhere else, plus the policy's own "up to 3 working days for far governorates".
6. **Returning testers.** The returns policy says sample perfumes are not returnable, while the accordion lets buyers use the perfume for a week and return it. It is unclear whether a used tester must come back with the bottle.
7. **"Around the clock" support.** The removed accordion item claimed support «بأي وقت وبكل وقت». No call hours are configured (`commerce.contact.call_hours` is absent). If the merchant wants hours shown, set them and the PDP contact line picks them up.
