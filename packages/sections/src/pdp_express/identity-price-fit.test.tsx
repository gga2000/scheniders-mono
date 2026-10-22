// Fit rules for the express identity tags and price plate on narrow phones:
// a long merchant brand ellipsizes inside the gutter instead of running off
// the left edge, and a long price shrinks its own size rather than
// squeezing the row label below two short lines.

import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocaleCode } from "@scheniders/shared";
import { saleProduct } from "../_pdp-fixtures";
import type { Product } from "../types";
import { IdentityLabel } from "./identity-label";
import { PricePlate, paidSize } from "./price-plate";

const LONG_BRAND = "دار العطور الملكية الفرنسية للفخامة والأناقة الشرقية";

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

/** The opening tag of the element enclosing `marker`'s element. */
function parentOpenTag(html: string, marker: string): string {
  const at = html.indexOf(marker);
  expect(at).toBeGreaterThan(-1);
  const own = html.lastIndexOf("<", at);
  const parent = html.lastIndexOf("<div", own - 1);
  return html.slice(parent, html.indexOf(">", parent) + 1);
}

function openTag(html: string, marker: string): string {
  const at = html.indexOf(marker);
  expect(at).toBeGreaterThan(-1);
  const open = html.lastIndexOf("<", at);
  return html.slice(open, html.indexOf(">", at) + 1);
}

describe("express identity — a long brand stays inside the column", () => {
  for (const locale of ["ar", "en"] as const) {
    it(`pins the tag row to the column width (${locale})`, () => {
      const html = identity({ ...saleProduct, brand: LONG_BRAND, gender: "men" }, locale);
      const row = parentOpenTag(html, 'data-tag="brand"');
      expect(row).toContain("w-full");
      expect(row).toContain("flex-wrap");
      // Pills still pack to the reading-start side.
      if (locale === "ar") expect(row).toContain("flex-row-reverse");
      else expect(row).not.toContain("flex-row-reverse");
    });
  }

  it("lets the brand pill shrink so its text can ellipsize", () => {
    const html = identity({ ...saleProduct, brand: LONG_BRAND }, "ar");
    const tag = openTag(html, 'data-tag="brand"');
    expect(tag).toContain("min-w-0");
    expect(tag).toContain("max-w-full");
    expect(html).toContain('<bdi class="min-w-0 truncate">');
    expect(html).toContain(LONG_BRAND);
  });
});

describe("express price plate — the amount yields, the label keeps two lines", () => {
  it("divides the room left after the label floor across the amount's characters", () => {
    expect(paidSize("35,000", true)).toBe(
      "clamp(20px, calc((100cqi - 3.75rem - 2.25rem) / 3.30), 36px)",
    );
    expect(paidSize("130,000", true)).toBe(
      "clamp(20px, calc((100cqi - 3.75rem - 2.25rem) / 3.85), 36px)",
    );
  });

  it("a longer price gets a smaller size, never a narrower label", () => {
    const divisor = (s: string) => Number(/\/ ([\d.]+)\)/.exec(s)?.[1]);
    expect(divisor(paidSize("1,300,000", true))).toBeGreaterThan(
      divisor(paidSize("130,000", true)),
    );
  });

  it("only reserves the label floor when a label renders", () => {
    expect(paidSize("35,000", false)).toBe("clamp(20px, calc((100cqi - 2.25rem) / 3.30), 36px)");
  });

  function plate(price: number, compareAt: number, priceLabel: string): string {
    return renderToStaticMarkup(
      <PricePlate
        price={price}
        compareAt={compareAt}
        discountPct={23}
        qty={1}
        showSavings={false}
        compareLabel="السعر قبل الخصم"
        priceLabel={priceLabel}
        locale="ar"
        flash={false}
        plateRef={createRef<HTMLDivElement>()}
      />,
    );
  }

  it("both row labels carry the floor, and the paid amount is sized from its own length", () => {
    const html = plate(130000, 169000, "السعر بعد الخصم");
    for (const field of ["compare_label_i18n", "price_label_i18n"]) {
      const label = openTag(html, `data-i18n-field="${field}"`);
      expect(label).toContain('style="min-width:3.75rem"');
      expect(label).not.toContain("min-w-0");
    }
    expect(html).toContain(
      'style="font-size:clamp(20px, calc((100cqi - 3.75rem - 2.25rem) / 3.85), 36px)">130,000</span>',
    );
  });

  it("without a paid-price label the amount takes the whole row", () => {
    expect(plate(130000, 169000, "")).toContain(
      'style="font-size:clamp(20px, calc((100cqi - 2.25rem) / 3.85), 36px)">130,000</span>',
    );
  });
});
