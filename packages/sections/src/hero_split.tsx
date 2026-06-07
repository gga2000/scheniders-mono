// =====================================================================
// Section — hero_split
// =====================================================================
// Two-column hero: large headline + CTA on one side, lifestyle/product
// image on the other. Side is configurable via `image_position` so the
// merchant can flip the layout per page.
// =====================================================================

import Image from "next/image";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import { StoreLink } from "./helpers/store-context";
import {
  BentoCard,
  ChunkyButton,
  Section,
  Sticker,
} from "./helpers/primitives";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";

const heroBg = z.enum([
  "white",
  "mint",
  "butter",
  "lilac",
  "sky",
  "pink",
  "cream",
]);

const schema = z.object({
  eyebrow_i18n: i18nStringOptional,
  title_i18n: i18nStringSchema,
  subtitle_i18n: i18nStringSchema,
  cta_label_i18n: i18nStringSchema,
  cta_href: z.string().describe("url"),
  image_url: z.string().describe("image"),
  image_position: z.enum(["left", "right"]),
  bg: heroBg,
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  eyebrow_i18n: { en: "New arrivals", ar: "وصلَ حديثاً" },
  title_i18n: {
    en: "Designed in Baghdad, dropped weekly.",
    ar: "تصميم بغدادي، إصدارات أسبوعية.",
  },
  subtitle_i18n: {
    en: "Limited-edition pieces engineered for Iraq's daily wear.",
    ar: "قطع محدودة مصممة لإيقاع حياتك اليومية في العراق.",
  },
  cta_label_i18n: { en: "Browse the drop", ar: "تصفّح التشكيلة" },
  cta_href: "/products",
  image_url: "",
  image_position: "right",
  bg: "cream",
};

function HeroSplit({
  props,
  ctx,
}: {
  props: Props;
  ctx: import("./_types").SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const eyebrow = resolveI18n(props.eyebrow_i18n, locale);
  const title = resolveI18n(props.title_i18n, locale);
  const subtitle = resolveI18n(props.subtitle_i18n, locale);
  const ctaLabel = resolveI18n(props.cta_label_i18n, locale);

  const reverse = props.image_position === "left";

  return (
    <Section bleed className="px-4 py-6 sm:py-10">
      <BentoCard
        bg={props.bg}
        size="lg"
        className="overflow-hidden p-0"
      >
        <div
          className={
            "grid grid-cols-1 lg:grid-cols-2 gap-0 " +
            (reverse ? "lg:[&>*:first-child]:order-2" : "")
          }
        >
          <div className="p-6 sm:p-10 flex flex-col justify-center">
            {eyebrow && (
              <div className="mb-bk-sm">
                <Sticker bg="pink" rotate={-3} size="sm">
                  {eyebrow}
                </Sticker>
              </div>
            )}
            <h1 className="font-display font-black text-bk-hero uppercase leading-[0.95] tracking-tight text-bk-ink max-w-[16ch] sm:max-w-2xl">
              {title}
            </h1>
            <p className="mt-bk-sm font-body text-base sm:text-lg text-bk-ink-soft max-w-md">
              {subtitle}
            </p>
            <div className="mt-bk-md">
              <StoreLink href={props.cta_href} aria-label={ctaLabel}>
                <ChunkyButton bg="pink" size="lg">
                  {ctaLabel}
                </ChunkyButton>
              </StoreLink>
            </div>
          </div>
          <div
            className="relative min-h-[260px] lg:min-h-[420px] border-t-[3px] lg:border-t-0 lg:border-l-[3px] border-candy-ink"
            style={{ backgroundColor: "var(--bk-surface,#fff7ed)" }}
          >
            {props.image_url ? (
              <Image
                src={props.image_url}
                alt=""
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-candy-pink/30 via-candy-butter/40 to-candy-lilac/40" />
            )}
          </div>
        </div>
      </BentoCard>
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "hero_split",
  category: "hero",
  name: { en: "Split Hero", ar: "غلاف مزدوج" },
  description: {
    en: "Two-column hero with image on one side and headline + CTA on the other.",
    ar: "غلاف بعمودين: صورة في جهة وعنوان وزر في الجهة الأخرى.",
  },
  thumbnail: "/sections/hero_split.svg",
  valid_on: ["home"],
  schema,
  defaultProps,
  render: HeroSplit,
};

registerSection(definition);
export default definition;
