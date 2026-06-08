// =====================================================================
// Section — hero_marquee
// =====================================================================
// Bold scrolling marquee headline above a CTA. Different from the slim
// mid-page `marquee_strip` — this one takes a full hero slot and uses
// huge display type that ticker-scrolls horizontally.
// =====================================================================

import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import { StoreLink } from "./helpers/store-context";
import {
  BentoCard,
  ChunkyButton,
  Section,
} from "./helpers/primitives";
import { i18nStringSchema } from "./_schema";
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
  marquee_text_i18n: i18nStringSchema,
  cta_label_i18n: i18nStringSchema,
  cta_href: z.string().describe("url"),
  bg: heroBg,
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  marquee_text_i18n: {
    en: "★ NEW SEASON ★ FREE DELIVERY ★ CASH ON DELIVERY ★",
    ar: "★ موسم جديد ★ توصيل مجاني ★ الدفع عند الاستلام ★",
  },
  cta_label_i18n: { en: "Shop the drop", ar: "تسوّق الآن" },
  cta_href: "/products",
  bg: "pink",
};

function HeroMarquee({
  props,
  ctx,
}: {
  props: Props;
  ctx: import("./_types").SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const text = resolveI18n(props.marquee_text_i18n, locale);
  const ctaLabel = resolveI18n(props.cta_label_i18n, locale);

  if (!text) return null;

  return (
    <Section bleed className="px-4 py-6 sm:py-10">
      <BentoCard bg={props.bg} size="lg" className="p-0 overflow-hidden">
        <div className="py-8 sm:py-12">
          <div className="overflow-hidden whitespace-nowrap">
            <div className="inline-block animate-marquee font-display font-black uppercase text-bk-hero leading-none tracking-tight">
              {Array.from({ length: 3 }).map((_, i) => (
                <span key={i} className="px-6">
                  {text}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-bk-lg flex justify-center">
            <StoreLink href={props.cta_href} aria-label={ctaLabel}>
              <ChunkyButton bg="white" size="lg">
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
  type: "hero_marquee",
  category: "hero",
  name: { en: "Marquee Hero", ar: "غلاف متحرّك" },
  description: {
    en: "Bold scrolling marquee headline above a primary CTA.",
    ar: "عنوان جريء متحرّك فوق زر دعوة رئيسي.",
  },
  thumbnail: "/sections/hero_marquee.svg",
  valid_on: ["home"],
  schema,
  defaultProps,
  render: HeroMarquee,
};

registerSection(definition);
export default definition;
