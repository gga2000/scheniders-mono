// Express identity tags + price plate: the «الشركة» brand tag, the gender
// tag's visual order in Arabic, and the price-plate rules that keep the
// paid price clear of the discount seal on 320–430px phones (the label
// wraps instead of the price running under the seal).

import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocaleCode } from "@scheniders/shared";
import { saleProduct } from "../_pdp-fixtures";
import type { Product } from "../types";
import { IdentityLabel } from "./identity-label";
import { PricePlate } from "./price-plate";

const branded: Product = { ...saleProduct, brand: "باريس كورنر", gender: "men", size_ml: 100 };

function identity(product: Product, locale: LocaleCode): string {
  return renderToStaticMarkup(
    <IdentityLabel
      product={product}
      locale={locale}
      reviewCount={0}
      avgRating={0}
      showRating={false}
    />,
  );
}

/** The opening tag of the first element carrying `marker`. */
function openTag(html: string, marker: string): string {
  const at = html.indexOf(marker);
  expect(at).toBeGreaterThan(-1);
  const open = html.lastIndexOf("<", at);
  return html.slice(open, html.indexOf(">", at) + 1);
}

function plate(locale: LocaleCode, onSale = true): string {
  return renderToStaticMarkup(
    <PricePlate
      price={36750}
      compareAt={onSale ? 48500 : null}
      discountPct={onSale ? 24 : null}
      qty={1}
      showSavings={false}
      compareLabel={locale === "en" ? "Before discount" : "السعر قبل الخصم"}
      priceLabel={locale === "en" ? "After discount" : "السعر بعد الخصم"}
      locale={locale}
      flash={false}
      plateRef={createRef<HTMLDivElement>()}
    />,
  );
}

describe("express identity — brand tag", () => {
  it("reads «الشركة: {brand}» in Arabic, isolated so the label leads", () => {
    const html = identity(branded, "ar");
    expect(html).toContain('data-tag="brand"');
    expect(html).toMatch(
      /<bdi class="min-w-0 truncate"><span class="font-medium">الشركة:<\/span> <span translate="no" class="tracking-wide">باريس كورنر<\/span><\/bdi>/,
    );
  });

  it("stays the strongest tag", () => {
    const tag = openTag(identity(branded, "ar"), 'data-tag="brand"');
    expect(tag).toContain("bg-bk-secondary");
    expect(tag).toContain("text-bk-on-secondary");
  });

  it("uses the English label in en", () => {
    expect(identity(branded, "en")).toContain('<span class="font-medium">Brand:</span>');
  });

  it("is absent when the product has no brand", () => {
    const html = identity({ ...branded, brand: null }, "ar");
    expect(html).not.toContain('data-tag="brand"');
    expect(html).not.toContain("الشركة");
  });
});

/** The opening tag of the Tag pill that contains `text`. */
function tagAround(html: string, text: string): string {
  const at = html.indexOf(text);
  expect(at).toBeGreaterThan(-1);
  const open = html.lastIndexOf('<span class="inline-flex', at);
  return html.slice(open, html.indexOf(">", open) + 1);
}

describe("express identity — gender tag order", () => {
  it("puts the icon on the reading-start (right) side in Arabic", () => {
    expect(tagAround(identity(branded, "ar"), "رجالي")).toContain("flex-row-reverse");
  });

  it("keeps natural order in English", () => {
    expect(tagAround(identity(branded, "en"), "Men")).not.toContain("flex-row-reverse");
  });
});

describe("express price plate — nothing runs under the seal", () => {
  it("the price column is a shrinkable size container", () => {
    const html = plate("ar");
    expect(html).toContain(
      '<div class="flex min-w-0 flex-1 flex-col gap-1" style="container-type:inline-size">',
    );
  });

  it("the paid amount scales with the column, with a viewport fallback", () => {
    const html = plate("ar");
    expect(html).toMatch(
      /<span class="text-\[length:clamp\(26px,8\.5vw,36px\)\]" style="font-size:clamp\(20px, calc\(\(100cqi - 3\.75rem - 2\.25rem\) \/ 3\.30\), 36px\)">36,750<\/span>/,
    );
  });

  it("prices never shrink or wrap; labels may wrap", () => {
    const html = plate("ar");
    expect(html).toMatch(/<bdi class="flex shrink-0 items-baseline gap-1 whitespace-nowrap/);
    expect(html).toMatch(/<span class="shrink-0 whitespace-nowrap [^"]*line-through"[^>]*><bdi>48,500/);
    for (const field of ["compare_label_i18n", "price_label_i18n"]) {
      const label = openTag(html, `data-i18n-field="${field}"`);
      expect(label).toContain('style="min-width:3.75rem"');
      expect(label).not.toContain("whitespace-nowrap");
    }
  });

  it("the seal shrinks a little on narrow phones", () => {
    expect(plate("ar")).toContain('style="width:clamp(56px, 17vw, 68px);height:clamp(56px, 17vw, 68px)"');
  });

  it("Arabic labels sit to the RIGHT of their prices (after them in an un-reversed row)", () => {
    const html = plate("ar");
    for (const [price, field] of [
      ["48,500", "compare_label_i18n"],
      ["36,750", "price_label_i18n"],
    ] as const) {
      const priceAt = html.indexOf(price);
      const labelAt = html.indexOf(`data-i18n-field="${field}"`);
      expect(priceAt).toBeLessThan(labelAt);
      const rowOpen = html.lastIndexOf("<div", priceAt);
      expect(html.slice(rowOpen, html.indexOf(">", rowOpen))).not.toContain("flex-row-reverse");
      expect(openTag(html, `data-i18n-field="${field}"`)).toContain("text-right");
    }
  });

  it("English labels lead on the left (row reversed)", () => {
    const html = plate("en");
    const rowOpen = html.lastIndexOf("<div", html.indexOf("36,750"));
    expect(html.slice(rowOpen, html.indexOf(">", rowOpen))).toContain("flex-row-reverse");
  });

  it("no seal without a sale", () => {
    expect(plate("ar", false)).not.toContain("clamp(56px, 17vw, 68px)");
  });
});
