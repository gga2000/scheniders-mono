// =====================================================================
// Section — hero_card_float
// =====================================================================
// Photo hero with a floating card anchored to one side (start / center /
// end) on desktop. On mobile the photo stacks ABOVE the card and the
// card overlaps its bottom edge, so the LCP image is a real picture
// instead of a 40px sliver behind a full-width card. The mobile crop box
// defaults to LANDSCAPE (`media_ratio`) because merchant hero photos are
// overwhelmingly landscape: a portrait box forced `object-cover` to
// upscale a downscaled landscape source (blurred LCP) and sliced the
// subject vertically. `focal_x` / `focal_y` move the crop off-centre so
// the subject survives the card side. The card sits on
// `--bk-surface`, carries the headline + sub + a pill-shaped primary CTA
// (shopping-bag icon), and an optional badge chip overlapping its top
// corner. Carries the same secondary-CTA contract as `hero_image`
// (WhatsApp / call / category link) so the WhatsApp-orderable-hero
// template invariant holds. Every CTA is a real link — no `<button>`
// nested inside an `<a>`.
// =====================================================================

import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
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
import { discountPercent, formatPercent } from "./helpers/format";
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
  /**
   * Shape of the stacked photo box on mobile. Landscape when unset —
   * it matches how merchant hero photos are actually shot, so `cover`
   * crops a sliver instead of half the frame and never upscales.
   */
  media_ratio: z.enum(["landscape", "square", "portrait"]).optional(),
  /**
   * Where `object-cover` holds the crop. Unset renders no
   * `object-position` at all, so existing configs keep the browser
   * default (`50% 50%`) byte for byte.
   */
  focal_x: z.enum(["left", "center", "right"]).optional(),
  focal_y: z.enum(["top", "center", "bottom"]).optional(),
  /**
   * Turns the corner chip into a LIVE offer badge. `max_discount` reads
   * the real best discount out of the catalogue on screen, so the chip
   * can never advertise a saving the cart will not honour, and never
   * goes stale when prices move. `badge_i18n` carries the wording and
   * `{pct}` marks where the number lands.
   */
  offer_badge: z.enum(["none", "max_discount"]).optional(),
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

/** Placeholder the merchant writes into `badge_i18n` for the live number. */
const PCT_TOKEN = "{pct}";

/**
 * Badge content: the merchant's wording with `{pct}` swapped for the live
 * figure. `{pct}` stands for the whole "36٪", sign included — the
 * merchant writes "خصم لحد {pct}", not "خصم لحد {pct}٪".
 *
 * The isolate is not cosmetic, and the sign must live INSIDE it. The page
 * is LTR in every locale, so an Arabic phrase carrying a Latin number and
 * a percent sign gets reordered by the bidi algorithm: measured in the
 * browser, splitting the two renders the chip as [36][٪][خصم لحد]. Kept
 * together in one `<bdi>` it reads [خصم لحد][36٪]. `formatPrice` pairs a
 * number with "د.ع" under exactly the same rule.
 *
 * Returns null when the template wants a figure and none exists, so a
 * shopper never sees a stray sign or a raw `{pct}`.
 */
function renderBadge(
  template: string,
  pct: number | null,
  locale: SectionRenderContext["runtime"]["locale"],
): ReactNode {
  if (!template) return null;
  if (!template.includes(PCT_TOKEN)) return template;
  if (pct == null) return null;
  return template
    .split(PCT_TOKEN)
    .flatMap((part, i) =>
      i === 0
        ? [part]
        : [<bdi key={i}>{formatPercent(pct, locale)}</bdi>, part],
    );
}

/** Mobile crop box. Landscape is the default — see the header note. */
const MEDIA_RATIO_CLASS: Record<
  NonNullable<Props["media_ratio"]>,
  string
> = {
  landscape: "aspect-[5/4]",
  square: "aspect-square",
  portrait: "aspect-[4/5]",
};

/**
 * The desktop scrim runs FROM the card's side, so the photo keeps full
 * contrast on the side the subject lives on. A flat wash over the whole
 * frame buys nothing here — the card is an opaque surface — and only
 * dulls the product.
 */
const SCRIM_DIRECTION: Record<Props["card_align"], string> = {
  start: "to right",
  center: "to top",
  end: "to left",
};

/**
 * Scrim ink at a given alpha, mixed from the brand token rather than a
 * literal black: a warm-ink store gets a warm shade, not a grey one.
 * `color-mix` keeps this a one-liner without needing an `--bk-ink-rgb`
 * companion token.
 */
function scrimInk(alphaPercent: number): string {
  return `color-mix(in srgb, var(--bk-ink, #1a1a1a) ${alphaPercent}%, transparent)`;
}

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
  // Live offer badge. The best discount actually on screen — computed
  // from the same `price` the cart charges, so the chip cannot promise a
  // saving that does not exist. No qualifying product means no chip:
  // rendering the template with the number missing would leave a bare
  // "%" and a claim with nothing behind it.
  const maxDiscountPct =
    props.offer_badge === "max_discount"
      ? ctx.products.reduce<number | null>((best, product) => {
          const pct = discountPercent(product.price, product.compare_at_price);
          if (pct == null) return best;
          return best == null || pct > best ? pct : best;
        }, null)
      : null;
  const badge = renderBadge(
    resolveI18n(props.badge_i18n, locale),
    maxDiscountPct,
    locale,
  );
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
  const mediaRatio = props.media_ratio ?? "landscape";
  // Omit the property entirely when the merchant has not placed a focal
  // point, so the rendered markup matches pre-`focal_*` output exactly.
  const objectPosition =
    props.focal_x || props.focal_y
      ? `${props.focal_x ?? "center"} ${props.focal_y ?? "center"}`
      : undefined;

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
            className={cn(
              "relative w-full sm:absolute sm:inset-0 sm:aspect-auto",
              MEDIA_RATIO_CLASS[mediaRatio],
            )}
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
              // On mobile the box is 100vw WIDE but `cover` fills it by
              // HEIGHT for a landscape source, so a plain `100vw` hint
              // picks a candidate that then gets upscaled — a blurred
              // LCP. Ask for the next step up below `sm`.
              sizes="(max-width: 639px) 125vw, 100vw"
              className="absolute inset-0 w-full h-full object-cover"
              style={objectPosition ? { objectPosition } : undefined}
            />
            {/* Mobile: the card sits BELOW the photo on an opaque surface,
                so the photo only needs a fade where the card's top edge
                overlaps it. */}
            <div
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-24 sm:hidden"
              style={{
                background: `linear-gradient(to top, ${scrimInk(30)}, transparent)`,
              }}
            />
            {/* Desktop: the card floats ON the photo — shade its side only. */}
            <div
              aria-hidden="true"
              className="absolute inset-0 hidden sm:block"
              style={{
                background: `linear-gradient(${SCRIM_DIRECTION[props.card_align]}, ${scrimInk(
                  55,
                )}, ${scrimInk(12)} 55%, transparent)`,
              }}
            />
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
                <WhatsAppButton
                  href={whatsappHref}
                  tone="outline"
                  size="lg"
                  // Matches the primary's `w-full sm:w-auto`: two CTAs
                  // stacked at different widths read as a ragged edge,
                  // and the longer label made the SECONDARY the wider
                  // of the two.
                  className="w-full sm:w-auto"
                >
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
