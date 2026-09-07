// Phase 2D (signature audit) — pdp_direct_order buy-box form UX. Static
// markup renders only (no DOM lib in this package): each case pins a
// structural guarantee the audit called out (P1-1..3, P2-8, P2-9, P2-11)
// so a future restyle cannot quietly regress it.

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import pdp_direct_order from "./pdp_direct_order";
import type { SectionRenderContext } from "./_types";
import type { Product } from "./types";

type Props = typeof pdp_direct_order.defaultProps;

const runtime = {
  page_id: "product" as const,
  breakpoint: "mobile" as const,
  locale: "ar" as const,
  audience_segments: [],
  ab_test_arms: {},
  now: new Date("2026-09-07T00:00:00Z"),
};

const tenant = {
  id: "tenant-1",
  business_name: "متجر",
  store_config: { contact: { whatsapp_number: "07701234567" } },
};

const product: Product = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "عطر تجريبي",
  price: 25000,
  stock_quantity: 10,
  reserved_quantity: 0,
  is_archived: false,
  feature_cards: [{ title: "ثبات", body: "يدوم طول اليوم" }],
};

function render(
  props: Partial<Props> = {},
  ctx: Partial<SectionRenderContext> = {},
): string {
  const Render = pdp_direct_order.render;
  return renderToStaticMarkup(
    React.createElement(
      StoreBaseProvider,
      { base: "", children: null },
      React.createElement(Render, {
        props: { ...pdp_direct_order.defaultProps, ...props },
        ctx: {
          tenant: tenant as never,
          runtime,
          products: [],
          categories: [],
          product,
          ...ctx,
        },
      }),
    ),
  );
}

/** `<label for="…">` targets and the `id="…"` set actually rendered. */
function labelTargets(html: string): string[] {
  return [...html.matchAll(/<label[^>]*\bfor="([^"]+)"/g)].map((m) => m[1]);
}
function ids(html: string): Set<string> {
  return new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
}

describe("pdp_direct_order form labels (P1-3)", () => {
  it("renders a visible label for each of the five fields, each linked to its control", () => {
    const html = render();
    const targets = labelTargets(html);
    expect(targets).toHaveLength(5);
    const rendered = ids(html);
    for (const target of targets) expect(rendered.has(target)).toBe(true);
    expect(html).toContain("الاسم الكامل");
    expect(html).toContain("رقم الهاتف");
    expect(html).toContain("رقم بديل");
    expect(html).toContain("المحافظة");
    expect(html).toContain("العنوان");
  });

  it("uses dir=auto on name/address and autocomplete tokens on every field", () => {
    const html = render();
    const name = html.match(/<input[^>]*name="name"[^>]*>/)?.[0];
    const phone = html.match(/<input[^>]*name="phone"[^>]*>/)?.[0];
    const alt = html.match(/<input[^>]*name="alt_phone"[^>]*>/)?.[0];
    const gov = html.match(/<select[^>]*>/)?.[0];
    const address = html.match(/<input[^>]*name="address"[^>]*>/)?.[0];
    // React's static renderer keeps the camelCase attribute spelling
    // (autoComplete / inputMode); browsers read them case-insensitively.
    expect(name).toContain('dir="auto"');
    expect(name).toMatch(/autocomplete="name"/i);
    expect(phone).toMatch(/autocomplete="tel-national"/i);
    expect(phone).toMatch(/inputmode="tel"/i);
    expect(phone).not.toContain("pattern=");
    expect(alt).toMatch(/autocomplete="tel"/i);
    expect(alt).not.toContain("pattern=");
    expect(gov).toMatch(/autocomplete="address-level1"/i);
    expect(gov).toContain("required");
    expect(address).toContain('dir="auto"');
    expect(address).toMatch(/autocomplete="street-address"/i);
  });
});

describe("pdp_direct_order governorate (P1-2)", () => {
  it("starts on a disabled, selected placeholder — never a silent Baghdad", () => {
    const html = render();
    const placeholder = html.match(
      /<option[^>]*value=""[^>]*>[^<]*<\/option>/,
    )?.[0];
    expect(placeholder).toBeDefined();
    expect(placeholder).toContain("disabled");
    expect(placeholder).toContain("selected");
    expect(placeholder).toContain("اختر المحافظة");
    // Only the placeholder is selected.
    expect(html.match(/<option[^>]*\bselected\b/g)).toHaveLength(1);
    // Delivery fee is unknown until a governorate is chosen.
    expect(html).toMatch(/data-delivery-fee[^>]*>—</);
  });

  it("prefills from the runtime governorate (sb_gov cookie) when present", () => {
    const html = render({}, { runtime: { ...runtime, governorate: "BA" } });
    const selected = html.match(/<option[^>]*\bselected\b[^>]*>/)?.[0];
    expect(selected).toContain('value="BA"');
    expect(html).not.toMatch(/data-delivery-fee[^>]*>—</);
  });

  it("shows the select's chevron alongside the map pin", () => {
    const html = render();
    expect(html).toContain("expand_more");
    expect(html).toContain("location_on");
  });
});

