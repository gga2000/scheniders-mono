// =====================================================================
// Section — hero_card_float
// =====================================================================
// Full-bleed background-image hero with a floating card anchored to one
// side (start / center / end). The card sits on `--bk-surface`, carries
// the headline + sub + a pill-shaped primary CTA (shopping-bag icon),
// and an optional badge chip overlapping its top corner. Carries the
// same secondary-CTA contract as `hero_image` (WhatsApp / call /
// category link) so the WhatsApp-orderable-hero template invariant
// holds. Everything is brand-kit-token driven — no hardcoded content.
// =====================================================================

import Image from "next/image";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import { StoreLink } from "./helpers/store-context";
import {
  ChunkyButton,
  Section,
  WhatsAppIcon,
  MaterialIcon,
} from "./helpers/primitives";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { isPlausiblePhone } from "./helpers/whatsapp";
import { isOptimizableImageHost } from "./helpers/image";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  headline_i18n: i18nStringSchema,
  sub_i18n: i18nStringSchema,
  cta_label_i18n: i18nStringSchema,
  cta_href: z.string().describe("url"),
  bg_image_url: z.string().describe("image").optional(),
  /** Which side the floating card anchors to on desktop. */
  card_align: z.enum(["start", "center", "end"]),
  /** Optional chip overlapping the card's top corner. */
  badge_i18n: i18nStringOptional,
  // Secondary CTA contract — mirrors `hero_image` exactly so store
  // templates can rely on one hero CTA shape across hero sections.
  secondary_cta_kind: z
    .enum(["whatsapp", "call", "category_link", "none"])
    .optional(),
  secondary_cta_value: z.string().optional(),
  secondary_cta_label_i18n: i18nStringOptional,
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  headline_i18n: { en: "Welcome!", ar: "يا هلا ومرحبا!" },
  sub_i18n: {
    en: "Discover our hand-picked collection, delivered across Iraq.",
    ar: "اكتشف تشكيلتنا المختارة بعناية، وتوصيل لكل العراق.",
  },
  cta_label_i18n: { en: "Shop the collection", ar: "مجموعتنا" },
  cta_href: "/products",
  bg_image_url: undefined,
  card_align: "start",
  badge_i18n: { en: "New", ar: "جديد" },
  secondary_cta_kind: "whatsapp",
  secondary_cta_value: "",
  secondary_cta_label_i18n: { en: "Chat on WhatsApp", ar: "تواصل عبر واتساب" },
};

/** Inline shopping-bag glyph for the primary CTA pill. */
function ShoppingBagIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

const ALIGN_CLASS: Record<Props["card_align"], string> = {
  start: "sm:justify-start",
  center: "sm:justify-center",
  end: "sm:justify-end",
};

function HeroCardFloatRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const headline = resolveI18n(props.headline_i18n, locale);
  const sub = resolveI18n(props.sub_i18n, locale);
  const ctaLabel = resolveI18n(props.cta_label_i18n, locale);
  const badge = resolveI18n(props.badge_i18n, locale);
  const secondaryLabel = resolveI18n(props.secondary_cta_label_i18n, locale);

  const secondaryHref = (() => {
    if (
      props.secondary_cta_kind === "whatsapp" &&
      isPlausiblePhone(props.secondary_cta_value)
    ) {
      return `https://wa.me/${props.secondary_cta_value!.replace(/\D/g, "")}`;
    }
    if (
      props.secondary_cta_kind === "call" &&
      isPlausiblePhone(props.secondary_cta_value)
    ) {
      return `tel:${props.secondary_cta_value}`;
    }
    if (props.secondary_cta_kind === "category_link" && props.secondary_cta_value) {
      return `/categories/${props.secondary_cta_value}`;
    }
    return null;
  })();

  const hasImage = !!props.bg_image_url;

  return (
    <Section bleed className="px-0 sm:px-4 py-0 sm:py-6">
      <div
        className="relative overflow-hidden min-h-[420px] sm:min-h-[520px] flex items-center"
        style={{
          borderRadius: "var(--bk-radius-card, 1.5rem)",
          backgroundColor: "var(--bk-ink, #1a1a1a)",
        }}
      >
        {/* Background — full-bleed photo (LCP element) or brand fallback. */}
        {hasImage ? (
          <div
            data-layer="bg_image"
            data-layer-label="Background image"
            data-layer-kind="image"
            className="absolute inset-0"
            style={{ backgroundColor: "var(--bk-surface, #fff7ed)" }}
          >
            <Image
              src={props.bg_image_url!}
              alt=""
              fill
              priority
              // Optimize (AVIF/WebP + srcset) when the host is allowlisted —
              // the hero is the LCP element. Off-allowlist URLs stay raw.
              unoptimized={!isOptimizableImageHost(props.bg_image_url)}
              sizes="100vw"
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Whisper of shade so the card edge reads on bright photos. */}
            <div className="absolute inset-0 bg-black/15" />
          </div>
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, var(--bk-surface-alt, #ffe9c7), var(--bk-accent, #ffd84a))",
            }}
          />
        )}

        {/* Floating card, anchored per `card_align` on desktop. */}
        <div
          className={
            "relative z-10 w-full flex justify-center px-4 sm:px-10 py-14 sm:py-20 " +
            ALIGN_CLASS[props.card_align]
          }
        >
          <div
            className="relative w-full max-w-xl p-6 sm:p-10"
            style={{
              backgroundColor: "var(--bk-surface, #fff7ed)",
              color: "var(--bk-ink, #1a1a1a)",
              borderRadius: "var(--bk-radius-card, 1.5rem)",
              boxShadow: "var(--bk-shadow-card, 6px 6px 0px 0px #1a1a1a)",
            }}
          >
            {badge && (
              <span
                data-i18n-field="badge_i18n"
                className="absolute -top-4 start-6 inline-flex items-center px-4 py-1.5 font-display font-bold text-xs sm:text-sm whitespace-nowrap"
                style={{
                  backgroundColor: "var(--bk-primary, #ff5a8a)",
                  color: "var(--bk-on-primary, #fff)",
                  borderRadius: "var(--bk-radius-pill, 9999px)",
                  boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
                  fontFamily: "var(--bk-font-display, inherit)",
                }}
              >
                {badge}
              </span>
            )}
            <h1
              data-i18n-field="headline_i18n"
              className="font-display font-black text-3xl sm:text-5xl leading-tight tracking-tight"
              style={{
                color: "var(--bk-ink, #1a1a1a)",
                fontFamily: "var(--bk-font-display, inherit)",
              }}
            >
              {headline}
            </h1>
            <p
              data-i18n-field="sub_i18n"
              className="mt-4 font-body text-base sm:text-lg"
              style={{
                color: "var(--bk-ink-soft, rgba(26,26,26,0.8))",
                fontFamily: "var(--bk-font-body, inherit)",
              }}
            >
              {sub}
            </p>
            <div
              data-layer="cta_group"
              data-layer-label="Buttons"
              data-layer-kind="button"
              className="mt-6 sm:mt-8 flex flex-wrap gap-bk-xs sm:gap-bk-sm items-center"
            >
              <StoreLink
                href={props.cta_href}
                aria-label={ctaLabel}
                className="flex-grow sm:flex-grow-0"
                data-i18n-field="cta_label_i18n"
              >
                {/* Primary CTA pill wears the tenant's brand primary. */}
                <ChunkyButton
                  bg="pink"
                  size="lg"
                  fullWidth
                  style={{ borderRadius: "var(--bk-radius-pill, 9999px)" }}
                >
                  {ctaLabel}
                  <ShoppingBagIcon />
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
                  <ChunkyButton
                    bg="white"
                    size="lg"
                    style={{ borderRadius: "var(--bk-radius-pill, 9999px)" }}
                  >
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
          </div>
        </div>
      </div>
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "hero_card_float",
  category: "hero",
  name: { en: "Floating-card hero", ar: "غلاف ببطاقة عائمة" },
  description: {
    en: "Full-bleed photo hero with a floating card: headline, sub, pill CTA, and an optional corner badge.",
    ar: "غلاف بصورة كاملة العرض وبطاقة عائمة تحتوي عنواناً ووصفاً وزراً رئيسياً وشارة اختيارية.",
  },
  thumbnail: "/sections/hero_card_float.svg",
  valid_on: ["home", "about"],
  schema,
  defaultProps,
  render: HeroCardFloatRender,
};

registerSection(definition);
export default definition;
