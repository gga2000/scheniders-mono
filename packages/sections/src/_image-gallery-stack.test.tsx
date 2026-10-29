// =====================================================================
// image_gallery `layout: "stack"` — the proof stack (spec §1.5), markup
// =====================================================================
// Server markup only (the expand/collapse island has its own jsdom test):
// heading, source pill and scope line; the lead comments in order with a
// numbered doubt, the quote as live text in «», the author in <bdi> and a
// full-width screenshot whose box follows the crop maths; the legend once,
// after the first comment; the rest hidden behind one plural-correct
// button; a business tag; no dir attribute and no yellow fill.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import image_gallery from "./image_gallery";
import type { SectionRenderContext } from "./_types";
import { fixtureTenant, productCtx, productRuntime, saleProduct } from "./_pdp-fixtures";

const Gallery = image_gallery.render;

function render(input: unknown, overrides: Partial<SectionRenderContext> = {}): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <Gallery props={image_gallery.schema.parse(input)} ctx={productCtx(saleProduct, overrides)} />
    </StoreBaseProvider>,
  );
}

const count = (html: string, needle: string): number => html.split(needle).length - 1;

const SHOTS = "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/reviews/";
const LOGO = "https://cdn.example.com/fixture/logo.png";

const LEAD = [
  {
    url: `${SHOTS}p5.jpeg`,
    alt_i18n: { ar: "تعليق زياد: وصلني العطر فعلاً راقي" },
    doubt_i18n: { ar: "خايف يطلع مثل كل إعلان؟", en: "Afraid it's like every ad?" },
    quote_i18n: { ar: "اول مره يوصلني عطر ويطلع كلام الاعلان كله صحيح" },
    author: "المحامي زياد طارق الحديدي",
    width: 828,
    height: 253,
    crop: { left: 12, right: 2 },
  },
  {
    url: `${SHOTS}p2.jpeg`,
    alt_i18n: { ar: "تعليق dy4axauduv7j" },
    doubt_i18n: { ar: "أول رشة ما فاحت؟" },
    quote_i18n: { ar: "لاتقيس من اول مترش انتظر ربع ساعه" },
    author: "dy4axauduv7j",
    width: 828,
    height: 256,
    crop: { left: 12, right: 2 },
  },
  // No quote: a screenshot-only row, and no size: a 4/1 box.
  { url: `${SHOTS}p4.jpeg`, alt_i18n: { ar: "تعليق Nano" }, author: "Nano" },
];
const REST = [
  { url: `${SHOTS}p3.jpeg`, alt_i18n: { ar: "تعليق عباس" }, author: "عباس", width: 828, height: 208, crop: { left: 12, right: 2 } },
  { url: `${SHOTS}p1.jpeg`, alt_i18n: { ar: "تعليق Alpha" }, author: "Alpha decorations company", is_business: true, width: 828, height: 163 },
];

const STACK = {
  heading_i18n: { ar: "كلامهم مو كلامنا", en: "Their words, not ours" },
  layout: "stack",
  scope: "store",
  initial_count: 3,
  heading_style: "chapter",
  source_label_i18n: { ar: "تعليقات على إعلاناتنا بتيك توك", en: "Comments on our TikTok ads" },
  legend_i18n: { ar: "هاي العلامة يعني سوّينا لايك للتعليق من حسابنا", en: "This mark means we liked the comment" },
  legend_image_url: LOGO,
  images: [...LEAD, ...REST],
};

