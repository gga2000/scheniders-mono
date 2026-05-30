// =====================================================================
// Section — stat_strip
// =====================================================================
// Big-number stat strip — e.g. "10K+ orders / 18 governorates / 4.9★".
// Background colour is a candy tint and each cell renders the big
// number on top of a short body description.
// =====================================================================

import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import {
  BentoCard,
  ScribbleHeading,
} from "./helpers/primitives";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const candyBg = z.enum(["mint", "butter", "lilac", "sky", "pink", "cream"]);

const schema = z.object({
  heading_i18n: i18nStringOptional,
  items: z.array(
    z.object({
      number_label: z.string(),
      description_i18n: i18nStringSchema,
    }),
  ),
  bg: candyBg,
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "The numbers", ar: "الأرقام" },
  bg: "butter",
  items: [
    {
      number_label: "10K+",
      description_i18n: {
        en: "Orders shipped",
        ar: "طلبات تم شحنها",
      },
    },
    {
      number_label: "18",
      description_i18n: {
        en: "Governorates covered",
        ar: "محافظة نوصل إليها",
      },
    },
    {
      number_label: "4.9★",
      description_i18n: {
        en: "Average rating",
        ar: "تقييم متوسط",
      },
    },
  ],
};

function StatStripRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;
  const heading = resolveI18n(props.heading_i18n, locale);
  if (props.items.length === 0) return null;

  return (
    <section className="px-4 py-8">
      <BentoCard bg={props.bg} size="md" className="p-6 sm:p-8">
        {heading && (
          <ScribbleHeading color="pink" className="mb-5">
            {heading}
          </ScribbleHeading>
        )}
        <div
          className={`grid gap-4 grid-cols-${Math.min(props.items.length, 2)} sm:grid-cols-${Math.min(props.items.length, 4)}`}
          style={{
            gridTemplateColumns: `repeat(${Math.min(props.items.length, 4)}, minmax(0, 1fr))`,
          }}
        >
          {props.items.map((item, i) => {
            const body = resolveI18n(item.description_i18n, locale);
            return (
              <div key={`${i}-${item.number_label}`} className="text-center">
                <div className="font-display font-black text-4xl sm:text-5xl tracking-tight text-candy-ink">
                  {item.number_label}
                </div>
                <p className="mt-2 font-label font-bold text-xs uppercase tracking-[0.2em] text-candy-ink/70">
                  {body}
                </p>
              </div>
            );
          })}
        </div>
      </BentoCard>
    </section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "stat_strip",
  category: "content",
  name: { en: "Stat strip", ar: "شريط الأرقام" },
  description: {
    en: "Big-number stats strip for orders, ratings, coverage.",
    ar: "شريط أرقام كبيرة للطلبات والتقييمات والتغطية.",
  },
  thumbnail: "/sections/stat_strip.svg",
  valid_on: ["home", "about"],
  schema,
  defaultProps,
  render: StatStripRender,
};

registerSection(definition);
export default definition;
