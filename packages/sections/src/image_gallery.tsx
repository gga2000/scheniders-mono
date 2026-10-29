// =====================================================================
// Section — image_gallery
// =====================================================================
// Three layouts in one section:
//   - masonry — CSS columns, variable card heights.
//   - grid    — uniform 2/3-col grid.
//   - carousel — horizontal scroll-snap row.
// Each image can carry an optional caption, an optional `alt_i18n` (falls
// back to the caption, then ""), and an optional click link. The carousel
// gets desktop prev/next arrows (touch scrolls the snap track directly).
// Frames are token-driven (`--bk-border-thickness` / `--bk-ink` /
// `--bk-surface` / `--bk-shadow-card`); images optimise through
// next/image when the host is allowlisted and never claim `priority`
// (the hero owns the LCP preload).
//
// Opt-in `display: "whole"` (carousel only): every picture is shown WHOLE
// (object-contain) in a quiet hairline card sized by `frame`, and a tap on
// an unlinked picture opens the full-screen swipe viewer
// (image_gallery.client.tsx). Made for screenshots, receipts and chats,
// which a cropped portrait card turns into blurry half-words. Absent, the
// historical cropped cards render byte-identically.
//
// Opt-in `order: "product_first"`: each image may name `product_ids`; on a
// product page the pictures tagged for that product lead, untagged keep
// their order, others' go last (image-gallery-order.ts). Absent, or with
// no tags, the list renders as entered, byte-identically.
//
// Opt-in `layout: "stack"` (the PDP proof stack, spec §1.5): a source
// pill and an optional scope line under the heading, then the first
// `initial_count` comments as live text — a numbered doubt, the quote in
// «», the author — each over its full-width screenshot, cropped to the
// comment column by `crop` (image-gallery-crop.ts) at the file's natural
// height. A legend explains the "liked by us" mark once, after the first
// comment. The rest stay in the HTML, hidden behind one expand button
// (image_gallery.stack.tsx). Every screenshot opens the viewer. `display`,
// `frame` and `order` are ignored by the stack. Its server markup lives in
// image_gallery.proofstack.tsx.
//
// Opt-in `heading_style: "chapter"` draws the heading with ChapterHeading
// in every layout. Absent, today's CenteredSectionHeader.
//
// Empty state: a freshly added section still carries the untouched
// default image list (four empty urls). That renders one neutral
// placeholder frame naming the section so the editor canvas is not
// blank; any edited list whose urls are all empty renders nothing, so a
// live store never shows a placeholder for a gallery the merchant
// emptied on purpose.
// =====================================================================

