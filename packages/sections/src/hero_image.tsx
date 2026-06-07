// =====================================================================
// Section — hero_image
// =====================================================================
// Image hero with overlay headline, body copy, and a primary CTA.
// Optional secondary CTA can render as WhatsApp / call / category link.
// Mirrors the existing schneiders home hero shape but is now driven
// purely by `SectionInstance.base` props via the store-config-v2 editor.
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
  WhatsAppIcon,
  MaterialIcon,
} from "./helpers/primitives";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";

const schema = z.object({
  title_i18n: i18nStringSchema,
  subtitle_i18n: i18nStringSchema,
  cta_label_i18n: i18nStringSchema,
  cta_href: z.string().describe("url"),
  image_url: z.string().describe("image").optional(),
  secondary_cta_kind: z
    .enum(["whatsapp", "call", "category_link", "none"])
    .optional(),
  secondary_cta_value: z.string().optional(),
  secondary_cta_label_i18n: i18nStringOptional,
  eyebrow_i18n: i18nStringOptional,
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  title_i18n: { en: "The new collection has arrived", ar: "تشكيلة جديدة" },
  subtitle_i18n: {
    en: "High-energy essentials, delivered across Iraq.",
    ar: "أساسيات بأسلوب جريء، توصيل لكل العراق.",
  },
  cta_label_i18n: { en: "Shop the drop", ar: "تسوّق الآن" },
  cta_href: "/products",
  image_url: undefined,
  secondary_cta_kind: "none",
  secondary_cta_value: "",
  secondary_cta_label_i18n: { en: "Chat on WhatsApp", ar: "تواصل عبر واتساب" },
  eyebrow_i18n: { en: "New season", ar: "موسم جديد" },
};

function HeroImageRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: { runtime: { locale: "ar" | "en" | "ku" } };
}) {
  const locale = ctx.runtime.locale;
  const title = resolveI18n(props.title_i18n, locale);
  const subtitle = resolveI18n(props.subtitle_i18n, locale);
  const ctaLabel = resolveI18n(props.cta_label_i18n, locale);
  const eyebrow = resolveI18n(props.eyebrow_i18n, locale);
  const secondaryLabel = resolveI18n(props.secondary_cta_label_i18n, locale);

  const secondaryHref = (() => {
    if (props.secondary_cta_kind === "whatsapp" && props.secondary_cta_value) {
      return `https://wa.me/${props.secondary_cta_value.replace(/\D/g, "")}`;
    }
    if (props.secondary_cta_kind === "call" && props.secondary_cta_value) {
      return `tel:${props.secondary_cta_value}`;
    }
    if (props.secondary_cta_kind === "category_link" && props.secondary_cta_value) {
      return `/categories/${props.secondary_cta_value}`;
    }
    return null;
  })();

  const hasImage = !!props.image_url;

  return (
    <Section bleed className="px-4 py-6 sm:py-10">
      <BentoCard
        bg={hasImage ? "ink" : "butter"}
        size="lg"
        className="relative overflow-hidden p-0 min-h-[340px] sm:min-h-[420px] flex flex-col justify-between"
      >
        {/* Image — full-bleed under a dark overlay so the rotated headline pops. */}
        {hasImage ? (
          <div
            data-layer="image"
            data-layer-label="Background image"
            data-layer-kind="image"
            className="absolute inset-0"
            style={{ backgroundColor: "var(--bk-surface, #fff7ed)" }}
          >
            <Image
              src={props.image_url!}
              alt=""
              fill
              priority
              unoptimized
              sizes="(max-width: 768px) 100vw, 80vw"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/40" />
          </div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-candy-butter via-candy-pink/30 to-candy-lilac" />
        )}

        <div className="relative z-10 p-6 sm:p-10 max-w-xl">
          {eyebrow && (
            <div className="mb-4" data-i18n-field="eyebrow_i18n">
              <Sticker bg="butter" rotate={-4} size="sm">
                {eyebrow}
              </Sticker>
            </div>
          )}
          <h1
            data-i18n-field="title_i18n"
            className="font-display font-black text-bk-hero uppercase leading-[0.9] tracking-tight max-w-[14ch] sm:max-w-2xl"
            style={{
              color: hasImage ? "#ffffff" : "var(--bk-ink, #1a1a1a)",
              transform: "rotate(-2deg)",
              transformOrigin: "left top",
              fontFamily: "var(--bk-font-display, inherit)",
              textShadow: hasImage ? "2px 2px 0 rgba(0,0,0,0.35)" : undefined,
              display: "inline-block",
            }}
          >
            {title}
          </h1>
          <p
            data-i18n-field="subtitle_i18n"
            className="mt-6 font-body text-base sm:text-lg max-w-md"
            style={{
              color: hasImage
                ? "rgba(255,255,255,0.92)"
                : "var(--bk-ink-soft, rgba(26,26,26,0.8))",
              fontFamily: "var(--bk-font-body, inherit)",
            }}
          >
            {subtitle}
          </p>
        </div>
        <div
          data-layer="cta_group"
          data-layer-label="Buttons"
          data-layer-kind="button"
          className="relative z-10 p-6 sm:p-10 pt-0 flex flex-wrap gap-bk-xs sm:gap-bk-sm items-center"
        >
          <StoreLink
            href={props.cta_href}
            aria-label={ctaLabel}
            className="flex-grow sm:flex-grow-0"
            data-i18n-field="cta_label_i18n"
          >
            <ChunkyButton bg="mint" size="lg" fullWidth>
              {ctaLabel}
              <MaterialIcon name="shopping_cart" />
            </ChunkyButton>
          </StoreLink>
          {secondaryHref && (
            <a
              href={secondaryHref}
              target={
                props.secondary_cta_kind === "whatsapp" ? "_blank" : undefined
              }
              rel={
                props.secondary_cta_kind === "whatsapp"
                  ? "noopener noreferrer"
                  : undefined
              }
              aria-label={secondaryLabel}
            >
              <ChunkyButton bg="white" size="lg">
                {props.secondary_cta_kind === "whatsapp" ? (
                  <WhatsAppIcon className="w-5 h-5" />
                ) : props.secondary_cta_kind === "call" ? (
                  <MaterialIcon name="call" />
                ) : null}
                {secondaryLabel}
              </ChunkyButton>
            </a>
          )}
        </div>
      </BentoCard>
    </Section>
  );
}

const def: SectionDefinition<Props> = {
  type: "hero_image",
  category: "hero",
  name: { en: "Image hero", ar: "غلاف مع صورة" },
  description: {
    en: "Big image hero with overlay headline, sub-line, and a primary CTA.",
    ar: "غلاف رئيسي بصورة كبيرة وعنوان جريء ودعوة لاتخاذ إجراء.",
  },
  thumbnail: "/sections/hero_image.svg",
  valid_on: ["home"],
  schema,
  defaultProps,
  render: HeroImageRender,
};

registerSection(def);
export default def;
