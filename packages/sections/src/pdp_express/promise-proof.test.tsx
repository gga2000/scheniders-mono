// Express `tagline_i18n` and `cta_proof` (Envoy A/B test, arm B): one
// promise line under the product name, and one real customer quote between
// the receipt and the order buttons. Absent renders today's markup
// byte-identically, so arm A (and every other store) is unchanged.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "../helpers/store-context";
import pdp_direct_order from "../pdp_direct_order";
import type { Props } from "../pdp_direct_order";
import { EXPRESS_IRAQ_DRAFT_PDP_PROPS, productCtx, saleProduct } from "../_pdp-fixtures";

function render(props: Props, locale: "ar" | "en" = "ar"): string {
  const ctx = productCtx(saleProduct);
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <pdp_direct_order.render
        props={pdp_direct_order.schema.parse(props)}
        ctx={{ ...ctx, runtime: { ...ctx.runtime, locale } }}
      />
    </StoreBaseProvider>,
  );
}

const TAGLINE = { ar: "العطر اللي راح يسألونك عليه", en: "The scent people ask you about" };
const PROOF = {
  quote_i18n: { ar: "اول مره يوصلني عطر ويطلع كلام الاعلان كله صحيح", en: "It was all true" },
  source_i18n: { ar: "زياد، تعليق على إعلاننا بتيك توك", en: "Ziad, on our TikTok ad" },
};

describe("pdp_direct_order express — tagline_i18n", () => {
  it("renders one line right under the name", () => {
    const html = render({ ...EXPRESS_IRAQ_DRAFT_PDP_PROPS, tagline_i18n: TAGLINE });
    const h1End = html.indexOf("</h1>");
    const line = html.indexOf('data-i18n-field="tagline_i18n"');
    expect(h1End).toBeGreaterThan(-1);
    expect(line).toBeGreaterThan(h1End);
    expect(html).toContain("العطر اللي راح يسألونك عليه");
  });

  it("resolves the visitor's locale", () => {
    expect(render({ ...EXPRESS_IRAQ_DRAFT_PDP_PROPS, tagline_i18n: TAGLINE }, "en")).toContain(
      "The scent people ask you about",
    );
  });
});

describe("pdp_direct_order express — cta_proof", () => {
  it("quotes the customer between the receipt and the order buttons", () => {
    const html = render({ ...EXPRESS_IRAQ_DRAFT_PDP_PROPS, cta_proof: PROOF });
    const proof = html.indexOf("data-cta-proof");
    expect(proof).toBeGreaterThan(html.indexOf("data-delivery-fee"));
    expect(proof).toBeLessThan(html.indexOf('type="submit"'));
    expect(html).toContain("«اول مره يوصلني عطر ويطلع كلام الاعلان كله صحيح»");
    expect(html).toContain("<figcaption");
    expect(html).toContain("زياد، تعليق على إعلاننا بتيك توك");
  });

  it("no source = no caption", () => {
    const html = render({
      ...EXPRESS_IRAQ_DRAFT_PDP_PROPS,
      cta_proof: { quote_i18n: PROOF.quote_i18n },
    });
    expect(html).toContain("data-cta-proof");
    expect(html).not.toContain("<figcaption");
  });

  it("a malformed value degrades to no quote, never a broken buy box", () => {
    const parsed = pdp_direct_order.schema.parse({
      ...EXPRESS_IRAQ_DRAFT_PDP_PROPS,
      cta_proof: { quote_i18n: 42 },
      tagline_i18n: 7,
    });
    expect(parsed.cta_proof).toBeUndefined();
    expect(parsed.tagline_i18n).toBeUndefined();
  });
});

describe("absent = today's markup", () => {
  it("renders byte-identically without either prop", () => {
    const base = render(EXPRESS_IRAQ_DRAFT_PDP_PROPS);
    expect(base).not.toContain("data-cta-proof");
    expect(base).not.toContain('data-i18n-field="tagline_i18n"');
    expect(render({ ...EXPRESS_IRAQ_DRAFT_PDP_PROPS, tagline_i18n: undefined, cta_proof: undefined })).toBe(
      base,
    );
  });
});

describe("pdp_direct_order express — show_savings receipt", () => {
  it("regular price in red, the saving in green, rows add up to the total", () => {
    const html = render({ ...EXPRESS_IRAQ_DRAFT_PDP_PROPS, show_savings: true });
    const regular = html.indexOf("data-receipt-regular");
    const saving = html.indexOf("data-receipt-saving");
    expect(regular).toBeGreaterThan(-1);
    expect(saving).toBeGreaterThan(regular);
    // 32,000 regular − 7,000 saving = 25,000 total.
    expect(html.slice(regular, regular + 120)).toContain("32,000");
    expect(html.slice(saving, saving + 120)).toContain("7,000");
    expect(html).toMatch(/text-bk-danger line-through decoration-1" data-receipt-regular/);
    expect(html).toMatch(/text-bk-success" data-receipt-saving/);
  });

  it("without show_savings the item row keeps the price paid", () => {
    const html = render(EXPRESS_IRAQ_DRAFT_PDP_PROPS);
    expect(html).not.toContain("data-receipt-regular");
    expect(html).not.toContain("data-receipt-saving");
  });
});