describe("image_gallery stack", () => {
  const ar = render(STACK);
  const en = render(STACK, { runtime: { ...productRuntime, locale: "en" } });

  it("heads with the chapter heading, the source pill and the scope line", () => {
    expect(ar).toContain("text-bk-chapter");
    expect(ar).toMatch(/data-proof-source="true"[^>]*>.*forum.*تعليقات على إعلاناتنا بتيك توك/);
    expect(ar).toContain("3 من أصل 5، على عطورنا بشكل عام");
    expect(en).toContain("3 of 5, about our perfumes in general");
  });

  it("the scope line only for scope store", () => {
    expect(render({ ...STACK, scope: "product" })).not.toContain("من أصل");
    expect(render({ ...STACK, scope: undefined })).not.toContain("من أصل");
  });

  it("leads with the first initial_count comments, in order, numbered", () => {
    const lead = ar.slice(0, ar.indexOf("data-proof-rest"));
    expect(count(lead, "data-proof-item=")).toBe(3);
    expect([...lead.matchAll(/data-proof-doubt="(\d)"/g)].map((m) => m[1])).toEqual(["1", "2"]);
    expect(lead.indexOf("خايف يطلع مثل كل إعلان؟")).toBeLessThan(lead.indexOf("أول رشة ما فاحت؟"));
    expect(lead).toContain("«اول مره يوصلني عطر ويطلع كلام الاعلان كله صحيح»");
    expect(lead).toContain("<bdi>المحامي زياد طارق الحديدي</bdi>");
  });

  it("a comment without a quote is a screenshot-only row", () => {
    const nano = ar.slice(ar.indexOf('data-proof-item="2"'), ar.indexOf("data-proof-rest"));
    expect(nano).not.toContain("data-proof-doubt");
    expect(nano).not.toContain("data-proof-quote");
    expect(nano).toContain("<bdi>Nano</bdi>");
  });

  it("crops a sized screenshot by the maths and keeps the natural height", () => {
    expect(ar).toContain("aspect-ratio:712.08 / 253");
    expect(ar).toMatch(/width:116\.28%;left:-13\.95%/);
    expect(ar).toContain("aspect-ratio:828 / 163");
  });

  it("sizes follow each screenshot's crop; uncropped and unsized keep the column hint", () => {
    const sizesOf = (alt: string): string | undefined =>
      ar.match(new RegExp(`<img alt="${alt}"[^>]*sizes="([^"]*)"`))?.[1];
    // Cropped 12/2: the image is 100/86 of its box.
    expect(sizesOf("تعليق زياد: وصلني العطر فعلاً راقي")).toBe(
      "(max-width: 640px) calc((100vw - 2rem) * 100 / 86), calc(600px * 100 / 86)",
    );
    // Sized, no crop.
    expect(sizesOf("تعليق Alpha")).toBe("(max-width: 640px) calc(100vw - 2rem), 600px");
    // Unsized: the 4/1 fill box.
    expect(sizesOf("تعليق Nano")).toBe("(max-width: 640px) calc(100vw - 2rem), 600px");
  });

  it("an unsized screenshot sits in a 4/1 box", () => {
    expect(count(ar, "aspect-[4/1]")).toBe(1);
  });

  it("explains the mark once, after the first comment", () => {
    expect(count(ar, "data-proof-legend")).toBe(1);
    expect(ar.indexOf("data-proof-legend")).toBeGreaterThan(ar.indexOf('data-proof-item="0"'));
    expect(ar.indexOf("data-proof-legend")).toBeLessThan(ar.indexOf('data-proof-item="1"'));
    expect(ar).toContain(`src="${LOGO}"`);
  });

  it("the legend falls back to the store logo, then to text only", () => {
    const branded = render(
      { ...STACK, legend_image_url: undefined },
      { tenant: { ...fixtureTenant, branding: { logo_url: "https://cdn.example.com/fixture/brand.png" } } },
    );
    expect(branded).toContain('src="https://cdn.example.com/fixture/brand.png"');
    const bare = render({ ...STACK, legend_image_url: undefined });
    const legend = bare.slice(bare.indexOf("data-proof-legend"), bare.indexOf('data-proof-item="1"'));
    expect(legend).not.toContain("<img");
    expect(legend).toContain("هاي العلامة يعني سوّينا لايك للتعليق من حسابنا");
  });

  it("hides the rest behind one plural-correct button", () => {
    expect(ar).toMatch(/<ol[^>]*data-proof-rest="true"[^>]*hidden=""/);
    expect(ar).toMatch(/aria-expanded="false"[^>]*>.*شوف تعليقين ثانيين/);
    expect(en).toContain("See 2 more comments");
  });

  it("tags the business account", () => {
    expect(ar).toMatch(/<bdi>Alpha decorations company<\/bdi><span[^>]*data-proof-business="true"[^>]*>حساب شركة</);
    expect(count(ar, "data-proof-business")).toBe(1);
  });

  it("no expand button with initial_count or fewer comments", () => {
    const three = render({ ...STACK, images: LEAD });
    expect(three).not.toContain("data-proof-rest");
    expect(three).not.toContain("aria-expanded");
  });

  it("every screenshot opens the viewer, in stack order", () => {
    expect([...ar.matchAll(/data-gallery-open="(\d)"/g)].map((m) => m[1])).toEqual(["0", "1", "2", "3", "4"]);
    expect(ar).toContain('aria-label="كبّر الصورة: تعليق زياد: وصلني العطر فعلاً راقي"');
  });

  it("a linked comment mid-stack opens no viewer; later ones still open their own slide", () => {
    // Linked rows are left out of the viewer, so every later screenshot's
    // slot is one less than its row; each button's label must name the
    // picture at that slot.
    const linked = new Set([1, 3]);
    const images = STACK.images.map((img, i) =>
      linked.has(i) ? { ...img, link_href: `/products/linked-${i}` } : img,
    );
    const html = render({ ...STACK, images });
    const unlinkedAlts = STACK.images.filter((_, i) => !linked.has(i)).map((img) => img.alt_i18n.ar);
    const opens = [...html.matchAll(/data-gallery-open="(\d)"[^>]*aria-label="كبّر الصورة: ([^"]*)"/g)].map(
      (m) => [Number(m[1]), m[2]] as const,
    );
    expect(opens.map(([slot]) => slot)).toEqual([0, 1, 2]);
    for (const [slot, alt] of opens) expect(alt).toBe(unlinkedAlts[slot]);
    expect(html).toContain('href="/s/fixture-store/products/linked-1"');
    expect(html).toContain('href="/s/fixture-store/products/linked-3"');
    // Rendering twice gives the same slots: nothing leaks between renders.
    expect(render({ ...STACK, images })).toBe(html);
  });

  it("ignores display, frame and order", () => {
    const tagged = {
      ...STACK,
      display: "whole",
      frame: "strip",
      order: "product_first",
      images: STACK.images.map((img, i) => (i === 4 ? { ...img, product_ids: [saleProduct.id] } : img)),
    };
    expect(render(tagged)).toBe(ar);
  });

  it("reads right to left with classes, never dir, and no yellow fill", () => {
    expect(ar).not.toMatch(/\sdir="/);
    expect(ar).toContain("flex-row-reverse");
    expect(ar).not.toContain("bg-bk-primary");
    expect(en).not.toMatch(/\sdir="/);
  });

  it("without heading_style the heading is today's section header", () => {
    const plain = render({ ...STACK, heading_style: undefined });
    expect(plain).not.toContain("text-bk-chapter");
    expect(plain).toContain("كلامهم مو كلامنا");
  });
});