import { useId } from "react";
import Image from "next/image";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { StoreLink } from "./helpers/store-context";
import {
  CenteredSectionHeader,
  MaterialIcon,
  Section,
} from "./helpers/primitives";
import { ChapterHeading } from "./helpers/chapter-heading";
import { isOptimizableImageHost } from "./helpers/image";
import { CarouselArrows } from "./helpers/carousel-arrows";
import { cn, PRESSABLE } from "./helpers/utils";
import { chromeString } from "./helpers/chrome-strings";
import { i18nStringOptional } from "./_schema";
import { GalleryViewer } from "./image_gallery.client";
import { ProofStack } from "./image_gallery.proofstack";
import { STACK_SIZES } from "./image-gallery-crop";
import { VIEWER_STRINGS, fillAlt, fillCount } from "./image-gallery-viewer-strings";
import { orderGalleryImages } from "./image-gallery-order";
import type { GalleryViewerImage } from "./image_gallery.client";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  heading_i18n: i18nStringOptional,
  /** "stack" (opt-in) = the proof stack: lead comments with their doubt,
   *  quote and author over a full-width screenshot, the rest behind one
   *  expand button. An unknown stored value falls back to "grid" (the
   *  default) instead of dropping the section. */
  layout: z.enum(["masonry", "grid", "carousel", "stack"]).catch("grid"),
  images: z.array(
    z.object({
      url: z.string().describe("image"),
      caption_i18n: i18nStringOptional,
      /** Screen-reader description (P1-15). Omitted → caption → "". */
      alt_i18n: i18nStringOptional,
      link_href: z.string().optional(),
      /** Opt-in: the products this picture is about (ids). Read only by
       *  `order: "product_first"`. The name gives it the builder's
       *  product picker (section-field-widgets matches `*product_ids`). */
      product_ids: z.array(z.string()).optional().catch(undefined),
      /** Stack only: the comment's strongest line, verbatim, shown as live
       *  text in «». Absent → a screenshot-only row. */
      quote_i18n: i18nStringOptional.catch(undefined),
      /** Stack only: the buyer's doubt this comment answers (the eyebrow). */
      doubt_i18n: i18nStringOptional.catch(undefined),
      /** Stack only: the commenter's display name, as written. */
      author: z.string().max(80).optional().catch(undefined),
      /** Stack only: a business account (tagged «حساب شركة»). */
      is_business: z.boolean().optional().catch(undefined),
      /** Stack only: the stored file's pixel size. Both set → the picture
       *  keeps its natural ratio (and `crop` applies); else a 4/1 box. */
      width: z.number().int().min(1).max(4000).optional().catch(undefined),
      height: z.number().int().min(1).max(4000).optional().catch(undefined),
      /** Stack only: percent of the uncropped width cut from each side
       *  (TikTok's avatar column, its scrollbar strip). */
      crop: z
        .object({ left: z.number().min(0).max(40), right: z.number().min(0).max(40) })
        .optional()
        .catch(undefined),
    }),
  ),
  /** Opt-in: show every picture WHOLE (object-contain, never cropped) in a
   *  quiet hairline card, and open unlinked images in a full-screen swipe
   *  viewer on tap. For screenshots, receipts and chats. Honoured by the
   *  carousel layout only; grid and masonry ignore it. Absent means the
   *  historical cropped cards, byte-identical. */
  display: z.enum(["whole"]).optional().catch(undefined),
  /** Opt-in card ratio for display "whole". Absent means portrait (3/4).
   *  "strip" (16/5) fits wide chat/comment screenshots. */
  frame: z
    .enum(["portrait", "square", "landscape", "strip"])
    .optional()
    .catch(undefined),
  /** Opt-in: on a product page, pictures tagged with that product come
   *  first, then untagged ones, then ones tagged only for other
   *  products; order inside each group is kept. Absent, or with nothing
   *  tagged, the merchant's order renders byte-identically. */
  order: z.enum(["product_first"]).optional().catch(undefined),
  /** Stack: how many comments lead (with doubt and quote); the rest
   *  open behind «شوف N تعليقات ثانية». Absent = 3. */
  initial_count: z.number().int().min(1).max(12).optional().catch(undefined),
  /** Stack: the source pill under the heading («تعليقات على إعلاناتنا بتيك توك»). */
  source_label_i18n: i18nStringOptional.catch(undefined),
  /** Stack: "store" adds the scope line «3 من أصل 9، على عطورنا بشكل
   *  عام» (the comments are about the shop, not this product). */
  scope: z.enum(["store", "product"]).optional().catch(undefined),
  /** Stack: one line after the first comment explaining the
   *  "liked by us" mark on the screenshots. */
  legend_i18n: i18nStringOptional.catch(undefined),
  /** Stack: the mark's picture beside the legend (the store logo as it
   *  appears on TikTok). Absent → `branding.logo_url`; neither → text only. */
  legend_image_url: z.string().describe("image").optional().catch(undefined),
  /** "chapter" renders the heading at the redesign's one chapter scale
   *  (ChapterHeading). Absent = today's heading, in every layout. */
  heading_style: z.enum(["section", "chapter"]).optional().catch(undefined),
});

export type Props = z.infer<typeof schema>;
export type GalleryImage = Props["images"][number];
type Frame = NonNullable<Props["frame"]>;

const SECTION_NAME = { en: "Image gallery", ar: "ألبوم صور" } as const;

const defaultProps: Props = {
  heading_i18n: { en: "From the lookbook", ar: "من اللوك بوك" },
  layout: "grid",
  images: [
    { url: "", caption_i18n: { en: "Look 01", ar: "إطلالة 01" } },
    { url: "", caption_i18n: { en: "Look 02", ar: "إطلالة 02" } },
    { url: "", caption_i18n: { en: "Look 03", ar: "إطلالة 03" } },
    { url: "", caption_i18n: { en: "Look 04", ar: "إطلالة 04" } },
  ],
};

/**
 * True only for the untouched default image list — the runtime-independent
 * "this section was just added" signal. Any merchant edit (a url, a
 * caption, a removed entry) breaks equality and the section goes back to
 * rendering nothing while no url is set.
 */
function isUntouchedDefaultImages(images: GalleryImage[]): boolean {
  return (
    images.every((img) => img.url.trim().length === 0) &&
    JSON.stringify(images) === JSON.stringify(defaultProps.images)
  );
}

