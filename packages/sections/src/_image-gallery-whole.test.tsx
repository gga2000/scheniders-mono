// =====================================================================
// image_gallery — opt-in `display: "whole"` (schema + server markup)
// =====================================================================
// The new fields must never drop the section on a bad value, and the
// whole-picture carousel must show every screenshot uncropped, as a
// tappable card that opens the viewer, with no hex colours of its own.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import image_gallery from "./image_gallery";
import type { SectionRenderContext } from "./_types";
import { productCtx, productRuntime } from "./_pdp-fixtures";

const { schema } = image_gallery;

const Gallery = image_gallery.render;

function render(
  input: unknown,
  overrides: Partial<SectionRenderContext> = {},
): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <Gallery
        props={schema.parse(input)}
        ctx={productCtx(undefined, overrides)}
      />
    </StoreBaseProvider>,
  );
}

const SUPABASE =
  "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/";
const HEADING = { ar: "كلامهم مو كلامنا", en: "Their words, not ours" };
interface ImageInput {
  url: string;
  alt_i18n?: { ar: string; en: string };
  caption_i18n?: { ar: string; en: string };
  link_href?: string;
}
const nine = (alt: boolean): ImageInput[] =>
  Array.from({ length: 9 }, (_, i) => ({
    url: `${SUPABASE}shot-${i + 1}.jpeg`,
    ...(alt
      ? {
          alt_i18n: {
            ar: `رسالة من زبون ${i + 1} من 9`,
            en: `Customer message ${i + 1} of 9`,
          },
        }
      : {}),
  }));

const WHOLE = {
  heading_i18n: HEADING,
  layout: "carousel",
  images: nine(true),
  display: "whole",
  frame: "strip",
};

const count = (html: string, needle: string | RegExp) =>
  html.split(needle).length - 1;

describe("schema", () => {
  it.each([
    { display: "bogus", frame: 7 },
    { display: null, frame: null },
    { display: 1, frame: "panorama" },
  ])("a bad value never drops the section (%o)", (bad) => {
    const parsed = schema.safeParse({ ...WHOLE, ...bad });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.display).toBeUndefined();
    expect(parsed.data?.frame).toBeUndefined();
  });

  it("keeps the valid opt-in values", () => {
    const parsed = schema.parse(WHOLE);
    expect(parsed.display).toBe("whole");
    expect(parsed.frame).toBe("strip");
  });

  it("parsing the defaults adds no keys", () => {
    expect(Object.keys(schema.parse(image_gallery.defaultProps))).toEqual(
      Object.keys(image_gallery.defaultProps),
    );
  });
});

