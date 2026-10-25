# PDP order safety net — P5: thank you call card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox () syntax for tracking.

**Spec:** docs/superpowers/specs/2026-10-21-pdp-order-safety-net-design.md · **Index:** docs/superpowers/plans/2026-10-21-safety-net-index.md

---

## P5 — Thank-you call card on `order_confirmation`

**Goal:** When a store turns on the new `show_call_card` prop, the top of the `checkout_success` page becomes a brief for the confirmation call. It shows:
- a greeting with the buyer's first name, and the order number
- «رسالة واتساب وصلتك هسه — اضغط تأكيد», but only once the platform has logged that confirmation as sent for this order
- the store's call number, with copy and a one-tap «احفظه بجهات الاتصال» (vCard)
- when the store has set P4's structured `commerce.contact`, P4's "who contacts you" line (with the today / tomorrow variants when call hours are set), computed from the order moment
- the buyer's phone, masked, with «الرقم غلط؟ راسلنا»
- «أضف رقم ثاني», which writes `orders.secondary_phone` through a tenant-scoped endpoint authorised by the checkout's signed per-order proof

Upsell, referral and new arrivals stay on the page, below the card. The same piece adds Kurdish to every new chrome string, backfills Kurdish into `EXPRESS_STRINGS`, and brings `pdp_express/strings.ts` under the Kurdish coverage test.

**Architecture (decisions made here and why):**
- **Auth reuses main's proof as is.** The endpoint reads `x-upsell-proof`, the token minted in `apps/storefront/lib/order-upsell-proof.ts`. It is HMAC-signed with the tenant and order inside, lasts 60 minutes (`UPSELL_WINDOW_MS`), and is held only in the buyer's `schn:last-order` stash. `/api/referral/code` already reuses the same proof for a second purpose. The tenant always comes from the proof and never from the request. The order id alone proves nothing.
- **The stash stays the same.** The phone is never put in sessionStorage. The masked phone, `has_backup`, `can_add_backup` and `whatsapp_sent` come from `GET /api/checkout/orders/[id]/contact`. Only the proof holder gets an answer, and the phone only ever comes back masked.
- **"WhatsApp sent" is evidence, not a promise.** It is true only when `whatsapp_logs` has `order_uuid = order.id`, the tenant from the proof, `direction='outbound'`, `template_name='cod_order_confirm'` and `status='sent'`. That is the row `apps/platform/lib/whatsapp-dispatcher.ts:89-109` writes, and the live values were checked by SQL: templateType `confirmation`, template `cod_order_confirm`, status `sent`.
  - Without piece 1 there is no such row, so the line never shows. This is the strict reading of "only when step 1 is enabled for the tenant". It also hides the line when `whatsapp_auto_send` is off, for test orders, and when Interakt failed.
  - The card asks again after 4 s and 10 s, because QStash dispatch is asynchronous (median 2.9 s on LF).
- **Status rule for adding a backup.** A backup is accepted while the order is `new` or `contacted`, within the proof window. The dispatcher moves `new` to `contacted` the moment it sends (`whatsapp-dispatcher.ts:155-171`), so `contacted` must stay allowed. The write is optimistic on `version` (the BEFORE UPDATE trigger bumps it), like the upsell route.
- **Call number and contact line (reuses P4, which is built before P5).** The spec says P4's line is "reused on the thank-you card", and P4's plan hands that reuse to this piece. So:
  - The number is `parseStoreContact(commerce.contact)?.call_number` (P4, `@scheniders/shared`), the same number the PDP line names. Without a usable `commerce.contact` it falls back to `resolveTrackerContact` (`packages/sections/src/helpers/whatsapp.ts`, at lines 122-127 on main; P4.3 changed it and moved the lines, so find it with `grep -n "export function resolveTrackerContact"`). After P4.3 that resolver itself prefers `commerce.contact.call_number`, then `store_config.contact.phone_number`, then the WhatsApp number. So the card, the order tracker and the PDP line always name the same number. The explicit `parseStoreContact` call is kept because the card needs the parsed contact for `<ContactLine>` anyway.
  - Under the number, the card renders P4's `<ContactLine>` (`packages/sections/src/helpers/contact-line.tsx`) with `initialNow = ctx.runtime.now`, so the today / tomorrow variant is computed from the moment the order landed. It is passed the store's contact with `whatsapp_confirm: false`, so the line uses its call-only lead: on this card the WhatsApp is reported from the send log, never promised.
  - The section reads `commerce` the way P4's PDP does: `ctx.tenant.store_config_v2.commerce`, which `toSectionTenant` already forwards. No new tenant field.
- **Back-compat.** The new props are optional with `.catch(undefined)` and are **not** added to `defaultProps`.
  - Store templates embed `defaultProps` (see `signature-parity.test.ts.snap`). Adding keys there would make every seeded store's `order_confirmation` show as "customised" in the template-updates screen.
  - The default copy lives in the call card's `STRINGS`.
  - The default markup is pinned by a snapshot in Task P5.1 before anything changes.
- **No migration.** P5 writes only the existing `orders.secondary_phone` (nullable text, verified) and reads the existing `whatsapp_logs`. RLS is unchanged: the server uses the service role, scoped by `tenant_id` from the proof on every query.

**Constraints honoured:**
- `/api/checkout/orders` body unchanged. P5 adds nothing to the response beyond what P2 already shipped (`retryable`, `duplicate`). `create_order_atomic` and P2's `create_storefront_order` wrapper are both untouched.
- LF untouched; the dispatcher is read only, never modified.
- No new secret.
- LTR document: only element-level `dir="ltr"` on phone digits, as `track_order_lookup` and the referral code already do.
- Tokens only (`--bk-*`); ar/en/ku for every new string.

**Preconditions (check before Task P5.1):**
- [ ] The merge of origin/main is committed: `git -C /Users/ali/scheniders-mono status --porcelain | grep -E '^(UU|AA|DU|UD) '` prints nothing, and `git -C /Users/ali/scheniders-mono branch --show-current` prints `feat/pdp-entry-atelier`.
- [ ] P4 is committed (Task P5.6 imports its exports): `grep -n "export function ContactLine" /Users/ali/scheniders-mono/packages/sections/src/helpers/contact-line.tsx && grep -n "export function parseStoreContact" /Users/ali/scheniders-mono/packages/shared/src/contact-line.ts && grep -n "contact?: StoreContactConfig" /Users/ali/scheniders-mono/packages/shared/src/types/store-config-v2.ts` prints three lines. If any is missing, stop: P5 is built after P4.
- [ ] P1, P2 and P3 are committed too (build order P1 → P2 → P3 → P4 → P5). P1 writes the `whatsapp_logs` row that the WhatsApp line reads, and P2 rewrites the `schn:last-order` stash write (it still carries `order_id`, `upsell_token` and `customer_name`). Each of these must print a count of 1 or more: `grep -c queueOrderConfirmation apps/storefront/app/actions/checkout.ts`, `grep -c '"schn:last-order"' packages/sections/src/pdp_direct_order.client.tsx`, `grep -c 'upsell_token: data?.upsellToken' packages/sections/src/pdp_direct_order.client.tsx`, `grep -c consent_at packages/supabase/src/database.types.ts`.
- [ ] Before **every** commit below, run `git -C /Users/ali/scheniders-mono branch --show-current` and confirm it is `feat/pdp-entry-atelier`. Another session switches branches mid-run (memory: concurrent branch switching).
- [ ] Every test command below starts with `export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; cd /Users/ali/scheniders-mono;`

---

### Task P5.1: Pin the default `order_confirmation` markup and extract its shared styles

**Files:**
- Create: `packages/sections/src/_order-confirmation-baseline-snapshot.test.tsx`
- Create: `packages/sections/src/order_confirmation.styles.ts`
- Modify: `packages/sections/src/order_confirmation.client.tsx`. Imports at lines 30-39; the `/* ─── Styles ─── */` block at lines 121-133 is removed.
- Generated: `packages/sections/src/__snapshots__/_order-confirmation-baseline-snapshot.test.tsx.snap`

This is a characterization test. It must pass against current code, and every later P5 task must keep it green.

- [ ] **Step 1: Write the baseline snapshot test**

```tsx
// =====================================================================
// P5 T0 — order_confirmation default markup, frozen
// =====================================================================
// The thank-you call card is opt-in (`show_call_card`). Every store that
// has not turned it on must render byte-identical markup through P5, so
// these server-markup snapshots pin the section as it is on main. A diff
// here is a back-compat break, not a snapshot to refresh.
// =====================================================================

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import order_confirmation from "./order_confirmation";

const runtime = {
  page_id: "checkout_success" as const,
  breakpoint: "mobile" as const,
  locale: "ar" as const,
  audience_segments: [],
  ab_test_arms: {},
  now: new Date("2026-10-21T00:00:00Z"),
};

const tenant = {
  id: "tenant-1",
  business_name: "متجر",
  store_config: {
    contact: { whatsapp_number: "07701234567", phone_number: "07779703832" },
  },
};

function render(
  locale: "ar" | "en" | "ku",
  orderNumber: string | undefined,
  props: Partial<typeof order_confirmation.defaultProps> = {},
): string {
  return renderToStaticMarkup(
    React.createElement(
      StoreBaseProvider,
      { base: "/s/acme", children: null },
      React.createElement(order_confirmation.render, {
        props: { ...order_confirmation.defaultProps, ...props },
        ctx: {
          tenant: tenant as never,
          runtime: {
            ...runtime,
            locale,
            ...(orderNumber ? { order_number: orderNumber } : {}),
          },
          products: [],
          categories: [],
        },
      }),
    ),
  );
}

describe("order_confirmation default markup (frozen)", () => {
  it.each([
    ["ar", "SH-0001"],
    ["en", "SH-0001"],
    ["ku", "SH-0001"],
    ["ar", undefined],
  ] as const)("%s, order %s", (locale, order) => {
    expect(render(locale, order)).toMatchSnapshot();
  });

  it("with a merchant-authored ETA", () => {
    expect(
      render("ar", "SH-0001", {
        eta_i18n: { ar: "خلال ٢٤ ساعة من تثبيت الطلب", en: "Within 24 hours" },
      }),
    ).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Record the baseline against the current code**

Run: `CI=true pnpm exec vitest run packages/sections/src/_order-confirmation-baseline-snapshot.test.tsx -u`
Expected: `5 passed`, and the snapshot file `packages/sections/src/__snapshots__/_order-confirmation-baseline-snapshot.test.tsx.snap` is written.

Run it again without `-u`: `CI=true pnpm exec vitest run packages/sections/src/_order-confirmation-baseline-snapshot.test.tsx`
Expected: `5 passed`.

- [ ] **Step 3: Create the shared styles module**

`packages/sections/src/order_confirmation.styles.ts`:

```ts
// =====================================================================
// order_confirmation — surface tokens shared with its call card
// =====================================================================
// One definition for the thank-you section and the opt-in call card that
// replaces its head card, so the two can never drift apart. Everything is
// a --bk-* token with the Candy fallback the section has always used.
// =====================================================================

export const INK_BORDER =
  "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)";

export const CARD_STYLE = {
  backgroundColor: "var(--bk-surface-alt, #f7f4ee)",
  borderRadius: "var(--bk-radius-card, 1rem)",
  color: "var(--bk-ink, #1a1a1a)",
} as const;

export const LABEL_CLS =
  "font-label font-bold text-[11px] bk-caps tracking-[0.2em] text-bk-ink-soft";
```

- [ ] **Step 4: Point the section at it**

In `packages/sections/src/order_confirmation.client.tsx`:

(a) Delete lines 121-133 exactly. These are the `/* ─── Styles ─── */` comment, `const INK_BORDER = …;`, `const CARD_STYLE = { … } as const;` and `const LABEL_CLS = …;`.

(b) Replace the import line `import type { SectionRenderContext } from "./_types";` (line 38) with:

```ts
import { CARD_STYLE, INK_BORDER, LABEL_CLS } from "./order_confirmation.styles";
import type { SectionRenderContext } from "./_types";
```

- [ ] **Step 5: Run the snapshot and the existing section tests**

Run: `CI=true pnpm exec vitest run packages/sections/src/_order-confirmation-baseline-snapshot.test.tsx packages/sections/src/_order-confirmation.test.tsx packages/sections/src/_order-confirmation-referral.test.tsx`
Expected: all pass, with no snapshot written or changed.

- [ ] **Step 6: Commit**

```bash
git -C /Users/ali/scheniders-mono branch --show-current   # must print feat/pdp-entry-atelier
git -C /Users/ali/scheniders-mono add packages/sections/src/_order-confirmation-baseline-snapshot.test.tsx packages/sections/src/__snapshots__/_order-confirmation-baseline-snapshot.test.tsx.snap packages/sections/src/order_confirmation.styles.ts packages/sections/src/order_confirmation.client.tsx
git -C /Users/ali/scheniders-mono -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "test(sections): freeze order_confirmation default markup, share its card styles" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task P5.2: `maskIraqiMobile` in `@scheniders/shared`

**Files:**
- Modify: `packages/shared/src/phone.ts`. Append after line 49, which closes `formatIraqiPhoneDisplay`.
- Modify: `packages/shared/src/phone.test.ts`. Imports at lines 2-6; append after line 58.

- [ ] **Step 1: Write the failing test**

In `packages/shared/src/phone.test.ts`, replace lines 2-6:

```ts
import {
  normalizeIraqiMobile,
  isValidIraqiMobile,
  formatIraqiPhoneDisplay,
  maskIraqiMobile,
} from "./phone";
```

Then append at the end of the file:

