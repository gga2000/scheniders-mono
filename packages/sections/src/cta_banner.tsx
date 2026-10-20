// =====================================================================
// Section — cta_banner
// =====================================================================
// Full-bleed CTA strip: heading + sub + primary button on a coloured
// (or image) background. Designed to live near the bottom of a page as
// a last conversion nudge.
// =====================================================================

import type * as React from "react";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  BentoCard,
  Section,
  Sticker,
} from "./helpers/primitives";
import { StoreLink } from "./helpers/store-context";
import {
  i18nStringSchema,
  i18nStringOptional,
  urlString,
} from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const candyBg = z.enum(["pink", "mint", "butter", "lilac", "sky", "cream"]);

const schema = z.object({
  heading_i18n: i18nStringSchema,
  sub_i18n: i18nStringOptional,
  eyebrow_i18n: i18nStringOptional,
  cta_label_i18n: i18nStringSchema,
  cta_href: z.string(),
  background_image_url: urlString.optional(),
  bg_tint: candyBg,
  align: z.enum(["start", "center"]),
  /**
   * "invert" paints the band in ink with surface type on it. On a cream
   * page this is the one dark block, which is what makes a closing CTA
   * read as the end of the page rather than another quiet card.
   * Unset keeps the tinted card byte-identical.
   */
  tone: z.enum(["tint", "invert"]).optional(),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: {
    en: "Get it before it's gone",
    ar: "خذها قبل أن تنتهي",
  },
  sub_i18n: {
    en: "Free Baghdad delivery on orders over 50,000 IQD.",
    ar: "توصيل بغداد مجاني للطلبات فوق 50,000 د.ع.",
  },
  eyebrow_i18n: { en: "Limited time", ar: "وقت محدود" },
  cta_label_i18n: { en: "Shop now", ar: "تسوّق الآن" },
  cta_href: "/products",
  background_image_url: undefined,
  bg_tint: "pink",
  align: "start",
};

/** CTA styling shared by the banner's link. Mirrors ChunkyButton's `lg`
 *  size and primary surface without nesting a <button> inside an <a>. */
const CTA_LINK_CLS =
  "inline-flex items-center justify-center gap-2 px-6 py-4 text-lg font-display font-black bk-caps tracking-tight " +
  "transition-[transform,box-shadow,opacity] duration-bk-fast motion-reduce:transition-none " +
  "hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none active:translate-y-[2px] active:scale-[0.99]";

const ctaLinkStyle: React.CSSProperties = {
  backgroundColor: "var(--bk-primary, #ff5a8a)",
  color: "var(--bk-on-primary, #fff)",
  border: "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
  borderRadius: "var(--bk-radius-input, 0.75rem)",
  boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
  fontFamily: "var(--bk-font-display, inherit)",
};

function CtaBannerRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const heading = resolveI18n(props.heading_i18n, locale);
  const sub = resolveI18n(props.sub_i18n, locale);
  const eyebrow = resolveI18n(props.eyebrow_i18n, locale);
  const ctaLabel = resolveI18n(props.cta_label_i18n, locale);

  const alignClass =
    props.align === "center" ? "text-center items-center" : "text-left items-start";

  return (
    <Section>
      <BentoCard
        bg={props.bg_tint}
        size="lg"
        data-cta-tone={props.tone === "invert" ? "invert" : undefined}
        className="relative overflow-hidden p-0"
        style={
          props.tone === "invert"
            ? {
                borderRadius: "var(--bk-radius-card, 1.5rem)",
                backgroundColor: "var(--bk-ink, #1a1a1a)",
                // The dot grain the rest of the page carries, inverted so
                // it reads on ink rather than disappearing into it.
                backgroundImage:
                  "radial-gradient(color-mix(in srgb, var(--bk-surface, #ffffff) 12%, transparent) 0.9px, transparent 1px)",
                backgroundSize: "8px 8px",
                borderColor: "transparent",
              }
            : { borderRadius: "var(--bk-radius-card, 1.5rem)" }
        }
      >
        {props.background_image_url && (
          <div
            data-layer="background_image_url"
            data-layer-label="Background image"
            data-layer-kind="image"
            className="absolute inset-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={props.background_image_url}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-bk-ink/40" />
          </div>
        )}
        <div
          className={
            "relative z-10 p-bk-xl sm:p-bk-2xl flex flex-col gap-bk-sm " + alignClass
          }
          style={{
            // Over a photo the text sits on the bg-bk-ink/40 scrim above, so
            // it takes ink's partner, the page surface — literal white turns
            // into white-on-light on a dark kit, where ink is the light colour.
            color:
              props.background_image_url || props.tone === "invert"
                ? "var(--bk-surface, #ffffff)"
                : undefined,
          }}
        >
          {eyebrow && (
            <Sticker bg="white" rotate={-3} size="sm">
              {eyebrow}
            </Sticker>
          )}
          {/* On the 404 page this banner IS the page, so it owns the h1;
              anywhere else it is one section among many. */}
          {ctx.runtime.page_id === "not_found" ? (
            <h1
              data-i18n-field="heading_i18n"
              className="font-display font-black text-bk-h1 bk-caps leading-[0.95] tracking-tight max-w-2xl text-balance"
              style={{ fontFamily: "var(--bk-font-display, inherit)" }}
            >
              {heading}
            </h1>
          ) : (
            <h2
              data-i18n-field="heading_i18n"
              className="font-display font-black text-bk-h2 bk-caps leading-[0.95] tracking-tight max-w-2xl text-balance"
              style={{ fontFamily: "var(--bk-font-display, inherit)" }}
            >
              {heading}
            </h2>
          )}
          {sub && (
            <p
              data-i18n-field="sub_i18n"
              className="font-body text-base sm:text-lg max-w-xl opacity-90"
            >
              {sub}
            </p>
          )}
          <div className="mt-bk-2xs">
            {/* A styled link, never a <button> inside an <a>: that is invalid
                HTML and gives screen readers two nested controls. */}
            <StoreLink
              href={props.cta_href}
              data-i18n-field="cta_label_i18n"
              className={CTA_LINK_CLS}
              style={ctaLinkStyle}
            >
              {ctaLabel}
            </StoreLink>
          </div>
        </div>
      </BentoCard>
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "cta_banner",
  category: "conversion",
  name: { en: "CTA banner", ar: "شريط دعوة لاتخاذ إجراء" },
  description: {
    en: "Full-bleed CTA banner with heading, sub, and button. Optional bg image.",
    ar: "شريط دعوة لاتخاذ إجراء مع عنوان ووصف وزر، مع خلفية صورة اختيارية.",
  },
  thumbnail: "/sections/cta_banner.svg",
  valid_on: [
    "home",
    "about",
    "product",
    "category",
    "search",
    "cart",
    "checkout_success",
    "faq",
  ],
  schema,
  defaultProps,
  render: CtaBannerRender,
};

registerSection(definition);
export default definition;
