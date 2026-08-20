// =====================================================================
// Section — cta_banner
// =====================================================================
// Full-bleed CTA strip: heading + sub + primary button on a coloured
// (or image) background. Designed to live near the bottom of a page as
// a last conversion nudge.
// =====================================================================

import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  BentoCard,
  ChunkyButton,
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
        className="relative overflow-hidden p-0"
        style={{ borderRadius: "var(--bk-radius-card, 1.5rem)" }}
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
            <div className="absolute inset-0 bg-bk-ink/40 text-bk-surface" />
          </div>
        )}
        <div
          className={
            "relative z-10 p-bk-xl sm:p-bk-2xl flex flex-col gap-bk-sm " + alignClass
          }
          style={{
            color: props.background_image_url ? "white" : undefined,
          }}
        >
          {eyebrow && (
            <Sticker bg="white" rotate={-3} size="sm">
              {eyebrow}
            </Sticker>
          )}
          <h2
            data-i18n-field="heading_i18n"
            className="font-display font-black text-bk-h2 uppercase leading-[0.95] tracking-tight max-w-2xl"
            style={{
              fontFamily: "var(--bk-font-display, inherit)",
            }}
          >
            {heading}
          </h2>
          {sub && (
            <p
              data-i18n-field="sub_i18n"
              className="font-body text-base sm:text-lg max-w-xl opacity-90"
            >
              {sub}
            </p>
          )}
          <div className="mt-bk-2xs">
            <StoreLink href={props.cta_href} data-i18n-field="cta_label_i18n">
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
