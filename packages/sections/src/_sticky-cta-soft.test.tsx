// =====================================================================
// sticky_cta_bar — the soft, form-aware bar with the WhatsApp icon (1f)
// =====================================================================
// Server markup of the opted-in bar: no ink outline and no hard shadow
// (I14), the price at the 12px floor with a red strike (D4), the 52px
// WhatsApp square named «راسلنا واتساب» and prefilled with the product,
// yellow only on the primary, no dir attribute and no colour literal. On
// the server the form has not reported yet, so the label is the start
// label; the four states are covered by sticky_cta_bar.form-aware.test.ts
// and _sticky-cta-form-aware-dom.test.tsx.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import sticky_cta_bar from "./sticky_cta_bar";
import type { Props } from "./sticky_cta_bar";
import type { SectionRenderContext } from "./_types";
import type { Product } from "./types";
import { IRAQ_DRAFT_STICKY_PROPS, IRAQ_DRAFT_TENANT, productCtx, productRuntime, saleProduct } from "./_pdp-fixtures";
import { displayNameOf } from "./pdp_express/identity-label";

const SOFT: Props = {
  ...IRAQ_DRAFT_STICKY_PROPS,
  primary_kind: "form_aware",
  style: "soft",
  secondary_display: "icon",
};

/** `product: null` renders the bar off a product page (the cart). */
function render(props: Props, product: Product | null = saleProduct, over: Partial<SectionRenderContext> = {}) {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <sticky_cta_bar.render
        props={props}
        ctx={productCtx(product ?? undefined, { tenant: IRAQ_DRAFT_TENANT, ...over })}
      />
    </StoreBaseProvider>,
  );
}

describe("sticky_cta_bar soft + form_aware + icon", () => {
  const html = render(SOFT);

  it("the soft bar: surface, hairline, no ink outline, no hard shadow, no colour literal", () => {
    expect(html).toContain('data-sticky-style="soft"');
    expect(html).toContain("border-t border-bk-divider bg-bk-surface");
    expect(html).not.toContain("--bk-border-thickness");
    expect(html).not.toContain("shadow-[");
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgba?\(/);
    expect(html).not.toContain(' dir="');
  });

  it("starts hidden while the form shows (hide_while form), as today", () => {
    expect(html).toContain('aria-hidden="true" inert=""');
    expect(html).toContain("translate-y-full");
  });

  it("the primary: yellow, token radius and shadow, the start label, a button that never submits", () => {
    expect(html).toMatch(/<button type="button" class="[^"]*rounded-bk-input bg-bk-primary [^"]*shadow-bk-button[^"]*" data-sticky-primary="none">/);
    expect(html).toContain(">اطلب الآن<");
    expect(html).not.toContain('type="submit"');
    expect(html.split("bg-bk-primary ").length - 1).toBe(1);
  });

  it("the price on the surface: struck price in red at 12px, the price at 17px", () => {
    expect(html).toContain('<s class="font-bk-body text-xs font-semibold text-bk-ink-faint decoration-bk-danger"><bdi>32,000 د.ع</bdi></s>');
    expect(html).toContain("text-[17px] font-black text-bk-ink\"><bdi>25,000 د.ع</bdi>");
    expect(html).not.toMatch(/text-\[(?:10|11)px\]/);
  });

  it("the WhatsApp square: 52px, green glyph, «راسلنا واتساب», prefilled with the product", () => {
    const text = encodeURIComponent(`هلا، أريد أطلب ${displayNameOf(saleProduct)}`);
    expect(html).toContain(
      `<a href="https://wa.me/9647701234567?text=${text}" target="_blank" rel="noopener noreferrer" aria-label="راسلنا واتساب"`,
    );
    expect(html).toContain('data-sticky-secondary="icon"');
    expect(html).toContain("h-[52px] w-[52px]");
    expect(html).toContain("text-bk-success");
  });

  it("the merchant's prefill wins; english names the action in english", () => {
    const own = render({ ...SOFT, whatsapp_prefill_i18n: { ar: "عندي سؤال عن {product}" } });
    expect(own).toContain(`?text=${encodeURIComponent(`عندي سؤال عن ${displayNameOf(saleProduct)}`)}`);
    const en = render(SOFT, saleProduct, { runtime: { ...productRuntime, locale: "en" } });
    expect(en).toContain('aria-label="WhatsApp us"');
    expect(en).toContain(">Order now<");
    expect(en).toContain('aria-label="Quick actions"');
  });

  it("reads right to left in Arabic, left to right in English, with a class", () => {
    expect(html).toMatch(/data-sticky-style="soft"/);
    expect(html).toMatch(/class="fixed [^"]*flex-row-reverse/);
    const en = render(SOFT, saleProduct, { runtime: { ...productRuntime, locale: "en" } });
    expect(en).not.toMatch(/class="fixed [^"]*flex-row-reverse/);
  });
});

describe("sticky_cta_bar 1f pieces on their own", () => {
  it("the icon on the chunky bar keeps the chunky primary", () => {
    const html = render({ ...IRAQ_DRAFT_STICKY_PROPS, secondary_display: "icon" });
    expect(html).toContain('data-sticky-secondary="icon"');
    expect(html).toContain("border:var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)");
  });

  it("soft with the labelled secondary: the soft WhatsApp tile, bare link", () => {
    const html = render({ ...IRAQ_DRAFT_STICKY_PROPS, style: "soft" });
    expect(html).toContain('data-sticky-secondary="button"');
    expect(html).toContain('href="https://wa.me/9647701234567"');
    expect(html).toContain(">واتساب</a>");
    expect(html).toContain('data-sticky-primary="scroll"');
  });

  it("soft link primary on the cart: an anchor, no product, so no prefill", () => {
    const html = render(
      { ...sticky_cta_bar.defaultProps, style: "soft", secondary_display: "icon" },
      null,
    );
    expect(html).toContain('<a href="/s/fixture-store/checkout"');
    expect(html).toContain('data-sticky-primary="link"');
    expect(html).toContain('href="https://wa.me/9647701234567" target="_blank"');
  });

  it("form_aware on the chunky bar renders the start label on the server", () => {
    const html = render({ ...IRAQ_DRAFT_STICKY_PROPS, primary_kind: "form_aware" });
    expect(html).toContain('type="button">اطلب الآن</button>');
  });
});
