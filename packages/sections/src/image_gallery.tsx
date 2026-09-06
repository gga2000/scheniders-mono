// =====================================================================
// Section — image_gallery
// =====================================================================
// Three layouts in one section:
//   - masonry — CSS columns, variable card heights.
//   - grid    — uniform 2/3-col grid.
//   - carousel — horizontal scroll-snap row.
// Each image can carry an optional caption and an optional click link.
// Frames are token-driven (`--bk-border-thickness` / `--bk-ink` /
// `--bk-surface` / `--bk-shadow-card`); images optimise through
// next/image when the host is allowlisted and never claim `priority`
// (the hero owns the LCP preload).
// =====================================================================

import Image from "next/image";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { StoreLink } from "./helpers/store-context";
import {
  CenteredSectionHeader,
  PRESSABLE,
  Section,
} from "./helpers/primitives";
import { isOptimizableImageHost } from "./helpers/image";
import { cn } from "./helpers/utils";
import { i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  heading_i18n: i18nStringOptional,
  layout: z.enum(["masonry", "grid", "carousel"]),
  images: z.array(
    z.object({
      url: z.string().describe("image"),
      caption_i18n: i18nStringOptional,
      link_href: z.string().optional(),
    }),
  ),
});

type Props = z.infer<typeof schema>;
type GalleryImage = Props["images"][number];

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

/** `sizes` per layout — the carousel card is a fixed 280px, the grids
 *  are 2/3/4 columns. Wrong hints made next/image ship 4× oversized
 *  srcset candidates for the screenshot carousel. */
const SIZES: Record<Props["layout"], string> = {
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
        alt={caption}
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
  // An empty-url entry (fresh editor placeholder, deleted upload) is not a
  // picture — skip it rather than framing a blank tile.
  const images = props.images.filter((img) => img.url.trim().length > 0);
  if (!images.length) return null;

  const sizes = SIZES[props.layout];
  const galleryLabel = heading || (locale === "en" ? "Gallery" : "معرض الصور");

  return (
    <Section>
      {heading && (
        <CenteredSectionHeader
          title={heading}
          align="start"
          titleField="heading_i18n"
        />
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
      {props.layout === "carousel" && (
        <div
          role="region"
          aria-roledescription="carousel"
          aria-label={galleryLabel}
          className="flex gap-bk-md overflow-x-auto pb-2 snap-x snap-mandatory scroll-px-4 scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-4 px-4"
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
      )}
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "image_gallery",
  category: "content",
  name: { en: "Image gallery", ar: "ألبوم صور" },
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
