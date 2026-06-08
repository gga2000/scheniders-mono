// =====================================================================
// Section — press_quotes
// =====================================================================
// Row of publication logos with short pull-quotes. Tap-friendly cards
// on mobile, evenly-spaced grid on desktop.
// =====================================================================

import Image from "next/image";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  BentoCard,
  Section,
  SectionHeader,
} from "./helpers/primitives";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";

const schema = z.object({
  heading_i18n: i18nStringOptional,
  items: z.array(
    z.object({
      outlet_name: z.string(),
      logo_url: z.string().describe("image").optional(),
      quote_i18n: i18nStringSchema,
    }),
  ),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "Press loves us", ar: "أحبّتنا الصحافة" },
  items: [
    {
      outlet_name: "Iraq Vogue",
      logo_url: undefined,
      quote_i18n: {
        en: "The local label finally redefining everyday Iraqi style.",
        ar: "العلامة المحلية التي تعيد تعريف الأناقة اليومية في العراق.",
      },
    },
    {
      outlet_name: "Niqash",
      logo_url: undefined,
      quote_i18n: {
        en: "A masterclass in clean, accessible design from Baghdad.",
        ar: "درس متقَن في تصميم بسيط ومتاح، صادر من بغداد.",
      },
    },
    {
      outlet_name: "Al-Mada",
      logo_url: undefined,
      quote_i18n: {
        en: "Built with the patience that only locals would bother with.",
        ar: "صُنع بصبر لا يبذله إلا أهل البلد.",
      },
    },
  ],
};

function PressQuotes({
  props,
  ctx,
}: {
  props: Props;
  ctx: import("./_types").SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const heading = resolveI18n(props.heading_i18n, locale);

  if (!props.items.length) return null;

  return (
    <Section>
      {heading && <SectionHeader title={heading} color="sky" />}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-bk-sm">
        {props.items.map((item, i) => {
          const quote = resolveI18n(item.quote_i18n, locale);
          return (
            <BentoCard
              key={`${i}-${item.outlet_name}`}
              bg="white"
              size="sm"
              rotate={i % 2 === 0 ? -0.5 : 0.5}
              className="p-5 flex flex-col gap-bk-xs"
            >
              <div className="flex items-center gap-bk-xs min-h-[28px]">
                {item.logo_url ? (
                  // Press logos come from arbitrary outlet hosts not in the
                  // storefront image allowlist, so `unoptimized` bypasses the
                  // Next optimizer while keeping next/image layout semantics.
                  <Image
                    src={item.logo_url}
                    alt={item.outlet_name}
                    width={120}
                    height={24}
                    unoptimized
                    className="h-6 w-auto"
                  />
                ) : (
                  <div className="font-display font-black text-sm uppercase tracking-wide text-bk-ink-soft">
                    {item.outlet_name}
                  </div>
                )}
              </div>
              <p className="font-body text-sm sm:text-base leading-relaxed text-bk-ink-soft">
                &ldquo;{quote}&rdquo;
              </p>
            </BentoCard>
          );
        })}
      </div>
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "press_quotes",
  category: "story",
  name: { en: "Press quotes", ar: "آراء الصحافة" },
  description: {
    en: "Publication logos with short quotes from press coverage.",
    ar: "شعارات صحفية مع اقتباسات قصيرة.",
  },
  thumbnail: "/sections/press_quotes.svg",
  valid_on: ["home", "about"],
  schema,
  defaultProps,
  render: PressQuotes,
};

registerSection(definition);
export default definition;