describe("pdp_direct_order quantity stepper (P2-8)", () => {
  it("uses 44px targets, a live <output>, and marks the minus as disabled at 1", () => {
    const html = render();
    const buttons = html.match(
      /<button[^>]*aria-label="(إنقاص|زيادة) الكمية"[^>]*>/g,
    );
    expect(buttons).toHaveLength(2);
    for (const b of buttons ?? []) {
      expect(b).toContain("h-11");
      expect(b).toContain("w-11");
    }
    expect(buttons?.[0]).toContain('aria-disabled="true"');
    expect(buttons?.[1]).not.toContain("aria-disabled");
    expect(html).toMatch(/<output[^>]*aria-live="polite"[^>]*>1<\/output>/);
    expect(html).toMatch(/<output[^>]*tabular-nums/);
  });

  it("renders Latin step numerals in Arabic", () => {
    const html = render();
    expect(html).toContain(">01<");
    expect(html).toContain(">02<");
    expect(html).not.toContain("٠١");
  });
});

describe("pdp_direct_order submit (P2-8)", () => {
  it("keeps the submit enabled with the brand focus ring; disables only when sold out", () => {
    const html = render();
    const submit = html.match(/<button[^>]*type="submit"[^>]*>/)?.[0];
    expect(submit).toBeDefined();
    expect(submit).not.toContain("disabled");
    expect(html).toContain("focus-visible:ring-bk-focus");
    expect(html).not.toContain("focus:ring-2");

    const oos = render({}, { product: { ...product, stock_quantity: 0 } });
    const oosSubmit = oos.match(/<button[^>]*type="submit"[^>]*>/)?.[0];
    expect(oosSubmit).toContain("disabled");
    expect(oos).toContain("نفد المخزون");
  });
});

describe("pdp_direct_order schema safety (P2-9)", () => {
  it("falls back to max_qty 10 for an out-of-range editor value", () => {
    const parsed = pdp_direct_order.schema.safeParse({
      ...pdp_direct_order.defaultProps,
      max_qty: 25,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.max_qty).toBe(10);
    const zero = pdp_direct_order.schema.safeParse({
      ...pdp_direct_order.defaultProps,
      max_qty: 0,
    });
    expect(zero.success).toBe(true);
    if (zero.success) expect(zero.data.max_qty).toBe(10);
  });

  it("defaultProps satisfy the schema", () => {
    expect(
      pdp_direct_order.schema.safeParse(pdp_direct_order.defaultProps).success,
    ).toBe(true);
  });
});

describe("pdp_direct_order neutral copy + optional lines (P2-11)", () => {
  it("defaults the feature-cards heading to a neutral, non-perfume title", () => {
    const html = render();
    expect(html).toContain("مميزات المنتج");
    expect(html).not.toContain("العطر");
    expect(pdp_direct_order.defaultProps.feature_cards_title_i18n).toEqual({
      en: "Product highlights",
      ar: "مميزات المنتج",
    });
  });

  it("hides reassurance_i18n / delivery_sla_i18n when empty and renders them when set", () => {
    const bare = render();
    expect(bare).not.toContain('data-i18n-field="reassurance_i18n"');
    expect(bare).not.toContain('data-i18n-field="delivery_sla_i18n"');

    const filled = render({
      reassurance_i18n: { ar: "تفتح وتجرب قبل ما تدفع" },
      delivery_sla_i18n: { ar: "التوصيل خلال 24–48 ساعة" },
    });
    expect(filled).toContain('data-i18n-field="reassurance_i18n"');
    expect(filled).toContain("تفتح وتجرب قبل ما تدفع");
    expect(filled).toContain('data-i18n-field="delivery_sla_i18n"');
    expect(filled).toContain("التوصيل خلال 24–48 ساعة");
  });

  it("reads the returns window from the tenant's commerce config", () => {
    const html = render(
      {},
      {
        tenant: {
          ...tenant,
          store_config_v2: { commerce: { returns_policy: { window_days: 7 } } },
        } as never,
      },
    );
    expect(html).toContain("إرجاع خلال 7 أيام");
  });
});