```ts

describe("maskIraqiMobile", () => {
  it("keeps the operator prefix and the last four digits and hides the middle three", () => {
    expect(maskIraqiMobile("07701234567")).toBe("0770 ••• 4567");
    expect(maskIraqiMobile("+964 770 123 4567")).toBe("0770 ••• 4567");
    expect(maskIraqiMobile("00964-770-123-4567")).toBe("0770 ••• 4567");
  });

  it("returns null for anything that is not an Iraqi mobile", () => {
    expect(maskIraqiMobile("")).toBeNull();
    expect(maskIraqiMobile(null)).toBeNull();
    expect(maskIraqiMobile(undefined)).toBeNull();
    expect(maskIraqiMobile("0612345678")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `CI=true pnpm exec vitest run packages/shared/src/phone.test.ts`
Expected: FAIL in `maskIraqiMobile` with `TypeError: maskIraqiMobile is not a function`.

- [ ] **Step 3: Implement**

Append to `packages/shared/src/phone.ts`:

```ts

/**
 * The buyer's own number echoed back without exposing it whole: the
 * operator prefix and the last four digits stay readable (`0770 ••• 4567`)
 * so the buyer recognises it, the middle three are hidden so a screenshot
 * or a shoulder-surfer does not carry the full number. Null when the input
 * is not an Iraqi mobile — the caller then shows nothing.
 */
export function maskIraqiMobile(raw: string | null | undefined): string | null {
  const local = normalizeIraqiMobile(raw);
  if (!local) return null;
  return `${local.slice(0, 4)} ••• ${local.slice(7)}`;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `CI=true pnpm exec vitest run packages/shared/src/phone.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git -C /Users/ali/scheniders-mono branch --show-current   # must print feat/pdp-entry-atelier
git -C /Users/ali/scheniders-mono add packages/shared/src/phone.ts packages/shared/src/phone.test.ts
git -C /Users/ali/scheniders-mono -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(shared): maskIraqiMobile for echoing a buyer's number back" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task P5.3: vCard helper for "save to contacts"

**Files:**
- Create: `packages/sections/src/helpers/vcard.ts`
- Create: `packages/sections/src/helpers/vcard.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/sections/src/helpers/vcard.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildVCard, vcardFileName, vcardHref } from "./vcard";

describe("buildVCard", () => {
  it("writes a vCard 3.0 with the name and the E.164 number, CRLF-separated", () => {
    expect(
      buildVCard({ name: "متجر — تأكيد الطلبات", phoneE164: "+9647779703832" }),
    ).toBe(
      [
        "BEGIN:VCARD",
        "VERSION:3.0",
        "N:متجر — تأكيد الطلبات;;;;",
        "FN:متجر — تأكيد الطلبات",
        "TEL;TYPE=CELL,VOICE:+9647779703832",
        "END:VCARD",
      ].join("\r\n"),
    );
  });

  it("escapes the characters vCard text reserves", () => {
    const card = buildVCard({ name: "A, B; C\\D\nE", phoneE164: "+9647701234567" });
    expect(card).toContain("FN:A\\, B\\; C\\\\D\\nE");
  });
});

describe("vcardHref", () => {
  it("is a data URL that decodes back to the card", () => {
    const card = buildVCard({ name: "x", phoneE164: "+9647701234567" });
    const href = vcardHref(card);
    expect(href.startsWith("data:text/vcard;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(href.slice(href.indexOf(",") + 1))).toBe(card);
  });
});

describe("vcardFileName", () => {
  it("strips path and reserved characters", () => {
    expect(vcardFileName('متجر/شنايدر: "طلبات"')).toBe("متجر شنايدر طلبات.vcf");
  });

  it("never produces an empty name", () => {
    expect(vcardFileName("   ")).toBe("contact.vcf");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `CI=true pnpm exec vitest run packages/sections/src/helpers/vcard.test.ts`
Expected: FAIL with `Failed to load url ./vcard` (the module does not exist).

- [ ] **Step 3: Implement**

`packages/sections/src/helpers/vcard.ts`:

```ts
// =====================================================================
// vCard 3.0 — "save this number" for the thank-you call card
// =====================================================================
// A buyer who has saved the store's calling number picks up a call that
// would otherwise look like a stranger's. The card offers a one-tap save:
// the vCard travels as a data: URL, so nothing is fetched and no file is
// hosted. RFC 2426: CRLF line endings; `\` `,` `;` and newlines escaped
// in text values.
// =====================================================================

/** Escape a vCard TEXT value (RFC 2426 §4). Backslash first, so the
 *  escapes added after it are not themselves escaped. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function buildVCard(input: { name: string; phoneE164: string }): string {
  const name = escapeText(input.name.trim());
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${name};;;;`,
    `FN:${name}`,
    `TEL;TYPE=CELL,VOICE:${input.phoneE164}`,
    "END:VCARD",
  ].join("\r\n");
}

export function vcardHref(vcard: string): string {
  return `data:text/vcard;charset=utf-8,${encodeURIComponent(vcard)}`;
}

/** Download name: the contact name without path or reserved characters. */
export function vcardFileName(name: string): string {
  const safe = name
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${safe || "contact"}.vcf`;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `CI=true pnpm exec vitest run packages/sections/src/helpers/vcard.test.ts`
Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git -C /Users/ali/scheniders-mono branch --show-current   # must print feat/pdp-entry-atelier
git -C /Users/ali/scheniders-mono add packages/sections/src/helpers/vcard.ts packages/sections/src/helpers/vcard.test.ts
git -C /Users/ali/scheniders-mono -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): vCard helper for saving the store's call number" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task P5.4: `GET /api/checkout/orders/[id]/contact` returns the order's contact state for the proof holder

**Files:**
- Create: `apps/storefront/app/api/checkout/orders/[id]/contact/route.ts`
- Create: `apps/storefront/app/api/checkout/orders/[id]/contact/route.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/storefront/app/api/checkout/orders/[id]/contact/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeSupabase,
  type FakeSupabaseOptions,
  type Row,
} from "@/lib/testing/fake-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: vi.fn(),
}));

import { GET } from "./route";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { signUpsellProof, UPSELL_WINDOW_MS } from "@/lib/order-upsell-proof";

// =====================================================================
// The thank-you call card reads and writes the phone numbers on an order
// a courier will call. These tests are about who may see them (only the
// browser holding the checkout's proof, only masked) and when a second
// number may still be added.
// =====================================================================

const SECRET = "test-service-role-key-for-hmac-derivation";
const TENANT = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const OTHER_TENANT = "0e0e0e0e-b5a6-4789-8f12-cd34ef567890";
const ORDER = "11111111-1111-4111-8111-111111111111";
const OTHER_ORDER = "22222222-2222-4222-8222-222222222222";

function order(over: Row = {}): Row {
  return {
    id: ORDER,
    tenant_id: TENANT,
    phone: "07701234567",
    secondary_phone: null,
    status: "new",
    created_at: new Date().toISOString(),
    version: 3,
    deleted_at: null,
    ...over,
  };
}

function sentLog(over: Row = {}): Row {
  return {
    id: "log-1",
    order_uuid: ORDER,
    tenant_id: TENANT,
    direction: "outbound",
    template_name: "cod_order_confirm",
    status: "sent",
    ...over,
  };
}

function install(
  t: { orders?: Row[]; whatsapp_logs?: Row[] } = {},
  options: FakeSupabaseOptions = {},
) {
  const fake = createFakeSupabase(
    { orders: t.orders ?? [order()], whatsapp_logs: t.whatsapp_logs ?? [] },
    options,
  );
  vi.mocked(createSupabaseServiceClient).mockReturnValue(fake.client);
  return fake;
}

const proofFor = (orderId = ORDER, tenantId = TENANT, nowMs = Date.now()) =>
  signUpsellProof({ tenantId, orderId }, SECRET, nowMs);

const ctx = (id = ORDER) => ({ params: Promise.resolve({ id }) });
const getReq = (proof: string | null, id = ORDER) =>
  new Request(`http://x/api/checkout/orders/${id}/contact`, {
    headers: proof ? { "x-upsell-proof": proof } : {},
  });

const stale = () => new Date(Date.now() - UPSELL_WINDOW_MS - 60_000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", SECRET);
});

describe("GET — who may read an order's contact state", () => {
  it.each([
    ["no proof", null],
    ["a forged proof", "v1.e30.AAAA"],
    ["a proof for a different order", proofFor(OTHER_ORDER)],
    ["a proof signed with another key", signUpsellProof({ tenantId: TENANT, orderId: ORDER }, "other-key")],
    ["an expired proof", proofFor(ORDER, TENANT, Date.now() - UPSELL_WINDOW_MS - 1000)],
  ])("is the same 404 with %s", async (_label, proof) => {
    install();
    expect((await GET(getReq(proof), ctx())).status).toBe(404);
  });

  it("takes the tenant from the proof, so a proof for another store finds nothing", async () => {
    install();
    expect((await GET(getReq(proofFor(ORDER, OTHER_TENANT)), ctx())).status).toBe(404);
  });

  it("is 404 for a malformed order id", async () => {
    install();
    expect((await GET(getReq(proofFor()), ctx("not-a-uuid"))).status).toBe(404);
  });

  it("is 404 for a deleted order", async () => {
    install({ orders: [order({ deleted_at: new Date().toISOString() })] });
    expect((await GET(getReq(proofFor()), ctx())).status).toBe(404);
  });

  it("is off entirely when the server has no key to verify with", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    install();
    expect((await GET(getReq(proofFor()), ctx())).status).toBe(404);
  });
});

