// =====================================================================
// Section — hero_video
// =====================================================================
// Looping silent video background with an overlay headline + CTA. Falls
// back to a gradient placeholder if no video URL is set. The video is
// always rendered muted+playsinline so it autoplays on iOS without
// blocking the page.
// =====================================================================

import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import { StoreLink } from "./helpers/store-context";
import {
  BentoCard,
  ChunkyButton,
  Section,
} from "./helpers/primitives";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";

const schema = z.object({
  video_url: z.string().describe("video"),
  poster_url: z.string().describe("image").optional(),
  title_i18n: i18nStringSchema,
  subtitle_i18n: i18nStringOptional,
  cta_label_i18n: i18nStringSchema,
  cta_href: z.string().describe("url"),
  overlay_opacity: z.number().min(0).max(1),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  video_url: "",
  poster_url: undefined,
  title_i18n: {
    en: "Made for movement",
    ar: "صُمّمت للحركة",
  },
  subtitle_i18n: {
    en: "Watch the new film.",
    ar: "شاهد الفيلم الجديد.",
  },
  cta_label_i18n: { en: "Shop the look", ar: "تسوّق الإطلالة" },
  cta_href: "/products",
  overlay_opacity: 0.45,
};

function HeroVideo({
  props,
  ctx,
}: {
  props: Props;
  ctx: import("./_types").SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const title = resolveI18n(props.title_i18n, locale);
  const subtitle = resolveI18n(props.subtitle_i18n, locale);
  const ctaLabel = resolveI18n(props.cta_label_i18n, locale);
  const opacity = Math.max(0, Math.min(1, props.overlay_opacity));

  return (
    <Section bleed className="px-4 py-6 sm:py-10">
      <BentoCard
        bg="ink"
        size="lg"
        className="relative overflow-hidden p-0 min-h-[420px] sm:min-h-[520px]"
      >
        {props.video_url ? (
          <video
            className="absolute inset-0 w-full h-full object-cover"
            src={props.video_url}
            poster={props.poster_url}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-bk-ink via-bk-decor-b/60 to-bk-primary/60" />
        )}
        <div
          className="absolute inset-0"
          style={{ backgroundColor: `rgba(0,0,0,${opacity})` }}
          aria-hidden="true"
        />
        <div className="relative z-10 px-6 sm:px-10 py-12 sm:py-20 flex flex-col items-start max-w-xl">
          <h1 className="font-display font-black text-bk-hero uppercase leading-[0.95] tracking-tight text-white drop-shadow-[2px_2px_0_#1a1a1a] max-w-[14ch] sm:max-w-2xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-bk-sm font-body text-base sm:text-lg text-white/90 max-w-md">
              {subtitle}
            </p>
          )}
          <div className="mt-bk-md">
            <StoreLink href={props.cta_href} aria-label={ctaLabel}>
              <ChunkyButton bg="pink" size="lg">
                {ctaLabel}
              </ChunkyButton>
            </StoreLink>
          </div>
        </div>
      </BentoCard>
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "hero_video",
  category: "hero",
  name: { en: "Video Hero", ar: "غلاف فيديو" },
  description: {
    en: "Looping muted video background with overlay headline and CTA.",
    ar: "غلاف فيديو متكرّر مع عنوان فوقي وزر دعوة.",
  },
  thumbnail: "/sections/hero_video.svg",
  valid_on: ["home"],
  schema,
  defaultProps,
  render: HeroVideo,
};

registerSection(definition);
export default definition;
