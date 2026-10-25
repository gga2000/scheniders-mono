// =====================================================================
// image_gallery baselines, frozen
// =====================================================================
// Server-markup snapshots of every historical image_gallery render. The
// opt-in `display: "whole"` / `frame` fields must leave all of them
// byte-identical. Each case goes through `schema.parse`, so the parse
// path is frozen too. A diff is a back-compat break, not a snapshot to
// refresh.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import image_gallery from "./image_gallery";
import type { SectionRenderContext } from "./_types";
import { productCtx, productRuntime, saleProduct } from "./_pdp-fixtures";

const Gallery = image_gallery.render;

function render(
  input: unknown,
  overrides: Partial<SectionRenderContext> = {},
): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <Gallery
        props={image_gallery.schema.parse(input)}
        ctx={productCtx(undefined, overrides)}
      />
    </StoreBaseProvider>,
  );
}

const SUPABASE =
  "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/";

const MIXED_IMAGES = [
  {
    url: `${SUPABASE}a.jpeg`,
    caption_i18n: { ar: "إطلالة", en: "Look" },
    alt_i18n: { ar: "وصف الصورة", en: "Image description" },
  },
  { url: `${SUPABASE}b.jpeg`, caption_i18n: { ar: "تعليق فقط", en: "Caption only" } },
  { url: `${SUPABASE}c.jpeg`, link_href: "/products/x" },
  { url: "https://cdn.example.com/fixture/d.jpg" },
  { url: "" },
];

const HEADING = { ar: "كلامهم مو كلامنا", en: "Their words, not ours" };

/** The live scheniders-iraq PDP gallery (draft pages[2].sections[3]),
 *  without the opt-in fields. */
const LIVE_IRAQ_IDS = [
  "1ebf499e-fb7d-4325-a2fe-0b98e8530932",
  "cba26e5e-7ad0-4213-b804-d535b7c0d7e6",
  "8f742152-1b1a-4d65-a543-331196fc6830",
  "6bf95f17-026a-400d-9067-08894b88a4a0",
  "536e8d88-e55a-49f0-a9b3-305b69cbfbf5",
  "abf3f504-d358-4888-bd0f-eafd1136d248",
  "2f8ae556-1a0c-4cdb-b4e2-b30c2808755e",
  "13ec2385-384c-4d1f-af39-793949cce8df",
  "8e208e9b-b896-430d-839d-44d2a010b588",
];
const LIVE_IRAQ_PROPS = {
  images: LIVE_IRAQ_IDS.map((id, i) => ({
    url: `${SUPABASE}${id}.jpeg`,
    alt_i18n: {
      ar: `رسالة من زبون ${i + 1} من 9`,
      en: `Customer message ${i + 1} of 9`,
    },
  })),
  layout: "carousel",
  heading_i18n: HEADING,
};

describe("image_gallery baseline", () => {
  it("(a) untouched defaults render the placeholder", () => {
    expect(render(image_gallery.defaultProps)).toMatchSnapshot();
  });

  it.each(["masonry", "grid", "carousel"] as const)(
    "(b) %s with mixed images",
    (layout) => {
      expect(
        render({ heading_i18n: HEADING, layout, images: MIXED_IMAGES }),
      ).toMatchSnapshot();
    },
  );

  it("(c) carousel with a single image has no arrows", () => {
    expect(
      render({
        heading_i18n: HEADING,
        layout: "carousel",
        images: [MIXED_IMAGES[0]],
      }),
    ).toMatchSnapshot();
  });

  it("(d) carousel, english", () => {
    expect(
      render(
        { heading_i18n: HEADING, layout: "carousel", images: MIXED_IMAGES },
        { runtime: { ...productRuntime, locale: "en" } },
      ),
    ).toMatchSnapshot();
  });

  it("(e) carousel without a heading", () => {
    expect(
      render({ layout: "carousel", images: MIXED_IMAGES }),
    ).toMatchSnapshot();
  });

  it("(f) frozen live scheniders-iraq gallery", () => {
    expect(render(LIVE_IRAQ_PROPS)).toMatchSnapshot();
  });

  it("(g) frame without display changes nothing", () => {
    expect(render({ ...LIVE_IRAQ_PROPS, frame: "strip" })).toBe(
      render(LIVE_IRAQ_PROPS),
    );
  });

  it.each(["grid", "masonry"] as const)(
    "(h) display whole is ignored by %s",
    (layout) => {
      const props = { heading_i18n: HEADING, layout, images: MIXED_IMAGES };
      expect(render({ ...props, display: "whole", frame: "strip" })).toBe(
        render(props),
      );
    },
  );
  it("(i) product tags without order change nothing", () => {
    const tagged = {
      ...LIVE_IRAQ_PROPS,
      images: LIVE_IRAQ_PROPS.images.map((img, i) =>
        i === 4 ? { ...img, product_ids: [saleProduct.id] } : img,
      ),
    };
    expect(render(tagged, { product: saleProduct })).toBe(
      render(LIVE_IRAQ_PROPS, { product: saleProduct }),
    );
  });

  it("(j) order with nothing tagged changes nothing", () => {
    expect(
      render({ ...LIVE_IRAQ_PROPS, order: "product_first" }, { product: saleProduct }),
    ).toBe(render(LIVE_IRAQ_PROPS, { product: saleProduct }));
  });

  it("(k) junk order and junk tags fall back", () => {
    const junk = {
      ...LIVE_IRAQ_PROPS,
      order: "random",
      images: LIVE_IRAQ_PROPS.images.map((img) => ({ ...img, product_ids: "nope" })),
    };
    expect(render(junk, { product: saleProduct })).toBe(
      render(LIVE_IRAQ_PROPS, { product: saleProduct }),
    );
  });
});
