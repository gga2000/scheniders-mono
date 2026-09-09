// =====================================================================
// Section — about_spotlight
// =====================================================================
// Full-bleed photo band with an optional dark overlay and a centered
// cream card ("who we are" spotlight): title, multi-line body, and a
// pill CTA. Brand-kit-token driven — the card sits on
// `--bk-surface-alt` (surface fallback) so it reads warm over photos.
// =====================================================================

import Image from "next/image";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import { Section } from "./helpers/primitives";
import { StoreLink } from "./helpers/store-context";
import { cn, PRESSABLE } from "./helpers/utils";
import { i18nStringSchema } from "./_schema";
import { isOptimizableImageHost } from "./helpers/image";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  title_i18n: i18nStringSchema,
  /** Multi-line body — newlines are preserved. */
  body_i18n: i18nStringSchema,
  cta_label_i18n: i18nStringSchema,
  cta_href: z.string().describe("url"),
  bg_image_url: z.string().describe("image").optional(),
  /** Darkness of the shade over the photo band (0 = none). */
  overlay_opacity: z.number().min(0).max(0.6).optional(),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  title_i18n: { en: "Our story", ar: "قصتنا" },
  body_i18n: {
    en: "We started with a simple idea: products we are proud of, and service that makes shopping easier.\nEvery item is picked with care and delivered to your door across all of Iraq.",
    ar: "بدأنا بفكرة بسيطة: منتجات نعتز بيها وخدمة تخلي التسوق أسهل.\nنختار كل منتج بعناية ونوصله لباب بيتك بكل محافظات العراق.",
  },
  cta_label_i18n: { en: "Learn more", ar: "تعرف أكثر" },
  cta_href: "/about",
  bg_image_url: undefined,
  overlay_opacity: 0.2,
};

function AboutSpotlightRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const title = resolveI18n(props.title_i18n, locale);
  const body = resolveI18n(props.body_i18n, locale);
  const ctaLabel = resolveI18n(props.cta_label_i18n, locale);

  const bgImage = props.bg_image_url;
  const overlay = props.overlay_opacity ?? 0.2;

  return (
    <Section bleed className="px-0 sm:px-4 py-0 sm:py-6">
      <div
        className="relative overflow-hidden"
        style={{
          borderRadius: "var(--bk-radius-card, 1.5rem)",
          backgroundColor: "var(--bk-ink, #1a1a1a)",
        }}
      >
        {/* Photo band — full-bleed image or accent fallback. */}
        {bgImage ? (
          <div
            data-layer="bg_image"
            data-layer-label="Background image"
            data-layer-kind="image"
            className="absolute inset-0"
            style={{ backgroundColor: "var(--bk-surface, #fff7ed)" }}
          >
            <Image
              src={bgImage}
              alt=""
              fill
              unoptimized={!isOptimizableImageHost(bgImage)}
              sizes="100vw"
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, var(--bk-accent, #ffd84a), var(--bk-surface-alt, #ffe9c7))",
            }}
          />
        )}
        {overlay > 0 && (
          <div
            className="absolute inset-0 bg-black"
            style={{ opacity: overlay }}
          />
        )}

        {/* Centered cream card. */}
        <div className="relative z-10 flex justify-center px-4 sm:px-10 py-14 sm:py-24">
          <div
            className="w-full max-w-2xl p-6 sm:p-12 text-center"
            style={{
              backgroundColor:
                "var(--bk-surface-alt, var(--bk-surface, #fff7ed))",
              color: "var(--bk-ink, #1a1a1a)",
              borderRadius: "var(--bk-radius-card, 1.5rem)",
              boxShadow: "var(--bk-shadow-card, 6px 6px 0px 0px #1a1a1a)",
            }}
          >
            <h2
              data-i18n-field="title_i18n"
              className="font-display font-black text-bk-h2 text-balance tracking-tight"
              style={{
                color: "var(--bk-ink, #1a1a1a)",
                fontFamily: "var(--bk-font-display, inherit)",
              }}
            >
              {title}
            </h2>
            <p
              data-i18n-field="body_i18n"
              className="mt-4 font-body text-base sm:text-lg whitespace-pre-line text-pretty"
              style={{
                color: "var(--bk-ink-soft, rgba(26,26,26,0.8))",
                fontFamily: "var(--bk-font-body, inherit)",
              }}
            >
              {body}
            </p>
            <div
              data-layer="cta"
              data-layer-label="Button"
              data-layer-kind="button"
              className="mt-6 sm:mt-8 flex justify-center"
            >
              {/* Real link, not a button nested in an anchor. Mirrors
                  ChunkyButton's token styling on the brand primary. */}
              <StoreLink
                href={props.cta_href}
                data-i18n-field="cta_label_i18n"
                className={cn(
                  "inline-flex items-center justify-center gap-2 px-6 py-4 text-lg font-display font-black bk-caps tracking-tight",
                  PRESSABLE,
                )}
                style={{
                  backgroundColor: "var(--bk-primary, #ff5a8a)",
                  color: "var(--bk-on-primary, #fff)",
                  border:
                    "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
                  borderRadius: "var(--bk-radius-pill, 9999px)",
                  boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
                  fontFamily: "var(--bk-font-display, inherit)",
                }}
              >
                {ctaLabel}
              </StoreLink>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "about_spotlight",
  category: "story",
  name: { en: "About spotlight", ar: "بطاقة من نحن" },
  description: {
    en: "Full-bleed photo band with a centered card: title, multi-line body, and a pill CTA.",
    ar: "شريط بصورة كاملة العرض وبطاقة في المنتصف تحتوي عنواناً ونصاً متعدد الأسطر وزراً.",
  },
  thumbnail: "/sections/about_spotlight.svg",
  valid_on: ["home", "about"],
  schema,
  defaultProps,
  render: AboutSpotlightRender,
};

registerSection(definition);
export default definition;
