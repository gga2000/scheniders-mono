// =====================================================================
// T0 — chrome and gallery baselines, frozen
// =====================================================================
// Server-markup snapshots of the sections the PDP work touches without
// owning: pdp_gallery (its FramedImage / ZoomDialog / gatherImages are
// extracted for reuse), site_header (an opt-in overlay surface is added),
// sticky_cta_bar (an opt-in hide_while is added) and
// countdown_announcement (its clock is shared). Every default render here
// must stay byte-identical through those changes. A diff is a back-compat
// break, not a snapshot to refresh.
// =====================================================================

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import pdp_gallery from "./pdp_gallery";
import site_header from "./site_header";
import sticky_cta_bar from "./sticky_cta_bar";
import countdown_announcement from "./countdown_announcement";
import type { SectionDefinition, SectionRenderContext } from "./_types";
import type { Product, Tenant } from "./types";
import {
  SIGNATURE_COUNTDOWN_PROPS,
  SIGNATURE_HEADER_PROPS,
  SIGNATURE_STICKY_PROPS,
  fixtureTenant,
  plainProduct,
  productCtx,
  productRuntime,
  saleProduct,
  soldOutProduct,
} from "./_pdp-fixtures";

function render<P>(
  def: SectionDefinition<P>,
  props: P,
  product: Product | undefined,
  overrides: Partial<SectionRenderContext> = {},
): string {
  return renderToStaticMarkup(
    React.createElement(
      StoreBaseProvider,
      { base: "/s/fixture-store", children: null },
      React.createElement(def.render, {
        props,
        ctx: productCtx(product, overrides),
      }),
    ),
  );
}

const homeRuntime = { ...productRuntime, page_id: "home" };
const bilingualTenant: Tenant = {
  ...fixtureTenant,
  store_config_v2: { enabled_locales: ["ar", "en"] },
};

describe("pdp_gallery baseline", () => {
  const layouts = ["stacked", "carousel", "grid"] as const;

  it.each(layouts)("%s, defaults, multi-image product", (layout) => {
    expect(
      render(pdp_gallery, { ...pdp_gallery.defaultProps, layout }, saleProduct),
    ).toMatchSnapshot();
  });

  it.each(layouts)("%s, single-image product", (layout) => {
    expect(
      render(pdp_gallery, { ...pdp_gallery.defaultProps, layout }, plainProduct),
    ).toMatchSnapshot();
  });

  it.each(layouts)("%s, portrait, no zoom, no thumbnails", (layout) => {
    expect(
      render(
        pdp_gallery,
        {
          ...pdp_gallery.defaultProps,
          layout,
          aspect: "portrait",
          show_zoom: false,
          show_thumbnails: false,
        },
        saleProduct,
      ),
    ).toMatchSnapshot();
  });

  it.each(layouts)("%s, auto aspect", (layout) => {
    expect(
      render(
        pdp_gallery,
        { ...pdp_gallery.defaultProps, layout, aspect: "auto" },
        saleProduct,
      ),
    ).toMatchSnapshot();
  });

  it("sold out", () => {
    expect(
      render(pdp_gallery, pdp_gallery.defaultProps, soldOutProduct),
    ).toMatchSnapshot();
  });
});

describe("site_header baseline", () => {
  const layouts = ["bento", "floating_pill"] as const;

  it.each(layouts)("%s defaults on the product page", (layout) => {
    expect(
      render(site_header, { ...site_header.defaultProps, layout }, saleProduct),
    ).toMatchSnapshot();
  });

  it.each(layouts)("%s defaults on the home page", (layout) => {
    expect(
      render(site_header, { ...site_header.defaultProps, layout }, undefined, {
        runtime: homeRuntime,
      }),
    ).toMatchSnapshot();
  });

  it("layout omitted (the historical default)", () => {
    expect(
      render(site_header, site_header.defaultProps, saleProduct),
    ).toMatchSnapshot();
  });

  it("frozen scheniders-signature header, bilingual store", () => {
    expect(
      render(site_header, SIGNATURE_HEADER_PROPS, saleProduct, {
        tenant: bilingualTenant,
      }),
    ).toMatchSnapshot();
  });
});

describe("sticky_cta_bar baseline", () => {
  it("defaults on the product page", () => {
    expect(
      render(sticky_cta_bar, sticky_cta_bar.defaultProps, saleProduct),
    ).toMatchSnapshot();
  });

  it("defaults on the cart page", () => {
    expect(
      render(sticky_cta_bar, sticky_cta_bar.defaultProps, undefined, {
        runtime: { ...productRuntime, page_id: "cart" },
      }),
    ).toMatchSnapshot();
  });

  it("frozen scheniders-signature PDP bar", () => {
    expect(
      render(sticky_cta_bar, SIGNATURE_STICKY_PROPS, saleProduct),
    ).toMatchSnapshot();
  });
});

describe("countdown_announcement baseline", () => {
  it("defaults", () => {
    expect(
      render(countdown_announcement, countdown_announcement.defaultProps, saleProduct),
    ).toMatchSnapshot();
  });

  it("ink band without the flame, english", () => {
    expect(
      render(
        countdown_announcement,
        { ...countdown_announcement.defaultProps, bg: "ink", show_flame: false },
        saleProduct,
        { runtime: { ...productRuntime, locale: "en" } },
      ),
    ).toMatchSnapshot();
  });

  it("frozen scheniders-signature promo bar", () => {
    expect(
      render(countdown_announcement, SIGNATURE_COUNTDOWN_PROPS, saleProduct),
    ).toMatchSnapshot();
  });
});