describe("GET — what it reports", () => {
  it("masks the buyer's phone and says a second number can still be added", async () => {
    install();
    const res = await GET(getReq(proofFor()), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      phone_masked: "0770 ••• 4567",
      has_backup: false,
      can_add_backup: true,
      whatsapp_sent: false,
    });
  });

  it("never returns the full phone", async () => {
    install();
    const text = await (await GET(getReq(proofFor()), ctx())).text();
    expect(text).not.toContain("07701234567");
    expect(text).not.toContain("1234567");
  });

  it("reports the WhatsApp confirmation once the platform logged it as sent", async () => {
    install({ whatsapp_logs: [sentLog()] });
    const body = await (await GET(getReq(proofFor()), ctx())).json();
    expect(body.whatsapp_sent).toBe(true);
  });

  it.each([
    ["a failed send", sentLog({ status: "failed" })],
    ["a reminder, not the confirmation", sentLog({ template_name: "order_reminder" })],
    ["an inbound reply", sentLog({ direction: "inbound", status: "received" })],
    ["another order's send", sentLog({ order_uuid: OTHER_ORDER })],
    ["another tenant's row", sentLog({ tenant_id: OTHER_TENANT })],
  ])("does not count %s as sent", async (_label, log) => {
    install({ whatsapp_logs: [log] });
    const body = await (await GET(getReq(proofFor()), ctx())).json();
    expect(body.whatsapp_sent).toBe(false);
  });

  it("treats an empty stored backup as none", async () => {
    install({ orders: [order({ secondary_phone: "  " })] });
    const body = await (await GET(getReq(proofFor()), ctx())).json();
    expect(body.has_backup).toBe(false);
    expect(body.can_add_backup).toBe(true);
  });

  it.each([
    ["it already has a backup", { secondary_phone: "07801112222" }, true],
    ["ops confirmed it", { status: "confirmed" }, false],
    ["it was cancelled", { status: "cancelled" }, false],
    ["it is older than the window", { created_at: stale() }, false],
  ])("cannot take a second number when %s", async (_label, over, hasBackup) => {
    install({ orders: [order(over)] });
    const body = await (await GET(getReq(proofFor()), ctx())).json();
    expect(body.can_add_backup).toBe(false);
    expect(body.has_backup).toBe(hasBackup);
  });

  it("still takes a second number once the WhatsApp bot moved it to contacted", async () => {
    install({ orders: [order({ status: "contacted" })] });
    const body = await (await GET(getReq(proofFor()), ctx())).json();
    expect(body.can_add_backup).toBe(true);
  });

  it("returns no mask for a number that is not an Iraqi mobile", async () => {
    install({ orders: [order({ phone: "+1 555 0100" })] });
    const body = await (await GET(getReq(proofFor()), ctx())).json();
    expect(body.phone_masked).toBeNull();
  });

  it("is 503, not a guess, when the order cannot be read", async () => {
    install({}, { failingTables: ["orders"] });
    expect((await GET(getReq(proofFor()), ctx())).status).toBe(503);
  });

  it("is 503, not a guess, when the send log cannot be read", async () => {
    install({}, { failingTables: ["whatsapp_logs"] });
    expect((await GET(getReq(proofFor()), ctx())).status).toBe(503);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `CI=true pnpm exec vitest run "apps/storefront/app/api/checkout/orders/[id]/contact/route.test.ts"`
Expected: FAIL with `Failed to load url ./route` / `Cannot find module './route'`.

- [ ] **Step 3: Implement (GET only)**

`apps/storefront/app/api/checkout/orders/[id]/contact/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { maskIraqiMobile } from "@scheniders/shared";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  UPSELL_WINDOW_MS,
  upsellProofSecret,
  verifyUpsellProof,
} from "@/lib/order-upsell-proof";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// =====================================================================
// Thank-you call card — the order's contact state (GET) and a second
// number (POST)
// =====================================================================
// A COD order is won or lost on one phone call, so the thank-you page
// shows the buyer which number they gave (masked), whether the WhatsApp
// confirmation has gone out, and lets them add a second number. Who may
// do that is the whole design, and it is the post-purchase upsell's:
//
//   - WHO: the caller presents the `x-upsell-proof` the checkout minted in
//     the response that created this order (lib/order-upsell-proof). The
//     order id alone proves nothing (it reaches merchant tools, webhooks
//     and couriers) and the order number is sequential. The tenant comes
//     FROM the proof and scopes every query; the request never names one.
//   - WHAT: the phone only ever leaves masked. "WhatsApp sent" is what the
//     platform's dispatcher logged for THIS order, never a promise.
//   - WHEN (POST): the order still awaits its confirmation call (`new`, or
//     `contacted`, which the WhatsApp bot sets the moment it sends), it is
//     inside the proof window, and it has no second number yet.
//
// Every refusal of WHO is the same 404, so the route cannot be used to
// learn whether an order exists. /api/checkout/orders is not touched.
// =====================================================================

const PROOF_HEADER = "x-upsell-proof";

/** The template the platform's dispatcher sends as the instant order
 *  confirmation (apps/platform/lib/interakt.ts TEMPLATE_NAMES.confirmation)
 *  and logs to whatsapp_logs.template_name. */
const CONFIRMATION_TEMPLATE = "cod_order_confirm";

/** Statuses in which the order is still waiting for its confirmation call. */
const AWAITING_CALL: readonly string[] = ["new", "contacted"];

type Svc = ReturnType<typeof createSupabaseServiceClient>;
type Ctx = { params: Promise<{ id: string }> };

interface ContactOrder {
  id: string;
  phone: string;
  /** Null when absent OR blank — a blank string is not a number to call. */
  secondaryPhone: string | null;
  status: string;
  createdAt: string;
  version: number;
}

class ContactReadError extends Error {}

const notFound = () =>
  NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
const unavailable = () =>
  NextResponse.json({ success: false, error: "Try again shortly" }, { status: 503 });

/** The proof's tenant, when the proof is valid for THIS order id. */
function provenTenant(req: Request, orderId: string): string | null {
  const secret = upsellProofSecret();
  if (!secret) return null;
  const proof = verifyUpsellProof(req.headers.get(PROOF_HEADER), secret);
  if (!proof || proof.orderId !== orderId) return null;
  return proof.tenantId;
}

async function loadOrder(
  svc: Svc,
  orderId: string,
  tenantId: string,
): Promise<ContactOrder | null> {
  const { data, error } = await svc
    .from("orders")
    .select("id, phone, secondary_phone, status, created_at, version, deleted_at")
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new ContactReadError(`order read failed: ${error.message}`);
  if (!data || data.deleted_at) return null;
  return {
    id: data.id,
    phone: data.phone,
    secondaryPhone: data.secondary_phone?.trim() || null,
    status: data.status,
    createdAt: data.created_at,
    version: data.version,
  };
}

/** May this order still take a second number? Checked against the row,
 *  not the proof. */
function acceptsBackup(order: ContactOrder, nowMs: number): boolean {
  return (
    order.secondaryPhone === null &&
    AWAITING_CALL.includes(order.status) &&
    nowMs - new Date(order.createdAt).getTime() <= UPSELL_WINDOW_MS
  );
}

/** True once the platform's dispatcher logged the confirmation as SENT for
 *  this order of this tenant. */
async function confirmationSent(
  svc: Svc,
  orderId: string,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await svc
    .from("whatsapp_logs")
    .select("id")
    .eq("order_uuid", orderId)
    .eq("tenant_id", tenantId)
    .eq("direction", "outbound")
    .eq("template_name", CONFIRMATION_TEMPLATE)
    .eq("status", "sent")
    .limit(1);
  if (error) throw new ContactReadError(`send log read failed: ${error.message}`);
  return (data ?? []).length > 0;
}

export async function GET(req: Request, { params }: Ctx): Promise<NextResponse> {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return notFound();
  const tenantId = provenTenant(req, id);
  if (!tenantId) return notFound();

  const svc = createSupabaseServiceClient();
  try {
    const order = await loadOrder(svc, id, tenantId);
    if (!order) return notFound();
    const whatsappSent = await confirmationSent(svc, order.id, tenantId);
    return NextResponse.json({
      success: true,
      phone_masked: maskIraqiMobile(order.phone),
      has_backup: order.secondaryPhone !== null,
      can_add_backup: acceptsBackup(order, Date.now()),
      whatsapp_sent: whatsappSent,
    });
  } catch (e) {
    if (!(e instanceof ContactReadError)) throw e;
    console.error("[order-contact] GET", e.message);
    return unavailable();
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `CI=true pnpm exec vitest run "apps/storefront/app/api/checkout/orders/[id]/contact/route.test.ts"`
Expected: all pass.

- [ ] **Step 5: Type-check**

Run: `pnpm --filter @scheniders/storefront type-check`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git -C /Users/ali/scheniders-mono branch --show-current   # must print feat/pdp-entry-atelier
git -C /Users/ali/scheniders-mono add "apps/storefront/app/api/checkout/orders/[id]/contact/route.ts" "apps/storefront/app/api/checkout/orders/[id]/contact/route.test.ts"
git -C /Users/ali/scheniders-mono -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(storefront): proof-gated read of an order's contact state for the thank-you card" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task P5.5: `POST /api/checkout/orders/[id]/contact` adds a second number

**Files:**
- Modify: `apps/storefront/app/api/checkout/orders/[id]/contact/route.ts`. Imports at lines 1-9; append `POST` after `GET`.
- Modify: `apps/storefront/app/api/checkout/orders/[id]/contact/route.test.ts`. Import at line 12; append the tests below.

- [ ] **Step 1: Write the failing tests**

In the test file, replace `import { GET } from "./route";` with:

```ts
import { GET, POST } from "./route";
```

Then append at the end of the file:

```ts

const postReq = (body: unknown, proof: string | null, id = ORDER) =>
  new Request(`http://x/api/checkout/orders/${id}/contact`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(proof ? { "x-upsell-proof": proof } : {}),
    },
    body: JSON.stringify(body),
  });

const storedOrder = (fake: ReturnType<typeof install>) =>
  fake.tables.orders.find((o) => o.id === ORDER);

describe("POST — who may add a second number", () => {
  it.each([
    ["no proof", null],
    ["a forged proof", "v1.e30.AAAA"],
    ["a proof for a different order", proofFor(OTHER_ORDER)],
    ["an expired proof", proofFor(ORDER, TENANT, Date.now() - UPSELL_WINDOW_MS - 1000)],
    ["a proof for another store", proofFor(ORDER, OTHER_TENANT)],
  ])("is the same 404 with %s, and nothing is written", async (_label, proof) => {
    const fake = install();
    const res = await POST(postReq({ phone: "07801112222" }, proof), ctx());
    expect(res.status).toBe(404);
    expect(fake.writes).toEqual([]);
  });

  it("rejects a malformed body", async () => {
    const fake = install();
    expect((await POST(postReq({ phone: 7801112222 }, proofFor()), ctx())).status).toBe(400);
    const notJson = new Request(`http://x/api/checkout/orders/${ORDER}/contact`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-upsell-proof": proofFor() },
      body: "{",
    });
    expect((await POST(notJson, ctx())).status).toBe(400);
    expect(fake.writes).toEqual([]);
  });
});

describe("POST — what lands on the order", () => {
  it("stores the normalised number on the order the proof names", async () => {
    const fake = install();
    const res = await POST(postReq({ phone: "0780 111 2222" }, proofFor()), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, has_backup: true });
    expect(storedOrder(fake)?.secondary_phone).toBe("07801112222");
    expect(storedOrder(fake)?.version).toBe(4);
    expect(fake.writes).toEqual([
      { table: "orders", op: "update", payload: { secondary_phone: "07801112222" }, matched: 1 },
    ]);
  });

  it("accepts it while the order is contacted (the WhatsApp bot already sent)", async () => {
    const fake = install({ orders: [order({ status: "contacted" })] });
    const res = await POST(postReq({ phone: "07801112222" }, proofFor()), ctx());
    expect(res.status).toBe(200);
    expect(storedOrder(fake)?.secondary_phone).toBe("07801112222");
  });

  it("refuses a number that is not an Iraqi mobile", async () => {
    const fake = install();
    const res = await POST(postReq({ phone: "12345" }, proofFor()), ctx());
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ success: false, error: "invalid_phone" });
    expect(fake.writes).toEqual([]);
  });

  it("refuses the number the order was placed with", async () => {
    const fake = install();
    const res = await POST(postReq({ phone: "+964 770 123 4567" }, proofFor()), ctx());
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ success: false, error: "same_as_primary" });
    expect(fake.writes).toEqual([]);
  });

  it("answers a retry of the same number as success without writing again", async () => {
    const fake = install({ orders: [order({ secondary_phone: "07801112222" })] });
    const res = await POST(postReq({ phone: "0780 111 2222" }, proofFor()), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, has_backup: true, already: true });
    expect(fake.writes).toEqual([]);
  });

  it("never overwrites a different second number", async () => {
    const fake = install({ orders: [order({ secondary_phone: "07901234567" })] });
    const res = await POST(postReq({ phone: "07801112222" }, proofFor()), ctx());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ success: false, error: "has_backup" });
    expect(storedOrder(fake)?.secondary_phone).toBe("07901234567");
    expect(fake.writes).toEqual([]);
  });

  it.each([
    ["ops confirmed it", { status: "confirmed" }],
    ["it was cancelled", { status: "cancelled" }],
    ["it is older than the window", { created_at: stale() }],
  ])("is closed when %s", async (_label, over) => {
    const fake = install({ orders: [order(over)] });
    const res = await POST(postReq({ phone: "07801112222" }, proofFor()), ctx());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ success: false, error: "closed" });
    expect(fake.writes).toEqual([]);
  });

  it("is 404 for a deleted order", async () => {
    const fake = install({ orders: [order({ deleted_at: new Date().toISOString() })] });
    expect((await POST(postReq({ phone: "07801112222" }, proofFor()), ctx())).status).toBe(404);
    expect(fake.writes).toEqual([]);
  });

  it("lands nothing on an order that changed between the read and the write", async () => {
    const fake = install({}, {
      beforeUpdate: (table, t) => {
        if (table === "orders") t.orders[0].version = 9;
      },
    });
    const res = await POST(postReq({ phone: "07801112222" }, proofFor()), ctx());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ success: false, error: "changed" });
    expect(storedOrder(fake)?.secondary_phone).toBeNull();
  });

  it("treats a concurrent save of the same number as success", async () => {
    install({}, {
      beforeUpdate: (table, t) => {
        if (table !== "orders") return;
        t.orders[0].secondary_phone = "07801112222";
        t.orders[0].version = 9;
      },
    });
    const res = await POST(postReq({ phone: "07801112222" }, proofFor()), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, has_backup: true, already: true });
  });

  it("is 503 when the order cannot be read", async () => {
    const fake = install({}, { failingTables: ["orders"] });
    expect((await POST(postReq({ phone: "07801112222" }, proofFor()), ctx())).status).toBe(503);
    expect(fake.writes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `CI=true pnpm exec vitest run "apps/storefront/app/api/checkout/orders/[id]/contact/route.test.ts"`
Expected: every `POST — …` test FAILs with `TypeError: POST is not a function`; the GET tests still pass.

- [ ] **Step 3: Implement**

In `route.ts`, replace the import block (lines 1-9) with:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { maskIraqiMobile, normalizeIraqiMobile } from "@scheniders/shared";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  UPSELL_WINDOW_MS,
  upsellProofSecret,
  verifyUpsellProof,
} from "@/lib/order-upsell-proof";
```

Below `const AWAITING_CALL …`, add:

```ts

const backupSchema = z.object({ phone: z.string().trim().min(1).max(32) });
```

Append at the end of the file:

```ts

/** A second number is already on the order: a retry of the SAME number
 *  (a double tap, a lost response) is success; a different one is never
 *  overwritten from a shopper-facing page. */
function backupOutcome(order: ContactOrder, backup: string): NextResponse {
  if (normalizeIraqiMobile(order.secondaryPhone) === backup) {
    return NextResponse.json({ success: true, has_backup: true, already: true });
  }
  return NextResponse.json({ success: false, error: "has_backup" }, { status: 409 });
}

export async function POST(req: Request, { params }: Ctx): Promise<NextResponse> {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return notFound();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });
  }

  const tenantId = provenTenant(req, id);
  if (!tenantId) return notFound();

  const backup = normalizeIraqiMobile(parsed.data.phone);
  if (!backup) {
    return NextResponse.json({ success: false, error: "invalid_phone" }, { status: 422 });
  }

  const svc = createSupabaseServiceClient();
  try {
    const order = await loadOrder(svc, id, tenantId);
    if (!order) return notFound();
    if (order.secondaryPhone !== null) return backupOutcome(order, backup);
    if (backup === normalizeIraqiMobile(order.phone)) {
      return NextResponse.json({ success: false, error: "same_as_primary" }, { status: 422 });
    }
    if (!acceptsBackup(order, Date.now())) {
      return NextResponse.json({ success: false, error: "closed" }, { status: 409 });
    }

    // Optimistic on `version` (bumped by the BEFORE UPDATE trigger on every
    // write) with the awaiting-call statuses re-asserted in the same
    // statement: anything that changed the order since the read — staff,
    // the WhatsApp bot, a second tab — makes this match zero rows.
    const { data: updated, error: updateErr } = await svc
      .from("orders")
      .update({ secondary_phone: backup })
      .eq("id", order.id)
      .eq("tenant_id", tenantId)
      .eq("version", order.version)
      .in("status", [...AWAITING_CALL])
      .select("secondary_phone")
      .maybeSingle();
    if (updateErr) {
      console.error("[order-contact] POST update failed", updateErr.message);
      return unavailable();
    }
    if (!updated) {
      const current = await loadOrder(svc, id, tenantId);
      if (current && current.secondaryPhone !== null) return backupOutcome(current, backup);
      return NextResponse.json({ success: false, error: "changed" }, { status: 409 });
    }
    return NextResponse.json({ success: true, has_backup: true });
  } catch (e) {
    if (!(e instanceof ContactReadError)) throw e;
    console.error("[order-contact] POST", e.message);
    return unavailable();
  }
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `CI=true pnpm exec vitest run "apps/storefront/app/api/checkout/orders/[id]/contact/route.test.ts" "apps/storefront/app/api/checkout/orders/[id]/upsell/route.test.ts" apps/storefront/lib/order-upsell-proof.test.ts`
Expected: all pass.