/** `sizes` per layout — the carousel card is a fixed 280px, the grids
 *  are 2/3/4 columns. Wrong hints made next/image ship 4× oversized
 *  srcset candidates for the screenshot carousel. */
const SIZES: Record<Props["layout"], string> = {
  stack: STACK_SIZES,
  carousel: "280px",
  grid: "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw",
  masonry: "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw",
};

const MASONRY_ASPECTS = [
  "aspect-[3/4]",
  "aspect-square",
  "aspect-[4/5]",
  "aspect-[3/5]",
] as const;

/** Card geometry for `display: "whole"`. Full literals so Tailwind's
 *  content scan sees every class. At 390px a landscape/strip card is
 *  318px wide and the next card peeks ~44px past the edge. */
const WHOLE_FRAME: Record<Frame, { aspect: string; width: string; sizes: string }> = {
  portrait: {
    aspect: "aspect-[3/4]",
    width: "w-[220px] sm:w-[280px]",
    sizes: "280px",
  },
  square: {
    aspect: "aspect-square",
    width: "w-[220px] sm:w-[280px]",
    sizes: "280px",
  },
  landscape: {
    aspect: "aspect-[4/3]",
    width: "w-[calc(100%-2.5rem)] sm:w-[420px]",
    sizes: "(max-width: 640px) calc(100vw - 4.5rem), 420px",
  },
  strip: {
    aspect: "aspect-[16/5]",
    width: "w-[calc(100%-2.5rem)] sm:w-[420px]",
    sizes: "(max-width: 640px) calc(100vw - 4.5rem), 420px",
  },
};

const WHOLE_FRAME_CLS =
  "relative block w-full overflow-hidden rounded-bk-card border-bk border-bk-divider bg-bk-surface";
const WHOLE_BUTTON_CLS = cn(
  WHOLE_FRAME_CLS,
  "group cursor-zoom-in text-start focus-visible:outline-none focus-visible:ring-2 ring-bk-focus ring-offset-2",
  PRESSABLE,
);
const ZOOM_TAG_CLS =
  "pointer-events-none absolute bottom-bk-2xs end-bk-2xs inline-flex size-6 items-center justify-center rounded-bk-pill border-bk border-bk-divider bg-bk-surface text-bk-ink-soft";

/** One whole-picture card. `viewer` carries the picture's slot in the
 *  viewer and the button's accessible name (the action, then the alt —
 *  an `aria-label` replaces the inner <img alt>, so the action must be in
 *  it); it is null for a linked card (the link wins, no viewer). */
function WholeCard({
  img,
  frame,
  locale,
  viewer,
}: {
  img: GalleryImage;
  frame: Frame;
  locale: LocaleCode;
  viewer: { index: number; label: string } | null;
}) {
  const caption = resolveI18n(img.caption_i18n, locale);
  const alt = resolveI18n(img.alt_i18n, locale) || caption;
  const geometry = WHOLE_FRAME[frame];
  const picture = (
    <Image
      src={img.url}
      alt={alt}
      fill
      unoptimized={!isOptimizableImageHost(img.url)}
      sizes={geometry.sizes}
      className="absolute inset-0 h-full w-full object-contain"
    />
  );
  return (
    <div className={cn(geometry.width, "shrink-0 snap-start")}>
      {img.link_href ? (
        <StoreLink href={img.link_href} className={cn("block", PRESSABLE)}>
          <span className={cn(WHOLE_FRAME_CLS, geometry.aspect)}>{picture}</span>
        </StoreLink>
      ) : viewer ? (
        <button
          type="button"
          data-gallery-open={viewer.index}
          aria-haspopup="dialog"
          aria-label={viewer.label}
          className={cn(WHOLE_BUTTON_CLS, geometry.aspect)}
        >
          {picture}
          <span aria-hidden="true" className={ZOOM_TAG_CLS}>
            <MaterialIcon name="zoom_in" className="text-[16px]" />
          </span>
        </button>
      ) : null}
      {/* Below the frame, never a scrim over it: a scrim would cover the
          very text a screenshot exists to show. */}
      {caption && (
        <p className="mt-bk-2xs line-clamp-2 font-bk-body text-xs text-bk-ink-soft">
          {caption}
        </p>
      )}
    </div>
  );
}

