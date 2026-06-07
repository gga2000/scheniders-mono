// =====================================================================
// Section — image_gallery
// =====================================================================
// Three layouts in one section:
//   - masonry — CSS columns, variable card heights.
//   - grid    — uniform 2/3-col grid.
//   - carousel — horizontal scroll-snap row.
// Each image can carry an optional caption and an optional click link.
// =====================================================================

import Image from "next/image";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import { StoreLink } from "./helpers/store-context";
import { Section, SectionHeader } from "./helpers/primitives";
import { i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";

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

const FALLBACK_TINTS = [
  "from-candy-mint/40 via-candy-sky/40 to-candy-lilac/40",
  "from-candy-butter/50 via-candy-pink/30 to-candy-mint/30",
  "from-candy-lilac/40 via-candy-pink/40 to-candy-butter/40",
  "from-candy-sky/40 via-candy-mint/40 to-candy-butter/40",
];

function ImageGallery({
  props,
  ctx,
}: {
  props: Props;
  ctx: import("./_types").SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const heading = resolveI18n(props.heading_i18n, locale);

  if (!props.images.length) return null;

  function ImgCard({
    img,
    index,
    aspect,
  }: {
    img: Props["images"][number];
    index: number;
    aspect: string;
  }) {
    const caption = resolveI18n(img.caption_i18n, locale);
    const tint = FALLBACK_TINTS[index % FALLBACK_TINTS.length];
    const body = (
      <div
        className={
          "relative overflow-hidden rounded-2xl border-[3px] border-candy-ink shadow-bento-sm " +
          aspect
        }
      >
        {img.url ? (
          <Image
            src={img.url}
            alt={caption}
            fill
            priority={index === 0}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${tint}`} />
        )}
        {caption && (
          <>
            {/* Gradient scrim keeps caption text legible over any image. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-candy-ink/70 to-transparent" />
            <div className="absolute bottom-2 left-2 right-2">
              <span className="inline-block font-label font-bold text-[11px] uppercase tracking-[0.2em] text-white drop-shadow">
                {caption}
              </span>
            </div>
          </>
        )}
      </div>
    );
    return img.link_href ? (
      <StoreLink href={img.link_href} className="block">
        {body}
      </StoreLink>
    ) : (
      body
    );
  }

  return (
    <Section>
      {heading && <SectionHeader title={heading} color="lilac" />}
      {props.layout === "masonry" && (
        <div className="columns-2 sm:columns-3 lg:columns-4 gap-bk-sm sm:gap-bk-md [column-fill:_balance]">
          {props.images.map((img, i) => {
            const aspectChoices = [
              "aspect-[3/4]",
              "aspect-square",
              "aspect-[4/5]",
              "aspect-[3/5]",
            ];
            const aspect = aspectChoices[i % aspectChoices.length];
            return (
              <div key={i} className="mb-bk-sm sm:mb-bk-md break-inside-avoid">
                <ImgCard img={img} index={i} aspect={aspect} />
              </div>
            );
          })}
        </div>
      )}
      {props.layout === "grid" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-bk-sm sm:gap-bk-md">
          {props.images.map((img, i) => (
            <ImgCard key={i} img={img} index={i} aspect="aspect-square" />
          ))}
        </div>
      )}
      {props.layout === "carousel" && (
        <div className="flex gap-bk-md overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-4 px-4">
          {props.images.map((img, i) => (
            <div key={i} className="min-w-[220px] sm:min-w-[280px] snap-start">
              <ImgCard img={img} index={i} aspect="aspect-[3/4]" />
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
