// =====================================================================
// Section — hero_card_float
// =====================================================================
// Photo hero with a floating card anchored to one side (start / center /
// end) on desktop. On mobile the photo stacks ABOVE the card (4:5) and
// the card overlaps its bottom edge, so the LCP image is a real picture
// instead of a 40px sliver behind a full-width card. The card sits on
// `--bk-surface`, carries the headline + sub + a pill-shaped primary CTA
// (shopping-bag icon), and an optional badge chip overlapping its top
// corner. Carries the same secondary-CTA contract as `hero_image`
// (WhatsApp / call / category link) so the WhatsApp-orderable-hero
// template invariant holds. Every CTA is a real link — no `<button>`
// nested inside an `<a>`.
// =====================================================================

import Image from "next/image";
import type { CSSProperties } from "react";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import { StoreLink } from "./helpers/store-context";
import {
  ChunkyLink,
  MaterialIcon,
  Section,
  WhatsAppButton,
} from "./helpers/primitives";
import { cn, PRESSABLE } from "./helpers/utils";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import {
  isPlausiblePhone,
  resolveTenantWhatsapp,
  whatsappDigits,
} from "./helpers/whatsapp";
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

/**
 * Store-internal pill CTA as a real `StoreLink` (next/link with the store
 * base path). Mirrors `ChunkyButton`'s token styling; folds into a
 * link-capable `ChunkyLink` once the primitive can wrap next/link.
 */
const PILL_LINK_CLASS = cn(
  "inline-flex items-center justify-center gap-2 px-6 py-4 text-lg font-display font-black bk-caps tracking-tight",
  PRESSABLE,
);

function pillLinkStyle(tone: "primary" | "surface"): CSSProperties {
  return {
    backgroundColor:
      tone === "primary"
        ? "var(--bk-primary, #ff5a8a)"
        : "var(--bk-surface, #ffffff)",
    color:
      tone === "primary"
        ? "var(--bk-on-primary, #fff)"
        : "var(--bk-ink, #1a1a1a)",
    border: "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
    borderRadius: "var(--bk-radius-pill, 9999px)",
    boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
    fontFamily: "var(--bk-font-display, inherit)",
  };
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

  const whatsappHref = (() => {
    if (props.secondary_cta_kind !== "whatsapp") return null;
    // Per-section override first, then the tenant's canonical number —
    // templates seed an empty value on purpose so the store-wide number
    // applies without per-template wiring (parity with hero_image).
    // `whatsappDigits` normalizes the local 07xx format to 9647xx.
    const number = resolveTenantWhatsapp(ctx.tenant, props.secondary_cta_value);
    return number ? `https://wa.me/${whatsappDigits(number)}` : null;
  })();
  const callHref =
    props.secondary_cta_kind === "call" &&
    isPlausiblePhone(props.secondary_cta_value)
      ? `tel:${props.secondary_cta_value}`
      : null;
  // Category links are store-internal: rendered through StoreLink so the
  // store base path (`/s/{slug}` when not on a subdomain) is preserved.
  const secondaryCategoryHref =
    props.secondary_cta_kind === "category_link" && props.secondary_cta_value
      ? `/categories/${props.secondary_cta_value}`
      : null;

  const bgImage = props.bg_image_url;

  return (
    <Section bleed className="px-0 sm:px-4 py-0 sm:py-6">
      <div
        className={cn(
          "relative overflow-hidden sm:flex sm:min-h-[520px] sm:items-center sm:bg-bk-ink",
          !bgImage && "flex min-h-[420px] items-center bg-bk-ink",
        )}
        style={{ borderRadius: "var(--bk-radius-card, 1.5rem)" }}
      >
        {/* Photo (LCP element): stacked 4:5 on mobile, full-bleed behind
            the card from `sm` up. Brand gradient when no photo is set. */}
        {bgImage ? (
          <div
            data-layer="bg_image"
            data-layer-label="Background image"
            data-layer-kind="image"
            className="relative aspect-[4/5] w-full sm:absolute sm:inset-0 sm:aspect-auto"
            style={{ backgroundColor: "var(--bk-surface, #fff7ed)" }}
          >
            <Image
              src={bgImage}
              alt=""
              fill
              priority
              // Optimize (AVIF/WebP + srcset) when the host is allowlisted —
              // the hero is the LCP element. Off-allowlist URLs stay raw.
              unoptimized={!isOptimizableImageHost(bgImage)}
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

        {/* Floating card: overlaps the photo's bottom edge on mobile,
            anchored per `card_align` on desktop. */}
        <div
          className={cn(
            "relative z-10 flex w-full justify-center px-4 sm:px-10 sm:py-20",
            bgImage ? "-mt-6 pb-6" : "py-14",
            ALIGN_CLASS[props.card_align],
          )}
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
              className="font-display font-black text-bk-h1 text-balance tracking-tight"
              style={{
                color: "var(--bk-ink, #1a1a1a)",
                fontFamily: "var(--bk-font-display, inherit)",
              }}
            >
              {headline}
            </h1>
            <p
              data-i18n-field="sub_i18n"
              className="mt-4 font-body text-base sm:text-lg text-pretty"
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
              {/* Primary CTA pill wears the tenant's brand primary. */}
              <StoreLink
                href={props.cta_href}
                data-i18n-field="cta_label_i18n"
                className={cn(PILL_LINK_CLASS, "w-full sm:w-auto")}
                style={pillLinkStyle("primary")}
              >
                {ctaLabel}
                <ShoppingBagIcon />
              </StoreLink>
              {whatsappHref && (
                <WhatsAppButton href={whatsappHref} tone="outline" size="lg">
                  <span data-i18n-field="secondary_cta_label_i18n">
                    {secondaryLabel}
                  </span>
                </WhatsAppButton>
              )}
              {callHref && (
                <ChunkyLink
                  href={callHref}
                  bg="white"
                  size="lg"
                  style={{ borderRadius: "var(--bk-radius-pill, 9999px)" }}
                >
                  <MaterialIcon name="call" />
                  <span data-i18n-field="secondary_cta_label_i18n">
                    {secondaryLabel}
                  </span>
                </ChunkyLink>
              )}
              {secondaryCategoryHref && (
                <StoreLink
                  href={secondaryCategoryHref}
                  className={PILL_LINK_CLASS}
                  style={pillLinkStyle("surface")}
                >
                  <span data-i18n-field="secondary_cta_label_i18n">
                    {secondaryLabel}
                  </span>
                </StoreLink>
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
    en: "Photo hero with a floating card: headline, sub, pill CTA, and an optional corner badge. Photo stacks above the card on mobile.",
    ar: "غلاف بصورة وبطاقة عائمة تحتوي عنواناً ووصفاً وزراً رئيسياً وشارة اختيارية. الصورة فوق البطاقة على الجوال.",
  },
  thumbnail: "/sections/hero_card_float.svg",
  valid_on: ["home", "about"],
  schema,
  defaultProps,
  render: HeroCardFloatRender,
};

registerSection(definition);
export default definition;