/** The opt-in `display: "whole"` carousel: same region, track and desktop
 *  arrows as the historical carousel, whole pictures, tap-to-view. */
function WholeCarousel({
  images,
  frame,
  locale,
  trackId,
  galleryLabel,
  heading,
}: {
  images: GalleryImage[];
  frame: Frame;
  locale: LocaleCode;
  trackId: string;
  galleryLabel: string;
  heading: string;
}) {
  const strings = locale === "en" ? VIEWER_STRINGS.en : VIEWER_STRINGS.ar;
  const unlinked = images.filter((img) => !img.link_href);
  const total = unlinked.length;
  const viewerImages: GalleryViewerImage[] = unlinked.map((img, i) => ({
    url: img.url,
    alt:
      resolveI18n(img.alt_i18n, locale) || resolveI18n(img.caption_i18n, locale),
    counter: fillCount(strings.counter, i + 1, total),
  }));
  const openLabel = (slot: number): string => {
    const alt = viewerImages[slot]?.alt;
    return alt
      ? fillAlt(strings.openNamed, alt)
      : fillCount(strings.open, slot + 1, total);
  };
  let nextSlot = 0;
  const slots = images.map((img) => (img.link_href ? null : nextSlot++));

  const row = (
    <div role="region" aria-roledescription="carousel" aria-label={galleryLabel}>
      <div
        id={trackId}
        className="flex gap-bk-sm overflow-x-auto pb-2 snap-x snap-mandatory scroll-px-4 scroll-smooth motion-reduce:scroll-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-4 px-4"
      >
        {images.map((img, i) => {
          const slot = slots[i];
          return (
            <WholeCard
              key={i}
              img={img}
              frame={frame}
              locale={locale}
              viewer={
                slot === null || slot === undefined
                  ? null
                  : { index: slot, label: openLabel(slot) }
              }
            />
          );
        })}
      </div>
      {images.length > 1 && (
        <CarouselArrows
          trackId={trackId}
          prevLabel={locale === "en" ? "Previous images" : "الصور السابقة"}
          nextLabel={locale === "en" ? "Next images" : "الصور التالية"}
          className="mt-bk-sm justify-end"
        />
      )}
    </div>
  );

  if (!viewerImages.length) return row;
  return (
    <GalleryViewer
      images={viewerImages}
      labels={{
        close: chromeString("close", locale),
        prev: strings.prev,
        next: strings.next,
      }}
      dialogLabel={heading || strings.viewer}
    >
      {row}
    </GalleryViewer>
  );
}

/** Module-scope card (not declared inside the render — a per-render
 *  component type would remount every image on each parent update). */