- [ ] **Step 5: Type-check and lint**

Run: `pnpm --filter @scheniders/storefront type-check && pnpm --filter @scheniders/storefront lint`
Expected: type-check exit 0; lint adds no errors for the two new files.

- [ ] **Step 6: Commit**

```bash
git -C /Users/ali/scheniders-mono branch --show-current   # must print feat/pdp-entry-atelier
git -C /Users/ali/scheniders-mono add "apps/storefront/app/api/checkout/orders/[id]/contact/route.ts" "apps/storefront/app/api/checkout/orders/[id]/contact/route.test.ts"
git -C /Users/ali/scheniders-mono -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(storefront): add a second number to a just-placed order with the checkout proof" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task P5.6: The call card (opt-in `show_call_card`) on `order_confirmation`

**Files:**
- Create: `packages/sections/src/order_confirmation_call_card.client.tsx`
- Create: `packages/sections/src/_order-confirmation-call-card.test.tsx`
- Modify: `packages/sections/src/order_confirmation.tsx`. Header comment at lines 1-22; schema at lines 37-76, inserting after line 75.
- Modify: `packages/sections/src/order_confirmation.client.tsx`. The line numbers below are those **after** Task P5.1 removed 13 lines:
  - imports at about lines 30-40 (the `import type { I18nString, LocaleCode } from "@scheniders/shared";` line is 32)
  - `resolveGreeting` at about lines 131-142
  - the render's `heading` const at about lines 302-306
  - the head card `<div className="p-bk-lg text-center sm:p-bk-xl" style={CARD_STYLE}>…</div>` at about lines 318-343

  Re-confirm each with `grep -n` before editing.
- Modify (comment only): `packages/sections/src/helpers/section-tenant.ts`, the `store_config_v2.commerce` consumer list that P4.2 Step 8 extended.

- [ ] **Step 1: Write the failing test**

`packages/sections/src/_order-confirmation-call-card.test.tsx`:

```tsx
// @vitest-environment jsdom
// P5 — the thank-you call card. Opt-in; off, the section is unchanged (the
// frozen markup lives in _order-confirmation-baseline-snapshot). On, it is
// the brief for the confirmation call: first-name greeting, order number,
// the store's call number (copy + vCard), the WhatsApp line only once the
// platform logged the send, the buyer's masked number with a fix link, and
// "add a second number" through the proof-gated contact route.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { LocaleCode } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import order_confirmation from "./order_confirmation";
import type { Props } from "./order_confirmation";

const ORDER = "11111111-1111-4111-8111-111111111111";
const CONTACT_URL = `/api/checkout/orders/${ORDER}/contact`;
const PROOF = "v1.payload.sig";

const tenant = {
  id: "44444444-4444-4444-8444-444444444444",
  business_name: "متجر شنايدر",
  store_config: {
    contact: { whatsapp_number: "07701234567", phone_number: "07779703832" },
  },
};

const runtime = (locale: LocaleCode) => ({
  page_id: "checkout_success" as const,
  breakpoint: "mobile" as const,
  locale,
  audience_segments: [],
  ab_test_arms: {},
  now: new Date("2026-10-21T00:00:00Z"),
  order_number: "SH-0001",
});

function stash(over: Record<string, unknown> = {}): void {
  window.sessionStorage.setItem(
    "schn:last-order",
    JSON.stringify({
      number: "SH-0001",
      order_id: ORDER,
      upsell_token: PROOF,
      customer_name: "علي حسن",
      items: [],
      total: 1000,
      ts: Date.now(),
      ...over,
    }),
  );
}

function mount(
  props: Partial<Props> = {},
  locale: LocaleCode = "ar",
  tenantRow: object = tenant,
): void {
  render(
    React.createElement(
      StoreBaseProvider,
      { base: "", children: null },
      React.createElement(order_confirmation.render, {
        props: { ...order_confirmation.defaultProps, show_call_card: true, ...props },
        ctx: { tenant: tenantRow as never, runtime: runtime(locale), products: [], categories: [] },
      }),
    ),
  );
}

/** A store that set P4's structured contact (call number + the WhatsApp
 *  flag the PDP line reads), as `toSectionTenant` forwards it. */
const tenantWithContact = {
  ...tenant,
  store_config_v2: {
    commerce: { contact: { call_number: "07801234567", whatsapp_confirm: true } },
    enabled_locales: ["ar", "en", "ku"],
  },
};

const contactState = (over: Record<string, unknown> = {}) => ({
  success: true,
  phone_masked: "0770 ••• 4567",
  has_backup: false,
  can_add_backup: true,
  whatsapp_sent: false,
  ...over,
});

interface Reply {
  status: number;
  body: unknown;
}
let contactReplies: Reply[] = [];
let postReplies: Reply[] = [];

/** A plain object, not a real Response: undici's body reader schedules on
 *  timers that the fake-timer tests freeze. */
const respond = (r: Reply) =>
  Promise.resolve({
    ok: r.status >= 200 && r.status < 300,
    status: r.status,
    json: () => Promise.resolve(r.body),
  } as unknown as Response);

const fetchMock = vi.fn((url: string, init?: RequestInit) => {
  if (url === CONTACT_URL && init?.method === "POST") {
    const r = postReplies.shift();
    if (!r) throw new Error("unexpected POST");
    return respond(r);
  }
  if (url === CONTACT_URL) {
    const r = contactReplies.length > 1 ? contactReplies.shift() : contactReplies[0];
    if (!r) throw new Error("unexpected GET");
    return respond(r);
  }
  return respond({ status: 404, body: null });
});

const contactGets = () =>
  fetchMock.mock.calls.filter(([url, init]) => url === CONTACT_URL && init?.method !== "POST").length;