describe("whole-picture carousel markup", () => {
  const html = render(WHOLE);

  it("never crops", () => {
    expect(html).toContain("object-contain");
    expect(html).not.toContain("object-cover");
  });

  it("sizes the strip frame", () => {
    expect(count(html, "aspect-[16/5]")).toBe(9);
    expect(html).toContain("w-[calc(100%-2.5rem)]");
  });

  it("makes every unlinked screenshot a viewer button", () => {
    for (let i = 0; i < 9; i++) {
      expect(html).toContain(`data-gallery-open="${i}"`);
    }
    expect(count(html, 'aria-haspopup="dialog"')).toBe(9);
    expect(count(html, /<button type="button" data-gallery-open=/g)).toBe(9);
  });

  it("names a button by its action first, then the merchant's alt", () => {
    expect(html).toContain('aria-label="كبّر الصورة: رسالة من زبون 3 من 9"');
    expect(html).not.toContain('aria-label="رسالة من زبون 3 من 9"');
    expect(render(WHOLE, { runtime: { ...productRuntime, locale: "en" } })).toContain(
      'aria-label="Enlarge image: Customer message 3 of 9"',
    );
  });

  it("keeps a merchant alt verbatim, even with replacement patterns in it", () => {
    const images = nine(true).map((img, i) =>
      i === 0 ? { ...img, alt_i18n: { ar: "خصم $& {n}", en: "Off $& {n}" } } : img,
    );
    expect(render({ ...WHOLE, images })).toContain('aria-label="كبّر الصورة: خصم $&amp; {n}"');
  });

  it("names an alt-less screenshot by its position", () => {
    const props = { ...WHOLE, images: nine(false) };
    expect(render(props)).toContain('aria-label="كبّر الصورة 3 من 9"');
    expect(
      render(props, { runtime: { ...productRuntime, locale: "en" } }),
    ).toContain('aria-label="Enlarge image 3 of 9"');
  });

  it("keeps the snap row and hidden scrollbar", () => {
    expect(html).toContain("snap-mandatory");
    expect(html).toContain("[scrollbar-width:none]");
  });

  it("keeps the carousel region and its desktop arrows wired to the track", () => {
    expect(html).toContain('aria-roledescription="carousel"');
    const trackId = /<div id="([^"]+)" class="flex gap-bk-sm/.exec(html)?.[1];
    expect(trackId).toBeTruthy();
    expect(count(html, `aria-controls="${trackId}"`)).toBe(2);
  });

  it("ships a closed dialog with no slide images", () => {
    expect(html).toContain("<dialog");
    expect(/<dialog[^>]*\sopen[\s=>]/.test(html)).toBe(false);
    expect(count(html, "<img")).toBe(9);
    expect(html).not.toContain('aria-roledescription="slide"');
  });

  it("adds no inline hex colours (the shared CarouselArrows are not new)", () => {
    const track = html.indexOf('class="flex gap-bk-sm');
    const arrows = html.indexOf('<div class="hidden sm:flex');
    const dialog = html.indexOf("<dialog");
    const end = html.indexOf("</dialog>");
    expect(track).toBeGreaterThan(-1);
    expect(arrows).toBeGreaterThan(track);
    expect(end).toBeGreaterThan(dialog);
    expect(html.slice(track, arrows)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html.slice(dialog, end)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("keeps the hairline: border width and colour both survive", () => {
    expect(count(html, "border-bk border-bk-divider")).toBe(18);
  });
});

describe("whole mode, linked and captioned pictures", () => {
  it("lets a link win and skips it in the viewer order", () => {
    const images = nine(true).map((img, i) =>
      i === 4 ? { ...img, link_href: "/products/x" } : img,
    );
    const html = render({ ...WHOLE, images });
    expect(html).toMatch(/<a [^>]*href="\/s\/fixture-store\/products\/x"/);
    expect(count(html, "data-gallery-open=")).toBe(8);
    for (let i = 0; i < 8; i++) {
      expect(html).toContain(`data-gallery-open="${i}"`);
    }
    expect(html).not.toContain('data-gallery-open="8"');
  });

  it("renders no viewer when every picture is linked", () => {
    const images = nine(true).map((img) => ({ ...img, link_href: "/products/x" }));
    const html = render({ ...WHOLE, images });
    expect(html).not.toContain("<dialog");
    expect(html).not.toContain("data-gallery-open");
  });

  it("puts a caption below the frame, never as a scrim", () => {
    const images = nine(true).map((img, i) =>
      i === 0
        ? { ...img, caption_i18n: { ar: "من تيك توك", en: "From TikTok" } }
        : img,
    );
    const html = render({ ...WHOLE, images });
    expect(html).toMatch(/<\/button><p class="[^"]*">من تيك توك<\/p>/);
    expect(html).not.toContain("linear-gradient(to top");
  });
});

describe("frame map", () => {
  it("portrait sizes the card", () => {
    const html = render({ ...WHOLE, frame: "portrait" });
    expect(html).toContain("aspect-[3/4]");
    expect(html).toContain("w-[220px] sm:w-[280px]");
  });

  it("no frame defaults to portrait", () => {
    const html = render({ ...WHOLE, frame: undefined });
    expect(count(html, "aspect-[3/4]")).toBe(9);
    expect(html).toContain("w-[220px] sm:w-[280px]");
    expect(html).toContain("object-contain");
  });
});