function ImgCard({
  img,
  aspect,
  sizes,
  locale,
}: {
  img: GalleryImage;
  aspect: string;
  sizes: string;
  locale: LocaleCode;
}) {
  const caption = resolveI18n(img.caption_i18n, locale);
  const alt = resolveI18n(img.alt_i18n, locale) || caption;
  const body = (
    <div
      className={cn("relative overflow-hidden", aspect)}
      style={{
        border: "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
        borderRadius: "var(--bk-radius-card, 1rem)",
        backgroundColor: "var(--bk-surface, #ffffff)",
        boxShadow: "var(--bk-shadow-card, 2px 2px 0px 0px #1a1a1a)",
      }}
    >
      <Image
        src={img.url}
        alt={alt}
        fill
        unoptimized={!isOptimizableImageHost(img.url)}
        sizes={sizes}
        className="absolute inset-0 h-full w-full object-cover"
      />
      {caption && (
        <>
          {/* Ink scrim keeps caption text legible over any image. */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2"
            style={{
              background:
                "linear-gradient(to top, color-mix(in srgb, var(--bk-ink, #1a1a1a) 70%, transparent), transparent)",
            }}
          />
          <div className="absolute bottom-2 left-2 right-2">
            <span
              className="inline-block font-label font-bold text-[11px] bk-caps tracking-[0.2em] drop-shadow"
              style={{ color: "var(--bk-surface, #ffffff)" }}
            >
              {caption}
            </span>
          </div>
        </>
      )}
    </div>
  );
  return img.link_href ? (
    <StoreLink href={img.link_href} className={cn("block", PRESSABLE)}>
      {body}
    </StoreLink>
  ) : (
    body
  );
}

function ImageGallery({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const heading = resolveI18n(props.heading_i18n, locale);
  const trackId = useId();
  // An empty-url entry (fresh editor placeholder, deleted upload) is not a
  // picture — skip it rather than framing a blank tile.
  const withUrl = props.images.filter((img) => img.url.trim().length > 0);
  // The stack keeps the merchant's order: it is chosen by the doubt each
  // comment answers, not by product.
  const images =
    props.layout === "stack" ? withUrl : orderGalleryImages(withUrl, props.order, ctx.product?.id);
  if (!images.length) {
    if (!isUntouchedDefaultImages(props.images)) return null;
    return (
      <Section>
        <div
          data-gallery-placeholder=""
          className="flex aspect-[3/2] w-full items-center justify-center p-bk-md text-center sm:aspect-[4/1]"
          style={{
            border:
              "var(--bk-border-thickness, 3px) dashed var(--bk-ink-faint, rgb(26 26 26 / 0.2))",
            borderRadius: "var(--bk-radius-card, 1rem)",
            backgroundColor: "var(--bk-surface-alt, #f7f4ee)",
            color: "var(--bk-ink-soft, rgb(26 26 26 / 0.6))",
          }}
        >
          <span className="font-label font-bold text-sm bk-caps tracking-[0.2em]">
            {resolveI18n(SECTION_NAME, locale)}
          </span>
        </div>
      </Section>
    );
  }

  const sizes = SIZES[props.layout];
  const galleryLabel = heading || (locale === "en" ? "Gallery" : "معرض الصور");

  return (
    <Section>
      {heading &&
        (props.heading_style === "chapter" ? (
          <ChapterHeading title={heading} locale={locale} titleField="heading_i18n" />
        ) : (
          <CenteredSectionHeader
            title={heading}
            align="start"
            titleField="heading_i18n"
          />
        ))}
      {props.layout === "stack" && (
        <ProofStack props={props} images={images} ctx={ctx} listId={trackId} heading={heading} />
      )}
      {props.layout === "masonry" && (
        <div className="columns-2 sm:columns-3 lg:columns-4 gap-bk-sm sm:gap-bk-md [column-fill:_balance]">
          {images.map((img, i) => (
            <div key={i} className="mb-bk-sm sm:mb-bk-md break-inside-avoid">
              <ImgCard
                img={img}
                aspect={MASONRY_ASPECTS[i % MASONRY_ASPECTS.length]}
                sizes={sizes}
                locale={locale}
              />
            </div>
          ))}
        </div>
      )}
      {props.layout === "grid" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-bk-sm sm:gap-bk-md">
          {images.map((img, i) => (
            <ImgCard
              key={i}
              img={img}
              aspect="aspect-square"
              sizes={sizes}
              locale={locale}
            />
          ))}
        </div>
      )}
      {props.layout === "carousel" && props.display === "whole" && (
        <WholeCarousel
          images={images}
          frame={props.frame ?? "portrait"}
          locale={locale}
          trackId={trackId}
          galleryLabel={galleryLabel}
          heading={heading}
        />
      )}
      {props.layout === "carousel" && props.display !== "whole" && (
        <div role="region" aria-roledescription="carousel" aria-label={galleryLabel}>
          <div
            id={trackId}
            className="flex gap-bk-md overflow-x-auto pb-2 snap-x snap-mandatory scroll-px-4 scroll-smooth motion-reduce:scroll-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-4 px-4"
          >
            {images.map((img, i) => (
              <div key={i} className="w-[220px] shrink-0 sm:w-[280px] snap-start">
                <ImgCard
                  img={img}
                  aspect="aspect-[3/4]"
                  sizes={sizes}
                  locale={locale}
                />
              </div>
            ))}
          </div>
          {/* Desktop-only arrows (P3-10) — touch already scrolls the track. */}
          {images.length > 1 && (
            <CarouselArrows
              trackId={trackId}
              prevLabel={locale === "en" ? "Previous images" : "الصور السابقة"}
              nextLabel={locale === "en" ? "Next images" : "الصور التالية"}
              className="mt-bk-sm justify-end"
            />
          )}
        </div>
      )}
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "image_gallery",
  category: "content",
  name: SECTION_NAME,
  description: {
    en: "Masonry, grid, or carousel layout of images with captions and links.",
    ar: "ألبوم صور بتخطيط ماسوني أو شبكي أو شريطي مع تسميات وروابط.",
  },
  thumbnail: "/sections/image_gallery.svg",
  valid_on: ["home", "about", "product"],
  schema,
  defaultProps,
  render: ImageGallery,
};

registerSection(definition);
export default definition;
