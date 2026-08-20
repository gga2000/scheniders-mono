// =====================================================================
// Section — numbers_stat_strip
// =====================================================================
// Bold number strip — 3-4 big values paired with a label. Each item is
// `{ value, label_i18n }` so the digits / glyphs stay stable across
// locales (e.g. "10K+", "4.8★") while the descriptor is translated.
// =====================================================================

import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  BentoCard,
  ScribbleHeading,
  Section,
} from "./helpers/primitives";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const candyBg = z.enum(["mint", "butter", "lilac", "sky", "pink", "cream"]);

const schema = z.object({
  heading_i18n: i18nStringOptional,
  bg: candyBg,
  items: z.array(
    z.object({
      value: z.string(),
      label_i18n: i18nStringSchema,
    }),
  ),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "By the numbers", ar: "بالأرقام" },
  bg: "butter",
  items: [
    {
      value: "10K+",
      label_i18n: { en: "Orders shipped", ar: "طلبات تم شحنها" },
    },
    {
      value: "18",
      label_i18n: { en: "Governorates", ar: "محافظة" },
    },
    {
      value: "4.8★",
      label_i18n: { en: "Average rating", ar: "متوسط التقييم" },
    },
    {
      value: "24/7",
      label_i18n: { en: "Support", ar: "دعم العملاء" },
    },
  ],
};

function NumbersStatStripRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  if (props.items.length === 0) return null;
  const heading = resolveI18n(props.heading_i18n, locale);
  const count = Math.min(props.items.length, 4);

  // Static (Tailwind-safe) responsive column classes keyed by stat count:
  // two-up on mobile, expanding to the full count on sm+.
  const STAT_COLS: Record<number, string> = {
    1: "grid-cols-1",
    2: "grid-cols-2",
    3: "grid-cols-2 sm:grid-cols-3",
    4: "grid-cols-2 sm:grid-cols-4",
  };

  return (
    <Section density="dense">
      <BentoCard
        bg={props.bg}
        size="md"
        className="p-bk-lg sm:p-bk-xl"
        style={{ borderRadius: "var(--bk-radius-card, 1.25rem)" }}
      >
        {heading && (
          <ScribbleHeading color="pink" className="mb-bk-lg">
            {heading}
          </ScribbleHeading>
        )}
        <div className={`grid gap-bk-md sm:gap-bk-lg ${STAT_COLS[count]}`}>
          {props.items.slice(0, 4).map((item, i) => {
            const label = resolveI18n(item.label_i18n, locale);
            return (
              <div key={`${i}-${item.value}`} className="text-center">
                <div
                  className="font-display font-black text-4xl sm:text-5xl tracking-tight"
                  style={{
                    color: "currentColor",
                    fontFamily: "var(--bk-font-display, inherit)",
                  }}
                >
                  {item.value}
                </div>
                <p className="mt-bk-xs font-label font-bold text-xs uppercase tracking-[0.2em] opacity-75">
                  {label}
                </p>
              </div>
            );
          })}
        </div>
      </BentoCard>
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "numbers_stat_strip",
  category: "content",
  name: { en: "Numbers strip", ar: "شريط الأرقام" },
  description: {
    en: "3-4 big numbers with localised labels.",
    ar: "3-4 أرقام كبيرة مع تسميات مترجمة.",
  },
  thumbnail: "/sections/numbers_stat_strip.svg",
  valid_on: ["home", "about"],
  schema,
  defaultProps,
  render: NumbersStatStripRender,
};

registerSection(definition);
export default definition;