beforeEach(() => {
  window.sessionStorage.clear();
  fetchMock.mockClear();
  contactReplies = [{ status: 200, body: contactState() }];
  postReplies = [];
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("order_confirmation call card — opt-in", () => {
  it("is off unless the merchant turns it on: no card, no contact read", async () => {
    stash();
    await act(async () => {
      mount({ show_call_card: undefined });
    });
    expect(screen.queryByTestId("call-card")).toBeNull();
    expect(contactGets()).toBe(0);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("شكراً علي حسن");
  });

  it("degrades a malformed value to off", () => {
    const parsed = order_confirmation.schema.safeParse({
      ...order_confirmation.defaultProps,
      show_call_card: "yes",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.show_call_card).toBeUndefined();
  });
});

describe("order_confirmation call card — the brief", () => {
  it("greets by first name and shows the order number", async () => {
    stash();
    await act(async () => {
      mount();
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("تم يا علي، طلبك ثابت");
    expect(document.querySelector('[data-testid="call-card"] code')?.textContent).toBe("SH-0001");
  });

  it("lets the merchant reword the heading", async () => {
    stash();
    await act(async () => {
      mount({ call_card_heading_named_i18n: { ar: "وصلنا طلبك يا {name}" } });
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("وصلنا طلبك يا علي");
  });

  it("shows the store's call number with tap-to-call and a vCard to save it", async () => {
    stash();
    await act(async () => {
      mount();
    });
    const number = screen.getByTestId("call-card-number");
    expect(number.textContent).toBe("0777 970 3832");
    expect(number.getAttribute("href")).toBe("tel:+9647779703832");
    const save = screen.getByTestId("call-card-save");
    const href = save.getAttribute("href") ?? "";
    expect(href.startsWith("data:text/vcard;charset=utf-8,")).toBe(true);
    const card = decodeURIComponent(href.slice(href.indexOf(",") + 1));
    expect(card).toContain("FN:متجر شنايدر — تأكيد الطلبات");
    expect(card).toContain("TEL;TYPE=CELL,VOICE:+9647779703832");
    expect(save.getAttribute("download")).toBe("متجر شنايدر — تأكيد الطلبات.vcf");
  });

  it("shows no contact line for a store without commerce.contact", async () => {
    stash();
    await act(async () => {
      mount();
    });
    expect(screen.getByTestId("call-card-number").textContent).toBe("0777 970 3832");
    expect(document.querySelector("[data-contact-line]")).toBeNull();
  });

  it("takes the number and P4's contact line from commerce.contact, without promising the WhatsApp", async () => {
    stash();
    await act(async () => {
      mount({}, "ar", tenantWithContact);
    });
    const number = screen.getByTestId("call-card-number");
    expect(number.textContent).toBe("0780 123 4567");
    expect(number.getAttribute("href")).toBe("tel:+9647801234567");
    const save = screen.getByTestId("call-card-save").getAttribute("href") ?? "";
    expect(decodeURIComponent(save.slice(save.indexOf(",") + 1))).toContain(
      "TEL;TYPE=CELL,VOICE:+9647801234567",
    );
    const line = document.querySelector('[data-testid="call-card"] [data-contact-line]');
    expect(line?.getAttribute("data-contact-line")).toBe("channel");
    expect(line?.textContent).toContain("راح يوصلك اتصال من 0780 123 4567 لتأكيد طلبك");
    // The store sends the WhatsApp (whatsapp_confirm), but on this card it
    // is reported from the send log, never announced in advance.
    expect(line?.textContent).not.toContain("واتساب");
  });

  it("echoes the buyer's number masked, read with the checkout's proof, with a fix link", async () => {
    stash();
    await act(async () => {
      mount();
    });
    const call = fetchMock.mock.calls.find(([url]) => url === CONTACT_URL);
    expect(new Headers(call?.[1]?.headers).get("x-upsell-proof")).toBe(PROOF);
    expect(screen.getByTestId("call-card-your-number").textContent).toContain("0770 ••• 4567");
    const fix = screen.getByTestId("call-card-wrong-number");
    expect(fix.textContent).toBe("الرقم غلط؟ راسلنا");
    const fixHref = fix.getAttribute("href") ?? "";
    expect(fixHref.startsWith("https://wa.me/9647701234567?text=")).toBe(true);
    expect(decodeURIComponent(fixHref.split("text=")[1] ?? "")).toContain("SH-0001");
  });

  it("asks for nothing without a proof, and still shows who will call", async () => {
    stash({ upsell_token: undefined });
    await act(async () => {
      mount();
    });
    expect(contactGets()).toBe(0);
    expect(screen.getByTestId("call-card-number").textContent).toBe("0777 970 3832");
    expect(screen.queryByTestId("call-card-your-number")).toBeNull();
    expect(screen.queryByTestId("call-card-add-backup")).toBeNull();
  });

  it("speaks Kurdish for a ku visitor", async () => {
    stash();
    await act(async () => {
      mount({}, "ku");
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "تەواو علي، داواکارییەکەت تۆمارکرا",
    );
    expect(screen.getByTestId("call-card").textContent).toContain(
      "لەم ژمارەیەوە پەیوەندیت پێوە دەکەین",
    );
  });
});

describe("order_confirmation call card — the WhatsApp line", () => {
  it("appears only once the platform logged the send, then stops asking", async () => {
    vi.useFakeTimers();
    stash();
    contactReplies = [
      { status: 200, body: contactState({ whatsapp_sent: false }) },
      { status: 200, body: contactState({ whatsapp_sent: true }) },
    ];
    await act(async () => {
      mount();
    });
    expect(screen.queryByTestId("call-card-whatsapp")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(screen.getByTestId("call-card-whatsapp").textContent).toContain(
      "رسالة واتساب وصلتك هسه — اضغط تأكيد",
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(contactGets()).toBe(2);
  });

  it("gives up after the last re-check when nothing was sent, and never claims it was", async () => {
    vi.useFakeTimers();
    stash();
    await act(async () => {
      mount();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(contactGets()).toBe(3);
    expect(screen.queryByTestId("call-card-whatsapp")).toBeNull();
  });
});

describe("order_confirmation call card — a second number", () => {
  async function openAndType(value: string): Promise<void> {
    fireEvent.click(screen.getByTestId("call-card-add-backup"));
    fireEvent.change(screen.getByLabelText("الرقم الثاني"), { target: { value } });
    await act(async () => {
      fireEvent.submit(screen.getByTestId("call-card-backup-form"));
    });
  }

  it("adds it to THIS order with the checkout's proof", async () => {
    stash();
    postReplies = [{ status: 200, body: { success: true, has_backup: true } }];
    await act(async () => {
      mount();
    });
    await openAndType("0780 111 2222");
    const post = fetchMock.mock.calls.find(([url, init]) => url === CONTACT_URL && init?.method === "POST");
    expect(post).toBeTruthy();
    expect(new Headers(post?.[1]?.headers).get("x-upsell-proof")).toBe(PROOF);
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ phone: "07801112222" });
    expect(screen.getByTestId("call-card-backup-saved").textContent).toBe("تم، نتصل عليه إذا ما رديت");
    expect(screen.queryByTestId("call-card-add-backup")).toBeNull();
  });

  it("refuses a number that is not an Iraqi mobile before sending anything", async () => {
    stash();
    await act(async () => {
      mount();
    });
    await openAndType("123");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    expect(screen.getByTestId("call-card-backup-error").textContent).toBe(
      "اكتب رقم موبايل عراقي صحيح، مثل 0770 123 4567",
    );
  });

  it("explains when the server says it is the number they ordered with", async () => {
    stash();
    postReplies = [{ status: 422, body: { success: false, error: "same_as_primary" } }];
    await act(async () => {
      mount();
    });
    await openAndType("07701234567");
    expect(screen.getByTestId("call-card-backup-error").textContent).toBe(
      "هذا نفس رقمك الأول — اكتب رقم ثاني",
    );
  });

  it("points to WhatsApp once the order is no longer taking one", async () => {
    stash();
    postReplies = [{ status: 409, body: { success: false, error: "closed" } }];
    await act(async () => {
      mount();
    });
    await openAndType("07801112222");
    expect(screen.getByTestId("call-card-backup-error").textContent).toBe(
      "طلبك صار عند فريقنا — دز لنا الرقم على واتساب",
    );
  });

  it("offers a retry, not 'closed', when the order changed under the write", async () => {
    // P1's dispatch claim and the WhatsApp bot both update the order a few
    // seconds after it lands; the route answers that race with `changed`,
    // and a retry re-reads the row, so the buyer is told to try again.
    stash();
    postReplies = [{ status: 409, body: { success: false, error: "changed" } }];
    await act(async () => {
      mount();
    });
    await openAndType("07801112222");
    expect(screen.getByTestId("call-card-backup-error").textContent).toBe(
      "ما انحفظ الرقم، جرّب مرة ثانية",
    );
  });

  it("is not offered when the order already has one", async () => {
    stash();
    contactReplies = [{ status: 200, body: contactState({ has_backup: true, can_add_backup: false }) }];
    await act(async () => {
      mount();
    });
    expect(screen.queryByTestId("call-card-add-backup")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `CI=true pnpm exec vitest run packages/sections/src/_order-confirmation-call-card.test.tsx`
Expected: the two opt-in tests pass, because the schema is a plain `z.object`, which strips the unknown key. Everything else FAILs. Examples: the h1 reads `شكراً علي حسن` instead of `تم يا علي، طلبك ثابت`, and `Unable to find an element by: [data-testid="call-card-number"]`.

- [ ] **Step 3: Add the schema props**

In `packages/sections/src/order_confirmation.tsx`:

(a) Replace header comment lines 18-22 (from `// Pixels: the Purchase event fires …` to the closing `// ===…`) with:

```ts
// Pixels: the Purchase event fires in checkout_form / pdp_direct_order
// right before the redirect (paired with the server CAPI event id), so
// this section deliberately fires nothing — a second event would double
// count every order.
//
// Call card (opt-in, `show_call_card`): replaces the head card with the
// brief for the confirmation call — see order_confirmation_call_card.
// Off or absent, the section renders exactly as before (frozen in
// _order-confirmation-baseline-snapshot).
// =====================================================================
```

(b) After line 75 (`referral_share_message_i18n: i18nStringOptional,`) and before `});`, insert:

```ts
  /** Thank-you call card (opt-in). On, the head card becomes the brief for
   *  the confirmation call: the store's call number (copy + save to
   *  contacts), the WhatsApp line once the platform logged the send, the
   *  buyer's number masked with a "wrong number?" link, and "add a second
   *  number". Absent or malformed (`.catch`) = off, markup unchanged. Not
   *  in defaultProps: templates embed defaultProps, and every seeded store
   *  would read as "customised" against them. */
  show_call_card: z.boolean().optional().catch(undefined),
  /** Call card heading without a name, and with `{name}` → the buyer's first
   *  name. Unset = the card's own copy (order_confirmation_call_card STRINGS). */
  call_card_heading_i18n: i18nStringOptional.catch(undefined),
  call_card_heading_named_i18n: i18nStringOptional.catch(undefined),
  /** Shown only once the WhatsApp confirmation is logged as sent. */
  call_card_whatsapp_sent_i18n: i18nStringOptional.catch(undefined),
```

`defaultProps` is **not** changed.

- [ ] **Step 4: Create the call card**

`packages/sections/src/order_confirmation_call_card.client.tsx`:

```tsx
// =====================================================================
// order_confirmation — the thank-you call card (opt-in: show_call_card)
// =====================================================================
// A COD order is won or lost on one phone call. On the funnel this store
// replaces, 15–29% of orders ended `no_response`, and orders that had the
// instant WhatsApp or a second number ended there far less often. So when
// the merchant turns this on, the top of the thank-you page stops being a
// receipt and becomes the brief for that call:
//
//   - who will call: the store's call number (P4's commerce.contact
//     call_number, else resolveTrackerContact — the configured phone
//     number, else the WhatsApp number), with copy and a one-tap "save to
//     contacts" vCard, so the call is not a stranger's; and, when the
//     store set commerce.contact, P4's <ContactLine> saying when, computed
//     from the order moment;
//   - that a WhatsApp is waiting — ONLY once the platform logged the
//     confirmation as sent for this order, never promised in advance;
//   - the number the buyer typed, masked, with a WhatsApp link to fix it;
//   - "add a second number" when none was given, written to THIS order.
//
// Contact state is read from /api/checkout/orders/[id]/contact with the
// same `x-upsell-proof` the post-purchase offer and the referral code use:
// only the browser that placed the order holds it, the tenant comes from
// the proof, and the phone only ever comes back masked. Without the proof
// (a direct visit, an expired stash) the card still shows who will call.
// =====================================================================

"use client";

import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import {
  formatIraqiPhoneDisplay,
  normalizeIraqiMobile,
  parseStoreContact,
  resolveI18n,
} from "@scheniders/shared";
import type { I18nString, LocaleCode, StoreContactConfig } from "@scheniders/shared";
import { ContactLine } from "./helpers/contact-line";
import { MaterialIcon } from "./helpers/primitives";
import { PRESSABLE } from "./helpers/utils";
import { buildVCard, vcardFileName, vcardHref } from "./helpers/vcard";
import { resolveTenantWhatsapp, resolveTrackerContact, whatsappDigits } from "./helpers/whatsapp";
import { CARD_STYLE, INK_BORDER, LABEL_CLS } from "./order_confirmation.styles";

/** Chrome strings (ar / en / ku — guarded by _kurdish-coverage). The three
 *  a merchant may reword are also schema props (call_card_*_i18n); these
 *  are their defaults. */
export const STRINGS = {
  heading: { en: "Done — your order is in", ar: "تم، طلبك ثابت", ku: "تەواو، داواکارییەکەت تۆمارکرا" },
  headingNamed: { en: "Done, {name} — your order is in", ar: "تم يا {name}، طلبك ثابت", ku: "تەواو {name}، داواکارییەکەت تۆمارکرا" },
  whatsappSent: { en: "We just sent you a WhatsApp — tap Confirm", ar: "رسالة واتساب وصلتك هسه — اضغط تأكيد", ku: "ئێستا نامەیەکی واتسئاپت بۆ هات — پشتڕاستکردنەوە دابگرە" },
  callFrom: { en: "We'll call you from this number", ar: "راح نتصل بيك من هذا الرقم", ku: "لەم ژمارەیەوە پەیوەندیت پێوە دەکەین" },
  saveContact: { en: "Save to contacts", ar: "احفظه بجهات الاتصال", ku: "لە پەیوەندییەکان پاشەکەوتی بکە" },
  contactName: { en: "{store} — order confirmation", ar: "{store} — تأكيد الطلبات", ku: "{store} — پشتڕاستکردنەوەی داواکاری" },
  yourNumber: { en: "Your number", ar: "رقمك", ku: "ژمارەکەت" },
  wrongNumber: { en: "Wrong number? Message us", ar: "الرقم غلط؟ راسلنا", ku: "ژمارەکە هەڵەیە؟ نامەمان بۆ بنێرە" },
  wrongNumberMessage: { en: "The number on my order {order} is wrong. The right one is: ", ar: "رقمي بالطلب {order} غلط، الرقم الصحيح: ", ku: "ژمارەکەم لە داواکاری {order} هەڵەیە، ژمارە دروستەکە: " },
  addBackup: { en: "Add a second number", ar: "أضف رقم ثاني", ku: "ژمارەیەکی دووەم زیاد بکە" },
  addBackupHint: { en: "If you miss our call, we'll try this one", ar: "إذا ما رديت على رقمك، نتصل على هذا", ku: "ئەگەر وەڵامی پەیوەندییەکەمانت نەدایەوە، پەیوەندی بەمەوە دەکەین" },
  backupLabel: { en: "Second number", ar: "الرقم الثاني", ku: "ژمارەی دووەم" },
  backupPlaceholder: { en: "0770 123 4567", ar: "0770 123 4567", ku: "0770 123 4567" },
  saveBackup: { en: "Save", ar: "احفظ", ku: "پاشەکەوتی بکە" },
  saving: { en: "Saving…", ar: "نحفظ…", ku: "پاشەکەوت دەکرێت…" },
  backupSaved: { en: "Saved — we'll try it if you miss our call", ar: "تم، نتصل عليه إذا ما رديت", ku: "پاشەکەوت کرا — ئەگەر وەڵامت نەدایەوە پەیوەندی پێوە دەکەین" },
  backupInvalid: { en: "Enter a valid Iraqi mobile, e.g. 0770 123 4567", ar: "اكتب رقم موبايل عراقي صحيح، مثل 0770 123 4567", ku: "ژمارەیەکی مۆبایلی عێراقی دروست بنووسە، نموونە: 0770 123 4567" },
  backupSame: { en: "That's the number you ordered with — enter a different one", ar: "هذا نفس رقمك الأول — اكتب رقم ثاني", ku: "ئەمە هەمان ژمارەی یەکەمتە — ژمارەیەکی تر بنووسە" },
  backupClosed: { en: "Your order is already with our team — send us the number on WhatsApp", ar: "طلبك صار عند فريقنا — دز لنا الرقم على واتساب", ku: "داواکارییەکەت گەیشتە تیمەکەمان — ژمارەکە لە واتسئاپ بۆمان بنێرە" },
  backupFailed: { en: "Couldn't save it — try again", ar: "ما انحفظ الرقم، جرّب مرة ثانية", ku: "پاشەکەوت نەکرا، دووبارە هەوڵ بدەرەوە" },
} satisfies Record<string, I18nString>;

/** The platform sends the WhatsApp confirmation through QStash a few
 *  seconds after the order lands (median 2.9 s on the funnel this store
 *  replaces), so the card asks again after these delays — and stops the
 *  moment the send is logged, or after the last one. */
const WA_RECHECK_DELAYS_MS: readonly number[] = [4_000, 10_000];

const PROOF_HEADER = "x-upsell-proof";

const contactUrl = (orderId: string) =>
  `/api/checkout/orders/${encodeURIComponent(orderId)}/contact`;

interface ContactStatus {
  phoneMasked: string | null;
  hasBackup: boolean;
  canAddBackup: boolean;
  whatsappSent: boolean;
}

/** The route's answer, parsed defensively — anything else is "no state". */
function parseStatus(v: unknown): ContactStatus | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.success !== true) return null;
  return {
    phoneMasked: typeof o.phone_masked === "string" ? o.phone_masked : null,
    hasBackup: o.has_backup === true,
    canAddBackup: o.can_add_backup === true,
    whatsappSent: o.whatsapp_sent === true,
  };
}

function useContactStatus(orderId?: string, proof?: string): ContactStatus | null {
  const [status, setStatus] = useState<ContactStatus | null>(null);
  useEffect(() => {
    if (!orderId || !proof) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = (attempt: number) => {
      fetch(contactUrl(orderId), { headers: { [PROOF_HEADER]: proof } })
        .then((r) => (r.ok ? r.json() : null))
        .then((body: unknown) => {
          if (!active) return;
          const next = parseStatus(body);
          if (!next) return;
          setStatus(next);
          if (!next.whatsappSent && attempt < WA_RECHECK_DELAYS_MS.length) {
            timer = setTimeout(() => check(attempt + 1), WA_RECHECK_DELAYS_MS[attempt]);
          }
        })
        .catch(() => {
          // Offline or the route is down: the card keeps showing the call
          // number and the order number. Nothing about the order is at
          // risk, and no state is invented in its place.
        });
    };
    check(0);
    return () => {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [orderId, proof]);
  return status;
}

type BackupError = "invalid" | "same" | "closed" | "failed";
type BackupState =
  | { kind: "idle" }
  | { kind: "open"; error: BackupError | null }
  | { kind: "saving" }
  | { kind: "saved" };

const BACKUP_ERROR_COPY: Record<BackupError, I18nString> = {
  invalid: STRINGS.backupInvalid,
  same: STRINGS.backupSame,
  closed: STRINGS.backupClosed,
  failed: STRINGS.backupFailed,
};

/** The route's refusal in the card's terms. `changed` = something else
 *  (P1's dispatch claim, the WhatsApp bot, staff) wrote the order between
 *  the route's read and its write; a retry re-reads the row, so it is
 *  "try again", not "closed". 404 = the proof expired: the order is past
 *  the point this page may change it, same as "closed". */
function backupError(status: number, body: unknown): BackupError {
  const code =
    body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
  if (code === "invalid_phone") return "invalid";
  if (code === "same_as_primary") return "same";
  if (code === "changed") return "failed";
  if (status === 409 || status === 404) return "closed";
  return "failed";
}

const fill = (s: string, vars: Record<string, string>) =>
  Object.entries(vars).reduce((out, [k, v]) => out.split(`{${k}}`).join(v), s);

const PILL_CLS = `inline-flex min-h-11 items-center justify-center gap-1 px-4 font-label text-sm font-bold ${PRESSABLE} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus`;

const PILL_STYLE = {
  border: INK_BORDER,
  borderRadius: "var(--bk-radius-pill, 9999px)",
  backgroundColor: "var(--bk-surface, #ffffff)",
  color: "var(--bk-ink, #1a1a1a)",
} as const;

const PRIMARY_PILL_STYLE = {
  ...PILL_STYLE,
  backgroundColor: "var(--bk-primary, #ff5a8a)",
  color: "var(--bk-on-primary, #ffffff)",
} as const;

export function CallCard({
  heading,
  whatsappSentCopy,
  tenant,
  contact,
  now,
  orderId,
  proof,
  orderNumber,
  locale,
  copyLabel,
  copiedLabel,
  children,
}: {
  /** Resolved by the section (merchant copy + first name). */
  heading: string;
  whatsappSentCopy: string;
  tenant: unknown;
  /** The store's `commerce.contact` (P4), as stored; validated here. */
  contact: StoreContactConfig | undefined;
  /** The request moment (`ctx.runtime.now`) — the order moment for the
   *  contact line's today / tomorrow variant. */
  now: Date;
  /** From the buyer's own stash, only when it belongs to this order. */
  orderId?: string;
  proof?: string;
  orderNumber: string;
  locale: LocaleCode;
  copyLabel: string;
  copiedLabel: string;
  /** The section's copyable order number. */
  children?: ReactNode;
}) {
  const t = (s: I18nString) => resolveI18n(s, locale);
  const status = useContactStatus(orderId, proof);

  // One number for the PDP line and this card: P4's structured call number
  // when the store set one, else the tracker's (phone_number, else WhatsApp).
  const callNumber = parseStoreContact(contact)?.call_number ?? resolveTrackerContact(tenant);
  // The card reports the WhatsApp from the send log (status.whatsappSent),
  // so the shared line is asked for its call-only lead here.
  const callOnlyContact = contact ? { ...contact, whatsapp_confirm: false } : undefined;
  const storeWhatsapp = resolveTenantWhatsapp(tenant);
  const storeName =
    (tenant as { business_name?: string | null } | null)?.business_name?.trim() ?? "";
  const callDisplay = callNumber ? formatIraqiPhoneDisplay(callNumber) : "";
  const callE164 = callNumber ? `+${whatsappDigits(callNumber)}` : "";
  const contactName = fill(t(STRINGS.contactName), { store: storeName }).trim();

  const wrongTemplate = t(STRINGS.wrongNumberMessage);
  const wrongMessage = orderNumber
    ? wrongTemplate.replace("{order}", orderNumber)
    : wrongTemplate.replace(/\s*\{order\}/g, "");
  const wrongHref = storeWhatsapp
    ? `https://wa.me/${whatsappDigits(storeWhatsapp)}?text=${encodeURIComponent(wrongMessage)}`
    : null;

  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);
  const copyNumber = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(callDisplay).then(
      () => setCopied(true),
      // Clipboard denied: the number is a tel: link and readable text, so
      // the buyer can still call it or long-press it — nothing to surface.
      () => setCopied(false),
    );
  };

  const [backup, setBackup] = useState<BackupState>({ kind: "idle" });
  const [backupValue, setBackupValue] = useState("");
  const inputId = useId();
  const errorId = useId();
  const saving = backup.kind === "saving";
  const backupErr = backup.kind === "open" ? backup.error : null;
  const canAddBackup = Boolean(
    orderId && proof && status?.canAddBackup && !status.hasBackup,
  );

  const submitBackup = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!orderId || !proof || saving) return;
    const normalized = normalizeIraqiMobile(backupValue);
    if (!normalized) {
      setBackup({ kind: "open", error: "invalid" });
      return;
    }
    setBackup({ kind: "saving" });
    let res: Response;
    try {
      res = await fetch(contactUrl(orderId), {
        method: "POST",
        headers: { "content-type": "application/json", [PROOF_HEADER]: proof },
        body: JSON.stringify({ phone: normalized }),
      });
    } catch {
      // Network failure: whether it landed is unknown. The route answers a
      // retry of the same number as success, so offering a retry is safe.
      setBackup({ kind: "open", error: "failed" });
      return;
    }
    if (res.ok) {
      setBackup({ kind: "saved" });
      return;
    }
    const body: unknown = await res.json().catch(() => null);
    setBackup({ kind: "open", error: backupError(res.status, body) });
  };

  return (
    <div
      data-testid="call-card"
      className="p-bk-lg text-center sm:p-bk-xl"
      style={CARD_STYLE}
    >
      <h1
        data-i18n-field="call_card_heading_i18n"
        className="font-display text-bk-h1 font-black text-balance"
        style={{ fontFamily: "var(--bk-font-display, inherit)" }}
      >
        {heading}
      </h1>

      {children}

      {status?.whatsappSent && (
        <p
          data-testid="call-card-whatsapp"
          data-i18n-field="call_card_whatsapp_sent_i18n"
          role="status"
          className="mx-auto mt-bk-sm flex max-w-prose items-center justify-center gap-bk-2xs font-body text-base font-bold text-pretty"
        >
          <MaterialIcon name="mark_chat_unread" className="text-xl" />
          {whatsappSentCopy}
        </p>
      )}

      {callNumber && (
        <div className="mt-bk-md flex flex-col items-center gap-bk-2xs">
          <span className={LABEL_CLS}>{t(STRINGS.callFrom)}</span>
          <a
            data-testid="call-card-number"
            href={`tel:${callE164}`}
            dir="ltr"
            className="font-display text-bk-h2 font-black tabular-nums underline-offset-4 hover:underline"
            style={{ fontFamily: "var(--bk-font-display, inherit)" }}
          >
            {callDisplay}
          </a>
          <div className="mt-bk-2xs flex flex-wrap items-center justify-center gap-bk-xs">
            <button
              type="button"
              onClick={copyNumber}
              aria-live="polite"
              className={PILL_CLS}
              style={PILL_STYLE}
            >
              <MaterialIcon name={copied ? "check" : "content_copy"} className="text-base" />
              {copied ? copiedLabel : copyLabel}
            </button>
            <a
              data-testid="call-card-save"
              href={vcardHref(buildVCard({ name: contactName, phoneE164: callE164 }))}
              download={vcardFileName(contactName)}
              className={PILL_CLS}
              style={PILL_STYLE}
            >
              <MaterialIcon name="person_add" className="text-base" />
              {t(STRINGS.saveContact)}
            </a>
          </div>
          <ContactLine
            contact={callOnlyContact}
            locale={locale}
            initialNow={now}
            className="mx-auto mt-bk-xs flex max-w-prose items-start justify-center gap-bk-2xs font-body text-sm text-pretty text-bk-ink-soft"
            iconClassName="text-base"
          />
        </div>
      )}

      {status?.phoneMasked && (
        <div
          data-testid="call-card-your-number"
          className="mt-bk-md flex flex-col items-center gap-bk-2xs"
        >
          <span className={LABEL_CLS}>{t(STRINGS.yourNumber)}</span>
          <span dir="ltr" className="font-display text-lg font-black tabular-nums">
            {status.phoneMasked}
          </span>
          {wrongHref && (
            <a
              data-testid="call-card-wrong-number"
              href={wrongHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center font-label text-sm font-bold underline underline-offset-4 text-bk-ink-soft hover:text-bk-ink"
            >
              {t(STRINGS.wrongNumber)}
            </a>
          )}
        </div>
      )}

      {backup.kind === "saved" ? (
        <p
          data-testid="call-card-backup-saved"
          role="status"
          className="mt-bk-md font-body text-sm font-bold"
        >
          {t(STRINGS.backupSaved)}
        </p>
      ) : canAddBackup ? (
        backup.kind === "idle" ? (
          <button
            data-testid="call-card-add-backup"
            type="button"
            onClick={() => setBackup({ kind: "open", error: null })}
            className={`mt-bk-md ${PILL_CLS}`}
            style={PILL_STYLE}
          >
            <MaterialIcon name="add_call" className="text-base" />
            {t(STRINGS.addBackup)}
          </button>
        ) : (
          <form
            data-testid="call-card-backup-form"
            onSubmit={submitBackup}
            noValidate
            className="mx-auto mt-bk-md max-w-sm text-start"
          >
            <label htmlFor={inputId} className={LABEL_CLS}>
              {t(STRINGS.backupLabel)}
            </label>
            <p className="mt-0.5 font-body text-sm text-bk-ink-soft">
              {t(STRINGS.addBackupHint)}
            </p>
            <div className="mt-bk-2xs flex items-stretch gap-bk-xs">
              <input
                id={inputId}
                name="backup_phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                dir="ltr"
                placeholder={t(STRINGS.backupPlaceholder)}
                value={backupValue}
                onChange={(e) => setBackupValue(e.target.value)}
                aria-invalid={backupErr ? true : undefined}
                aria-describedby={backupErr ? errorId : undefined}
                className="min-h-11 min-w-0 flex-1 px-3 font-body text-base tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus"
                style={{
                  border: INK_BORDER,
                  borderRadius: "var(--bk-radius-input, 0.75rem)",
                  backgroundColor: "var(--bk-surface, #ffffff)",
                  color: "var(--bk-ink, #1a1a1a)",
                }}
              />
              <button
                type="submit"
                disabled={saving}
                aria-busy={saving}
                className={PILL_CLS}
                style={PRIMARY_PILL_STYLE}
              >
                {saving ? t(STRINGS.saving) : t(STRINGS.saveBackup)}
              </button>
            </div>
            {backupErr && (
              <p
                id={errorId}
                data-testid="call-card-backup-error"
                role="alert"
                className="mt-bk-2xs font-body text-sm font-bold"
                style={{ color: "var(--bk-danger, #e2574c)" }}
              >
                {t(BACKUP_ERROR_COPY[backupErr])}
              </p>
            )}
          </form>
        )
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Wire it into the section**

In `packages/sections/src/order_confirmation.client.tsx`:

(a) Imports. Replace `import { resolveTenantWhatsapp, whatsappDigits } from "./helpers/whatsapp";` with:

```ts
import { resolveTenantWhatsapp, whatsappDigits } from "./helpers/whatsapp";
import { firstName } from "./pdp_express/text";
import { CallCard, STRINGS as CALL_CARD_STRINGS } from "./order_confirmation_call_card.client";
```

Then replace `import type { I18nString, LocaleCode } from "@scheniders/shared";` (line 32) with:

```ts
import type { I18nString, LocaleCode, StoreConfigV2 } from "@scheniders/shared";
```

(b) Greeting rule. Replace the whole `export function resolveGreeting(…) { … }` body (from `export function resolveGreeting(` through its closing `}`) with:

```ts
export function resolveGreeting(
  props: Pick<Props, "heading_i18n" | "heading_named_i18n">,
  locale: LocaleCode,
  name?: string,
): string {
  return greetingFrom(props.heading_i18n, props.heading_named_i18n, locale, name);
}

/** The greeting rule with the copy passed in — shared by the default
 *  heading and the call card's, so both follow the same `{name}` rule. */
export function greetingFrom(
  generic: I18nString,
  named: I18nString,
  locale: LocaleCode,
  name?: string,
): string {
  const fallback = resolveI18n(generic, locale);
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return fallback;
  const template = resolveI18n(named, locale);
  if (!template.includes("{name}")) return fallback;
  return template.replace("{name}", trimmed);
}
```

(c) In `OrderConfirmationRender`, directly after the `const heading = resolveGreeting(…);` statement, insert:

```ts
  // The call card greets by FIRST name ("تم يا علي"), from the same stash
  // under the same ownership rule as the default heading.
  const callCardName =
    stashIsThisOrder && stash.customer_name ? firstName(stash.customer_name) : undefined;
  // P4's structured contact, read the way the PDP reads it; the call card
  // takes its number and its "who contacts you" line from it.
  const commerce = (
    ctx.tenant as { store_config_v2?: StoreConfigV2 | null } | undefined
  )?.store_config_v2?.commerce;
```

(d) Replace the head card. The block starts at `<div className="p-bk-lg text-center sm:p-bk-xl" style={CARD_STYLE}>` and ends at its closing `</div>`, which comes right before `{recap && (`. The new block keeps the old one as the `else` branch, byte for byte:

```tsx
        {props.show_call_card === true ? (
          <CallCard
            heading={greetingFrom(
              props.call_card_heading_i18n ?? CALL_CARD_STRINGS.heading,
              props.call_card_heading_named_i18n ?? CALL_CARD_STRINGS.headingNamed,
              locale,
              callCardName,
            )}
            whatsappSentCopy={t(
              props.call_card_whatsapp_sent_i18n ?? CALL_CARD_STRINGS.whatsappSent,
            )}
            tenant={ctx.tenant}
            contact={commerce?.contact}
            now={ctx.runtime.now}
            orderId={stashIsThisOrder ? stash.order_id : undefined}
            proof={stashIsThisOrder ? stash.upsell_token : undefined}
            orderNumber={orderNumber}
            locale={locale}
            copyLabel={t(props.copy_label_i18n)}
            copiedLabel={t(props.copied_label_i18n)}
          >
            {orderNumber && (
              <OrderNumber
                value={orderNumber}
                label={t(props.order_label_i18n)}
                copyLabel={t(props.copy_label_i18n)}
                copiedLabel={t(props.copied_label_i18n)}
              />
            )}
          </CallCard>
        ) : (
          <div className="p-bk-lg text-center sm:p-bk-xl" style={CARD_STYLE}>
            <EyebrowChip glyph="sparkle" data-i18n-field="eyebrow_i18n">
              {t(props.eyebrow_i18n)}
            </EyebrowChip>
            <h1
              data-i18n-field="heading_i18n"
              className="mt-bk-sm font-display text-bk-h1 font-black text-balance"
              style={{ fontFamily: "var(--bk-font-display, inherit)" }}
            >
              {heading}
            </h1>
            <p
              data-i18n-field="call_promise_i18n"
              className="mx-auto mt-bk-xs max-w-prose font-body text-base text-pretty text-bk-ink-soft"
            >
              {t(props.call_promise_i18n)}
            </p>
            {orderNumber && (
              <OrderNumber
                value={orderNumber}
                label={t(props.order_label_i18n)}
                copyLabel={t(props.copy_label_i18n)}
                copiedLabel={t(props.copied_label_i18n)}
              />
            )}
          </div>
        )}
```

Everything after it stays in its current order, so all of it renders **below** the card: the recap, the steps, the ETA, `ReferralShare` and the WhatsApp/track/continue links. The page's `product_grid` (new arrivals) is a separate section after `order_confirmation`, so it is below too. `post_purchase_offer` placement is fixed in Task P5.8.

(e) Keep the documented tenant contract true (comment only). In `packages/sections/src/helpers/section-tenant.ts`, replace the lines P4.2 Step 8 wrote:

```ts
//                           (order_status_narratives), pdp_direct_order
//                           (contact: the "who contacts you" line)
```

with:

```ts
//                           (order_status_narratives), pdp_direct_order
//                           (contact: the "who contacts you" line),
//                           order_confirmation (contact: the call card)
```

- [ ] **Step 6: Run the card tests, the frozen default and every existing section test**

Run: `CI=true pnpm exec vitest run packages/sections/src/_order-confirmation-call-card.test.tsx packages/sections/src/_order-confirmation-baseline-snapshot.test.tsx packages/sections/src/_order-confirmation.test.tsx packages/sections/src/_order-confirmation-referral.test.tsx packages/sections/src/_no-hardcoded-white.test.tsx packages/sections/src/_registry.test.ts packages/sections/src/_render-smoke.test.tsx packages/sections/src/_pdp-contact-line.test.tsx`
Expected: all pass, with no snapshot written or changed. A baseline snapshot diff means the default markup moved: fix the code, never refresh the snapshot.

- [ ] **Step 7: Type-check and lint**

Run: `pnpm --filter @scheniders/storefront type-check && pnpm --filter @scheniders/storefront lint`
Expected: type-check exit 0, which covers `packages/sections` through the storefront import graph; lint adds no new errors.

- [ ] **Step 8: Commit**

```bash
git -C /Users/ali/scheniders-mono branch --show-current   # must print feat/pdp-entry-atelier
git -C /Users/ali/scheniders-mono add packages/sections/src/order_confirmation_call_card.client.tsx packages/sections/src/_order-confirmation-call-card.test.tsx packages/sections/src/order_confirmation.tsx packages/sections/src/order_confirmation.client.tsx packages/sections/src/helpers/section-tenant.ts
git -C /Users/ali/scheniders-mono -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): opt-in thank-you call card on order_confirmation" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task P5.7: Kurdish coverage: the call card, `EXPRESS_STRINGS`, and the coverage test

**Files:**
- Modify: `packages/sections/src/_kurdish-coverage.test.ts`. The `FILES` list is at lines 7-13; the regex at line 16.
- Modify: `packages/sections/src/pdp_express/strings.ts`. The whole file, lines 1-101 (54 keys; `referralRow` and `pointsRow`, added in 9b9e1f77, already carry `ku`).

- [ ] **Step 1: Make the test cover the new files (failing)**

In `packages/sections/src/_kurdish-coverage.test.ts`, replace lines 7-13:

```ts
const FILES = [
  "cart_line_items.client.tsx",
  "checkout_form.client.tsx",
  "order_confirmation_call_card.client.tsx",
  "order_tracker.client.tsx",
  "pdp_direct_order.client.tsx",
  "pdp_express/strings.ts",
  "search_results_grid.client.tsx",
];
```

Replace line 16 (`const m = /const STRINGS\s*(?::[^=]*)?=\s*\{/.exec(src);`) with:

```ts
  // `STRINGS` or a prefixed table such as the express layout's `EXPRESS_STRINGS`.
  const m = /const (?:[A-Z]+_)?STRINGS\s*(?::[^=]*)?=\s*\{/.exec(src);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `CI=true pnpm exec vitest run packages/sections/src/_kurdish-coverage.test.ts`
Expected:
- `order_confirmation_call_card.client.tsx: every entry has ku` passes.
- `pdp_express/strings.ts: every entry has ku` FAILs, with `missing` listing 52 keys, from `formTitle` through `clockAria`: every key except `referralRow` and `pointsRow`.

- [ ] **Step 3: Backfill Kurdish**

First check the file is still the 54-key version this step was written against: `grep -cE '^  [A-Za-z_]+: \{' packages/sections/src/pdp_express/strings.ts` must print `54`. If it prints anything else, keys were added since: do not paste the block below; add a `ku` line to each entry by hand instead, keeping every `en` and `ar` exactly as it is.

Replace `packages/sections/src/pdp_express/strings.ts` in full with:

```ts
// Chrome strings for the pdp_direct_order express layout (generic UI text,
// never merchant claims — those come from props). Every entry carries ar,
// en and ku — guarded by _kurdish-coverage, like the classic STRINGS.

export const EXPRESS_STRINGS = {
  formTitle: {
    en: "Start with your mobile number",
    ar: "اكتب رقم موبايلك ونكمل طلبك",
    ku: "ژمارەی مۆبایلەکەت بنووسە و داواکارییەکەت تەواو دەکەین",
  },
  phoneShort: {
    en: "The number is short: {count} of 11 digits",
    ar: "الرقم ناقص: {count} من 11 رقم",
    ku: "ژمارەکە کەمە: {count} لە 11 ژمارە",
  },
  phoneLong: {
    en: "The number is too long: Iraqi mobiles are 11 digits",
    ar: "الرقم أطول من اللازم: رقم الموبايل العراقي 11 رقم",
    ku: "ژمارەکە زۆر درێژە: مۆبایلی عێراقی 11 ژمارەیە",
  },
  phonePrefix: {
    en: "Iraqi mobile numbers start with 07",
    ar: "رقم الموبايل العراقي يبدي بـ 07",
    ku: "ژمارەی مۆبایلی عێراقی بە 07 دەست پێدەکات",
  },
  phoneOperator: {
    en: "Check the number: it should start 075, 077, 078 or 079",
    ar: "تأكد من الرقم: لازم يبدي بـ 075 أو 077 أو 078 أو 079",
    ku: "ژمارەکە بپشکنە: دەبێت بە 075، 077، 078 یان 079 دەست پێبکات",
  },
  brandLabel: { en: "Brand:", ar: "الشركة:", ku: "براند:" },
  men: { en: "Men", ar: "رجالي", ku: "پیاوان" },
  women: { en: "Women", ar: "نسائي", ku: "ئافرەتان" },
  unisex: { en: "Unisex", ar: "للجنسين", ku: "بۆ هەردووکیان" },
  greeting: { en: "Welcome, {name}", ar: "هلا {name}، نوّرتنا", ku: "بەخێربێیت {name}" },
  addressPrompt: { en: "Where should we deliver?", ar: "وين نوصّلها إلك؟", ku: "بۆ کوێی بگەیەنین؟" },
  addressPromptNamed: {
    en: "Where should we deliver, {name}?",
    ar: "وين نوصّلها إلك يا {name}؟",
    ku: "{name}، بۆ کوێی بگەیەنین؟",
  },
  phoneNextHint: {
    en: "Once the number is complete, we'll ask your name and address",
    ar: "بعد ما تكمل الرقم نسألك عن اسمك وعنوانك",
    ku: "کە ژمارەکەت تەواو کرد، ناو و ناونیشانت دەپرسین",
  },
  nameLabel: { en: "Your name", ar: "اسمك", ku: "ناوت" },
  phoneLabel: { en: "Phone number", ar: "رقم الموبايل", ku: "ژمارەی مۆبایل" },
  phoneHint: { en: "WhatsApp preferred", ar: "يفضّل عليه واتساب", ku: "واتسئاپ پەسەندترە" },
  governorateLabel: { en: "Governorate", ar: "المحافظة", ku: "پارێزگا" },
  addressLabel: { en: "Area and street", ar: "المنطقة والشارع", ku: "ناوچە و شەقام" },
  addressPlaceholder: {
    en: "e.g. Mansour, 14th Ramadan street",
    ar: "مثال: المنصور، شارع ١٤ رمضان",
    ku: "نموونە: مەنسوور، شەقامی ١٤ی ڕەمەزان",
  },
  landmarkLabel: { en: "Nearest landmark", ar: "أقرب نقطة دالة", ku: "نزیکترین شوێنی ناسراو" },
  optional: { en: "optional", ar: "اختياري", ku: "ئارەزوومەندانە" },
  landmarkPlaceholder: {
    en: "e.g. next to the Al-Rafidain bank",
    ar: "مثال: قرب مصرف الرافدين",
    ku: "نموونە: نزیک بانکی ڕافیدەین",
  },
  addAltPhone: { en: "Add a backup number", ar: "أضف رقم ثاني للاحتياط", ku: "ژمارەیەکی یەدەگ زیاد بکە" },
  altPhoneLabel: { en: "Backup number", ar: "رقم ثاني", ku: "ژمارەی یەدەگ" },
  quantity: { en: "Quantity", ar: "الكمية", ku: "بڕ" },
  payment: { en: "Payment", ar: "الدفع", ku: "پارەدان" },
  cashOnDelivery: { en: "Cash on delivery", ar: "كاش عند الاستلام", ku: "پارەدان لە کاتی وەرگرتن" },
  soon: { en: "Soon", ar: "قريباً", ku: "بەم زووانە" },
  qi_card: { en: "Qi Card", ar: "كي كارد", ku: "کی کارد" },
  zain_cash: { en: "Zain Cash", ar: "زين كاش", ku: "زەین کاش" },
  discount: { en: "OFF", ar: "خصم", ku: "داشکاندن" },
  priceSr: {
    en: "Price {new}, struck price {old}",
    ar: "السعر {new}، والسعر المشطوب {old}",
    ku: "نرخ {new}، نرخی پێشوو {old}",
  },
  youSave: { en: "You save {amount}", ar: "توفّر {amount}", ku: "{amount} پاشەکەوت دەکەیت" },
  onQty: { en: "on {count} pieces", ar: "على {count} قطع", ku: "لەسەر {count} دانە" },
  delivery: { en: "Delivery", ar: "التوصيل", ku: "گەیاندن" },
  deliveryFreeEverywhere: {
    en: "Free to every governorate",
    ar: "مجاني لكل المحافظات",
    ku: "بەخۆڕایی بۆ هەموو پارێزگاکان",
  },
  deliveryFree: { en: "Free", ar: "مجاني", ku: "بەخۆڕایی" },
  deliveryPending: { en: "Choose governorate", ar: "اختر المحافظة", ku: "پارێزگا هەڵبژێرە" },
  savingsRow: { en: "Your saving", ar: "توفيرك", ku: "پاشەکەوتەکەت" },
  referralRow: { en: "Friend's code", ar: "خصم رمز صديقك", ku: "داشکاندنی کۆدی هاوڕێ" },
  pointsRow: { en: "Your points", ar: "خصم نقاطك", ku: "داشکاندنی خاڵەکانت" },
  totalPlain: { en: "Total", ar: "المجموع", ku: "کۆی گشتی" },
  whatsapp: { en: "Order on WhatsApp", ar: "اطلب عبر واتساب", ku: "لە ڕێگەی واتسئاپەوە داوا بکە" },
  whatsappShort: { en: "WhatsApp", ar: "واتساب", ku: "واتسئاپ" },
  scrollHint: {
    en: "Scroll down to finish your order",
    ar: "انزل لتحت حتى تكمل طلبك",
    ku: "بۆ خوارەوە بڕۆ تاکو داواکارییەکەت تەواو بکەیت",
  },
  morePhotos: { en: "See {count} photos", ar: "شوف {count} صور", ku: "{count} وێنە ببینە" },
  photoOf: { en: "Photo {n} of {total}", ar: "صورة {n} من {total}", ku: "وێنەی {n} لە {total}" },
  reviews: { en: "{count} reviews", ar: "{count} تقييم", ku: "{count} هەڵسەنگاندن" },
  sizeMl: { en: "{n} ml", ar: "{n} مل", ku: "{n} مل" },
  aboutScent: { en: "About the scent", ar: "عن العطر", ku: "دەربارەی بۆنەکە" },
  readMore: { en: "Read more", ar: "اقرأ المزيد", ku: "زیاتر بخوێنەوە" },
  readLess: { en: "Show less", ar: "أقل", ku: "کەمتر" },
  trustListLabel: { en: "Our promises", ar: "وعودنا إلك", ku: "بەڵێنەکانمان بۆت" },
  clockAria: {
    en: "{label} {h} hours {m} minutes",
    ar: "{label} {h} ساعة و{m} دقيقة",
    ku: "{label} {h} کاتژمێر و {m} خولەک",
  },
} as const;

export type ExpressStringKey = keyof typeof EXPRESS_STRINGS;
```

Then prove that only `ku` was added: every `en` and `ar` literal, in order, is the same as in the last commit.

Run: `diff <(git -C /Users/ali/scheniders-mono show HEAD:packages/sections/src/pdp_express/strings.ts | grep -oE '\b(en|ar): "[^"]*"') <(grep -oE '\b(en|ar): "[^"]*"' /Users/ali/scheniders-mono/packages/sections/src/pdp_express/strings.ts) && grep -cE '^  [A-Za-z_]+: \{' /Users/ali/scheniders-mono/packages/sections/src/pdp_express/strings.ts`
Expected: `diff` prints nothing, then `54`.

- [ ] **Step 4: Run coverage and the express suites (ar/en markup must not move)**

Run: `CI=true pnpm exec vitest run packages/sections/src/_kurdish-coverage.test.ts packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_pdp-express-form.test.tsx packages/sections/src/_pdp-express-cta.test.tsx packages/sections/src/_pdp-express-trust.test.tsx packages/sections/src/pdp_express`
Expected: all pass, with no snapshot written or changed. Those suites render ar/en, and an added `ku` key changes neither.

- [ ] **Step 5: Commit**

```bash
git -C /Users/ali/scheniders-mono branch --show-current   # must print feat/pdp-entry-atelier
git -C /Users/ali/scheniders-mono add packages/sections/src/_kurdish-coverage.test.ts packages/sections/src/pdp_express/strings.ts
git -C /Users/ali/scheniders-mono -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(sections): Kurdish for the express layout and the call card, under the coverage guard" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task P5.8: Signature template: the post-purchase offer goes below `order_confirmation` (v3)

The live scheniders-iraq `checkout_success` page (published and draft, verified by SQL) is `[order_confirmation, product_grid]`, so new arrivals are already below the card. The only stack that puts an upsell **above** it is the signature direction (`apps/platform/lib/store-templates/scheniders-signature.ts:585-589`). New stores get that order, and so does any store that takes the template update that adds the offer.

Upgrades only ever *add* sections, so a store that already has the offer keeps its own order. Reordering stays in the merchant's builder.

**Files:**
- Modify: `apps/platform/lib/store-templates/scheniders-signature.ts`. Version at lines 343-347; `checkout_success` at lines 583-589.
- Modify: `apps/platform/lib/store-templates/upgrade.test.ts`. Lines 68-71 and 111-119.
- Modify: `apps/platform/lib/store-templates/signature-parity.test.ts`. Lines 22-26.
- Modify: `apps/platform/lib/starter-store.test.ts`. Line 312.
- Regenerate: `apps/platform/lib/store-templates/__snapshots__/signature-parity.test.ts.snap`

- [ ] **Step 1: Update the expectations (failing)**

`upgrade.test.ts`. Replace lines 68-71 (the `// The offer leads the thank-you page …` comment through `expect(offer.after_type).toBeNull();`; line 72, `expect(hasTemplateUpdate(p)).toBe(true);`, stays):

```ts
        // v3: the order confirmation (and its call card) leads the thank-you
        // page; the offer follows it.
        const offer = required(p.additions.find((a) => a.type === "post_purchase_offer"), "post_purchase_offer");
        expect(offer.page_id).toBe("checkout_success");
        expect(offer.after_type).toBe("order_confirmation");
```

Replace lines 111-119 (the whole `it("puts the post-purchase offer back at the top of the thank-you page", …)` block):

```ts
    it("puts the post-purchase offer under the order confirmation", () => {
        const old = v1Signature();
        const next = applyTemplateUpgrade(old, plan(old));
        expect(page(next, "checkout_success").sections.map((s) => s.type)).toEqual([
            "order_confirmation",
            "post_purchase_offer",
            "product_grid",
        ]);
    });
```

`signature-parity.test.ts`. Replace lines 22-26 (the `it("is at the version its section stacks say it is", …)` block; line 21, `describe("scheniders_signature parity", () => {`, stays):

```ts
    it("is at the version its section stacks say it is", () => {
        // v2 added product_attributes (product) and post_purchase_offer
        // (checkout_success); v3 moved the offer below order_confirmation.
        expect(schenidersSignatureTemplate.version).toBe(3);
    });
```

`starter-store.test.ts`. Replace line 312, `expect(cfg.template?.version).toBe(2);`, with:

```ts
        expect(cfg.template?.version).toBe(3);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `CI=true pnpm exec vitest run apps/platform/lib/store-templates/upgrade.test.ts apps/platform/lib/store-templates/signature-parity.test.ts apps/platform/lib/starter-store.test.ts`
Expected:
- `after_type` gets `null` where `"order_confirmation"` is expected.
- The order assertion fails.
- The version tests get `2` where `3` is expected.

- [ ] **Step 3: Change the template**

`scheniders-signature.ts`. Replace lines 343-347 (the `// v2 places two sections …` comment and `version: 2,`) with:

```ts
        // v2 placed two sections this program shipped: the product's own
        // specs and the post-purchase offer. Both render nothing until the
        // merchant has the data behind them, so placing them costs a store
        // with no attributes or order bumps nothing.
        // v3 moves the post-purchase offer below order_confirmation, so the
        // thank-you call card (order_confirmation.show_call_card) is the
        // first thing a buyer sees; the offer still renders, one block down.
        version: 3,
```

Replace lines 583-589 (the `// A one-tap add …` comment through the closing `],` of `checkout_success`) with:

```ts
            // The order confirmation leads: with its call card on, it is the
            // brief for the confirmation call, and nothing may push it below
            // the fold. The one-tap add to the order just placed follows,
            // while the order is still editable; it renders nothing until an
            // order bump is configured.
            checkout_success: [
                s("order_confirmation"),
                s("post_purchase_offer"),
                s("product_grid", { card_style: "price_pill" }),
            ],
```

- [ ] **Step 4: Regenerate the parity snapshot and check that only the order moved**

Run: `CI=true pnpm exec vitest run apps/platform/lib/store-templates/signature-parity.test.ts -u`
Then run: `git -C /Users/ali/scheniders-mono diff --stat -- apps/platform/lib/store-templates/__snapshots__/signature-parity.test.ts.snap && git -C /Users/ali/scheniders-mono diff -- apps/platform/lib/store-templates/__snapshots__/signature-parity.test.ts.snap | grep -E '^[+-] ' | grep -v '^[+-]\s*$' | head -40`
Expected: the only changed lines belong to the `checkout_success` sections array, with the `post_purchase_offer` block moving after `order_confirmation`. No other page, prop or token may change. If anything else moved, stop and investigate instead of committing.

- [ ] **Step 5: Run every template suite**

Run: `CI=true pnpm exec vitest run apps/platform/lib/store-templates apps/platform/lib/starter-store.test.ts apps/platform/lib/store-config-publish-allowlist.test.ts apps/platform/components/store-builder-v2/template-updates-screen.test.tsx`
Expected: all pass.

- [ ] **Step 6: Type-check and lint the platform**

Run: `pnpm --filter @scheniders/platform type-check && pnpm --filter @scheniders/platform lint`
Expected: type-check exit 0; lint adds no errors. About 1,380 warnings is the known baseline.

- [ ] **Step 7: Commit**

```bash
git -C /Users/ali/scheniders-mono branch --show-current   # must print feat/pdp-entry-atelier
git -C /Users/ali/scheniders-mono add apps/platform/lib/store-templates/scheniders-signature.ts apps/platform/lib/store-templates/upgrade.test.ts apps/platform/lib/store-templates/signature-parity.test.ts apps/platform/lib/starter-store.test.ts apps/platform/lib/store-templates/__snapshots__/signature-parity.test.ts.snap
git -C /Users/ali/scheniders-mono -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(templates): signature v3 puts the post-purchase offer below the order confirmation" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task P5.9: Verify the whole piece

**Files:** none (verification only).

- [ ] **Step 1: Every suite P5 touches, in one run**

Run: `CI=true pnpm exec vitest run packages/sections packages/shared/src/phone.test.ts apps/storefront/app/api/checkout/orders apps/storefront/app/api/referral apps/storefront/lib/order-upsell-proof.test.ts apps/platform/lib/store-templates apps/platform/lib/starter-store.test.ts apps/platform/components/store-builder-v2/template-updates-screen.test.tsx`
Expected: 0 failed, no snapshot written. Paste the summary line into the hand-off.

- [ ] **Step 2: The CI gate**

Run: `pnpm type-check && pnpm lint`
Expected: both exit 0.

- [ ] **Step 3: Tenant scoping, re-read from the code**

Run: `grep -n 'tenant_id\|tenantId' "apps/storefront/app/api/checkout/orders/[id]/contact/route.ts"`
Expected:
- Every `.from("orders")` and `.from("whatsapp_logs")` chain carries `.eq("tenant_id", tenantId)`.
- `tenantId` is assigned only from `provenTenant(...)`.
- No body field or query param is read for it.

No migration, no new table, and no RLS change in P5.

---

### Task P5.10 (gated: run only after the merchant approves turning the card on): enable it in the **draft** and check it live

**Files:** none. This is a DB write to `tenants.store_config_v2_draft` for scheniders-iraq only. Published config is untouched; publishing stays the merchant's action in the builder. Make sure nobody has the store builder open for this tenant, because a builder save would overwrite the draft.

- [ ] **Step 1: Set `show_call_card: true` on the draft's `order_confirmation`** (Supabase MCP `execute_sql`, project `sduvpgqwhxragxtxztur`)

```sql
update tenants t
set store_config_v2_draft = jsonb_set(
  t.store_config_v2_draft,
  '{pages}',
  (
    select jsonb_agg(
      case
        when p->>'page_id' = 'checkout_success' then jsonb_set(
          p,
          '{sections}',
          (
            select jsonb_agg(
              case
                when s->>'type' = 'order_confirmation'
                  then jsonb_set(s, '{base,show_call_card}', 'true'::jsonb, true)
                else s
              end
              order by s_ord
            )
            from jsonb_array_elements(p->'sections') with ordinality as sx(s, s_ord)
          )
        )
        else p
      end
      order by p_ord
    )
    from jsonb_array_elements(t.store_config_v2_draft->'pages') with ordinality as px(p, p_ord)
  )
),
    -- Same reason as P4.4: the builder offers its local crash backup only
    -- when it is newer than updated_at (use-store-builder-v2.ts EC33), so an
    -- older backup must not bring back a draft without this flag.
    updated_at = now()
where t.slug = 'scheniders-iraq';
```

Only `pages` is rewritten, so P4.4's `commerce.contact` stays as it is, and so does `show_contact_line`, which is on a `pdp_direct_order` section outside `checkout_success`. Check it after the verify query below: `select store_config_v2_draft->'commerce'->'contact' from tenants where slug='scheniders-iraq';` must still return `{"call_number": "07779703832", "whatsapp_confirm": …}`, with the value P4.4 wrote.

Verify:

```sql
select p->>'page_id' as page,
       jsonb_path_query_array(p->'sections', '$[*].type') as types,
       (select s->'base'->'show_call_card' from jsonb_array_elements(p->'sections') s where s->>'type' = 'order_confirmation') as call_card
from tenants t, jsonb_array_elements(t.store_config_v2_draft->'pages') p
where t.slug = 'scheniders-iraq' and p->>'page_id' = 'checkout_success';
```

Expected: `types = ["order_confirmation", "product_grid"]` and `call_card = true`. Then run the same query against `store_config_v2`: published must still have `call_card = null`.

- [ ] **Step 2: Live draft-view order (local)**

1. `pnpm dev:storefront` (port 3001).
2. Get a product slug: `select slug from products where tenant_id = (select id from tenants where slug='scheniders-iraq') and status='active' and is_visible limit 1;`
3. Open `http://localhost:3001/api/draft-view?tenant=scheniders-iraq&token=dev-preview-token&to=/s/scheniders-iraq/products/<slug>`. No `PREVIEW_TOKEN_SECRET` is set locally, so the dev token is accepted.
4. Place an order with phone `0770 123 4567`.

Expected on `/checkout/success`:
- `تم يا <first name>، طلبك ثابت`
- the order number
- `0777 970 3832` with copy and save
- under it, P4's line from the draft `commerce.contact` (P4.4 wrote `call_number: 07779703832`, no hours): «راح يوصلك اتصال من 0777 970 3832 لتأكيد طلبك — رد علينا ويطلع طلبك», with no WhatsApp promise
- `0770 ••• 4567` with «الرقم غلط؟ راسلنا»
- «أضف رقم ثاني»
- **no** WhatsApp line. A draft-view order is `is_test`, piece 1 sends nothing, so there is no log row.

Add `0780 111 2222`. Then confirm and clean up:

```sql
select id, order_id, is_test, phone, secondary_phone, status
from orders
where tenant_id = (select id from tenants where slug='scheniders-iraq')
order by created_at desc limit 1;
```

Expected: `is_test = true`, `secondary_phone = '07801112222'`. Then soft-delete it the way the orders UI does (`apps/platform/app/api/orders/delete/route.ts` sets `deleted_at`), guarded so only this test order can match:

```sql
update orders
set deleted_at = now()
where id = '<id from the query above>'
  and tenant_id = (select id from tenants where slug='scheniders-iraq')
  and is_test = true
  and deleted_at is null
returning order_id;
```

Expected: one row. Record that `order_id` in the hand-off.

If the Playwright MCP wedges ("Browser is already in use"), use the jsdom suite from P5.6 as the behavioural proof, and say in the hand-off that the live click-through was not done.