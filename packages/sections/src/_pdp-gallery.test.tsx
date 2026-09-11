// pdp_gallery (Phase 4I / P2-30) — static-markup guarantees for the
// gallery every non-signature template uses on the PDP: images on
// non-allowlisted hosts don't throw, the zoom is a native <dialog> that
// only exists when zoom is on, labels are localised, the low-stock flag
// pluralises correctly in Arabic, the aspect prop is additive, and the
// grid reveals "+N" instead of silently slicing.

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import pdp_gallery from "./pdp_gallery";
import type { SectionRenderContext } from "./_types";
import type { Product } from "./types";

type Props = typeof pdp_gallery.defaultProps;

const runtime = {
  page_id: "product" as const,
  breakpoint: "mobile" as const,
  locale: "ar" as const,
  audience_segments: [],
  ab_test_arms: {},
  now: new Date("2026-09-07T00:00:00Z"),
};

const tenant = { id: "tenant-1", business_name: "متجر", store_config: {} };

const urls = (n: number) =>
  Array.from({ length: n }, (_, i) => `https://cdn.example.com/p${i + 1}.jpg`);

const product: Product = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "عطر تجريبي",
  price: 25000,
  image_url: "https://cdn.example.com/p1.jpg",
  images: urls(3),
  stock_quantity: 10,
  reserved_quantity: 0,
  is_archived: false,
};

function render(
  props: Partial<Props> = {},
  ctx: Partial<SectionRenderContext> = {},
): string {
  const Render = pdp_gallery.render;
  return renderToStaticMarkup(
    React.createElement(
      StoreBaseProvider,
      { base: "", children: null },
      React.createElement(Render, {
        props: { ...pdp_gallery.defaultProps, ...props },
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

describe("pdp_gallery — additive props", () => {
  it("parses a legacy props object (no aspect / threshold) with the defaults", () => {
    const parsed = pdp_gallery.schema.safeParse({
      layout: "stacked",
      show_zoom: true,
      show_thumbnails: true,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.aspect).toBe("square");
      expect(parsed.data.low_stock_threshold).toBe(5);
    }
    expect(pdp_gallery.schema.safeParse(pdp_gallery.defaultProps).success).toBe(
      true,
    );
  });

  it("keeps the square frame by default and switches with the aspect prop", () => {
    expect(render()).toContain("aspect-square");
    const portrait = render({ aspect: "portrait" });
    expect(portrait).toContain("aspect-[4/5]");
    expect(portrait).not.toContain("aspect-square");
    const auto = render({ aspect: "auto" });
    expect(auto).not.toMatch(/aspect-square|aspect-\[4\/5\]/);
    // auto renders an intrinsic-size image instead of `fill`.
    expect(auto).toMatch(/<img[^>]*width="1200"/);
  });
});

describe("pdp_gallery — non-allowlisted hosts never throw", () => {
  it("renders the main image and thumbnails for an arbitrary merchant CDN", () => {
    const html = render();
    // 1 main + 3 thumbnails, all plain src (unoptimized → no /_next/image).
    expect(html.match(/<img/g)).toHaveLength(4);
    expect(html).not.toContain("/_next/image");
    expect(html).toContain('src="https://cdn.example.com/p1.jpg"');
  });
});

describe("pdp_gallery — zoom", () => {
  it("wraps the main image in a localised zoom button and mounts a native <dialog>", () => {
    const html = render();
    expect(html).toContain('aria-label="تكبير الصورة"');
    expect(html).toContain("<dialog");
    expect(html).toContain('aria-label="صورة مكبّرة لـ عطر تجريبي"');
    expect(html).not.toContain('role="dialog"');
    const en = render({}, { runtime: { ...runtime, locale: "en" } });
    expect(en).toContain('aria-label="Zoom image"');
    expect(en).toContain('aria-label="Zoomed image of عطر تجريبي"');
  });

  it("renders no button and no dialog when show_zoom is off", () => {
    const html = render({ show_zoom: false, show_thumbnails: false });
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<dialog");
    expect(html).not.toContain("تكبير الصورة");
    expect(html.match(/<img/g)).toHaveLength(1);
  });
});

describe("pdp_gallery — localised labels", () => {
  it("labels thumbnails per locale and falls Kurdish back to Arabic", () => {
    expect(render()).toContain('aria-label="عرض الصورة 2"');
    expect(render({}, { runtime: { ...runtime, locale: "en" } })).toContain(
      'aria-label="View image 2"',
    );
    expect(render({}, { runtime: { ...runtime, locale: "ku" } })).toContain(
      'aria-label="عرض الصورة 2"',
    );
  });
});

describe("pdp_gallery — low-stock flag", () => {
  const withStock = (
    stock: number,
    props: Partial<Props> = {},
    locale: "ar" | "en" | "ku" = "ar",
  ) =>
    render(props, {
      runtime: { ...runtime, locale },
      product: { ...product, stock_quantity: stock },
    });

  it("uses Arabic plural categories, not a single form", () => {
    expect(withStock(1)).toContain("آخر قطعة");
    expect(withStock(2)).toContain("آخر قطعتين");
    expect(withStock(3)).toContain("آخر 3 قطع");
    expect(withStock(5)).toContain("آخر 5 قطع");
    expect(withStock(11, { low_stock_threshold: 20 })).toContain("آخر 11 قطعة");
  });

  it("respects the threshold (default 5) and never shows for sold-out", () => {
    expect(withStock(6)).not.toContain("آخر");
    expect(withStock(6, { low_stock_threshold: 8 })).toContain("آخر 6 قطع");
    const soldOut = withStock(0);
    expect(soldOut).toContain("نفد المخزون");
    expect(soldOut).not.toContain("آخر");
    expect(withStock(1, {}, "en")).toContain("Last 1 in stock");
  });
});

describe("pdp_gallery — grid overflow", () => {
  it("shows every image when six or fewer", () => {
    const html = render(
      { layout: "grid" },
      { product: { ...product, images: urls(6) } },
    );
    expect(html.match(/<img/g)).toHaveLength(6);
    expect(html).not.toContain("+");
  });

  it("reveals '+N' on the last tile instead of silently slicing", () => {
    const html = render(
      { layout: "grid" },
      { product: { ...product, images: urls(9) } },
    );
    expect(html.match(/<img/g)).toHaveLength(6);
    expect(html).toContain(">+3<");
    expect(html).toContain('aria-label="عرض 3 صور إضافية"');
    const en = render(
      { layout: "grid" },
      {
        runtime: { ...runtime, locale: "en" },
        product: { ...product, images: urls(7) },
      },
    );
    expect(en).toContain(">+1<");
    expect(en).toContain('aria-label="Show 1 more image"');
  });
});
